import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeedbackService } from '../data/feedback.service';
import {
  COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, SCOPE_LABELS,
  type Complaint, type ComplaintCategory, type ComplaintSeverity, type ComplaintStatus,
  type FeedbackResponse, type FeedbackSurvey, type FeedbackWeeklySummary,
  type SurveyQuestion,
} from '../data/feedback.types';

type Tab = 'dashboard' | 'responses' | 'submit' | 'complaints';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Patient Feedback &amp; Complaints</h1>
    <p class="text-[12px] text-ink-soft">NABH-aligned satisfaction surveys · NPS · complaint workflow</p>
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
        <p class="text-[10px] uppercase text-ink-soft">Responses (4w)</p>
        <p class="text-3xl font-bold mt-1">{{ totalResponses4w() }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Avg Rating (4w)</p>
        <p class="text-3xl font-bold mt-1"
           [class.text-good-fg]="avgRating4w() >= 4"
           [class.text-warn-fg]="avgRating4w() >= 3 && avgRating4w() < 4"
           [class.text-danger-fg]="avgRating4w() < 3 && avgRating4w() > 0">
          {{ avgRating4w().toFixed(2) }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">NPS (4w)</p>
        <p class="text-3xl font-bold mt-1"
           [class.text-good-fg]="nps4w() >= 50"
           [class.text-warn-fg]="nps4w() >= 0 && nps4w() < 50"
           [class.text-danger-fg]="nps4w() < 0">
          {{ nps4w().toFixed(0) }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Open Complaints</p>
        <p class="text-3xl font-bold mt-1"
           [class.text-danger-fg]="openComplaintsCount() > 0">{{ openComplaintsCount() }}</p>
      </div>
    </div>

    <div class="rounded-md border border-border bg-surface-card p-4">
      <h3 class="text-sm font-semibold mb-2">Weekly trend (last 12 weeks)</h3>
      @if (weekly().length === 0) {
        <p class="text-[12px] text-ink-soft">No data yet.</p>
      } @else {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Week</th><th class="px-2 py-1 text-right">Responses</th>
                <th class="px-2 py-1 text-right">Avg Rating</th><th class="px-2 py-1 text-right">Avg NPS</th>
                <th class="px-2 py-1 text-right">Negative</th><th class="px-2 py-1 text-right">Pending follow-up</th></tr>
          </thead>
          <tbody>
            @for (w of weekly(); track w.week) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ w.week }}</td>
                <td class="px-2 py-1 text-right">{{ w.responses }}</td>
                <td class="px-2 py-1 text-right">{{ w.avg_rating ?? '—' }}</td>
                <td class="px-2 py-1 text-right">{{ w.avg_nps ?? '—' }}</td>
                <td class="px-2 py-1 text-right text-danger-fg">{{ w.negative_count }}</td>
                <td class="px-2 py-1 text-right">{{ w.pending_followup }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  }

  <!-- RESPONSES -->
  @if (tab() === 'responses') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Survey</th>
              <th class="px-3 py-2">Rating</th><th class="px-3 py-2">NPS</th>
              <th class="px-3 py-2">Sentiment</th><th class="px-3 py-2">Department</th>
              <th class="px-3 py-2">Follow-up</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Comments</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (r of responses(); track r.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="r.sentiment === 'negative'"
                [class.bg-good-fg]="r.sentiment === 'positive'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ r.submitted_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ surveyTitle(r.survey_id) }}</td>
              <td class="px-3 py-2 text-center font-bold">{{ r.overall_rating ?? '—' }}</td>
              <td class="px-3 py-2 text-center">{{ r.nps_score ?? '—' }}</td>
              <td class="px-3 py-2">
                @if (r.sentiment) {
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="r.sentiment === 'positive'"
                        [class.bg-warn-fg]="r.sentiment === 'neutral'"
                        [class.bg-danger-fg]="r.sentiment === 'negative'"
                        [class.text-white]="true">{{ r.sentiment }}</span>
                } @else { — }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ r.department || '—' }}</td>
              <td class="px-3 py-2">{{ r.follow_up_required ? '⚠ Yes' : 'No' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.status }}</td>
              <td class="px-3 py-2 text-[11px]">{{ truncate(r.free_text_comments || '', 40) }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (r.status === 'new') {
                  <button (click)="markReviewed(r)" class="text-[11px] text-brand hover:underline">Reviewed</button>
                  <span class="mx-1">·</span>
                  <button (click)="spawnComplaint(r)" class="text-[11px] text-danger-fg hover:underline">→ Complaint</button>
                }
              </td>
            </tr>
          }
          @if (responses().length === 0) {
            <tr><td colspan="10" class="px-3 py-3 text-center text-ink-soft">No responses yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- SUBMIT -->
  @if (tab() === 'submit') {
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
        <h3 class="text-sm font-semibold">Submit Feedback</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Survey *</span>
          <select [(ngModel)]="selectedSurveyId" (ngModelChange)="onSurveyChange($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of surveys(); track s.id) {
              <option [ngValue]="s.id">{{ s.title }} ({{ scopeLabel(s.scope) }})</option>
            }
          </select>
        </label>
        @if (selectedSurvey(); as sv) {
          @if (sv.intro_text) { <p class="text-[12px] text-ink-soft">{{ sv.intro_text }}</p> }
          <div class="space-y-2">
            @for (q of sv.questions; track q.key) {
              @if (q.type === 'rating') {
                <div>
                  <p class="text-[12px]">{{ q.label }}</p>
                  <div class="flex gap-1 mt-1">
                    @for (i of ratingScale(q.scale_max ?? 5); track i) {
                      <button type="button" (click)="setAnswer(q.key, i)"
                              class="w-8 h-8 rounded border text-[12px] font-bold"
                              [class.bg-brand]="answers()[q.key] === i"
                              [class.text-white]="answers()[q.key] === i"
                              [class.border-border]="answers()[q.key] !== i">
                        {{ i }}
                      </button>
                    }
                  </div>
                </div>
              }
              @if (q.type === 'nps') {
                <div>
                  <p class="text-[12px]">{{ q.label }}</p>
                  <div class="flex gap-1 mt-1 flex-wrap">
                    @for (i of npsScale(); track i) {
                      <button type="button" (click)="setAnswer(q.key, i)"
                              class="w-7 h-7 rounded border text-[11px] font-bold"
                              [class.bg-good-fg]="answers()[q.key] === i && i >= 9"
                              [class.bg-warn-fg]="answers()[q.key] === i && i >= 7 && i < 9"
                              [class.bg-danger-fg]="answers()[q.key] === i && i < 7"
                              [class.text-white]="answers()[q.key] === i"
                              [class.border-border]="answers()[q.key] !== i">
                        {{ i }}
                      </button>
                    }
                  </div>
                </div>
              }
              @if (q.type === 'yes_no') {
                <div>
                  <p class="text-[12px]">{{ q.label }}</p>
                  <div class="flex gap-2 mt-1">
                    <button type="button" (click)="setAnswer(q.key, true)"
                            [class.bg-good-fg]="answers()[q.key] === true"
                            [class.text-white]="answers()[q.key] === true"
                            class="px-3 py-1 rounded border border-border text-[11px]">Yes</button>
                    <button type="button" (click)="setAnswer(q.key, false)"
                            [class.bg-danger-fg]="answers()[q.key] === false"
                            [class.text-white]="answers()[q.key] === false"
                            class="px-3 py-1 rounded border border-border text-[11px]">No</button>
                  </div>
                </div>
              }
              @if (q.type === 'text') {
                <label class="block">
                  <span class="text-[12px]">{{ q.label }}</span>
                  <textarea rows="2" [ngModel]="answers()[q.key] || ''"
                            (ngModelChange)="setAnswer(q.key, $event)"
                            class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
                </label>
              }
            }
          </div>

          <hr class="border-border my-3" />

          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Patient ID (optional)</span>
            <input [(ngModel)]="submitPatientId"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Department</span>
            <input [(ngModel)]="submitDepartment"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="flex items-center gap-2 text-[12px]">
            <input type="checkbox" [(ngModel)]="submitAnonymous" />
            Submit anonymously
          </label>
          <label class="flex items-center gap-2 text-[12px]">
            <input type="checkbox" [(ngModel)]="submitFollowUp" />
            Patient wants follow-up
          </label>

          @if (submitError()) { <p class="text-[12px] text-danger-fg">{{ submitError() }}</p> }
          @if (submitSuccess()) { <p class="text-[12px] text-good-fg">{{ submitSuccess() }}</p> }

          <button (click)="submitFeedback()"
                  [disabled]="submitBusy()"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ submitBusy() ? 'Submitting…' : 'Submit Feedback' }}
          </button>
        }
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Available Surveys</h3>
        @for (s of surveys(); track s.id) {
          <div class="border-l-2 border-brand pl-3 py-2 text-[12px]">
            <p class="font-semibold">{{ s.title }}</p>
            <p class="text-[10px] text-ink-soft">{{ scopeLabel(s.scope) }} · {{ s.questions.length }} questions</p>
          </div>
        }
      </div>
    </div>
  }

  <!-- COMPLAINTS -->
  @if (tab() === 'complaints') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Log Complaint</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Category *</span>
          <select [(ngModel)]="cCategory"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (c of categoryOptions; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Severity *</span>
          <select [(ngModel)]="cSeverity"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="low">Low</option><option value="medium">Medium</option>
            <option value="high">High</option><option value="critical">Critical</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Channel</span>
          <select [(ngModel)]="cChannel"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="verbal">Verbal</option><option value="written">Written</option>
            <option value="online">Online</option><option value="email">Email</option>
            <option value="phone">Phone</option><option value="suggestion_box">Suggestion box</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID</span>
          <input [(ngModel)]="cPatientId" placeholder="UUID (optional)"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Complainant Name</span>
          <input [(ngModel)]="cName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Department</span>
          <input [(ngModel)]="cDepartment"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Description *</span>
          <textarea rows="3" [(ngModel)]="cDescription"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        @if (cError()) { <p class="text-[12px] text-danger-fg">{{ cError() }}</p> }
        <button (click)="logComplaint()"
                [disabled]="cBusy() || !cDescription.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ cBusy() ? 'Saving…' : 'Log Complaint' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Complaints</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">No</th><th class="px-3 py-2">Cat</th>
                <th class="px-3 py-2">Sev</th><th class="px-3 py-2">Description</th>
                <th class="px-3 py-2">Department</th><th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Due</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (c of complaints(); track c.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="c.severity === 'critical' || c.severity === 'high'"
                  [class.bg-warn-fg]="c.status === 'in_investigation'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ c.complaint_no || c.id.slice(0,8) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.category }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-danger-fg]="c.severity === 'critical' || c.severity === 'high'"
                        [class.bg-warn-fg]="c.severity === 'medium'"
                        [class.bg-surface-subtle]="c.severity === 'low'"
                        [class.text-white]="c.severity === 'critical' || c.severity === 'high' || c.severity === 'medium'">
                    {{ c.severity }}
                  </span>
                </td>
                <td class="px-3 py-2 text-[11px]">{{ truncate(c.description || c.body || '', 40) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.department || '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.status }}</td>
                <td class="px-3 py-2 text-[11px]"
                    [class.text-danger-fg]="isOverdue(c)">
                  {{ c.due_at ? (c.due_at | date:'shortDate') : '—' }}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (c.status === 'open') {
                    <button (click)="assign(c)" class="text-[11px] text-brand hover:underline">Assign</button>
                  }
                  @if (c.status === 'in_investigation') {
                    <button (click)="resolve(c)" class="text-[11px] text-good-fg hover:underline">Resolve</button>
                    <span class="mx-1">·</span>
                    <button (click)="escalate(c)" class="text-[11px] text-danger-fg hover:underline">Escalate</button>
                  }
                </td>
              </tr>
            }
            @if (complaints().length === 0) {
              <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No complaints.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>
  `,
})
export class FeedbackPage implements OnInit {
  private svc = inject(FeedbackService);

  protected tab = signal<Tab>('dashboard');
  protected surveys = signal<FeedbackSurvey[]>([]);
  protected responses = signal<FeedbackResponse[]>([]);
  protected complaints = signal<Complaint[]>([]);
  protected weekly = signal<FeedbackWeeklySummary[]>([]);

  // Submit form
  protected selectedSurveyId: string | null = null;
  protected answers = signal<Record<string, any>>({});
  protected submitPatientId = '';
  protected submitDepartment = '';
  protected submitAnonymous = false;
  protected submitFollowUp = false;
  protected submitBusy = signal(false);
  protected submitError = signal<string | null>(null);
  protected submitSuccess = signal<string | null>(null);

  // Complaint form
  protected cCategory: ComplaintCategory = 'service_quality';
  protected cSeverity: ComplaintSeverity = 'medium';
  protected cChannel: any = 'verbal';
  protected cPatientId = '';
  protected cName = '';
  protected cDepartment = '';
  protected cDescription = '';
  protected cBusy = signal(false);
  protected cError = signal<string | null>(null);

  protected categoryOptions: ComplaintCategory[] = ['service_quality','billing','staff_conduct','cleanliness','food','communication','medical_care','wait_time','privacy','infrastructure','other'];

  protected scopeLabel = (s: any) => SCOPE_LABELS[s as keyof typeof SCOPE_LABELS] ?? s;
  protected categoryLabel = (c: ComplaintCategory) => COMPLAINT_CATEGORY_LABELS[c];

  protected selectedSurvey = computed(() =>
    this.selectedSurveyId ? this.surveys().find(s => s.id === this.selectedSurveyId) ?? null : null,
  );
  protected surveyTitle = (id: string) => this.surveys().find(s => s.id === id)?.title ?? '—';
  protected truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n) + '…'; }
  protected isOverdue(c: Complaint): boolean {
    if (!c.due_at || c.status === 'resolved' || c.status === 'closed') return false;
    return new Date(c.due_at) < new Date();
  }

  protected ratingScale(max: number): number[] {
    return Array.from({ length: max }, (_, i) => i + 1);
  }
  protected npsScale(): number[] { return Array.from({ length: 11 }, (_, i) => i); }

  protected totalResponses4w = computed(() => this.weekly().slice(0, 4).reduce((s, w) => s + w.responses, 0));
  protected avgRating4w = computed(() => {
    const recent = this.weekly().slice(0, 4);
    if (recent.length === 0) return 0;
    const total = recent.reduce((s, w) => s + (w.responses * (Number(w.avg_rating) || 0)), 0);
    const totalResponses = recent.reduce((s, w) => s + w.responses, 0);
    return totalResponses > 0 ? total / totalResponses : 0;
  });
  protected nps4w = computed(() => {
    const recent = this.weekly().slice(0, 4);
    if (recent.length === 0) return 0;
    const total = recent.reduce((s, w) => s + (w.responses * (Number(w.avg_nps) || 0)), 0);
    const totalResponses = recent.reduce((s, w) => s + w.responses, 0);
    if (totalResponses === 0) return 0;
    // Convert avg NPS score to NPS index: %promoters - %detractors. Simplified: avg * 10.
    return (total / totalResponses) * 10 - 50;
  });
  protected openComplaintsCount = computed(() =>
    this.complaints().filter(c => c.status === 'open' || c.status === 'in_investigation').length,
  );

  protected tabs = [
    { id: 'dashboard'  as Tab, label: 'Dashboard',   count: () => this.totalResponses4w() },
    { id: 'responses'  as Tab, label: 'Responses',   count: () => this.responses().length },
    { id: 'submit'     as Tab, label: 'Submit',      count: () => this.surveys().length },
    { id: 'complaints' as Tab, label: 'Complaints',  count: () => this.openComplaintsCount() },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [surveys, responses, complaints, weekly] = await Promise.all([
        this.svc.listSurveys(true),
        this.svc.listResponses({}),
        this.svc.listComplaints({}),
        this.svc.weeklySummary(),
      ]);
      this.surveys.set(surveys);
      this.responses.set(responses);
      this.complaints.set(complaints);
      this.weekly.set(weekly);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onSurveyChange(_id: string) {
    this.answers.set({});
    this.submitError.set(null);
    this.submitSuccess.set(null);
  }

  protected setAnswer(key: string, value: any) {
    this.answers.update(a => ({ ...a, [key]: value }));
  }

  protected async submitFeedback() {
    const sv = this.selectedSurvey();
    if (!sv) return;
    this.submitBusy.set(true); this.submitError.set(null); this.submitSuccess.set(null);
    try {
      // Try to extract overall_rating + nps from common keys
      const a = this.answers();
      let overallRating: number | null = null;
      let nps: number | null = null;
      let comments: string | null = null;
      for (const q of sv.questions) {
        if (q.type === 'rating' && overallRating === null && typeof a[q.key] === 'number') overallRating = a[q.key];
        if (q.type === 'nps' && nps === null && typeof a[q.key] === 'number') nps = a[q.key];
        if (q.type === 'text' && !comments && a[q.key]) comments = a[q.key];
      }
      await this.svc.submit({
        surveyId: sv.id,
        patientId: this.submitAnonymous ? null : (this.submitPatientId.trim() || null),
        isAnonymous: this.submitAnonymous,
        overallRating,
        npsScore: nps,
        answers: a,
        freeTextComments: comments,
        department: this.submitDepartment.trim() || null,
        followUpRequired: this.submitFollowUp,
      });
      this.submitSuccess.set('Feedback submitted. Thank you!');
      this.answers.set({});
      this.submitPatientId = ''; this.submitDepartment = '';
      this.submitAnonymous = false; this.submitFollowUp = false;
      await this.refresh();
    } catch (e: any) { this.submitError.set(e?.message ?? 'Failed'); }
    finally { this.submitBusy.set(false); }
  }

  protected async markReviewed(r: FeedbackResponse) {
    try { await this.svc.review(r.id, 'reviewed'); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async spawnComplaint(r: FeedbackResponse) {
    const cat = prompt('Complaint category? (service_quality / billing / medical_care / wait_time / staff_conduct / etc)');
    if (!cat) return;
    const sev = prompt('Severity? (low / medium / high / critical)', 'medium');
    if (!sev) return;
    const desc = prompt('Description?', r.free_text_comments || '');
    if (!desc) return;
    try {
      await this.svc.fromFeedback({
        feedbackResponseId: r.id,
        category: cat as ComplaintCategory,
        severity: sev as ComplaintSeverity,
        description: desc,
        department: r.department,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async logComplaint() {
    if (!this.cDescription.trim()) return;
    this.cBusy.set(true); this.cError.set(null);
    try {
      await this.svc.createComplaint({
        category: this.cCategory,
        severity: this.cSeverity,
        description: this.cDescription.trim(),
        channel: this.cChannel,
        patientId: this.cPatientId.trim() || null,
        complainantName: this.cName.trim() || null,
        department: this.cDepartment.trim() || null,
      });
      this.cPatientId = ''; this.cName = ''; this.cDepartment = ''; this.cDescription = '';
      await this.refresh();
    } catch (e: any) { this.cError.set(e?.message ?? 'Failed'); }
    finally { this.cBusy.set(false); }
  }

  protected async assign(c: Complaint) {
    const name = prompt('Assign to (name)?'); if (!name) return;
    const due = prompt('Due date (YYYY-MM-DD)?') ?? '';
    try {
      await this.svc.assign(c.id, null, name, due ? new Date(due).toISOString() : null);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async resolve(c: Complaint) {
    const summary = prompt('Resolution summary?'); if (!summary) return;
    const sat = confirm('Patient satisfied with resolution? OK = yes, Cancel = no');
    try { await this.svc.resolve(c.id, summary, sat); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async escalate(c: Complaint) {
    const to = prompt('Escalate to (e.g., Medical Director)?'); if (!to) return;
    const reason = prompt('Escalation reason?'); if (!reason) return;
    try { await this.svc.escalate(c.id, to, reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
