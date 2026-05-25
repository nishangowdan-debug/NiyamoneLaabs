import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import type {
  HomeAddress,
  HomeCollectionItem,
  HomeCollectionPaymentMethod,
  HomeCollectionRow,
  HomeCollectionStatus,
  Phlebotomist,
} from './home-collection.types';

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error((e as any)?.message ?? String(e));
}

@Injectable({ providedIn: 'root' })
export class HomeCollectionService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthStore);

  // ── Requests ─────────────────────────────────────────────
  async list(branchId: string | null, status?: HomeCollectionStatus | 'all'): Promise<HomeCollectionRow[]> {
    let q = (this.supabase.client as any)
      .from('home_collection_requests')
      .select(`
        *,
        patient:patients(uhid, first_name, last_name, mobile),
        phlebotomist:phlebotomists(staff_id, vehicle_no, staff:staff_id(full_name))
      `)
      .order('scheduled_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    if (status && status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw toError(error);

    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      phlebotomist: r.phlebotomist
        ? {
            staff_id: r.phlebotomist.staff_id,
            vehicle_no: r.phlebotomist.vehicle_no,
            full_name: r.phlebotomist.staff?.full_name ?? '',
          }
        : null,
    })) as HomeCollectionRow[];
  }

  async getById(id: string): Promise<HomeCollectionRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('home_collection_requests')
      .select(`
        *,
        patient:patients(uhid, first_name, last_name, mobile),
        phlebotomist:phlebotomists(staff_id, vehicle_no, staff:staff_id(full_name)),
        items:home_collection_items(*, test:lab_tests(name, code))
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw toError(error);
    if (!data) return null;

    return {
      ...data,
      phlebotomist: data.phlebotomist
        ? {
            staff_id: data.phlebotomist.staff_id,
            vehicle_no: data.phlebotomist.vehicle_no,
            full_name: data.phlebotomist.staff?.full_name ?? '',
          }
        : null,
      items: (data.items ?? []).map((it: any) => ({
        ...it,
        test_name: it.test?.name,
        test_code: it.test?.code,
      })),
    };
  }

  async create(input: {
    branch_id: string;
    patient_id: string;
    address: HomeAddress;
    scheduled_at: string;
    contact_mobile: string;
    notes?: string | null;
    tests: { lab_test_id: string; price_inr: number; surcharge_inr: number }[];
  }): Promise<string> {
    const total = input.tests.reduce((s, t) => s + Number(t.price_inr) + Number(t.surcharge_inr), 0);
    const surcharge = input.tests.reduce((s, t) => s + Number(t.surcharge_inr), 0);

    const { data, error } = await (this.supabase.client as any)
      .from('home_collection_requests')
      .insert({
        branch_id: input.branch_id,
        patient_id: input.patient_id,
        address: input.address,
        scheduled_at: input.scheduled_at,
        contact_mobile: input.contact_mobile,
        notes: input.notes ?? null,
        total_inr: total,
        surcharge_inr: surcharge,
        created_by: this.auth.staffId(),
      })
      .select('id')
      .single();
    if (error) throw toError(error);
    const requestId = data.id as string;

    if (input.tests.length > 0) {
      const items = input.tests.map((t) => ({
        request_id: requestId,
        lab_test_id: t.lab_test_id,
        price_inr: t.price_inr,
        surcharge_inr: t.surcharge_inr,
      }));
      const { error: iErr } = await (this.supabase.client as any)
        .from('home_collection_items')
        .insert(items);
      if (iErr) throw toError(iErr);
    }

    return requestId;
  }

  async assign(requestId: string, phlebotomistId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('home_collection_requests')
      .update({ phlebotomist_id: phlebotomistId, status: 'assigned', assigned_at: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw toError(error);
  }

  async transition(requestId: string, next: HomeCollectionStatus, extra?: Record<string, any>): Promise<void> {
    const stamp: Record<string, any> = { status: next, ...(extra ?? {}) };
    if (next === 'en_route' && !extra?.['en_route_at']) {/* keep status only */}
    if (next === 'collected') stamp['collected_at'] = new Date().toISOString();
    if (next === 'received')  stamp['received_at']  = new Date().toISOString();
    if (next === 'cancelled') stamp['cancelled_at'] = new Date().toISOString();
    const { error } = await (this.supabase.client as any)
      .from('home_collection_requests')
      .update(stamp)
      .eq('id', requestId);
    if (error) throw toError(error);
  }

  async recordPayment(requestId: string, method: HomeCollectionPaymentMethod, paidInr: number, ref?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('home_collection_requests')
      .update({ payment_method: method, paid_inr: paidInr, payment_ref: ref ?? null })
      .eq('id', requestId);
    if (error) throw toError(error);
  }

  async cancel(requestId: string, reason: string): Promise<void> {
    return this.transition(requestId, 'cancelled', { cancel_reason: reason });
  }

  // ── Phlebotomists ────────────────────────────────────────
  async listPhlebotomists(branchId: string | null): Promise<Phlebotomist[]> {
    let q: any = (this.supabase.client as any)
      .from('phlebotomists')
      .select(`*, staff:staff_id(full_name, phone, role_slug)`)
      .order('updated_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw toError(error);
    return (data ?? []) as Phlebotomist[];
  }

  async addPhlebotomist(input: { branch_id: string; staff_id: string; vehicle_no?: string | null; service_areas: string[] }): Promise<string> {
    const { data, error } = await (this.supabase.client as any)
      .from('phlebotomists')
      .insert({
        branch_id: input.branch_id,
        staff_id: input.staff_id,
        vehicle_no: input.vehicle_no ?? null,
        service_areas: input.service_areas,
      })
      .select('id')
      .single();
    if (error) throw toError(error);
    return data.id as string;
  }

  async updatePhlebotomist(id: string, patch: Partial<Pick<Phlebotomist, 'vehicle_no' | 'service_areas' | 'is_active'>>): Promise<void> {
    const { error } = await (this.supabase.client as any).from('phlebotomists').update(patch).eq('id', id);
    if (error) throw toError(error);
  }

  // ── Helpers ──────────────────────────────────────────────
  async listEligibleTests(branchId: string): Promise<Array<{ id: string; code: string; name: string; price_inr: number; surcharge_inr: number }>> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_test_prices')
      .select(`price_inr, home_collection_surcharge_inr, lab_test_id, test:lab_tests(id, code, name, is_active)`)
      .eq('branch_id', branchId)
      .eq('home_collection_eligible', true)
      .eq('is_active', true);
    if (error) throw toError(error);
    return ((data ?? []) as any[])
      .filter((r) => r.test?.is_active)
      .map((r) => ({
        id: r.test.id,
        code: r.test.code,
        name: r.test.name,
        price_inr: Number(r.price_inr),
        surcharge_inr: Number(r.home_collection_surcharge_inr),
      }));
  }

  async searchPatients(branchId: string, term: string): Promise<Array<{ id: string; uhid: string; full_name: string; mobile: string }>> {
    const t = term.trim();
    if (!t) return [];
    let q: any = this.supabase.client
      .from('patients')
      .select('id, uhid, full_name, first_name, last_name, mobile')
      .is('archived_at', null)
      .or(`full_name.ilike.%${t}%,uhid.ilike.%${t}%,mobile.ilike.%${t}%`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw toError(error);
    return ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      uhid: p.uhid,
      full_name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      mobile: p.mobile,
    }));
  }

  async eligibleStaff(branchId: string | null): Promise<Array<{ id: string; full_name: string; phone: string | null; role_slug: string }>> {
    let q: any = (this.supabase.client as any)
      .from('staff')
      .select('id, full_name, phone, role_slug')
      .eq('is_active', true)
      .in('role_slug', ['lab_tech', 'nurse'])
      .order('full_name', { ascending: true });
    if (branchId) q = q.eq('primary_branch_id', branchId);
    const { data, error } = await q;
    if (error) throw toError(error);
    return (data ?? []) as any[];
  }

  /** For a set of `services.code` values picked on the billing form, resolve
   *  each to its `lab_tests.id` and look up the per-branch home-collection
   *  surcharge. Only home-eligible tests are returned. */
  async resolveTestsForBilling(
    branchId: string,
    serviceCodes: string[],
  ): Promise<Map<string, { lab_test_id: string; surcharge_inr: number }>> {
    const out = new Map<string, { lab_test_id: string; surcharge_inr: number }>();
    if (serviceCodes.length === 0) return out;
    const candidates = Array.from(new Set(
      serviceCodes.flatMap((c) => [c, c.replace(/^LAB[-_ ]/i, '')]),
    ));
    const { data: tests, error: tErr } = await (this.supabase.client as any)
      .from('lab_tests').select('id, code').in('code', candidates);
    if (tErr) throw toError(tErr);
    const testByCode = new Map<string, { id: string; code: string }>();
    for (const t of ((tests ?? []) as any[])) testByCode.set(t.code, t);

    const ids = Array.from(testByCode.values()).map((t) => t.id);
    let prices = new Map<string, number>();
    if (ids.length > 0) {
      const { data: prc } = await (this.supabase.client as any)
        .from('lab_test_prices')
        .select('lab_test_id, home_collection_eligible, home_collection_surcharge_inr')
        .eq('branch_id', branchId)
        .eq('home_collection_eligible', true)
        .in('lab_test_id', ids);
      for (const p of ((prc ?? []) as any[])) {
        prices.set(p.lab_test_id, Number(p.home_collection_surcharge_inr) || 0);
      }
    }
    for (const code of serviceCodes) {
      const t = testByCode.get(code) ?? testByCode.get(code.replace(/^LAB[-_ ]/i, ''));
      if (!t) continue;
      if (!prices.has(t.id)) continue; // not home-eligible for this branch
      out.set(code, { lab_test_id: t.id, surcharge_inr: prices.get(t.id) ?? 0 });
    }
    return out;
  }
}
