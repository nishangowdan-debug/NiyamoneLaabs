import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Json,
  PoFreightTerms,
  PoReturnsPolicy,
  PoType,
  VendorCategory,
  VendorPaymentMethod,
  VendorPaymentTerms,
} from '../../../core/supabase/supabase.types';
import type { PoDetail, PoDraftLine, PoRow, PurchaseOrder, PurchaseOrderItem } from './purchase.types';
import type { Vendor } from '../../vendors/data/vendors.types';

interface RawPo extends PurchaseOrder {
  vendor: PoRow['vendor'];
}

@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private supabase = inject(SupabaseService);

  async list(limit = 100): Promise<PoRow[]> {
    const { data, error } = await this.supabase.client
      .from('purchase_orders')
      .select(`*, vendor:vendor_id(id, code, name, category)`)
      .order('po_date', { ascending: false })
      .limit(limit)
      .returns<RawPo[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getDetail(id: string): Promise<PoDetail> {
    const [hdrResp, itemsResp] = await Promise.all([
      this.supabase.client
        .from('purchase_orders')
        .select(`*, vendor:vendor_id(id, code, name, category)`)
        .eq('id', id)
        .single(),
      this.supabase.client
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id)
        .order('position'),
    ]);
    if (hdrResp.error)   throw hdrResp.error;
    if (itemsResp.error) throw itemsResp.error;
    const hdr = hdrResp.data as unknown as RawPo;
    return { ...hdr, items: itemsResp.data ?? [] };
  }

  async listVendors(): Promise<Vendor[]> {
    const { data, error } = await this.supabase.client
      .from('vendors')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  async create(input: {
    vendorId: string;
    items: PoDraftLine[];
    category: VendorCategory;
    poType?: PoType;
    paymentTerms?: VendorPaymentTerms;
    paymentMethod?: VendorPaymentMethod | null;
    freightTerms?: PoFreightTerms;
    freightCents?: number;
    tdsCents?: number;
    qcRequirements?: string[];
    returnsPolicy?: PoReturnsPolicy | null;
    expectedDeliveryDate?: string | null;
    notes?: string;
    specialInstructions?: string;
    submit?: boolean;
  }): Promise<PurchaseOrder> {
    const lines = input.items.map((l) => ({
      inventory_item_id: l.inventory_item_id ?? undefined,
      description: l.description,
      uom: l.uom,
      qty_ordered: l.qty_ordered,
      unit_price_cents: l.unit_price_cents,
      discount_cents: l.discount_cents,
      gst_rate: l.gst_rate,
    }));

    const { data, error } = await this.supabase.client.rpc('create_purchase_order', {
      p_vendor_id: input.vendorId,
      p_items: lines as unknown as Json,
      p_category: input.category,
      p_po_type: input.poType ?? 'standard',
      p_payment_terms: input.paymentTerms ?? 'net_30',
      p_payment_method: input.paymentMethod ?? undefined,
      p_freight_terms: input.freightTerms ?? 'vendor',
      p_freight_cents: input.freightCents ?? 0,
      p_tds_cents: input.tdsCents ?? 0,
      p_qc_requirements: input.qcRequirements ?? [],
      p_returns_policy: input.returnsPolicy ?? undefined,
      p_expected_delivery_date: input.expectedDeliveryDate ?? undefined,
      p_notes: input.notes ?? undefined,
      p_special_instructions: input.specialInstructions ?? undefined,
      p_submit: input.submit ?? false,
    });
    if (error) throw error;
    return data as PurchaseOrder;
  }

  async submit(id: string)   { await this.callRpc('submit_purchase_order',  { p_po_id: id }); }
  async approve(id: string)  { await this.callRpc('approve_purchase_order', { p_po_id: id }); }
  async send(id: string)     { await this.callRpc('send_purchase_order',    { p_po_id: id }); }
  async close(id: string)    { await this.callRpc('close_purchase_order',   { p_po_id: id }); }
  async cancel(id: string, reason: string) {
    await this.callRpc('cancel_purchase_order', { p_po_id: id, p_reason: reason });
  }

  private async callRpc(name: 'submit_purchase_order' | 'approve_purchase_order' | 'send_purchase_order' | 'close_purchase_order' | 'cancel_purchase_order', args: Record<string, unknown>) {
    const { error } = await (this.supabase.client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(name, args);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('po-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_items' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
