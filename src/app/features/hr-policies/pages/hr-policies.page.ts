import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { HrPolicyService } from '../data/hr-policy.service';
import {
  POLICY_CATEGORIES,
  POLICY_CATEGORY_LABELS,
  type HrPolicy,
  type PolicyCompliance,
} from '../data/hr-policy.types';

@Component({
  selector: 'page-hr-policies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">HR Policies</h1>
      <p class="text-[12px] text-ink-soft">Browse, acknowledge, and (for HR admins) author policies. Compliance is tracked per staff.</p>
    </div>
    @if (canManage()) {
      <button (click)="openNew()" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ New policy</button>
    }
  </header>

  <nav class="flex gap-1 border-b border-border">
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

  <!-- Library -->
  @if (tab() === 'library') {
    <div class="flex items-center gap-2">
      <label class="text-[10px] uppercase text-ink-soft">Category</label>
      <select [(ngModel)]="filterCategory" (ngModelChange)="refresh()"
              class="rounded-md border border-border bg-surface px-2 py-1 text-sm">
        <option value="">All</option>
        @for (c of categories; track c) { <option [value]="c">{{ POLICY_CATEGORY_LABELS[c] || c }}</option> }
      </select>
    </div>

    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      @for (p of policies(); track p.id) {
        <div class="rounded-md border border-border bg-surface-card p-3 space-y-1">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ POLICY_CATEGORY_LABELS[p.category] || p.category }}</p>
              <h3 class="text-sm font-semibold leading-snug">{{ p.title }}</h3>
              <p class="text-[11px] text-ink-soft font-mono">{{ p.code }} · v{{ p.version }} · eff. {{ p.effective_date }}</p>
            </div>
            @if (isAcknowledged(p.id)) {
              <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-good-fg text-white">Acked</span>
            } @else if (p.requires_ack) {
              <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-warn-fg">Pending</span>
            }
          </div>

          @if (p.body) {
            <p class="text-[12px] text-ink-soft whitespace-pre-line line-clamp-4">{{ p.body }}</p>
          }
          @if (p.document_url) {
            <a [href]="p.document_url" target="_blank" rel="noopener"
               class="inline-block text-[11px] text-brand hover:underline">Open document →</a>
          }
          <div class="flex items-center gap-2 pt-2">
            @if (p.requires_ack && !isAcknowledged(p.id)) {
              <button (click)="acknowledge(p)"
                      class="px-2.5 py-1 text-[11px] rounded-md bg-brand text-white">I acknowledge</button>
            }
            @if (canManage()) {
              <button (click)="openEdit(p)" class="ml-auto text-[11px] text-brand hover:underline">Edit</button>
            }
          </div>
        </div>
      }
      @if (policies().length === 0) {
        <p class="text-[12px] text-ink-soft md:col-span-2 lg:col-span-3 text-center py-6">No policies yet.</p>
      }
    </div>
  }

  <!-- Compliance dashboard -->
  @if (tab() === 'compliance') {
    @if (canManage()) {
      <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr>
              <th class="px-3 py-2">Code</th>
              <th class="px-3 py-2">Title</th>
              <th class="px-3 py-2">Category</th>
              <th class="px-3 py-2">Version</th>
              <th class="px-3 py-2 text-right">Acknowledged</th>
              <th class="px-3 py-2 text-right">Compliance</th>
            </tr>
          </thead>
          <tbody>
            @for (c of compliance(); track c.policy_id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2 font-mono">{{ c.code }}</td>
                <td class="px-3 py-2 font-medium">{{ c.title }}</td>
                <td class="px-3 py-2">{{ POLICY_CATEGORY_LABELS[c.category] || c.category }}</td>
                <td class="px-3 py-2">v{{ c.version }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ c.acknowledged }}/{{ c.total_staff }}</td>
                <td class="px-3 py-2 text-right tabular-nums">
                  <span [class.text-good-fg]="c.compliance_pct >= 90"
                        [class.text-warn-fg]="c.compliance_pct >= 50 && c.compliance_pct < 90"
                        [class.text-danger-fg]="c.compliance_pct < 50">{{ c.compliance_pct }}%</span>
                </td>
              </tr>
            }
            @if (compliance().length === 0) {
              <tr><td colspan="6" class="px-3 py-6 text-center text-ink-soft">No active policies require acknowledgment.</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="text-[12px] text-ink-soft">Compliance dashboard is HR-admin only.</p>
    }
  }

  <!-- Editor -->
  @if (editorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">{{ form.id ? 'Edit policy' : 'New policy' }}</h3>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Code *</span>
            <input [(ngModel)]="form.code" placeholder="HR-001"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Version</span>
            <input [(ngModel)]="form.version" placeholder="1.0"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Title *</span>
          <input [(ngModel)]="form.title"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Category</span>
            <select [(ngModel)]="form.category"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              @for (c of categories; track c) { <option [value]="c">{{ POLICY_CATEGORY_LABELS[c] || c }}</option> }
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Effective date</span>
            <input type="date" [(ngModel)]="form.effective_date"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Document URL</span>
          <input [(ngModel)]="form.document_url" placeholder="https://…"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Body / Summary</span>
          <textarea rows="6" [(ngModel)]="form.body"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-[12px]">
            <input type="checkbox" [(ngModel)]="form.requires_ack" /> Requires acknowledgment
          </label>
          <label class="flex items-center gap-2 text-[12px]">
            <input type="checkbox" [(ngModel)]="form.is_active" /> Active
          </label>
        </div>

        @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="save()"
                  [disabled]="busy() || !form.code?.trim() || !form.title?.trim()"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  }
</section>
  `,
})
export class HrPoliciesPage implements OnInit {
  private svc = inject(HrPolicyService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected POLICY_CATEGORY_LABELS = POLICY_CATEGORY_LABELS;
  protected categories = POLICY_CATEGORIES;

  protected tab = signal<'library' | 'compliance'>('library');
  protected policies = signal<HrPolicy[]>([]);
  protected compliance = signal<PolicyCompliance[]>([]);
  protected ackedIds = signal<Set<string>>(new Set());

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected editorOpen = signal(false);
  protected filterCategory = '';

  protected form: Omit<Partial<HrPolicy>, 'id'> & { id: string | null } = {
    id: null,
    code: '',
    title: '',
    category: 'general',
    version: '1.0',
    effective_date: new Date().toISOString().slice(0, 10),
    document_url: '',
    body: '',
    requires_ack: true,
    is_active: true,
  };

  protected canManage = computed(() => this.auth.has('hr_policies.write'));

  protected tabs = [
    { id: 'library' as const,    label: 'Library',    count: () => this.policies().length },
    { id: 'compliance' as const, label: 'Compliance', count: () => this.compliance().length },
  ];

  ngOnInit() { void this.refresh(); }

  protected isAcknowledged(id: string): boolean { return this.ackedIds().has(id); }

  protected async refresh(): Promise<void> {
    try {
      const [policies, acks] = await Promise.all([
        this.svc.list({ activeOnly: true, category: this.filterCategory || undefined }),
        this.svc.myAcknowledgments().catch(() => []),
      ]);
      this.policies.set(policies);
      this.ackedIds.set(new Set(acks.map(a => a.policy_id)));
      if (this.canManage()) {
        const c = await this.svc.compliance().catch(() => []);
        this.compliance.set(c);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected async acknowledge(p: HrPolicy): Promise<void> {
    try {
      await this.svc.acknowledge(p.id);
      const next = new Set(this.ackedIds());
      next.add(p.id);
      this.ackedIds.set(next);
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected openNew(): void {
    this.form = {
      id: null, code: '', title: '', category: 'general', version: '1.0',
      effective_date: new Date().toISOString().slice(0, 10),
      document_url: '', body: '', requires_ack: true, is_active: true,
      branch_id: this.branchStore.activeBranchId(),
    };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(p: HrPolicy): void {
    this.form = { ...p };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void { this.editorOpen.set(false); }

  protected async save(): Promise<void> {
    if (!this.form.code?.trim() || !this.form.title?.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.upsert({
        id: this.form.id ?? undefined,
        branch_id: this.form.branch_id ?? null,
        code: this.form.code.trim(),
        title: this.form.title.trim(),
        category: this.form.category ?? 'general',
        version: this.form.version ?? '1.0',
        effective_date: this.form.effective_date,
        document_url: this.form.document_url || null,
        body: this.form.body || null,
        requires_ack: this.form.requires_ack ?? true,
        is_active: this.form.is_active ?? true,
      });
      this.editorOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }
}
