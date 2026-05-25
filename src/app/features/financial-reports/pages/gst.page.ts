import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Percent } from 'lucide-angular';
import { BranchStore } from '../../../core/branches/branch.store';
import { FinancialReportsService, type GstSummary } from '../data/financial-reports.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface GstRow {
  tax: string;
  output_inr: number;
  input_inr: number;
  net_inr: number;
}

@Component({
  selector: 'app-gst-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconPct" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>GST Summary</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Output (sales) − Input (purchases) = Net payable</p>
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
      <app-export-menu [disabled]="!g()" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) { <div class="text-center py-12 text-ink-muted">Loading…</div> } @else {

  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Tax</th>
          <th class="text-right px-4 py-2 font-semibold">Output (collected)</th>
          <th class="text-right px-4 py-2 font-semibold">Input (paid)</th>
          <th class="text-right px-4 py-2 font-semibold">Net payable</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @if (g(); as s) {
          <tr>
            <td class="px-4 py-2 font-semibold">CGST</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.output_cgst) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.input_cgst) }}</td>
            <td class="px-4 py-2 text-right font-mono"
                [class.text-warn-fg]="s.net_cgst > 0" [class.text-good-fg]="s.net_cgst <= 0">
              {{ svc.formatINR(s.net_cgst) }}
            </td>
          </tr>
          <tr>
            <td class="px-4 py-2 font-semibold">SGST</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.output_sgst) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.input_sgst) }}</td>
            <td class="px-4 py-2 text-right font-mono"
                [class.text-warn-fg]="s.net_sgst > 0" [class.text-good-fg]="s.net_sgst <= 0">
              {{ svc.formatINR(s.net_sgst) }}
            </td>
          </tr>
          <tr>
            <td class="px-4 py-2 font-semibold">IGST</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.output_igst) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.input_igst) }}</td>
            <td class="px-4 py-2 text-right font-mono"
                [class.text-warn-fg]="s.net_igst > 0" [class.text-good-fg]="s.net_igst <= 0">
              {{ svc.formatINR(s.net_igst) }}
            </td>
          </tr>
          <tr class="bg-primary-50 font-bold">
            <td class="px-4 py-3 text-primary-900">Total</td>
            <td class="px-4 py-3 text-right font-mono text-primary-900">
              {{ svc.formatINR(s.output_cgst + s.output_sgst + s.output_igst) }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-primary-900">
              {{ svc.formatINR(s.input_cgst + s.input_sgst + s.input_igst) }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-primary-900">
              {{ svc.formatINR(s.net_cgst + s.net_sgst + s.net_igst) }}
            </td>
          </tr>
        }
      </tbody>
    </table>
  </section>
  }
</div>
  `,
})
export class GstPage implements OnInit {
  protected svc  = inject(FinancialReportsService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly iconPct = Percent;
  protected readonly loading = signal(true);
  protected readonly g       = signal<GstSummary | null>(null);

  protected fromDate = this.firstOfMonth();
  protected toDate   = new Date().toISOString().slice(0, 10);

  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    this.loading.set(true);
    try {
      this.g.set(await this.svc.gstSummary({ fromDate: this.fromDate, toDate: this.toDate, branchId: this.branch.activeBranchId() }));
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const s = this.g();
    if (!s) return;

    const rows: GstRow[] = [
      { tax: 'CGST', output_inr: s.output_cgst, input_inr: s.input_cgst, net_inr: s.net_cgst },
      { tax: 'SGST', output_inr: s.output_sgst, input_inr: s.input_sgst, net_inr: s.net_sgst },
      { tax: 'IGST', output_inr: s.output_igst, input_inr: s.input_igst, net_inr: s.net_igst },
    ];

    const columns: ExportColumn<GstRow>[] = [
      { key: 'tax',        header: 'Tax',                width: 10, align: 'left' },
      { key: 'output_inr', header: 'Output (collected)', width: 20, align: 'right', format: 'inr' },
      { key: 'input_inr',  header: 'Input (paid)',       width: 20, align: 'right', format: 'inr' },
      { key: 'net_inr',    header: 'Net payable',        width: 20, align: 'right', format: 'inr' },
    ];

    const report: ExportableReport<GstRow> = {
      filename: `GST_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.fromDate}_to_${this.toDate}`,
      title: 'GST Summary',
      subtitle: 'Output (sales) − Input (purchases) = Net payable',
      meta: { periodLabel: `${this.fromDate} → ${this.toDate}` },
      columns,
      rows,
      grandTotals: {
        tax: 'Total',
        output_inr: s.output_cgst + s.output_sgst + s.output_igst,
        input_inr:  s.input_cgst  + s.input_sgst  + s.input_igst,
        net_inr:    s.net_cgst    + s.net_sgst    + s.net_igst,
      },
      footer: 'Sree Diagnostics · GST Summary · auto-aggregated from journal',
    };

    await this.exportSvc.export(format, report);
  }
}
