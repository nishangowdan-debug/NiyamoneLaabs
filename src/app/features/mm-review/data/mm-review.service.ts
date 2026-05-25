import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  MmActionItem, MmActionStatus, MmCaseType, MmReview, MmReviewStatus,
} from './mm-review.types';

@Injectable({ providedIn: 'root' })
export class MmReviewService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: MmReviewStatus; caseType?: MmCaseType } = {}): Promise<MmReview[]> {
    let q = this.db.from('mm_reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status)   q = q.eq('status', opts.status);
    if (opts.caseType) q = q.eq('case_type', opts.caseType);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MmReview[];
  }

  async get(id: string): Promise<MmReview> {
    const { data, error } = await this.db.from('mm_reviews').select('*').eq('id', id).single();
    if (error) throw error;
    return data as MmReview;
  }

  async listActions(reviewId: string): Promise<MmActionItem[]> {
    const { data, error } = await this.db.from('mm_action_items')
      .select('*').eq('mm_review_id', reviewId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MmActionItem[];
  }

  async create(input: {
    caseType: MmCaseType;
    caseSummary: string;
    patientId?: string | null;
    admissionId?: string | null;
    linkedDeathRecordId?: string | null;
    linkedCodeBlueId?: string | null;
    linkedHaiId?: string | null;
    linkedOtRecordId?: string | null;
    linkedAdrId?: string | null;
    reviewedAt?: string | null;
    chairDoctorName?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('mm_create_review', {
      p_case_type: input.caseType,
      p_case_summary: input.caseSummary,
      p_patient_id: input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_linked_death_record_id: input.linkedDeathRecordId ?? null,
      p_linked_code_blue_id: input.linkedCodeBlueId ?? null,
      p_linked_hai_id: input.linkedHaiId ?? null,
      p_linked_ot_record_id: input.linkedOtRecordId ?? null,
      p_linked_adr_id: input.linkedAdrId ?? null,
      p_reviewed_at: input.reviewedAt ?? null,
      p_chair_doctor_name: input.chairDoctorName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create review');
    return data as string;
  }

  async update(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('mm_update_review', { p_id: id, p_patch: patch });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async close(id: string): Promise<void> {
    const { error } = await this.db.rpc('mm_close_review', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async addAction(input: {
    reviewId: string; description: string;
    ownerName?: string | null; dueAt?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('mm_add_action', {
      p_review_id: input.reviewId,
      p_description: input.description,
      p_owner_name: input.ownerName ?? null,
      p_due_at: input.dueAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async setActionStatus(id: string, status: MmActionStatus, completionNotes?: string): Promise<void> {
    const { error } = await this.db.rpc('mm_update_action_status', {
      p_id: id, p_status: status, p_completion_notes: completionNotes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
