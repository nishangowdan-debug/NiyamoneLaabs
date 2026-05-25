import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Coins, Plus, RefreshCw } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ExpensesService, type PettyCashFloat, type PettyCashVoucher } from '../data/expenses.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface PettyVoucherExportRow {
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  account_code: string;
  payee: string;
  amount_cents: number;
}

@Component({
  selector: 'app-petty-cash-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconCoins" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Petty Cash</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Tea · auto · stationery · small expenses paid from float</p>
    </div>
    <app-export-menu [disabled]="vouchers().length === 0" (pick)="onExport($event)"/>
  </header>

  <!-- ── Active floats ── -->
  <section class="grid grid-cols-1 md:grid-cols-3 gap-3">
    @for (f of floats(); track f.id) {
      <button type="button" (click)="selectFloat(f.id)"
              class="text-left bg-surface-card border rounded-[12px] p-4"
              [class.border-primary-300]="selected() === f.id" [class.shadow-pop]="selected() === f.id"
              [class.border-border]="selected() !== f.id">
        <p class="text-[11px] uppercase text-ink-muted">Petty cash float</p>
        <p class="text-[22px] font-semibold text-ink">{{ svc.formatINR(f.current_balance_cents) }}</p>
        <p class="text-[11px] text-ink-muted">Limit: {{ svc.formatINR(f.float_limit_cents) }}</p>
      </button>
    } @empty {
      <p class="text-[12px] text-ink-muted">No active floats. Create one below.</p>
    }
    @if (canWrite()) {
      <button type="button" (click)="createFloatOpen.set(!createFloatOpen())"
              class="text-left bg-surface-card border border-dashed border-border rounded-[12px] p-4 hover:bg-surface-muted/40">
        <p class="text-[12px] font-medium text-primary-700 inline-flex items-center gap-1.5">
          <i-lucide [name]="iconPlus" [size]="14"></i-lucide>
          New petty-cash float
        </p>
      </button>
    }
  </section>

  @if (createFloatOpen()) {
    <section class="bg-surface-card border border-border rounded-[12px] p-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input type="text" [(ngModel)]="newFloat.custodianStaffId" placeholder="Custodian staff_id (UUID)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="number" min="0" [(ngModel)]="newFloat.limit" placeholder="Float limit (₹)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="text" [(ngModel)]="newFloat.notes" placeholder="Notes"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </div>
      <div class="mt-2 flex gap-2">
        <button type="button" (click)="createFloat()" [disabled]="busy()"
                class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white">Create</button>
        <button type="button" (click)="createFloatOpen.set(false)"
                class="h-9 px-4 rounded-md text-[13px] font-medium border border-border">Cancel</button>
      </div>
    </section>
  }

  @if (selected() && canWrite()) {
    <!-- ── Replenish + new expense (write-only) ── -->
    <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="bg-surface-card border border-border rounded-[12px] p-4">
        <p class="text-[12px] font-semibold text-ink mb-2 inline-flex items-center gap-1.5">
          <i-lucide [name]="iconRefresh" [size]="14" class="text-primary-600"></i-lucide>
          Replenish from safe
        </p>
        <div class="flex gap-2">
          <input type="number" min="0" [(ngModel)]="replenishAmount" placeholder="Amount (₹)"
                 class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card flex-1"/>
          <button type="button" (click)="replenish()" [disabled]="busy() || !replenishAmount"
                  class="h-9 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white">
            Replenish
          </button>
        </div>
      </div>

      <div class="bg-surface-card border border-border rounded-[12px] p-4">
        <p class="text-[12px] font-semibold text-ink mb-2 inline-flex items-center gap-1.5">
          <i-lucide [name]="iconPlus" [size]="14" class="text-primary-600"></i-lucide>
          New petty expense
        </p>
        <div class="grid grid-cols-2 gap-2 mb-2">
          <select [(ngModel)]="exp.code" class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
            <option value="">— account —</option>
            @for (a of expenseAccounts(); track a.code) {
              <option [value]="a.code">{{ a.code }} · {{ a.name }}</option>
            }
          </select>
          <input type="number" min="0" [(ngModel)]="exp.amount" placeholder="Amount (₹)"
                 class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          <input type="text" [(ngModel)]="exp.payee" placeholder="Payee"
                 class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          <input type="text" [(ngModel)]="exp.description" placeholder="Description"
                 class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        </div>
        <button type="button" (click)="postExpense()" [disabled]="busy() || !exp.code || !exp.amount"
                class="h-9 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white">
          Post expense
        </button>
      </div>
    </section>
  }

  @if (selected()) {
    <!-- ── Vouchers list (visible to readers too) ── -->
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-5 py-3 border-b border-border">
        <p class="text-[13px] font-semibold text-ink">Float vouchers</p>
      </header>
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            <th class="text-left px-4 py-2 font-semibold">Voucher</th>
            <th class="text-left px-4 py-2 font-semibold">Date</th>
            <th class="text-left px-4 py-2 font-semibold">Type</th>
            <th class="text-left px-4 py-2 font-semibold">Account</th>
            <th class="text-left px-4 py-2 font-semibold">Payee</th>
            <th class="text-right px-4 py-2 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          @for (v of vouchers(); track v.id) {
            <tr>
              <td class="px-4 py-2 font-mono text-primary-700">{{ v.voucher_number }}</td>
              <td class="px-4 py-2">{{ v.voucher_date }}</td>
              <td class="px-4 py-2 text-[11px] uppercase"
                  [class.text-good-fg]="v.voucher_type === 'replenishment'"
                  [class.text-warn-fg]="v.voucher_type === 'expense'">{{ v.voucher_type }}</td>
              <td class="px-4 py-2 font-mono text-[11px]">{{ v.expense_account_code }}</td>
              <td class="px-4 py-2 text-ink-soft">{{ v.payee }}</td>
              <td class="px-4 py-2 text-right font-mono"
                  [class.text-good-fg]="v.voucher_type === 'replenishment'"
                  [class.text-danger-fg]="v.voucher_type === 'expense'">
                {{ v.voucher_type === 'replenishment' ? '+' : '−' }}{{ svc.formatINR(v.amount_cents) }}
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center py-8 text-ink-muted">No vouchers yet.</td></tr>
          }
        </tbody>
      </table>
    </section>
  }
</div>
  `,
})
export class PettyCashPage implements OnInit {
  protected svc  = inject(ExpensesService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconCoins   = Coins;
  protected readonly iconPlus    = Plus;
  protected readonly iconRefresh = RefreshCw;

  protected readonly busy             = signal(false);
  protected readonly floats           = signal<PettyCashFloat[]>([]);
  protected readonly vouchers         = signal<PettyCashVoucher[]>([]);
  protected readonly selected         = signal<string | null>(null);
  protected readonly expenseAccounts  = signal<{ code: string; name: string }[]>([]);
  protected readonly createFloatOpen  = signal(false);
  protected readonly canWrite         = computed(() => this.auth.has('ap.write'));

  protected newFloat = { custodianStaffId: '', limit: 1000000 / 100, notes: '' };
  protected replenishAmount = 0;
  protected exp = { code: '', amount: 0, payee: '', description: '' };

  async ngOnInit() {
    const accts = await this.svc.listExpenseAccounts();
    this.expenseAccounts.set(accts);
    await this.refreshFloats();
  }

  private async refreshFloats() {
    const floats = await this.svc.listFloats(this.branch.activeBranchId());
    this.floats.set(floats);
    if (!this.selected() && floats.length) this.selectFloat(floats[0].id);
  }

  protected async selectFloat(id: string) {
    this.selected.set(id);
    this.vouchers.set(await this.svc.listPettyVouchers(id));
  }

  protected async createFloat() {
    const bid = this.branch.activeBranchId();
    if (!bid || !this.newFloat.custodianStaffId) { this.toast.error('Branch + custodian required'); return; }
    this.busy.set(true);
    try {
      await this.svc.createFloat({
        branchId: bid,
        custodianStaffId: this.newFloat.custodianStaffId,
        floatLimitCents: Math.round(this.newFloat.limit * 100),
        notes: this.newFloat.notes || null,
      });
      this.toast.success('Float created');
      this.createFloatOpen.set(false);
      this.newFloat = { custodianStaffId: '', limit: 10000, notes: '' };
      await this.refreshFloats();
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async replenish() {
    const fid = this.selected(); const bid = this.branch.activeBranchId();
    if (!fid || !bid) return;
    this.busy.set(true);
    try {
      await this.svc.replenishFloat({
        branchId: bid, floatId: fid,
        amountCents: Math.round(this.replenishAmount * 100),
        createdBy: this.auth.staffId(),
      });
      this.toast.success('Float replenished');
      this.replenishAmount = 0;
      await this.refreshFloats();
      await this.selectFloat(fid);
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async postExpense() {
    const fid = this.selected(); const bid = this.branch.activeBranchId();
    if (!fid || !bid || !this.exp.code) return;
    this.busy.set(true);
    try {
      await this.svc.postPettyExpense({
        branchId: bid, floatId: fid,
        voucherDate: new Date().toISOString().slice(0, 10),
        expenseCode: this.exp.code,
        payee: this.exp.payee || null,
        amountCents: Math.round(this.exp.amount * 100),
        description: this.exp.description || null,
        createdBy: this.auth.staffId(),
      });
      this.toast.success('Expense posted');
      this.exp = { code: '', amount: 0, payee: '', description: '' };
      await this.refreshFloats();
      await this.selectFloat(fid);
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.vouchers();
    if (list.length === 0) return;

    const exportRows: PettyVoucherExportRow[] = list.map(v => ({
      voucher_number: v.voucher_number,
      voucher_date:   v.voucher_date,
      voucher_type:   v.voucher_type,
      account_code:   v.expense_account_code ?? '',
      payee:          v.payee ?? '',
      amount_cents:   v.voucher_type === 'replenishment' ? v.amount_cents : -v.amount_cents,
    }));

    const columns: ExportColumn<PettyVoucherExportRow>[] = [
      { key: 'voucher_number', header: 'Voucher #',   width: 14, align: 'left' },
      { key: 'voucher_date',   header: 'Date',        width: 12, align: 'center', format: 'date' },
      { key: 'voucher_type',   header: 'Type',        width: 14, align: 'left' },
      { key: 'account_code',   header: 'A/c code',    width: 10, align: 'left' },
      { key: 'payee',          header: 'Payee',       width: 22, align: 'left' },
      { key: 'amount_cents',   header: 'Amount (₹)',  width: 16, align: 'right', format: 'inr_cents' },
    ];

    const net = exportRows.reduce((s, r) => s + r.amount_cents, 0);

    const report: ExportableReport<PettyVoucherExportRow> = {
      filename: `PettyCash_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Petty Cash Vouchers',
      subtitle: `${list.length} voucher${list.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      grandTotals: {
        payee:        'NET MOVEMENT',
        amount_cents: net,
      },
      footer: 'Sree Diagnostics · Petty Cash Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
