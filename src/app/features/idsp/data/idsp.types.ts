export type DiseasePriority = 'immediate' | '24_hour' | 'weekly' | 'monthly';
export type CaseClassification = 'suspected' | 'probable' | 'confirmed' | 'ruled_out';
export type NotificationStatus =
  | 'draft' | 'reported_internally' | 'submitted_to_idsp'
  | 'acknowledged' | 'closed' | 'withdrawn';
export type DiseaseOutcome =
  | 'alive_recovered' | 'alive_under_treatment' | 'discharged'
  | 'transferred' | 'deceased' | 'lost_to_followup' | 'unknown';

export const PRIORITY_LABELS: Record<DiseasePriority, string> = {
  immediate: 'Immediate (within 24h)', '24_hour': 'Within 24 hours',
  weekly: 'Weekly', monthly: 'Monthly',
};

export const STATUS_LABELS: Record<NotificationStatus, string> = {
  draft: 'Draft', reported_internally: 'Reported Internally',
  submitted_to_idsp: 'Submitted to IDSP', acknowledged: 'IDSP Acknowledged',
  closed: 'Closed', withdrawn: 'Withdrawn',
};

export const OUTCOME_LABELS: Record<DiseaseOutcome, string> = {
  alive_recovered: 'Alive — Recovered',
  alive_under_treatment: 'Alive — Under Treatment',
  discharged: 'Discharged', transferred: 'Transferred',
  deceased: 'Deceased', lost_to_followup: 'Lost to Follow-up', unknown: 'Unknown',
};

export const CLASSIFICATION_LABELS: Record<CaseClassification, string> = {
  suspected: 'Suspected', probable: 'Probable',
  confirmed: 'Confirmed', ruled_out: 'Ruled out',
};

export interface NotifiableDisease {
  id: string;
  code: string;
  name: string;
  category: string | null;
  icd10_codes: string[];
  priority: DiseasePriority;
  reporting_form: string | null;
  case_definition: string | null;
  outbreak_threshold: number | null;
  is_active: boolean;
}

export interface DiseaseNotification {
  id: string;
  notification_no: string;
  disease_id: string;
  patient_id: string | null;
  admission_id: string | null;
  patient_name: string;
  patient_age: number | null;
  patient_gender: string | null;
  patient_address: string | null;
  patient_district: string | null;
  patient_pincode: string | null;
  patient_phone: string | null;
  case_classification: CaseClassification;
  symptoms: string[];
  onset_date: string;
  diagnosis_date: string | null;
  diagnosis_method: string | null;
  laboratory_results: string | null;
  travel_history: string | null;
  contact_history: string | null;
  treatment_given: string | null;
  outcome: DiseaseOutcome;
  outcome_date: string | null;
  date_of_death: string | null;
  reported_by_doctor_name: string;
  reporting_unit: string | null;
  status: NotificationStatus;
  reported_at: string | null;
  submitted_to_idsp_at: string | null;
  idsp_acknowledgement_no: string | null;
  district_authority_notified: boolean;
  notes: string | null;
}

export interface IdspWeeklyRow {
  disease_id: string;
  code: string;
  name: string;
  outbreak_threshold: number | null;
  week_start: string;
  case_count: number;
  confirmed_count: number;
  deaths: number;
}
