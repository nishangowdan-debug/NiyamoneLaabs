import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { PerformanceService } from '../data/performance.service';
import {
  RELATIONSHIP_LABELS,
  REVIEW_STATUS_LABELS,
  type Perf360,
  type PerfCycle,
  type PerfKpi,
  type PerfReview,
  type Relationship,
} from '../data/performance.types';

@Component({
  selector: 'page-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Performance Reviews</h1>
      <p class="text-[12px] text-ink-soft">Appraisal cycles · KPIs · self/manager review · 360 feedback.</p>
    </div>
    @if (canManage()) {
      <div class="flex gap-2">
        <button (click)="openCycleEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">+ Cycle</button>
        <button (click)="openOpenReview()" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">Open review</button>
      </div>
    }
  </header>

  <div class="flex items-center gap-2 flex-wrap">
    <label class="text-[10px] uppercase text-ink-soft">Cycle</label>
    <select [(ngModel)]="filterCycleId" (ngModelChange)="refresh()"
            class="rounded-md border border-border bg-surface px-2 py-1 text-sm">
      <option [ngValue]="null">All cycles</option>
      @for (c of cycles(); track c.id) {
        <option [ngValue]="c.id">{{ c.name }} ({{ c.period_start }} → {{ c.period_end }})</option>
      }
    </select>
  </div>

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

  <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
    <table class="min-w-full text-[12px]">
      <thead class="text-ink-soft text-left">
        <tr>
          <th class="px-3 py-2">Staff</th>
          <th class="px-3 py-2">Manager</th>
          <th class="px-3 py-2">Status</th>
          <th class="px-3 py-2 text-right">Overall</th>
          <th class="px-3 py-2">Updated</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (r of filtered(); track r.id) {
          <tr class="border-t border-border">
            <td class="px-3 py-2 font-medium">{{ staffName(r.staff_id) }}</td>
            <td class="px-3 py-2 text-ink-soft">{{ r.manager_staff_id ? staffName(r.manager_staff_id) : '—' }}</td>
            <td class="px-3 py-2">{{ REVIEW_STATUS_LABELS[r.status] }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.overall_score ?? '—' }}</td>
            <td class="px-3 py-2 text-ink-soft">{{ formatDate(r.updated_at) }}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button (click)="openReview(r)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="6" class="px-3 py-6 text-center text-ink-soft">No reviews.</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Cycle editor -->
  @if (cycleEditorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeCycleEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-xl p-4 space-y-3" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">New appraisal cycle</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Name *</span>
          <input [(ngModel)]="cycleForm.name" placeholder="FY26 H1"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Period start *</span>
            <input type="date" [(ngModel)]="cycleForm.period_start"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Period end *</span>
            <input type="date" [(ngModel)]="cycleForm.period_end"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div class="grid md:grid-cols-3 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Self due</span>
            <input type="date" [(ngModel)]="cycleForm.self_review_due"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Manager due</span>
            <input type="date" [(ngModel)]="cycleForm.manager_review_due"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Peer due</span>
            <input type="date" [(ngModel)]="cycleForm.peer_review_due"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeCycleEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="saveCycle()"
                  [disabled]="busy() || !cycleForm.name.trim() || !cycleForm.period_start || !cycleForm.period_end"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  }

  <!-- Open review (HR) -->
  @if (openReviewModalOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeOpenReview()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-md p-4 space-y-3" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">Open a review</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Cycle *</span>
          <select [(ngModel)]="openForm.cycleId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (c of cycles(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Staff *</span>
          <select [(ngModel)]="openForm.staffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of staff(); track s.id) { <option [ngValue]="s.id">{{ s.full_name }} ({{ s.role_slug }})</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Manager (optional)</span>
          <select [(ngModel)]="openForm.managerStaffId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— none —</option>
            @for (s of staff(); track s.id) { <option [ngValue]="s.id">{{ s.full_name }}</option> }
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeOpenReview()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="saveOpenReview()"
                  [disabled]="busy() || !openForm.cycleId || !openForm.staffId"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Open</button>
        </div>
      </div>
    </div>
  }

  <!-- Review detail -->
  @if (detailOpen() && selected()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeDetail()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-4xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <header class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ REVIEW_STATUS_LABELS[selected()!.status] }}</p>
            <h3 class="text-base font-semibold">{{ staffName(selected()!.staff_id) }}</h3>
            <p class="text-[12px] text-ink-soft">Manager: {{ selected()!.manager_staff_id ? staffName(selected()!.manager_staff_id!) : '—' }}</p>
          </div>
          <button (click)="closeDetail()" class="text-ink-soft hover:text-ink">✕</button>
        </header>

        <!-- KPIs -->
        <div class="rounded-md border border-border p-3 space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">KPIs ({{ kpis().length }})</h4>
            @if (isOwner() || isManager() || canManage()) {
              <button (click)="addKpi()" class="text-[11px] text-brand hover:underline">+ Add KPI</button>
            }
          </div>
          @for (k of kpis(); track k.id) {
            <div class="rounded-md bg-surface p-2 grid md:grid-cols-12 gap-2 text-[12px]">
              <input [(ngModel)]="k.kpi_name" placeholder="KPI name"
                     class="md:col-span-3 rounded-md border border-border px-2 py-1 text-sm" />
              <input type="number" [(ngModel)]="k.weight_pct" placeholder="weight %" min="0" max="100"
                     class="md:col-span-1 rounded-md border border-border px-2 py-1 text-sm" />
              <input [(ngModel)]="k.target" placeholder="target"
                     class="md:col-span-2 rounded-md border border-border px-2 py-1 text-sm" />
              <input [(ngModel)]="k.achievement" placeholder="achievement"
                     class="md:col-span-2 rounded-md border border-border px-2 py-1 text-sm" />
              <input type="number" [(ngModel)]="k.self_score" placeholder="self 1–5" min="1" max="5"
                     class="md:col-span-1 rounded-md border border-border px-2 py-1 text-sm" />
              <input type="number" [(ngModel)]="k.manager_score" placeholder="mgr 1–5" min="1" max="5"
                     class="md:col-span-1 rounded-md border border-border px-2 py-1 text-sm" />
              <div class="md:col-span-2 flex gap-1 justify-end">
                <button (click)="saveKpi(k)" class="text-[11px] text-brand hover:underline">Save</button>
                <button (click)="removeKpi(k)" class="text-[11px] text-danger-fg hover:underline">Del</button>
              </div>
            </div>
          }
          @if (kpis().length === 0) {
            <p class="text-[11px] text-ink-soft">No KPIs yet.</p>
          }
        </div>

        <!-- Self review -->
        @if (isOwner() || canManage()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Self review</h4>
            <textarea rows="4" [(ngModel)]="selfSummary"
                      [disabled]="!isOwner() || selected()!.status === 'finalized' || selected()!.status === 'acknowledged'"
                      class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            @if (isOwner() && selected()!.status === 'self_pending') {
              <button (click)="submitSelf()"
                      [disabled]="!selfSummary.trim()"
                      class="px-3 py-1 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Submit self review</button>
            }
          </div>
        }

        <!-- Manager review -->
        @if (isManager() || canManage()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Manager review</h4>
            <textarea rows="4" [(ngModel)]="managerSummary"
                      class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            <div class="flex items-center gap-2">
              <label class="text-[10px] uppercase text-ink-soft">Overall score (1–5)</label>
              <input type="number" min="1" max="5" step="0.1" [(ngModel)]="overallScore"
                     class="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm" />
              <button (click)="submitManager()"
                      [disabled]="!managerSummary.trim() || !overallScore"
                      class="ml-auto px-3 py-1 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Finalize</button>
            </div>
          </div>
        }

        @if (isOwner() && selected()!.status === 'finalized') {
          <button (click)="acknowledge()"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-good-fg text-white">I acknowledge the review</button>
        }

        <!-- 360 -->
        <div class="rounded-md border border-border p-3 space-y-2">
          <h4 class="text-[12px] uppercase font-semibold text-ink-soft">360° feedback ({{ feedback360().length }})</h4>
          @if (isManager() || canManage()) {
            @for (f of feedback360(); track f.id) {
              <div class="rounded-md bg-surface p-2 text-[12px] space-y-1">
                <p class="text-[10px] uppercase text-ink-soft">{{ RELATIONSHIP_LABELS[f.relationship] }} · {{ f.is_anonymous ? 'Anonymous' : 'Identified' }} · rating {{ f.rating ?? '—' }}</p>
                @if (f.strengths) { <p><span class="font-semibold">Strengths:</span> {{ f.strengths }}</p> }
                @if (f.improvements) { <p><span class="font-semibold">Improve:</span> {{ f.improvements }}</p> }
              </div>
            }
            @if (feedback360().length === 0) { <p class="text-[11px] text-ink-soft">No 360 feedback yet.</p> }
          }

          @if (!isOwner() && !alreadyGave360()) {
            <div class="rounded-md border border-border p-2 space-y-2 mt-2">
              <p class="text-[11px] uppercase text-ink-soft font-semibold">Submit 360 feedback (anonymous by default)</p>
              <div class="grid md:grid-cols-2 gap-2">
                <label class="block">
                  <span class="text-[10px] uppercase text-ink-soft">Your relationship</span>
                  <select [(ngModel)]="f360.relationship"
                          class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                    @for (k of relationshipKeys; track k) { <option [value]="k">{{ RELATIONSHIP_LABELS[k] }}</option> }
                  </select>
                </label>
                <label class="block">
                  <span class="text-[10px] uppercase text-ink-soft">Rating (1–5)</span>
                  <input type="number" min="1" max="5" [(ngModel)]="f360.rating"
                         class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" />
                </label>
              </div>
              <textarea rows="2" placeholder="Strengths" [(ngModel)]="f360.strengths"
                        class="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"></textarea>
              <textarea rows="2" placeholder="Areas to improve" [(ngModel)]="f360.improvements"
                        class="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"></textarea>
              <label class="flex items-center gap-2 text-[11px]">
                <input type="checkbox" [(ngModel)]="f360.anonymous" /> Anonymous
              </label>
              <button (click)="submit360()" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">Submit feedback</button>
            </div>
          }
        </div>
      </div>
    </div>
  }
</section>
  `,
})
export class PerformancePage implements OnInit {
  private svc = inject(PerformanceService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected REVIEW_STATUS_LABELS = REVIEW_STATUS_LABELS;
  protected RELATIONSHIP_LABELS = RELATIONSHIP_LABELS;
  protected relationshipKeys: Relationship[] = ['peer','direct_report','manager','cross_team','self'];

  protected cycles = signal<PerfCycle[]>([]);
  protected reviews = signal<PerfReview[]>([]);
  protected staff = signal<{ id: string; full_name: string; role_slug: string }[]>([]);
  protected selected = signal<PerfReview | null>(null);
  protected kpis = signal<PerfKpi[]>([]);
  protected feedback360 = signal<Perf360[]>([]);

  protected tab = signal<'mine' | 'team' | 'all'>('mine');
  protected filterCycleId: string | null = null;
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  protected detailOpen = signal(false);
  protected cycleEditorOpen = signal(false);
  protected openReviewModalOpen = signal(false);

  protected selfSummary = '';
  protected managerSummary = '';
  protected overallScore: number | null = null;

  protected cycleForm: Partial<PerfCycle> & { name: string; period_start: string; period_end: string } = {
    name: '', period_start: '', period_end: '',
    self_review_due: null, manager_review_due: null, peer_review_due: null,
  };

  protected openForm: { cycleId: string | null; staffId: string | null; managerStaffId: string | null } = {
    cycleId: null, staffId: null, managerStaffId: null,
  };

  protected f360: { relationship: Relationship; rating: number | null; strengths: string; improvements: string; anonymous: boolean } = {
    relationship: 'peer', rating: null, strengths: '', improvements: '', anonymous: true,
  };

  protected canManage = computed(() => this.auth.has('perf.manage'));
  protected myStaffId = computed(() => this.auth.staffId());
  protected isOwner = computed(() => this.selected()?.staff_id === this.myStaffId());
  protected isManager = computed(() => this.selected()?.manager_staff_id === this.myStaffId());
  protected alreadyGave360 = computed(() => {
    const me = this.myStaffId();
    return this.feedback360().some(f => f.reviewer_staff_id === me);
  });

  protected filtered = computed(() => {
    const me = this.myStaffId();
    const list = this.reviews();
    if (this.tab() === 'mine') return list.filter(r => r.staff_id === me);
    if (this.tab() === 'team') return list.filter(r => r.manager_staff_id === me);
    return list;
  });

  protected tabs = [
    { id: 'mine' as const, label: 'Mine',  count: () => this.reviews().filter(r => r.staff_id === this.myStaffId()).length },
    { id: 'team' as const, label: 'My team',  count: () => this.reviews().filter(r => r.manager_staff_id === this.myStaffId()).length },
    ...(this.auth.has('perf.manage') ? [{ id: 'all' as const, label: 'All reviews', count: () => this.reviews().length }] : []),
  ];

  ngOnInit() { void this.refresh(); }

  protected formatDate(s: string): string { return new Date(s).toLocaleDateString(); }
  protected staffName(id: string): string {
    return this.staff().find(s => s.id === id)?.full_name ?? id.slice(0, 8);
  }

  protected async refresh(): Promise<void> {
    try {
      const [cycles, staff] = await Promise.all([
        this.svc.listCycles().catch(() => []),
        this.svc.listStaff().catch(() => []),
      ]);
      this.cycles.set(cycles);
      this.staff.set(staff);
      const reviews = await this.svc.listReviews({ cycleId: this.filterCycleId ?? undefined }).catch(() => []);
      this.reviews.set(reviews);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected openCycleEditor(): void {
    this.cycleForm = { name: '', period_start: '', period_end: '', self_review_due: null, manager_review_due: null, peer_review_due: null };
    this.cycleEditorOpen.set(true);
  }
  protected closeCycleEditor(): void { this.cycleEditorOpen.set(false); }

  protected async saveCycle(): Promise<void> {
    if (!this.cycleForm.name?.trim() || !this.cycleForm.period_start || !this.cycleForm.period_end) return;
    this.busy.set(true);
    try {
      await this.svc.upsertCycle({
        name: this.cycleForm.name.trim(),
        period_start: this.cycleForm.period_start,
        period_end: this.cycleForm.period_end,
        self_review_due: this.cycleForm.self_review_due ?? null,
        manager_review_due: this.cycleForm.manager_review_due ?? null,
        peer_review_due: this.cycleForm.peer_review_due ?? null,
        branch_id: this.branchStore.activeBranchId(),
      });
      this.cycleEditorOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected openOpenReview(): void {
    this.openForm = { cycleId: this.cycles()[0]?.id ?? null, staffId: null, managerStaffId: null };
    this.openReviewModalOpen.set(true);
  }
  protected closeOpenReview(): void { this.openReviewModalOpen.set(false); }

  protected async saveOpenReview(): Promise<void> {
    if (!this.openForm.cycleId || !this.openForm.staffId) return;
    this.busy.set(true);
    try {
      await this.svc.openReview({
        cycleId: this.openForm.cycleId,
        staffId: this.openForm.staffId,
        managerStaffId: this.openForm.managerStaffId,
      });
      this.openReviewModalOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async openReview(r: PerfReview): Promise<void> {
    this.selected.set(r);
    this.selfSummary = r.self_summary ?? '';
    this.managerSummary = r.manager_summary ?? '';
    this.overallScore = r.overall_score;
    this.detailOpen.set(true);
    try {
      const [kpis, f360] = await Promise.all([
        this.svc.kpisFor(r.id),
        this.svc.feedback360For(r.id).catch(() => []),
      ]);
      this.kpis.set(kpis);
      this.feedback360.set(f360);
    } catch (e) {
      this.kpis.set([]);
      this.feedback360.set([]);
    }
  }

  protected closeDetail(): void { this.detailOpen.set(false); }

  protected addKpi(): void {
    const r = this.selected();
    if (!r) return;
    const newKpi: PerfKpi = {
      id: '', review_id: r.id, ord: (this.kpis().length + 1) * 10,
      kpi_name: '', weight_pct: 0, target: null, achievement: null,
      self_score: null, manager_score: null, comments: null,
    };
    this.kpis.set([...this.kpis(), newKpi]);
  }

  protected async saveKpi(k: PerfKpi): Promise<void> {
    if (!k.kpi_name?.trim()) return;
    try {
      const id = await this.svc.upsertKpi({
        id: k.id || undefined,
        review_id: k.review_id,
        ord: k.ord,
        kpi_name: k.kpi_name.trim(),
        weight_pct: k.weight_pct || 0,
        target: k.target,
        achievement: k.achievement,
        self_score: k.self_score,
        manager_score: k.manager_score,
        comments: k.comments,
      });
      if (!k.id) {
        this.kpis.set(this.kpis().map(x => x === k ? { ...k, id } : x));
      }
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async removeKpi(k: PerfKpi): Promise<void> {
    if (k.id && !confirm(`Delete KPI "${k.kpi_name}"?`)) return;
    try {
      if (k.id) await this.svc.deleteKpi(k.id);
      this.kpis.set(this.kpis().filter(x => x !== k));
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async submitSelf(): Promise<void> {
    const r = this.selected();
    if (!r || !this.selfSummary.trim()) return;
    try {
      await this.svc.submitSelf(r.id, this.selfSummary.trim());
      await this.refresh();
      this.closeDetail();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async submitManager(): Promise<void> {
    const r = this.selected();
    if (!r || !this.managerSummary.trim() || !this.overallScore) return;
    try {
      await this.svc.submitManager(r.id, this.managerSummary.trim(), this.overallScore);
      await this.refresh();
      this.closeDetail();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async acknowledge(): Promise<void> {
    const r = this.selected();
    if (!r) return;
    try {
      await this.svc.acknowledge(r.id);
      await this.refresh();
      this.selected.set({ ...r, status: 'acknowledged' });
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async submit360(): Promise<void> {
    const r = this.selected();
    if (!r) return;
    try {
      await this.svc.submit360({
        reviewId: r.id,
        anonymous: this.f360.anonymous,
        relationship: this.f360.relationship,
        strengths: this.f360.strengths || null,
        improvements: this.f360.improvements || null,
        rating: this.f360.rating,
      });
      this.feedback360.set(await this.svc.feedback360For(r.id).catch(() => []));
      this.f360 = { relationship: 'peer', rating: null, strengths: '', improvements: '', anonymous: true };
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }
}
