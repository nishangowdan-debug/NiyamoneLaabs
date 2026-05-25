import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Complaint, ComplaintCategory, ComplaintChannel, ComplaintSeverity, ComplaintStatus,
  FeedbackChannel, FeedbackResponse, FeedbackResponseStatus, FeedbackSurvey,
  FeedbackWeeklySummary,
} from './feedback.types';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Surveys ───────────────────────────────────────────────────
  async listSurveys(activeOnly = true): Promise<FeedbackSurvey[]> {
    let q = this.db.from('feedback_surveys').select('*').order('title');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FeedbackSurvey[];
  }

  // ── Responses ─────────────────────────────────────────────────
  async listResponses(opts: { status?: FeedbackResponseStatus; surveyId?: string } = {}): Promise<FeedbackResponse[]> {
    let q = this.db.from('feedback_responses').select('*').order('submitted_at', { ascending: false }).limit(500);
    if (opts.status)   q = q.eq('status', opts.status);
    if (opts.surveyId) q = q.eq('survey_id', opts.surveyId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FeedbackResponse[];
  }

  async submit(input: {
    surveyId: string;
    patientId?: string | null;
    admissionId?: string | null;
    encounterId?: string | null;
    edVisitId?: string | null;
    isAnonymous?: boolean;
    submittedVia?: FeedbackChannel;
    overallRating?: number | null;
    npsScore?: number | null;
    answers?: Record<string, unknown>;
    freeTextComments?: string | null;
    department?: string | null;
    followUpRequired?: boolean;
    contactPhone?: string | null;
    contactEmail?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('feedback_submit', {
      p_survey_id: input.surveyId,
      p_patient_id: input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_ed_visit_id: input.edVisitId ?? null,
      p_is_anonymous: input.isAnonymous ?? false,
      p_submitted_via: input.submittedVia ?? 'in_person',
      p_overall_rating: input.overallRating ?? null,
      p_nps_score: input.npsScore ?? null,
      p_answers: input.answers ?? {},
      p_free_text_comments: input.freeTextComments ?? null,
      p_department: input.department ?? null,
      p_follow_up_required: input.followUpRequired ?? false,
      p_contact_phone: input.contactPhone ?? null,
      p_contact_email: input.contactEmail ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to submit feedback');
    return data as string;
  }

  async review(id: string, status: FeedbackResponseStatus, reviewerNotes?: string): Promise<void> {
    const { error } = await this.db.rpc('feedback_review', {
      p_id: id, p_status: status, p_reviewer_notes: reviewerNotes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Summary ───────────────────────────────────────────────────
  async weeklySummary(): Promise<FeedbackWeeklySummary[]> {
    const { data, error } = await this.db.from('v_feedback_summary').select('*');
    if (error) throw error;
    return (data ?? []) as FeedbackWeeklySummary[];
  }

  // ── Complaints ────────────────────────────────────────────────
  async listComplaints(opts: { status?: ComplaintStatus } = {}): Promise<Complaint[]> {
    let q = this.db.from('complaints').select('*').order('received_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Complaint[];
  }

  async createComplaint(input: {
    category: ComplaintCategory;
    severity: ComplaintSeverity;
    description: string;
    channel?: ComplaintChannel;
    patientId?: string | null;
    complainantName?: string | null;
    complainantRelation?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    department?: string | null;
    staffInvolved?: string[];
    dueAt?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('complaint_create', {
      p_category: input.category,
      p_severity: input.severity,
      p_description: input.description,
      p_channel: input.channel ?? 'verbal',
      p_patient_id: input.patientId ?? null,
      p_complainant_name: input.complainantName ?? null,
      p_complainant_relation: input.complainantRelation ?? null,
      p_contact_phone: input.contactPhone ?? null,
      p_contact_email: input.contactEmail ?? null,
      p_department: input.department ?? null,
      p_staff_involved: input.staffInvolved ?? [],
      p_due_at: input.dueAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async fromFeedback(input: {
    feedbackResponseId: string;
    category: ComplaintCategory;
    severity: ComplaintSeverity;
    description: string;
    department?: string | null;
    complainantName?: string | null;
    channel?: ComplaintChannel;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('complaint_from_feedback', {
      p_feedback_response_id: input.feedbackResponseId,
      p_category: input.category,
      p_severity: input.severity,
      p_description: input.description,
      p_department: input.department ?? null,
      p_complainant_name: input.complainantName ?? null,
      p_channel: input.channel ?? 'online',
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async assign(id: string, toStaffId: string | null, toName: string, dueAt?: string | null): Promise<void> {
    const { error } = await this.db.rpc('complaint_assign', {
      p_id: id, p_to_staff_id: toStaffId, p_to_name: toName, p_due_at: dueAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async resolve(id: string, resolutionSummary: string, patientSatisfied?: boolean | null): Promise<void> {
    const { error } = await this.db.rpc('complaint_resolve', {
      p_id: id, p_resolution_summary: resolutionSummary,
      p_patient_satisfied: patientSatisfied ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async escalate(id: string, to: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('complaint_escalate', {
      p_id: id, p_to: to, p_reason: reason,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
