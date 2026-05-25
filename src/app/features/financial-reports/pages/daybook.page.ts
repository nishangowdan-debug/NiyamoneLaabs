import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, BookText } from 'lucide-angular';
import { BranchStore } from '../../../core/branches/branch.store';
import { FinancialReportsService, type DaybookRow } from '../data/financial-reports.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface DaybookExportRow {
  method: string;
  count: number | string;
  amount_cents: number;
}

@Component({
  selector: 'app-daybook-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconBook" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>EOD Daybook</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Receipts & payments for {{ date }}</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
        Date <input type="date" [(ngModel)]="date" (change)="reload()"
                    class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <app-export-menu [disabled]="receipts().length === 0 && paymentsOut() === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) { <div class="text-center py-12 text-ink-muted">Loading…</div> } @else {

  <!-- Summary cards -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Total receipts</p>
      <p class="text-[22px] font-semibold text-good-fg">{{ svc.formatINR(totalReceipts()) }}</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Total payments out</p>
      <p class="text-[22px] font-semibold text-warn-fg">{{ svc.formatINR(paymentsOut()) }}</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Net cash flow</p>
      <p class="text-[22px] font-semibold"
         [class.text-good-fg]="net() >= 0" [class.text-danger-fg]="net() < 0">
        {{ svc.formatINR(net()) }}
      </p>
    </div>
    <div class="bg-surface-card border border-border rounded-[12px] p-4">
      <p class="text-[10px] uppercase text-ink-muted">Receipt count</p>
      <p class="text-[22px] font-semibold">{{ totalReceiptCount() }}</p>
    </div>
  </section>

  <!-- Receipts breakdown -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border bg-good-bg/40">
      <p class="text-[12px] font-semibold text-good-fg">Receipts by method</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Method</th>
          <th class="text-right px-4 py-2 font-semibold">Count</th>
          <th class="text-right px-4 py-2 font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (r of receipts(); track r.method) {
          <tr>
            <td class="px-4 py-2 uppercase text-[12px] font-semibold">{{ r.method }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ r.count }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.total_cents) }}</td>
          </tr>
        } @empty {
          <tr><td colspan="3" class="text-center py-8 text-ink-muted">No receipts on this date.</td></tr>
        }
      </tbody>
    </table>
  </section>
  }
</div>
  `,
})
export class DaybookPage implements OnInit {
  protected svc  = inject(FinancialReportsService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly iconBook = BookText;
  protected readonly loading  = signal(true);
  protected readonly receipts = signal<DaybookRow[]>([]);
  protected readonly paymentsOut = signal(0);
  protected date = new Date().toISOString().slice(0, 10);

  protected readonly totalReceipts     = computed(() => this.receipts().reduce((s, r) => s + r.total_cents, 0));
  protected readonly totalReceiptCount = computed(() => this.receipts().reduce((s, r) => s + r.count, 0));
  protected readonly net               = computed(() => this.totalReceipts() - this.paymentsOut());

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    this.loading.set(true);
    try {
      const r = await this.svc.daybook({ date: this.date, branchId: this.branch.activeBranchId() });
      this.receipts.set(r.receipts);
      this.paymentsOut.set(r.payments_made);
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const rows: DaybookExportRow[] = this.receipts().map(r => ({
      method: r.method.toUpperCase(),
      count: r.count,
      amount_cents: r.total_cents,
    }));

    const columns: ExportColumn<DaybookExportRow>[] = [
      { key: 'method',       header: 'Method', width: 14, align: 'left' },
      { key: 'count',        header: 'Count',  width: 12, align: 'right', format: 'integer' },
      { key: 'amount_cents', header: 'Amount (₹)', width: 20, align: 'right', format: 'inr_cents' },
    ];

    const report: ExportableReport<DaybookExportRow> = {
      filename: `Daybook_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.date}`,
      title: 'EOD Daybook',
      subtitle: `Receipts & payments for ${this.date}`,
      meta: {
        periodLabel: this.date,
        filters: [
          { label: 'Total receipts', value: this.svc.formatINR(this.totalReceipts()) },
          { label: 'Payments out',   value: this.svc.formatINR(this.paymentsOut()) },
          { label: 'Net cash flow',  value: this.svc.formatINR(this.net()) },
        ],
      },
      columns,
      sections: [{
        heading: 'RECEIPTS BY METHOD',
        rows,
        totals: { method: 'Total receipts', count: this.totalReceiptCount(), amount_cents: this.totalReceipts() },
      }],
      grandTotals: {
        method: 'NET CASH FLOW (receipts − payments out)',
        amount_cents: this.totalReceipts() - this.paymentsOut(),
      },
      footer: 'Sree Diagnostics · EOD Daybook · receipts ledger by payment method',
    };

    await this.exportSvc.export(format, report);
  }
}
