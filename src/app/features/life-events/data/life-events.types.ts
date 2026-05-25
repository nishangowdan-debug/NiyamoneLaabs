export type BirthMethod = 'vaginal' | 'lscs' | 'forceps' | 'vacuum' | 'breech' | 'assisted_breech' | 'other';
export type BirthOutcome = 'live_birth' | 'stillbirth' | 'neonatal_death' | 'abortion';
export type MannerOfDeath = 'natural' | 'accident' | 'suicide' | 'homicide' | 'undetermined' | 'pending_investigation';
export type RegistrationStatus = 'pending' | 'submitted' | 'registered' | 'rejected';

export const BIRTH_METHOD_LABELS: Record<BirthMethod, string> = {
  vaginal: 'Vaginal', lscs: 'LSCS', forceps: 'Forceps', vacuum: 'Vacuum',
  breech: 'Breech', assisted_breech: 'Assisted Breech', other: 'Other',
};

export const BIRTH_OUTCOME_LABELS: Record<BirthOutcome, string> = {
  live_birth: 'Live Birth', stillbirth: 'Stillbirth',
  neonatal_death: 'Neonatal Death', abortion: 'Abortion',
};

export const MANNER_LABELS: Record<MannerOfDeath, string> = {
  natural: 'Natural', accident: 'Accident', suicide: 'Suicide',
  homicide: 'Homicide', undetermined: 'Undetermined',
  pending_investigation: 'Pending Investigation',
};

export const REG_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Pending', submitted: 'Submitted',
  registered: 'Registered', rejected: 'Rejected',
};

export interface BirthRecord {
  id: string;
  registration_no: string;
  mother_patient_id: string;
  mother_admission_id: string | null;
  ot_record_id: string | null;
  born_at: string;
  birth_outcome: BirthOutcome;
  sex: string;
  birth_weight_g: number | null;
  gestational_weeks: number | null;
  gestational_days: number | null;
  method: BirthMethod | null;
  multiple_birth: boolean;
  birth_order: number | null;
  apgar_1min: number | null;
  apgar_5min: number | null;
  apgar_10min: number | null;
  newborn_first_name: string | null;
  newborn_last_name: string | null;
  newborn_patient_id: string | null;
  attending_doctor_name: string;
  attending_nurse_name: string | null;
  father_name: string | null;
  place_of_birth: string | null;
  municipality_no: string | null;
  municipality_registered_at: string | null;
  registration_status: RegistrationStatus;
  notes: string | null;
  created_at: string;
}

export interface DeathRecord {
  id: string;
  registration_no: string;
  deceased_patient_id: string;
  admission_id: string | null;
  encounter_id: string | null;
  ed_visit_id: string | null;
  code_blue_event_id: string | null;
  died_at: string;
  pronounced_at: string;
  pronounced_by_doctor_name: string;
  place_of_death: string | null;
  manner_of_death: MannerOfDeath;
  cause_immediate_text: string;
  cause_immediate_icd10: string | null;
  cause_immediate_duration: string | null;
  cause_antecedent_text: string | null;
  cause_antecedent_icd10: string | null;
  cause_antecedent_duration: string | null;
  cause_underlying_text: string;
  cause_underlying_icd10: string | null;
  cause_underlying_duration: string | null;
  other_conditions: string | null;
  autopsy_performed: boolean;
  autopsy_findings: string | null;
  is_mlc: boolean;
  police_intimation_at: string | null;
  police_station: string | null;
  fir_no: string | null;
  body_released_at: string | null;
  body_released_to_name: string | null;
  body_released_to_relation: string | null;
  body_released_id_proof: string | null;
  municipality_no: string | null;
  municipality_registered_at: string | null;
  registration_status: RegistrationStatus;
  notes: string | null;
  created_at: string;
}

export interface PendingDeathCertificate {
  admission_id: string;
  patient_id: string;
  date_of_death: string | null;
  outcome: string;
  days_since_death: number;
}
