export type RiskBand = 'low' | 'moderate' | 'high' | 'very_high';

export const BAND_LABELS: Record<RiskBand, string> = {
  low: 'Low', moderate: 'Moderate', high: 'High', very_high: 'Very High',
};

export interface FallRiskAssessment {
  id: string;
  patient_id: string;
  admission_id: string | null;
  assessed_at: string;
  history_of_falling: number | null;
  secondary_diagnosis: number | null;
  ambulatory_aid: number | null;
  iv_or_heparin_lock: number | null;
  gait: number | null;
  mental_status: number | null;
  total_score: number | null;
  risk_band: RiskBand | null;
  interventions: string[];
  yellow_band_applied: boolean;
  patient_educated: boolean;
  reassessment_due_at: string | null;
  performed_by_name: string;
  notes: string | null;
}

export interface VteRiskAssessment {
  id: string;
  patient_id: string;
  admission_id: string | null;
  assessed_at: string;
  active_cancer: boolean;
  prior_vte: boolean;
  reduced_mobility: boolean;
  thrombophilia: boolean;
  recent_trauma_surgery: boolean;
  age_70_plus: boolean;
  heart_resp_failure: boolean;
  acute_mi_stroke: boolean;
  acute_infection: boolean;
  obesity_bmi_30: boolean;
  hormonal_treatment: boolean;
  total_score: number | null;
  risk_band: RiskBand | null;
  bleeding_risk_high: boolean;
  prophylaxis_recommended: string | null;
  prophylaxis_started: boolean;
  prophylaxis_drug: string | null;
  prophylaxis_dose: string | null;
  performed_by_name: string;
  notes: string | null;
}

export interface PressureRiskAssessment {
  id: string;
  patient_id: string;
  admission_id: string | null;
  assessed_at: string;
  sensory_perception: number | null;
  moisture: number | null;
  activity: number | null;
  mobility: number | null;
  nutrition: number | null;
  friction_shear: number | null;
  total_score: number | null;
  risk_band: RiskBand | null;
  existing_pressure_injury: boolean;
  injury_stage: string | null;
  injury_location: string | null;
  turning_schedule_min: number | null;
  pressure_relief_devices: string[];
  performed_by_name: string;
  notes: string | null;
}
