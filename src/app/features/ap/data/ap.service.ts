import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Json, VendorPaymentMethodAp } from '../../../core/supabase/supabase.types';
import type { Vendor } from '../../vendors/data/vendors.types';
import type {
  BillDetail,
  BillDraftLine,
  BillRow,
  BillablePo,
  BillablePoLine,
  VendorBill,
  VendorPayment,
} from './ap.types';

interface RawBill extends VendorBill {
  vendor: BillRow['vendor'];
  po: BillRow['po'];
  created_by: BillRow['created_by'];
}

@Injectable({ providedIn: 'root' })
export class ApService {
  private supabase = inject(SupabaseService);

  async list(limit = 200): Promise<BillRow[]> {
    const { data, error } = await this.supabase.client
      .from('vendor_bills')
      .select(`*,
               vendor:vendor_id(id, code, name, category),
               po:po_id(id, po_number, status),
               created_by:created_by_staff_id(id, full_name)`)
      .order('bill_date', { ascending: false })
      .limit(limit)
      .returns<RawBill[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getDetail(id: string): Promise<BillDetail> {
    const [hdrResp, itemsResp, paymentsResp] = await Promise.all([
      this.supabase.client
        .from('vendor_bills')
        .select(`*,
                 vendor:vendor_id(id, code, name, category),
                 po:po_id(id, po_number, status),
                 created_by:created_by_staff_id(id, full_name)`)
        .eq('id', id)
        .single(),
      this.supabase.client
        .from('vendor_bill_items')
        .select('*')
        .eq('bill_id', id)
        .order('position'),
      this.supabase.client
        .from('vendor_payments')
        .select('*')
        .eq('bill_id', id)
        .order('paid_at', { ascending: false }),
    ]);
    if (hdrResp.error)      throw hdrResp.error;
    if (itemsResp.error)    throw itemsResp.error;
    if (paymentsResp.error) throw paymentsResp.error;
    const hdr = hdrResp.data as unknown as RawBill;
    return {
      ...hdr,
      items: itemsResp.data ?? [],
      payments: paymentsResp.data ?? [],
    };
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

  async listBillablePos(vendorId?: string): Promise<BillablePo[]> {
    let q = this.supabase.client
      .from('purchase_orders')
      .select(`id, po_number, status, category, vendor_id,
               vendor:vendor_id(id, code, name),
               items:purchase_order_items(id, description, uom, qty_ordered, qty_received, unit_price_cents, gst_rate)`)
      .in('status', ['sent', 'partially_received', 'fully_received', 'closed'])
      .order('po_date', { ascending: false });
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q;
    if (error) throw error;
    type Raw = {
      id: string;
      po_number: string;
      status: BillablePo['status'];
      category: BillablePo['category'];
      vendor: BillablePo['vendor'];
      items: Array<{
        id: string;
        description: string;
        uom: string;
        qty_ordered: number;
        qty_received: number;
        unit_price_cents: number;
        gst_rate: number;
      }>;
    };
    const rows = (data ?? []) as unknown as Raw[];
    return rows.map<BillablePo>((r) => ({
      id: r.id,
      po_number: r.po_number,
      status: r.status,
      category: r.category,
      vendor: r.vendor,
      items: r.items.map<BillablePoLine>((it) => ({
        id: it.id,
        description: it.description,
        uom: it.uom,
        qty_ordered: Number(it.qty_ordered),
        qty_received: Number(it.qty_received),
        unit_price_cents: it.unit_price_cents,
        gst_rate: Number(it.gst_rate),
      })),
    }));
  }

  async create(input: {
    vendorId: string;
    poId: string | null;
    vendorBillNumber: string;
    billDate: string;
    dueDate: string;
    items: BillDraftLine[];
    paymentTerms?: string;
    paymentMethod?: string;
    freightCents?: number;
    tdsCents?: number;
    notes?: string;
    submit?: boolean;
  }): Promise<VendorBill> {
    const lines = input.items.map((l) => ({
      po_item_id: l.po_item_id ?? undefined,
      description: l.description,
      uom: l.uom,
      qty_billed: l.qty_billed,
      unit_price_cents: l.unit_price_cents,
      discount_cents: l.discount_cents,
      gst_rate: l.gst_rate,
    }));
    const { data, error } = await this.supabase.client.rpc('create_vendor_bill', {
      p_vendor_id: input.vendorId,
      p_po_id: input.poId,
      p_vendor_bill_number: input.vendorBillNumber,
      p_bill_date: input.billDate,
      p_due_date: input.dueDate,
      p_items: lines as unknown as Json,
      p_payment_terms: input.paymentTerms ?? 'net_30',
      p_payment_method: input.paymentMethod || undefined,
      p_freight_cents: input.freightCents ?? 0,
      p_tds_cents: input.tdsCents ?? 0,
      p_notes: input.notes?.trim() || undefined,
      p_submit: input.submit ?? false,
    });
    if (error) throw error;
    return data as VendorBill;
  }

  async submit(id: string)  { await this.callBillRpc('submit_vendor_bill',  { p_bill_id: id }); }
  async approve(id: string) { await this.callBillRpc('approve_vendor_bill', { p_bill_id: id }); }
  async cancel(id: string, reason: string) {
    await this.callBillRpc('cancel_vendor_bill', { p_bill_id: id, p_reason: reason });
  }
  async overrideMatch(id: string, reason: string) {
    await this.callBillRpc('override_bill_match', { p_bill_id: id, p_reason: reason });
  }

  async recordPayment(input: {
    billId: string;
    amountCents: number;
    method: VendorPaymentMethodAp;
    paidAt?: string;
    reference?: string;
    notes?: string;
  }): Promise<VendorPayment> {
    const { data, error } = await this.supabase.client.rpc('record_vendor_payment', {
      p_bill_id: input.billId,
      p_amount_cents: input.amountCents,
      p_method: input.method,
      p_paid_at: input.paidAt || undefined,
      p_reference: input.reference?.trim() || undefined,
      p_notes: input.notes?.trim() || undefined,
    });
    if (error) throw error;
    return data as VendorPayment;
  }

  async voidPayment(id: string, reason: string) {
    const { error } = await (this.supabase.client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
      'void_vendor_payment',
      { p_payment_id: id, p_reason: reason },
    );
    if (error) throw error;
  }

  private async callBillRpc(name: 'submit_vendor_bill' | 'approve_vendor_bill' | 'cancel_vendor_bill' | 'override_bill_match', args: Record<string, unknown>) {
    const { error } = await (this.supabase.client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(name, args);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('ap-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_bills' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_bill_items' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_payments' },   () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
