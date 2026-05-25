import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Bed, BedView, Ward, WardView } from './ipd.types';

interface RawBed {
  id: string;
  branch_id: string;
  ward_id: string;
  code: string;
  status: Bed['status'];
  acuity: Bed['acuity'];
  current_admission_id: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  ward: BedView['ward'];
  admission: {
    id: string;
    admitted_at: string;
    reason: string | null;
    attending_doctor_staff_id: string | null;
    discharge_workflow_status: string | null;
    discharge_request_reason: string | null;
    discharge_requested_at: string | null;
    patient: BedView['patient'];
    doctor: BedView['doctor'];
  } | null;
}

@Injectable({ providedIn: 'root' })
export class IpdService {
  private supabase = inject(SupabaseService);

  async listWards(branchId: string | null = null): Promise<Ward[]> {
    let q = this.supabase.client
      .from('wards')
      .select('*')
      .eq('is_active', true)
      .order('position');
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async listBeds(branchId: string | null = null): Promise<BedView[]> {
    let q: any = this.supabase.client
      .from('beds')
      .select(`
        id, branch_id, ward_id, code, status, acuity, current_admission_id, notes, position, created_at, updated_at,
        ward:ward_id(id, code, name, ward_type),
        admission:current_admission_id(
          id, admitted_at, reason, attending_doctor_staff_id,
          discharge_workflow_status, discharge_request_reason, discharge_requested_at,
          patient:patient_id(id, uhid, full_name, first_name, last_name, date_of_birth, gender, mobile),
          doctor:attending_doctor_staff_id(id, full_name)
        )
      `);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.order('position');
    if (error) throw error;
    const rows = (data ?? []) as RawBed[];
    return rows.map((b) => ({
      id: b.id,
      branch_id: b.branch_id,
      ward_id: b.ward_id,
      code: b.code,
      status: b.status,
      acuity: b.acuity,
      current_admission_id: b.current_admission_id,
      notes: b.notes,
      position: b.position,
      created_at: b.created_at,
      updated_at: b.updated_at,
      ward: b.ward,
      patient: b.admission?.patient ?? null,
      admission: b.admission
        ? {
            id: b.admission.id,
            admitted_at: b.admission.admitted_at,
            reason: b.admission.reason,
            attending_doctor_staff_id: b.admission.attending_doctor_staff_id,
            discharge_workflow_status: (b.admission.discharge_workflow_status as any) ?? 'none',
            discharge_request_reason: b.admission.discharge_request_reason ?? null,
            discharge_requested_at: b.admission.discharge_requested_at ?? null,
          }
        : null,
      doctor: b.admission?.doctor ?? null,
    }));
  }

  /** Search patients (active, non-archived) for the admit modal. */
  async searchPatients(term: string, limit = 10): Promise<{ id: string; uhid: string; full_name: string; mobile: string }[]> {
    const t = term.trim();
    if (t.length < 2) return [];
    const { data, error } = await this.supabase.client
      .from('patients')
      .select('id, uhid, full_name, first_name, last_name, mobile')
      .is('archived_at', null)
      .or(`full_name.ilike.%${t}%,uhid.ilike.%${t}%,mobile.ilike.%${t}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      uhid: p.uhid,
      full_name: p.full_name || `${p.first_name} ${p.last_name}`,
      mobile: p.mobile,
    }));
  }

  async listDoctors(): Promise<{ id: string; full_name: string }[]> {
    const { data, error } = await this.supabase.client
      .from('staff')
      .select('id, full_name')
      .eq('role_slug', 'doctor')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return data ?? [];
  }

  async admit(input: { patientId: string; bedId: string; doctorId?: string | null; reason?: string; notes?: string }) {
    const { error } = await this.supabase.client.rpc('admit_patient_to_bed', {
      p_patient_id: input.patientId,
      p_bed_id: input.bedId,
      p_attending_doctor_staff_id: input.doctorId ?? undefined,
      p_reason: input.reason ?? undefined,
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
  }

  async discharge(admissionId: string, reason: 'discharge' | 'transfer' | 'death' = 'discharge') {
    const { error } = await this.supabase.client.rpc('discharge_admission', {
      p_admission_id: admissionId,
      p_reason: reason,
    });
    if (error) throw error;
  }

  /** Final discharge: aggregates IP pharmacy + bed-day charges into one invoice. */
  async dischargeWithSummary(admissionId: string, defaultBedRateRupees = 1000): Promise<{
    admission_id: string; invoice_id: string; invoice_number: string;
    days: number; bed_total: number; pharmacy_total: number; grand_total: number;
  }> {
    const { data, error } = await (this.supabase.client as any).rpc('discharge_admission_with_summary', {
      p_admission_id: admissionId,
      p_default_bed_rate_cents: Math.round(defaultBedRateRupees * 100),
    });
    if (error) throw error;
    return data;
  }

  // ── Discharge workflow ───────────────────────────────────────────────
  async dischargeRequest(admissionId: string, reason?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('discharge_request', {
      p_admission_id: admissionId,
      p_reason: reason ?? null,
    });
    if (error) throw error;
  }

  /** Patient-initiated discharge (Discharge Against Medical Advice). Requires a signed DAMA consent. */
  async dischargeRequestDama(input: { admissionId: string; damaConsentId: string; reason?: string | null }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('discharge_request_dama', {
      p_admission_id:    input.admissionId,
      p_dama_consent_id: input.damaConsentId,
      p_reason:          input.reason ?? null,
    });
    if (error) throw error;
  }

  async dischargeCancel(admissionId: string, reason?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('discharge_cancel', {
      p_admission_id: admissionId,
      p_reason: reason ?? null,
    });
    if (error) throw error;
  }

  async setBedStatus(bedId: string, status: 'available' | 'cleaning' | 'maintenance' | 'blocked') {
    const { error } = await this.supabase.client.rpc('set_bed_status', { p_bed_id: bedId, p_status: status });
    if (error) throw error;
  }

  async setBedAcuity(bedId: string, acuity: 'stable' | 'watch' | 'critical' | 'pre_discharge' | null) {
    const { error } = await this.supabase.client.rpc('set_bed_acuity', { p_bed_id: bedId, p_acuity: acuity });
    if (error) throw error;
  }

  // ── Ward / bed administration (SECURITY DEFINER RPCs) ────────────────
  async createWard(input: {
    code: string; name: string; wardType: string;
    floor?: string | null; dailyRateRupees?: number; position?: number;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('create_ward', {
      p_code:             input.code,
      p_name:             input.name,
      p_ward_type:        input.wardType,
      p_floor:            input.floor ?? null,
      p_daily_rate_cents: Math.round((input.dailyRateRupees ?? 0) * 100),
      p_position:         input.position ?? 0,
    });
    if (error) throw error;
    return data as string;
  }

  async updateWard(input: {
    id: string; code: string; name: string; wardType: string;
    floor?: string | null; dailyRateRupees?: number; isActive?: boolean;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('update_ward', {
      p_id:               input.id,
      p_code:             input.code,
      p_name:             input.name,
      p_ward_type:        input.wardType,
      p_floor:            input.floor ?? null,
      p_daily_rate_cents: Math.round((input.dailyRateRupees ?? 0) * 100),
      p_is_active:        input.isActive ?? true,
    });
    if (error) throw error;
  }

  async createBed(input: {
    wardId: string; code: string; bedType: string;
    dailyRateRupees?: number | null; notes?: string | null; position?: number;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('create_bed', {
      p_ward_id:          input.wardId,
      p_code:             input.code,
      p_bed_type:         input.bedType,
      p_daily_rate_cents: input.dailyRateRupees != null ? Math.round(input.dailyRateRupees * 100) : null,
      p_notes:            input.notes ?? null,
      p_position:         input.position ?? 0,
    });
    if (error) throw error;
    return data as string;
  }

  async updateBed(input: {
    id: string; code: string; bedType: string;
    status?: string; dailyRateRupees?: number | null; notes?: string | null;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('update_bed', {
      p_id:               input.id,
      p_code:             input.code,
      p_bed_type:         input.bedType,
      p_status:           input.status ?? null,
      p_daily_rate_cents: input.dailyRateRupees != null ? Math.round(input.dailyRateRupees * 100) : 0,
      p_notes:            input.notes ?? null,
    });
    if (error) throw error;
  }

  async deleteBed(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('delete_bed', { p_id: id });
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('ipd-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beds' },             () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wards' },            () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admissions' },       () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bed_assignments' },  () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }

  static buildWardViews(wards: Ward[], beds: BedView[]): WardView[] {
    const byWard = new Map<string, BedView[]>();
    for (const b of beds) {
      const list = byWard.get(b.ward_id) ?? [];
      list.push(b);
      byWard.set(b.ward_id, list);
    }
    return wards.map((w) => {
      const wbeds = (byWard.get(w.id) ?? []).slice().sort((a, b) => a.position - b.position);
      const totals = {
        total: wbeds.length,
        available: 0, occupied: 0, cleaning: 0, maintenance: 0, blocked: 0,
        critical: 0, preDischarge: 0,
      };
      for (const b of wbeds) {
        totals[b.status as keyof typeof totals] = (totals[b.status as keyof typeof totals] ?? 0) + 1;
        if (b.acuity === 'critical') totals.critical++;
        if (b.acuity === 'pre_discharge') totals.preDischarge++;
      }
      return { ...w, beds: wbeds, totals };
    });
  }
}
