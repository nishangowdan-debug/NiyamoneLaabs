export interface ReportKpis {
  appointments_today: number;
  beds_occupied: number;
  beds_total: number;
  admissions_active: number;
  lab_samples_pending: number;
  prescriptions_today: number;
  patients_total: number;
  revenue_today_cents: number;
  revenue_30d_cents: number;
  ap_outstanding_cents: number;
  ar_outstanding_cents: number;
}

export interface ApAgingBucket {
  bucket: string;
  sort_order: number;
  bill_count: number;
  outstanding_cents: number;
}

export interface ProcurementSpendRow {
  category: string;
  po_count: number;
  total_cents: number;
}

export interface ExpiryRiskBucket {
  bucket: string;
  sort_order: number;
  batch_count: number;
  qty_at_risk: number;
  cost_at_risk_cents: number;
}

export interface VendorScorecardRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  po_count: number;
  total_spend_cents: number;
  bill_count: number;
  matched_bill_count: number;
  on_time_grn_count: number;
  total_grn_count: number;
}

export interface RevenueRow {
  category: string;
  invoice_count: number;
  line_count: number;
  revenue_cents: number;
}

export type WindowDays = 30 | 60 | 90 | 180;

export const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 30,  label: 'Last 30 days' },
  { value: 60,  label: 'Last 60 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
];

export const CATEGORY_LABEL: Record<string, string> = {
  pharmacy:     'Pharmacy',
  disposables:  'Disposables',
  equipment:    'Equipment',
  consumables:  'Consumables',
  reagents:     'Reagents',
  services:     'Services',
  f_and_b:      'F & B',
  stationery:   'Stationery',
  other:        'Other',
  consultation: 'Consultation',
  ipd_room:     'IPD room',
  procedure:    'Procedure',
  lab:          'Lab',
  imaging:      'Imaging',
  uncategorized:'Uncategorised',
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c.replace('_', ' ');
}
