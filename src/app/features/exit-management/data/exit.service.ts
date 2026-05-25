import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { ExitClearanceItem, ExitStatus, ExitType, HrExit, SettlementStatus } from './exit.types';

@Injectable({ providedIn: 'root' })
export class ExitService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(): Promise<HrExit[]> {
    const { data, error } = await this.db.from('hr_exits').select('*')
      .order('notice_date', { ascending: false }).limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as HrExit[];
  }

  async listClearance(exitId: string): Promise<ExitClearanceItem[]> {
    const { data, error } = await this.db.from('hr_exit_clearance').select('*')
      .eq('exit_id', exitId).order('ord', { ascending: true });
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as ExitClearanceItem[];
  }

  async initiate(input: {
    branchId: string | null;
    staffId?: string | null;
    exitType: ExitType;
    reasonCategory?: string | null;
    reason?: string | null;
    noticeDate?: string | null;
    expectedLastDay?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('exit_initiate', {
      p_branch_id: input.branchId,
      p_staff_id: input.staffId ?? null,
      p_exit_type: input.exitType,
      p_reason_category: input.reasonCategory ?? null,
      p_reason: input.reason ?? null,
      p_notice_date: input.noticeDate ?? null,
      p_expected_last_day: input.expectedLastDay ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async setStatus(input: {
    id: string;
    status?: ExitStatus;
    actualLastDay?: string | null;
    interviewNotes?: string | null;
    interviewScore?: number | null;
    settlementStatus?: SettlementStatus | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('exit_set_status', {
      p_id: input.id,
      p_status: input.status ?? null,
      p_actual_last_day: input.actualLastDay ?? null,
      p_interview_notes: input.interviewNotes ?? null,
      p_interview_score: input.interviewScore ?? null,
      p_settlement_status: input.settlementStatus ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async toggleClearance(input: { clearanceId: string; isDone: boolean; remarks?: string | null }): Promise<void> {
    const { error } = await this.db.rpc('exit_clearance_toggle', {
      p_clearance_id: input.clearanceId,
      p_is_done: input.isDone,
      p_remarks: input.remarks ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string }[]> {
    const { data, error } = await this.db.from('staff').select('id, full_name, role_slug')
      .eq('is_active', true).order('full_name').limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as any;
  }
}
