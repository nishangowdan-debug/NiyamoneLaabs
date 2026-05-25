export type GlAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type GlNormalSide  = 'debit' | 'credit';

export interface GlAccount {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  account_type: GlAccountType;
  normal_side: GlNormalSide;
  is_postable: boolean;
  is_active: boolean;
  notes: string | null;
}

export interface JournalEntry {
  id: string;
  branch_id: string;
  entry_number: string;
  entry_date: string;
  memo: string | null;
  source_table: string | null;
  source_id: string | null;
  is_void: boolean;
  voided_at: string | null;
  voided_by: string | null;
  posted_by: string | null;
  created_at: string;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit_cents: number;
  credit_cents: number;
  memo: string | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: (JournalLine & { account_code: string; account_name: string })[];
}

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: GlAccountType;
  debit_cents: number;
  credit_cents: number;
  balance_cents: number; // signed: positive = debit-side, negative = credit-side
}

export interface FiscalPeriod {
  id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed' | 'locked';
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
}

export const ACCOUNT_TYPE_LABEL: Record<GlAccountType, string> = {
  asset:     'Asset',
  liability: 'Liability',
  equity:    'Equity',
  income:    'Income',
  expense:   'Expense',
};
