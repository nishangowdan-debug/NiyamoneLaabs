import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StewardshipService } from '../data/stewardship.service';
import {
  CLASS_LABELS, RECOMMENDATION_LABELS, STATUS_LABELS,
  type AntibioticClass, type Recommendation, type ReviewStatus,
  type StewardshipAntibiotic, type StewardshipReview, type StewardshipUsageRow,
} from '../data/stewardship.types';

type Tab = 'pending' | 'reviewed' | 'flag' | 'aware' | 'usage';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Antibiotic Stewardship</h1>
    <p class="text-[12px] text-ink-soft">WHO AWaRe classification · pre-authorization · 48h post-review · NABH HIC / AMR</p>
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

  <!-- PENDING -->
  @if (tab() === 'pending') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">
        Pending Reviews
        <span class="ml-2 text-[11px] text-warn-fg">{{ overduePending().length }} overdue</span>
      </h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Antibiotic</th><th class="px-3 py-2">Class</th>
              <th class="px-3 py-2">Indication</th><th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">Culture?</th><th class="px-3 py-2">Due</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (r of pending(); track r.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="isOverdue(r) || aware(r) === 'reserve'"
                [class.bg-warn-fg]="aware(r) === 'watch'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ r.prescribed_at | date:'short' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ r.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2">
                {{ r.drug_name }}
                @if (r.dose || r.route) {
                  <div class="text-[10px] text-ink-soft">{{ r.dose }} {{ r.route }} {{ r.frequency }}</div>
                }
              </td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="aware(r) === 'access'"
                      [class.bg-warn-fg]="aware(r) === 'watch'"
                      [class.bg-danger-fg]="aware(r) === 'reserve'"
                      [class.bg-surface-subtle]="!aware(r)"
                      [class.text-white]="aware(r) === 'access' || aware(r) === 'watch' || aware(r) === 'reserve'">
                  {{ aware(r) ? aware(r)!.toUpperCase() : 'unclass' }}
                </span>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ r.indication || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.empirical_or_targeted }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.culture_sent ? '✓' : '⚠ no' }}</td>
              <td class="px-3 py-2 text-[11px]" [class.text-danger-fg]="isOverdue(r)">
                {{ r.review_due_at ? (r.review_due_at | date:'short') : '—' }}
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="approve(r)" class="text-[11px] text-good-fg hover:underline">Approve</button>
                <span class="mx-1">·</span>
                <button (click)="modify(r)" class="text-[11px] text-warn-fg hover:underline">Modify</button>
                <span class="mx-1">·</span>
                <button (click)="deny(r)" class="text-[11px] text-danger-fg hover:underline">Deny</button>
              </td>
            </tr>
          }
          @if (pending().length === 0) {
            <tr><td colspan="9" class="px-3 py-3 text-center text-ink-soft">No pending reviews.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- REVIEWED -->
  @if (tab() === 'reviewed') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Reviewed</th><th class="px-3 py-2">Antibiotic</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Recommendation</th><th class="px-3 py-2">Reviewer</th>
              <th class="px-3 py-2">Notes</th></tr>
        </thead>
        <tbody>
          @for (r of reviewed(); track r.id) {
            <tr class="border-t border-border"
                [class.bg-good-fg]="r.status === 'approved'"
                [class.bg-warn-fg]="r.status === 'approved_with_modification'"
                [class.bg-danger-fg]="r.status === 'denied' || r.status === 'escalated'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ r.reviewed_at | date:'short' }}</td>
              <td class="px-3 py-2">{{ r.drug_name }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ r.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ statusLabel(r.status) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.recommendation ? recommendationLabel(r.recommendation) : '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.reviewed_by_name || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.recommendation_notes || '—' }}</td>
            </tr>
          }
          @if (reviewed().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No reviews yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- FLAG -->
  @if (tab() === 'flag') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-2">
      <h3 class="text-sm font-semibold">+ Flag Antibiotic Prescription</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="fPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
          <input [(ngModel)]="fAdmissionId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Antibiotic *</span>
          <input [(ngModel)]="fDrugName" placeholder="e.g. Meropenem"
                 list="antibioticList"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          <datalist id="antibioticList">
            @for (a of antibiotics(); track a.id) {
              <option [value]="a.generic_name">{{ a.who_aware_class }}</option>
            }
          </datalist>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Dose</span>
          <input [(ngModel)]="fDose" placeholder="500 mg"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Route</span>
          <input [(ngModel)]="fRoute" placeholder="IV / PO / IM"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Frequency</span>
          <input [(ngModel)]="fFrequency" placeholder="TDS / BD / OD"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Duration (days)</span>
          <input type="number" [(ngModel)]="fDuration"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Indication *</span>
          <input [(ngModel)]="fIndication" placeholder="UTI / sepsis / pneumonia / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type</span>
          <select [(ngModel)]="fType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="empirical">Empirical</option>
            <option value="targeted">Targeted (culture-guided)</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-[12px] mt-5">
          <input type="checkbox" [(ngModel)]="fCultureSent" />
          Culture sent
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Prescribing doctor *</span>
          <input [(ngModel)]="fDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (fError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ fError() }}</p> }
        @if (fSuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ fSuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="flag()"
                  [disabled]="fBusy() || !fPatientId.trim() || !fDrugName.trim() || !fIndication.trim() || !fDoctor.trim()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ fBusy() ? 'Flagging…' : 'Flag for Stewardship' }}
          </button>
        </div>
      </div>
    </div>
  }

  <!-- AWARE LIST -->
  @if (tab() === 'aware') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">
        WHO AWaRe Classified Antibiotics ({{ antibiotics().length }})
      </h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Generic Name</th><th class="px-3 py-2">Class</th>
              <th class="px-3 py-2">Pre-auth?</th><th class="px-3 py-2">Review (h)</th>
              <th class="px-3 py-2">Approving Specialties</th>
              <th class="px-3 py-2 text-right">Max Days</th></tr>
        </thead>
        <tbody>
          @for (a of antibiotics(); track a.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="a.who_aware_class === 'reserve'"
                [class.bg-warn-fg]="a.who_aware_class === 'watch'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-semibold">{{ a.generic_name }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="a.who_aware_class === 'access'"
                      [class.bg-warn-fg]="a.who_aware_class === 'watch'"
                      [class.bg-danger-fg]="a.who_aware_class === 'reserve'"
                      [class.text-white]="true">
                  {{ classLabel(a.who_aware_class) }}
                </span>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ a.requires_pre_authorization ? '⚠ Yes' : 'No' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.requires_post_review_hours ?? '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.approving_specialties.join(', ') || '—' }}</td>
              <td class="px-3 py-2 text-right">{{ a.max_duration_days ?? '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- USAGE -->
  @if (tab() === 'usage') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">12-Week Usage Trends</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Week</th><th class="px-3 py-2">Antibiotic</th>
              <th class="px-3 py-2 text-right">Rx</th>
              <th class="px-3 py-2 text-right">Empirical</th>
              <th class="px-3 py-2 text-right">Targeted</th>
              <th class="px-3 py-2 text-right">Culture</th>
              <th class="px-3 py-2 text-right">De-esc</th>
              <th class="px-3 py-2 text-right">Disc</th>
              <th class="px-3 py-2 text-right">IV→PO</th></tr>
        </thead>
        <tbody>
          @for (u of usage(); track u.week + u.drug_name) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 text-[11px]">{{ u.week }}</td>
              <td class="px-3 py-2">{{ u.drug_name }}</td>
              <td class="px-3 py-2 text-right font-bold">{{ u.prescriptions }}</td>
              <td class="px-3 py-2 text-right">{{ u.empirical_count }}</td>
              <td class="px-3 py-2 text-right">{{ u.targeted_count }}</td>
              <td class="px-3 py-2 text-right">{{ u.culture_sent_count }}</td>
              <td class="px-3 py-2 text-right text-good-fg">{{ u.de_escalations }}</td>
              <td class="px-3 py-2 text-right text-danger-fg">{{ u.discontinuations }}</td>
              <td class="px-3 py-2 text-right">{{ u.iv_to_po_switches }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class StewardshipPage implements OnInit {
  private svc = inject(StewardshipService);

  protected tab = signal<Tab>('pending');
  protected antibiotics = signal<StewardshipAntibiotic[]>([]);
  protected reviews = signal<StewardshipReview[]>([]);
  protected usage = signal<StewardshipUsageRow[]>([]);

  // Flag form
  protected fPatientId = '';
  protected fAdmissionId = '';
  protected fDrugName = '';
  protected fDose = '';
  protected fRoute = '';
  protected fFrequency = '';
  protected fDuration: number | null = null;
  protected fIndication = '';
  protected fType: 'empirical' | 'targeted' = 'empirical';
  protected fCultureSent = false;
  protected fDoctor = '';
  protected fBusy = signal(false);
  protected fError = signal<string | null>(null);
  protected fSuccess = signal<string | null>(null);

  protected classLabel = (c: AntibioticClass) => CLASS_LABELS[c];
  protected statusLabel = (s: ReviewStatus) => STATUS_LABELS[s];
  protected recommendationLabel = (r: Recommendation) => RECOMMENDATION_LABELS[r];

  protected aware(r: StewardshipReview): AntibioticClass | null {
    if (!r.antibiotic_id) return null;
    return this.antibiotics().find(a => a.id === r.antibiotic_id)?.who_aware_class ?? null;
  }
  protected isOverdue(r: StewardshipReview): boolean {
    return !!r.review_due_at && r.status === 'pending' && new Date(r.review_due_at) < new Date();
  }

  protected pending = computed(() =>
    this.reviews().filter(r => r.status === 'pending')
      .sort((a, b) => +new Date(a.review_due_at || a.prescribed_at) - +new Date(b.review_due_at || b.prescribed_at)),
  );
  protected overduePending = computed(() => this.pending().filter(r => this.isOverdue(r)));
  protected reviewed = computed(() => this.reviews().filter(r => r.status !== 'pending'));

  protected tabs = [
    { id: 'pending'  as Tab, label: 'Pending',  count: () => this.pending().length },
    { id: 'reviewed' as Tab, label: 'Reviewed', count: () => this.reviewed().length },
    { id: 'flag'     as Tab, label: '+ Flag',   count: () => 0 },
    { id: 'aware'    as Tab, label: 'AWaRe Master', count: () => this.antibiotics().length },
    { id: 'usage'    as Tab, label: 'Usage',    count: () => this.usage().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [a, r, u] = await Promise.all([
        this.svc.listAntibiotics(),
        this.svc.listReviews({}),
        this.svc.usage(),
      ]);
      this.antibiotics.set(a);
      this.reviews.set(r);
      this.usage.set(u);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async flag() {
    if (!this.fPatientId.trim() || !this.fDrugName.trim() || !this.fIndication.trim() || !this.fDoctor.trim()) return;
    this.fBusy.set(true); this.fError.set(null); this.fSuccess.set(null);
    try {
      await this.svc.flag({
        patientId: this.fPatientId.trim(),
        drugName: this.fDrugName.trim(),
        indication: this.fIndication.trim(),
        prescribedByDoctorName: this.fDoctor.trim(),
        admissionId: this.fAdmissionId.trim() || null,
        dose: this.fDose.trim() || null,
        route: this.fRoute.trim() || null,
        frequency: this.fFrequency.trim() || null,
        durationDays: this.fDuration,
        empiricalOrTargeted: this.fType,
        cultureSent: this.fCultureSent,
      });
      this.fSuccess.set('Flagged for stewardship review.');
      this.fPatientId = ''; this.fAdmissionId = ''; this.fDrugName = '';
      this.fDose = ''; this.fRoute = ''; this.fFrequency = '';
      this.fDuration = null; this.fIndication = '';
      this.fCultureSent = false;
      await this.refresh();
      setTimeout(() => this.fSuccess.set(null), 3000);
    } catch (e: any) { this.fError.set(e?.message ?? 'Failed'); }
    finally { this.fBusy.set(false); }
  }

  protected async approve(r: StewardshipReview) {
    const reviewer = prompt('Reviewer name?'); if (!reviewer) return;
    const notes = prompt('Notes (optional)?') ?? '';
    try {
      await this.svc.review({
        id: r.id,
        recommendation: 'continue_as_prescribed',
        status: 'approved',
        reviewedByName: reviewer,
        notes: notes || null,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async modify(r: StewardshipReview) {
    const rec = prompt('Recommendation (de_escalate/change_drug/change_dose/iv_to_po/discontinue)?', 'de_escalate');
    if (!rec) return;
    const reviewer = prompt('Reviewer name?'); if (!reviewer) return;
    const notes = prompt('Modification details?') ?? '';
    try {
      await this.svc.review({
        id: r.id,
        recommendation: rec as Recommendation,
        status: 'approved_with_modification',
        reviewedByName: reviewer,
        notes,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async deny(r: StewardshipReview) {
    const reviewer = prompt('Reviewer name?'); if (!reviewer) return;
    const reason = prompt('Denial reason (mandatory)?');
    if (!reason) return;
    try {
      await this.svc.review({
        id: r.id,
        recommendation: 'discontinue',
        status: 'denied',
        reviewedByName: reviewer,
        notes: reason,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
