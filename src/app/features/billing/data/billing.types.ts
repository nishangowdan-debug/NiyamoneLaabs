import type {
  InvoiceStatus,
  PaymentMethod,
  ServiceCategory,
  Tables,
} from '../../../core/supabase/supabase.types';

export type Invoice = Tables<'invoices'>;
export type InvoiceItem = Tables<'invoice_items'>;
export type Payment = Tables<'payments'>;
export type Service = Tables<'services'>;

export interface InvoiceRow extends Invoice {
  patient: {
    id: string;
    uhid: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
    mobile: string;
  } | null;
  doctor?: {
    id: string;
    full_name: string;
    metadata?: Record<string, unknown> | null;
  } | null;
  /** Branch the invoice was filed under. Joined via invoices.branch_id and
   *  surfaced as a column on the billing list so a super admin viewing
   *  "All hospitals" can see at-a-glance which branch each bill belongs to. */
  branch?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface InvoiceDetail extends InvoiceRow {
  items: InvoiceItem[];
  payments: Payment[];
}

export type InvoiceFilter = 'all' | 'unpaid' | 'partially_paid' | 'paid' | 'draft' | 'void';

export interface DraftLine {
  id: string;
  /** Real `invoice_items.id` when the line was loaded from an existing invoice.
   *  Undefined for lines added in the editor — those become `bill_add_item` calls
   *  on save, while lines with this set route through `bill_edit_item` /
   *  `bill_delete_item`. Distinct from `id` (a client-side form key). */
  _origItemId?: string | null;
  service_code: string;
  description: string;
  qty: number;
  unit_price_cents: number;
  discount_cents: number;
  gst_rate: number;
  /** Per-line routing for lab tests. Defaults from `lab_tests.default_routing`
   *  when a lab service is picked; only meaningful for lab line items. */
  routing?: 'inhouse' | 'outsource';
  /** Set by the back-end auto-bill triggers — identifies what kind of clinical
   *  action produced this line. NULL means a free-form / manual entry. */
  related_entity_type?: string | null;
}

/** Friendly label + color tone for invoice-line provenance. Drives the badge
 *  shown next to each row on the Edit invoice screen. */
export const LINE_KIND_TONE: Record<string, { label: string; chip: string }> = {
  pharmacy_dispense: { label: 'Pharmacy',     chip: 'bg-emerald-50  text-emerald-700  border-emerald-200' },
  pharmacy_indents:  { label: 'Pharmacy',     chip: 'bg-emerald-50  text-emerald-700  border-emerald-200' },
  lab_order:         { label: 'Lab',          chip: 'bg-violet-50   text-violet-700   border-violet-200'  },
  doctor_visit:      { label: 'Doctor visit', chip: 'bg-sky-50      text-sky-700      border-sky-200'     },
  doctor_visits:     { label: 'Doctor visit', chip: 'bg-sky-50      text-sky-700      border-sky-200'     },
  blood_unit:        { label: 'Blood',        chip: 'bg-rose-50     text-rose-700     border-rose-200'    },
  blood_request:     { label: 'Blood',        chip: 'bg-rose-50     text-rose-700     border-rose-200'    },
  bed_assignment:    { label: 'Bed-day',      chip: 'bg-amber-50    text-amber-700    border-amber-200'   },
  bed_assignments:   { label: 'Bed-day',      chip: 'bg-amber-50    text-amber-700    border-amber-200'   },
  consolidated:      { label: 'Consolidated', chip: 'bg-slate-50    text-slate-700    border-slate-200'   },
  ledger_backfill:   { label: 'Backfill',     chip: 'bg-slate-50    text-slate-700    border-slate-200'   },
  manual:            { label: 'Manual',       chip: 'bg-primary-50  text-primary-700  border-primary-200' },
  home_collection:   { label: '🏠 Pickup',    chip: 'bg-cyan-50     text-cyan-700     border-cyan-200'    },
};

export const STATUS_TONE: Record<InvoiceStatus, { chip: string; label: string }> = {
  draft:           { chip: 'bg-surface-subtle text-ink-muted', label: 'Draft' },
  issued:          { chip: 'bg-info-bg text-info-fg',          label: 'Issued' },
  partially_paid:  { chip: 'bg-warn-bg text-warn-fg',          label: 'Partial' },
  paid:            { chip: 'bg-good-bg text-good-fg',          label: 'Paid' },
  void:            { chip: 'bg-surface-subtle text-ink-muted line-through', label: 'Void' },
  refunded:        { chip: 'bg-danger-bg text-danger-fg',      label: 'Refunded' },
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash:        'Cash',
  card:        'Card',
  upi:         'UPI',
  net_banking: 'Net banking',
  cheque:      'Cheque',
  insurance:   'Insurance',
  adjustment:  'Adjustment',
};

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  consultation: 'Consultation',
  ipd_room:     'IPD room',
  procedure:    'Procedure',
  lab:          'Lab',
  pharmacy:     'Pharmacy',
  imaging:      'Imaging',
  other:        'Other',
};
