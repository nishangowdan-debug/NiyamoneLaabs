import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Landmark, Upload, Link2, X } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { BankReconService, type BankTransaction, type MatchCandidate } from '../data/bank-recon.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat, ExportSection } from '../../../shared/export/export.types';

interface BankTxnExportRow {
  txn_date: string;
  description: string;
  reference: string;
  direction: string;
  amount_cents: number;
  match_status: string;
}

@Component({
  selector: 'app-bank-recon-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconBank" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Bank Reconciliation</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ unmatched().length }} unmatched · {{ matched().length }} matched · paste CSV to import
      </p>
    </div>
    <div class="flex gap-2 items-end">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Bank account</span>
        <select [(ngModel)]="bankId" (change)="reload()"
                class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="">— all —</option>
          @for (b of banks(); track b.id) {
            <option [value]="b.id">{{ b.bank_name }} · {{ b.account_name }}</option>
          }
        </select>
      </label>
      <app-export-menu [disabled]="txns().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  <!-- ── CSV import ── -->
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-2 inline-flex items-center gap-2">
      <i-lucide [name]="iconUp" [size]="16" class="text-primary-600"></i-lucide>
      Paste bank statement (CSV)
    </p>
    <p class="text-[11px] text-ink-muted mb-2">
      Columns: Date, Description, Reference, Debit, Credit, Balance · header row optional · dates DD/MM/YYYY or YYYY-MM-DD.
    </p>
    <textarea rows="6" [(ngModel)]="csv" placeholder="01/05/2026,UPI/Patient payment,REF123,,5000.00,125000.00"
              class="w-full text-[12px] font-mono px-3 py-2 rounded-md border border-border bg-surface-card resize-y mb-2"></textarea>
    <button type="button" (click)="importCsv()" [disabled]="busy() || !csv.trim() || !bankId || !canWrite()"
            class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
      Import rows
    </button>
  </section>

  <!-- ── Unmatched ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border bg-warn-bg/40">
      <p class="text-[13px] font-semibold text-warn-fg">Unmatched ({{ unmatched().length }})</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Date</th>
          <th class="text-left px-4 py-2 font-semibold">Description</th>
          <th class="text-left px-4 py-2 font-semibold w-[100px]">Ref</th>
          <th class="text-left px-4 py-2 font-semibold w-[80px]">Type</th>
          <th class="text-right px-4 py-2 font-semibold w-[140px]">Amount</th>
          <th class="px-4 py-2 w-[200px]"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (t of unmatched(); track t.id) {
          <tr>
            <td class="px-4 py-2 font-mono">{{ t.txn_date }}</td>
            <td class="px-4 py-2 text-ink-soft truncate max-w-[400px]">{{ t.description }}</td>
            <td class="px-4 py-2 text-[11px] font-mono">{{ t.reference }}</td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-good-bg]="t.direction==='credit'" [class.text-good-fg]="t.direction==='credit'"
                    [class.bg-warn-bg]="t.direction==='debit'"  [class.text-warn-fg]="t.direction==='debit'">
                {{ t.direction }}
              </span>
            </td>
            <td class="px-4 py-2 text-right font-mono"
                [class.text-good-fg]="t.direction==='credit'" [class.text-warn-fg]="t.direction==='debit'">
              {{ t.direction === 'credit' ? '+' : '−' }}{{ svc.formatINR(t.amount_cents) }}
            </td>
            <td class="px-4 py-2 text-right">
              <button type="button" (click)="openMatch(t)" [disabled]="busy() || !canWrite()"
                      class="h-8 px-3 mr-1 rounded-md text-[12px] font-semibold bg-primary-600 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
                <i-lucide [name]="iconLink" [size]="14"></i-lucide><span>Match</span>
              </button>
              <button type="button" (click)="ignore(t)" [disabled]="busy() || !canWrite()"
                      class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft inline-flex items-center gap-1.5 disabled:opacity-50">
                <i-lucide [name]="iconX" [size]="14"></i-lucide><span>Ignore</span>
              </button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="text-center py-8 text-good-fg font-semibold">✓ All bank transactions matched.</td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Match candidates modal ── -->
  @if (matchingFor(); as t) {
    <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="matchingFor.set(null)">
      <div role="dialog" aria-modal="true" class="w-full max-w-[640px] bg-surface-card rounded-[14px] shadow-pop p-5"
           (click)="$event.stopPropagation()">
        <h2 class="font-display text-[18px] font-medium text-ink mb-1">Find a system match</h2>
        <p class="text-[12px] text-ink-muted mb-3">
          {{ t.txn_date }} · {{ t.direction }} · <b>{{ svc.formatINR(t.amount_cents) }}</b> · {{ t.description }}
        </p>
        @if (candidates().length === 0) {
          <p class="text-[12px] text-ink-muted py-6 text-center">No system events match this amount within ±3 days.</p>
        }
        <ul class="divide-y divide-border max-h-[320px] overflow-y-auto">
          @for (c of candidates(); track c.system_id) {
            <li class="py-2 flex items-center justify-between gap-2">
              <div>
                <p class="text-[12px] text-ink font-semibold">{{ c.label }}</p>
                <p class="text-[10px] text-ink-muted font-mono">{{ c.system_table }} · {{ c.source_date }}</p>
              </div>
              <button type="button" (click)="confirmMatch(t, c)"
                      class="h-8 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white">
                Match
              </button>
            </li>
          }
        </ul>
      </div>
    </div>
  }

  <!-- ── Matched (collapsible look) ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border bg-good-bg/40">
      <p class="text-[13px] font-semibold text-good-fg">Matched ({{ matched().length }})</p>
    </header>
    <table class="w-full text-[13px]">
      <tbody class="divide-y divide-border">
        @for (t of matched(); track t.id) {
          <tr class="opacity-70">
            <td class="px-4 py-1.5 font-mono w-[100px]">{{ t.txn_date }}</td>
            <td class="px-4 py-1.5 text-ink-soft">{{ t.description }}</td>
            <td class="px-4 py-1.5 text-right font-mono">{{ svc.formatINR(t.amount_cents) }}</td>
            <td class="px-4 py-1.5 text-right w-[100px]">
              <button type="button" (click)="unmatch(t)" class="text-[11px] text-primary-700 hover:underline">unmatch</button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="text-center py-6 text-ink-muted">None yet.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class BankReconPage implements OnInit {
  protected svc = inject(BankReconService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconBank = Landmark;
  protected readonly iconUp   = Upload;
  protected readonly iconLink = Link2;
  protected readonly iconX    = X;

  protected readonly busy        = signal(false);
  protected readonly txns        = signal<BankTransaction[]>([]);
  protected readonly banks       = signal<{ id: string; bank_name: string; account_name: string }[]>([]);
  protected readonly matchingFor = signal<BankTransaction | null>(null);
  protected readonly candidates  = signal<MatchCandidate[]>([]);
  protected readonly canWrite    = computed(() => this.auth.has('ap.write'));

  protected bankId = '';
  protected csv    = '';

  protected readonly unmatched = computed(() => this.txns().filter(t => t.match_status === 'unmatched'));
  protected readonly matched   = computed(() => this.txns().filter(t => t.match_status === 'matched'));

  async ngOnInit() {
    const bid = this.branch.activeBranchId();
    this.banks.set(await this.svc.listBankAccounts(bid));
    await this.reload();
  }

  protected async reload() {
    this.txns.set(await this.svc.listTxns({
      branchId: this.branch.activeBranchId(),
      bankAccountId: this.bankId || null,
    }));
  }

  protected async importCsv() {
    const bid = this.branch.activeBranchId(); if (!bid || !this.bankId) { this.toast.error('Pick bank account'); return; }
    this.busy.set(true);
    try {
      const rows = this.svc.parseCsv(this.csv, this.bankId, bid);
      if (!rows.length) { this.toast.error('No valid rows parsed'); return; }
      await this.svc.importTxns(rows);
      this.toast.success(`Imported ${rows.length} rows`);
      this.csv = '';
      await this.reload();
    } catch (e) { this.toast.error('Import failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async openMatch(t: BankTransaction) {
    this.matchingFor.set(t);
    this.candidates.set(await this.svc.candidates(t.id));
  }

  protected async confirmMatch(t: BankTransaction, c: MatchCandidate) {
    this.busy.set(true);
    try {
      await this.svc.match(t.id, c.system_table, c.system_id, this.auth.staffId());
      this.toast.success('Matched');
      this.matchingFor.set(null);
      await this.reload();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async ignore(t: BankTransaction) {
    this.busy.set(true);
    try {
      await this.svc.setStatus(t.id, 'ignored');
      await this.reload();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async unmatch(t: BankTransaction) {
    this.busy.set(true);
    try {
      await this.svc.setStatus(t.id, 'unmatched');
      await this.reload();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    if (this.txns().length === 0) return;

    const mapRow = (t: BankTransaction): BankTxnExportRow => ({
      txn_date:     t.txn_date,
      description:  t.description ?? '',
      reference:    t.reference ?? '',
      direction:    t.direction.toUpperCase(),
      amount_cents: t.direction === 'credit' ? t.amount_cents : -t.amount_cents,
      match_status: t.match_status,
    });

    const columns: ExportColumn<BankTxnExportRow>[] = [
      { key: 'txn_date',     header: 'Date',        width: 12, align: 'center', format: 'date' },
      { key: 'description',  header: 'Description', width: 38, align: 'left' },
      { key: 'reference',    header: 'Reference',   width: 14, align: 'left' },
      { key: 'direction',    header: 'Type',        width: 10, align: 'center' },
      { key: 'amount_cents', header: 'Amount (₹)',  width: 16, align: 'right', format: 'inr_cents' },
      { key: 'match_status', header: 'Status',      width: 12, align: 'left' },
    ];

    const sections: ExportSection<BankTxnExportRow>[] = [
      { heading: `UNMATCHED (${this.unmatched().length})`, rows: this.unmatched().map(mapRow) },
      { heading: `MATCHED (${this.matched().length})`,     rows: this.matched().map(mapRow) },
    ].filter(s => s.rows.length > 0);

    const totalCredits = this.txns().filter(t => t.direction === 'credit').reduce((s, t) => s + t.amount_cents, 0);
    const totalDebits  = this.txns().filter(t => t.direction === 'debit').reduce((s, t) => s + t.amount_cents, 0);

    const report: ExportableReport<BankTxnExportRow> = {
      filename: `BankRecon_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Bank Reconciliation',
      subtitle: `${this.unmatched().length} unmatched · ${this.matched().length} matched`,
      meta: {
        filters: [
          { label: 'Total credits', value: '₹' + (totalCredits / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'Total debits',  value: '₹' + (totalDebits  / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'Net',           value: '₹' + ((totalCredits - totalDebits) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
        ],
      },
      columns,
      sections,
      grandTotals: {
        description:  'NET (credits − debits)',
        amount_cents: totalCredits - totalDebits,
      },
      footer: 'Sree Diagnostics · Bank Reconciliation',
    };

    await this.exportSvc.export(fmt, report);
  }
}
