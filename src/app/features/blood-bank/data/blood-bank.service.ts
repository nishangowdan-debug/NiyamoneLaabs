import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  BBInvoiceLine, BBStaffOption, BBWardOption,
  BloodComponent, BloodGroup, BloodRequest, BloodRequestState, BloodUnit, BloodUnitState,
  BBRequestPriority, CrossMatch, CrossmatchResult, Donation, Donor,
  InventorySummaryRow, TransfusionOutcome, TransfusionReaction, TransfusionRecord,
} from './blood-bank.types';

@Injectable({ providedIn: 'root' })
export class BloodBankService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Donors ─────────────────────────────────────────────────────
  async listDonors(opts: { activeOnly?: boolean; group?: BloodGroup } = {}): Promise<Donor[]> {
    let q = this.db.from('blood_bank_donors').select('*').order('created_at', { ascending: false });
    if (opts.activeOnly) q = q.eq('is_active', true);
    if (opts.group) q = q.eq('blood_group', opts.group);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Donor[];
  }

  async createDonor(d: Partial<Donor>): Promise<Donor> {
    const { data, error } = await this.db.from('blood_bank_donors').insert(d).select('*').single();
    if (error) throw error;
    return data as Donor;
  }

  async updateDonor(id: string, patch: Partial<Donor>): Promise<void> {
    const { error } = await this.db.from('blood_bank_donors').update(patch).eq('id', id);
    if (error) throw error;
  }

  // ── Donations ──────────────────────────────────────────────────
  async listDonations(donorId?: string): Promise<Donation[]> {
    let q = this.db.from('blood_donations').select('*').order('donated_at', { ascending: false });
    if (donorId) q = q.eq('donor_id', donorId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Donation[];
  }

  async recordDonation(input: {
    donorId: string;
    volumeMl: number;
    lotNumber?: string | null;
    preHb?: number | null;
    preBp?: string | null;
    prePulse?: number | null;
    components?: BloodComponent[];
    notes?: string | null;
  }): Promise<{ donation_id: string; unit_ids: string[] }> {
    const { data, error } = await this.db.rpc('bb_record_donation', {
      p_donor_id:    input.donorId,
      p_volume_ml:   input.volumeMl,
      p_lot_number:  input.lotNumber ?? null,
      p_pre_hb_g_dl: input.preHb ?? null,
      p_pre_bp:      input.preBp ?? null,
      p_pre_pulse:   input.prePulse ?? null,
      p_components:  input.components ?? ['whole_blood'],
      p_notes:       input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record donation');
    return data as { donation_id: string; unit_ids: string[] };
  }

  async screenDonation(input: {
    donationId: string;
    status: 'pending' | 'passed' | 'failed' | 'indeterminate';
    results?: Record<string, unknown>;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('bb_screen_donation', {
      p_donation_id: input.donationId,
      p_status:      input.status,
      p_results:     input.results ?? {},
      p_notes:       input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to screen donation');
  }

  // ── Units ──────────────────────────────────────────────────────
  async listUnits(opts: {
    state?: BloodUnitState | BloodUnitState[];
    group?: BloodGroup;
    component?: BloodComponent;
  } = {}): Promise<BloodUnit[]> {
    let q = this.db.from('blood_units').select('*').order('expires_at', { ascending: true });
    if (opts.state) {
      if (Array.isArray(opts.state)) q = q.in('state', opts.state);
      else q = q.eq('state', opts.state);
    }
    if (opts.group)     q = q.eq('blood_group', opts.group);
    if (opts.component) q = q.eq('component', opts.component);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BloodUnit[];
  }

  async releaseUnit(unitId: string, location?: string): Promise<void> {
    const { error } = await this.db.rpc('bb_release_unit', {
      p_unit_id: unitId, p_location: location ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to release unit');
  }

  async discardUnit(unitId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('bb_discard_unit', { p_unit_id: unitId, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed to discard unit');
  }

  async expireSweep(): Promise<number> {
    const { data, error } = await this.db.rpc('bb_expire_units');
    if (error) throw error;
    return (data as number) ?? 0;
  }

  async inventorySummary(): Promise<InventorySummaryRow[]> {
    const { data, error } = await this.db.from('v_blood_inventory_summary').select('*');
    if (error) throw error;
    return (data ?? []) as InventorySummaryRow[];
  }

  // ── Requests ───────────────────────────────────────────────────
  /**
   * Lists blood requests. When `branchId` is provided (or auto-resolved from
   * BranchStore in the page), the result is scoped to that branch via the
   * inner-join on patient.branch_id — prevents cross-branch leakage.
   */
  async listRequests(opts: { state?: BloodRequestState | BloodRequestState[]; patientId?: string; admissionId?: string; branchId?: string | null } = {}): Promise<BloodRequest[]> {
    let q: any = this.db.from('blood_requests')
      .select('*, patient:patient_id!inner(id, full_name, uhid, branch_id)')
      .order('created_at', { ascending: false });
    if (opts.state) {
      if (Array.isArray(opts.state)) q = q.in('state', opts.state);
      else q = q.eq('state', opts.state);
    }
    if (opts.patientId)   q = q.eq('patient_id', opts.patientId);
    if (opts.admissionId) q = q.eq('admission_id', opts.admissionId);
    if (opts.branchId)    q = q.eq('patient.branch_id', opts.branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BloodRequest[];
  }

  async getRequest(id: string): Promise<BloodRequest> {
    const { data, error } = await this.db.from('blood_requests').select('*').eq('id', id).single();
    if (error) throw error;
    return data as BloodRequest;
  }

  async createRequest(input: {
    patientId: string;
    component: BloodComponent;
    bloodGroup: BloodGroup;
    unitsRequired: number;
    priority?: BBRequestPriority;
    admissionId?: string | null;
    encounterId?: string | null;
    doctorId?: string | null;
    indication?: string | null;
    requiredBy?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('bb_create_request', {
      p_patient_id:     input.patientId,
      p_component:      input.component,
      p_blood_group:    input.bloodGroup,
      p_units_required: input.unitsRequired,
      p_priority:       input.priority ?? 'routine',
      p_admission_id:   input.admissionId ?? null,
      p_encounter_id:   input.encounterId ?? null,
      p_doctor_id:      input.doctorId ?? null,
      p_indication:     input.indication ?? null,
      p_required_by:    input.requiredBy ?? null,
      p_notes:          input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create blood request');
    return data as string;
  }

  async cancelRequest(requestId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('bb_cancel_request', { p_request_id: requestId, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed to cancel request');
  }

  // ── Reservations / cross-match / issue / transfusion ───────────
  async reserveUnit(requestId: string, unitId: string): Promise<void> {
    const { error } = await this.db.rpc('bb_reserve_unit', { p_request_id: requestId, p_unit_id: unitId });
    if (error) throw new Error(error.message ?? 'Failed to reserve unit');
  }

  async listCrossmatches(requestId: string): Promise<CrossMatch[]> {
    const { data, error } = await this.db.from('cross_match_records')
      .select('*').eq('request_id', requestId).order('performed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrossMatch[];
  }

  async recordCrossmatch(input: {
    requestId: string;
    unitId: string;
    result: CrossmatchResult;
    technique?: string;
    phase?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('bb_record_crossmatch', {
      p_request_id: input.requestId,
      p_unit_id:    input.unitId,
      p_result:     input.result,
      p_technique:  input.technique ?? 'gel',
      p_phase:      input.phase ?? null,
      p_notes:      input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record cross-match');
    return data as string;
  }

  async issueUnit(requestId: string, unitId: string): Promise<void> {
    const { error } = await this.db.rpc('bb_issue_unit', { p_request_id: requestId, p_unit_id: unitId });
    if (error) throw new Error(error.message ?? 'Failed to issue unit');
  }

  // ── Dispatch milestones (B3) ──────────────────────────────────
  async acknowledgeRequest(requestId: string): Promise<void> {
    const { error } = await this.db.rpc('bb_acknowledge_request', { p_request_id: requestId });
    if (error) throw new Error(error.message ?? 'Failed to acknowledge request');
  }

  async receiveSample(requestId: string): Promise<void> {
    const { error } = await this.db.rpc('bb_receive_sample', { p_request_id: requestId });
    if (error) throw new Error(error.message ?? 'Failed to mark sample received');
  }

  async dispatchUnit(input: {
    requestId: string;
    unitId: string;
    runnerStaffId: string;
    coldChainBoxId: string;
    targetWardId: string;
  }): Promise<void> {
    const { error } = await this.db.rpc('bb_dispatch_unit', {
      p_request_id:        input.requestId,
      p_unit_id:           input.unitId,
      p_runner_staff_id:   input.runnerStaffId,
      p_cold_chain_box_id: input.coldChainBoxId,
      p_target_ward_id:    input.targetWardId,
    });
    if (error) throw new Error(error.message ?? 'Failed to dispatch unit');
  }

  // ── Phase-1 bundled state-machine RPCs (request-level) ────────────
  /** Atomically reserves all chosen units + advances request → cross_matched. */
  async crossmatchComplete(requestId: string, unitIds: string[]): Promise<BloodRequest> {
    const { data, error } = await this.db.rpc('bb_crossmatch_complete', {
      p_request_id: requestId,
      p_unit_ids:   unitIds,
    });
    if (error) throw new Error(error.message ?? 'Failed to complete cross-match');
    return data as BloodRequest;
  }

  /** Flips all reserved units → issued + records cold-chain box id + sets SLA flag. */
  async issueUnits(requestId: string, coldChainBoxId?: string | null): Promise<BloodRequest> {
    const { data, error } = await this.db.rpc('bb_issue_units', {
      p_request_id:        requestId,
      p_cold_chain_box_id: coldChainBoxId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to issue units');
    return data as BloodRequest;
  }

  /** Stamps dispatched_at + runner; auto-derives ward from current bed if not given. */
  async requestDispatch(input: {
    requestId: string;
    runnerStaffId: string;
    targetWardId?: string | null;
  }): Promise<BloodRequest> {
    const { data, error } = await this.db.rpc('bb_dispatch', {
      p_request_id:        input.requestId,
      p_runner_staff_id:   input.runnerStaffId,
      p_target_ward_id:    input.targetWardId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to dispatch');
    return data as BloodRequest;
  }

  /** Two-person check passed at the ward end. */
  async requestWardReceive(requestId: string): Promise<BloodRequest> {
    const { data, error } = await this.db.rpc('bb_ward_receive', {
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message ?? 'Failed to confirm ward receipt');
    return data as BloodRequest;
  }

  async confirmWardReceipt(requestId: string, unitId: string): Promise<void> {
    const { error } = await this.db.rpc('bb_confirm_ward_receipt', {
      p_request_id: requestId, p_unit_id: unitId,
    });
    if (error) throw new Error(error.message ?? 'Failed to confirm ward receipt');
  }

  async listWards(): Promise<BBWardOption[]> {
    const { data, error } = await this.db.from('wards')
      .select('id, code, name').eq('is_active', true).order('code', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BBWardOption[];
  }

  async listStaff(): Promise<BBStaffOption[]> {
    const { data, error } = await this.db.from('staff')
      .select('id, full_name, role_slug').eq('is_active', true).order('full_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BBStaffOption[];
  }

  // ── Billing (B5) ──────────────────────────────────────────────
  async listChargesForRequest(requestId: string): Promise<BBInvoiceLine[]> {
    const { data, error } = await this.db.from('invoice_items')
      .select('id, invoice_id, description, qty, unit_price_cents, total_cents, invoice:invoice_id(invoice_number, status)')
      .eq('related_entity_type', 'blood_request')
      .eq('related_entity_id', requestId)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      description: r.description,
      qty: Number(r.qty),
      unit_price_cents: r.unit_price_cents,
      total_cents: r.total_cents,
      invoice_number: r.invoice?.invoice_number ?? null,
      invoice_status: r.invoice?.status ?? null,
    })) as BBInvoiceLine[];
  }

  async postCharges(requestId: string): Promise<string | null> {
    const { data, error } = await this.db.rpc('bb_post_charges', { p_request_id: requestId });
    if (error) throw new Error(error.message ?? 'Failed to post charges');
    return (data as string | null) ?? null;
  }

  async slaSweep(): Promise<{ warn_50: number; warn_80: number; breach_alerts: number; newly_breach_flag: number }> {
    const { data, error } = await this.db.rpc('bb_sla_sweep');
    if (error) throw new Error(error.message ?? 'Failed to run SLA sweep');
    return (data as any) ?? { warn_50: 0, warn_80: 0, breach_alerts: 0, newly_breach_flag: 0 };
  }

  async listTransfusions(opts: { requestId?: string; patientId?: string; admissionId?: string; branchId?: string | null } = {}): Promise<TransfusionRecord[]> {
    let q: any = this.db.from('transfusion_records')
      .select('*, patient:patient_id!inner(branch_id)')
      .order('started_at', { ascending: false });
    if (opts.requestId)   q = q.eq('request_id', opts.requestId);
    if (opts.patientId)   q = q.eq('patient_id', opts.patientId);
    if (opts.admissionId) q = q.eq('admission_id', opts.admissionId);
    if (opts.branchId)    q = q.eq('patient.branch_id', opts.branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TransfusionRecord[];
  }

  async getTransfusion(id: string): Promise<TransfusionRecord> {
    const { data, error } = await this.db.from('transfusion_records').select('*').eq('id', id).single();
    if (error) throw error;
    return data as TransfusionRecord;
  }

  async recordTransfusion(input: {
    requestId: string;
    unitId: string;
    startedAt: string;
    endedAt?: string | null;
    supervisingDoctor?: string | null;
    vitalsPre?: Record<string, unknown>;
    vitals15min?: Record<string, unknown> | null;
    vitalsPost?: Record<string, unknown> | null;
    reaction?: TransfusionReaction;
    reactionNotes?: string | null;
    outcome?: TransfusionOutcome;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('bb_record_transfusion', {
      p_request_id:        input.requestId,
      p_unit_id:           input.unitId,
      p_started_at:        input.startedAt,
      p_ended_at:          input.endedAt ?? null,
      p_supervising_doctor: input.supervisingDoctor ?? null,
      p_vitals_pre:        input.vitalsPre ?? {},
      p_vitals_15min:      input.vitals15min ?? null,
      p_vitals_post:       input.vitalsPost ?? null,
      p_reaction:          input.reaction ?? 'none',
      p_reaction_notes:    input.reactionNotes ?? null,
      p_outcome:           input.outcome ?? 'completed',
    });
    if (error) throw new Error(error.message ?? 'Failed to record transfusion');
    return data as string;
  }

  // ── Phase 2 lifecycle RPCs (multi-step run-sheet) ────────────────
  async transfusionStart(input: {
    requestId: string;
    unitId: string;
    supervisingDoctor: string;
    vitalsPre: Record<string, unknown>;
  }): Promise<TransfusionRecord> {
    const { data, error } = await this.db.rpc('bb_transfusion_start', {
      p_request_id:         input.requestId,
      p_unit_id:            input.unitId,
      p_supervising_doctor: input.supervisingDoctor,
      p_vitals_pre:         input.vitalsPre,
    });
    if (error) throw new Error(error.message ?? 'Failed to start transfusion');
    return data as TransfusionRecord;
  }

  async transfusionRecord15min(recordId: string, vitals15min: Record<string, unknown>): Promise<TransfusionRecord> {
    const { data, error } = await this.db.rpc('bb_transfusion_record_15min', {
      p_record_id:    recordId,
      p_vitals_15min: vitals15min,
    });
    if (error) throw new Error(error.message ?? 'Failed to record 15-min vitals');
    return data as TransfusionRecord;
  }

  async transfusionComplete(input: {
    recordId: string;
    vitalsPost: Record<string, unknown>;
    outcome: TransfusionOutcome;
    reaction?: TransfusionReaction;
    reactionNotes?: string | null;
  }): Promise<TransfusionRecord> {
    const { data, error } = await this.db.rpc('bb_transfusion_complete', {
      p_record_id:      input.recordId,
      p_vitals_post:    input.vitalsPost,
      p_outcome:        input.outcome,
      p_reaction:       input.reaction ?? 'none',
      p_reaction_notes: input.reactionNotes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to complete transfusion');
    return data as TransfusionRecord;
  }

  /** Find the in-progress (outcome IS NULL) transfusion record for a unit, if any. */
  async findOpenTransfusion(unitId: string): Promise<TransfusionRecord | null> {
    const { data, error } = await this.db
      .from('transfusion_records')
      .select('*')
      .eq('unit_id', unitId)
      .is('outcome', null)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as TransfusionRecord | null;
  }
}
