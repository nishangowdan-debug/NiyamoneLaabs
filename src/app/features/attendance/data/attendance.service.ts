import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { AttendanceRow, AttendanceStatus, RosterRow } from './attendance.types';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private supabase = inject(SupabaseService);

  /** Returns the full active-staff roster with today's attendance row attached (or null). */
  async rosterForDate(date: string): Promise<RosterRow[]> {
    const [{ data: staff, error: sErr }, { data: att, error: aErr }] = await Promise.all([
      (this.supabase.client as any).from('staff')
        .select('id, staff_code, full_name, role_slug, is_active')
        .eq('is_active', true).order('role_slug').order('full_name'),
      (this.supabase.client as any).from('staff_attendance')
        .select('*').eq('work_date', date),
    ]);
    if (sErr) throw sErr; if (aErr) throw aErr;

    const byStaff = new Map<string, AttendanceRow>();
    for (const a of (att ?? []) as AttendanceRow[]) byStaff.set(a.staff_id, a);

    return ((staff ?? []) as any[]).map(s => ({
      staff_id: s.id, staff_code: s.staff_code, full_name: s.full_name, role_slug: s.role_slug,
      attendance: byStaff.get(s.id) ?? null,
    }));
  }

  async checkIn(staffId?: string | null): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('attendance_check_in', { p_staff_id: staffId ?? null });
    if (error) throw error;
    return data as string;
  }

  async checkOut(staffId?: string | null): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('attendance_check_out', { p_staff_id: staffId ?? null });
    if (error) throw error;
    return data as string;
  }

  async setStatus(staffId: string, date: string, status: AttendanceStatus, notes?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('attendance_set_status', {
      p_staff_id: staffId, p_date: date, p_status: status, p_notes: notes ?? null,
    });
    if (error) throw error;
  }

  /** Find the staff record for the currently-signed-in user. */
  async myStaff(): Promise<{ id: string; full_name: string; role_slug: string } | null> {
    const { data: u } = await this.supabase.client.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return null;
    const { data, error } = await (this.supabase.client as any).from('staff')
      .select('id, full_name, role_slug').eq('user_id', uid).maybeSingle();
    if (error) return null;
    return data;
  }
}
