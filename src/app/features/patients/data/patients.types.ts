import type { Tables, TablesInsert, TablesUpdate } from '../../../core/supabase/supabase.types';

export type Patient = Tables<'patients'>;
export type PatientInsert = TablesInsert<'patients'>;
export type PatientUpdate = TablesUpdate<'patients'>;
export type PatientAddress = Tables<'patient_addresses'>;
export type PatientAllergy = Tables<'patient_allergies'>;
export type InsurancePolicy = Tables<'patient_insurance_policies'>;
export type InsurancePolicyInsert = TablesInsert<'patient_insurance_policies'>;
export type CareTeamMember = Tables<'patient_care_team'>;
export type Vitals = Tables<'vitals'>;

export interface PatientFilters {
  search: string;
  status: 'all' | 'active' | 'inactive' | 'pending_payment';
  page: number;
  pageSize: number;
  /** When set → only patients whose branch_id matches; null = all branches. */
  branchId?: string | null;
}

export const DEFAULT_FILTERS: PatientFilters = {
  search: '',
  status: 'all',
  page: 0,
  pageSize: 20,
  branchId: null,
};

export interface PatientListResult {
  rows: Patient[];
  total: number;
}

export interface PatientDetail {
  patient: Patient;
  addresses: PatientAddress[];
  allergies: PatientAllergy[];
  insurance: InsurancePolicy[];
  careTeam: (CareTeamMember & { staff_full_name?: string; staff_role?: string })[];
  latestVitals: Vitals | null;
}
