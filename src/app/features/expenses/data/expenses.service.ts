import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface ExpenseVoucher {
  id: string;
  branch_id: string;
  voucher_number: string;
  voucher_date: string;
  expense_account_code: string;
  vendor_name: string | null;
  amount_cents: number;
  cgst_cents: number;
  sgst_cents: number;
  igst_cents: number;
  tds_cents: number;
  total_cents: number;
  payment_method: string;
  paid_from_code: string;
  description: string | null;
  attachment_url: string | null;
  status: 'posted' | 'void';
}

export interface PettyCashFloat {
  id: string;
  branch_id: string;
  custodian_staff_id: string;
  float_limit_cents: number;
  current_balance_cents: number;
  is_active: boolean;
  notes: string | null;
}

export interface PettyCashVoucher {
  id: string;
  branch_id: string;
  float_id: string;
  voucher_number: string;
  voucher_date: string;
  expense_account_code: string;
  payee: string | null;
  amount_cents: number;
  description: string | null;
  voucher_type: 'expense' | 'replenishment';
}

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  // ── Expense vouchers ──
  async listExpenses(branchId: string | null, fromDate?: string, toDate?: string): Promise<ExpenseVoucher[]> {
    let q = this.db.from('expense_vouchers').select('*')
      .order('voucher_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
    if (branchId) q = q.eq('branch_id', branchId);
    if (fromDate) q = q.gte('voucher_date', fromDate);
    if (toDate)   q = q.lte('voucher_date', toDate);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ExpenseVoucher[];
  }

  async postExpense(input: {
    branchId: string;
    voucherDate: string;
    expenseCode: string;
    vendorName?: string | null;
    amountCents: number;
    cgst: number; sgst: number; igst: number; tds: number;
    paymentMethod: string;
    paidFromCode: string;
    description?: string | null;
    attachmentUrl?: string | null;
    createdBy?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('fn_post_expense_voucher', {
      p_branch_id: input.branchId, p_voucher_date: input.voucherDate,
      p_expense_code: input.expenseCode, p_vendor_name: input.vendorName ?? null,
      p_amount_cents: input.amountCents,
      p_cgst: input.cgst, p_sgst: input.sgst, p_igst: input.igst, p_tds: input.tds,
      p_payment_method: input.paymentMethod, p_paid_from_code: input.paidFromCode,
      p_description: input.description ?? null,
      p_attachment_url: input.attachmentUrl ?? null,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  // ── Petty cash ──
  async listFloats(branchId: string | null): Promise<PettyCashFloat[]> {
    let q = this.db.from('petty_cash_floats').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PettyCashFloat[];
  }

  async createFloat(input: { branchId: string; custodianStaffId: string; floatLimitCents: number; notes?: string | null }): Promise<string> {
    const { data, error } = await this.db.from('petty_cash_floats').insert({
      branch_id: input.branchId, custodian_staff_id: input.custodianStaffId,
      float_limit_cents: input.floatLimitCents, notes: input.notes ?? null,
    }).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async listPettyVouchers(floatId: string, limit = 50): Promise<PettyCashVoucher[]> {
    const { data, error } = await this.db.from('petty_cash_vouchers').select('*')
      .eq('float_id', floatId).order('voucher_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as PettyCashVoucher[];
  }

  async postPettyExpense(input: {
    branchId: string; floatId: string; voucherDate: string; expenseCode: string;
    payee?: string | null; amountCents: number; description?: string | null; createdBy?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('fn_post_petty_voucher', {
      p_branch_id: input.branchId, p_float_id: input.floatId,
      p_voucher_date: input.voucherDate, p_expense_code: input.expenseCode,
      p_payee: input.payee ?? null, p_amount_cents: input.amountCents,
      p_description: input.description ?? null, p_created_by: input.createdBy ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async replenishFloat(input: { branchId: string; floatId: string; amountCents: number; fromCode?: string; voucherDate?: string; createdBy?: string | null }): Promise<string> {
    const { data, error } = await this.db.rpc('fn_replenish_petty_cash', {
      p_branch_id: input.branchId, p_float_id: input.floatId, p_amount_cents: input.amountCents,
      p_from_code: input.fromCode ?? '1112',
      p_voucher_date: input.voucherDate ?? new Date().toISOString().slice(0, 10),
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  // ── Expense account dropdown source ──
  async listExpenseAccounts(): Promise<{ code: string; name: string }[]> {
    const { data, error } = await this.db.from('gl_accounts').select('code, name')
      .eq('account_type', 'expense').eq('is_postable', true).order('code');
    if (error) throw error;
    return (data ?? []) as { code: string; name: string }[];
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }
}
