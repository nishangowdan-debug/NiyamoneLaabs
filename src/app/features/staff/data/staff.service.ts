import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { StaffFilters, StaffListResult, StaffMember, StaffUpdate } from './staff.types';

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const msg = (e as any)?.message ?? (e as any)?.error_description ?? String(e);
  return new Error(msg);
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private supabase = inject(SupabaseService);

  async list(filters: StaffFilters): Promise<StaffListResult> {
    const from = filters.page * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = (this.supabase.client as any)
      .from('staff')
      .select('*, branch:primary_branch_id(id, code, name)', { count: 'exact' });

    if (filters.status !== 'all') {
      query = query.eq('is_active', filters.status === 'active');
    }
    if (filters.role !== 'all') {
      query = query.eq('role_slug', filters.role);
    }
    if (filters.branchId) {
      query = query.eq('primary_branch_id', filters.branchId);
    }
    if (filters.search.trim()) {
      const t = filters.search.trim();
      query = query.or(
        `full_name.ilike.%${t}%,email.ilike.%${t}%,staff_code.ilike.%${t}%,phone.ilike.%${t}%`,
      );
    }

    const { data, error, count } = await query
      .order('full_name', { ascending: true })
      .range(from, to);

    if (error) throw toError(error);
    const rows = (data ?? []) as StaffMember[];

    // Enrich with primary department (single follow-up query keyed by staff IDs)
    if (rows.length > 0) {
      const ids = rows.map((s) => s.id);
      const { data: links } = await (this.supabase.client as any)
        .from('staff_departments')
        .select('staff_id, is_primary, department:department_id(id, code, name, color)')
        .in('staff_id', ids);
      const byStaff = new Map<string, { id: string; code: string; name: string; color: string | null }>();
      for (const l of (links ?? []) as any[]) {
        if (!l.department) continue;
        const existing = byStaff.get(l.staff_id);
        // Prefer is_primary = true; otherwise keep first
        if (!existing || l.is_primary) byStaff.set(l.staff_id, l.department);
      }
      for (const s of rows) (s as any).department = byStaff.get(s.id) ?? null;
    }
    return { rows, total: count ?? 0 };
  }

  async getById(id: string): Promise<StaffMember | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('staff')
      .select('*, branch:primary_branch_id(id, code, name)')
      .eq('id', id)
      .single();
    if (error) throw toError(error);
    if (!data) return null;
    const { data: links } = await (this.supabase.client as any)
      .from('staff_departments')
      .select('is_primary, department:department_id(id, code, name, color)')
      .eq('staff_id', id);
    const dept = ((links ?? []) as any[]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.department ?? null;
    return { ...(data as StaffMember), department: dept };
  }

  async update(id: string, patch: StaffUpdate): Promise<StaffMember> {
    const { data, error } = await this.supabase.client
      .from('staff')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw toError(error);
    return data;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('staff')
      .update({ is_active: active })
      .eq('id', id);
    if (error) throw toError(error);
  }

  async createStaff(input: {
    full_name: string;
    email: string;
    role_slug: string;
    primary_branch_id: string;
    phone?: string | null;
    joined_at?: string | null;
  }): Promise<{ staff: StaffMember; password: string }> {
    if (!input.primary_branch_id) {
      throw new Error('Branch is required when creating a staff member.');
    }
    const password = this.generatePassword();
    const { data, error } = await (this.supabase.client as any).rpc('create_staff_locally', {
      p_full_name:         input.full_name,
      p_email:             input.email.toLowerCase().trim(),
      p_role_slug:         input.role_slug,
      p_password:          password,
      p_primary_branch_id: input.primary_branch_id,
      p_phone:             input.phone    ?? null,
      p_joined_at:         input.joined_at ?? new Date().toISOString().split('T')[0],
    });
    if (error) throw toError(error);
    if (!data)  throw new Error('Failed to create staff record');
    return { staff: data as StaffMember, password };
  }

  async resetPassword(staffId: string): Promise<string> {
    const password = this.generatePassword();
    const { error } = await (this.supabase.client as any).rpc('reset_staff_password', {
      p_staff_id:     staffId,
      p_new_password: password,
    });
    if (error) throw toError(error);
    return password;
  }

  private generatePassword(): string {
    const u = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const l = 'abcdefghjkmnpqrstuvwxyz';
    const d = '23456789';
    const r = (s: string) => s[Math.floor(Math.random() * s.length)]!;
    return `Staff@${r(u)}${r(l)}${r(u)}${r(d)}${r(d)}${r(l)}`;
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('staff-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
