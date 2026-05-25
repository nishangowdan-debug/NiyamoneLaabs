export type ComplaintBoxType = 'complaint' | 'suggestion' | 'compliment';
export type ComplaintBoxStatus = 'new' | 'reviewing' | 'responded' | 'closed';

export interface ComplaintBoxEntry {
  id: string;
  branch_id: string | null;
  type: ComplaintBoxType;
  is_anonymous: boolean;
  raised_by_staff_id: string | null;
  subject: string;
  body: string;
  status: ComplaintBoxStatus;
  response: string | null;
  created_at: string;
  responded_at: string | null;
}

export const COMPLAINT_BOX_TYPE_LABELS: Record<ComplaintBoxType, string> = {
  complaint: 'Complaint',
  suggestion: 'Suggestion',
  compliment: 'Compliment',
};

export const COMPLAINT_BOX_STATUS_LABELS: Record<ComplaintBoxStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  responded: 'Responded',
  closed: 'Closed',
};
