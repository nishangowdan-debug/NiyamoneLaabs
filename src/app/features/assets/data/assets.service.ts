import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { AssetMovement, CreateMovementInput, MovementStatus } from './assets.types';

@Injectable({ providedIn: 'root' })
export class AssetsService {
  private supabase = inject(SupabaseService);

  async list(): Promise<AssetMovement[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('asset_movements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AssetMovement[];
  }

  async create(input: CreateMovementInput): Promise<AssetMovement> {
    const { data, error } = await (this.supabase.client as any)
      .from('asset_movements')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as AssetMovement;
  }

  async updateStatus(id: string, status: MovementStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'in_transit') patch['dispatched_at'] = new Date().toISOString();
    if (status === 'completed') patch['received_at'] = new Date().toISOString();
    const { error } = await (this.supabase.client as any)
      .from('asset_movements')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('asset-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_movements' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
