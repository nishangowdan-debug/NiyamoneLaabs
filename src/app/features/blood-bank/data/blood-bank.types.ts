export type BloodGroup =
  | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG'
  | 'AB_POS' | 'AB_NEG' | 'O_POS' | 'O_NEG';

export type BloodComponent =
  | 'whole_blood' | 'prbc' | 'ffp' | 'platelets' | 'cryo' | 'single_donor_platelets';

export type BloodScreeningStatus = 'pending' | 'passed' | 'failed' | 'indeterminate';

export type BloodUnitState =
  | 'quarantined' | 'tested' | 'available' | 'reserved'
  | 'issued' | 'transfused' | 'discarded' | 'expired';

export type BloodRequestState =
  | 'requested' | 'cross_matched' | 'issued' | 'completed' | 'cancelled';

export type CrossmatchResult = 'compatible' | 'incompatible' | 'ambiguous';

export type TransfusionOutcome = 'completed' | 'aborted' | 'reaction';

export type TransfusionReaction = 'none' | 'mild' | 'moderate' | 'severe';

export type BBRequestPriority = 'routine' | 'urgent' | 'stat';

// Pretty-print labels for ABO+Rh
export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  A_POS: 'A+', A_NEG: 'A-',
  B_POS: 'B+', B_NEG: 'B-',
  AB_POS: 'AB+', AB_NEG: 'AB-',
  O_POS: 'O+', O_NEG: 'O-',
};

export const COMPONENT_LABELS: Record<BloodComponent, string> = {
  whole_blood: 'Whole Blood',
  prbc: 'Packed RBC',
  ffp: 'FFP',
  platelets: 'Platelets',
  cryo: 'Cryoprecipitate',
  single_donor_platelets: 'SDP',
};

export interface Donor {
  id: string;
  donor_no: string;
  first_name: string;
  last_name: string | null;
  gender: 'male' | 'female' | 'other';
  dob: string | null;
  blood_group: BloodGroup;
  mobile: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  weight_kg: number | null;
  last_donation_at: string | null;
  total_donations: number;
  deferral_until: string | null;
  deferral_reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface Donation {
  id: string;
  donor_id: string;
  donated_at: string;
  volume_ml: number;
  lot_number: string | null;
  pre_hb_g_dl: number | null;
  pre_bp: string | null;
  pre_pulse: number | null;
  screening_status: BloodScreeningStatus;
  screening_results: Record<string, unknown>;
  screened_at: string | null;
  notes: string | null;
}

export interface BloodUnit {
  id: string;
  unit_no: string;
  donation_id: string | null;
  component: BloodComponent;
  blood_group: BloodGroup;
  volume_ml: number;
  collected_at: string;
  expires_at: string;
  state: BloodUnitState;
  current_location: string | null;
  reserved_for_request_id: string | null;
  discarded_reason: string | null;
  notes: string | null;
}

export type BloodRequestStage =
  | 'pending_acknowledgement' | 'acknowledged' | 'sample_received'
  | 'crossmatching' | 'cross_matched' | 'issued' | 'dispatched' | 'ward_received';

export type BloodRequestSlaStatus = 'ok' | 'at_risk' | 'breached' | 'closed';

export interface BloodRequest {
  id: string;
  request_no: string;
  patient_id: string;
  encounter_id: string | null;
  admission_id: string | null;
  requested_by: string | null;
  doctor_id: string | null;
  priority: BBRequestPriority;
  component: BloodComponent;
  blood_group: BloodGroup;
  units_required: number;
  indication: string | null;
  state: BloodRequestState;
  required_by: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
  // Dispatch / TAT milestones (B1 schema)
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  sample_received_at: string | null;
  sample_received_by: string | null;
  crossmatch_started_at: string | null;
  crossmatch_completed_at: string | null;
  issued_at: string | null;
  issued_by: string | null;
  dispatched_at: string | null;
  dispatched_by: string | null;
  dispatch_runner_staff_id: string | null;
  cold_chain_box_id: string | null;
  target_ward_id: string | null;
  ward_received_at: string | null;
  ward_received_by: string | null;
  return_to_bb_at: string | null;
  return_reason: string | null;
  sla_breach_flag: boolean;
  /** Joined from patients(full_name, uhid) when listed via listRequests(). */
  patient?: { id: string; full_name: string | null; uhid: string | null } | null;
}

export const STAGE_LABELS: Record<BloodRequestStage, string> = {
  pending_acknowledgement: 'Awaiting Ack',
  acknowledged: 'Acknowledged',
  sample_received: 'Sample Received',
  crossmatching: 'Cross-matching',
  cross_matched: 'Cross-matched',
  issued: 'Issued',
  dispatched: 'Dispatched',
  ward_received: 'At Ward',
};

export interface CrossMatch {
  id: string;
  request_id: string;
  unit_id: string;
  performed_by: string | null;
  performed_at: string;
  technique: string;
  result: CrossmatchResult;
  reaction_phase: string | null;
  notes: string | null;
}

export interface TransfusionRecord {
  id: string;
  request_id: string;
  unit_id: string;
  patient_id: string;
  admission_id: string | null;
  consent_id: string | null;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
  supervising_doctor: string | null;
  vitals_pre: Record<string, unknown>;
  vitals_15min: Record<string, unknown> | null;
  vitals_post: Record<string, unknown> | null;
  reaction: TransfusionReaction;
  reaction_notes: string | null;
  /** NULL while in progress (Phase 2 multi-step run-sheet); set on bb_transfusion_complete. */
  outcome: TransfusionOutcome | null;
}

export interface InventorySummaryRow {
  blood_group: BloodGroup;
  component: BloodComponent;
  state: BloodUnitState;
  units: number;
  volume_ml: number;
}

export interface BBWardOption {
  id: string;
  code: string;
  name: string;
}

export interface BBStaffOption {
  id: string;
  full_name: string;
  role_slug: string | null;
}

export interface BBInvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
  invoice_number: string | null;
  invoice_status: string | null;
}
