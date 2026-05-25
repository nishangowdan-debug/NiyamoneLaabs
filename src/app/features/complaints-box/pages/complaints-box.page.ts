import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ComplaintsBoxService } from '../data/complaints-box.service';
import {
  COMPLAINT_BOX_STATUS_LABELS,
  COMPLAINT_BOX_TYPE_LABELS,
  type ComplaintBoxEntry,
  type ComplaintBoxStatus,
  type ComplaintBoxType,
} from '../data/complaints-box.types';

@Component({
  selector: 'page-complaints-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Complaints &amp; Suggestions Box</h1>
    <p class="text-[12px] text-ink-soft">A lightweight channel for non-formal complaints, suggestions, and compliments. Defaults to anonymous.</p>
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
      <h3 class="text-sm font-semibold">Drop a note in the box</h3>
      <div class="grid md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type</span>
          <select [(ngModel)]="form.type"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (k of typeKeys; track k) { <option [value]="k">{{ COMPLAINT_BOX_TYPE_LABELS[k] }}</option> }
          </select>
        </label>
        <label class="flex items-center gap-2 text-[12px] mt-6">
          <input type="checkbox" [(ngModel)]="form.isAnonymous" />
          Submit anonymously
        </label>
      </div>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Subject *</span>
        <input [(ngModel)]="form.subject"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Message *</span>
        <textarea rows="4" [(ngModel)]="form.body"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }
      @if (success()) { <p class="text-[12px] text-good-fg">{{ success() }}</p> }
      <button (click)="submit()"
              [disabled]="busy() || !form.subject.trim() || !form.body.trim()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Sending…' : 'Send' }}
      </button>
    </div>
  }

  <!-- Inbox / mine -->
  @if (tab() === 'mine' || tab() === 'inbox') {
    <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Subject</th>
            <th class="px-3 py-2">Body</th>
            <th class="px-3 py-2">Anon?</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Created</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (e of filteredItems(); track e.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2">{{ COMPLAINT_BOX_TYPE_LABELS[e.type] }}</td>
              <td class="px-3 py-2 font-medium">{{ e.subject }}</td>
              <td class="px-3 py-2 text-ink-soft truncate max-w-[280px]">{{ e.body }}</td>
              <td class="px-3 py-2">{{ e.is_anonymous ? 'Yes' : 'No' }}</td>
              <td class="px-3 py-2">{{ COMPLAINT_BOX_STATUS_LABELS[e.status] }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ formatDate(e.created_at) }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="openDetail(e)" class="text-[11px] text-brand hover:underline">Open</button>
              </td>
            </tr>
          }
          @if (filteredItems().length === 0) {
            <tr><td colspan="7" class="px-3 py-6 text-center text-ink-soft">No entries.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (detailOpen() && selected()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeDetail()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <header class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[10px] uppercase tracking-wide text-ink-soft">{{ COMPLAINT_BOX_TYPE_LABELS[selected()!.type] }} · {{ selected()!.is_anonymous ? 'Anonymous' : 'Identified' }}</p>
            <h3 class="text-base font-semibold">{{ selected()!.subject }}</h3>
            <p class="text-[12px] text-ink-soft">{{ formatDateTime(selected()!.created_at) }}</p>
          </div>
          <button (click)="closeDetail()" class="text-ink-soft hover:text-ink">✕</button>
        </header>

        <div class="rounded-md bg-surface p-3 text-[13px] whitespace-pre-line">{{ selected()!.body }}</div>

        @if (canManage()) {
          <div class="rounded-md border border-border p-3 space-y-2">
            <h4 class="text-[12px] uppercase font-semibold text-ink-soft">Respond</h4>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Status</span>
              <select [(ngModel)]="resp.status"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm">
                @for (k of statusKeys; track k) { <option [value]="k">{{ COMPLAINT_BOX_STATUS_LABELS[k] }}</option> }
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Response</span>
              <textarea rows="3" [(ngModel)]="resp.response"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"></textarea>
            </label>
            <button (click)="saveResponse()"
                    class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">Save response</button>
          </div>
        }

        @if (selected()!.response) {
          <div class="rounded-md bg-good-fg/10 border border-good-fg/30 p-3 text-[13px] whitespace-pre-line">
            <p class="text-[10px] uppercase text-good-fg font-semibold mb-1">HR Response · {{ selected()!.responded_at ? formatDateTime(selected()!.responded_at!) : '' }}</p>
            {{ selected()!.response }}
          </div>
        }
      </div>
    </div>
  }
</section>
  `,
})
export class ComplaintsBoxPage implements OnInit {
  private svc = inject(ComplaintsBoxService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);

  protected COMPLAINT_BOX_TYPE_LABELS = COMPLAINT_BOX_TYPE_LABELS;
  protected COMPLAINT_BOX_STATUS_LABELS = COMPLAINT_BOX_STATUS_LABELS;
  protected typeKeys = Object.keys(COMPLAINT_BOX_TYPE_LABELS) as ComplaintBoxType[];
  protected statusKeys = Object.keys(COMPLAINT_BOX_STATUS_LABELS) as ComplaintBoxStatus[];

  protected items = signal<ComplaintBoxEntry[]>([]);
  protected selected = signal<ComplaintBoxEntry | null>(null);
  protected detailOpen = signal(false);
  protected tab = signal<'submit' | 'mine' | 'inbox'>('submit');
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);

  protected form: { type: ComplaintBoxType; isAnonymous: boolean; subject: string; body: string } = {
    type: 'suggestion', isAnonymous: true, subject: '', body: '',
  };
  protected resp: { status: ComplaintBoxStatus; response: string } = { status: 'reviewing', response: '' };

  protected canManage = computed(() => this.auth.has('complaints_box.manage'));
  protected myStaffId = computed(() => this.auth.staffId());

  protected filteredItems = computed(() => {
    if (this.tab() === 'mine') {
      const me = this.myStaffId();
      return this.items().filter(e => e.raised_by_staff_id === me);
    }
    return this.items();
  });

  protected tabs = [
    { id: 'submit' as const, label: 'Submit', count: () => 0 },
    { id: 'mine' as const,   label: 'My submissions', count: () => this.items().filter(e => e.raised_by_staff_id === this.myStaffId()).length },
    ...(this.auth.has('complaints_box.manage') ? [{ id: 'inbox' as const, label: 'HR Inbox', count: () => this.items().length }] : []),
  ];

  ngOnInit() { void this.refresh(); }

  protected formatDate(s: string): string { return new Date(s).toLocaleDateString(); }
  protected formatDateTime(s: string): string { return new Date(s).toLocaleString(); }

  protected async refresh(): Promise<void> {
    try {
      this.items.set(await this.svc.list());
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected async submit(): Promise<void> {
    if (!this.form.subject.trim() || !this.form.body.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await this.svc.submit({
        branchId: this.branchStore.activeBranchId(),
        type: this.form.type,
        isAnonymous: this.form.isAnonymous,
        subject: this.form.subject.trim(),
        body: this.form.body.trim(),
      });
      this.success.set('Sent. Thank you.');
      this.form = { type: 'suggestion', isAnonymous: true, subject: '', body: '' };
      await this.refresh();
      setTimeout(() => this.success.set(null), 3000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected openDetail(e: ComplaintBoxEntry): void {
    this.selected.set(e);
    this.resp = { status: e.status === 'new' ? 'reviewing' : e.status, response: e.response ?? '' };
    this.detailOpen.set(true);
  }

  protected closeDetail(): void { this.detailOpen.set(false); }

  protected async saveResponse(): Promise<void> {
    const e = this.selected();
    if (!e) return;
    try {
      await this.svc.respond({ id: e.id, status: this.resp.status, response: this.resp.response || null });
      await this.refresh();
      this.closeDetail();
    } catch (err: any) {
      alert(err?.message ?? 'Failed');
    }
  }
}
