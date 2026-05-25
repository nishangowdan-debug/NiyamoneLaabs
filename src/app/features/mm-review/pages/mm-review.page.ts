import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MmReviewService } from '../data/mm-review.service';
import {
  ACTION_STATUS_LABELS, CASE_TYPE_LABELS, CONTRIBUTING_FACTOR_OPTIONS,
  PREVENTABILITY_LABELS, REVIEW_STATUS_LABELS,
  type MmActionItem, type MmActionStatus, type MmCaseType,
  type MmPreventability, type MmReview, type MmReviewStatus,
} from '../data/mm-review.types';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Mortality &amp; Morbidity Review</h1>
      <p class="text-[12px] text-ink-soft">Privileged clinical case review · root cause analysis · action tracking · NABH governance</p>
    </div>
    <button (click)="showNew.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ New Review</button>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (s of statusFilters; track s) {
      <button (click)="filter.set(s)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="filter() === s"
              [class.border-brand]="filter() === s"
              [class.border-transparent]="filter() !== s"
              [class.text-ink-soft]="filter() !== s">
        {{ s === 'all' ? 'All' : tabLabel(s) }}
        <span class="ml-1 text-[10px] text-ink-soft">{{ countFor(s) }}</span>
      </button>
    }
  </nav>

  <div class="rounded-md border border-border bg-surface-card">
    <table class="min-w-full text-[12px]">
      <thead class="text-ink-soft text-left">
        <tr><th class="px-3 py-2">Review No</th><th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Case Summary</th><th class="px-3 py-2">Reviewed</th>
            <th class="px-3 py-2">Chair</th><th class="px-3 py-2">Preventable</th>
            <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
      </thead>
      <tbody>
        @for (r of filtered(); track r.id) {
          <tr class="border-t border-border"
              [class.bg-danger-fg]="r.preventability === 'preventable'"
              [class.bg-warn-fg]="r.preventability === 'possibly_preventable'"
              [class.bg-opacity-5]="true">
            <td class="px-3 py-2 font-mono">{{ r.review_no }}</td>
            <td class="px-3 py-2 text-[11px]">{{ caseTypeLabel(r.case_type) }}</td>
            <td class="px-3 py-2 text-[11px]">{{ truncate(r.case_summary, 60) }}</td>
            <td class="px-3 py-2 text-[11px]">{{ r.reviewed_at || '—' }}</td>
            <td class="px-3 py-2 text-[11px]">{{ r.chair_doctor_name || '—' }}</td>
            <td class="px-3 py-2 text-[11px]">
              @if (r.preventability) {
                <span [class.text-danger-fg]="r.preventability === 'preventable'"
                      [class.font-bold]="r.preventability === 'preventable'">
                  {{ preventabilityLabel(r.preventability) }}
                </span>
              } @else { — }
            </td>
            <td class="px-3 py-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                    [class.bg-good-fg]="r.status === 'closed'"
                    [class.bg-warn-fg]="r.status === 'in_progress'"
                    [class.bg-surface-subtle]="r.status === 'scheduled' || r.status === 'cancelled'"
                    [class.text-white]="r.status === 'closed' || r.status === 'in_progress'">
                {{ statusLabel(r.status) }}
              </span>
            </td>
            <td class="px-3 py-2 text-right">
              <button (click)="open(r)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No reviews.</td></tr>
        }
      </tbody>
    </table>
  </div>
</section>

<!-- New review dialog -->
@if (showNew()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="showNew.set(false)">
    <div class="w-full max-w-md rounded-lg bg-surface-card border border-border shadow-2xl p-4 space-y-2"
         (click)="$event.stopPropagation()">
      <h3 class="text-base font-semibold">New M&amp;M Review</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Case type *</span>
        <select [(ngModel)]="nCaseType"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (t of caseTypeOptions; track t) { <option [value]="t">{{ caseTypeLabel(t) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID</span>
        <input [(ngModel)]="nPatientId" placeholder="UUID (optional)"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
        <input [(ngModel)]="nAdmissionId" placeholder="UUID (optional)"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Case summary *</span>
        <textarea rows="3" [(ngModel)]="nSummary"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Review date</span>
        <input type="date" [(ngModel)]="nReviewedAt"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Chair doctor</span>
        <input [(ngModel)]="nChair"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      @if (nError()) { <p class="text-[12px] text-danger-fg">{{ nError() }}</p> }
      <div class="flex justify-end gap-2 pt-1">
        <button (click)="showNew.set(false)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="createReview()"
                [disabled]="!nSummary.trim() || nBusy()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nBusy() ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Review detail -->
@if (selected(); as r) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="closeDetail()">
    <div class="w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">{{ r.review_no }} · {{ caseTypeLabel(r.case_type) }}</h3>
          <p class="text-[11px] text-ink-soft">{{ statusLabel(r.status) }} · {{ r.reviewed_at || 'unscheduled' }}</p>
        </div>
        <button (click)="closeDetail()">✕</button>
      </div>

      <div class="p-4 space-y-4 text-sm">
        @if (r.privileged_communication) {
          <div class="rounded-md border border-warn-fg/40 bg-warn-fg/10 px-3 py-2 text-[11px] text-warn-fg">
            🔒 Privileged communication — for quality improvement only. Do not include this content in patient-facing records.
          </div>
        }

        <div class="rounded-md border border-border p-3 bg-surface-subtle text-[12px]">
          <p class="text-[10px] uppercase text-ink-soft">Case Summary</p>
          <p class="mt-1 whitespace-pre-wrap">{{ r.case_summary }}</p>
        </div>

        @if (r.status !== 'closed') {
          <div class="grid md:grid-cols-2 gap-3">
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Clinical findings</span>
              <textarea rows="3" [(ngModel)]="form.clinical_findings"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Root cause summary *</span>
              <textarea rows="3" [(ngModel)]="form.root_cause_summary"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Preventability *</span>
              <select [(ngModel)]="form.preventability"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="preventable">Preventable</option>
                <option value="possibly_preventable">Possibly preventable</option>
                <option value="non_preventable">Non-preventable</option>
                <option value="unable_to_determine">Unable to determine</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Attendees (comma-separated)</span>
              <input [(ngModel)]="attendeesRaw"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <div class="md:col-span-2 rounded-md border border-border p-2 bg-surface-subtle">
              <p class="text-[10px] font-bold uppercase text-ink-soft mb-1">Contributing factors</p>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-1">
                @for (f of contributingFactorOptions; track f.key) {
                  <label class="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox"
                           [checked]="form.contributing_factors?.includes(f.key)"
                           (change)="toggleFactor(f.key, $event)" />
                    {{ f.label }}
                  </label>
                }
              </div>
            </div>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Lessons learned</span>
              <textarea rows="2" [(ngModel)]="form.lessons_learned"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Recommendations</span>
              <textarea rows="2" [(ngModel)]="form.recommendations"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
          </div>
        } @else {
          <div class="grid md:grid-cols-2 gap-3 text-[12px]">
            @if (r.preventability) {
              <div class="rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft">Preventability</p>
                <p class="font-bold mt-1"
                   [class.text-danger-fg]="r.preventability === 'preventable'">
                  {{ preventabilityLabel(r.preventability) }}
                </p>
              </div>
            }
            @if (r.contributing_factors.length) {
              <div class="rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft">Contributing factors</p>
                <p class="text-[11px] mt-1">{{ r.contributing_factors.join(', ') }}</p>
              </div>
            }
            @if (r.root_cause_summary) {
              <div class="md:col-span-2 rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft">Root cause</p>
                <p class="text-[11px] whitespace-pre-wrap mt-1">{{ r.root_cause_summary }}</p>
              </div>
            }
            @if (r.lessons_learned) {
              <div class="md:col-span-2 rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft">Lessons learned</p>
                <p class="text-[11px] whitespace-pre-wrap mt-1">{{ r.lessons_learned }}</p>
              </div>
            }
            @if (r.recommendations) {
              <div class="md:col-span-2 rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft">Recommendations</p>
                <p class="text-[11px] whitespace-pre-wrap mt-1">{{ r.recommendations }}</p>
              </div>
            }
          </div>
        }

        <!-- Action items -->
        <section class="rounded-md border border-border p-3">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Action Items ({{ actions().length }})</h4>
            @if (r.status !== 'closed') {
              <button (click)="addActionPrompt()" class="px-2 py-1 text-[11px] rounded bg-brand text-white">+ Add</button>
            }
          </div>
          @if (actions().length === 0) {
            <p class="text-[12px] text-ink-soft">No action items.</p>
          } @else {
            <table class="min-w-full text-[12px]">
              <thead class="text-ink-soft text-left">
                <tr><th class="px-2 py-1">Description</th><th class="px-2 py-1">Owner</th>
                    <th class="px-2 py-1">Due</th><th class="px-2 py-1">Status</th>
                    <th class="px-2 py-1 text-right">Action</th></tr>
              </thead>
              <tbody>
                @for (a of actions(); track a.id) {
                  <tr class="border-t border-border"
                      [class.bg-danger-fg]="a.status === 'open' && isOverdue(a)"
                      [class.bg-opacity-5]="true">
                    <td class="px-2 py-1">{{ a.description }}</td>
                    <td class="px-2 py-1 text-[11px]">{{ a.owner_name || '—' }}</td>
                    <td class="px-2 py-1 text-[11px]"
                        [class.text-danger-fg]="a.status === 'open' && isOverdue(a)">
                      {{ a.due_at || '—' }}
                    </td>
                    <td class="px-2 py-1">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                            [class.bg-good-fg]="a.status === 'done'"
                            [class.bg-warn-fg]="a.status === 'in_progress'"
                            [class.bg-surface-subtle]="a.status === 'open' || a.status === 'cancelled'"
                            [class.text-white]="a.status === 'done' || a.status === 'in_progress'">
                        {{ actionStatusLabel(a.status) }}
                      </span>
                    </td>
                    <td class="px-2 py-1 text-right whitespace-nowrap">
                      @if (a.status === 'open') {
                        <button (click)="setAction(a, 'in_progress')" class="text-[11px] text-warn-fg hover:underline">Start</button>
                      }
                      @if (a.status === 'open' || a.status === 'in_progress') {
                        <span class="mx-1">·</span>
                        <button (click)="completeAction(a)" class="text-[11px] text-good-fg hover:underline">Done</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        @if (saveError()) { <p class="text-[12px] text-danger-fg">{{ saveError() }}</p> }
        @if (saveSuccess()) { <p class="text-[12px] text-good-fg">{{ saveSuccess() }}</p> }
      </div>

      <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
        @if (r.status !== 'closed') {
          <button (click)="save(r)" [disabled]="busy()"
                  class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
          <button (click)="closeReview(r)" [disabled]="busy()"
                  class="px-3 py-1.5 text-sm rounded-md bg-brand text-white">Close Review</button>
        }
      </div>
    </div>
  </div>
}
  `,
})
export class MmReviewPage implements OnInit {
  private svc = inject(MmReviewService);

  protected list = signal<MmReview[]>([]);
  protected filter = signal<MmReviewStatus | 'all'>('all');
  protected statusFilters: (MmReviewStatus | 'all')[] = ['all','scheduled','in_progress','closed','cancelled'];

  // New review form
  protected showNew = signal(false);
  protected nCaseType: MmCaseType = 'death';
  protected nPatientId = '';
  protected nAdmissionId = '';
  protected nSummary = '';
  protected nReviewedAt = '';
  protected nChair = '';
  protected nBusy = signal(false);
  protected nError = signal<string | null>(null);

  // Detail
  protected selected = signal<MmReview | null>(null);
  protected actions = signal<MmActionItem[]>([]);
  protected form: any = {};
  protected attendeesRaw = '';
  protected busy = signal(false);
  protected saveError = signal<string | null>(null);
  protected saveSuccess = signal<string | null>(null);

  protected caseTypeOptions: MmCaseType[] = ['death','complication','near_miss','sentinel_event','hai_outbreak','medication_error','surgical_adverse','anaesthesia_adverse'];
  protected contributingFactorOptions = CONTRIBUTING_FACTOR_OPTIONS;

  protected caseTypeLabel = (c: MmCaseType) => CASE_TYPE_LABELS[c];
  protected preventabilityLabel = (p: MmPreventability) => PREVENTABILITY_LABELS[p];
  protected statusLabel = (s: MmReviewStatus) => REVIEW_STATUS_LABELS[s];
  protected tabLabel(s: MmReviewStatus | 'all'): string {
    return s === 'all' ? 'All' : REVIEW_STATUS_LABELS[s];
  }
  protected actionStatusLabel = (s: MmActionStatus) => ACTION_STATUS_LABELS[s];

  protected filtered = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.list() : this.list().filter(r => r.status === f);
  });
  protected countFor(s: MmReviewStatus | 'all'): number {
    return s === 'all' ? this.list().length : this.list().filter(r => r.status === s).length;
  }

  protected truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n) + '…'; }
  protected isOverdue(a: MmActionItem): boolean {
    return !!a.due_at && new Date(a.due_at) < new Date(new Date().toDateString());
  }

  ngOnInit() { this.refresh(); }

  private async refresh() {
    try { this.list.set(await this.svc.list({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async createReview() {
    if (!this.nSummary.trim()) return;
    this.nBusy.set(true); this.nError.set(null);
    try {
      const id = await this.svc.create({
        caseType: this.nCaseType,
        caseSummary: this.nSummary.trim(),
        patientId: this.nPatientId.trim() || null,
        admissionId: this.nAdmissionId.trim() || null,
        reviewedAt: this.nReviewedAt || null,
        chairDoctorName: this.nChair.trim() || null,
      });
      this.showNew.set(false);
      this.nSummary = ''; this.nPatientId = ''; this.nAdmissionId = '';
      this.nReviewedAt = ''; this.nChair = '';
      await this.refresh();
      const fresh = await this.svc.get(id);
      this.openDetail(fresh);
    } catch (e: any) { this.nError.set(e?.message ?? 'Failed'); }
    finally { this.nBusy.set(false); }
  }

  protected open(r: MmReview) { this.openDetail(r); }
  private async openDetail(r: MmReview) {
    this.selected.set(r);
    this.form = { ...r, contributing_factors: [...(r.contributing_factors ?? [])] };
    this.attendeesRaw = (r.attendees ?? []).join(', ');
    try { this.actions.set(await this.svc.listActions(r.id)); }
    catch { this.actions.set([]); }
  }
  protected closeDetail() { this.selected.set(null); }

  protected toggleFactor(key: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const set = new Set<string>(this.form.contributing_factors ?? []);
    checked ? set.add(key) : set.delete(key);
    this.form.contributing_factors = [...set];
  }

  protected async save(r: MmReview) {
    this.busy.set(true); this.saveError.set(null); this.saveSuccess.set(null);
    try {
      const attendees = this.attendeesRaw.split(',').map(s => s.trim()).filter(s => s);
      await this.svc.update(r.id, {
        clinical_findings: this.form.clinical_findings,
        root_cause_summary: this.form.root_cause_summary,
        preventability: this.form.preventability,
        contributing_factors: this.form.contributing_factors ?? [],
        attendees,
        lessons_learned: this.form.lessons_learned,
        recommendations: this.form.recommendations,
      });
      this.saveSuccess.set('Saved');
      const fresh = await this.svc.get(r.id);
      this.selected.set(fresh);
      await this.refresh();
      setTimeout(() => this.saveSuccess.set(null), 3000);
    } catch (e: any) { this.saveError.set(e?.message ?? 'Failed'); }
    finally { this.busy.set(false); }
  }

  protected async closeReview(r: MmReview) {
    await this.save(r);
    try {
      await this.svc.close(r.id);
      const fresh = await this.svc.get(r.id);
      this.selected.set(fresh);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async addActionPrompt() {
    const r = this.selected(); if (!r) return;
    const desc = prompt('Action description?'); if (!desc) return;
    const owner = prompt('Owner (full name)?') ?? '';
    const due = prompt('Due date (YYYY-MM-DD)?') ?? '';
    try {
      await this.svc.addAction({
        reviewId: r.id, description: desc.trim(),
        ownerName: owner.trim() || null,
        dueAt: due.trim() || null,
      });
      this.actions.set(await this.svc.listActions(r.id));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async setAction(a: MmActionItem, status: MmActionStatus) {
    try {
      await this.svc.setActionStatus(a.id, status);
      const r = this.selected();
      if (r) this.actions.set(await this.svc.listActions(r.id));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async completeAction(a: MmActionItem) {
    const notes = prompt('Completion notes?') ?? '';
    try {
      await this.svc.setActionStatus(a.id, 'done', notes);
      const r = this.selected();
      if (r) this.actions.set(await this.svc.listActions(r.id));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
