import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  GlAccount, JournalEntry, JournalEntryWithLines, TrialBalanceRow, FiscalPeriod,
} from './accounting.types';

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private supabase = inject(SupabaseService);
  // New tables (gl_accounts, journal_entries, journal_lines, fiscal_periods) aren't in generated types yet.
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any }; }

  async listAccounts(): Promise<GlAccount[]> {
    const { data, error } = await this.db
      .from('gl_accounts').select('*').order('code', { ascending: true });
    if (error) throw error;
    return (data ?? []) as GlAccount[];
  }

  async listJournalEntries(opts: {
    fromDate?: string;
    toDate?: string;
    branchId?: string | null;
    includeVoid?: boolean;
    limit?: number;
  } = {}): Promise<JournalEntryWithLines[]> {
    let q = this.db.from('journal_entries').select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (opts.fromDate) q = q.gte('entry_date', opts.fromDate);
    if (opts.toDate)   q = q.lte('entry_date', opts.toDate);
    if (opts.branchId) q = q.eq('branch_id', opts.branchId);
    if (!opts.includeVoid) q = q.eq('is_void', false);
    q = q.limit(opts.limit ?? 100);
    const { data: heads, error } = await q;
    if (error) throw error;
    const headers = (heads ?? []) as JournalEntry[];
    if (!headers.length) return [];

    const ids = headers.map(h => h.id);
    const { data: lines, error: lerr } = await this.db
      .from('journal_lines')
      .select('*, gl_accounts!inner(code, name)')
      .in('entry_id', ids);
    if (lerr) throw lerr;

    const byEntry = new Map<string, JournalEntryWithLines['lines']>();
    for (const l of (lines ?? []) as Array<{
      id: string; entry_id: string; account_id: string;
      debit_cents: number; credit_cents: number; memo: string | null;
      gl_accounts: { code: string; name: string } | null;
    }>) {
      const arr = byEntry.get(l.entry_id) ?? [];
      arr.push({
        id: l.id, entry_id: l.entry_id, account_id: l.account_id,
        debit_cents: l.debit_cents, credit_cents: l.credit_cents, memo: l.memo,
        account_code: l.gl_accounts?.code ?? '',
        account_name: l.gl_accounts?.name ?? '',
      });
      byEntry.set(l.entry_id, arr);
    }
    return headers.map(h => ({ ...h, lines: byEntry.get(h.id) ?? [] }));
  }

  async trialBalance(opts: { fromDate?: string; toDate?: string; branchId?: string | null } = {})
  : Promise<TrialBalanceRow[]> {
    const { data: accts, error } = await this.db
      .from('gl_accounts')
      .select('id, code, name, account_type, normal_side, is_postable')
      .eq('is_postable', true)
      .order('code');
    if (error) throw error;
    const accounts = (accts ?? []) as Array<Pick<GlAccount,'id'|'code'|'name'|'account_type'|'normal_side'|'is_postable'>>;

    let lq = this.db.from('journal_lines')
      .select('account_id, debit_cents, credit_cents, journal_entries!inner(entry_date, branch_id, is_void)');
    if (opts.fromDate) lq = lq.gte('journal_entries.entry_date', opts.fromDate);
    if (opts.toDate)   lq = lq.lte('journal_entries.entry_date', opts.toDate);
    if (opts.branchId) lq = lq.eq('journal_entries.branch_id', opts.branchId);
    lq = lq.eq('journal_entries.is_void', false);
    const { data: lines, error: lerr } = await lq;
    if (lerr) throw lerr;

    const totals = new Map<string, { dr: number; cr: number }>();
    for (const l of (lines ?? []) as Array<{
      account_id: string; debit_cents: number; credit_cents: number;
    }>) {
      const t = totals.get(l.account_id) ?? { dr: 0, cr: 0 };
      t.dr += l.debit_cents;
      t.cr += l.credit_cents;
      totals.set(l.account_id, t);
    }

    return accounts.map(a => {
      const t = totals.get(a.id) ?? { dr: 0, cr: 0 };
      const signed = a.normal_side === 'debit' ? (t.dr - t.cr) : (t.cr - t.dr);
      return {
        account_id: a.id, code: a.code, name: a.name, account_type: a.account_type,
        debit_cents: t.dr, credit_cents: t.cr, balance_cents: signed,
      } as TrialBalanceRow;
    }).filter(r => r.debit_cents !== 0 || r.credit_cents !== 0);
  }

  async listFiscalPeriods(branchId?: string | null): Promise<FiscalPeriod[]> {
    let q = this.db.from('fiscal_periods').select('*').order('period_start', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FiscalPeriod[];
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 2,
    }).format(cents / 100);
  }
}
