import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { HrPolicy, HrPolicyAcknowledgment, PolicyCompliance } from './hr-policy.types';

@Injectable({ providedIn: 'root' })
export class HrPolicyService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { activeOnly?: boolean; category?: string } = {}): Promise<HrPolicy[]> {
    let q = this.db.from('hr_policies').select('*').order('category', { ascending: true }).order('code', { ascending: true }).limit(500);
    if (opts.activeOnly !== false) q = q.eq('is_active', true);
    if (opts.category) q = q.eq('category', opts.category);
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as HrPolicy[];
  }

  async myAcknowledgments(): Promise<HrPolicyAcknowledgment[]> {
    const { data, error } = await this.db.from('hr_policy_acknowledgments').select('*').limit(1000);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as HrPolicyAcknowledgment[];
  }

  async upsert(input: Partial<HrPolicy> & { code: string; title: string }): Promise<string> {
    const { data, error } = await this.db.rpc('hr_policy_upsert', {
      p_id: input.id ?? null,
      p_branch_id: input.branch_id ?? null,
      p_code: input.code,
      p_title: input.title,
      p_category: input.category ?? 'general',
      p_version: input.version ?? '1.0',
      p_effective_date: input.effective_date ?? new Date().toISOString().slice(0, 10),
      p_document_url: input.document_url ?? null,
      p_body: input.body ?? null,
      p_requires_ack: input.requires_ack ?? true,
      p_is_active: input.is_active ?? true,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async acknowledge(policyId: string): Promise<void> {
    const { error } = await this.db.rpc('hr_policy_acknowledge', { p_policy_id: policyId });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async compliance(): Promise<PolicyCompliance[]> {
    const { data, error } = await this.db.rpc('hr_policy_compliance');
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as PolicyCompliance[];
  }
}
