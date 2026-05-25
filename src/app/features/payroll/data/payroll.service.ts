import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface SalaryStructure {
  id: string;
  staff_id: string;
  effective_from: string;
  effective_to: string | null;
  ctc_cents: number;
  basic_cents: number;
  hra_cents: number;
  conveyance_cents: number;
  special_cents: number;
  pf_employee_pct: number;
  pf_employer_pct: number;
  esi_employee_pct: number;
  esi_employer_pct: number;
  pt_cents_monthly: number;
  tds_pct: number;
  notes: string | null;
}

export interface PayrollRun {
  id: string;
  branch_id: string;
  period_year: number;
  period_month: number;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  total_gross_cents: number;
  total_deductions_cents: number;
  total_net_cents: number;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
}

export interface SalaryPayment {
  id: string;
  payroll_run_id: string;
  staff_id: string;
  /** Legacy alias retained for back-compat in the runs table. */
  days_worked?: number;
  working_days: number;
  days_present: number;
  days_leave_paid: number;
  days_lop: number;
  basic_cents: number;
  hra_cents: number;
  conveyance_cents: number;
  special_cents: number;
  other_earnings_cents: number;
  gross_cents: number;
  lop_deduction_cents: number;
  pf_emp_cents: number;
  esi_emp_cents: number;
  pt_cents: number;
  tds_cents: number;
  other_deductions_cents: number;
  total_deductions_cents: number;
  net_cents: number;
  paid_at: string | null;
  pay_reference?: string | null;
}

export interface DoctorPayout {
  id: string;
  branch_id: string;
  doctor_staff_id: string;
  period_start: string;
  period_end: string;
  visits_count: number;
  total_amount_cents: number;
  tds_cents: number;
  net_cents: number;
  status: 'draft' | 'approved' | 'paid' | 'void';
}

/** Per-doctor commission rule. Most-specific (test > category > default) wins. */
export interface DoctorCommissionRule {
  id: string;
  doctor_staff_id: string;
  branch_id: string | null;
  scope: 'default' | 'category' | 'test';
  category: string | null;
  lab_test_code: string | null;
  commission_pct: number | null;
  commission_flat_cents: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

/** Per-doctor referral activity for a date range. */
export interface DoctorReferralRow {
  doctor_id: string;
  doctor_name: string;
  patients_count: number;
  tests_count: number;
  gross_cents: number;
  commission_cents: number;
}

/** Row in the per-test commission editor — the doctor's current rate per test. */
export interface LabTestCommissionRow {
  code: string;
  name: string;
  category: string;
  price_cents: number;
  rule_id: string | null;        // null when no test-specific rule exists yet
  commission_pct: number | null;  // null = falls back to category/default rule
}

/** Line-level breakdown of a computed payout. */
export interface DoctorPayoutItem {
  id: string;
  payout_id: string;
  lab_order_id: string | null;
  lab_test_code: string | null;
  test_name: string | null;
  patient_uhid: string | null;
  patient_name: string | null;
  service_date: string | null;
  test_price_cents: number;
  commission_pct: number | null;
  commission_cents: number;
  rule_scope: string | null;
}

@Injectable({ providedIn: 'root' })
export class PayrollService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  async listStructures(): Promise<(SalaryStructure & { staff_name: string | null; staff_role: string | null })[]> {
    const { data, error } = await this.db.from('salary_structures')
      .select('*, staff!inner(full_name, role_slug)').order('effective_from', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      staff_name: r.staff?.full_name ?? null,
      staff_role: r.staff?.role_slug ?? null,
    }));
  }

  async upsertStructure(input: Partial<SalaryStructure> & { staff_id: string; effective_from: string }): Promise<string> {
    const { data, error } = await this.db.from('salary_structures').upsert(input).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async listRuns(branchId: string | null): Promise<PayrollRun[]> {
    let q = this.db.from('payroll_runs').select('*')
      .order('period_year', { ascending: false }).order('period_month', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PayrollRun[];
  }

  async listRunPayments(runId: string): Promise<(SalaryPayment & { staff_name: string | null })[]> {
    const { data, error } = await this.db.from('salary_payments')
      .select('*, staff!inner(full_name)').eq('payroll_run_id', runId);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ ...r, staff_name: r.staff?.full_name ?? null }));
  }

  async computeRun(branchId: string, year: number, month: number): Promise<string> {
    const { data, error } = await this.db.rpc('fn_compute_payroll', {
      p_branch_id: branchId, p_year: year, p_month: month,
    });
    if (error) throw error;
    return data as string;
  }

  async approveRun(runId: string, approvedBy: string): Promise<void> {
    const { error } = await this.db.rpc('fn_approve_payroll', { p_run_id: runId, p_approved_by: approvedBy });
    if (error) throw error;
  }

  async payRun(runId: string, fromCode = '1121'): Promise<void> {
    const { error } = await this.db.rpc('fn_pay_payroll', { p_run_id: runId, p_from_code: fromCode });
    if (error) throw error;
  }

  async listDoctorPayouts(branchId: string | null): Promise<(DoctorPayout & { doctor_name: string | null })[]> {
    let q = this.db.from('doctor_payouts').select('*, staff!doctor_payouts_doctor_staff_id_fkey(full_name)')
      .order('period_end', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ ...r, doctor_name: r.staff?.full_name ?? null }));
  }

  async computeDoctorPayout(branchId: string, doctorStaffId: string, periodStart: string, periodEnd: string, tdsPct = 10): Promise<string> {
    const { data, error } = await this.db.rpc('fn_compute_doctor_payout', {
      p_branch_id: branchId, p_doctor_staff_id: doctorStaffId,
      p_period_start: periodStart, p_period_end: periodEnd, p_tds_pct: tdsPct,
    });
    if (error) throw error;
    return data as string;
  }

  async payDoctorPayout(payoutId: string, fromCode = '1121'): Promise<void> {
    const { error } = await this.db.rpc('fn_pay_doctor_payout', { p_payout_id: payoutId, p_from_code: fromCode });
    if (error) throw error;
  }

  // ── Doctor commission rules ─────────────────────────────────────────
  async listCommissionRules(branchId: string | null): Promise<(DoctorCommissionRule & { doctor_name: string | null })[]> {
    let q = this.db.from('doctor_commission_rules')
      .select('*, staff!inner(full_name)')
      .order('doctor_staff_id').order('scope');
    if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ ...r, doctor_name: r.staff?.full_name ?? null }));
  }

  async upsertCommissionRule(rule: Partial<DoctorCommissionRule> & { doctor_staff_id: string; scope: DoctorCommissionRule['scope'] }): Promise<string> {
    const { data, error } = await this.db.from('doctor_commission_rules')
      .upsert(rule).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async deleteCommissionRule(id: string): Promise<void> {
    const { error } = await this.db.from('doctor_commission_rules').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Per-payout line items (breakdown drawer) ────────────────────────
  async listPayoutItems(payoutId: string): Promise<DoctorPayoutItem[]> {
    const { data, error } = await this.db.from('doctor_payout_items')
      .select('*').eq('payout_id', payoutId).order('service_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DoctorPayoutItem[];
  }

  /** Live per-doctor referral activity for a date range — drives both the
   *  /payroll/doctors "Doctor referrals" table and the dashboard card. */
  async referralsSummary(branchId: string | null, from: string, to: string): Promise<DoctorReferralRow[]> {
    const { data, error } = await this.db.rpc('fn_doctor_referrals_summary', {
      p_branch_id: branchId, p_period_start: from, p_period_end: to,
    });
    if (error) throw error;
    return (data ?? []) as DoctorReferralRow[];
  }

  /** Distinct lab-test categories — drives the "Category" dropdown in the rule form. */
  async listLabTestCategories(): Promise<string[]> {
    const { data, error } = await this.db.from('lab_tests')
      .select('category').eq('is_active', true);
    if (error) throw error;
    const seen = new Set<string>();
    for (const r of (data ?? []) as { category: string }[]) {
      if (r.category) seen.add(r.category);
    }
    return Array.from(seen).sort();
  }

  /** Full catalog of active tests joined with the doctor's effective commission
   *  rate (so the bulk editor knows what's already configured and what's the
   *  catalog price). Uses fn_resolve_doctor_commission to pick the best rule. */
  async listLabTestsWithCommission(doctorStaffId: string, branchId: string | null): Promise<LabTestCommissionRow[]> {
    const tests = await this.db.from('lab_tests')
      .select('code, name, category')
      .eq('is_active', true)
      .order('category').order('code');
    if (tests.error) throw tests.error;

    let priceQ = this.db.from('lab_test_prices').select('lab_test_id, price_cents, lab_tests!inner(code)').eq('is_active', true);
    if (branchId) priceQ = priceQ.eq('branch_id', branchId);
    const prices = await priceQ;
    if (prices.error) throw prices.error;
    const priceByCode = new Map<string, number>();
    for (const p of (prices.data ?? []) as any[]) {
      const code = p.lab_tests?.code; if (!code) continue;
      // First non-zero wins — keeps the picker stable when multiple branches return rows.
      if (!priceByCode.has(code) || (priceByCode.get(code) ?? 0) === 0) priceByCode.set(code, p.price_cents ?? 0);
    }

    // All test-scope rules already on file for this doctor.
    const { data: testRules, error: rErr } = await this.db.from('doctor_commission_rules')
      .select('id, lab_test_code, commission_pct, commission_flat_cents')
      .eq('doctor_staff_id', doctorStaffId)
      .eq('scope', 'test').eq('is_active', true);
    if (rErr) throw rErr;
    const ruleByCode = new Map<string, { id: string; pct: number | null; flat: number | null }>();
    for (const r of (testRules ?? []) as any[]) {
      if (r.lab_test_code) ruleByCode.set(r.lab_test_code, { id: r.id, pct: r.commission_pct, flat: r.commission_flat_cents });
    }

    return ((tests.data ?? []) as any[]).map((t) => {
      const rule = ruleByCode.get(t.code);
      return {
        code: t.code,
        name: t.name,
        category: t.category,
        price_cents: priceByCode.get(t.code) ?? 0,
        rule_id: rule?.id ?? null,
        commission_pct: rule?.pct ?? null,
      } as LabTestCommissionRow;
    });
  }

  /** Bulk-write per-test rules. Empty/null pct => delete that test's rule
   *  (so the doctor's default % takes over again). */
  async bulkUpsertTestRules(
    doctorStaffId: string,
    branchId: string | null,
    rows: { code: string; pct: number | null; rule_id: string | null }[],
  ): Promise<{ saved: number; deleted: number }> {
    let saved = 0;
    let deleted = 0;
    const toUpsert = rows.filter((r) => r.pct != null && Number.isFinite(r.pct as number));
    const toDelete = rows.filter((r) => (r.pct == null || !Number.isFinite(r.pct as number)) && r.rule_id);

    if (toUpsert.length > 0) {
      // branch_id intentionally NULL — commission rules are doctor-scoped, not
      // branch-scoped, so the same rule applies wherever the doctor refers
      // patients. Stops the per-branch row duplication that the seed produced.
      void branchId;
      const payload = toUpsert.map((r) => ({
        ...(r.rule_id ? { id: r.rule_id } : {}),
        doctor_staff_id: doctorStaffId,
        branch_id: null,
        scope: 'test',
        lab_test_code: r.code,
        commission_pct: r.pct,
        effective_from: new Date().toISOString().slice(0, 10),
        is_active: true,
      }));
      const { error } = await this.db.from('doctor_commission_rules').upsert(payload);
      if (error) throw error;
      saved = toUpsert.length;
    }
    if (toDelete.length > 0) {
      const ids = toDelete.map((r) => r.rule_id!).filter(Boolean);
      const { error } = await this.db.from('doctor_commission_rules').delete().in('id', ids);
      if (error) throw error;
      deleted = ids.length;
    }
    return { saved, deleted };
  }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string | null }[]> {
    const { data, error } = await this.db.from('staff')
      .select('id, full_name, role_slug').order('full_name');
    if (error) throw error;
    return (data ?? []) as any;
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }
}
