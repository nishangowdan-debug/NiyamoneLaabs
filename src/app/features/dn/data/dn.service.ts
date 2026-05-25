import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Json } from '../../../core/supabase/supabase.types';
import type { Vendor } from '../../vendors/data/vendors.types';
import type {
  ApplicableBill,
  DebitNote,
  DnDetail,
  DnDraftLine,
  DnProposal,
  DnRow,
} from './dn.types';

interface RawDn extends DebitNote {
  vendor: DnRow['vendor'];
  grn: DnRow['grn'];
  bill: DnRow['bill'];
  applied_to_bill: DnRow['applied_to_bill'];
}

@Injectable({ providedIn: 'root' })
export class DnService {
  private supabase = inject(SupabaseService);

  async list(limit = 200): Promise<DnRow[]> {
    const { data, error } = await this.supabase.client
      .from('vendor_debit_notes')
      .select(`*,
               vendor:vendor_id(id, code, name, category),
               grn:grn_id(id, grn_number),
               bill:bill_id(id, bill_number_internal),
               applied_to_bill:applied_to_bill_id(id, bill_number_internal)`)
      .order('dn_date', { ascending: false })
      .limit(limit)
      .returns<RawDn[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getDetail(id: string): Promise<DnDetail> {
    const [hdrResp, itemsResp] = await Promise.all([
      this.supabase.client
        .from('vendor_debit_notes')
        .select(`*,
                 vendor:vendor_id(id, code, name, category),
                 grn:grn_id(id, grn_number),
                 bill:bill_id(id, bill_number_internal),
                 applied_to_bill:applied_to_bill_id(id, bill_number_internal)`)
        .eq('id', id)
        .single(),
      this.supabase.client
        .from('vendor_debit_note_items')
        .select('*')
        .eq('debit_note_id', id)
        .order('position'),
    ]);
    if (hdrResp.error)   throw hdrResp.error;
    if (itemsResp.error) throw itemsResp.error;
    const hdr = hdrResp.data as unknown as RawDn;
    return { ...hdr, items: itemsResp.data ?? [] };
  }

  async listVendors(): Promise<Vendor[]> {
    const { data, error } = await this.supabase.client
      .from('vendors').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return data ?? [];
  }

  /** GRNs that have at least one damaged/short/expired line and aren't fully covered by a DN yet. */
  async listEligibleGrns(): Promise<{ id: string; grn_number: string; received_at: string; vendor_id: string; vendor_name: string }[]> {
    const { data, error } = await this.supabase.client
      .from('goods_receipts')
      .select(`id, grn_number, received_at, po:po_id(vendor:vendor_id(id, name)), items:goods_receipt_items(condition)`)
      .eq('status', 'posted')
      .order('received_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    type Raw = {
      id: string;
      grn_number: string;
      received_at: string;
      po: { vendor: { id: string; name: string } | null } | null;
      items: { condition: string }[];
    };
    const rows = (data ?? []) as unknown as Raw[];
    return rows
      .filter((r) => r.items.some((it) => ['damaged','short','expired'].includes(it.condition)))
      .map((r) => ({
        id: r.id,
        grn_number: r.grn_number,
        received_at: r.received_at,
        vendor_id: r.po?.vendor?.id ?? '',
        vendor_name: r.po?.vendor?.name ?? 'Unknown',
      }));
  }

  async proposeFromGrn(grnId: string): Promise<DnProposal> {
    const { data, error } = await this.supabase.client.rpc('propose_debit_note_from_grn', { p_grn_id: grnId });
    if (error) throw error;
    return data as unknown as DnProposal;
  }

  async listApplicableBills(vendorId: string): Promise<ApplicableBill[]> {
    const { data, error } = await this.supabase.client
      .from('vendor_bills')
      .select('id, bill_number_internal, vendor_bill_number, total_cents, paid_total_cents, due_date, status')
      .eq('vendor_id', vendorId)
      .in('status', ['approved', 'partially_paid'])
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ApplicableBill[];
  }

  async create(input: {
    vendorId: string;
    items: DnDraftLine[];
    reason: string;
    grnId?: string | null;
    billId?: string | null;
    notes?: string;
    issue?: boolean;
  }): Promise<DebitNote> {
    const lines = input.items.map((l) => ({
      grn_item_id: l.grn_item_id ?? undefined,
      po_item_id: l.po_item_id ?? undefined,
      inventory_item_id: l.inventory_item_id ?? undefined,
      description: l.description,
      uom: l.uom,
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      gst_rate: l.gst_rate,
      reason_code: l.reason_code,
    }));
    const { data, error } = await this.supabase.client.rpc('create_debit_note', {
      p_vendor_id: input.vendorId,
      p_items: lines as unknown as Json,
      p_reason: input.reason,
      p_grn_id: input.grnId ?? null,
      p_bill_id: input.billId ?? null,
      p_notes: input.notes?.trim() || undefined,
      p_issue: input.issue ?? false,
    });
    if (error) throw error;
    return data as DebitNote;
  }

  async issue(id: string)  { await this.callRpc('issue_debit_note',  { p_dn_id: id }); }
  async apply(id: string, billId: string) { await this.callRpc('apply_debit_note', { p_dn_id: id, p_bill_id: billId }); }
  async cancel(id: string, reason: string) { await this.callRpc('cancel_debit_note', { p_dn_id: id, p_reason: reason }); }

  private async callRpc(name: 'issue_debit_note' | 'apply_debit_note' | 'cancel_debit_note', args: Record<string, unknown>) {
    const { error } = await (this.supabase.client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(name, args);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('dn-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_debit_notes' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_debit_note_items' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_payments' },         () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
