export type EdArrivalMode =
  | 'walk_in' | 'ambulance' | 'police' | 'transferred'
  | 'helicopter' | 'self_transport' | 'other';

export type EdTreatmentArea =
  | 'resus' | 'acute' | 'fast_track' | 'observation' | 'waiting' | 'isolation' | 'peds';

export type EdVisitStatus =
  | 'waiting' | 'triaged' | 'in_treatment' | 'disposition_pending'
  | 'closed' | 'cancelled' | 'lwbs';

export type EdDisposition =
  | 'admitted' | 'discharged' | 'transferred' | 'dama' | 'lwbs'
  | 'deceased' | 'referred' | 'pending';

export const ARRIVAL_LABELS: Record<EdArrivalMode, string> = {
  walk_in: 'Walk-in', ambulance: 'Ambulance', police: 'Police',
  transferred: 'Transferred', helicopter: 'Helicopter',
  self_transport: 'Self-transport', other: 'Other',
};

export const AREA_LABELS: Record<EdTreatmentArea, string> = {
  resus: 'Resuscitation', acute: 'Acute', fast_track: 'Fast Track',
  observation: 'Observation', waiting: 'Waiting', isolation: 'Isolation', peds: 'Paediatric',
};

export const DISPOSITION_LABELS: Record<EdDisposition, string> = {
  admitted: 'Admitted', discharged: 'Discharged', transferred: 'Transferred',
  dama: 'DAMA', lwbs: 'Left without being seen', deceased: 'Deceased',
  referred: 'Referred', pending: 'Pending',
};

export const ESI_COLORS: Record<number, { bg: string; label: string; description: string }> = {
  1: { bg: 'bg-danger-fg',  label: '1 - Resus',     description: 'Immediate life-saving intervention required' },
  2: { bg: 'bg-warn-fg',    label: '2 - Emergent',  description: 'High risk; severe pain/distress; vitals in danger zone' },
  3: { bg: 'bg-amber-500',  label: '3 - Urgent',    description: 'Many resources expected (≥2)' },
  4: { bg: 'bg-good-fg',    label: '4 - Less Urgent', description: 'One resource expected' },
  5: { bg: 'bg-blue-500',   label: '5 - Non-urgent', description: 'No resources expected' },
};

// Possible resource types per ESI 5-level guidance
export const ED_RESOURCE_OPTIONS = [
  { key: 'lab',       label: 'Lab tests' },
  { key: 'ecg',       label: 'ECG' },
  { key: 'xray',      label: 'X-ray' },
  { key: 'ct',        label: 'CT scan' },
  { key: 'us',        label: 'Ultrasound' },
  { key: 'mri',       label: 'MRI' },
  { key: 'iv_fluid',  label: 'IV fluids' },
  { key: 'iv_med',    label: 'IV medication' },
  { key: 'im_med',    label: 'IM medication' },
  { key: 'neb',       label: 'Nebulisation' },
  { key: 'procedure', label: 'Simple procedure (suture, foley, etc.)' },
  { key: 'consult',   label: 'Specialty consultation' },
];

export const ED_HIGH_RISK_OPTIONS = [
  'altered_mental_status','severe_pain_8plus','active_bleeding','severe_resp_distress',
  'chest_pain_cardiac','stroke_symptoms','sepsis_suspected','suicidal_homicidal',
  'pregnancy_with_bleeding','pediatric_under_3m_with_fever','immunocompromised',
];

export const ED_CRITICAL_INTERVENTIONS = [
  'cpr','intubation','defibrillation','transcutaneous_pacing',
  'major_blood_transfusion','iv_pressors','iv_thrombolytics','iv_naloxone_dextrose',
  'emergent_dialysis','chest_tube',
];

export interface EdVisit {
  id: string;
  visit_no: string;
  patient_id: string | null;
  walk_in_name: string | null;
  walk_in_age: number | null;
  walk_in_gender: string | null;
  walk_in_mobile: string | null;
  arrived_at: string;
  arrival_mode: EdArrivalMode;
  chief_complaint: string;
  triage_at: string | null;
  triaged_by_name: string | null;
  esi_level: number | null;
  vitals_at_triage: Record<string, unknown> | null;
  resources_anticipated: string[];
  resource_count: number;
  critical_interventions: string[];
  high_risk_factors: string[];
  vital_signs_danger_zone: boolean;
  pain_score: number | null;
  triage_notes: string | null;
  treatment_area: EdTreatmentArea;
  assigned_doctor_staff_id: string | null;
  first_provider_seen_at: string | null;
  disposition: EdDisposition;
  disposition_at: string | null;
  disposition_to_admission_id: string | null;
  disposition_to_facility: string | null;
  dama_reason: string | null;
  lwbs_at: string | null;
  departed_at: string | null;
  status: EdVisitStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // From v_ed_active
  minutes_in_ed?: number;
  minutes_since_triage?: number;
}

export interface EdReassessment {
  id: string;
  visit_id: string;
  reassessed_at: string;
  reassessed_by_name: string | null;
  vitals: Record<string, unknown> | null;
  pain_score: number | null;
  esi_level_new: number | null;
  notes: string | null;
}
