import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Department, DepartmentView, DoctorOption } from './departments.types';

@Injectable({ providedIn: 'root' })
export class DepartmentsService {
  private supabase = inject(SupabaseService);

  /**
   * Lists departments.
   *  • If `branchId` is set → returns only that branch's departments (one row per dept).
   *  • If `branchId` is null → aggregates by `code` across the network so each
   *    department name appears once with combined doctor count and `branchCount`.
   */
  async list(branchId: string | null = null): Promise<DepartmentView[]> {
    let depQuery = (this.supabase.client as any).from('departments').select('*').order('position');
    if (branchId) depQuery = depQuery.eq('branch_id', branchId);

    const [{ data: deps, error: dErr }, { data: links, error: lErr }, { data: heads, error: hErr }] = await Promise.all([
      depQuery,
      (this.supabase.client as any).from('staff_departments').select('staff_id, department_id'),
      (this.supabase.client as any).from('staff').select('id, full_name'),
    ]);
    if (dErr) throw dErr;
    if (lErr) throw lErr;
    if (hErr) throw hErr;

    const headMap = new Map<string, { id: string; full_name: string }>();
    for (const s of (heads ?? []) as any[]) headMap.set(s.id, { id: s.id, full_name: s.full_name });

    const counts = new Map<string, number>();
    for (const l of (links ?? []) as any[]) {
      counts.set(l.department_id, (counts.get(l.department_id) ?? 0) + 1);
    }

    const rows = ((deps ?? []) as Department[]).map(d => ({
      ...d,
      head: d.head_staff_id ? (headMap.get(d.head_staff_id) ?? null) : null,
      doctorsCount: counts.get(d.id) ?? 0,
    }));

    // Single-branch view → return as-is
    if (branchId) return rows;

    // Network view → group by `code`, sum doctorsCount, count branches
    const grouped = new Map<string, DepartmentView>();
    for (const r of rows) {
      const key = r.code;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...r, branchCount: 1 });
      } else {
        existing.doctorsCount += r.doctorsCount;
        existing.branchCount = (existing.branchCount ?? 1) + 1;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => a.position - b.position);
  }

  async listDoctors(): Promise<DoctorOption[]> {
    const { data, error } = await this.supabase.client
      .from('staff').select('id, full_name, metadata')
      .eq('role_slug', 'doctor').eq('is_active', true).order('full_name');
    if (error) throw error;
    return (data ?? []).map(d => {
      const meta = (d.metadata ?? {}) as Record<string, unknown>;
      return { id: d.id, full_name: d.full_name, specialty: (meta['specialty'] as string) ?? null };
    });
  }

  async create(input: {
    code: string; name: string; description?: string | null;
    headStaffId?: string | null; color?: string; icon?: string | null;
    floor?: string | null; phone?: string | null; email?: string | null;
    position?: number;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('create_department', {
      p_code: input.code,
      p_name: input.name,
      p_description: input.description ?? null,
      p_head_staff_id: input.headStaffId ?? null,
      p_color: input.color ?? '#0E4F8C',
      p_icon: input.icon ?? null,
      p_floor: input.floor ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_position: input.position ?? 0,
    });
    if (error) throw error;
    return data as string;
  }

  async update(input: {
    id: string; code: string; name: string; description?: string | null;
    headStaffId?: string | null; color: string; icon?: string | null;
    floor?: string | null; phone?: string | null; email?: string | null;
    isActive: boolean;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('update_department', {
      p_id: input.id, p_code: input.code, p_name: input.name,
      p_description: input.description ?? null,
      p_head_staff_id: input.headStaffId ?? null,
      p_color: input.color, p_icon: input.icon ?? null,
      p_floor: input.floor ?? null, p_phone: input.phone ?? null, p_email: input.email ?? null,
      p_is_active: input.isActive,
    });
    if (error) throw error;
  }
}
