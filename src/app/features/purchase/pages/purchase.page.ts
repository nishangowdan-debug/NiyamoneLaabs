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
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PurchaseService } from '../data/purchase.service';
import { PurchaseStore } from '../data/purchase.store';
import {
  FREIGHT_LABEL,
  METHOD_LABEL,
  PO_TYPE_LABEL,
  PoDetail,
  PoDraftLine,
  PoFilter,
  PoRow,
  RETURNS_LABEL,
  STATUS_TONE,
  TERMS_LABEL,
} from '../data/purchase.types';
import type {
  PoFreightTerms,
  PoReturnsPolicy,
  PoStatus,
  PoType,
  VendorCategory,
  VendorPaymentMethod,
  VendorPaymentTerms,
} from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-purchase-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Purchase orders</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Procure-to-pay · realtime status ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
          </span>
        </p>
      </div>
      @if (canWrite()) {
        <button type="button" (click)="openNew()"
                class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New PO
        </button>
      }
    </header>

    <!-- ── 4 KPI cards ──────────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active POs</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().active }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">In-flight procurement</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Awaiting approval</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().awaitingApproval > 0">{{ store.totals().awaitingApproval }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Pending sign-off</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">In-flight value</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ formatINR(store.totals().inflightCents) }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Cost of open POs</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Drafts</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().drafts }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Not yet submitted</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl" placeholder="Search by PO #, vendor name, or code…"
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
        <app-alert tone="danger" title="Could not load purchase orders">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── PO table ──────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">PO #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Category</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Total</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Ordered</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Expected</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.pos().length === 0) {
            <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading purchase orders…</td></tr>
          } @else {
            @for (po of store.visible(); track po.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  [class.opacity-60]="po.status === 'cancelled' || po.status === 'closed'">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ po.po_number }}</td>
                <td class="px-4 py-2.5">
                  @if (po.vendor; as v) {
                    <p class="text-[13px] font-medium text-ink truncate">{{ v.name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ v.code }}</p>
                  } @else {
                    <p class="text-[12px] text-ink-muted">—</p>
                  }
                </td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ po.category.replace('_', ' ') }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ formatINR(po.total_cents) }}</td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">
                  {{ formatDate(po.po_date) }}
                </td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">
                  {{ po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—' }}
                </td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(po.status)">{{ STATUS_TONE[po.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-1">
                    <button type="button" (click)="openDetail(po)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                      View
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No purchase orders match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openNew()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Create the first PO →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── New PO modal ─────────────────────────────────────── -->
    @if (newOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeNew()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[820px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">New purchase order</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Pick a vendor → add items → set terms.</p>

          <!-- Vendor + header -->
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

            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category *</span>
              <select [(ngModel)]="newCategory" name="cat"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (c of categoryOptions; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </label>

            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Type</span>
              <select [(ngModel)]="newPoType" name="ptype"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="standard">Standard</option>
                <option value="blanket">Blanket</option>
                <option value="emergency">Emergency</option>
                <option value="service">Service</option>
              </select>
            </label>
          </div>

          <!-- Line items -->
          <div class="mt-5 border border-border rounded-md overflow-hidden">
            <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Line items</p>
              <button type="button" (click)="addLine()" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">+ Add line</button>
            </header>

            @if (draftLines().length === 0) {
              <p class="px-3 py-4 text-[12px] text-ink-muted text-center">No items yet — add a line.</p>
            } @else {
              <ul class="divide-y divide-border">
                @for (line of draftLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-2.5">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      <input type="text" [(ngModel)]="line.description" [name]="'desc-' + idx" placeholder="Description"
                             class="col-span-12 md:col-span-5 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

                      <input type="text" [(ngModel)]="line.uom" [name]="'uom-' + idx" placeholder="UoM"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

                      <input type="number" [(ngModel)]="line.qty_ordered" [name]="'qty-' + idx" min="0.01" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />

                      <input type="number" [ngModel]="line.unit_price_cents / 100" (ngModelChange)="line.unit_price_cents = Math.round($event * 100)" [name]="'price-' + idx"
                             min="0" step="0.01"
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

          <!-- Terms + delivery -->
          <div class="grid grid-cols-12 gap-3 mt-5">
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Payment terms</span>
              <select [(ngModel)]="newTerms" name="terms"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (t of termsOptions; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Method</span>
              <select [(ngModel)]="newMethod" name="method"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (m of methodOptions; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Freight</span>
              <select [(ngModel)]="newFreightTerms" name="freight"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="vendor">Vendor pays</option>
                <option value="hospital">Hospital pays</option>
                <option value="split">Split</option>
              </select>
            </label>
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Returns</span>
              <select [(ngModel)]="newReturns" name="returns"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                <option value="30_day">30-day</option>
                <option value="15_day">15-day</option>
                <option value="none">No returns</option>
              </select>
            </label>

            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Expected delivery</span>
              <input type="date" [(ngModel)]="newExpectedDate" name="exp"
                     class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

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
              <input type="checkbox" [(ngModel)]="newSubmit" name="submitnow"
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
             class="w-full max-w-[720px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">{{ d.po_number }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">
                {{ formatDate(d.po_date) }} · {{ PO_TYPE_LABEL[d.po_type] }} · capitalize {{ d.category }}
              </p>
              @if (d.vendor; as v) {
                <p class="text-[13px] text-ink mt-1">{{ v.name }} <span class="text-ink-muted font-mono text-[11px]">· {{ v.code }}</span></p>
              }
            </div>
            <span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span>
          </header>

          <!-- Items -->
          <ul class="mt-4 border border-border rounded-md overflow-hidden">
            <li class="px-3 py-1.5 bg-surface-muted text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold grid grid-cols-12 gap-2">
              <span class="col-span-5">Item</span>
              <span class="col-span-2 text-right">Ord/Recv</span>
              <span class="col-span-2 text-right">Price</span>
              <span class="col-span-1 text-right">GST</span>
              <span class="col-span-2 text-right">Total</span>
            </li>
            @for (it of d.items; track it.id) {
              <li class="px-3 py-2 grid grid-cols-12 gap-2 border-t border-border text-[12px]">
                <div class="col-span-5">
                  <p class="text-ink">{{ it.description }}</p>
                  <p class="text-[10px] text-ink-muted">{{ it.uom }}</p>
                </div>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ it.qty_received }} / {{ it.qty_ordered }}</span>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ formatINR(it.unit_price_cents) }}</span>
                <span class="col-span-1 text-right font-mono text-ink-soft">{{ it.gst_rate }}%</span>
                <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(it.total_cents) }}</span>
              </li>
            }

            <li class="px-3 py-2 border-t border-border text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-10 text-right text-ink-muted">Subtotal</span>
              <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(d.subtotal_cents - d.discount_cents) }}</span>
            </li>
            <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-10 text-right text-ink-muted">CGST + SGST</span>
              <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(d.cgst_cents + d.sgst_cents) }}</span>
            </li>
            @if (d.freight_cents > 0) {
              <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
                <span class="col-span-10 text-right text-ink-muted">Freight ({{ FREIGHT_LABEL[d.freight_terms] }})</span>
                <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(d.freight_cents) }}</span>
              </li>
            }
            @if (d.tds_cents > 0) {
              <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
                <span class="col-span-10 text-right text-ink-muted">TDS</span>
                <span class="col-span-2 text-right font-mono text-ink-muted">−{{ formatINR(d.tds_cents) }}</span>
              </li>
            }
            <li class="px-3 py-2.5 border-t border-border text-[13px] grid grid-cols-12 gap-2 bg-surface-muted">
              <span class="col-span-10 text-right font-medium text-ink">Total</span>
              <span class="col-span-2 text-right font-mono text-ink font-semibold">{{ formatINR(d.total_cents) }}</span>
            </li>
          </ul>

          <!-- Terms summary -->
          <dl class="mt-4 grid grid-cols-12 gap-x-4 gap-y-1.5 text-[12px]">
            <dt class="col-span-3 text-ink-muted">Terms</dt>
            <dd class="col-span-3 text-ink">{{ TERMS_LABEL[d.payment_terms] }}</dd>
            @if (d.payment_method) {
              <dt class="col-span-3 text-ink-muted">Method</dt>
              <dd class="col-span-3 text-ink">{{ METHOD_LABEL[d.payment_method] }}</dd>
            }
            @if (d.expected_delivery_date) {
              <dt class="col-span-3 text-ink-muted">Expected</dt>
              <dd class="col-span-3 text-ink font-mono">{{ formatDate(d.expected_delivery_date) }}</dd>
            }
            @if (d.returns_policy) {
              <dt class="col-span-3 text-ink-muted">Returns</dt>
              <dd class="col-span-3 text-ink">{{ RETURNS_LABEL[d.returns_policy] }}</dd>
            }
            @if (d.notes) {
              <dt class="col-span-3 text-ink-muted">Notes</dt>
              <dd class="col-span-9 text-ink-soft italic">{{ d.notes }}</dd>
            }
            @if (d.cancellation_reason) {
              <dt class="col-span-3 text-danger-fg">Cancelled</dt>
              <dd class="col-span-9 text-danger-fg italic">{{ d.cancellation_reason }}</dd>
            }
          </dl>

          <!-- Lifecycle actions -->
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
                    <button type="button" (click)="send(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                      Send to vendor
                    </button>
                  }
                  @case ('sent') {
                    <span class="text-[11px] text-ink-muted">Awaiting goods receipt (Phase 6C)</span>
                  }
                  @case ('partially_received') {
                    <button type="button" (click)="close(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                      Close PO (early)
                    </button>
                  }
                  @case ('fully_received') {
                    <button type="button" (click)="close(d)" [disabled]="busy() === d.id"
                            class="h-9 px-4 rounded-md bg-good-fg hover:bg-good-strong text-white text-[12px] font-medium disabled:opacity-50">
                      Close PO
                    </button>
                  }
                }

                @if (d.status !== 'closed' && d.status !== 'cancelled' && d.status !== 'fully_received') {
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
  `,
})
export class PurchasePage implements OnInit, OnDestroy {
  protected readonly store = inject(PurchaseStore);
  private svc = inject(PurchaseService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('purchase.write'));
  protected readonly canApprove = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin'),
  );
  protected readonly busy = signal<string | null>(null);

  // Re-export to template
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly TERMS_LABEL = TERMS_LABEL;
  protected readonly METHOD_LABEL = METHOD_LABEL;
  protected readonly FREIGHT_LABEL = FREIGHT_LABEL;
  protected readonly RETURNS_LABEL = RETURNS_LABEL;
  protected readonly PO_TYPE_LABEL = PO_TYPE_LABEL;
  protected readonly Math = Math;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: PoFilter; label: string }[] = [
    { value: 'open',              label: 'Open' },
    { value: 'awaiting_approval', label: 'Awaiting' },
    { value: 'sent',              label: 'Sent' },
    { value: 'received',          label: 'Received' },
    { value: 'closed',            label: 'Closed' },
    { value: 'all',               label: 'All' },
  ];

  protected readonly categoryOptions: { value: VendorCategory; label: string }[] = [
    { value: 'pharmacy',    label: 'Pharmacy' },
    { value: 'disposables', label: 'Disposables' },
    { value: 'equipment',   label: 'Equipment' },
    { value: 'consumables', label: 'Consumables' },
    { value: 'reagents',    label: 'Reagents' },
    { value: 'services',    label: 'Services' },
    { value: 'f_and_b',     label: 'F & B' },
    { value: 'stationery',  label: 'Stationery' },
    { value: 'other',       label: 'Other' },
  ];

  protected readonly termsOptions: { value: VendorPaymentTerms; label: string }[] = [
    { value: 'immediate', label: 'Immediate' },
    { value: 'net_15',    label: 'Net 15' },
    { value: 'net_30',    label: 'Net 30' },
    { value: 'net_45',    label: 'Net 45' },
    { value: 'net_60',    label: 'Net 60' },
    { value: 'advance',   label: 'Advance' },
  ];

  protected readonly methodOptions: { value: VendorPaymentMethod; label: string }[] = [
    { value: 'neft',   label: 'NEFT' },
    { value: 'rtgs',   label: 'RTGS' },
    { value: 'imps',   label: 'IMPS' },
    { value: 'upi',    label: 'UPI' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'cash',   label: 'Cash' },
    { value: 'loc',    label: 'LoC' },
  ];

  // ── New PO state
  protected readonly newOpen = signal(false);
  protected readonly draftLines = signal<PoDraftLine[]>([]);
  protected newVendorId = '';
  protected newCategory: VendorCategory = 'pharmacy';
  protected newPoType: PoType = 'standard';
  protected newTerms: VendorPaymentTerms = 'net_30';
  protected newMethod: VendorPaymentMethod | '' = '';
  protected newFreightTerms: PoFreightTerms = 'vendor';
  protected newReturns: PoReturnsPolicy | '' = '';
  protected newExpectedDate = '';
  protected newFreightRupees = 0;
  protected newTdsRupees = 0;
  protected newSubmit = false;
  protected newNotes = '';

  // ── Detail
  protected readonly detail = signal<PoDetail | null>(null);

  protected readonly draftSummary = computed(() => {
    const lines = this.draftLines();
    const taxable = lines.reduce((s, l) =>
      s + Math.max(0, Math.round(l.qty_ordered * l.unit_price_cents) - l.discount_cents), 0);
    const gst = lines.reduce((s, l) => {
      const t = Math.max(0, Math.round(l.qty_ordered * l.unit_price_cents) - l.discount_cents);
      return s + Math.round(t * (l.gst_rate / 100));
    }, 0);
    return { taxable, gst, total: taxable + gst };
  });

  protected grandTotalCents(): number {
    const s = this.draftSummary();
    const freight = Math.round((this.newFreightRupees ?? 0) * 100);
    const tds = Math.round((this.newTdsRupees ?? 0) * 100);
    return s.total + freight - tds;
  }

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected onFilter(v: PoFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: PoFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected statusChipCls(s: PoStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }

  protected lineTotal(l: PoDraftLine): number {
    const taxable = Math.max(0, Math.round(l.qty_ordered * l.unit_price_cents) - l.discount_cents);
    const gst = Math.round(taxable * (l.gst_rate / 100));
    return taxable + gst;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  // ── New PO flow ───────────────────────────────────
  protected openNew() {
    this.draftLines.set([this.makeBlankLine()]);
    this.newVendorId = '';
    this.newCategory = 'pharmacy';
    this.newPoType = 'standard';
    this.newTerms = 'net_30';
    this.newMethod = '';
    this.newFreightTerms = 'vendor';
    this.newReturns = '';
    this.newExpectedDate = '';
    this.newFreightRupees = 0;
    this.newTdsRupees = 0;
    this.newSubmit = false;
    this.newNotes = '';
    this.newOpen.set(true);
  }

  protected closeNew() { this.newOpen.set(false); }

  protected addLine() {
    this.draftLines.update((lines) => [...lines, this.makeBlankLine()]);
  }

  protected removeLine(id: string) {
    this.draftLines.update((lines) => lines.filter((l) => l.id !== id));
  }

  protected onVendorPicked() {
    if (!this.newVendorId) return;
    const v = this.store.vendors().find((x) => x.id === this.newVendorId);
    if (!v) return;
    this.newCategory = v.category;
    this.newTerms = v.payment_terms;
    if (v.default_payment_method) this.newMethod = v.default_payment_method;
  }

  protected canSubmitNew(): boolean {
    const lines = this.draftLines();
    return !!this.newVendorId
      && !!this.newCategory
      && lines.length > 0
      && lines.every((l) => l.qty_ordered > 0 && l.unit_price_cents >= 0 && l.description.trim().length > 0);
  }

  protected async confirmNew() {
    if (!this.canSubmitNew()) return;
    this.busy.set('form');
    try {
      const po = await this.svc.create({
        vendorId: this.newVendorId,
        items: this.draftLines(),
        category: this.newCategory,
        poType: this.newPoType,
        paymentTerms: this.newTerms,
        paymentMethod: this.newMethod || null,
        freightTerms: this.newFreightTerms,
        freightCents: Math.round((this.newFreightRupees ?? 0) * 100),
        tdsCents: Math.round((this.newTdsRupees ?? 0) * 100),
        returnsPolicy: this.newReturns || null,
        expectedDeliveryDate: this.newExpectedDate || null,
        notes: this.newNotes.trim() || undefined,
        submit: this.newSubmit,
      });
      this.toast.success('Purchase order created', po.po_number);
      this.newOpen.set(false);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not create PO', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Detail / lifecycle ────────────────────────────
  protected async openDetail(po: PoRow) {
    try {
      this.detail.set(await this.svc.getDetail(po.id));
    } catch (e) {
      this.toast.error('Could not load PO', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected closeDetail() { this.detail.set(null); }

  protected async submit(d: PoDetail) {
    await this.runLifecycle(d, 'submit', 'Submitted for approval');
  }
  protected async approve(d: PoDetail) {
    await this.runLifecycle(d, 'approve', 'PO approved');
  }
  protected async send(d: PoDetail) {
    await this.runLifecycle(d, 'send', 'PO sent to vendor');
  }
  protected async close(d: PoDetail) {
    await this.runLifecycle(d, 'close', 'PO closed');
  }

  protected async cancelPrompt(d: PoDetail) {
    const reason = prompt('Reason to cancel this PO?');
    if (!reason || !reason.trim()) return;
    this.busy.set(d.id);
    try {
      await this.svc.cancel(d.id, reason.trim());
      this.toast.warn('PO cancelled');
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not cancel', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  private async runLifecycle(d: PoDetail, action: 'submit' | 'approve' | 'send' | 'close', okMsg: string) {
    this.busy.set(d.id);
    try {
      if (action === 'submit')      await this.svc.submit(d.id);
      else if (action === 'approve') await this.svc.approve(d.id);
      else if (action === 'send')    await this.svc.send(d.id);
      else if (action === 'close')   await this.svc.close(d.id);
      this.toast.success(okMsg, d.po_number);
      this.detail.set(await this.svc.getDetail(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Action failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  private makeBlankLine(): PoDraftLine {
    return {
      id: crypto.randomUUID(),
      description: '',
      uom: 'unit',
      qty_ordered: 1,
      unit_price_cents: 0,
      discount_cents: 0,
      gst_rate: 0,
    };
  }
}
