export type AllergenType =
  | 'drug' | 'food' | 'environmental' | 'contrast' | 'latex'
  | 'venom' | 'animal' | 'pollen' | 'dust' | 'other';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type AllergyStatus = 'active' | 'resolved' | 'disproven' | 'entered_in_error';
export type AllergySource =
  | 'patient_reported' | 'family_reported' | 'clinical_observation'
  | 'medical_history' | 'adr_event';

export type AdrCausality =
  | 'definite' | 'probable' | 'possible' | 'unlikely' | 'unrelated' | 'unassessable';
export type AdrOutcome =
  | 'recovered' | 'recovering' | 'not_recovered' | 'recovered_with_sequelae'
  | 'fatal' | 'unknown';
export type AdrAction =
  | 'drug_withdrawn' | 'dose_reduced' | 'dose_increased' | 'none'
  | 'unknown' | 'drug_stopped' | 'drug_continued';
export type AdrDechallenge = 'positive' | 'negative' | 'unknown' | 'not_applicable';

export const ALLERGEN_TYPE_LABELS: Record<AllergenType, string> = {
  drug: 'Drug', food: 'Food', environmental: 'Environmental',
  contrast: 'Contrast media', latex: 'Latex', venom: 'Venom',
  animal: 'Animal', pollen: 'Pollen', dust: 'Dust', other: 'Other',
};

export const SEVERITY_LABELS: Record<AllergySeverity, string> = {
  mild: 'Mild', moderate: 'Moderate', severe: 'Severe', life_threatening: 'Life-Threatening',
};

export const CAUSALITY_LABELS: Record<AdrCausality, string> = {
  definite: 'Definite', probable: 'Probable', possible: 'Possible',
  unlikely: 'Unlikely', unrelated: 'Unrelated', unassessable: 'Unassessable',
};

export const OUTCOME_LABELS: Record<AdrOutcome, string> = {
  recovered: 'Recovered', recovering: 'Recovering', not_recovered: 'Not Recovered',
  recovered_with_sequelae: 'Recovered w/ sequelae', fatal: 'Fatal', unknown: 'Unknown',
};

export interface PatientAllergy {
  id: string;
  patient_id: string;
  allergen_type: AllergenType;
  allergen_name: string;
  generic_drug_name: string | null;
  reaction_type: string | null;
  reaction_description: string | null;
  severity: AllergySeverity;
  onset_date: string | null;
  status: AllergyStatus;
  source: AllergySource;
  verified_by_staff_id: string | null;
  verified_at: string | null;
  related_adr_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdrReport {
  id: string;
  patient_id: string;
  admission_id: string | null;
  encounter_id: string | null;
  drug_name: string;
  generic_drug_name: string | null;
  manufacturer: string | null;
  batch_no: string | null;
  route: string | null;
  dose: string | null;
  start_drug_at: string | null;
  stop_drug_at: string | null;
  reaction_description: string;
  reaction_started_at: string | null;
  reaction_ended_at: string | null;
  ctcae_grade: number | null;
  is_serious: boolean;
  seriousness_criteria: string[];
  causality: AdrCausality;
  outcome: AdrOutcome;
  action_taken: AdrAction | null;
  dechallenge: AdrDechallenge | null;
  rechallenge: AdrDechallenge | null;
  concomitant_meds: string | null;
  relevant_history: string | null;
  reported_to_pvpi: boolean;
  pvpi_report_no: string | null;
  pvpi_reported_at: string | null;
  pvpi_acknowledged_at: string | null;
  reporter_name: string;
  reporter_designation: string | null;
  patient_allergy_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface AllergyMatchHit {
  id: string;
  allergen_name: string;
  severity: AllergySeverity;
  reaction_description: string | null;
  reaction_type: string | null;
  allergy_source: AllergySource;
}
