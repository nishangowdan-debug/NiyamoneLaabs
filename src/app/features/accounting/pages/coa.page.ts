import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, BookOpen } from 'lucide-angular';
import { AccountingService } from '../data/accounting.service';
import { ACCOUNT_TYPE_LABEL, type GlAccount, type GlAccountType } from '../data/accounting.types';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface CoaExportRow {
  code: string;
  name: string;
  account_type: string;
  normal_side: string;
  is_postable: string;
}

@Component({
  selector: 'app-coa-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconBook" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Chart of Accounts</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ accounts().length }} accounts · {{ postable().length }} postable</p>
    </div>
    <div class="flex items-center gap-2">
      <input type="text" [(ngModel)]="search" placeholder="Search code or name…"
             class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card w-[260px]"/>
      <select [(ngModel)]="typeFilter"
              class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card">
        <option value="">All types</option>
        <option value="asset">Asset</option>
        <option value="liability">Liability</option>
        <option value="equity">Equity</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
      <app-export-menu [disabled]="filtered().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) {
    <div class="text-center text-[13px] text-ink-muted py-12">Loading…</div>
  } @else {
    <div class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            <th class="text-left px-4 py-2 font-semibold w-[80px]">Code</th>
            <th class="text-left px-4 py-2 font-semibold">Name</th>
            <th class="text-left px-4 py-2 font-semibold w-[110px]">Type</th>
            <th class="text-left px-4 py-2 font-semibold w-[90px]">Side</th>
            <th class="text-left px-4 py-2 font-semibold w-[90px]">Postable</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          @for (a of filtered(); track a.id) {
            <tr [class.bg-surface-muted]="!a.is_postable">
              <td class="px-4 py-2 font-mono text-ink">{{ a.code }}</td>
              <td class="px-4 py-2 text-ink"
                  [style.padding-left.px]="16 + indent(a.code) * 16">
                <span [class.font-semibold]="!a.is_postable">{{ a.name }}</span>
              </td>
              <td class="px-4 py-2 text-ink-soft">{{ TYPE_LABEL[a.account_type] }}</td>
              <td class="px-4 py-2 text-ink-soft uppercase text-[11px]">{{ a.normal_side }}</td>
              <td class="px-4 py-2">
                @if (a.is_postable) {
                  <span class="text-[10px] font-medium text-good-fg">YES</span>
                } @else {
                  <span class="text-[10px] font-medium text-ink-muted">group</span>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="text-center py-12 text-ink-muted">No accounts match.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>
  `,
})
export class CoaPage implements OnInit {
  private svc = inject(AccountingService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly TYPE_LABEL = ACCOUNT_TYPE_LABEL;
  protected readonly iconBook   = BookOpen;

  protected readonly accounts   = signal<GlAccount[]>([]);
  protected readonly loading    = signal(true);
  protected search              = '';
  protected typeFilter: GlAccountType | '' = '';

  protected readonly postable = computed(() => this.accounts().filter(a => a.is_postable));

  protected readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const t = this.typeFilter;
    return this.accounts().filter(a => {
      if (t && a.account_type !== t) return false;
      if (!q) return true;
      return a.code.includes(q) || a.name.toLowerCase().includes(q);
    });
  });

  // Visual indent: 4-digit codes — group nodes have trailing zeros.
  protected indent(code: string): number {
    if (code.endsWith('000')) return 0;
    if (code.endsWith('00'))  return 1;
    if (code.endsWith('0'))   return 2;
    return 3;
  }

  async ngOnInit() {
    try { this.accounts.set(await this.svc.listAccounts()); }
    finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const rows: CoaExportRow[] = this.filtered().map(a => ({
      code: a.code,
      name: a.name,
      account_type: this.TYPE_LABEL[a.account_type],
      normal_side: a.normal_side.toUpperCase(),
      is_postable: a.is_postable ? 'Yes' : 'Group',
    }));

    const columns: ExportColumn<CoaExportRow>[] = [
      { key: 'code',         header: 'Code',     width: 10, align: 'left' },
      { key: 'name',         header: 'Name',     width: 36, align: 'left' },
      { key: 'account_type', header: 'Type',     width: 16, align: 'left' },
      { key: 'normal_side',  header: 'Side',     width: 10, align: 'center' },
      { key: 'is_postable',  header: 'Postable', width: 10, align: 'center' },
    ];

    const filters: { label: string; value: string }[] = [];
    if (this.typeFilter) filters.push({ label: 'Type', value: this.TYPE_LABEL[this.typeFilter] });
    if (this.search.trim()) filters.push({ label: 'Search', value: this.search.trim() });
    filters.push({ label: 'Postable accounts', value: String(this.postable().length) });

    const report: ExportableReport<CoaExportRow> = {
      filename: `ChartOfAccounts_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Chart of Accounts',
      subtitle: `${this.accounts().length} accounts · ${this.postable().length} postable`,
      meta: { filters },
      columns,
      rows,
      footer: 'Sree Diagnostics · Chart of Accounts',
    };

    await this.exportSvc.export(format, report);
  }
}
