import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Tables } from '../../../core/supabase/supabase.types';

export interface DashboardStats {
  // Patients
  totalPatients: number;
  registeredToday: number;
  pendingPaymentCount: number;
  totalBalanceCents: number;

  // Appointments
  apptsToday: number;
  apptsCompletedToday: number;
  apptsWaiting: number;
  apptsInConsultation: number;
  apptsScheduled: number;

  // Clinical
  consultationsToday: number;
  prescriptionsToday: number;
  labOrdersToday: number;

  // Billing
  invoicesToday: number;
  revenueTodayCents: number;
  outstandingInvoiceCents: number;

  // Lists
  recentPatients: Pick<
    Tables<'patients'>,
    'id' | 'uhid' | 'first_name' | 'last_name' | 'full_name' | 'gender' | 'date_of_birth' | 'mobile' | 'created_at' | 'status'
  >[];

  upcomingAppointments: {
    id: string;
    appointment_at: string;
    status: string;
    visit_type: string;
    patient: { id: string; uhid: string; full_name: string | null; first_name: string; last_name: string } | null;
    doctor:  { id: string; full_name: string } | null;
  }[];

  recentConsultations: {
    id: string;
    started_at: string;
    status: string;
    assessment: string | null;
    presenting_complaint: string | null;
    patient: { id: string; uhid: string; full_name: string | null; first_name: string; last_name: string } | null;
    doctor:  { id: string; full_name: string } | null;
  }[];

  weeklyAppointmentTrend: { day: string; count: number }[];   // last 7 days
  doctorWorkload: { doctor_id: string; doctor_name: string; today: number; week: number }[];
  departmentMix: { code: string; name: string; color: string; doctors: number; appointmentsToday: number; appointmentsWeek: number }[];
  revenue14d: { day: string; cents: number }[];               // last 14 days (current window)
  revenue14dPrior: { day: string; cents: number }[];          // 14 days before that (overlay window)

  // Sparkline series (last 14 days, oldest → newest)
  patients14d: number[];
  appointments14d: number[];
  consultations14d: number[];

  // NABH IPSG compliance — 8 patient-safety goals
  ipsg: { window_days: number; goals: IpsgGoal[] } | null;

  // Patient demographics (gender / age band / encounter mix)
  demographics: PatientDemographics | null;

  compliance: {
    total: number; active: number; applied: number; expired: number;
    expiring_30: number; expiring_90: number;
    next_expiry: { id: string; name: string; valid_until: string; days_left: number } | null;
  };
  ambulance: {
    fleet_total: number; fleet_available: number;
    trips_today: number; trips_window: number;
    revenue_today_cents: number; revenue_window_cents: number;
    active_now: number;
  };
  executive: ExecutiveSummary | null;
}

export interface PatientDemographics {
  window_days: number;
  gender:        { male: number; female: number; other: number };
  age_bands:     { pediatric: number; young_adult: number; middle_age: number; senior: number };
  encounter_mix: { opd: number; ipd: number; ed: number };
}

export interface RevenueStreamRow {
  stream: 'opd' | 'ipd' | 'lab' | 'imaging' | 'pharmacy' | 'ambulance' | 'other';
  label: string;
  cents: number;
  prev_cents: number;
  share_pct: number;
  delta_pct: number | null;
}

export interface RevenueBreakdown {
  period: string;
  window_days: number;
  total_cents: number;
  prev_total_cents: number;
  rows: RevenueStreamRow[];
}

export interface DoctorRevenueRow {
  doctor_id: string;
  doctor_name: string;
  specialty: string | null;
  cents: number;
  prev_cents: number;
  patients_seen: number;
  delta_pct: number | null;
  share_pct: number;     // share of TOP earner (0–100), used for bar width
}
export interface DoctorRevenueRanked {
  period: string;
  window_days: number;
  top_cents: number;
  rows: DoctorRevenueRow[];
}

export interface DepartmentRevenueRow {
  department_id: string;
  code: string;
  name: string;
  color: string | null;
  cents: number;
  prev_cents: number;
  doctors_active: number;
  delta_pct: number | null;
  share_pct: number;     // share of TOP department, used for bar width
}
export interface DepartmentRevenueRanked {
  period: string;
  window_days: number;
  top_cents: number;
  rows: DepartmentRevenueRow[];
}

export interface DoctorTatRow {
  doctor_id: string;
  doctor_name: string;
  specialty: string | null;
  avg_min: number;
  count: number;
}
export interface BranchComparisonRow {
  branch_id: string;
  code: string;
  name: string;
  city: string;
  is_primary: boolean;
  revenue_cents: number;
  prev_revenue_cents: number;
  delta_pct: number | null;
  patient_count: number;
  appts_today: number;
  in_progress: number;
  avg_wait_min: number;
  occupancy_pct: number;
  occupied: number;
  total_beds: number;
  icu_occupancy_pct: number;
  doctor_count: number;
}
export interface BranchComparison {
  period: string;
  window_days: number;
  rows: BranchComparisonRow[];
}

export interface OpdTat {
  period: string;
  window_days: number;
  wait: {
    count: number;
    avg_min: number;
    p75_min: number;
    p95_min: number;
    max_min: number;
    longest_now_min: number | null;
    longest_now_patient: string | null;
    longest_now_doctor: string | null;
    longest_now_token: number | null;
  };
  tat: {
    count: number;
    avg_min: number;
    by_doctor: DoctorTatRow[];
  };
}

export interface IpsgGoal {
  id: number;
  code: string;
  name: string;
  route: string;
  pct: number;
  num: number;
  den: number;
}

export interface ExecAlert {
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  label: string;
  detail: string;
  route?: string | null;
}

export interface ExecutiveSummary {
  window: { from: string; to: string; days: number };
  flow: {
    total_beds: number; occupied_beds: number; bed_occupancy_pct: number;
    icu_beds: number; icu_occupied: number; icu_occupancy_pct: number;
    alos_days: number; alos_baseline_days: number;
    opd_wait_min: number; er_wait_min: number;
    per_branch: { branch_id: string; name: string; total_beds: number; occupied: number; occupancy_pct: number }[];
  };
  finance: {
    invoice_revenue_cents: number; patient_days: number;
    rev_per_bed_day_rupees: number; cmi: number;
    lab_revenue_window_cents: number; lab_revenue_7d_cents: number;
    ot_used_minutes: number; ot_total_minutes: number; ot_utilisation_pct: number;
  };
  workforce: {
    doctor_utilisation_pct: number;
    nurse_count: number; icu_patients: number; icu_patients_per_nurse: number;
    opd_encounters: number; opd_to_ipd_conversion_pct: number;
  };
  experience: {
    nps_score: number; nps_responses: number;
    complaints_open: number; complaints_oldest_hours: number;
  };
  alerts: ExecAlert[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private supabase = inject(SupabaseService);

  /** Conditionally adds .eq('branch_id', branchId) to a Supabase filter chain. */
  private withBranch<T extends { eq: (col: string, val: any) => T }>(q: T, branchId: string | null | undefined): T {
    return branchId ? q.eq('branch_id', branchId) : q;
  }

  /**
   * Map a UI period (live/today/week/month) to a window_days integer for the
   * executive RPCs. Live and today both equal 1 day — the difference is on the
   * client (live auto-refreshes every 30s).
   */
  static periodToWindowDays(period: 'live' | 'today' | 'week' | 'month'): number {
    switch (period) {
      case 'live':
      case 'today': return 1;
      case 'week':  return 7;
      case 'month': return 30;
    }
  }

  async getStats(
    branchId: string | null = null,
    period: 'live' | 'today' | 'week' | 'month' = 'month',
  ): Promise<DashboardStats> {
    const windowDays = DashboardService.periodToWindowDays(period);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString();

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();

    const fourteenDaysAgo = new Date(todayStart);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const fourteenDaysAgoIso = fourteenDaysAgo.toISOString();

    const [
      patTotal, patToday, patPending, patBalances, patRecent,
      apptToday, apptUpcoming, apptWeek,
      consultToday, consultRecent,
      rxToday, labToday,
      invToday, invOutstanding,
      patSpark, apptSpark, consultSpark,
    ] = await Promise.all([
      this.withBranch(this.supabase.client.from('patients').select('*', { count: 'exact', head: true }).is('archived_at', null), branchId),
      this.withBranch(this.supabase.client.from('patients').select('*', { count: 'exact', head: true }).is('archived_at', null).gte('created_at', todayIso), branchId),
      this.withBranch(this.supabase.client.from('patients').select('*', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'pending_payment'), branchId),
      this.withBranch(this.supabase.client.from('patients').select('balance_cents').is('archived_at', null).gt('balance_cents', 0), branchId),
      this.withBranch(this.supabase.client.from('patients')
        .select('id, uhid, first_name, last_name, full_name, gender, date_of_birth, mobile, created_at, status')
        .is('archived_at', null).order('created_at', { ascending: false }).limit(5), branchId),

      this.withBranch(this.supabase.client.from('appointments').select('*').gte('appointment_at', todayIso).lt('appointment_at', tomorrowIso), branchId),
      this.withBranch(this.supabase.client.from('appointments')
        .select(`id, appointment_at, status, visit_type,
                 patient:patient_id(id, uhid, full_name, first_name, last_name),
                 doctor:doctor_staff_id(id, full_name)`)
        .gte('appointment_at', todayIso)
        .order('appointment_at', { ascending: true }).limit(8), branchId),
      this.withBranch(this.supabase.client.from('appointments').select('appointment_at, doctor_staff_id').gte('appointment_at', sevenDaysAgoIso).lt('appointment_at', tomorrowIso), branchId),

      this.withBranch(this.supabase.client.from('encounters').select('*', { count: 'exact', head: true }).gte('started_at', todayIso), branchId),
      this.withBranch(this.supabase.client.from('encounters')
        .select(`id, started_at, status, assessment, presenting_complaint,
                 patient:patient_id(id, uhid, full_name, first_name, last_name),
                 doctor:doctor_staff_id(id, full_name)`)
        .order('started_at', { ascending: false }).limit(6), branchId),

      this.withBranch(this.supabase.client.from('prescriptions').select('*', { count: 'exact', head: true }).gte('prescribed_at', todayIso), branchId),
      this.withBranch(this.supabase.client.from('lab_orders').select('*', { count: 'exact', head: true }).gte('ordered_at', todayIso), branchId),

      this.withBranch(this.supabase.client.from('invoices').select('total_cents').gte('invoice_date', todayIso.slice(0, 10)), branchId),
      this.withBranch(this.supabase.client.from('invoices').select('balance_cents').gt('balance_cents', 0).neq('status', 'void'), branchId),

      // Sparkline source rows (14 days)
      this.withBranch(this.supabase.client.from('patients').select('created_at').is('archived_at', null).gte('created_at', fourteenDaysAgoIso), branchId),
      this.withBranch(this.supabase.client.from('appointments').select('appointment_at').gte('appointment_at', fourteenDaysAgoIso).lt('appointment_at', tomorrowIso), branchId),
      this.withBranch(this.supabase.client.from('encounters').select('started_at').gte('started_at', fourteenDaysAgoIso), branchId),
    ]);

    if (patTotal.error)        throw patTotal.error;
    if (patToday.error)        throw patToday.error;
    if (patPending.error)      throw patPending.error;
    if (patBalances.error)     throw patBalances.error;
    if (patRecent.error)       throw patRecent.error;
    if (apptToday.error)       throw apptToday.error;
    if (apptUpcoming.error)    throw apptUpcoming.error;
    if (apptWeek.error)        throw apptWeek.error;
    if (consultToday.error)    throw consultToday.error;
    if (consultRecent.error)   throw consultRecent.error;

    const totalBalanceCents = (patBalances.data ?? []).reduce((s, r) => s + (r.balance_cents ?? 0), 0);

    const todayAppts = apptToday.data ?? [];
    const apptsCompletedToday = todayAppts.filter((a) => a.status === 'completed').length;
    const apptsWaiting        = todayAppts.filter((a) => a.status === 'checked_in').length;
    const apptsInConsultation = todayAppts.filter((a) => a.status === 'in_consultation').length;
    const apptsScheduled      = todayAppts.filter((a) => a.status === 'scheduled').length;

    // Weekly trend: last 7 days
    const trend: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const count = (apptWeek.data ?? []).filter((a) => {
        const at = new Date(a.appointment_at);
        return at >= d && at < next;
      }).length;
      trend.push({ day: d.toLocaleDateString('en-IN', { weekday: 'short' }), count });
    }

    // Doctor workload
    const doctorMap = new Map<string, { today: number; week: number }>();
    for (const a of (apptWeek.data ?? [])) {
      if (!a.doctor_staff_id) continue;
      const m = doctorMap.get(a.doctor_staff_id) ?? { today: 0, week: 0 };
      m.week++;
      const at = new Date(a.appointment_at);
      if (at >= todayStart && at < tomorrow) m.today++;
      doctorMap.set(a.doctor_staff_id, m);
    }
    let doctorWorkload: { doctor_id: string; doctor_name: string; today: number; week: number }[] = [];
    if (doctorMap.size > 0) {
      const ids = Array.from(doctorMap.keys());
      const { data: docs } = await this.supabase.client
        .from('staff').select('id, full_name').in('id', ids);
      doctorWorkload = (docs ?? []).map((d) => ({
        doctor_id: d.id,
        doctor_name: d.full_name,
        today: doctorMap.get(d.id)?.today ?? 0,
        week: doctorMap.get(d.id)?.week ?? 0,
      })).sort((a, b) => b.week - a.week).slice(0, 6);
    }

    const revenueTodayCents = (invToday.data ?? []).reduce((s, r) => s + (r.total_cents ?? 0), 0);
    const outstandingInvoiceCents = (invOutstanding.data ?? []).reduce((s, r) => s + (r.balance_cents ?? 0), 0);

    // Department mix + 28-day revenue (need prior 14d for comparison overlay)
    const fourteenAgo    = new Date(todayStart); fourteenAgo.setDate(fourteenAgo.getDate() - 13);
    const twentyEightAgo = new Date(todayStart); twentyEightAgo.setDate(twentyEightAgo.getDate() - 27);
    let deptQuery = (this.supabase.client as any).from('departments').select('id, branch_id, code, name, color, position').eq('is_active', true).order('position');
    if (branchId) deptQuery = deptQuery.eq('branch_id', branchId);
    const [{ data: depts }, { data: deptLinks }, { data: deptApts }, { data: revRows }] = await Promise.all([
      deptQuery,
      (this.supabase.client as any).from('staff_departments').select('staff_id, department_id'),
      this.withBranch(this.supabase.client.from('appointments').select('doctor_staff_id').gte('appointment_at', todayIso).lt('appointment_at', tomorrowIso), branchId),
      this.withBranch(this.supabase.client.from('invoices').select('invoice_date, total_cents, status')
        .gte('invoice_date', twentyEightAgo.toISOString().slice(0, 10))
        .neq('status', 'void'), branchId),
    ]);

    const docToDepts = new Map<string, string[]>();
    for (const l of (deptLinks ?? []) as any[]) {
      const arr = docToDepts.get(l.staff_id) ?? [];
      arr.push(l.department_id);
      docToDepts.set(l.staff_id, arr);
    }
    const aptByDept = new Map<string, number>();
    for (const a of (deptApts ?? []) as any[]) {
      const dids = docToDepts.get(a.doctor_staff_id) ?? [];
      for (const did of dids) aptByDept.set(did, (aptByDept.get(did) ?? 0) + 1);
    }
    const aptByDeptWeek = new Map<string, number>();
    for (const a of (apptWeek.data ?? []) as any[]) {
      const dids = docToDepts.get(a.doctor_staff_id) ?? [];
      for (const did of dids) aptByDeptWeek.set(did, (aptByDeptWeek.get(did) ?? 0) + 1);
    }
    const docCountByDept = new Map<string, number>();
    for (const [, dids] of docToDepts) {
      for (const did of dids) docCountByDept.set(did, (docCountByDept.get(did) ?? 0) + 1);
    }
    // Build per-row entries first
    const perDeptRow = ((depts ?? []) as any[]).map(d => ({
      code: d.code, name: d.name, color: d.color, position: d.position,
      doctors: docCountByDept.get(d.id) ?? 0,
      appointmentsToday: aptByDept.get(d.id) ?? 0,
      appointmentsWeek:  aptByDeptWeek.get(d.id) ?? 0,
    }));
    // Network view: collapse duplicates across branches by `code`; sum metrics.
    const grouped = new Map<string, typeof perDeptRow[number]>();
    for (const r of perDeptRow) {
      const existing = grouped.get(r.code);
      if (!existing) {
        grouped.set(r.code, { ...r });
      } else {
        existing.doctors           += r.doctors;
        existing.appointmentsToday += r.appointmentsToday;
        existing.appointmentsWeek  += r.appointmentsWeek;
      }
    }
    const departmentMix = Array.from(grouped.values()).sort((a, b) => a.position - b.position);

    // Compliance summary (separate RPC, RLS-scoped)
    let compliance = { total: 0, active: 0, applied: 0, expired: 0, expiring_30: 0, expiring_90: 0, next_expiry: null as any };
    try {
      const { data: c } = await (this.supabase.client as any).rpc('compliance_summary');
      if (c) compliance = { ...compliance, ...c };
    } catch { /* non-fatal */ }

    // Executive summary (separate RPC)
    let executive: ExecutiveSummary | null = null;
    try {
      const { data: e } = await (this.supabase.client as any).rpc('dashboard_executive_summary', { p_window_days: windowDays, p_branch_id: branchId });
      if (e) executive = e as ExecutiveSummary;
    } catch { /* non-fatal */ }

    // NABH IPSG compliance (8 goals)
    let ipsg: { window_days: number; goals: IpsgGoal[] } | null = null;
    try {
      const { data: ip } = await (this.supabase.client as any).rpc('dashboard_ipsg_compliance', { p_window_days: windowDays, p_branch_id: branchId });
      if (ip) ipsg = ip as any;
    } catch { /* non-fatal */ }

    // Patient demographics (gender / age / encounter mix)
    let demographics: PatientDemographics | null = null;
    try {
      const { data: dm } = await (this.supabase.client as any).rpc('dashboard_patient_demographics', { p_window_days: windowDays, p_branch_id: branchId });
      if (dm) demographics = dm as PatientDemographics;
    } catch { /* non-fatal */ }

    // Ambulance utilisation
    // (compliance_summary + ambulance_utilisation RPCs are currently cross-branch — TODO: add p_branch_id)
    let ambulance = { fleet_total: 0, fleet_available: 0, trips_today: 0, trips_window: 0,
                      revenue_today_cents: 0, revenue_window_cents: 0, active_now: 0 };
    try {
      const { data: u } = await (this.supabase.client as any).rpc('ambulance_utilisation', { p_window_days: 7 });
      if (u?.totals) ambulance = { ...ambulance, ...u.totals };
      const activeQuery = (this.supabase.client as any)
        .from('ambulance_trips').select('*', { count: 'exact', head: true })
        .in('status', ['requested','assigned','en_route_pickup','on_scene','en_route_back']);
      const { count: activeNow } = await this.withBranch(activeQuery, branchId);
      ambulance.active_now = activeNow ?? 0;
    } catch { /* non-fatal */ }

    // Revenue series (current 14 days + prior 14 days for overlay)
    const revenue14d: { day: string; cents: number }[] = [];
    const revenue14dPrior: { day: string; cents: number }[] = [];
    const revBy = new Map<string, number>();
    for (const r of (revRows ?? []) as any[]) {
      const day = (r.invoice_date as string).slice(0, 10);
      revBy.set(day, (revBy.get(day) ?? 0) + (r.total_cents ?? 0));
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date(todayStart); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      revenue14d.push({ day: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), cents: revBy.get(key) ?? 0 });
    }
    for (let i = 27; i >= 14; i--) {
      const d = new Date(todayStart); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      revenue14dPrior.push({ day: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), cents: revBy.get(key) ?? 0 });
    }

    // Sparkline arrays (14 days, oldest → newest)
    const bucketByDay = (rows: { ts: string }[]): number[] => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const key = new Date(r.ts).toISOString().slice(0, 10);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const out: number[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(todayStart); d.setDate(d.getDate() - i);
        out.push(map.get(d.toISOString().slice(0, 10)) ?? 0);
      }
      return out;
    };
    const patients14d      = bucketByDay((patSpark.data ?? []).map((r: any) => ({ ts: r.created_at })));
    const appointments14d  = bucketByDay((apptSpark.data ?? []).map((r: any) => ({ ts: r.appointment_at })));
    const consultations14d = bucketByDay((consultSpark.data ?? []).map((r: any) => ({ ts: r.started_at })));

    return {
      totalPatients:           patTotal.count ?? 0,
      registeredToday:         patToday.count ?? 0,
      pendingPaymentCount:     patPending.count ?? 0,
      totalBalanceCents,

      apptsToday:              todayAppts.length,
      apptsCompletedToday,
      apptsWaiting,
      apptsInConsultation,
      apptsScheduled,

      consultationsToday:      consultToday.count ?? 0,
      prescriptionsToday:      rxToday.count ?? 0,
      labOrdersToday:          labToday.count ?? 0,

      invoicesToday:           (invToday.data ?? []).length,
      revenueTodayCents,
      outstandingInvoiceCents,

      recentPatients:          patRecent.data ?? [],
      upcomingAppointments:    (apptUpcoming.data ?? []) as any,
      recentConsultations:     (consultRecent.data ?? []) as any,
      weeklyAppointmentTrend:  trend,
      doctorWorkload,
      departmentMix,
      revenue14d,
      revenue14dPrior,
      compliance,
      ambulance,
      executive,
      ipsg,
      demographics,
      patients14d,
      appointments14d,
      consultations14d,
    };
  }

  /** Phase 2: revenue split by stream (OPD/IPD/Lab/Imaging/Pharmacy/Ambulance/Other). */
  async getRevenueBreakdown(
    branchId: string | null = null,
    period: 'live' | 'today' | 'week' | 'month' = 'month',
  ): Promise<RevenueBreakdown | null> {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('dashboard_revenue_breakdown', {
        p_branch_id: branchId,
        p_period: period,
      });
      if (error) throw error;
      return data as RevenueBreakdown;
    } catch {
      return null;
    }
  }

  /** Phase 3: top-N doctors by collected revenue. */
  async getRevenueByDoctor(
    branchId: string | null = null,
    period: 'live' | 'today' | 'week' | 'month' = 'month',
    limit = 10,
  ): Promise<DoctorRevenueRanked | null> {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('dashboard_revenue_by_doctor', {
        p_branch_id: branchId,
        p_period: period,
        p_limit: limit,
      });
      if (error) throw error;
      return data as DoctorRevenueRanked;
    } catch {
      return null;
    }
  }

  /** Phase 3: revenue grouped by primary department of the billing doctor. */
  async getRevenueByDepartment(
    branchId: string | null = null,
    period: 'live' | 'today' | 'week' | 'month' = 'month',
  ): Promise<DepartmentRevenueRanked | null> {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('dashboard_revenue_by_department', {
        p_branch_id: branchId,
        p_period: period,
      });
      if (error) throw error;
      return data as DepartmentRevenueRanked;
    } catch {
      return null;
    }
  }

  /** Phase 5: per-branch comparison strip — fires only when activeBranchId is null. */
  async getBranchComparison(
    period: 'live' | 'today' | 'week' | 'month' = 'today',
  ): Promise<BranchComparison | null> {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('dashboard_branch_comparison', {
        p_period: period,
      });
      if (error) throw error;
      return data as BranchComparison;
    } catch {
      return null;
    }
  }

  /** Phase 4: OPD wait + doctor consultation TAT. */
  async getOpdTat(
    branchId: string | null = null,
    period: 'live' | 'today' | 'week' | 'month' = 'today',
  ): Promise<OpdTat | null> {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('dashboard_opd_tat', {
        p_branch_id: branchId,
        p_period: period,
      });
      if (error) throw error;
      return data as OpdTat;
    } catch {
      return null;
    }
  }
}
