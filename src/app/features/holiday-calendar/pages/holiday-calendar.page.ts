import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { HolidayService } from '../data/holiday.service';
import { HOLIDAY_TYPE_LABELS, type Holiday, type HolidayType } from '../data/holiday.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

@Component({
  selector: 'page-holiday-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ExportMenuComponent],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Holiday Calendar</h1>
      <p class="text-[12px] text-ink-soft">Public, optional and hospital-specific holidays. Drives leave accruals and shift planning.</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="text-[10px] uppercase text-ink-soft">Year</label>
      <select [(ngModel)]="year" (ngModelChange)="refresh()"
              class="rounded-md border border-border bg-surface px-2 py-1 text-sm">
        @for (y of years; track y) { <option [ngValue]="y">{{ y }}</option> }
      </select>
      <app-export-menu [disabled]="items().length === 0" (pick)="onExport($event)"/>
      @if (canManage()) {
        <button (click)="openNew()"
                class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ Add holiday</button>
      }
    </div>
  </header>

  <!-- Tabs -->
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

  <!-- List view -->
  @if (tab() === 'list') {
    <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Day</th>
            <th class="px-3 py-2">Name</th>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Description</th>
            <th class="px-3 py-2">Scope</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (h of items(); track h.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono">{{ h.holiday_date }}</td>
              <td class="px-3 py-2">{{ dayOf(h.holiday_date) }}</td>
              <td class="px-3 py-2 font-medium">{{ h.name }}</td>
              <td class="px-3 py-2">
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide"
                      [class.bg-good-fg]="h.type === 'public'"
                      [class.text-white]="h.type === 'public'"
                      [class.bg-warn-fg]="h.type === 'optional'"
                      [class.bg-surface-subtle]="h.type === 'hospital'">
                  {{ HOLIDAY_TYPE_LABELS[h.type] }}
                </span>
              </td>
              <td class="px-3 py-2 text-ink-soft">{{ h.description || '—' }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ h.branch_id ? 'Branch' : 'All branches' }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (canManage()) {
                  <button (click)="openEdit(h)" class="text-[11px] text-brand hover:underline">Edit</button>
                  <button (click)="remove(h)" class="ml-2 text-[11px] text-danger-fg hover:underline">Delete</button>
                }
              </td>
            </tr>
          }
          @if (items().length === 0) {
            <tr><td colspan="7" class="px-3 py-6 text-center text-ink-soft">No holidays for {{ year() }}.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- Grid (month) view -->
  @if (tab() === 'grid') {
    <div class="grid md:grid-cols-3 gap-3">
      @for (m of months; track m.idx) {
        <div class="rounded-md border border-border bg-surface-card p-3">
          <h3 class="text-[12px] font-semibold mb-2">{{ m.label }} {{ year() }}</h3>
          @for (h of holidaysIn(m.idx); track h.id) {
            <div class="text-[12px] flex items-start gap-2 py-0.5">
              <span class="font-mono text-ink-soft">{{ h.holiday_date.slice(8,10) }}</span>
              <span class="font-medium">{{ h.name }}</span>
              <span class="ml-auto text-[10px] text-ink-soft uppercase">{{ HOLIDAY_TYPE_LABELS[h.type] }}</span>
            </div>
          }
          @if (holidaysIn(m.idx).length === 0) {
            <p class="text-[11px] text-ink-soft">—</p>
          }
        </div>
      }
    </div>
  }

  <!-- Editor modal -->
  @if (editorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-md p-4 space-y-3" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">{{ editing()?.id ? 'Edit holiday' : 'Add holiday' }}</h3>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Date *</span>
          <input type="date" [(ngModel)]="form.date"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Name *</span>
          <input [(ngModel)]="form.name" placeholder="e.g., Diwali"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type *</span>
          <select [(ngModel)]="form.type"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="public">Public</option>
            <option value="optional">Optional</option>
            <option value="hospital">Hospital</option>
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Scope</span>
          <select [(ngModel)]="form.branchId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">All branches</option>
            @for (b of branches(); track b.id) {
              <option [ngValue]="b.id">{{ b.name }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Description</span>
          <textarea rows="2" [(ngModel)]="form.description"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="save()"
                  [disabled]="busy() || !form.date || !form.name?.trim()"
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
export class HolidayCalendarPage implements OnInit {
  private svc = inject(HolidayService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected HOLIDAY_TYPE_LABELS = HOLIDAY_TYPE_LABELS;

  protected items = signal<Holiday[]>([]);
  protected tab = signal<'list' | 'grid'>('list');
  protected year = signal<number>(new Date().getFullYear());
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected editorOpen = signal(false);
  protected editing = signal<Holiday | null>(null);

  protected form: { id: string | null; date: string; name: string; type: HolidayType; branchId: string | null; description: string } = {
    id: null,
    date: '',
    name: '',
    type: 'public',
    branchId: null,
    description: '',
  };

  protected years = (() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  })();

  protected months = [
    { idx: 1, label: 'January' }, { idx: 2, label: 'February' }, { idx: 3, label: 'March' },
    { idx: 4, label: 'April' }, { idx: 5, label: 'May' }, { idx: 6, label: 'June' },
    { idx: 7, label: 'July' }, { idx: 8, label: 'August' }, { idx: 9, label: 'September' },
    { idx: 10, label: 'October' }, { idx: 11, label: 'November' }, { idx: 12, label: 'December' },
  ];

  protected branches = computed(() => this.branchStore.branches());
  protected canManage = computed(() => this.auth.has('holidays.write'));

  protected tabs = [
    { id: 'list' as const, label: 'List',         count: () => this.items().length },
    { id: 'grid' as const, label: 'Year grid',    count: () => this.items().length },
  ];

  ngOnInit() { void this.refresh(); }

  protected dayOf(d: string): string {
    const t = new Date(d + 'T00:00:00');
    return t.toLocaleDateString(undefined, { weekday: 'short' });
  }

  protected holidaysIn(month: number): Holiday[] {
    return this.items().filter(h => Number(h.holiday_date.slice(5, 7)) === month);
  }

  protected async refresh(): Promise<void> {
    try {
      const branchId = this.branchStore.activeBranchId();
      const items = await this.svc.list({ year: this.year(), branchId });
      this.items.set(items);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load');
    }
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form = { id: null, date: '', name: '', type: 'public', branchId: this.branchStore.activeBranchId(), description: '' };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(h: Holiday): void {
    this.editing.set(h);
    this.form = {
      id: h.id,
      date: h.holiday_date,
      name: h.name,
      type: h.type,
      branchId: h.branch_id,
      description: h.description ?? '',
    };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
  }

  protected async save(): Promise<void> {
    if (!this.form.date || !this.form.name?.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.upsert({
        id: this.form.id,
        branchId: this.form.branchId,
        date: this.form.date,
        name: this.form.name.trim(),
        type: this.form.type,
        description: this.form.description?.trim() || null,
      });
      this.editorOpen.set(false);
      await this.refresh();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(h: Holiday): Promise<void> {
    if (!confirm(`Delete holiday "${h.name}" on ${h.holiday_date}?`)) return;
    try {
      await this.svc.delete(h.id);
      await this.refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.items();
    if (list.length === 0) return;

    const rows = list.map(h => ({
      holiday_date: h.holiday_date,
      day:          this.dayOf(h.holiday_date),
      name:         h.name,
      type:         HOLIDAY_TYPE_LABELS[h.type],
      description:  h.description ?? '',
      scope:        h.branch_id ? this.branchStore.activeBranchName() : 'All branches',
    }));

    const columns: ExportColumn<any>[] = [
      { key: 'holiday_date', header: 'Date',        width: 12, align: 'center', format: 'date' as const },
      { key: 'day',          header: 'Day',         width: 10, align: 'center' },
      { key: 'name',         header: 'Holiday',     width: 28, align: 'left' },
      { key: 'type',         header: 'Type',        width: 12, align: 'left' },
      { key: 'description',  header: 'Description', width: 30, align: 'left' },
      { key: 'scope',        header: 'Scope',       width: 22, align: 'left' },
    ];

    await this.exportSvc.export(fmt, {
      filename: `HolidayCalendar_${this.year()}_${this.branchStore.activeBranchName().replace(/\s+/g, '_')}`,
      title: 'Holiday Calendar',
      subtitle: `Year ${this.year()} · ${list.length} holiday${list.length === 1 ? '' : 's'}`,
      meta: { periodLabel: String(this.year()) },
      columns, rows,
      footer: 'Sree Diagnostics · Holiday Calendar',
    });
  }
}
