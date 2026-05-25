import type {
  LabResultFlag,
  LabSampleStatus,
  Tables,
} from '../../../core/supabase/supabase.types';

export type LabTest = Tables<'lab_tests'>;
export type LabOrder = Tables<'lab_orders'>;
export type LabResult = Tables<'lab_results'>;

export interface LabResultRow extends LabResult {
  test: Pick<LabTest, 'code' | 'name' | 'category' | 'unit' | 'ref_min' | 'ref_max' | 'critical_low' | 'critical_high'>;
}

export interface LabOrderRow extends LabOrder {
  patient: {
    id: string;
    uhid: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    mobile: string;
  } | null;
  doctor: { id: string; full_name: string } | null;
  results: LabResultRow[];
  totals: {
    total: number;
    pending: number;
    entered: number;
    verified: number;
    critical: number;
  };
}

export type LabFilter = 'pending' | 'collected' | 'running' | 'verify' | 'verified' | 'critical' | 'all';

// Extended types for the LIS/RIS workflow
export interface LabOrderRowEx extends LabOrderRow {
  billing_status?: 'unpaid' | 'paid' | 'credit' | 'waived';
  is_credit?: boolean;
  barcode_id?: string | null;
  pacs_url?: string | null;
  dicom_uploaded_at?: string | null;
  report_html?: string | null;
}

export interface RadiologySlot {
  id: string;
  branch_id: string;
  machine: string;
  start_at: string;
  end_at: string;
  lab_order_id: string | null;
  patient_id: string | null;
  status: 'free' | 'booked' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
}

export const LAB_TAB_OPTIONS = [
  { id: 'phlebotomy'  as const, label: 'Phlebotomy', icon: '💉' },
  { id: 'processing'  as const, label: 'Processing', icon: '🧪' },
  { id: 'verification' as const, label: 'Verification', icon: '✅' },
  { id: 'radiology'   as const, label: 'Radiology', icon: '🩻' },
];
export type LabTab = typeof LAB_TAB_OPTIONS[number]['id'];

export const STATUS_TONE: Record<LabSampleStatus, { chip: string; label: string }> = {
  pending:    { chip: 'bg-info-bg text-info-fg',          label: 'Pending collection' },
  collected:  { chip: 'bg-warn-bg text-warn-fg',          label: 'Collected' },
  running:    { chip: 'bg-good-bg text-good-fg',          label: 'Running' },
  verified:   { chip: 'bg-surface-subtle text-ink-muted', label: 'Verified' },
  rejected:   { chip: 'bg-danger-bg text-danger-fg',      label: 'Rejected' },
  cancelled:  { chip: 'bg-surface-subtle text-ink-muted', label: 'Cancelled' },
};

export const FLAG_TONE: Record<LabResultFlag, { chip: string; label: string }> = {
  normal:        { chip: 'bg-good-bg text-good-fg',          label: 'Normal' },
  low:           { chip: 'bg-warn-bg text-warn-fg',          label: 'Low' },
  high:          { chip: 'bg-warn-bg text-warn-fg',          label: 'High' },
  critical_low:  { chip: 'bg-danger-bg text-danger-strong',  label: 'CRIT-LOW' },
  critical_high: { chip: 'bg-danger-bg text-danger-strong',  label: 'CRIT-HIGH' },
};
