import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Decision, HistoryRow, InboxFilters, InboxItem, InvoiceApprovalContext } from './smart-inbox.types';

@Injectable({ providedIn: 'root' })
export class SmartInboxService {
  private supabase = inject(SupabaseService);

  async list(filters: InboxFilters): Promise<InboxItem[]> {
    let q = this.supabase.client
      .from('v_smart_inbox')
      .select('*')
      .order('priority_rank', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200);

    if (filters.kind !== 'all') q = q.eq('kind', filters.kind);
    if (filters.branchId)       q = q.eq('branch_id', filters.branchId);
    if (filters.search.trim()) {
      const needle = filters.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
      q = q.ilike('title', `%${needle}%`);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as InboxItem[];
  }

  async decide(
    exceptionRequestId: string,
    decision: Decision,
    note: string | null,
    payloadOverride: Record<string, unknown> | null = null,
  ): Promise<{ id: string; status: Decision; applied_at: string | null; apply_error: string | null }> {
    const { data, error } = await (this.supabase.client as any).rpc('decide_exception', {
      p_id: exceptionRequestId,
      p_decision: decision,
      p_note: note,
      p_payload_override: payloadOverride,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('decide_exception returned no data');
    if (data.apply_error) throw new Error(`Decision saved, but apply failed: ${data.apply_error}`);
    return data as { id: string; status: Decision; applied_at: string | null; apply_error: string | null };
  }

  /** Resolve the underlying invoice/PO/etc. id for an inbox item.
   *  For exception_requests this looks up `source_id` on the request, which is the safest
   *  path even if the view column wasn't surfaced. */
  async resolveSourceRecordId(item: { source: string; source_id: string; source_record_id?: string }): Promise<string> {
    if (item.source_record_id && item.source_record_id.length > 0) return item.source_record_id;
    if (item.source !== 'exception_request') return item.source_id;
    const { data, error } = await this.supabase.client
      .from('exception_requests' as any)
      .select('source_id')
      .eq('id', item.source_id)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not resolve invoice id');
    return (data as any).source_id as string;
  }

  /** Fetch invoice + patient + per-kind line-item breakdown for an approval card. */
  async getInvoiceContext(invoiceId: string): Promise<InvoiceApprovalContext> {
    if (!invoiceId) throw new Error('Missing invoice id for context');
    const { data: inv, error: invErr } = await this.supabase.client
      .from('invoices')
      .select('id, invoice_number, subtotal_cents, discount_cents, total_cents, status, branch_id, notes, patient_id')
      .eq('id', invoiceId)
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? 'Invoice not found');

    let patient: InvoiceApprovalContext['patient'] = null;
    if (inv.patient_id) {
      const { data: p } = await this.supabase.client
        .from('patients')
        .select('id, uhid, first_name, last_name, mobile')
        .eq('id', inv.patient_id)
        .maybeSingle();
      if (p) {
        patient = {
          id:        p.id,
          uhid:      p.uhid,
          full_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.uhid,
          mobile:    p.mobile ?? null,
        };
      }
    }

    const { data: items } = await this.supabase.client
      .from('invoice_items')
      .select('related_entity_type, total_cents')
      .eq('invoice_id', invoiceId);

    const byKind = new Map<string, { count: number; total_cents: number }>();
    for (const it of (items ?? []) as { related_entity_type: string | null; total_cents: number | null }[]) {
      const key = it.related_entity_type ?? 'manual';
      const acc = byKind.get(key) ?? { count: 0, total_cents: 0 };
      acc.count += 1;
      acc.total_cents += Number(it.total_cents ?? 0);
      byKind.set(key, acc);
    }
    const breakdown = Array.from(byKind.entries())
      .map(([kind, v]) => ({ kind, count: v.count, total_cents: v.total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents);

    return {
      invoice: {
        id:             inv.id,
        invoice_number: inv.invoice_number,
        subtotal_cents: inv.subtotal_cents,
        discount_cents: inv.discount_cents,
        total_cents:    inv.total_cents,
        status:         inv.status,
        branch_id:      inv.branch_id,
        notes:          inv.notes,
      },
      patient,
      line_breakdown: breakdown,
    };
  }

  async submit(input: {
    exceptionType: string;
    sourceTable: string;
    sourceId: string;
    title: string;
    reason: string;
    payload?: Record<string, unknown>;
    branchId?: string | null;
    severity?: 'low' | 'normal' | 'high' | 'critical';
  }): Promise<{ id: string; ticket_no: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('submit_exception', {
      p_exception_type: input.exceptionType,
      p_source_table:   input.sourceTable,
      p_source_id:      input.sourceId,
      p_title:          input.title,
      p_reason:         input.reason,
      p_payload:        input.payload ?? {},
      p_branch_id:      input.branchId ?? null,
      p_severity:       input.severity ?? 'normal',
    });
    if (error) throw new Error(error.message);
    if (!data || !data.id || !data.ticket_no) throw new Error('submit_exception returned no data');
    return { id: data.id, ticket_no: data.ticket_no };
  }

  /** Fetch decided exceptions (approved/rejected) for the History tab. */
  async listHistory(opts: { branchId: string | null; sinceIso: string }): Promise<HistoryRow[]> {
    let q = this.supabase.client
      .from('v_exception_history' as any)
      .select('*')
      .gte('decided_at', opts.sinceIso)
      .order('decided_at', { ascending: false })
      .limit(2000);
    if (opts.branchId) q = q.eq('branch_id', opts.branchId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown) as HistoryRow[];
  }

  /** Subscribe to changes in exception_requests; caller refreshes counts/list. */
  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel(`smart-inbox-exceptions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exception_requests' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
