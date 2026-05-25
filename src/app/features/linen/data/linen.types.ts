export type LinenMovementType =
  | 'procurement' | 'issue_to_ward' | 'return_soiled' | 'sent_to_laundry'
  | 'returned_clean' | 'condemned' | 'lost' | 'damaged' | 'adjustment' | 'transfer';

export type LinenState = 'clean' | 'in_use' | 'soiled' | 'in_wash' | 'condemned' | 'lost';

export const MOVEMENT_LABELS: Record<LinenMovementType, string> = {
  procurement: 'Procurement', issue_to_ward: 'Issue to Ward',
  return_soiled: 'Return Soiled', sent_to_laundry: 'Sent to Laundry',
  returned_clean: 'Returned Clean', condemned: 'Condemned',
  lost: 'Lost', damaged: 'Damaged', adjustment: 'Adjustment', transfer: 'Transfer',
};

export const STATE_LABELS: Record<LinenState, string> = {
  clean: 'Clean', in_use: 'In Use', soiled: 'Soiled',
  in_wash: 'In Wash', condemned: 'Condemned', lost: 'Lost',
};

export interface LinenCategory {
  id: string;
  code: string;
  name: string;
  category: string | null;
  par_stock: number;
  reorder_level: number;
  unit_cost_cents: number | null;
  shelf_life_washes: number | null;
  is_active: boolean;
}

export interface LinenStockRow {
  category_id: string;
  code: string;
  name: string;
  category: string | null;
  par_stock: number;
  reorder_level: number;
  clean: number;
  in_use: number;
  soiled: number;
  in_wash: number;
  condemned: number;
  lost: number;
  active_total: number;
}

export interface LinenMovement {
  id: string;
  category_id: string;
  movement_type: LinenMovementType;
  qty: number;
  from_location: string | null;
  to_location: string | null;
  from_state: LinenState | null;
  to_state: LinenState | null;
  reason: string | null;
  performed_at: string;
  performed_by_name: string | null;
  notes: string | null;
}

export interface LinenWashCycle {
  id: string;
  lot_no: string;
  started_at: string;
  completed_at: string | null;
  wash_temperature_c: number | null;
  wash_duration_min: number | null;
  detergent: string | null;
  disinfectant: string | null;
  disinfectant_ppm: number | null;
  is_high_risk: boolean;
  total_pieces: number;
  rejected_pieces: number;
  operator_name: string | null;
  notes: string | null;
}
