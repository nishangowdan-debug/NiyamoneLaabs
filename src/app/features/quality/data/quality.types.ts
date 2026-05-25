export type InfectionType = 'clabsi' | 'cauti' | 'vap' | 'ssi' | 'bsi' | 'uti' | 'pneumonia' | 'other';
export type InfectionSource = 'icu' | 'ot' | 'ward' | 'er' | 'outside' | 'community';
export type DeviceType =
  | 'central_line' | 'urinary_catheter' | 'ventilator' | 'peripheral_line'
  | 'tracheostomy' | 'arterial_line' | 'feeding_tube' | 'drain';
export type AdmissionOutcome = 'alive' | 'expired' | 'transferred' | 'dama';
export type RiskGroup = 'low' | 'medium' | 'high';

export interface QualityMetrics {
  window: { from: string; to: string };
  admissions: number;
  deaths: number;
  observed_mortality_pct: number;
  expected_mortality_pct: number;
  ramr: number | null;
  patient_days: number;
  hai_total: number;
  hai_rate_per_1000: number;
  clabsi: { count: number; central_line_days: number; rate_per_1000: number };
  cauti:  { count: number; urinary_catheter_days: number; rate_per_1000: number };
  vap:    { count: number; ventilator_days: number; rate_per_1000: number };
  discharges_in_window: number;
  readmitted_within_30d: number;
  readmission_rate_pct: number;
  risk_group_split: Record<RiskGroup, number> | null;
  top_diagnoses: { icd10: string; cnt: number }[];
}

export interface InfectionRow {
  id: string;
  patient_id: string;
  admission_id: string | null;
  infection_type: InfectionType;
  infection_date: string;
  source: InfectionSource;
  device_used: string | null;
  organism: string | null;
  notes: string | null;
  is_hai: boolean;
  created_at: string;
}

export interface DeviceUsageRow {
  id: string;
  patient_id: string;
  admission_id: string | null;
  device_type: DeviceType;
  start_at: string;
  end_at: string | null;
  site: string | null;
  notes: string | null;
}

export interface ActiveAdmissionLite {
  id: string;
  patient_id: string;
  patient_name: string;
  uhid: string;
  admitted_at: string;
  primary_diagnosis_icd10: string | null;
  risk_group: RiskGroup;
  outcome: AdmissionOutcome;
  status: string;
}

export const INFECTION_TYPE_LABEL: Record<InfectionType, string> = {
  clabsi: 'CLABSI', cauti: 'CAUTI', vap: 'VAP', ssi: 'SSI',
  bsi: 'BSI', uti: 'UTI', pneumonia: 'Pneumonia', other: 'Other',
};
export const DEVICE_LABEL: Record<DeviceType, string> = {
  central_line: 'Central line', urinary_catheter: 'Urinary catheter', ventilator: 'Ventilator',
  peripheral_line: 'Peripheral line', tracheostomy: 'Tracheostomy', arterial_line: 'Arterial line',
  feeding_tube: 'Feeding tube', drain: 'Drain',
};
export const OUTCOME_LABEL: Record<AdmissionOutcome, { label: string; chip: string }> = {
  alive:       { label: 'Alive',       chip: 'bg-good-bg text-good-fg' },
  expired:     { label: 'Expired',     chip: 'bg-danger-bg text-danger-fg' },
  transferred: { label: 'Transferred', chip: 'bg-info-bg text-info-fg' },
  dama:        { label: 'DAMA',        chip: 'bg-warn-bg text-warn-fg' },
};
