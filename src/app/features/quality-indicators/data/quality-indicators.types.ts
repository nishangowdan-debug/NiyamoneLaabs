export type QiDirection = 'higher_is_better' | 'lower_is_better' | 'target_value';
export type QiPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type QiCategory =
  | 'clinical' | 'patient_safety' | 'financial' | 'operational'
  | 'patient_experience' | 'staff' | 'infection_control';

export const CATEGORY_LABELS: Record<QiCategory, string> = {
  clinical: 'Clinical', patient_safety: 'Patient Safety',
  financial: 'Financial', operational: 'Operational',
  patient_experience: 'Patient Experience', staff: 'Staff',
  infection_control: 'Infection Control',
};

export const DIRECTION_LABELS: Record<QiDirection, string> = {
  higher_is_better: '↑ higher better',
  lower_is_better: '↓ lower better',
  target_value: '→ target',
};

export interface QualityIndicator {
  id: string;
  code: string;
  name: string;
  category: QiCategory;
  description: string | null;
  numerator_def: string | null;
  denominator_def: string | null;
  unit: string | null;
  target_value: number | null;
  benchmark_value: number | null;
  direction: QiDirection;
  period: QiPeriod;
  data_source: string | null;
  is_nabh_mandatory: boolean;
  is_active: boolean;
}

export interface QualityMeasurement {
  id: string;
  indicator_id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  numerator: number | null;
  denominator: number | null;
  measured_value: number | null;
  notes: string | null;
  computed_by_name: string | null;
  is_auto_computed: boolean;
  created_at: string;
}

export interface LiveKpiRow {
  code: string;
  name: string;
  category: QiCategory;
  unit: string | null;
  target_value: number | null;
  direction: QiDirection;
  measured_value: number | null;
  numerator: number | null;
  denominator: number | null;
  is_below_target: boolean;
}
