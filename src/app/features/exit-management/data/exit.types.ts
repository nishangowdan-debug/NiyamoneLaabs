export type ExitType = 'resignation' | 'termination' | 'retirement' | 'contract_end' | 'death' | 'other';
export type ExitStatus = 'notice' | 'in_clearance' | 'interview_pending' | 'completed' | 'withdrawn';
export type SettlementStatus = 'pending' | 'processing' | 'released' | 'disputed';

export interface HrExit {
  id: string;
  branch_id: string | null;
  staff_id: string;
  exit_type: ExitType;
  reason_category: string | null;
  reason: string | null;
  notice_date: string;
  expected_last_day: string | null;
  actual_last_day: string | null;
  status: ExitStatus;
  exit_interview_done: boolean;
  exit_interview_notes: string | null;
  exit_interview_score: number | null;
  full_final_settlement_status: SettlementStatus;
  created_at: string;
  updated_at: string;
}

export interface ExitClearanceItem {
  id: string;
  exit_id: string;
  department: string;
  task: string;
  responsible_role: string | null;
  is_done: boolean;
  done_by_staff_id: string | null;
  done_at: string | null;
  remarks: string | null;
  ord: number;
}

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  resignation: 'Resignation',
  termination: 'Termination',
  retirement: 'Retirement',
  contract_end: 'Contract End',
  death: 'Death',
  other: 'Other',
};

export const EXIT_STATUS_LABELS: Record<ExitStatus, string> = {
  notice: 'Notice Served',
  in_clearance: 'In Clearance',
  interview_pending: 'Exit Interview Pending',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  released: 'Released',
  disputed: 'Disputed',
};
