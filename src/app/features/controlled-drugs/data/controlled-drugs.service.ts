import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ControlledClass, ControlledInventoryRow, ReconciliationRow, RegisterEntry,
} from './controlled-drugs.types';

@Injectable({ providedIn: 'root' })
export class ControlledDrugsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Catalog ────────────────────────────────────────────────────
  async listInventory(): Promise<ControlledInventoryRow[]> {
    const { data, error } = await this.db.from('v_controlled_inventory')
      .select('*').order('name');
    if (error) throw error;
    return (data ?? []) as ControlledInventoryRow[];
  }

  async setControlledClass(itemId: string, controlledClass: ControlledClass): Promise<void> {
    const { error } = await this.db.from('inventory_items')
      .update({ controlled_class: controlledClass }).eq('id', itemId);
    if (error) throw error;
  }

  /** All inventory items the user can mark/unmark as controlled. */
  async listAllItems(): Promise<{ id: string; sku: string | null; name: string; controlled_class: ControlledClass }[]> {
    const { data, error } = await this.db.from('inventory_items')
      .select('id, sku, name, controlled_class')
      .eq('is_active', true).order('name').limit(2000);
    if (error) throw error;
    return data ?? [];
  }

  async listBatches(itemId: string): Promise<{ id: string; expiry_date: string | null; qty_on_hand: number }[]> {
    const { data, error } = await this.db.from('inventory_batches')
      .select('id, expiry_date, qty_on_hand')
      .eq('item_id', itemId)
      .order('expiry_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  // ── Register reads ────────────────────────────────────────────
  async getBalance(itemId: string, batchId: string): Promise<number> {
    const { data, error } = await this.db.rpc('cs_get_balance', { p_item_id: itemId, p_batch_id: batchId });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async listRegister(opts: {
    itemId?: string; batchId?: string;
    fromIso?: string; toIso?: string;
    entryType?: string;
  }): Promise<RegisterEntry[]> {
    let q = this.db.from('controlled_register_entries').select('*')
      .order('entry_at', { ascending: false }).limit(1000);
    if (opts.itemId)    q = q.eq('item_id', opts.itemId);
    if (opts.batchId)   q = q.eq('batch_id', opts.batchId);
    if (opts.entryType) q = q.eq('entry_type', opts.entryType);
    if (opts.fromIso)   q = q.gte('entry_at', opts.fromIso);
    if (opts.toIso)     q = q.lte('entry_at', opts.toIso);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RegisterEntry[];
  }

  async listReconciliations(itemId?: string, batchId?: string): Promise<ReconciliationRow[]> {
    let q = this.db.from('controlled_reconciliations').select('*')
      .order('performed_at', { ascending: false }).limit(500);
    if (itemId)  q = q.eq('item_id', itemId);
    if (batchId) q = q.eq('batch_id', batchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ReconciliationRow[];
  }

  // ── Movements ─────────────────────────────────────────────────
  async recordReceipt(input: {
    itemId: string; batchId: string; qty: number;
    branchId?: string | null;
    witnessStaffId?: string | null; witnessName?: string | null; witnessSignature?: string | null;
    sourceId?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('cs_record_receipt', {
      p_item_id: input.itemId, p_batch_id: input.batchId, p_qty: input.qty,
      p_source_id: input.sourceId ?? null,
      p_branch_id: input.branchId ?? null,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_name: input.witnessName ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record receipt');
    return data as string;
  }

  async recordDispense(input: {
    itemId: string; batchId: string; qty: number;
    patientId: string;
    witnessStaffId?: string | null; witnessName: string;
    prescriptionItemId?: string | null;
    prescribedByStaffId?: string | null;
    branchId?: string | null;
    witnessSignature?: string | null;
    sourceId?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('cs_record_dispense', {
      p_item_id: input.itemId, p_batch_id: input.batchId, p_qty: input.qty,
      p_patient_id: input.patientId,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_name: input.witnessName,
      p_prescription_item_id: input.prescriptionItemId ?? null,
      p_prescribed_by_staff_id: input.prescribedByStaffId ?? null,
      p_branch_id: input.branchId ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_source_id: input.sourceId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record dispense');
    return data as string;
  }

  async recordWastage(input: {
    itemId: string; batchId: string; qty: number; reason: string;
    witnessStaffId?: string | null; witnessName: string;
    branchId?: string | null;
    witnessSignature?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('cs_record_wastage', {
      p_item_id: input.itemId, p_batch_id: input.batchId, p_qty: input.qty,
      p_reason: input.reason,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_name: input.witnessName,
      p_branch_id: input.branchId ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record wastage');
    return data as string;
  }

  async recordReturn(input: {
    itemId: string; batchId: string; qty: number;
    witnessStaffId?: string | null; witnessName: string;
    patientId?: string | null;
    branchId?: string | null;
    witnessSignature?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('cs_record_return', {
      p_item_id: input.itemId, p_batch_id: input.batchId, p_qty: input.qty,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_name: input.witnessName,
      p_patient_id: input.patientId ?? null,
      p_branch_id: input.branchId ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record return');
    return data as string;
  }

  async reconcile(input: {
    itemId: string; batchId: string; actualQty: number;
    witnessStaffId?: string | null; witnessName: string;
    branchId?: string | null;
    witnessSignature?: string | null;
    reason?: string | null;
  }): Promise<{ reconciliation_id: string; adjustment_entry_id: string | null; expected_qty: number; actual_qty: number; variance: number }> {
    const { data, error } = await this.db.rpc('cs_record_reconciliation', {
      p_item_id: input.itemId, p_batch_id: input.batchId,
      p_actual_qty: input.actualQty,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_name: input.witnessName,
      p_branch_id: input.branchId ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_reason: input.reason ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record reconciliation');
    return data;
  }
}
