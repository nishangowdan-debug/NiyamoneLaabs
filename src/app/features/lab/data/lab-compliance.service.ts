import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/** Denormalised QC run row from v_lab_qc_runs_audit. */
export interface QcRunAuditRow {
  run_id: string;
  measured_at: string;
  value: number;
  deviation_sd: number;
  run_status: 'accepted' | 'warning' | 'rejected';
  violations: string[] | null;
  action_taken: string | null;
  run_notes: string | null;
  created_at: string;
  ran_by_staff_id: string | null;
  ran_by_full_name: string | null;
  material_id: string;
  material_lot: string;
  material_level: 'L1' | 'L2' | 'L3' | string;
  mean_target: number;
  sd_target: number;
  material_expiry: string | null;
  material_unit: string | null;
  instrument_id: string | null;
  instrument_code: string | null;
  instrument_name: string | null;
  branch_id: string | null;
  test_id: string | null;
  test_code: string | null;
  test_name: string | null;
  test_category: string | null;
}

export interface QcRunsLedgerFilters {
  from: string;            // ISO timestamp
  to: string;              // ISO timestamp
  branchId?: string | null;
  instrumentId?: string | null;
  testId?: string | null;
  status?: 'accepted' | 'warning' | 'rejected' | null;
  violation?: string | null;
  runBy?: string | null;   // free-text on ran_by_full_name
  /** 0-based page index. */
  page: number;
  /** rows per page. */
  pageSize: number;
}

export interface PeriodSummary {
  period: { from: string; to: string; branch_id: string | null };
  runs: { total: number; accepted: number; warning: number; rejected: number;
          pct_accepted: number; pct_warning: number; pct_rejected: number };
  top_violations: { instrument_code: string | null; rule: string; count: number }[];
  calibrations: { performed_in_window: number; overdue_now: number };
  critical_alerts: { total: number; acknowledged: number; median_ack_minutes: number | null };
  rejections: { total: number; by_reason: { reason: string; count: number }[] };
  shifts: { total: number; cleared: number; closed_without_qc_clear: number;
            avg_time_to_clear_minutes: number | null };
}

export type AuditSection = 'runs' | 'shifts' | 'calibrations' | 'critical_alerts' | 'rejections';

/** Row from v_lab_shift_compliance. */
export interface ShiftComplianceRow {
  session_id: string;
  opened_at: string;
  qc_cleared_at: string | null;
  closed_at: string | null;
  qc_overdue_snapshot: string[] | null;
  staff_id: string | null;
  staff_name: string | null;
  staff_role: string | null;
  branch_id: string | null;
  time_to_clear_minutes: number | null;
  shift_length_minutes: number | null;
  qc_was_cleared: boolean;
  closed_without_qc_clear: boolean;
}

export interface ShiftFilters {
  from: string;
  to: string;
  branchId?: string | null;
  staffName?: string | null;     // ILIKE on staff_name
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class LabComplianceService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  /** Server-paged QC runs ledger with audit fields. Returns rows + total count. */
  async listQcRuns(f: QcRunsLedgerFilters): Promise<{ rows: QcRunAuditRow[]; total: number }> {
    let q = this.db.from('v_lab_qc_runs_audit')
      .select('*', { count: 'exact' })
      .gte('measured_at', f.from)
      .lt('measured_at',  f.to)
      .order('measured_at', { ascending: false });

    if (f.branchId)     q = q.eq('branch_id', f.branchId);
    if (f.instrumentId) q = q.eq('instrument_id', f.instrumentId);
    if (f.testId)       q = q.eq('test_id', f.testId);
    if (f.status)       q = q.eq('run_status', f.status);
    if (f.violation)    q = q.contains('violations', [f.violation]);
    if (f.runBy)        q = q.ilike('ran_by_full_name', `%${f.runBy}%`);

    const start = f.page * f.pageSize;
    const end   = start + f.pageSize - 1;
    q = q.range(start, end);

    const { data, error, count } = await q;
    if (error) throw error;
    return { rows: (data ?? []) as QcRunAuditRow[], total: count ?? 0 };
  }

  /** Pull every run matching the LJ chart filters, oldest first. No paging — caller
   *  is expected to constrain the date range (default 30 days in the UI). */
  async listRunsForChart(input: {
    fromIso: string; toIso: string; branchId: string | null;
    testId: string; instrumentId?: string | null; materialId?: string | null;
    limit?: number;
  }): Promise<QcRunAuditRow[]> {
    let q = this.db.from('v_lab_qc_runs_audit')
      .select('*')
      .gte('measured_at', input.fromIso)
      .lt('measured_at',  input.toIso)
      .eq('test_id',      input.testId)
      .order('measured_at', { ascending: true })
      .limit(input.limit ?? 2000);
    if (input.branchId)     q = q.eq('branch_id',     input.branchId);
    if (input.instrumentId) q = q.eq('instrument_id', input.instrumentId);
    if (input.materialId)   q = q.eq('material_id',   input.materialId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as QcRunAuditRow[];
  }

  /** Update audit annotations on a QC run (action_taken, notes). The
   *  write-once trigger refuses changes to any other column. */
  async annotateRun(runId: string, patch: { action_taken?: string | null; notes?: string | null }): Promise<void> {
    const { error } = await this.db.from('lab_qc_runs').update(patch).eq('id', runId);
    if (error) throw error;
  }

  /** Server-paged shift compliance ledger. */
  async listShiftSessions(f: ShiftFilters): Promise<{ rows: ShiftComplianceRow[]; total: number }> {
    let q = this.db.from('v_lab_shift_compliance')
      .select('*', { count: 'exact' })
      .gte('opened_at', f.from)
      .lt('opened_at',  f.to)
      .order('opened_at', { ascending: false });
    if (f.branchId)  q = q.eq('branch_id', f.branchId);
    if (f.staffName) q = q.ilike('staff_name', `%${f.staffName}%`);
    const start = f.page * f.pageSize;
    const end   = start + f.pageSize - 1;
    q = q.range(start, end);
    const { data, error, count } = await q;
    if (error) throw error;
    return { rows: (data ?? []) as ShiftComplianceRow[], total: count ?? 0 };
  }

  /** Period summary for the dashboard cards. */
  async periodSummary(fromIso: string, toIso: string, branchId: string | null): Promise<PeriodSummary> {
    const { data, error } = await this.db.rpc('lab_qc_period_summary', {
      p_from: fromIso, p_to: toIso, p_branch_id: branchId,
    });
    if (error) throw error;
    return data as PeriodSummary;
  }

  /** Audit export rowset for a section — used to build the PDF pack. */
  async exportSection(fromIso: string, toIso: string, branchId: string | null, section: AuditSection): Promise<any[]> {
    const { data, error } = await this.db.rpc('lab_qc_audit_export', {
      p_from: fromIso, p_to: toIso, p_branch_id: branchId, p_section: section,
    });
    if (error) throw error;
    return (data ?? []) as any[];
  }
}
