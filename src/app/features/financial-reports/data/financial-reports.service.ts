import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface ReportRow {
  account_id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  normal_side: 'debit' | 'credit';
  debit_cents: number;
  credit_cents: number;
  balance_cents: number;
}

export interface DaybookRow {
  method: string;          // cash | upi | card | cheque | other
  count: number;
  total_cents: number;
}

export interface GstSummary {
  output_cgst: number; output_sgst: number; output_igst: number;
  input_cgst: number;  input_sgst: number;  input_igst: number;
  net_cgst: number;    net_sgst: number;    net_igst: number;
}

@Injectable({ providedIn: 'root' })
export class FinancialReportsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  /** Aggregated debits/credits per account for a window. */
  async accountActivity(opts: { fromDate: string; toDate: string; branchId?: string | null }): Promise<ReportRow[]> {
    const { data: accts, error: aerr } = await this.db.from('gl_accounts')
      .select('account_id:id, code, name, account_type, normal_side, is_postable')
      .eq('is_postable', true).order('code');
    if (aerr) throw aerr;
    const accounts = (accts ?? []) as ReportRow[];

    // PostgREST default limit is 1000 rows. Page through journal_lines so totals are correct
    // for wide windows (YTD across 5 branches can hit 10k+ lines).
    const PAGE = 1000;
    let from = 0;
    const totals = new Map<string, { dr: number; cr: number }>();
    while (true) {
      let lq = this.db.from('journal_lines')
        .select('account_id, debit_cents, credit_cents, journal_entries!inner(entry_date, branch_id, is_void)')
        .gte('journal_entries.entry_date', opts.fromDate)
        .lte('journal_entries.entry_date', opts.toDate)
        .eq('journal_entries.is_void', false)
        .range(from, from + PAGE - 1);
      if (opts.branchId) lq = lq.eq('journal_entries.branch_id', opts.branchId);
      const { data: lines, error: lerr } = await lq;
      if (lerr) throw lerr;
      const batch = (lines ?? []) as any[];
      for (const l of batch) {
        const t = totals.get(l.account_id) ?? { dr: 0, cr: 0 };
        t.dr += l.debit_cents; t.cr += l.credit_cents;
        totals.set(l.account_id, t);
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    return accounts.map(a => {
      const t = totals.get(a.account_id) ?? { dr: 0, cr: 0 };
      const signed = a.normal_side === 'debit' ? t.dr - t.cr : t.cr - t.dr;
      return { ...a, debit_cents: t.dr, credit_cents: t.cr, balance_cents: signed };
    }).filter(r => r.debit_cents !== 0 || r.credit_cents !== 0);
  }

  /** Cash receipts & payments for the day, grouped by method. */
  async daybook(opts: { date: string; branchId?: string | null }): Promise<{ receipts: DaybookRow[]; payments_made: number }> {
    let pq = this.db.from('payments').select('method, amount_cents, paid_at, is_void');
    pq = pq.gte('paid_at', `${opts.date}T00:00:00`)
           .lt('paid_at', `${opts.date}T23:59:59.999`)
           .eq('is_void', false);
    if (opts.branchId) pq = pq.eq('branch_id', opts.branchId);
    const { data: pays, error: perr } = await pq;
    if (perr) throw perr;

    const byMethod = new Map<string, { count: number; total: number }>();
    for (const p of (pays ?? []) as any[]) {
      const m = (p.method as string).toLowerCase();
      const cur = byMethod.get(m) ?? { count: 0, total: 0 };
      cur.count += 1; cur.total += p.amount_cents;
      byMethod.set(m, cur);
    }
    const receipts: DaybookRow[] = Array.from(byMethod.entries()).map(([method, v]) => ({
      method, count: v.count, total_cents: v.total,
    }));

    // Vendor payments + expense vouchers + petty + payroll-payouts as "payments made"
    let vq = this.db.from('vendor_payments').select('amount_cents, paid_at, is_void')
      .gte('paid_at', `${opts.date}T00:00:00`).lt('paid_at', `${opts.date}T23:59:59.999`).eq('is_void', false);
    if (opts.branchId) vq = vq.eq('branch_id', opts.branchId);
    const { data: vp } = await vq;
    const vpTotal = ((vp ?? []) as any[]).reduce((s, x) => s + x.amount_cents, 0);

    let eq = this.db.from('expense_vouchers').select('total_cents, voucher_date, status')
      .eq('voucher_date', opts.date).eq('status', 'posted');
    if (opts.branchId) eq = eq.eq('branch_id', opts.branchId);
    const { data: ev } = await eq;
    const evTotal = ((ev ?? []) as any[]).reduce((s, x) => s + x.total_cents, 0);

    return { receipts, payments_made: vpTotal + evTotal };
  }

  /** GST summary — output (sales) and input (purchases). */
  async gstSummary(opts: { fromDate: string; toDate: string; branchId?: string | null }): Promise<GstSummary> {
    const acts = await this.accountActivity(opts);
    const findCr = (code: string) => (acts.find(a => a.code === code)?.credit_cents ?? 0) - (acts.find(a => a.code === code)?.debit_cents ?? 0);
    const findDr = (code: string) => (acts.find(a => a.code === code)?.debit_cents ?? 0) - (acts.find(a => a.code === code)?.credit_cents ?? 0);
    const out_cgst = findCr('2141'); const out_sgst = findCr('2142'); const out_igst = findCr('2143');
    const in_cgst  = findDr('1151'); const in_sgst  = findDr('1152'); const in_igst  = findDr('1153');
    return {
      output_cgst: out_cgst, output_sgst: out_sgst, output_igst: out_igst,
      input_cgst:  in_cgst,  input_sgst:  in_sgst,  input_igst:  in_igst,
      net_cgst: out_cgst - in_cgst,
      net_sgst: out_sgst - in_sgst,
      net_igst: out_igst - in_igst,
    };
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }
}
