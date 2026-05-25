import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RiskService } from '../data/risk.service';
import {
  BAND_LABELS,
  type FallRiskAssessment, type PressureRiskAssessment, type RiskBand,
  type VteRiskAssessment,
} from '../data/risk.types';

type Tab = 'fall' | 'vte' | 'pressure';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Patient Risk Assessments</h1>
    <p class="text-[12px] text-ink-soft">Morse Fall Scale · Padua VTE · Braden Pressure Injury · NABH IPSG-6</p>
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

  <!-- FALL RISK -->
  @if (tab() === 'fall') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-semibold">+ Morse Fall Scale</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="fPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">History of falling (last 3 months)</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fHistory" name="fH" [value]="0" /> No (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fHistory" name="fH" [value]="25" /> Yes (25)</label>
        </fieldset>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">Secondary diagnosis</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fSec" name="fS" [value]="0" /> No (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fSec" name="fS" [value]="15" /> Yes (15)</label>
        </fieldset>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">Ambulatory aid</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fAmb" name="fA" [value]="0" /> None / bed rest / wheelchair / nurse (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fAmb" name="fA" [value]="15" /> Crutches / cane / walker (15)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fAmb" name="fA" [value]="30" /> Furniture (30)</label>
        </fieldset>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">IV / heparin lock</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fIv" name="fI" [value]="0" /> No (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fIv" name="fI" [value]="20" /> Yes (20)</label>
        </fieldset>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">Gait / transfer</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fGait" name="fG" [value]="0" /> Normal / bed rest / immobile (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fGait" name="fG" [value]="10" /> Weak (10)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fGait" name="fG" [value]="20" /> Impaired (20)</label>
        </fieldset>
        <fieldset class="space-y-1.5">
          <legend class="text-[11px] font-semibold">Mental status</legend>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fMental" name="fM" [value]="0" /> Oriented to own ability (0)</label>
          <label class="flex items-center gap-2 text-[12px]"><input type="radio" [(ngModel)]="fMental" name="fM" [value]="15" /> Forgets limitations (15)</label>
        </fieldset>
        <div class="rounded-md border border-border bg-surface-subtle p-2 text-center">
          <p class="text-[10px] uppercase text-ink-soft">Total</p>
          <p class="text-2xl font-bold"
             [class.text-good-fg]="fallScore() < 25"
             [class.text-warn-fg]="fallScore() >= 25 && fallScore() < 45"
             [class.text-danger-fg]="fallScore() >= 45">{{ fallScore() }}</p>
          <p class="text-[10px]">{{ fallBand() }}</p>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="fYellowBand" /> Yellow band applied
        </label>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="fEducated" /> Patient/family educated
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performed by *</span>
          <input [(ngModel)]="fBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (fError()) { <p class="text-[12px] text-danger-fg">{{ fError() }}</p> }
        <button (click)="saveFall()"
                [disabled]="fBusy() || !fPatientId.trim() || !fBy.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ fBusy() ? 'Saving…' : 'Save Assessment' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Recent Fall Assessments</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
                <th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2">Band</th>
                <th class="px-3 py-2">Yellow band</th><th class="px-3 py-2">By</th></tr>
          </thead>
          <tbody>
            @for (a of fallList(); track a.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="a.risk_band === 'high'"
                  [class.bg-warn-fg]="a.risk_band === 'moderate'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 text-[11px]">{{ a.assessed_at | date:'short' }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2 text-right font-bold">{{ a.total_score }}</td>
                <td class="px-3 py-2">{{ bandLabel(a.risk_band) }}</td>
                <td class="px-3 py-2">{{ a.yellow_band_applied ? '✓' : '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.performed_by_name }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- VTE RISK -->
  @if (tab() === 'vte') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Padua VTE Score</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="vPatientId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        @for (q of vteQuestions; track q.key) {
          <label class="flex items-center gap-2 text-[12px]">
            <input type="checkbox" [ngModel]="vState()[q.key]"
                   (ngModelChange)="setVteFlag(q.key, $event)" />
            <span class="flex-1">{{ q.label }}</span>
            <span class="text-[10px] text-ink-soft font-mono">{{ q.points }}</span>
          </label>
        }
        <div class="rounded-md border border-border bg-surface-subtle p-2 text-center">
          <p class="text-[10px] uppercase text-ink-soft">Padua Score</p>
          <p class="text-2xl font-bold"
             [class.text-good-fg]="vteScore() < 4"
             [class.text-danger-fg]="vteScore() >= 4">{{ vteScore() }}</p>
          <p class="text-[10px]">{{ vteScore() >= 4 ? '⚠ HIGH RISK — Prophylaxis indicated' : 'Low risk' }}</p>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="vBleedingHigh" /> High bleeding risk (use mechanical only)
        </label>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="vProphylaxisStarted" /> Prophylaxis started
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Drug + dose</span>
          <input [(ngModel)]="vDrug" placeholder="Enoxaparin 40 mg SC OD"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performed by *</span>
          <input [(ngModel)]="vBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (vError()) { <p class="text-[12px] text-danger-fg">{{ vError() }}</p> }
        <button (click)="saveVte()"
                [disabled]="vBusy() || !vPatientId.trim() || !vBy.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ vBusy() ? 'Saving…' : 'Save Assessment' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Recent VTE Assessments</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
                <th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2">Band</th>
                <th class="px-3 py-2">Bleeding</th><th class="px-3 py-2">Prophylaxis</th>
                <th class="px-3 py-2">Drug</th></tr>
          </thead>
          <tbody>
            @for (a of vteList(); track a.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="a.risk_band === 'high'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 text-[11px]">{{ a.assessed_at | date:'short' }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2 text-right font-bold">{{ a.total_score }}</td>
                <td class="px-3 py-2">{{ bandLabel(a.risk_band) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.bleeding_risk_high ? '⚠ high' : 'normal' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  {{ a.prophylaxis_recommended }}
                  @if (a.prophylaxis_started) { <span class="text-good-fg">✓ started</span> }
                </td>
                <td class="px-3 py-2 text-[11px]">{{ a.prophylaxis_drug || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- PRESSURE RISK -->
  @if (tab() === 'pressure') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-semibold">+ Braden Scale</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="pPatientId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        @for (sub of bradenSubs; track sub.key) {
          <div class="rounded-md border border-border p-2">
            <p class="text-[11px] font-semibold">{{ sub.label }}</p>
            <select [ngModel]="pState()[sub.key]" (ngModelChange)="setBraden(sub.key, $event)"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option [ngValue]="null">—</option>
              @for (opt of sub.options; track opt.value) {
                <option [ngValue]="opt.value">{{ opt.value }}: {{ opt.label }}</option>
              }
            </select>
          </div>
        }
        <div class="rounded-md border border-border bg-surface-subtle p-2 text-center">
          <p class="text-[10px] uppercase text-ink-soft">Braden Total (6-23)</p>
          <p class="text-2xl font-bold"
             [class.text-good-fg]="bradenScore() >= 15"
             [class.text-warn-fg]="bradenScore() >= 13 && bradenScore() < 15"
             [class.text-danger-fg]="bradenScore() < 13 && bradenScore() > 0">{{ bradenScore() }}</p>
          <p class="text-[10px]">{{ bradenBandLabel() }}</p>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="pExisting" /> Existing pressure injury
        </label>
        @if (pExisting) {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Stage</span>
            <select [(ngModel)]="pStage"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="stage_1">Stage 1</option><option value="stage_2">Stage 2</option>
              <option value="stage_3">Stage 3</option><option value="stage_4">Stage 4</option>
              <option value="unstageable">Unstageable</option><option value="dti">DTI</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Location</span>
            <input [(ngModel)]="pLocation" placeholder="sacrum / heel / etc."
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        }
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Turning every (min)</span>
          <input type="number" [(ngModel)]="pTurning"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performed by *</span>
          <input [(ngModel)]="pBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (pError()) { <p class="text-[12px] text-danger-fg">{{ pError() }}</p> }
        <button (click)="savePressure()"
                [disabled]="pBusy() || !pPatientId.trim() || !pBy.trim() || bradenScore() === 0"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ pBusy() ? 'Saving…' : 'Save Assessment' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Recent Pressure Assessments</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
                <th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2">Band</th>
                <th class="px-3 py-2">Existing</th><th class="px-3 py-2">Turning</th>
                <th class="px-3 py-2">By</th></tr>
          </thead>
          <tbody>
            @for (a of pressureList(); track a.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="a.risk_band === 'very_high' || a.risk_band === 'high'"
                  [class.bg-warn-fg]="a.risk_band === 'moderate'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 text-[11px]">{{ a.assessed_at | date:'short' }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2 text-right font-bold">{{ a.total_score }}</td>
                <td class="px-3 py-2">{{ bandLabel(a.risk_band) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.existing_pressure_injury ? a.injury_stage + ' @ ' + (a.injury_location || '?') : '—' }}</td>
                <td class="px-3 py-2 text-[11px]">q{{ a.turning_schedule_min }}m</td>
                <td class="px-3 py-2 text-[11px]">{{ a.performed_by_name }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>
  `,
})
export class RiskPage implements OnInit {
  private svc = inject(RiskService);

  protected tab = signal<Tab>('fall');
  protected fallList = signal<FallRiskAssessment[]>([]);
  protected vteList = signal<VteRiskAssessment[]>([]);
  protected pressureList = signal<PressureRiskAssessment[]>([]);

  protected bandLabel = (b: RiskBand | null) => b ? BAND_LABELS[b] : '—';

  // Fall form
  protected fPatientId = '';
  protected fHistory = 0; protected fSec = 0;
  protected fAmb = 0; protected fIv = 0;
  protected fGait = 0; protected fMental = 0;
  protected fYellowBand = false; protected fEducated = false;
  protected fBy = '';
  protected fBusy = signal(false);
  protected fError = signal<string | null>(null);
  protected fallScore = computed(() =>
    this.fHistory + this.fSec + this.fAmb + this.fIv + this.fGait + this.fMental,
  );
  protected fallBand = computed(() => {
    const s = this.fallScore();
    return s < 25 ? 'Low risk' : s < 45 ? 'Moderate risk' : 'High risk';
  });

  // VTE form
  protected vPatientId = '';
  protected vState = signal<Record<string, boolean>>({});
  protected vBleedingHigh = false;
  protected vProphylaxisStarted = false;
  protected vDrug = '';
  protected vBy = '';
  protected vBusy = signal(false);
  protected vError = signal<string | null>(null);
  protected vteQuestions = [
    { key: 'active_cancer',         label: 'Active cancer',                    points: 3 },
    { key: 'prior_vte',             label: 'Prior VTE',                        points: 3 },
    { key: 'reduced_mobility',      label: 'Reduced mobility (≥3 days)',       points: 3 },
    { key: 'thrombophilia',         label: 'Known thrombophilia',              points: 3 },
    { key: 'recent_trauma_surgery', label: 'Trauma / surgery (≤30 days)',      points: 2 },
    { key: 'age_70_plus',           label: 'Age ≥70',                          points: 1 },
    { key: 'heart_resp_failure',    label: 'Heart / respiratory failure',      points: 1 },
    { key: 'acute_mi_stroke',       label: 'Acute MI / stroke',                points: 1 },
    { key: 'acute_infection',       label: 'Acute infection / rheumatologic',  points: 1 },
    { key: 'obesity_bmi_30',        label: 'Obesity (BMI ≥30)',                points: 1 },
    { key: 'hormonal_treatment',    label: 'Hormonal treatment',               points: 1 },
  ];
  protected vteScore = computed(() => {
    let s = 0;
    for (const q of this.vteQuestions) {
      if (this.vState()[q.key]) s += q.points;
    }
    return s;
  });

  // Pressure form
  protected pPatientId = '';
  protected pState = signal<Record<string, number | null>>({});
  protected pExisting = false;
  protected pStage = 'stage_1';
  protected pLocation = '';
  protected pTurning: number | null = 120;
  protected pBy = '';
  protected pBusy = signal(false);
  protected pError = signal<string | null>(null);
  protected bradenSubs = [
    { key: 'sensory_perception', label: 'Sensory perception',
      options: [{ value: 1, label: 'Completely limited' }, { value: 2, label: 'Very limited' }, { value: 3, label: 'Slightly limited' }, { value: 4, label: 'No impairment' }] },
    { key: 'moisture', label: 'Moisture',
      options: [{ value: 1, label: 'Constantly moist' }, { value: 2, label: 'Very moist' }, { value: 3, label: 'Occasionally moist' }, { value: 4, label: 'Rarely moist' }] },
    { key: 'activity', label: 'Activity',
      options: [{ value: 1, label: 'Bedfast' }, { value: 2, label: 'Chairfast' }, { value: 3, label: 'Walks occasionally' }, { value: 4, label: 'Walks frequently' }] },
    { key: 'mobility', label: 'Mobility',
      options: [{ value: 1, label: 'Completely immobile' }, { value: 2, label: 'Very limited' }, { value: 3, label: 'Slightly limited' }, { value: 4, label: 'No limitation' }] },
    { key: 'nutrition', label: 'Nutrition',
      options: [{ value: 1, label: 'Very poor' }, { value: 2, label: 'Probably inadequate' }, { value: 3, label: 'Adequate' }, { value: 4, label: 'Excellent' }] },
    { key: 'friction_shear', label: 'Friction / shear',
      options: [{ value: 1, label: 'Problem' }, { value: 2, label: 'Potential problem' }, { value: 3, label: 'No apparent problem' }] },
  ];
  protected bradenScore = computed(() => {
    let s = 0;
    for (const sub of this.bradenSubs) {
      const v = this.pState()[sub.key];
      if (typeof v === 'number') s += v;
    }
    return s;
  });
  protected bradenBandLabel = computed(() => {
    const s = this.bradenScore();
    if (s === 0) return '—';
    if (s <= 9) return '⚠ Very High Risk';
    if (s <= 12) return 'High Risk';
    if (s <= 14) return 'Moderate Risk';
    return 'Low / No risk';
  });

  protected tabs = [
    { id: 'fall'     as Tab, label: 'Fall Risk',     count: () => this.fallList().length },
    { id: 'vte'      as Tab, label: 'VTE Risk',      count: () => this.vteList().length },
    { id: 'pressure' as Tab, label: 'Pressure Injury', count: () => this.pressureList().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  protected setVteFlag(key: string, v: boolean) {
    this.vState.update(s => ({ ...s, [key]: v }));
  }
  protected setBraden(key: string, v: number | null) {
    this.pState.update(s => ({ ...s, [key]: v }));
  }

  private async refresh() {
    try {
      const [f, v, p] = await Promise.all([
        this.svc.listFall(), this.svc.listVte(), this.svc.listPressure(),
      ]);
      this.fallList.set(f);
      this.vteList.set(v);
      this.pressureList.set(p);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async saveFall() {
    if (!this.fPatientId.trim() || !this.fBy.trim()) return;
    this.fBusy.set(true); this.fError.set(null);
    try {
      await this.svc.assessFall({
        patientId: this.fPatientId.trim(),
        historyOfFalling: this.fHistory,
        secondaryDiagnosis: this.fSec,
        ambulatoryAid: this.fAmb,
        ivOrHeparinLock: this.fIv,
        gait: this.fGait,
        mentalStatus: this.fMental,
        performedByName: this.fBy.trim(),
        yellowBandApplied: this.fYellowBand,
        patientEducated: this.fEducated,
      });
      this.fPatientId = ''; this.fHistory = 0; this.fSec = 0;
      this.fAmb = 0; this.fIv = 0; this.fGait = 0; this.fMental = 0;
      this.fYellowBand = false; this.fEducated = false;
      await this.refresh();
    } catch (e: any) { this.fError.set(e?.message ?? 'Failed'); }
    finally { this.fBusy.set(false); }
  }

  protected async saveVte() {
    if (!this.vPatientId.trim() || !this.vBy.trim()) return;
    this.vBusy.set(true); this.vError.set(null);
    try {
      const s = this.vState();
      await this.svc.assessVte({
        patientId: this.vPatientId.trim(),
        performedByName: this.vBy.trim(),
        activeCancer: !!s['active_cancer'],
        priorVte: !!s['prior_vte'],
        reducedMobility: !!s['reduced_mobility'],
        thrombophilia: !!s['thrombophilia'],
        recentTraumaSurgery: !!s['recent_trauma_surgery'],
        age70Plus: !!s['age_70_plus'],
        heartRespFailure: !!s['heart_resp_failure'],
        acuteMiStroke: !!s['acute_mi_stroke'],
        acuteInfection: !!s['acute_infection'],
        obesityBmi30: !!s['obesity_bmi_30'],
        hormonalTreatment: !!s['hormonal_treatment'],
        bleedingRiskHigh: this.vBleedingHigh,
        prophylaxisStarted: this.vProphylaxisStarted,
        prophylaxisDrug: this.vDrug.trim() || null,
      });
      this.vPatientId = ''; this.vState.set({});
      this.vBleedingHigh = false; this.vProphylaxisStarted = false;
      this.vDrug = '';
      await this.refresh();
    } catch (e: any) { this.vError.set(e?.message ?? 'Failed'); }
    finally { this.vBusy.set(false); }
  }

  protected async savePressure() {
    if (!this.pPatientId.trim() || !this.pBy.trim() || this.bradenScore() === 0) return;
    this.pBusy.set(true); this.pError.set(null);
    try {
      const s = this.pState();
      await this.svc.assessPressure({
        patientId: this.pPatientId.trim(),
        sensoryPerception: s['sensory_perception']!,
        moisture: s['moisture']!,
        activity: s['activity']!,
        mobility: s['mobility']!,
        nutrition: s['nutrition']!,
        frictionShear: s['friction_shear']!,
        performedByName: this.pBy.trim(),
        existingPressureInjury: this.pExisting,
        injuryStage: this.pExisting ? this.pStage : null,
        injuryLocation: this.pExisting ? this.pLocation : null,
        turningScheduleMin: this.pTurning ?? 120,
      });
      this.pPatientId = ''; this.pState.set({});
      this.pExisting = false; this.pLocation = '';
      this.pTurning = 120;
      await this.refresh();
    } catch (e: any) { this.pError.set(e?.message ?? 'Failed'); }
    finally { this.pBusy.set(false); }
  }
}
