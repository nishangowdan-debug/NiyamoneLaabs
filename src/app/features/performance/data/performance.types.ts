export type CycleStatus = 'draft' | 'open' | 'closed' | 'archived';
export type ReviewStatus =
  | 'not_started' | 'self_pending' | 'manager_pending'
  | 'peer_pending' | 'finalized' | 'acknowledged';
export type Relationship = 'peer' | 'direct_report' | 'manager' | 'cross_team' | 'self';

export interface PerfCycle {
  id: string;
  branch_id: string | null;
  name: string;
  period_start: string;
  period_end: string;
  status: CycleStatus;
  self_review_due: string | null;
  manager_review_due: string | null;
  peer_review_due: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PerfReview {
  id: string;
  cycle_id: string;
  staff_id: string;
  manager_staff_id: string | null;
  overall_score: number | null;
  status: ReviewStatus;
  self_summary: string | null;
  manager_summary: string | null;
  finalized_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerfKpi {
  id: string;
  review_id: string;
  ord: number;
  kpi_name: string;
  weight_pct: number;
  target: string | null;
  achievement: string | null;
  self_score: number | null;
  manager_score: number | null;
  comments: string | null;
}

export interface Perf360 {
  id: string;
  review_id: string;
  reviewer_staff_id: string | null;
  is_anonymous: boolean;
  relationship: Relationship;
  strengths: string | null;
  improvements: string | null;
  rating: number | null;
  created_at: string;
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: 'Not Started',
  self_pending: 'Self Review Pending',
  manager_pending: 'Manager Review Pending',
  peer_pending: 'Peer Reviews Pending',
  finalized: 'Finalized',
  acknowledged: 'Acknowledged',
};

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  peer: 'Peer',
  direct_report: 'Direct Report',
  manager: 'Manager',
  cross_team: 'Cross-team',
  self: 'Self',
};
