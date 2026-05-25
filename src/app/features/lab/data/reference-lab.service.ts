import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ReferenceLab, ReferenceDispatch, ReferenceDispatchRow, ReferenceDispatchStatus,
} from './reference-lab.types';

@Injectable({ providedIn: 'root' })
export class ReferenceLabService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Master data ───────────────────────────────────────────────
  async listLabs(branchId: string | null = null): Promise<ReferenceLab[]> {
    let q = this.db.from('reference_labs').select('*')
      .eq('is_active', true)
      .order('name');
    if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ReferenceLab[];
  }

  /** Cheap probe: returns true when the `lab_orders.routing` column exists.
   *  Used by the Reference Lab page to show a "Migration not applied" banner
   *  instead of silently hiding the Pending dispatch list. */
  async routingInstalled(): Promise<boolean> {
    const { error } = await this.db.from('lab_orders').select('routing').limit(1);
    if (!error) return true;
    const msg = String(error?.message ?? '').toLowerCase();
    if (error?.code === '42703' || (msg.includes('routing') && msg.includes('does not exist'))) {
      return false;
    }
    // Some other error — assume installed so we don't mislead the user.
    return true;
  }

  /** Flip an existing lab_order's routing between inhouse and outsource.
   *  Falls back to a plain UPDATE if the RPC isn't installed yet. */
  async setOrderRouting(orderId: string, routing: 'inhouse' | 'outsource'): Promise<void> {
    const { error } = await this.db.rpc('set_lab_order_routing', { p_order_id: orderId, p_routing: routing });
    if (!error) return;
    const msg = String(error?.message ?? '').toLowerCase();
    const rpcMissing = msg.includes('set_lab_order_routing') || msg.includes('does not exist');
    if (!rpcMissing) throw error;
    const { error: upErr } = await this.db.from('lab_orders').update({ routing }).eq('id', orderId);
    if (upErr) throw upErr;
  }

  async upsertLab(input: Partial<ReferenceLab> & { name: string; code: string }): Promise<ReferenceLab> {
    const { data, error } = await this.db.from('reference_labs')
      .upsert(input, { onConflict: 'branch_id,code' })
      .select('*').single();
    if (error) throw error;
    return data as ReferenceLab;
  }

  /**
   * Lab orders that were routed to "outsource" at billing time but haven't been
   * dispatched to a reference lab yet. The user picks one of these and fills in
   * courier/AWB details to actually send the sample out.
   */
  async listPendingDispatch(branchId?: string): Promise<Array<{
    id: string; ordered_at: string; routing: string;
    patient: { uhid: string; full_name: string | null } | null;
    tests: { code: string; name: string }[];
  }>> {
    let q = this.db.from('lab_orders').select(`
      id, ordered_at, routing,
      patient:patient_id(uhid, full_name),
      results:lab_results(test:lab_test_id(code, name))
    `)
      .eq('routing', 'outsource')
      .is('reference_dispatch_id', null)
      .order('ordered_at', { ascending: false })
      .limit(200);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) {
      // Migration not applied yet — no routing column means nothing to surface here.
      const msg = String(error?.message ?? '').toLowerCase();
      if (error?.code === '42703' || (msg.includes('routing') && msg.includes('does not exist'))) {
        return [];
      }
      throw error;
    }
    return ((data ?? []) as any[]).map((o) => ({
      id: o.id,
      ordered_at: o.ordered_at,
      routing: o.routing,
      patient: o.patient,
      tests: (o.results ?? []).map((r: any) => r.test).filter(Boolean),
    }));
  }

  // ── Dispatches ────────────────────────────────────────────────
  async listDispatches(opts: { branchId?: string; status?: ReferenceDispatchStatus; orderId?: string } = {}): Promise<ReferenceDispatchRow[]> {
    let q = this.db.from('reference_lab_dispatches').select(`
      *,
      reference_lab:reference_lab_id(id, name, code),
      lab_order:lab_order_id(
        id, sample_id, ordered_at,
        patient:patient_id(id, uhid, full_name)
      )
    `).order('dispatched_at', { ascending: false }).limit(500);
    if (opts.branchId) q = q.eq('branch_id', opts.branchId);
    if (opts.status)   q = q.eq('status', opts.status);
    if (opts.orderId)  q = q.eq('lab_order_id', opts.orderId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ReferenceDispatchRow[];
  }

  async dispatch(input: {
    labOrderId: string; referenceLabId: string;
    courierName?: string; awbNumber?: string;
    expectedReturnAt?: string | null; notes?: string;
  }): Promise<ReferenceDispatch> {
    const { data, error } = await this.db.rpc('lab_dispatch_to_reference', {
      p_lab_order_id:       input.labOrderId,
      p_reference_lab_id:   input.referenceLabId,
      p_courier_name:       input.courierName ?? null,
      p_awb_number:         input.awbNumber ?? null,
      p_expected_return_at: input.expectedReturnAt ?? null,
      p_notes:              input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to dispatch');
    return data as ReferenceDispatch;
  }

  async acknowledge(dispatchId: string, awbNumber?: string): Promise<ReferenceDispatch> {
    const { data, error } = await this.db.rpc('lab_dispatch_acknowledge', {
      p_dispatch_id: dispatchId, p_awb_number: awbNumber ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as ReferenceDispatch;
  }

  async markReceived(dispatchId: string): Promise<ReferenceDispatch> {
    const { data, error } = await this.db.rpc('lab_dispatch_received', { p_dispatch_id: dispatchId });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as ReferenceDispatch;
  }

  async report(dispatchId: string, summary: string, pdfUrl?: string | null): Promise<ReferenceDispatch> {
    const { data, error } = await this.db.rpc('lab_dispatch_report', {
      p_dispatch_id: dispatchId, p_result_summary: summary, p_result_pdf_url: pdfUrl ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as ReferenceDispatch;
  }

  async cancel(dispatchId: string, reason: string): Promise<ReferenceDispatch> {
    const { data, error } = await this.db.rpc('lab_dispatch_cancel', {
      p_dispatch_id: dispatchId, p_reason: reason,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as ReferenceDispatch;
  }
}
