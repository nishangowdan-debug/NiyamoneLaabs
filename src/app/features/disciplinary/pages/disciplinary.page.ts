import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { DisciplinaryService } from '../data/disciplinary.service';
import {
  DISCIPLINARY_STATUS_LABELS,
  DISCIPLINARY_TYPE_LABELS,
  type DisciplinaryAction,
  type DisciplinaryActionType,
  type DisciplinarySeverity,
  type DisciplinaryStatus,
} from '../data/disciplinary.types';

@Component({
  selector: 'page-disciplinary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Disciplinary Actions</h1>
      <p class="text-[12px] text-ink-soft">Confidential paper trail — warnings, PIPs, suspensions. Staff see their own actions; HR sees all.</p>
    </div>
    @if (canIssue()) {
      <button (click)="openNew()" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ Issue action</button>
    }
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
          <th class="px-3 py-2">Case</th>
          <th class="px-3 py-2">Staff</th>
          <th class="px-3 py-2">Type</th>
          <th class="px-3 py-2">Severity</th>
          <th class="px-3 py-2">Reason</th>
          <th class="px-3 py-2">Effective</th>
          <th class="px-3 py-2">Status</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        @for (a of filtered(); track a.id) {
          <tr class="border-t border-border" [class.bg-danger-fg]="a.severity === 'critical'" [class.bg-opacity-5]="a.severity === 'critical'">
            <td class="px-3 py-2 font-mono">{{ a.case_no }}</td>
            <td class="px-3 py-2">{{ staffName(a.staff_id) }}</td>
            <td class="px-3 py-2">{{ DISCIPLINARY_TYPE_LABELS[a.action_type] }}</td>
            <td class="px-3 py-2">
              <span class="text-[10px] uppercase px-1.5 py-0.5 rounded"
                    [class.bg-danger-fg]="a.severity === 'critical' || a.severity === 'high'"
                    [class.text-white]="a.severity === 'critical' || a.severity === 'high'"
                    [class.bg-warn-fg]="a.severity === 'medium'"
                    [class.bg-surface-subtle]="a.severity === 'low'">{{ a.severity }}</span>
            </td>
            <td class="px-3 py-2 truncate max-w-[200px]">{{ a.reason }}</td>
            <td class="px-3 py-2 font-mono text-ink-soft">{{ a.effective_from }}{{ a.effective_to ? ' → ' + a.effective_to : '' }}</td>
            <td class="px-3 py-2">{{ DISCIPLINARY_STATUS_LABELS[a.status] }}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button (click)="openDetail(a)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="8" class="px-3 py-6 text-center text-ink-soft">No disciplinary actions.</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Editor (HR-only) -->
  @if (editorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">Issue disciplinary action</h3>

        <div class="grid md:grid-cols-2 gap-3">
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
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Type *</span>
            <select [(ngModel)]="form.actionType"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              @for (k of typeKeys; track k) { <option [value]="k">{{ DISCIPLINARY_TYPE_LABELS[k] }}</option> }
            </select>
          </label>
        </div>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Severity</span>
            <select [(ngModel)]="form.severity"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="low">Low</option><option value="medium">Medium</option>
              <option value="high">High</option><option value="critical">Critical</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-[12px] mt-6">
            <input type="checkbox" [(ngModel)]="form.issueNow" /> Issue immediately (skip draft)
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason *</span>
          <input [(ngModel)]="form.reason"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Description</span>
          <textarea rows="4" [(ngModel)]="form.description"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Effective from</span>
            <input type="date" [(ngModel)]="form.effectiveFrom"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Effective to (suspension)</span>
            <input type="date" [(ngModel)]="form.effectiveTo"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Document URL</span>
          <input [(ngModel)]="form.documentUrl"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="save()"
                  [disabled]="busy() || !form.staffId || !form.reason.trim()"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  }

  <!-- Detail -->
  @if (detailOpen() && selected()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeDetail()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <header class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ selected()!.case_no }} · {{ DISCIPLINARY_STATUS_LABELS[selected()!.status] }}</p>
            <h3 class="text-base font-semibold">{{ DISCIPLINARY_TYPE_LABELS[selected()!.action_type] }} — {{ staffName(selected()!.staff_id) }}</h3>
            <p class="text-[12px] text-ink-soft">Effective {{ selected()!.effective_from }}{{ selected()!.effective_to ? ' → ' + selected()!.effective_to : '' }}</p>
          </div>
          <button (click)="closeDetail()" class="text-ink-soft hover:text-ink">✕</button>
        </header>

        <div class="rounded-md bg-surface p-3">
          <p class="text-[11px] uppercase text-ink-soft font-semibold mb-1">Reason</p>
          <p class="text-[13px]">{{ selected()!.reason }}</p>
          @if (selected()!.description) {
            <p class="text-[11px] uppercase text-ink-soft font-semibold mt-3 mb-1">Description</p>
            <p class="text-[13px] whitespace-pre-line">{{ selected()!.description }}</p>
          }
          @if (selected()!.document_url) {
            <a [href]="selected()!.document_url" target="_blank" rel="noopener" class="inline-block mt-3 text-[12px] text-brand hover:underline">Open document →</a>
          }
        </div>

        @if (isMyAction()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Your response</h4>
            <textarea rows="3" [(ngModel)]="responseText"
                      class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            <div class="flex gap-2">
              @if (selected()!.status === 'issued') {
                <button (click)="changeStatus('acknowledged')" class="px-3 py-1 text-[12px] rounded-md bg-good-fg text-white">Acknowledge</button>
                <button (click)="changeStatus('contested')" class="px-3 py-1 text-[12px] rounded-md bg-warn-fg">Contest</button>
              }
              <button (click)="saveResponse()"
                      [disabled]="!responseText.trim()"
                      class="ml-auto px-3 py-1 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">Save response</button>
            </div>
          </div>
        }

        @if (selected()!.staff_response) {
          <div class="rounded-md bg-surface-subtle p-3">
            <p class="text-[11px] uppercase text-ink-soft font-semibold mb-1">Staff response</p>
            <p class="text-[13px] whitespace-pre-line">{{ selected()!.staff_response }}</p>
          </div>
        }

        @if (canIssue()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">HR actions</h4>
            <div class="flex flex-wrap gap-2">
              @if (selected()!.status === 'draft') {
                <button (click)="changeStatus('issued')" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">Issue</button>
              }
              <button (click)="changeStatus('closed')" class="px-3 py-1 text-[12px] rounded-md border border-border">Close</button>
              <button (click)="changeStatus('rescinded')" class="px-3 py-1 text-[12px] rounded-md border border-danger-fg text-danger-fg">Rescind</button>
            </div>
          </div>
        }
      </div>
    </div>
  }
</section>
  `,
})
export class DisciplinaryPage implements OnInit {
  private svc = inject(DisciplinaryService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected DISCIPLINARY_TYPE_LABELS = DISCIPLINARY_TYPE_LABELS;
  protected DISCIPLINARY_STATUS_LABELS = DISCIPLINARY_STATUS_LABELS;
  protected typeKeys = Object.keys(DISCIPLINARY_TYPE_LABELS) as DisciplinaryActionType[];

  protected items = signal<DisciplinaryAction[]>([]);
  protected staff = signal<{ id: string; full_name: string; role_slug: string }[]>([]);
  protected selected = signal<DisciplinaryAction | null>(null);
  protected detailOpen = signal(false);
  protected editorOpen = signal(false);

  protected tab = signal<'mine' | 'all'>('mine');
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected responseText = '';

  protected form: {
    staffId: string | null;
    actionType: DisciplinaryActionType;
    severity: DisciplinarySeverity;
    reason: string;
    description: string;
    effectiveFrom: string;
    effectiveTo: string;
    documentUrl: string;
    issueNow: boolean;
  } = {
    staffId: null, actionType: 'written_warning', severity: 'medium',
    reason: '', description: '', effectiveFrom: new Date().toISOString().slice(0,10),
    effectiveTo: '', documentUrl: '', issueNow: false,
  };

  protected canIssue = computed(() => this.auth.has('disciplinary.write'));
  protected myStaffId = computed(() => this.auth.staffId());
  protected isMyAction = computed(() => this.selected()?.staff_id === this.myStaffId());

  protected filtered = computed(() => {
    if (this.tab() === 'mine') return this.items().filter(a => a.staff_id === this.myStaffId());
    return this.items();
  });

  protected tabs = [
    { id: 'mine' as const, label: 'My actions', count: () => this.items().filter(a => a.staff_id === this.myStaffId()).length },
    ...(this.auth.has('disciplinary.write') ? [{ id: 'all' as const, label: 'All cases', count: () => this.items().length }] : []),
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

  protected openNew(): void {
    this.form = {
      staffId: null, actionType: 'written_warning', severity: 'medium',
      reason: '', description: '', effectiveFrom: new Date().toISOString().slice(0,10),
      effectiveTo: '', documentUrl: '', issueNow: false,
    };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void { this.editorOpen.set(false); }

  protected async save(): Promise<void> {
    if (!this.form.staffId || !this.form.reason.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.create({
        branchId: this.branchStore.activeBranchId(),
        staffId: this.form.staffId,
        actionType: this.form.actionType,
        severity: this.form.severity,
        reason: this.form.reason.trim(),
        description: this.form.description || null,
        effectiveFrom: this.form.effectiveFrom || null,
        effectiveTo: this.form.effectiveTo || null,
        documentUrl: this.form.documentUrl || null,
        issueNow: this.form.issueNow,
      });
      this.editorOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected openDetail(a: DisciplinaryAction): void {
    this.selected.set(a);
    this.responseText = a.staff_response ?? '';
    this.detailOpen.set(true);
  }

  protected closeDetail(): void { this.detailOpen.set(false); }

  protected async changeStatus(status: DisciplinaryStatus): Promise<void> {
    const a = this.selected();
    if (!a) return;
    try {
      await this.svc.changeStatus(a.id, status);
      await this.refresh();
      this.selected.set({ ...a, status });
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async saveResponse(): Promise<void> {
    const a = this.selected();
    if (!a || !this.responseText.trim()) return;
    try {
      await this.svc.setResponse(a.id, this.responseText.trim());
      await this.refresh();
      this.closeDetail();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }
}
