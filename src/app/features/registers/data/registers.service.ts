import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CreateRegisterEntryInput,
  RegisterDefinition,
  RegisterEntry,
  RegisterMeterAsset,
} from './registers.types';

@Injectable({ providedIn: 'root' })
export class RegistersService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listDefinitions(): Promise<RegisterDefinition[]> {
    const { data, error } = await this.db
      .from('register_definitions')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('label');
    if (error) throw error;
    return (data ?? []) as RegisterDefinition[];
  }

  async getDefinition(code: string): Promise<RegisterDefinition | null> {
    const { data, error } = await this.db
      .from('register_definitions')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    return data as RegisterDefinition | null;
  }

  async listAssets(branchId: string, assetType?: string | null): Promise<RegisterMeterAsset[]> {
    let q = this.db
      .from('register_meter_assets')
      .select('*')
      .eq('branch_id', branchId)
      .eq('active', true)
      .order('label');
    if (assetType) q = q.eq('asset_type', assetType);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RegisterMeterAsset[];
  }

  async listAssetsAll(branchId: string, assetType?: string | null): Promise<RegisterMeterAsset[]> {
    let q = this.db
      .from('register_meter_assets')
      .select('*')
      .eq('branch_id', branchId)
      .order('active', { ascending: false })
      .order('label');
    if (assetType) q = q.eq('asset_type', assetType);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RegisterMeterAsset[];
  }

  async listEntries(
    registerCode: string,
    opts: { branchId?: string; from?: string; to?: string; assetId?: string; limit?: number } = {},
  ): Promise<RegisterEntry[]> {
    let q = this.db
      .from('register_entries')
      .select('*')
      .eq('register_code', registerCode)
      .order('entry_at', { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.branchId) q = q.eq('branch_id', opts.branchId);
    if (opts.assetId)  q = q.eq('asset_id', opts.assetId);
    if (opts.from)     q = q.gte('entry_at', opts.from);
    if (opts.to)       q = q.lte('entry_at', opts.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RegisterEntry[];
  }

  async getEntry(id: string): Promise<RegisterEntry | null> {
    const { data, error } = await this.db
      .from('register_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as RegisterEntry | null;
  }

  async createEntry(input: CreateRegisterEntryInput): Promise<string> {
    const { data, error } = await this.db.rpc('register_entry_create', {
      p_register_code: input.registerCode,
      p_branch_id:     input.branchId,
      p_payload:       input.payload,
      p_asset_id:      input.assetId ?? null,
      p_entry_at:      input.entryAt ?? new Date().toISOString(),
      p_shift:         input.shift ?? null,
      p_ref_number:    input.refNumber ?? null,
      p_vendor_id:     input.vendorId ?? null,
      p_photo_url:     input.photoUrl ?? null,
      p_client_uuid:   input.clientUuid ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create entry');
    return data as string;
  }

  async verifyEntry(id: string): Promise<void> {
    const { error } = await this.db.rpc('register_entry_verify', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed to verify');
  }

  async voidEntry(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('register_entry_void', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed to void');
  }

  async createAsset(input: Omit<RegisterMeterAsset, 'id' | 'last_reading' | 'last_reading_at'> & { capacity?: number | null }): Promise<RegisterMeterAsset> {
    const { data, error } = await this.db.from('register_meter_assets').insert({
      branch_id:  input.branch_id,
      asset_type: input.asset_type,
      code:       input.code,
      label:      input.label,
      unit:       input.unit,
      capacity:   input.capacity ?? null,
      active:     input.active ?? true,
    }).select('*').single();
    if (error) throw new Error(error.message ?? 'Failed to create asset');
    return data as RegisterMeterAsset;
  }

  async updateAsset(id: string, patch: Partial<Pick<RegisterMeterAsset, 'code' | 'label' | 'unit' | 'capacity' | 'active'>>): Promise<RegisterMeterAsset> {
    const { data, error } = await this.db.from('register_meter_assets')
      .update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message ?? 'Failed to update asset');
    return data as RegisterMeterAsset;
  }

  async deleteAsset(id: string): Promise<void> {
    const { error } = await this.db.from('register_meter_assets').delete().eq('id', id);
    if (error) throw new Error(error.message ?? 'Failed to delete asset');
  }
}
