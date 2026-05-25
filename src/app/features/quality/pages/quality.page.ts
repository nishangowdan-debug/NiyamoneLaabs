import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { QualityService } from '../data/quality.service';
import {
  DEVICE_LABEL, INFECTION_TYPE_LABEL, OUTCOME_LABEL,
  type ActiveAdmissionLite, type AdmissionOutcome, type DeviceType, type DeviceUsageRow,
  type InfectionRow, type InfectionSource, type InfectionType, type QualityMetrics, type RiskGroup,
} from '../data/quality.types';

@Component({
  selector: 'app-quality-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent],
  template: `
<div class="flex flex-col gap-4">

  <!-- ── Header ──────────────────────────────────────────────── -->
  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Quality Metrics</h1>
      <p class="text-[13px] text-ink-muted mt-1">RAMR · HAI · 30-day readmission · {{ from() }} → {{ to() }}</p>
    </div>
    <div class="flex items-center gap-2">
      <input type="date" [value]="from()" (change)="from.set($any($event.target).value); reload()"
             class="h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <span class="text-[12px] text-ink-muted">to</span>
      <input type="date" [value]="to()"   (change)="to.set($any($event.target).value);   reload()"
             class="h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <button (click)="setRange(7)"  [class]="rangeBtnCls(7)">7d</button>
      <button (click)="setRange(30)" [class]="rangeBtnCls(30)">30d</button>
      <button (click)="setRange(90)" [class]="rangeBtnCls(90)">90d</button>
    </div>
  </header>

  @if (error()) { <app-alert tone="danger" title="Could not load metrics">{{ error() }}</app-alert> }

  <!-- ── 3 hero KPI cards ────────────────────────────────────── -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">

    <!-- 1. RAMR -->
    <article class="rounded-[12px] p-5 text-white shadow-card relative overflow-hidden"
             style="background:linear-gradient(135deg, #0C2A52, #0E4F8C);">
      <p class="text-[11px] uppercase tracking-[0.06em] text-white/75">Risk-Adjusted Mortality (RAMR)</p>
      <div class="flex items-end gap-3 mt-2">
        <p class="font-display text-[42px] font-medium leading-none">
          {{ loading() ? '—' : ramrLabel() }}
        </p>
        <p class="text-[12px] text-white/80 mb-1">{{ ramrInterpretation() }}</p>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase tracking-wide">Observed</p>
          <p class="font-mono mt-0.5">{{ metrics()?.observed_mortality_pct ?? 0 }}%</p>
          <p class="text-white/70 text-[10px]">{{ metrics()?.deaths ?? 0 }} / {{ metrics()?.admissions ?? 0 }} admits</p>
        </div>
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase tracking-wide">Expected</p>
          <p class="font-mono mt-0.5">{{ metrics()?.expected_mortality_pct ?? 0 }}%</p>
          <p class="text-white/70 text-[10px]">case-mix adjusted</p>
        </div>
      </div>
    </article>

    <!-- 2. HAI -->
    <article class="rounded-[12px] p-5 text-white shadow-card relative overflow-hidden"
             style="background:linear-gradient(135deg, #A4302B, #DC2626);">
      <p class="text-[11px] uppercase tracking-[0.06em] text-white/85">Hospital-Acquired Infection</p>
      <div class="flex items-end gap-3 mt-2">
        <p class="font-display text-[42px] font-medium leading-none">
          {{ loading() ? '—' : (metrics()?.hai_rate_per_1000 ?? 0) }}
        </p>
        <p class="text-[12px] text-white/85 mb-1">per 1000 patient-days</p>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase">CLABSI</p>
          <p class="font-mono mt-0.5">{{ metrics()?.clabsi?.rate_per_1000 ?? 0 }}</p>
          <p class="text-white/70 text-[10px]">{{ metrics()?.clabsi?.count ?? 0 }} / {{ metrics()?.clabsi?.central_line_days ?? 0 }}d</p>
        </div>
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase">CAUTI</p>
          <p class="font-mono mt-0.5">{{ metrics()?.cauti?.rate_per_1000 ?? 0 }}</p>
          <p class="text-white/70 text-[10px]">{{ metrics()?.cauti?.count ?? 0 }} / {{ metrics()?.cauti?.urinary_catheter_days ?? 0 }}d</p>
        </div>
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase">VAP</p>
          <p class="font-mono mt-0.5">{{ metrics()?.vap?.rate_per_1000 ?? 0 }}</p>
          <p class="text-white/70 text-[10px]">{{ metrics()?.vap?.count ?? 0 }} / {{ metrics()?.vap?.ventilator_days ?? 0 }}d</p>
        </div>
      </div>
    </article>

    <!-- 3. Readmission -->
    <article class="rounded-[12px] p-5 text-white shadow-card relative overflow-hidden"
             style="background:linear-gradient(135deg, #117A3A, #16A34A);">
      <p class="text-[11px] uppercase tracking-[0.06em] text-white/85">30-day Readmission Rate</p>
      <div class="flex items-end gap-3 mt-2">
        <p class="font-display text-[42px] font-medium leading-none">
          {{ loading() ? '—' : (metrics()?.readmission_rate_pct ?? 0) }}%
        </p>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase">Discharges</p>
          <p class="font-mono mt-0.5">{{ metrics()?.discharges_in_window ?? 0 }}</p>
        </div>
        <div class="bg-white/10 rounded p-2">
          <p class="text-white/70 text-[10px] uppercase">Re-admitted</p>
          <p class="font-mono mt-0.5">{{ metrics()?.readmitted_within_30d ?? 0 }}</p>
        </div>
      </div>
    </article>
  </div>

  <!-- ── Action bar ─────────────────────────────────────────── -->
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="text-[12px] text-ink-muted">
      Patient-days: <span class="font-mono text-ink-soft font-semibold">{{ metrics()?.patient_days ?? 0 }}</span>
      · Risk-mix:
      @if (metrics()?.risk_group_split; as r) {
        <span class="ml-1 text-good-fg">L {{ r.low }}</span> ·
        <span class="text-warn-fg">M {{ r.medium }}</span> ·
        <span class="text-danger-fg">H {{ r.high }}</span>
      }
    </div>
    @if (canManage()) {
      <div class="flex items-center gap-2 flex-wrap">
        <button (click)="openInfection()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#DC2626;">
          🦠 Log infection
        </button>
        <button (click)="openDevice()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">
          🔌 Track device
        </button>
        <button (click)="openOutcome()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0C2A52;">
          🏷 Mark outcome
        </button>
        <button (click)="openRisk()" class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-muted">
          📋 Score severity
        </button>
      </div>
    }
  </div>

  <!-- ── Drill-down: Top diagnoses + Active devices + Recent infections ── -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">

    <!-- Top diagnoses -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-3 border-b border-border">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Top diagnoses (by admissions)</p>
      </header>
      @if ((metrics()?.top_diagnoses ?? []).length === 0) {
        <div class="px-4 py-8 text-center text-[12px] text-ink-muted">No coded diagnoses in window.</div>
      } @else {
        <ul class="divide-y divide-border">
          @for (d of metrics()?.top_diagnoses ?? []; track d.icd10) {
            <li class="px-4 py-2.5 flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-mono font-semibold text-primary-700">{{ d.icd10 }}</p>
                <p class="text-[11px] text-ink-muted truncate">{{ icd10Label(d.icd10) }}</p>
              </div>
              <span class="text-[14px] font-display font-medium text-ink">{{ d.cnt }}</span>
            </li>
          }
        </ul>
      }
    </article>

    <!-- Recent infections -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-3 border-b border-border">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Recent infections</p>
      </header>
      @if (recentInfections().length === 0) {
        <div class="px-4 py-8 text-center text-[12px] text-ink-muted">No infections logged.</div>
      } @else {
        <ul class="divide-y divide-border">
          @for (i of recentInfections(); track i.id) {
            <li class="px-4 py-2.5">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[12px] font-semibold text-ink truncate">
                  {{ INFECTION_LABEL[i.infection_type] }}
                  @if (i.is_hai) { <span class="text-[9px] font-bold uppercase text-danger-fg ml-1">HAI</span> }
                </p>
                <span class="text-[10px] text-ink-muted">{{ relativeTime(i.infection_date) }}</span>
              </div>
              <p class="text-[11px] text-ink-muted truncate">{{ i.patient_name }} · {{ i.uhid }}</p>
              @if (i.organism || i.device_used) {
                <p class="text-[10px] text-ink-soft mt-0.5">
                  @if (i.organism) { 🧬 {{ i.organism }} }
                  @if (i.device_used) { · 🔌 {{ i.device_used.replace('_', ' ') }} }
                </p>
              }
            </li>
          }
        </ul>
      }
    </article>

    <!-- Active devices -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-3 border-b border-border flex items-center justify-between">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active devices ({{ activeDevices().length }})</p>
      </header>
      @if (activeDevices().length === 0) {
        <div class="px-4 py-8 text-center text-[12px] text-ink-muted">No devices in use.</div>
      } @else {
        <ul class="divide-y divide-border">
          @for (d of activeDevices(); track d.id) {
            <li class="px-4 py-2.5 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-[12px] font-semibold text-ink">{{ DEVICE_LABEL_MAP[d.device_type] }}</p>
                <p class="text-[11px] text-ink-muted truncate">{{ d.patient_name }} · {{ d.uhid }}@if (d.site) { · {{ d.site }} }</p>
                <p class="text-[10px] text-ink-muted">in use {{ relativeTime(d.start_at) }}</p>
              </div>
              @if (canManage()) {
                <button (click)="endDevice(d)" class="h-7 px-2 rounded text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-muted">End</button>
              }
            </li>
          }
        </ul>
      }
    </article>
  </div>

  <!-- ── ICD-10 risk reference ─────────────────────────────── -->
  <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-4 py-3 border-b border-border">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Mortality risk reference (used to compute expected mortality)</p>
    </header>
    <div class="overflow-x-auto">
      <table class="w-full text-[12px]">
        <thead class="bg-surface-muted">
          <tr>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold">ICD-10</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold">Diagnosis</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold">Risk group</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold">Expected mortality</th>
          </tr>
        </thead>
        <tbody>
          @for (r of icd10List(); track r.icd10_code) {
            <tr class="border-t border-border">
              <td class="px-4 py-1.5 font-mono font-semibold text-primary-700">{{ r.icd10_code }}</td>
              <td class="px-4 py-1.5 text-ink">{{ r.diagnosis_label }}</td>
              <td class="px-4 py-1.5"><span [class]="riskChipCls(r.risk_group)">{{ r.risk_group }}</span></td>
              <td class="px-4 py-1.5 text-right font-mono text-ink-soft">{{ r.expected_mortality_pct }}%</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </article>
</div>

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- LOG INFECTION                                                    -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'infection') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[560px] bg-surface-card rounded-[14px] shadow-pop max-h-[92vh] overflow-y-auto"
         (click)="$event.stopPropagation()">
      <header class="px-5 py-4 text-white" style="background:linear-gradient(120deg, #A4302B, #DC2626);">
        <h2 class="font-display text-[18px] font-medium">🦠 Log infection</h2>
        <p class="text-[12px] text-white/85 mt-0.5">Hospital-acquired flag is set automatically if &gt; 48h post-admission.</p>
      </header>
      <div class="p-5 grid grid-cols-12 gap-3">
        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Admission *</span>
          <select [(ngModel)]="iAdm" name="iadm" (ngModelChange)="onAdmPicked($event)"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">Select admission…</option>
            @for (a of admissions(); track a.id) {
              <option [value]="a.id">{{ a.patient_name }} · {{ a.uhid }} · admitted {{ shortDate(a.admitted_at) }}</option>
            }
          </select>
        </label>

        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Infection type *</span>
          <select [(ngModel)]="iType" name="itype"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="clabsi">CLABSI — Central-line bloodstream</option>
            <option value="cauti">CAUTI — Catheter-associated UTI</option>
            <option value="vap">VAP — Ventilator-associated pneumonia</option>
            <option value="ssi">SSI — Surgical site</option>
            <option value="bsi">BSI — Bloodstream</option>
            <option value="pneumonia">Pneumonia</option>
            <option value="uti">UTI (community-acquired or non-CAUTI)</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Source *</span>
          <select [(ngModel)]="iSource" name="isrc"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="ward">Ward</option><option value="icu">ICU</option>
            <option value="ot">OT</option><option value="er">ER</option>
            <option value="outside">Outside</option><option value="community">Community</option>
          </select>
        </label>
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Date *</span>
          <input type="datetime-local" [(ngModel)]="iDate" name="idate"
                 class="w-full h-10 px-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Device involved</span>
          <input type="text" [(ngModel)]="iDevice" name="idev" placeholder="e.g. central_line"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Organism</span>
          <input type="text" [(ngModel)]="iOrganism" name="iorg" placeholder="e.g. Klebsiella pneumoniae"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
          <input type="text" [(ngModel)]="iNotes" name="inotes"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        @if (formError()) { <p class="col-span-12 text-[12px] text-danger-fg">{{ formError() }}</p> }
      </div>
      <footer class="px-5 py-4 border-t border-border flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmInfection()" [disabled]="!iAdm || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#DC2626;">
          {{ busy() ? 'Saving…' : 'Log infection' }}
        </button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- TRACK DEVICE                                                     -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'device') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">🔌 Track device</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Records the start time. End it from the active devices list when removed.</p>

      <label class="block mt-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Admission *</span>
        <select [(ngModel)]="dAdm" name="dadm" (ngModelChange)="onAdmPicked($event)"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="">Select admission…</option>
          @for (a of admissions(); track a.id) {
            <option [value]="a.id">{{ a.patient_name }} · {{ a.uhid }}</option>
          }
        </select>
      </label>

      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Device *</span>
        <select [(ngModel)]="dType" name="dtype"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="central_line">Central line</option>
          <option value="urinary_catheter">Urinary catheter</option>
          <option value="ventilator">Ventilator</option>
          <option value="peripheral_line">Peripheral line</option>
          <option value="tracheostomy">Tracheostomy</option>
          <option value="arterial_line">Arterial line</option>
          <option value="feeding_tube">Feeding tube</option>
          <option value="drain">Drain</option>
        </select>
      </label>

      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Site / location</span>
        <input type="text" [(ngModel)]="dSite" name="dsite" placeholder="e.g. Right IJV, Foley, ETT"
               class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>

      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmDevice()" [disabled]="!dAdm || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0E4F8C;">
          {{ busy() ? 'Saving…' : 'Start tracking' }}
        </button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- MARK OUTCOME                                                     -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'outcome') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">🏷 Mark admission outcome</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Affects mortality and readmission calculations.</p>

      <label class="block mt-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Admission *</span>
        <select [(ngModel)]="oAdm" name="oadm"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="">Select admission…</option>
          @for (a of admissions(); track a.id) {
            <option [value]="a.id">{{ a.patient_name }} · {{ a.uhid }} · current: {{ a.outcome }}</option>
          }
        </select>
      </label>

      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Outcome *</span>
        <select [(ngModel)]="oOutcome" name="oo"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="alive">Alive</option>
          <option value="expired">Expired (death)</option>
          <option value="transferred">Transferred</option>
          <option value="dama">DAMA — discharged against medical advice</option>
        </select>
      </label>

      @if (oOutcome === 'expired') {
        <label class="block mt-3">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Date / time of death</span>
          <input type="datetime-local" [(ngModel)]="oDeath" name="od"
                 class="w-full h-10 px-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
      }

      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmOutcome()" [disabled]="!oAdm || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0C2A52;">
          {{ busy() ? 'Saving…' : 'Update outcome' }}
        </button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- SCORE SEVERITY                                                   -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'risk') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[560px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">📋 Score severity &amp; assign risk</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Drives the case-mix adjustment for RAMR.</p>

      <label class="block mt-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Admission *</span>
        <select [(ngModel)]="rAdm" name="radm"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="">Select admission…</option>
          @for (a of admissions(); track a.id) {
            <option [value]="a.id">{{ a.patient_name }} · {{ a.uhid }}</option>
          }
        </select>
      </label>

      <div class="grid grid-cols-12 gap-3 mt-3">
        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Primary diagnosis (ICD-10)</span>
          <select [(ngModel)]="rIcd" name="ricd"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">—</option>
            @for (c of icd10List(); track c.icd10_code) {
              <option [value]="c.icd10_code">{{ c.icd10_code }} · {{ c.diagnosis_label }}</option>
            }
          </select>
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Risk group *</span>
          <select [(ngModel)]="rGroup" name="rgrp"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>

        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Severity scale</span>
          <select [(ngModel)]="rScale" name="rsc"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">—</option>
            <option value="apache_ii">APACHE II (ICU)</option>
            <option value="sofa">SOFA</option>
            <option value="news2">NEWS2</option>
            <option value="gcs">GCS</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Score</span>
          <input type="number" [(ngModel)]="rScore" name="rscr" step="0.5"
                 class="w-full h-10 px-3 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Comorbidities (comma-separated)</span>
          <input type="text" [(ngModel)]="rComos" name="rco" placeholder="Type 2 DM, HTN, CKD…"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
      </div>

      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmRisk()" [disabled]="!rAdm || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0E4F8C;">
          {{ busy() ? 'Saving…' : 'Save risk profile' }}
        </button>
      </footer>
    </div>
  </div>
}
  `,
})
export class QualityPage implements OnInit {
  private svc   = inject(QualityService);
  private auth  = inject(AuthStore);
  private toast = inject(ToastService);

  protected readonly INFECTION_LABEL = INFECTION_TYPE_LABEL;
  protected readonly DEVICE_LABEL_MAP = DEVICE_LABEL;

  protected readonly from    = signal(this.dateMinusDays(30));
  protected readonly to      = signal(format(new Date(), 'yyyy-MM-dd'));
  protected readonly metrics = signal<QualityMetrics | null>(null);
  protected readonly recentInfections = signal<(InfectionRow & { patient_name?: string; uhid?: string })[]>([]);
  protected readonly activeDevices    = signal<(DeviceUsageRow & { patient_name?: string; uhid?: string })[]>([]);
  protected readonly admissions       = signal<ActiveAdmissionLite[]>([]);
  protected readonly icd10List        = signal<{ icd10_code: string; diagnosis_label: string; risk_group: RiskGroup; expected_mortality_pct: number }[]>([]);
  protected readonly loading   = signal(true);
  protected readonly error     = signal<string | null>(null);
  protected readonly busy      = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly modal     = signal<'infection'|'device'|'outcome'|'risk' | null>(null);

  protected readonly canManage = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') ||
    this.auth.has('staff.write') || this.auth.has('ehr.write')
  );

  // ── Form state ────────────────────────────────────────────
  protected iAdm = ''; protected iType: InfectionType = 'clabsi';
  protected iSource: InfectionSource = 'icu';
  protected iDate = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  protected iDevice = ''; protected iOrganism = ''; protected iNotes = '';

  protected dAdm = ''; protected dType: DeviceType = 'central_line';
  protected dSite = '';

  protected oAdm = ''; protected oOutcome: AdmissionOutcome = 'alive';
  protected oDeath = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  protected rAdm = ''; protected rIcd = ''; protected rGroup: RiskGroup = 'low';
  protected rScale: 'apache_ii'|'sofa'|'gcs'|'news2'|'other'|'' = '';
  protected rScore: number | null = null;
  protected rComos = '';

  // ── Computed ─────────────────────────────────────────────
  protected readonly ramrLabel = computed(() => {
    const r = this.metrics()?.ramr;
    if (r === null || r === undefined) return '—';
    return Number(r).toFixed(2);
  });
  protected readonly ramrInterpretation = computed(() => {
    const r = this.metrics()?.ramr;
    if (r == null) return 'no expected baseline';
    if (r < 0.9) return 'better than expected';
    if (r > 1.1) return 'worse than expected — investigate';
    return 'as expected';
  });

  async ngOnInit() {
    await Promise.all([this.reload(), this.refreshSidebars()]);
    this.svc.listIcd10Reference().then(v => this.icd10List.set(v)).catch(() => { /* non-fatal */ });
  }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.metrics.set(await this.svc.metrics(this.from(), this.to()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load metrics');
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshSidebars() {
    const [a, ri, ad] = await Promise.all([
      this.svc.listAdmissions().catch(() => []),
      this.svc.recentInfections().catch(() => []),
      this.svc.activeDevices().catch(() => []),
    ]);
    this.admissions.set(a);
    this.recentInfections.set(ri);
    this.activeDevices.set(ad);
  }

  // ── Display helpers ──────────────────────────────────────
  protected setRange(days: number) {
    this.from.set(this.dateMinusDays(days));
    this.to.set(format(new Date(), 'yyyy-MM-dd'));
    void this.reload();
  }
  protected rangeBtnCls(days: number): string {
    const d = (Date.parse(this.to()) - Date.parse(this.from())) / 86400000;
    const active = Math.round(d) === days;
    const base = 'h-9 px-3 rounded-md text-[12px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }
  private dateMinusDays(d: number): string {
    const x = new Date(); x.setDate(x.getDate() - d); return format(x, 'yyyy-MM-dd');
  }

  protected shortDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM HH:mm'); } catch { return iso; }
  }
  protected relativeTime(iso: string): string {
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }
  protected icd10Label(code: string): string {
    return this.icd10List().find(x => x.icd10_code === code)?.diagnosis_label ?? '';
  }
  protected riskChipCls(g: RiskGroup): string {
    const tone = g === 'high' ? 'bg-danger-bg text-danger-fg'
              : g === 'medium' ? 'bg-warn-bg text-warn-fg'
              : 'bg-good-bg text-good-fg';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-semibold uppercase ${tone}`;
  }

  // ── Modal lifecycle ─────────────────────────────────────
  protected closeModal() { this.modal.set(null); this.formError.set(null); }
  protected openInfection() { this.modal.set('infection'); }
  protected openDevice()    { this.modal.set('device'); }
  protected openOutcome()   { this.modal.set('outcome'); }
  protected openRisk()      { this.modal.set('risk'); }

  protected onAdmPicked(_id: string) { /* hook for future */ }

  // ── Actions ─────────────────────────────────────────────
  protected async confirmInfection() {
    const adm = this.admissions().find(a => a.id === this.iAdm);
    if (!adm) { this.formError.set('Pick an admission'); return; }
    this.busy.set(true);
    try {
      await this.svc.recordInfection({
        patientId:  adm.patient_id,
        admissionId: adm.id,
        type: this.iType,
        date: new Date(this.iDate).toISOString(),
        source: this.iSource,
        deviceUsed: this.iDevice || null,
        organism:  this.iOrganism || null,
        notes:     this.iNotes || null,
      });
      this.toast.success('Infection logged', INFECTION_TYPE_LABEL[this.iType]);
      this.closeModal();
      await Promise.all([this.reload(), this.refreshSidebars()]);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally { this.busy.set(false); }
  }

  protected async confirmDevice() {
    const adm = this.admissions().find(a => a.id === this.dAdm);
    if (!adm) { this.formError.set('Pick an admission'); return; }
    this.busy.set(true);
    try {
      await this.svc.startDevice({
        patientId: adm.patient_id, admissionId: adm.id,
        deviceType: this.dType, site: this.dSite || null,
      });
      this.toast.success('Device tracking started', DEVICE_LABEL[this.dType]);
      this.closeModal();
      await Promise.all([this.reload(), this.refreshSidebars()]);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally { this.busy.set(false); }
  }

  protected async endDevice(d: DeviceUsageRow) {
    if (!confirm(`End ${DEVICE_LABEL[d.device_type]} tracking?`)) return;
    try {
      await this.svc.endDevice(d.id);
      this.toast.success('Device ended');
      await Promise.all([this.reload(), this.refreshSidebars()]);
    } catch (e) {
      this.toast.error('Could not end', e instanceof Error ? e.message : 'Try again');
    }
  }

  protected async confirmOutcome() {
    if (!this.oAdm) { this.formError.set('Pick an admission'); return; }
    this.busy.set(true);
    try {
      await this.svc.markOutcome({
        admissionId: this.oAdm,
        outcome: this.oOutcome,
        dateOfDeath: this.oOutcome === 'expired' ? new Date(this.oDeath).toISOString() : null,
      });
      this.toast.success('Outcome updated', OUTCOME_LABEL[this.oOutcome].label);
      this.closeModal();
      await Promise.all([this.reload(), this.refreshSidebars()]);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally { this.busy.set(false); }
  }

  protected async confirmRisk() {
    if (!this.rAdm) { this.formError.set('Pick an admission'); return; }
    this.busy.set(true);
    try {
      await this.svc.updateAdmissionRisk({
        admissionId: this.rAdm,
        primaryDiagnosisIcd10: this.rIcd || null,
        riskGroup: this.rGroup,
        severityScale: (this.rScale || null) as any,
        severityScore: this.rScore,
        comorbidities: this.rComos.split(',').map(s => s.trim()).filter(Boolean),
      });
      this.toast.success('Risk profile saved');
      this.closeModal();
      await Promise.all([this.reload(), this.refreshSidebars()]);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally { this.busy.set(false); }
  }
}
