import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  TeleConsultType, TeleProvider, TeleSession, TeleSessionStatus,
} from './telemedicine.types';

@Injectable({ providedIn: 'root' })
export class TelemedicineService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listToday(): Promise<TeleSession[]> {
    const { data, error } = await this.db.from('v_tele_today').select('*').order('scheduled_at');
    if (error) throw error;
    return (data ?? []) as TeleSession[];
  }

  async listAll(opts: { status?: TeleSessionStatus; patientId?: string } = {}): Promise<TeleSession[]> {
    let q = this.db.from('telemedicine_sessions').select('*').order('scheduled_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TeleSession[];
  }

  async schedule(input: {
    patientId: string;
    doctorName: string;
    scheduledAt: string;
    consultType?: TeleConsultType;
    doctorStaffId?: string | null;
    appointmentId?: string | null;
    provider?: TeleProvider;
    durationMinutes?: number;
    meetingUrl?: string | null;
    meetingId?: string | null;
    patientJoinUrl?: string | null;
    doctorJoinUrl?: string | null;
    passcode?: string | null;
    feeCents?: number | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('tele_schedule', {
      p_patient_id: input.patientId,
      p_doctor_name: input.doctorName,
      p_scheduled_at: input.scheduledAt,
      p_consult_type: input.consultType ?? 'first_consultation',
      p_doctor_staff_id: input.doctorStaffId ?? null,
      p_appointment_id: input.appointmentId ?? null,
      p_provider: input.provider ?? 'jitsi',
      p_duration_minutes: input.durationMinutes ?? 15,
      p_meeting_url: input.meetingUrl ?? null,
      p_meeting_id: input.meetingId ?? null,
      p_patient_join_url: input.patientJoinUrl ?? null,
      p_doctor_join_url: input.doctorJoinUrl ?? null,
      p_passcode: input.passcode ?? null,
      p_fee_cents: input.feeCents ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async recordConsent(id: string): Promise<void> {
    const { error } = await this.db.rpc('tele_record_consent', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async patientJoin(id: string): Promise<void> {
    const { error } = await this.db.rpc('tele_patient_join', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async doctorStart(id: string): Promise<void> {
    const { error } = await this.db.rpc('tele_doctor_start', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async end(input: {
    id: string;
    consultationNotes?: string | null;
    qualityScore?: number | null;
    recordingUrl?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('tele_end', {
      p_id: input.id,
      p_consultation_notes: input.consultationNotes ?? null,
      p_quality_score: input.qualityScore ?? null,
      p_recording_url: input.recordingUrl ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async cancel(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('tele_cancel', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async noShow(id: string): Promise<void> {
    const { error } = await this.db.rpc('tele_no_show', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
