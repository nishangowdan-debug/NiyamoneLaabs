import type {
  GrnCondition,
  GrnQcStatus,
  GrnStatus,
  PoStatus,
  Tables,
  VendorCategory,
} from '../../../core/supabase/supabase.types';

export type GoodsReceipt = Tables<'goods_receipts'>;
export type GoodsReceiptItem = Tables<'goods_receipt_items'>;

export interface GrnRow extends GoodsReceipt {
  po: {
    id: string;
    po_number: string;
    category: VendorCategory;
    status: PoStatus;
    vendor: { id: string; code: string; name: string } | null;
  } | null;
  received_by: { id: string; full_name: string } | null;
}

export interface GrnDetail extends GrnRow {
  items: GoodsReceiptItem[];
}

/** PO header + open lines that are receivable. */
export interface ReceivablePo {
  id: string;
  po_number: string;
  status: PoStatus;
  category: VendorCategory;
  expected_delivery_date: string | null;
  vendor: { id: string; code: string; name: string } | null;
  items: ReceivablePoLine[];
}

export interface ReceivablePoLine {
  id: string;
  inventory_item_id: string | null;
  description: string;
  uom: string;
  qty_ordered: number;
  qty_received: number;
  qty_open: number;
  unit_price_cents: number;
}

export interface GrnDraftLine {
  id: string;
  po_item_id: string;
  inventory_item_id: string | null;
  description: string;
  uom: string;
  qty_open: number;
  qty_received: number;
  batch_number: string;
  mfg_date: string;
  expiry_date: string;
  unit_cost_cents: number;
  condition: GrnCondition;
  notes: string;
}

export type GrnFilter = 'all' | 'today' | 'pending_qc' | 'passed' | 'failed';

export const QC_TONE: Record<GrnQcStatus, { chip: string; label: string }> = {
  pending: { chip: 'bg-warn-bg text-warn-fg',     label: 'QC pending' },
  passed:  { chip: 'bg-good-bg text-good-fg',     label: 'QC passed'  },
  failed:  { chip: 'bg-danger-bg text-danger-fg', label: 'QC failed'  },
};

export const STATUS_TONE: Record<GrnStatus, { chip: string; label: string }> = {
  draft:    { chip: 'bg-surface-subtle text-ink-muted',           label: 'Draft' },
  posted:   { chip: 'bg-info-bg text-info-fg',                    label: 'Posted' },
  rejected: { chip: 'bg-surface-subtle text-ink-muted line-through', label: 'Rejected' },
};

export const CONDITION_LABEL: Record<GrnCondition, string> = {
  good:     'Good',
  damaged:  'Damaged',
  short:    'Short',
  expired:  'Expired',
};
