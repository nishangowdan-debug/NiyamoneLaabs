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
import { ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { addDays, format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ApService } from '../data/ap.service';
import { ApStore } from '../data/ap.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface ApExportRow {
  bill_number: string;
  vendor_invoice: string;
  vendor_name: string;
  vendor_code: string;
  po_number: string;
  invoice_date: string;
  due_date: string;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  match_status: string;
  status: string;
}
import {
  BillDetail,
  BillDraftLine,
  BillFilter,
  BillRow,
  BillablePo,
  MATCH_TONE,
  PAYMENT_METHOD_LABEL,
  STATUS_TONE,
} from '../data/ap.types';
import type {
  VendorBillMatchStatus,
  VendorBillStatus,
  VendorPaymentMethodAp,
} from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-ap-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Vendor bills</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Accounts payable · 3-way match (PO · GRN · invoice) ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <app-export-menu [disabled]="store.visible().length === 0" (pick)="onExport($event)"/>
        @if (canWrite()) {
          <button type="button" (click)="openNew()"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New bill
          </button>
        }
      </div>
    </header>

    <!-- ── 4 KPI cards ──────────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Open bills</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().open }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Unpaid + partial</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Awaiting approval</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().awaitingApproval > 0">{{ store.totals().awaitingApproval }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Pending sign-off</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Mismatched</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-danger-fg]="store.totals().mismatch > 0">{{ store.totals().mismatch }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">3-way variance &gt; 2%</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Payable</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ formatINR(store.totals().payableCents) }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Outstanding cash-out</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl" placeholder="Search by AP/vendor invoice #, PO #, or vendor…"
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
        <app-alert tone="danger" title="Could not load vendor bills">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Bills table ───────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">AP #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Vendor inv #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">PO</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Total</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Due</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Match</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.bills().length === 0) {
            <tr><td colspan="9" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading vendor bills…</td></tr>
          } @else {
            @for (b of store.visible(); track b.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  [class.opacity-60]="b.status === 'cancelled' || b.status === 'paid'">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ b.bill_number_internal }}</td>
                <td class="px-4 py-2.5">
                  @if (b.vendor; as v) {
                    <p class="text-[13px] font-medium text-ink truncate">{{ v.name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ v.code }}</p>
                  } @else {
                    <p class="text-[12px] text-ink-muted">—</p>
                  }
                </td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap truncate max-w-[160px]">{{ b.vendor_bill_number }}</td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ b.po?.po_number ?? '—' }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ formatINR(b.total_cents) }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-[11px] whitespace-nowrap"
                    [class.text-danger-fg]="isOverdue(b)">{{ formatDate(b.due_date) }}</td>
                <td class="px-4 py-2.5"><span [class]="matchChipCls(b.match_status)">{{ MATCH_TONE[b.match_status].label }}</span></td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(b.status)">{{ STATUS_TONE[b.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <button type="button" (click)="openDetail(b)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                    View
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No vendor bills match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openNew()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Record the first vendor bill →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── New bill modal ────────────────────────────────────── -->
    @if (newOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeNew()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[860px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">New vendor bill</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Pick a vendor + PO → lines pre-fill from PO → enter vendor's invoice details.</p>

          <!-- Vendor + PO -->
          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Vendor *</span>
              <select [(ngModel)]="newVendorId" name="vendor" (ngModelChange)="onVendorPicked()"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (v of store.vendors(); track v.id) {
                  <option [value]="v.id">{{ v.code }} · {{ v.name }}</option>
                }
              </select>
            </label>

            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Purchase order</span>
              <select [(ngModel)]="newPoId" name="po" (ngModelChange)="onPoPicked()"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">— no PO (adhoc) —</option>
                @for (p of vendorPos(); track p.id) {
                  <option [value]="p.id">{{ p.po_number }} · {{ p.items.length }} line{{ p.items.length === 1 ? '' : 's' }}</option>
                }
              </select>
            </label>

            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Vendor invoice # *</span>
              <input type="text" [(ngModel)]="newVendorBillNumber" name="vbn" placeholder="e.g. INV-CIPLA-2026-0421"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Bill date *</span>
              <input type="date" [(ngModel)]="newBillDate" name="bd"
                     class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Due date *</span>
              <input type="date" [(ngModel)]="newDueDate" name="dd"
                     class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <!-- Lines -->
          <div class="mt-5 border border-border rounded-md overflow-hidden">
            <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Bill lines</p>
              <button type="button" (click)="addLine()" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">+ Add line</button>
            </header>

            @if (draftLines().length === 0) {
              <p class="px-3 py-4 text-[12px] text-ink-muted text-center">Pick a PO to auto-load lines, or click "+ Add line" to enter manually.</p>
            } @else {
              <ul class="divide-y divide-border">
                @for (line of draftLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-2.5">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      <input type="text" [(ngModel)]="line.description" [name]="'desc-' + idx" placeholder="Description"
                             class="col-span-12 md:col-span-5 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                      <input type="text" [(ngModel)]="line.uom" [name]="'uom-' + idx" placeholder="UoM"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                      <input type="number" [(ngModel)]="line.qty_billed" [name]="'qty-' + idx" min="0.01" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />
                      <input type="number" [ngModel]="line.unit_price_cents / 100" (ngModelChange)="line.unit_price_cents = Math.round($event * 100)"
                             [name]="'price-' + idx" min="0" step="0.01"
                             class="col-span-4 md:col-span-2 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Price ₹" />
                      <input type="number" [(ngModel)]="line.gst_rate" [name]="'gst-' + idx"
                             min="0" max="28" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="GST %" />
                      <button type="button" (click)="removeLine(line.id)"
                              class="col-span-1 md:col-span-2 h-9 inline-flex items-center justify-center rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">
                        Remove
                      </button>
                    </div>
                    <p class="text-[10px] text-ink-muted mt-1 font-mono text-right">
                      Line total: {{ formatINR(lineTotal(line)) }}
                      @if (line.po_item_id) { <span class="text-info-fg">· linked to PO line</span> }
                    </p>
                  </li>
                }
              </ul>
            }

            <!-- Totals -->
            <div class="px-3 py-2.5 border-t border-border bg-surface-muted text-right">
              <p class="text-[11px] text-ink-muted">
                Taxable {{ formatINR(draftSummary().taxable) }} ·
                GST {{ formatINR(draftSummary().gst) }} ·
                Freight {{ formatINR(newFreightRupees * 100) }} ·
                TDS −{{ formatINR(newTdsRupees * 100) }}
              </p>
              <p class="font-display text-[18px] font-medium text-ink mt-0.5">
                Total {{ formatINR(grandTotalCents()) }}
              </p>
            </div>
          </div>

          <!-- Misc -->
          <div class="grid grid-cols-12 gap-3 mt-5">
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Freight (₹)</span>
              <input type="number" [(ngModel)]="newFreightRupees" name="frcost" min="0" step="0.01"
                     class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">TDS (₹)</span>
              <input type="number" [(ngModel)]="newTdsRupees" name="tds" min="0" step="0.01"
                     class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-3 inline-flex items-end gap-2 pb-1">
              <input type="checkbox" [(ngModel)]="newSubmit" name="sn"
                     class="size-3.5" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">Submit for approval immediately</span>
            </label>
            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
              <input type="text" [(ngModel)]="newNotes" name="notes"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeNew()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmNew()" [disabled]="!canSubmitNew() || busy() === 'form'"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() === 'form' ? 'Saving…' : (newSubmit ? 'Create + submit' : 'Save as draft') }}
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
              <h2 class="font-display text-[18px] font-medium text-ink">{{ d.bill_number_internal }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">
                Vendor invoice <span class="font-mono text-ink-soft">{{ d.vendor_bill_number }}</span>
                · billed {{ formatDate(d.bill_date) }} · due {{ formatDate(d.due_date) }}
                @if (d.po) { · PO <span class="font-mono text-ink-soft">{{ d.po.po_number }}</span> }
              </p>
              @if (d.vendor; as v) {
                <p class="text-[13px] text-ink mt-1">{{ v.name }} <span class="text-ink-muted font-mono text-[11px]">· {{ v.code }}</span></p>
              }
            </div>
            <div class="flex flex-col items-end gap-1">
              <span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span>
              <span [class]="matchChipCls(d.match_status)">{{ MATCH_TONE[d.match_status].label }}</span>
            </div>
          </header>

          <!-- 3-way summary -->
          @if (d.match_status !== 'matched' && d.status !== 'cancelled') {
            <div class="mt-3 px-3 py-2 rounded-md text-[11px] flex items-center justify-between"
                 [class]="d.match_status === 'mismatch' ? 'bg-danger-bg text-danger-fg' : 'bg-warn-bg text-warn-fg'">
              <span>
                Matched (PO + GRN): <span class="font-mono">{{ formatINR(d.matched_total_cents) }}</span>
                · Variance: <span class="font-mono">{{ d.variance_cents >= 0 ? '+' : '' }}{{ formatINR(d.variance_cents) }}</span>
                ({{ d.variance_pct }}%)
              </span>
              @if (canApprove() && d.match_status === 'mismatch' && d.status !== 'paid') {
                <button type="button" (click)="overridePrompt(d)" class="text-[10px] underline">Override</button>
              }
            </div>
          }

          <!-- Items -->
          <ul class="mt-4 border border-border rounded-md overflow-hidden">
            <li class="px-3 py-1.5 bg-surface-muted text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold grid grid-cols-12 gap-2">
              <span class="col-span-5">Item</span>
              <span class="col-span-1 text-right">Qty</span>
              <span class="col-span-2 text-right">Price</span>
              <span class="col-span-1 text-right">GST</span>
              <span class="col-span-3 text-right">Line total</span>
            </li>
            @for (it of d.items; track it.id) {
              <li class="px-3 py-2 grid grid-cols-12 gap-2 border-t border-border text-[12px]">
                <div class="col-span-5">
                  <p class="text-ink truncate">{{ it.description }}</p>
                  <p class="text-[10px] text-ink-muted">
                    {{ it.uom }}
                    @if (it.po_item_id && it.po_unit_price_cents !== null && it.po_unit_price_cents !== it.unit_price_cents) {
                      <span class="text-warn-fg"> · PO price {{ formatINR(it.po_unit_price_cents) }}</span>
                    }
                    @if (it.po_qty_received_at_bill !== null && Number(it.po_qty_received_at_bill) < Number(it.qty_billed)) {
                      <span class="text-warn-fg"> · GRN qty {{ it.po_qty_received_at_bill }}</span>
                    }
                  </p>
                </div>
                <span class="col-span-1 text-right font-mono text-ink">{{ it.qty_billed }}</span>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ formatINR(it.unit_price_cents) }}</span>
                <span class="col-span-1 text-right font-mono text-ink-soft">{{ it.gst_rate }}%</span>
                <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(it.total_cents) }}</span>
              </li>
            }
            <li class="px-3 py-2 border-t border-border text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-9 text-right text-ink-muted">Subtotal − discount</span>
              <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(d.subtotal_cents - d.discount_cents) }}</span>
            </li>
            <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-9 text-right text-ink-muted">CGST + SGST</span>
              <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(d.cgst_cents + d.sgst_cents) }}</span>
            </li>
            @if (d.freight_cents > 0) {
              <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
                <span class="col-span-9 text-right text-ink-muted">Freight</span>
                <span class="col-span-3 text-right font-mono text-ink">{{ formatINR(d.freight_cents) }}</span>
              </li>
            }
            @if (d.tds_cents > 0) {
              <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
                <span class="col-span-9 text-right text-ink-muted">TDS</span>
                <span class="col-span-3 text-right font-mono text-ink-muted">−{{ formatINR(d.tds_cents) }}</span>
              </li>
            }
            <li class="px-3 py-2.5 border-t border-border text-[13px] grid grid-cols-12 gap-2 bg-surface-muted">
              <span class="col-span-9 text-right font-medium text-ink">Total</span>
              <span class="col-span-3 text-right font-mono text-ink font-semibold">{{ formatINR(d.total_cents) }}</span>
            </li>
            @if (d.paid_total_cents > 0) {
              <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
                <span class="col-span-9 text-right text-ink-muted">Paid</span>
                <span class="col-span-3 text-right font-mono text-good-fg">−{{ formatINR(d.paid_total_cents) }}</span>
              </li>
              <li class="px-3 py-2.5 border-t border-border text-[13px] grid grid-cols-12 gap-2 bg-surface-muted">
                <span class="col-span-9 text-right font-medium text-ink">Outstanding</span>
                <span class="col-span-3 text-right font-mono text-ink font-semibold">{{ formatINR(d.total_cents - d.paid_total_cents) }}</span>
              </li>
            }
          </ul>

          <!-- Payments -->
          @if (d.payments.length > 0) {
            <div class="mt-4 border border-border rounded-md overflow-hidden">
              <header class="bg-surface-muted px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Payments</header>
              <ul class="divide-y divide-border">
                @for (p of d.payments; track p.id) {
                  <li class="px-3 py-2 grid grid-cols-12 gap-2 text-[12px]" [class.opacity-60]="p.is_void">
                    <span class="col-span-3 font-mono text-ink-soft">{{ formatDateTime(p.paid_at) }}</span>
                    <span class="col-span-2 text-ink-soft">{{ PAYMENT_METHOD_LABEL[p.method] }}</span>
                    <span class="col-span-3 font-mono text-ink-soft truncate">{{ p.reference ?? '—' }}</span>
                    <span class="col-span-2 text-right font-mono"
                          [class.line-through]="p.is_void"
                          [class.text-good-fg]="!p.is_void">{{ formatINR(p.amount_cents) }}</span>
                    <span class="col-span-2 text-right">
                      @if (!p.is_void && canWrite()) {
                        <button type="button" (click)="voidPaymentPrompt(p.id)" class="h-6 px-2 text-[10px] rounded text-danger-fg hover:bg-danger-bg">Void</button>
                      } @else if (p.is_void) {
                        <span class="text-[10px] text-ink-muted italic">Void</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </div>
          }

          <!-- Notes -->
          @if (d.notes || d.cancellation_reason) {
            <dl class="mt-4 grid grid-cols-12 gap-x-4 gap-y-1.5 text-[12px]">
              @if (d.notes) {
                <dt class="col-span-3 text-ink-muted">Notes</dt>
                <dd class="col-span-9 text-ink-soft italic whitespace-pre-line">{{ d.notes }}</dd>
              }
              @if (d.cancellation_reason) {
                <dt class="col-span-3 text-danger-fg">Cancelled</dt>
                <dd class="col-span-9 text-danger-fg italic">{{ d.cancellation_reason }}</dd>
              }
            </dl>
          }

          <!-- Lifecycle -->
          @if (canWrite()) {
            <div class="mt-5 flex flex-wrap items-center gap-2 justify-between">
              <div class="flex items-center gap-2 flex-wrap">
                @switch (d.status) {
                  @case ('draft') {
                    <button type="button" (click)="submit(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                      Submit for approval
                    </button>
                  }
                  @case ('awaiting_approval') {
                    @if (canApprove()) {
                      <button type="button" (click)="approve(d)" [disabled]="busy() === d.id"
                              class="h-9 px-4 rounded-md bg-good-fg hover:bg-good-strong text-white text-[12px] font-medium disabled:opacity-50">
                        Approve
                      </button>
                    } @else {
                      <span class="text-[11px] text-ink-muted">Awaiting branch_admin / super_admin approval</span>
                    }
                  }
                  @case ('approved') {
                    <button type="button" (click)="openPay(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                      Record payment
                    </button>
                  }
                  @case ('partially_paid') {
                    <button type="button" (click)="openPay(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                      Record next payment
                    </button>
                  }
                  @case ('paid') {
                    <span class="text-[11px] text-good-fg">Fully paid {{ d.paid_in_full_at ? '· ' + formatDateTime(d.paid_in_full_at) : '' }}</span>
                  }
                }

                @if (d.status !== 'paid' && d.status !== 'cancelled' && d.paid_total_cents === 0) {
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
              <button type="button" (click)="closeDetail()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                Close
              </button>
            </div>
          }
        </div>
      </div>
    }

    <!-- ── Pay modal ─────────────────────────────────────────── -->
    @if (payOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closePay()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Record vendor payment</h2>
          @if (payTarget(); as t) {
            <p class="text-[12px] text-ink-muted mt-0.5">
              {{ t.bill_number_internal }} · outstanding <span class="font-mono">{{ formatINR(t.total_cents - t.paid_total_cents) }}</span>
            </p>

            <div class="grid grid-cols-12 gap-3 mt-4">
              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Amount (₹)</span>
                <input type="number" [(ngModel)]="payAmountRupees" name="amt" min="0.01" step="0.01"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Method</span>
                <select [(ngModel)]="payMethod" name="m"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  @for (m of methodOptions; track m.value) {
                    <option [value]="m.value">{{ m.label }}</option>
                  }
                </select>
              </label>

              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reference / UTR / cheque #</span>
                <input type="text" [(ngModel)]="payReference" name="ref"
                       class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
                <input type="text" [(ngModel)]="payNotes" name="pn"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button type="button" (click)="closePay()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="button" (click)="confirmPay()" [disabled]="!canPay() || busy() === 'pay'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'pay' ? 'Saving…' : 'Record payment' }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ApPage implements OnInit, OnDestroy {
  protected readonly store = inject(ApStore);
  private svc = inject(ApService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('ap.write'));
  protected readonly canApprove = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin'),
  );
  protected readonly busy = signal<string | null>(null);

  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly MATCH_TONE = MATCH_TONE;
  protected readonly PAYMENT_METHOD_LABEL = PAYMENT_METHOD_LABEL;
  protected readonly Math = Math;
  protected readonly Number = Number;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: BillFilter; label: string }[] = [
    { value: 'open',              label: 'Open' },
    { value: 'awaiting_approval', label: 'Awaiting' },
    { value: 'mismatch',          label: 'Mismatch' },
    { value: 'overdue',           label: 'Overdue' },
    { value: 'paid',              label: 'Paid' },
    { value: 'all',               label: 'All' },
  ];

  protected readonly methodOptions: { value: VendorPaymentMethodAp; label: string }[] = [
    { value: 'neft',       label: 'NEFT' },
    { value: 'rtgs',       label: 'RTGS' },
    { value: 'imps',       label: 'IMPS' },
    { value: 'upi',        label: 'UPI' },
    { value: 'cheque',     label: 'Cheque' },
    { value: 'cash',       label: 'Cash' },
    { value: 'adjustment', label: 'Adjustment' },
  ];

  // ── New bill state
  protected readonly newOpen = signal(false);
  protected readonly draftLines = signal<BillDraftLine[]>([]);
  protected newVendorId = '';
  protected newPoId = '';
  protected newVendorBillNumber = '';
  protected newBillDate = format(new Date(), 'yyyy-MM-dd');
  protected newDueDate = format(addDays(new Date(), 30), 'yyyy-MM-dd');
  protected newFreightRupees = 0;
  protected newTdsRupees = 0;
  protected newSubmit = false;
  protected newNotes = '';

  protected readonly vendorPos = computed<BillablePo[]>(() => {
    const vid = this.newVendorId;
    if (!vid) return [];
    return this.store.billablePos().filter((p) => p.vendor?.id === vid);
  });

  protected readonly draftSummary = computed(() => {
    const lines = this.draftLines();
    const taxable = lines.reduce((s, l) =>
      s + Math.max(0, Math.round(l.qty_billed * l.unit_price_cents) - l.discount_cents), 0);
    const gst = lines.reduce((s, l) => {
      const t = Math.max(0, Math.round(l.qty_billed * l.unit_price_cents) - l.discount_cents);
      return s + Math.round(t * (l.gst_rate / 100));
    }, 0);
    return { taxable, gst, total: taxable + gst };
  });

  protected grandTotalCents(): number {
    const s = this.draftSummary();
    return s.total + Math.round((this.newFreightRupees ?? 0) * 100) - Math.round((this.newTdsRupees ?? 0) * 100);
  }

  // ── Detail / pay state
  protected readonly detail = signal<BillDetail | null>(null);
  protected readonly payOpen = signal(false);
  protected readonly payTarget = signal<BillDetail | null>(null);
  protected payAmountRupees = 0;
  protected payMethod: VendorPaymentMethodAp = 'neft';
  protected payReference = '';
  protected payNotes = '';

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    // Honour ?filter= query param from drill-down navigation
    const requested = this.route.snapshot.queryParamMap.get('filter') as BillFilter | null;
    const allowed: BillFilter[] = ['all','open','awaiting_approval','mismatch','overdue','paid'];
    if (requested && allowed.includes(requested)) this.store.setFilter(requested);

    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }

  ngOnDestroy() { this.unsubscribe?.(); }

  protected onFilter(v: BillFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: BillFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected statusChipCls(s: VendorBillStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }
  protected matchChipCls(s: VendorBillMatchStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${MATCH_TONE[s].chip}`;
  }

  protected isOverdue(b: BillRow): boolean {
    if (b.status === 'paid' || b.status === 'cancelled') return false;
    return b.due_date < new Date().toISOString().slice(0, 10);
  }

  protected lineTotal(l: BillDraftLine): number {
    const taxable = Math.max(0, Math.round(l.qty_billed * l.unit_price_cents) - l.discount_cents);
    const gst = Math.round(taxable * (l.gst_rate / 100));
    return taxable + gst;
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

  // ── New bill ─────────────────────────────────────
  protected openNew() {
    this.draftLines.set([]);
    this.newVendorId = '';
    this.newPoId = '';
    this.newVendorBillNumber = '';
    this.newBillDate = format(new Date(), 'yyyy-MM-dd');
    this.newDueDate = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    this.newFreightRupees = 0;
    this.newTdsRupees = 0;
    this.newSubmit = false;
    this.newNotes = '';
    this.newOpen.set(true);
  }
  protected closeNew() { this.newOpen.set(false); }

  protected onVendorPicked() {
    this.newPoId = '';
    this.draftLines.set([]);
  }

  protected onPoPicked() {
    if (!this.newPoId) {
      this.draftLines.set([]);
      return;
    }
    const po = this.vendorPos().find((p) => p.id === this.newPoId);
    if (!po) return;
    // Auto-fill bill lines from PO lines, defaulting qty_billed to qty_received (most realistic invoice qty)
    this.draftLines.set(
      po.items.map<BillDraftLine>((it) => ({
        id: crypto.randomUUID(),
        po_item_id: it.id,
        description: it.description,
        uom: it.uom,
        qty_billed: it.qty_received > 0 ? it.qty_received : it.qty_ordered,
        unit_price_cents: it.unit_price_cents,
        discount_cents: 0,
        gst_rate: it.gst_rate,
      })),
    );
  }

  protected addLine() {
    this.draftLines.update((lines) => [...lines, {
      id: crypto.randomUUID(),
      po_item_id: null,
      description: '',
      uom: 'unit',
      qty_billed: 1,
      unit_price_cents: 0,
      discount_cents: 0,
      gst_rate: 0,
    }]);
  }
  protected removeLine(id: string) {
    this.draftLines.update((lines) => lines.filter((l) => l.id !== id));
  }

  protected canSubmitNew(): boolean {
    const lines = this.draftLines();
    return !!this.newVendorId
      && !!this.newVendorBillNumber.trim()
      && !!this.newBillDate
      && !!this.newDueDate
      && lines.length > 0
      && lines.every((l) => l.qty_billed > 0 && l.unit_price_cents >= 0 && l.description.trim().length > 0);
  }

  protected async confirmNew() {
    if (!this.canSubmitNew()) return;
    this.busy.set('form');
    try {
      const bill = await this.svc.create({
        vendorId: this.newVendorId,
        poId: this.newPoId || null,
        vendorBillNumber: this.newVendorBillNumber.trim(),
        billDate: this.newBillDate,
        dueDate: this.newDueDate,
        items: this.draftLines(),
        freightCents: Math.round((this.newFreightRupees ?? 0) * 100),
        tdsCents: Math.round((this.newTdsRupees ?? 0) * 100),
        notes: this.newNotes.trim() || undefined,
        submit: this.newSubmit,
      });
      this.toast.success('Vendor bill created', bill.bill_number_internal);
      this.newOpen.set(false);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not create bill', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Detail / lifecycle ───────────────────────────
  protected async openDetail(b: BillRow) {
    try {
      this.detail.set(await this.svc.getDetail(b.id));
    } catch (e) {
      this.toast.error('Could not load bill', e instanceof Error ? e.message : 'Try again.');
    }
  }
  protected closeDetail() { this.detail.set(null); }

  protected async submit(d: BillDetail) {
    await this.runLifecycle(d, 'submit', 'Submitted for approval');
  }
  protected async approve(d: BillDetail) {
    await this.runLifecycle(d, 'approve', 'Bill approved');
  }
  protected async cancelPrompt(d: BillDetail) {
    const reason = prompt('Reason to cancel this bill?');
    if (!reason || !reason.trim()) return;
    this.busy.set(d.id);
    try {
      await this.svc.cancel(d.id, reason.trim());
      this.toast.warn('Bill cancelled');
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not cancel', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async overridePrompt(d: BillDetail) {
    const reason = prompt('Override mismatch — provide a reason for audit trail:');
    if (!reason || !reason.trim()) return;
    this.busy.set(d.id);
    try {
      await this.svc.overrideMatch(d.id, reason.trim());
      this.toast.success('Match overridden');
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Override failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  private async runLifecycle(d: BillDetail, action: 'submit' | 'approve', okMsg: string) {
    this.busy.set(d.id);
    try {
      if (action === 'submit')      await this.svc.submit(d.id);
      else if (action === 'approve') await this.svc.approve(d.id);
      this.toast.success(okMsg, d.bill_number_internal);
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Action failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Payment ──────────────────────────────────────
  protected openPay(d: BillDetail) {
    this.payTarget.set(d);
    this.payAmountRupees = (d.total_cents - d.paid_total_cents) / 100;
    this.payMethod = 'neft';
    this.payReference = '';
    this.payNotes = '';
    this.payOpen.set(true);
  }
  protected closePay() { this.payOpen.set(false); this.payTarget.set(null); }

  protected canPay(): boolean {
    const t = this.payTarget();
    if (!t) return false;
    const cents = Math.round(this.payAmountRupees * 100);
    return cents > 0 && cents <= (t.total_cents - t.paid_total_cents);
  }

  protected async confirmPay() {
    const t = this.payTarget();
    if (!t || !this.canPay()) return;
    this.busy.set('pay');
    try {
      await this.svc.recordPayment({
        billId: t.id,
        amountCents: Math.round(this.payAmountRupees * 100),
        method: this.payMethod,
        reference: this.payReference,
        notes: this.payNotes,
      });
      this.toast.success('Payment recorded');
      this.payOpen.set(false);
      this.detail.set(await this.svc.getDetail(t.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not record payment', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async voidPaymentPrompt(paymentId: string) {
    const reason = prompt('Reason to void this payment?');
    if (!reason || !reason.trim()) return;
    const d = this.detail();
    if (!d) return;
    this.busy.set(paymentId);
    try {
      await this.svc.voidPayment(paymentId, reason.trim());
      this.toast.warn('Payment voided');
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not void', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const bills = this.store.visible();
    if (bills.length === 0) return;

    const exportRows: ApExportRow[] = bills.map(b => ({
      bill_number:    b.bill_number_internal,
      vendor_invoice: b.vendor_bill_number ?? '',
      vendor_name:    b.vendor?.name ?? '',
      vendor_code:    b.vendor?.code ?? '',
      po_number:      b.po?.po_number ?? '',
      invoice_date:   (b as any).invoice_date ?? (b as any).bill_date ?? '',
      due_date:       b.due_date,
      total_cents:    b.total_cents,
      paid_cents:     (b as any).paid_cents ?? 0,
      balance_cents:  b.total_cents - ((b as any).paid_cents ?? 0),
      match_status:   MATCH_TONE[b.match_status]?.label ?? b.match_status,
      status:         STATUS_TONE[b.status]?.label ?? b.status,
    }));

    const columns: ExportColumn<ApExportRow>[] = [
      { key: 'bill_number',    header: 'Bill #',         width: 14, align: 'left' },
      { key: 'vendor_invoice', header: 'Vendor inv. #',  width: 14, align: 'left' },
      { key: 'vendor_code',    header: 'Vendor code',    width: 12, align: 'left' },
      { key: 'vendor_name',    header: 'Vendor',         width: 26, align: 'left' },
      { key: 'po_number',      header: 'PO #',           width: 12, align: 'left' },
      { key: 'invoice_date',   header: 'Invoice date',   width: 12, align: 'center', format: 'date' },
      { key: 'due_date',       header: 'Due date',       width: 12, align: 'center', format: 'date' },
      { key: 'total_cents',    header: 'Total (₹)',      width: 16, align: 'right',  format: 'inr_cents' },
      { key: 'paid_cents',     header: 'Paid (₹)',       width: 16, align: 'right',  format: 'inr_cents' },
      { key: 'balance_cents',  header: 'Balance (₹)',    width: 16, align: 'right',  format: 'inr_cents' },
      { key: 'match_status',   header: 'Match',          width: 12, align: 'left' },
      { key: 'status',         header: 'Status',         width: 12, align: 'left' },
    ];

    const totals = bills.reduce((acc, b) => {
      acc.total   += b.total_cents;
      acc.paid    += (b as any).paid_cents ?? 0;
      return acc;
    }, { total: 0, paid: 0 });

    const t = this.store.totals();
    const report: ExportableReport<ApExportRow> = {
      filename: `AP_VendorBills_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Accounts Payable · Vendor Bills',
      subtitle: `${bills.length} bill${bills.length === 1 ? '' : 's'}`,
      meta: {
        filters: [
          { label: 'Open',            value: String(t.open) },
          { label: 'Awaiting approval', value: String(t.awaitingApproval) },
          { label: 'Mismatched',      value: String(t.mismatch) },
          { label: 'Payable (₹)',     value: '₹' + (t.payableCents / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
        ],
      },
      columns,
      rows: exportRows,
      grandTotals: {
        vendor_name:   'TOTAL',
        total_cents:   totals.total,
        paid_cents:    totals.paid,
        balance_cents: totals.total - totals.paid,
      },
      footer: 'Sree Diagnostics · Vendor Bills (Accounts Payable)',
    };

    await this.exportSvc.export(fmt, report);
  }
}
