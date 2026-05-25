import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { DischargeSummaryTemplate } from './discharge-templates.types';

@Injectable({ providedIn: 'root' })
export class DischargeTemplatesService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { activeOnly?: boolean; specialty?: string } = {}): Promise<DischargeSummaryTemplate[]> {
    let q = this.db.from('discharge_summary_templates').select('*').order('title');
    if (opts.activeOnly) q = q.eq('is_active', true);
    if (opts.specialty)  q = q.eq('specialty', opts.specialty);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DischargeSummaryTemplate[];
  }

  async create(t: Partial<DischargeSummaryTemplate>): Promise<DischargeSummaryTemplate> {
    const { data, error } = await this.db.from('discharge_summary_templates').insert(t).select('*').single();
    if (error) throw error;
    return data as DischargeSummaryTemplate;
  }

  async update(id: string, patch: Partial<DischargeSummaryTemplate>): Promise<void> {
    const { error } = await this.db.from('discharge_summary_templates').update(patch).eq('id', id);
    if (error) throw error;
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.db.from('discharge_summary_templates').update({ is_active: isActive }).eq('id', id);
    if (error) throw error;
  }

  async applyToAdmission(admissionId: string, templateId: string, overwrite = false): Promise<void> {
    const { error } = await this.db.rpc('discharge_apply_template', {
      p_admission_id: admissionId, p_template_id: templateId, p_overwrite: overwrite,
    });
    if (error) throw new Error(error.message ?? 'Failed to apply template');
  }
}
