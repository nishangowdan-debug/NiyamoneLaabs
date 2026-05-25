import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import { MessagingService } from '../../../core/messaging/messaging.service';
import { PharmacyPrintService } from '../../pharmacy/services/pharmacy-print.service';
import {
  DischargeBillingService,
  type DischargeQueueItem, type FinalizeResult,
} from '../data/discharge-billing.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

@Component({
  selector: 'app-discharge-billing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ExportMenuComponent],
  template: `
<div class="flex flex-col">
  <!-- Page head -->
  <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">IP Discharge Billing</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ queue().length }} in queue ·
        <span class="inline-flex items-center gap-1.5 text-good-fg">
          <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
        </span>
      </p>
    </div>
    <app-export-menu [disabled]="queue().length === 0" (pick)="onExport($event)"/>
  </header>

  <div class="grid grid-cols-12 gap-4">
    <!-- Queue list -->
    <aside class="col-span-12 lg:col-span-4 bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-3 border-b border-border">
        <p class="text-[13px] font-semibold text-ink">Queue</p>
        <p class="text-[11px] text-ink-muted mt-0.5">Discharges in progress, oldest first</p>
      </header>
      @if (queue().length === 0) {
        <div class="px-6 py-12 text-center text-[12px] text-ink-muted">No active discharges.</div>
      } @else {
        <ul class="divide-y divide-border max-h-[calc(100dvh-220px)] overflow-y-auto">
          @for (q of queue(); track q.admission_id) {
            <li (click)="select(q.admission_id)"
                [class]="rowCls(q.admission_id === currentId())"
                class="cursor-pointer px-4 py-3">
              <div class="flex items-start justify-between gap-2">
                <p class="text-[13px] font-semibold text-ink">{{ q.patient_name }}</p>
                <span [class]="wfChipCls(q.workflow_status)">{{ wfLabel(q.workflow_status) }}</span>
              </div>
              <p class="text-[10px] font-mono text-ink-muted mt-0.5">{{ q.uhid }}</p>
              <p class="text-[11px] text-ink-muted mt-1">
                {{ q.ward_name ?? '—' }} · {{ q.bed_code ?? '—' }} · Day {{ admissionDay(q.admitted_at) }}
              </p>
              @if (q.requested_at) {
                <p class="text-[10px] text-ink-faint mt-1">requested {{ relativeTime(q.requested_at) }}</p>
              }
            </li>
          }
        </ul>
      }
    </aside>

    <!-- Detail / preview -->
    <section class="col-span-12 lg:col-span-8 flex flex-col gap-3">
      @if (currentId(); as id) {
        @if (bundle(); as b) {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="font-display text-[18px] font-medium text-ink">{{ b.patient?.full_name }}</p>
                <p class="text-[11px] text-ink-muted mt-0.5">
                  UHID {{ b.patient?.uhid }} ·
                  Admitted {{ shortDateTime(b.admission?.admitted_at) }} ·
                  Day {{ admissionDay(b.admission?.admitted_at) }} ·
                  Dr {{ b.doctor?.full_name ?? '—' }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" (click)="openSummaryEditor()"
                        title="Open the discharge summary form (clinical narrative + take-home prescription)"
                        class="h-8 px-3 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">
                  📝 Edit summary
                </button>
                <button type="button" (click)="openInsurancePrint()"
                        title="Print combined insurance package (summary + lab reports + bill)"
                        class="h-8 px-3 rounded-md text-[11px] font-semibold bg-primary text-on-primary hover:bg-primary-strong">
                  🖨 Insurance package
                </button>
                <span [class]="wfChipCls(b.admission?.discharge_workflow_status ?? 'none')">
                  {{ wfLabel(b.admission?.discharge_workflow_status ?? 'none') }}
                </span>
              </div>
            </header>

            <!-- Subtotal preview -->
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border">
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[10px] uppercase text-ink-muted">Bed</p>
                <p class="font-display text-[16px] font-medium text-ink mt-0.5">{{ formatINR(catTotal('bed')) }}</p>
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[10px] uppercase text-ink-muted">Pharmacy</p>
                <p class="font-display text-[16px] font-medium text-ink mt-0.5">{{ formatINR(catTotal('pharmacy')) }}</p>
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[10px] uppercase text-ink-muted">Doctor visits</p>
                <p class="font-display text-[16px] font-medium text-ink mt-0.5">{{ formatINR(visitsTotal()) }}</p>
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[10px] uppercase text-ink-muted">Lab</p>
                <p class="font-display text-[16px] font-medium text-ink mt-0.5">{{ formatINR(labsTotal()) }}</p>
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[10px] uppercase text-ink-muted">Radiology</p>
                <p class="font-display text-[16px] font-medium text-ink mt-0.5">{{ formatINR(radioTotal()) }}</p>
              </div>
            </div>

            <!-- Existing invoice (if already finalized) -->
            @if (b.invoice) {
              <div class="px-5 py-3 border-t border-border bg-info-bg/30 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[12px] font-semibold text-ink">Bill {{ b.invoice.invoice_number }}</p>
                  <p class="text-[11px] text-ink-muted mt-0.5">Generated {{ shortDateTime(b.invoice.created_at) }} · Grand total {{ formatINR(b.invoice.total_cents) }}</p>
                </div>
                <button (click)="reprint(b.invoice.id)" class="h-9 px-4 rounded-md bg-primary-600 text-white text-[12px] font-semibold shadow-card">
                  Print discharge summary
                </button>
              </div>
            }

            <!-- Doctor visits, labs, radiology summaries -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border border-t border-border">
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[11px] font-semibold text-ink">🩺 Doctor visits</p>
                @if (b.visits?.length) {
                  <ul class="mt-2 space-y-1.5 text-[11px] text-ink-soft">
                    @for (v of b.visits; track v.id) {
                      <li class="flex justify-between gap-2">
                        <span>{{ v.doctor_name }} · {{ v.visit_type }}</span>
                        <span class="font-mono">{{ formatINR(v.charge_cents) }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="mt-2 text-[11px] text-ink-muted">No visits logged.</p>
                }
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[11px] font-semibold text-ink">🧪 Labs</p>
                <p class="mt-2 text-[11px] text-ink-soft">{{ labsCount() }} lab order(s)</p>
                @if (labsCount() > 0) {
                  <p class="text-[10px] text-ink-muted mt-0.5">Reports attached to discharge summary</p>
                }
              </div>
              <div class="bg-surface-card px-4 py-3">
                <p class="text-[11px] font-semibold text-ink">📷 Radiology</p>
                <p class="mt-2 text-[11px] text-ink-soft">{{ radioCount() }} imaging order(s)</p>
              </div>
            </div>

            <!-- Discharge summary narrative -->
            @if (b.summary?.presenting_complaint) {
              <div class="px-5 py-3 border-t border-border">
                <p class="text-[11px] uppercase text-ink-muted font-medium mb-1">Discharge narrative</p>
                <p class="text-[12px] text-ink-soft"><strong>Complaint:</strong> {{ b.summary.presenting_complaint }}</p>
                @if (b.summary.condition_at_discharge) {
                  <p class="text-[12px] text-ink-soft mt-1"><strong>Condition:</strong> {{ b.summary.condition_at_discharge }}</p>
                }
                @if (b.summary.discharge_diagnosis_icd10) {
                  <p class="text-[12px] text-ink-soft mt-1"><strong>Diagnosis:</strong> {{ b.summary.discharge_diagnosis_icd10 }}</p>
                }
              </div>
            }

            <!-- Checklist progress -->
            @if (b.checklist; as c) {
              <div class="px-5 py-3 border-t border-border">
                <p class="text-[11px] uppercase text-ink-muted font-medium mb-1">Nurse handoff</p>
                <p class="text-[12px] text-ink-soft">
                  {{ checklistDone(c) }}/12 items complete
                  @if (c.completed_at) { · signed {{ relativeTime(c.completed_at) }} }
                </p>
              </div>
            }
          </article>

          <!-- ── ⚠ Suspected un-logged doctor visits ── -->
          @if (missedVisits().length > 0) {
            <article class="bg-warn-bg/40 border border-warn-fg/40 rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-warn-fg/30">
                <p class="text-[13px] font-semibold text-warn-fg inline-flex items-center gap-1.5">
                  ⚠ Suspected un-logged doctor visits ({{ missedVisits().length }})
                </p>
                <p class="text-[11px] text-ink-soft mt-0.5">
                  These doctors authored notes / prescribed / ordered investigations on the dates below
                  but no <code>doctor_visit</code> row was logged. Confirm with the team before finalising the bill.
                </p>
              </header>
              <ul class="divide-y divide-warn-fg/20">
                @for (m of missedVisits(); track m.visit_date + m.doctor_staff_id) {
                  <li class="px-5 py-2.5 flex items-center gap-3 flex-wrap text-[12px]">
                    <span class="font-mono text-[11px] bg-surface-card px-2 py-0.5 rounded border border-border">{{ m.visit_date }}</span>
                    <strong class="text-ink">{{ m.doctor_name }}</strong>
                    <span class="text-ink-soft text-[11px]">· {{ m.evidence_summary }} · {{ m.evidence_count }} action(s)</span>
                    <span class="ml-auto flex items-center gap-1.5">
                      <input type="number" [(ngModel)]="visitChargeByKey()[m.visit_date + ':' + m.doctor_staff_id]"
                             min="0" step="50" placeholder="₹"
                             class="h-7 w-20 px-1.5 text-[11px] text-right rounded-md border border-border bg-surface text-ink font-mono"/>
                      <button (click)="logMissedVisit(m)" [disabled]="busy()"
                              class="h-7 px-3 rounded-md bg-warn-fg text-white text-[11px] font-semibold disabled:opacity-50">
                        + Log this visit
                      </button>
                      <button (click)="dismissMissedVisit(m)"
                              class="h-7 px-2 rounded-md text-[11px] text-ink-soft hover:bg-surface-subtle">
                        Dismiss
                      </button>
                    </span>
                  </li>
                }
              </ul>
            </article>
          }

          <!-- ── Editable line items (running invoice CRUD) ── -->
          @if (runningInvoiceId(); as invId) {
            <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[13px] font-semibold text-ink">📋 Line items · editable</p>
                  <p class="text-[11px] text-ink-muted mt-0.5">{{ activeItemsCount() }} active line(s) · subtotal {{ formatINR(itemsSubtotal()) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <button (click)="runConsolidate()" [disabled]="busy()"
                          title="Merge any other draft invoices for this admission into the running invoice + reconcile ledger"
                          class="h-8 px-3 rounded-md text-[11px] font-medium border border-warn-fg/40 text-warn-fg hover:bg-warn-bg/40">
                    🛠 Consolidate invoices
                  </button>
                  <button (click)="toggleAdd()" class="h-8 px-3 rounded-md text-[11px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
                    {{ showAddRow() ? '× Cancel add' : '+ Add custom line' }}
                  </button>
                </div>
              </header>
              <div class="overflow-x-auto">
                <table class="w-full text-[12px]">
                  <thead class="text-[10px] uppercase tracking-[0.06em] text-ink-muted bg-surface-subtle">
                    <tr>
                      <th class="text-left px-3 py-2">Description</th>
                      <th class="text-right px-2 py-2 w-16">Qty</th>
                      <th class="text-right px-2 py-2 w-24">Rate ₹</th>
                      <th class="text-right px-2 py-2 w-24">Disc ₹</th>
                      <th class="text-right px-2 py-2 w-24">Total ₹</th>
                      <th class="text-right px-2 py-2 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @if (showAddRow()) {
                      <tr class="border-t border-border bg-amber-50/30">
                        <td class="px-3 py-1.5"><input [(ngModel)]="add_desc" placeholder="Description" class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/></td>
                        <td class="px-2 py-1.5"><input type="number" [(ngModel)]="add_qty" min="0" step="0.5" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                        <td class="px-2 py-1.5"><input type="number" [(ngModel)]="add_rate" min="0" step="1" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                        <td class="px-2 py-1.5"><input type="number" [(ngModel)]="add_disc" min="0" step="1" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ addPreviewTotal() }}</td>
                        <td class="px-2 py-1.5 text-right">
                          <button (click)="confirmAdd()" [disabled]="busy() || !add_desc || !add_qty"
                                  class="h-7 px-2 rounded-md bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-50">Save</button>
                        </td>
                      </tr>
                    }
                    @for (item of lineItems(); track item.id) {
                      @if (editingId() === item.id) {
                        <tr class="border-t border-border bg-blue-50/30">
                          <td class="px-3 py-1.5"><input [(ngModel)]="edit_desc" class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/></td>
                          <td class="px-2 py-1.5"><input type="number" [(ngModel)]="edit_qty" min="0" step="0.5" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                          <td class="px-2 py-1.5"><input type="number" [(ngModel)]="edit_rate" min="0" step="1" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                          <td class="px-2 py-1.5"><input type="number" [(ngModel)]="edit_disc" min="0" step="1" class="w-full h-8 px-1.5 text-[12px] text-right rounded-md border border-border bg-surface text-ink"/></td>
                          <td class="px-2 py-1.5 text-right font-mono">{{ editPreviewTotal() }}</td>
                          <td class="px-2 py-1.5 text-right">
                            <button (click)="confirmEdit()" [disabled]="busy()" class="h-7 px-2 rounded-md bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-50">Save</button>
                            <button (click)="editingId.set(null)" class="ml-1 h-7 px-2 rounded-md text-[11px] text-ink-soft border border-border">Cancel</button>
                          </td>
                        </tr>
                      } @else {
                        <tr class="border-t border-border" [class.opacity-50]="item.is_voided">
                          <td class="px-3 py-1.5">
                            {{ item.description }}
                            @if (item.related_entity_type) { <span class="ml-1 px-1.5 py-px text-[9px] rounded-full bg-surface-muted text-ink-muted uppercase">{{ item.related_entity_type }}</span> }
                            @if (item.is_voided) { <span class="ml-1 px-1.5 py-px text-[9px] rounded-full bg-danger-bg text-danger-fg uppercase">Voided</span> }
                          </td>
                          <td class="px-2 py-1.5 text-right font-mono">{{ item.qty }}</td>
                          <td class="px-2 py-1.5 text-right font-mono">{{ (item.unit_price_cents / 100).toFixed(0) }}</td>
                          <td class="px-2 py-1.5 text-right font-mono">{{ (item.discount_cents / 100).toFixed(0) }}</td>
                          <td class="px-2 py-1.5 text-right font-mono font-semibold">{{ (item.total_cents / 100).toFixed(0) }}</td>
                          <td class="px-2 py-1.5 text-right">
                            @if (!item.is_voided) {
                              <button (click)="startEdit(item)" class="text-[11px] text-primary-700 hover:underline">Edit</button>
                              <span class="mx-1 text-ink-faint">·</span>
                              <button (click)="confirmDelete(item)" class="text-[11px] text-danger-fg hover:underline">Void</button>
                            } @else if (item.void_reason) {
                              <span class="text-[10px] text-ink-muted italic">{{ item.void_reason }}</span>
                            }
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            </article>

            <!-- ── Payments ── -->
            <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[13px] font-semibold text-ink">💰 Payments</p>
                  <p class="text-[11px] text-ink-muted mt-0.5">
                    Paid {{ formatINR(invPaid()) }} · Balance <strong [class.text-warn-fg]="invBalance() > 0">{{ formatINR(invBalance()) }}</strong>
                  </p>
                </div>
                @if (invBalance() > 0) {
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <input type="number" [(ngModel)]="pay_amount" min="0" step="1" placeholder="Amount ₹"
                           class="h-9 w-28 px-2 text-[13px] rounded-md border border-border bg-surface text-ink font-mono text-right"/>
                    <select [(ngModel)]="pay_method"
                            class="h-9 px-2 text-[12px] rounded-md border border-border bg-surface text-ink">
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="cheque">Cheque</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="insurance">Insurance</option>
                    </select>
                    <input [(ngModel)]="pay_ref" placeholder="Reference / txn"
                           class="h-9 w-40 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
                    <button (click)="confirmPayment()" [disabled]="busy() || !pay_amount"
                            class="h-9 px-3 rounded-md bg-emerald-600 text-white text-[12px] font-semibold disabled:opacity-50">
                      Record payment
                    </button>
                  </div>
                }
              </header>
              @if (payments().length) {
                <ul class="divide-y divide-border">
                  @for (p of payments(); track p.id) {
                    <li class="px-5 py-2 text-[12px] flex items-center justify-between gap-2">
                      <span>
                        <strong>{{ formatINR(p.amount_cents) }}</strong>
                        · {{ p.method }}
                        @if (p.reference) { · <span class="font-mono text-ink-muted">{{ p.reference }}</span> }
                      </span>
                      <span class="text-[10px] text-ink-muted">{{ shortDateTime(p.paid_at) }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="px-5 py-3 text-[12px] text-ink-muted">No payments recorded yet.</p>
              }
            </article>
          }

          <!-- Finalize panel -->
          @if (!b.invoice && (b.admission?.discharge_workflow_status === 'ready_for_billing' || b.admission?.discharge_workflow_status === 'insurance_processing')) {
            <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border">
                <p class="text-[13px] font-semibold text-ink">Finalize bill</p>
                <p class="text-[11px] text-ink-muted mt-0.5">Insurance + discount → grand total</p>
              </header>
              <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-[11px] uppercase text-ink-muted font-medium">Insurance provider</span>
                  <input [(ngModel)]="ins_provider" placeholder="(if any)"
                         class="mt-1 w-full h-10 px-3 text-[13px] border border-border rounded-md bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500"/>
                </label>
                <label class="block">
                  <span class="text-[11px] uppercase text-ink-muted font-medium">Claim number</span>
                  <input [(ngModel)]="ins_claim_no" placeholder="(if any)"
                         class="mt-1 w-full h-10 px-3 text-[13px] border border-border rounded-md bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500"/>
                </label>
                <label class="block">
                  <span class="text-[11px] uppercase text-ink-muted font-medium">Insurance claim (₹)</span>
                  <input type="number" min="0" [(ngModel)]="ins_amount"
                         class="mt-1 w-full h-10 px-3 text-[13px] border border-border rounded-md bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500"/>
                </label>
                <label class="block">
                  <span class="text-[11px] uppercase text-ink-muted font-medium">Discount (₹)</span>
                  <input type="number" min="0" [(ngModel)]="discount_amount"
                         class="mt-1 w-full h-10 px-3 text-[13px] border border-border rounded-md bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500"/>
                </label>
                <label class="block md:col-span-2">
                  <span class="text-[11px] uppercase text-ink-muted font-medium">Discount reason</span>
                  <input [(ngModel)]="discount_reason"
                         class="mt-1 w-full h-10 px-3 text-[13px] border border-border rounded-md bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500"/>
                </label>
              </div>
              <footer class="px-5 py-3 border-t border-border bg-surface-muted/40 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[10px] uppercase text-ink-muted">Estimated grand total</p>
                  <p class="font-display text-[20px] font-medium text-primary-700">{{ formatINR(estimatedGrandTotal()) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  @if (b.admission?.discharge_workflow_status === 'ready_for_billing') {
                    <button (click)="markInsurance()" [disabled]="busy()"
                            class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                      Mark insurance pending
                    </button>
                  } @else {
                    <button (click)="unmarkInsurance()" [disabled]="busy()"
                            class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                      Insurance complete
                    </button>
                  }
                  <button (click)="finalize()" [disabled]="busy()"
                          class="h-9 px-4 rounded-md bg-good-fg hover:bg-good-strong text-white text-[12px] font-semibold shadow-card disabled:opacity-50">
                    {{ busy() ? 'Finalizing…' : '✓ Finalize & print' }}
                  </button>
                </div>
              </footer>
            </article>
          }
        } @else {
          <article class="bg-surface-card border border-border rounded-[12px] py-12 grid place-items-center text-[13px] text-ink-muted">
            Loading…
          </article>
        }
      } @else {
        <article class="bg-surface-card border border-border rounded-[12px] flex-1 grid place-items-center text-[13px] text-ink-muted py-16">
          Pick a discharge from the queue.
        </article>
      }
    </section>
  </div>
</div>
  `,
})
export class DischargeBillingPage implements OnInit, OnDestroy {
  private svc = inject(DischargeBillingService);
  private toast = inject(ToastService);
  private printSvc = inject(PharmacyPrintService);
  private messaging = inject(MessagingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly queue = signal<DischargeQueueItem[]>([]);
  protected readonly currentId = signal<string | null>(null);
  protected readonly bundle = signal<any | null>(null);
  protected readonly busy = signal(false);

  protected ins_provider = '';
  protected ins_claim_no = '';
  protected ins_amount: number | null = 0;
  protected discount_amount: number | null = 0;
  protected discount_reason = '';

  // ── Phase 3 — line item CRUD + payments ──
  protected readonly lineItems  = signal<Array<{
    id: string; description: string; qty: number; unit_price_cents: number;
    discount_cents: number; total_cents: number; position: number;
    related_entity_type: string | null; is_voided: boolean; void_reason: string | null;
  }>>([]);
  protected readonly payments   = signal<Array<{
    id: string; amount_cents: number; method: string; reference: string | null;
    paid_at: string; notes: string | null;
  }>>([]);

  /** Running invoice = the IP-* draft/issued/partial invoice for the admission. */
  protected readonly runningInvoiceId = computed<string | null>(() => {
    const b = this.bundle();
    if (!b) return null;
    return b.invoice?.id ?? b.running_invoice?.id ?? null;
  });
  protected readonly activeItemsCount = computed(() => this.lineItems().filter(i => !i.is_voided).length);
  protected readonly itemsSubtotal    = computed(() => this.lineItems().filter(i => !i.is_voided).reduce((s, i) => s + i.total_cents, 0));
  protected readonly invPaid    = computed(() => this.payments().reduce((s, p) => s + p.amount_cents, 0));
  protected readonly invBalance = computed(() => Math.max(0, this.itemsSubtotal() - this.invPaid()));

  // Add row state
  protected readonly showAddRow = signal(false);
  protected add_desc = ''; protected add_qty = 1; protected add_rate = 0; protected add_disc = 0;
  protected addPreviewTotal = computed(() =>
    Math.max(0, (Number(this.add_qty) * Number(this.add_rate)) - Number(this.add_disc)));

  // Edit row state
  protected readonly editingId = signal<string | null>(null);
  protected edit_desc = ''; protected edit_qty = 1; protected edit_rate = 0; protected edit_disc = 0;
  protected editPreviewTotal = computed(() =>
    Math.max(0, (Number(this.edit_qty) * Number(this.edit_rate)) - Number(this.edit_disc)));

  // Payment form state
  protected pay_amount: number | null = null;
  protected pay_method = 'cash';
  protected pay_ref = '';

  // ── Suspected un-logged doctor visits (reconciliation) ──
  protected readonly missedVisitsRaw = signal<Array<{
    visit_date: string; doctor_staff_id: string; doctor_name: string;
    evidence_kinds: string[]; evidence_count: number; evidence_summary: string;
    already_logged: boolean;
  }>>([]);
  protected readonly dismissedKeys = signal<Set<string>>(new Set());
  protected readonly visitChargeByKey = signal<Record<string, number>>({});
  /** Filtered: only un-logged AND not dismissed in this session. */
  protected readonly missedVisits = computed(() =>
    this.missedVisitsRaw()
      .filter(m => !m.already_logged)
      .filter(m => !this.dismissedKeys().has(m.visit_date + ':' + m.doctor_staff_id)));

  protected readonly estimatedGrandTotal = computed(() => {
    const b = this.bundle();
    if (!b) return 0;
    const sub =
      this.catTotal('bed') + this.catTotal('pharmacy') +
      this.visitsTotal() + this.labsTotal() + this.radioTotal();
    return Math.max(0, sub - (this.ins_amount ?? 0) * 100 - (this.discount_amount ?? 0) * 100);
  });

  private unsubscribe: (() => void) | null = null;

  async ngOnInit() {
    await this.refresh();
    this.unsubscribe = this.svc.subscribe(() => void this.refresh());
    const wanted = this.route.snapshot.queryParamMap.get('admission');
    if (wanted) await this.select(wanted);
    else if (this.queue()[0]) await this.select(this.queue()[0].admission_id);
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  protected async refresh() {
    try {
      const items = await this.svc.listQueue();
      this.queue.set(items);
      const id = this.currentId();
      if (id && !items.find((q) => q.admission_id === id)) {
        // current admission left the queue (finalized) — keep showing bundle
      } else if (id) {
        const fresh = await this.svc.getBundle(id);
        this.bundle.set(fresh);
      }
    } catch (e) {
      this.toast.error('Could not load queue', this.errMsg(e));
    }
  }

  protected async select(id: string) {
    this.currentId.set(id);
    this.bundle.set(null);
    this.lineItems.set([]); this.payments.set([]);
    this.editingId.set(null); this.showAddRow.set(false);
    try {
      const b = await this.svc.getBundle(id);
      this.bundle.set(b);
      this.ins_provider = b.summary?.insurance_provider ?? '';
      this.ins_claim_no = b.summary?.insurance_claim_number ?? '';
      this.ins_amount = (b.summary?.insurance_claim_cents ?? 0) / 100;
      this.discount_amount = (b.summary?.discount_cents ?? 0) / 100;
      this.discount_reason = b.summary?.discount_reason ?? '';
      await this.loadInvoiceWorkspace();
    } catch (e) {
      this.toast.error('Could not load admission', this.errMsg(e));
    }
  }

  /** Load line items + payments for the running invoice (Phase 3 workspace). */
  private async loadInvoiceWorkspace() {
    const invId = this.runningInvoiceId();
    const admId = this.currentId();
    if (!invId) { this.lineItems.set([]); this.payments.set([]); }
    try {
      const tasks: Promise<any>[] = [];
      if (invId) tasks.push(this.svc.listInvoiceItems(invId), this.svc.listPayments(invId));
      else       tasks.push(Promise.resolve([]),                Promise.resolve([]));
      tasks.push(admId ? this.svc.findUndocumentedVisits(admId) : Promise.resolve([]));
      const [items, pays, missed] = await Promise.all(tasks);
      this.lineItems.set(items);
      this.payments.set(pays);
      this.missedVisitsRaw.set(missed);
      // Pre-populate default charge of ₹500 per missed visit (editable)
      const defaults: Record<string, number> = {};
      for (const m of missed as any[]) {
        defaults[`${m.visit_date}:${m.doctor_staff_id}`] = 500;
      }
      this.visitChargeByKey.set(defaults);
    } catch (e) {
      this.toast.error('Could not load invoice workspace', this.errMsg(e));
    }
  }

  // ── Suspected un-logged visits — handlers ─────────────────────────
  protected async logMissedVisit(m: { visit_date: string; doctor_staff_id: string; doctor_name: string }) {
    const admId = this.currentId(); if (!admId) return;
    const key = `${m.visit_date}:${m.doctor_staff_id}`;
    const charge = this.visitChargeByKey()[key] ?? 500;
    if (!charge || charge <= 0) {
      this.toast.warn('Charge required', 'Enter a non-zero amount before logging.');
      return;
    }
    this.busy.set(true);
    try {
      // Anchor the visit at midday on the date so it falls within the day's window
      const visitedAt = new Date(`${m.visit_date}T12:00:00+05:30`).toISOString();
      await this.svc.logDoctorVisit({
        admissionId:   admId,
        doctorStaffId: m.doctor_staff_id,
        visitedAt,
        visitType:     'ward_round',
        chargeRupees:  Number(charge),
        notes:         'Logged during discharge billing reconciliation',
      });
      this.toast.success('Visit logged', `${m.doctor_name} · ${m.visit_date} · ₹${charge}`);
      await this.loadInvoiceWorkspace();
    } catch (e) { this.toast.error('Could not log visit', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected dismissMissedVisit(m: { visit_date: string; doctor_staff_id: string }) {
    const next = new Set(this.dismissedKeys());
    next.add(`${m.visit_date}:${m.doctor_staff_id}`);
    this.dismissedKeys.set(next);
  }

  /** Repair: merge all draft invoices for this admission into ONE running invoice. */
  protected async runConsolidate() {
    const id = this.currentId(); if (!id) return;
    if (!confirm('Merge all draft invoices for this admission into ONE running invoice and reconcile the ledger?\n\nOlder invoices will be voided. Lines + payments preserved.')) return;
    this.busy.set(true);
    try {
      const r = await this.svc.consolidateInvoices(id);
      this.toast.success('Consolidated', `${r.lines_consolidated} line(s) merged · ${r.invoices_voided} invoice(s) voided · total ₹${(r.final_total/100).toFixed(0)}`);
      const fresh = await this.svc.getBundle(id);
      this.bundle.set(fresh);
      await this.loadInvoiceWorkspace();
    } catch (e) { this.toast.error('Consolidation failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  // ── Phase 3 — line item CRUD + payment handlers ──
  protected toggleAdd() {
    if (this.showAddRow()) { this.showAddRow.set(false); return; }
    this.add_desc = ''; this.add_qty = 1; this.add_rate = 0; this.add_disc = 0;
    this.showAddRow.set(true);
  }

  protected async confirmAdd() {
    const invId = this.runningInvoiceId(); if (!invId) return;
    if (!this.add_desc.trim() || !this.add_qty) return;
    this.busy.set(true);
    try {
      await this.svc.addItem({
        invoiceId:      invId,
        description:    this.add_desc.trim(),
        qty:            Number(this.add_qty),
        unitPriceCents: Math.round(Number(this.add_rate) * 100),
        discountCents:  Math.round(Number(this.add_disc) * 100),
      });
      this.toast.success('Line added');
      this.showAddRow.set(false);
      await this.loadInvoiceWorkspace();
    } catch (e) { this.toast.error('Add failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected startEdit(item: { id: string; description: string; qty: number; unit_price_cents: number; discount_cents: number }) {
    this.editingId.set(item.id);
    this.edit_desc = item.description;
    this.edit_qty  = item.qty;
    this.edit_rate = item.unit_price_cents / 100;
    this.edit_disc = item.discount_cents / 100;
  }

  protected async confirmEdit() {
    const id = this.editingId(); if (!id) return;
    this.busy.set(true);
    try {
      await this.svc.editItem({
        itemId:         id,
        description:    this.edit_desc,
        qty:            Number(this.edit_qty),
        unitPriceCents: Math.round(Number(this.edit_rate) * 100),
        discountCents:  Math.round(Number(this.edit_disc) * 100),
      });
      this.toast.success('Line updated');
      this.editingId.set(null);
      await this.loadInvoiceWorkspace();
    } catch (e) { this.toast.error('Update failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected async confirmDelete(item: { id: string; description: string }) {
    const reason = prompt(`Void "${item.description}" — reason?`);
    if (!reason || reason.trim().length < 3) return;
    this.busy.set(true);
    try {
      await this.svc.deleteItem(item.id, reason.trim());
      this.toast.success('Line voided');
      await this.loadInvoiceWorkspace();
    } catch (e) { this.toast.error('Void failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected async confirmPayment() {
    const invId = this.runningInvoiceId(); if (!invId || !this.pay_amount) return;
    this.busy.set(true);
    const amount = Number(this.pay_amount);
    const method = this.pay_method;
    try {
      await this.svc.recordPayment({
        invoiceId:    invId,
        amountCents:  Math.round(amount * 100),
        method,
        reference:    this.pay_ref.trim() || undefined,
      });
      this.toast.success('Payment recorded', `${method.toUpperCase()} · ₹${amount}`);

      // Mock-mode SMS receipt — silently skipped if patient has no mobile.
      const b = this.bundle();
      const patientId = b?.patient?.id;
      const invNo = b?.invoice?.invoice_number ?? b?.running_invoice?.invoice_number ?? '';
      if (patientId) {
        await this.loadInvoiceWorkspace();
        const balance = this.invBalance() / 100;
        await this.messaging.sendToPatient({
          patientId,
          template: 'Payment received: ₹{{amount}} via {{method}} for bill {{invoice}}. Outstanding balance: ₹{{balance}}. Thank you.',
          vars: { amount: amount.toFixed(0), method: method.toUpperCase(), invoice: invNo, balance: balance.toFixed(0) },
          relatedEntityType: 'invoice',
          relatedEntityId:   invId,
        });
      } else {
        await this.loadInvoiceWorkspace();
      }

      this.pay_amount = null; this.pay_ref = '';
    } catch (e) { this.toast.error('Payment failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected async markInsurance() {
    const id = this.currentId(); if (!id) return;
    this.busy.set(true);
    try { await this.svc.setInsuranceProcessing(id, true); this.toast.success('Marked insurance pending'); await this.refresh(); }
    catch (e) { this.toast.error('Failed', this.errMsg(e)); } finally { this.busy.set(false); }
  }
  protected async unmarkInsurance() {
    const id = this.currentId(); if (!id) return;
    this.busy.set(true);
    try { await this.svc.setInsuranceProcessing(id, false); this.toast.success('Insurance complete'); await this.refresh(); }
    catch (e) { this.toast.error('Failed', this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async finalize() {
    const id = this.currentId(); if (!id) return;
    this.busy.set(true);
    try {
      const res = await this.svc.finalize({
        admissionId: id,
        insuranceProvider: this.ins_provider || null,
        insuranceClaimNumber: this.ins_claim_no || null,
        insuranceClaimRupees: this.ins_amount ?? 0,
        discountRupees: this.discount_amount ?? 0,
        discountReason: this.discount_reason || null,
      });
      this.toast.success('Discharged & billed', `${res.invoice_number} · ${this.formatINR(res.grand_total)}`);
      void this.printSvc.printDischargeSummary(res.admission_id, res.invoice_id);

      // Mock-mode SMS — patient gets a "bill ready" notification.
      const patientId = this.bundle()?.patient?.id;
      if (patientId) {
        await this.messaging.sendToPatient({
          patientId,
          template: 'Discharge bill ready: {{invoice}} · ₹{{total}}. Visit billing counter to settle. Thank you for choosing us.',
          vars: { invoice: res.invoice_number, total: (res.grand_total / 100).toFixed(0) },
          relatedEntityType: 'invoice',
          relatedEntityId:   res.invoice_id,
        });
      }
      await this.refresh();
    } catch (e) { this.toast.error('Could not finalize', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected reprint(invoiceId: string) {
    const id = this.currentId(); if (!id) return;
    void this.printSvc.printDischargeSummary(id, invoiceId);
  }

  // ── Phase 5 — open the structured summary editor / insurance package print ──
  protected openSummaryEditor() {
    const id = this.currentId(); if (!id) return;
    void this.router.navigate(['/discharge-billing/edit', id]);
  }
  protected openInsurancePrint() {
    const id = this.currentId(); if (!id) return;
    window.open(`/discharge-billing/print/${id}`, '_blank');
  }

  // ── helpers ──
  protected catTotal(t: 'bed' | 'pharmacy'): number {
    const b = this.bundle(); if (!b) return 0;
    // For non-finalized: walk the data we have. Bed: estimate from days × default rate? Better just show 0 until invoice exists.
    if (b.invoice && b.invoice_items?.length) {
      return (b.invoice_items as any[])
        .filter(it => it.related_entity_type === t)
        .reduce((acc, it) => acc + (it.total_cents ?? 0), 0);
    }
    return 0;
  }
  protected visitsTotal(): number {
    const b = this.bundle(); if (!b?.visits?.length) return 0;
    return (b.visits as any[]).reduce((a, v) => a + (v.charge_cents ?? 0), 0);
  }
  protected labsTotal(): number {
    const b = this.bundle();
    if (!b?.invoice_items?.length) return 0;
    return (b.invoice_items as any[]).filter(it => it.related_entity_type === 'lab_order').reduce((a, it) => a + (it.total_cents ?? 0), 0);
  }
  protected radioTotal(): number {
    const b = this.bundle();
    if (!b?.invoice_items?.length) return 0;
    return (b.invoice_items as any[]).filter(it => it.related_entity_type === 'radiology_order').reduce((a, it) => a + (it.total_cents ?? 0), 0);
  }
  protected labsCount(): number {
    const b = this.bundle(); if (!b?.lab_orders?.length) return 0;
    return (b.lab_orders as any[]).filter(o => !o.is_radiology).length;
  }
  protected radioCount(): number {
    const b = this.bundle(); if (!b?.lab_orders?.length) return 0;
    return (b.lab_orders as any[]).filter(o => o.is_radiology).length;
  }
  protected checklistDone(c: any): number {
    const keys = ['item_meds_returned','item_iv_lines_removed','item_belongings_returned','item_final_vitals_recorded','item_summary_signed','item_followup_scheduled','item_prescription_handed','item_education_given','item_lab_reports_handed','item_imaging_reports_handed','item_consents_complete','item_billing_notified'];
    return keys.filter(k => c?.[k]).length;
  }

  protected wfLabel(s: string): string {
    return ({
      none:'', requested:'Discharge requested', nurse_handoff:'Nurse handoff',
      ready_for_billing:'Ready for billing', insurance_processing:'Insurance', finalized:'Finalized', cancelled:'Cancelled',
    } as Record<string,string>)[s] ?? s;
  }
  protected wfChipCls(s: string): string {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.04em]';
    const tone = ({
      requested:'bg-warn-bg text-warn-fg', nurse_handoff:'bg-warn-bg text-warn-fg',
      ready_for_billing:'bg-info-bg text-info-fg', insurance_processing:'bg-info-bg text-info-fg',
      finalized:'bg-good-bg text-good-fg', cancelled:'bg-surface-subtle text-ink-muted',
    } as Record<string,string>)[s] ?? '';
    return `${base} ${tone}`;
  }
  protected rowCls(active: boolean): string {
    return active ? 'bg-primary-100' : 'hover:bg-surface-subtle';
  }
  protected admissionDay(iso?: string): number {
    if (!iso) return 1;
    try { return Math.max(1, Math.floor((Date.now() - parseISO(iso).getTime()) / 86400000) + 1); } catch { return 1; }
  }
  protected shortDateTime(iso?: string): string {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMM yyyy, HH:mm'); } catch { return iso; }
  }
  protected relativeTime(iso?: string): string {
    if (!iso) return '';
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }
  protected formatINR(c: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((c ?? 0) / 100);
  }
  private errMsg(e: unknown): string {
    if (!e) return 'Try again.';
    if (typeof e === 'string') return e;
    const o = e as Record<string, any>;
    return o['message'] || o['error_description'] || o['details'] || o['hint'] || 'Try again.';
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const queue = this.queue();
    if (queue.length === 0) return;

    const rows = queue.map(q => ({
      uhid:          q.uhid,
      patient_name:  q.patient_name,
      ward:          q.ward_name ?? '',
      bed:           q.bed_code ?? '',
      admitted_at:   q.admitted_at,
      day_count:     this.admissionDay(q.admitted_at),
      requested_at:  q.requested_at ?? '',
      workflow_status: this.wfLabel(q.workflow_status),
    }));

    const columns: ExportColumn<any>[] = [
      { key: 'uhid',            header: 'UHID',         width: 12, align: 'left' },
      { key: 'patient_name',    header: 'Patient',      width: 24, align: 'left' },
      { key: 'ward',            header: 'Ward',         width: 14, align: 'left' },
      { key: 'bed',             header: 'Bed',          width: 10, align: 'left' },
      { key: 'admitted_at',     header: 'Admitted',     width: 18, align: 'center', format: 'datetime' as const },
      { key: 'day_count',       header: 'Day #',        width: 8,  align: 'right', format: 'integer' as const },
      { key: 'requested_at',    header: 'Requested',    width: 18, align: 'center', format: 'datetime' as const },
      { key: 'workflow_status', header: 'Status',       width: 14, align: 'left' },
    ];

    await this.exportSvc.export(fmt, {
      filename: `DischargeBilling_Queue_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'IP Discharge Billing Queue',
      subtitle: `${queue.length} discharge${queue.length === 1 ? '' : 's'} in progress`,
      columns, rows,
      footer: 'Sree Diagnostics · Discharge Billing Queue',
    });
  }
}
