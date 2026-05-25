import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Lock, Unlock, CalendarClock, Plus } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface PeriodExportRow {
  period_start: string;
  period_end: string;
  status: string;
  closed_at: string;
}

interface FiscalPeriod {
  id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed' | 'locked';
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
}

@Component({
  selector: 'app-period-close-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconCal" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Period Close</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        Close fiscal months once books are reconciled. Locked periods cannot accept new journal entries.
      </p>
    </div>
    <app-export-menu [disabled]="periods().length === 0" (pick)="onExport($event)"/>
  </header>

  <!-- ── Create / open a period (write-only) ── -->
  @if (canWrite()) {
  <section class="bg-surface-card border border-border rounded-[12px] p-4">
    <p class="text-[12px] font-semibold text-ink mb-2 inline-flex items-center gap-1.5">
      <i-lucide [name]="iconPlus" [size]="14" class="text-primary-600"></i-lucide>
      Open a period
    </p>
    <div class="flex flex-wrap gap-3 items-end">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Year</span>
        <input type="number" [(ngModel)]="newYear"
               class="w-[100px] h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Month</span>
        <select [(ngModel)]="newMonth"
                class="w-[120px] h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          @for (m of months; track m.n) { <option [value]="m.n">{{ m.n }} · {{ m.label }}</option> }
        </select>
      </label>
      <button type="button" (click)="openPeriod()" [disabled]="busy()"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700">
        Open period
      </button>
    </div>
  </section>
  }

  <!-- ── Periods list ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Periods</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Period</th>
          <th class="text-left px-4 py-2 font-semibold">Status</th>
          <th class="text-left px-4 py-2 font-semibold">Closed at</th>
          <th class="px-4 py-2 w-[280px]"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (p of periods(); track p.id) {
          <tr>
            <td class="px-4 py-2 font-mono">{{ p.period_start }} → {{ p.period_end }}</td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-good-bg]="p.status === 'open'"   [class.text-good-fg]="p.status === 'open'"
                    [class.bg-warn-bg]="p.status === 'closed'" [class.text-warn-fg]="p.status === 'closed'"
                    [class.bg-danger-fg/10]="p.status === 'locked'" [class.text-danger-fg]="p.status === 'locked'">
                {{ p.status }}
              </span>
            </td>
            <td class="px-4 py-2 text-[11px] text-ink-muted">{{ p.closed_at ? (p.closed_at | date: 'short') : '—' }}</td>
            <td class="px-4 py-2 text-right">
              @if (p.status === 'open' && canWrite()) {
                <button type="button" (click)="close(p)" [disabled]="busy()"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold border border-warn-border text-warn-fg hover:bg-warn-bg/30 inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconLock" [size]="14"></i-lucide><span>Close</span>
                </button>
              }
              @if (p.status === 'closed' && canWrite()) {
                <button type="button" (click)="reopen(p)" [disabled]="busy()"
                        class="h-8 px-3 mr-2 rounded-md text-[12px] font-medium border border-good-fg/40 text-good-fg hover:bg-good-bg/40 inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconUnlock" [size]="14"></i-lucide><span>Re-open</span>
                </button>
                <button type="button" (click)="lock(p)" [disabled]="busy()"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold bg-danger-fg text-white inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconLock" [size]="14"></i-lucide><span>Lock permanently</span>
                </button>
              }
              @if (p.status === 'locked') {
                <span class="text-[11px] text-ink-muted">Locked. Cannot be re-opened.</span>
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="text-center py-8 text-ink-muted">No periods yet. Open one above.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class PeriodClosePage implements OnInit {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);
  private branch   = inject(BranchStore);
  private toast    = inject(ToastService);
  private exportSvc = inject(ExportService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  protected readonly iconCal    = CalendarClock;
  protected readonly iconLock   = Lock;
  protected readonly iconUnlock = Unlock;
  protected readonly iconPlus   = Plus;
  protected readonly canWrite   = computed(() => this.auth.has('ap.write'));

  protected readonly busy    = signal(false);
  protected readonly periods = signal<FiscalPeriod[]>([]);

  protected newYear  = new Date().getFullYear();
  protected newMonth = new Date().getMonth() + 1;
  protected readonly months = [
    { n: 1, label: 'Jan' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' }, { n: 4, label: 'Apr' },
    { n: 5, label: 'May' }, { n: 6, label: 'Jun' }, { n: 7, label: 'Jul' }, { n: 8, label: 'Aug' },
    { n: 9, label: 'Sep' }, { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
  ];

  async ngOnInit() { await this.refresh(); }

  private async refresh() {
    let q = this.db.from('fiscal_periods').select('*').order('period_start', { ascending: false });
    const bid = this.branch.activeBranchId();
    if (bid) q = q.eq('branch_id', bid);
    const { data, error } = await q;
    if (error) { this.toast.error('Load failed', error.message); return; }
    this.periods.set((data ?? []) as FiscalPeriod[]);
  }

  protected async openPeriod() {
    const bid = this.branch.activeBranchId(); if (!bid) { this.toast.error('Pick branch'); return; }
    this.busy.set(true);
    try {
      const { error } = await this.db.rpc('fn_ensure_month_period', {
        p_branch_id: bid, p_year: this.newYear, p_month: this.newMonth,
      });
      if (error) throw error;
      this.toast.success('Period opened');
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async close(p: FiscalPeriod) {
    if (!confirm(`Close period ${p.period_start} → ${p.period_end}?\nNew journals will be rejected.`)) return;
    this.busy.set(true);
    try {
      const { error } = await this.db.rpc('fn_close_period', { p_period_id: p.id, p_closed_by: this.auth.staffId() });
      if (error) throw error;
      this.toast.success('Period closed');
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async reopen(p: FiscalPeriod) {
    if (!confirm('Re-open this period? Discouraged once reports have been shared.')) return;
    this.busy.set(true);
    try {
      const { error } = await this.db.rpc('fn_reopen_period', { p_period_id: p.id });
      if (error) throw error;
      this.toast.success('Period re-opened');
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async lock(p: FiscalPeriod) {
    if (!confirm('Lock this period permanently? Cannot be re-opened.')) return;
    this.busy.set(true);
    try {
      const { error } = await this.db.rpc('fn_lock_period', { p_period_id: p.id });
      if (error) throw error;
      this.toast.success('Period locked');
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.periods();
    if (list.length === 0) return;

    const exportRows: PeriodExportRow[] = list.map(p => ({
      period_start: p.period_start,
      period_end:   p.period_end,
      status:       p.status,
      closed_at:    p.closed_at ?? '',
    }));

    const columns: ExportColumn<PeriodExportRow>[] = [
      { key: 'period_start', header: 'Period start', width: 12, align: 'center', format: 'date' },
      { key: 'period_end',   header: 'Period end',   width: 12, align: 'center', format: 'date' },
      { key: 'status',       header: 'Status',       width: 10, align: 'left' },
      { key: 'closed_at',    header: 'Closed at',    width: 18, align: 'center', format: 'datetime' },
    ];

    const report: ExportableReport<PeriodExportRow> = {
      filename: `FiscalPeriods_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Fiscal Periods',
      subtitle: `${list.length} period${list.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      footer: 'Sree Diagnostics · Period Close Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
