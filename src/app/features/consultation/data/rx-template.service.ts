import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';

export interface RxTemplateItem {
  drug_name: string;
  strength: string;
  form: string;
  route: string;
  frequency: string;
  dosage: string;
  duration_days: number | null;
  qty: number | null;
  instructions: string;
}

export interface RxTemplate {
  id: string;
  name: string;
  condition: string;
  staff_id: string | null;
  is_shared: boolean;
  items: RxTemplateItem[];
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class RxTemplateService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthStore);

  async list(): Promise<RxTemplate[]> {
    const staffId = this.auth.claims()?.staff_id;
    const { data, error } = await (this.supabase.client as any)
      .from('rx_templates')
      .select('*')
      .or(`is_shared.eq.true,staff_id.eq.${staffId}`)
      .order('name');
    if (error) throw error;
    return (data ?? []) as RxTemplate[];
  }

  async create(template: Omit<RxTemplate, 'id' | 'created_at' | 'staff_id'>): Promise<void> {
    const staffId = this.auth.claims()?.staff_id;
    const { error } = await (this.supabase.client as any)
      .from('rx_templates')
      .insert({ ...template, staff_id: staffId });
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('rx_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
