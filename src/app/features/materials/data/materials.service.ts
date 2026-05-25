import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { GrnQcStatus, Json } from '../../../core/supabase/supabase.types';
import type {
  GoodsReceipt,
  GrnDetail,
  GrnDraftLine,
  GrnRow,
  ReceivablePo,
  ReceivablePoLine,
} from './materials.types';

interface RawGrn extends GoodsReceipt {
  po: GrnRow['po'];
  received_by: GrnRow['received_by'];
}

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private supabase = inject(SupabaseService);

  async list(limit = 100): Promise<GrnRow[]> {
    const { data, error } = await this.supabase.client
      .from('goods_receipts')
      .select(`*,
               po:po_id(id, po_number, category, status, vendor:vendor_id(id, code, name)),
               received_by:received_by_staff_id(id, full_name)`)
      .order('received_at', { ascending: false })
      .limit(limit)
      .returns<RawGrn[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getDetail(id: string): Promise<GrnDetail> {
    const [hdrResp, itemsResp] = await Promise.all([
      this.supabase.client
        .from('goods_receipts')
        .select(`*,
                 po:po_id(id, po_number, category, status, vendor:vendor_id(id, code, name)),
                 received_by:received_by_staff_id(id, full_name)`)
        .eq('id', id)
        .single(),
      this.supabase.client
        .from('goods_receipt_items')
        .select('*')
        .eq('grn_id', id)
        .order('created_at'),
    ]);
    if (hdrResp.error)   throw hdrResp.error;
    if (itemsResp.error) throw itemsResp.error;
    const hdr = hdrResp.data as unknown as RawGrn;
    return { ...hdr, items: itemsResp.data ?? [] };
  }

  async listReceivablePos(): Promise<ReceivablePo[]> {
    const { data, error } = await this.supabase.client
      .from('purchase_orders')
      .select(`id, po_number, status, category, expected_delivery_date,
               vendor:vendor_id(id, code, name),
               items:purchase_order_items(id, inventory_item_id, description, uom, qty_ordered, qty_received, unit_price_cents)`)
      .in('status', ['sent', 'partially_received'])
      .order('po_date', { ascending: false });
    if (error) throw error;
    type Raw = {
      id: string;
      po_number: string;
      status: ReceivablePo['status'];
      category: ReceivablePo['category'];
      expected_delivery_date: string | null;
      vendor: ReceivablePo['vendor'];
      items: Array<{
        id: string;
        inventory_item_id: string | null;
        description: string;
        uom: string;
        qty_ordered: number;
        qty_received: number;
        unit_price_cents: number;
      }>;
    };
    const rows = (data ?? []) as unknown as Raw[];
    return rows
      .map<ReceivablePo>((r) => ({
        id: r.id,
        po_number: r.po_number,
        status: r.status,
        category: r.category,
        expected_delivery_date: r.expected_delivery_date,
        vendor: r.vendor,
        items: r.items
          .map<ReceivablePoLine>((it) => ({
            id: it.id,
            inventory_item_id: it.inventory_item_id,
            description: it.description,
            uom: it.uom,
            qty_ordered: Number(it.qty_ordered),
            qty_received: Number(it.qty_received),
            qty_open: Number(it.qty_ordered) - Number(it.qty_received),
            unit_price_cents: it.unit_price_cents,
          }))
          .filter((it) => it.qty_open > 0),
      }))
      .filter((p) => p.items.length > 0);
  }

  async receive(input: {
    poId: string;
    items: GrnDraftLine[];
    qcStatus: GrnQcStatus;
    qcNotes?: string;
    notes?: string;
  }): Promise<GoodsReceipt> {
    const lines = input.items.map((l) => ({
      po_item_id: l.po_item_id,
      inventory_item_id: l.inventory_item_id ?? undefined,
      qty_received: l.qty_received,
      batch_number: l.batch_number.trim() || undefined,
      mfg_date: l.mfg_date || undefined,
      expiry_date: l.expiry_date || undefined,
      unit_cost_cents: l.unit_cost_cents,
      condition: l.condition,
      notes: l.notes.trim() || undefined,
    }));

    const { data, error } = await this.supabase.client.rpc('receive_goods_against_po', {
      p_po_id: input.poId,
      p_items: lines as unknown as Json,
      p_qc_status: input.qcStatus,
      p_qc_notes: input.qcNotes?.trim() || undefined,
      p_notes: input.notes?.trim() || undefined,
    });
    if (error) throw error;
    return data as GoodsReceipt;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('grn-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_receipts' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_receipt_items' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' },     () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
