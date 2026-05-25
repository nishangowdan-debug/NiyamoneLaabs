import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { GrievanceService } from '../data/grievance.service';
import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_SEVERITY_LABELS,
  GRIEVANCE_STATUS_LABELS,
  type Grievance,
  type GrievanceCategory,
  type GrievanceComment,
  type GrievanceSeverity,
  type GrievanceStatus,
} from '../data/grievance.types';

@Component({
  selector: 'page-grievances',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Grievances</h1>
    <p class="text-[12px] text-ink-soft">Formal complaint channel — anonymous option, SLA-tracked, escalation-ready.</p>
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

  <!-- Submit -->
  @if (tab() === 'submit') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-3">
      <h3 class="text-sm font-semibold">Raise a grievance</h3>
      <p class="text-[11px] text-ink-soft">Use anonymous mode if you'd rather not be identified. POSH cases are escalated to the Internal Complaints Committee.</p>

      <div class="grid md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Category *</span>
          <select [(ngModel)]="form.category"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (k of categoryKeys; track k) { <option [value]="k">{{ GRIEVANCE_CATEGORY_LABELS[k] }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Severity *</span>
          <select [(ngModel)]="form.severity"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (k of severityKeys; track k) { <option [value]="k">{{ GRIEVANCE_SEVERITY_LABELS[k] }}</option> }
          </select>
        </label>
      </div>

      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Subject *</span>
        <input [(ngModel)]="form.subject"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>

      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Description *</span>
        <textarea rows="5" [(ngModel)]="form.description"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>

      <label class="flex items-center gap-2 text-[12px]">
        <input type="checkbox" [(ngModel)]="form.isAnonymous" />
        Submit anonymously
      </label>

      @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }
      @if (success()) { <p class="text-[12px] text-good-fg">{{ success() }}</p> }

      <button (click)="submit()"
              [disabled]="busy() || !form.subject.trim() || !form.description.trim()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Submitting…' : 'Submit grievance' }}
      </button>
    </div>
  }

  <!-- My Grievances -->
  @if (tab() === 'mine' || tab() === 'queue') {
    <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr>
            <th class="px-3 py-2">Ticket</th>
            <th class="px-3 py-2">Subject</th>
            <th class="px-3 py-2">Category</th>
            <th class="px-3 py-2">Severity</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">SLA due</th>
            <th class="px-3 py-2">Created</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (g of filteredItems(); track g.id) {
            <tr class="border-t border-border" [class.bg-danger-fg]="g.severity === 'critical'" [class.bg-opacity-5]="g.severity === 'critical'">
              <td class="px-3 py-2 font-mono">{{ g.ticket_no }}</td>
              <td class="px-3 py-2 font-medium">
                {{ g.subject }}
                @if (g.is_anonymous) { <span class="ml-1 text-[10px] text-ink-soft uppercase">[anon]</span> }
              </td>
              <td class="px-3 py-2">{{ GRIEVANCE_CATEGORY_LABELS[g.category] }}</td>
              <td class="px-3 py-2">
                <span class="text-[10px] uppercase px-1.5 py-0.5 rounded"
                      [class.bg-danger-fg]="g.severity === 'critical' || g.severity === 'high'"
                      [class.text-white]="g.severity === 'critical' || g.severity === 'high'"
                      [class.bg-warn-fg]="g.severity === 'medium'"
                      [class.bg-surface-subtle]="g.severity === 'low'">
                  {{ GRIEVANCE_SEVERITY_LABELS[g.severity] }}
                </span>
              </td>
              <td class="px-3 py-2">{{ GRIEVANCE_STATUS_LABELS[g.status] }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ g.sla_due_at ? formatDateTime(g.sla_due_at) : '—' }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ formatDate(g.created_at) }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="openDetail(g)" class="text-[11px] text-brand hover:underline">Open</button>
              </td>
            </tr>
          }
          @if (filteredItems().length === 0) {
            <tr><td colspan="8" class="px-3 py-6 text-center text-ink-soft">No grievances.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- Detail drawer -->
  @if (detailOpen() && selected()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeDetail()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-3xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <header class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ selected()!.ticket_no }}</p>
            <h3 class="text-base font-semibold">{{ selected()!.subject }}</h3>
            <p class="text-[12px] text-ink-soft">{{ GRIEVANCE_CATEGORY_LABELS[selected()!.category] }} · {{ GRIEVANCE_SEVERITY_LABELS[selected()!.severity] }} · raised {{ formatDate(selected()!.created_at) }}</p>
          </div>
          <button (click)="closeDetail()" class="text-ink-soft hover:text-ink">✕</button>
        </header>

        <div class="rounded-md bg-surface p-3 text-[13px] whitespace-pre-line">{{ selected()!.description }}</div>

        @if (canManage()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Triage</h4>
            <div class="grid md:grid-cols-2 gap-2">
              <label class="block">
                <span class="text-[10px] uppercase text-ink-soft">Status</span>
                <select [(ngModel)]="triage.status"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                  @for (k of statusKeys; track k) { <option [value]="k">{{ GRIEVANCE_STATUS_LABELS[k] }}</option> }
                </select>
              </label>
            </div>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Resolution summary</span>
              <textarea rows="2" [(ngModel)]="triage.resolution"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"></textarea>
            </label>
            <button (click)="saveTriage()" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">Update</button>
          </div>
        }

        <!-- Comment thread -->
        <div class="space-y-2">
          <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Conversation</h4>
          @for (c of comments(); track c.id) {
            <div class="rounded-md p-2 text-[12px]"
                 [class.bg-warn-fg]="c.is_internal"
                 [class.bg-opacity-10]="c.is_internal"
                 [class.bg-surface-subtle]="!c.is_internal">
              <p class="text-[10px] text-ink-soft">{{ c.is_internal ? 'Internal note' : 'Reply' }} · {{ formatDateTime(c.created_at) }}</p>
              <p class="whitespace-pre-line">{{ c.body }}</p>
            </div>
          }
          @if (comments().length === 0) { <p class="text-[11px] text-ink-soft">No replies yet.</p> }

          <div class="space-y-2 pt-2 border-t border-border">
            <textarea rows="2" [(ngModel)]="newComment" placeholder="Add a reply…"
                      class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            <div class="flex items-center justify-between">
              @if (canManage()) {
                <label class="flex items-center gap-2 text-[11px]">
                  <input type="checkbox" [(ngModel)]="newCommentInternal" /> Internal (HR-only)
                </label>
              } @else { <span></span> }
              <button (click)="postComment()"
                      [disabled]="!newComment.trim()"
                      class="px-3 py-1 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Post</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  }
</section>
  `,
})
export class GrievancesPage implements OnInit {
  private svc = inject(GrievanceService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected GRIEVANCE_CATEGORY_LABELS = GRIEVANCE_CATEGORY_LABELS;
  protected GRIEVANCE_SEVERITY_LABELS = GRIEVANCE_SEVERITY_LABELS;
  protected GRIEVANCE_STATUS_LABELS  = GRIEVANCE_STATUS_LABELS;
  protected categoryKeys = Object.keys(GRIEVANCE_CATEGORY_LABELS) as GrievanceCategory[];
  protected severityKeys = Object.keys(GRIEVANCE_SEVERITY_LABELS) as GrievanceSeverity[];
  protected statusKeys   = Object.keys(GRIEVANCE_STATUS_LABELS)   as GrievanceStatus[];

  protected items     = signal<Grievance[]>([]);
  protected selected  = signal<Grievance | null>(null);
  protected comments  = signal<GrievanceComment[]>([]);
  protected detailOpen = signal(false);
  protected tab       = signal<'submit' | 'mine' | 'queue'>('submit');

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);

  protected form: { isAnonymous: boolean; category: GrievanceCategory; severity: GrievanceSeverity; subject: string; description: string } = {
    isAnonymous: false,
    category: 'other',
    severity: 'medium',
    subject: '',
    description: '',
  };

  protected triage: { status: GrievanceStatus; resolution: string } = { status: 'under_review', resolution: '' };
  protected newComment = '';
  protected newCommentInternal = false;

  protected canManage = computed(() => this.auth.has('grievances.manage'));
  protected myStaffId = computed(() => this.auth.staffId());

  protected filteredItems = computed(() => {
    const list = this.items();
    if (this.tab() === 'mine') {
      const me = this.myStaffId();
      return list.filter(g => g.raised_by_staff_id === me);
    }
    return list;
  });

  protected tabs = [
    { id: 'submit' as const, label: 'Submit',  count: () => 0 },
    { id: 'mine'   as const, label: 'My grievances', count: () => this.items().filter(g => g.raised_by_staff_id === this.myStaffId()).length },
    ...(this.auth.has('grievances.manage') ? [
      { id: 'queue' as const, label: 'HR Queue', count: () => this.items().length },
    ] : []),
  ];

  ngOnInit() { void this.refresh(); }

  protected formatDate(s: string): string { return new Date(s).toLocaleDateString(); }
  protected formatDateTime(s: string): string { return new Date(s).toLocaleString(); }

  protected async refresh(): Promise<void> {
    try {
      const items = await this.svc.list();
      this.items.set(items);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected async submit(): Promise<void> {
    if (!this.form.subject.trim() || !this.form.description.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await this.svc.create({
        branchId: this.branchStore.activeBranchId(),
        isAnonymous: this.form.isAnonymous,
        category: this.form.category,
        severity: this.form.severity,
        subject: this.form.subject.trim(),
        description: this.form.description.trim(),
      });
      this.success.set('Submitted. HR will review and respond.');
      this.form = { isAnonymous: false, category: 'other', severity: 'medium', subject: '', description: '' };
      await this.refresh();
      setTimeout(() => this.success.set(null), 4000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async openDetail(g: Grievance): Promise<void> {
    this.selected.set(g);
    this.triage = { status: g.status, resolution: g.resolution_summary ?? '' };
    this.newComment = '';
    this.newCommentInternal = false;
    this.detailOpen.set(true);
    try {
      const c = await this.svc.listComments(g.id);
      this.comments.set(c);
    } catch (e: any) {
      this.comments.set([]);
    }
  }

  protected closeDetail(): void { this.detailOpen.set(false); }

  protected async saveTriage(): Promise<void> {
    const g = this.selected();
    if (!g) return;
    try {
      await this.svc.changeStatus({ id: g.id, status: this.triage.status, resolution: this.triage.resolution || null });
      await this.refresh();
      this.closeDetail();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async postComment(): Promise<void> {
    const g = this.selected();
    if (!g || !this.newComment.trim()) return;
    try {
      await this.svc.addComment({ grievanceId: g.id, body: this.newComment.trim(), isInternal: this.newCommentInternal });
      this.newComment = '';
      this.newCommentInternal = false;
      const c = await this.svc.listComments(g.id);
      this.comments.set(c);
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }
}
