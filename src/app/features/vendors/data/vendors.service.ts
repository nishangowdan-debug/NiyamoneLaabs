import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { TablesInsert, TablesUpdate } from '../../../core/supabase/supabase.types';
import type { Vendor } from './vendors.types';

@Injectable({ providedIn: 'root' })
export class VendorsService {
  private supabase = inject(SupabaseService);

  async list(): Promise<Vendor[]> {
    const { data, error } = await this.supabase.client
      .from('vendors')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  async create(input: Omit<TablesInsert<'vendors'>, 'branch_id'> & { branch_id: string }): Promise<Vendor> {
    const { data, error } = await this.supabase.client
      .from('vendors')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, patch: TablesUpdate<'vendors'>): Promise<Vendor> {
    const { data, error } = await this.supabase.client
      .from('vendors')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('vendors')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('vendors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
