import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  EdArrivalMode, EdDisposition, EdReassessment, EdTreatmentArea, EdVisit, EdVisitStatus,
} from './ed.types';

@Injectable({ providedIn: 'root' })
export class EdService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listActive(): Promise<EdVisit[]> {
    const { data, error } = await this.db.from('v_ed_active').select('*').order('arrived_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as EdVisit[];
  }

  async listAll(opts: { status?: EdVisitStatus; date?: string } = {}): Promise<EdVisit[]> {
    let q = this.db.from('ed_visits').select('*').order('arrived_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.date) {
      const start = new Date(opts.date + 'T00:00:00').toISOString();
      const end   = new Date(opts.date + 'T23:59:59').toISOString();
      q = q.gte('arrived_at', start).lte('arrived_at', end);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EdVisit[];
  }

  async getVisit(id: string): Promise<EdVisit> {
    const { data, error } = await this.db.from('ed_visits').select('*').eq('id', id).single();
    if (error) throw error;
    return data as EdVisit;
  }

  async listReassessments(visitId: string): Promise<EdReassessment[]> {
    const { data, error } = await this.db.from('ed_reassessments')
      .select('*').eq('visit_id', visitId).order('reassessed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EdReassessment[];
  }

  async registerArrival(input: {
    chiefComplaint: string;
    patientId?: string | null;
    walkInName?: string | null;
    walkInAge?: number | null;
    walkInGender?: 'male' | 'female' | 'other' | null;
    walkInMobile?: string | null;
    arrivalMode?: EdArrivalMode;
    arrivedAt?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('ed_register_arrival', {
      p_chief_complaint: input.chiefComplaint,
      p_patient_id:      input.patientId ?? null,
      p_walk_in_name:    input.walkInName ?? null,
      p_walk_in_age:     input.walkInAge ?? null,
      p_walk_in_gender:  input.walkInGender ?? null,
      p_walk_in_mobile:  input.walkInMobile ?? null,
      p_arrival_mode:    input.arrivalMode ?? 'walk_in',
      p_arrived_at:      input.arrivedAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to register arrival');
    return data as string;
  }

  async performTriage(input: {
    visitId: string;
    esiLevel: number;
    vitals?: Record<string, unknown>;
    resourcesAnticipated?: string[];
    criticalInterventions?: string[];
    highRiskFactors?: string[];
    vitalSignsDanger?: boolean;
    painScore?: number | null;
    triageNotes?: string | null;
    triagedByName?: string | null;
    treatmentArea?: EdTreatmentArea | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('ed_perform_triage', {
      p_visit_id:               input.visitId,
      p_esi_level:              input.esiLevel,
      p_vitals:                 input.vitals ?? {},
      p_resources_anticipated:  input.resourcesAnticipated ?? [],
      p_critical_interventions: input.criticalInterventions ?? [],
      p_high_risk_factors:      input.highRiskFactors ?? [],
      p_vital_signs_danger:     input.vitalSignsDanger ?? false,
      p_pain_score:             input.painScore ?? null,
      p_triage_notes:           input.triageNotes ?? null,
      p_triaged_by_name:        input.triagedByName ?? null,
      p_treatment_area:         input.treatmentArea ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to triage');
  }

  async assignTreatment(visitId: string, area: EdTreatmentArea, doctorId?: string | null): Promise<void> {
    const { error } = await this.db.rpc('ed_assign_treatment', {
      p_visit_id: visitId, p_treatment_area: area,
      p_assigned_doctor_id: doctorId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async firstProviderContact(visitId: string): Promise<void> {
    const { error } = await this.db.rpc('ed_first_provider_contact', { p_visit_id: visitId });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async reassess(input: {
    visitId: string;
    vitals?: Record<string, unknown>;
    painScore?: number | null;
    esiLevelNew?: number | null;
    reassessedByName?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('ed_reassess', {
      p_visit_id: input.visitId,
      p_vitals: input.vitals ?? {},
      p_pain_score: input.painScore ?? null,
      p_esi_level_new: input.esiLevelNew ?? null,
      p_reassessed_by_name: input.reassessedByName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async recordDisposition(input: {
    visitId: string;
    disposition: EdDisposition;
    toAdmissionId?: string | null;
    toFacility?: string | null;
    damaReason?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('ed_record_disposition', {
      p_visit_id:        input.visitId,
      p_disposition:     input.disposition,
      p_to_admission_id: input.toAdmissionId ?? null,
      p_to_facility:     input.toFacility ?? null,
      p_dama_reason:     input.damaReason ?? null,
      p_notes:           input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
