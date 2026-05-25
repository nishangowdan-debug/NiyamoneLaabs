import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';

import { AppointmentsService } from '../../appointments/data/appointments.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ageFromDob } from '../../patients/utils/age-from-dob';
import type { AppointmentRow } from '../../appointments/data/appointments.types';

interface AllergyRow { id: string; substance: string; severity: string | null; reaction: string | null }

@Component({
  selector: 'app-triage-station-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  template: `
    @if (loading()) {
      <div class="text-[13px] text-ink-muted px-1 py-12">Loading triage context…</div>
    } @else if (!appt()) {
      <div class="text-[13px] text-danger-fg px-1 py-12">Appointment not found.</div>
    } @else {

    <!-- ── Header ─────────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <a routerLink="/opd-queue" class="text-[11px] text-ink-muted hover:text-primary-700">← OPD Queue</a>
        <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">
          Triage Station
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">
          {{ appt()!.patient?.full_name || (appt()!.patient?.first_name + ' ' + appt()!.patient?.last_name) }} ·
          UHID {{ appt()!.patient?.uhid }} ·
          {{ ageGender() }} ·
          token #{{ appt()!.token_number ?? '–' }} for {{ appt()!.doctor?.full_name || '—' }}
        </p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Checked in at</p>
        <p class="text-[13px] font-mono text-ink">{{ checkedInAtLabel() }}</p>
      </div>
    </header>

    <!-- ── Allergy banner (top) ──────────────────────────────── -->
    @if (allergies().length > 0) {
      <div class="rounded-[10px] border border-danger-fg/40 bg-danger-bg/50 px-4 py-3 mb-5 flex items-start gap-3">
        <span class="text-[20px] leading-none">⚠</span>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-semibold text-danger-fg uppercase tracking-[0.06em]">Active allergies — verify before any orders</p>
          <ul class="text-[13px] text-ink mt-1.5 space-y-0.5">
            @for (a of allergies(); track a.id) {
              <li><b>{{ a.substance }}</b><span class="text-ink-muted"> — {{ a.reaction || 'reaction not recorded' }} ({{ a.severity || 'severity unknown' }})</span></li>
            }
          </ul>
        </div>
        <label class="text-[11px] text-ink-soft inline-flex items-center gap-1.5 cursor-pointer shrink-0">
          <input type="checkbox" [(ngModel)]="allergyAck" name="allergyAck" class="size-3.5 rounded border-border">
          confirmed verbally
        </label>
      </div>
    }

    <form (ngSubmit)="save()" class="grid grid-cols-12 gap-4">

      <!-- ── Vital signs (left) ─────────────────────────────── -->
      <section class="col-span-12 lg:col-span-8 bg-surface-card border border-border/70 ring-1 ring-black/[0.04] rounded-[12px] shadow-[0_1px_2px_rgba(15,27,45,0.04),0_10px_28px_-14px_rgba(15,27,45,0.10)] p-5">
        <header class="flex items-center justify-between mb-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Vital signs</p>
          <span class="text-[10px] text-ink-muted">tab to advance · all fields marked * required</span>
        </header>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <!-- BP -->
          <label class="col-span-2 sm:col-span-2 block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Blood pressure *</span>
            <div class="flex items-center gap-1 mt-1.5">
              <input type="number" [ngModel]="bpSys()" (ngModelChange)="bpSys.set($event)" name="bpSys" min="40" max="260" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="120">
              <span class="text-ink-muted text-[18px] font-display">/</span>
              <input type="number" [ngModel]="bpDia()" (ngModelChange)="bpDia.set($event)" name="bpDia" min="20" max="180" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="80">
              <span class="text-[10px] text-ink-muted ml-1">mmHg</span>
            </div>
          </label>

          <!-- Pulse -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Pulse *</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" [ngModel]="pulse()" (ngModelChange)="pulse.set($event)" name="pulse" min="30" max="220" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="76">
              <span class="text-[10px] text-ink-muted">bpm</span>
            </div>
          </label>

          <!-- RR -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">RR *</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" [ngModel]="rr()" (ngModelChange)="rr.set($event)" name="rr" min="4" max="60" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="16">
              <span class="text-[10px] text-ink-muted">/min</span>
            </div>
          </label>

          <!-- Temp -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Temperature *</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" step="0.1" [ngModel]="temp()" (ngModelChange)="temp.set($event)" name="temp" min="32" max="43" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="36.8">
              <span class="text-[10px] text-ink-muted">°C</span>
            </div>
            @if (tempFahrenheitHint(); as h) {
              <button type="button" (click)="temp.set(h.celsius)"
                      class="mt-1.5 w-full text-left text-[11px] px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100">
                Looks like Fahrenheit · {{ h.fahrenheit }}°F = <b>{{ h.celsius }}°C</b> — click to use
              </button>
            }
          </label>

          <!-- SpO2 -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">SpO₂ *</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" [ngModel]="spo2()" (ngModelChange)="spo2.set($event)" name="spo2" min="50" max="100" required
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="98">
              <span class="text-[10px] text-ink-muted">%</span>
            </div>
          </label>

          <!-- Sugar -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Blood sugar</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" [ngModel]="sugar()" (ngModelChange)="sugar.set($event)" name="sugar" min="20" max="800"
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="—">
              <span class="text-[10px] text-ink-muted">mg/dL</span>
            </div>
          </label>

          <!-- Weight -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Weight</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" step="0.1" [ngModel]="weight()" (ngModelChange)="weight.set($event)" name="weight" min="1" max="300"
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="—">
              <span class="text-[10px] text-ink-muted">kg</span>
            </div>
          </label>

          <!-- Height -->
          <label class="block">
            <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Height</span>
            <div class="flex items-center gap-1.5 mt-1.5">
              <input type="number" [ngModel]="height()" (ngModelChange)="height.set($event)" name="height" min="30" max="220"
                     class="h-11 w-full text-[20px] font-display tabular-nums border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500" placeholder="165">
              <span class="text-[10px] text-ink-muted">cm</span>
            </div>
            @if (heightFeetHint(); as h) {
              <button type="button" (click)="height.set(h.cm)"
                      class="mt-1.5 w-full text-left text-[11px] px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100">
                Looks like feet · {{ h.feet }} ft = <b>{{ h.cm }} cm</b> — click to use
              </button>
            }
          </label>
        </div>

        <!-- Pain scale -->
        <div class="mt-5">
          <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Pain score (0–10)</span>
          <div class="flex items-center gap-1 mt-2">
            @for (n of [0,1,2,3,4,5,6,7,8,9,10]; track n) {
              <button type="button" (click)="painScore.set(n)"
                      class="size-9 rounded-md text-[13px] font-semibold transition-all"
                      [class.bg-emerald-500]="painScore() === n && n <= 3"
                      [class.bg-amber-500]="painScore() === n && n > 3 && n <= 6"
                      [class.bg-rose-500]="painScore() === n && n > 6"
                      [class.text-white]="painScore() === n"
                      [class.bg-surface-muted]="painScore() !== n"
                      [class.text-ink-soft]="painScore() !== n">{{ n }}</button>
            }
            <button type="button" (click)="painScore.set(null)" class="ml-2 text-[11px] text-ink-muted hover:text-ink underline">clear</button>
          </div>
          <p class="text-[10px] text-ink-muted mt-1">0 = none · 10 = worst imaginable</p>
        </div>

        <!-- Notes -->
        <label class="block mt-5">
          <span class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">Triage notes</span>
          <textarea [(ngModel)]="notes" name="notes" rows="3"
                    class="w-full mt-1.5 text-[13px] border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
                    placeholder="Brief observation, presenting concern, allergy verification, etc."></textarea>
        </label>
      </section>

      <!-- ── MEWS panel (right) ─────────────────────────────── -->
      <aside class="col-span-12 lg:col-span-4 space-y-4">
        <!-- MEWS card -->
        <article class="bg-surface-card border border-border/70 ring-1 ring-black/[0.04] rounded-[12px] shadow-[0_1px_2px_rgba(15,27,45,0.04),0_10px_28px_-14px_rgba(15,27,45,0.10)] p-5">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">MEWS preview</p>
          <p class="text-[10px] text-ink-muted mt-0.5 mb-4">Modified Early Warning Score · auto-computed</p>
          <div class="flex items-center gap-4">
            <div class="size-[88px] rounded-full grid place-items-center text-white shrink-0"
                 [style.background]="mewsColor()"
                 style="box-shadow: 0 6px 20px -4px rgba(0,0,0,0.25);">
              <div class="text-center">
                <div class="font-display text-[34px] font-medium leading-none">{{ mews() }}</div>
                <div class="text-[8px] uppercase tracking-[0.10em] mt-0.5 opacity-90">MEWS</div>
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold" [style.color]="mewsColor()">{{ mewsLabel() }}</p>
              <p class="text-[11px] text-ink-muted mt-1">{{ mewsAdvice() }}</p>
            </div>
          </div>
          <ul class="mt-4 space-y-1.5 text-[11px] text-ink-soft">
            @for (c of mewsBreakdown(); track c.label) {
              <li class="flex items-center justify-between gap-2">
                <span>{{ c.label }}</span>
                <span class="font-mono tabular-nums" [class.text-good-fg]="c.points === 0" [class.text-warn-fg]="c.points === 1 || c.points === 2" [class.text-danger-fg]="c.points >= 3">+{{ c.points }}</span>
              </li>
            }
          </ul>
        </article>

        <!-- BMI card (if both height & weight) -->
        @if (bmi(); as b) {
          <article class="bg-surface-card border border-border/70 ring-1 ring-black/[0.04] rounded-[12px] p-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">BMI</p>
            <p class="font-display text-[24px] font-medium leading-none mt-1.5 tabular-nums">{{ b.value }}</p>
            <p class="text-[11px] text-ink-muted mt-1">{{ b.label }}</p>
          </article>
        }
      </aside>

      <!-- ── Range-error banner ─────────────────────────────── -->
      @if (rangeErrors().length > 0) {
        <div class="col-span-12 rounded-[10px] border border-warn-border bg-warn-bg/40 px-4 py-3 text-[12px] text-warn-fg">
          <p class="font-semibold mb-1">Check these values before saving:</p>
          <ul class="list-disc list-inside space-y-0.5">
            @for (msg of rangeErrors(); track msg) {<li>{{ msg }}</li>}
          </ul>
        </div>
      }

      <!-- ── Action bar ─────────────────────────────────────── -->
      <div class="col-span-12 flex items-center justify-end gap-3 pt-2">
        <a routerLink="/opd-queue"
           class="h-10 px-4 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
          Cancel
        </a>
        <button type="submit" [disabled]="!canSave() || saving()"
                class="h-10 px-5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-semibold disabled:opacity-50 inline-flex items-center gap-2">
          @if (saving()) { <span class="size-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
          Save triage & advance
        </button>
      </div>
    </form>
    }
  `,
})
export class TriageStationPage implements OnInit {
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private svc     = inject(AppointmentsService);
  private toast   = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly saving  = signal(false);
  protected readonly appt    = signal<AppointmentRow | null>(null);
  protected readonly allergies = signal<AllergyRow[]>([]);
  protected allergyAck = false;

  // Form state — signals so computed() (MEWS, BMI, canSave) react under zoneless CD.
  protected readonly bpSys  = signal<number | null>(null);
  protected readonly bpDia  = signal<number | null>(null);
  protected readonly pulse  = signal<number | null>(null);
  protected readonly rr     = signal<number | null>(null);
  protected readonly temp   = signal<number | null>(null);
  protected readonly spo2   = signal<number | null>(null);
  protected readonly sugar  = signal<number | null>(null);
  protected readonly weight = signal<number | null>(null);
  protected readonly height = signal<number | null>(null);
  protected notes:  string = '';
  protected painScore = signal<number | null>(null);

  // ── Live MEWS calc (mirrors RPC logic) ───────────────────────────
  protected readonly mewsBreakdown = computed(() => {
    const out: { label: string; points: number }[] = [];
    const rr = this.rr(); const p = this.pulse(); const sys = this.bpSys(); const t = this.temp(); const s = this.spo2();
    out.push({ label: 'RR',     points: rr   == null ? 0 : rr  < 9 ? 2 : rr <= 14 ? 0 : rr <= 20 ? 1 : rr <= 29 ? 2 : 3 });
    out.push({ label: 'Pulse',  points: p    == null ? 0 : p   < 40 ? 2 : p <= 50 ? 1 : p <= 100 ? 0 : p <= 110 ? 1 : p <= 129 ? 2 : 3 });
    out.push({ label: 'BP sys', points: sys  == null ? 0 : sys < 70 ? 3 : sys <= 80 ? 2 : sys <= 100 ? 1 : sys <= 199 ? 0 : 2 });
    out.push({ label: 'Temp',   points: t    == null ? 0 : t   < 35 ? 2 : t <= 38.4 ? 0 : 2 });
    out.push({ label: 'SpO₂',   points: s    == null ? 0 : s   >= 96 ? 0 : s >= 94 ? 1 : s >= 92 ? 2 : 3 });
    return out;
  });
  protected readonly mews = computed(() => this.mewsBreakdown().reduce((sum, c) => sum + c.points, 0));
  protected readonly mewsColor = computed(() => {
    const m = this.mews();
    if (m >= 5) return '#DC2626';
    if (m >= 3) return '#D97706';
    if (m >= 1) return '#0EA5E9';
    return '#16A34A';
  });
  protected readonly mewsLabel = computed(() => {
    const m = this.mews();
    if (m >= 5) return 'Critical — escalate now';
    if (m >= 3) return 'Concerning';
    if (m >= 1) return 'Watch';
    return 'Stable';
  });
  protected readonly mewsAdvice = computed(() => {
    const m = this.mews();
    if (m >= 5) return 'Notify ED / on-call physician immediately. Consider higher-acuity area.';
    if (m >= 3) return 'Increase observation frequency. Doctor review within 30 min.';
    if (m >= 1) return 'Recheck vitals in 1 hour.';
    return 'Suitable for fast-track / standard consultation.';
  });

  protected readonly bmi = computed<{ value: string; label: string } | null>(() => {
    const h = this.height(), w = this.weight();
    if (!h || !w || h < 50) return null;
    const b = w / Math.pow(h / 100, 2);
    let label = 'Normal';
    if (b < 18.5) label = 'Underweight';
    else if (b < 25) label = 'Normal';
    else if (b < 30) label = 'Overweight';
    else label = 'Obese';
    return { value: b.toFixed(1) + ' kg/m²', label };
  });

  /** DB check-constraint ranges — keep in sync with the `vitals` table. */
  private static readonly RANGES = {
    bpSys:  [50, 260,  'BP systolic',  'mmHg'],
    bpDia:  [30, 180,  'BP diastolic', 'mmHg'],
    pulse:  [20, 250,  'Pulse',        'bpm'],
    rr:     [4,  60,   'Respiratory rate', '/min'],
    temp:   [30, 45,   'Temperature',  '°C'],
    spo2:   [50, 100,  'SpO₂',         '%'],
    sugar:  [20, 800,  'Blood sugar',  'mg/dL'],
    height: [30, 250,  'Height',       'cm'],
    weight: [0.5, 400, 'Weight',       'kg'],
  } as const;

  /** List of out-of-range vitals to show in a banner before save. */
  protected readonly rangeErrors = computed<string[]>(() => {
    const checks: [number | null, keyof typeof TriageStationPage.RANGES][] = [
      [this.bpSys(),  'bpSys'],
      [this.bpDia(),  'bpDia'],
      [this.pulse(),  'pulse'],
      [this.rr(),     'rr'],
      [this.temp(),   'temp'],
      [this.spo2(),   'spo2'],
      [this.sugar(),  'sugar'],
      [this.height(), 'height'],
      [this.weight(), 'weight'],
    ];
    const errs: string[] = [];
    for (const [v, key] of checks) {
      if (v == null) continue;
      const [min, max, label, unit] = TriageStationPage.RANGES[key];
      if (v < min || v > max) errs.push(`${label} ${v}${unit} is outside ${min}–${max}${unit}`);
    }
    return errs;
  });

  protected readonly canSave = computed(() => {
    const required = this.bpSys() != null && this.bpDia() != null
        && this.pulse() != null && this.rr() != null
        && this.temp() != null  && this.spo2() != null;
    return required && this.rangeErrors().length === 0;
  });

  /** Suggest a Celsius value when the user typed a plausible Fahrenheit (90–115). */
  protected readonly tempFahrenheitHint = computed<{ fahrenheit: number; celsius: number } | null>(() => {
    const t = this.temp();
    if (t == null || t < 90 || t > 115) return null;
    return { fahrenheit: Number(t.toFixed(1)), celsius: Number(((t - 32) * 5 / 9).toFixed(1)) };
  });

  /** Suggest a centimetres value when the user typed a plausible feet (1–8). */
  protected readonly heightFeetHint = computed<{ feet: number; cm: number } | null>(() => {
    const h = this.height();
    if (h == null || h < 1 || h > 8) return null;
    return { feet: Number(h.toFixed(1)), cm: Math.round(h * 30.48) };
  });

  protected ageGender(): string {
    const p = this.appt()?.patient;
    if (!p) return '';
    const a = ageFromDob(p.date_of_birth);
    const g = (p.gender || '').charAt(0).toUpperCase();
    return [a !== null ? `${a}y` : null, g].filter(Boolean).join(' / ');
  }

  protected checkedInAtLabel(): string {
    const t = this.appt()?.checked_in_at;
    if (!t) return '—';
    try { return format(parseISO(t), 'd MMM HH:mm'); } catch { return ''; }
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); return; }
    try {
      const ctx = await this.svc.getTriageContext(id);
      this.appt.set(ctx.appointment);
      this.allergies.set(ctx.allergies);
    } catch (e) {
      this.toast.error('Could not load triage context', e instanceof Error ? e.message : '');
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    if (!this.canSave() || this.saving()) return;
    if (this.allergies().length > 0 && !this.allergyAck) {
      this.toast.warn('Confirm allergies', 'Please tick the allergy verification before saving.');
      return;
    }
    const id = this.appt()?.id;
    if (!id) return;
    this.saving.set(true);
    try {
      const r = await this.svc.recordTriage({
        appointmentId: id,
        bpSystolic: this.bpSys()!, bpDiastolic: this.bpDia()!,
        pulse: this.pulse()!,      respiratoryRate: this.rr()!,
        tempCelsius: this.temp()!, spo2Pct: this.spo2()!,
        bloodSugarMgdl: this.sugar(), painScore: this.painScore(),
        heightCm: this.height(),   weightKg: this.weight(),
        notes: this.notes?.trim() || null,
      });
      this.toast.success(
        'Triage saved',
        `MEWS ${r.mews_score} — ${r.fast_track_recommended ? 'fast-track suitable' : 'monitor closely'}`,
      );
      this.router.navigate(['/opd-queue']);
    } catch (e) {
      this.toast.error('Could not save triage', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
