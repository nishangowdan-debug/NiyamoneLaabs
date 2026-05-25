export type GrievanceCategory =
  | 'harassment' | 'discrimination' | 'workplace_safety' | 'salary'
  | 'workload' | 'management' | 'peer_conflict' | 'posh' | 'other';

export type GrievanceStatus = 'open' | 'under_review' | 'resolved' | 'closed' | 'rejected';
export type GrievanceSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Grievance {
  id: string;
  ticket_no: string;
  branch_id: string | null;
  raised_by_staff_id: string | null;
  is_anonymous: boolean;
  category: GrievanceCategory;
  subject: string;
  description: string;
  severity: GrievanceSeverity;
  status: GrievanceStatus;
  assigned_to_staff_id: string | null;
  resolution_summary: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrievanceComment {
  id: string;
  grievance_id: string;
  author_staff_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  harassment: 'Harassment',
  discrimination: 'Discrimination',
  workplace_safety: 'Workplace Safety',
  salary: 'Salary / Compensation',
  workload: 'Workload',
  management: 'Management',
  peer_conflict: 'Peer Conflict',
  posh: 'POSH (Sexual Harassment)',
  other: 'Other',
};

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const GRIEVANCE_SEVERITY_LABELS: Record<GrievanceSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
