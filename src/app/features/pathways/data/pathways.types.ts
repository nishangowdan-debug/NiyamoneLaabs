export type PathwayCategory =
  | 'sepsis' | 'cardiac' | 'stroke' | 'respiratory' | 'trauma'
  | 'obstetric' | 'surgical' | 'pediatric' | 'oncology' | 'other';

export type ApplicationStatus = 'active' | 'completed' | 'discontinued' | 'expired' | 'superseded';
export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'not_applicable' | 'overdue';

export const CATEGORY_LABELS: Record<PathwayCategory, string> = {
  sepsis: 'Sepsis', cardiac: 'Cardiac', stroke: 'Stroke',
  respiratory: 'Respiratory', trauma: 'Trauma',
  obstetric: 'Obstetric', surgical: 'Surgical',
  pediatric: 'Paediatric', oncology: 'Oncology', other: 'Other',
};

export const APP_STATUS_LABELS: Record<ApplicationStatus, string> = {
  active: 'Active', completed: 'Completed',
  discontinued: 'Discontinued', expired: 'Expired', superseded: 'Superseded',
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pending', in_progress: 'In Progress', done: 'Done',
  skipped: 'Skipped', not_applicable: 'N/A', overdue: 'Overdue',
};

export interface PathwayStep {
  key: string;
  label: string;
  due_within_min?: number;
  critical?: boolean;
}

export interface ClinicalPathway {
  id: string;
  code: string;
  name: string;
  category: PathwayCategory;
  description: string | null;
  trigger_criteria: string | null;
  evidence_basis: string | null;
  expected_duration_hours: number | null;
  steps: PathwayStep[];
  is_active: boolean;
}

export interface PathwayApplication {
  id: string;
  pathway_id: string;
  patient_id: string;
  admission_id: string | null;
  triggered_by_doctor_name: string | null;
  trigger_reason: string | null;
  applied_at: string;
  expected_completion_at: string | null;
  completed_at: string | null;
  status: ApplicationStatus;
  discontinuation_reason: string | null;
  notes: string | null;
}

export interface StepInstance {
  id: string;
  application_id: string;
  step_key: string;
  step_label: string;
  step_order: number;
  due_at: string | null;
  is_critical: boolean;
  status: StepStatus;
  completed_at: string | null;
  completed_by_name: string | null;
  skipped_reason: string | null;
  notes: string | null;
}
