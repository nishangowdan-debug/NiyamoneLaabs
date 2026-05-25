import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Holiday, HolidayType } from './holiday.types';

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { year?: number; branchId?: string | null } = {}): Promise<Holiday[]> {
    let q = this.db.from('hr_holidays').select('*').order('holiday_date', { ascending: true }).limit(500);
    if (opts.year) {
      const start = `${opts.year}-01-01`;
      const end   = `${opts.year}-12-31`;
      q = q.gte('holiday_date', start).lte('holiday_date', end);
    }
    if (opts.branchId !== undefined) {
      q = opts.branchId === null ? q.is('branch_id', null) : q.or(`branch_id.eq.${opts.branchId},branch_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as Holiday[];
  }

  async upsert(input: {
    id?: string | null;
    branchId: string | null;
    date: string;
    name: string;
    type: HolidayType;
    description?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('holiday_upsert', {
      p_id: input.id ?? null,
      p_branch_id: input.branchId,
      p_date: input.date,
      p_name: input.name,
      p_type: input.type,
      p_description: input.description ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.rpc('holiday_delete', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
