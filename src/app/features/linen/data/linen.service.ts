import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  LinenCategory, LinenMovement, LinenMovementType, LinenState,
  LinenStockRow, LinenWashCycle,
} from './linen.types';

@Injectable({ providedIn: 'root' })
export class LinenService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listCategories(): Promise<LinenCategory[]> {
    const { data, error } = await this.db.from('linen_categories')
      .select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []) as LinenCategory[];
  }

  async listStock(): Promise<LinenStockRow[]> {
    const { data, error } = await this.db.from('v_linen_stock').select('*').order('name');
    if (error) throw error;
    return (data ?? []) as LinenStockRow[];
  }

  async listMovements(opts: { categoryId?: string } = {}): Promise<LinenMovement[]> {
    let q = this.db.from('linen_movements').select('*').order('performed_at', { ascending: false }).limit(500);
    if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as LinenMovement[];
  }

  async listWashCycles(): Promise<LinenWashCycle[]> {
    const { data, error } = await this.db.from('linen_wash_cycles')
      .select('*').order('started_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []) as LinenWashCycle[];
  }

  async logMovement(input: {
    categoryId: string;
    movementType: LinenMovementType;
    qty: number;
    fromLocation?: string | null;
    toLocation?: string | null;
    fromState?: LinenState | null;
    toState?: LinenState | null;
    wardId?: string | null;
    patientId?: string | null;
    lotNo?: string | null;
    reason?: string | null;
    performedByName?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('linen_log_movement', {
      p_category_id: input.categoryId,
      p_movement_type: input.movementType,
      p_qty: input.qty,
      p_from_location: input.fromLocation ?? null,
      p_to_location: input.toLocation ?? null,
      p_from_state: input.fromState ?? null,
      p_to_state: input.toState ?? null,
      p_ward_id: input.wardId ?? null,
      p_patient_id: input.patientId ?? null,
      p_lot_no: input.lotNo ?? null,
      p_reason: input.reason ?? null,
      p_performed_by_name: input.performedByName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async createWashCycle(input: {
    totalPieces: number;
    washTemperatureC?: number | null;
    washDurationMin?: number | null;
    detergent?: string | null;
    disinfectant?: string | null;
    disinfectantPpm?: number | null;
    isHighRisk?: boolean;
    operatorName?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('linen_wash_cycle_create', {
      p_total_pieces: input.totalPieces,
      p_wash_temperature_c: input.washTemperatureC ?? null,
      p_wash_duration_min: input.washDurationMin ?? null,
      p_detergent: input.detergent ?? null,
      p_disinfectant: input.disinfectant ?? null,
      p_disinfectant_ppm: input.disinfectantPpm ?? null,
      p_is_high_risk: input.isHighRisk ?? false,
      p_operator_name: input.operatorName ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async completeWashCycle(id: string, rejectedPieces: number, notes?: string): Promise<void> {
    const { error } = await this.db.rpc('linen_wash_cycle_complete', {
      p_id: id, p_rejected_pieces: rejectedPieces, p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
