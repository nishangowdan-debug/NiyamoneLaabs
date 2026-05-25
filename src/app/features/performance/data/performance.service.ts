import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Perf360,
  PerfCycle,
  PerfKpi,
  PerfReview,
  Relationship,
} from './performance.types';

@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listCycles(): Promise<PerfCycle[]> {
    const { data, error } = await this.db.from('perf_cycles').select('*').order('period_start', { ascending: false }).limit(50);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as PerfCycle[];
  }

  async listReviews(opts: { cycleId?: string } = {}): Promise<PerfReview[]> {
    let q = this.db.from('perf_reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.cycleId) q = q.eq('cycle_id', opts.cycleId);
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as PerfReview[];
  }

  async kpisFor(reviewId: string): Promise<PerfKpi[]> {
    const { data, error } = await this.db.from('perf_kpis').select('*').eq('review_id', reviewId).order('ord');
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as PerfKpi[];
  }

  async feedback360For(reviewId: string): Promise<Perf360[]> {
    const { data, error } = await this.db.from('perf_feedback_360').select('*').eq('review_id', reviewId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as Perf360[];
  }

  async upsertCycle(input: Partial<PerfCycle> & { name: string; period_start: string; period_end: string }): Promise<string> {
    const { data, error } = await this.db.rpc('perf_cycle_upsert', {
      p_id: input.id ?? null,
      p_branch_id: input.branch_id ?? null,
      p_name: input.name,
      p_period_start: input.period_start,
      p_period_end: input.period_end,
      p_self_due: input.self_review_due ?? null,
      p_manager_due: input.manager_review_due ?? null,
      p_peer_due: input.peer_review_due ?? null,
      p_status: input.status ?? 'open',
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async openReview(input: { cycleId: string; staffId: string; managerStaffId?: string | null }): Promise<string> {
    const { data, error } = await this.db.rpc('perf_review_open', {
      p_cycle_id: input.cycleId,
      p_staff_id: input.staffId,
      p_manager_staff_id: input.managerStaffId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async submitSelf(reviewId: string, summary: string): Promise<void> {
    const { error } = await this.db.rpc('perf_review_submit_self', { p_review_id: reviewId, p_summary: summary });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async submitManager(reviewId: string, summary: string, overallScore: number): Promise<void> {
    const { error } = await this.db.rpc('perf_review_submit_manager', {
      p_review_id: reviewId, p_summary: summary, p_overall_score: overallScore,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async acknowledge(reviewId: string): Promise<void> {
    const { error } = await this.db.rpc('perf_review_acknowledge', { p_review_id: reviewId });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async upsertKpi(input: Partial<PerfKpi> & { review_id: string; kpi_name: string }): Promise<string> {
    const { data, error } = await this.db.rpc('perf_kpi_upsert', {
      p_id: input.id ?? null,
      p_review_id: input.review_id,
      p_ord: input.ord ?? 0,
      p_name: input.kpi_name,
      p_weight: input.weight_pct ?? 0,
      p_target: input.target ?? null,
      p_achievement: input.achievement ?? null,
      p_self_score: input.self_score ?? null,
      p_manager_score: input.manager_score ?? null,
      p_comments: input.comments ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async deleteKpi(id: string): Promise<void> {
    const { error } = await this.db.rpc('perf_kpi_delete', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async submit360(input: { reviewId: string; anonymous?: boolean; relationship: Relationship; strengths?: string | null; improvements?: string | null; rating?: number | null }): Promise<string> {
    const { data, error } = await this.db.rpc('perf_360_submit', {
      p_review_id: input.reviewId,
      p_anonymous: input.anonymous ?? true,
      p_relationship: input.relationship,
      p_strengths: input.strengths ?? null,
      p_improvements: input.improvements ?? null,
      p_rating: input.rating ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string }[]> {
    const { data, error } = await this.db.from('staff').select('id, full_name, role_slug')
      .eq('is_active', true).order('full_name').limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as any;
  }
}
