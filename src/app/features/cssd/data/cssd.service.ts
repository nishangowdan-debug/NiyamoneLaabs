import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CssdItemSet, CssdLoad, CssdSetInstance, CssdSterilizer,
  IndicatorResult, LoadStatus, SetInstanceStatus, SterileStockRow,
} from './cssd.types';

@Injectable({ providedIn: 'root' })
export class CssdService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listSterilizers(): Promise<CssdSterilizer[]> {
    const { data, error } = await this.db.from('cssd_sterilizers')
      .select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []) as CssdSterilizer[];
  }

  async listItemSets(): Promise<CssdItemSet[]> {
    const { data, error } = await this.db.from('cssd_item_sets')
      .select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []) as CssdItemSet[];
  }

  async listLoads(opts: { status?: LoadStatus } = {}): Promise<CssdLoad[]> {
    let q = this.db.from('cssd_loads').select('*').order('started_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CssdLoad[];
  }

  async listSets(opts: { status?: SetInstanceStatus; loadId?: string } = {}): Promise<CssdSetInstance[]> {
    let q = this.db.from('cssd_set_instances').select('*').order('updated_at', { ascending: false }).limit(2000);
    if (opts.status) q = q.eq('current_status', opts.status);
    if (opts.loadId) q = q.eq('current_load_id', opts.loadId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CssdSetInstance[];
  }

  async sterileStock(): Promise<SterileStockRow[]> {
    const { data, error } = await this.db.from('v_cssd_sterile_stock').select('*').order('name');
    if (error) throw error;
    return (data ?? []) as SterileStockRow[];
  }

  async createLoad(input: {
    sterilizerId: string;
    cycleProgram?: string | null;
    operatorName?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('cssd_load_create', {
      p_sterilizer_id: input.sterilizerId,
      p_cycle_program: input.cycleProgram ?? null,
      p_operator_name: input.operatorName ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async attachSet(loadId: string, setId: string): Promise<void> {
    const { error } = await this.db.rpc('cssd_load_attach_set', {
      p_load_id: loadId, p_set_id: setId,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async startLoad(id: string): Promise<void> {
    const { error } = await this.db.rpc('cssd_load_start', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async completeLoad(input: {
    id: string;
    tempC?: number | null;
    pressureBar?: number | null;
    holdTimeMinutes?: number | null;
    totalCycleMinutes?: number | null;
    chemicalIndicator?: IndicatorResult | null;
    bowieDickTest?: IndicatorResult | null;
    biologicalIndicator?: IndicatorResult | null;
    biLotNo?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('cssd_load_complete', {
      p_id: input.id,
      p_temp_c: input.tempC ?? null,
      p_pressure_bar: input.pressureBar ?? null,
      p_hold_time_minutes: input.holdTimeMinutes ?? null,
      p_total_cycle_minutes: input.totalCycleMinutes ?? null,
      p_chemical_indicator: input.chemicalIndicator ?? null,
      p_bowie_dick_test: input.bowieDickTest ?? null,
      p_biological_indicator: input.biologicalIndicator ?? 'pending',
      p_bi_lot_no: input.biLotNo ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async releaseLoad(input: {
    id: string;
    biResult: IndicatorResult;
    releasedByName: string;
    failureReason?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('cssd_load_release', {
      p_id: input.id,
      p_bi_result: input.biResult,
      p_released_by_name: input.releasedByName,
      p_failure_reason: input.failureReason ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async recallLoad(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('cssd_load_recall', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async createSet(itemSetId: string, packagedCount: number, packagedByName: string): Promise<string> {
    const { data, error } = await this.db.rpc('cssd_set_create', {
      p_item_set_id: itemSetId,
      p_packaged_count: packagedCount,
      p_packaged_by_name: packagedByName,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async dispatchSet(input: {
    id: string;
    dispatchedTo: string;
    patientId?: string | null;
    admissionId?: string | null;
    otRecordId?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('cssd_set_dispatch', {
      p_id: input.id,
      p_dispatched_to: input.dispatchedTo,
      p_patient_id: input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_ot_record_id: input.otRecordId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async returnSet(id: string, returnedCount: number | null, notes?: string): Promise<void> {
    const { error } = await this.db.rpc('cssd_set_return', {
      p_id: id, p_returned_count: returnedCount, p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
