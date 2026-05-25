import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  DisciplinaryAction,
  DisciplinaryActionType,
  DisciplinarySeverity,
  DisciplinaryStatus,
} from './disciplinary.types';

@Injectable({ providedIn: 'root' })
export class DisciplinaryService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: DisciplinaryStatus } = {}): Promise<DisciplinaryAction[]> {
    let q = this.db.from('hr_disciplinary_actions').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as DisciplinaryAction[];
  }

  async create(input: {
    branchId: string | null;
    staffId: string;
    actionType: DisciplinaryActionType;
    severity: DisciplinarySeverity;
    reason: string;
    description?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    documentUrl?: string | null;
    issueNow?: boolean;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('disciplinary_create', {
      p_branch_id: input.branchId,
      p_staff_id: input.staffId,
      p_action_type: input.actionType,
      p_severity: input.severity,
      p_reason: input.reason,
      p_description: input.description ?? null,
      p_effective_from: input.effectiveFrom ?? null,
      p_effective_to: input.effectiveTo ?? null,
      p_document_url: input.documentUrl ?? null,
      p_issue_now: !!input.issueNow,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async changeStatus(id: string, status: DisciplinaryStatus): Promise<void> {
    const { error } = await this.db.rpc('disciplinary_change_status', { p_id: id, p_status: status });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async setResponse(id: string, response: string): Promise<void> {
    const { error } = await this.db.rpc('disciplinary_set_response', { p_id: id, p_response: response });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string }[]> {
    const { data, error } = await this.db.from('staff').select('id, full_name, role_slug')
      .eq('is_active', true).order('full_name', { ascending: true }).limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as any;
  }
}
