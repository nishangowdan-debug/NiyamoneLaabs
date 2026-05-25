export type AntibioticClass = 'access' | 'watch' | 'reserve' | 'restricted_local' | 'non_formulary';

export type ReviewStatus =
  | 'pending' | 'approved' | 'approved_with_modification' | 'denied'
  | 'escalated' | 'expired' | 'self_resolved';

export type Recommendation =
  | 'continue_as_prescribed' | 'de_escalate' | 'escalate' | 'change_drug'
  | 'change_dose' | 'add_to_culture' | 'discontinue' | 'iv_to_po'
  | 'add_loading_dose' | 'no_change_needed';

export const CLASS_LABELS: Record<AntibioticClass, string> = {
  access: 'Access (1st-line)', watch: 'Watch (broad-spectrum)',
  reserve: 'Reserve (last-resort)', restricted_local: 'Locally restricted',
  non_formulary: 'Non-formulary',
};

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending Review', approved: 'Approved',
  approved_with_modification: 'Approved (modified)',
  denied: 'Denied', escalated: 'Escalated',
  expired: 'Expired', self_resolved: 'Self-resolved',
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  continue_as_prescribed: 'Continue as prescribed',
  de_escalate: 'De-escalate', escalate: 'Escalate',
  change_drug: 'Change drug', change_dose: 'Change dose',
  add_to_culture: 'Send culture', discontinue: 'Discontinue',
  iv_to_po: 'IV → PO switch', add_loading_dose: 'Add loading dose',
  no_change_needed: 'No change needed',
};

export interface StewardshipAntibiotic {
  id: string;
  generic_name: string;
  who_aware_class: AntibioticClass;
  requires_pre_authorization: boolean;
  requires_post_review_hours: number | null;
  approving_specialties: string[];
  max_duration_days: number | null;
  policy_notes: string | null;
  is_active: boolean;
}

export interface StewardshipReview {
  id: string;
  patient_id: string;
  admission_id: string | null;
  prescription_id: string | null;
  antibiotic_id: string | null;
  drug_name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration_days: number | null;
  indication: string | null;
  empirical_or_targeted: string | null;
  culture_sent: boolean;
  prescribed_at: string;
  prescribed_by_doctor_name: string;
  status: ReviewStatus;
  review_due_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  recommendation: Recommendation | null;
  recommendation_notes: string | null;
  modified_drug: string | null;
  modified_dose: string | null;
  modified_duration_days: number | null;
  escalated_to: string | null;
  notes: string | null;
}

export interface StewardshipUsageRow {
  week: string;
  drug_name: string;
  prescriptions: number;
  empirical_count: number;
  targeted_count: number;
  culture_sent_count: number;
  de_escalations: number;
  discontinuations: number;
  iv_to_po_switches: number;
}
