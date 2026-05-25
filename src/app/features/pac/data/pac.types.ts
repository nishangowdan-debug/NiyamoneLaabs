export type PacStatus = 'draft' | 'final' | 'amended' | 'cancelled';
export type MallampatiClass = 'I' | 'II' | 'III' | 'IV';
export type NeckMobility = 'full' | 'limited' | 'restricted';
export type DentitionStatus = 'intact' | 'loose' | 'dentures' | 'partially_missing' | 'edentulous';
export type PregnancyStatus = 'not_applicable' | 'pregnant' | 'possibly_pregnant' | 'not_pregnant';
export type PostopDisposition = 'ward' | 'hdu' | 'icu' | 'pacu_then_ward' | 'day_care_discharge';

export const PAC_STATUS_LABELS: Record<PacStatus, string> = {
  draft: 'Draft', final: 'Final', amended: 'Amended', cancelled: 'Cancelled',
};

export const COMORBIDITY_OPTIONS = [
  { key: 'htn',    label: 'Hypertension' },
  { key: 'dm',     label: 'Diabetes Mellitus' },
  { key: 'cad',    label: 'Coronary Artery Disease' },
  { key: 'chf',    label: 'Heart Failure' },
  { key: 'arrhythmia', label: 'Arrhythmia' },
  { key: 'copd',   label: 'COPD' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'osa',    label: 'Obstructive Sleep Apnea' },
  { key: 'ckd',    label: 'Chronic Kidney Disease' },
  { key: 'liver',  label: 'Liver Disease' },
  { key: 'cva',    label: 'Stroke / TIA' },
  { key: 'seizure',label: 'Seizure Disorder' },
  { key: 'thyroid',label: 'Thyroid Disorder' },
  { key: 'obesity',label: 'Obesity' },
  { key: 'cancer', label: 'Active Malignancy' },
  { key: 'psych',  label: 'Psychiatric Disorder' },
  { key: 'pregnancy', label: 'Pregnancy' },
  { key: 'bleeding_disorder', label: 'Bleeding Disorder' },
];

export interface PacEvaluation {
  id: string;
  evaluation_no: string;
  patient_id: string;
  admission_id: string | null;
  encounter_id: string | null;
  planned_procedure_id: string | null;
  planned_procedure_name: string;
  planned_surgery_at: string | null;
  ot_booking_id: string | null;
  ot_record_id: string | null;
  evaluation_at: string;
  anaesthetist_name: string;

  previous_surgeries: string | null;
  previous_anaesthesia: string | null;
  drug_history: string | null;
  allergies_summary: string | null;
  comorbidities: string[];
  recent_illness: string | null;
  family_history: string | null;
  smoking_status: string | null;
  alcohol_status: string | null;
  recreational_drug_use: string | null;
  pregnancy_status: PregnancyStatus | null;
  gestational_weeks: number | null;

  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  bp: string | null;
  pulse: number | null;
  spo2: number | null;
  temp_celsius: number | null;
  mallampati: MallampatiClass | null;
  mouth_opening_cm: number | null;
  thyromental_distance_cm: number | null;
  neck_mobility: NeckMobility | null;
  dentition: DentitionStatus | null;
  airway_concerns: string | null;
  cvs_exam: string | null;
  respiratory_exam: string | null;
  other_systems_exam: string | null;

  cbc_date: string | null;
  cbc_summary: string | null;
  rft_date: string | null;
  rft_summary: string | null;
  lft_date: string | null;
  lft_summary: string | null;
  ecg_date: string | null;
  ecg_summary: string | null;
  cxr_date: string | null;
  cxr_summary: string | null;
  other_investigations: string | null;
  blood_crossmatch_done: boolean;
  units_arranged: number | null;

  asa_grade: string;
  asa_modifiers: string | null;
  difficult_airway_anticipated: boolean;
  difficult_airway_plan: string | null;

  last_solid_at: string | null;
  last_clear_fluid_at: string | null;
  npo_compliance: boolean | null;

  planned_anaesthesia_type: string | null;
  premedication: string | null;
  special_precautions: string | null;
  postop_disposition: PostopDisposition | null;

  consent_anaesthesia_id: string | null;
  status: PacStatus;
  finalised_at: string | null;
  signed_by_doctor_name: string | null;
  amendments_log: { reason: string; by: string; at: string }[];
  cancelled_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
