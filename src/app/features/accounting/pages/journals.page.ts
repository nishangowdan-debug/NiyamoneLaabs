import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, NotebookPen, ChevronRight, ChevronDown } from 'lucide-angular';
import { AccountingService } from '../data/accounting.service';
import type { JournalEntryWithLines } from '../data/accounting.types';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface JournalLineFlat {
  entry_number: string;
  entry_date: string;
  source_table: string;
  memo: string;
  account_code: string;
  account_name: string;
  line_memo: string;
  debit_cents: number;
  credit_cents: number;
  is_void: string;
}

@Component({
  selector: 'app-journals-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconNotebook" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Journal Entries</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ entries().length }} entries · auto-posted from invoices, payments &amp; bills</p>
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
      <label class="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
        <input type="checkbox" [(ngModel)]="includeVoid" (change)="reload()"/> Include void
      </label>
      <app-export-menu [disabled]="entries().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  @if (loading()) {
    <div class="text-center text-[13px] text-ink-muted py-12">Loading…</div>
  } @else {
    <div class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            <th class="w-8"></th>
            <th class="text-left px-4 py-2 font-semibold w-[170px]">Entry No.</th>
            <th class="text-left px-4 py-2 font-semibold w-[100px]">Date</th>
            <th class="text-left px-4 py-2 font-semibold">Memo</th>
            <th class="text-left px-4 py-2 font-semibold w-[110px]">Source</th>
            <th class="text-right px-4 py-2 font-semibold w-[110px]">Total Dr</th>
            <th class="text-right px-4 py-2 font-semibold w-[110px]">Total Cr</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          @for (e of entries(); track e.id) {
            <tr [class.opacity-50]="e.is_void"
                class="cursor-pointer hover:bg-surface-muted/40"
                (click)="toggle(e.id)">
              <td class="text-center text-ink-muted">
                <i-lucide [name]="isOpen(e.id) ? iconDown : iconRight" [size]="14"></i-lucide>
              </td>
              <td class="px-4 py-2 font-mono text-primary-700">{{ e.entry_number }}</td>
              <td class="px-4 py-2">{{ e.entry_date }}</td>
              <td class="px-4 py-2 text-ink-soft truncate max-w-[400px]">{{ e.memo }}</td>
              <td class="px-4 py-2 text-[11px] text-ink-muted">{{ e.source_table }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalDr(e)) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(totalCr(e)) }}</td>
            </tr>
            @if (isOpen(e.id)) {
              <tr class="bg-surface-muted/30">
                <td colspan="7" class="px-6 py-3">
                  <table class="w-full text-[12px]">
                    <thead class="text-[10px] uppercase text-ink-muted">
                      <tr>
                        <th class="text-left px-2 py-1 w-[80px]">Code</th>
                        <th class="text-left px-2 py-1">Account</th>
                        <th class="text-left px-2 py-1">Memo</th>
                        <th class="text-right px-2 py-1 w-[100px]">Debit</th>
                        <th class="text-right px-2 py-1 w-[100px]">Credit</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border/60">
                      @for (l of e.lines; track l.id) {
                        <tr>
                          <td class="px-2 py-1 font-mono">{{ l.account_code }}</td>
                          <td class="px-2 py-1 text-ink-soft">{{ l.account_name }}</td>
                          <td class="px-2 py-1 text-ink-muted">{{ l.memo }}</td>
                          <td class="px-2 py-1 text-right font-mono">
                            @if (l.debit_cents > 0) { {{ svc.formatINR(l.debit_cents) }} }
                          </td>
                          <td class="px-2 py-1 text-right font-mono">
                            @if (l.credit_cents > 0) { {{ svc.formatINR(l.credit_cents) }} }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </td>
              </tr>
            }
          } @empty {
            <tr><td colspan="7" class="text-center py-12 text-ink-muted">No journal entries in this range.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>
  `,
})
export class JournalsPage implements OnInit {
  protected svc = inject(AccountingService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly iconNotebook = NotebookPen;
  protected readonly iconRight    = ChevronRight;
  protected readonly iconDown     = ChevronDown;

  protected readonly entries  = signal<JournalEntryWithLines[]>([]);
  protected readonly loading  = signal(true);
  protected readonly opened   = signal<Set<string>>(new Set());
  protected fromDate          = this.firstOfMonth();
  protected toDate            = new Date().toISOString().slice(0, 10);
  protected includeVoid       = false;

  private firstOfMonth(): string {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  }

  protected isOpen(id: string): boolean { return this.opened().has(id); }
  protected toggle(id: string): void {
    const s = new Set(this.opened());
    s.has(id) ? s.delete(id) : s.add(id);
    this.opened.set(s);
  }

  protected totalDr(e: JournalEntryWithLines): number { return e.lines.reduce((s, l) => s + l.debit_cents, 0); }
  protected totalCr(e: JournalEntryWithLines): number { return e.lines.reduce((s, l) => s + l.credit_cents, 0); }

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    this.loading.set(true);
    try {
      const rows = await this.svc.listJournalEntries({
        fromDate: this.fromDate, toDate: this.toDate, includeVoid: this.includeVoid, limit: 500,
      });
      this.entries.set(rows);
    } finally { this.loading.set(false); }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    const flat: JournalLineFlat[] = [];
    let totalDr = 0, totalCr = 0;

    for (const e of this.entries()) {
      for (const l of e.lines) {
        flat.push({
          entry_number: e.entry_number,
          entry_date:   e.entry_date,
          source_table: e.source_table ?? '',
          memo:         e.memo ?? '',
          account_code: l.account_code,
          account_name: l.account_name,
          line_memo:    l.memo ?? '',
          debit_cents:  l.debit_cents,
          credit_cents: l.credit_cents,
          is_void:      e.is_void ? 'VOID' : '',
        });
        totalDr += l.debit_cents;
        totalCr += l.credit_cents;
      }
    }

    const columns: ExportColumn<JournalLineFlat>[] = [
      { key: 'entry_number', header: 'Entry No.',  width: 22, align: 'left' },
      { key: 'entry_date',   header: 'Date',       width: 12, align: 'center', format: 'date' },
      { key: 'source_table', header: 'Source',     width: 14, align: 'left' },
      { key: 'memo',         header: 'Entry memo', width: 36, align: 'left' },
      { key: 'account_code', header: 'A/c code',   width: 10, align: 'left' },
      { key: 'account_name', header: 'Account',    width: 28, align: 'left' },
      { key: 'line_memo',    header: 'Line memo',  width: 24, align: 'left' },
      { key: 'debit_cents',  header: 'Debit (₹)',  width: 16, align: 'right', format: 'inr_cents' },
      { key: 'credit_cents', header: 'Credit (₹)', width: 16, align: 'right', format: 'inr_cents' },
      { key: 'is_void',      header: 'Status',     width: 8,  align: 'center' },
    ];

    const report: ExportableReport<JournalLineFlat> = {
      filename: `JournalEntries_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.fromDate}_to_${this.toDate}`,
      title: 'Journal Entries',
      subtitle: `${this.fromDate} → ${this.toDate} · ${this.entries().length} entries · ${flat.length} lines${this.includeVoid ? ' · void included' : ''}`,
      meta: { periodLabel: `${this.fromDate} → ${this.toDate}` },
      columns,
      rows: flat,
      grandTotals: {
        account_name: 'GRAND TOTAL',
        debit_cents:  totalDr,
        credit_cents: totalCr,
      },
      footer: 'Sree Diagnostics · Journal Entries (line-level)',
    };

    await this.exportSvc.export(format, report);
  }
}
