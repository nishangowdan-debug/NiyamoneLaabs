import {
  ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { LabService } from '../data/lab.service';
import { LabStore } from '../data/lab.store';
import { LabPrintService } from '../services/lab-print.service';
import { LabRequisitionPdfService } from '../services/lab-requisition-pdf.service';
import { ageFromDob } from '../../patients/utils/age-from-dob';
import {
  LAB_TAB_OPTIONS, STATUS_TONE,
  type LabOrderRow, type LabResultRow, type LabTab, type RadiologySlot,
} from '../data/lab.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface LabOrderExportRow {
  order_number: string;
  order_at: string;
  uhid: string;
  patient_name: string;
  doctor: string;
  tests_total: number;
  pending: number;
  entered: number;
  verified: number;
  critical: number;
  priority: string;
  sample_status: string;
}

@Component({
  selector: 'app-lab-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent, ExportMenuComponent],
  template: `
<div class="flex flex-col gap-4 h-full">

  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">🧬 Lab &amp; Radiology</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        LIS / RIS workflow — Order → Billing → Phlebotomy → Processing → Verification → Reporting ·
        <span class="inline-flex items-center gap-1.5 text-good-fg">
          <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
        </span>
      </p>
    </div>
    <div class="flex items-center gap-1.5 flex-wrap">
      @for (t of tabs; track t.id) {
        <button (click)="tab.set(t.id)" [class]="tabBtnCls(t.id)">
          {{ t.icon }} {{ t.label }}
          <span class="ml-1 font-mono text-[10px] opacity-70">{{ tabCount(t.id) }}</span>
        </button>
      }
      <app-export-menu [disabled]="store.orders().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (store.error()) {
    <app-alert tone="danger" title="Could not load lab orders">{{ store.error() }}</app-alert>
  }

  <!-- ══════════════════════════════════════════════════════════ -->
  <!-- TAB 1 · PHLEBOTOMY                                         -->
  <!-- ══════════════════════════════════════════════════════════ -->
  @if (tab() === 'phlebotomy') {
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <p class="text-[13px] font-semibold text-ink">💉 Phlebotomy queue</p>
          <p class="text-[11px] text-ink-muted mt-0.5">Auto-populates only when billing is paid or credit-approved.</p>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-ink-muted">
          <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-danger-fg"></span>STAT</span>
          <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-warn-fg"></span>Urgent</span>
          <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-info-fg"></span>Routine</span>
        </div>
      </header>
      @if (phlebotomyQueue().length === 0) {
        <div class="px-6 py-12 text-center text-[13px] text-ink-muted">All caught up — no samples awaiting collection.</div>
      } @else {
        <table class="w-full text-[13px]">
          <thead class="bg-surface-muted">
            <tr>
              <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-20">Token</th>
              <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Patient</th>
              <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Tests ordered</th>
              <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-24">Priority</th>
              <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-24">Billing</th>
              <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-44">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (o of phlebotomyQueue(); track o.id) {
              <tr class="border-t border-border" [style.border-left]="'3px solid ' + priorityColor(o.priority)">
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-muted">{{ o.id.slice(0,8) }}</td>
                <td class="px-4 py-2.5">
                  <p class="font-medium text-ink truncate">{{ patientName(o) }}</p>
                  <p class="text-[11px] font-mono text-ink-muted">{{ o.patient?.uhid }}</p>
                </td>
                <td class="px-4 py-2.5">
                  <div class="flex flex-wrap gap-1">
                    @for (r of o.results; track r.id) {
                      <span class="text-[10px] font-mono px-1.5 h-[18px] rounded-full bg-surface-subtle text-ink-soft inline-flex items-center">{{ r.test.code }}</span>
                    }
                  </div>
                </td>
                <td class="px-4 py-2.5"><span [class]="priorityChip(o.priority)">{{ o.priority }}</span></td>
                <td class="px-4 py-2.5"><span [class]="billingChip(orderBilling(o))">{{ orderBilling(o) }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <button (click)="printRequisition(o)"
                          class="h-8 px-2.5 mr-1 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle inline-flex items-center gap-1"
                          title="Print lab requisition slip">
                    📄
                  </button>
                  @if (canManage()) {
                    <button (click)="collect(o)" [disabled]="busy() === o.id"
                            class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                            style="background:#0E4F8C;">
                      {{ busy() === o.id ? 'Collecting…' : '🩸 Collect &amp; print' }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </article>
  }

  <!-- ══════════════════════════════════════════════════════════ -->
  <!-- TAB 2 · PROCESSING                                          -->
  <!-- ══════════════════════════════════════════════════════════ -->
  @if (tab() === 'processing') {
    <article class="bg-surface-card border border-border rounded-[12px] p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-[18px]">📷</span>
        <div class="flex-1 min-w-[260px]">
          <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Scan barcode (or type ID + Enter)</label>
          <input type="text" [(ngModel)]="scanQ" name="scan" (keydown.enter)="onScan()"
                 placeholder="BR-YYYYMMDD-####" autofocus
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          @for (d of departments; track d) {
            <button (click)="dept.set(dept() === d ? null : d)" [class]="deptCls(d)" class="capitalize">{{ d }}</button>
          }
          @if (dept()) {
            <button (click)="dept.set(null)" class="h-7 px-2 rounded text-[11px] text-ink-muted hover:underline">clear</button>
          }
        </div>
      </div>
    </article>

    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-5 py-3 border-b border-border">
        <p class="text-[13px] font-semibold text-ink">🧪 Processing worklist</p>
        <p class="text-[11px] text-ink-muted mt-0.5">Out-of-range values flag automatically.</p>
      </header>
      @if (processingQueue().length === 0) {
        <div class="px-6 py-12 text-center text-[13px] text-ink-muted">No samples in process.</div>
      } @else {
        <ul class="divide-y divide-border">
          @for (o of processingQueue(); track o.id) {
            <li class="px-5 py-4">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p class="text-[13px] font-semibold text-ink">{{ patientName(o) }} <span class="text-[11px] font-mono text-ink-muted">· {{ o.patient?.uhid }}</span></p>
                  <p class="text-[11px] text-ink-muted">
                    Barcode <span class="font-mono font-semibold text-primary-700">{{ orderBarcode(o) }}</span>
                    · {{ o.results.length }} test(s) · collected {{ relativeTime(o.collected_at) }}
                  </p>
                </div>
                <span [class]="statusChipCls(o.sample_status)">{{ STATUS_TONE[o.sample_status].label }}</span>
              </div>

              <div class="mt-3 grid grid-cols-12 gap-2 text-[12px]">
                <div class="col-span-12 grid grid-cols-12 gap-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">
                  <span class="col-span-3">Test</span>
                  <span class="col-span-3">Reference range</span>
                  <span class="col-span-2">Numeric</span>
                  <span class="col-span-3">Text / interpretation</span>
                  <span class="col-span-1 text-right">Flag</span>
                </div>
                @for (r of o.results; track r.id) {
                  @let params = paramsForResult(r);
                  @if (params.length > 0) {
                    <!-- Test name header -->
                    <div class="col-span-12 mt-2 pt-2 border-t border-border flex items-baseline gap-2">
                      <span class="font-mono font-semibold text-primary-700">{{ r.test.code }}</span>
                      <span class="text-[11px] text-ink-muted truncate">{{ r.test.name }}</span>
                    </div>
                    @for (p of params; track p.id) {
                      @if (p.is_section_header) {
                        <div class="col-span-12 px-2 py-1 text-[10px] uppercase tracking-[0.06em] font-bold text-primary-700 bg-primary-50 rounded">
                          {{ p.parameter || p.section }}
                        </div>
                      } @else {
                        <div class="col-span-12 grid grid-cols-12 gap-2 items-center">
                          <div class="col-span-3 min-w-0 pl-2">
                            <p class="text-[12px] text-ink truncate">{{ p.parameter }}</p>
                            @if (p.method) {
                              <p class="text-[10px] text-ink-muted truncate">{{ p.method }}</p>
                            }
                          </div>
                          <div class="col-span-3 text-[11px] text-ink-muted font-mono">
                            @if (p.normal_range_display) {
                              {{ p.normal_range_display }} {{ p.unit ? '· ' + p.unit : '' }}
                            } @else if (p.low_value !== null && p.high_value !== null) {
                              {{ p.low_value }} – {{ p.high_value }} {{ p.unit || '' }}
                            } @else { — }
                          </div>
                          <div class="col-span-2">
                            <input type="number" step="0.01"
                                   [ngModel]="paramEntry(r.id, p.id, 'numeric')"
                                   (ngModelChange)="setParamEntry(r.id, p.id, 'numeric', $event)"
                                   [placeholder]="p.default_value || ''"
                                   [name]="'pnum-' + r.id + '-' + p.id"
                                   [disabled]="r.status === 'verified'"
                                   class="w-full h-8 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                          </div>
                          <div class="col-span-3">
                            <input type="text"
                                   [ngModel]="paramEntry(r.id, p.id, 'text')"
                                   (ngModelChange)="setParamEntry(r.id, p.id, 'text', $event)"
                                   [name]="'ptxt-' + r.id + '-' + p.id"
                                   [disabled]="r.status === 'verified'"
                                   class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                          </div>
                          <div class="col-span-1 text-right">
                            @if (paramFlagPreview(r.id, p) ; as f) {
                              <span [class]="flagPillCls(f)">{{ f }}</span>
                            } @else {
                              <span class="text-ink-muted text-[10px]">—</span>
                            }
                          </div>
                        </div>
                      }
                    }
                  } @else {
                    <div class="col-span-12 grid grid-cols-12 gap-2 items-center">
                      <div class="col-span-3 min-w-0">
                        <p class="font-mono font-semibold text-primary-700 truncate">{{ r.test.code }}</p>
                        <p class="text-[10px] text-ink-muted truncate">{{ r.test.name }}</p>
                      </div>
                      <div class="col-span-3 text-[11px] text-ink-muted font-mono">
                        @if (r.test.ref_min !== null && r.test.ref_max !== null) {
                          {{ r.test.ref_min }} – {{ r.test.ref_max }} {{ r.test.unit || '' }}
                        } @else { — }
                      </div>
                      <div class="col-span-2">
                        <input type="number" step="0.01"
                               [ngModel]="entry(r.id, 'numeric')"
                               (ngModelChange)="setEntry(r.id, 'numeric', $event); previewFlag(r, $event)"
                               [class]="numericInputCls(r.id)"
                               [name]="'num-' + r.id"
                               [disabled]="r.status === 'verified'" />
                      </div>
                      <div class="col-span-3">
                        <input type="text"
                               [ngModel]="entry(r.id, 'text')" (ngModelChange)="setEntry(r.id, 'text', $event)"
                               [name]="'txt-' + r.id"
                               [disabled]="r.status === 'verified'"
                               class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                      </div>
                      <div class="col-span-1 text-right">
                        @if (livePreviewFlag(r); as f) {
                          <span [class]="flagPillCls(f)">{{ f }}</span>
                        } @else if (r.flag) {
                          <span [class]="flagPillCls(r.flag)">{{ r.flag }}</span>
                        } @else {
                          <span class="text-ink-muted text-[10px]">—</span>
                        }
                      </div>
                    </div>
                  }
                }
              </div>

              <div class="mt-3 flex items-center justify-end gap-2">
                <button (click)="saveAllResults(o)" [disabled]="busy() === o.id || !canManage()"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                        style="background:#16A34A;">
                  {{ busy() === o.id ? 'Saving…' : '💾 Save all results' }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </article>
  }

  <!-- ══════════════════════════════════════════════════════════ -->
  <!-- TAB 3 · VERIFICATION                                        -->
  <!-- ══════════════════════════════════════════════════════════ -->
  @if (tab() === 'verification') {
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
      <article class="lg:col-span-4 bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
        <header class="px-4 py-3 border-b border-border">
          <p class="text-[13px] font-semibold text-ink">✅ Pending verification</p>
          <p class="text-[11px] text-ink-muted mt-0.5">{{ verificationQueue().length }} order(s) awaiting sign-off</p>
        </header>
        @if (verificationQueue().length === 0) {
          <div class="px-4 py-12 text-center text-[13px] text-ink-muted">No pending verifications.</div>
        } @else {
          <ul class="divide-y divide-border overflow-y-auto">
            @for (o of verificationQueue(); track o.id) {
              <li>
                <button type="button" (click)="selectVerify(o)"
                  class="w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors"
                  [class.bg-primary-50]="selectedVerify()?.id === o.id">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-[13px] font-semibold text-ink truncate">{{ patientName(o) }}</p>
                    @if (fullyVerified(o)) {
                      <span class="text-[10px] font-bold text-good-fg">✓ Verified</span>
                    } @else if (o.totals.critical > 0) {
                      <span class="text-[10px] font-bold text-danger-fg">⚠ {{ o.totals.critical }} CRIT</span>
                    }
                  </div>
                  <p class="text-[11px] font-mono text-ink-muted truncate">{{ o.patient?.uhid }} · {{ o.totals.verified }}/{{ o.totals.total }} verified</p>
                </button>
              </li>
            }
          </ul>
        }
      </article>

      <article class="lg:col-span-8 bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
        @if (selectedVerify(); as o) {
          <header class="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p class="text-[14px] font-semibold text-ink">{{ patientName(o) }}</p>
              <p class="text-[11px] font-mono text-ink-muted">{{ o.patient?.uhid }} · barcode {{ orderBarcode(o) }}</p>
            </div>
            <div class="flex items-center gap-2">
              @if (o.totals.verified > 0) {
                <button (click)="printReport(o)" [disabled]="busy() === 'print:' + o.id"
                        class="h-9 px-3 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-100 text-[12px] font-semibold disabled:opacity-50"
                        title="Print Vimta-style lab report">
                  🖨 Print report
                </button>
              }
              @if (!fullyVerified(o) && canManage()) {
                <button (click)="verifyAll(o)" [disabled]="busy() === o.id || o.totals.entered === 0"
                        class="h-9 px-4 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
                        style="background:#0E4F8C;">
                  ✍ Approve &amp; sign all
                </button>
              } @else {
                <span class="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-good-bg text-good-fg text-[12px] font-semibold">
                  ✓ Fully verified
                </span>
              }
            </div>
          </header>

          <div class="px-5 py-4 overflow-y-auto flex-1">
            <table class="w-full text-[13px]">
              <thead>
                <tr class="border-b border-border">
                  <th class="text-left py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Test</th>
                  <th class="text-left py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Value</th>
                  <th class="text-left py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Reference</th>
                  <th class="text-left py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Flag</th>
                  <th class="text-left py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">History (last 3)</th>
                </tr>
              </thead>
              <tbody>
                @for (r of o.results; track r.id) {
                  <tr class="border-b border-border last:border-b-0">
                    <td class="py-2.5 align-top">
                      <p class="font-mono font-semibold text-primary-700">{{ r.test.code }}</p>
                      <p class="text-[10px] text-ink-muted">{{ r.test.name }}</p>
                    </td>
                    <td class="py-2.5 align-top font-mono text-[14px]" [class.font-bold]="r.flag === 'critical_low' || r.flag === 'critical_high'">
                      {{ r.value_numeric ?? r.value_text ?? '—' }}
                      @if (r.test.unit) { <span class="text-[10px] text-ink-muted ml-1">{{ r.test.unit }}</span> }
                    </td>
                    <td class="py-2.5 align-top text-[11px] font-mono text-ink-muted">
                      @if (r.test.ref_min !== null && r.test.ref_max !== null) {
                        {{ r.test.ref_min }} – {{ r.test.ref_max }}
                      } @else { — }
                    </td>
                    <td class="py-2.5 align-top">
                      @if (r.flag) { <span [class]="flagPillCls(r.flag)">{{ r.flag }}</span> }
                    </td>
                    <td class="py-2.5 align-top">
                      @if (history()[r.id]; as h) {
                        @if (h.length === 0) {
                          <span class="text-[10px] text-ink-muted">no prior</span>
                        } @else {
                          <svg viewBox="0 0 100 30" class="w-[100px] h-[26px]">
                            <polyline [attr.points]="historyPoints(h, r)" fill="none" stroke="#0E4F8C" stroke-width="1.5"/>
                            @for (p of historyPointsArray(h, r); track $index) {
                              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="1.8" [attr.fill]="p.color"/>
                            }
                          </svg>
                          <p class="text-[9px] font-mono text-ink-muted mt-0.5">
                            @for (v of h; track $index) { <span class="mr-1">{{ v.value_numeric }}</span> }
                          </p>
                        }
                      } @else {
                        <span class="text-[10px] text-ink-muted">…</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="flex-1 grid place-items-center text-[13px] text-ink-muted py-16">
            Select an order from the list to verify.
          </div>
        }
      </article>
    </div>
  }

  <!-- ══════════════════════════════════════════════════════════ -->
  <!-- TAB 4 · RADIOLOGY                                           -->
  <!-- ══════════════════════════════════════════════════════════ -->
  @if (tab() === 'radiology') {
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <article class="lg:col-span-5 bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <p class="text-[13px] font-semibold text-ink">📆 Machine slots</p>
            <p class="text-[11px] text-ink-muted mt-0.5">CT / MRI / X-ray / USG bookings</p>
          </div>
          @if (canManage()) {
            <button (click)="openSlotModal()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">
              + Book slot
            </button>
          }
        </header>
        <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-1.5">
          @for (m of machines; track m) {
            <button (click)="machine.set(machine() === m ? null : m); refreshSlots()" [class]="machineCls(m)">{{ m }}</button>
          }
          @if (machine()) {
            <button (click)="machine.set(null); refreshSlots()" class="h-7 px-2 rounded text-[11px] text-ink-muted hover:underline">clear</button>
          }
        </div>
        @if (slots().length === 0) {
          <div class="px-4 py-12 text-center text-[13px] text-ink-muted">No slots booked.</div>
        } @else {
          <ul class="divide-y divide-border max-h-[480px] overflow-y-auto">
            @for (s of slots(); track s.id) {
              <li class="px-4 py-3">
                <div class="flex items-start gap-3">
                  <div class="size-9 rounded-md grid place-items-center text-white font-bold text-[10px] shrink-0"
                       [style.background]="machineColor(s.machine)">{{ s.machine.replace('-','') }}</div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-semibold text-ink truncate">
                      {{ s.machine }} · <span class="text-ink-muted">{{ formatTime(s.start_at) }} – {{ formatTime(s.end_at) }}</span>
                    </p>
                    <p class="text-[11px] text-ink-muted truncate">
                      @if (slotPatient(s); as p) { {{ p }} } @else { (no patient linked) }
                    </p>
                    <p class="text-[10px] text-ink-muted">{{ shortDate(s.start_at) }}</p>
                  </div>
                  <span [class]="slotChip(s.status)">{{ s.status }}</span>
                </div>
              </li>
            }
          </ul>
        }
      </article>

      <article class="lg:col-span-7 bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
        <header class="px-5 py-3 border-b border-border">
          <p class="text-[13px] font-semibold text-ink">🩻 Imaging orders</p>
          <p class="text-[11px] text-ink-muted mt-0.5">Upload PACS link &amp; finalise the report</p>
        </header>
        @if (radiologyOrders().length === 0) {
          <div class="px-6 py-12 text-center text-[13px] text-ink-muted">No imaging orders open.</div>
        } @else {
          <div class="grid grid-cols-1 lg:grid-cols-2 divide-x divide-border flex-1">
            <ul class="divide-y divide-border overflow-y-auto max-h-[600px]">
              @for (o of radiologyOrders(); track o.id) {
                <li>
                  <button type="button" (click)="selectRad(o)"
                          class="w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors"
                          [class.bg-primary-50]="selectedRad()?.id === o.id">
                    <p class="text-[12px] font-semibold text-ink">{{ patientName(o) }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ o.patient?.uhid }}</p>
                    <div class="mt-1 flex flex-wrap gap-1">
                      @for (r of o.results; track r.id) {
                        <span class="text-[10px] font-mono px-1.5 h-[18px] rounded-full bg-surface-subtle text-ink-soft inline-flex items-center">{{ r.test.code }}</span>
                      }
                    </div>
                    <p class="text-[10px] mt-1.5"
                       [class.text-good-fg]="orderRad(o).pacs_url"
                       [class.text-warn-fg]="!orderRad(o).pacs_url">
                      {{ orderRad(o).pacs_url ? '✓ PACS uploaded' : '⏳ Awaiting PACS' }}
                      @if (orderRad(o).reported_at) { · ✍ Reported }
                    </p>
                  </button>
                </li>
              }
            </ul>

            <div class="p-5 overflow-y-auto max-h-[600px]">
              @if (selectedRad(); as o) {
                <div>
                  <p class="text-[14px] font-semibold text-ink">{{ patientName(o) }}</p>
                  <p class="text-[11px] font-mono text-ink-muted">{{ o.patient?.uhid }}</p>
                </div>

                <div class="mt-4 p-3 rounded-md border border-border bg-surface-muted/40">
                  <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">PACS / DICOM viewer link</p>
                  <div class="flex gap-2">
                    <input type="url" [(ngModel)]="pacsUrl" name="pacs" placeholder="https://orthanc.your-hospital.in/viewer/STUDY-12345"
                           class="flex-1 h-9 px-3 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                    <button (click)="savePacs(o)" [disabled]="busy() === o.id"
                            class="h-9 px-3 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                            style="background:#0E4F8C;">Save link</button>
                  </div>
                  @if (orderRad(o).pacs_url) {
                    <a [href]="orderRad(o).pacs_url!" target="_blank" rel="noopener"
                       class="mt-2 inline-flex items-center gap-1 text-[11px] text-primary-700 hover:underline">
                      🔗 Open viewer
                    </a>
                  }
                </div>

                <div class="mt-4">
                  <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Radiology report</p>
                  <div class="flex items-center gap-1 mb-2 flex-wrap">
                    <button (click)="execCmd('bold')"      class="h-7 px-2 rounded border border-border text-[11px] font-bold text-ink-soft hover:bg-surface-muted">B</button>
                    <button (click)="execCmd('italic')"    class="h-7 px-2 rounded border border-border text-[11px] italic text-ink-soft hover:bg-surface-muted">I</button>
                    <button (click)="execCmd('underline')" class="h-7 px-2 rounded border border-border text-[11px] underline text-ink-soft hover:bg-surface-muted">U</button>
                    <span class="text-border mx-1">|</span>
                    <button (click)="execHeading('h2')" class="h-7 px-2 rounded border border-border text-[11px] text-ink-soft hover:bg-surface-muted">H2</button>
                    <button (click)="execHeading('h3')" class="h-7 px-2 rounded border border-border text-[11px] text-ink-soft hover:bg-surface-muted">H3</button>
                    <button (click)="execCmd('insertUnorderedList')" class="h-7 px-2 rounded border border-border text-[11px] text-ink-soft hover:bg-surface-muted">• List</button>
                    <button (click)="execHeading('p')"  class="h-7 px-2 rounded border border-border text-[11px] text-ink-soft hover:bg-surface-muted">¶</button>
                  </div>
                  <div #editor contenteditable="true"
                       (input)="onReportInput(editor.innerHTML)"
                       [innerHTML]="initialReport()"
                       class="min-h-[260px] p-3 bg-surface-card border border-border rounded-md text-[13px] text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                  </div>
                  <div class="mt-3 flex items-center justify-end gap-2">
                    <button (click)="saveReport(o, false)" [disabled]="busy() === o.id"
                            class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-muted disabled:opacity-50">
                      Save draft
                    </button>
                    <button (click)="saveReport(o, true)" [disabled]="busy() === o.id"
                            class="h-9 px-3 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                            style="background:#117A3A;">
                      ✍ Sign &amp; finalise
                    </button>
                  </div>
                </div>
              } @else {
                <div class="grid place-items-center h-full text-[13px] text-ink-muted">Pick an imaging order to view / report.</div>
              }
            </div>
          </div>
        }
      </article>
    </div>
  }
</div>

<!-- ── Slot booking modal ───────────────────────────────────── -->
@if (slotModal()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeSlotModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">Book imaging slot</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Refuses overlap on the same machine.</p>

      <label class="block mt-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Machine *</span>
        <select [(ngModel)]="sb_machine" name="sb_m"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          @for (m of machines; track m) { <option [value]="m">{{ m }}</option> }
        </select>
      </label>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Start *</span>
          <input type="datetime-local" [(ngModel)]="sb_start" name="sb_s"
                 class="w-full h-10 px-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">End *</span>
          <input type="datetime-local" [(ngModel)]="sb_end" name="sb_e"
                 class="w-full h-10 px-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
      </div>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Imaging order (optional)</span>
        <select [(ngModel)]="sb_order" name="sb_o"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="">—</option>
          @for (o of radiologyOrders(); track o.id) { <option [value]="o.id">{{ patientName(o) }} · {{ o.patient?.uhid }}</option> }
        </select>
      </label>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
        <input type="text" [(ngModel)]="sb_notes" name="sb_n"
               class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>

      @if (slotError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ slotError() }}</p> }

      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeSlotModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmSlot()" [disabled]="!sb_machine || !sb_start || !sb_end || busy() !== null"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0E4F8C;">
          Book slot
        </button>
      </footer>
    </div>
  </div>
}
  `,
})
export class LabPage implements OnInit, OnDestroy {
  protected readonly store = inject(LabStore);
  private svc   = inject(LabService);
  private auth  = inject(AuthStore);
  private toast = inject(ToastService);
  private printSvc = inject(LabPrintService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);
  private reqPdf = inject(LabRequisitionPdfService);

  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly tabs        = LAB_TAB_OPTIONS;
  protected readonly tab         = signal<LabTab>('phlebotomy');
  protected readonly busy        = signal<string | null>(null);

  // Result entry buffer
  private readonly _entry = signal<Record<string, { numeric?: string; text?: string }>>({});
  protected entry(id: string, k: 'numeric' | 'text'): string { return this._entry()[id]?.[k] ?? ''; }
  protected setEntry(id: string, k: 'numeric' | 'text', v: string) {
    this._entry.update(m => ({ ...m, [id]: { ...m[id], [k]: v } }));
  }
  protected readonly canManage = computed(() => this.auth.has('lab.write') || this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin'));

  // ── Per-parameter (catalog-defined sub-rows) ────────────────────────
  /** Parameters per lab_test_id (cached lazily as processing rows render). */
  private readonly _paramsByTest = signal<Record<string, any[]>>({});
  /** Tests we've already attempted to load (prevents re-fetch + thrash). */
  private readonly _paramLoadAttempted = new Set<string>();
  /** Per-(result, parameter) entry buffer for parameter-aware tests. */
  private readonly _paramEntry = signal<Record<string, Record<string, { numeric?: string; text?: string }>>>({});

  protected paramsForResult(r: LabResultRow): any[] {
    return this.paramsFor((r as any).lab_test_id ?? '');
  }

  protected paramsFor(testId: string): any[] {
    if (!testId) return [];
    const cached = this._paramsByTest()[testId];
    if (cached !== undefined) return cached;
    // Mark as loading and fire request — handler updates the signal which
    // re-renders this row with the expanded sub-rows.
    if (!this._paramLoadAttempted.has(testId)) {
      this._paramLoadAttempted.add(testId);
      void this.svc.listTestParameters(testId).then(rows => {
        this._paramsByTest.update(m => ({ ...m, [testId]: rows ?? [] }));
      }).catch(() => {
        this._paramsByTest.update(m => ({ ...m, [testId]: [] }));
      });
    }
    return [];
  }

  protected paramEntry(resultId: string, paramId: string, k: 'numeric' | 'text'): string {
    return this._paramEntry()[resultId]?.[paramId]?.[k] ?? '';
  }
  protected setParamEntry(resultId: string, paramId: string, k: 'numeric' | 'text', v: string) {
    this._paramEntry.update(m => ({
      ...m,
      [resultId]: { ...m[resultId], [paramId]: { ...m[resultId]?.[paramId], [k]: v } },
    }));
  }

  /** Live out-of-range flag preview for a typed numeric value against a
   *  catalog parameter's low/high. Returns null when nothing meaningful. */
  protected paramFlagPreview(resultId: string, p: any): string | null {
    const raw = this._paramEntry()[resultId]?.[p.id]?.numeric;
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    if (isNaN(v)) return null;
    const lo = p.low_value != null ? Number(p.low_value) : null;
    const hi = p.high_value != null ? Number(p.high_value) : null;
    if (lo != null && v < lo) return 'low';
    if (hi != null && v > hi) return 'high';
    return 'normal';
  }

  // Processing tab state
  protected scanQ = '';
  protected readonly dept = signal<string | null>(null);
  protected readonly departments = ['haematology','biochemistry','microbiology','endocrinology','immunology','urinalysis'];

  // Verification
  protected readonly selectedVerify = signal<LabOrderRow | null>(null);
  protected readonly history = signal<Record<string, { entered_at: string | null; value_numeric: number | null; flag: string | null }[]>>({});

  // Live flag preview
  private readonly _previewFlag = signal<Record<string, string>>({});
  protected livePreviewFlag(r: LabResultRow): string | null { return this._previewFlag()[r.id] ?? null; }

  // Radiology
  protected readonly machines = ['CT','MRI','X-RAY','USG'];
  protected readonly machine = signal<string | null>(null);
  protected readonly slots   = signal<RadiologySlot[]>([]);
  protected readonly selectedRad = signal<LabOrderRow | null>(null);
  protected pacsUrl = '';
  protected reportHtml = '';

  // Slot modal
  protected readonly slotModal = signal(false);
  protected readonly slotError = signal<string | null>(null);
  protected sb_machine = 'CT'; protected sb_start = ''; protected sb_end = '';
  protected sb_order = ''; protected sb_notes = '';

  // ── Computed queues ──────────────────────────────────────────
  protected readonly phlebotomyQueue = computed<LabOrderRow[]>(() =>
    this.store.orders().filter(o =>
      ['paid','credit','waived'].includes(this.orderBilling(o))
      && o.sample_status === 'pending')
  );
  protected readonly processingQueue = computed<LabOrderRow[]>(() =>
    this.store.orders().filter(o => {
      if (!['collected','running'].includes(o.sample_status)) return false;
      if (o.results.every(r => r.test.category === 'imaging')) return false;
      const d = this.dept();
      if (!d) return true;
      return o.results.some(r => r.test.category === d);
    })
  );
  protected readonly verificationQueue = computed<LabOrderRow[]>(() =>
    this.store.orders().filter(o => o.totals.entered > 0
      && !o.results.every(r => r.test.category === 'imaging'))
  );
  protected readonly fullyVerified = (o: LabOrderRow) => o.totals.total > 0 && o.totals.verified === o.totals.total;
  protected readonly radiologyOrders = computed<LabOrderRow[]>(() =>
    this.store.orders().filter(o => o.results.some(r => r.test.category === 'imaging'))
  );

  protected tabCount(t: LabTab): number {
    if (t === 'phlebotomy')  return this.phlebotomyQueue().length;
    if (t === 'processing')  return this.processingQueue().length;
    if (t === 'verification')return this.verificationQueue().length;
    if (t === 'radiology')   return this.radiologyOrders().length;
    return 0;
  }
  protected tabBtnCls(t: LabTab): string {
    const active = this.tab() === t;
    const base = 'h-9 px-3 rounded-md text-[12px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }

  private unsubscribe: (() => void) | null = null;

  async ngOnInit() {
    await this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
    void this.refreshSlots();
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  protected async refreshSlots() {
    try { this.slots.set(await this.svc.listSlots(this.machine(), null) as any); } catch { /* non-fatal */ }
  }

  // ── Display helpers ─────────────────────────────────────────
  protected patientName(o: LabOrderRow): string {
    const p = o.patient;
    if (!p) return '—';
    return p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  }
  protected slotPatient(s: any): string | null {
    const p = s.patient;
    if (!p) return null;
    return `${p.full_name || (p.first_name + ' ' + p.last_name)} · ${p.uhid}`;
  }
  protected statusChipCls(s: keyof typeof STATUS_TONE) {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }
  protected priorityColor(p: string) { return p === 'stat' ? '#A4302B' : p === 'urgent' ? '#D97706' : '#0E4F8C'; }
  protected priorityChip(p: string): string {
    const tone = p === 'stat' ? 'bg-danger-bg text-danger-fg' : p === 'urgent' ? 'bg-warn-bg text-warn-fg' : 'bg-info-bg text-info-fg';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-bold uppercase ${tone}`;
  }
  protected orderBilling(o: LabOrderRow): string {
    return ((o as any).billing_status as string | undefined) ?? 'unpaid';
  }
  protected orderBarcode(o: LabOrderRow): string {
    return ((o as any).barcode_id as string | undefined) || (o.sample_id as string | undefined) || '—';
  }
  protected orderRad(o: LabOrderRow): { pacs_url?: string | null; reported_at?: string | null; report_html?: string | null } {
    return o as any;
  }
  protected billingChip(s: string): string {
    const tone = s === 'paid' || s === 'waived' ? 'bg-good-bg text-good-fg'
              : s === 'credit' ? 'bg-info-bg text-info-fg'
              : 'bg-danger-bg text-danger-fg';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-bold uppercase ${tone}`;
  }
  protected flagPillCls(flag: string): string {
    const tone = flag === 'critical_high' || flag === 'critical_low' ? 'bg-danger-bg text-danger-strong font-bold'
              : flag === 'high' || flag === 'low' ? 'bg-warn-bg text-warn-fg font-semibold'
              : flag === 'normal' ? 'bg-good-bg text-good-fg'
              : 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] uppercase tracking-[0.04em] ${tone}`;
  }
  protected numericInputCls(rid: string): string {
    const flag = this._previewFlag()[rid];
    const base = 'w-full h-8 px-2 text-[13px] font-mono bg-surface-card border rounded-md focus:outline-none focus:ring-[2px]';
    if (flag === 'critical_high' || flag === 'critical_low') return `${base} border-danger-fg ring-danger-fg/20 text-danger-strong font-bold`;
    if (flag === 'high' || flag === 'low')                   return `${base} border-warn-fg ring-warn-fg/20 text-warn-strong`;
    if (flag === 'normal')                                   return `${base} border-good-fg ring-good-fg/20`;
    return `${base} border-border focus:border-primary-600 focus:ring-primary-100`;
  }
  protected deptCls(d: string): string {
    const active = this.dept() === d;
    return `h-7 px-2.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
      active ? 'bg-primary-600 text-white' : 'bg-surface-card border border-border text-ink-soft hover:bg-surface-muted'
    }`;
  }
  protected machineCls(m: string): string {
    const active = this.machine() === m;
    return `h-7 px-2.5 rounded-md text-[11px] font-mono font-semibold transition-colors ${
      active ? 'bg-primary-600 text-white' : 'bg-surface-card border border-border text-ink-soft hover:bg-surface-muted'
    }`;
  }
  protected machineColor(m: string): string {
    return m === 'CT' ? '#A4302B' : m === 'MRI' ? '#0E4F8C' : m === 'X-RAY' ? '#0891B2' : '#117A3A';
  }
  protected slotChip(s: string): string {
    const tone = s === 'completed' ? 'bg-good-bg text-good-fg'
              : s === 'in_progress' ? 'bg-warn-bg text-warn-fg'
              : s === 'cancelled' || s === 'no_show' ? 'bg-danger-bg text-danger-fg'
              : 'bg-info-bg text-info-fg';
    return `inline-flex items-center h-[18px] px-1.5 rounded-full text-[10px] font-semibold capitalize ${tone}`;
  }
  /** Pull a useful message out of any thrown value (Error, PostgrestError, plain object, string). */
  protected errMsg(e: unknown, fallback = 'Try again'): string {
    if (!e) return fallback;
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (typeof e === 'object') {
      const o = e as Record<string, unknown>;
      return (o['message'] as string)
          || (o['error_description'] as string)
          || (o['details'] as string)
          || (o['hint'] as string)
          || fallback;
    }
    return fallback;
  }

  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
  }
  protected shortDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM'); } catch { return iso; }
  }
  protected relativeTime(iso: string | null): string {
    if (!iso) return '—';
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }

  // ── Phlebotomy actions ──────────────────────────────────────
  protected async collect(o: LabOrderRow) {
    this.busy.set(o.id);
    try {
      const res: any = await this.svc.collectSample(o.id, { tubeCount: 1 });
      const barcode = res?.sample_id ?? '—';
      this.toast.success('Sample collected', `Barcode ${barcode}`);
      this.printBarcode(barcode, this.patientName(o), o.patient?.uhid ?? '');
      await this.store.load();
    } catch (e) {
      this.toast.error('Could not collect', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  /** Build a printable HTML page with a CODE128-style barcode and trigger window.print(). */
  private printBarcode(barcode: string, patient: string, uhid: string) {
    const w = window.open('', '_blank', 'width=380,height=260,scrollbars=no');
    if (!w) { alert('Allow popups to print barcode labels.'); return; }
    const bars = this.barcodeStripes(barcode);
    w.document.write(`
<!DOCTYPE html><html><head><title>${barcode}</title>
<style>
  @page { size: 60mm 40mm; margin: 0; }
  body { margin:0; padding:6mm; font-family: 'IBM Plex Sans', Arial, sans-serif; }
  .code { font-family: monospace; font-size: 10pt; letter-spacing: 1px; text-align: center; margin-top:2mm; }
  .pat  { font-size: 11pt; font-weight: 700; }
  .uhid { font-size: 8pt; color: #666; font-family: monospace; }
  .bars { display:flex; gap:0; height:14mm; margin-top:1mm; align-items: stretch; }
  .b    { background:#000; }
  @media print { body { padding: 4mm; } }
</style></head><body>
  <div class="pat">${patient}</div>
  <div class="uhid">${uhid}</div>
  <div class="bars">${bars}</div>
  <div class="code">${barcode}</div>
  <script>setTimeout(() => window.print(), 200);</script>
</body></html>`);
    w.document.close();
  }

  private barcodeStripes(text: string): string {
    let html = '';
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      const w = ((c % 5) + 1);
      html += `<span class="b" style="width:${w * 0.45}mm; margin-right:0.4mm"></span>`;
    }
    return html;
  }

  // ── Processing actions ──────────────────────────────────────
  protected async onScan() {
    const code = this.scanQ.trim();
    if (!code) return;
    try {
      await this.svc.startProcessing(code);
      this.toast.success('Sample running', code);
      this.scanQ = '';
      await this.store.load();
      this.tab.set('processing');
    } catch (e) {
      this.toast.error('Scan failed', this.errMsg(e, 'Unknown barcode'));
    }
  }

  protected previewFlag(r: LabResultRow, raw: string) {
    const v = parseFloat(raw);
    if (isNaN(v)) { this._previewFlag.update(m => ({ ...m, [r.id]: '' })); return; }
    let flag = 'normal';
    if (r.test.critical_low  != null && v < r.test.critical_low)  flag = 'critical_low';
    else if (r.test.critical_high != null && v > r.test.critical_high) flag = 'critical_high';
    else if (r.test.ref_min  != null && v < r.test.ref_min)  flag = 'low';
    else if (r.test.ref_max  != null && v > r.test.ref_max)  flag = 'high';
    this._previewFlag.update(m => ({ ...m, [r.id]: flag }));
  }

  protected async saveAllResults(o: LabOrderRow) {
    this.busy.set(o.id);
    try {
      const flatBuf = this._entry();
      const paramBuf = this._paramEntry();
      let saved = 0;

      for (const r of o.results) {
        const testId = (r as any).lab_test_id as string;
        const params = this._paramsByTest()[testId] ?? [];
        const perResult = paramBuf[r.id] ?? {};

        // Parameter-aware path: collect non-empty rows and batch via RPC.
        if (params.length > 0) {
          const entries: Array<{ parameter_id: string; value_numeric?: number | null; value_text?: string | null; flag?: string | null }> = [];
          for (const p of params) {
            if (p.is_section_header) continue;
            const e = perResult[p.id];
            if (!e) continue;
            const num = e.numeric != null && e.numeric !== '' ? Number(e.numeric) : null;
            const txt = e.text ?? null;
            if (num == null && (!txt || txt.trim().length === 0)) continue;
            entries.push({
              parameter_id:  p.id,
              value_numeric: num,
              value_text:    txt,
              flag:          this.paramFlagPreview(r.id, p),
            });
          }
          if (entries.length > 0) {
            await this.svc.saveResultValues(r.id, entries);
            saved++;
          }
          continue;
        }

        // Legacy flat path (no parameter rows defined for this test).
        const e = flatBuf[r.id];
        if (!e) continue;
        const num = e.numeric != null && e.numeric !== '' ? Number(e.numeric) : null;
        const txt = e.text ?? null;
        if (num == null && (!txt || txt.trim().length === 0)) continue;
        await this.svc.enterResultRpc({ resultId: r.id, valueNumeric: num, valueText: txt });
        saved++;
      }

      if (saved === 0) { this.toast.error('Nothing entered'); return; }
      this.toast.success('Results saved', `${saved} test(s)`);
      this._entry.set({});
      this._paramEntry.set({});
      this._previewFlag.set({});
      await this.store.load();
    } catch (e) {
      this.toast.error('Could not save', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  // ── Verification actions ───────────────────────────────────
  protected async selectVerify(o: LabOrderRow) {
    this.selectedVerify.set(o);
    if (!o.patient) return;
    const map: Record<string, { entered_at: string | null; value_numeric: number | null; flag: string | null }[]> = {};
    for (const r of o.results) {
      try { map[r.id] = await this.svc.historicalResults(o.patient.id, (r as any).lab_test_id, 3); }
      catch { map[r.id] = []; }
    }
    this.history.set(map);
  }

  protected historyPoints(history: { value_numeric: number | null }[], r: LabResultRow): string {
    return this.historyPointsArray(history as any, r).map(p => `${p.x},${p.y}`).join(' ');
  }
  protected historyPointsArray(history: { value_numeric: number | null; flag: string | null }[], r: LabResultRow):
    { x: number; y: number; color: string }[] {
    const values = history.map(h => h.value_numeric).filter((v): v is number => v != null);
    if (values.length === 0) return [];
    const refMin = (r.test.ref_min as number | null);
    const refMax = (r.test.ref_max as number | null);
    const min = Math.min(...values, refMin ?? Math.min(...values));
    const max = Math.max(...values, refMax ?? Math.max(...values));
    const span = (max - min) || 1;
    return history.map((h, i) => {
      if (h.value_numeric == null) return null;
      return {
        x: history.length > 1 ? (i / (history.length - 1)) * 90 + 5 : 50,
        y: 28 - ((h.value_numeric - min) / span) * 24,
        color: h.flag === 'critical_low' || h.flag === 'critical_high' ? '#A4302B'
             : h.flag === 'low' || h.flag === 'high' ? '#D97706'
             : '#0E4F8C',
      };
    }).filter((p): p is { x: number; y: number; color: string } => p != null);
  }

  protected async verifyAll(o: LabOrderRow) {
    this.busy.set(o.id);
    try {
      const n = await this.svc.verifyOrder(o.id);
      this.toast.success('Approved & signed', `${n} result(s) verified · click "Print report" to deliver`);
      await this.store.load();
    } catch (e) {
      this.toast.error('Could not verify', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  protected async printReport(o: LabOrderRow) {
    this.busy.set('print:' + o.id);
    try {
      await this.printSvc.printLabReport(o.id);
    } catch (e) {
      this.toast.error('Could not print', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  // ── Radiology actions ──────────────────────────────────────
  protected selectRad(o: LabOrderRow) {
    this.selectedRad.set(o);
    this.pacsUrl = (o as any).pacs_url ?? '';
    this.reportHtml = (o as any).report_html ?? '';
  }
  protected initialReport(): string { return this.reportHtml; }
  protected onReportInput(html: string) { this.reportHtml = html; }
  protected execCmd(cmd: string)   { document.execCommand(cmd, false); }
  protected execHeading(tag: string) { document.execCommand('formatBlock', false, tag); }

  protected async savePacs(o: LabOrderRow) {
    if (!this.pacsUrl) { this.toast.error('Enter a viewer URL'); return; }
    this.busy.set(o.id);
    try {
      await this.svc.setPacsLink(o.id, this.pacsUrl);
      this.toast.success('PACS link saved');
      await this.store.load();
    } catch (e) {
      this.toast.error('Could not save', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  protected async saveReport(o: LabOrderRow, finalize: boolean) {
    this.busy.set(o.id);
    try {
      await this.svc.saveReport(o.id, this.reportHtml, finalize);
      this.toast.success(finalize ? 'Report finalised' : 'Draft saved');
      await this.store.load();
    } catch (e) {
      this.toast.error('Could not save', this.errMsg(e));
    } finally { this.busy.set(null); }
  }

  // ── Slot booking ───────────────────────────────────────────
  protected openSlotModal() {
    this.sb_machine = 'CT';
    this.sb_start = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    this.sb_end   = format(new Date(Date.now() + 30 * 60 * 1000), "yyyy-MM-dd'T'HH:mm");
    this.sb_order = ''; this.sb_notes = '';
    this.slotError.set(null);
    this.slotModal.set(true);
  }
  protected closeSlotModal() { this.slotModal.set(false); }
  protected async confirmSlot() {
    this.slotError.set(null);
    this.busy.set('slot');
    try {
      const order = this.radiologyOrders().find(o => o.id === this.sb_order);
      await this.svc.bookSlot({
        machine: this.sb_machine,
        startAt: new Date(this.sb_start).toISOString(),
        endAt:   new Date(this.sb_end).toISOString(),
        labOrderId: this.sb_order || null,
        patientId:  order?.patient?.id ?? null,
        notes:      this.sb_notes || null,
      });
      this.toast.success('Slot booked', this.sb_machine);
      this.slotModal.set(false);
      await this.refreshSlots();
    } catch (e) {
      this.slotError.set(this.errMsg(e, 'Could not book'));
    } finally { this.busy.set(null); }
  }

  protected printRequisition(o: LabOrderRow): void {
    this.reqPdf.generate({
      order_id:     o.id,
      order_number: (o as any).order_number ?? null,
      order_at:     (o as any).order_at ?? (o as any).created_at ?? new Date().toISOString(),
      priority:     (o as any).priority ?? 'Routine',
      patient: {
        uhid:        o.patient?.uhid ?? '',
        full_name:   o.patient?.full_name || `${o.patient?.first_name ?? ''} ${o.patient?.last_name ?? ''}`.trim(),
        age_years:   o.patient ? (ageFromDob(o.patient.date_of_birth) ?? '') : '',
        gender:      o.patient?.gender ?? null,
        mobile:      o.patient?.mobile ?? '',
        ward:        (o as any).ward_name ?? null,
        bed:         (o as any).bed_code ?? null,
      },
      doctor: {
        full_name: o.doctor?.full_name ?? 'Doctor',
      },
      clinical_notes: (o as any).clinical_notes ?? null,
      tests: o.results.map(r => ({
        code:     r.test.code,
        name:     r.test.name,
        category: r.test.category,
        specimen: (r.test as any).specimen ?? null,
        container:(r.test as any).container ?? null,
        fasting_required: (r.test as any).fasting_required ?? false,
      })),
      hospital: {
        name: 'Sree Diagnostics',
        branch_label: this.branch.activeBranchName(),
      },
    });
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const orders = this.store.orders();
    if (orders.length === 0) return;

    const exportRows: LabOrderExportRow[] = orders.map(o => ({
      order_number:  o.id.slice(0, 8),
      order_at:      (o as any).order_at ?? (o as any).created_at ?? '',
      uhid:          o.patient?.uhid ?? '',
      patient_name:  o.patient?.full_name || `${o.patient?.first_name ?? ''} ${o.patient?.last_name ?? ''}`.trim(),
      doctor:        o.doctor?.full_name ?? '',
      tests_total:   o.totals.total,
      pending:       o.totals.pending,
      entered:       o.totals.entered,
      verified:      o.totals.verified,
      critical:      o.totals.critical,
      priority:      (o as any).priority ?? 'routine',
      sample_status: o.sample_status,
    }));

    const columns: ExportColumn<LabOrderExportRow>[] = [
      { key: 'order_number',  header: 'Order #',     width: 14, align: 'left' },
      { key: 'order_at',      header: 'Ordered at',  width: 18, align: 'center', format: 'datetime' },
      { key: 'uhid',          header: 'UHID',        width: 12, align: 'left' },
      { key: 'patient_name',  header: 'Patient',     width: 26, align: 'left' },
      { key: 'doctor',        header: 'Doctor',      width: 22, align: 'left' },
      { key: 'tests_total',   header: 'Tests',       width: 7,  align: 'right', format: 'integer' },
      { key: 'pending',       header: 'Pending',     width: 8,  align: 'right', format: 'integer' },
      { key: 'entered',       header: 'Entered',     width: 8,  align: 'right', format: 'integer' },
      { key: 'verified',      header: 'Verified',    width: 8,  align: 'right', format: 'integer' },
      { key: 'critical',      header: 'Critical',    width: 8,  align: 'right', format: 'integer' },
      { key: 'priority',      header: 'Priority',    width: 10, align: 'center' },
      { key: 'sample_status', header: 'Sample',      width: 12, align: 'left' },
    ];

    const report: ExportableReport<LabOrderExportRow> = {
      filename: `LabOrders_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Lab Orders Register',
      subtitle: `${orders.length} order${orders.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      footer: 'Sree Diagnostics · Lab & Radiology Orders',
    };

    await this.exportSvc.export(fmt, report);
  }
}
