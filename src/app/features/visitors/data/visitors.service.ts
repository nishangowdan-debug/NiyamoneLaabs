import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Visitor, VisitorIdType, VisitorPurpose } from './visitors.types';

@Injectable({ providedIn: 'root' })
export class VisitorsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listInside(): Promise<Visitor[]> {
    const { data, error } = await this.db.from('v_visitors_inside').select('*').order('checked_in_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Visitor[];
  }

  async listAll(opts: { date?: string } = {}): Promise<Visitor[]> {
    let q = this.db.from('visitors').select('*').order('checked_in_at', { ascending: false }).limit(500);
    if (opts.date) {
      const start = new Date(opts.date + 'T00:00:00').toISOString();
      const end   = new Date(opts.date + 'T23:59:59').toISOString();
      q = q.gte('checked_in_at', start).lte('checked_in_at', end);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Visitor[];
  }

  async checkIn(input: {
    visitorName: string;
    purpose: VisitorPurpose;
    visitorPhone?: string | null;
    idType?: VisitorIdType | null;
    idNumber?: string | null;
    meetingWithName?: string | null;
    meetingWithDepartment?: string | null;
    patientId?: string | null;
    admissionId?: string | null;
    vendorId?: string | null;
    vehicleNo?: string | null;
    accompanyingCount?: number;
    expectedDurationMin?: number;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('visitor_check_in', {
      p_visitor_name: input.visitorName,
      p_purpose: input.purpose,
      p_visitor_phone: input.visitorPhone ?? null,
      p_id_type: input.idType ?? null,
      p_id_number: input.idNumber ?? null,
      p_meeting_with_name: input.meetingWithName ?? null,
      p_meeting_with_department: input.meetingWithDepartment ?? null,
      p_patient_id: input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_vendor_id: input.vendorId ?? null,
      p_vehicle_no: input.vehicleNo ?? null,
      p_accompanying_count: input.accompanyingCount ?? 0,
      p_expected_duration_min: input.expectedDurationMin ?? 60,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async checkOut(id: string): Promise<void> {
    const { error } = await this.db.rpc('visitor_check_out', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async blacklist(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('visitor_blacklist', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
