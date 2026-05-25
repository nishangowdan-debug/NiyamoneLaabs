export type FitnessStatus = 'fit' | 'fit_with_restrictions' | 'unfit' | 'pending_evaluation';
export type ImmunizationStatus = 'scheduled' | 'given' | 'refused' | 'contraindicated' | 'deferred' | 'partial';
export type ExposureType =
  | 'needlestick' | 'sharps' | 'splash_eyes' | 'splash_mucous'
  | 'splash_skin' | 'contact_blood' | 'contact_body_fluid'
  | 'tb_exposure' | 'covid_exposure' | 'other';
export type ExposureStatus =
  | 'reported' | 'assessment_done' | 'prophylaxis_started'
  | 'follow_up' | 'closed' | 'transferred';
export type HealthCheckType =
  | 'pre_employment' | 'annual' | 'periodic' | 'post_exposure'
  | 'return_to_work' | 'fitness_for_duty';

export const FITNESS_LABELS: Record<FitnessStatus, string> = {
  fit: 'Fit', fit_with_restrictions: 'Fit (with restrictions)',
  unfit: 'Unfit', pending_evaluation: 'Pending evaluation',
};

export const EXPOSURE_TYPE_LABELS: Record<ExposureType, string> = {
  needlestick: 'Needlestick', sharps: 'Sharps injury',
  splash_eyes: 'Splash to eyes', splash_mucous: 'Splash to mucous membrane',
  splash_skin: 'Splash to skin (broken)', contact_blood: 'Contact with blood',
  contact_body_fluid: 'Contact with body fluid',
  tb_exposure: 'TB exposure', covid_exposure: 'COVID exposure', other: 'Other',
};

export const EXPOSURE_STATUS_LABELS: Record<ExposureStatus, string> = {
  reported: 'Reported', assessment_done: 'Assessment Done',
  prophylaxis_started: 'PEP Started', follow_up: 'Follow-up',
  closed: 'Closed', transferred: 'Transferred',
};

export const CHECK_TYPE_LABELS: Record<HealthCheckType, string> = {
  pre_employment: 'Pre-Employment', annual: 'Annual',
  periodic: 'Periodic', post_exposure: 'Post-Exposure',
  return_to_work: 'Return to Work', fitness_for_duty: 'Fitness for Duty',
};

// Standard healthcare worker vaccines (NABH HIC)
export const STANDARD_VACCINES = [
  { code: 'HEP_B_1', name: 'Hepatitis B — Dose 1', total: 3 },
  { code: 'HEP_B_2', name: 'Hepatitis B — Dose 2', total: 3 },
  { code: 'HEP_B_3', name: 'Hepatitis B — Dose 3', total: 3 },
  { code: 'TDAP',    name: 'Tetanus / Tdap (every 10y)', total: 1 },
  { code: 'MMR',     name: 'MMR', total: 2 },
  { code: 'VARI',    name: 'Varicella', total: 2 },
  { code: 'INF',     name: 'Influenza (annual)', total: 1 },
  { code: 'COV',     name: 'COVID-19', total: 3 },
  { code: 'TYP',     name: 'Typhoid', total: 1 },
];

export interface EmployeeHealthRecord {
  id: string;
  staff_id: string;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string[];
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  fitness_status: FitnessStatus;
  fitness_restrictions: string | null;
  last_check_at: string | null;
  next_check_due_at: string | null;
  occupational_health_doctor: string | null;
  notes: string | null;
}

export interface EmployeeImmunization {
  id: string;
  staff_id: string;
  vaccine_name: string;
  vaccine_code: string | null;
  dose_number: number | null;
  total_doses: number | null;
  given_at: string | null;
  given_by_name: string | null;
  manufacturer: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  next_dose_due_at: string | null;
  status: ImmunizationStatus;
  reaction_observed: boolean;
  reaction_notes: string | null;
  refusal_reason: string | null;
  certificate_no: string | null;
  notes: string | null;
  created_at: string;
}

export interface OccupationalExposure {
  id: string;
  exposure_no: string;
  staff_id: string;
  exposure_type: ExposureType;
  exposure_at: string;
  location: string | null;
  description: string;
  source_patient_id: string | null;
  source_known: boolean;
  source_hbv_status: string | null;
  source_hcv_status: string | null;
  source_hiv_status: string | null;
  device_involved: string | null;
  body_part: string | null;
  ppe_used: string[];
  immediate_action: string | null;
  worker_hbv_immune: boolean | null;
  worker_hbv_titre: number | null;
  pep_offered: boolean;
  pep_started_at: string | null;
  pep_regimen: string | null;
  pep_completed: boolean | null;
  counselled_at: string | null;
  counsellor_name: string | null;
  follow_up_6w_at: string | null;
  follow_up_3m_at: string | null;
  follow_up_6m_at: string | null;
  seroconversion_detected: boolean;
  status: ExposureStatus;
  closed_at: string | null;
  notes: string | null;
}

export interface EmployeeHealthCheck {
  id: string;
  staff_id: string;
  check_type: HealthCheckType;
  performed_at: string;
  performing_doctor: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  bp: string | null;
  pulse: number | null;
  cbc_summary: string | null;
  rft_summary: string | null;
  lft_summary: string | null;
  hbsag: string | null;
  hcv: string | null;
  hiv: string | null;
  tb_screening: string | null;
  ecg: string | null;
  cxr: string | null;
  fitness_status: FitnessStatus;
  restrictions: string | null;
  recommendations: string | null;
  next_due_date: string | null;
  certificate_no: string | null;
  notes: string | null;
}
