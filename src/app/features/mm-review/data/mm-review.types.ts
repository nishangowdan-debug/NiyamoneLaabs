export type MmCaseType =
  | 'death' | 'complication' | 'near_miss' | 'sentinel_event'
  | 'hai_outbreak' | 'medication_error' | 'surgical_adverse' | 'anaesthesia_adverse';

export type MmReviewStatus = 'scheduled' | 'in_progress' | 'closed' | 'cancelled';
export type MmPreventability = 'preventable' | 'possibly_preventable' | 'non_preventable' | 'unable_to_determine';
export type MmActionStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export const CASE_TYPE_LABELS: Record<MmCaseType, string> = {
  death: 'Death', complication: 'Complication', near_miss: 'Near Miss',
  sentinel_event: 'Sentinel Event', hai_outbreak: 'HAI Outbreak',
  medication_error: 'Medication Error', surgical_adverse: 'Surgical Adverse Event',
  anaesthesia_adverse: 'Anaesthesia Adverse Event',
};

export const PREVENTABILITY_LABELS: Record<MmPreventability, string> = {
  preventable: 'Preventable', possibly_preventable: 'Possibly preventable',
  non_preventable: 'Non-preventable', unable_to_determine: 'Unable to determine',
};

export const REVIEW_STATUS_LABELS: Record<MmReviewStatus, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress',
  closed: 'Closed', cancelled: 'Cancelled',
};

export const ACTION_STATUS_LABELS: Record<MmActionStatus, string> = {
  open: 'Open', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled',
};

export const CONTRIBUTING_FACTOR_OPTIONS = [
  { key: 'system_failure', label: 'System failure' },
  { key: 'human_error', label: 'Human error' },
  { key: 'communication', label: 'Communication breakdown' },
  { key: 'training_gap', label: 'Training / knowledge gap' },
  { key: 'protocol_gap', label: 'Protocol / guideline gap' },
  { key: 'protocol_deviation', label: 'Protocol deviation' },
  { key: 'device_failure', label: 'Device / equipment failure' },
  { key: 'medication_error', label: 'Medication error' },
  { key: 'staffing', label: 'Inadequate staffing' },
  { key: 'documentation', label: 'Documentation issue' },
  { key: 'patient_factor', label: 'Patient factor (delayed presentation, comorbidity)' },
  { key: 'environmental', label: 'Environmental factor' },
  { key: 'fatigue', label: 'Fatigue / handover' },
];

export interface MmReview {
  id: string;
  review_no: string;
  case_type: MmCaseType;
  patient_id: string | null;
  admission_id: string | null;
  encounter_id: string | null;
  linked_death_record_id: string | null;
  linked_code_blue_id: string | null;
  linked_hai_id: string | null;
  linked_ot_record_id: string | null;
  linked_adr_id: string | null;
  case_summary: string;
  reviewed_at: string | null;
  chair_doctor_name: string | null;
  attendees: string[];
  clinical_findings: string | null;
  root_cause_summary: string | null;
  preventability: MmPreventability | null;
  contributing_factors: string[];
  lessons_learned: string | null;
  recommendations: string | null;
  status: MmReviewStatus;
  closed_at: string | null;
  privileged_communication: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MmActionItem {
  id: string;
  mm_review_id: string;
  description: string;
  owner_name: string | null;
  due_at: string | null;
  status: MmActionStatus;
  completed_at: string | null;
  completion_notes: string | null;
  notes: string | null;
  created_at: string;
}
