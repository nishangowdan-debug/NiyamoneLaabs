import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  AdrAction, AdrCausality, AdrDechallenge, AdrOutcome, AdrReport,
  AllergenType, AllergyMatchHit, AllergySeverity, AllergySource, AllergyStatus,
  PatientAllergy,
} from './allergies.types';

@Injectable({ providedIn: 'root' })
export class AllergiesService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Allergies ─────────────────────────────────────────────────
  async listAllergies(opts: { patientId?: string; activeOnly?: boolean } = {}): Promise<PatientAllergy[]> {
    let q = this.db.from('patient_allergies').select('*').order('created_at', { ascending: false }).limit(2000);
    if (opts.patientId)  q = q.eq('patient_id', opts.patientId);
    if (opts.activeOnly) q = q.eq('status', 'active');
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PatientAllergy[];
  }

  async addAllergy(input: {
    patientId: string;
    allergenName: string;
    severity: AllergySeverity;
    allergenType?: AllergenType;
    reactionType?: string | null;
    reactionDescription?: string | null;
    genericDrugName?: string | null;
    onsetDate?: string | null;
    source?: AllergySource;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('add_patient_allergy', {
      p_patient_id: input.patientId,
      p_allergen_name: input.allergenName,
      p_severity: input.severity,
      p_allergen_type: input.allergenType ?? 'drug',
      p_reaction_type: input.reactionType ?? null,
      p_reaction_description: input.reactionDescription ?? null,
      p_generic_drug_name: input.genericDrugName ?? null,
      p_onset_date: input.onsetDate ?? null,
      p_source: input.source ?? 'patient_reported',
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to add allergy');
    return data as string;
  }

  async updateStatus(id: string, status: AllergyStatus, notes?: string | null): Promise<void> {
    const { error } = await this.db.rpc('update_allergy_status', {
      p_allergy_id: id, p_status: status, p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async checkDrugAllergy(patientId: string, drugName: string): Promise<AllergyMatchHit[]> {
    const { data, error } = await this.db.rpc('check_drug_allergy', {
      p_patient_id: patientId, p_drug_name: drugName,
    });
    if (error) throw error;
    return (data ?? []) as AllergyMatchHit[];
  }

  // ── ADR ───────────────────────────────────────────────────────
  async listAdrs(opts: { patientId?: string; pvpiPending?: boolean } = {}): Promise<AdrReport[]> {
    let q = this.db.from('adverse_drug_reactions').select('*').order('created_at', { ascending: false }).limit(1000);
    if (opts.patientId)   q = q.eq('patient_id', opts.patientId);
    if (opts.pvpiPending) q = q.eq('reported_to_pvpi', false);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AdrReport[];
  }

  async reportAdr(input: {
    patientId: string;
    drugName: string;
    reactionDescription: string;
    reporterName: string;
    admissionId?: string | null;
    encounterId?: string | null;
    genericDrugName?: string | null;
    manufacturer?: string | null;
    batchNo?: string | null;
    route?: string | null;
    dose?: string | null;
    startDrugAt?: string | null;
    stopDrugAt?: string | null;
    reactionStartedAt?: string | null;
    reactionEndedAt?: string | null;
    ctcaeGrade?: number | null;
    isSerious?: boolean;
    seriousnessCriteria?: string[];
    causality?: AdrCausality;
    outcome?: AdrOutcome;
    actionTaken?: AdrAction | null;
    dechallenge?: AdrDechallenge | null;
    rechallenge?: AdrDechallenge | null;
    concomitantMeds?: string | null;
    relevantHistory?: string | null;
    reporterDesignation?: string | null;
    autoCreateAllergy?: boolean;
    notes?: string | null;
  }): Promise<{ id: string; patient_allergy_id: string | null }> {
    const { data, error } = await this.db.rpc('report_adr', {
      p_patient_id: input.patientId,
      p_drug_name: input.drugName,
      p_reaction_description: input.reactionDescription,
      p_reporter_name: input.reporterName,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_generic_drug_name: input.genericDrugName ?? null,
      p_manufacturer: input.manufacturer ?? null,
      p_batch_no: input.batchNo ?? null,
      p_route: input.route ?? null,
      p_dose: input.dose ?? null,
      p_start_drug_at: input.startDrugAt ?? null,
      p_stop_drug_at: input.stopDrugAt ?? null,
      p_reaction_started_at: input.reactionStartedAt ?? null,
      p_reaction_ended_at: input.reactionEndedAt ?? null,
      p_ctcae_grade: input.ctcaeGrade ?? null,
      p_is_serious: input.isSerious ?? false,
      p_seriousness_criteria: input.seriousnessCriteria ?? [],
      p_causality: input.causality ?? 'possible',
      p_outcome: input.outcome ?? 'unknown',
      p_action_taken: input.actionTaken ?? null,
      p_dechallenge: input.dechallenge ?? null,
      p_rechallenge: input.rechallenge ?? null,
      p_concomitant_meds: input.concomitantMeds ?? null,
      p_relevant_history: input.relevantHistory ?? null,
      p_reporter_designation: input.reporterDesignation ?? null,
      p_auto_create_allergy: input.autoCreateAllergy ?? true,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to report ADR');
    return data as { id: string; patient_allergy_id: string | null };
  }

  async markPvpiReported(id: string, reportNo: string, reportedAt?: string): Promise<void> {
    const { error } = await this.db.rpc('adr_mark_pvpi_reported', {
      p_id: id, p_pvpi_report_no: reportNo, p_reported_at: reportedAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async markPvpiAcknowledged(id: string): Promise<void> {
    const { error } = await this.db.rpc('adr_mark_pvpi_acknowledged', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
