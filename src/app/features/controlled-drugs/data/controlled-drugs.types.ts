export type ControlledClass =
  | 'none' | 'schedule_h' | 'schedule_h1' | 'schedule_x'
  | 'ndps_narcotic' | 'ndps_psychotropic';

export type CSEntryType =
  | 'opening' | 'receipt' | 'dispense' | 'return'
  | 'wastage' | 'adjustment' | 'transfer_in' | 'transfer_out';

export const CONTROLLED_CLASS_LABELS: Record<ControlledClass, string> = {
  none: 'Not controlled',
  schedule_h: 'Schedule H',
  schedule_h1: 'Schedule H1',
  schedule_x: 'Schedule X',
  ndps_narcotic: 'NDPS · Narcotic',
  ndps_psychotropic: 'NDPS · Psychotropic',
};

export const CS_ENTRY_LABELS: Record<CSEntryType, string> = {
  opening: 'Opening', receipt: 'Receipt', dispense: 'Dispense', return: 'Return',
  wastage: 'Wastage', adjustment: 'Adjustment', transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
};

export interface ControlledInventoryRow {
  item_id: string;
  sku: string | null;
  name: string;
  generic_name: string | null;
  strengths: string[] | null;
  controlled_class: ControlledClass;
  batch_id: string | null;
  expiry_date: string | null;
  qty_on_hand: number;
  balance_updated_at: string | null;
}

export interface RegisterEntry {
  id: string;
  branch_id: string | null;
  item_id: string;
  batch_id: string;
  entry_at: string;
  entry_type: CSEntryType;
  qty_change: number;
  balance_after: number;
  source_table: string | null;
  source_id: string | null;
  patient_id: string | null;
  prescription_item_id: string | null;
  prescribed_by_staff_id: string | null;
  recorded_by_staff_id: string | null;
  witness_staff_id: string | null;
  witness_name: string | null;
  witness_signature_dataurl: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReconciliationRow {
  id: string;
  item_id: string;
  batch_id: string;
  performed_at: string;
  expected_qty: number;
  actual_qty: number;
  variance: number;
  reason: string | null;
  performed_by_staff_id: string | null;
  witnessed_by_staff_id: string | null;
  adjustment_entry_id: string | null;
}
