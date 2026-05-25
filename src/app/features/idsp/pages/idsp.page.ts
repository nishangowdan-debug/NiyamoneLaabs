import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdspService } from '../data/idsp.service';
import {
  CLASSIFICATION_LABELS, OUTCOME_LABELS, PRIORITY_LABELS, STATUS_LABELS,
  type CaseClassification, type DiseaseNotification, type DiseaseOutcome,
  type IdspWeeklyRow, type NotifiableDisease, type NotificationStatus,
} from '../data/idsp.types';

type Tab = 'dashboard' | 'pending' | 'all' | 'notify' | 'diseases';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">IDSP / Notifiable Diseases</h1>
    <p class="text-[12px] text-ink-soft">Public health surveillance · district / state authority reporting · outbreak detection</p>
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
        <p class="text-[10px] uppercase text-ink-soft">Total Notifications (12 wk)</p>
        <p class="text-3xl font-bold mt-1">{{ totalCases12w() }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Pending Submission</p>
        <p class="text-3xl font-bold mt-1" [class.text-warn-fg]="pendingCount() > 0">{{ pendingCount() }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Outbreak Alerts (this wk)</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="outbreakAlerts().length > 0">{{ outbreakAlerts().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Confirmed Deaths</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="totalDeaths12w() > 0">{{ totalDeaths12w() }}</p>
      </div>
    </div>

    @if (outbreakAlerts().length > 0) {
      <div class="rounded-md border border-danger-fg bg-danger-fg/5 p-4">
        <h3 class="text-sm font-semibold mb-2 text-danger-fg">⚠ Outbreak Alerts</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Disease</th><th class="px-2 py-1">Week</th>
                <th class="px-2 py-1 text-right">Cases</th><th class="px-2 py-1 text-right">Threshold</th>
                <th class="px-2 py-1 text-right">Deaths</th></tr>
          </thead>
          <tbody>
            @for (a of outbreakAlerts(); track a.disease_id + a.week_start) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ a.name }}</td>
                <td class="px-2 py-1 text-[11px]">{{ a.week_start }}</td>
                <td class="px-2 py-1 text-right font-bold text-danger-fg">{{ a.case_count }}</td>
                <td class="px-2 py-1 text-right">{{ a.outbreak_threshold }}</td>
                <td class="px-2 py-1 text-right">{{ a.deaths }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <div class="rounded-md border border-border bg-surface-card p-4">
      <h3 class="text-sm font-semibold mb-2">Weekly Trend (last 12 weeks)</h3>
      @if (weekly().length === 0) {
        <p class="text-[12px] text-ink-soft">No notifications in the last 12 weeks.</p>
      } @else {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Disease</th><th class="px-2 py-1">Week</th>
                <th class="px-2 py-1 text-right">Cases</th><th class="px-2 py-1 text-right">Confirmed</th>
                <th class="px-2 py-1 text-right">Deaths</th></tr>
          </thead>
          <tbody>
            @for (w of weekly(); track w.disease_id + w.week_start) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ w.name }}</td>
                <td class="px-2 py-1 text-[11px]">{{ w.week_start }}</td>
                <td class="px-2 py-1 text-right">{{ w.case_count }}</td>
                <td class="px-2 py-1 text-right">{{ w.confirmed_count }}</td>
                <td class="px-2 py-1 text-right">{{ w.deaths }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  }

  <!-- PENDING / ALL -->
  @if (tab() === 'pending' || tab() === 'all') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">No</th><th class="px-3 py-2">Disease</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Onset</th>
              <th class="px-3 py-2">Classification</th><th class="px-3 py-2">Outcome</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (n of (tab() === 'pending' ? pending() : notifications()); track n.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="n.outcome === 'deceased' || isImmediate(n.disease_id)"
                [class.bg-warn-fg]="n.case_classification === 'suspected' && !isImmediate(n.disease_id)"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ n.notification_no }}</td>
              <td class="px-3 py-2 text-[11px]">{{ diseaseName(n.disease_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ n.patient_name }} ({{ n.patient_age || '?' }}{{ n.patient_gender?.charAt(0)?.toUpperCase() }})</td>
              <td class="px-3 py-2 text-[11px]">{{ n.onset_date }}</td>
              <td class="px-3 py-2 text-[11px]">{{ classificationLabel(n.case_classification) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ outcomeLabel(n.outcome) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="n.status === 'acknowledged' || n.status === 'closed'"
                      [class.bg-warn-fg]="n.status === 'reported_internally' || n.status === 'submitted_to_idsp'"
                      [class.bg-danger-fg]="n.status === 'draft'"
                      [class.text-white]="n.status !== 'closed'">
                  {{ statusLabel(n.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (n.status === 'reported_internally' || n.status === 'draft') {
                  <button (click)="submitToIdsp(n)" class="text-[11px] text-brand hover:underline">Submit IDSP</button>
                  <span class="mx-1">·</span>
                }
                @if (n.status === 'submitted_to_idsp') {
                  <button (click)="recordAck(n)" class="text-[11px] text-good-fg hover:underline">Record Ack</button>
                  <span class="mx-1">·</span>
                }
                <button (click)="updateOutcome(n)" class="text-[11px] text-warn-fg hover:underline">Outcome</button>
                @if (n.status !== 'closed') {
                  <span class="mx-1">·</span>
                  <button (click)="closeCase(n)" class="text-[11px] text-ink-soft hover:underline">Close</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- NOTIFY -->
  @if (tab() === 'notify') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-2">
      <h3 class="text-sm font-semibold">+ Notify Case</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Disease *</span>
          <select [(ngModel)]="nDiseaseId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (d of diseases(); track d.id) {
              <option [ngValue]="d.id">{{ d.code }} · {{ d.name }} ({{ priorityLabel(d.priority) }})</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient name *</span>
          <input [(ngModel)]="nPatientName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID (UUID)</span>
          <input [(ngModel)]="nPatientId" placeholder="optional"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <div class="grid grid-cols-3 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Age</span>
            <input type="number" [(ngModel)]="nAge"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block col-span-2">
            <span class="text-[10px] uppercase text-ink-soft">Gender</span>
            <select [(ngModel)]="nGender"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option [ngValue]="null">—</option>
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Phone</span>
          <input [(ngModel)]="nPhone"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">District / Pincode</span>
          <input [(ngModel)]="nDistrictPincode" placeholder="District · 600001"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Address</span>
          <textarea rows="2" [(ngModel)]="nAddress"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Onset date *</span>
          <input type="date" [(ngModel)]="nOnsetDate"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Classification</span>
          <select [(ngModel)]="nClassification"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="suspected">Suspected</option>
            <option value="probable">Probable</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Symptoms (comma-separated)</span>
          <input [(ngModel)]="nSymptoms" placeholder="fever, rash, joint pain"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Lab results</span>
          <textarea rows="2" [(ngModel)]="nLabResults"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Travel history</span>
          <textarea rows="2" [(ngModel)]="nTravel"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Contact history</span>
          <textarea rows="2" [(ngModel)]="nContact"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Reporting doctor *</span>
          <input [(ngModel)]="nDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (nError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ nError() }}</p> }
        @if (nSuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ nSuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="notify()"
                  [disabled]="nBusy() || !canSubmit()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ nBusy() ? 'Notifying…' : 'Notify Case' }}
          </button>
        </div>
      </div>
    </div>
  }

  <!-- DISEASES MASTER -->
  @if (tab() === 'diseases') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Disease</th>
              <th class="px-3 py-2">Category</th><th class="px-3 py-2">ICD-10</th>
              <th class="px-3 py-2">Priority</th><th class="px-3 py-2">Form</th>
              <th class="px-3 py-2 text-right">Outbreak Threshold</th></tr>
        </thead>
        <tbody>
          @for (d of diseases(); track d.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="d.priority === 'immediate'"
                [class.bg-warn-fg]="d.priority === '24_hour'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ d.code }}</td>
              <td class="px-3 py-2">{{ d.name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ d.category || '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ d.icd10_codes.join(', ') }}</td>
              <td class="px-3 py-2 text-[11px]">{{ priorityLabel(d.priority) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ d.reporting_form || '—' }}</td>
              <td class="px-3 py-2 text-right">{{ d.outbreak_threshold ?? '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class IdspPage implements OnInit {
  private svc = inject(IdspService);

  protected tab = signal<Tab>('dashboard');
  protected diseases = signal<NotifiableDisease[]>([]);
  protected notifications = signal<DiseaseNotification[]>([]);
  protected weekly = signal<IdspWeeklyRow[]>([]);

  // Notify form
  protected nDiseaseId: string | null = null;
  protected nPatientName = '';
  protected nPatientId = '';
  protected nAge: number | null = null;
  protected nGender: 'male' | 'female' | 'other' | null = null;
  protected nPhone = '';
  protected nDistrictPincode = '';
  protected nAddress = '';
  protected nOnsetDate = new Date().toISOString().slice(0, 10);
  protected nClassification: CaseClassification = 'suspected';
  protected nSymptoms = '';
  protected nLabResults = '';
  protected nTravel = '';
  protected nContact = '';
  protected nDoctor = '';
  protected nBusy = signal(false);
  protected nError = signal<string | null>(null);
  protected nSuccess = signal<string | null>(null);

  protected priorityLabel = (p: any) => PRIORITY_LABELS[p as keyof typeof PRIORITY_LABELS] ?? p;
  protected statusLabel = (s: NotificationStatus) => STATUS_LABELS[s];
  protected outcomeLabel = (o: DiseaseOutcome) => OUTCOME_LABELS[o];
  protected classificationLabel = (c: CaseClassification) => CLASSIFICATION_LABELS[c];
  protected diseaseName = (id: string) => this.diseases().find(d => d.id === id)?.name ?? id.slice(0,8);
  protected isImmediate(diseaseId: string): boolean {
    return this.diseases().find(d => d.id === diseaseId)?.priority === 'immediate';
  }

  protected pending = computed(() =>
    this.notifications().filter(n =>
      n.status === 'draft' || n.status === 'reported_internally' || n.status === 'submitted_to_idsp'),
  );
  protected pendingCount = computed(() => this.pending().length);

  protected outbreakAlerts = computed(() => {
    const thisWeek = this.getCurrentWeekStart();
    return this.weekly().filter(w =>
      w.week_start === thisWeek && w.outbreak_threshold !== null
      && w.case_count >= (w.outbreak_threshold as number),
    );
  });

  protected totalCases12w = computed(() => this.weekly().reduce((s, w) => s + w.case_count, 0));
  protected totalDeaths12w = computed(() => this.weekly().reduce((s, w) => s + w.deaths, 0));

  protected canSubmit = () =>
    !!this.nDiseaseId && !!this.nPatientName.trim() && !!this.nOnsetDate && !!this.nDoctor.trim();

  protected tabs = [
    { id: 'dashboard' as Tab, label: 'Dashboard',  count: () => this.outbreakAlerts().length },
    { id: 'pending'   as Tab, label: 'Pending',    count: () => this.pendingCount() },
    { id: 'all'       as Tab, label: 'All',        count: () => this.notifications().length },
    { id: 'notify'    as Tab, label: '+ Notify',   count: () => 0 },
    { id: 'diseases'  as Tab, label: 'Diseases',   count: () => this.diseases().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private getCurrentWeekStart(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0,0,0,0);
    return monday.toISOString().slice(0,10);
  }

  private async refresh() {
    try {
      const [d, n, w] = await Promise.all([
        this.svc.listDiseases(),
        this.svc.listNotifications({}),
        this.svc.weeklySummary(),
      ]);
      this.diseases.set(d);
      this.notifications.set(n);
      this.weekly.set(w);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async notify() {
    if (!this.canSubmit()) return;
    this.nBusy.set(true); this.nError.set(null); this.nSuccess.set(null);
    try {
      const parts = this.nDistrictPincode.split('·').map(s => s.trim());
      const district = parts[0] || null;
      const pincode = parts[1] || null;
      await this.svc.notify({
        diseaseId: this.nDiseaseId!,
        patientName: this.nPatientName.trim(),
        onsetDate: this.nOnsetDate,
        reportedByDoctorName: this.nDoctor.trim(),
        caseClassification: this.nClassification,
        patientId: this.nPatientId.trim() || null,
        patientAge: this.nAge,
        patientGender: this.nGender,
        patientPhone: this.nPhone.trim() || null,
        patientDistrict: district,
        patientPincode: pincode,
        patientAddress: this.nAddress.trim() || null,
        symptoms: this.nSymptoms.split(',').map(s => s.trim()).filter(s => s),
        laboratoryResults: this.nLabResults.trim() || null,
        travelHistory: this.nTravel.trim() || null,
        contactHistory: this.nContact.trim() || null,
      });
      this.nSuccess.set('Case notified internally. Submit to IDSP from Pending tab.');
      this.nPatientName = ''; this.nPatientId = ''; this.nAge = null;
      this.nGender = null; this.nPhone = ''; this.nDistrictPincode = '';
      this.nAddress = ''; this.nSymptoms = '';
      this.nLabResults = ''; this.nTravel = ''; this.nContact = '';
      await this.refresh();
      setTimeout(() => this.nSuccess.set(null), 4000);
    } catch (e: any) { this.nError.set(e?.message ?? 'Failed'); }
    finally { this.nBusy.set(false); }
  }

  protected async submitToIdsp(n: DiseaseNotification) {
    const ack = prompt('IDSP acknowledgement no (optional)?') ?? '';
    try { await this.svc.submitToIdsp(n.id, ack || undefined); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async recordAck(n: DiseaseNotification) {
    const ack = prompt('IDSP acknowledgement no?');
    if (!ack) return;
    try { await this.svc.submitToIdsp(n.id, ack); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async updateOutcome(n: DiseaseNotification) {
    const outcome = prompt('Outcome (alive_recovered/alive_under_treatment/discharged/transferred/deceased/lost_to_followup/unknown)?', n.outcome);
    if (!outcome) return;
    let dod: string | null = null;
    let cause: string | null = null;
    if (outcome === 'deceased') {
      dod = prompt('Date of death (YYYY-MM-DD)?');
      cause = prompt('Cause of death?');
    }
    try {
      await this.svc.updateOutcome({
        id: n.id,
        outcome: outcome as DiseaseOutcome,
        dateOfDeath: dod,
        causeOfDeath: cause,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async closeCase(n: DiseaseNotification) {
    const notes = prompt('Closing notes?') ?? '';
    try { await this.svc.close(n.id, notes); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
