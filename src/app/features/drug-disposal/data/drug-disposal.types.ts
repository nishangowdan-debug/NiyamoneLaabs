export type DisposalReason =
  | 'expired' | 'damaged' | 'recalled' | 'contaminated'
  | 'wrong_storage' | 'partial_dose' | 'breakage' | 'other';

export type DisposalMethod =
  | 'incineration' | 'authorized_vendor' | 'return_to_manufacturer' | 'effluent_treatment'
  | 'pollution_control_incineration' | 'encapsulation' | 'landfill' | 'other';

export type DisposalStatus = 'pending' | 'quarantined' | 'disposed' | 'cancelled';

export type RecallSeverity = 'mandatory' | 'voluntary' | 'market_withdrawal';

export const REASON_LABELS: Record<DisposalReason, string> = {
  expired: 'Expired', damaged: 'Damaged', recalled: 'Recalled',
  contaminated: 'Contaminated', wrong_storage: 'Wrong storage',
  partial_dose: 'Partial dose', breakage: 'Breakage', other: 'Other',
};

export const METHOD_LABELS: Record<DisposalMethod, string> = {
  incineration: 'Incineration',
  authorized_vendor: 'Authorized disposal vendor',
  return_to_manufacturer: 'Return to manufacturer',
  effluent_treatment: 'Effluent treatment',
  pollution_control_incineration: 'Pollution-control board incineration',
  encapsulation: 'Encapsulation',
  landfill: 'Landfill (after deactivation)',
  other: 'Other',
};

export const SEVERITY_LABELS: Record<RecallSeverity, string> = {
  mandatory: 'Mandatory', voluntary: 'Voluntary', market_withdrawal: 'Market withdrawal',
};

export interface ExpiringInventoryRow {
  item_id: string;
  sku: string | null;
  name: string;
  generic_name: string | null;
  controlled_class: string | null;
  batch_id: string;
  expiry_date: string;
  qty_on_hand: number;
  bucket: 'expired' | 'expiring_30d' | 'expiring_90d' | 'ok';
  days_to_expiry: number;
}

export interface DrugDisposal {
  id: string;
  disposal_no: string;
  item_id: string;
  batch_id: string;
  qty: number;
  reason: DisposalReason;
  reason_details: string | null;
  method: DisposalMethod | null;
  status: DisposalStatus;
  is_controlled: boolean;
  quarantined_at: string | null;
  disposed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  disposed_by_name: string | null;
  witness_name: string | null;
  drug_inspector_witnessed: boolean;
  drug_inspector_name: string | null;
  drug_inspector_id_no: string | null;
  vendor_id: string | null;
  vendor_certificate_no: string | null;
  vendor_certificate_url: string | null;
  recall_id: string | null;
  controlled_register_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrugRecall {
  id: string;
  item_id: string | null;
  generic_pattern: string | null;
  batch_pattern: string | null;
  recall_no: string | null;
  severity: RecallSeverity;
  source: string;
  recall_reason: string;
  notice_received_at: string;
  recall_completed_at: string | null;
  notes: string | null;
}
