export type PayerType = 'tpa' | 'insurer' | 'govt_scheme' | 'self_pay' | 'corporate';
export type AuthRequestType = 'initial' | 'enhancement' | 'extension' | 'revision';
export type AuthStatus =
  | 'draft' | 'submitted' | 'queried' | 'approved' | 'partial_approved'
  | 'rejected' | 'cancelled' | 'settled' | 'denied_settlement';
export type SponsorRelation = 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'employer' | 'other';

export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  tpa: 'TPA', insurer: 'Insurer', govt_scheme: 'Govt Scheme',
  self_pay: 'Self-pay', corporate: 'Corporate',
};

export const AUTH_STATUS_LABELS: Record<AuthStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', queried: 'Query',
  approved: 'Approved', partial_approved: 'Partial Approval',
  rejected: 'Rejected', cancelled: 'Cancelled',
  settled: 'Settled', denied_settlement: 'Settlement Denied',
};

export const REQUEST_TYPE_LABELS: Record<AuthRequestType, string> = {
  initial: 'Initial', enhancement: 'Enhancement',
  extension: 'Extension', revision: 'Revision',
};

export interface InsurancePayer {
  id: string;
  code: string;
  name: string;
  payer_type: PayerType;
  parent_payer_id: string | null;
  email: string | null;
  fax: string | null;
  contact_phone: string | null;
  contact_person: string | null;
  portal_url: string | null;
  claim_email: string | null;
  is_active: boolean;
}

export interface InsuranceAuthorization {
  id: string;
  auth_no: string;
  patient_id: string;
  admission_id: string | null;
  encounter_id: string | null;
  payer_id: string;
  insurance_policy_no: string;
  member_id: string | null;
  card_no: string | null;
  sponsor_relation: SponsorRelation;
  sponsor_name: string | null;
  employer_name: string | null;
  request_type: AuthRequestType;
  parent_authorization_id: string | null;
  submitted_at: string | null;
  provisional_diagnosis: string;
  icd10_codes: string[];
  treatment_plan: string | null;
  estimated_cost_cents: number;
  estimated_los_days: number | null;
  documents_attached: string[];
  status: AuthStatus;
  response_at: string | null;
  approved_amount_cents: number | null;
  approval_valid_until: string | null;
  rejection_reason: string | null;
  query_text: string | null;
  final_bill_amount_cents: number | null;
  settled_amount_cents: number | null;
  settled_at: string | null;
  settlement_utr: string | null;
  copay_amount_cents: number | null;
  patient_payable_cents: number | null;
  tpa_reference_no: string | null;
  insurer_reference_no: string | null;
  cancelled_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
