import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TelemedicineService } from '../data/telemedicine.service';
import {
  CONSULT_TYPE_LABELS, PROVIDER_LABELS, STATUS_LABELS,
  type TeleConsultType, type TeleProvider, type TeleSession, type TeleSessionStatus,
} from '../data/telemedicine.types';

type Tab = 'today' | 'upcoming' | 'history' | 'schedule';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Telemedicine</h1>
    <p class="text-[12px] text-ink-soft">Video consultations · waiting room · MoHFW Telemedicine Practice Guidelines compliant</p>
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

  <!-- TODAY -->
  @if (tab() === 'today') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Today's Sessions</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Session</th><th class="px-3 py-2">Time</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Doctor</th>
              <th class="px-3 py-2">Type</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Consent</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (s of today(); track s.id) {
            <tr class="border-t border-border"
                [class.bg-warn-fg]="s.status === 'waiting_room'"
                [class.bg-good-fg]="s.status === 'in_progress'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ s.session_no }}</td>
              <td class="px-3 py-2 text-[11px]">{{ s.scheduled_at | date:'shortTime' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ s.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ s.doctor_name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ consultTypeLabel(s.consult_type) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-warn-fg]="s.status === 'waiting_room' || s.status === 'scheduled'"
                      [class.bg-good-fg]="s.status === 'in_progress'"
                      [class.bg-surface-subtle]="s.status === 'completed' || s.status === 'cancelled'"
                      [class.bg-danger-fg]="s.status === 'no_show' || s.status === 'technical_failure'"
                      [class.text-white]="['waiting_room','scheduled','in_progress','no_show','technical_failure'].includes(s.status)">
                  {{ statusLabel(s.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-[11px]">
                {{ s.patient_consent_recorded ? '✓' : '⚠ pending' }}
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (!s.patient_consent_recorded && s.status !== 'completed' && s.status !== 'cancelled') {
                  <button (click)="recordConsent(s)" class="text-[11px] text-warn-fg hover:underline">Get consent</button>
                  <span class="mx-1">·</span>
                }
                @if (s.status === 'scheduled' && s.patient_consent_recorded) {
                  <button (click)="markPatientJoined(s)" class="text-[11px] text-brand hover:underline">Patient joined</button>
                }
                @if ((s.status === 'scheduled' || s.status === 'waiting_room') && s.patient_consent_recorded) {
                  <span class="mx-1">·</span>
                  <button (click)="startSession(s)" class="text-[11px] text-good-fg hover:underline">Start</button>
                }
                @if (s.status === 'in_progress') {
                  <button (click)="endSession(s)" class="text-[11px] text-brand hover:underline">End</button>
                }
                @if (s.meeting_url) {
                  <span class="mx-1">·</span>
                  <a [href]="s.meeting_url" target="_blank" class="text-[11px] text-brand hover:underline">Join Link</a>
                }
                @if (s.status === 'scheduled' || s.status === 'waiting_room') {
                  <span class="mx-1">·</span>
                  <button (click)="markNoShow(s)" class="text-[11px] text-danger-fg hover:underline">No-show</button>
                }
              </td>
            </tr>
          }
          @if (today().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No sessions today.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- UPCOMING / HISTORY -->
  @if (tab() === 'upcoming' || tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Session</th><th class="px-3 py-2">Scheduled</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Doctor</th>
              <th class="px-3 py-2">Type</th><th class="px-3 py-2">Provider</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2">Duration</th></tr>
        </thead>
        <tbody>
          @for (s of (tab() === 'upcoming' ? upcoming() : history()); track s.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono">{{ s.session_no }}</td>
              <td class="px-3 py-2 text-[11px]">{{ s.scheduled_at | date:'short' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ s.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ s.doctor_name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ consultTypeLabel(s.consult_type) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ providerLabel(s.provider) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ statusLabel(s.status) }}</td>
              <td class="px-3 py-2 text-[11px]">
                {{ s.actual_duration_minutes ? s.actual_duration_minutes + 'm' : '—' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- SCHEDULE -->
  @if (tab() === 'schedule') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-xl space-y-2">
      <h3 class="text-sm font-semibold">+ Schedule Session</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
        <input [(ngModel)]="sPatientId" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Doctor name *</span>
        <input [(ngModel)]="sDoctorName"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Scheduled at *</span>
        <input type="datetime-local" [(ngModel)]="sScheduledAt"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Consult type</span>
          <select [(ngModel)]="sType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of consultTypes; track t) { <option [value]="t">{{ consultTypeLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Provider</span>
          <select [(ngModel)]="sProvider"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (p of providers; track p) { <option [value]="p">{{ providerLabel(p) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Duration (min)</span>
          <input type="number" min="5" [(ngModel)]="sDuration"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Fee (₹)</span>
          <input type="number" [(ngModel)]="sFee"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
      </div>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Meeting URL</span>
        <input [(ngModel)]="sUrl" placeholder="https://meet.jit.si/abc-xyz"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Passcode</span>
        <input [(ngModel)]="sPasscode"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      @if (sError()) { <p class="text-[12px] text-danger-fg">{{ sError() }}</p> }
      @if (sSuccess()) { <p class="text-[12px] text-good-fg">{{ sSuccess() }}</p> }
      <div class="flex justify-end">
        <button (click)="schedule()"
                [disabled]="sBusy() || !sPatientId.trim() || !sDoctorName.trim() || !sScheduledAt"
                class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ sBusy() ? 'Scheduling…' : 'Schedule Session' }}
        </button>
      </div>
    </div>
  }
</section>
  `,
})
export class TelemedicinePage implements OnInit {
  private svc = inject(TelemedicineService);

  protected tab = signal<Tab>('today');
  protected today = signal<TeleSession[]>([]);
  protected all = signal<TeleSession[]>([]);

  // Schedule form
  protected sPatientId = '';
  protected sDoctorName = '';
  protected sScheduledAt = '';
  protected sType: TeleConsultType = 'first_consultation';
  protected sProvider: TeleProvider = 'jitsi';
  protected sDuration: number | null = 15;
  protected sFee: number | null = null;
  protected sUrl = '';
  protected sPasscode = '';
  protected sBusy = signal(false);
  protected sError = signal<string | null>(null);
  protected sSuccess = signal<string | null>(null);

  protected consultTypes: TeleConsultType[] = ['first_consultation','follow_up','second_opinion','prescription_renewal','tele_icu','specialist_referral'];
  protected providers: TeleProvider[] = ['jitsi','zoom','google_meet','webex','ms_teams','custom_webrtc','phone','whatsapp_video'];

  protected statusLabel = (s: TeleSessionStatus) => STATUS_LABELS[s];
  protected providerLabel = (p: TeleProvider) => PROVIDER_LABELS[p];
  protected consultTypeLabel = (t: TeleConsultType) => CONSULT_TYPE_LABELS[t];

  protected upcoming = computed(() =>
    this.all().filter(s => +new Date(s.scheduled_at) > Date.now() && s.status !== 'cancelled')
      .sort((a,b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
  );
  protected history = computed(() =>
    this.all().filter(s => s.status === 'completed' || s.status === 'cancelled' || s.status === 'no_show')
      .sort((a,b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
  );

  protected tabs = [
    { id: 'today'    as Tab, label: 'Today',    count: () => this.today().length },
    { id: 'upcoming' as Tab, label: 'Upcoming', count: () => this.upcoming().length },
    { id: 'history'  as Tab, label: 'History',  count: () => this.history().length },
    { id: 'schedule' as Tab, label: '+ Schedule', count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [today, all] = await Promise.all([this.svc.listToday(), this.svc.listAll({})]);
      this.today.set(today);
      this.all.set(all);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async schedule() {
    if (!this.sPatientId.trim() || !this.sDoctorName.trim() || !this.sScheduledAt) return;
    this.sBusy.set(true); this.sError.set(null); this.sSuccess.set(null);
    try {
      await this.svc.schedule({
        patientId: this.sPatientId.trim(),
        doctorName: this.sDoctorName.trim(),
        scheduledAt: new Date(this.sScheduledAt).toISOString(),
        consultType: this.sType,
        provider: this.sProvider,
        durationMinutes: this.sDuration ?? 15,
        meetingUrl: this.sUrl.trim() || null,
        passcode: this.sPasscode.trim() || null,
        feeCents: this.sFee ? Math.round(this.sFee * 100) : null,
      });
      this.sSuccess.set('Session scheduled.');
      this.sPatientId = ''; this.sDoctorName = ''; this.sScheduledAt = '';
      this.sUrl = ''; this.sPasscode = ''; this.sFee = null;
      await this.refresh();
      setTimeout(() => this.sSuccess.set(null), 3000);
    } catch (e: any) { this.sError.set(e?.message ?? 'Failed'); }
    finally { this.sBusy.set(false); }
  }

  protected async recordConsent(s: TeleSession) {
    try { await this.svc.recordConsent(s.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async markPatientJoined(s: TeleSession) {
    try { await this.svc.patientJoin(s.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async startSession(s: TeleSession) {
    try { await this.svc.doctorStart(s.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async endSession(s: TeleSession) {
    const notes = prompt('Consultation notes?') ?? '';
    const score = prompt('Technical quality (1-5)?') ?? '';
    try {
      await this.svc.end({
        id: s.id,
        consultationNotes: notes.trim() || null,
        qualityScore: score ? Number(score) : null,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async markNoShow(s: TeleSession) {
    try { await this.svc.noShow(s.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
