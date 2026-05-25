import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { LabSampleStatus, LabResultStatus } from '../../../core/supabase/supabase.types';

export interface LabKpis {
  toCollect: number;       // sample_status = 'pending'
  inProcess: number;       // sample_status = 'collected' OR running results
  toVerify: number;        // results entered, not yet verified
  reportsToday: number;    // distinct orders fully verified in the last 24h
  critical: number;        // results flagged critical_low / critical_high, last 24h
  homeToday: number;       // home_collection_requests scheduled today, not cancelled
}

export interface PendingSampleRow {
  order_id: string;
  uhid: string;
  patient_name: string;
  ordered_at: string;
  priority: 'routine' | 'urgent' | 'stat';
  pending_count: number;
}

export interface HomeCollectionRow {
  id: string;
  scheduled_at: string;
  patient_name: string;
  uhid: string;
  pincode: string;
  status: string;
  phlebotomist_name: string | null;
  total_inr: number;
}

export interface CriticalResultRow {
  result_id: string;
  test_code: string;
  test_name: string;
  patient_name: string;
  uhid: string;
  value: string | null;
  flag: 'critical_low' | 'critical_high';
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  measured_at: string;
}

export interface TopTestRow {
  code: string;
  name: string;
  category: string;
  count: number;
}

export interface LabRevenueDay {
  date: string;       // YYYY-MM-DD
  lab_cents: number;
  imaging_cents: number;
}

export type DashboardPeriod = 'daily' | 'weekly' | 'monthly';
export type RevenueGranularity = DashboardPeriod;

/** Hours of history a "current period" window covers for count-style KPIs. */
export const PERIOD_HOURS: Record<DashboardPeriod, number> = {
  daily:   24,
  weekly:  24 * 7,
  monthly: 24 * 30,
};

/** Days a trend chart should span (chart x-axis range). */
export const PERIOD_TREND_DAYS: Record<DashboardPeriod, number> = {
  daily:   30,
  weekly:  84,   // 12 weeks
  monthly: 365,  // 12 months
};

export interface VolumeBucket {
  key: string;
  label: string;
  orders: number;
  reports: number;
}

export interface StatusMix {
  to_collect: number;
  in_process: number;
  to_verify: number;
  verified: number;
  total: number;
}

export interface BranchRevenueRow {
  branch_id: string;
  code: string;
  name: string;
  cents: number;
  prev_cents: number;
  share: number;          // 0–1, share of the network total in the current window
  deltaPct: number | null; // % vs prior period; null when prior was 0 but current > 0
  rank: number;            // 1-indexed rank by current cents
}

export interface BranchRevenue {
  rows: BranchRevenueRow[];
  totalCents: number;
  prevTotalCents: number;
  topCents: number;        // for bar width scaling
  windowStart: string;
  windowEnd: string;
}

export interface RevenueBucket {
  key: string;                        // YYYY-MM-DD (daily), YYYY-Www (weekly), YYYY-MM (monthly)
  label: string;                      // Short human label for chart x-axis
  byCategory: Record<string, number>; // cents per category
  total: number;                      // total cents in this bucket
}

export interface RevenueCategorySummary {
  code: string;     // raw category key (e.g. 'lab', 'imaging', 'pharmacy')
  label: string;    // title-cased label for display
  cents: number;    // total cents across the window
  share: number;    // 0-1 share of total
  color: string;    // hex color
}

export interface RevenueSeries {
  granularity: RevenueGranularity;
  buckets: RevenueBucket[];
  categories: RevenueCategorySummary[];
  totalCents: number;
  prevTotalCents: number;
  deltaPct: number | null;            // null if prev = 0
  windowStart: string;                // ISO date string (inclusive)
  windowEnd: string;                  // ISO date string (inclusive)
  fetchedAt: string;                  // ISO timestamp of when the data landed
}

@Injectable({ providedIn: 'root' })
export class LabDashboardService {
  private supabase = inject(SupabaseService);

  /** Cached lab_tests.code -> category map (lasts the session). */
  private labTestCategoryCache: Map<string, string> | null = null;

  private async loadLabTestCategoryMap(): Promise<Map<string, string>> {
    if (this.labTestCategoryCache) return this.labTestCategoryCache;
    const map = new Map<string, string>();
    try {
      const { data } = await (this.supabase.client as any)
        .from('lab_tests')
        .select('code, name, category')
        .eq('is_active', true);
      const aliases: Record<string, string> = { radiology: 'imaging', hematology: 'haematology' };
      for (const r of (data ?? []) as Array<{ code: string; name: string; category: string }>) {
        const raw = (r.category ?? 'other').toLowerCase();
        const cat = aliases[raw] ?? raw;
        if (r?.code) {
          const code = r.code.toUpperCase();
          map.set(code, cat);
          // Service catalog uses prefixed codes (DASH-CBC, LAB-CBC, etc.).
          // Pre-seed the prefixed variants so dashboard categorization works
          // without forcing a data migration on services.
          for (const pfx of ['DASH-', 'LAB-', 'TEST-']) {
            map.set(pfx + code, cat);
          }
        }
        if (r?.name) {
          // Match by upper-cased name too — falls through when the prefix
          // isn't one of the well-known ones.
          map.set(r.name.toUpperCase(), cat);
        }
      }
    } catch {
      /* table may not exist yet — empty map is fine */
    }
    this.labTestCategoryCache = map;
    return map;
  }

  private todayBounds(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  /** Run a Supabase query, return its count, swallow schema/RLS errors so one
   *  missing table doesn't kill the whole dashboard. Logs once per query. */
  private async safeCount(label: string, queryFn: () => any): Promise<number> {
    try {
      const { count, error } = await queryFn();
      if (error) {
        // 400 = bad column, 404 = missing table — both happen when schema drifts
        console.warn(`[lab-dashboard] ${label} failed:`, error.code, error.message);
        return 0;
      }
      return count ?? 0;
    } catch (e: any) {
      console.warn(`[lab-dashboard] ${label} threw:`, e?.message ?? e);
      return 0;
    }
  }

  async loadKpis(branchId: string | null, period: DashboardPeriod = 'daily'): Promise<LabKpis> {
    const { start, end } = this.todayBounds();
    const hours = PERIOD_HOURS[period];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const orderQuery = (sampleStatus: LabSampleStatus) => () => {
      let q = this.supabase.client.from('lab_orders').select('id', { count: 'exact', head: true })
        .eq('sample_status', sampleStatus);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    };

    const resultByStatusQuery = (status: LabResultStatus) => () => {
      let q: any = (this.supabase.client as any).from('lab_results')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return q;
    };

    const criticalQuery = () => (this.supabase.client as any).from('lab_results')
      .select('id', { count: 'exact', head: true })
      .in('flag', ['critical_low', 'critical_high'])
      .gte('entered_at', since);

    // Home collections: daily = today only; weekly/monthly = upcoming window.
    const homeQuery = () => {
      let q = (this.supabase.client as any).from('home_collection_requests')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'cancelled');
      if (period === 'daily') q = q.gte('scheduled_at', start).lte('scheduled_at', end);
      else                    q = q.gte('scheduled_at', start).lte('scheduled_at', until);
      if (branchId)            q = q.eq('branch_id', branchId);
      return q;
    };

    const reportsQuery = () => {
      let q = this.supabase.client.from('lab_orders')
        .select('id', { count: 'exact', head: true })
        .gte('reported_at', since);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    };

    const [toCollect, collected, running, toVerify, critical, homeToday, reportsToday] = await Promise.all([
      this.safeCount('orders pending',   orderQuery('pending')),
      this.safeCount('orders collected', orderQuery('collected')),
      this.safeCount('orders running',   orderQuery('running')),
      this.safeCount('results entered',  resultByStatusQuery('entered')),
      this.safeCount('critical results', criticalQuery),
      this.safeCount('home collections', homeQuery),
      this.safeCount('reports today',    reportsQuery),
    ]);

    return {
      toCollect,
      inProcess: collected + running,
      toVerify,
      reportsToday,
      critical,
      homeToday,
    };
  }

  async pendingSamples(branchId: string | null, limit = 12): Promise<PendingSampleRow[]> {
    try {
      let q: any = this.supabase.client
        .from('lab_orders')
        .select(`
          id, ordered_at, priority,
          patient:patient_id(uhid, first_name, last_name),
          results:lab_results(id, status)
        `)
        .eq('sample_status', 'pending')
        .order('priority', { ascending: true })
        .order('ordered_at', { ascending: true })
        .limit(limit);
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) { console.warn('[lab-dashboard] pendingSamples failed:', error.message); return []; }
      return ((data ?? []) as any[]).map((o) => ({
        order_id: o.id,
        uhid: o.patient?.uhid ?? '',
        patient_name: `${o.patient?.first_name ?? ''} ${o.patient?.last_name ?? ''}`.trim() || '—',
        ordered_at: o.ordered_at,
        priority: o.priority,
        pending_count: (o.results ?? []).filter((r: any) => r.status === 'pending').length,
      }));
    } catch (e: any) {
      console.warn('[lab-dashboard] pendingSamples threw:', e?.message ?? e); return [];
    }
  }

  async todaysHomeCollections(branchId: string | null): Promise<HomeCollectionRow[]> {
    if (!branchId) return [];
    try {
      const { start, end } = this.todayBounds();
      const { data, error } = await (this.supabase.client as any)
        .from('home_collection_requests')
        .select(`
          id, scheduled_at, status, total_inr, address,
          patient:patient_id(uhid, first_name, last_name),
          phlebotomist:phlebotomists(staff:staff_id(full_name))
        `)
        .eq('branch_id', branchId)
        .gte('scheduled_at', start).lte('scheduled_at', end)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true });
      if (error) { console.warn('[lab-dashboard] todaysHomeCollections failed:', error.message); return []; }
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        scheduled_at: r.scheduled_at,
        patient_name: `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim() || '—',
        uhid: r.patient?.uhid ?? '',
        pincode: r.address?.pincode ?? '',
        status: r.status,
        phlebotomist_name: r.phlebotomist?.staff?.full_name ?? null,
        total_inr: Number(r.total_inr ?? 0),
      }));
    } catch (e: any) {
      console.warn('[lab-dashboard] todaysHomeCollections threw:', e?.message ?? e); return [];
    }
  }

  async criticalResults(branchId: string | null, hoursBack = 24, limit = 8): Promise<CriticalResultRow[]> {
    try {
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      const q: any = (this.supabase.client as any)
        .from('lab_results')
        .select(`
          id, value_numeric, value_text, flag, entered_at, verified_at,
          test:lab_test_id(code, name, unit, ref_min, ref_max),
          lab_order:lab_order_id(branch_id, patient:patient_id(uhid, first_name, last_name))
        `)
        .in('flag', ['critical_low', 'critical_high'])
        .gte('entered_at', since)
        .order('entered_at', { ascending: false })
        .limit(limit);
      const { data, error } = await q;
      if (error) { console.warn('[lab-dashboard] criticalResults failed:', error.message); return []; }
      const rows = ((data ?? []) as any[]).filter((r) => !branchId || r.lab_order?.branch_id === branchId);
      return rows.map((r) => ({
        result_id: r.id,
        test_code: r.test?.code ?? '',
        test_name: r.test?.name ?? '',
        patient_name: `${r.lab_order?.patient?.first_name ?? ''} ${r.lab_order?.patient?.last_name ?? ''}`.trim() || '—',
        uhid: r.lab_order?.patient?.uhid ?? '',
        value: r.value_numeric != null ? String(r.value_numeric) : (r.value_text ?? null),
        flag: r.flag,
        unit: r.test?.unit ?? null,
        ref_low: r.test?.ref_min ?? null,
        ref_high: r.test?.ref_max ?? null,
        measured_at: r.entered_at ?? r.verified_at ?? '',
      }));
    } catch (e: any) {
      console.warn('[lab-dashboard] criticalResults threw:', e?.message ?? e); return [];
    }
  }

  async topTestsByPeriod(branchId: string | null, period: DashboardPeriod, limit = 8): Promise<TopTestRow[]> {
    const days = period === 'daily' ? 7 : period === 'weekly' ? 30 : 90;
    return this.topTests(branchId, days, limit);
  }

  /** Per-bucket orders + reports across the period. Single round-trip. */
  async loadVolumeTrend(branchId: string | null, period: DashboardPeriod): Promise<VolumeBucket[]> {
    const days = PERIOD_TREND_DAYS[period];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
    const end = new Date(); end.setHours(23, 59, 59, 999);

    const buckets = this.makeVolumeBuckets(period, start, end);

    let q: any = this.supabase.client
      .from('lab_orders')
      .select('id, ordered_at, reported_at, branch_id')
      .gte('ordered_at', start.toISOString());
    if (branchId) q = q.eq('branch_id', branchId);

    try {
      const { data, error } = await q;
      if (error) { console.warn('[lab-dashboard] volume trend failed:', error.message); return buckets; }
      for (const o of (data ?? []) as any[]) {
        const orderedAt = new Date(o.ordered_at);
        if (orderedAt >= start && orderedAt <= end) {
          const key = this.bucketKey(orderedAt, period);
          const slot = buckets.find((b) => b.key === key);
          if (slot) slot.orders++;
        }
        if (o.reported_at) {
          const finAt = new Date(o.reported_at);
          if (finAt >= start && finAt <= end) {
            const key = this.bucketKey(finAt, period);
            const slot = buckets.find((b) => b.key === key);
            if (slot) slot.reports++;
          }
        }
      }
    } catch (e: any) {
      console.warn('[lab-dashboard] volume trend threw:', e?.message ?? e);
    }
    return buckets;
  }

  /** Snapshot of sample/result status across the lifecycle — drives a donut chart. */
  async loadStatusMix(branchId: string | null): Promise<StatusMix> {
    const orderQuery = (sampleStatus: LabSampleStatus) => () => {
      let q = this.supabase.client.from('lab_orders').select('id', { count: 'exact', head: true })
        .eq('sample_status', sampleStatus);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    };
    const resultByStatus = (status: LabResultStatus) => () => (this.supabase.client as any)
      .from('lab_results').select('id', { count: 'exact', head: true }).eq('status', status);

    const [pending, collected, running, entered, verified] = await Promise.all([
      this.safeCount('mix:pending',   orderQuery('pending')),
      this.safeCount('mix:collected', orderQuery('collected')),
      this.safeCount('mix:running',   orderQuery('running')),
      this.safeCount('mix:entered',   resultByStatus('entered')),
      this.safeCount('mix:verified',  resultByStatus('verified')),
    ]);

    const to_collect = pending;
    const in_process = collected + running;
    const to_verify  = entered;
    const total = to_collect + in_process + to_verify + verified;
    return { to_collect, in_process, to_verify, verified, total };
  }

  private makeVolumeBuckets(g: DashboardPeriod, start: Date, end: Date): VolumeBucket[] {
    const out: VolumeBucket[] = [];
    if (g === 'daily') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        out.push({ key: d.toISOString().slice(0, 10),
                   label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                   orders: 0, reports: 0 });
      }
    } else if (g === 'weekly') {
      // Walk in 7-day strides anchored to Mondays
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        out.push({ key: this.bucketKey(d, 'weekly'),
                   label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                   orders: 0, reports: 0 });
      }
    } else {
      const cur = new Date(start);
      while (cur <= end) {
        out.push({ key: this.bucketKey(cur, 'monthly'),
                   label: cur.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
                   orders: 0, reports: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    return out;
  }

  async topTests(branchId: string | null, days = 7, limit = 8): Promise<TopTestRow[]> {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const q: any = (this.supabase.client as any)
        .from('lab_results')
        .select(`test:lab_test_id(code, name, category), lab_order:lab_order_id(branch_id)`)
        .gte('created_at', since);
      const { data, error } = await q;
      if (error) { console.warn('[lab-dashboard] topTests failed:', error.message); return []; }
      const counts = new Map<string, TopTestRow>();
      for (const r of (data ?? []) as any[]) {
        if (branchId && r.lab_order?.branch_id !== branchId) continue;
        const t = r.test;
        if (!t?.code) continue;
        const cur = counts.get(t.code);
        if (cur) cur.count++;
        else counts.set(t.code, { code: t.code, name: t.name, category: t.category, count: 1 });
      }
      return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit);
    } catch (e: any) {
      console.warn('[lab-dashboard] topTests threw:', e?.message ?? e); return [];
    }
  }

  async revenueLast7Days(branchId: string | null): Promise<LabRevenueDay[]> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); since.setHours(0,0,0,0);
    let q: any = (this.supabase.client as any)
      .from('invoice_items')
      .select(`
        total_cents, service:service_id(category),
        invoice:invoice_id(branch_id, invoice_date, status)
      `)
      .gte('invoice.invoice_date', since.toISOString());
    const { data, error } = await q;
    if (error) {
      // Schema variation tolerance: return empty rather than blow up the whole dashboard
      console.warn('[lab-dashboard] revenue query failed:', error);
      return this.emptyRevenueDays();
    }
    const buckets = this.emptyRevenueDays();
    for (const li of (data ?? []) as any[]) {
      const inv = li.invoice; if (!inv?.invoice_date) continue;
      if (branchId && inv.branch_id !== branchId) continue;
      if (inv.status === 'void' || inv.status === 'cancelled') continue;
      const day = inv.invoice_date.slice(0, 10);
      const slot = buckets.find((b) => b.date === day);
      if (!slot) continue;
      const amt = Number(li.total_cents ?? 0);
      if (li.service?.category === 'lab') slot.lab_cents += amt;
      else if (li.service?.category === 'imaging') slot.imaging_cents += amt;
    }
    return buckets;
  }

  private emptyRevenueDays(): LabRevenueDay[] {
    const out: LabRevenueDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      d.setHours(0, 0, 0, 0);
      out.push({ date: d.toISOString().slice(0, 10), lab_cents: 0, imaging_cents: 0 });
    }
    return out;
  }

  // ── Revenue insights ────────────────────────────────────────────────
  // Window sizes per granularity:
  //   daily   — 30 buckets (30 days)
  //   weekly  — 12 buckets (12 weeks, ISO weeks Mon–Sun)
  //   monthly — 12 buckets (12 calendar months)
  // Returns a *non-throwing* RevenueSeries — empty/zero values on schema drift.
  async revenueSeries(branchId: string | null, granularity: RevenueGranularity): Promise<RevenueSeries> {
    const { windowStart, windowEnd, prevStart } = this.revenueWindow(granularity);
    const fetchedAt = new Date().toISOString();

    // Lab dashboard: include only diagnostic categories (lab/imaging/radiology).
    // Procedure / consultation / pharmacy / IPD-room revenue belongs to other
    // dashboards and is excluded here.
    let q: any = (this.supabase.client as any)
      .from('invoice_items')
      .select(`
        total_cents, description,
        service:service_id(code, category),
        invoice:invoice_id(branch_id, invoice_date, status)
      `)
      .gte('invoice.invoice_date', prevStart.toISOString());
    const { data, error } = await q;
    if (error) {
      console.warn('[lab-dashboard] revenueSeries failed:', error);
      return this.emptyRevenueSeries(granularity, windowStart, windowEnd, fetchedAt);
    }

    // Build a code → lab category map so we can break "lab" into Haematology /
    // Biochemistry / Microbiology / etc. when the service.code matches a lab_test.
    const codeToCategory = await this.loadLabTestCategoryMap();

    const rows = ((data ?? []) as any[]).filter((li) => {
      const inv = li.invoice; if (!inv?.invoice_date) return false;
      if (branchId && inv.branch_id !== branchId) return false;
      if (inv.status === 'void' || inv.status === 'cancelled') return false;
      const svc = (li.service?.category as string) || '';
      return svc === 'lab' || svc === 'imaging' || svc === 'radiology';
    });

    // Build current-window buckets and category totals.
    const buckets = this.makeEmptyBuckets(granularity, windowStart, windowEnd);
    const categoryTotals = new Map<string, number>();
    let prevTotalCents = 0;

    // Aliases that render under a single label — keeps the category share
    // donut from showing two rows that both say "Imaging".
    const aliases: Record<string, string> = {
      radiology: 'imaging',
      hematology: 'haematology',
    };
    const normalize = (c: string) => aliases[c] ?? c;

    for (const li of rows) {
      const issued = new Date(li.invoice.invoice_date as string);
      const amt = Number(li.total_cents ?? 0);
      const svcCat = (li.service?.category as string || '').toLowerCase();
      const code   = (li.service?.code as string || '').toUpperCase();
      const desc   = ((li as any).description as string || '').toUpperCase();
      // ALWAYS try lab_tests category first — the master taxonomy.
      // Services may have a coarser category (e.g. service.category='imaging'
      // for ECG even though lab_tests says 'cardiology'); we want the finer
      // breakdown on the dashboard.
      let cat: string =
        codeToCategory.get(code)
        ?? codeToCategory.get(code.replace(/^(DASH|LAB|TEST)-/, ''))
        ?? codeToCategory.get(desc)
        ?? '';
      if (!cat) {
        if (svcCat === 'imaging' || svcCat === 'radiology') cat = 'imaging';
        else cat = 'biochemistry'; // sensible default for unmapped lab lines
      }
      cat = normalize(cat);

      if (issued < windowStart) {
        prevTotalCents += amt;
        continue;
      }
      if (issued > windowEnd) continue;

      const key = this.bucketKey(issued, granularity);
      const slot = buckets.find((b) => b.key === key);
      if (!slot) continue;
      slot.byCategory[cat] = (slot.byCategory[cat] ?? 0) + amt;
      slot.total += amt;
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt);
    }

    const totalCents = Array.from(categoryTotals.values()).reduce((s, v) => s + v, 0);
    const categories: RevenueCategorySummary[] = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, cents], i) => ({
        code,
        label: this.categoryLabel(code),
        cents,
        share: totalCents > 0 ? cents / totalCents : 0,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      }));

    const deltaPct = prevTotalCents > 0
      ? ((totalCents - prevTotalCents) / prevTotalCents) * 100
      : (totalCents > 0 ? null : 0);

    return {
      granularity,
      buckets,
      categories,
      totalCents,
      prevTotalCents,
      deltaPct,
      windowStart: windowStart.toISOString().slice(0, 10),
      windowEnd:   windowEnd.toISOString().slice(0, 10),
      fetchedAt,
    };
  }

  /**
   * Revenue grouped by branch across the period's current window, with a
   * comparison against the equally-sized prior window. Used by the "Branch
   * performance" card that appears only when no specific branch is selected.
   */
  async loadRevenueByBranch(period: DashboardPeriod): Promise<BranchRevenue> {
    const { windowStart, windowEnd, prevStart } = this.revenueWindow(period);

    let q: any = (this.supabase.client as any)
      .from('invoice_items')
      .select(`
        total_cents,
        invoice:invoice_id(branch_id, invoice_date, status)
      `)
      .gte('invoice.invoice_date', prevStart.toISOString());

    const empty: BranchRevenue = {
      rows: [], totalCents: 0, prevTotalCents: 0, topCents: 0,
      windowStart: windowStart.toISOString().slice(0, 10),
      windowEnd:   windowEnd.toISOString().slice(0, 10),
    };

    try {
      const { data, error } = await q;
      if (error) { console.warn('[lab-dashboard] revenueByBranch failed:', error.message); return empty; }

      const cur  = new Map<string, number>();
      const prev = new Map<string, number>();
      for (const li of (data ?? []) as any[]) {
        const inv = li.invoice; if (!inv?.invoice_date || !inv.branch_id) continue;
        if (inv.status === 'void' || inv.status === 'cancelled') continue;
        const issued = new Date(inv.invoice_date as string);
        const amt = Number(li.total_cents ?? 0);
        if (issued < windowStart)      prev.set(inv.branch_id, (prev.get(inv.branch_id) ?? 0) + amt);
        else if (issued <= windowEnd)  cur.set(inv.branch_id,  (cur.get(inv.branch_id)  ?? 0) + amt);
      }

      const branchIds = Array.from(new Set([...cur.keys(), ...prev.keys()]));
      if (!branchIds.length) return empty;

      const { data: branches } = await (this.supabase.client as any)
        .from('branches')
        .select('id, code, name')
        .in('id', branchIds);

      const branchMap = new Map<string, { code: string; name: string }>();
      for (const b of (branches ?? []) as any[]) {
        branchMap.set(b.id, { code: b.code ?? '', name: b.name ?? '' });
      }

      const totalCents     = Array.from(cur.values()).reduce((s, v) => s + v, 0);
      const prevTotalCents = Array.from(prev.values()).reduce((s, v) => s + v, 0);

      const rows: BranchRevenueRow[] = branchIds.map((id) => {
        const c = cur.get(id) ?? 0;
        const p = prev.get(id) ?? 0;
        const deltaPct = p > 0 ? ((c - p) / p) * 100 : (c > 0 ? null : 0);
        const meta = branchMap.get(id) ?? { code: '—', name: 'Unknown branch' };
        return {
          branch_id: id,
          code: meta.code, name: meta.name,
          cents: c, prev_cents: p,
          share: totalCents > 0 ? c / totalCents : 0,
          deltaPct,
          rank: 0,  // assigned after sort
        };
      })
      .sort((a, b) => b.cents - a.cents);

      rows.forEach((r, i) => { r.rank = i + 1; });
      const topCents = rows.length ? rows[0].cents : 0;

      return {
        rows, totalCents, prevTotalCents, topCents,
        windowStart: windowStart.toISOString().slice(0, 10),
        windowEnd:   windowEnd.toISOString().slice(0, 10),
      };
    } catch (e: any) {
      console.warn('[lab-dashboard] revenueByBranch threw:', e?.message ?? e); return empty;
    }
  }

  private revenueWindow(g: RevenueGranularity): { windowStart: Date; windowEnd: Date; prevStart: Date } {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    if (g === 'daily') {
      start.setDate(end.getDate() - 29);
    } else if (g === 'weekly') {
      // Anchor to Monday of the bucket 11 weeks ago.
      start.setDate(end.getDate() - 7 * 11 - this.weekdayOffset(end));
    } else {
      // monthly: first day of (current - 11) months
      start.setMonth(end.getMonth() - 11);
      start.setDate(1);
    }
    start.setHours(0, 0, 0, 0);

    const prevStart = new Date(start);
    const spanMs = end.getTime() - start.getTime();
    prevStart.setTime(start.getTime() - spanMs - 1000);
    return { windowStart: start, windowEnd: end, prevStart };
  }

  private makeEmptyBuckets(g: RevenueGranularity, start: Date, end: Date): RevenueBucket[] {
    const out: RevenueBucket[] = [];
    if (g === 'daily') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        out.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          byCategory: {}, total: 0,
        });
      }
    } else if (g === 'weekly') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        out.push({
          key: this.bucketKey(d, 'weekly'),
          label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          byCategory: {}, total: 0,
        });
      }
    } else {
      const cur = new Date(start);
      while (cur <= end) {
        out.push({
          key: this.bucketKey(cur, 'monthly'),
          label: cur.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
          byCategory: {}, total: 0,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    return out;
  }

  private bucketKey(d: Date, g: RevenueGranularity): string {
    if (g === 'daily') return d.toISOString().slice(0, 10);
    if (g === 'monthly') return d.toISOString().slice(0, 7);
    // weekly — ISO week starting Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - this.weekdayOffset(d));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }

  /** Days from Monday (Mon=0, Sun=6) — JS Date getDay() returns Sun=0, Sat=6. */
  private weekdayOffset(d: Date): number {
    const js = d.getDay();
    return js === 0 ? 6 : js - 1;
  }

  private categoryLabel(code: string): string {
    if (!code) return 'Other';
    const map: Record<string, string> = {
      haematology:   'Haematology',
      hematology:    'Haematology',
      biochemistry:  'Biochemistry',
      microbiology:  'Microbiology',
      endocrinology: 'Endocrinology',
      immunology:    'Immunology',
      urinalysis:    'Urinalysis',
      serology:      'Serology',
      cardiology:    'Cardiology',
      pathology:     'Pathology',
      imaging:       'Imaging',
      radiology:     'Imaging',
      lab:           'Lab (uncategorized)',
      other:         'Other',
    };
    if (map[code]) return map[code];
    return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  private emptyRevenueSeries(
    g: RevenueGranularity, start: Date, end: Date, fetchedAt: string,
  ): RevenueSeries {
    return {
      granularity: g,
      buckets: this.makeEmptyBuckets(g, start, end),
      categories: [],
      totalCents: 0,
      prevTotalCents: 0,
      deltaPct: 0,
      windowStart: start.toISOString().slice(0, 10),
      windowEnd:   end.toISOString().slice(0, 10),
      fetchedAt,
    };
  }
}

// Color palette for category bars/legend. Cycles through stable indices so
// the same category lands on the same color across re-renders.
const CATEGORY_PALETTE = [
  '#0E4F8C', // primary blue
  '#00C3FF', // accent cyan
  '#F59E0B', // amber
  '#10B981', // green
  '#8B5CF6', // violet
  '#EF4444', // red
  '#6366F1', // indigo
  '#EC4899', // pink
];
