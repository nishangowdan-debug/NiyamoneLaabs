export type RoleSlug =
  | 'super_admin'
  | 'branch_admin'
  | 'doctor'
  | 'nurse'
  | 'reception'
  | 'lab_tech'
  | 'pharmacist'
  | 'accountant'
  | 'hr'
  | 'housekeeping'
  | 'security'
  | 'fnb'
  | 'driver'
  | 'patient'
  | 'none';

export type Permission =
  | 'patients.read' | 'patients.write'
  | 'appointments.read' | 'appointments.write'
  | 'ehr.read' | 'ehr.write'
  | 'billing.read' | 'billing.write'
  | 'lab.read' | 'lab.write'
  | 'pharmacy.read' | 'pharmacy.write'
  | 'inventory.read' | 'inventory.write'
  | 'vendors.read' | 'vendors.write'
  | 'purchase.read' | 'purchase.write'
  | 'materials.read' | 'materials.write'
  | 'ap.read' | 'ap.write'
  | 'staff.read' | 'staff.write'
  | 'hr_policies.read' | 'hr_policies.write'
  | 'holidays.read' | 'holidays.write'
  | 'grievances.read' | 'grievances.write' | 'grievances.manage'
  | 'complaints_box.read' | 'complaints_box.write' | 'complaints_box.manage'
  | 'engagement.read' | 'engagement.write' | 'engagement.manage'
  | 'credentials.read' | 'credentials.write'
  | 'disciplinary.read' | 'disciplinary.write' | 'disciplinary.respond'
  | 'exit.read' | 'exit.write' | 'exit.manage'
  | 'perf.read' | 'perf.write' | 'perf.manage'
  | 'reports.read'
  | 'audit.read'
  | 'registers.read' | 'registers.write' | 'registers.verify' | 'registers.void'
  | 'exceptions.read' | 'exceptions.approve.branch' | 'exceptions.approve.super'
  | 'discount.apply.auto'
  // Single, flat capability — gates the inline discount in the Record
  // Payment modal. Tiered approval flow has been removed in favour of an
  // on/off toggle managed under Settings → Roles & permissions.
  | 'discount.apply';

export interface JwtClaims {
  user_role: RoleSlug;
  staff_id: string | null;
  patient_id: string | null;
  branch_id: string | null;
  branch_ids: string[];
  permissions: Permission[];
  email?: string;
  sub?: string;
  exp?: number;
}

export const EMPTY_CLAIMS: JwtClaims = {
  user_role: 'none',
  staff_id: null,
  patient_id: null,
  branch_id: null,
  branch_ids: [],
  permissions: [],
};
