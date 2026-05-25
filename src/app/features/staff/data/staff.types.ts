import type { Tables, TablesUpdate } from '../../../core/supabase/supabase.types';

export type StaffMember = Tables<'staff'> & {
  /** Joined from staff_departments + departments — primary department label/code/color. */
  department?: { id: string; code: string; name: string; color: string | null } | null;
  /** Joined from branches via staff.primary_branch_id. NULL means the record
   *  was created before branch was made mandatory — surface that to admins. */
  branch?: { id: string; code: string; name: string } | null;
  /** Newly added DB columns not yet in regenerated supabase.types.ts. */
  signature_data_url?: string | null;
  signature_updated_at?: string | null;
};
export type StaffUpdate = TablesUpdate<'staff'>;

export interface StaffFilters {
  search: string;
  role: string;
  status: 'all' | 'active' | 'inactive';
  page: number;
  pageSize: number;
  /** When set → only staff whose primary_branch_id matches; when null → all branches. */
  branchId?: string | null;
}

export const DEFAULT_STAFF_FILTERS: StaffFilters = {
  search: '',
  role: 'all',
  status: 'active',
  page: 0,
  pageSize: 25,
  branchId: null,
};

export interface StaffListResult {
  rows: StaffMember[];
  total: number;
}
