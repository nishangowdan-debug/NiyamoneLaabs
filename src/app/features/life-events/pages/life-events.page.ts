import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LifeEventsService } from '../data/life-events.service';
import {
  BIRTH_METHOD_LABELS, BIRTH_OUTCOME_LABELS, MANNER_LABELS, REG_STATUS_LABELS,
  type BirthMethod, type BirthOutcome, type BirthRecord, type DeathRecord,
  type MannerOfDeath, type PendingDeathCertificate,
} from '../data/life-events.types';

type Tab = 'births' | 'deaths' | 'pending' | 'municipality';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Birth &amp; Death Registration</h1>
    <p class="text-[12px] text-ink-soft">RBD Act 1969 · MCCD certification · municipality registration tracking</p>
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

  <!-- BIRTHS -->
  @if (tab() === 'births') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Register Birth</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Mother Patient ID *</span>
          <input [(ngModel)]="bMotherId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Born at *</span>
          <input type="datetime-local" [(ngModel)]="bBornAt"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Outcome</span>
            <select [(ngModel)]="bOutcome"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="live_birth">Live Birth</option>
              <option value="stillbirth">Stillbirth</option>
              <option value="neonatal_death">Neonatal Death</option>
              <option value="abortion">Abortion</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Sex *</span>
            <select [(ngModel)]="bSex"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="indeterminate">Indeterminate</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Method</span>
            <select [(ngModel)]="bMethod"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option [ngValue]="null">—</option>
              <option value="vaginal">Vaginal</option><option value="lscs">LSCS</option>
              <option value="forceps">Forceps</option><option value="vacuum">Vacuum</option>
              <option value="breech">Breech</option><option value="other">Other</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Weight (g)</span>
            <input type="number" [(ngModel)]="bWeight"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Gest. weeks</span>
            <input type="number" min="16" max="44" [(ngModel)]="bGestWeeks"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Gest. days</span>
            <input type="number" min="0" max="6" [(ngModel)]="bGestDays"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">APGAR 1'</span>
            <input type="number" min="0" max="10" [(ngModel)]="bApgar1"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">APGAR 5'</span>
            <input type="number" min="0" max="10" [(ngModel)]="bApgar5"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Father name</span>
          <input [(ngModel)]="bFather"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Attending Doctor *</span>
          <input [(ngModel)]="bDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (bError()) { <p class="text-[12px] text-danger-fg">{{ bError() }}</p> }
        <button (click)="submitBirth()" [disabled]="bBusy() || !bCanSubmit()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ bBusy() ? 'Saving…' : 'Register Birth' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Birth Records</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Reg No</th><th class="px-3 py-2">Born</th>
                <th class="px-3 py-2">Outcome</th><th class="px-3 py-2">Sex</th>
                <th class="px-3 py-2">Wt</th><th class="px-3 py-2">Method</th>
                <th class="px-3 py-2">Doctor</th><th class="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            @for (b of births(); track b.id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2 font-mono">{{ b.registration_no }}</td>
                <td class="px-3 py-2">{{ b.born_at | date:'short' }}</td>
                <td class="px-3 py-2">{{ outcomeLabel(b.birth_outcome) }}</td>
                <td class="px-3 py-2">{{ b.sex }}</td>
                <td class="px-3 py-2">{{ b.birth_weight_g ?? '—' }}g</td>
                <td class="px-3 py-2">{{ b.method ? methodLabel(b.method) : '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ b.attending_doctor_name }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        [class.bg-good-fg]="b.registration_status === 'registered'"
                        [class.bg-warn-fg]="b.registration_status === 'pending'"
                        [class.text-white]="b.registration_status !== 'pending'">
                    {{ statusLabel(b.registration_status) }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- PENDING DEATH CERTIFICATES -->
  @if (tab() === 'pending') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">
        Admissions Marked Deceased — Death Certificate Pending
      </h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Admission</th>
              <th class="px-3 py-2">Date of Death</th><th class="px-3 py-2">Days Since</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (p of pending(); track p.admission_id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="p.days_since_death > 1"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono text-[10px]">{{ p.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ p.admission_id.slice(0,8) }}</td>
              <td class="px-3 py-2">{{ p.date_of_death ? (p.date_of_death | date:'short') : '—' }}</td>
              <td class="px-3 py-2"
                  [class.text-danger-fg]="p.days_since_death > 1"
                  [class.font-bold]="p.days_since_death > 1">
                {{ p.days_since_death.toFixed(1) }}d
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="prefillDeath(p)" class="text-[11px] text-brand hover:underline">Certify →</button>
              </td>
            </tr>
          }
          @if (pending().length === 0) {
            <tr><td colspan="5" class="px-3 py-3 text-center text-ink-soft">All deaths certified.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- DEATHS -->
  @if (tab() === 'deaths') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-semibold">+ Issue Death Certificate (MCCD)</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="dPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
          <input [(ngModel)]="dAdmissionId" placeholder="UUID (optional)"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Died at *</span>
          <input type="datetime-local" [(ngModel)]="dDiedAt"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Pronounced by Doctor *</span>
          <input [(ngModel)]="dDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Manner</span>
          <select [(ngModel)]="dManner"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="natural">Natural</option><option value="accident">Accident</option>
            <option value="suicide">Suicide</option><option value="homicide">Homicide</option>
            <option value="undetermined">Undetermined</option>
            <option value="pending_investigation">Pending investigation</option>
          </select>
        </label>
        <div class="rounded-md border border-border p-2 space-y-1.5 bg-surface-subtle">
          <p class="text-[10px] font-bold uppercase text-ink-soft">Cause of Death (MCCD chain)</p>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">I (a) Immediate cause *</span>
            <input [(ngModel)]="dCauseImmediate"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <div class="grid grid-cols-2 gap-1">
            <input [(ngModel)]="dCauseImmediateIcd" placeholder="ICD-10"
                   class="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-mono" />
            <input [(ngModel)]="dCauseImmediateDuration" placeholder="Approx. duration"
                   class="rounded-md border border-border bg-surface px-2 py-1 text-[11px]" />
          </div>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">I (b) Antecedent</span>
            <input [(ngModel)]="dCauseAntecedent"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">I (c) Underlying *</span>
            <input [(ngModel)]="dCauseUnderlying"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <div class="grid grid-cols-2 gap-1">
            <input [(ngModel)]="dCauseUnderlyingIcd" placeholder="ICD-10"
                   class="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-mono" />
            <input [(ngModel)]="dCauseUnderlyingDuration" placeholder="Approx. duration"
                   class="rounded-md border border-border bg-surface px-2 py-1 text-[11px]" />
          </div>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">II Other significant conditions</span>
            <textarea rows="2" [(ngModel)]="dOtherConditions"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
          </label>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="dIsMlc" />
          Medico-Legal Case (police intimation required)
        </label>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="dAutopsy" />
          Autopsy performed
        </label>
        @if (dError()) { <p class="text-[12px] text-danger-fg">{{ dError() }}</p> }
        <button (click)="submitDeath()" [disabled]="dBusy() || !dCanSubmit()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ dBusy() ? 'Issuing…' : 'Issue Death Certificate' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Death Records</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Reg No</th><th class="px-3 py-2">Patient</th>
                <th class="px-3 py-2">Died</th><th class="px-3 py-2">Manner</th>
                <th class="px-3 py-2">Immediate Cause</th><th class="px-3 py-2">Underlying</th>
                <th class="px-3 py-2">MLC</th><th class="px-3 py-2">Body</th>
                <th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (d of deaths(); track d.id) {
              <tr class="border-t border-border" [class.bg-danger-fg]="d.is_mlc" [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ d.registration_no }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ d.deceased_patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2">{{ d.died_at | date:'short' }}</td>
                <td class="px-3 py-2">{{ mannerLabel(d.manner_of_death) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ d.cause_immediate_text }}</td>
                <td class="px-3 py-2 text-[11px]">{{ d.cause_underlying_text }}</td>
                <td class="px-3 py-2">{{ d.is_mlc ? '⚠ Yes' : 'No' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  {{ d.body_released_at ? '✓ released' : 'in mortuary' }}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (!d.body_released_at) {
                    <button (click)="releaseBody(d)" class="text-[11px] text-brand hover:underline">Release</button>
                    <span class="mx-1">·</span>
                  }
                  @if (!d.municipality_no) {
                    <button (click)="setDeathMuni(d)" class="text-[11px] text-good-fg hover:underline">Reg muni</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- MUNICIPALITY -->
  @if (tab() === 'municipality') {
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Births — Pending Municipality</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Reg No</th><th class="px-3 py-2">Born</th>
                <th class="px-3 py-2">Days</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (b of pendingBirths(); track b.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="daysSince(b.born_at) > 21"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ b.registration_no }}</td>
                <td class="px-3 py-2">{{ b.born_at | date:'mediumDate' }}</td>
                <td class="px-3 py-2" [class.text-danger-fg]="daysSince(b.born_at) > 21">
                  {{ daysSince(b.born_at) }}d
                </td>
                <td class="px-3 py-2 text-right">
                  <button (click)="setBirthMuni(b)" class="text-[11px] text-brand hover:underline">Mark registered</button>
                </td>
              </tr>
            }
            @if (pendingBirths().length === 0) {
              <tr><td colspan="4" class="px-3 py-3 text-center text-ink-soft">All registered.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Deaths — Pending Municipality</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Reg No</th><th class="px-3 py-2">Died</th>
                <th class="px-3 py-2">Days</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (d of pendingDeathsMuni(); track d.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="daysSince(d.died_at) > 21"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ d.registration_no }}</td>
                <td class="px-3 py-2">{{ d.died_at | date:'mediumDate' }}</td>
                <td class="px-3 py-2" [class.text-danger-fg]="daysSince(d.died_at) > 21">
                  {{ daysSince(d.died_at) }}d
                </td>
                <td class="px-3 py-2 text-right">
                  <button (click)="setDeathMuni(d)" class="text-[11px] text-brand hover:underline">Mark registered</button>
                </td>
              </tr>
            }
            @if (pendingDeathsMuni().length === 0) {
              <tr><td colspan="4" class="px-3 py-3 text-center text-ink-soft">All registered.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>
  `,
})
export class LifeEventsPage implements OnInit {
  private svc = inject(LifeEventsService);

  protected tab = signal<Tab>('births');
  protected births = signal<BirthRecord[]>([]);
  protected deaths = signal<DeathRecord[]>([]);
  protected pending = signal<PendingDeathCertificate[]>([]);

  protected pendingBirths       = computed(() => this.births().filter(b => !b.municipality_no));
  protected pendingDeathsMuni   = computed(() => this.deaths().filter(d => !d.municipality_no));

  protected tabs = [
    { id: 'births'       as Tab, label: 'Births',     count: () => this.births().length },
    { id: 'deaths'       as Tab, label: 'Deaths',     count: () => this.deaths().length },
    { id: 'pending'      as Tab, label: 'Pending Certificate', count: () => this.pending().length },
    { id: 'municipality' as Tab, label: 'Municipality', count: () => this.pendingBirths().length + this.pendingDeathsMuni().length },
  ];

  // Birth form
  protected bMotherId = '';
  protected bBornAt = '';
  protected bOutcome: BirthOutcome = 'live_birth';
  protected bSex: 'male' | 'female' | 'other' | 'indeterminate' = 'male';
  protected bMethod: BirthMethod | null = null;
  protected bWeight: number | null = null;
  protected bGestWeeks: number | null = null;
  protected bGestDays: number | null = null;
  protected bApgar1: number | null = null;
  protected bApgar5: number | null = null;
  protected bFather = '';
  protected bDoctor = '';
  protected bBusy = signal(false);
  protected bError = signal<string | null>(null);
  protected bCanSubmit = () => !!this.bMotherId.trim() && !!this.bBornAt && !!this.bDoctor.trim();

  // Death form
  protected dPatientId = '';
  protected dAdmissionId = '';
  protected dDiedAt = '';
  protected dDoctor = '';
  protected dManner: MannerOfDeath = 'natural';
  protected dCauseImmediate = '';
  protected dCauseImmediateIcd = '';
  protected dCauseImmediateDuration = '';
  protected dCauseAntecedent = '';
  protected dCauseUnderlying = '';
  protected dCauseUnderlyingIcd = '';
  protected dCauseUnderlyingDuration = '';
  protected dOtherConditions = '';
  protected dIsMlc = false;
  protected dAutopsy = false;
  protected dBusy = signal(false);
  protected dError = signal<string | null>(null);
  protected dCanSubmit = () =>
    !!this.dPatientId.trim() && !!this.dDiedAt && !!this.dDoctor.trim()
    && !!this.dCauseImmediate.trim() && !!this.dCauseUnderlying.trim();

  protected outcomeLabel = (o: BirthOutcome) => BIRTH_OUTCOME_LABELS[o];
  protected methodLabel  = (m: BirthMethod) => BIRTH_METHOD_LABELS[m];
  protected mannerLabel  = (m: MannerOfDeath) => MANNER_LABELS[m];
  protected statusLabel  = (s: any) => REG_STATUS_LABELS[s as keyof typeof REG_STATUS_LABELS] ?? s;

  protected daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [b, d, p] = await Promise.all([
        this.svc.listBirths(), this.svc.listDeaths(), this.svc.listPendingCertificates(),
      ]);
      this.births.set(b); this.deaths.set(d); this.pending.set(p);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // Birth submit
  protected async submitBirth() {
    if (!this.bCanSubmit() || this.bBusy()) return;
    this.bBusy.set(true); this.bError.set(null);
    try {
      await this.svc.createBirth({
        motherPatientId: this.bMotherId.trim(),
        bornAt: new Date(this.bBornAt).toISOString(),
        sex: this.bSex,
        attendingDoctorName: this.bDoctor.trim(),
        birthOutcome: this.bOutcome,
        method: this.bMethod,
        birthWeightG: this.bWeight,
        gestationalWeeks: this.bGestWeeks,
        gestationalDays: this.bGestDays,
        apgar1: this.bApgar1,
        apgar5: this.bApgar5,
        fatherName: this.bFather.trim() || null,
      });
      this.bMotherId = ''; this.bBornAt = ''; this.bWeight = null;
      this.bGestWeeks = null; this.bGestDays = null; this.bApgar1 = null;
      this.bApgar5 = null; this.bFather = ''; this.bDoctor = '';
      await this.refresh();
    } catch (e: any) { this.bError.set(e?.message ?? 'Failed'); }
    finally { this.bBusy.set(false); }
  }

  protected prefillDeath(p: PendingDeathCertificate) {
    this.tab.set('deaths');
    this.dPatientId = p.patient_id;
    this.dAdmissionId = p.admission_id;
    this.dDiedAt = p.date_of_death ? this.toLocalInput(new Date(p.date_of_death)) : '';
  }
  private toLocalInput(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  protected async submitDeath() {
    if (!this.dCanSubmit() || this.dBusy()) return;
    this.dBusy.set(true); this.dError.set(null);
    try {
      await this.svc.createDeath({
        deceasedPatientId: this.dPatientId.trim(),
        diedAt: new Date(this.dDiedAt).toISOString(),
        pronouncedByDoctorName: this.dDoctor.trim(),
        causeImmediateText: this.dCauseImmediate.trim(),
        causeUnderlyingText: this.dCauseUnderlying.trim(),
        admissionId: this.dAdmissionId.trim() || null,
        mannerOfDeath: this.dManner,
        causeImmediateIcd10: this.dCauseImmediateIcd.trim() || null,
        causeImmediateDuration: this.dCauseImmediateDuration.trim() || null,
        causeAntecedentText: this.dCauseAntecedent.trim() || null,
        causeUnderlyingIcd10: this.dCauseUnderlyingIcd.trim() || null,
        causeUnderlyingDuration: this.dCauseUnderlyingDuration.trim() || null,
        otherConditions: this.dOtherConditions.trim() || null,
        autopsyPerformed: this.dAutopsy,
        isMlc: this.dIsMlc,
      });
      this.dPatientId = ''; this.dAdmissionId = ''; this.dDiedAt = '';
      this.dCauseImmediate = ''; this.dCauseUnderlying = '';
      this.dCauseImmediateIcd = ''; this.dCauseImmediateDuration = '';
      this.dCauseAntecedent = ''; this.dCauseUnderlyingIcd = '';
      this.dCauseUnderlyingDuration = ''; this.dOtherConditions = '';
      this.dIsMlc = false; this.dAutopsy = false; this.dDoctor = '';
      await this.refresh();
    } catch (e: any) { this.dError.set(e?.message ?? 'Failed'); }
    finally { this.dBusy.set(false); }
  }

  protected async releaseBody(d: DeathRecord) {
    const name = prompt('Released to (full name)?'); if (!name) return;
    const relation = prompt('Relationship to deceased?'); if (!relation) return;
    const idProof = prompt('ID proof (Aadhaar/PAN/Passport No)?') ?? '';
    try { await this.svc.releaseBody(d.id, name, relation, idProof); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async setBirthMuni(b: BirthRecord) {
    const no = prompt('Municipality registration number?'); if (!no) return;
    try { await this.svc.setBirthMunicipality(b.id, no); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async setDeathMuni(d: DeathRecord) {
    const no = prompt('Municipality registration number?'); if (!no) return;
    try { await this.svc.setDeathMunicipality(d.id, no); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
