import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { ComplaintBoxEntry, ComplaintBoxStatus, ComplaintBoxType } from './complaints-box.types';

@Injectable({ providedIn: 'root' })
export class ComplaintsBoxService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: ComplaintBoxStatus; type?: ComplaintBoxType } = {}): Promise<ComplaintBoxEntry[]> {
    let q = this.db.from('hr_complaints_box').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.type) q = q.eq('type', opts.type);
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as ComplaintBoxEntry[];
  }

  async submit(input: { branchId: string | null; type: ComplaintBoxType; isAnonymous: boolean; subject: string; body: string }): Promise<string> {
    const { data, error } = await this.db.rpc('hr_complaints_box_submit', {
      p_branch_id: input.branchId,
      p_type: input.type,
      p_is_anonymous: input.isAnonymous,
      p_subject: input.subject,
      p_body: input.body,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async respond(input: { id: string; status?: ComplaintBoxStatus; response?: string | null }): Promise<void> {
    const { error } = await this.db.rpc('hr_complaints_box_respond', {
      p_id: input.id,
      p_status: input.status ?? null,
      p_response: input.response ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
