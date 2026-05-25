import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Ambulance, AmbulanceTrip, TripStatus } from './ambulance.types';

@Injectable({ providedIn: 'root' })
export class AmbulanceService {
  private supabase = inject(SupabaseService);

  async listAmbulances(): Promise<Ambulance[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('ambulances').select('*').eq('is_active', true).order('code');
    if (error) throw error;
    return (data ?? []) as Ambulance[];
  }

  async listTripsToday(): Promise<AmbulanceTrip[]> {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data, error } = await (this.supabase.client as any)
      .from('ambulance_trips').select('*')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AmbulanceTrip[];
  }

  async createTrip(input: {
    callerName?: string | null;
    callerPhone?: string | null;
    patientName: string;
    patientAge?: number | null;
    patientGender?: 'male' | 'female' | 'other' | null;
    pickupAddress: string;
    pickupLandmark?: string | null;
    chiefComplaint?: string | null;
    priority: 'routine' | 'urgent' | 'critical';
    notes?: string | null;
    patientId?: string | null;
  }): Promise<{ id: string; trip_number: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('create_ambulance_trip', {
      p_caller_name:    input.callerName ?? null,
      p_caller_phone:   input.callerPhone ?? null,
      p_patient_name:   input.patientName,
      p_patient_age:    input.patientAge ?? null,
      p_patient_gender: input.patientGender ?? null,
      p_pickup_address: input.pickupAddress,
      p_pickup_landmark: input.pickupLandmark ?? null,
      p_chief_complaint: input.chiefComplaint ?? null,
      p_priority:       input.priority ?? 'routine',
      p_notes:          input.notes ?? null,
      p_patient_id:     input.patientId ?? null,
    });
    if (error) throw error;
    return data;
  }

  async assignAmbulance(tripId: string, ambulanceId: string, driverStaffId?: string | null,
                       driverName?: string | null, driverPhone?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('assign_ambulance_to_trip', {
      p_trip_id: tripId,
      p_ambulance_id: ambulanceId,
      p_driver_staff_id: driverStaffId ?? null,
      p_driver_name:  driverName ?? null,
      p_driver_phone: driverPhone ?? null,
    });
    if (error) throw error;
  }

  async setTripStatus(tripId: string, status: TripStatus): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('set_trip_status', {
      p_trip_id: tripId, p_status: status,
    });
    if (error) throw error;
  }

  async billTrip(tripId: string, billType: 'op' | 'ip', chargeRupees: number, doctorStaffId?: string | null):
    Promise<{ invoice_id: string; invoice_number: string; total_cents: number }> {
    const { data, error } = await (this.supabase.client as any).rpc('bill_ambulance_trip', {
      p_trip_id: tripId, p_bill_type: billType,
      p_charge_cents: Math.round(chargeRupees * 100),
      p_doctor_staff_id: doctorStaffId ?? null,
    });
    if (error) throw error;
    return data;
  }

  async linkTripToPatient(tripId: string, patientId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('ambulance_trips').update({ patient_id: patientId }).eq('id', tripId);
    if (error) throw error;
  }

  async searchPatients(term: string, limit = 8): Promise<{ id: string; uhid: string; full_name: string; mobile: string }[]> {
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
      id: p.id, uhid: p.uhid,
      full_name: p.full_name || `${p.first_name} ${p.last_name}`,
      mobile: p.mobile ?? '',
    }));
  }

  // ── Fleet admin ─────────────────────────────────────────────────
  async createAmbulance(input: {
    code: string; reg_number?: string | null; type: 'basic'|'als'|'icu'|'neonatal';
    size: 'small'|'medium'|'large'; has_ac: boolean; has_doctor_on_board: boolean;
    capacity?: number | null; make_model?: string | null; base_charge_rupees?: number | null;
    driver_staff_id?: string | null; driver_name?: string | null; driver_phone?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('create_ambulance', {
      p_code: input.code, p_reg_number: input.reg_number ?? null, p_type: input.type,
      p_size: input.size, p_has_ac: input.has_ac, p_has_doctor_on_board: input.has_doctor_on_board,
      p_capacity: input.capacity ?? null, p_make_model: input.make_model ?? null,
      p_base_charge_cents: input.base_charge_rupees != null ? Math.round(input.base_charge_rupees * 100) : 0,
      p_driver_staff_id: input.driver_staff_id ?? null,
      p_driver_name: input.driver_name ?? null, p_driver_phone: input.driver_phone ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async updateAmbulance(input: {
    id: string; code: string; reg_number?: string | null; type: 'basic'|'als'|'icu'|'neonatal';
    size: 'small'|'medium'|'large'; has_ac: boolean; has_doctor_on_board: boolean;
    capacity?: number | null; make_model?: string | null; base_charge_rupees?: number | null;
    driver_staff_id?: string | null; driver_name?: string | null; driver_phone?: string | null;
    status?: 'available'|'dispatched'|'on_trip'|'maintenance'|'offline';
    notes?: string | null; is_active?: boolean;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('update_ambulance', {
      p_id: input.id, p_code: input.code, p_reg_number: input.reg_number ?? null, p_type: input.type,
      p_size: input.size, p_has_ac: input.has_ac, p_has_doctor_on_board: input.has_doctor_on_board,
      p_capacity: input.capacity ?? null, p_make_model: input.make_model ?? null,
      p_base_charge_cents: input.base_charge_rupees != null ? Math.round(input.base_charge_rupees * 100) : 0,
      p_driver_staff_id: input.driver_staff_id ?? null,
      p_driver_name: input.driver_name ?? null, p_driver_phone: input.driver_phone ?? null,
      p_status: input.status ?? null, p_notes: input.notes ?? null,
      p_is_active: input.is_active ?? true,
    });
    if (error) throw error;
  }

  async setAmbulanceStatus(id: string, status: 'available'|'dispatched'|'on_trip'|'maintenance'|'offline'): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('set_ambulance_status', { p_id: id, p_status: status });
    if (error) throw error;
  }

  async deleteAmbulance(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('delete_ambulance', { p_id: id });
    if (error) throw error;
  }

  async listDrivers(): Promise<{ id: string; full_name: string; phone: string | null }[]> {
    const { data, error } = await this.supabase.client
      .from('staff').select('id, full_name, phone')
      .eq('role_slug', 'driver').eq('is_active', true).order('full_name');
    if (error) throw error;
    return (data ?? []) as any;
  }

  async utilisation(windowDays = 7): Promise<{
    window_days: number;
    totals: { trips_today: number; trips_window: number; revenue_today_cents: number; revenue_window_cents: number; fleet_total: number; fleet_available: number };
    per_ambulance: { id: string; code: string; type: string; status: string; driver_name: string | null;
                     trips_today: number; trips_window: number; revenue_today_cents: number; revenue_window_cents: number; hours_today: number }[];
  }> {
    const { data, error } = await (this.supabase.client as any).rpc('ambulance_utilisation', { p_window_days: windowDays });
    if (error) throw error;
    return data;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('ambulance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulances' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulance_trips' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
