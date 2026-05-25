import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface CashierShift {
  id: string;
  branch_id: string;
  cashier_staff_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float_cents: number;
  expected_cash_cents: number;
  expected_upi_cents: number;
  expected_card_cents: number;
  expected_other_cents: number;
  counted_cash_cents: number | null;
  counted_upi_cents: number | null;
  counted_card_cents: number | null;
  counted_other_cents: number | null;
  variance_cents: number | null;
  status: 'open' | 'closed' | 'reconciled';
  notes: string | null;
}

export interface CashHandover {
  id: string;
  branch_id: string;
  shift_id: string | null;
  cashier_staff_id: string;
  accountant_staff_id: string | null;
  declared_cents: number;
  received_cents: number | null;
  variance_cents: number | null;
  status: 'pending' | 'received' | 'disputed' | 'reconciled';
  declared_at: string;
  received_at: string | null;
  notes: string | null;
}

export interface BankAccount {
  id: string;
  branch_id: string | null;
  bank_name: string;
  account_name: string;
  account_number: string | null;
  ifsc: string | null;
  gl_account_code: string;
  is_active: boolean;
}

export interface BankDeposit {
  id: string;
  branch_id: string;
  bank_account_id: string;
  amount_cents: number;
  deposit_date: string;
  reference: string | null;
  source_type: 'cash' | 'cheque' | 'other';
  notes: string | null;
}

export interface CashPosition { code: string; name: string; balance_cents: number; }

@Injectable({ providedIn: 'root' })
export class CashierService {
  private supabase = inject(SupabaseService);
  // Local untyped handle: new tables/RPCs aren't in generated types yet.
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  async myOpenShift(staffId: string): Promise<CashierShift | null> {
    const { data, error } = await this.db
      .from('cashier_shifts').select('*')
      .eq('cashier_staff_id', staffId).eq('status', 'open')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listShifts(branchId: string | null, limit = 20): Promise<CashierShift[]> {
    let q = this.db.from('cashier_shifts').select('*').order('opened_at', { ascending: false }).limit(limit);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async openShift(branchId: string, staffId: string, openingFloatCents = 0): Promise<string> {
    const { data, error } = await this.db.rpc('fn_open_shift', {
      p_branch_id: branchId, p_cashier_staff_id: staffId, p_opening_float_cents: openingFloatCents,
    });
    if (error) throw error;
    return data as string;
  }

  async expected(shiftId: string): Promise<{ cash: number; upi: number; card: number; other: number }> {
    const { data, error } = await this.db.rpc('fn_shift_expected', { p_shift_id: shiftId });
    if (error) throw error;
    const row = (data?.[0] ?? {}) as { cash: number; upi: number; card: number; other: number };
    return { cash: row.cash ?? 0, upi: row.upi ?? 0, card: row.card ?? 0, other: row.other ?? 0 };
  }

  async closeShift(input: {
    shiftId: string;
    counted_cash: number; counted_upi: number; counted_card: number; counted_other: number;
    d500: number; d200: number; d100: number; d50: number;
    d20: number; d10: number; d5: number; d2: number; d1: number;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('fn_close_shift', {
      p_shift_id:      input.shiftId,
      p_counted_cash:  input.counted_cash,
      p_counted_upi:   input.counted_upi,
      p_counted_card:  input.counted_card,
      p_counted_other: input.counted_other,
      p_d500: input.d500, p_d200: input.d200, p_d100: input.d100, p_d50: input.d50,
      p_d20:  input.d20,  p_d10:  input.d10,  p_d5:   input.d5,   p_d2:  input.d2,  p_d1: input.d1,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
  }

  async declareHandover(shiftId: string, amountCents: number, notes?: string | null): Promise<string> {
    const { data, error } = await this.db.rpc('fn_declare_handover', {
      p_shift_id: shiftId, p_amount_cents: amountCents, p_notes: notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async receiveHandover(handoverId: string, accountantStaffId: string, receivedCents: number, notes?: string | null): Promise<void> {
    const { error } = await this.db.rpc('fn_receive_handover', {
      p_handover_id: handoverId, p_accountant_staff_id: accountantStaffId, p_received_cents: receivedCents, p_notes: notes ?? null,
    });
    if (error) throw error;
  }

  async listHandovers(branchId: string | null, status?: string): Promise<CashHandover[]> {
    let q = this.db.from('cash_handovers').select('*').order('declared_at', { ascending: false }).limit(50);
    if (branchId) q = q.eq('branch_id', branchId);
    if (status)   q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async listBankAccounts(branchId: string | null): Promise<BankAccount[]> {
    let q = this.db.from('bank_accounts').select('*').eq('is_active', true).order('bank_name');
    if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async createBankAccount(input: Omit<BankAccount, 'id' | 'is_active'>): Promise<string> {
    const { data, error } = await this.db.from('bank_accounts').insert(input).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async deposit(input: {
    branchId: string; bankAccountId: string; amountCents: number;
    depositDate: string; reference?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('fn_deposit_to_bank', {
      p_branch_id: input.branchId,
      p_bank_account_id: input.bankAccountId,
      p_amount_cents: input.amountCents,
      p_deposit_date: input.depositDate,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async cashPosition(): Promise<CashPosition[]> {
    const { data, error } = await this.db.from('v_cash_position').select('*');
    if (error) throw error;
    return data ?? [];
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }
}
