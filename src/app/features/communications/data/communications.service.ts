import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CommChannel, CommEvent, CommLog, CommStatus, CommTemplate,
} from './communications.types';

@Injectable({ providedIn: 'root' })
export class CommunicationsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listTemplates(opts: { activeOnly?: boolean; channel?: CommChannel } = {}): Promise<CommTemplate[]> {
    let q = this.db.from('communication_templates').select('*').order('event_type').order('channel');
    if (opts.activeOnly) q = q.eq('is_active', true);
    if (opts.channel)    q = q.eq('channel', opts.channel);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CommTemplate[];
  }

  async createTemplate(t: Partial<CommTemplate>): Promise<CommTemplate> {
    const { data, error } = await this.db.from('communication_templates').insert(t).select('*').single();
    if (error) throw error;
    return data as CommTemplate;
  }

  async updateTemplate(id: string, patch: Partial<CommTemplate>): Promise<void> {
    const { error } = await this.db.from('communication_templates').update(patch).eq('id', id);
    if (error) throw error;
  }

  async listLogs(opts: { status?: CommStatus; patientId?: string } = {}): Promise<CommLog[]> {
    let q = this.db.from('communication_log').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CommLog[];
  }

  async send(input: {
    templateCode: string;
    toPhone?: string | null;
    toEmail?: string | null;
    patientId?: string | null;
    variables?: Record<string, unknown>;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    provider?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('comm_send', {
      p_template_code: input.templateCode,
      p_to_phone: input.toPhone ?? null,
      p_to_email: input.toEmail ?? null,
      p_patient_id: input.patientId ?? null,
      p_variables: input.variables ?? {},
      p_related_entity_type: input.relatedEntityType ?? null,
      p_related_entity_id: input.relatedEntityId ?? null,
      p_provider: input.provider ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async updateStatus(id: string, status: CommStatus, providerMessageId?: string, errorMessage?: string): Promise<void> {
    const { error } = await this.db.rpc('comm_update_status', {
      p_id: id, p_status: status,
      p_provider_message_id: providerMessageId ?? null,
      p_error_message: errorMessage ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
