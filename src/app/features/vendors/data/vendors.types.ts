import type {
  Tables,
  VendorCategory,
  VendorPaymentMethod,
  VendorPaymentTerms,
} from '../../../core/supabase/supabase.types';

export type Vendor = Tables<'vendors'>;

export interface VendorAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export type VendorFilter = 'all' | 'active' | 'inactive';

export const CATEGORY_LABEL: Record<VendorCategory, string> = {
  pharmacy:    'Pharmacy',
  disposables: 'Disposables',
  equipment:   'Equipment',
  consumables: 'Consumables',
  reagents:    'Reagents',
  services:    'Services',
  f_and_b:     'F & B',
  stationery:  'Stationery',
  other:       'Other',
};

export const CATEGORY_TONE: Record<VendorCategory, string> = {
  pharmacy:    'bg-info-bg text-info-fg',
  disposables: 'bg-surface-subtle text-ink-soft',
  equipment:   'bg-warn-bg text-warn-fg',
  consumables: 'bg-surface-subtle text-ink-soft',
  reagents:    'bg-good-bg text-good-fg',
  services:    'bg-info-bg text-info-fg',
  f_and_b:     'bg-warn-bg text-warn-fg',
  stationery:  'bg-surface-subtle text-ink-muted',
  other:       'bg-surface-subtle text-ink-muted',
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
