import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExitService } from '../data/exit.service';
import {
  EXIT_STATUS_LABELS,
  EXIT_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  type ExitClearanceItem,
  type ExitStatus,
  type ExitType,
  type HrExit,
  type SettlementStatus,
} from '../data/exit.types';

@Component({
  selector: 'page-exit-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Exit Management</h1>
      <p class="text-[12px] text-ink-soft">Resignation workflow, clearance checklist, exit interview, F&amp;F status.</p>
    </div>
    <div class="flex items-center gap-2">
      <button (click)="openNew(false)" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Initiate my resignation</button>
      @if (canManage()) {
        <button (click)="openNew(true)" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ HR-initiated exit</button>
      }
    </div>
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

  <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
    <table class="min-w-full text-[12px]">
      <thead class="text-ink-soft text-left">
        <tr>
          <th class="px-3 py-2">Staff</th>
          <th class="px-3 py-2">Type</th>
          <th class="px-3 py-2">Notice</th>
          <th class="px-3 py-2">Expected LWD</th>
          <th class="px-3 py-2">Actual LWD</th>
          <th class="px-3 py-2">Status</th>
          <th class="px-3 py-2">F&amp;F</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (e of filtered(); track e.id) {
          <tr class="border-t border-border">
            <td class="px-3 py-2 font-medium">{{ staffName(e.staff_id) }}</td>
            <td class="px-3 py-2">{{ EXIT_TYPE_LABELS[e.exit_type] }}</td>
            <td class="px-3 py-2 font-mono text-ink-soft">{{ e.notice_date }}</td>
            <td class="px-3 py-2 font-mono text-ink-soft">{{ e.expected_last_day || '—' }}</td>
            <td class="px-3 py-2 font-mono text-ink-soft">{{ e.actual_last_day || '—' }}</td>
            <td class="px-3 py-2">{{ EXIT_STATUS_LABELS[e.status] }}</td>
            <td class="px-3 py-2">
              <span class="text-[10px] uppercase px-1.5 py-0.5 rounded"
                    [class.bg-good-fg]="e.full_final_settlement_status === 'released'" [class.text-white]="e.full_final_settlement_status === 'released' || e.full_final_settlement_status === 'disputed'"
                    [class.bg-warn-fg]="e.full_final_settlement_status === 'processing'"
                    [class.bg-danger-fg]="e.full_final_settlement_status === 'disputed'"
                    [class.bg-surface-subtle]="e.full_final_settlement_status === 'pending'">
                {{ SETTLEMENT_STATUS_LABELS[e.full_final_settlement_status] }}
              </span>
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button (click)="openDetail(e)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="8" class="px-3 py-6 text-center text-ink-soft">No exits.</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Initiate -->
  @if (editorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-xl p-4 space-y-3" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">Initiate exit</h3>

        @if (editorHrMode) {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Staff *</span>
            <select [(ngModel)]="form.staffId"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option [ngValue]="null">— pick —</option>
              @for (s of staff(); track s.id) {
                <option [ngValue]="s.id">{{ s.full_name }} ({{ s.role_slug }})</option>
              }
            </select>
          </label>
        } @else {
          <p class="text-[12px] text-ink-soft">You are initiating your own resignation.</p>
        }

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Type</span>
            <select [(ngModel)]="form.exitType"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              @for (k of typeKeys; track k) { <option [value]="k">{{ EXIT_TYPE_LABELS[k] }}</option> }
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Reason category</span>
            <input [(ngModel)]="form.reasonCategory" placeholder="growth / personal / health…"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason / Notes</span>
          <textarea rows="3" [(ngModel)]="form.reason"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Notice date</span>
            <input type="date" [(ngModel)]="form.noticeDate"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Expected last day</span>
            <input type="date" [(ngModel)]="form.expectedLastDay"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="save()"
                  [disabled]="busy() || (editorHrMode && !form.staffId)"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Initiate' }}
          </button>
        </div>
      </div>
    </div>
  }

  <!-- Detail / Clearance -->
  @if (detailOpen() && selected()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeDetail()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-3xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <header class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ EXIT_TYPE_LABELS[selected()!.exit_type] }} · {{ EXIT_STATUS_LABELS[selected()!.status] }}</p>
            <h3 class="text-base font-semibold">{{ staffName(selected()!.staff_id) }}</h3>
            <p class="text-[12px] text-ink-soft">Notice {{ selected()!.notice_date }} · expected LWD {{ selected()!.expected_last_day || '—' }}</p>
          </div>
          <button (click)="closeDetail()" class="text-ink-soft hover:text-ink">✕</button>
        </header>

        @if (selected()!.reason) {
          <div class="rounded-md bg-surface p-3 text-[13px] whitespace-pre-line">{{ selected()!.reason }}</div>
        }

        <!-- Clearance checklist -->
        <div class="rounded-md border border-border p-3 space-y-2">
          <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Clearance checklist ({{ doneCount() }}/{{ clearance().length }})</h4>
          <div class="space-y-1">
            @for (c of clearance(); track c.id) {
              <div class="flex items-start gap-2 text-[12px] py-1 border-t border-border first:border-t-0">
                @if (canManage()) {
                  <input type="checkbox" [checked]="c.is_done" (change)="toggleClearance(c, !c.is_done)" />
                } @else {
                  <span class="text-[14px]">{{ c.is_done ? '✓' : '○' }}</span>
                }
                <div class="flex-1">
                  <p class="font-medium" [class.line-through]="c.is_done" [class.text-ink-soft]="c.is_done">
                    <span class="text-[10px] uppercase text-ink-soft mr-1">{{ c.department }}</span>
                    {{ c.task }}
                  </p>
                  @if (c.responsible_role) {
                    <p class="text-[10px] text-ink-soft">Owner: {{ c.responsible_role }}</p>
                  }
                </div>
              </div>
            }
            @if (clearance().length === 0) {
              <p class="text-[11px] text-ink-soft">No checklist items.</p>
            }
          </div>
        </div>

        @if (canManage()) {
          <div class="rounded-md border border-border p-3 space-y-3">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">HR controls</h4>
            <div class="grid md:grid-cols-2 gap-3">
              <label class="block">
                <span class="text-[10px] uppercase text-ink-soft">Status</span>
                <select [(ngModel)]="ctrl.status"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                  @for (k of statusKeys; track k) { <option [value]="k">{{ EXIT_STATUS_LABELS[k] }}</option> }
                </select>
              </label>
              <label class="block">
                <span class="text-[10px] uppercase text-ink-soft">Actual last day</span>
                <input type="date" [(ngModel)]="ctrl.actualLastDay"
                       class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" />
              </label>
            </div>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Exit interview notes</span>
              <textarea rows="3" [(ngModel)]="ctrl.interviewNotes"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"></textarea>
            </label>
            <div class="grid md:grid-cols-2 gap-3">
              <label class="block">
                <span class="text-[10px] uppercase text-ink-soft">Exit interview score (1–10)</span>
                <input type="number" min="1" max="10" [(ngModel)]="ctrl.interviewScore"
                       class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-[10px] uppercase text-ink-soft">F&amp;F settlement</span>
                <select [(ngModel)]="ctrl.settlementStatus"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                  @for (k of settlementKeys; track k) { <option [value]="k">{{ SETTLEMENT_STATUS_LABELS[k] }}</option> }
                </select>
              </label>
            </div>
            <button (click)="saveControls()" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">Update</button>
          </div>
        }
      </div>
    </div>
  }
</section>
  `,
})
export class ExitManagementPage implements OnInit {
  private svc = inject(ExitService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected EXIT_TYPE_LABELS = EXIT_TYPE_LABELS;
  protected EXIT_STATUS_LABELS = EXIT_STATUS_LABELS;
  protected SETTLEMENT_STATUS_LABELS = SETTLEMENT_STATUS_LABELS;
  protected typeKeys: ExitType[] = ['resignation','termination','retirement','contract_end','death','other'];
  protected statusKeys: ExitStatus[] = ['notice','in_clearance','interview_pending','completed','withdrawn'];
  protected settlementKeys: SettlementStatus[] = ['pending','processing','released','disputed'];

  protected items = signal<HrExit[]>([]);
  protected staff = signal<{ id: string; full_name: string; role_slug: string }[]>([]);
  protected selected = signal<HrExit | null>(null);
  protected clearance = signal<ExitClearanceItem[]>([]);

  protected tab = signal<'mine' | 'all'>('mine');
  protected editorOpen = signal(false);
  protected detailOpen = signal(false);
  protected editorHrMode = false;
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  protected form: { staffId: string | null; exitType: ExitType; reasonCategory: string; reason: string; noticeDate: string; expectedLastDay: string } = {
    staffId: null, exitType: 'resignation', reasonCategory: '', reason: '',
    noticeDate: new Date().toISOString().slice(0,10), expectedLastDay: '',
  };

  protected ctrl: { status: ExitStatus; actualLastDay: string; interviewNotes: string; interviewScore: number | null; settlementStatus: SettlementStatus } = {
    status: 'in_clearance', actualLastDay: '', interviewNotes: '', interviewScore: null, settlementStatus: 'pending',
  };

  protected canManage = computed(() => this.auth.has('exit.manage'));
  protected myStaffId = computed(() => this.auth.staffId());

  protected filtered = computed(() => {
    if (this.tab() === 'mine') return this.items().filter(e => e.staff_id === this.myStaffId());
    return this.items();
  });

  protected doneCount = computed(() => this.clearance().filter(c => c.is_done).length);

  protected tabs = [
    { id: 'mine' as const, label: 'My exit', count: () => this.items().filter(e => e.staff_id === this.myStaffId()).length },
    ...(this.auth.has('exit.manage') ? [{ id: 'all' as const, label: 'All exits', count: () => this.items().length }] : []),
  ];

  ngOnInit() { void this.refresh(); }

  protected staffName(id: string): string {
    return this.staff().find(s => s.id === id)?.full_name ?? id.slice(0, 8);
  }

  protected async refresh(): Promise<void> {
    try {
      const [items, staff] = await Promise.all([
        this.svc.list(),
        this.svc.listStaff().catch(() => []),
      ]);
      this.items.set(items);
      this.staff.set(staff);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected openNew(hrMode: boolean): void {
    this.editorHrMode = hrMode;
    this.form = {
      staffId: hrMode ? null : this.myStaffId(),
      exitType: 'resignation', reasonCategory: '', reason: '',
      noticeDate: new Date().toISOString().slice(0,10), expectedLastDay: '',
    };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void { this.editorOpen.set(false); }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.initiate({
        branchId: this.branchStore.activeBranchId(),
        staffId: this.editorHrMode ? this.form.staffId : this.myStaffId(),
        exitType: this.form.exitType,
        reasonCategory: this.form.reasonCategory || null,
        reason: this.form.reason || null,
        noticeDate: this.form.noticeDate || null,
        expectedLastDay: this.form.expectedLastDay || null,
      });
      this.editorOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async openDetail(e: HrExit): Promise<void> {
    this.selected.set(e);
    this.ctrl = {
      status: e.status,
      actualLastDay: e.actual_last_day ?? '',
      interviewNotes: e.exit_interview_notes ?? '',
      interviewScore: e.exit_interview_score,
      settlementStatus: e.full_final_settlement_status,
    };
    this.detailOpen.set(true);
    try {
      this.clearance.set(await this.svc.listClearance(e.id));
    } catch {
      this.clearance.set([]);
    }
  }

  protected closeDetail(): void { this.detailOpen.set(false); }

  protected async toggleClearance(c: ExitClearanceItem, next: boolean): Promise<void> {
    try {
      await this.svc.toggleClearance({ clearanceId: c.id, isDone: next });
      this.clearance.set(this.clearance().map(x => x.id === c.id ? { ...x, is_done: next, done_at: next ? new Date().toISOString() : null } : x));
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async saveControls(): Promise<void> {
    const e = this.selected();
    if (!e) return;
    try {
      await this.svc.setStatus({
        id: e.id,
        status: this.ctrl.status,
        actualLastDay: this.ctrl.actualLastDay || null,
        interviewNotes: this.ctrl.interviewNotes || null,
        interviewScore: this.ctrl.interviewScore,
        settlementStatus: this.ctrl.settlementStatus,
      });
      await this.refresh();
      this.closeDetail();
    } catch (err: any) {
      alert(err?.message ?? 'Failed');
    }
  }
}
