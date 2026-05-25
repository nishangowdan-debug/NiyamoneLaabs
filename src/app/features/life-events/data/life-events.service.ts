import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  BirthMethod, BirthOutcome, BirthRecord, DeathRecord,
  MannerOfDeath, PendingDeathCertificate,
} from './life-events.types';

@Injectable({ providedIn: 'root' })
export class LifeEventsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Births ────────────────────────────────────────────────────
  async listBirths(): Promise<BirthRecord[]> {
    const { data, error } = await this.db.from('birth_records')
      .select('*').order('born_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as BirthRecord[];
  }

  async createBirth(input: {
    motherPatientId: string;
    bornAt: string;
    sex: 'male' | 'female' | 'other' | 'indeterminate';
    attendingDoctorName: string;
    birthOutcome?: BirthOutcome;
    motherAdmissionId?: string | null;
    otRecordId?: string | null;
    birthWeightG?: number | null;
    gestationalWeeks?: number | null;
    gestationalDays?: number | null;
    method?: BirthMethod | null;
    apgar1?: number | null;
    apgar5?: number | null;
    apgar10?: number | null;
    newbornFirstName?: string | null;
    newbornLastName?: string | null;
    attendingNurseName?: string | null;
    fatherName?: string | null;
    multipleBirth?: boolean;
    birthOrder?: number | null;
    placeOfBirth?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('birth_create', {
      p_mother_patient_id: input.motherPatientId,
      p_born_at: input.bornAt,
      p_sex: input.sex,
      p_attending_doctor_name: input.attendingDoctorName,
      p_birth_outcome: input.birthOutcome ?? 'live_birth',
      p_mother_admission_id: input.motherAdmissionId ?? null,
      p_ot_record_id: input.otRecordId ?? null,
      p_birth_weight_g: input.birthWeightG ?? null,
      p_gestational_weeks: input.gestationalWeeks ?? null,
      p_gestational_days: input.gestationalDays ?? null,
      p_method: input.method ?? null,
      p_apgar_1min: input.apgar1 ?? null,
      p_apgar_5min: input.apgar5 ?? null,
      p_apgar_10min: input.apgar10 ?? null,
      p_newborn_first_name: input.newbornFirstName ?? null,
      p_newborn_last_name: input.newbornLastName ?? null,
      p_attending_nurse_name: input.attendingNurseName ?? null,
      p_father_name: input.fatherName ?? null,
      p_multiple_birth: input.multipleBirth ?? false,
      p_birth_order: input.birthOrder ?? null,
      p_place_of_birth: input.placeOfBirth ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to register birth');
    return data as string;
  }

  async setBirthMunicipality(id: string, municipalityNo: string, registeredAt?: string): Promise<void> {
    const { error } = await this.db.rpc('birth_set_municipality', {
      p_id: id, p_municipality_no: municipalityNo, p_registered_at: registeredAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Deaths ────────────────────────────────────────────────────
  async listDeaths(): Promise<DeathRecord[]> {
    const { data, error } = await this.db.from('death_records')
      .select('*').order('died_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as DeathRecord[];
  }

  async listPendingCertificates(): Promise<PendingDeathCertificate[]> {
    const { data, error } = await this.db.from('v_deaths_pending_certificate')
      .select('*').order('days_since_death', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PendingDeathCertificate[];
  }

  async createDeath(input: {
    deceasedPatientId: string;
    diedAt: string;
    pronouncedByDoctorName: string;
    causeImmediateText: string;
    causeUnderlyingText: string;
    admissionId?: string | null;
    encounterId?: string | null;
    edVisitId?: string | null;
    codeBlueEventId?: string | null;
    pronouncedAt?: string | null;
    placeOfDeath?: string | null;
    wardId?: string | null;
    bedId?: string | null;
    mannerOfDeath?: MannerOfDeath;
    causeImmediateIcd10?: string | null;
    causeImmediateDuration?: string | null;
    causeAntecedentText?: string | null;
    causeAntecedentIcd10?: string | null;
    causeAntecedentDuration?: string | null;
    causeUnderlyingIcd10?: string | null;
    causeUnderlyingDuration?: string | null;
    otherConditions?: string | null;
    autopsyPerformed?: boolean;
    isMlc?: boolean;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('death_create', {
      p_deceased_patient_id: input.deceasedPatientId,
      p_died_at: input.diedAt,
      p_pronounced_by_doctor_name: input.pronouncedByDoctorName,
      p_cause_immediate_text: input.causeImmediateText,
      p_cause_underlying_text: input.causeUnderlyingText,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_ed_visit_id: input.edVisitId ?? null,
      p_code_blue_event_id: input.codeBlueEventId ?? null,
      p_pronounced_at: input.pronouncedAt ?? null,
      p_place_of_death: input.placeOfDeath ?? null,
      p_ward_id: input.wardId ?? null,
      p_bed_id: input.bedId ?? null,
      p_manner_of_death: input.mannerOfDeath ?? 'natural',
      p_cause_immediate_icd10: input.causeImmediateIcd10 ?? null,
      p_cause_immediate_duration: input.causeImmediateDuration ?? null,
      p_cause_antecedent_text: input.causeAntecedentText ?? null,
      p_cause_antecedent_icd10: input.causeAntecedentIcd10 ?? null,
      p_cause_antecedent_duration: input.causeAntecedentDuration ?? null,
      p_cause_underlying_icd10: input.causeUnderlyingIcd10 ?? null,
      p_cause_underlying_duration: input.causeUnderlyingDuration ?? null,
      p_other_conditions: input.otherConditions ?? null,
      p_autopsy_performed: input.autopsyPerformed ?? false,
      p_is_mlc: input.isMlc ?? false,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to register death');
    return data as string;
  }

  async setDeathMunicipality(id: string, municipalityNo: string, registeredAt?: string): Promise<void> {
    const { error } = await this.db.rpc('death_set_municipality', {
      p_id: id, p_municipality_no: municipalityNo, p_registered_at: registeredAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async releaseBody(id: string, toName: string, relation: string, idProof?: string): Promise<void> {
    const { error } = await this.db.rpc('death_release_body', {
      p_id: id, p_to_name: toName, p_to_relation: relation, p_id_proof: idProof ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
