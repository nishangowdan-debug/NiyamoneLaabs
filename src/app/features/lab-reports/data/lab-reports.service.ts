import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface DateRange { from: string; to: string }

export interface VolumeByCategoryRow { category: string; count: number }
export interface VolumeByDayRow { date: string; count: number }
export interface TopTestRow { code: string; name: string; category: string; count: number; revenue_inr: number }
export interface HomeCollectionStats {
  total: number;
  collected: number;
  cancelled: number;
  cash_inr: number;
  upi_inr: number;
  pending_payment_inr: number;
}
export interface TatStats {
  median_hours: number | null;
  p90_hours: number | null;
  count: number;
}
export interface DoctorPerformance {
  doctor_name: string;
  orders: number;
  critical_results: number;
}
export interface PatientRetentionCohort {
  /** '0-30' | '31-90' | '91-180' | '180+' days since last visit, as of "now". */
  bucket: '0-30' | '31-90' | '91-180' | '180+';
  count: number;
  pct: number;
}
export interface PatientRetentionStats {
  /** Distinct patients with ≥1 order inside the date range. */
  active_patients: number;
  /** Patients whose first-ever order lives inside this range. */
  new_patients: number;
  /** active - new. Had prior orders before the range. */
  returning_patients: number;
  /** Total orders in the window. */
  total_orders: number;
  /** total_orders / active_patients, rounded to 1 decimal. */
  avg_orders_per_patient: number;
  /** Avg revenue per active patient in the window (rupees, rounded). */
  avg_revenue_per_patient_inr: number;
  /** Last-visit cohort across ALL patients (not just range). */
  cohort: PatientRetentionCohort[];
}
export interface DoctorScorecardRow {
  doctor_name: string;
  orders: number;
  unique_patients: number;
  repeat_patients: number;
  /** Patients with > 1 order from this doctor in the window, as a % of unique. */
  repeat_rate_pct: number;
  revenue_inr: number;
  /** Revenue divided by unique_patients, rounded. */
  revenue_per_patient_inr: number;
  critical_results: number;
  /** critical_results / orders × 100. */
  critical_rate_pct: number;
}
export interface RevenueByDayRow {
  date: string;
  /** Lab category revenue in INR (rupees). */
  lab_inr: number;
  imaging_inr: number;
  other_inr: number;
  total_inr: number;
}
export interface PaymentMethodSlice {
  method: 'cash' | 'card' | 'upi' | 'net_banking' | 'cheque' | 'insurance' | 'adjustment';
  amount_inr: number;
  count: number;
}
export interface AgingBucket {
  /** 'current' | '8-15' | '16-30' | '30+' */
  bucket: 'current' | '8-15' | '16-30' | '30+';
  amount_inr: number;
  count: number;
}
export interface AgedInvoice {
  invoice_number: string;
  patient_name: string | null;
  invoice_date: string;
  due_date: string | null;
  balance_inr: number;
  age_days: number;
}
export interface ReceivablesSnapshot {
  buckets: AgingBucket[];
  totalOutstanding_inr: number;
  totalCount: number;
  oldest: AgedInvoice[];
}
export interface CriticalNotificationStats {
  total_raised: number;
  acknowledged: number;
  unacknowledged: number;
  /** Median minutes from raised_at to acknowledged_at, across ack'd alerts. */
  median_minutes: number | null;
  p90_minutes: number | null;
  buckets: { label: string; count: number; pct: number }[];
}
export interface RejectionStats {
  total_orders: number;
  rejected: number;
  rejection_rate_pct: number;
  by_reason: { reason: string; count: number; pct_of_rejected: number }[];
}
export interface TatComplianceRow {
  code: string;
  name: string;
  category: string;
  target_hours: number | null;
  completed: number;
  on_time: number;
  breached: number;
  /** Mean actual TAT in hours across completed results for this test. */
  avg_tat_hours: number | null;
  /** on_time / completed * 100, rounded — null when target is unknown. */
  compliance_pct: number | null;
}
export interface OutsourceLabSummary {
  lab_id: string;
  lab_code: string;
  lab_name: string;
  total: number;
  dispatched: number;   // status='dispatched'
  in_transit: number;
  received: number;
  reported: number;
  cancelled: number;
  avg_tat_hours: number | null; // dispatched_at → reported_at, when reported
  overdue: number;      // expected_return_at past now, not yet reported/cancelled
}

export interface QcRunRow {
  id: string;
  lab_test_code: string | null;
  lab_test_name: string | null;
  instrument_code: string | null;
  lot_number: string;
  level: 'low' | 'normal' | 'high';
  mean_value: number;
  sd_value: number;
  value: number;
  run_at: string;
  sd_units: number;
  warn_1_2s: boolean;
  viol_1_3s: boolean;
  viol_2_2s: boolean;
  viol_4_1s: boolean;
  viol_10_x: boolean;
}
export interface QcSummary {
  totalRuns: number;
  warnings: number;
  violations: number;
  passRate: number;
  rows: QcRunRow[];
}
export interface ReportRecipient {
  id: string;
  email: string;
  branch_id: string | null;
  cadence: 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class LabReportsService {
  private supabase = inject(SupabaseService);

  /** All lab_results inside the date window; the rest of the methods aggregate
   *  this in-memory because Supabase Postgres aggregations need either views
   *  or RPCs which we don't want to require for this MVP. */
  private async resultsInRange(branchId: string | null, range: DateRange) {
    let q: any = (this.supabase.client as any)
      .from('lab_results')
      .select(`
        id, status, flag, measured_at, created_at,
        test:lab_test_id(id, code, name, category, turnaround_hours),
        lab_order:lab_order_id(branch_id, ordered_at, doctor:ordering_doctor_staff_id(full_name))
      `)
      .gte('created_at', range.from)
      .lte('created_at', range.to);
    const { data, error } = await q;
    if (error) throw error;
    let rows = ((data ?? []) as any[]);
    if (branchId) rows = rows.filter((r) => r.lab_order?.branch_id === branchId);
    return rows;
  }

  async volumeByCategory(branchId: string | null, range: DateRange): Promise<VolumeByCategoryRow[]> {
    const rows = await this.resultsInRange(branchId, range);
    const m = new Map<string, number>();
    for (const r of rows) {
      const c = r.test?.category ?? 'unknown';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  }

  async volumeByDay(branchId: string | null, range: DateRange): Promise<VolumeByDayRow[]> {
    const rows = await this.resultsInRange(branchId, range);
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = (r.created_at as string).slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return Array.from(m, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }

  async topTests(branchId: string | null, range: DateRange, limit = 10): Promise<TopTestRow[]> {
    const rows = await this.resultsInRange(branchId, range);
    const testIds = new Set<string>();
    const agg = new Map<string, TopTestRow>();
    for (const r of rows) {
      const t = r.test; if (!t) continue;
      testIds.add(t.id);
      const cur = agg.get(t.code);
      if (cur) cur.count++;
      else agg.set(t.code, { code: t.code, name: t.name, category: t.category, count: 1, revenue_inr: 0 });
    }

    // Pull prices for these tests + the active branch
    if (branchId && testIds.size > 0) {
      const { data: prices } = await (this.supabase.client as any)
        .from('lab_test_prices')
        .select('lab_test_id, price_inr, test:lab_test_id(code)')
        .eq('branch_id', branchId)
        .in('lab_test_id', Array.from(testIds));
      const priceByCode = new Map<string, number>(
        ((prices ?? []) as any[]).map((p) => [p.test?.code, Number(p.price_inr ?? 0)]),
      );
      for (const row of agg.values()) {
        row.revenue_inr = (priceByCode.get(row.code) ?? 0) * row.count;
      }
    }

    return Array.from(agg.values()).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  async tat(branchId: string | null, range: DateRange): Promise<TatStats> {
    const rows = await this.resultsInRange(branchId, range);
    const hours: number[] = [];
    for (const r of rows) {
      if (r.status !== 'verified') continue;
      const ordered = r.lab_order?.ordered_at;
      const measured = r.measured_at;
      if (!ordered || !measured) continue;
      const ms = new Date(measured).getTime() - new Date(ordered).getTime();
      if (ms > 0) hours.push(ms / 36e5);
    }
    if (hours.length === 0) return { median_hours: null, p90_hours: null, count: 0 };
    hours.sort((a, b) => a - b);
    const pick = (q: number) => hours[Math.min(hours.length - 1, Math.floor(q * (hours.length - 1)))];
    return {
      median_hours: Math.round(pick(0.5) * 10) / 10,
      p90_hours: Math.round(pick(0.9) * 10) / 10,
      count: hours.length,
    };
  }

  async homeCollectionStats(branchId: string | null, range: DateRange): Promise<HomeCollectionStats> {
    let q: any = (this.supabase.client as any)
      .from('home_collection_requests')
      .select('id, status, payment_method, paid_inr, total_inr, branch_id, created_at')
      .gte('created_at', range.from)
      .lte('created_at', range.to);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    const out: HomeCollectionStats = {
      total: 0, collected: 0, cancelled: 0, cash_inr: 0, upi_inr: 0, pending_payment_inr: 0,
    };
    for (const r of (data ?? []) as any[]) {
      out.total++;
      if (r.status === 'collected' || r.status === 'received') out.collected++;
      if (r.status === 'cancelled') out.cancelled++;
      const paid = Number(r.paid_inr ?? 0);
      const total = Number(r.total_inr ?? 0);
      if (r.payment_method === 'cash')      out.cash_inr += paid;
      else if (r.payment_method === 'upi')  out.upi_inr  += paid;
      else if (r.status !== 'cancelled')    out.pending_payment_inr += total;
    }
    return out;
  }

  async criticalResults(branchId: string | null, range: DateRange): Promise<number> {
    const rows = await this.resultsInRange(branchId, range);
    return rows.filter((r) => r.flag === 'critical_low' || r.flag === 'critical_high').length;
  }

  /** Critical-result notification timeliness. Reads `lab_critical_alerts` and
   *  measures time-to-acknowledge (raised_at → acknowledged_at). Buckets:
   *  ≤15 min, 16–60 min, 1–4 h, 4 h+. Unacknowledged alerts are counted
   *  separately. NABL guideline is "ack within 1 hour" — anything past that
   *  surfaces as a regression. */
  async criticalNotifications(branchId: string | null, range: DateRange): Promise<CriticalNotificationStats> {
    let q: any = (this.supabase.client as any)
      .from('lab_critical_alerts')
      .select('raised_at, acknowledged_at, status, order:lab_order_id(branch_id)')
      .gte('raised_at', range.from)
      .lte('raised_at', range.to);
    const { data, error } = await q;
    if (error) {
      // Table missing in some DBs — graceful empty state.
      const msg = String(error?.message ?? '').toLowerCase();
      if (msg.includes('lab_critical_alerts') && msg.includes('does not exist')) {
        return { total_raised: 0, acknowledged: 0, unacknowledged: 0, median_minutes: null, p90_minutes: null, buckets: [] };
      }
      throw error;
    }
    let rows = ((data ?? []) as any[]);
    if (branchId) rows = rows.filter((r) => r.order?.branch_id === branchId);

    const total = rows.length;
    const ackd = rows.filter((r) => !!r.acknowledged_at);
    const minutes = ackd
      .map((r) => (new Date(r.acknowledged_at).getTime() - new Date(r.raised_at).getTime()) / 60000)
      .filter((m) => isFinite(m) && m >= 0)
      .sort((a, b) => a - b);

    const pick = (arr: number[], p: number): number | null => {
      if (arr.length === 0) return null;
      const i = Math.min(arr.length - 1, Math.floor((p / 100) * arr.length));
      return +arr[i].toFixed(1);
    };

    const counts = { '≤15 min': 0, '16–60 min': 0, '1–4 h': 0, '4 h+': 0 };
    for (const m of minutes) {
      if (m <= 15) counts['≤15 min']++;
      else if (m <= 60) counts['16–60 min']++;
      else if (m <= 240) counts['1–4 h']++;
      else counts['4 h+']++;
    }
    const buckets = (['≤15 min', '16–60 min', '1–4 h', '4 h+'] as const).map((label) => ({
      label,
      count: counts[label],
      pct: ackd.length > 0 ? Math.round((counts[label] / ackd.length) * 100) : 0,
    }));

    return {
      total_raised: total,
      acknowledged: ackd.length,
      unacknowledged: total - ackd.length,
      median_minutes: pick(minutes, 50),
      p90_minutes: pick(minutes, 90),
      buckets,
    };
  }

  /** Sample rejection rate for the date range. Reads lab_orders with state
   *  inferred from the `state` column (some schemas) or the legacy `status`
   *  column (others) — both are tried. Rejections are identified by either
   *  state/status='rejected' or a non-null `rejection_reason`. */
  async sampleRejections(branchId: string | null, range: DateRange): Promise<RejectionStats> {
    let q: any = (this.supabase.client as any)
      .from('lab_orders')
      .select('id, rejection_reason, status, ordered_at, branch_id, state')
      .gte('ordered_at', range.from)
      .lte('ordered_at', range.to);
    if (branchId) q = q.eq('branch_id', branchId);
    let { data, error } = await q;
    if (error) {
      // Older schemas don't have `state` — retry without it.
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('state') && msg.includes('does not exist')) {
        const retry: any = await (this.supabase.client as any)
          .from('lab_orders')
          .select('id, rejection_reason, status, ordered_at, branch_id')
          .gte('ordered_at', range.from)
          .lte('ordered_at', range.to);
        data = retry.data;
        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }
    const rows = ((data ?? []) as any[])
      .filter((r) => !branchId || r.branch_id === branchId);

    const total = rows.length;
    const isRejected = (r: any) => r.status === 'rejected' || r.state === 'rejected' || !!r.rejection_reason;
    const rejected = rows.filter(isRejected);

    const reasonAcc = new Map<string, number>();
    for (const r of rejected) {
      const key = (r.rejection_reason ?? 'unspecified').trim() || 'unspecified';
      reasonAcc.set(key, (reasonAcc.get(key) ?? 0) + 1);
    }
    const by_reason = Array.from(reasonAcc.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        pct_of_rejected: rejected.length > 0 ? Math.round((count / rejected.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total_orders: total,
      rejected: rejected.length,
      rejection_rate_pct: total > 0 ? +((rejected.length / total) * 100).toFixed(1) : 0,
      by_reason,
    };
  }

  /** Per-test TAT compliance.
   *  - Actual TAT = `measured_at − lab_order.ordered_at`, in hours.
   *  - Target = `lab_tests.turnaround_hours`. Tests without a target are still
   *    listed (so the catalog gap is visible) but have null compliance_pct.
   *  - On-time = actual ≤ target. Sorted by compliance (worst first) so problem
   *    tests surface immediately. */
  async tatCompliance(branchId: string | null, range: DateRange): Promise<TatComplianceRow[]> {
    const rows = await this.resultsInRange(branchId, range);
    const acc = new Map<string, { code: string; name: string; category: string; target: number | null;
                                  completed: number; on_time: number; breached: number;
                                  tatSum: number; tatCount: number }>();
    for (const r of rows) {
      const code = r.test?.code as string | undefined;
      if (!code) continue;
      const cur = acc.get(code) ?? {
        code,
        name: r.test?.name ?? code,
        category: r.test?.category ?? 'unknown',
        target: (r.test?.turnaround_hours ?? null) as number | null,
        completed: 0, on_time: 0, breached: 0,
        tatSum: 0, tatCount: 0,
      };
      const measured = r.measured_at;
      const ordered = r.lab_order?.ordered_at;
      if (measured && ordered) {
        const hours = (new Date(measured).getTime() - new Date(ordered).getTime()) / 3_600_000;
        if (isFinite(hours) && hours >= 0) {
          cur.completed++;
          cur.tatSum += hours;
          cur.tatCount++;
          if (cur.target != null) {
            if (hours <= cur.target) cur.on_time++;
            else cur.breached++;
          }
        }
      }
      acc.set(code, cur);
    }
    return Array.from(acc.values())
      .filter((v) => v.completed > 0)
      .map((v) => ({
        code: v.code,
        name: v.name,
        category: v.category,
        target_hours: v.target,
        completed: v.completed,
        on_time: v.on_time,
        breached: v.breached,
        avg_tat_hours: v.tatCount > 0 ? +(v.tatSum / v.tatCount).toFixed(1) : null,
        compliance_pct: v.target != null && v.completed > 0
          ? Math.round((v.on_time / v.completed) * 100)
          : null,
      }))
      .sort((a, b) => {
        // Worst compliance first; nulls last; tie-break by completed volume desc.
        if (a.compliance_pct == null && b.compliance_pct == null) return b.completed - a.completed;
        if (a.compliance_pct == null) return 1;
        if (b.compliance_pct == null) return -1;
        return a.compliance_pct - b.compliance_pct || b.completed - a.completed;
      });
  }

  /** Per-reference-lab dispatch summary for the date range.
   *  Aggregates `reference_lab_dispatches` by `reference_lab_id`, plus TAT
   *  (reported_at - dispatched_at) for completed dispatches and an overdue
   *  count for ones past `expected_return_at`. */
  async outsourceSummary(branchId: string | null, range: DateRange): Promise<OutsourceLabSummary[]> {
    let q: any = (this.supabase.client as any)
      .from('reference_lab_dispatches')
      .select(`
        status, dispatched_at, reported_at, expected_return_at, branch_id,
        reference_lab:reference_lab_id(id, code, name)
      `)
      .gte('dispatched_at', range.from)
      .lte('dispatched_at', range.to);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;

    const acc = new Map<string, OutsourceLabSummary & { _tatSum: number; _tatCount: number }>();
    const now = Date.now();
    for (const row of ((data ?? []) as any[])) {
      const lab = row.reference_lab;
      if (!lab?.id) continue;
      const key = lab.id;
      const cur = acc.get(key) ?? {
        lab_id: lab.id, lab_code: lab.code, lab_name: lab.name,
        total: 0, dispatched: 0, in_transit: 0, received: 0, reported: 0, cancelled: 0,
        avg_tat_hours: null, overdue: 0,
        _tatSum: 0, _tatCount: 0,
      };
      cur.total++;
      switch (row.status) {
        case 'dispatched': cur.dispatched++; break;
        case 'in_transit': cur.in_transit++; break;
        case 'received':   cur.received++; break;
        case 'reported':   cur.reported++; break;
        case 'cancelled':  cur.cancelled++; break;
      }
      if (row.reported_at && row.dispatched_at) {
        const tatHours = (new Date(row.reported_at).getTime() - new Date(row.dispatched_at).getTime()) / 3_600_000;
        if (isFinite(tatHours) && tatHours >= 0) {
          cur._tatSum += tatHours;
          cur._tatCount++;
        }
      }
      if (
        row.expected_return_at &&
        new Date(row.expected_return_at).getTime() < now &&
        row.status !== 'reported' &&
        row.status !== 'cancelled'
      ) {
        cur.overdue++;
      }
      acc.set(key, cur);
    }
    return Array.from(acc.values())
      .map((r) => {
        const { _tatSum, _tatCount, ...rest } = r;
        return { ...rest, avg_tat_hours: _tatCount > 0 ? +(_tatSum / _tatCount).toFixed(1) : null };
      })
      .sort((a, b) => b.total - a.total);
  }

  /** Current outstanding receivables snapshot. Aged from `due_date` if present,
   *  else `invoice_date`. Buckets: current (≤7 days), 8-15, 16-30, 30+.
   *  Voided / refunded / draft invoices are excluded. Date-range filter does
   *  NOT apply — this is a live "what do we owe" view at the moment of load. */
  async outstandingReceivables(branchId: string | null): Promise<ReceivablesSnapshot> {
    let q: any = (this.supabase.client as any)
      .from('invoices')
      .select(`
        invoice_number, invoice_date, due_date, balance_cents, status, branch_id,
        patient:patient_id(full_name, first_name, last_name)
      `)
      .gt('balance_cents', 0)
      .not('status', 'in', '(void,refunded,draft)');
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;

    const now = Date.now();
    const buckets: Record<AgingBucket['bucket'], AgingBucket> = {
      'current': { bucket: 'current', amount_inr: 0, count: 0 },
      '8-15':    { bucket: '8-15',    amount_inr: 0, count: 0 },
      '16-30':   { bucket: '16-30',   amount_inr: 0, count: 0 },
      '30+':     { bucket: '30+',     amount_inr: 0, count: 0 },
    };
    const aged: AgedInvoice[] = [];

    for (const row of ((data ?? []) as any[])) {
      const refDate = row.due_date ?? row.invoice_date;
      if (!refDate) continue;
      const ageMs = now - new Date(refDate).getTime();
      const ageDays = Math.max(0, Math.floor(ageMs / (24 * 3600 * 1000)));
      const rupees = (row.balance_cents ?? 0) / 100;
      const key: AgingBucket['bucket'] =
        ageDays <= 7 ? 'current'
        : ageDays <= 15 ? '8-15'
        : ageDays <= 30 ? '16-30'
        : '30+';
      buckets[key].amount_inr += rupees;
      buckets[key].count++;

      aged.push({
        invoice_number: row.invoice_number,
        patient_name: row.patient?.full_name
          ?? [row.patient?.first_name, row.patient?.last_name].filter(Boolean).join(' ')
          ?? null,
        invoice_date: row.invoice_date,
        due_date: row.due_date,
        balance_inr: rupees,
        age_days: ageDays,
      });
    }

    const totalOutstanding_inr = Object.values(buckets).reduce((s, b) => s + b.amount_inr, 0);
    const totalCount = Object.values(buckets).reduce((s, b) => s + b.count, 0);
    const oldest = aged.sort((a, b) => b.age_days - a.age_days).slice(0, 8);

    return {
      buckets: ['current', '8-15', '16-30', '30+'].map((k) => buckets[k as AgingBucket['bucket']]),
      totalOutstanding_inr,
      totalCount,
      oldest,
    };
  }

  /** Payment-method mix for the date range. Reads `payments` directly so
   *  partially-paid invoices still count proportionally. Voided payments are
   *  excluded (`voided_at IS NULL`). Group by method, returning rupees + count. */
  async paymentMix(branchId: string | null, range: DateRange): Promise<PaymentMethodSlice[]> {
    let q: any = (this.supabase.client as any)
      .from('payments')
      .select(`
        method, amount_cents, paid_at, voided_at,
        invoice:invoice_id!inner(branch_id, status)
      `)
      .gte('paid_at', range.from)
      .lte('paid_at', range.to)
      .is('voided_at', null);
    if (branchId) q = q.eq('invoice.branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;

    const acc = new Map<string, PaymentMethodSlice>();
    for (const row of ((data ?? []) as any[])) {
      const method = (row.method ?? 'cash') as PaymentMethodSlice['method'];
      const rupees = (row.amount_cents ?? 0) / 100;
      const cur = acc.get(method) ?? { method, amount_inr: 0, count: 0 };
      cur.amount_inr += rupees;
      cur.count++;
      acc.set(method, cur);
    }
    return Array.from(acc.values())
      .filter((s) => s.amount_inr > 0)
      .sort((a, b) => b.amount_inr - a.amount_inr);
  }

  /** Daily revenue split by service.category (lab / imaging / other) over the
   *  date range. Reads paid invoice_items joined to services for category, and
   *  groups by invoice_date in IST (so daily buckets line up with local days). */
  async revenueByDay(branchId: string | null, range: DateRange): Promise<RevenueByDayRow[]> {
    let q: any = (this.supabase.client as any)
      .from('invoice_items')
      .select(`
        total_cents,
        service:service_id(category),
        invoice:invoice_id!inner(invoice_date, branch_id, status)
      `)
      .gte('invoice.invoice_date', range.from)
      .lte('invoice.invoice_date', range.to)
      .not('invoice.status', 'in', '(void,refunded,draft)');
    if (branchId) q = q.eq('invoice.branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;

    const byDate = new Map<string, RevenueByDayRow>();
    for (const row of ((data ?? []) as any[])) {
      const dateRaw = row.invoice?.invoice_date as string | null;
      if (!dateRaw) continue;
      // Trim ISO to YYYY-MM-DD so all hours in a day collapse to one bucket.
      const date = dateRaw.slice(0, 10);
      const cat = (row.service?.category ?? 'other') as string;
      const rupees = (row.total_cents ?? 0) / 100;
      const cur = byDate.get(date) ?? { date, lab_inr: 0, imaging_inr: 0, other_inr: 0, total_inr: 0 };
      if (cat === 'lab') cur.lab_inr += rupees;
      else if (cat === 'imaging') cur.imaging_inr += rupees;
      else cur.other_inr += rupees;
      cur.total_inr += rupees;
      byDate.set(date, cur);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Patient retention stats. Two queries:
   *   1. lab_orders inside the window — to count active + new + revenue.
   *   2. lab_orders FOR THE SAME PATIENTS but unbounded — to find each patient's
   *      first-ever order (decides new vs returning) AND last-ever order (cohort).
   *  Cohort buckets are computed over ALL patients with any order, not just the
   *  range — that's the standard "where does my patient base sit right now" view. */
  async patientRetention(branchId: string | null, range: DateRange): Promise<PatientRetentionStats> {
    // 1. In-range orders, with patient + invoice for revenue.
    let inRangeQ: any = (this.supabase.client as any)
      .from('lab_orders')
      .select(`
        patient_id, invoice_id, branch_id, ordered_at,
        invoice:invoice_id(total_cents, status)
      `)
      .gte('ordered_at', range.from)
      .lte('ordered_at', range.to);
    if (branchId) inRangeQ = inRangeQ.eq('branch_id', branchId);
    const { data: inRange, error: e1 } = await inRangeQ;
    if (e1) throw e1;

    const inRangeRows = (inRange ?? []) as any[];
    const activePatients = new Set<string>();
    const patientRevenue = new Map<string, { invoiceIds: Set<string>; rupees: number }>();
    for (const o of inRangeRows) {
      if (!o.patient_id) continue;
      activePatients.add(o.patient_id);
      const cur = patientRevenue.get(o.patient_id) ?? { invoiceIds: new Set<string>(), rupees: 0 };
      if (o.invoice_id && o.invoice?.status && !['void','refunded','draft'].includes(o.invoice.status)) {
        if (!cur.invoiceIds.has(o.invoice_id)) {
          cur.invoiceIds.add(o.invoice_id);
          cur.rupees += (o.invoice.total_cents ?? 0) / 100;
        }
      }
      patientRevenue.set(o.patient_id, cur);
    }

    // 2. ALL orders for these patients (find earliest + latest per patient).
    //    Limited to branch to scope, no date filter.
    let allQ: any = (this.supabase.client as any)
      .from('lab_orders')
      .select('patient_id, ordered_at, branch_id');
    if (branchId) allQ = allQ.eq('branch_id', branchId);
    const { data: allOrders, error: e2 } = await allQ;
    if (e2) throw e2;

    const earliest = new Map<string, number>();
    const latest = new Map<string, number>();
    for (const o of ((allOrders ?? []) as any[])) {
      if (!o.patient_id || !o.ordered_at) continue;
      const t = new Date(o.ordered_at).getTime();
      if (!isFinite(t)) continue;
      if (!earliest.has(o.patient_id) || t < earliest.get(o.patient_id)!) earliest.set(o.patient_id, t);
      if (!latest.has(o.patient_id)   || t > latest.get(o.patient_id)!)   latest.set(o.patient_id, t);
    }

    const rangeStart = new Date(range.from).getTime();
    let newPatients = 0;
    for (const pid of activePatients) {
      const first = earliest.get(pid);
      if (first != null && first >= rangeStart) newPatients++;
    }

    // Cohort: bucket every patient with any order by days-since-last-visit.
    const now = Date.now();
    const cohortCounts = { '0-30': 0, '31-90': 0, '91-180': 0, '180+': 0 };
    let cohortTotal = 0;
    for (const [, t] of latest) {
      const days = Math.floor((now - t) / (24 * 3600 * 1000));
      cohortTotal++;
      if (days <= 30)      cohortCounts['0-30']++;
      else if (days <= 90) cohortCounts['31-90']++;
      else if (days <= 180)cohortCounts['91-180']++;
      else                 cohortCounts['180+']++;
    }
    const cohort: PatientRetentionCohort[] = (['0-30','31-90','91-180','180+'] as const).map((b) => ({
      bucket: b,
      count: cohortCounts[b],
      pct: cohortTotal > 0 ? Math.round((cohortCounts[b] / cohortTotal) * 100) : 0,
    }));

    const totalRevenueRupees = Array.from(patientRevenue.values()).reduce((s, v) => s + v.rupees, 0);
    const active = activePatients.size;

    return {
      active_patients: active,
      new_patients: newPatients,
      returning_patients: Math.max(0, active - newPatients),
      total_orders: inRangeRows.length,
      avg_orders_per_patient: active > 0 ? +(inRangeRows.length / active).toFixed(1) : 0,
      avg_revenue_per_patient_inr: active > 0 ? Math.round(totalRevenueRupees / active) : 0,
      cohort,
    };
  }

  /** Richer per-doctor scorecard: orders, unique patients, repeat rate,
   *  revenue (deduped by invoice so the same invoice isn't double-counted across
   *  multiple lab orders), critical hit-rate. Sorted by orders desc. */
  async doctorScorecard(branchId: string | null, range: DateRange, limit = 15): Promise<DoctorScorecardRow[]> {
    let q: any = (this.supabase.client as any)
      .from('lab_orders')
      .select(`
        id, patient_id, invoice_id, branch_id, ordered_at,
        doctor:ordering_doctor_staff_id(full_name),
        invoice:invoice_id(total_cents, status),
        results:lab_results(flag)
      `)
      .gte('ordered_at', range.from)
      .lte('ordered_at', range.to);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;

    type Acc = {
      doctor_name: string;
      orders: number;
      patients: Set<string>;
      patientOrderCount: Map<string, number>;
      criticals: number;
      invoiceIds: Set<string>;
      revenueRupees: number;
    };
    const acc = new Map<string, Acc>();

    for (const o of ((data ?? []) as any[])) {
      const name = (o.doctor?.full_name ?? 'Unassigned') as string;
      const cur = acc.get(name) ?? {
        doctor_name: name,
        orders: 0,
        patients: new Set<string>(),
        patientOrderCount: new Map<string, number>(),
        criticals: 0,
        invoiceIds: new Set<string>(),
        revenueRupees: 0,
      };
      cur.orders++;
      if (o.patient_id) {
        cur.patients.add(o.patient_id);
        cur.patientOrderCount.set(o.patient_id, (cur.patientOrderCount.get(o.patient_id) ?? 0) + 1);
      }
      for (const r of (o.results ?? [])) {
        if (r.flag === 'critical_low' || r.flag === 'critical_high') cur.criticals++;
      }
      // Revenue: dedupe invoice_id, skip void/refunded.
      if (o.invoice_id && o.invoice?.status && !['void', 'refunded', 'draft'].includes(o.invoice.status)) {
        if (!cur.invoiceIds.has(o.invoice_id)) {
          cur.invoiceIds.add(o.invoice_id);
          cur.revenueRupees += (o.invoice.total_cents ?? 0) / 100;
        }
      }
      acc.set(name, cur);
    }

    return Array.from(acc.values())
      .map<DoctorScorecardRow>((v) => {
        const unique = v.patients.size;
        const repeat = Array.from(v.patientOrderCount.values()).filter((c) => c > 1).length;
        return {
          doctor_name: v.doctor_name,
          orders: v.orders,
          unique_patients: unique,
          repeat_patients: repeat,
          repeat_rate_pct: unique > 0 ? Math.round((repeat / unique) * 100) : 0,
          revenue_inr: Math.round(v.revenueRupees),
          revenue_per_patient_inr: unique > 0 ? Math.round(v.revenueRupees / unique) : 0,
          critical_results: v.criticals,
          critical_rate_pct: v.orders > 0 ? +((v.criticals / v.orders) * 100).toFixed(1) : 0,
        };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, limit);
  }

  async doctorPerformance(branchId: string | null, range: DateRange, limit = 10): Promise<DoctorPerformance[]> {
    const rows = await this.resultsInRange(branchId, range);
    const m = new Map<string, DoctorPerformance>();
    for (const r of rows) {
      const name = r.lab_order?.doctor?.full_name ?? 'Unassigned';
      const cur = m.get(name) ?? { doctor_name: name, orders: 0, critical_results: 0 };
      cur.orders++;
      if (r.flag === 'critical_low' || r.flag === 'critical_high') cur.critical_results++;
      m.set(name, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.orders - a.orders).slice(0, limit);
  }

  /** QC dashboard data — pulls from `vw_qc_runs_with_flags` (Westgard rules)
   *  filtered to the date range. Gracefully degrades to empty if the QC
   *  migration hasn't run. */
  async qcSummary(branchId: string | null, range: DateRange, limit = 100): Promise<QcSummary> {
    const empty: QcSummary = { totalRuns: 0, warnings: 0, violations: 0, passRate: 0, rows: [] };
    let q: any = (this.supabase.client as any)
      .from('vw_qc_runs_with_flags')
      .select(`
        id, lab_test_id, instrument_id, lot_number, level, mean_value, sd_value,
        value, run_at, sd_units, warn_1_2s, viol_1_3s, viol_2_2s, viol_4_1s, viol_10_x,
        test:lab_test_id(code, name),
        instrument:instrument_id(code)
      `)
      .gte('run_at', range.from)
      .lte('run_at', range.to)
      .order('run_at', { ascending: false })
      .limit(limit);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) {
      const msg = String(error?.message ?? '').toLowerCase();
      if (msg.includes('vw_qc_runs_with_flags') && msg.includes('does not exist')) return empty;
      throw error;
    }
    const rows = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      lab_test_code: r.test?.code ?? null,
      lab_test_name: r.test?.name ?? null,
      instrument_code: r.instrument?.code ?? null,
      lot_number: r.lot_number,
      level: r.level,
      mean_value: Number(r.mean_value),
      sd_value: Number(r.sd_value),
      value: Number(r.value),
      run_at: r.run_at,
      sd_units: Number(r.sd_units ?? 0),
      warn_1_2s: !!r.warn_1_2s,
      viol_1_3s: !!r.viol_1_3s,
      viol_2_2s: !!r.viol_2_2s,
      viol_4_1s: !!r.viol_4_1s,
      viol_10_x: !!r.viol_10_x,
    })) as QcRunRow[];

    const violations = rows.filter((r) => r.viol_1_3s || r.viol_2_2s || r.viol_4_1s || r.viol_10_x).length;
    const warnings = rows.filter((r) => r.warn_1_2s && !r.viol_1_3s && !r.viol_2_2s && !r.viol_4_1s && !r.viol_10_x).length;
    const passRate = rows.length > 0
      ? Math.round(((rows.length - violations) / rows.length) * 100)
      : 0;
    return { totalRuns: rows.length, warnings, violations, passRate, rows };
  }

  // ── Scheduled email recipients ──────────────────────────────────────
  /** List active + inactive recipients. Empty if the table isn't installed. */
  async listRecipients(): Promise<ReportRecipient[]> {
    const { data, error } = await this.supabase.client
      .from('report_recipients')
      .select('*')
      .order('cadence')
      .order('email');
    if (error) {
      const msg = String(error?.message ?? '').toLowerCase();
      if (msg.includes('report_recipients') && msg.includes('does not exist')) return [];
      throw error;
    }
    return ((data ?? []) as ReportRecipient[]);
  }

  async addRecipient(input: { email: string; cadence: ReportRecipient['cadence']; branch_id: string | null }) {
    const { error } = await (this.supabase.client as any)
      .from('report_recipients').insert(input);
    if (error) throw error;
  }

  async setRecipientActive(id: string, active: boolean) {
    const { error } = await (this.supabase.client as any)
      .from('report_recipients').update({ is_active: active }).eq('id', id);
    if (error) throw error;
  }

  async removeRecipient(id: string) {
    const { error } = await (this.supabase.client as any)
      .from('report_recipients').delete().eq('id', id);
    if (error) throw error;
  }

  /** Fire the Edge Function manually for a test-send. Returns the response body. */
  async sendTestReport(input: { preset: ReportRecipient['cadence']; to_override: string; branch_id?: string | null }) {
    const { data, error } = await (this.supabase.client as any).functions.invoke('send-lab-report', {
      body: {
        range_preset: input.preset,
        to_override: input.to_override,
        branch_id: input.branch_id ?? null,
      },
    });
    if (error) throw error;
    return data;
  }
}
