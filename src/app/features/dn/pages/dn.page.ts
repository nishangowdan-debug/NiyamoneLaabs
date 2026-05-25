import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { DnService } from '../data/dn.service';
import { DnStore } from '../data/dn.store';
import {
  ApplicableBill,
  DebitNote,
  DnDetail,
  DnDraftLine,
  DnFilter,
  DnRow,
  REASON_LABEL,
  STATUS_TONE,
} from '../data/dn.types';
import type { DebitNoteReason, DebitNoteStatus } from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-dn-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Debit notes</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Returns &amp; vendor adjustments · damaged · short · expired · price/qty variance ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
          </span>
        </p>
      </div>
      @if (canWrite()) {
        <div class="flex items-center gap-2">
          <button type="button" (click)="openFromGrn()"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-ink-soft text-[12px] font-medium hover:bg-surface-subtle">
            From GRN
          </button>
          <button type="button" (click)="openManual()"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New manual
          </button>
        </div>
      }
    </header>

    <!-- ── 4 KPI cards ──────────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Drafts</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().drafts }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Not yet issued</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Issued</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().issued > 0">{{ store.totals().issued }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Awaiting application</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Open credit</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ formatINR(store.totals().openCreditCents) }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Issued but un-applied</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Total value</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ formatINR(store.totals().ytdValueCents) }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">All non-cancelled</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl" placeholder="Search by DN #, vendor, GRN #, or bill #…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">{{ f.label }}</button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.totals().total.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load debit notes">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── DN table ──────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">DN #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Reason</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">GRN / Bill</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Total</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Date</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.items().length === 0) {
            <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading debit notes…</td></tr>
          } @else {
            @for (d of store.visible(); track d.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  [class.opacity-60]="d.status === 'cancelled'">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ d.dn_number }}</td>
                <td class="px-4 py-2.5">
                  @if (d.vendor; as v) {
                    <p class="text-[13px] font-medium text-ink truncate">{{ v.name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ v.code }}</p>
                  } @else {
                    <p class="text-[12px] text-ink-muted">—</p>
                  }
                </td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft truncate max-w-[220px]" [title]="d.reason">{{ d.reason }}</td>
                <td class="px-4 py-2.5 font-mono text-[10px] text-ink-soft whitespace-nowrap">
                  @if (d.grn) { GRN {{ d.grn.grn_number }}<br> }
                  @if (d.bill) { Bill {{ d.bill.bill_number_internal }} }
                  @if (!d.grn && !d.bill) { — }
                </td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ formatINR(d.total_cents) }}</td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ formatDate(d.dn_date) }}</td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <button type="button" (click)="openDetail(d)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">View</button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No debit notes match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openFromGrn()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Start from a GRN with returnable lines →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── From-GRN picker modal ─────────────────────────────── -->
    @if (grnPickerOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="grnPickerOpen.set(false)">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[520px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">New debit note from GRN</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Pick a GRN with damaged/short/expired lines.</p>

          @if (store.eligibleGrns().length === 0) {
            <p class="mt-6 text-[12px] text-ink-muted text-center">No GRNs with returnable lines in your branch.</p>
          } @else {
            <ul class="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-border border border-border rounded-md">
              @for (g of store.eligibleGrns(); track g.id) {
                <li>
                  <button type="button" (click)="proposeFromGrn(g.id)"
                          class="w-full px-3 py-2.5 hover:bg-surface-muted flex items-start justify-between text-left">
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-mono text-ink">{{ g.grn_number }}</p>
                      <p class="text-[11px] text-ink-muted">{{ g.vendor_name }} · {{ formatDateTime(g.received_at) }}</p>
                    </div>
                    <span class="text-[11px] text-primary-600">Use →</span>
                  </button>
                </li>
              }
            </ul>
          }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="grnPickerOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
          </div>
        </div>
      </div>
    }

    <!-- ── New DN form modal ───────────────────────────────── -->
    @if (newOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeNew()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[820px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">{{ proposalSource() ? 'Debit note from ' + proposalSource() : 'New manual debit note' }}</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Vendor &amp; lines → reason → issue immediately or save as draft.</p>

          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Vendor *</span>
              <select [(ngModel)]="newVendorId" name="vendor" [disabled]="!!proposalSource()"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 disabled:opacity-50"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (v of store.vendors(); track v.id) {
                  <option [value]="v.id">{{ v.code }} · {{ v.name }}</option>
                }
              </select>
            </label>
            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason *</span>
              <input type="text" [(ngModel)]="newReason" name="rea" placeholder="Short reason describing why this DN is raised"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <!-- Lines -->
          <div class="mt-5 border border-border rounded-md overflow-hidden">
            <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Line items</p>
              <button type="button" (click)="addLine()" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">+ Add line</button>
            </header>

            @if (draftLines().length === 0) {
              <p class="px-3 py-4 text-[12px] text-ink-muted text-center">No lines yet — add one.</p>
            } @else {
              <ul class="divide-y divide-border">
                @for (line of draftLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-2.5">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      <input type="text" [(ngModel)]="line.description" [name]="'desc-' + idx" placeholder="Description"
                             class="col-span-12 md:col-span-4 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                      <input type="text" [(ngModel)]="line.uom" [name]="'uom-' + idx" placeholder="UoM"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                      <input type="number" [(ngModel)]="line.qty" [name]="'qty-' + idx" min="0.01" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />
                      <input type="number" [ngModel]="line.unit_price_cents / 100" (ngModelChange)="line.unit_price_cents = Math.round($event * 100)"
                             [name]="'price-' + idx" min="0" step="0.01"
                             class="col-span-4 md:col-span-2 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Price ₹" />
                      <input type="number" [(ngModel)]="line.gst_rate" [name]="'gst-' + idx" min="0" max="28" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="GST %" />
                      <select [(ngModel)]="line.reason_code" [name]="'rc-' + idx"
                              class="col-span-6 md:col-span-2 h-9 px-2 pr-6 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                              [style.background-image]="chevronUrl" style="background-position: right 6px center;">
                        @for (r of reasonOptions; track r.value) {
                          <option [value]="r.value">{{ r.label }}</option>
                        }
                      </select>
                      <button type="button" (click)="removeLine(line.id)"
                              class="col-span-3 md:col-span-1 h-9 inline-flex items-center justify-center rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">
                        Remove
                      </button>
                    </div>
                    <p class="text-[10px] text-ink-muted mt-1 font-mono text-right">
                      Line total: {{ formatINR(lineTotal(line)) }}
                    </p>
                  </li>
                }
              </ul>
            }

            <!-- Totals -->
            <div class="px-3 py-2.5 border-t border-border bg-surface-muted text-right">
              <p class="text-[11px] text-ink-muted">
                Taxable {{ formatINR(draftSummary().taxable) }} · GST {{ formatINR(draftSummary().gst) }}
              </p>
              <p class="font-display text-[18px] font-medium text-ink mt-0.5">
                Total {{ formatINR(grandTotalCents()) }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-12 gap-3 mt-5">
            <label class="col-span-12 md:col-span-9 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
              <input type="text" [(ngModel)]="newNotes" name="notes"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-3 inline-flex items-end gap-2 pb-1">
              <input type="checkbox" [(ngModel)]="newIssue" name="issuenow"
                     class="size-3.5" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">Issue immediately</span>
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeNew()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmNew()" [disabled]="!canSubmitNew() || busy() === 'form'"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() === 'form' ? 'Saving…' : (newIssue ? 'Create + issue' : 'Save as draft') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Detail modal ──────────────────────────────────────── -->
    @if (detail(); as d) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeDetail()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[760px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">{{ d.dn_number }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">
                {{ formatDate(d.dn_date) }}
                @if (d.grn) { · GRN <span class="font-mono text-ink-soft">{{ d.grn.grn_number }}</span> }
                @if (d.bill) { · Bill <span class="font-mono text-ink-soft">{{ d.bill.bill_number_internal }}</span> }
              </p>
              @if (d.vendor; as v) {
                <p class="text-[13px] text-ink mt-1">{{ v.name }} <span class="text-ink-muted font-mono text-[11px]">· {{ v.code }}</span></p>
              }
              <p class="text-[12px] text-ink-soft mt-2 italic">{{ d.reason }}</p>
              @if (d.applied_to_bill) {
                <p class="text-[11px] text-good-fg mt-1">
                  Applied to bill <span class="font-mono">{{ d.applied_to_bill.bill_number_internal }}</span>
                  @if (d.applied_at) { · {{ formatDateTime(d.applied_at) }} }
                </p>
              }
              @if (d.cancellation_reason) {
                <p class="text-[11px] text-danger-fg mt-1">Cancelled: {{ d.cancellation_reason }}</p>
              }
            </div>
            <span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span>
          </header>

          <!-- Items -->
          <ul class="mt-4 border border-border rounded-md overflow-hidden">
            <li class="px-3 py-1.5 bg-surface-muted text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold grid grid-cols-12 gap-2">
              <span class="col-span-5">Item</span>
              <span class="col-span-1 text-right">Qty</span>
              <span class="col-span-2 text-right">Price</span>
              <span class="col-span-1 text-right">GST</span>
              <span class="col-span-3 text-right">Total</span>
            </li>
            @for (it of d.items; track it.id) {
              <li class="px-3 py-2 grid grid-cols-12 gap-2 border-t border-border text-[12px]">
                <div class="col-span-5">
                  <p class="text-ink truncate">{{ it.description }}</p>
                  <p class="text-[10px] text-ink-muted">{{ it.uom }} · {{ REASON_LABEL[it.reason_code] }}</p>
                </div>
                <span class="col-span-1 text-right font-mono text-ink">{{ it.qty }}</span>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ formatINR(it.unit_price_cents) }}</span>
                <span class="col-span-1 text-right font-mono text-ink-soft">{{ it.gst_rate }}%</span>
                <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(it.total_cents) }}</span>
              </li>
            }
            <li class="px-3 py-2 border-t border-border text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-9 text-right text-ink-muted">Subtotal</span>
              <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(d.subtotal_cents) }}</span>
            </li>
            <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-9 text-right text-ink-muted">CGST + SGST</span>
              <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(d.cgst_cents + d.sgst_cents) }}</span>
            </li>
            <li class="px-3 py-2.5 border-t border-border text-[13px] grid grid-cols-12 gap-2 bg-surface-muted">
              <span class="col-span-9 text-right font-medium text-ink">Total credit</span>
              <span class="col-span-3 text-right font-mono text-ink font-semibold">{{ formatINR(d.total_cents) }}</span>
            </li>
          </ul>

          @if (d.notes) {
            <p class="mt-4 text-[12px] text-ink-soft italic">{{ d.notes }}</p>
          }

          <!-- Lifecycle -->
          @if (canWrite()) {
            <div class="mt-5 flex flex-wrap items-center gap-2 justify-between">
              <div class="flex items-center gap-2 flex-wrap">
                @switch (d.status) {
                  @case ('draft') {
                    <button type="button" (click)="issueDn(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                      Issue
                    </button>
                  }
                  @case ('issued') {
                    <button type="button" (click)="openApply(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-good-fg hover:bg-good-strong text-white text-[12px] font-medium disabled:opacity-50">
                      Apply to bill
                    </button>
                  }
                  @case ('applied') {
                    <span class="text-[11px] text-good-fg">Applied — adjustment recorded against bill</span>
                  }
                }
                @if (d.status === 'draft' || d.status === 'issued') {
                  <button type="button" (click)="cancelPrompt(d)" [disabled]="busy() === d.id"
                          class="h-9 px-4 rounded-md border border-border text-danger-fg text-[12px] font-medium hover:bg-danger-bg disabled:opacity-50">
                    Cancel
                  </button>
                }
              </div>
              <button type="button" (click)="closeDetail()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                Close
              </button>
            </div>
          } @else {
            <div class="mt-5 text-right">
              <button type="button" (click)="closeDetail()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Close</button>
            </div>
          }
        </div>
      </div>
    }

    <!-- ── Apply-to-bill modal ────────────────────────────────── -->
    @if (applyOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="applyOpen.set(false)">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[560px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Apply DN to bill</h2>
          @if (applyTarget(); as t) {
            <p class="text-[12px] text-ink-muted mt-0.5">
              {{ t.dn_number }} · credit <span class="font-mono">{{ formatINR(t.total_cents) }}</span>
            </p>

            @if (applicableBills().length === 0) {
              <p class="mt-6 text-[12px] text-ink-muted text-center">No open bills found for this vendor. Create or approve a bill first.</p>
            } @else {
              <ul class="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-border border border-border rounded-md">
                @for (b of applicableBills(); track b.id) {
                  <li>
                    <button type="button" (click)="applyToBill(t, b.id)" [disabled]="busy() === t.id"
                            class="w-full px-3 py-2.5 hover:bg-surface-muted flex items-start justify-between text-left disabled:opacity-50">
                      <div class="min-w-0 flex-1">
                        <p class="text-[13px] font-mono text-ink">{{ b.bill_number_internal }}</p>
                        <p class="text-[11px] text-ink-muted">Vendor inv {{ b.vendor_bill_number }} · due {{ formatDate(b.due_date) }} · status {{ b.status }}</p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="text-[12px] font-mono text-ink">{{ formatINR(b.total_cents - b.paid_total_cents) }}</p>
                        <p class="text-[10px] text-ink-muted">outstanding</p>
                      </div>
                    </button>
                  </li>
                }
              </ul>
            }
          }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="applyOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DnPage implements OnInit, OnDestroy {
  protected readonly store = inject(DnStore);
  private svc = inject(DnService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('ap.write'));
  protected readonly busy = signal<string | null>(null);

  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly REASON_LABEL = REASON_LABEL;
  protected readonly Math = Math;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: DnFilter; label: string }[] = [
    { value: 'open',      label: 'Open' },
    { value: 'draft',     label: 'Draft' },
    { value: 'issued',    label: 'Issued' },
    { value: 'applied',   label: 'Applied' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all',       label: 'All' },
  ];

  protected readonly reasonOptions: { value: DebitNoteReason; label: string }[] = [
    { value: 'damaged',         label: 'Damaged' },
    { value: 'short',           label: 'Short' },
    { value: 'expired',         label: 'Expired' },
    { value: 'price_variance',  label: 'Price variance' },
    { value: 'qty_variance',    label: 'Qty variance' },
    { value: 'other',           label: 'Other' },
  ];

  // ── New DN state
  protected readonly newOpen = signal(false);
  protected readonly grnPickerOpen = signal(false);
  protected readonly proposalSource = signal<string | null>(null);
  protected readonly draftLines = signal<DnDraftLine[]>([]);
  protected newVendorId = '';
  protected newReason = '';
  protected newNotes = '';
  protected newIssue = false;
  private proposalGrnId: string | null = null;

  // ── Detail / apply state
  protected readonly detail = signal<DnDetail | null>(null);
  protected readonly applyOpen = signal(false);
  protected readonly applyTarget = signal<DnDetail | null>(null);
  protected readonly applicableBills = signal<ApplicableBill[]>([]);

  protected readonly draftSummary = computed(() => {
    const lines = this.draftLines();
    const taxable = lines.reduce((s, l) => s + Math.max(0, Math.round(l.qty * l.unit_price_cents)), 0);
    const gst = lines.reduce((s, l) => {
      const t = Math.max(0, Math.round(l.qty * l.unit_price_cents));
      return s + Math.round(t * (l.gst_rate / 100));
    }, 0);
    return { taxable, gst, total: taxable + gst };
  });

  protected grandTotalCents(): number { return this.draftSummary().total; }

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  protected onFilter(v: DnFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: DnFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected statusChipCls(s: DebitNoteStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }

  protected lineTotal(l: DnDraftLine): number {
    const taxable = Math.max(0, Math.round(l.qty * l.unit_price_cents));
    return taxable + Math.round(taxable * (l.gst_rate / 100));
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  }
  protected formatDateTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy · HH:mm'); } catch { return iso; }
  }
  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  // ── New DN flows ───────────────────────────────────
  protected openManual() {
    this.proposalSource.set(null);
    this.proposalGrnId = null;
    this.draftLines.set([this.makeBlankLine()]);
    this.newVendorId = '';
    this.newReason = '';
    this.newNotes = '';
    this.newIssue = false;
    this.newOpen.set(true);
  }
  protected closeNew() { this.newOpen.set(false); }

  protected openFromGrn() {
    this.grnPickerOpen.set(true);
  }

  protected async proposeFromGrn(grnId: string) {
    try {
      const proposal = await this.svc.proposeFromGrn(grnId);
      const grn = this.store.eligibleGrns().find((g) => g.id === grnId);
      this.grnPickerOpen.set(false);
      if (proposal.item_count === 0) {
        this.toast.warn('No returnable lines on this GRN');
        return;
      }
      this.proposalSource.set('GRN ' + proposal.grn_number);
      this.proposalGrnId = proposal.grn_id;
      this.newVendorId = grn?.vendor_id ?? '';
      this.newReason = 'Return from ' + proposal.grn_number;
      this.newNotes = '';
      this.newIssue = false;
      this.draftLines.set(proposal.items.map((it) => ({
        id: crypto.randomUUID(),
        grn_item_id: it.grn_item_id,
        po_item_id: it.po_item_id,
        inventory_item_id: it.inventory_item_id,
        description: it.description,
        uom: it.uom,
        qty: Number(it.qty),
        unit_price_cents: it.unit_price_cents,
        gst_rate: Number(it.gst_rate),
        reason_code: it.reason_code,
      })));
      this.newOpen.set(true);
    } catch (e) {
      this.toast.error('Could not propose', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected addLine() {
    this.draftLines.update((lines) => [...lines, this.makeBlankLine()]);
  }
  protected removeLine(id: string) {
    this.draftLines.update((lines) => lines.filter((l) => l.id !== id));
  }
  private makeBlankLine(): DnDraftLine {
    return {
      id: crypto.randomUUID(),
      grn_item_id: null,
      po_item_id: null,
      inventory_item_id: null,
      description: '',
      uom: 'unit',
      qty: 1,
      unit_price_cents: 0,
      gst_rate: 0,
      reason_code: 'damaged',
    };
  }

  protected canSubmitNew(): boolean {
    const lines = this.draftLines();
    return !!this.newVendorId
      && !!this.newReason.trim()
      && lines.length > 0
      && lines.every((l) => l.qty > 0 && l.unit_price_cents >= 0 && l.description.trim().length > 0);
  }

  protected async confirmNew() {
    if (!this.canSubmitNew()) return;
    this.busy.set('form');
    try {
      const dn = await this.svc.create({
        vendorId: this.newVendorId,
        items: this.draftLines(),
        reason: this.newReason.trim(),
        grnId: this.proposalGrnId,
        notes: this.newNotes.trim() || undefined,
        issue: this.newIssue,
      });
      this.toast.success('Debit note created', dn.dn_number);
      this.newOpen.set(false);
      this.proposalSource.set(null);
      this.proposalGrnId = null;
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not create DN', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Detail / lifecycle ───────────────────────────
  protected async openDetail(d: DnRow) {
    try {
      this.detail.set(await this.svc.getDetail(d.id));
    } catch (e) {
      this.toast.error('Could not load DN', e instanceof Error ? e.message : 'Try again.');
    }
  }
  protected closeDetail() { this.detail.set(null); }

  protected async issueDn(d: DnDetail) {
    this.busy.set(d.id);
    try {
      await this.svc.issue(d.id);
      this.toast.success('Debit note issued', d.dn_number);
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not issue', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async cancelPrompt(d: DnDetail) {
    const reason = prompt('Reason to cancel this DN?');
    if (!reason || !reason.trim()) return;
    this.busy.set(d.id);
    try {
      await this.svc.cancel(d.id, reason.trim());
      this.toast.warn('DN cancelled');
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not cancel', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Apply flow ────────────────────────────────────
  protected async openApply(d: DnDetail) {
    this.applyTarget.set(d);
    this.applyOpen.set(true);
    try {
      this.applicableBills.set(await this.svc.listApplicableBills(d.vendor_id));
    } catch (e) {
      this.toast.error('Could not load bills', e instanceof Error ? e.message : 'Try again.');
      this.applicableBills.set([]);
    }
  }

  protected async applyToBill(d: DnDetail, billId: string) {
    this.busy.set(d.id);
    try {
      await this.svc.apply(d.id, billId);
      this.toast.success('Debit note applied', d.dn_number);
      this.applyOpen.set(false);
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not apply', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }
}
