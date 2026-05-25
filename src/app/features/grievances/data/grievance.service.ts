import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Grievance,
  GrievanceCategory,
  GrievanceComment,
  GrievanceSeverity,
  GrievanceStatus,
} from './grievance.types';

@Injectable({ providedIn: 'root' })
export class GrievanceService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: GrievanceStatus; mineOnly?: boolean } = {}): Promise<Grievance[]> {
    let q = this.db.from('grievances').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as Grievance[];
  }

  async get(id: string): Promise<Grievance | null> {
    const { data, error } = await this.db.from('grievances').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message ?? 'Failed');
    return data as Grievance | null;
  }

  async listComments(grievanceId: string): Promise<GrievanceComment[]> {
    const { data, error } = await this.db.from('grievance_comments').select('*')
      .eq('grievance_id', grievanceId).order('created_at', { ascending: true }).limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as GrievanceComment[];
  }

  async create(input: {
    branchId: string | null;
    isAnonymous: boolean;
    category: GrievanceCategory;
    subject: string;
    description: string;
    severity: GrievanceSeverity;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('grievance_create', {
      p_branch_id: input.branchId,
      p_is_anonymous: input.isAnonymous,
      p_category: input.category,
      p_subject: input.subject,
      p_description: input.description,
      p_severity: input.severity,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async changeStatus(input: { id: string; status?: GrievanceStatus; assignedTo?: string | null; resolution?: string | null }): Promise<void> {
    const { error } = await this.db.rpc('grievance_change_status', {
      p_id: input.id,
      p_status: input.status ?? null,
      p_assigned_to: input.assignedTo ?? null,
      p_resolution: input.resolution ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async addComment(input: { grievanceId: string; body: string; isInternal?: boolean }): Promise<string> {
    const { data, error } = await this.db.rpc('grievance_add_comment', {
      p_grievance_id: input.grievanceId,
      p_body: input.body,
      p_is_internal: !!input.isInternal,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }
}
