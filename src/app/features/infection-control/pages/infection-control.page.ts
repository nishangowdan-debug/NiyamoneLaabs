import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InfectionControlService } from '../data/infection-control.service';
import {
  HAI_STATUS_LABELS, HAI_TYPE_LABELS, ISOLATION_TYPE_LABELS, ORGANISM_CLASS_LABELS,
  WHO_MOMENT_LABELS,
  type HaiStatus, type HaiType, type HandHygieneAudit,
  type InfectionEvent, type IsolationPrecaution, type IsolationType,
  type OrganismClass, type WhoMoment,
} from '../data/infection-control.types';

type Tab = 'dashboard' | 'hai' | 'hand_hygiene' | 'isolation';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Infection Control &amp; Surveillance</h1>
    <p class="text-[12px] text-ink-soft">HAI registry · WHO 5 Moments · isolation precautions · NABH HICC</p>
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
        <p class="text-[10px] uppercase text-ink-soft">Open HAI Events</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="openEvents().length > 0">{{ openEvents().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Active Isolations</p>
        <p class="text-3xl font-bold mt-1">{{ activeIsolations().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">HH Compliance (30d avg)</p>
        <p class="text-3xl font-bold mt-1"
           [class.text-good-fg]="hhAvgLast30() >= 80"
           [class.text-warn-fg]="hhAvgLast30() >= 60 && hhAvgLast30() < 80"
           [class.text-danger-fg]="hhAvgLast30() < 60">
          {{ hhAvgLast30().toFixed(0) }}%
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Audits this month</p>
        <p class="text-3xl font-bold mt-1">{{ auditsThisMonth() }}</p>
      </div>
    </div>

    <div class="rounded-md border border-border bg-surface-card p-4">
      <h2 class="text-sm font-semibold mb-2">HAI by type (last 90 days)</h2>
      @if (eventsLast90().length === 0) {
        <p class="text-[12px] text-ink-soft">No HAI events in the last 90 days.</p>
      } @else {
        <div class="space-y-1.5">
          @for (row of haiByType(); track row.type) {
            <div class="flex items-center gap-2 text-[12px]">
              <span class="w-72 truncate">{{ haiTypeLabel(row.type) }}</span>
              <div class="flex-1 bg-surface-subtle rounded h-3 relative">
                <div class="absolute left-0 top-0 h-3 bg-danger-fg rounded"
                     [style.width.%]="(row.count / maxHaiCount()) * 100"></div>
              </div>
              <span class="w-12 text-right font-bold">{{ row.count }}</span>
            </div>
          }
        </div>
      }
    </div>
  }

  <!-- HAI -->
  @if (tab() === 'hai') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2 max-h-[80vh] overflow-y-auto">
        <h3 class="text-sm font-semibold">+ Report HAI</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="hPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID (optional)</span>
          <input [(ngModel)]="hAdmissionId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">HAI Type *</span>
          <select [(ngModel)]="hType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of haiTypeOptions; track t) { <option [value]="t">{{ haiTypeLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Onset Date *</span>
          <input type="date" [(ngModel)]="hOnsetDate"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Source / Device</span>
          <input [(ngModel)]="hSource" placeholder="central_line, foley, ventilator, etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Causative Organism</span>
          <input [(ngModel)]="hOrganism" placeholder="E. coli / S. aureus / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Organism Class</span>
          <select [(ngModel)]="hOrganismClass"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">—</option>
            @for (k of organismOptions; track k) { <option [value]="k">{{ organismLabel(k) }}</option> }
          </select>
        </label>
        <div class="rounded-md border border-border p-2 bg-surface-subtle">
          <p class="text-[10px] font-bold uppercase text-ink-soft mb-1">Resistance flags</p>
          <div class="grid grid-cols-2 gap-1">
            <label class="flex items-center gap-1 text-[11px]">
              <input type="checkbox" [(ngModel)]="rMrsa" /> MRSA
            </label>
            <label class="flex items-center gap-1 text-[11px]">
              <input type="checkbox" [(ngModel)]="rEsbl" /> ESBL
            </label>
            <label class="flex items-center gap-1 text-[11px]">
              <input type="checkbox" [(ngModel)]="rCarbapenem" /> Carbapenem-R
            </label>
            <label class="flex items-center gap-1 text-[11px]">
              <input type="checkbox" [(ngModel)]="rVre" /> VRE
            </label>
          </div>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reported by *</span>
          <input [(ngModel)]="hReporter"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (hError()) { <p class="text-[12px] text-danger-fg">{{ hError() }}</p> }
        <button (click)="reportHai()" [disabled]="hBusy() || !hCanSubmit()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ hBusy() ? 'Saving…' : 'Report HAI' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">HAI Events</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Event</th><th class="px-3 py-2">Onset</th>
                <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Organism</th><th class="px-3 py-2">Days</th>
                <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2 font-mono">{{ e.event_no }}</td>
                <td class="px-3 py-2">{{ e.onset_date }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ e.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ haiTypeLabel(e.hai_type) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ e.causative_organism || '—' }}</td>
                <td class="px-3 py-2">{{ e.days_after_admission ?? '—' }}d</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-warn-fg]="e.status === 'suspected'"
                        [class.bg-danger-fg]="e.status === 'confirmed'"
                        [class.bg-good-fg]="e.status === 'closed'"
                        [class.bg-surface-subtle]="e.status === 'ruled_out'"
                        [class.text-white]="e.status !== 'ruled_out'">
                    {{ statusLabel(e.status) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (e.status === 'suspected') {
                    <button (click)="setStatus(e, 'confirmed')" class="text-[11px] text-danger-fg hover:underline">Confirm</button>
                    <span class="mx-1">·</span>
                    <button (click)="setStatus(e, 'ruled_out')" class="text-[11px] text-good-fg hover:underline">Rule out</button>
                  }
                  @if (e.status === 'confirmed') {
                    <button (click)="closeEvent(e)" class="text-[11px] text-brand hover:underline">Close (RCA)</button>
                  }
                </td>
              </tr>
            }
            @if (events().length === 0) {
              <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No HAI events.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- HAND HYGIENE -->
  @if (tab() === 'hand_hygiene') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Log Audit</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Location *</span>
          <input [(ngModel)]="aLocation" placeholder="ICU / Ward 3 / OT-1"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Total Opportunities *</span>
            <input type="number" [(ngModel)]="aTotal"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Compliant *</span>
            <input type="number" [(ngModel)]="aComplied"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Role observed</span>
          <input [(ngModel)]="aRole" placeholder="doctor / nurse / housekeeping"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="rounded-md border border-border p-2 bg-surface-subtle">
          <p class="text-[10px] font-bold uppercase text-ink-soft mb-1">WHO 5 Moments observed</p>
          @for (m of whoMomentOptions; track m) {
            <label class="flex items-center gap-1.5 text-[11px] py-0.5">
              <input type="checkbox"
                     [checked]="aMoments().includes(m)"
                     (change)="toggleMoment(m, $event)" />
              {{ momentLabel(m) }}
            </label>
          }
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Audited by *</span>
          <input [(ngModel)]="aAuditor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (aError()) { <p class="text-[12px] text-danger-fg">{{ aError() }}</p> }
        <button (click)="logAudit()" [disabled]="aBusy() || !aCanSubmit()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ aBusy() ? 'Saving…' : 'Log Audit' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Audit History</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Date</th><th class="px-3 py-2">Location</th>
                <th class="px-3 py-2">Role</th><th class="px-3 py-2 text-right">Total</th>
                <th class="px-3 py-2 text-right">Compliant</th>
                <th class="px-3 py-2 text-right">%</th><th class="px-3 py-2">Auditor</th></tr>
          </thead>
          <tbody>
            @for (a of audits(); track a.id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2">{{ a.audit_date }}</td>
                <td class="px-3 py-2">{{ a.location }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.role_observed || '—' }}</td>
                <td class="px-3 py-2 text-right">{{ a.opportunities_total }}</td>
                <td class="px-3 py-2 text-right">{{ a.opportunities_complied }}</td>
                <td class="px-3 py-2 text-right font-bold"
                    [class.text-good-fg]="a.compliance_pct >= 80"
                    [class.text-warn-fg]="a.compliance_pct >= 60 && a.compliance_pct < 80"
                    [class.text-danger-fg]="a.compliance_pct < 60">
                  {{ a.compliance_pct }}%
                </td>
                <td class="px-3 py-2 text-[11px]">{{ a.audited_by_name }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- ISOLATION -->
  @if (tab() === 'isolation') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Start Isolation</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="iPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type *</span>
          <select [(ngModel)]="iType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="contact">Contact</option><option value="droplet">Droplet</option>
            <option value="airborne">Airborne</option><option value="protective">Protective</option>
            <option value="enhanced_contact">Enhanced contact</option>
            <option value="combined">Combined</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason *</span>
          <textarea rows="2" [(ngModel)]="iReason"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Suspected organism</span>
          <input [(ngModel)]="iOrganism"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Ordered by</span>
          <input [(ngModel)]="iDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (iError()) { <p class="text-[12px] text-danger-fg">{{ iError() }}</p> }
        <button (click)="startIso()" [disabled]="iBusy() || !iCanSubmit()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ iBusy() ? 'Saving…' : 'Start Isolation' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Active Isolations</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Reason</th><th class="px-3 py-2">Started</th>
                <th class="px-3 py-2">Days</th><th class="px-3 py-2">Doctor</th>
                <th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (i of activeIsolations(); track i.id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2 font-mono text-[10px]">{{ i.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2">{{ isoTypeLabel(i.isolation_type) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ i.reason }}</td>
                <td class="px-3 py-2">{{ i.started_at | date:'short' }}</td>
                <td class="px-3 py-2">{{ (i.days_in_isolation || 0).toFixed(1) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ i.ordered_by_doctor_name || '—' }}</td>
                <td class="px-3 py-2 text-right">
                  <button (click)="endIso(i)" class="text-[11px] text-brand hover:underline">End</button>
                </td>
              </tr>
            }
            @if (activeIsolations().length === 0) {
              <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No active isolations.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>
  `,
})
export class InfectionControlPage implements OnInit {
  private svc = inject(InfectionControlService);

  protected tab = signal<Tab>('dashboard');
  protected events = signal<InfectionEvent[]>([]);
  protected audits = signal<HandHygieneAudit[]>([]);
  protected isolations = signal<IsolationPrecaution[]>([]);

  protected openEvents      = computed(() => this.events().filter(e => e.status === 'suspected' || e.status === 'confirmed'));
  protected activeIsolations = computed(() => this.isolations().filter(i => !i.ended_at));
  protected eventsLast90 = computed(() => {
    const cutoff = Date.now() - 90 * 86_400_000;
    return this.events().filter(e => +new Date(e.onset_date) >= cutoff);
  });
  protected hhAvgLast30 = computed(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const recent = this.audits().filter(a => +new Date(a.audit_date) >= cutoff);
    if (recent.length === 0) return 0;
    const total = recent.reduce((s, a) => s + Number(a.compliance_pct), 0);
    return total / recent.length;
  });
  protected auditsThisMonth = computed(() => {
    const now = new Date();
    return this.audits().filter(a => {
      const d = new Date(a.audit_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  });
  protected haiByType = computed(() => {
    const map: Record<string, number> = {};
    for (const e of this.eventsLast90()) map[e.hai_type] = (map[e.hai_type] ?? 0) + 1;
    return Object.entries(map).map(([type, count]) => ({ type: type as HaiType, count })).sort((a,b) => b.count - a.count);
  });
  protected maxHaiCount = computed(() => Math.max(1, ...this.haiByType().map(r => r.count)));

  // HAI form
  protected hPatientId = '';
  protected hAdmissionId = '';
  protected hType: HaiType = 'clabsi';
  protected hOnsetDate = new Date().toISOString().slice(0, 10);
  protected hSource = '';
  protected hOrganism = '';
  protected hOrganismClass: OrganismClass | null = null;
  protected hReporter = '';
  protected rMrsa = false;
  protected rEsbl = false;
  protected rCarbapenem = false;
  protected rVre = false;
  protected hBusy = signal(false);
  protected hError = signal<string | null>(null);

  // Audit form
  protected aMoments = signal<WhoMoment[]>([]);
  protected aLocation = '';
  protected aTotal: number | null = null;
  protected aComplied: number | null = null;
  protected aRole = '';
  protected aAuditor = '';
  protected aBusy = signal(false);
  protected aError = signal<string | null>(null);

  // Isolation form
  protected iPatientId = '';
  protected iType: IsolationType = 'contact';
  protected iReason = '';
  protected iOrganism = '';
  protected iDoctor = '';
  protected iBusy = signal(false);
  protected iError = signal<string | null>(null);

  protected haiTypeOptions: HaiType[] = ['clabsi','cauti','vap','ssi','cdi','blood_stream','uti','pneumonia','meningitis','endometritis','gi_infection','skin_soft_tissue','other'];
  protected organismOptions: OrganismClass[] = ['gram_positive_cocci','gram_positive_bacilli','gram_negative_cocci','gram_negative_bacilli','mycobacterium','fungal','viral','parasitic','anaerobic','unknown'];
  protected whoMomentOptions: WhoMoment[] = ['before_patient_contact','before_aseptic_task','after_body_fluid_exposure','after_patient_contact','after_patient_surroundings'];

  protected haiTypeLabel = (t: HaiType) => HAI_TYPE_LABELS[t];
  protected organismLabel = (o: OrganismClass) => ORGANISM_CLASS_LABELS[o];
  protected isoTypeLabel = (t: IsolationType) => ISOLATION_TYPE_LABELS[t];
  protected momentLabel = (m: WhoMoment) => WHO_MOMENT_LABELS[m];
  protected statusLabel = (s: HaiStatus) => HAI_STATUS_LABELS[s];

  protected tabs = [
    { id: 'dashboard'    as Tab, label: 'Dashboard',     count: () => this.openEvents().length },
    { id: 'hai'          as Tab, label: 'HAI Events',    count: () => this.events().length },
    { id: 'hand_hygiene' as Tab, label: 'Hand Hygiene',  count: () => this.audits().length },
    { id: 'isolation'    as Tab, label: 'Isolation',     count: () => this.activeIsolations().length },
  ];

  protected hCanSubmit = () => !!this.hPatientId.trim() && !!this.hOnsetDate && !!this.hReporter.trim();
  protected aCanSubmit = () => !!this.aLocation.trim() && this.aTotal !== null && this.aComplied !== null && (this.aComplied <= (this.aTotal ?? 0)) && !!this.aAuditor.trim();
  protected iCanSubmit = () => !!this.iPatientId.trim() && !!this.iReason.trim();

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [e, a, i] = await Promise.all([
        this.svc.listEvents({}), this.svc.listAudits({}),
        this.svc.listIsolations(true),
      ]);
      this.events.set(e); this.audits.set(a); this.isolations.set(i);
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected toggleMoment(m: WhoMoment, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const set = new Set(this.aMoments());
    checked ? set.add(m) : set.delete(m);
    this.aMoments.set([...set]);
  }

  protected async reportHai() {
    if (!this.hCanSubmit() || this.hBusy()) return;
    this.hBusy.set(true); this.hError.set(null);
    try {
      await this.svc.reportHai({
        patientId: this.hPatientId.trim(),
        haiType: this.hType,
        onsetDate: this.hOnsetDate,
        reportedByName: this.hReporter.trim(),
        admissionId: this.hAdmissionId.trim() || null,
        sourceDevice: this.hSource.trim() || null,
        causativeOrganism: this.hOrganism.trim() || null,
        organismClass: this.hOrganismClass,
        resistance: { mrsa: this.rMrsa, esbl: this.rEsbl, carbapenem_resistant: this.rCarbapenem, vre: this.rVre },
      });
      this.hPatientId = ''; this.hAdmissionId = ''; this.hSource = '';
      this.hOrganism = ''; this.hOrganismClass = null;
      this.rMrsa = this.rEsbl = this.rCarbapenem = this.rVre = false;
      await this.refresh();
    } catch (e: any) { this.hError.set(e?.message ?? 'Failed'); }
    finally { this.hBusy.set(false); }
  }

  protected async setStatus(e: InfectionEvent, status: HaiStatus) {
    try { await this.svc.setHaiStatus(e.id, status); await this.refresh(); }
    catch (err: any) { alert(err?.message ?? 'Failed'); }
  }
  protected async closeEvent(e: InfectionEvent) {
    const rca = prompt('Root cause analysis?'); if (!rca) return;
    const corrective = prompt('Corrective actions?') ?? '';
    try { await this.svc.setHaiStatus(e.id, 'closed', rca, corrective); await this.refresh(); }
    catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected async logAudit() {
    if (!this.aCanSubmit() || this.aBusy()) return;
    this.aBusy.set(true); this.aError.set(null);
    try {
      await this.svc.logAudit({
        location: this.aLocation.trim(),
        opportunitiesTotal: this.aTotal!,
        opportunitiesComplied: this.aComplied!,
        auditedByName: this.aAuditor.trim(),
        roleObserved: this.aRole.trim() || null,
        momentsObserved: this.aMoments(),
      });
      this.aLocation = ''; this.aTotal = null; this.aComplied = null;
      this.aRole = ''; this.aMoments.set([]);
      await this.refresh();
    } catch (e: any) { this.aError.set(e?.message ?? 'Failed'); }
    finally { this.aBusy.set(false); }
  }

  protected async startIso() {
    if (!this.iCanSubmit() || this.iBusy()) return;
    this.iBusy.set(true); this.iError.set(null);
    try {
      await this.svc.startIsolation({
        patientId: this.iPatientId.trim(),
        isolationType: this.iType,
        reason: this.iReason.trim(),
        organismSuspected: this.iOrganism.trim() || null,
        orderedByDoctorName: this.iDoctor.trim() || null,
      });
      this.iPatientId = ''; this.iReason = ''; this.iOrganism = '';
      await this.refresh();
    } catch (e: any) { this.iError.set(e?.message ?? 'Failed'); }
    finally { this.iBusy.set(false); }
  }

  protected async endIso(i: IsolationPrecaution) {
    const reason = prompt('Reason for ending isolation?') ?? '';
    if (!reason) return;
    try { await this.svc.endIsolation(i.id, reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
