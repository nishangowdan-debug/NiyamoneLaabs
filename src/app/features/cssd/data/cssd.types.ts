export type SterilizerType =
  | 'steam_autoclave' | 'eto' | 'plasma' | 'dry_heat'
  | 'liquid_chemical' | 'ozone' | 'formaldehyde';

export type LoadStatus =
  | 'preparing' | 'running' | 'passed' | 'failed'
  | 'quarantined' | 'recalled' | 'released';

export type IndicatorResult = 'pass' | 'fail' | 'pending' | 'not_applicable';

export type SetInstanceStatus =
  | 'clean' | 'packaged' | 'in_load' | 'sterile' | 'dispatched'
  | 'in_use' | 'contaminated' | 'returned' | 'reprocess' | 'retired';

export const STERILIZER_TYPE_LABELS: Record<SterilizerType, string> = {
  steam_autoclave: 'Steam Autoclave', eto: 'ETO', plasma: 'Plasma',
  dry_heat: 'Dry Heat', liquid_chemical: 'Liquid Chemical',
  ozone: 'Ozone', formaldehyde: 'Formaldehyde',
};

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  preparing: 'Preparing', running: 'Running', passed: 'Passed',
  failed: 'Failed', quarantined: 'Quarantined', recalled: 'Recalled',
  released: 'Released',
};

export const SET_STATUS_LABELS: Record<SetInstanceStatus, string> = {
  clean: 'Clean', packaged: 'Packaged', in_load: 'In Load',
  sterile: 'Sterile', dispatched: 'Dispatched', in_use: 'In Use',
  contaminated: 'Contaminated', returned: 'Returned',
  reprocess: 'Reprocess', retired: 'Retired',
};

export interface CssdSterilizer {
  id: string;
  code: string;
  name: string;
  sterilizer_type: SterilizerType;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  location: string | null;
  is_active: boolean;
}

export interface CssdItemSet {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  contents: { name: string; quantity: number }[];
  expected_count: number | null;
  preferred_sterilizer_type: SterilizerType | null;
  shelf_life_days: number | null;
  is_active: boolean;
}

export interface CssdLoad {
  id: string;
  load_no: string;
  sterilizer_id: string;
  cycle_program: string | null;
  started_at: string | null;
  completed_at: string | null;
  temp_c: number | null;
  pressure_bar: number | null;
  hold_time_minutes: number | null;
  total_cycle_minutes: number | null;
  bowie_dick_test: IndicatorResult | null;
  chemical_indicator: IndicatorResult | null;
  biological_indicator: IndicatorResult | null;
  bi_lot_no: string | null;
  status: LoadStatus;
  released_at: string | null;
  released_by_name: string | null;
  failure_reason: string | null;
  recall_reason: string | null;
  operator_name: string | null;
  notes: string | null;
}

export interface CssdSetInstance {
  id: string;
  set_no: string;
  item_set_id: string;
  current_status: SetInstanceStatus;
  packaged_at: string | null;
  packaged_count: number | null;
  current_load_id: string | null;
  sterilized_at: string | null;
  expires_at: string | null;
  dispatched_at: string | null;
  dispatched_to: string | null;
  returned_at: string | null;
  returned_count: number | null;
  count_discrepancy: boolean | null;
  reprocess_count: number;
}

export interface SterileStockRow {
  item_set_id: string;
  code: string;
  name: string;
  category: string | null;
  sterile_available: number;
  sterile_expired: number;
  in_use: number;
  in_load: number;
  pending_reprocess: number;
}
