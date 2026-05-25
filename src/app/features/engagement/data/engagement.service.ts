import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  EngagementKudos,
  EngagementQuestion,
  EngagementSurvey,
  SurveySummaryRow,
} from './engagement.types';

@Injectable({ providedIn: 'root' })
export class EngagementService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async activeSurveys(): Promise<EngagementSurvey[]> {
    const { data, error } = await this.db.from('engagement_surveys').select('*')
      .eq('is_active', true).order('created_at', { ascending: false }).limit(10);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as EngagementSurvey[];
  }

  async questionsFor(surveyId: string): Promise<EngagementQuestion[]> {
    const { data, error } = await this.db.from('engagement_questions').select('*')
      .eq('survey_id', surveyId).order('ord', { ascending: true });
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as EngagementQuestion[];
  }

  async submitResponse(input: { surveyId: string; questionId: string; score?: number | null; text?: string | null; anonymous?: boolean }): Promise<string> {
    const { data, error } = await this.db.rpc('engagement_submit_response', {
      p_survey_id: input.surveyId,
      p_question_id: input.questionId,
      p_score: input.score ?? null,
      p_text: input.text ?? null,
      p_anonymous: input.anonymous ?? true,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async sendKudos(input: { toStaffId: string; message: string; category?: string; isPublic?: boolean; branchId?: string | null }): Promise<string> {
    const { data, error } = await this.db.rpc('engagement_send_kudos', {
      p_to_staff_id: input.toStaffId,
      p_message: input.message,
      p_category: input.category ?? 'teamwork',
      p_is_public: input.isPublic ?? true,
      p_branch_id: input.branchId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async listKudos(): Promise<EngagementKudos[]> {
    const { data, error } = await this.db.from('engagement_kudos').select('*')
      .eq('is_public', true).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as EngagementKudos[];
  }

  async surveySummary(surveyId: string): Promise<SurveySummaryRow[]> {
    const { data, error } = await this.db.rpc('engagement_survey_summary', { p_survey_id: surveyId });
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as SurveySummaryRow[];
  }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string }[]> {
    const { data, error } = await this.db.from('staff').select('id, full_name, role_slug, is_active')
      .eq('is_active', true).order('full_name', { ascending: true }).limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as any;
  }
}
