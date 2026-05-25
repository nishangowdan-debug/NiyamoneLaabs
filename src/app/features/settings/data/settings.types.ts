import type { ServiceCategory, Tables, TablesInsert, TablesUpdate } from '../../../core/supabase/supabase.types';

export type Branch = Tables<'branches'>;
export type BranchUpdate = TablesUpdate<'branches'>;

export type Service = Tables<'services'>;
export type ServiceInsert = TablesInsert<'services'>;
export type ServiceUpdate = TablesUpdate<'services'>;

export type Role = Tables<'roles'>;
export type Permission = Tables<'permissions'>;
export type RolePermission = Tables<'role_permissions'>;

export interface PermissionsByNamespace {
  namespace: string;       // 'ehr' / 'billing' / 'lab' / 'patients' / etc
  permissions: Permission[];
}

export interface BranchAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export type SettingsTab = 'hospital' | 'services' | 'roles' | 'signatures' | 'demo';

// Sree Diagnostics restricts billable services to lab + imaging (radiology).
// Other categories still exist in the DB enum for backward compatibility but
// aren't exposed in this project's UI.
export const SERVICE_CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: 'lab',          label: 'Lab' },
  { value: 'imaging',      label: 'Imaging / Radiology' },
];
