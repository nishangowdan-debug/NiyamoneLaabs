import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { PacEvaluation, PacStatus } from './pac.types';

@Injectable({ providedIn: 'root' })
export class PacService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: PacStatus; patientId?: string } = {}): Promise<PacEvaluation[]> {
    let q = this.db.from('pac_evaluations').select('*').order('evaluation_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PacEvaluation[];
  }

  async get(id: string): Promise<PacEvaluation> {
    const { data, error } = await this.db.from('pac_evaluations').select('*').eq('id', id).single();
    if (error) throw error;
    return data as PacEvaluation;
  }

  async createDraft(input: {
    patientId: string;
    plannedProcedureName: string;
    anaesthetistName: string;
    asaGrade: string;
    admissionId?: string | null;
    encounterId?: string | null;
    plannedProcedureId?: string | null;
    plannedSurgeryAt?: string | null;
    otBookingId?: string | null;
    anaesthetistId?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('pac_create_draft', {
      p_patient_id:            input.patientId,
      p_planned_procedure_name: input.plannedProcedureName,
      p_anaesthetist_name:     input.anaesthetistName,
      p_asa_grade:             input.asaGrade,
      p_admission_id:          input.admissionId ?? null,
      p_encounter_id:          input.encounterId ?? null,
      p_planned_procedure_id:  input.plannedProcedureId ?? null,
      p_planned_surgery_at:    input.plannedSurgeryAt ?? null,
      p_ot_booking_id:         input.otBookingId ?? null,
      p_anaesthetist_id:       input.anaesthetistId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create PAC draft');
    return data as string;
  }

  async save(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('pac_save', { p_id: id, p_patch: patch });
    if (error) throw new Error(error.message ?? 'Failed to save');
  }

  async finalise(id: string, signedByDoctorName: string, signedByDoctorId?: string | null): Promise<void> {
    const { error } = await this.db.rpc('pac_finalise', {
      p_id: id,
      p_signed_by_doctor_name: signedByDoctorName,
      p_signed_by_doctor_id: signedByDoctorId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to finalise');
  }

  async amend(id: string, reason: string, byName: string): Promise<void> {
    const { error } = await this.db.rpc('pac_amend', {
      p_id: id, p_amendment_reason: reason, p_amendment_by_name: byName,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async cancel(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('pac_cancel', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
