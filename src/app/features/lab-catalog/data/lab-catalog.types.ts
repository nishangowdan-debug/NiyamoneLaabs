import type { Tables } from '../../../core/supabase/supabase.types';

export type LabTest = Tables<'lab_tests'>;

export interface LabTestPrice {
  branch_id: string;
  lab_test_id: string;
  price_inr: number;
  home_collection_eligible: boolean;
  home_collection_surcharge_inr: number;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface LabTestWithPrice extends LabTest {
  price?: LabTestPrice | null;
  /** Number of `lab_test_parameters` rows configured for this test. 0 when the
   *  parameters table is missing or no rows exist. */
  parameter_count?: number;
}

export interface LabTestForm {
  code: string;
  name: string;
  category: LabTest['category'];
  specimen_type: LabTest['specimen_type'];
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  critical_low: number | null;
  critical_high: number | null;
  turnaround_hours: number | null;
  price_inr: number;
  home_collection_eligible: boolean;
  home_collection_surcharge_inr: number;
  is_active: boolean;
  /** Catalog hint that prefills the per-line toggle on the billing form.
   *  Cashier can still override per invoice. */
  default_routing: 'inhouse' | 'outsource';
}

// ── Per-test parameter rows (CBC → Hb, RBC, WBC ...) ──────────────────

/** Font/styling overrides for a parameter row when rendered into a PDF. */
export interface ParameterFont {
  family?: string;
  size?: number;
  weight?: 'normal' | 'bold';
  italic?: boolean;
  color?: string;
}

/** Reference-range override keyed by patient cohort. The renderer matches the
 *  first scope that applies; falls back to the row's scalar low/high. */
export type RefScope =
  | 'male'
  | 'female'
  | 'pregnancy_t1'
  | 'pregnancy_t2'
  | 'pregnancy_t3'
  | 'pediatric_under_12'
  | 'pediatric'
  | 'adult'
  | string;

export interface RefOverride {
  scope: RefScope;
  low?: number | null;
  high?: number | null;
  display?: string | null;
}

/** Static catalog of cohort scopes for the editor dropdown.
 *  Keep order = report rendering preference (most specific → most generic). */
export const REF_SCOPES: { value: RefScope; label: string }[] = [
  { value: 'pregnancy_t1',       label: 'Pregnancy · 1st trimester' },
  { value: 'pregnancy_t2',       label: 'Pregnancy · 2nd trimester' },
  { value: 'pregnancy_t3',       label: 'Pregnancy · 3rd trimester' },
  { value: 'female',             label: 'Adult female' },
  { value: 'male',               label: 'Adult male' },
  { value: 'pediatric_under_12', label: 'Pediatric (< 12 yrs)' },
  { value: 'pediatric',          label: 'Pediatric' },
  { value: 'adult',              label: 'Adult (any sex)' },
];

/** DB row for a single parameter under one test. */
export interface LabTestParameter {
  id: string;
  lab_test_id: string;
  sno: number;
  is_section_header: boolean;
  section: string | null;
  parameter: string;
  default_value: string | null;
  unit: string | null;
  low_value: number | null;
  high_value: number | null;
  normal_range_display: string | null;
  method: string | null;
  font: ParameterFont;
  ref_overrides: RefOverride[];
  created_at: string;
  updated_at: string;
}

/** Editor-side draft with optional id (null for unsaved rows). */
export interface ParameterDraft {
  id: string | null;
  sno: number;
  is_section_header: boolean;
  section: string | null;
  parameter: string;
  default_value: string | null;
  unit: string | null;
  low_value: number | null;
  high_value: number | null;
  normal_range_display: string | null;
  method: string | null;
  font: ParameterFont;
  ref_overrides: RefOverride[];
}
