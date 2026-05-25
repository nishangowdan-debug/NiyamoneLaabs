import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface FixedAsset {
  id: string;
  branch_id: string;
  asset_code: string;
  name: string;
  category: string;
  gl_asset_code: string;
  acquisition_date: string;
  cost_cents: number;
  salvage_cents: number;
  useful_life_months: number;
  method: 'slm' | 'wdv';
  wdv_pct: number;
  accumulated_dep_cents: number;
  is_active: boolean;
  disposed_at: string | null;
  notes: string | null;
}

export interface DepreciationRun {
  id: string;
  branch_id: string;
  period_year: number;
  period_month: number;
  total_cents: number;
  asset_count: number;
  posted_at: string;
}

@Injectable({ providedIn: 'root' })
export class FixedAssetsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as unknown as { from: (t: string) => any; rpc: (n: string, p?: any) => any }; }

  async listAssets(branchId: string | null): Promise<FixedAsset[]> {
    let q = this.db.from('fixed_assets').select('*').eq('is_active', true).order('acquisition_date', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FixedAsset[];
  }

  async createAsset(input: Omit<FixedAsset, 'id' | 'accumulated_dep_cents' | 'is_active' | 'disposed_at'>): Promise<string> {
    const { data, error } = await this.db.from('fixed_assets').insert(input).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async listRuns(branchId: string | null): Promise<DepreciationRun[]> {
    let q = this.db.from('depreciation_runs').select('*')
      .order('period_year', { ascending: false }).order('period_month', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DepreciationRun[];
  }

  async runDepreciation(branchId: string, year: number, month: number, postedBy: string | null): Promise<string> {
    const { data, error } = await this.db.rpc('fn_run_depreciation', {
      p_branch_id: branchId, p_year: year, p_month: month, p_posted_by: postedBy,
    });
    if (error) throw error;
    return data as string;
  }

  formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents/100);
  }
}
