import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  DisposalMethod, DisposalReason, DisposalStatus, DrugDisposal, DrugRecall,
  ExpiringInventoryRow, RecallSeverity,
} from './drug-disposal.types';

@Injectable({ providedIn: 'root' })
export class DrugDisposalService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listExpiringInventory(): Promise<ExpiringInventoryRow[]> {
    const { data, error } = await this.db.from('v_expiring_inventory')
      .select('*').limit(2000);
    if (error) throw error;
    return (data ?? []) as ExpiringInventoryRow[];
  }

  async listDisposals(opts: { status?: DisposalStatus } = {}): Promise<DrugDisposal[]> {
    let q = this.db.from('drug_disposals').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DrugDisposal[];
  }

  async quarantine(input: {
    itemId: string; batchId: string; qty: number;
    reason: DisposalReason; reasonDetails?: string | null;
    recallId?: string | null; branchId?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('disposal_quarantine', {
      p_item_id: input.itemId, p_batch_id: input.batchId, p_qty: input.qty,
      p_reason: input.reason, p_reason_details: input.reasonDetails ?? null,
      p_recall_id: input.recallId ?? null,
      p_branch_id: input.branchId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to quarantine');
    return data as string;
  }

  async cancel(disposalId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('disposal_cancel', {
      p_disposal_id: disposalId, p_reason: reason,
    });
    if (error) throw new Error(error.message ?? 'Failed to cancel');
  }

  async complete(input: {
    disposalId: string;
    method: DisposalMethod;
    witnessName: string;
    witnessStaffId?: string | null;
    witnessSignature?: string | null;
    drugInspectorWitnessed?: boolean;
    drugInspectorName?: string | null;
    drugInspectorIdNo?: string | null;
    vendorId?: string | null;
    vendorCertificateNo?: string | null;
    vendorCertificateUrl?: string | null;
    disposedByName?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('disposal_complete', {
      p_disposal_id: input.disposalId,
      p_method: input.method,
      p_witness_name: input.witnessName,
      p_witness_staff_id: input.witnessStaffId ?? null,
      p_witness_signature: input.witnessSignature ?? null,
      p_drug_inspector_witnessed: input.drugInspectorWitnessed ?? false,
      p_drug_inspector_name: input.drugInspectorName ?? null,
      p_drug_inspector_id_no: input.drugInspectorIdNo ?? null,
      p_vendor_id: input.vendorId ?? null,
      p_vendor_certificate_no: input.vendorCertificateNo ?? null,
      p_vendor_certificate_url: input.vendorCertificateUrl ?? null,
      p_disposed_by_name: input.disposedByName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to complete disposal');
  }

  // ── Recalls ───────────────────────────────────────────────────
  async listRecalls(opts: { openOnly?: boolean } = {}): Promise<DrugRecall[]> {
    let q = this.db.from('drug_recalls').select('*').order('notice_received_at', { ascending: false }).limit(500);
    if (opts.openOnly) q = q.is('recall_completed_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DrugRecall[];
  }

  async createRecall(input: {
    recallNo?: string | null;
    severity: RecallSeverity;
    source: string;
    recallReason: string;
    itemId?: string | null;
    genericPattern?: string | null;
    batchPattern?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('recall_create', {
      p_recall_no:       input.recallNo ?? null,
      p_severity:        input.severity,
      p_source:          input.source,
      p_recall_reason:   input.recallReason,
      p_item_id:         input.itemId ?? null,
      p_generic_pattern: input.genericPattern ?? null,
      p_batch_pattern:   input.batchPattern ?? null,
      p_notes:           input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create recall');
    return data as string;
  }

  async completeRecall(id: string, notes?: string | null): Promise<void> {
    const { error } = await this.db.rpc('recall_complete', { p_recall_id: id, p_notes: notes ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Helpers ───────────────────────────────────────────────────
  async listVendors(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.db.from('vendors').select('id, name').order('name').limit(500);
    if (error) throw error;
    return data ?? [];
  }

  async listInventoryItems(): Promise<{ id: string; sku: string | null; name: string; controlled_class: string | null }[]> {
    const { data, error } = await this.db.from('inventory_items')
      .select('id, sku, name, controlled_class')
      .eq('is_active', true).order('name').limit(2000);
    if (error) throw error;
    return data ?? [];
  }
}
