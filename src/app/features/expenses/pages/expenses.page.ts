import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Receipt, Plus } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ExpensesService, type ExpenseVoucher } from '../data/expenses.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface ExpenseExportRow {
  voucher_number: string;
  voucher_date: string;
  account_code: string;
  vendor_name: string;
  amount_cents: number;
  total_cents: number;
  method: string;
  status: string;
}

@Component({
  selector: 'app-expenses-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconReceipt" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Expense Vouchers</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Rent · electricity · professional fees · other operating expenses</p>
    </div>
    <app-export-menu [disabled]="expenses().length === 0" (pick)="onExport($event)"/>
  </header>

  <!-- ── New voucher form (write-only) ── -->
  @if (canWrite()) {
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
      <i-lucide [name]="iconPlus" [size]="16" class="text-primary-600"></i-lucide>
      New voucher
    </p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Voucher date</span>
        <input type="date" [(ngModel)]="form.date"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Expense account</span>
        <select [(ngModel)]="form.expenseCode"
                class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="">— select —</option>
          @for (a of expenseAccounts(); track a.code) {
            <option [value]="a.code">{{ a.code }} · {{ a.name }}</option>
          }
        </select>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Vendor / payee (free text)</span>
        <input type="text" [(ngModel)]="form.vendorName"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Amount (₹, ex-tax)</span>
        <input type="number" min="0" [(ngModel)]="form.amount"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">CGST</span>
        <input type="number" min="0" [(ngModel)]="form.cgst"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">SGST</span>
        <input type="number" min="0" [(ngModel)]="form.sgst"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">IGST</span>
        <input type="number" min="0" [(ngModel)]="form.igst"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">TDS withheld</span>
        <input type="number" min="0" [(ngModel)]="form.tds"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Payment method</span>
        <select [(ngModel)]="form.method"
                class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
          <option value="cheque">Cheque</option>
          <option value="bank_transfer">Bank transfer</option>
        </select>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Paid from</span>
        <select [(ngModel)]="form.paidFrom"
                class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="1111">1111 · Cash – Counter</option>
          <option value="1112">1112 · Cash – Safe</option>
          <option value="1114">1114 · Petty Cash</option>
          <option value="1121">1121 · Bank – Current</option>
        </select>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Description</span>
        <input type="text" [(ngModel)]="form.description"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
    </div>
    <div class="flex justify-between items-center">
      <p class="text-[12px] text-ink-soft">Net payable (amt + GST − TDS): <b>{{ svc.formatINR(net()) }}</b></p>
      <button type="button" (click)="post()" [disabled]="busy() || !canPost()"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
        Post voucher
      </button>
    </div>
  </section>
  }

  <!-- ── Recent vouchers ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Recent expense vouchers</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Voucher</th>
          <th class="text-left px-4 py-2 font-semibold">Date</th>
          <th class="text-left px-4 py-2 font-semibold">Account</th>
          <th class="text-left px-4 py-2 font-semibold">Vendor</th>
          <th class="text-right px-4 py-2 font-semibold">Amount</th>
          <th class="text-right px-4 py-2 font-semibold">Total</th>
          <th class="text-left px-4 py-2 font-semibold">Method</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (e of expenses(); track e.id) {
          <tr [class.opacity-50]="e.status === 'void'">
            <td class="px-4 py-2 font-mono text-primary-700">{{ e.voucher_number }}</td>
            <td class="px-4 py-2">{{ e.voucher_date }}</td>
            <td class="px-4 py-2 font-mono text-[11px]">{{ e.expense_account_code }}</td>
            <td class="px-4 py-2 text-ink-soft">{{ e.vendor_name }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(e.amount_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(e.total_cents) }}</td>
            <td class="px-4 py-2 text-[11px] uppercase">{{ e.payment_method }}</td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="text-center py-8 text-ink-muted">No vouchers yet.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class ExpensesPage implements OnInit {
  protected svc  = inject(ExpensesService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconReceipt = Receipt;
  protected readonly iconPlus    = Plus;

  protected readonly busy             = signal(false);
  protected readonly expenses         = signal<ExpenseVoucher[]>([]);
  protected readonly expenseAccounts  = signal<{ code: string; name: string }[]>([]);

  protected form = {
    date: new Date().toISOString().slice(0, 10),
    expenseCode: '',
    vendorName: '',
    amount: 0,
    cgst: 0, sgst: 0, igst: 0, tds: 0,
    method: 'cash',
    paidFrom: '1111',
    description: '',
  };

  protected readonly net = computed(() => {
    const f = this.form;
    return Math.round((f.amount + f.cgst + f.sgst + f.igst - f.tds) * 100);
  });
  protected readonly canWrite = computed(() => this.auth.has('ap.write'));
  protected canPost(): boolean {
    return this.canWrite() && !!(this.form.expenseCode && this.form.amount > 0);
  }

  async ngOnInit() {
    const [accts, exp] = await Promise.all([
      this.svc.listExpenseAccounts(),
      this.svc.listExpenses(this.branch.activeBranchId()),
    ]);
    this.expenseAccounts.set(accts);
    this.expenses.set(exp);
  }

  protected async post() {
    const bid = this.branch.activeBranchId();
    if (!bid) { this.toast.error('Pick a branch first'); return; }
    this.busy.set(true);
    try {
      await this.svc.postExpense({
        branchId: bid, voucherDate: this.form.date,
        expenseCode: this.form.expenseCode, vendorName: this.form.vendorName || null,
        amountCents: Math.round(this.form.amount * 100),
        cgst: Math.round(this.form.cgst * 100),
        sgst: Math.round(this.form.sgst * 100),
        igst: Math.round(this.form.igst * 100),
        tds:  Math.round(this.form.tds  * 100),
        paymentMethod: this.form.method, paidFromCode: this.form.paidFrom,
        description: this.form.description || null,
        createdBy: this.auth.staffId(),
      });
      this.toast.success('Voucher posted');
      this.form = { ...this.form, amount: 0, cgst: 0, sgst: 0, igst: 0, tds: 0, vendorName: '', description: '' };
      this.expenses.set(await this.svc.listExpenses(bid));
    } catch (e) { this.toast.error('Post failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.expenses();
    if (list.length === 0) return;

    const exportRows: ExpenseExportRow[] = list.map(e => ({
      voucher_number: e.voucher_number,
      voucher_date:   e.voucher_date,
      account_code:   e.expense_account_code,
      vendor_name:    e.vendor_name ?? '',
      amount_cents:   e.amount_cents,
      total_cents:    e.total_cents,
      method:         (e.payment_method ?? '').toUpperCase(),
      status:         e.status,
    }));

    const columns: ExportColumn<ExpenseExportRow>[] = [
      { key: 'voucher_number', header: 'Voucher #',    width: 14, align: 'left' },
      { key: 'voucher_date',   header: 'Date',         width: 12, align: 'center', format: 'date' },
      { key: 'account_code',   header: 'A/c code',     width: 10, align: 'left' },
      { key: 'vendor_name',    header: 'Vendor',       width: 26, align: 'left' },
      { key: 'amount_cents',   header: 'Amount (₹)',   width: 16, align: 'right', format: 'inr_cents' },
      { key: 'total_cents',    header: 'Total (₹)',    width: 16, align: 'right', format: 'inr_cents' },
      { key: 'method',         header: 'Method',       width: 12, align: 'left' },
      { key: 'status',         header: 'Status',       width: 10, align: 'left' },
    ];

    const totalAmount = list.reduce((s, e) => s + e.amount_cents, 0);
    const totalGross  = list.reduce((s, e) => s + e.total_cents,  0);

    const report: ExportableReport<ExpenseExportRow> = {
      filename: `ExpenseVouchers_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Expense Vouchers',
      subtitle: `${list.length} voucher${list.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      grandTotals: {
        vendor_name:  'TOTAL',
        amount_cents: totalAmount,
        total_cents:  totalGross,
      },
      footer: 'Sree Diagnostics · Expense Vouchers',
    };

    await this.exportSvc.export(fmt, report);
  }
}
