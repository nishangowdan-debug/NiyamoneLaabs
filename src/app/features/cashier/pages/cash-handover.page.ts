import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Banknote, ArrowDownToLine, Plus } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { CashierService, type BankAccount, type CashHandover, type CashPosition } from '../data/cashier.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat, ExportSection } from '../../../shared/export/export.types';

interface CashPositionExportRow {
  code: string;
  name: string;
  balance_cents: number;
}

interface PendingHandoverExportRow {
  declared_at: string;
  declared_cents: number;
  status: string;
}

@Component({
  selector: 'app-cash-handover-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconBank" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Cash Handover &amp; Bank Deposit</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Receive cash from cashiers · deposit to bank · live cash position</p>
    </div>
    <app-export-menu [disabled]="positions().length === 0 && pending().length === 0" (pick)="onExport($event)"/>
  </header>

  <!-- ── Cash position dashboard ── -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
    @for (p of positions(); track p.code) {
      <div class="bg-surface-card border border-border rounded-[12px] p-4">
        <p class="text-[10px] uppercase tracking-wider text-ink-muted">{{ p.code }} · {{ p.name }}</p>
        <p class="text-[22px] font-semibold mt-1"
           [class.text-good-fg]="p.balance_cents > 0" [class.text-ink]="p.balance_cents === 0"
           [class.text-danger-fg]="p.balance_cents < 0">
          {{ svc.formatINR(p.balance_cents) }}
        </p>
      </div>
    }
  </section>

  <!-- ── Pending handovers ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Pending handovers</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Declared at</th>
          <th class="text-right px-4 py-2 font-semibold">Declared</th>
          <th class="text-right px-4 py-2 font-semibold w-[200px]">Counted by accountant (₹)</th>
          <th class="px-4 py-2 w-[120px]"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (h of pending(); track h.id) {
          <tr>
            <td class="px-4 py-2">{{ h.declared_at | date: 'short' }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(h.declared_cents) }}</td>
            <td class="px-4 py-2 text-right">
              <input type="number" min="0" [(ngModel)]="received[h.id]"
                     class="w-full h-8 px-2 text-[13px] rounded-md border border-border bg-surface-card text-right"/>
            </td>
            <td class="px-4 py-2 text-right">
              <button type="button" (click)="receive(h)" [disabled]="!canWrite()"
                      class="h-8 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                Receive
              </button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="text-center py-8 text-ink-muted">No pending handovers.</td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Bank deposit ── -->
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
      <i-lucide [name]="iconDeposit" [size]="18" class="text-primary-600"></i-lucide>
      Deposit cash to bank
    </p>
    @if (banks().length === 0) {
      <p class="text-[12px] text-ink-muted mb-3">No bank account configured. Add one below.</p>
    }
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Bank account</span>
        <select [(ngModel)]="depBankId"
                class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="">— select —</option>
          @for (b of banks(); track b.id) {
            <option [value]="b.id">{{ b.bank_name }} · {{ b.account_name }}</option>
          }
        </select>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Amount (₹)</span>
        <input type="number" min="0" [(ngModel)]="depAmount"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Deposit date</span>
        <input type="date" [(ngModel)]="depDate"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Reference / slip no.</span>
        <input type="text" [(ngModel)]="depRef"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
    </div>
    <button type="button" (click)="deposit()" [disabled]="busy() || !depBankId || !depAmount || !canWrite()"
            class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
      Post deposit
    </button>

    <!-- Add bank account -->
    <div class="mt-5 pt-5 border-t border-border">
      <p class="text-[12px] font-semibold text-ink mb-2 inline-flex items-center gap-2">
        <i-lucide [name]="iconPlus" [size]="14"></i-lucide> Add bank account
      </p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input type="text" [(ngModel)]="newBank.bank_name"      placeholder="Bank name"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="text" [(ngModel)]="newBank.account_name"   placeholder="Account name"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="text" [(ngModel)]="newBank.account_number" placeholder="A/c number"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="text" [(ngModel)]="newBank.ifsc"           placeholder="IFSC"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </div>
      <button type="button" (click)="addBank()" [disabled]="busy() || !newBank.bank_name || !canWrite()"
              class="mt-2 h-8 px-3 rounded-md text-[12px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-50">
        Save bank
      </button>
    </div>
  </section>
</div>
  `,
})
export class CashHandoverPage implements OnInit {
  protected svc = inject(CashierService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconBank    = Banknote;
  protected readonly iconDeposit = ArrowDownToLine;
  protected readonly iconPlus    = Plus;

  protected readonly busy      = signal(false);
  protected readonly pending   = signal<CashHandover[]>([]);
  protected readonly banks     = signal<BankAccount[]>([]);
  protected readonly positions = signal<CashPosition[]>([]);
  protected received: Record<string, number> = {};
  protected readonly canWrite  = computed(() => this.auth.has('billing.write'));

  protected depBankId = '';
  protected depAmount = 0;
  protected depDate   = new Date().toISOString().slice(0, 10);
  protected depRef    = '';

  protected newBank: { bank_name: string; account_name: string; account_number: string; ifsc: string; gl_account_code: string; branch_id: string | null } = {
    bank_name: '', account_name: '', account_number: '', ifsc: '', gl_account_code: '1121', branch_id: null,
  };

  async ngOnInit() { await this.refresh(); }

  protected async refresh() {
    const bid = this.branch.activeBranchId();
    const [pend, banks, pos] = await Promise.all([
      this.svc.listHandovers(bid, 'pending'),
      this.svc.listBankAccounts(bid),
      this.svc.cashPosition(),
    ]);
    this.pending.set(pend);
    this.banks.set(banks);
    this.positions.set(pos);
    // Pre-fill received with declared.
    for (const h of pend) this.received[h.id] = (this.received[h.id] ?? h.declared_cents) / 100;
  }

  protected async receive(h: CashHandover) {
    const sid = this.auth.staffId();
    if (!sid) { this.toast.error('No staff record'); return; }
    const cents = Math.round(((this.received[h.id] ?? 0) as number) * 100);
    if (cents <= 0) { this.toast.error('Enter received amount'); return; }
    this.busy.set(true);
    try {
      await this.svc.receiveHandover(h.id, sid, cents);
      this.toast.success('Handover received');
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async deposit() {
    const bid = this.branch.activeBranchId();
    if (!bid) { this.toast.error('Select a branch'); return; }
    this.busy.set(true);
    try {
      await this.svc.deposit({
        branchId: bid, bankAccountId: this.depBankId,
        amountCents: Math.round(this.depAmount * 100),
        depositDate: this.depDate, reference: this.depRef || null,
      });
      this.toast.success('Deposit posted');
      this.depAmount = 0; this.depRef = '';
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async addBank() {
    if (!this.newBank.bank_name) return;
    const bid = this.branch.activeBranchId();
    this.busy.set(true);
    try {
      await this.svc.createBankAccount({ ...this.newBank, branch_id: bid });
      this.toast.success('Bank added');
      this.newBank = { bank_name: '', account_name: '', account_number: '', ifsc: '', gl_account_code: '1121', branch_id: null };
      await this.refresh();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const positionRows: CashPositionExportRow[] = this.positions().map(p => ({
      code:          p.code,
      name:          p.name,
      balance_cents: p.balance_cents,
    }));

    const pendingRows: PendingHandoverExportRow[] = this.pending().map(h => ({
      declared_at:    h.declared_at,
      declared_cents: h.declared_cents,
      status:         h.status,
    }));

    const columns: ExportColumn<any>[] = [
      { key: 'code',           header: 'Code / When',     width: 18, align: 'left' },
      { key: 'name',           header: 'Account / Status',width: 28, align: 'left' },
      { key: 'declared_at',    header: 'Declared at',     width: 16, align: 'center', format: 'datetime' },
      { key: 'balance_cents',  header: 'Balance (₹)',     width: 16, align: 'right',  format: 'inr_cents' },
      { key: 'declared_cents', header: 'Declared (₹)',    width: 16, align: 'right',  format: 'inr_cents' },
      { key: 'status',         header: 'Status',          width: 10, align: 'left' },
    ];

    const totalPosition = this.positions().reduce((s, p) => s + p.balance_cents, 0);
    const totalPending  = this.pending().reduce((s, h) => s + h.declared_cents, 0);

    const sections: ExportSection<any>[] = [];
    if (positionRows.length > 0) {
      sections.push({
        heading: 'CASH POSITION (BY ACCOUNT)',
        rows: positionRows,
        totals: { name: 'Total cash on hand', balance_cents: totalPosition },
      });
    }
    if (pendingRows.length > 0) {
      sections.push({
        heading: 'PENDING HANDOVERS',
        rows: pendingRows,
        totals: { name: 'Total pending', declared_cents: totalPending },
      });
    }

    const report: ExportableReport<any> = {
      filename: `CashHandover_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Cash Handover & Bank Deposits',
      subtitle: `Cash position · ${this.pending().length} pending handover${this.pending().length === 1 ? '' : 's'}`,
      columns,
      sections,
      footer: 'Sree Diagnostics · Cash Handover Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
