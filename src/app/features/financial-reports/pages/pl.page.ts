import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, TrendingUp } from 'lucide-angular';
import { BranchStore } from '../../../core/branches/branch.store';
import { FinancialReportsService, type ReportRow } from '../data/financial-reports.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat, ExportSection } from '../../../shared/export/export.types';

interface PLRow {
  code: string;
  name: string;
  amount_cents: number;
}

@Component({
  selector: 'app-pl-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconTrend" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Profit &amp; Loss</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ fromDate }} → {{ toDate }} · auto-aggregated from journal</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
        From <input type="date" [(ngModel)]="fromDate" (change)="reload()"
                    class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label class="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
        To <input type="date" [(ngModel)]="toDate" (change)="reload()"
                  class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <button type="button" (click)="setRange('today')"
              class="h-9 px-3 rounded-md text-[12px] border border-border">Today</button>
      <button type="button" (click)="setRange('mtd')"
              class="h-9 px-3 rounded-md text-[12px] border border-border">MTD</button>
      <button type="button" (click)="setRange('ytd')"
              class="h-9 px-3 rounded-md text-[12px] border border-border">YTD</button>
      <app-export-menu [disabled]="rows().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) { <div class="text-center py-12 text-ink-muted">Loading…</div> } @else {

  <!-- ── Summary cards ── -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Total income</p>
      <p class="text-[22px] font-semibold text-good-fg">{{ svc.formatINR(totalIncome()) }}</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Cost of services</p>
      <p class="text-[22px] font-semibold text-warn-fg">{{ svc.formatINR(totalCogs()) }}</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Operating expenses</p>
      <p class="text-[22px] font-semibold text-warn-fg">{{ svc.formatINR(totalOpex()) }}</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Net profit / loss</p>
      <p class="text-[22px] font-semibold"
         [class.text-good-fg]="netProfit() >= 0" [class.text-danger-fg]="netProfit() < 0">
        {{ svc.formatINR(netProfit()) }}
      </p>
    </div>
  </section>

  <!-- ── Income section ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-4 py-2 border-b border-border bg-good-bg/40">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-good-fg">Income</p>
    </header>
    <table class="w-full text-[13px]">
      <tbody class="divide-y divide-border">
        @for (r of income(); track r.account_id) {
          <tr>
            <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
            <td class="px-4 py-1.5">{{ r.name }}</td>
            <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
          </tr>
        }
        <tr class="bg-good-bg/30 font-semibold">
          <td colspan="2" class="px-4 py-2 text-right">Total income</td>
          <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalIncome()) }}</td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- ── COGS ── -->
  @if (cogs().length) {
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-2 border-b border-border bg-warn-bg/40">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-warn-fg">Cost of services</p>
      </header>
      <table class="w-full text-[13px]">
        <tbody class="divide-y divide-border">
          @for (r of cogs(); track r.account_id) {
            <tr>
              <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
              <td class="px-4 py-1.5">{{ r.name }}</td>
              <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
            </tr>
          }
          <tr class="bg-warn-bg/30 font-semibold">
            <td colspan="2" class="px-4 py-2 text-right">Total COGS</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalCogs()) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  }

  <!-- Gross profit -->
  <div class="bg-primary-50 border border-primary-200 rounded-[12px] px-5 py-3 flex justify-between items-center">
    <p class="text-[13px] font-semibold text-primary-900">Gross profit</p>
    <p class="font-mono text-[15px] font-semibold text-primary-900">{{ svc.formatINR(grossProfit()) }}</p>
  </div>

  <!-- ── Operating expenses ── -->
  @if (opex().length) {
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-2 border-b border-border bg-warn-bg/40">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-warn-fg">Operating expenses</p>
      </header>
      <table class="w-full text-[13px]">
        <tbody class="divide-y divide-border">
          @for (r of opex(); track r.account_id) {
            <tr>
              <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
              <td class="px-4 py-1.5">{{ r.name }}</td>
              <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
            </tr>
          }
          <tr class="bg-warn-bg/30 font-semibold">
            <td colspan="2" class="px-4 py-2 text-right">Total operating expenses</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalOpex()) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  }

  <!-- Net profit -->
  <div class="rounded-[12px] px-5 py-4 flex justify-between items-center"
       [class.bg-good-bg]="netProfit() >= 0" [class.bg-danger-fg/10]="netProfit() < 0"
       [class.border-good-fg]="netProfit() >= 0" [class.border-danger-fg]="netProfit() < 0"
       class="border">
    <p class="text-[15px] font-semibold"
       [class.text-good-fg]="netProfit() >= 0" [class.text-danger-fg]="netProfit() < 0">
      Net profit / (loss)
    </p>
    <p class="font-mono text-[20px] font-bold"
       [class.text-good-fg]="netProfit() >= 0" [class.text-danger-fg]="netProfit() < 0">
      {{ svc.formatINR(netProfit()) }}
    </p>
  </div>
  }
</div>
  `,
})
export class ProfitLossPage implements OnInit {
  protected svc  = inject(FinancialReportsService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly iconTrend = TrendingUp;

  protected readonly loading = signal(true);
  protected readonly rows    = signal<ReportRow[]>([]);

  protected fromDate = this.firstOfMonth();
  protected toDate   = new Date().toISOString().slice(0, 10);

  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
  private firstOfYear(): string  { const d = new Date(); return new Date(d.getFullYear(), 3, 1).toISOString().slice(0, 10); }

  protected readonly income = computed(() => this.rows().filter(r => r.account_type === 'income'));
  protected readonly cogs   = computed(() => this.rows().filter(r => r.account_type === 'expense' && r.code.startsWith('5')));
  protected readonly opex   = computed(() => this.rows().filter(r => r.account_type === 'expense' && r.code.startsWith('6')));

  protected readonly totalIncome = computed(() => this.income().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly totalCogs   = computed(() => this.cogs().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly totalOpex   = computed(() => this.opex().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly grossProfit = computed(() => this.totalIncome() - this.totalCogs());
  protected readonly netProfit   = computed(() => this.grossProfit() - this.totalOpex());

  async ngOnInit() { await this.reload(); }

  protected setRange(kind: 'today' | 'mtd' | 'ytd') {
    const today = new Date().toISOString().slice(0, 10);
    if      (kind === 'today') { this.fromDate = today; this.toDate = today; }
    else if (kind === 'mtd')   { this.fromDate = this.firstOfMonth(); this.toDate = today; }
    else                       { this.fromDate = this.firstOfYear();  this.toDate = today; }
    this.reload();
  }

  protected async reload() {
    this.loading.set(true);
    try {
      this.rows.set(await this.svc.accountActivity({ fromDate: this.fromDate, toDate: this.toDate, branchId: this.branch.activeBranchId() }));
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const report = this.buildReport();
    await this.exportSvc.export(format, report);
  }

  private buildReport(): ExportableReport<PLRow> {
    const toRow = (r: ReportRow): PLRow => ({
      code: r.code, name: r.name, amount_cents: r.balance_cents,
    });

    const incomeRows = this.income().map(toRow);
    const cogsRows   = this.cogs().map(toRow);
    const opexRows   = this.opex().map(toRow);

    const columns: ExportColumn<PLRow>[] = [
      { key: 'code', header: 'Code', width: 10, align: 'left' },
      { key: 'name', header: 'Account', width: 40, align: 'left' },
      { key: 'amount_cents', header: 'Amount (₹)', width: 18, align: 'right', format: 'inr_cents' },
    ];

    const sections: ExportSection<PLRow>[] = [
      {
        heading: 'INCOME',
        rows: incomeRows,
        totals: { name: 'Total income', amount_cents: this.totalIncome() },
      },
      ...(cogsRows.length ? [{
        heading: 'COST OF SERVICES',
        rows: cogsRows,
        totals: { name: 'Total cost of services', amount_cents: this.totalCogs() },
      }] : []),
      {
        // Synthetic gross-profit row
        heading: 'GROSS PROFIT',
        rows: [],
        totals: { name: 'Gross profit', amount_cents: this.grossProfit() },
      },
      ...(opexRows.length ? [{
        heading: 'OPERATING EXPENSES',
        rows: opexRows,
        totals: { name: 'Total operating expenses', amount_cents: this.totalOpex() },
      }] : []),
    ];

    return {
      filename: `PnL_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.fromDate}_to_${this.toDate}`,
      title: 'Profit & Loss',
      subtitle: `${this.fromDate} → ${this.toDate} · auto-aggregated from journal`,
      meta: {
        periodLabel: `${this.fromDate} → ${this.toDate}`,
      },
      columns,
      sections,
      grandTotals: { name: 'NET PROFIT / (LOSS)', amount_cents: this.netProfit() },
      footer: 'Sree Diagnostics · Profit & Loss Statement · auto-aggregated from journal',
    };
  }
}
