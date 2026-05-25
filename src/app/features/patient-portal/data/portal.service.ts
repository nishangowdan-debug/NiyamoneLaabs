import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { MyAppointment, MyInvoice, MyLabOrder, MyPatient, MyPrescription } from './portal.types';

@Injectable({ providedIn: 'root' })
export class PortalService {
  private supabase = inject(SupabaseService);

  async getMyProfile(): Promise<MyPatient | null> {
    const { data, error } = await this.supabase.client
      .from('patients')
      .select('*')
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null; // no row found
      throw error;
    }
    return data;
  }

  async getMyAppointments(): Promise<MyAppointment[]> {
    const { data, error } = await this.supabase.client
      .from('appointments')
      .select('*, doctor:staff!appointments_doctor_staff_id_fkey(full_name)')
      .order('appointment_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      doctor_name: (row.doctor as { full_name?: string } | null)?.full_name ?? null,
      doctor: undefined,
    } as MyAppointment));
  }

  async getMyPrescriptions(): Promise<MyPrescription[]> {
    const { data, error } = await this.supabase.client
      .from('prescriptions')
      .select('*, items:prescription_items(*), doctor:staff!prescriptions_prescribed_by_staff_id_fkey(full_name)')
      .order('prescribed_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      items: (row.items as unknown as MyPrescription['items']) ?? [],
      doctor_name: (row.doctor as { full_name?: string } | null)?.full_name ?? null,
      doctor: undefined,
    } as MyPrescription));
  }

  async getMyLabOrders(): Promise<MyLabOrder[]> {
    const { data, error } = await this.supabase.client
      .from('lab_orders')
      .select('*, results:lab_results(*, test:lab_tests(code,name,unit,ref_min,ref_max,critical_low,critical_high))')
      .order('ordered_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      results: (row.results as unknown as MyLabOrder['results']) ?? [],
    } as MyLabOrder));
  }

  async getMyInvoices(): Promise<MyInvoice[]> {
    const { data, error } = await this.supabase.client
      .from('invoices')
      .select('*, items:invoice_items(*)')
      .order('invoice_date', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      items: (row.items as unknown as MyInvoice['items']) ?? [],
    } as MyInvoice));
  }
}
