import type {
  PoStatus,
  Tables,
  VendorBillMatchStatus,
  VendorBillStatus,
  VendorCategory,
  VendorPaymentMethodAp,
} from '../../../core/supabase/supabase.types';

export type VendorBill = Tables<'vendor_bills'>;
export type VendorBillItem = Tables<'vendor_bill_items'>;
export type VendorPayment = Tables<'vendor_payments'>;

export interface BillRow extends VendorBill {
  vendor: { id: string; code: string; name: string; category: VendorCategory } | null;
  po: { id: string; po_number: string; status: PoStatus } | null;
  created_by: { id: string; full_name: string } | null;
}

export interface BillDetail extends BillRow {
  items: VendorBillItem[];
  payments: VendorPayment[];
}

/** Receivable PO (sent / partially_received / fully_received / closed) for billing pickers. */
export interface BillablePo {
  id: string;
  po_number: string;
  status: PoStatus;
  category: VendorCategory;
  vendor: { id: string; code: string; name: string } | null;
  items: BillablePoLine[];
}

export interface BillablePoLine {
  id: string;
  description: string;
  uom: string;
  qty_ordered: number;
  qty_received: number;
  unit_price_cents: number;
  gst_rate: number;
}

export interface BillDraftLine {
  id: string;
  po_item_id: string | null;
  description: string;
  uom: string;
  qty_billed: number;
  unit_price_cents: number;
  discount_cents: number;
  gst_rate: number;
}

export type BillFilter =
  | 'all'
  | 'open'
  | 'awaiting_approval'
  | 'mismatch'
  | 'overdue'
  | 'paid';

export const STATUS_TONE: Record<VendorBillStatus, { chip: string; label: string }> = {
  draft:             { chip: 'bg-surface-subtle text-ink-muted',        label: 'Draft' },
  awaiting_approval: { chip: 'bg-warn-bg text-warn-fg',                  label: 'Awaiting approval' },
  approved:          { chip: 'bg-info-bg text-info-fg',                  label: 'Approved' },
  partially_paid:    { chip: 'bg-info-bg text-info-strong',              label: 'Partially paid' },
  paid:              { chip: 'bg-good-bg text-good-fg',                  label: 'Paid' },
  cancelled:         { chip: 'bg-surface-subtle text-ink-muted line-through', label: 'Cancelled' },
};

export const MATCH_TONE: Record<VendorBillMatchStatus, { chip: string; label: string }> = {
  matched:         { chip: 'bg-good-bg text-good-fg',     label: '3-way matched' },
  mismatch:        { chip: 'bg-danger-bg text-danger-fg', label: 'Mismatch' },
  pending_review:  { chip: 'bg-warn-bg text-warn-fg',     label: 'Review' },
  manual_override: { chip: 'bg-info-bg text-info-fg',     label: 'Override' },
};

export const PAYMENT_METHOD_LABEL: Record<VendorPaymentMethodAp, string> = {
  neft:       'NEFT',
  rtgs:       'RTGS',
  imps:       'IMPS',
  upi:        'UPI',
  cheque:     'Cheque',
  cash:       'Cash',
  adjustment: 'Adjustment',
};
