import { Injectable, inject } from '@angular/core';
import { differenceInDays, parseISO } from 'date-fns';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { InventoryBatch, InventoryItem, InventoryItemView, ItemStatus } from './inventory.types';

interface RawItem extends InventoryItem {
  batches: InventoryBatch[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private supabase = inject(SupabaseService);

  async listItems(): Promise<InventoryItemView[]> {
    const { data, error } = await this.supabase.client
      .from('inventory_items')
      .select(`*, batches:inventory_batches(*)`)
      .eq('is_active', true)
      .order('name')
      .returns<RawItem[]>();
    if (error) throw error;

    return (data ?? []).map((row) => this.assemble(row));
  }

  private assemble(row: RawItem): InventoryItemView {
    const live = (row.batches ?? []).filter((b) => !b.is_expired);
    const totalOnHand = live.reduce((s, b) => s + b.qty_on_hand, 0);
    const totalCostCents = live.reduce((s, b) => s + b.qty_on_hand * b.unit_cost_cents, 0);

    const upcoming = live
      .filter((b) => b.qty_on_hand > 0 && b.expiry_date)
      .map((b) => ({ id: b.id, expiry_date: b.expiry_date! }))
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const earliestExpiry = upcoming[0]?.expiry_date ?? null;
    const expiryDays = earliestExpiry
      ? differenceInDays(parseISO(earliestExpiry), new Date())
      : null;

    let status: ItemStatus = 'in_stock';
    if (totalOnHand === 0) status = 'out';
    else if (totalOnHand <= row.reorder_point) status = 'low';
    else if (expiryDays !== null && expiryDays <= 90) status = 'expiring';

    // Override with 'expired' if every live batch is past date
    if (totalOnHand > 0 && upcoming.length > 0 && expiryDays !== null && expiryDays < 0) {
      status = 'expired';
    }

    return {
      ...row,
      batches: (row.batches ?? []).slice().sort((a, b) =>
        (a.expiry_date ?? '').localeCompare(b.expiry_date ?? ''),
      ),
      totalOnHand,
      totalCostCents,
      earliestExpiry,
      expiryDays,
      status,
    };
  }

  async receive(input: {
    sku: string;
    batchNumber: string;
    qty: number;
    mfgDate?: string;
    expiryDate?: string;
    unitCostCents?: number;
    vendorName?: string;
    notes?: string;
  }): Promise<InventoryBatch> {
    const { data, error } = await this.supabase.client.rpc('receive_inventory', {
      p_item_sku: input.sku,
      p_batch_number: input.batchNumber,
      p_qty: input.qty,
      p_mfg_date: input.mfgDate ?? undefined,
      p_expiry_date: input.expiryDate ?? undefined,
      p_unit_cost_cents: input.unitCostCents ?? undefined,
      p_vendor_name: input.vendorName ?? undefined,
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
    return data as InventoryBatch;
  }

  async adjust(input: { batchId: string; qtyDelta: number; reason: string }): Promise<InventoryBatch> {
    const { data, error } = await this.supabase.client.rpc('adjust_inventory', {
      p_batch_id: input.batchId,
      p_qty_delta: input.qtyDelta,
      p_reason: input.reason,
    });
    if (error) throw error;
    return data as InventoryBatch;
  }

  async expireBatch(batchId: string, reason = 'expired'): Promise<InventoryBatch> {
    const { data, error } = await this.supabase.client.rpc('expire_inventory_batch', {
      p_batch_id: batchId,
      p_reason: reason,
    });
    if (error) throw error;
    return data as InventoryBatch;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' },   () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' },   () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
