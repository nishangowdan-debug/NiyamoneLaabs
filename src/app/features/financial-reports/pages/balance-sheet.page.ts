import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Scale } from 'lucide-angular';
import { BranchStore } from '../../../core/branches/branch.store';
import { FinancialReportsService, type ReportRow } from '../data/financial-reports.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat, ExportSection } from '../../../shared/export/export.types';

interface BSRow {
  code: string;
  name: string;
  amount_cents: number;
}

@Component({
  selector: 'app-balance-sheet-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconScale" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Balance Sheet</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">As at {{ asOfDate }}</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
        As at <input type="date" [(ngModel)]="asOfDate" (change)="reload()"
                     class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <app-export-menu [disabled]="rows().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) { <div class="text-center py-12 text-ink-muted">Loading…</div> } @else {

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- ── Assets ── -->
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-2 border-b border-border bg-primary-50">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-700">Assets</p>
      </header>
      <table class="w-full text-[13px]">
        <tbody class="divide-y divide-border">
          @for (r of assets(); track r.account_id) {
            <tr>
              <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
              <td class="px-4 py-1.5">{{ r.name }}</td>
              <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
            </tr>
          }
          <tr class="bg-primary-50 font-semibold">
            <td colspan="2" class="px-4 py-2 text-right">Total assets</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalAssets()) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Liabilities + Equity ── -->
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-2 border-b border-border bg-warn-bg/40">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-warn-fg">Liabilities</p>
      </header>
      <table class="w-full text-[13px]">
        <tbody class="divide-y divide-border">
          @for (r of liabilities(); track r.account_id) {
            <tr>
              <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
              <td class="px-4 py-1.5">{{ r.name }}</td>
              <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
            </tr>
          }
          <tr class="bg-warn-bg/30 font-semibold">
            <td colspan="2" class="px-4 py-2 text-right">Total liabilities</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalLiabilities()) }}</td>
          </tr>
        </tbody>
      </table>

      <header class="px-4 py-2 border-y border-border bg-good-bg/40">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-good-fg">Equity</p>
      </header>
      <table class="w-full text-[13px]">
        <tbody class="divide-y divide-border">
          @for (r of equity(); track r.account_id) {
            <tr>
              <td class="px-4 py-1.5 font-mono w-[80px]">{{ r.code }}</td>
              <td class="px-4 py-1.5">{{ r.name }}</td>
              <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(r.balance_cents) }}</td>
            </tr>
          }
          <!-- Computed retained earnings = Income − Expense for the year -->
          <tr>
            <td class="px-4 py-1.5 font-mono w-[80px]">3900</td>
            <td class="px-4 py-1.5 italic text-ink-soft">Current-Year Earnings (computed)</td>
            <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(retainedEarnings()) }}</td>
          </tr>
          <tr class="bg-good-bg/30 font-semibold">
            <td colspan="2" class="px-4 py-2 text-right">Total equity</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalEquity()) }}</td>
          </tr>
          <tr class="bg-primary-50 font-bold">
            <td colspan="2" class="px-4 py-2 text-right text-primary-900">Total liabilities + equity</td>
            <td class="px-4 py-2 text-right font-mono text-primary-900">{{ svc.formatINR(totalLiabilities() + totalEquity()) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>

  <div class="rounded-[12px] px-5 py-3 flex justify-between items-center border"
       [class.bg-good-bg]="balanced()" [class.border-good-fg]="balanced()"
       [class.bg-danger-fg/10]="!balanced()" [class.border-danger-fg]="!balanced()">
    <p class="text-[13px] font-semibold"
       [class.text-good-fg]="balanced()" [class.text-danger-fg]="!balanced()">
      @if (balanced()) { ✓ Balance sheet balances } @else { ✗ Balance sheet out of balance }
    </p>
    <p class="font-mono text-[14px]"
       [class.text-good-fg]="balanced()" [class.text-danger-fg]="!balanced()">
      Δ {{ svc.formatINR(diff()) }}
    </p>
  </div>
  }
</div>
  `,
})
export class BalanceSheetPage implements OnInit {
  protected svc  = inject(FinancialReportsService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly iconScale = Scale;
  protected readonly loading   = signal(true);
  protected readonly rows      = signal<ReportRow[]>([]);
  protected asOfDate           = new Date().toISOString().slice(0, 10);

  protected readonly assets      = computed(() => this.rows().filter(r => r.account_type === 'asset'));
  protected readonly liabilities = computed(() => this.rows().filter(r => r.account_type === 'liability'));
  protected readonly equity      = computed(() => this.rows().filter(r => r.account_type === 'equity'));

  protected readonly totalAssets      = computed(() => this.assets().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly totalLiabilities = computed(() => this.liabilities().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly totalEquityBooked = computed(() => this.equity().reduce((s, r) => s + r.balance_cents, 0));
  protected readonly retainedEarnings = computed(() => {
    const income = this.rows().filter(r => r.account_type === 'income').reduce((s, r) => s + r.balance_cents, 0);
    const expense = this.rows().filter(r => r.account_type === 'expense').reduce((s, r) => s + r.balance_cents, 0);
    return income - expense;
  });
  protected readonly totalEquity      = computed(() => this.totalEquityBooked() + this.retainedEarnings());

  protected readonly diff     = computed(() => this.totalAssets() - this.totalLiabilities() - this.totalEquity());
  protected readonly balanced = computed(() => this.diff() === 0);

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    this.loading.set(true);
    try {
      const fy = new Date(); const fyStart = new Date(fy.getFullYear(), 3, 1).toISOString().slice(0, 10);
      this.rows.set(await this.svc.accountActivity({
        fromDate: fyStart, toDate: this.asOfDate, branchId: this.branch.activeBranchId(),
      }));
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const report = this.buildReport();
    await this.exportSvc.export(format, report);
  }

  private buildReport(): ExportableReport<BSRow> {
    const toRow = (r: ReportRow): BSRow => ({ code: r.code, name: r.name, amount_cents: r.balance_cents });

    const columns: ExportColumn<BSRow>[] = [
      { key: 'code', header: 'Code', width: 10, align: 'left' },
      { key: 'name', header: 'Account', width: 40, align: 'left' },
      { key: 'amount_cents', header: 'Amount (₹)', width: 18, align: 'right', format: 'inr_cents' },
    ];

    const sections: ExportSection<BSRow>[] = [
      {
        heading: 'ASSETS',
        rows: this.assets().map(toRow),
        totals: { name: 'Total assets', amount_cents: this.totalAssets() },
      },
      {
        heading: 'LIABILITIES',
        rows: this.liabilities().map(toRow),
        totals: { name: 'Total liabilities', amount_cents: this.totalLiabilities() },
      },
      {
        heading: 'EQUITY',
        rows: [
          ...this.equity().map(toRow),
          { code: '3900', name: 'Current-Year Earnings (computed)', amount_cents: this.retainedEarnings() },
        ],
        totals: { name: 'Total equity', amount_cents: this.totalEquity() },
      },
    ];

    return {
      filename: `BalanceSheet_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.asOfDate}`,
      title: 'Balance Sheet',
      subtitle: `As at ${this.asOfDate}` + (this.balanced() ? ' · ✓ balanced' : ` · ✗ out of balance by ${this.svc.formatINR(this.diff())}`),
      meta: {
        periodLabel: `As at ${this.asOfDate}`,
      },
      columns,
      sections,
      grandTotals: { name: 'TOTAL LIABILITIES + EQUITY', amount_cents: this.totalLiabilities() + this.totalEquity() },
      footer: 'Sree Diagnostics · Balance Sheet · auto-aggregated from journal',
    };
  }
}
