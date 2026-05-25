import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  HaiStatus, HaiType, HandHygieneAudit, InfectionEvent, IsolationPrecaution,
  IsolationType, OrganismClass, WhoMoment,
} from './infection-control.types';

@Injectable({ providedIn: 'root' })
export class InfectionControlService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── HAI ───────────────────────────────────────────────────────
  async listEvents(opts: { status?: HaiStatus; patientId?: string } = {}): Promise<InfectionEvent[]> {
    let q = this.db.from('infection_events').select('*').order('onset_date', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as InfectionEvent[];
  }

  async reportHai(input: {
    patientId: string; haiType: HaiType; onsetDate: string; reportedByName: string;
    admissionId?: string | null; encounterId?: string | null;
    edVisitId?: string | null; otRecordId?: string | null;
    customName?: string | null;
    sourceDevice?: string | null;
    deviceInsertedAt?: string | null;
    deviceRemovedAt?: string | null;
    causativeOrganism?: string | null;
    organismClass?: OrganismClass | null;
    resistance?: Record<string, unknown>;
    labResultId?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('hai_report', {
      p_patient_id:         input.patientId,
      p_hai_type:           input.haiType,
      p_onset_date:         input.onsetDate,
      p_reported_by_name:   input.reportedByName,
      p_admission_id:       input.admissionId ?? null,
      p_encounter_id:       input.encounterId ?? null,
      p_ed_visit_id:        input.edVisitId ?? null,
      p_ot_record_id:       input.otRecordId ?? null,
      p_custom_name:        input.customName ?? null,
      p_source_device:      input.sourceDevice ?? null,
      p_device_inserted_at: input.deviceInsertedAt ?? null,
      p_device_removed_at:  input.deviceRemovedAt ?? null,
      p_causative_organism: input.causativeOrganism ?? null,
      p_organism_class:     input.organismClass ?? null,
      p_resistance:         input.resistance ?? {},
      p_lab_result_id:      input.labResultId ?? null,
      p_notes:              input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to report HAI');
    return data as string;
  }

  async setHaiStatus(id: string, status: HaiStatus, rootCause?: string, correctiveActions?: string): Promise<void> {
    const { error } = await this.db.rpc('hai_set_status', {
      p_id: id, p_status: status,
      p_root_cause: rootCause ?? null,
      p_corrective_actions: correctiveActions ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Hand hygiene ──────────────────────────────────────────────
  async listAudits(opts: { from?: string } = {}): Promise<HandHygieneAudit[]> {
    let q = this.db.from('hand_hygiene_audits').select('*').order('audit_date', { ascending: false }).limit(500);
    if (opts.from) q = q.gte('audit_date', opts.from);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HandHygieneAudit[];
  }

  async logAudit(input: {
    location: string;
    opportunitiesTotal: number;
    opportunitiesComplied: number;
    auditedByName: string;
    auditDate?: string | null;
    wardId?: string | null;
    roleObserved?: string | null;
    method?: string;
    momentsObserved?: WhoMoment[];
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('hh_log_audit', {
      p_location:               input.location,
      p_opportunities_total:    input.opportunitiesTotal,
      p_opportunities_complied: input.opportunitiesComplied,
      p_audited_by_name:        input.auditedByName,
      p_audit_date:             input.auditDate ?? null,
      p_ward_id:                input.wardId ?? null,
      p_role_observed:          input.roleObserved ?? null,
      p_method:                 input.method ?? 'direct',
      p_moments_observed:       input.momentsObserved ?? [],
      p_notes:                  input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  // ── Isolation ─────────────────────────────────────────────────
  async listIsolations(activeOnly = false): Promise<IsolationPrecaution[]> {
    if (activeOnly) {
      const { data, error } = await this.db.from('v_active_isolations').select('*').order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as IsolationPrecaution[];
    }
    const { data, error } = await this.db.from('isolation_precautions')
      .select('*').order('started_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as IsolationPrecaution[];
  }

  async startIsolation(input: {
    patientId: string; isolationType: IsolationType; reason: string;
    admissionId?: string | null;
    organismSuspected?: string | null;
    orderedByDoctorName?: string | null;
    relatedInfectionId?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('isolation_start', {
      p_patient_id:    input.patientId,
      p_isolation_type: input.isolationType,
      p_reason:        input.reason,
      p_admission_id:  input.admissionId ?? null,
      p_organism_suspected: input.organismSuspected ?? null,
      p_ordered_by_doctor_name: input.orderedByDoctorName ?? null,
      p_related_infection_id: input.relatedInfectionId ?? null,
      p_notes:         input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async endIsolation(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('isolation_end', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
