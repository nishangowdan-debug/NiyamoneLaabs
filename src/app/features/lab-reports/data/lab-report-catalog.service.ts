import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { ExportColumn } from '../../../shared/export/export.types';

/**
 * The Report Catalog is the operational counterpart to the dashboard:
 * every report below is a row-level register intended for export to CSV /
 * Excel. These are NOT the patient-facing PDF reports and are NOT the
 * billing invoices — they are management/audit views of the lab workflow.
 *
 * Each entry declares:
 *   • id        — stable handle (used in filenames, query params)
 *   • stage     — workflow grouping ('Registration', 'Collection', …)
 *   • title     — sheet/report title
 *   • description — one-line hint for the picker UI
 *   • columns   — typed ExportColumn[] consumed by the CSV/Excel adapters
 *   • requiresDateRange — false for snapshots (catalogs / queues), true for logs
 *   • fetch     — pulls rows from Supabase. Caller passes branch + range.
 *
 * Adding a new report = adding one entry to REGISTRY at the bottom.
 */

export type LabReportStage =
  | 'Registration'
  | 'Sample collection'
  | 'Home collection'
  | 'Processing'
  | 'Reporting'
  | 'Critical alerts'
  | 'Outsource'
  | 'Billing'
  | 'Master data';

export interface LabReportFetchParams {
  branchId: string | null;
  from: string;        // ISO timestamp (range start, inclusive)
  to: string;          // ISO timestamp (range end, inclusive)
}

export interface LabReportDefinition<TRow extends object = Record<string, unknown>> {
  id: string;
  stage: LabReportStage;
  title: string;
  description: string;
  columns: ExportColumn<TRow>[];
  requiresDateRange: boolean;
  /** Defaults to `ordered_at`/`created_at` based on the report; documented here. */
  rangeColumnHint?: string;
  fetch: (svc: LabReportCatalogService, params: LabReportFetchParams) => Promise<TRow[]>;
}

// ─── Row shapes ───────────────────────────────────────────────────────────
export interface OrderRegisterRow {
  order_id: string;
  ordered_at: string;
  priority: string;
  status: string;
  sample_status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  patient_mobile: string | null;
  patient_gender: string | null;
  patient_age: number | null;
  doctor_name: string | null;
  test_count: number;
  notes: string | null;
}

export interface CollectionLogRow {
  order_id: string;
  collected_at: string | null;
  age_hours_to_collection: number | null;
  ordered_at: string;
  priority: string;
  sample_status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  collected_by: string | null;
  rejection_reason: string | null;
}

export interface PendingCollectionRow {
  order_id: string;
  ordered_at: string;
  priority: string;
  patient_uhid: string | null;
  patient_name: string | null;
  patient_mobile: string | null;
  doctor_name: string | null;
  hours_since_order: number;
}

export interface RejectionRow {
  order_id: string;
  ordered_at: string;
  patient_uhid: string | null;
  patient_name: string | null;
  rejection_reason: string;
  sample_status: string;
  priority: string;
  doctor_name: string | null;
}

export interface HomeCollectionRow {
  request_id: string;
  scheduled_at: string;
  status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  contact_mobile: string;
  address: string;
  phlebotomist: string | null;
  total_inr: number;
  paid_inr: number;
  payment_method: string;
  collected_at: string | null;
  created_at: string;
}

export interface HomeCollectionItemRow {
  request_id: string;
  scheduled_at: string;
  patient_uhid: string | null;
  patient_name: string | null;
  test_code: string;
  test_name: string;
  test_category: string | null;
  price_inr: number;
  surcharge_inr: number;
  lab_order_id: string | null;
}

export interface ResultRow {
  result_id: string;
  order_id: string;
  status: string;
  flag: string | null;
  value: string;
  unit: string | null;
  ref_range: string | null;
  test_code: string;
  test_name: string;
  test_category: string | null;
  entered_at: string | null;
  entered_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  patient_uhid: string | null;
  patient_name: string | null;
}

export interface PendingEntryRow {
  result_id: string;
  order_id: string;
  ordered_at: string;
  priority: string;
  patient_uhid: string | null;
  patient_name: string | null;
  test_code: string;
  test_name: string;
  test_category: string | null;
  target_tat_hours: number | null;
  hours_since_order: number;
}

export interface CriticalResultRow {
  result_id: string;
  order_id: string;
  flag: string;
  value: string;
  unit: string | null;
  ref_range: string | null;
  test_code: string;
  test_name: string;
  patient_uhid: string | null;
  patient_name: string | null;
  patient_mobile: string | null;
  doctor_name: string | null;
  entered_at: string | null;
  verified_at: string | null;
}

export interface CriticalAlertRow {
  alert_id: string;
  raised_at: string;
  status: string;
  acknowledged_at: string | null;
  minutes_to_ack: number | null;
  order_id: string;
  patient_uhid: string | null;
  patient_name: string | null;
}

export interface OutsourceDispatchRow {
  dispatch_id: string;
  dispatch_no: string;
  status: string;
  dispatched_at: string;
  expected_return_at: string | null;
  received_at: string | null;
  reported_at: string | null;
  tat_hours: number | null;
  reference_lab_code: string | null;
  reference_lab_name: string | null;
  courier_name: string | null;
  awb_number: string | null;
  order_id: string;
  patient_uhid: string | null;
  patient_name: string | null;
}

export interface OutsourceOverdueRow {
  dispatch_id: string;
  dispatch_no: string;
  status: string;
  dispatched_at: string;
  expected_return_at: string;
  hours_overdue: number;
  reference_lab_name: string | null;
  patient_uhid: string | null;
  patient_name: string | null;
}

export interface ReferenceLabRow {
  code: string;
  name: string;
  accreditation: string | null;
  default_tat_hours: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  is_active: boolean;
}

export interface FinalReportRow {
  order_id: string;
  reported_at: string;
  ordered_at: string;
  tat_hours: number;
  priority: string;
  patient_uhid: string | null;
  patient_name: string | null;
  doctor_name: string | null;
  reported_by: string | null;
  test_count: number;
  critical_count: number;
}

export interface OrderTatRow {
  order_id: string;
  ordered_at: string;
  collected_at: string | null;
  reported_at: string | null;
  collection_lag_hours: number | null;
  processing_hours: number | null;
  total_tat_hours: number | null;
  priority: string;
  patient_uhid: string | null;
  patient_name: string | null;
  status: string;
}

export interface InvoiceRegisterRow {
  invoice_number: string;
  invoice_date: string;
  status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  patient_mobile: string | null;
  subtotal_inr: number;
  discount_inr: number;
  tax_inr: number;
  total_inr: number;
  paid_inr: number;
  balance_inr: number;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
}

export interface InvoiceItemRow {
  invoice_number: string;
  invoice_date: string;
  status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  position: number;
  description: string;
  service_code: string | null;
  service_category: string | null;
  qty: number;
  unit_price_inr: number;
  discount_inr: number;
  gst_rate_pct: number;
  tax_inr: number;
  total_inr: number;
}

export interface PaymentRow {
  payment_id: string;
  paid_at: string;
  method: string;
  amount_inr: number;
  reference: string | null;
  invoice_number: string;
  invoice_status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  received_by: string | null;
  is_void: boolean;
}

export interface OutstandingRow {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  patient_mobile: string | null;
  total_inr: number;
  paid_inr: number;
  balance_inr: number;
  age_days: number;
  age_bucket: string;
}

export interface DailyRevenueRow {
  date: string;
  invoices: number;
  subtotal_inr: number;
  discount_inr: number;
  tax_inr: number;
  total_inr: number;
  paid_inr: number;
  balance_inr: number;
}

export interface VoidRefundRow {
  invoice_number: string;
  invoice_date: string;
  status: string;
  patient_uhid: string | null;
  patient_name: string | null;
  total_inr: number;
  paid_inr: number;
  notes: string | null;
}

export interface TestCatalogRow {
  code: string;
  name: string;
  category: string;
  specimen_type: string;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  critical_low: number | null;
  critical_high: number | null;
  turnaround_hours: number | null;
  method: string | null;
  is_active: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function fullName(p: any | null | undefined): string | null {
  if (!p) return null;
  if (p.full_name) return p.full_name;
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function ageYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const y = (Date.now() - new Date(dob).getTime()) / (365.25 * 86400000);
  return Number.isFinite(y) && y >= 0 && y <= 130 ? Math.floor(y) : null;
}

function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms >= 0 ? +(ms / 3_600_000).toFixed(2) : null;
}

function refRange(t: any | null | undefined): string | null {
  if (!t) return null;
  if (t.ref_min != null && t.ref_max != null) return `${t.ref_min} – ${t.ref_max}`;
  if (t.ref_min != null) return `≥ ${t.ref_min}`;
  if (t.ref_max != null) return `≤ ${t.ref_max}`;
  return null;
}

function resultValue(r: any): string {
  if (r.value_numeric != null) return String(r.value_numeric);
  if (r.value_text) return r.value_text;
  return '—';
}

function jsonAddr(a: any): string {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ');
}

@Injectable({ providedIn: 'root' })
export class LabReportCatalogService {
  private supabase = inject(SupabaseService);

  /** Generic supabase client (cast to any to bypass strict typing on dynamic selects). */
  get client(): any {
    return this.supabase.client as any;
  }

  /** All reports keyed by id, in registration order. */
  list(): LabReportDefinition[] {
    return REGISTRY;
  }

  byId(id: string): LabReportDefinition | undefined {
    return REGISTRY.find((r) => r.id === id);
  }

  /** Convenience: run the fetcher + return typed rows. */
  async run<T extends object>(id: string, params: LabReportFetchParams): Promise<T[]> {
    const def = this.byId(id) as LabReportDefinition<T> | undefined;
    if (!def) throw new Error(`Unknown report: ${id}`);
    return await def.fetch(this, params);
  }

  // ─── Shared fetchers (used by multiple report defs) ─────────────────────
  async fetchOrders(params: LabReportFetchParams, opts: {
    requireCollected?: boolean;
    requireRejected?: boolean;
    pendingCollection?: boolean;
    requireReported?: boolean;
  } = {}): Promise<any[]> {
    let q = this.client
      .from('lab_orders')
      .select(`
        id, branch_id, ordered_at, priority, status, sample_status,
        collected_at, collected_by_staff_id, rejection_reason, notes,
        reported_at, reported_by_staff_id,
        patient:patient_id(id, uhid, first_name, last_name, full_name, mobile, gender, date_of_birth),
        doctor:ordering_doctor_staff_id(full_name),
        collector:collected_by_staff_id(full_name),
        reporter:reported_by_staff_id(full_name),
        results:lab_results(id, flag, status)
      `)
      .gte('ordered_at', params.from)
      .lte('ordered_at', params.to)
      .order('ordered_at', { ascending: false });

    if (params.branchId) q = q.eq('branch_id', params.branchId);
    if (opts.requireCollected) q = q.not('collected_at', 'is', null);
    if (opts.pendingCollection) {
      q = q.eq('sample_status', 'pending').is('collected_at', null);
    }
    if (opts.requireRejected) {
      q = q.or('sample_status.eq.rejected,rejection_reason.not.is.null');
    }
    if (opts.requireReported) q = q.not('reported_at', 'is', null);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as any[];
  }
}

// ─── Column factories (kept tight; reused for clarity) ─────────────────────
const C = <T extends object>(
  key: keyof T & string,
  header: string,
  extra: Partial<ExportColumn<T>> = {},
): ExportColumn<T> => ({ key, header, ...extra });

// ───────────────────────────────────────────────────────────────────────────
// REGISTRY — every report the catalog UI exposes.
// Typed as `any` so each entry can declare its own row shape.
// ───────────────────────────────────────────────────────────────────────────
const REGISTRY: LabReportDefinition<any>[] = [
  // ── REGISTRATION ────────────────────────────────────────────────────────
  {
    id: 'order-register',
    stage: 'Registration',
    title: 'Lab Order Register',
    description: 'Every lab order placed in the window, with patient, doctor, priority and current status.',
    requiresDateRange: true,
    rangeColumnHint: 'ordered_at',
    columns: [
      C<OrderRegisterRow>('order_id', 'Order ID', { width: 24 }),
      C<OrderRegisterRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<OrderRegisterRow>('priority', 'Priority', { width: 10 }),
      C<OrderRegisterRow>('status', 'Status', { width: 12 }),
      C<OrderRegisterRow>('sample_status', 'Sample status', { width: 14 }),
      C<OrderRegisterRow>('patient_uhid', 'UHID', { width: 12 }),
      C<OrderRegisterRow>('patient_name', 'Patient', { width: 24 }),
      C<OrderRegisterRow>('patient_mobile', 'Mobile', { width: 14 }),
      C<OrderRegisterRow>('patient_gender', 'Gender', { width: 8 }),
      C<OrderRegisterRow>('patient_age', 'Age', { format: 'integer', align: 'right', width: 6 }),
      C<OrderRegisterRow>('doctor_name', 'Doctor', { width: 22 }),
      C<OrderRegisterRow>('test_count', 'Tests', { format: 'integer', align: 'right', width: 8 }),
      C<OrderRegisterRow>('notes', 'Notes', { width: 28 }),
    ],
    fetch: async (svc, params): Promise<OrderRegisterRow[]> => {
      const orders = await svc.fetchOrders(params);
      return orders.map((o) => ({
        order_id: o.id,
        ordered_at: o.ordered_at,
        priority: o.priority ?? '',
        status: o.status ?? '',
        sample_status: o.sample_status ?? '',
        patient_uhid: o.patient?.uhid ?? null,
        patient_name: fullName(o.patient),
        patient_mobile: o.patient?.mobile ?? null,
        patient_gender: o.patient?.gender ?? null,
        patient_age: ageYears(o.patient?.date_of_birth),
        doctor_name: o.doctor?.full_name ?? null,
        test_count: (o.results ?? []).length,
        notes: o.notes ?? null,
      }));
    },
  },

  // ── SAMPLE COLLECTION ───────────────────────────────────────────────────
  {
    id: 'collection-log',
    stage: 'Sample collection',
    title: 'Sample Collection Log',
    description: 'Orders whose samples were collected in the window — collector, lag time, current status.',
    requiresDateRange: true,
    rangeColumnHint: 'ordered_at',
    columns: [
      C<CollectionLogRow>('order_id', 'Order ID', { width: 24 }),
      C<CollectionLogRow>('collected_at', 'Collected at', { format: 'datetime', width: 18 }),
      C<CollectionLogRow>('age_hours_to_collection', 'Lag (h)', { format: 'number', align: 'right', width: 10 }),
      C<CollectionLogRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<CollectionLogRow>('priority', 'Priority', { width: 10 }),
      C<CollectionLogRow>('sample_status', 'Sample status', { width: 14 }),
      C<CollectionLogRow>('patient_uhid', 'UHID', { width: 12 }),
      C<CollectionLogRow>('patient_name', 'Patient', { width: 24 }),
      C<CollectionLogRow>('collected_by', 'Collected by', { width: 22 }),
      C<CollectionLogRow>('rejection_reason', 'Rejection reason', { width: 26 }),
    ],
    fetch: async (svc, params): Promise<CollectionLogRow[]> => {
      const orders = await svc.fetchOrders(params, { requireCollected: true });
      return orders.map((o) => ({
        order_id: o.id,
        collected_at: o.collected_at,
        age_hours_to_collection: hoursBetween(o.ordered_at, o.collected_at),
        ordered_at: o.ordered_at,
        priority: o.priority ?? '',
        sample_status: o.sample_status ?? '',
        patient_uhid: o.patient?.uhid ?? null,
        patient_name: fullName(o.patient),
        collected_by: o.collector?.full_name ?? null,
        rejection_reason: o.rejection_reason ?? null,
      }));
    },
  },

  {
    id: 'pending-collection',
    stage: 'Sample collection',
    title: 'Pending Collection Queue',
    description: 'Snapshot of orders awaiting sample collection — sorted oldest first. Date range filters when the order was placed.',
    requiresDateRange: true,
    rangeColumnHint: 'ordered_at',
    columns: [
      C<PendingCollectionRow>('order_id', 'Order ID', { width: 24 }),
      C<PendingCollectionRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<PendingCollectionRow>('hours_since_order', 'Hours waiting', { format: 'number', align: 'right', width: 14 }),
      C<PendingCollectionRow>('priority', 'Priority', { width: 10 }),
      C<PendingCollectionRow>('patient_uhid', 'UHID', { width: 12 }),
      C<PendingCollectionRow>('patient_name', 'Patient', { width: 24 }),
      C<PendingCollectionRow>('patient_mobile', 'Mobile', { width: 14 }),
      C<PendingCollectionRow>('doctor_name', 'Doctor', { width: 22 }),
    ],
    fetch: async (svc, params): Promise<PendingCollectionRow[]> => {
      const orders = await svc.fetchOrders(params, { pendingCollection: true });
      const nowIso = new Date().toISOString();
      return orders.map((o) => ({
        order_id: o.id,
        ordered_at: o.ordered_at,
        hours_since_order: hoursBetween(o.ordered_at, nowIso) ?? 0,
        priority: o.priority ?? '',
        patient_uhid: o.patient?.uhid ?? null,
        patient_name: fullName(o.patient),
        patient_mobile: o.patient?.mobile ?? null,
        doctor_name: o.doctor?.full_name ?? null,
      }));
    },
  },

  {
    id: 'sample-rejections',
    stage: 'Sample collection',
    title: 'Sample Rejection Register',
    description: 'Orders rejected during sample acceptance, with the reason and the staff who collected.',
    requiresDateRange: true,
    rangeColumnHint: 'ordered_at',
    columns: [
      C<RejectionRow>('order_id', 'Order ID', { width: 24 }),
      C<RejectionRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<RejectionRow>('patient_uhid', 'UHID', { width: 12 }),
      C<RejectionRow>('patient_name', 'Patient', { width: 24 }),
      C<RejectionRow>('rejection_reason', 'Rejection reason', { width: 30 }),
      C<RejectionRow>('sample_status', 'Sample status', { width: 14 }),
      C<RejectionRow>('priority', 'Priority', { width: 10 }),
      C<RejectionRow>('doctor_name', 'Doctor', { width: 22 }),
    ],
    fetch: async (svc, params): Promise<RejectionRow[]> => {
      const orders = await svc.fetchOrders(params, { requireRejected: true });
      return orders.map((o) => ({
        order_id: o.id,
        ordered_at: o.ordered_at,
        patient_uhid: o.patient?.uhid ?? null,
        patient_name: fullName(o.patient),
        rejection_reason: o.rejection_reason ?? '—',
        sample_status: o.sample_status ?? '',
        priority: o.priority ?? '',
        doctor_name: o.doctor?.full_name ?? null,
      }));
    },
  },

  // ── HOME COLLECTION ─────────────────────────────────────────────────────
  {
    id: 'home-collection-requests',
    stage: 'Home collection',
    title: 'Home Collection Requests',
    description: 'Every home-collection booking in the window — status, phlebotomist, payment, address.',
    requiresDateRange: true,
    rangeColumnHint: 'created_at',
    columns: [
      C<HomeCollectionRow>('request_id', 'Request ID', { width: 24 }),
      C<HomeCollectionRow>('scheduled_at', 'Scheduled', { format: 'datetime', width: 18 }),
      C<HomeCollectionRow>('status', 'Status', { width: 12 }),
      C<HomeCollectionRow>('patient_uhid', 'UHID', { width: 12 }),
      C<HomeCollectionRow>('patient_name', 'Patient', { width: 24 }),
      C<HomeCollectionRow>('contact_mobile', 'Contact', { width: 14 }),
      C<HomeCollectionRow>('address', 'Address', { width: 36 }),
      C<HomeCollectionRow>('phlebotomist', 'Phlebotomist', { width: 22 }),
      C<HomeCollectionRow>('total_inr', 'Total (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<HomeCollectionRow>('paid_inr', 'Paid (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<HomeCollectionRow>('payment_method', 'Payment', { width: 10 }),
      C<HomeCollectionRow>('collected_at', 'Collected at', { format: 'datetime', width: 18 }),
      C<HomeCollectionRow>('created_at', 'Created', { format: 'datetime', width: 18 }),
    ],
    fetch: async (svc, params): Promise<HomeCollectionRow[]> => {
      let q = svc.client
        .from('home_collection_requests')
        .select(`
          id, scheduled_at, status, total_inr, paid_inr, payment_method, address,
          contact_mobile, collected_at, created_at, branch_id,
          patient:patient_id(uhid, first_name, last_name, full_name),
          phlebotomist:phlebotomist_id(staff:staff_id(full_name))
        `)
        .gte('created_at', params.from)
        .lte('created_at', params.to)
        .order('scheduled_at', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        request_id: r.id,
        scheduled_at: r.scheduled_at,
        status: r.status ?? '',
        patient_uhid: r.patient?.uhid ?? null,
        patient_name: fullName(r.patient),
        contact_mobile: r.contact_mobile,
        address: jsonAddr(r.address),
        phlebotomist: r.phlebotomist?.staff?.full_name ?? null,
        total_inr: Number(r.total_inr ?? 0),
        paid_inr: Number(r.paid_inr ?? 0),
        payment_method: r.payment_method ?? '',
        collected_at: r.collected_at ?? null,
        created_at: r.created_at,
      }));
    },
  },

  {
    id: 'home-collection-items',
    stage: 'Home collection',
    title: 'Home Collection — Test Line Items',
    description: 'Per-test breakdown of home-collection bookings, including unit price and surcharge.',
    requiresDateRange: true,
    rangeColumnHint: 'request.created_at',
    columns: [
      C<HomeCollectionItemRow>('request_id', 'Request ID', { width: 24 }),
      C<HomeCollectionItemRow>('scheduled_at', 'Scheduled', { format: 'datetime', width: 18 }),
      C<HomeCollectionItemRow>('patient_uhid', 'UHID', { width: 12 }),
      C<HomeCollectionItemRow>('patient_name', 'Patient', { width: 24 }),
      C<HomeCollectionItemRow>('test_code', 'Test code', { width: 12 }),
      C<HomeCollectionItemRow>('test_name', 'Test name', { width: 30 }),
      C<HomeCollectionItemRow>('test_category', 'Category', { width: 14 }),
      C<HomeCollectionItemRow>('price_inr', 'Price (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<HomeCollectionItemRow>('surcharge_inr', 'Surcharge (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<HomeCollectionItemRow>('lab_order_id', 'Linked order', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<HomeCollectionItemRow[]> => {
      let q = svc.client
        .from('home_collection_items')
        .select(`
          price_inr, surcharge_inr, lab_order_id,
          request:request_id!inner(
            id, scheduled_at, created_at, branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          ),
          test:lab_test_id(code, name, category)
        `)
        .gte('request.created_at', params.from)
        .lte('request.created_at', params.to);
      if (params.branchId) q = q.eq('request.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        request_id: r.request?.id ?? '',
        scheduled_at: r.request?.scheduled_at ?? '',
        patient_uhid: r.request?.patient?.uhid ?? null,
        patient_name: fullName(r.request?.patient),
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        test_category: r.test?.category ?? null,
        price_inr: Number(r.price_inr ?? 0),
        surcharge_inr: Number(r.surcharge_inr ?? 0),
        lab_order_id: r.lab_order_id ?? null,
      }));
    },
  },

  // ── PROCESSING / RESULTS ────────────────────────────────────────────────
  {
    id: 'results-register',
    stage: 'Processing',
    title: 'Test Results Register',
    description: 'Every lab_result row (entered/verified/amended) inside the window, with value, flag, ref range.',
    requiresDateRange: true,
    rangeColumnHint: 'created_at',
    columns: [
      C<ResultRow>('result_id', 'Result ID', { width: 24 }),
      C<ResultRow>('order_id', 'Order ID', { width: 24 }),
      C<ResultRow>('status', 'Status', { width: 12 }),
      C<ResultRow>('flag', 'Flag', { width: 14 }),
      C<ResultRow>('value', 'Value', { align: 'right', width: 12 }),
      C<ResultRow>('unit', 'Unit', { width: 10 }),
      C<ResultRow>('ref_range', 'Ref range', { width: 16 }),
      C<ResultRow>('test_code', 'Test code', { width: 12 }),
      C<ResultRow>('test_name', 'Test name', { width: 28 }),
      C<ResultRow>('test_category', 'Category', { width: 14 }),
      C<ResultRow>('entered_at', 'Entered at', { format: 'datetime', width: 18 }),
      C<ResultRow>('entered_by', 'Entered by', { width: 22 }),
      C<ResultRow>('verified_at', 'Verified at', { format: 'datetime', width: 18 }),
      C<ResultRow>('verified_by', 'Verified by', { width: 22 }),
      C<ResultRow>('patient_uhid', 'UHID', { width: 12 }),
      C<ResultRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<ResultRow[]> => {
      let q = svc.client
        .from('lab_results')
        .select(`
          id, lab_order_id, status, flag, value_numeric, value_text,
          entered_at, verified_at, created_at,
          test:lab_test_id(code, name, category, unit, ref_min, ref_max),
          entered_by:entered_by_staff_id(full_name),
          verified_by:verified_by_staff_id(full_name),
          order:lab_order_id!inner(
            branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .gte('created_at', params.from)
        .lte('created_at', params.to)
        .order('created_at', { ascending: false });
      if (params.branchId) q = q.eq('order.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        result_id: r.id,
        order_id: r.lab_order_id,
        status: r.status ?? '',
        flag: r.flag ?? null,
        value: resultValue(r),
        unit: r.test?.unit ?? null,
        ref_range: refRange(r.test),
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        test_category: r.test?.category ?? null,
        entered_at: r.entered_at,
        entered_by: r.entered_by?.full_name ?? null,
        verified_at: r.verified_at,
        verified_by: r.verified_by?.full_name ?? null,
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
      }));
    },
  },

  {
    id: 'pending-entry',
    stage: 'Processing',
    title: 'Tests Pending Result Entry',
    description: 'Snapshot of lab_results still in `pending` status. Date range filters by parent order time.',
    requiresDateRange: true,
    rangeColumnHint: 'order.ordered_at',
    columns: [
      C<PendingEntryRow>('result_id', 'Result ID', { width: 24 }),
      C<PendingEntryRow>('order_id', 'Order ID', { width: 24 }),
      C<PendingEntryRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<PendingEntryRow>('hours_since_order', 'Hours pending', { format: 'number', align: 'right', width: 14 }),
      C<PendingEntryRow>('priority', 'Priority', { width: 10 }),
      C<PendingEntryRow>('patient_uhid', 'UHID', { width: 12 }),
      C<PendingEntryRow>('patient_name', 'Patient', { width: 24 }),
      C<PendingEntryRow>('test_code', 'Test code', { width: 12 }),
      C<PendingEntryRow>('test_name', 'Test name', { width: 28 }),
      C<PendingEntryRow>('test_category', 'Category', { width: 14 }),
      C<PendingEntryRow>('target_tat_hours', 'Target TAT (h)', { format: 'number', align: 'right', width: 14 }),
    ],
    fetch: async (svc, params): Promise<PendingEntryRow[]> => {
      let q = svc.client
        .from('lab_results')
        .select(`
          id, lab_order_id, status,
          test:lab_test_id(code, name, category, turnaround_hours),
          order:lab_order_id!inner(
            ordered_at, priority, branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .eq('status', 'pending')
        .gte('order.ordered_at', params.from)
        .lte('order.ordered_at', params.to);
      if (params.branchId) q = q.eq('order.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      const nowIso = new Date().toISOString();
      return ((data ?? []) as any[]).map((r) => ({
        result_id: r.id,
        order_id: r.lab_order_id,
        ordered_at: r.order?.ordered_at ?? '',
        priority: r.order?.priority ?? '',
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        test_category: r.test?.category ?? null,
        target_tat_hours: r.test?.turnaround_hours ?? null,
        hours_since_order: hoursBetween(r.order?.ordered_at, nowIso) ?? 0,
      }));
    },
  },

  {
    id: 'pending-verification',
    stage: 'Processing',
    title: 'Tests Pending Verification',
    description: 'Results that have been entered but not yet verified by a pathologist.',
    requiresDateRange: true,
    rangeColumnHint: 'entered_at',
    columns: [
      C<ResultRow>('result_id', 'Result ID', { width: 24 }),
      C<ResultRow>('order_id', 'Order ID', { width: 24 }),
      C<ResultRow>('flag', 'Flag', { width: 14 }),
      C<ResultRow>('value', 'Value', { align: 'right', width: 12 }),
      C<ResultRow>('unit', 'Unit', { width: 10 }),
      C<ResultRow>('test_code', 'Test code', { width: 12 }),
      C<ResultRow>('test_name', 'Test name', { width: 28 }),
      C<ResultRow>('entered_at', 'Entered at', { format: 'datetime', width: 18 }),
      C<ResultRow>('entered_by', 'Entered by', { width: 22 }),
      C<ResultRow>('patient_uhid', 'UHID', { width: 12 }),
      C<ResultRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<ResultRow[]> => {
      let q = svc.client
        .from('lab_results')
        .select(`
          id, lab_order_id, status, flag, value_numeric, value_text,
          entered_at, verified_at,
          test:lab_test_id(code, name, category, unit, ref_min, ref_max),
          entered_by:entered_by_staff_id(full_name),
          order:lab_order_id!inner(
            branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .eq('status', 'entered')
        .gte('entered_at', params.from)
        .lte('entered_at', params.to);
      if (params.branchId) q = q.eq('order.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        result_id: r.id,
        order_id: r.lab_order_id,
        status: r.status,
        flag: r.flag ?? null,
        value: resultValue(r),
        unit: r.test?.unit ?? null,
        ref_range: refRange(r.test),
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        test_category: r.test?.category ?? null,
        entered_at: r.entered_at,
        entered_by: r.entered_by?.full_name ?? null,
        verified_at: r.verified_at,
        verified_by: null,
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
      }));
    },
  },

  // ── CRITICAL ALERTS ─────────────────────────────────────────────────────
  {
    id: 'critical-results',
    stage: 'Critical alerts',
    title: 'Critical Result Register',
    description: 'Every lab_result flagged critical-low or critical-high in the window, with patient + doctor.',
    requiresDateRange: true,
    rangeColumnHint: 'created_at',
    columns: [
      C<CriticalResultRow>('result_id', 'Result ID', { width: 24 }),
      C<CriticalResultRow>('order_id', 'Order ID', { width: 24 }),
      C<CriticalResultRow>('flag', 'Flag', { width: 14 }),
      C<CriticalResultRow>('value', 'Value', { align: 'right', width: 10 }),
      C<CriticalResultRow>('unit', 'Unit', { width: 8 }),
      C<CriticalResultRow>('ref_range', 'Ref range', { width: 16 }),
      C<CriticalResultRow>('test_code', 'Test code', { width: 12 }),
      C<CriticalResultRow>('test_name', 'Test name', { width: 28 }),
      C<CriticalResultRow>('patient_uhid', 'UHID', { width: 12 }),
      C<CriticalResultRow>('patient_name', 'Patient', { width: 24 }),
      C<CriticalResultRow>('patient_mobile', 'Mobile', { width: 14 }),
      C<CriticalResultRow>('doctor_name', 'Doctor', { width: 22 }),
      C<CriticalResultRow>('entered_at', 'Entered at', { format: 'datetime', width: 18 }),
      C<CriticalResultRow>('verified_at', 'Verified at', { format: 'datetime', width: 18 }),
    ],
    fetch: async (svc, params): Promise<CriticalResultRow[]> => {
      let q = svc.client
        .from('lab_results')
        .select(`
          id, lab_order_id, flag, value_numeric, value_text,
          entered_at, verified_at, created_at,
          test:lab_test_id(code, name, unit, ref_min, ref_max),
          order:lab_order_id!inner(
            branch_id,
            doctor:ordering_doctor_staff_id(full_name),
            patient:patient_id(uhid, first_name, last_name, full_name, mobile)
          )
        `)
        .in('flag', ['critical_low', 'critical_high'])
        .gte('created_at', params.from)
        .lte('created_at', params.to);
      if (params.branchId) q = q.eq('order.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        result_id: r.id,
        order_id: r.lab_order_id,
        flag: r.flag,
        value: resultValue(r),
        unit: r.test?.unit ?? null,
        ref_range: refRange(r.test),
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
        patient_mobile: r.order?.patient?.mobile ?? null,
        doctor_name: r.order?.doctor?.full_name ?? null,
        entered_at: r.entered_at,
        verified_at: r.verified_at,
      }));
    },
  },

  {
    id: 'critical-acknowledgement',
    stage: 'Critical alerts',
    title: 'Critical Alert Acknowledgement Log',
    description: 'NABL-style log of raised critical alerts, time-to-acknowledge and status. Empty if the alerts table is not deployed.',
    requiresDateRange: true,
    rangeColumnHint: 'raised_at',
    columns: [
      C<CriticalAlertRow>('alert_id', 'Alert ID', { width: 24 }),
      C<CriticalAlertRow>('raised_at', 'Raised at', { format: 'datetime', width: 18 }),
      C<CriticalAlertRow>('status', 'Status', { width: 14 }),
      C<CriticalAlertRow>('acknowledged_at', 'Acknowledged at', { format: 'datetime', width: 18 }),
      C<CriticalAlertRow>('minutes_to_ack', 'Time to ack (min)', { format: 'number', align: 'right', width: 16 }),
      C<CriticalAlertRow>('order_id', 'Order ID', { width: 24 }),
      C<CriticalAlertRow>('patient_uhid', 'UHID', { width: 12 }),
      C<CriticalAlertRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<CriticalAlertRow[]> => {
      let q = svc.client
        .from('lab_critical_alerts')
        .select(`
          id, raised_at, acknowledged_at, status,
          order:lab_order_id(
            id, branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .gte('raised_at', params.from)
        .lte('raised_at', params.to)
        .order('raised_at', { ascending: false });
      const { data, error } = await q;
      if (error) {
        const msg = String(error?.message ?? '').toLowerCase();
        if (msg.includes('lab_critical_alerts') && msg.includes('does not exist')) return [];
        throw error;
      }
      const rows = ((data ?? []) as any[])
        .filter((r) => !params.branchId || r.order?.branch_id === params.branchId);
      return rows.map((r) => {
        const mins =
          r.acknowledged_at && r.raised_at
            ? +(((new Date(r.acknowledged_at).getTime() - new Date(r.raised_at).getTime()) / 60000).toFixed(1))
            : null;
        return {
          alert_id: r.id,
          raised_at: r.raised_at,
          status: r.status ?? '',
          acknowledged_at: r.acknowledged_at ?? null,
          minutes_to_ack: mins,
          order_id: r.order?.id ?? '',
          patient_uhid: r.order?.patient?.uhid ?? null,
          patient_name: fullName(r.order?.patient),
        };
      });
    },
  },

  // ── OUTSOURCE ───────────────────────────────────────────────────────────
  {
    id: 'outsource-dispatch',
    stage: 'Outsource',
    title: 'Outsource Dispatch Register',
    description: 'Every reference-lab dispatch in the window, with courier details, dates, and round-trip TAT.',
    requiresDateRange: true,
    rangeColumnHint: 'dispatched_at',
    columns: [
      C<OutsourceDispatchRow>('dispatch_no', 'Dispatch #', { width: 14 }),
      C<OutsourceDispatchRow>('status', 'Status', { width: 12 }),
      C<OutsourceDispatchRow>('dispatched_at', 'Dispatched at', { format: 'datetime', width: 18 }),
      C<OutsourceDispatchRow>('expected_return_at', 'Expected return', { format: 'datetime', width: 18 }),
      C<OutsourceDispatchRow>('received_at', 'Received at', { format: 'datetime', width: 18 }),
      C<OutsourceDispatchRow>('reported_at', 'Reported at', { format: 'datetime', width: 18 }),
      C<OutsourceDispatchRow>('tat_hours', 'TAT (h)', { format: 'number', align: 'right', width: 10 }),
      C<OutsourceDispatchRow>('reference_lab_code', 'Lab code', { width: 12 }),
      C<OutsourceDispatchRow>('reference_lab_name', 'Reference lab', { width: 24 }),
      C<OutsourceDispatchRow>('courier_name', 'Courier', { width: 18 }),
      C<OutsourceDispatchRow>('awb_number', 'AWB #', { width: 18 }),
      C<OutsourceDispatchRow>('order_id', 'Order ID', { width: 24 }),
      C<OutsourceDispatchRow>('patient_uhid', 'UHID', { width: 12 }),
      C<OutsourceDispatchRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<OutsourceDispatchRow[]> => {
      let q = svc.client
        .from('reference_lab_dispatches')
        .select(`
          id, status, dispatched_at, expected_return_at,
          received_at, reported_at, courier_name, awb_number, lab_order_id, branch_id,
          reference_lab:reference_lab_id(code, name),
          order:lab_order_id(
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .gte('dispatched_at', params.from)
        .lte('dispatched_at', params.to)
        .order('dispatched_at', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        dispatch_id: r.id,
        dispatch_no: (r.id as string).slice(0, 8).toUpperCase(),
        status: r.status ?? '',
        dispatched_at: r.dispatched_at,
        expected_return_at: r.expected_return_at,
        received_at: r.received_at,
        reported_at: r.reported_at,
        tat_hours: hoursBetween(r.dispatched_at, r.reported_at),
        reference_lab_code: r.reference_lab?.code ?? null,
        reference_lab_name: r.reference_lab?.name ?? null,
        courier_name: r.courier_name,
        awb_number: r.awb_number,
        order_id: r.lab_order_id,
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
      }));
    },
  },

  {
    id: 'outsource-overdue',
    stage: 'Outsource',
    title: 'Outsource Overdue Tracker',
    description: 'Dispatches past their expected-return date and not yet reported/cancelled — sorted by how late.',
    requiresDateRange: false,
    columns: [
      C<OutsourceOverdueRow>('dispatch_no', 'Dispatch #', { width: 14 }),
      C<OutsourceOverdueRow>('status', 'Status', { width: 12 }),
      C<OutsourceOverdueRow>('dispatched_at', 'Dispatched', { format: 'datetime', width: 18 }),
      C<OutsourceOverdueRow>('expected_return_at', 'Expected', { format: 'datetime', width: 18 }),
      C<OutsourceOverdueRow>('hours_overdue', 'Hours overdue', { format: 'number', align: 'right', width: 14 }),
      C<OutsourceOverdueRow>('reference_lab_name', 'Reference lab', { width: 24 }),
      C<OutsourceOverdueRow>('patient_uhid', 'UHID', { width: 12 }),
      C<OutsourceOverdueRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<OutsourceOverdueRow[]> => {
      const nowIso = new Date().toISOString();
      let q = svc.client
        .from('reference_lab_dispatches')
        .select(`
          id, status, dispatched_at, expected_return_at, branch_id,
          reference_lab:reference_lab_id(name),
          order:lab_order_id(
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .not('expected_return_at', 'is', null)
        .lt('expected_return_at', nowIso)
        .not('status', 'in', '(reported,cancelled)')
        .order('expected_return_at', { ascending: true });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        dispatch_id: r.id,
        dispatch_no: (r.id as string).slice(0, 8).toUpperCase(),
        status: r.status ?? '',
        dispatched_at: r.dispatched_at,
        expected_return_at: r.expected_return_at,
        hours_overdue: hoursBetween(r.expected_return_at, nowIso) ?? 0,
        reference_lab_name: r.reference_lab?.name ?? null,
        patient_uhid: r.order?.patient?.uhid ?? null,
        patient_name: fullName(r.order?.patient),
      }));
    },
  },

  {
    id: 'reference-lab-master',
    stage: 'Outsource',
    title: 'Reference Lab Master',
    description: 'Snapshot of all configured reference labs — contacts, accreditation, default TAT.',
    requiresDateRange: false,
    columns: [
      C<ReferenceLabRow>('code', 'Code', { width: 12 }),
      C<ReferenceLabRow>('name', 'Name', { width: 28 }),
      C<ReferenceLabRow>('accreditation', 'Accreditation', { width: 18 }),
      C<ReferenceLabRow>('default_tat_hours', 'Default TAT (h)', { format: 'number', align: 'right', width: 14 }),
      C<ReferenceLabRow>('contact_name', 'Contact', { width: 22 }),
      C<ReferenceLabRow>('contact_phone', 'Phone', { width: 14 }),
      C<ReferenceLabRow>('contact_email', 'Email', { width: 26 }),
      C<ReferenceLabRow>('address', 'Address', { width: 32 }),
      C<ReferenceLabRow>('is_active', 'Active', { width: 8 }),
    ],
    fetch: async (svc, params): Promise<ReferenceLabRow[]> => {
      let q = svc.client
        .from('reference_labs')
        .select('code, name, accreditation, default_tat_hours, contact_name, contact_phone, contact_email, address, is_active, branch_id')
        .order('name', { ascending: true });
      if (params.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${params.branchId}`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        code: r.code,
        name: r.name,
        accreditation: r.accreditation,
        default_tat_hours: r.default_tat_hours,
        contact_name: r.contact_name,
        contact_phone: r.contact_phone,
        contact_email: r.contact_email,
        address: r.address,
        is_active: !!r.is_active,
      }));
    },
  },

  // ── REPORTING ───────────────────────────────────────────────────────────
  {
    id: 'final-reports',
    stage: 'Reporting',
    title: 'Final Reports Released',
    description: 'Orders with reported_at populated inside the window — TAT, doctor, who reported, critical count.',
    requiresDateRange: true,
    rangeColumnHint: 'reported_at',
    columns: [
      C<FinalReportRow>('order_id', 'Order ID', { width: 24 }),
      C<FinalReportRow>('reported_at', 'Reported at', { format: 'datetime', width: 18 }),
      C<FinalReportRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<FinalReportRow>('tat_hours', 'TAT (h)', { format: 'number', align: 'right', width: 10 }),
      C<FinalReportRow>('priority', 'Priority', { width: 10 }),
      C<FinalReportRow>('patient_uhid', 'UHID', { width: 12 }),
      C<FinalReportRow>('patient_name', 'Patient', { width: 24 }),
      C<FinalReportRow>('doctor_name', 'Doctor', { width: 22 }),
      C<FinalReportRow>('reported_by', 'Reported by', { width: 22 }),
      C<FinalReportRow>('test_count', 'Tests', { format: 'integer', align: 'right', width: 8 }),
      C<FinalReportRow>('critical_count', 'Criticals', { format: 'integer', align: 'right', width: 10 }),
    ],
    fetch: async (svc, params): Promise<FinalReportRow[]> => {
      let q = svc.client
        .from('lab_orders')
        .select(`
          id, ordered_at, reported_at, priority, branch_id,
          patient:patient_id(uhid, first_name, last_name, full_name),
          doctor:ordering_doctor_staff_id(full_name),
          reporter:reported_by_staff_id(full_name),
          results:lab_results(flag)
        `)
        .not('reported_at', 'is', null)
        .gte('reported_at', params.from)
        .lte('reported_at', params.to)
        .order('reported_at', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((o) => {
        const criticals = (o.results ?? []).filter(
          (r: any) => r.flag === 'critical_low' || r.flag === 'critical_high',
        ).length;
        return {
          order_id: o.id,
          reported_at: o.reported_at,
          ordered_at: o.ordered_at,
          tat_hours: hoursBetween(o.ordered_at, o.reported_at) ?? 0,
          priority: o.priority ?? '',
          patient_uhid: o.patient?.uhid ?? null,
          patient_name: fullName(o.patient),
          doctor_name: o.doctor?.full_name ?? null,
          reported_by: o.reporter?.full_name ?? null,
          test_count: (o.results ?? []).length,
          critical_count: criticals,
        };
      });
    },
  },

  {
    id: 'order-tat-detail',
    stage: 'Reporting',
    title: 'Per-Order TAT Breakdown',
    description: 'Order-level timeline: collection lag, processing time and total TAT. Useful for SLA reviews.',
    requiresDateRange: true,
    rangeColumnHint: 'ordered_at',
    columns: [
      C<OrderTatRow>('order_id', 'Order ID', { width: 24 }),
      C<OrderTatRow>('ordered_at', 'Ordered at', { format: 'datetime', width: 18 }),
      C<OrderTatRow>('collected_at', 'Collected at', { format: 'datetime', width: 18 }),
      C<OrderTatRow>('reported_at', 'Reported at', { format: 'datetime', width: 18 }),
      C<OrderTatRow>('collection_lag_hours', 'Collection lag (h)', { format: 'number', align: 'right', width: 16 }),
      C<OrderTatRow>('processing_hours', 'Processing (h)', { format: 'number', align: 'right', width: 14 }),
      C<OrderTatRow>('total_tat_hours', 'Total TAT (h)', { format: 'number', align: 'right', width: 14 }),
      C<OrderTatRow>('priority', 'Priority', { width: 10 }),
      C<OrderTatRow>('status', 'Status', { width: 12 }),
      C<OrderTatRow>('patient_uhid', 'UHID', { width: 12 }),
      C<OrderTatRow>('patient_name', 'Patient', { width: 24 }),
    ],
    fetch: async (svc, params): Promise<OrderTatRow[]> => {
      const orders = await svc.fetchOrders(params);
      return orders.map((o) => ({
        order_id: o.id,
        ordered_at: o.ordered_at,
        collected_at: o.collected_at,
        reported_at: o.reported_at,
        collection_lag_hours: hoursBetween(o.ordered_at, o.collected_at),
        processing_hours: hoursBetween(o.collected_at, o.reported_at),
        total_tat_hours: hoursBetween(o.ordered_at, o.reported_at),
        priority: o.priority ?? '',
        status: o.status ?? '',
        patient_uhid: o.patient?.uhid ?? null,
        patient_name: fullName(o.patient),
      }));
    },
  },

  // ── BILLING ─────────────────────────────────────────────────────────────
  {
    id: 'invoice-register',
    stage: 'Billing',
    title: 'Invoice Register',
    description: 'Every invoice raised in the window — totals, GST, paid and balance — across all categories (lab + imaging + pharmacy + consult).',
    requiresDateRange: true,
    rangeColumnHint: 'invoice_date',
    columns: [
      C<InvoiceRegisterRow>('invoice_number', 'Invoice #', { width: 24 }),
      C<InvoiceRegisterRow>('invoice_date', 'Invoice date', { format: 'datetime', width: 18 }),
      C<InvoiceRegisterRow>('status', 'Status', { width: 14 }),
      C<InvoiceRegisterRow>('patient_uhid', 'UHID', { width: 12 }),
      C<InvoiceRegisterRow>('patient_name', 'Patient', { width: 24 }),
      C<InvoiceRegisterRow>('patient_mobile', 'Mobile', { width: 14 }),
      C<InvoiceRegisterRow>('subtotal_inr', 'Subtotal (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('discount_inr', 'Discount (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('tax_inr', 'GST (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('total_inr', 'Total (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('paid_inr', 'Paid (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('balance_inr', 'Balance (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<InvoiceRegisterRow>('due_date', 'Due date', { format: 'date', width: 14 }),
      C<InvoiceRegisterRow>('created_by', 'Created by', { width: 20 }),
      C<InvoiceRegisterRow>('notes', 'Notes', { width: 28 }),
    ],
    fetch: async (svc, params): Promise<InvoiceRegisterRow[]> => {
      let q = svc.client
        .from('invoices')
        .select(`
          invoice_number, invoice_date, status, due_date, notes, branch_id,
          subtotal_cents, discount_cents, cgst_cents, sgst_cents, igst_cents,
          total_cents, paid_cents, balance_cents,
          patient:patient_id(uhid, first_name, last_name, full_name, mobile),
          creator:created_by_staff_id(full_name)
        `)
        .gte('invoice_date', params.from)
        .lte('invoice_date', params.to)
        .order('invoice_date', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        status: r.status,
        patient_uhid: r.patient?.uhid ?? null,
        patient_name: fullName(r.patient),
        patient_mobile: r.patient?.mobile ?? null,
        subtotal_inr: (r.subtotal_cents ?? 0) / 100,
        discount_inr: (r.discount_cents ?? 0) / 100,
        tax_inr: ((r.cgst_cents ?? 0) + (r.sgst_cents ?? 0) + (r.igst_cents ?? 0)) / 100,
        total_inr: (r.total_cents ?? 0) / 100,
        paid_inr: (r.paid_cents ?? 0) / 100,
        balance_inr: (r.balance_cents ?? 0) / 100,
        due_date: r.due_date,
        notes: r.notes,
        created_by: r.creator?.full_name ?? null,
      }));
    },
  },

  {
    id: 'invoice-items',
    stage: 'Billing',
    title: 'Invoice Line Items',
    description: 'Per-line breakdown of billed services — useful for revenue-by-test and category mix analysis.',
    requiresDateRange: true,
    rangeColumnHint: 'invoice.invoice_date',
    columns: [
      C<InvoiceItemRow>('invoice_number', 'Invoice #', { width: 24 }),
      C<InvoiceItemRow>('invoice_date', 'Invoice date', { format: 'datetime', width: 18 }),
      C<InvoiceItemRow>('status', 'Status', { width: 12 }),
      C<InvoiceItemRow>('patient_uhid', 'UHID', { width: 12 }),
      C<InvoiceItemRow>('patient_name', 'Patient', { width: 24 }),
      C<InvoiceItemRow>('position', '#', { format: 'integer', align: 'right', width: 6 }),
      C<InvoiceItemRow>('description', 'Description', { width: 30 }),
      C<InvoiceItemRow>('service_code', 'Service code', { width: 14 }),
      C<InvoiceItemRow>('service_category', 'Category', { width: 14 }),
      C<InvoiceItemRow>('qty', 'Qty', { format: 'integer', align: 'right', width: 6 }),
      C<InvoiceItemRow>('unit_price_inr', 'Rate (INR)', { format: 'inr', align: 'right', width: 12 }),
      C<InvoiceItemRow>('discount_inr', 'Disc. (INR)', { format: 'inr', align: 'right', width: 12 }),
      C<InvoiceItemRow>('gst_rate_pct', 'GST %', { format: 'number', align: 'right', width: 8 }),
      C<InvoiceItemRow>('tax_inr', 'Tax (INR)', { format: 'inr', align: 'right', width: 12 }),
      C<InvoiceItemRow>('total_inr', 'Line total (INR)', { format: 'inr', align: 'right', width: 14 }),
    ],
    fetch: async (svc, params): Promise<InvoiceItemRow[]> => {
      let q = svc.client
        .from('invoice_items')
        .select(`
          position, description, qty, unit_price_cents, discount_cents,
          gst_rate, cgst_cents, sgst_cents, igst_cents, total_cents,
          service:service_id(code, category),
          invoice:invoice_id!inner(
            invoice_number, invoice_date, status, branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          )
        `)
        .gte('invoice.invoice_date', params.from)
        .lte('invoice.invoice_date', params.to);
      if (params.branchId) q = q.eq('invoice.branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        invoice_number: r.invoice?.invoice_number ?? '',
        invoice_date: r.invoice?.invoice_date ?? '',
        status: r.invoice?.status ?? '',
        patient_uhid: r.invoice?.patient?.uhid ?? null,
        patient_name: fullName(r.invoice?.patient),
        position: r.position ?? 0,
        description: r.description ?? '',
        service_code: r.service?.code ?? null,
        service_category: r.service?.category ?? null,
        qty: r.qty ?? 0,
        unit_price_inr: (r.unit_price_cents ?? 0) / 100,
        discount_inr: (r.discount_cents ?? 0) / 100,
        gst_rate_pct: Number(r.gst_rate ?? 0),
        tax_inr: ((r.cgst_cents ?? 0) + (r.sgst_cents ?? 0) + (r.igst_cents ?? 0)) / 100,
        total_inr: (r.total_cents ?? 0) / 100,
      }));
    },
  },

  {
    id: 'payments-register',
    stage: 'Billing',
    title: 'Payments Register',
    description: 'Every payment received in the window — method, reference, the invoice it was applied to. Includes voided rows (flagged).',
    requiresDateRange: true,
    rangeColumnHint: 'paid_at',
    columns: [
      C<PaymentRow>('payment_id', 'Payment ID', { width: 24 }),
      C<PaymentRow>('paid_at', 'Paid at', { format: 'datetime', width: 18 }),
      C<PaymentRow>('method', 'Method', { width: 12 }),
      C<PaymentRow>('amount_inr', 'Amount (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<PaymentRow>('reference', 'Reference', { width: 22 }),
      C<PaymentRow>('invoice_number', 'Invoice #', { width: 24 }),
      C<PaymentRow>('invoice_status', 'Inv status', { width: 12 }),
      C<PaymentRow>('patient_uhid', 'UHID', { width: 12 }),
      C<PaymentRow>('patient_name', 'Patient', { width: 24 }),
      C<PaymentRow>('received_by', 'Received by', { width: 20 }),
      C<PaymentRow>('is_void', 'Voided', { width: 8 }),
    ],
    fetch: async (svc, params): Promise<PaymentRow[]> => {
      let q = svc.client
        .from('payments')
        .select(`
          id, paid_at, method, amount_cents, reference, is_void, branch_id,
          invoice:invoice_id!inner(
            invoice_number, status, branch_id,
            patient:patient_id(uhid, first_name, last_name, full_name)
          ),
          receiver:received_by_staff_id(full_name)
        `)
        .gte('paid_at', params.from)
        .lte('paid_at', params.to)
        .order('paid_at', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        payment_id: r.id,
        paid_at: r.paid_at,
        method: r.method ?? '',
        amount_inr: (r.amount_cents ?? 0) / 100,
        reference: r.reference,
        invoice_number: r.invoice?.invoice_number ?? '',
        invoice_status: r.invoice?.status ?? '',
        patient_uhid: r.invoice?.patient?.uhid ?? null,
        patient_name: fullName(r.invoice?.patient),
        received_by: r.receiver?.full_name ?? null,
        is_void: !!r.is_void,
      }));
    },
  },

  {
    id: 'outstanding-receivables',
    stage: 'Billing',
    title: 'Outstanding Receivables',
    description: 'Snapshot of unpaid invoices right now (date range ignored) with aging bucket. Excludes void/refunded/draft.',
    requiresDateRange: false,
    columns: [
      C<OutstandingRow>('invoice_number', 'Invoice #', { width: 24 }),
      C<OutstandingRow>('invoice_date', 'Invoice date', { format: 'datetime', width: 18 }),
      C<OutstandingRow>('due_date', 'Due date', { format: 'date', width: 14 }),
      C<OutstandingRow>('status', 'Status', { width: 12 }),
      C<OutstandingRow>('age_days', 'Age (days)', { format: 'integer', align: 'right', width: 12 }),
      C<OutstandingRow>('age_bucket', 'Bucket', { width: 12 }),
      C<OutstandingRow>('patient_uhid', 'UHID', { width: 12 }),
      C<OutstandingRow>('patient_name', 'Patient', { width: 24 }),
      C<OutstandingRow>('patient_mobile', 'Mobile', { width: 14 }),
      C<OutstandingRow>('total_inr', 'Total (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<OutstandingRow>('paid_inr', 'Paid (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<OutstandingRow>('balance_inr', 'Balance (INR)', { format: 'inr', align: 'right', width: 14 }),
    ],
    fetch: async (svc, params): Promise<OutstandingRow[]> => {
      let q = svc.client
        .from('invoices')
        .select(`
          invoice_number, invoice_date, due_date, status, branch_id,
          total_cents, paid_cents, balance_cents,
          patient:patient_id(uhid, first_name, last_name, full_name, mobile)
        `)
        .gt('balance_cents', 0)
        .not('status', 'in', '(void,refunded,draft)')
        .order('invoice_date', { ascending: true });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as any[]).map((r) => {
        const ref = r.due_date ?? r.invoice_date;
        const days = ref
          ? Math.max(0, Math.floor((now - new Date(ref).getTime()) / 86400000))
          : 0;
        const bucket =
          days <= 7  ? 'current'
          : days <= 15 ? '8-15 d'
          : days <= 30 ? '16-30 d'
          : days <= 60 ? '31-60 d'
          :              '60+ d';
        return {
          invoice_number: r.invoice_number,
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          status: r.status,
          patient_uhid: r.patient?.uhid ?? null,
          patient_name: fullName(r.patient),
          patient_mobile: r.patient?.mobile ?? null,
          total_inr: (r.total_cents ?? 0) / 100,
          paid_inr: (r.paid_cents ?? 0) / 100,
          balance_inr: (r.balance_cents ?? 0) / 100,
          age_days: days,
          age_bucket: bucket,
        };
      });
    },
  },

  {
    id: 'daily-revenue',
    stage: 'Billing',
    title: 'Daily Revenue Summary',
    description: 'Day-wise rollup of invoices issued in the window — count, subtotal, discount, GST, total, paid, balance.',
    requiresDateRange: true,
    rangeColumnHint: 'invoice_date',
    columns: [
      C<DailyRevenueRow>('date', 'Date', { format: 'date', width: 14 }),
      C<DailyRevenueRow>('invoices', 'Invoices', { format: 'integer', align: 'right', width: 10 }),
      C<DailyRevenueRow>('subtotal_inr', 'Subtotal (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<DailyRevenueRow>('discount_inr', 'Discount (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<DailyRevenueRow>('tax_inr', 'GST (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<DailyRevenueRow>('total_inr', 'Total (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<DailyRevenueRow>('paid_inr', 'Paid (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<DailyRevenueRow>('balance_inr', 'Balance (INR)', { format: 'inr', align: 'right', width: 14 }),
    ],
    fetch: async (svc, params): Promise<DailyRevenueRow[]> => {
      let q = svc.client
        .from('invoices')
        .select('invoice_date, subtotal_cents, discount_cents, cgst_cents, sgst_cents, igst_cents, total_cents, paid_cents, balance_cents, status, branch_id')
        .gte('invoice_date', params.from)
        .lte('invoice_date', params.to)
        .not('status', 'in', '(void,draft)');
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      const byDate = new Map<string, DailyRevenueRow>();
      for (const r of (data ?? []) as any[]) {
        const date = (r.invoice_date as string).slice(0, 10);
        const cur: DailyRevenueRow = byDate.get(date) ?? {
          date, invoices: 0,
          subtotal_inr: 0, discount_inr: 0, tax_inr: 0,
          total_inr: 0, paid_inr: 0, balance_inr: 0,
        };
        cur.invoices++;
        cur.subtotal_inr += (r.subtotal_cents ?? 0) / 100;
        cur.discount_inr += (r.discount_cents ?? 0) / 100;
        cur.tax_inr += ((r.cgst_cents ?? 0) + (r.sgst_cents ?? 0) + (r.igst_cents ?? 0)) / 100;
        cur.total_inr += (r.total_cents ?? 0) / 100;
        cur.paid_inr += (r.paid_cents ?? 0) / 100;
        cur.balance_inr += (r.balance_cents ?? 0) / 100;
        byDate.set(date, cur);
      }
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
  },

  {
    id: 'voids-refunds',
    stage: 'Billing',
    title: 'Voids & Refunds',
    description: 'Invoices that were voided or refunded inside the window — flag for finance review.',
    requiresDateRange: true,
    rangeColumnHint: 'updated_at',
    columns: [
      C<VoidRefundRow>('invoice_number', 'Invoice #', { width: 24 }),
      C<VoidRefundRow>('invoice_date', 'Invoice date', { format: 'datetime', width: 18 }),
      C<VoidRefundRow>('status', 'Status', { width: 12 }),
      C<VoidRefundRow>('patient_uhid', 'UHID', { width: 12 }),
      C<VoidRefundRow>('patient_name', 'Patient', { width: 24 }),
      C<VoidRefundRow>('total_inr', 'Total (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<VoidRefundRow>('paid_inr', 'Paid (INR)', { format: 'inr', align: 'right', width: 14 }),
      C<VoidRefundRow>('notes', 'Notes', { width: 32 }),
    ],
    fetch: async (svc, params): Promise<VoidRefundRow[]> => {
      let q = svc.client
        .from('invoices')
        .select(`
          invoice_number, invoice_date, status, total_cents, paid_cents, notes, updated_at, branch_id,
          patient:patient_id(uhid, first_name, last_name, full_name)
        `)
        .in('status', ['void', 'refunded'])
        .gte('updated_at', params.from)
        .lte('updated_at', params.to)
        .order('updated_at', { ascending: false });
      if (params.branchId) q = q.eq('branch_id', params.branchId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        status: r.status,
        patient_uhid: r.patient?.uhid ?? null,
        patient_name: fullName(r.patient),
        total_inr: (r.total_cents ?? 0) / 100,
        paid_inr: (r.paid_cents ?? 0) / 100,
        notes: r.notes,
      }));
    },
  },

  // ── MASTER DATA ─────────────────────────────────────────────────────────
  {
    id: 'test-catalog',
    stage: 'Master data',
    title: 'Lab Test Catalog',
    description: 'All configured lab tests — code, category, units, reference ranges, target TAT.',
    requiresDateRange: false,
    columns: [
      C<TestCatalogRow>('code', 'Code', { width: 12 }),
      C<TestCatalogRow>('name', 'Test name', { width: 32 }),
      C<TestCatalogRow>('category', 'Category', { width: 14 }),
      C<TestCatalogRow>('specimen_type', 'Specimen', { width: 14 }),
      C<TestCatalogRow>('unit', 'Unit', { width: 10 }),
      C<TestCatalogRow>('ref_min', 'Ref min', { format: 'number', align: 'right', width: 10 }),
      C<TestCatalogRow>('ref_max', 'Ref max', { format: 'number', align: 'right', width: 10 }),
      C<TestCatalogRow>('critical_low', 'Critical low', { format: 'number', align: 'right', width: 12 }),
      C<TestCatalogRow>('critical_high', 'Critical high', { format: 'number', align: 'right', width: 12 }),
      C<TestCatalogRow>('turnaround_hours', 'Target TAT (h)', { format: 'number', align: 'right', width: 14 }),
      C<TestCatalogRow>('method', 'Method', { width: 22 }),
      C<TestCatalogRow>('is_active', 'Active', { width: 8 }),
    ],
    fetch: async (svc): Promise<TestCatalogRow[]> => {
      const { data, error } = await svc.client
        .from('lab_tests')
        .select('code, name, category, specimen_type, unit, ref_min, ref_max, critical_low, critical_high, turnaround_hours, method, is_active')
        .order('category', { ascending: true })
        .order('code', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((t) => ({
        code: t.code,
        name: t.name,
        category: t.category,
        specimen_type: t.specimen_type,
        unit: t.unit,
        ref_min: t.ref_min,
        ref_max: t.ref_max,
        critical_low: t.critical_low,
        critical_high: t.critical_high,
        turnaround_hours: t.turnaround_hours,
        method: t.method,
        is_active: !!t.is_active,
      }));
    },
  },
];
