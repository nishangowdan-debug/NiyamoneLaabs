import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import type { AppointmentStatus, TablesUpdate } from '../../../core/supabase/supabase.types';
import type { AppointmentRow, DoctorBlockRow, DoctorInfo, QueueFilters, TokenSlipData } from './appointments.types';

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  private readonly SELECT = `*, patient:patient_id(id, uhid, full_name, first_name, last_name, date_of_birth, gender, mobile), doctor:doctor_staff_id(id, full_name, role_slug)`;

  async listForDate(date: Date, branchId: string | null = null): Promise<AppointmentRow[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let query = this.supabase.client
      .from('appointments')
      .select(this.SELECT)
      .gte('appointment_at', start.toISOString())
      .lt('appointment_at', end.toISOString());
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query
      .order('appointment_at', { ascending: true })
      .returns<AppointmentRow[]>();
    if (error) throw error;
    return data ?? [];
  }

  /** Today's appointments + patient + doctor join. */
  async listToday(filters: QueueFilters): Promise<AppointmentRow[]> {
    return this.listForDate(new Date());
  }

  /** Today's appointments without any filters — used by TV display. */
  async getTodayAppointments(): Promise<AppointmentRow[]> {
    return this.listForDate(new Date());
  }

  async listForPatient(patientId: string, limit = 20): Promise<AppointmentRow[]> {
    const { data, error } = await this.supabase.client
      .from('appointments')
      .select(this.SELECT)
      .eq('patient_id', patientId)
      .order('appointment_at', { ascending: false })
      .limit(limit)
      .returns<AppointmentRow[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getOne(id: string): Promise<AppointmentRow | null> {
    const { data, error } = await this.supabase.client
      .from('appointments')
      .select(this.SELECT)
      .eq('id', id)
      .maybeSingle()
      .returns<AppointmentRow | null>();
    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<void> {
    const now = new Date().toISOString();
    const patch: TablesUpdate<'appointments'> = { status };
    if (status === 'checked_in') patch.checked_in_at = now;
    if (status === 'completed')  patch.completed_at  = now;
    if (status === 'cancelled' || status === 'no_show') patch.cancelled_at = now;
    const { error } = await this.supabase.client.from('appointments').update(patch).eq('id', id);
    if (error) throw error;
  }

  /** Atomic check-in: sets status, auto-issues wristband, computes ETA, returns token-slip data. */
  async checkInWithSlip(appointmentId: string): Promise<TokenSlipData> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('appointment_check_in', { p_appointment_id: appointmentId });
    if (error) throw error;
    return data as TokenSlipData;
  }

  /** Captures vitals + auto-computes MEWS + transitions status to 'triaged'. */
  async recordTriage(input: {
    appointmentId: string;
    bpSystolic: number;  bpDiastolic: number;
    pulse: number;       respiratoryRate: number;
    tempCelsius: number; spo2Pct: number;
    bloodSugarMgdl?: number | null;
    painScore?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    notes?: string | null;
  }): Promise<{ vital_id: string; mews_score: number; fast_track_recommended: boolean; triage_completed_at: string }> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('appointment_triage_record', {
        p_appointment_id:    input.appointmentId,
        p_bp_systolic:       input.bpSystolic,
        p_bp_diastolic:      input.bpDiastolic,
        p_pulse:             input.pulse,
        p_respiratory_rate:  input.respiratoryRate,
        p_temp_celsius:      input.tempCelsius,
        p_spo2_pct:          input.spo2Pct,
        p_blood_sugar_mgdl:  input.bloodSugarMgdl ?? null,
        p_pain_score:        input.painScore ?? null,
        p_height_cm:         input.heightCm ?? null,
        p_weight_kg:         input.weightKg ?? null,
        p_notes:             input.notes ?? null,
      });
    if (error) throw error;
    return data;
  }

  /** Loads minimal context for the triage station — appointment, patient, allergies. */
  async getTriageContext(appointmentId: string): Promise<{
    appointment: AppointmentRow;
    allergies: { id: string; substance: string; severity: string | null; reaction: string | null }[];
  }> {
    const { data: appt, error: e1 } = await this.supabase.client
      .from('appointments')
      .select(this.SELECT)
      .eq('id', appointmentId).single();
    if (e1) throw e1;
    const { data: allergyRows } = await (this.supabase.client as any)
      .from('patient_allergies')
      .select('id, allergen_name, severity, reaction_description')
      .eq('patient_id', (appt as any).patient_id);
    const allergies = (allergyRows ?? []).map((r: any) => ({
      id: r.id,
      substance: r.allergen_name,
      severity: r.severity ?? null,
      reaction: r.reaction_description ?? null,
    }));
    return {
      appointment: appt as unknown as AppointmentRow,
      allergies,
    };
  }

  async create(input: {
    patientId: string;
    doctorStaffId: string;
    appointmentAt: string;
    visitType: string;
    chiefComplaint?: string | null;
    durationMinutes?: number;
    room?: string | null;
  }): Promise<void> {
    const branchId = this.auth.claims().branch_id;
    const { error } = await (this.supabase.client.from('appointments') as any).insert({
      patient_id:        input.patientId,
      doctor_staff_id:   input.doctorStaffId,
      appointment_at:    input.appointmentAt,
      visit_type:        input.visitType,
      status:            'scheduled',
      branch_id:         branchId,
      chief_complaint:   input.chiefComplaint ?? null,
      duration_minutes:  input.durationMinutes ?? 30,
      room:              input.room ?? null,
    });
    if (error) throw error;
  }

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
    return (data ?? []).map(p => ({
      id:        p.id,
      uhid:      p.uhid,
      full_name: p.full_name || `${p.first_name} ${p.last_name}`,
      mobile:    p.mobile ?? '',
    }));
  }

  async listDoctors(): Promise<DoctorInfo[]> {
    const { data, error } = await this.supabase.client
      .from('staff')
      .select('id, full_name, metadata')
      .eq('role_slug', 'doctor')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return (data ?? []).map(d => {
      const meta = (d.metadata ?? {}) as Record<string, unknown>;
      const specialty = (meta['specialty'] as string)
        ?? (meta['speciality'] as string)
        ?? null;
      return { id: d.id, full_name: d.full_name, specialty, metadata: meta };
    });
  }

  /** Counts of (active) appointments per day for a month — for mini-calendar dots. */
  async countAppointmentsByDay(monthStart: Date, monthEnd: Date): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.client
      .from('appointments')
      .select('appointment_at')
      .gte('appointment_at', monthStart.toISOString())
      .lt('appointment_at', monthEnd.toISOString());
    if (error) throw error;
    const out = new Map<string, number>();
    for (const r of data ?? []) {
      const d = new Date((r as any).appointment_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }

  /** Counts of appointments per doctor for a date — for sidebar "X booked". */
  async countAppointmentsByDoctor(date: Date): Promise<Map<string, number>> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(start); end.setDate(end.getDate() + 1);
    const { data, error } = await this.supabase.client
      .from('appointments')
      .select('doctor_staff_id')
      .gte('appointment_at', start.toISOString())
      .lt('appointment_at', end.toISOString());
    if (error) throw error;
    const out = new Map<string, number>();
    for (const r of data ?? []) {
      const id = (r as any).doctor_staff_id as string | null;
      if (!id) continue;
      out.set(id, (out.get(id) ?? 0) + 1);
    }
    return out;
  }

  // ── Doctor blocks ────────────────────────────────────────────────────
  async listBlocksForDate(date: Date): Promise<DoctorBlockRow[]> {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end   = new Date(start); end.setDate(end.getDate() + 1);
    const { data, error } = await (this.supabase.client.from('doctor_blocks') as any)
      .select('*')
      .gte('starts_at', start.toISOString())
      .lt('starts_at', end.toISOString())
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DoctorBlockRow[];
  }

  async createBlock(input: {
    doctorStaffId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    room?: string | null;
  }): Promise<void> {
    // Use SECURITY DEFINER RPC so the call works even when the caller's JWT
    // doesn't carry a branch_id claim (branch is derived from the doctor record).
    const { error } = await (this.supabase.client as any).rpc('create_doctor_block', {
      p_doctor_staff_id: input.doctorStaffId,
      p_starts_at:       input.startsAt,
      p_ends_at:         input.endsAt,
      p_reason:          input.reason,
      p_room:            input.room ?? null,
    });
    if (error) throw error;
  }

  async deleteBlock(id: string): Promise<void> {
    const { error } = await (this.supabase.client.from('doctor_blocks') as any).delete().eq('id', id);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' },   () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_blocks' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
