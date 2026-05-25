import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LabQcService } from '../data/lab-qc.service';
import {
  QC_LEVEL_LABELS, REJECT_REASON_LABELS,
  type Calibration, type CalibrationResult, type CalibrationType,
  type CriticalAlert, type LabInstrument, type QcLevel, type QcMaterial,
  type QcRun, type SampleRejection, type SampleRejectionReason,
} from '../data/lab-qc.types';
import { LabCompliancePage } from '../../lab/pages/lab-compliance.page';

type Tab = 'dashboard' | 'qc' | 'rejections' | 'calibrations' | 'critical' | 'audit';

@Component({
  selector: 'app-lab-qc-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LabCompliancePage],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Lab QC &amp; Compliance</h1>
    <p class="text-[12px] text-ink-soft">Levey-Jennings · Westgard rules · Sample rejections · Calibrations · Critical alerts</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- DASHBOARD -->
  @if (tab() === 'dashboard') {
    <div class="grid md:grid-cols-4 gap-3">
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Open Critical Alerts</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="openAlerts().length > 0">
          {{ openAlerts().length }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Rejections (7d)</p>
        <p class="text-3xl font-bold mt-1">{{ recentRejectionCount() }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">QC Materials Active</p>
        <p class="text-3xl font-bold mt-1">{{ materials().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Calibrations Overdue</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="overdueCalibrations() > 0">
          {{ overdueCalibrations() }}
        </p>
      </div>
    </div>
  }

  <!-- QC RUNS -->
  @if (tab() === 'qc') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Lab Test</span>
          <select [ngModel]="selectedTestId()" (ngModelChange)="onTestSelect($event)"
                  class="mt-1 w-72 rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick test —</option>
            @for (t of labTests(); track t.id) {
              <option [ngValue]="t.id">{{ t.name }} ({{ t.code }})</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">QC Material (lot · level)</span>
          <select [ngModel]="selectedMaterialId()" (ngModelChange)="onMaterialSelect($event)"
                  class="mt-1 w-64 rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick material —</option>
            @for (m of materialsForTest(); track m.id) {
              <option [ngValue]="m.id">
                {{ m.lot_no }} · {{ levelLabel(m.level) }} · μ {{ m.mean_target }}±{{ m.sd_target }}
              </option>
            }
          </select>
        </label>
        <button (click)="showNewMaterial.set(true)"
                class="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-surface-subtle">+ New material</button>
      </div>

      <!-- Levey-Jennings chart -->
      @if (selectedMaterial(); as mat) {
        <div class="rounded-md border border-border p-3 bg-surface-subtle">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[12px] font-semibold">Levey-Jennings · last {{ runs().length }} runs</h3>
            <p class="text-[11px] text-ink-soft">μ {{ mat.mean_target }} ± {{ mat.sd_target }}{{ mat.unit ? ' ' + mat.unit : '' }}</p>
          </div>
          <svg [attr.viewBox]="'0 0 800 240'" class="w-full h-[220px]">
            <!-- ±SD lines -->
            @for (l of sdLines; track l.k) {
              <line [attr.x1]="0" [attr.x2]="800"
                    [attr.y1]="yFor(mat.mean_target + l.k * mat.sd_target, mat)"
                    [attr.y2]="yFor(mat.mean_target + l.k * mat.sd_target, mat)"
                    [attr.stroke]="l.color" [attr.stroke-dasharray]="l.dash"
                    stroke-width="1" />
              <text [attr.x]="785" [attr.y]="yFor(mat.mean_target + l.k * mat.sd_target, mat) - 2"
                    [attr.fill]="l.color" font-size="10" text-anchor="end">
                {{ l.k > 0 ? '+' : '' }}{{ l.k }} SD
              </text>
            }
            <!-- Points -->
            @for (r of runsAsc(); track r.id; let i = $index) {
              <circle
                [attr.cx]="xFor(i, runsAsc().length)"
                [attr.cy]="yFor(r.value, mat)"
                r="3.5"
                [attr.fill]="r.status === 'rejected' ? '#b00020' : (r.status === 'warning' ? '#cc8800' : '#137333')"
              />
            }
            @if (runsAsc().length > 1) {
              <polyline
                [attr.points]="polyPoints(mat)"
                fill="none" stroke="#888" stroke-width="1" />
            }
          </svg>
        </div>

        <!-- Record run -->
        <div class="rounded-md border border-border p-3 grid md:grid-cols-4 gap-2">
          <!-- Expected range banner — visible reference so the tech can sanity-check before saving -->
          <div class="md:col-span-4 rounded-md bg-info-bg/50 border border-info-fg/30 px-3 py-2 text-[12px] flex items-center gap-3 flex-wrap">
            <span class="text-info-fg font-semibold">🎯 Expected:</span>
            <span class="font-mono">
              μ <strong>{{ mat.mean_target }}</strong> ± <strong>{{ mat.sd_target }}</strong>
              @if (mat.unit) { <span class="text-ink-soft">{{ mat.unit }}</span> }
            </span>
            <span class="text-ink-soft">·</span>
            <span class="text-good-fg">
              acceptable range
              <strong>{{ acceptableLow(mat) }}</strong> – <strong>{{ acceptableHigh(mat) }}</strong>
              <span class="text-ink-soft">(±2 SD)</span>
            </span>
            <span class="text-ink-soft">·</span>
            <span class="text-danger-fg">
              reject &lt; <strong>{{ rejectLow(mat) }}</strong> or &gt; <strong>{{ rejectHigh(mat) }}</strong>
            </span>
          </div>

          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Value *</span>
            <input type="number" step="0.001" [(ngModel)]="newRunValue"
                   [placeholder]="'e.g. ' + mat.mean_target"
                   [class]="valueInputCls(mat)" />
            @if (livePreview(mat); as p) {
              <p class="mt-1 text-[10.5px] flex items-center gap-1.5"
                 [class.text-good-fg]="p.tone === 'good'"
                 [class.text-warn-fg]="p.tone === 'warn'"
                 [class.text-danger-fg]="p.tone === 'bad'">
                <span class="font-mono font-semibold">{{ p.devLabel }} SD</span>
                <span>· {{ p.label }}</span>
              </p>
            } @else {
              <p class="mt-1 text-[10.5px] text-ink-soft">Enter the analyzer reading; deviation will preview live.</p>
            }
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Run by</span>
            <input [(ngModel)]="newRunRanBy"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block md:col-span-2">
            <span class="text-[10px] uppercase text-ink-soft">Notes</span>
            <input [(ngModel)]="newRunNotes"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          @if (lastRunResult(); as r) {
            <div class="md:col-span-4 rounded-md border p-2 text-[12px]"
                 [class.border-danger-fg]="r.status === 'rejected'"
                 [class.bg-danger-bg/40]="r.status === 'rejected'"
                 [class.border-warn-fg]="r.status === 'warning'"
                 [class.bg-warn-bg/40]="r.status === 'warning'"
                 [class.border-border]="r.status === 'accepted'"
                 [class.bg-surface-card]="r.status === 'accepted'">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <strong [class.text-danger-fg]="r.status === 'rejected'"
                          [class.text-warn-fg]="r.status === 'warning'"
                          [class.text-good-fg]="r.status === 'accepted'">
                    {{ r.status.toUpperCase() }}
                  </strong>
                  · deviation {{ r.deviation_sd.toFixed(2) }} SD
                  @if (r.violations.length) { · violations: <code>{{ r.violations.join(', ') }}</code> }
                </div>
                <button type="button" (click)="dismissLastRun()"
                        class="text-[11px] text-ink-soft hover:underline">Dismiss</button>
              </div>

              @if (r.status === 'warning' || r.status === 'rejected') {
                <!-- NABL pragmatic prompt — strongly encouraged, not blocking -->
                <div class="mt-2 pt-2 border-t border-border/60">
                  <label class="block">
                    <span class="text-[10px] uppercase tracking-[0.05em]"
                          [class.text-danger-fg]="r.status === 'rejected'"
                          [class.text-warn-fg]="r.status === 'warning'">
                      ⚠ Action taken
                      <span class="text-ink-soft normal-case">— required for NABL · what corrective step did you take? (e.g. recalibrated, swapped reagent, repeated run)</span>
                    </span>
                    <textarea rows="2" [(ngModel)]="actionDraft" placeholder="Describe the corrective action…"
                              class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"></textarea>
                  </label>
                  <div class="mt-2 flex justify-end gap-2">
                    <button type="button" (click)="dismissLastRun()"
                            class="px-3 py-1 text-[11px] rounded-md border border-border text-ink-soft hover:bg-surface-subtle">
                      Skip for now
                    </button>
                    <button type="button" (click)="saveLastRunAction()"
                            [disabled]="!actionDraft.trim() || savingAction()"
                            class="px-3 py-1 text-[11px] rounded-md text-white disabled:opacity-50"
                            [style.background]="r.status === 'rejected' ? '#A4302B' : '#D97706'">
                      {{ savingAction() ? 'Saving…' : '✓ Save action note' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }
          <div class="md:col-span-4 flex justify-end">
            <button (click)="recordRun()" [disabled]="newRunValue === null || runBusy()"
                    class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
              {{ runBusy() ? 'Recording…' : 'Record QC Run' }}
            </button>
          </div>
        </div>

        <!-- Recent runs -->
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">When</th><th class="px-2 py-1 text-right">Value</th>
                <th class="px-2 py-1 text-right">SD</th><th class="px-2 py-1">Status</th>
                <th class="px-2 py-1">Violations</th><th class="px-2 py-1">Run by</th></tr>
          </thead>
          <tbody>
            @for (r of runs(); track r.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ r.measured_at | date:'short' }}</td>
                <td class="px-2 py-1 text-right">{{ r.value }}</td>
                <td class="px-2 py-1 text-right">{{ r.deviation_sd.toFixed(2) }}</td>
                <td class="px-2 py-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="r.status==='accepted'"
                        [class.bg-warn-fg]="r.status==='warning'"
                        [class.bg-danger-fg]="r.status==='rejected'"
                        [class.text-white]="true">
                    {{ r.status }}
                  </span>
                </td>
                <td class="px-2 py-1">{{ r.violations.join(', ') }}</td>
                <td class="px-2 py-1">{{ r.ran_by_name }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  }

  <!-- REJECTIONS -->
  @if (tab() === 'rejections') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Reject Sample</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Lab Order ID (optional)</span>
          <input [(ngModel)]="rejOrderId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason *</span>
          <select [(ngModel)]="rejReason"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (r of reasonOptions; track r) {
              <option [value]="r">{{ reasonLabel(r) }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Specimen type</span>
          <input [(ngModel)]="rejSpecimen" placeholder="Serum / EDTA / Urine / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason details</span>
          <textarea rows="2" [(ngModel)]="rejDetails"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Rejected by</span>
          <input [(ngModel)]="rejBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <button (click)="rejectSample()" [disabled]="rejBusy()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ rejBusy() ? 'Saving…' : 'Log Rejection' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Recent Rejections</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">When</th><th class="px-2 py-1">Order</th>
                <th class="px-2 py-1">Reason</th><th class="px-2 py-1">Details</th>
                <th class="px-2 py-1">Notified</th><th class="px-2 py-1">Recollect</th></tr>
          </thead>
          <tbody>
            @for (r of rejections(); track r.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ r.rejected_at | date:'short' }}</td>
                <td class="px-2 py-1 font-mono text-[10px]">{{ r.lab_order_id ? r.lab_order_id.slice(0,8) : '—' }}</td>
                <td class="px-2 py-1">{{ reasonLabel(r.reason) }}</td>
                <td class="px-2 py-1 text-[11px]">{{ r.reason_details }}</td>
                <td class="px-2 py-1">
                  @if (r.notified_doctor_at) {
                    <span class="text-[11px] text-good-fg">✓ {{ r.notified_via }}</span>
                  } @else {
                    <button (click)="markNotified(r)" class="text-[11px] text-brand hover:underline">Mark notified</button>
                  }
                </td>
                <td class="px-2 py-1">
                  @if (r.recollection_at) {
                    <span class="text-[11px] text-good-fg">✓ done</span>
                  } @else if (r.recollection_required) {
                    <button (click)="markRecollected(r)" class="text-[11px] text-brand hover:underline">Mark done</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- CALIBRATIONS -->
  @if (tab() === 'calibrations') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Log Calibration</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Instrument *</span>
          <select [(ngModel)]="calInstrumentId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (i of instruments(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type *</span>
          <select [(ngModel)]="calType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="full">Full</option><option value="linearity">Linearity</option>
            <option value="precision">Precision</option><option value="accuracy">Accuracy</option>
            <option value="correlation">Correlation</option><option value="two_point">Two-point</option>
            <option value="single_point">Single-point</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Result *</span>
          <select [(ngModel)]="calResult"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="pass">Pass</option><option value="marginal">Marginal</option><option value="fail">Fail</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Next due</span>
          <input type="date" [(ngModel)]="calNextDue"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performed by</span>
          <input [(ngModel)]="calPerformer"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <button (click)="logCalibration()" [disabled]="calBusy() || !calInstrumentId"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ calBusy() ? 'Saving…' : 'Log Calibration' }}
        </button>

        <h3 class="text-sm font-semibold mt-4">+ New Instrument</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Code *</span>
          <input [(ngModel)]="instCode"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Name *</span>
          <input [(ngModel)]="instName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <button (click)="addInstrument()" [disabled]="!instCode.trim() || !instName.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md border border-border disabled:opacity-50">
          + Add
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Calibration History</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">When</th><th class="px-2 py-1">Instrument</th>
                <th class="px-2 py-1">Type</th><th class="px-2 py-1">Result</th>
                <th class="px-2 py-1">Next due</th><th class="px-2 py-1">By</th></tr>
          </thead>
          <tbody>
            @for (c of calibrations(); track c.id) {
              <tr class="border-t border-border" [class.bg-danger-fg]="isOverdue(c)" [class.bg-opacity-5]="true">
                <td class="px-2 py-1">{{ c.performed_at | date:'short' }}</td>
                <td class="px-2 py-1">{{ instrumentName(c.instrument_id) }}</td>
                <td class="px-2 py-1">{{ c.calibration_type }}</td>
                <td class="px-2 py-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="c.result==='pass'"
                        [class.bg-warn-fg]="c.result==='marginal'"
                        [class.bg-danger-fg]="c.result==='fail'"
                        [class.text-white]="true">{{ c.result }}</span>
                </td>
                <td class="px-2 py-1" [class.text-danger-fg]="isOverdue(c)">
                  {{ c.next_due_at ? (c.next_due_at | date:'mediumDate') : '—' }}
                </td>
                <td class="px-2 py-1">{{ c.performed_by_name }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- CRITICAL ALERTS -->
  @if (tab() === 'critical') {
    <div class="rounded-md border border-border bg-surface-card p-4">
      <h3 class="text-sm font-semibold mb-2">Critical Lab Value Alerts</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-2 py-1">Raised</th><th class="px-2 py-1">Test</th>
              <th class="px-2 py-1 text-right">Value</th><th class="px-2 py-1">Reference</th>
              <th class="px-2 py-1">Patient</th><th class="px-2 py-1">Status</th>
              <th class="px-2 py-1 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (a of alerts(); track a.id) {
            <tr class="border-t border-border" [class.bg-danger-fg]="a.status==='open'" [class.bg-opacity-5]="true">
              <td class="px-2 py-1">{{ a.raised_at | date:'short' }}</td>
              <td class="px-2 py-1">{{ a.test_name }}</td>
              <td class="px-2 py-1 text-right font-bold text-danger-fg">{{ a.value_numeric ?? a.value_text }}</td>
              <td class="px-2 py-1 text-[11px]">{{ a.reference_low }} – {{ a.reference_high }}</td>
              <td class="px-2 py-1 font-mono text-[10px]">{{ a.patient_id ? a.patient_id.slice(0,8) : '—' }}</td>
              <td class="px-2 py-1">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-danger-fg]="a.status==='open'"
                      [class.bg-warn-fg]="a.status==='acknowledged'"
                      [class.bg-good-fg]="a.status==='closed'"
                      [class.text-white]="true">{{ a.status }}</span>
                @if (a.notified_at) {
                  <p class="text-[10px] text-ink-soft mt-0.5">notified {{ a.notified_via }}</p>
                }
              </td>
              <td class="px-2 py-1 text-right">
                @if (a.status==='open') {
                  <button (click)="notifyAlertAction(a)" class="text-[11px] text-brand hover:underline">Notify</button>
                  <span class="mx-1">·</span>
                  <button (click)="ack(a)" class="text-[11px] text-warn-fg hover:underline">Ack</button>
                }
                @if (a.status==='acknowledged') {
                  <button (click)="closeAlertAction(a)" class="text-[11px] text-brand hover:underline">Close</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- New material modal -->
  @if (showNewMaterial()) {
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="showNewMaterial.set(false)">
      <div class="w-full max-w-md rounded-lg bg-surface-card border border-border shadow-2xl p-4 space-y-2"
           (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">New QC Material</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Lab Test *</span>
          <select [(ngModel)]="newMatTestId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (t of labTests(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Level *</span>
            <select [(ngModel)]="newMatLevel"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="level_1">Level 1</option>
              <option value="level_2">Level 2</option>
              <option value="level_3">Level 3</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Lot No *</span>
            <input [(ngModel)]="newMatLot"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Mean *</span>
            <input type="number" step="0.001" [(ngModel)]="newMatMean"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">SD *</span>
            <input type="number" step="0.001" [(ngModel)]="newMatSd"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Expiry</span>
            <input type="date" [(ngModel)]="newMatExpiry"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Unit</span>
            <input [(ngModel)]="newMatUnit"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button (click)="showNewMaterial.set(false)"
                  class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
          <button (click)="saveNewMaterial()"
                  [disabled]="!newMatTestId || !newMatLot || newMatMean === null || newMatSd === null"
                  class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  }

  <!-- AUDIT PACK — historical QC ledger, LJ archive, shift compliance, period summary -->
  @if (tab() === 'audit') {
    <app-lab-compliance-page [embedded]="true" />
  }
</section>
  `,
})
export class LabQcPage implements OnInit {
  private svc = inject(LabQcService);

  protected tab = signal<Tab>('dashboard');
  protected tabs = [
    { id: 'dashboard'    as Tab, label: 'Dashboard',        count: () => 0 },
    { id: 'qc'           as Tab, label: 'QC Runs',          count: () => this.materials().length },
    { id: 'rejections'   as Tab, label: 'Rejections',       count: () => this.rejections().length },
    { id: 'calibrations' as Tab, label: 'Calibrations',     count: () => this.calibrations().length },
    { id: 'critical'     as Tab, label: 'Critical Alerts',  count: () => this.openAlerts().length },
    { id: 'audit'        as Tab, label: '📊 Audit Pack',    count: () => 0 },
  ];

  // Common state
  protected instruments = signal<LabInstrument[]>([]);
  protected materials   = signal<QcMaterial[]>([]);
  protected labTests    = signal<{ id: string; code: string; name: string; unit: string | null; critical_low: number | null; critical_high: number | null }[]>([]);
  protected rejections  = signal<SampleRejection[]>([]);
  protected calibrations = signal<Calibration[]>([]);
  protected alerts      = signal<CriticalAlert[]>([]);

  // QC tab
  protected selectedTestId     = signal<string | null>(null);
  protected selectedMaterialId = signal<string | null>(null);
  protected runs               = signal<QcRun[]>([]);
  protected lastRunResult      = signal<{ id: string; status: string; deviation_sd: number; violations: string[] } | null>(null);
  protected actionDraft         = '';
  protected readonly savingAction = signal(false);
  protected newRunValue: number | null = null;
  protected newRunRanBy = '';
  protected newRunNotes = '';
  protected runBusy = signal(false);

  // New material modal
  protected showNewMaterial = signal(false);
  protected newMatTestId: string | null = null;
  protected newMatLevel: QcLevel = 'level_2';
  protected newMatLot = '';
  protected newMatMean: number | null = null;
  protected newMatSd: number | null = null;
  protected newMatExpiry = '';
  protected newMatUnit = '';

  // Rejection form
  protected rejOrderId = '';
  protected rejReason: SampleRejectionReason = 'hemolysed';
  protected rejSpecimen = '';
  protected rejDetails = '';
  protected rejBy = '';
  protected rejBusy = signal(false);
  protected reasonOptions: SampleRejectionReason[] = [
    'hemolysed','lipemic','icteric','clotted','insufficient_volume','wrong_tube',
    'mislabeled','unlabeled','leaking','expired_tube','wrong_patient','contaminated',
    'wrong_temperature','delayed_transport','other',
  ];

  // Calibration form
  protected calInstrumentId: string | null = null;
  protected calType: CalibrationType = 'full';
  protected calResult: CalibrationResult = 'pass';
  protected calNextDue = '';
  protected calPerformer = '';
  protected calBusy = signal(false);
  protected instCode = '';
  protected instName = '';

  // SD lines for chart
  protected sdLines = [
    { k: 3,  color: '#b00020', dash: '6 3' },
    { k: 2,  color: '#cc8800', dash: '4 4' },
    { k: 1,  color: '#999',    dash: '2 4' },
    { k: 0,  color: '#333',    dash: '0' },
    { k: -1, color: '#999',    dash: '2 4' },
    { k: -2, color: '#cc8800', dash: '4 4' },
    { k: -3, color: '#b00020', dash: '6 3' },
  ];

  // Computed
  protected materialsForTest = computed(() => {
    const tid = this.selectedTestId();
    return tid ? this.materials().filter(m => m.lab_test_id === tid) : [];
  });
  protected selectedMaterial = computed(() =>
    this.materials().find(m => m.id === this.selectedMaterialId()) ?? null,
  );
  protected runsAsc = computed(() => [...this.runs()].sort((a,b) => +new Date(a.measured_at) - +new Date(b.measured_at)));
  protected openAlerts = computed(() => this.alerts().filter(a => a.status === 'open'));
  protected recentRejectionCount = computed(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return this.rejections().filter(r => +new Date(r.rejected_at) >= cutoff).length;
  });
  protected overdueCalibrations = computed(() => {
    const now = Date.now();
    return this.calibrations().filter(c => c.next_due_at && +new Date(c.next_due_at) < now).length;
  });

  ngOnInit() { this.refreshAll(); }

  protected setTab(t: Tab) { this.tab.set(t); }
  protected levelLabel = (l: QcLevel) => QC_LEVEL_LABELS[l];
  protected reasonLabel = (r: SampleRejectionReason) => REJECT_REASON_LABELS[r];
  protected instrumentName = (id: string) => this.instruments().find(i => i.id === id)?.name ?? id.slice(0,8);
  protected isOverdue = (c: Calibration) => !!c.next_due_at && +new Date(c.next_due_at) < Date.now();

  // ── Live value-entry helpers (sanity-check before save) ──────────
  /** Round to a sensible precision based on SD magnitude. */
  private fmt(n: number, mat: QcMaterial): string {
    const sd = Math.abs(mat.sd_target) || 1;
    const decimals = sd >= 10 ? 0 : sd >= 1 ? 1 : sd >= 0.1 ? 2 : 3;
    return n.toFixed(decimals);
  }
  protected acceptableLow  = (m: QcMaterial) => this.fmt(m.mean_target - 2 * m.sd_target, m);
  protected acceptableHigh = (m: QcMaterial) => this.fmt(m.mean_target + 2 * m.sd_target, m);
  protected rejectLow      = (m: QcMaterial) => this.fmt(m.mean_target - 3 * m.sd_target, m);
  protected rejectHigh     = (m: QcMaterial) => this.fmt(m.mean_target + 3 * m.sd_target, m);

  /** Live preview chip for the value the tech is typing. */
  protected livePreview(mat: QcMaterial): { devLabel: string; label: string; tone: 'good'|'warn'|'bad' } | null {
    const v = this.newRunValue;
    if (v === null || v === undefined || isNaN(Number(v)) || !mat.sd_target) return null;
    const dev = (Number(v) - mat.mean_target) / mat.sd_target;
    const a = Math.abs(dev);
    const sign = dev >= 0 ? '+' : '−';
    const devLabel = `${sign}${a.toFixed(2)}`;
    if (a > 3)   return { devLabel, label: '✗ Outside ±3 SD — would be rejected (1-3s). Re-check the analyzer reading.', tone: 'bad' };
    if (a > 2)   return { devLabel, label: '⚠ Between ±2 and ±3 SD — warning (1-2s). Confirm before saving.', tone: 'warn' };
    return { devLabel, label: '✓ Within ±2 SD — would be accepted.', tone: 'good' };
  }
  protected valueInputCls(mat: QcMaterial): string {
    const base = 'mt-1 w-full rounded-md border bg-surface px-2 py-1.5 text-sm font-mono';
    const p = this.livePreview(mat);
    if (!p) return `${base} border-border`;
    if (p.tone === 'bad')  return `${base} border-danger-fg ring-1 ring-danger-fg/30 text-danger-fg`;
    if (p.tone === 'warn') return `${base} border-warn-fg ring-1 ring-warn-fg/30`;
    return `${base} border-good-fg ring-1 ring-good-fg/30`;
  }

  // Chart math
  protected yFor(value: number, mat: QcMaterial): number {
    const range = mat.sd_target * 4; // ±4 SD viewport
    const top = mat.mean_target + range;
    const bot = mat.mean_target - range;
    const ratio = (top - value) / (top - bot);
    return Math.max(5, Math.min(235, ratio * 240));
  }
  protected xFor(i: number, total: number): number {
    if (total <= 1) return 400;
    return 20 + (i / (total - 1)) * 760;
  }
  protected polyPoints(mat: QcMaterial): string {
    return this.runsAsc().map((r, i) => `${this.xFor(i, this.runsAsc().length)},${this.yFor(r.value, mat)}`).join(' ');
  }

  // Loaders
  private async refreshAll() {
    try {
      const [insts, mats, tests, rejs, cals, alerts] = await Promise.all([
        this.svc.listInstruments(), this.svc.listMaterials({ activeOnly: true }),
        this.svc.listLabTests(), this.svc.listRejections({}),
        this.svc.listCalibrations(), this.svc.listCriticalAlerts({}),
      ]);
      this.instruments.set(insts); this.materials.set(mats); this.labTests.set(tests);
      this.rejections.set(rejs); this.calibrations.set(cals); this.alerts.set(alerts);
    } catch (e: any) { alert(e?.message ?? 'Failed to load'); }
  }

  protected async onTestSelect(id: string | null) {
    this.selectedTestId.set(id);
    this.selectedMaterialId.set(null);
    this.runs.set([]);
  }
  protected async onMaterialSelect(id: string | null) {
    this.selectedMaterialId.set(id);
    if (id) {
      try { this.runs.set(await this.svc.listRuns(id)); }
      catch (e: any) { alert(e?.message ?? 'Failed'); }
    } else this.runs.set([]);
  }

  protected async recordRun() {
    const matId = this.selectedMaterialId(); if (!matId || this.newRunValue === null) return;
    this.runBusy.set(true);
    try {
      const r = await this.svc.recordRun({
        qcMaterialId: matId, value: this.newRunValue,
        ranByName: this.newRunRanBy.trim() || null,
        notes: this.newRunNotes.trim() || null,
      });
      this.lastRunResult.set({ id: r.id, status: r.status, deviation_sd: r.deviation_sd, violations: r.violations });
      this.actionDraft = '';
      this.newRunValue = null; this.newRunNotes = '';
      this.runs.set(await this.svc.listRuns(matId));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    finally { this.runBusy.set(false); }
  }

  /** NABL pragmatic-warn: encourage (don't force) an action note on warning/reject runs. */
  protected async saveLastRunAction() {
    const last = this.lastRunResult();
    if (!last || !this.actionDraft.trim()) return;
    this.savingAction.set(true);
    try {
      await this.svc.annotateRun(last.id, { action_taken: this.actionDraft.trim() });
      this.actionDraft = '';
      // Hide the prompt once an action is recorded
      this.lastRunResult.set(null);
      const matId = this.selectedMaterialId();
      if (matId) this.runs.set(await this.svc.listRuns(matId));
    } catch (e: any) { alert(e?.message ?? 'Failed to save action'); }
    finally { this.savingAction.set(false); }
  }
  protected dismissLastRun() { this.lastRunResult.set(null); this.actionDraft = ''; }

  protected async saveNewMaterial() {
    if (!this.newMatTestId || !this.newMatLot || this.newMatMean === null || this.newMatSd === null) return;
    try {
      await this.svc.createMaterial({
        lab_test_id: this.newMatTestId, level: this.newMatLevel,
        lot_no: this.newMatLot.trim(),
        mean_target: this.newMatMean, sd_target: this.newMatSd,
        expiry_date: this.newMatExpiry || null,
        unit: this.newMatUnit.trim() || null,
        is_active: true,
      });
      this.showNewMaterial.set(false);
      this.newMatLot = ''; this.newMatMean = null; this.newMatSd = null; this.newMatExpiry = ''; this.newMatUnit = '';
      this.materials.set(await this.svc.listMaterials({ activeOnly: true }));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // Rejections
  protected async rejectSample() {
    this.rejBusy.set(true);
    try {
      await this.svc.rejectSample({
        labOrderId: this.rejOrderId.trim() || null,
        reason: this.rejReason,
        specimenType: this.rejSpecimen.trim() || null,
        reasonDetails: this.rejDetails.trim() || null,
        rejectedByName: this.rejBy.trim() || null,
      });
      this.rejOrderId = ''; this.rejDetails = '';
      this.rejections.set(await this.svc.listRejections({}));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    finally { this.rejBusy.set(false); }
  }
  protected async markNotified(r: SampleRejection) {
    const via = prompt('Notified via? (phone / sms / in_person)');
    if (!via) return;
    try { await this.svc.markNotified(r.id, via); this.rejections.set(await this.svc.listRejections({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async markRecollected(r: SampleRejection) {
    try { await this.svc.markRecollected(r.id); this.rejections.set(await this.svc.listRejections({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // Calibrations
  protected async logCalibration() {
    if (!this.calInstrumentId) return;
    this.calBusy.set(true);
    try {
      await this.svc.logCalibration({
        instrumentId: this.calInstrumentId,
        calibrationType: this.calType, result: this.calResult,
        nextDueAt: this.calNextDue ? new Date(this.calNextDue).toISOString() : null,
        performedByName: this.calPerformer.trim() || null,
      });
      this.calNextDue = '';
      this.calibrations.set(await this.svc.listCalibrations());
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    finally { this.calBusy.set(false); }
  }
  protected async addInstrument() {
    if (!this.instCode.trim() || !this.instName.trim()) return;
    try {
      await this.svc.createInstrument({ code: this.instCode.trim(), name: this.instName.trim(), is_active: true });
      this.instCode = ''; this.instName = '';
      this.instruments.set(await this.svc.listInstruments());
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // Alerts
  protected async notifyAlertAction(a: CriticalAlert) {
    const via = prompt('Notified via? (phone / sms / in_person)');
    if (!via) return;
    const to = prompt('Notified to (name)?') ?? null;
    try { await this.svc.notifyAlert(a.id, via, to); this.alerts.set(await this.svc.listCriticalAlerts({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async ack(a: CriticalAlert) {
    try { await this.svc.ackAlert(a.id); this.alerts.set(await this.svc.listCriticalAlerts({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async closeAlertAction(a: CriticalAlert) {
    try { await this.svc.closeAlert(a.id); this.alerts.set(await this.svc.listCriticalAlerts({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
