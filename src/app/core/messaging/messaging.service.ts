import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Outbound SMS abstraction.
 *
 * In mock-mode (current), the message is recorded in `public.sms_log` with
 * status='mock' and no real SMS leaves the system. The OTP RPC also returns
 * the plaintext OTP in the response so demo flows can verify without a
 * real handset.
 *
 * At go-live, swap the implementation behind `send()` for a real provider
 * (Twilio / MSG91 / SendGrid SMS) — keep the same DB audit trail and
 * the consent OTP RPCs continue to work unchanged.
 */
@Injectable({ providedIn: 'root' })
export class MessagingService {
  private supabase = inject(SupabaseService);

  /** Direct SMS send (mock — logs to sms_log). Used by features that don't go
   *  through a server-side RPC (notifications, lab-report SMS, etc.). */
  async send(input: {
    to: string;
    message: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    branchId?: string | null;
  }): Promise<{ id: string; status: string }> {
    const { data, error } = await (this.supabase.client as any)
      .from('sms_log')
      .insert({
        to_phone:            input.to,
        message:             input.message,
        status:              'mock',
        provider:            'mock',
        related_entity_type: input.relatedEntityType ?? null,
        related_entity_id:   input.relatedEntityId ?? null,
        branch_id:           input.branchId ?? null,
      })
      .select('id, status')
      .single();
    if (error) throw new Error(error.message ?? 'SMS log insert failed');
    return data as { id: string; status: string };
  }

  /**
   * Send a templated SMS to a patient. Resolves the patient's mobile + branch
   * automatically, formats the message via {{placeholders}}, and routes through
   * `send()`. Silent no-op when the patient has no mobile on file.
   */
  async sendToPatient(input: {
    patientId: string;
    template: string;
    vars?: Record<string, string | number>;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<{ id: string; status: string } | null> {
    const { data: p } = await (this.supabase.client as any)
      .from('patients')
      .select('mobile, branch_id, full_name')
      .eq('id', input.patientId)
      .maybeSingle();
    if (!p?.mobile) return null;

    let message = input.template;
    for (const [k, v] of Object.entries(input.vars ?? {})) {
      message = message.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v));
    }

    return this.send({
      to:                p.mobile,
      message,
      branchId:          p.branch_id ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId:   input.relatedEntityId   ?? null,
    });
  }

  /** Tail of recent SMS log entries — for the (forthcoming) ops console. */
  async listRecent(limit = 50): Promise<Array<{
    id: string; to_phone: string; message: string;
    status: string; provider: string;
    related_entity_type: string | null; related_entity_id: string | null;
    sent_at: string;
  }>> {
    const { data, error } = await (this.supabase.client as any)
      .from('sms_log')
      .select('id, to_phone, message, status, provider, related_entity_type, related_entity_id, sent_at')
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}
