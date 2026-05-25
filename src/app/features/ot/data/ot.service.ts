import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  AnesthesiaType, AsaGrade, ChecklistPhase, OtRecord, OtRecordStatus,
  OtTeamMember, OtTeamRole, SurgicalProcedure,
} from './ot.types';

@Injectable({ providedIn: 'root' })
export class OtService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listProcedures(): Promise<SurgicalProcedure[]> {
    const { data, error } = await this.db.from('surgical_procedures')
      .select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []) as SurgicalProcedure[];
  }

  async listRecords(opts: { status?: OtRecordStatus; patientId?: string; date?: string } = {}): Promise<OtRecord[]> {
    let q = this.db.from('ot_surgical_records').select('*')
      .order('scheduled_start', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    if (opts.date) {
      const start = new Date(opts.date + 'T00:00:00').toISOString();
      const end   = new Date(opts.date + 'T23:59:59').toISOString();
      q = q.gte('scheduled_start', start).lte('scheduled_start', end);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as OtRecord[];
  }

  async getRecord(id: string): Promise<OtRecord> {
    const { data, error } = await this.db.from('ot_surgical_records').select('*').eq('id', id).single();
    if (error) throw error;
    return data as OtRecord;
  }

  async createRecord(input: {
    patientId: string;
    procedureName: string;
    admissionId?: string | null;
    encounterId?: string | null;
    otBookingId?: string | null;
    procedureId?: string | null;
    otRoom?: string | null;
    primarySurgeonName?: string | null;
    anesthetistName?: string | null;
    asaGrade?: AsaGrade | null;
    anesthesiaType?: AnesthesiaType | null;
    preOpDiagnosis?: string | null;
    scheduledStart?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('ot_create_record', {
      p_patient_id:        input.patientId,
      p_procedure_name:    input.procedureName,
      p_admission_id:      input.admissionId ?? null,
      p_encounter_id:      input.encounterId ?? null,
      p_ot_booking_id:     input.otBookingId ?? null,
      p_procedure_id:      input.procedureId ?? null,
      p_ot_room:           input.otRoom ?? null,
      p_primary_surgeon_name: input.primarySurgeonName ?? null,
      p_anesthetist_name:  input.anesthetistName ?? null,
      p_asa_grade:         input.asaGrade ?? null,
      p_anesthesia_type:   input.anesthesiaType ?? null,
      p_pre_op_diagnosis:  input.preOpDiagnosis ?? null,
      p_scheduled_start:   input.scheduledStart ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create OT record');
    return data as string;
  }

  async listTeam(recordId: string): Promise<OtTeamMember[]> {
    const { data, error } = await this.db.from('ot_team_members')
      .select('*').eq('record_id', recordId).order('joined_at');
    if (error) throw error;
    return (data ?? []) as OtTeamMember[];
  }
  async addTeam(input: { recordId: string; staffName: string; role: OtTeamRole; notes?: string }): Promise<string> {
    const { data, error } = await this.db.rpc('ot_add_team_member', {
      p_record_id: input.recordId, p_staff_name: input.staffName,
      p_role: input.role, p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async saveChecklist(input: {
    recordId: string; phase: ChecklistPhase;
    items: { key: string; checked: boolean }[];
    completedByName?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('ot_save_checklist', {
      p_record_id: input.recordId,
      p_phase: input.phase,
      p_items: input.items,
      p_completed_by_name: input.completedByName ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async setMilestone(input: {
    recordId: string;
    anesthesiaStart?: string;
    incisionAt?: string;
    closureAt?: string;
    anesthesiaEnd?: string;
    actualStart?: string;
    actualEnd?: string;
  }): Promise<void> {
    const { error } = await this.db.rpc('ot_set_milestone', {
      p_record_id: input.recordId,
      p_anesthesia_start: input.anesthesiaStart ?? null,
      p_incision_at:      input.incisionAt ?? null,
      p_closure_at:       input.closureAt ?? null,
      p_anesthesia_end:   input.anesthesiaEnd ?? null,
      p_actual_start:     input.actualStart ?? null,
      p_actual_end:       input.actualEnd ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async appendImplant(recordId: string, implant: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('ot_append_implant', { p_record_id: recordId, p_implant: implant });
    if (error) throw new Error(error.message ?? 'Failed');
  }
  async appendSpecimen(recordId: string, specimen: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('ot_append_specimen', { p_record_id: recordId, p_specimen: specimen });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async completeRecord(input: {
    recordId: string;
    postOpDiagnosis: string;
    procedurePerformed: string;
    operativeFindings?: string | null;
    complications?: string | null;
    bloodLossMl?: number | null;
    spongeCountCorrect?: boolean | null;
    needleCountCorrect?: boolean | null;
    instrumentCountCorrect?: boolean | null;
    debriefNotes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('ot_complete_record', {
      p_record_id: input.recordId,
      p_post_op_diagnosis: input.postOpDiagnosis,
      p_procedure_performed: input.procedurePerformed,
      p_operative_findings: input.operativeFindings ?? null,
      p_complications: input.complications ?? null,
      p_blood_loss_ml: input.bloodLossMl ?? null,
      p_sponge_count_correct: input.spongeCountCorrect ?? null,
      p_needle_count_correct: input.needleCountCorrect ?? null,
      p_instrument_count_correct: input.instrumentCountCorrect ?? null,
      p_debrief_notes: input.debriefNotes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to complete record');
  }

  async cancelRecord(recordId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('ot_cancel_record', { p_record_id: recordId, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
