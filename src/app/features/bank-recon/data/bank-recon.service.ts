import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface BankTransaction {
  id: string;
  statement_id: string | null;
  bank_account_id: string;
  branch_id: string;
  txn_date: string;
  value_date: string | null;
  direction: 'credit' | 'debit';
  amount_cents: number;
  description: string | null;
  reference: string | null;
  bank_balance_cents: number | null;
  match_status: 'unmatched' | 'matched' | 'ignored' | 'adjusted';
}

export interface MatchCandidate {
  system_table: string;
  system_id: string;
  source_date: string;
  amount_cents: number;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class BankReconService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  async listTxns(opts: { branchId?: string | null; bankAccountId?: string | null; status?: string; limit?: number } = {}): Promise<BankTransaction[]> {
    let q = this.db.from('bank_transactions').select('*')
      .order('txn_date', { ascending: false }).limit(opts.limit ?? 200);
    if (opts.branchId) q = q.eq('branch_id', opts.branchId);
    if (opts.bankAccountId) q = q.eq('bank_account_id', opts.bankAccountId);
    if (opts.status) q = q.eq('match_status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BankTransaction[];
  }

  async importTxns(rows: Omit<BankTransaction, 'id' | 'statement_id' | 'match_status'>[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.db.from('bank_transactions').insert(rows);
    if (error) throw error;
  }

  async addTxn(row: Omit<BankTransaction, 'id' | 'statement_id' | 'match_status'>): Promise<string> {
    const { data, error } = await this.db.from('bank_transactions').insert(row).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async candidates(bankTxnId: string, windowDays = 3): Promise<MatchCandidate[]> {
    const { data, error } = await this.db.rpc('fn_find_match_candidates', {
      p_bank_txn_id: bankTxnId, p_window_days: windowDays,
    });
    if (error) throw error;
    return (data ?? []) as MatchCandidate[];
  }

  async match(bankTxnId: string, systemTable: string, systemId: string, matchedBy: string | null): Promise<void> {
    const { error } = await this.db.rpc('fn_match_bank_txn', {
      p_bank_txn_id: bankTxnId, p_system_table: systemTable, p_system_id: systemId, p_matched_by: matchedBy,
    });
    if (error) throw error;
  }

  async setStatus(bankTxnId: string, status: 'ignored' | 'unmatched'): Promise<void> {
    const { error } = await this.db.from('bank_transactions').update({ match_status: status }).eq('id', bankTxnId);
    if (error) throw error;
  }

  async listBankAccounts(branchId: string | null): Promise<{ id: string; bank_name: string; account_name: string }[]> {
    let q = this.db.from('bank_accounts').select('id, bank_name, account_name').eq('is_active', true);
    if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as any;
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }

  /** Parse pasted CSV: Date,Description,Reference,Debit,Credit,Balance — header optional. */
  parseCsv(text: string, bankAccountId: string, branchId: string): Omit<BankTransaction, 'id' | 'statement_id' | 'match_status'>[] {
    const rows: Omit<BankTransaction, 'id' | 'statement_id' | 'match_status'>[] = [];
    const lines = text.trim().split(/\r?\n/);
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const cells = raw.split(',').map(c => c.trim());
      // skip header
      if (/^date/i.test(cells[0] ?? '')) continue;
      if (cells.length < 4) continue;
      const [d, desc, ref, dr, cr, bal] = cells;
      const date = this.toIso(d);
      if (!date) continue;
      const drCents = this.toCents(dr);
      const crCents = this.toCents(cr);
      if (drCents === 0 && crCents === 0) continue;
      rows.push({
        bank_account_id: bankAccountId,
        branch_id: branchId,
        txn_date: date,
        value_date: null,
        direction: crCents > 0 ? 'credit' : 'debit',
        amount_cents: crCents > 0 ? crCents : drCents,
        description: desc || null,
        reference: ref || null,
        bank_balance_cents: bal ? this.toCents(bal) : null,
      });
    }
    return rows;
  }

  private toIso(s: string): string | null {
    if (!s) return null;
    // dd-mm-yyyy or dd/mm/yyyy → yyyy-mm-dd
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // already yyyy-mm-dd?
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  }
  private toCents(s: string | undefined): number {
    if (!s) return 0;
    const n = Number(s.replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
}
