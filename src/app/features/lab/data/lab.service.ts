import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { LabPriority } from '../../../core/supabase/supabase.types';
import type { LabOrder, LabOrderRow, LabResultRow, LabTest } from './lab.types';

interface RawOrder extends LabOrder {
  patient: LabOrderRow['patient'];
  doctor: LabOrderRow['doctor'];
  results: LabResultRow[];
}

@Injectable({ providedIn: 'root' })
export class LabService {
  private supabase = inject(SupabaseService);

  /** All active orders (sample_status not 'cancelled'), most recent first. */
  async listOrders(limit = 100): Promise<LabOrderRow[]> {
    const { data, error } = await this.supabase.client
      .from('lab_orders')
      .select(`
        *,
        patient:patient_id(id, uhid, full_name, first_name, last_name, date_of_birth, gender, mobile),
        doctor:ordering_doctor_staff_id(id, full_name),
        results:lab_results(*, test:lab_test_id(code, name, category, unit, ref_min, ref_max, critical_low, critical_high, price_cents))
      `)
      .neq('sample_status', 'cancelled')
      .order('ordered_at', { ascending: false })
      .limit(limit)
      .returns<RawOrder[]>();
    if (error) throw error;

    return (data ?? []).map((o) => this.assemble(o));
  }

  private assemble(o: RawOrder): LabOrderRow {
    const results = (o.results ?? []).slice().sort((a, b) => a.test.code.localeCompare(b.test.code));
    const totals = results.reduce(
      (acc, r) => {
        acc.total++;
        if (r.status === 'pending') acc.pending++;
        else if (r.status === 'entered') acc.entered++;
        else if (r.status === 'verified') acc.verified++;
        if (r.flag === 'critical_low' || r.flag === 'critical_high') acc.critical++;
        return acc;
      },
      { total: 0, pending: 0, entered: 0, verified: 0, critical: 0 },
    );
    return { ...o, results, totals };
  }

  async listTestCatalogue(): Promise<LabTest[]> {
    const { data, error } = await this.supabase.client
      .from('lab_tests')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('code');
    if (error) throw error;
    return data ?? [];
  }

  async placeOrder(input: {
    patientId: string;
    testCodes: string[];
    encounterId?: string | null;
    priority?: LabPriority;
    notes?: string;
  }): Promise<LabOrder> {
    const { data, error } = await this.supabase.client.rpc('place_lab_order', {
      p_patient_id: input.patientId,
      p_test_codes: input.testCodes,
      p_encounter_id: input.encounterId ?? undefined,
      p_priority: input.priority ?? 'routine',
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
    return data as LabOrder;
  }

  // ── Phase 1: Unified investigation engine (OPD + IP) ─────────────────
  /**
   * Place an investigation order (lab + radiology) from EITHER an OPD consultation
   * OR an IPD round. For IP: requires active admission AND allocated bed.
   * Tests can be passed as individual codes OR as one or more package codes
   * (Diabetes Panel, Lipid Profile, etc.) — the RPC unions both lists.
   */
  async placeInvestigation(input: {
    patientId: string;
    testCodes?: string[];
    packageCodes?: string[];
    priority?: LabPriority;
    source: 'opd' | 'ipd';
    admissionId?: string | null;
    encounterId?: string | null;
    notes?: string;
  }): Promise<LabOrder> {
    const args = {
      p_patient_id:    input.patientId,
      p_test_codes:    input.testCodes ?? [],
      p_package_codes: input.packageCodes ?? [],
      p_priority:      input.priority ?? 'routine',
      p_source:        input.source,
      p_admission_id:  input.admissionId ?? null,
      p_encounter_id:  input.encounterId ?? null,
      p_notes:         input.notes ?? null,
    };
    const { data, error } = await (this.supabase.client as any).rpc('place_investigation_order', args);
    if (error) {
      // Print the actual PostgREST error message in plain text (not as a collapsed object)
      console.error('[placeInvestigation] message:', error.message);
      console.error('[placeInvestigation] details:', error.details);
      console.error('[placeInvestigation] hint:',    error.hint);
      console.error('[placeInvestigation] code:',    error.code);
      console.error('[placeInvestigation] args sent:', JSON.stringify(args));
      throw new Error(error.message || error.hint || error.details || 'Failed to place order');
    }
    return data as LabOrder;
  }

  /**
   * Nursing-station action for IP orders: validates admission + bed,
   * auto-creates a credit invoice on the admission ledger,
   * and moves the order to `billed` state.
   * Throws if patient is not currently admitted with a bed.
   */
  async nursingRaiseOrder(labOrderId: string): Promise<LabOrder> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('nursing_raise_lab_order', { p_lab_order_id: labOrderId });
    if (error) throw error;
    return data as LabOrder;
  }

  /** Cashier action for OPD orders: marks the order as paid → unblocks phlebotomy. */
  async opdMarkPaid(labOrderId: string, invoiceId?: string): Promise<LabOrder> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('opd_mark_lab_paid', {
        p_lab_order_id: labOrderId,
        p_invoice_id:   invoiceId ?? null,
      });
    if (error) throw error;
    return data as LabOrder;
  }

  // ── Packages catalogue (Diabetes Panel, Pre-op, Wellness…) ──────────
  async listPackages(): Promise<{
    id: string;
    code: string;
    name: string;
    category: string | null;
    price_cents: number;
    is_radiology: boolean;
  }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_packages')
      .select('id, code, name, category, price_cents, is_radiology')
      .eq('is_active', true)
      .order('category')
      .order('name');
    if (error) throw error;
    return (data ?? []) as any[];
  }

  /** Audit trail for an order — every state transition with who/when. */
  async listOrderEvents(labOrderId: string): Promise<{
    event_type: string;
    occurred_at: string;
    staff_id: string | null;
    payload: any;
    notes: string | null;
  }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_order_events')
      .select('event_type, occurred_at, staff_id, payload, notes')
      .eq('lab_order_id', labOrderId)
      .order('occurred_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  }

  // ── Phase 3 / 4: query helpers for the billing & workflow boards ────
  /** List orders by state(s). Pulls all the joined data needed to render a board card. */
  async listOrdersByStates(states: string[], limit = 200, routing: 'inhouse' | 'outsource' | 'all' = 'inhouse'): Promise<any[]> {
    const baseSelect = (withRouting: boolean) => `
        id, branch_id, source, state, billing_status, priority${withRouting ? ', routing' : ''},
        admission_id, encounter_id, invoice_id, reference_dispatch_id,
        ordered_at, collected_at, sample_id, notes, updated_at,
        patient:patient_id(id, uhid, full_name, first_name, last_name, mobile, date_of_birth, gender),
        doctor:ordering_doctor_staff_id(id, full_name),
        results:lab_results(id, status, flag, value_numeric, value_text,
                            test:lab_test_id(id, code, name, category, unit, ref_min, ref_max, critical_low, critical_high, price_cents, target_tat_minutes, stat_target_tat_minutes, is_outsourced, reference_lab_name, instrument_id,
                                             instrument:instrument_id(code, name)))
      `;

    const run = async (withRouting: boolean) => {
      let q = (this.supabase.client as any)
        .from('lab_orders')
        .select(baseSelect(withRouting))
        .in('state', states)
        .order('ordered_at', { ascending: false })
        .limit(limit);
      if (withRouting && routing !== 'all') q = q.eq('routing', routing);
      return q;
    };

    let { data, error } = await run(true);
    if (error && this.isMissingRoutingColumn(error)) {
      // Migration not applied yet — fall back to the pre-routing schema.
      ({ data, error } = await run(false));
    }
    if (error) throw error;
    return (data ?? []) as any[];
  }

  private isMissingRoutingColumn(error: any): boolean {
    const msg = String(error?.message ?? error ?? '').toLowerCase();
    return error?.code === '42703' || msg.includes('routing') && msg.includes('does not exist');
  }

  /** Bill an OPD lab order: create invoice → record cash payment → mark paid. */
  async billAndCollectOpd(input: {
    orderId: string;
    patientId: string;
    items: { description: string; qty: number; unit_price_cents: number; gst_rate?: number; related_entity_id?: string }[];
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking';
    paymentReference?: string;
    notes?: string;
  }): Promise<{ invoice_id: string; total_cents: number }> {
    // 1. Create invoice (issued = true so it's payable)
    const { data: inv, error: ie } = await (this.supabase.client as any).rpc('create_invoice', {
      p_patient_id: input.patientId,
      p_items:      input.items,
      p_due_days:   0,
      p_notes:      input.notes ?? `Lab order ${input.orderId}`,
      p_issue:      true,
    });
    if (ie) throw ie;

    const total = (inv as any).total_cents ?? 0;

    // 2. Record full payment
    const { error: pe } = await (this.supabase.client as any).rpc('record_payment', {
      p_invoice_id:    (inv as any).id,
      p_amount_cents:  total,
      p_method:        input.paymentMethod,
      p_reference:     input.paymentReference ?? null,
      p_notes:         null,
    });
    if (pe) throw pe;

    // 3. Mark the lab order paid → state moves to 'billed'
    await this.opdMarkPaid(input.orderId, (inv as any).id);

    return { invoice_id: (inv as any).id, total_cents: total };
  }

  /**
   * Move state forward by direct table update (uses existing RLS).
   * Audit trigger logs the transition automatically.
   */
  async setOrderState(orderId: string, state:
    'sample_collected' | 'in_process' | 'verified' | 'report_ready' | 'delivered' | 'cancelled' | 'rejected',
    extra: Record<string, any> = {},
  ): Promise<void> {
    const patch: any = { state, ...extra };
    if (state === 'sample_collected' && !extra['collected_at']) patch.collected_at = new Date().toISOString();
    if (state === 'report_ready'    && !extra['reported_at'])  patch.reported_at  = new Date().toISOString();
    if (state === 'delivered'       && !extra['delivered_at']) patch.delivered_at = new Date().toISOString();
    const { error } = await (this.supabase.client as any)
      .from('lab_orders').update(patch).eq('id', orderId);
    if (error) throw error;
  }

  async startSample(orderId: string) {
    const { error } = await this.supabase.client.rpc('start_lab_sample', { p_order_id: orderId });
    if (error) throw error;
  }

  async enterResult(input: { resultId: string; valueNumeric?: number; valueText?: string; notes?: string }) {
    const { error } = await this.supabase.client.rpc('enter_lab_result', {
      p_result_id: input.resultId,
      p_value_numeric: input.valueNumeric ?? undefined,
      p_value_text: input.valueText ?? undefined,
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
  }

  // ── LIS / RIS workflow RPCs ──────────────────────────────────────
  async setBilling(orderId: string, status: 'unbilled'|'paid'|'credit'|'waived', isCredit = false) {
    const { error } = await (this.supabase.client as any).rpc('lab_set_billing_status',
      { p_order_id: orderId, p_status: status, p_is_credit: isCredit });
    if (error) throw error;
  }

  /** Phase 2: phlebotomist marks sample collected with wristband + tube count. */
  async collectSample(orderId: string, opts: { wristbandUid?: string; tubeCount?: number; sampleId?: string } = {}) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_collect_sample', {
      p_lab_order_id:  orderId,
      p_wristband_uid: opts.wristbandUid ?? null,
      p_tube_count:    opts.tubeCount ?? 1,
      p_sample_id:     opts.sampleId ?? null,
    });
    if (error) throw error;
    return data;
  }

  /** Phase 2: lab reception accessions an arrived sample. */
  async accessionSample(orderId: string) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_accession_sample', { p_lab_order_id: orderId });
    if (error) throw error;
    return data;
  }

  /** Phase 2: lab tech rejects an unusable sample with a reason code.
   *  Param names must match `public.lab_reject_sample(...)` exactly —
   *  PostgREST resolves the overload by parameter name. `p_test_codes` is
   *  required (no SQL default); the rest fall back to function defaults. */
  async rejectSample(orderId: string, reason: string, details?: string, specimenType?: string) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_reject_sample', {
      p_lab_order_id:   orderId,
      p_reason:         reason,
      p_test_codes:     [],
      p_specimen_type:  specimenType ?? null,
      p_reason_details: details ?? null,
    });
    if (error) throw error;
    return data;
  }

  /** Phase 2: reopen a rejected order back to "Ready" for re-collection. */
  async reopenForRecollection(orderId: string) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_reopen_for_recollection', { p_lab_order_id: orderId });
    if (error) throw error;
    return data;
  }

  // ── Phase 3: Verification + critical values ──────────────────────────
  /** Pathologist verifies a single result. */
  async verifyResult(resultId: string) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_verify_result', { p_result_id: resultId });
    if (error) throw error;
    return data;
  }

  /** Pathologist verifies the whole order (blocks if unacked criticals). */
  async verifyOrder(orderId: string) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_verify_order', { p_order_id: orderId });
    if (error) throw error;
    return data;
  }

  /** Doctor acknowledges a critical value. */
  async ackCriticalAlert(alertId: string, opts: { notes?: string; via?: string; toName?: string } = {}) {
    const { data, error } = await (this.supabase.client as any).rpc('lab_ack_critical', {
      p_alert_id: alertId,
      p_notes:    opts.notes    ?? null,
      p_via:      opts.via      ?? null,
      p_to_name:  opts.toName   ?? null,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Phase 5 / Doctor inbox: recent verified reports for one patient.
   * Returns the last N orders that have results (any state >= verified)
   * with a quick-look summary the consultation page can render inline.
   */
  async listRecentReportsForPatient(patientId: string, limit = 5): Promise<any[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_orders')
      .select(`
        id, state, source, ordered_at, reported_at, sample_id, verification_token,
        results:lab_results(id, flag, value_numeric, value_text, status,
          test:lab_test_id(code, name, unit, ref_min, ref_max))
      `)
      .eq('patient_id', patientId)
      .in('state', ['verified', 'report_ready', 'delivered'])
      .order('reported_at', { ascending: false, nullsFirst: false })
      .order('ordered_at',  { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as any[];
  }

  /** Phase 6: reflex-test suggestions firing on this order's current results. */
  async getReflexSuggestions(orderId: string): Promise<any[]> {
    const { data, error } = await (this.supabase.client as any).rpc('lab_reflex_suggestions', { p_order_id: orderId });
    if (error) return [];
    return (data ?? []) as any[];
  }

  /** Phase 4: per-instrument QC status (overdue >8h since last passing run). */
  async listInstrumentQcStatus(): Promise<any[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('v_lab_instrument_qc_status')
      .select('*')
      .order('instrument_code');
    if (error) return [];
    return (data ?? []) as any[];
  }

  /** Open critical alerts for the lab workflow header. */
  async listOpenCriticalAlerts(branchId: string | null = null) {
    let q: any = this.supabase.client
      .from('lab_critical_alerts')
      .select(`
        id, lab_order_id, lab_result_id, test_name, value_numeric, value_text,
        reference_low, reference_high, raised_at, acknowledged_at, status,
        patient:patient_id(id, full_name, uhid, mobile),
        order:lab_order_id(id, ordering_doctor_staff_id,
          doctor:ordering_doctor_staff_id(full_name))
      `)
      .is('acknowledged_at', null)
      .is('closed_at', null)
      .order('raised_at', { ascending: false });
    if (branchId) {
      q = (this.supabase.client as any)
        .from('lab_critical_alerts')
        .select(`*, patient:patient_id(id, full_name, uhid, mobile),
                 order:lab_order_id(id, branch_id, ordering_doctor_staff_id,
                   doctor:ordering_doctor_staff_id(full_name))`)
        .is('acknowledged_at', null)
        .is('closed_at', null);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as any[];
  }

  async startProcessing(barcodeId: string): Promise<{ order_id: string; patient_id: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('lab_start_processing', { p_barcode_id: barcodeId });
    if (error) throw error;
    return data;
  }

  async enterResultRpc(input: { resultId: string; valueNumeric?: number | null; valueText?: string | null; notes?: string | null }) {
    const { error } = await (this.supabase.client as any).rpc('lab_enter_result', {
      p_result_id: input.resultId,
      p_value_numeric: input.valueNumeric ?? null,
      p_value_text: input.valueText ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
  }

  /** Parameter rows defined for a test (CBC sub-parameters). Empty array if
   *  the catalog hasn't defined any — caller should fall back to flat entry. */
  async listTestParameters(testId: string): Promise<any[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_test_parameters')
      .select('*')
      .eq('lab_test_id', testId)
      .order('sno', { ascending: true });
    if (error) return [];
    return (data ?? []) as any[];
  }

  /** Existing per-parameter values for one result. */
  async listResultValues(resultId: string): Promise<any[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_result_values')
      .select('*')
      .eq('lab_result_id', resultId);
    if (error) return [];
    return (data ?? []) as any[];
  }

  /** Batch-save parameter values for one lab_result. Each entry must include
   *  parameter_id and at least one of value_numeric / value_text. */
  async saveResultValues(
    resultId: string,
    entries: Array<{ parameter_id: string; value_numeric?: number | null; value_text?: string | null; flag?: string | null; notes?: string | null }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await (this.supabase.client as any).rpc('lab_save_result_values', {
      p_result_id: resultId,
      p_entries:   entries,
    });
    if (error) throw error;
  }

  // ── Radiology ────────────────────────────────────────────────────
  async setPacsLink(orderId: string, url: string) {
    const { error } = await (this.supabase.client as any).rpc('radiology_set_pacs', { p_order_id: orderId, p_url: url });
    if (error) throw error;
  }

  async saveReport(orderId: string, html: string, finalize: boolean) {
    const { error } = await (this.supabase.client as any).rpc('radiology_save_report',
      { p_order_id: orderId, p_html: html, p_finalize: finalize });
    if (error) throw error;
  }

  async listSlots(machine?: string | null, fromIso?: string | null): Promise<any[]> {
    let q = (this.supabase.client as any).from('radiology_slots')
      .select(`*, patient:patient_id(uhid, full_name, first_name, last_name)`)
      .order('start_at', { ascending: true });
    if (machine) q = q.eq('machine', machine);
    if (fromIso) q = q.gte('start_at', fromIso);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async bookSlot(input: {
    machine: string; startAt: string; endAt: string;
    labOrderId?: string | null; patientId?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('radiology_book_slot', {
      p_machine: input.machine, p_start: input.startAt, p_end: input.endAt,
      p_lab_order_id: input.labOrderId ?? null, p_patient_id: input.patientId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Last 3 numeric results for the same lab_test for a given patient — for the verification graph. */
  async historicalResults(patientId: string, labTestId: string, limit = 3):
    Promise<{ entered_at: string | null; value_numeric: number | null; flag: string | null }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_results')
      .select('entered_at, value_numeric, flag, lab_order:lab_order_id(patient_id)')
      .eq('lab_test_id', labTestId)
      .not('value_numeric', 'is', null)
      .order('entered_at', { ascending: false })
      .limit(limit + 5);
    if (error) throw error;
    return ((data ?? []) as any[])
      .filter(r => r.lab_order?.patient_id === patientId)
      .slice(0, limit)
      .map(r => ({ entered_at: r.entered_at, value_numeric: r.value_numeric, flag: r.flag }));
  }

  // ── Shift sessions (NABL QC gate) ────────────────────────────────
  /** Returns the active shift session, opening one if none exists. */
  async openOrGetShiftSession(): Promise<{
    id: string; staff_id: string; opened_at: string;
    qc_cleared_at: string | null; qc_overdue_snapshot: string[] | null;
    closed_at: string | null;
  } | null> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('lab_open_or_get_shift_session');
    if (error) throw error;
    return (data ?? null) as any;
  }

  /** Marks shift QC cleared. Throws if any analyzer is still overdue. */
  async clearShiftQc(): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('lab_clear_shift_qc');
    if (error) throw error;
  }

  /** Best-effort close of the open shift session (called on logout). */
  async closeShiftSession(): Promise<void> {
    try { await (this.supabase.client as any).rpc('lab_close_shift_session'); }
    catch { /* swallow — logout proceeds regardless */ }
  }

  /** Best-effort audit row written when lab_verify_order refuses (QC overdue,
   *  unacked criticals, missing values). The verify RPC itself can't write the
   *  audit row because RAISE EXCEPTION rolls back the transaction. */
  async logVerifyBlocked(orderId: string, reason: string, payload: Record<string, any> = {}): Promise<void> {
    try {
      await (this.supabase.client as any).rpc('lab_log_verify_blocked', {
        p_order_id: orderId, p_reason: reason, p_payload: payload,
      });
    } catch { /* swallow — never block UX on the audit hop */ }
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('lab-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_orders' },     () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_results' },    () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'radiology_slots' },() => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
