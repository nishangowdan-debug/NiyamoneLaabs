import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';

export type ConditionStatus =
  | 'cured' | 'relieved' | 'lama' | 'dama'
  | 'transferred' | 'referred' | 'deceased' | 'status_quo';

export interface DischargeSummaryFormData {
  admission_id: string;
  branch_id: string;
  presenting_complaint?: string | null;
  history_of_present_illness?: string | null;
  past_medical_history?: string | null;
  examination_findings?: string | null;
  course_in_hospital?: string | null;
  procedures_performed?: string | null;
  condition_at_discharge?: string | null;
  condition_status?: ConditionStatus | null;
  lama_witness_staff_id?: string | null;
  lama_disclaimer_acknowledged_at?: string | null;
  receiving_facility?: string | null;
  discharge_diagnosis_icd10?: string | null;
  secondary_diagnoses?: string[] | null;
  discharge_medications?: string | null;
  follow_up_instructions?: string | null;
  diet_advice?: string | null;
  activity_advice?: string | null;
  next_review_at?: string | null;
  key_investigation_lab_order_ids?: string[] | null;
  chief_complaint_summary?: string | null;
  investigations_summary?: string | null;
}

export interface TakeHomeMed {
  id?: string;
  admission_id: string;
  branch_id: string;
  drug_name: string;
  strength?: string | null;
  form?: string | null;
  route?: string | null;
  dose?: string | null;
  frequency?: string | null;
  duration_days?: number | null;
  is_continuous?: boolean;
  instructions?: string | null;
  is_external?: boolean;
  order_index?: number;
  prescribed_by_staff_id?: string | null;
}

export interface Icd10Hit {
  code: string; description: string; chapter: string | null;
  block: string | null; pmjay_package_code: string | null;
}

export interface DrugMasterHit {
  id: string; generic_name: string; brand_name: string | null;
  strength: string | null; form: string | null; route_default: string | null;
  schedule: string | null; is_essential: boolean;
}

export interface DischargeQueueItem {
  admission_id: string;
  uhid: string;
  patient_name: string;
  bed_code: string | null;
  ward_name: string | null;
  admitted_at: string;
  workflow_status: string;
  doctor_name: string | null;
  requested_at: string | null;
  handoff_at: string | null;
}

export interface FinalizeResult {
  admission_id: string;
  invoice_id: string;
  invoice_number: string;
  days: number;
  bed_total: number;
  pharmacy_total: number;
  visit_total: number;
  lab_total: number;
  radiology_total: number;
  subtotal: number;
  insurance: number;
  discount: number;
  grand_total: number;
}

@Injectable({ providedIn: 'root' })
export class DischargeBillingService {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  /** Admissions that are at any active stage of the discharge workflow. */
  async listQueue(): Promise<DischargeQueueItem[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('admissions')
      .select(`
        id, admitted_at, discharge_workflow_status, discharge_requested_at, discharge_handoff_at,
        patient:patient_id(uhid, full_name, first_name, last_name),
        doctor:attending_doctor_staff_id(full_name),
        bed:beds!current_admission_id(code, ward:ward_id(name))
      `)
      .in('discharge_workflow_status', ['requested','nurse_handoff','ready_for_billing','insurance_processing'])
      .order('discharge_requested_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      admission_id: r.id,
      uhid: r.patient?.uhid ?? '—',
      patient_name: r.patient?.full_name ?? `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim(),
      bed_code: r.bed?.[0]?.code ?? null,
      ward_name: r.bed?.[0]?.ward?.name ?? null,
      admitted_at: r.admitted_at,
      workflow_status: r.discharge_workflow_status,
      doctor_name: r.doctor?.full_name ?? null,
      requested_at: r.discharge_requested_at,
      handoff_at: r.discharge_handoff_at,
    }));
  }

  async getBundle(admissionId: string): Promise<any> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('discharge_summary_get', { p_admission_id: admissionId });
    if (error) throw error;
    return data;
  }

  async setInsuranceProcessing(admissionId: string, processing: boolean): Promise<void> {
    const next = processing ? 'insurance_processing' : 'ready_for_billing';
    const { error } = await (this.supabase.client as any)
      .from('admissions')
      .update({ discharge_workflow_status: next })
      .eq('id', admissionId);
    if (error) throw error;
  }

  async finalize(input: {
    admissionId: string;
    defaultBedRateRupees?: number;
    insuranceProvider?: string | null;
    insuranceClaimNumber?: string | null;
    insuranceClaimRupees?: number;
    discountRupees?: number;
    discountReason?: string | null;
  }): Promise<FinalizeResult> {
    const { data, error } = await (this.supabase.client as any).rpc('discharge_finalize', {
      p_admission_id: input.admissionId,
      p_default_bed_rate_cents: Math.round((input.defaultBedRateRupees ?? 1000) * 100),
      p_insurance_provider: input.insuranceProvider ?? null,
      p_insurance_claim_number: input.insuranceClaimNumber ?? null,
      p_insurance_claim_rupees: input.insuranceClaimRupees ?? 0,
      p_discount_rupees: input.discountRupees ?? 0,
      p_discount_reason: input.discountReason ?? null,
    });
    if (error) throw error;
    return data as FinalizeResult;
  }

  // ── Phase 3 — billing-staff workspace (line CRUD + payments) ─────
  /** All line items + payments for the running invoice of an admission. */
  async listInvoiceItems(invoiceId: string): Promise<{
    id: string; description: string; qty: number; unit_price_cents: number;
    discount_cents: number; total_cents: number; position: number;
    related_entity_type: string | null; is_voided: boolean; void_reason: string | null;
  }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('invoice_items')
      .select('id, description, qty, unit_price_cents, discount_cents, total_cents, position, related_entity_type, is_voided, void_reason')
      .eq('invoice_id', invoiceId)
      .order('position');
    if (error) throw error;
    return data ?? [];
  }

  async editItem(input: {
    itemId: string; description?: string; qty: number;
    unitPriceCents: number; discountCents?: number; reason?: string;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('bill_edit_item', {
      p_item_id:          input.itemId,
      p_description:      input.description ?? null,
      p_qty:              input.qty,
      p_unit_price_cents: input.unitPriceCents,
      p_discount_cents:   input.discountCents ?? 0,
      p_reason:           input.reason ?? null,
    });
    if (error) throw error;
  }

  async deleteItem(itemId: string, reason: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('bill_delete_item', {
      p_item_id: itemId, p_reason: reason,
    });
    if (error) throw error;
  }

  async addItem(input: {
    invoiceId: string; description: string; qty: number;
    unitPriceCents: number; discountCents?: number; reason?: string;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('bill_add_item', {
      p_invoice_id:       input.invoiceId,
      p_description:      input.description,
      p_qty:              input.qty,
      p_unit_price_cents: input.unitPriceCents,
      p_discount_cents:   input.discountCents ?? 0,
      p_reason:           input.reason ?? null,
    });
    if (error) throw error;
  }

  async recordPayment(input: {
    invoiceId: string; amountCents: number; method: string;
    reference?: string; notes?: string;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('bill_record_payment', {
      p_invoice_id:   input.invoiceId,
      p_amount_cents: input.amountCents,
      p_method:       input.method,
      p_reference:    input.reference ?? null,
      p_notes:        input.notes ?? null,
    });
    if (error) throw error;
  }

  /**
   * Reconciliation report — days where a doctor authored a note / prescribed /
   * ordered an investigation but no `doctor_visits` row exists. Surfaces gaps
   * billing staff should confirm before the patient pays.
   */
  async findUndocumentedVisits(admissionId: string): Promise<Array<{
    visit_date: string;
    doctor_staff_id: string;
    doctor_name: string;
    evidence_kinds: string[];
    evidence_count: number;
    evidence_summary: string;
    already_logged: boolean;
  }>> {
    const { data, error } = await (this.supabase.client as any).rpc('find_undocumented_doctor_visits', {
      p_admission_id: admissionId,
    });
    if (error) throw error;
    return (data ?? []) as any[];
  }

  /** Insert a doctor_visits row — Phase-1 trigger 1.3 will auto-bill it. */
  async logDoctorVisit(input: {
    admissionId: string;
    doctorStaffId: string;
    visitedAt: string;       // ISO
    visitType?: string;
    chargeRupees: number;
    notes?: string;
  }): Promise<void> {
    const { data: adm } = await (this.supabase.client as any)
      .from('admissions').select('branch_id').eq('id', input.admissionId).maybeSingle();
    const { error } = await (this.supabase.client as any)
      .from('doctor_visits')
      .insert({
        branch_id:        adm?.branch_id ?? null,
        admission_id:     input.admissionId,
        doctor_staff_id:  input.doctorStaffId,
        visited_at:       input.visitedAt,
        visit_type:       input.visitType ?? 'ward_round',
        charge_cents:     Math.round(input.chargeRupees * 100),
        notes:            input.notes ?? null,
      });
    if (error) throw error;
  }

  /** Repair tool: merge all draft/issued invoices for an admission into a single
   *  running IP-* invoice + re-link patient_ledger rows + soft-void duplicates.
   *  Reconciles `invoice.total = SUM(ledger)` after the run. */
  async consolidateInvoices(admissionId: string): Promise<{
    target_invoice_id: string;
    lines_consolidated: number;
    ledger_rows_relinked: number;
    orphan_lines_appended: number;
    invoices_voided: number;
    final_total: number;
  }> {
    const { data, error } = await (this.supabase.client as any).rpc('consolidate_admission_invoices', {
      p_admission_id: admissionId,
    });
    if (error) throw error;
    return data as any;
  }

  async listPayments(invoiceId: string): Promise<{
    id: string; amount_cents: number; method: string;
    reference: string | null; paid_at: string; notes: string | null;
  }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('payments')
      .select('id, amount_cents, method, reference, paid_at, notes')
      .eq('invoice_id', invoiceId)
      .eq('is_void', false)
      .order('paid_at');
    if (error) throw error;
    return data ?? [];
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client.channel('discharge-billing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admissions' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }

  // ── Phase 5 — discharge summary form persistence ────────────────────
  /** Upserts the structured discharge summary row. Caller is responsible for
   *  ensuring LAMA/DAMA payloads include witness + acknowledgement (the DB
   *  CHECK constraint will reject otherwise). */
  async saveDischargeSummary(payload: DischargeSummaryFormData): Promise<void> {
    const row = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (this.supabase.client as any)
      .from('discharge_summary_data')
      .upsert(row, { onConflict: 'admission_id' });
    if (error) throw error;
  }

  /** Doctor signs off — locks the summary out of DRAFT mode for printing. */
  async signDischargeSummary(admissionId: string): Promise<void> {
    const staffId = this.auth.staffId();
    const { error } = await (this.supabase.client as any)
      .from('discharge_summary_data')
      .update({
        signed_by: staffId,
        signed_at: new Date().toISOString(),
      })
      .eq('admission_id', admissionId);
    if (error) throw error;
  }

  // ── Take-home prescription pad (separate from IP medication_orders) ─
  async listTakeHomeMeds(admissionId: string): Promise<TakeHomeMed[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('discharge_take_home_meds')
      .select('*')
      .eq('admission_id', admissionId)
      .order('order_index', { ascending: true })
      .order('created_at',  { ascending: true });
    if (error) throw error;
    return (data ?? []) as TakeHomeMed[];
  }

  async addTakeHomeMed(med: Omit<TakeHomeMed, 'id'>): Promise<TakeHomeMed> {
    const row = {
      ...med,
      prescribed_by_staff_id: med.prescribed_by_staff_id ?? this.auth.staffId(),
    };
    const { data, error } = await (this.supabase.client as any)
      .from('discharge_take_home_meds')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data as TakeHomeMed;
  }

  async updateTakeHomeMed(id: string, fields: Partial<TakeHomeMed>): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('discharge_take_home_meds')
      .update(fields)
      .eq('id', id);
    if (error) throw error;
  }

  async deleteTakeHomeMed(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('discharge_take_home_meds')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ── Lookups for the form (typeahead) ────────────────────────────────
  async searchIcd10(query: string, limit = 12): Promise<Icd10Hit[]> {
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await (this.supabase.client as any)
      .from('icd10_codes')
      .select('code, description, chapter, block, pmjay_package_code')
      .or(`code.ilike.${q}%,description.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Icd10Hit[];
  }

  async searchDrugs(query: string, limit = 15): Promise<DrugMasterHit[]> {
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await (this.supabase.client as any)
      .from('drug_master')
      .select('id, generic_name, brand_name, strength, form, route_default, schedule, is_essential')
      .or(`generic_name.ilike.%${q}%,brand_name.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as DrugMasterHit[];
  }

  // ── Course-in-hospital deterministic stitcher ───────────────────────
  /** Walks flagged progress notes in date order, emits a structured draft.
   *  Doctor edits before signing — never used as authoritative output. */
  stitchCourseInHospital(
    flaggedNotes: Array<{ noted_at: string; assessment?: string | null;
                          plan?: string | null; body?: string | null;
                          author_name?: string | null }>,
    medsGivenDistinct: string[],
  ): string {
    const lines: string[] = [];
    for (const n of flaggedNotes) {
      const d = new Date(n.noted_at);
      const day = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const a = (n.assessment || '').trim();
      const p = (n.plan || '').trim();
      const b = (n.body || '').trim();
      const segments = [a, p, !a && !p ? b : ''].filter(Boolean);
      if (segments.length === 0) continue;
      lines.push(`${day}: ${segments.join(' — ')}`);
    }
    if (medsGivenDistinct.length) {
      lines.push('');
      lines.push(`Patient was managed with ${medsGivenDistinct.slice(0, 12).join(', ')}.`);
    }
    return lines.join('\n');
  }

  // ── Note flag toggle (for the daily charting checkbox) ──────────────
  async setNoteFlagForDischarge(noteId: string, flag: boolean): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('clinical_notes')
      .update({ flag_for_discharge_summary: flag })
      .eq('id', noteId);
    if (error) throw error;
  }
}
