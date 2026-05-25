import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Scale } from 'lucide-angular';
import { AccountingService } from '../data/accounting.service';
import { ACCOUNT_TYPE_LABEL, type GlAccountType, type TrialBalanceRow } from '../data/accounting.types';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat, ExportSection } from '../../../shared/export/export.types';

interface TBRow {
  code: string;
  name: string;
  debit_cents: number;
  credit_cents: number;
}

@Component({
  selector: 'app-trial-balance-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconScale" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Trial Balance</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        @if (balanced()) {
          <span class="text-good-fg font-semibold">✓ Books balanced</span>
        } @else {
          <span class="text-danger-fg font-semibold">✗ Out of balance by {{ svc.formatINR(imbalance()) }}</span>
        }
        · {{ rows().length }} accounts with activity
      </p>
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
      <app-export-menu [disabled]="rows().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) {
    <div class="text-center text-[13px] text-ink-muted py-12">Loading…</div>
  } @else {
    @for (group of grouped(); track group.type) {
      <div class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-2 border-b border-border bg-surface-muted">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">{{ TYPE_LABEL[group.type] }}</p>
        </header>
        <table class="w-full text-[13px]">
          <thead class="text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th class="text-left px-4 py-2 font-semibold w-[80px]">Code</th>
              <th class="text-left px-4 py-2 font-semibold">Account</th>
              <th class="text-right px-4 py-2 font-semibold w-[140px]">Debit</th>
              <th class="text-right px-4 py-2 font-semibold w-[140px]">Credit</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @for (r of group.rows; track r.account_id) {
              <tr>
                <td class="px-4 py-1.5 font-mono">{{ r.code }}</td>
                <td class="px-4 py-1.5 text-ink-soft">{{ r.name }}</td>
                <td class="px-4 py-1.5 text-right font-mono">
                  @if (r.debit_cents > 0) { {{ svc.formatINR(r.debit_cents) }} }
                </td>
                <td class="px-4 py-1.5 text-right font-mono">
                  @if (r.credit_cents > 0) { {{ svc.formatINR(r.credit_cents) }} }
                </td>
              </tr>
            }
            <tr class="bg-surface-muted/40 font-semibold">
              <td colspan="2" class="px-4 py-2 text-right text-[11px] uppercase text-ink-muted">Subtotal</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(group.totalDr) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(group.totalCr) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    }

    <div class="bg-primary-50 border border-primary-200 rounded-[12px] px-5 py-3 flex justify-between items-center">
      <p class="text-[13px] font-semibold text-primary-900">GRAND TOTAL</p>
      <div class="flex gap-8">
        <p class="font-mono text-[15px] font-semibold text-primary-900">Dr {{ svc.formatINR(grandDr()) }}</p>
        <p class="font-mono text-[15px] font-semibold text-primary-900">Cr {{ svc.formatINR(grandCr()) }}</p>
      </div>
    </div>
  }
</div>
  `,
})
export class TrialBalancePage implements OnInit {
  protected svc = inject(AccountingService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly TYPE_LABEL = ACCOUNT_TYPE_LABEL;
  protected readonly iconScale  = Scale;

  protected readonly rows    = signal<TrialBalanceRow[]>([]);
  protected readonly loading = signal(true);
  protected fromDate         = this.firstOfYear();
  protected toDate           = new Date().toISOString().slice(0, 10);

  private firstOfYear(): string {
    const d = new Date();
    return new Date(d.getFullYear(), 3, 1).toISOString().slice(0, 10); // 1-Apr (Indian FY)
  }

  protected readonly grouped = computed(() => {
    const order: GlAccountType[] = ['asset','liability','equity','income','expense'];
    return order.map(type => {
      const rows = this.rows().filter(r => r.account_type === type);
      const totalDr = rows.reduce((s, r) => s + r.debit_cents, 0);
      const totalCr = rows.reduce((s, r) => s + r.credit_cents, 0);
      return { type, rows, totalDr, totalCr };
    }).filter(g => g.rows.length);
  });

  protected readonly grandDr   = computed(() => this.rows().reduce((s, r) => s + r.debit_cents, 0));
  protected readonly grandCr   = computed(() => this.rows().reduce((s, r) => s + r.credit_cents, 0));
  protected readonly imbalance = computed(() => this.grandDr() - this.grandCr());
  protected readonly balanced  = computed(() => this.imbalance() === 0);

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    this.loading.set(true);
    try {
      this.rows.set(await this.svc.trialBalance({ fromDate: this.fromDate, toDate: this.toDate }));
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const report = this.buildReport();
    await this.exportSvc.export(format, report);
  }

  private buildReport(): ExportableReport<TBRow> {
    const columns: ExportColumn<TBRow>[] = [
      { key: 'code', header: 'Code', width: 10, align: 'left' },
      { key: 'name', header: 'Account', width: 38, align: 'left' },
      { key: 'debit_cents',  header: 'Debit (₹)',  width: 18, align: 'right', format: 'inr_cents' },
      { key: 'credit_cents', header: 'Credit (₹)', width: 18, align: 'right', format: 'inr_cents' },
    ];

    const sections: ExportSection<TBRow>[] = this.grouped().map(g => ({
      heading: this.TYPE_LABEL[g.type].toUpperCase(),
      rows: g.rows.map(r => ({
        code: r.code, name: r.name,
        debit_cents:  r.debit_cents,
        credit_cents: r.credit_cents,
      })),
      totals: {
        name: 'Subtotal · ' + this.TYPE_LABEL[g.type],
        debit_cents:  g.totalDr,
        credit_cents: g.totalCr,
      },
    }));

    return {
      filename: `TrialBalance_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.fromDate}_to_${this.toDate}`,
      title: 'Trial Balance',
      subtitle: `${this.fromDate} → ${this.toDate}` + (this.balanced() ? ' · ✓ balanced' : ` · ✗ out of balance by ${this.svc.formatINR(this.imbalance())}`),
      meta: {
        periodLabel: `${this.fromDate} → ${this.toDate}`,
        filters: [{ label: 'Accounts with activity', value: String(this.rows().length) }],
      },
      columns,
      sections,
      grandTotals: {
        name: 'GRAND TOTAL',
        debit_cents:  this.grandDr(),
        credit_cents: this.grandCr(),
      },
      footer: 'Sree Diagnostics · Trial Balance · auto-aggregated from journal',
    };
  }
}
