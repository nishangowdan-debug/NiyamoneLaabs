import type {
  PoFreightTerms,
  PoReturnsPolicy,
  PoStatus,
  PoType,
  Tables,
  VendorCategory,
  VendorPaymentMethod,
  VendorPaymentTerms,
} from '../../../core/supabase/supabase.types';

export type PurchaseOrder = Tables<'purchase_orders'>;
export type PurchaseOrderItem = Tables<'purchase_order_items'>;

export interface PoRow extends PurchaseOrder {
  vendor: { id: string; code: string; name: string; category: VendorCategory } | null;
}

export interface PoDetail extends PoRow {
  items: PurchaseOrderItem[];
}

export interface PoDraftLine {
  id: string;
  description: string;
  uom: string;
  qty_ordered: number;
  unit_price_cents: number;
  discount_cents: number;
  gst_rate: number;
  inventory_item_id?: string | null;
}

export type PoFilter = 'all' | 'open' | 'awaiting_approval' | 'sent' | 'received' | 'closed' | 'draft';

export const STATUS_TONE: Record<PoStatus, { chip: string; label: string }> = {
  draft:              { chip: 'bg-surface-subtle text-ink-muted',                label: 'Draft' },
  awaiting_approval:  { chip: 'bg-warn-bg text-warn-fg',                          label: 'Awaiting approval' },
  approved:           { chip: 'bg-info-bg text-info-fg',                          label: 'Approved' },
  sent:               { chip: 'bg-info-bg text-info-strong',                      label: 'Sent to vendor' },
  partially_received: { chip: 'bg-warn-bg text-warn-fg',                          label: 'Partially received' },
  fully_received:     { chip: 'bg-good-bg text-good-fg',                          label: 'Fully received' },
  closed:             { chip: 'bg-surface-subtle text-ink-muted',                 label: 'Closed' },
  cancelled:          { chip: 'bg-surface-subtle text-ink-muted line-through',    label: 'Cancelled' },
};

export const PO_TYPE_LABEL: Record<PoType, string> = {
  standard:  'Standard',
  blanket:   'Blanket',
  emergency: 'Emergency',
  service:   'Service',
};

export const FREIGHT_LABEL: Record<PoFreightTerms, string> = {
  vendor:   'Vendor pays',
  hospital: 'Hospital pays',
  split:    'Split',
};

export const RETURNS_LABEL: Record<PoReturnsPolicy, string> = {
  '30_day': '30-day returns',
  '15_day': '15-day returns',
  none:     'No returns',
};

export const TERMS_LABEL: Record<VendorPaymentTerms, string> = {
  immediate: 'Immediate',
  net_15:    'Net 15',
  net_30:    'Net 30',
  net_45:    'Net 45',
  net_60:    'Net 60',
  advance:   'Advance',
};

export const METHOD_LABEL: Record<VendorPaymentMethod, string> = {
  neft:   'NEFT',
  rtgs:   'RTGS',
  imps:   'IMPS',
  upi:    'UPI',
  cheque: 'Cheque',
  cash:   'Cash',
  loc:    'Letter of credit',
};
