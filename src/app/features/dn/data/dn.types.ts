import type {
  DebitNoteReason,
  DebitNoteStatus,
  Tables,
  VendorBillStatus,
  VendorCategory,
} from '../../../core/supabase/supabase.types';

export type DebitNote = Tables<'vendor_debit_notes'>;
export type DebitNoteItem = Tables<'vendor_debit_note_items'>;

export interface DnRow extends DebitNote {
  vendor: { id: string; code: string; name: string; category: VendorCategory } | null;
  grn: { id: string; grn_number: string } | null;
  bill: { id: string; bill_number_internal: string } | null;
  applied_to_bill: { id: string; bill_number_internal: string } | null;
}

export interface DnDetail extends DnRow {
  items: DebitNoteItem[];
}

/** Bills that an issued DN can be applied against (same vendor, open balance). */
export interface ApplicableBill {
  id: string;
  bill_number_internal: string;
  vendor_bill_number: string;
  total_cents: number;
  paid_total_cents: number;
  due_date: string;
  status: VendorBillStatus;
}

/** GRN suggestion proposal (returned by propose_debit_note_from_grn RPC). */
export interface DnProposal {
  grn_id: string;
  grn_number: string;
  po_id: string | null;
  item_count: number;
  items: DnProposalLine[];
}

export interface DnProposalLine {
  grn_item_id: string | null;
  po_item_id: string | null;
  inventory_item_id: string | null;
  description: string;
  uom: string;
  qty: number;
  unit_price_cents: number;
  gst_rate: number;
  reason_code: DebitNoteReason;
}

export interface DnDraftLine {
  id: string;
  grn_item_id: string | null;
  po_item_id: string | null;
  inventory_item_id: string | null;
  description: string;
  uom: string;
  qty: number;
  unit_price_cents: number;
  gst_rate: number;
  reason_code: DebitNoteReason;
}

export type DnFilter = 'all' | 'open' | 'draft' | 'issued' | 'applied' | 'cancelled';

export const STATUS_TONE: Record<DebitNoteStatus, { chip: string; label: string }> = {
  draft:     { chip: 'bg-surface-subtle text-ink-muted',                 label: 'Draft' },
  issued:    { chip: 'bg-warn-bg text-warn-fg',                          label: 'Issued' },
  applied:   { chip: 'bg-good-bg text-good-fg',                          label: 'Applied' },
  cancelled: { chip: 'bg-surface-subtle text-ink-muted line-through',    label: 'Cancelled' },
};

export const REASON_LABEL: Record<DebitNoteReason, string> = {
  damaged:         'Damaged',
  short:           'Short',
  expired:         'Expired',
  price_variance:  'Price variance',
  qty_variance:    'Qty variance',
  other:           'Other',
};
