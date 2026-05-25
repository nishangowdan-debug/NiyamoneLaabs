import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { EngagementService } from '../data/engagement.service';
import {
  KUDOS_CATEGORIES,
  KUDOS_CATEGORY_LABELS,
  type EngagementKudos,
  type EngagementQuestion,
  type EngagementSurvey,
  type SurveySummaryRow,
} from '../data/engagement.types';

@Component({
  selector: 'page-engagement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Employee Engagement</h1>
    <p class="text-[12px] text-ink-soft">Pulse surveys, kudos wall, and team insights.</p>
  </header>

  <nav class="flex gap-1 border-b border-border flex-wrap">
    @for (t of tabs; track t.id) {
      <button (click)="tab.set(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- Pulse -->
  @if (tab() === 'pulse') {
    <div class="space-y-3">
      @for (s of surveys(); track s.id) {
        <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold">{{ s.title }}</h3>
              @if (s.description) { <p class="text-[11px] text-ink-soft">{{ s.description }}</p> }
            </div>
            @if (s.is_anonymous) {
              <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-good-fg text-white">Anonymous</span>
            }
          </div>

          @for (q of questionsBySurvey()[s.id] || []; track q.id) {
            <div class="rounded-md bg-surface p-3 space-y-2">
              <p class="text-[13px] font-medium">{{ q.prompt }}</p>
              @if (q.kind === 'likert') {
                <div class="flex gap-1">
                  @for (n of [1,2,3,4,5]; track n) {
                    <button (click)="recordScore(s.id, q.id, n)"
                            [disabled]="answered()[q.id]"
                            class="w-9 h-9 rounded-md border border-border text-[12px] font-medium hover:bg-surface-subtle disabled:opacity-50"
                            [class.bg-brand]="answered()[q.id] === n"
                            [class.text-white]="answered()[q.id] === n">{{ n }}</button>
                  }
                </div>
                <p class="text-[10px] text-ink-soft">1 = Strongly disagree · 5 = Strongly agree</p>
              } @else if (q.kind === 'enps') {
                <div class="flex flex-wrap gap-1">
                  @for (n of enpsScale; track n) {
                    <button (click)="recordScore(s.id, q.id, n)"
                            [disabled]="answered()[q.id]"
                            class="w-9 h-9 rounded-md border border-border text-[12px] font-medium hover:bg-surface-subtle disabled:opacity-50"
                            [class.bg-brand]="answered()[q.id] === n"
                            [class.text-white]="answered()[q.id] === n">{{ n }}</button>
                  }
                </div>
                <p class="text-[10px] text-ink-soft">0 = Not at all likely · 10 = Extremely likely</p>
              } @else {
                <textarea rows="2" [(ngModel)]="textAnswers[q.id]"
                          class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
                <button (click)="recordText(s.id, q.id)"
                        [disabled]="!textAnswers[q.id] || answered()[q.id]"
                        class="px-2.5 py-1 text-[11px] rounded-md bg-brand text-white disabled:opacity-50">Submit</button>
              }
              @if (answered()[q.id]) {
                <p class="text-[11px] text-good-fg">✓ Recorded. Thank you.</p>
              }
            </div>
          }
        </div>
      }
      @if (surveys().length === 0) {
        <p class="text-[12px] text-ink-soft">No active surveys.</p>
      }
    </div>
  }

  <!-- Kudos wall -->
  @if (tab() === 'kudos') {
    <div class="grid md:grid-cols-3 gap-4">
      <!-- Send -->
      <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
        <h3 class="text-sm font-semibold">Send kudos</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To *</span>
          <select [(ngModel)]="kudosForm.toStaffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick a teammate —</option>
            @for (s of staff(); track s.id) {
              @if (s.id !== myStaffId()) {
                <option [ngValue]="s.id">{{ s.full_name }} ({{ s.role_slug }})</option>
              }
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Category</span>
          <select [(ngModel)]="kudosForm.category"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (k of kudosCategories; track k) { <option [value]="k">{{ KUDOS_CATEGORY_LABELS[k] }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Message *</span>
          <textarea rows="3" [(ngModel)]="kudosForm.message"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="kudosForm.isPublic" /> Show on the kudos wall
        </label>
        @if (kudosError()) { <p class="text-[12px] text-danger-fg">{{ kudosError() }}</p> }
        <button (click)="sendKudos()"
                [disabled]="kudosBusy() || !kudosForm.toStaffId || !kudosForm.message.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ kudosBusy() ? 'Sending…' : 'Send kudos' }}
        </button>
      </div>

      <!-- Wall -->
      <div class="md:col-span-2 space-y-2">
        <h3 class="text-sm font-semibold text-ink-soft uppercase tracking-wide">Recent kudos</h3>
        @for (k of kudos(); track k.id) {
          <div class="rounded-md border border-border bg-surface-card p-3">
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">
              {{ KUDOS_CATEGORY_LABELS[k.category] || k.category }} · {{ formatDate(k.created_at) }}
            </p>
            <p class="text-[13px] mt-1">{{ k.message }}</p>
            <p class="text-[11px] text-ink-soft mt-1">
              <span>{{ staffName(k.from_staff_id) }}</span> →
              <span class="font-medium">{{ staffName(k.to_staff_id) }}</span>
            </p>
          </div>
        }
        @if (kudos().length === 0) {
          <p class="text-[12px] text-ink-soft">Be the first to send a kudo.</p>
        }
      </div>
    </div>
  }

  <!-- Analytics (HR-only) -->
  @if (tab() === 'analytics') {
    @if (canManage()) {
      <label class="block max-w-xs">
        <span class="text-[10px] uppercase text-ink-soft">Survey</span>
        <select [(ngModel)]="analyticsSurveyId" (ngModelChange)="loadSummary()"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">— pick —</option>
          @for (s of surveys(); track s.id) { <option [ngValue]="s.id">{{ s.title }}</option> }
        </select>
      </label>

      <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr>
              <th class="px-3 py-2">Question</th>
              <th class="px-3 py-2">Type</th>
              <th class="px-3 py-2 text-right">Responses</th>
              <th class="px-3 py-2 text-right">Avg score</th>
            </tr>
          </thead>
          <tbody>
            @for (r of summary(); track r.question_id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2">{{ r.prompt }}</td>
                <td class="px-3 py-2">{{ r.kind }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ r.responses }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ r.avg_score ?? '—' }}</td>
              </tr>
            }
            @if (summary().length === 0) {
              <tr><td colspan="4" class="px-3 py-6 text-center text-ink-soft">Pick a survey.</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="text-[12px] text-ink-soft">Analytics are HR-admin only.</p>
    }
  }
</section>
  `,
})
export class EngagementPage implements OnInit {
  private svc = inject(EngagementService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected KUDOS_CATEGORY_LABELS = KUDOS_CATEGORY_LABELS;
  protected kudosCategories = KUDOS_CATEGORIES;
  protected enpsScale = [0,1,2,3,4,5,6,7,8,9,10];

  protected surveys = signal<EngagementSurvey[]>([]);
  protected questionsBySurvey = signal<Record<string, EngagementQuestion[]>>({});
  protected answered = signal<Record<string, number | string | null>>({});
  protected kudos = signal<EngagementKudos[]>([]);
  protected staff = signal<{ id: string; full_name: string; role_slug: string }[]>([]);
  protected summary = signal<SurveySummaryRow[]>([]);
  protected analyticsSurveyId: string | null = null;

  protected tab = signal<'pulse' | 'kudos' | 'analytics'>('pulse');
  protected kudosBusy = signal(false);
  protected kudosError = signal<string | null>(null);

  protected textAnswers: Record<string, string> = {};
  protected kudosForm: { toStaffId: string | null; category: string; message: string; isPublic: boolean } = {
    toStaffId: null, category: 'teamwork', message: '', isPublic: true,
  };

  protected canManage = computed(() => this.auth.has('engagement.manage'));
  protected myStaffId = computed(() => this.auth.staffId());

  protected tabs = [
    { id: 'pulse'    as const, label: 'Pulse',    count: () => this.surveys().length },
    { id: 'kudos'    as const, label: 'Kudos',    count: () => this.kudos().length },
    ...(this.auth.has('engagement.manage') ? [{ id: 'analytics' as const, label: 'Analytics', count: () => 0 }] : []),
  ];

  ngOnInit() { void this.refresh(); }

  protected formatDate(s: string): string { return new Date(s).toLocaleDateString(); }

  protected staffName(id: string | null): string {
    if (!id) return 'Anonymous';
    return this.staff().find(s => s.id === id)?.full_name ?? id.slice(0, 8);
  }

  protected async refresh(): Promise<void> {
    try {
      const [surveys, kudos, staff] = await Promise.all([
        this.svc.activeSurveys(),
        this.svc.listKudos(),
        this.svc.listStaff().catch(() => []),
      ]);
      this.surveys.set(surveys);
      this.kudos.set(kudos);
      this.staff.set(staff);

      const map: Record<string, EngagementQuestion[]> = {};
      for (const s of surveys) {
        map[s.id] = await this.svc.questionsFor(s.id).catch(() => []);
      }
      this.questionsBySurvey.set(map);
    } catch (e) {
      // surfaced at action level
    }
  }

  protected async recordScore(surveyId: string, questionId: string, score: number): Promise<void> {
    try {
      await this.svc.submitResponse({ surveyId, questionId, score, anonymous: true });
      const next = { ...this.answered() };
      next[questionId] = score;
      this.answered.set(next);
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async recordText(surveyId: string, questionId: string): Promise<void> {
    const t = this.textAnswers[questionId]?.trim();
    if (!t) return;
    try {
      await this.svc.submitResponse({ surveyId, questionId, text: t, anonymous: true });
      const next = { ...this.answered() };
      next[questionId] = t;
      this.answered.set(next);
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async sendKudos(): Promise<void> {
    if (!this.kudosForm.toStaffId || !this.kudosForm.message.trim()) return;
    this.kudosBusy.set(true);
    this.kudosError.set(null);
    try {
      await this.svc.sendKudos({
        toStaffId: this.kudosForm.toStaffId,
        message: this.kudosForm.message.trim(),
        category: this.kudosForm.category,
        isPublic: this.kudosForm.isPublic,
        branchId: this.branchStore.activeBranchId(),
      });
      this.kudosForm = { toStaffId: null, category: 'teamwork', message: '', isPublic: true };
      this.kudos.set(await this.svc.listKudos());
    } catch (e: any) {
      this.kudosError.set(e?.message ?? 'Failed');
    } finally {
      this.kudosBusy.set(false);
    }
  }

  protected async loadSummary(): Promise<void> {
    if (!this.analyticsSurveyId) { this.summary.set([]); return; }
    try {
      this.summary.set(await this.svc.surveySummary(this.analyticsSurveyId));
    } catch (e: any) {
      this.summary.set([]);
    }
  }
}
