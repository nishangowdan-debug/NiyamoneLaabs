export type DisciplinaryActionType =
  | 'verbal_warning' | 'written_warning' | 'final_warning'
  | 'pip' | 'suspension' | 'termination' | 'other';

export type DisciplinaryStatus =
  | 'draft' | 'issued' | 'acknowledged' | 'contested' | 'closed' | 'rescinded';

export type DisciplinarySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DisciplinaryAction {
  id: string;
  case_no: string;
  branch_id: string | null;
  staff_id: string;
  action_type: DisciplinaryActionType;
  severity: DisciplinarySeverity;
  reason: string;
  description: string | null;
  effective_from: string;
  effective_to: string | null;
  status: DisciplinaryStatus;
  staff_response: string | null;
  is_confidential: boolean;
  document_url: string | null;
  issued_by_staff_id: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DISCIPLINARY_TYPE_LABELS: Record<DisciplinaryActionType, string> = {
  verbal_warning: 'Verbal Warning',
  written_warning: 'Written Warning',
  final_warning: 'Final Warning',
  pip: 'PIP (Improvement Plan)',
  suspension: 'Suspension',
  termination: 'Termination',
  other: 'Other',
};

export const DISCIPLINARY_STATUS_LABELS: Record<DisciplinaryStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  acknowledged: 'Acknowledged',
  contested: 'Contested',
  closed: 'Closed',
  rescinded: 'Rescinded',
};
