export interface HrPolicy {
  id: string;
  branch_id: string | null;
  code: string;
  title: string;
  category: string;
  version: string;
  effective_date: string;
  document_url: string | null;
  body: string | null;
  requires_ack: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface HrPolicyAcknowledgment {
  id: string;
  policy_id: string;
  staff_id: string;
  acknowledged_at: string;
}

export interface PolicyCompliance {
  policy_id: string;
  code: string;
  title: string;
  category: string;
  version: string;
  total_staff: number;
  acknowledged: number;
  compliance_pct: number;
}

export const POLICY_CATEGORIES = [
  'general',
  'code_of_conduct',
  'leave',
  'attendance',
  'safety',
  'infection_control',
  'data_privacy',
  'posh',
  'compliance',
] as const;

export const POLICY_CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  code_of_conduct: 'Code of Conduct',
  leave: 'Leave',
  attendance: 'Attendance',
  safety: 'Safety',
  infection_control: 'Infection Control',
  data_privacy: 'Data Privacy',
  posh: 'POSH',
  compliance: 'Compliance',
};
