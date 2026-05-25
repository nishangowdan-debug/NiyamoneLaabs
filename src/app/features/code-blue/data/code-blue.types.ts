export type CodeBlueOutcome =
  | 'in_progress' | 'rosc' | 'deceased' | 'transferred' | 'false_alarm' | 'aborted_dnr';

export type CodeBlueActionType =
  | 'cpr_cycle' | 'intubation' | 'defibrillation' | 'medication'
  | 'vitals' | 'rhythm_check' | 'airway' | 'other';

export type CodeBlueTeamRole =
  | 'team_lead' | 'airway' | 'compressions' | 'medications' | 'recorder' | 'runner' | 'observer';

export type DnrOrderType =
  | 'dnr' | 'dni' | 'dnr_dni' | 'comfort_care_only' | 'allow_natural_death';

export type DnrStatus = 'active' | 'revoked' | 'expired' | 'superseded';

export type DnrDecisionBasis =
  | 'patient_request' | 'family_request' | 'doctor_recommendation'
  | 'advance_directive' | 'court_order' | 'medical_futility';

export const OUTCOME_LABELS: Record<CodeBlueOutcome, string> = {
  in_progress: 'In Progress', rosc: 'ROSC', deceased: 'Deceased',
  transferred: 'Transferred', false_alarm: 'False Alarm', aborted_dnr: 'Aborted (DNR)',
};

export const ACTION_LABELS: Record<CodeBlueActionType, string> = {
  cpr_cycle: 'CPR Cycle', intubation: 'Intubation', defibrillation: 'Defibrillation',
  medication: 'Medication', vitals: 'Vitals', rhythm_check: 'Rhythm Check',
  airway: 'Airway', other: 'Other',
};

export const TEAM_ROLE_LABELS: Record<CodeBlueTeamRole, string> = {
  team_lead: 'Team Lead', airway: 'Airway', compressions: 'Compressions',
  medications: 'Medications', recorder: 'Recorder', runner: 'Runner', observer: 'Observer',
};

export const DNR_TYPE_LABELS: Record<DnrOrderType, string> = {
  dnr: 'DNR (no compressions)',
  dni: 'DNI (no intubation)',
  dnr_dni: 'DNR + DNI (full)',
  comfort_care_only: 'Comfort Care Only',
  allow_natural_death: 'Allow Natural Death (AND)',
};

export const DNR_BASIS_LABELS: Record<DnrDecisionBasis, string> = {
  patient_request: 'Patient request',
  family_request: 'Family request',
  doctor_recommendation: 'Doctor recommendation',
  advance_directive: 'Advance directive',
  court_order: 'Court order',
  medical_futility: 'Medical futility',
};

export interface CodeBlueEvent {
  id: string;
  event_no: string;
  branch_id: string | null;
  patient_id: string | null;
  admission_id: string | null;
  encounter_id: string | null;
  ward_id: string | null;
  bed_id: string | null;
  location_text: string | null;
  called_at: string;
  called_by_staff_id: string | null;
  arrived_at: string | null;
  team_lead_doctor_id: string | null;
  cpr_started_at: string | null;
  intubated_at: string | null;
  rosc_at: string | null;
  outcome: CodeBlueOutcome;
  outcome_at: string | null;
  time_of_death: string | null;
  had_active_dnr: boolean;
  dnr_warning_acknowledged: boolean;
  dnr_acknowledgement_note: string | null;
  presenting_rhythm: string | null;
  precipitating_event: string | null;
  debrief_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CodeBlueAction {
  id: string;
  event_id: string;
  action_at: string;
  action_type: CodeBlueActionType;
  details: Record<string, unknown>;
  performed_by_staff_id: string | null;
  performed_by_name: string | null;
  notes: string | null;
}

export interface CodeBlueTeamMember {
  id: string;
  event_id: string;
  staff_id: string | null;
  staff_name: string;
  role: CodeBlueTeamRole;
  joined_at: string;
  left_at: string | null;
}

export interface DnrOrder {
  id: string;
  patient_id: string;
  admission_id: string | null;
  order_type: DnrOrderType;
  status: DnrStatus;
  effective_from: string;
  effective_until: string | null;
  authorizing_doctor_id: string | null;
  authorizing_doctor_name: string | null;
  decision_basis: DnrDecisionBasis;
  family_discussion_at: string | null;
  family_present_names: string | null;
  clinical_basis: string;
  consent_id: string | null;
  revoked_at: string | null;
  revoked_by_staff_id: string | null;
  revoke_reason: string | null;
  superseded_by_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
