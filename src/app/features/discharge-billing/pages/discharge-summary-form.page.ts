import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  DischargeBillingService,
  type ConditionStatus,
  type DischargeSummaryFormData,
  type Icd10Hit,
  type DrugMasterHit,
  type TakeHomeMed,
} from '../data/discharge-billing.service';

interface FlaggedNote {
  id: string; noted_at: string; assessment?: string | null;
  plan?: string | null; body?: string | null; author_name?: string | null;
  note_type?: string | null;
}

interface InpatientMed {
  id: string; drug_name: string; strength?: string | null;
  form?: string | null; route?: string | null; frequency?: string | null;
  start_at?: string | null; end_at?: string | null; status?: string | null;
  doses_given?: number;
}

interface LabOrderLite {
  id: string; ordered_at: string; reported_at: string | null;
  status: string; is_radiology: boolean;
  results: Array<{ test_name: string; value_numeric: number | null; value_text: string | null;
                   unit: string | null; flag: string | null; panel_group: string | null }>;
}

const CONDITION_OPTIONS: { value: ConditionStatus; label: string; tone: string }[] = [
  { value: 'cured',        label: 'Cured',                       tone: 'bg-good-bg text-good-fg' },
  { value: 'relieved',     label: 'Relieved',                    tone: 'bg-good-bg text-good-fg' },
  { value: 'status_quo',   label: 'Status quo',                  tone: 'bg-info-bg text-info-fg' },
  { value: 'transferred',  label: 'Transferred',                 tone: 'bg-info-bg text-info-fg' },
  { value: 'referred',     label: 'Referred',                    tone: 'bg-info-bg text-info-fg' },
  { value: 'lama',         label: 'LAMA (Left Against Advice)',  tone: 'bg-warn-bg text-warn-fg' },
  { value: 'dama',         label: 'DAMA (Discharge Against Advice)', tone: 'bg-warn-bg text-warn-fg' },
  { value: 'deceased',     label: 'Deceased',                    tone: 'bg-danger-bg text-danger-fg' },
];

@Component({
  selector: 'app-discharge-summary-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
<div class="flex flex-col max-w-[1100px] mx-auto pb-16">
  <!-- Top bar -->
  <header class="flex items-center justify-between pb-4 mb-4 border-b border-border">
    <div class="flex items-center gap-3">
      <a [routerLink]="['/discharge-billing']" class="text-[12px] text-ink-soft hover:text-ink">← Back to discharge queue</a>
      <span class="text-ink-faint">·</span>
      <h1 class="font-display text-[22px] font-medium tracking-[-0.02em] text-ink">Edit Discharge Summary</h1>
    </div>
    <div class="flex items-center gap-2">
      @if (signedAt()) {
        <span class="text-[11px] text-good-fg inline-flex items-center gap-1">
          <span class="size-1.5 rounded-full bg-good-fg"></span>
          Signed {{ shortDateTime(signedAt()!) }}
        </span>
      } @else {
        <span class="text-[11px] text-warn-fg">DRAFT — not signed</span>
      }
      <button type="button" (click)="save(false)" [disabled]="busy()"
              class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-card disabled:opacity-50">
        Save draft
      </button>
      <button type="button" (click)="save(true)" [disabled]="busy() || !canSign()"
              class="h-9 px-3 rounded-md text-[12px] font-semibold bg-primary text-on-primary hover:bg-primary-strong disabled:opacity-50">
        Sign &amp; save
      </button>
      <button type="button" (click)="openPrint()"
              class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-card">
        Preview / print
      </button>
    </div>
  </header>

  @if (loading()) {
    <p class="text-[12px] text-ink-muted px-2 py-8 text-center">Loading…</p>
  } @else if (bundle(); as b) {
    <!-- Patient header preview -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div><p class="text-ink-faint text-[10px] uppercase">UHID</p><p class="font-mono">{{ b.patient?.uhid }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Patient</p><p class="font-medium">{{ b.patient?.full_name }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Age / Sex</p><p>{{ patientAgeSex(b.patient) }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">IP No</p><p class="font-mono">{{ b.invoice?.invoice_number ?? '—' }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Doctor</p><p>{{ b.doctor?.full_name ?? '—' }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Department</p><p>{{ deptOf(b.doctor) }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Admitted</p><p>{{ shortDateTime(b.admission?.admitted_at) }}</p></div>
        <div><p class="text-ink-faint text-[10px] uppercase">Discharge</p><p>{{ shortDateTime(b.admission?.discharged_at) || '—' }}</p></div>
      </div>
    </section>

    <!-- 1. Diagnoses -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-3">Diagnoses</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-[10px] uppercase text-ink-muted font-medium">Primary diagnosis (ICD-10)</label>
          <div class="relative">
            <input type="text" [(ngModel)]="primaryDxText" (input)="onIcdSearch($event, 'primary')"
                   placeholder="Type to search ICD-10 (e.g., N12, pyelonephritis)"
                   class="w-full h-9 px-3 rounded-md border border-border text-[12px] bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"/>
            @if (icdHits().length && icdSearchScope() === 'primary') {
              <ul class="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                @for (h of icdHits(); track h.code) {
                  <li (click)="pickIcd(h, 'primary')"
                      class="px-3 py-2 text-[12px] cursor-pointer hover:bg-surface-subtle border-b border-border last:border-b-0">
                    <span class="font-mono font-semibold text-primary">{{ h.code }}</span>
                    <span class="ml-2">{{ h.description }}</span>
                    @if (h.pmjay_package_code) { <span class="ml-2 text-[10px] text-ink-faint">PMJAY {{ h.pmjay_package_code }}</span> }
                  </li>
                }
              </ul>
            }
          </div>
        </div>
        <div>
          <label class="text-[10px] uppercase text-ink-muted font-medium">Secondary diagnoses</label>
          <div class="flex flex-wrap gap-1.5 min-h-[36px] p-1.5 rounded-md border border-border bg-surface-card">
            @for (d of secondaryDx(); track d) {
              <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface-subtle border border-border">
                {{ d }}
                <button type="button" (click)="removeSecondaryDx(d)" class="text-ink-faint hover:text-danger-fg">×</button>
              </span>
            }
            <input type="text" [(ngModel)]="secondaryDxInput" (input)="onIcdSearch($event, 'secondary')"
                   (keydown.enter)="addSecondaryDxFromText($event)"
                   placeholder="Add another (Enter to confirm)"
                   class="flex-1 min-w-[160px] h-7 px-2 text-[12px] bg-transparent focus:outline-none"/>
          </div>
          @if (icdHits().length && icdSearchScope() === 'secondary') {
            <ul class="mt-1 bg-surface-card border border-border rounded-md shadow-sm max-h-48 overflow-y-auto">
              @for (h of icdHits(); track h.code) {
                <li (click)="pickIcd(h, 'secondary')"
                    class="px-3 py-2 text-[12px] cursor-pointer hover:bg-surface-subtle border-b border-border last:border-b-0">
                  <span class="font-mono font-semibold text-primary">{{ h.code }}</span>
                  <span class="ml-2">{{ h.description }}</span>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </section>

    <!-- 2. Clinical narrative -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-3">Clinical narrative</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Chief complaint</span>
          <textarea rows="3" [(ngModel)]="form.presenting_complaint"
                    placeholder="Patient presented to ER with…"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Past medical history</span>
          <textarea rows="3" [(ngModel)]="form.past_medical_history"
                    placeholder="K/C/O — type 2 diabetes mellitus on regular treatment…"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
        </label>
        <label class="block md:col-span-2">
          <span class="text-[10px] uppercase text-ink-muted font-medium">History of present illness</span>
          <textarea rows="3" [(ngModel)]="form.history_of_present_illness"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
        </label>
        <label class="block md:col-span-2">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Clinical findings on admission</span>
          <textarea rows="4" [(ngModel)]="form.examination_findings"
                    placeholder="BP, PR, RR, TEMP, SPO2, GRBS, R/S, P/A, CVS, CNS…"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
        </label>
      </div>
    </section>

    <!-- 3. Course in hospital -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <div class="flex items-end justify-between mb-2">
        <div>
          <h2 class="text-[13px] font-semibold text-ink">Course in hospital</h2>
          <p class="text-[11px] text-ink-muted">Stitched only from notes flagged as discharge-summary milestones — never the full daily charting firehose.</p>
        </div>
        <button type="button" (click)="generateCourse()"
                class="h-8 px-3 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">
          Generate from {{ flaggedNotes().length }} flagged notes
        </button>
      </div>
      <textarea rows="8" [(ngModel)]="form.course_in_hospital"
                placeholder="Patient was managed with… On day 3 …"
                class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
      <label class="block mt-3">
        <span class="text-[10px] uppercase text-ink-muted font-medium">Procedures performed</span>
        <textarea rows="2" [(ngModel)]="form.procedures_performed"
                  placeholder="USG abdomen & pelvis, CT KUB, urodynamic study…"
                  class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
      </label>
    </section>

    <!-- 4. Key investigations to highlight -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-1">Key investigations to highlight</h2>
      <p class="text-[11px] text-ink-muted mb-3">
        Selected reports get the compact summary table on Page 1.
        All lab reports are still printed in full as Page 2 onwards.
      </p>
      @if (labOrders().length === 0) {
        <p class="text-[12px] text-ink-muted">No lab orders for this admission.</p>
      } @else {
        <ul class="divide-y divide-border border border-border rounded-md">
          @for (lo of labOrders(); track lo.id) {
            <li class="px-3 py-2 flex items-start gap-3">
              <input type="checkbox" [checked]="isKeyInvestigation(lo.id)" (change)="toggleKeyInvestigation(lo.id)"
                     class="mt-1"/>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-[12px] font-medium">
                    {{ lo.is_radiology ? '🩻' : '🧪' }} {{ summariseLab(lo) }}
                  </p>
                  <span class="text-[10px] text-ink-faint">{{ shortDate(lo.ordered_at) }}</span>
                  @if (lo.results.some(r => abnormal(r))) {
                    <span class="text-[10px] text-warn-fg font-semibold">abnormal</span>
                  }
                </div>
                @if (lo.results.length) {
                  <p class="text-[10px] text-ink-muted mt-0.5 line-clamp-1">
                    @for (r of lo.results.slice(0, 4); track r.test_name; let last = $last) {
                      <span [class.text-warn-fg]="abnormal(r)" [class.font-semibold]="abnormal(r)">
                        {{ r.test_name }} {{ formatResultValue(r) }}{{ r.unit ? ' ' + r.unit : '' }}{{ last ? '' : ' · ' }}
                      </span>
                    }
                    @if (lo.results.length > 4) { <span>… +{{ lo.results.length - 4 }} more</span> }
                  </p>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <!-- 5. Medication reconciliation — split view -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-1">Medication reconciliation</h2>
      <p class="text-[11px] text-ink-muted mb-3">
        IP medications (left) are <strong>not</strong> auto-mapped to discharge advice.
        Click <em>Suggest →</em> to seed a draft row; you must review every take-home line before signing.
      </p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Left: IP active -->
        <div class="border border-border rounded-md overflow-hidden">
          <header class="px-3 py-2 bg-surface-subtle border-b border-border">
            <p class="text-[11px] font-semibold text-ink">IP active orders ({{ ipMeds().length }})</p>
            <p class="text-[10px] text-ink-muted">Read-only — what was given inside the hospital</p>
          </header>
          @if (ipMeds().length === 0) {
            <p class="px-3 py-6 text-center text-[11px] text-ink-muted">No IP medication orders.</p>
          } @else {
            <ul class="divide-y divide-border max-h-80 overflow-y-auto">
              @for (m of ipMeds(); track m.id) {
                <li class="px-3 py-2 flex items-start gap-2">
                  <div class="flex-1">
                    <p class="text-[12px] font-medium">{{ m.drug_name }} <span class="text-ink-faint font-normal">{{ m.strength ?? '' }}</span></p>
                    <p class="text-[10px] text-ink-muted">{{ m.route ?? '' }} · {{ m.frequency ?? '' }} · {{ m.doses_given ?? 0 }} doses given</p>
                  </div>
                  <button type="button" (click)="suggestAsTakeHome(m)"
                          class="text-[10px] px-2 py-0.5 rounded border border-border text-ink-soft hover:bg-surface-card whitespace-nowrap">
                    Suggest →
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Right: take-home prescription pad -->
        <div class="border border-border rounded-md overflow-hidden">
          <header class="px-3 py-2 bg-surface-subtle border-b border-border flex items-center justify-between">
            <div>
              <p class="text-[11px] font-semibold text-ink">Take-home prescription ({{ takeHomeMeds().length }})</p>
              <p class="text-[10px] text-ink-muted">Each row is an explicit doctor decision</p>
            </div>
            <button type="button" (click)="addBlankTakeHome()"
                    class="text-[11px] h-7 px-2 rounded border border-border text-ink-soft hover:bg-surface-card">
              + Blank row
            </button>
          </header>
          @if (takeHomeMeds().length === 0) {
            <p class="px-3 py-6 text-center text-[11px] text-ink-muted">No take-home medications yet.</p>
          } @else {
            <ul class="divide-y divide-border max-h-[500px] overflow-y-auto">
              @for (m of takeHomeMeds(); track m._key) {
                <li class="px-3 py-2 space-y-1.5">
                  <div class="grid grid-cols-12 gap-1.5">
                    <div class="col-span-5 relative">
                      <input type="text" [(ngModel)]="m.drug_name" (input)="onDrugSearch($event, m._key)"
                             placeholder="Drug name"
                             class="w-full h-8 px-2 text-[12px] rounded border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary"/>
                      @if (drugHits().length && drugSearchKey() === m._key) {
                        <ul class="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          @for (d of drugHits(); track d.id) {
                            <li (click)="pickDrug(d, m)" class="px-2 py-1 text-[11px] cursor-pointer hover:bg-surface-subtle">
                              <span class="font-medium">{{ d.brand_name ?? d.generic_name }}</span>
                              @if (d.brand_name) { <span class="text-ink-muted"> ({{ d.generic_name }})</span> }
                              <span class="ml-1 text-ink-faint">{{ d.strength }} {{ d.form }}</span>
                              @if (d.schedule) { <span class="ml-1 text-[9px] text-warn-fg">Sch {{ d.schedule }}</span> }
                            </li>
                          }
                          <li class="px-2 py-1 text-[11px] cursor-pointer hover:bg-surface-subtle bg-surface-subtle border-t border-border"
                              (click)="markExternalDrug(m)">
                            <span class="text-warn-fg font-medium">+ External drug:</span> {{ m.drug_name }}
                            <p class="text-[10px] text-ink-muted">Front desk will add a manual line to the bill.</p>
                          </li>
                        </ul>
                      }
                    </div>
                    <input type="text" [(ngModel)]="m.strength" placeholder="Strength" class="col-span-2 h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                    <input type="text" [(ngModel)]="m.form"     placeholder="Form"     class="col-span-2 h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                    <input type="text" [(ngModel)]="m.route"    placeholder="Route"    class="col-span-2 h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                    <button type="button" (click)="removeTakeHome(m)"
                            class="col-span-1 h-8 text-[14px] text-ink-faint hover:text-danger-fg">×</button>
                  </div>
                  <div class="grid grid-cols-12 gap-1.5">
                    <input type="text" [(ngModel)]="m.dose"      placeholder="Dose (e.g., 1 tab)"   class="col-span-3 h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                    <input type="text" [(ngModel)]="m.frequency" placeholder="Freq (1-0-1, SOS…)"  class="col-span-3 h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                    <div class="col-span-3 flex items-center gap-1">
                      <input type="number" min="0" [(ngModel)]="m.duration_days" [disabled]="!!m.is_continuous"
                             placeholder="Days" class="w-full h-8 px-2 text-[12px] rounded border border-border bg-surface-card disabled:opacity-50"/>
                    </div>
                    <label class="col-span-3 inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
                      <input type="checkbox" [(ngModel)]="m.is_continuous"/> Continue
                    </label>
                  </div>
                  <input type="text" [(ngModel)]="m.instructions" placeholder="Special instructions (optional)"
                         class="w-full h-8 px-2 text-[12px] rounded border border-border bg-surface-card"/>
                  @if (m.is_external) {
                    <p class="text-[10px] text-warn-fg">⚠ External drug — front desk adds manual bill line.</p>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </section>

    <!-- 6. Diet, activity, follow-up -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-3">Discharge advice</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Diet</span>
          <textarea rows="2" [(ngModel)]="form.diet_advice"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Activity</span>
          <textarea rows="2" [(ngModel)]="form.activity_advice"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card"></textarea>
        </label>
        <label class="block md:col-span-2">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Follow-up instructions</span>
          <textarea rows="3" [(ngModel)]="form.follow_up_instructions"
                    placeholder="Continue urinary catheter for 2 months. Review with urology after 2 months…"
                    class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Next review (date &amp; time)</span>
          <input type="datetime-local" [ngModel]="nextReviewLocal()" (ngModelChange)="setNextReview($event)"
                 class="w-full h-9 px-3 text-[12px] rounded-md border border-border bg-surface-card"/>
        </label>
      </div>
    </section>

    <!-- 7. Condition on discharge — STRUCTURED FIRST -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-4">
      <h2 class="text-[13px] font-semibold text-ink mb-3">Condition on discharge</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        @for (opt of conditionOptions; track opt.value) {
          <label [class]="'cursor-pointer rounded-md border px-3 py-2 ' + (form.condition_status === opt.value ? 'border-primary bg-primary-soft' : 'border-border')">
            <div class="flex items-center justify-between">
              <span class="text-[12px] font-medium">{{ opt.label }}</span>
              <input type="radio" name="cond" [value]="opt.value" [(ngModel)]="form.condition_status" (ngModelChange)="onConditionChange()"/>
            </div>
            <span [class]="'inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ' + opt.tone">{{ opt.label }}</span>
          </label>
        }
      </div>

      <!-- LAMA / DAMA disclaimer + witness -->
      @if (form.condition_status === 'lama' || form.condition_status === 'dama') {
        <div class="rounded-md border border-warn-fg/30 bg-warn-bg/50 p-3 mb-3 text-[12px]">
          <p class="font-semibold text-warn-fg mb-2">⚠ Against-medical-advice disclaimer</p>
          <p class="text-ink leading-relaxed mb-3">
            The patient/attendant has been counselled regarding the medical condition, prognosis, recommended
            treatment, and possible consequences of leaving against medical advice including risk of deterioration,
            complications and death. They have chosen to leave on their own responsibility. The hospital and
            treating team shall not be held liable for adverse outcomes following this decision.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-[10px] uppercase text-ink-muted font-medium">Witness staff (required)</span>
              <input type="text" [(ngModel)]="form.lama_witness_staff_id"
                     placeholder="Staff UUID — picker TBD"
                     class="w-full h-9 px-3 text-[12px] rounded-md border border-border bg-surface-card"/>
            </label>
            <label class="inline-flex items-start gap-2 mt-5 text-[12px]">
              <input type="checkbox"
                     [checked]="!!form.lama_disclaimer_acknowledged_at"
                     (change)="toggleLamaAck($event)" class="mt-0.5"/>
              <span>Patient/attendant acknowledged the disclaimer and signed.</span>
            </label>
          </div>
        </div>
      }

      <!-- Transferred / Referred -->
      @if (form.condition_status === 'transferred' || form.condition_status === 'referred') {
        <label class="block mb-3">
          <span class="text-[10px] uppercase text-ink-muted font-medium">Receiving facility</span>
          <input type="text" [(ngModel)]="form.receiving_facility"
                 placeholder="e.g., Apollo Hospital, Hyderabad"
                 class="w-full h-9 px-3 text-[12px] rounded-md border border-border bg-surface-card"/>
        </label>
      }

      <label class="block">
        <span class="text-[10px] uppercase text-ink-muted font-medium">Condition description (free text)</span>
        <textarea rows="2" [(ngModel)]="form.condition_at_discharge"
                  placeholder="Symptomatically better. Vitals stable…"
                  class="w-full text-[12px] px-3 py-2 rounded-md border border-border bg-surface-card"></textarea>
      </label>
    </section>

    <!-- Sticky bottom actions -->
    <div class="sticky bottom-0 bg-surface-card/95 backdrop-blur border border-border rounded-[12px] px-4 py-3 flex items-center justify-between gap-3">
      <p class="text-[11px] text-ink-muted">
        @if (!canSign()) { <span class="text-warn-fg">⚠ Fill all required fields to sign.</span> }
        @else { <span class="text-good-fg">Ready to sign.</span> }
      </p>
      <div class="flex items-center gap-2">
        <button type="button" (click)="save(false)" [disabled]="busy()"
                class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-card">
          Save draft
        </button>
        <button type="button" (click)="save(true)" [disabled]="busy() || !canSign()"
                class="h-9 px-3 rounded-md text-[12px] font-semibold bg-primary text-on-primary hover:bg-primary-strong disabled:opacity-50">
          Sign &amp; save
        </button>
      </div>
    </div>
  } @else {
    <p class="text-[12px] text-danger-fg px-2 py-8 text-center">Could not load admission.</p>
  }
</div>
  `,
})
export class DischargeSummaryFormPage implements OnInit {
  protected svc   = inject(DischargeBillingService);
  protected toast = inject(ToastService);
  protected route = inject(ActivatedRoute);
  protected router= inject(Router);

  protected readonly conditionOptions = CONDITION_OPTIONS;

  protected admissionId = signal<string>('');
  protected loading     = signal<boolean>(true);
  protected busy        = signal<boolean>(false);
  protected bundle      = signal<any | null>(null);
  protected signedAt    = signal<string | null>(null);

  protected ipMeds         = signal<InpatientMed[]>([]);
  protected flaggedNotes   = signal<FlaggedNote[]>([]);
  protected labOrders      = signal<LabOrderLite[]>([]);
  protected takeHomeMeds   = signal<Array<TakeHomeMed & { _key: string; _isNew?: boolean }>>([]);

  protected secondaryDx       = signal<string[]>([]);
  protected secondaryDxInput  = '';
  protected primaryDxText     = '';
  protected icdHits           = signal<Icd10Hit[]>([]);
  protected icdSearchScope    = signal<'primary' | 'secondary'>('primary');
  protected drugHits          = signal<DrugMasterHit[]>([]);
  protected drugSearchKey     = signal<string>('');

  // The editable form payload (mirrors discharge_summary_data columns)
  protected form: DischargeSummaryFormData = {
    admission_id: '',
    branch_id: '',
    condition_status: null,
    secondary_diagnoses: [],
    key_investigation_lab_order_ids: [],
  };

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('admissionId');
    if (!id) { this.toast.error('Missing admission id'); return; }
    this.admissionId.set(id);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const b: any = await this.svc.getBundle(this.admissionId());
      this.bundle.set(b);
      this.ipMeds.set(b.inpatient_medications ?? []);
      this.flaggedNotes.set(b.flagged_progress_notes ?? []);
      this.labOrders.set(b.lab_orders ?? []);
      this.signedAt.set(b.summary?.signed_at ?? null);

      // Hydrate the form from any existing summary row.
      const s = b.summary ?? {};
      this.form = {
        admission_id: this.admissionId(),
        branch_id: b.admission?.branch_id ?? b.branch?.id ?? '',
        presenting_complaint: s.presenting_complaint ?? '',
        history_of_present_illness: s.history_of_present_illness ?? '',
        past_medical_history: s.past_medical_history ?? '',
        examination_findings: s.examination_findings ?? '',
        course_in_hospital: s.course_in_hospital ?? '',
        procedures_performed: s.procedures_performed ?? '',
        condition_at_discharge: s.condition_at_discharge ?? '',
        condition_status: s.condition_status ?? null,
        lama_witness_staff_id: s.lama_witness_staff_id ?? null,
        lama_disclaimer_acknowledged_at: s.lama_disclaimer_acknowledged_at ?? null,
        receiving_facility: s.receiving_facility ?? '',
        discharge_diagnosis_icd10: s.discharge_diagnosis_icd10 ?? null,
        secondary_diagnoses: s.secondary_diagnoses ?? [],
        discharge_medications: s.discharge_medications ?? '',
        follow_up_instructions: s.follow_up_instructions ?? '',
        diet_advice: s.diet_advice ?? '',
        activity_advice: s.activity_advice ?? '',
        next_review_at: s.next_review_at ?? null,
        key_investigation_lab_order_ids: s.key_investigation_lab_order_ids ?? [],
      };
      this.primaryDxText = this.form.discharge_diagnosis_icd10 ?? (b.admission?.primary_diagnosis_icd10 ?? '');
      this.secondaryDx.set(this.form.secondary_diagnoses ?? []);

      // Take-home meds → editable rows
      const meds = (b.take_home_meds ?? []) as TakeHomeMed[];
      this.takeHomeMeds.set(meds.map((m) => ({ ...m, _key: m.id ?? crypto.randomUUID() })));
    } catch (e) {
      this.toast.error('Could not load admission', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected canSign = computed(() => {
    const f = this.form;
    if (!f.condition_status) return false;
    if ((f.condition_status === 'lama' || f.condition_status === 'dama') &&
        (!f.lama_witness_staff_id || !f.lama_disclaimer_acknowledged_at)) return false;
    if ((f.condition_status === 'transferred' || f.condition_status === 'referred') && !f.receiving_facility) return false;
    return !!(f.presenting_complaint && f.course_in_hospital && f.condition_at_discharge);
  });

  protected onConditionChange() {
    if (this.form.condition_status !== 'lama' && this.form.condition_status !== 'dama') {
      this.form.lama_witness_staff_id = null;
      this.form.lama_disclaimer_acknowledged_at = null;
    }
    if (this.form.condition_status !== 'transferred' && this.form.condition_status !== 'referred') {
      this.form.receiving_facility = '';
    }
  }

  protected toggleLamaAck(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.form.lama_disclaimer_acknowledged_at = checked ? new Date().toISOString() : null;
  }

  // ── ICD-10 search ──────────────────────────────────────
  private icdDebounce: ReturnType<typeof setTimeout> | null = null;
  protected onIcdSearch(ev: Event, scope: 'primary' | 'secondary') {
    const q = (ev.target as HTMLInputElement).value;
    this.icdSearchScope.set(scope);
    if (this.icdDebounce) clearTimeout(this.icdDebounce);
    if (!q.trim()) { this.icdHits.set([]); return; }
    this.icdDebounce = setTimeout(async () => {
      try { this.icdHits.set(await this.svc.searchIcd10(q)); }
      catch { this.icdHits.set([]); }
    }, 200);
  }
  protected pickIcd(h: Icd10Hit, scope: 'primary' | 'secondary') {
    if (scope === 'primary') {
      this.primaryDxText = `${h.code} — ${h.description}`;
      this.form.discharge_diagnosis_icd10 = h.code;
    } else {
      const next = Array.from(new Set([...this.secondaryDx(), `${h.code} — ${h.description}`]));
      this.secondaryDx.set(next);
      this.form.secondary_diagnoses = next;
      this.secondaryDxInput = '';
    }
    this.icdHits.set([]);
  }
  protected addSecondaryDxFromText(ev: Event) {
    ev.preventDefault();
    const v = this.secondaryDxInput.trim();
    if (!v) return;
    const next = Array.from(new Set([...this.secondaryDx(), v]));
    this.secondaryDx.set(next);
    this.form.secondary_diagnoses = next;
    this.secondaryDxInput = '';
    this.icdHits.set([]);
  }
  protected removeSecondaryDx(d: string) {
    const next = this.secondaryDx().filter((x) => x !== d);
    this.secondaryDx.set(next);
    this.form.secondary_diagnoses = next;
  }

  // ── Drug search ────────────────────────────────────────
  private drugDebounce: ReturnType<typeof setTimeout> | null = null;
  protected onDrugSearch(ev: Event, key: string) {
    const q = (ev.target as HTMLInputElement).value;
    this.drugSearchKey.set(key);
    if (this.drugDebounce) clearTimeout(this.drugDebounce);
    if (!q.trim()) { this.drugHits.set([]); return; }
    this.drugDebounce = setTimeout(async () => {
      try { this.drugHits.set(await this.svc.searchDrugs(q)); }
      catch { this.drugHits.set([]); }
    }, 200);
  }
  protected pickDrug(d: DrugMasterHit, m: TakeHomeMed & { _key: string }) {
    m.drug_name = d.brand_name ?? d.generic_name;
    m.strength  = d.strength  ?? m.strength;
    m.form      = d.form      ?? m.form;
    m.route     = d.route_default ?? m.route;
    m.is_external = false;
    this.drugHits.set([]);
  }
  protected markExternalDrug(m: TakeHomeMed & { _key: string }) {
    m.is_external = true;
    this.drugHits.set([]);
    this.toast.info('Marked as external — front desk will add bill line.');
  }

  // ── Take-home meds CRUD (in-memory until save) ────────
  protected addBlankTakeHome() {
    this.takeHomeMeds.update((arr) => [...arr, this.makeBlankMed()]);
  }
  protected suggestAsTakeHome(m: InpatientMed) {
    this.takeHomeMeds.update((arr) => [...arr, {
      ...this.makeBlankMed(),
      drug_name: m.drug_name,
      strength: m.strength ?? null,
      form: m.form ?? null,
      route: 'oral',          // assume oral for take-home; doctor edits
    }]);
  }
  protected removeTakeHome(m: TakeHomeMed & { _key: string }) {
    this.takeHomeMeds.update((arr) => arr.filter((x) => x._key !== m._key));
  }
  private makeBlankMed(): TakeHomeMed & { _key: string; _isNew: true } {
    return {
      _key: crypto.randomUUID(), _isNew: true,
      admission_id: this.admissionId(),
      branch_id: this.bundle()?.admission?.branch_id ?? this.bundle()?.branch?.id ?? '',
      drug_name: '', strength: null, form: null, route: null,
      dose: null, frequency: null, duration_days: null, is_continuous: false,
      instructions: null, is_external: false, order_index: this.takeHomeMeds().length,
    };
  }

  // ── Key investigations ─────────────────────────────────
  protected isKeyInvestigation(id: string): boolean {
    return (this.form.key_investigation_lab_order_ids ?? []).includes(id);
  }
  protected toggleKeyInvestigation(id: string) {
    const cur = new Set(this.form.key_investigation_lab_order_ids ?? []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    this.form.key_investigation_lab_order_ids = Array.from(cur);
  }

  // ── Course-in-hospital stitcher ────────────────────────
  protected generateCourse() {
    const meds = Array.from(new Set(this.ipMeds().map((m) => m.drug_name)));
    const txt = this.svc.stitchCourseInHospital(this.flaggedNotes(), meds);
    if (!txt) {
      this.toast.warn('No flagged notes found',
        'Tick "Mark for discharge summary" on key milestone notes in nursing/notes first.');
      return;
    }
    if (this.form.course_in_hospital && !confirm('Replace existing course text with regenerated draft?')) return;
    this.form.course_in_hospital = txt;
  }

  // ── Save / sign ────────────────────────────────────────
  protected async save(sign: boolean) {
    this.busy.set(true);
    try {
      // 1. Persist take-home meds (insert new, update existing, delete removed).
      const original = (this.bundle()?.take_home_meds ?? []) as TakeHomeMed[];
      const currentKeys = new Set(this.takeHomeMeds().map((m) => m.id).filter(Boolean));
      for (const o of original) {
        if (o.id && !currentKeys.has(o.id)) {
          await this.svc.deleteTakeHomeMed(o.id);
        }
      }
      let i = 0;
      for (const m of this.takeHomeMeds()) {
        m.order_index = i++;
        const payload: TakeHomeMed = {
          admission_id: m.admission_id, branch_id: m.branch_id,
          drug_name: m.drug_name, strength: m.strength ?? null,
          form: m.form ?? null, route: m.route ?? null,
          dose: m.dose ?? null, frequency: m.frequency ?? null,
          duration_days: m.duration_days ?? null,
          is_continuous: !!m.is_continuous,
          instructions: m.instructions ?? null,
          is_external: !!m.is_external,
          order_index: m.order_index ?? i,
        };
        if (m.id) {
          await this.svc.updateTakeHomeMed(m.id, payload);
        } else {
          const inserted = await this.svc.addTakeHomeMed(payload);
          m.id = inserted.id;
        }
      }

      // 2. Persist the structured summary row.
      this.form.secondary_diagnoses     = this.secondaryDx();
      await this.svc.saveDischargeSummary(this.form);
      if (sign) await this.svc.signDischargeSummary(this.admissionId());

      this.toast.success(sign ? 'Signed and saved' : 'Draft saved');
      await this.load();
    } catch (e) {
      this.toast.error('Save failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected openPrint() {
    window.open(`/discharge-billing/print/${this.admissionId()}`, '_blank');
  }

  // ── Helpers ────────────────────────────────────────────
  protected nextReviewLocal(): string {
    if (!this.form.next_review_at) return '';
    return this.form.next_review_at.slice(0, 16); // datetime-local
  }
  protected setNextReview(v: string) {
    this.form.next_review_at = v ? new Date(v).toISOString() : null;
  }
  protected shortDateTime(s?: string | null): string {
    if (!s) return '';
    try { return format(parseISO(s), 'dd-MM-yyyy / HH:mm'); } catch { return s; }
  }
  protected shortDate(s?: string | null): string {
    if (!s) return '';
    try { return format(parseISO(s), 'dd-MM-yyyy'); } catch { return s; }
  }
  protected patientAgeSex(p: any): string {
    if (!p) return '';
    const dob = p.date_of_birth ? new Date(p.date_of_birth) : null;
    const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : '';
    return `${age}${age ? 'Y' : ''} / ${(p.gender ?? '').toUpperCase()}`;
  }
  protected deptOf(d: any): string {
    return (d?.metadata?.department as string) ?? d?.metadata?.specialty ?? 'GENERAL MEDICINE';
  }
  protected summariseLab(lo: LabOrderLite): string {
    if (lo.results.length === 0) return 'No results entered yet';
    const groups = Array.from(new Set(lo.results.map((r) => r.panel_group ?? 'Other'))).filter(Boolean);
    return groups.slice(0, 3).join(', ') + (groups.length > 3 ? `, +${groups.length - 3}` : '');
  }
  protected formatResultValue(r: { value_numeric: number | null; value_text: string | null }): string {
    if (r.value_numeric != null) return String(r.value_numeric);
    return r.value_text ?? '—';
  }
  protected abnormal(r: { flag: string | null }): boolean {
    return !!r.flag && r.flag.toUpperCase() !== 'N' && r.flag.toUpperCase() !== 'NORMAL';
  }
}
