export type InboxKind = 'approval' | 'task' | 'awareness';
export type InboxPriority = 'critical' | 'high' | 'normal' | 'low';

export interface InboxItem {
  id: string;
  source: 'exception_request' | 'purchase_order' | 'notification';
  /** Identity used for the inbox row & for decide_exception() — for exception_request items
   *  this is the request's own id, NOT the underlying invoice/PO id. */
  source_id: string;
  /** The id of the underlying record (invoice id, PO id, notification id) the request is about.
   *  May be missing on older view definitions; use SmartInboxService.resolveSourceRecordId(). */
  source_record_id?: string;
  kind: InboxKind;
  branch_id: string | null;
  subtype: string;
  priority_rank: number;
  priority: InboxPriority;
  title: string;
  subtitle: string | null;
  requested_by_id: string | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  amount_cents: number | null;
  required_perm: string;
  sla_due_at: string | null;
  created_at: string;
  action_url: string;
  payload: Record<string, unknown>;
}

export interface InboxFilters {
  branchId: string | null;
  kind: InboxKind | 'all';
  search: string;
}

export type Decision = 'approved' | 'rejected';

export interface HistoryRow {
  request_id: string;
  ticket_no: string;
  exception_type: string;
  category: string;
  severity: string;
  title: string;
  reason: string;
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  status: 'approved' | 'rejected';
  requested_by_id: string | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  requested_at: string;
  decided_by_id: string | null;
  decided_by_name: string | null;
  decided_by_role: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
  apply_error: string | null;
  hours_to_decide: number | null;
  invoice_number: string | null;
  invoice_subtotal_cents: number | null;
  invoice_discount_cents: number | null;
  invoice_total_cents: number | null;
  invoice_status: string | null;
  patient_id: string | null;
  patient_uhid: string | null;
  patient_name: string | null;
  final_discount_cents: number | null;
  requested_amount_cents: number | null;
}

export interface InvoiceApprovalContext {
  invoice: {
    id: string;
    invoice_number: string;
    subtotal_cents: number;
    discount_cents: number;
    total_cents: number;
    status: string;
    branch_id: string | null;
    notes: string | null;
  };
  patient: {
    id: string;
    uhid: string;
    full_name: string;
    mobile: string | null;
  } | null;
  /** Aggregated line-item totals by provenance (consultation, lab, pharmacy, …). */
  line_breakdown: { kind: string; count: number; total_cents: number }[];
}

export const LINE_KIND_LABEL: Record<string, string> = {
  doctor_visit:      'OPD consultation',
  doctor_visits:     'OPD consultation',
  lab_order:         'Lab',
  pharmacy_dispense: 'Pharmacy',
  pharmacy_indents:  'Pharmacy',
  blood_unit:        'Blood',
  blood_request:     'Blood',
  bed_assignment:    'IPD bed',
  bed_assignments:   'IPD bed',
  consolidated:      'Consolidated',
  ledger_backfill:   'Backfill',
  manual:            'Manual',
  other:             'Other',
};

export const PRIORITY_TONE: Record<InboxPriority, { dot: string; chip: string }> = {
  critical: { dot: 'bg-danger-fg', chip: 'bg-danger-bg text-danger-fg' },
  high:     { dot: 'bg-warn-fg',   chip: 'bg-warn-bg text-warn-fg' },
  normal:   { dot: 'bg-info-fg',   chip: 'bg-primary-50 text-primary-700' },
  low:      { dot: 'bg-ink-muted', chip: 'bg-surface-subtle text-ink-muted' },
};

export const KIND_LABEL: Record<InboxKind, string> = {
  approval:  'Approval',
  task:      'Task',
  awareness: 'Awareness',
};
