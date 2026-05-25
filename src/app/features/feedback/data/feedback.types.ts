export type SurveyScope = 'opd' | 'ipd' | 'ed' | 'lab' | 'pharmacy' | 'radiology' | 'ot' | 'general' | 'discharge';
export type FeedbackChannel = 'kiosk' | 'sms' | 'email' | 'qr' | 'in_person' | 'phone' | 'whatsapp' | 'portal';
export type FeedbackSentiment = 'positive' | 'neutral' | 'negative';
export type FeedbackResponseStatus = 'new' | 'reviewed' | 'escalated' | 'closed';

export type ComplaintCategory =
  | 'service_quality' | 'billing' | 'staff_conduct' | 'cleanliness' | 'food'
  | 'communication' | 'medical_care' | 'wait_time' | 'privacy' | 'infrastructure' | 'other';
export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ComplaintChannel =
  | 'verbal' | 'written' | 'online' | 'email' | 'phone'
  | 'whatsapp' | 'social_media' | 'suggestion_box';
export type ComplaintStatus =
  | 'open' | 'in_investigation' | 'resolved' | 'escalated' | 'closed' | 'withdrawn';

export const SCOPE_LABELS: Record<SurveyScope, string> = {
  opd: 'OPD', ipd: 'IPD', ed: 'Emergency', lab: 'Lab', pharmacy: 'Pharmacy',
  radiology: 'Radiology', ot: 'OT', general: 'General', discharge: 'Discharge',
};

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  service_quality: 'Service Quality', billing: 'Billing',
  staff_conduct: 'Staff Conduct', cleanliness: 'Cleanliness',
  food: 'Food', communication: 'Communication',
  medical_care: 'Medical Care', wait_time: 'Wait Time',
  privacy: 'Privacy', infrastructure: 'Infrastructure', other: 'Other',
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open', in_investigation: 'In Investigation', resolved: 'Resolved',
  escalated: 'Escalated', closed: 'Closed', withdrawn: 'Withdrawn',
};

export interface SurveyQuestion {
  key: string;
  label: string;
  type: 'rating' | 'yes_no' | 'text' | 'nps';
  scale_max?: number;
  options?: string[];
}

export interface FeedbackSurvey {
  id: string;
  code: string;
  title: string;
  scope: SurveyScope;
  questions: SurveyQuestion[];
  intro_text: string | null;
  thank_you_text: string | null;
  is_active: boolean;
}

export interface FeedbackResponse {
  id: string;
  survey_id: string;
  patient_id: string | null;
  admission_id: string | null;
  encounter_id: string | null;
  ed_visit_id: string | null;
  is_anonymous: boolean;
  submitted_at: string;
  submitted_via: FeedbackChannel;
  overall_rating: number | null;
  nps_score: number | null;
  answers: Record<string, unknown>;
  free_text_comments: string | null;
  department: string | null;
  sentiment: FeedbackSentiment | null;
  status: FeedbackResponseStatus;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  follow_up_required: boolean;
  contact_phone: string | null;
  contact_email: string | null;
  spawned_complaint_id: string | null;
}

export interface Complaint {
  id: string;
  complaint_no: string | null;
  patient_id: string | null;
  feedback_response_id: string | null;
  complainant_name: string | null;
  complainant_relation: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  category: string;
  severity: string;
  description: string | null;
  department: string | null;
  staff_involved: string[];
  received_at: string | null;
  received_by_staff_id: string | null;
  channel: string | null;
  assigned_to_staff_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  due_at: string | null;
  status: string;
  investigation_notes: string | null;
  resolution_summary: string | null;
  resolved_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  escalated_reason: string | null;
  patient_satisfied: boolean | null;
  notes: string | null;
  subject: string | null;
  body: string | null;
}

export interface FeedbackWeeklySummary {
  week: string;
  responses: number;
  avg_rating: number | null;
  avg_nps: number | null;
  negative_count: number;
  positive_count: number;
  pending_followup: number;
}
