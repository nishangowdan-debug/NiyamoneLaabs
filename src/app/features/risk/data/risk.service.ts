import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  FallRiskAssessment, PressureRiskAssessment, VteRiskAssessment,
} from './risk.types';

@Injectable({ providedIn: 'root' })
export class RiskService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Fall ──────────────────────────────────────────────────────
  async listFall(patientId?: string): Promise<FallRiskAssessment[]> {
    let q = this.db.from('fall_risk_assessments').select('*').order('assessed_at', { ascending: false }).limit(200);
    if (patientId) q = q.eq('patient_id', patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FallRiskAssessment[];
  }

  async assessFall(input: {
    patientId: string;
    historyOfFalling: number;
    secondaryDiagnosis: number;
    ambulatoryAid: number;
    ivOrHeparinLock: number;
    gait: number;
    mentalStatus: number;
    performedByName: string;
    admissionId?: string | null;
    interventions?: string[];
    yellowBandApplied?: boolean;
    patientEducated?: boolean;
    reassessmentDueAt?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('fall_risk_assess', {
      p_patient_id: input.patientId,
      p_history_of_falling: input.historyOfFalling,
      p_secondary_diagnosis: input.secondaryDiagnosis,
      p_ambulatory_aid: input.ambulatoryAid,
      p_iv_or_heparin_lock: input.ivOrHeparinLock,
      p_gait: input.gait,
      p_mental_status: input.mentalStatus,
      p_performed_by_name: input.performedByName,
      p_admission_id: input.admissionId ?? null,
      p_interventions: input.interventions ?? [],
      p_yellow_band_applied: input.yellowBandApplied ?? false,
      p_patient_educated: input.patientEducated ?? false,
      p_reassessment_due_at: input.reassessmentDueAt ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  // ── VTE ───────────────────────────────────────────────────────
  async listVte(patientId?: string): Promise<VteRiskAssessment[]> {
    let q = this.db.from('vte_risk_assessments').select('*').order('assessed_at', { ascending: false }).limit(200);
    if (patientId) q = q.eq('patient_id', patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as VteRiskAssessment[];
  }

  async assessVte(input: {
    patientId: string;
    performedByName: string;
    admissionId?: string | null;
    activeCancer?: boolean;
    priorVte?: boolean;
    reducedMobility?: boolean;
    thrombophilia?: boolean;
    recentTraumaSurgery?: boolean;
    age70Plus?: boolean;
    heartRespFailure?: boolean;
    acuteMiStroke?: boolean;
    acuteInfection?: boolean;
    obesityBmi30?: boolean;
    hormonalTreatment?: boolean;
    bleedingRiskHigh?: boolean;
    prophylaxisRecommended?: string | null;
    prophylaxisStarted?: boolean;
    prophylaxisDrug?: string | null;
    prophylaxisDose?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('vte_risk_assess', {
      p_patient_id: input.patientId,
      p_performed_by_name: input.performedByName,
      p_admission_id: input.admissionId ?? null,
      p_active_cancer: input.activeCancer ?? false,
      p_prior_vte: input.priorVte ?? false,
      p_reduced_mobility: input.reducedMobility ?? false,
      p_thrombophilia: input.thrombophilia ?? false,
      p_recent_trauma_surgery: input.recentTraumaSurgery ?? false,
      p_age_70_plus: input.age70Plus ?? false,
      p_heart_resp_failure: input.heartRespFailure ?? false,
      p_acute_mi_stroke: input.acuteMiStroke ?? false,
      p_acute_infection: input.acuteInfection ?? false,
      p_obesity_bmi_30: input.obesityBmi30 ?? false,
      p_hormonal_treatment: input.hormonalTreatment ?? false,
      p_bleeding_risk_high: input.bleedingRiskHigh ?? false,
      p_prophylaxis_recommended: input.prophylaxisRecommended ?? null,
      p_prophylaxis_started: input.prophylaxisStarted ?? false,
      p_prophylaxis_drug: input.prophylaxisDrug ?? null,
      p_prophylaxis_dose: input.prophylaxisDose ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  // ── Pressure ──────────────────────────────────────────────────
  async listPressure(patientId?: string): Promise<PressureRiskAssessment[]> {
    let q = this.db.from('pressure_risk_assessments').select('*').order('assessed_at', { ascending: false }).limit(200);
    if (patientId) q = q.eq('patient_id', patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PressureRiskAssessment[];
  }

  async assessPressure(input: {
    patientId: string;
    sensoryPerception: number;
    moisture: number;
    activity: number;
    mobility: number;
    nutrition: number;
    frictionShear: number;
    performedByName: string;
    admissionId?: string | null;
    existingPressureInjury?: boolean;
    injuryStage?: string | null;
    injuryLocation?: string | null;
    turningScheduleMin?: number;
    pressureReliefDevices?: string[];
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('pressure_risk_assess', {
      p_patient_id: input.patientId,
      p_sensory_perception: input.sensoryPerception,
      p_moisture: input.moisture,
      p_activity: input.activity,
      p_mobility: input.mobility,
      p_nutrition: input.nutrition,
      p_friction_shear: input.frictionShear,
      p_performed_by_name: input.performedByName,
      p_admission_id: input.admissionId ?? null,
      p_existing_pressure_injury: input.existingPressureInjury ?? false,
      p_injury_stage: input.injuryStage ?? null,
      p_injury_location: input.injuryLocation ?? null,
      p_turning_schedule_min: input.turningScheduleMin ?? 120,
      p_pressure_relief_devices: input.pressureReliefDevices ?? [],
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }
}
