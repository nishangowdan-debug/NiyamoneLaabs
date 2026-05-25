import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmployeeHealthService } from '../data/employee-health.service';
import {
  CHECK_TYPE_LABELS, EXPOSURE_STATUS_LABELS, EXPOSURE_TYPE_LABELS,
  FITNESS_LABELS, STANDARD_VACCINES,
  type EmployeeHealthCheck, type EmployeeImmunization, type ExposureStatus,
  type ExposureType, type FitnessStatus, type HealthCheckType,
  type ImmunizationStatus, type OccupationalExposure,
} from '../data/employee-health.types';

type Tab = 'dashboard' | 'immunizations' | 'exposures' | 'checks';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Employee Health &amp; Immunization</h1>
    <p class="text-[12px] text-ink-soft">NABH HIC 8 · vaccination tracker · needlestick + PEP · annual fitness checks</p>
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
        <p class="text-[10px] uppercase text-ink-soft">Total Active Staff</p>
        <p class="text-3xl font-bold mt-1">{{ staffList().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Open Exposures</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="openExposures().length > 0">
          {{ openExposures().length }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Vaccinations Overdue</p>
        <p class="text-3xl font-bold mt-1" [class.text-warn-fg]="overdueVaccinations() > 0">
          {{ overdueVaccinations() }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Checks Due</p>
        <p class="text-3xl font-bold mt-1">{{ checksDue() }}</p>
      </div>
    </div>

    @if (openExposures().length > 0) {
      <div class="rounded-md border border-danger-fg bg-danger-fg/5 p-4">
        <h3 class="text-sm font-semibold mb-2 text-danger-fg">Active Occupational Exposures</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">No</th><th class="px-2 py-1">Staff</th>
                <th class="px-2 py-1">Type</th><th class="px-2 py-1">When</th>
                <th class="px-2 py-1">Status</th>
                <th class="px-2 py-1">PEP</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (e of openExposures(); track e.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ e.exposure_no }}</td>
                <td class="px-2 py-1">{{ staffName(e.staff_id) }}</td>
                <td class="px-2 py-1 text-[11px]">{{ exposureTypeLabel(e.exposure_type) }}</td>
                <td class="px-2 py-1 text-[11px]">{{ e.exposure_at | date:'short' }}</td>
                <td class="px-2 py-1 text-[11px]">{{ exposureStatusLabel(e.status) }}</td>
                <td class="px-2 py-1 text-[11px]">
                  {{ e.pep_offered ? (e.pep_completed ? '✓ done' : 'in progress') : '—' }}
                </td>
                <td class="px-2 py-1 text-right">
                  <button (click)="openExposure(e)" class="text-[11px] text-brand hover:underline">Open</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  }

  <!-- IMMUNIZATIONS -->
  @if (tab() === 'immunizations') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Record Vaccination</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Staff *</span>
          <select [(ngModel)]="iStaffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of staffList(); track s.id) { <option [ngValue]="s.id">{{ s.full_name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Vaccine</span>
          <select [(ngModel)]="iVaccineCode" (ngModelChange)="onVaccineSelect($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">Custom…</option>
            @for (v of standardVaccines; track v.code) {
              <option [value]="v.code">{{ v.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Vaccine Name *</span>
          <input [(ngModel)]="iVaccineName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Dose #</span>
            <input type="number" [(ngModel)]="iDose"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Total doses</span>
            <input type="number" [(ngModel)]="iTotalDoses"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Manufacturer</span>
            <input [(ngModel)]="iManufacturer"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Batch</span>
            <input [(ngModel)]="iBatch"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Given at</span>
            <input type="datetime-local" [(ngModel)]="iGivenAt"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Next dose due</span>
            <input type="date" [(ngModel)]="iNextDue"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Status</span>
          <select [(ngModel)]="iStatus"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="given">Given</option>
            <option value="refused">Refused</option>
            <option value="contraindicated">Contraindicated</option>
            <option value="deferred">Deferred</option>
          </select>
        </label>
        @if (iStatus === 'refused') {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Refusal reason *</span>
            <input [(ngModel)]="iRefusalReason"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        }
        @if (iError()) { <p class="text-[12px] text-danger-fg">{{ iError() }}</p> }
        <button (click)="saveImmunization()"
                [disabled]="iBusy() || !iStaffId || !iVaccineName.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ iBusy() ? 'Saving…' : 'Record' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Immunization History</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Staff</th><th class="px-3 py-2">Vaccine</th>
                <th class="px-3 py-2">Dose</th><th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Given</th><th class="px-3 py-2">Next Due</th>
                <th class="px-3 py-2">Batch</th></tr>
          </thead>
          <tbody>
            @for (i of immunizations(); track i.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="isImmDue(i)" [class.bg-opacity-5]="true">
                <td class="px-3 py-2 text-[11px]">{{ staffName(i.staff_id) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ i.vaccine_name }}</td>
                <td class="px-3 py-2 text-[11px]">{{ i.dose_number }} / {{ i.total_doses }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="i.status === 'given'"
                        [class.bg-warn-fg]="i.status === 'refused' || i.status === 'deferred'"
                        [class.bg-danger-fg]="i.status === 'contraindicated'"
                        [class.text-white]="i.status !== 'partial'">{{ i.status }}</span>
                </td>
                <td class="px-3 py-2 text-[11px]">{{ i.given_at ? (i.given_at | date:'mediumDate') : '—' }}</td>
                <td class="px-3 py-2 text-[11px]"
                    [class.text-danger-fg]="isImmDue(i)">
                  {{ i.next_dose_due_at || '—' }}
                </td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ i.batch_no || '—' }}</td>
              </tr>
            }
            @if (immunizations().length === 0) {
              <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No vaccinations recorded.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- EXPOSURES -->
  @if (tab() === 'exposures') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Report Exposure</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Staff *</span>
          <select [(ngModel)]="eStaffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of staffList(); track s.id) { <option [ngValue]="s.id">{{ s.full_name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type *</span>
          <select [(ngModel)]="eType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of exposureTypeOptions; track t) { <option [value]="t">{{ exposureTypeLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">When</span>
          <input type="datetime-local" [(ngModel)]="eAt"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Location</span>
          <input [(ngModel)]="eLocation" placeholder="OT-1 / ICU / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Body part affected</span>
          <input [(ngModel)]="eBodyPart"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Source patient ID</span>
          <input [(ngModel)]="eSourceId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Description *</span>
          <textarea rows="2" [(ngModel)]="eDescription"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Immediate action taken</span>
          <textarea rows="2" [(ngModel)]="eAction"
                    placeholder="Wound washed with soap and water; PEP started..."
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        @if (eError()) { <p class="text-[12px] text-danger-fg">{{ eError() }}</p> }
        <button (click)="reportExposure()"
                [disabled]="eBusy() || !eStaffId || !eDescription.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-danger-fg text-white disabled:opacity-50">
          {{ eBusy() ? 'Saving…' : 'Report Exposure' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">All Exposures</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">No</th><th class="px-3 py-2">When</th>
                <th class="px-3 py-2">Staff</th><th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Status</th><th class="px-3 py-2">PEP</th>
                <th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (x of exposures(); track x.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="x.seroconversion_detected"
                  [class.bg-warn-fg]="x.status === 'reported'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ x.exposure_no }}</td>
                <td class="px-3 py-2 text-[11px]">{{ x.exposure_at | date:'short' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ staffName(x.staff_id) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ exposureTypeLabel(x.exposure_type) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ exposureStatusLabel(x.status) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ x.pep_offered ? (x.pep_completed ? '✓' : '⏳') : '—' }}</td>
                <td class="px-3 py-2 text-right">
                  <button (click)="openExposure(x)" class="text-[11px] text-brand hover:underline">Open</button>
                </td>
              </tr>
            }
            @if (exposures().length === 0) {
              <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No exposures.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- HEALTH CHECKS -->
  @if (tab() === 'checks') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-semibold">+ Record Health Check</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Staff *</span>
          <select [(ngModel)]="hStaffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of staffList(); track s.id) { <option [ngValue]="s.id">{{ s.full_name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type *</span>
          <select [(ngModel)]="hType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="pre_employment">Pre-employment</option>
            <option value="annual">Annual</option>
            <option value="periodic">Periodic</option>
            <option value="post_exposure">Post-exposure</option>
            <option value="return_to_work">Return to work</option>
            <option value="fitness_for_duty">Fitness for duty</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performing doctor *</span>
          <input [(ngModel)]="hDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Height (cm)</span>
            <input type="number" [(ngModel)]="hHeight"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Weight (kg)</span>
            <input type="number" step="0.1" [(ngModel)]="hWeight"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">BP</span>
            <input [(ngModel)]="hBp" placeholder="120/80"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Pulse</span>
            <input type="number" [(ngModel)]="hPulse"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">HBsAg</span>
            <input [(ngModel)]="hHbsag"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">HCV</span>
            <input [(ngModel)]="hHcv"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">HIV</span>
            <input [(ngModel)]="hHiv"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">TB Screening</span>
            <input [(ngModel)]="hTb"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Fitness *</span>
          <select [(ngModel)]="hFitness"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="fit">Fit</option>
            <option value="fit_with_restrictions">Fit (restrictions)</option>
            <option value="unfit">Unfit</option>
            <option value="pending_evaluation">Pending</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Restrictions</span>
          <textarea rows="2" [(ngModel)]="hRestrictions"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Next due</span>
          <input type="date" [(ngModel)]="hNextDue"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (hError()) { <p class="text-[12px] text-danger-fg">{{ hError() }}</p> }
        <button (click)="saveHealthCheck()"
                [disabled]="hBusy() || !hStaffId || !hDoctor.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ hBusy() ? 'Saving…' : 'Record Check' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Health Check History</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Date</th><th class="px-3 py-2">Staff</th>
                <th class="px-3 py-2">Type</th><th class="px-3 py-2">Doctor</th>
                <th class="px-3 py-2">BMI</th><th class="px-3 py-2">BP</th>
                <th class="px-3 py-2">Fitness</th><th class="px-3 py-2">Next Due</th></tr>
          </thead>
          <tbody>
            @for (c of checks(); track c.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="c.fitness_status === 'unfit'"
                  [class.bg-warn-fg]="c.fitness_status === 'fit_with_restrictions'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 text-[11px]">{{ c.performed_at }}</td>
                <td class="px-3 py-2 text-[11px]">{{ staffName(c.staff_id) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ checkTypeLabel(c.check_type) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.performing_doctor || '—' }}</td>
                <td class="px-3 py-2">{{ c.bmi ?? '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.bp || '—' }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="c.fitness_status === 'fit'"
                        [class.bg-warn-fg]="c.fitness_status === 'fit_with_restrictions'"
                        [class.bg-danger-fg]="c.fitness_status === 'unfit'"
                        [class.text-white]="true">
                    {{ fitnessLabel(c.fitness_status) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-[11px]"
                    [class.text-danger-fg]="isOverdue(c.next_due_date)">
                  {{ c.next_due_date || '—' }}
                </td>
              </tr>
            }
            @if (checks().length === 0) {
              <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No checks recorded.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>
  `,
})
export class EmployeeHealthPage implements OnInit {
  private svc = inject(EmployeeHealthService);

  protected tab = signal<Tab>('dashboard');
  protected staffList = signal<{ id: string; full_name: string; role_slug: string | null }[]>([]);
  protected immunizations = signal<EmployeeImmunization[]>([]);
  protected exposures = signal<OccupationalExposure[]>([]);
  protected checks = signal<EmployeeHealthCheck[]>([]);

  // Immunization form
  protected iStaffId: string | null = null;
  protected iVaccineCode: string | null = null;
  protected iVaccineName = '';
  protected iDose: number | null = null;
  protected iTotalDoses: number | null = null;
  protected iManufacturer = '';
  protected iBatch = '';
  protected iGivenAt = '';
  protected iNextDue = '';
  protected iStatus: ImmunizationStatus = 'given';
  protected iRefusalReason = '';
  protected iBusy = signal(false);
  protected iError = signal<string | null>(null);

  // Exposure form
  protected eStaffId: string | null = null;
  protected eType: ExposureType = 'needlestick';
  protected eAt = '';
  protected eLocation = '';
  protected eBodyPart = '';
  protected eSourceId = '';
  protected eDescription = '';
  protected eAction = '';
  protected eBusy = signal(false);
  protected eError = signal<string | null>(null);

  // Health check form
  protected hStaffId: string | null = null;
  protected hType: HealthCheckType = 'annual';
  protected hDoctor = '';
  protected hHeight: number | null = null;
  protected hWeight: number | null = null;
  protected hBp = '';
  protected hPulse: number | null = null;
  protected hHbsag = '';
  protected hHcv = '';
  protected hHiv = '';
  protected hTb = '';
  protected hFitness: FitnessStatus = 'fit';
  protected hRestrictions = '';
  protected hNextDue = '';
  protected hBusy = signal(false);
  protected hError = signal<string | null>(null);

  protected exposureTypeOptions: ExposureType[] = ['needlestick','sharps','splash_eyes','splash_mucous','splash_skin','contact_blood','contact_body_fluid','tb_exposure','covid_exposure','other'];
  protected standardVaccines = STANDARD_VACCINES;

  protected exposureTypeLabel = (t: ExposureType) => EXPOSURE_TYPE_LABELS[t];
  protected exposureStatusLabel = (s: ExposureStatus) => EXPOSURE_STATUS_LABELS[s];
  protected fitnessLabel = (f: FitnessStatus) => FITNESS_LABELS[f];
  protected checkTypeLabel = (t: HealthCheckType) => CHECK_TYPE_LABELS[t];
  protected staffName = (id: string) => this.staffList().find(s => s.id === id)?.full_name ?? id.slice(0,8);

  protected openExposures = computed(() =>
    this.exposures().filter(e => e.status !== 'closed' && e.status !== 'transferred'),
  );

  protected isImmDue(i: EmployeeImmunization): boolean {
    return !!i.next_dose_due_at && new Date(i.next_dose_due_at) < new Date()
      && i.status !== 'given' && i.status !== 'refused' && i.status !== 'contraindicated';
  }
  protected isOverdue(iso: string | null): boolean { return !!iso && new Date(iso) < new Date(); }

  protected overdueVaccinations = computed(() =>
    this.immunizations().filter(i => this.isImmDue(i)).length,
  );
  protected checksDue = computed(() =>
    this.checks().filter(c => this.isOverdue(c.next_due_date)).length,
  );

  protected tabs = [
    { id: 'dashboard'      as Tab, label: 'Dashboard',        count: () => this.openExposures().length },
    { id: 'immunizations'  as Tab, label: 'Immunizations',    count: () => this.immunizations().length },
    { id: 'exposures'      as Tab, label: 'Exposures (PEP)',  count: () => this.exposures().length },
    { id: 'checks'         as Tab, label: 'Health Checks',    count: () => this.checks().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [staff, imm, exp, chk] = await Promise.all([
        this.svc.listStaff(), this.svc.listImmunizations(),
        this.svc.listExposures({}), this.svc.listChecks(),
      ]);
      this.staffList.set(staff);
      this.immunizations.set(imm);
      this.exposures.set(exp);
      this.checks.set(chk);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onVaccineSelect(code: string | null) {
    if (!code) return;
    const v = STANDARD_VACCINES.find(x => x.code === code);
    if (v) {
      this.iVaccineName = v.name;
      this.iTotalDoses = v.total;
      // Auto-deduce dose from name (e.g. HEP_B_2 → dose 2)
      const m = code.match(/_(\d)$/);
      if (m) this.iDose = parseInt(m[1]);
    }
  }

  protected async saveImmunization() {
    if (!this.iStaffId || !this.iVaccineName.trim()) return;
    this.iBusy.set(true); this.iError.set(null);
    try {
      await this.svc.recordImmunization({
        staffId: this.iStaffId,
        vaccineName: this.iVaccineName.trim(),
        vaccineCode: this.iVaccineCode,
        status: this.iStatus,
        doseNumber: this.iDose,
        totalDoses: this.iTotalDoses,
        manufacturer: this.iManufacturer.trim() || null,
        batchNo: this.iBatch.trim() || null,
        givenAt: this.iGivenAt ? new Date(this.iGivenAt).toISOString() : null,
        nextDoseDueAt: this.iNextDue || null,
        refusalReason: this.iStatus === 'refused' ? this.iRefusalReason.trim() : null,
      });
      this.iVaccineName = ''; this.iVaccineCode = null;
      this.iDose = null; this.iTotalDoses = null;
      this.iManufacturer = ''; this.iBatch = '';
      this.iGivenAt = ''; this.iNextDue = '';
      this.iRefusalReason = '';
      await this.refresh();
    } catch (e: any) { this.iError.set(e?.message ?? 'Failed'); }
    finally { this.iBusy.set(false); }
  }

  protected async reportExposure() {
    if (!this.eStaffId || !this.eDescription.trim()) return;
    this.eBusy.set(true); this.eError.set(null);
    try {
      await this.svc.reportExposure({
        staffId: this.eStaffId,
        exposureType: this.eType,
        description: this.eDescription.trim(),
        exposureAt: this.eAt ? new Date(this.eAt).toISOString() : null,
        location: this.eLocation.trim() || null,
        bodyPart: this.eBodyPart.trim() || null,
        sourcePatientId: this.eSourceId.trim() || null,
        sourceKnown: !!this.eSourceId.trim(),
        immediateAction: this.eAction.trim() || null,
      });
      this.eDescription = ''; this.eLocation = ''; this.eBodyPart = '';
      this.eSourceId = ''; this.eAction = ''; this.eAt = '';
      await this.refresh();
    } catch (e: any) { this.eError.set(e?.message ?? 'Failed'); }
    finally { this.eBusy.set(false); }
  }

  protected async openExposure(x: OccupationalExposure) {
    const status = prompt('Update status (assessment_done / prophylaxis_started / follow_up / closed)?', x.status);
    if (!status) return;
    const pep = confirm('PEP offered? OK = yes');
    const patch: Record<string, unknown> = { status, pep_offered: pep };
    if (status === 'closed') {
      const closure = prompt('Closure notes?') ?? '';
      patch['closure_notes'] = closure;
    }
    try { await this.svc.updateExposure(x.id, patch); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async saveHealthCheck() {
    if (!this.hStaffId || !this.hDoctor.trim()) return;
    this.hBusy.set(true); this.hError.set(null);
    try {
      await this.svc.recordHealthCheck({
        staffId: this.hStaffId,
        checkType: this.hType,
        performingDoctor: this.hDoctor.trim(),
        fitnessStatus: this.hFitness,
        heightCm: this.hHeight,
        weightKg: this.hWeight,
        bp: this.hBp.trim() || null,
        pulse: this.hPulse,
        hbsag: this.hHbsag.trim() || null,
        hcv: this.hHcv.trim() || null,
        hiv: this.hHiv.trim() || null,
        tbScreening: this.hTb.trim() || null,
        restrictions: this.hRestrictions.trim() || null,
        nextDueDate: this.hNextDue || null,
      });
      this.hDoctor = ''; this.hHeight = null; this.hWeight = null;
      this.hBp = ''; this.hPulse = null;
      this.hHbsag = ''; this.hHcv = ''; this.hHiv = ''; this.hTb = '';
      this.hRestrictions = ''; this.hNextDue = '';
      await this.refresh();
    } catch (e: any) { this.hError.set(e?.message ?? 'Failed'); }
    finally { this.hBusy.set(false); }
  }
}
