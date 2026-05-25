import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  AuthRequestType, AuthStatus, InsuranceAuthorization, InsurancePayer, PayerType, SponsorRelation,
} from './insurance-auth.types';

@Injectable({ providedIn: 'root' })
export class InsuranceAuthService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Payers ────────────────────────────────────────────────────
  async listPayers(activeOnly = true): Promise<InsurancePayer[]> {
    let q = this.db.from('insurance_payers').select('*').order('name');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as InsurancePayer[];
  }
  async createPayer(p: Partial<InsurancePayer>): Promise<InsurancePayer> {
    const { data, error } = await this.db.from('insurance_payers').insert(p).select('*').single();
    if (error) throw error;
    return data as InsurancePayer;
  }
  async updatePayer(id: string, patch: Partial<InsurancePayer>): Promise<void> {
    const { error } = await this.db.from('insurance_payers').update(patch).eq('id', id);
    if (error) throw error;
  }

  // ── Authorizations ────────────────────────────────────────────
  async list(opts: { status?: AuthStatus; patientId?: string } = {}): Promise<InsuranceAuthorization[]> {
    let q = this.db.from('insurance_authorizations').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as InsuranceAuthorization[];
  }

  async create(input: {
    patientId: string;
    payerId: string;
    insurancePolicyNo: string;
    provisionalDiagnosis: string;
    estimatedCostCents: number;
    admissionId?: string | null;
    encounterId?: string | null;
    memberId?: string | null;
    cardNo?: string | null;
    sponsorRelation?: SponsorRelation;
    sponsorName?: string | null;
    employerName?: string | null;
    treatmentPlan?: string | null;
    estimatedLosDays?: number | null;
    icd10Codes?: string[];
    documentsAttached?: string[];
    requestType?: AuthRequestType;
    parentAuthorizationId?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('auth_create', {
      p_patient_id: input.patientId,
      p_payer_id: input.payerId,
      p_insurance_policy_no: input.insurancePolicyNo,
      p_provisional_diagnosis: input.provisionalDiagnosis,
      p_estimated_cost_cents: input.estimatedCostCents,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_member_id: input.memberId ?? null,
      p_card_no: input.cardNo ?? null,
      p_sponsor_relation: input.sponsorRelation ?? 'self',
      p_sponsor_name: input.sponsorName ?? null,
      p_employer_name: input.employerName ?? null,
      p_treatment_plan: input.treatmentPlan ?? null,
      p_estimated_los_days: input.estimatedLosDays ?? null,
      p_icd10_codes: input.icd10Codes ?? [],
      p_documents_attached: input.documentsAttached ?? [],
      p_request_type: input.requestType ?? 'initial',
      p_parent_authorization_id: input.parentAuthorizationId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create authorization');
    return data as string;
  }

  async submit(id: string, tpaRef?: string, insurerRef?: string): Promise<void> {
    const { error } = await this.db.rpc('auth_submit', {
      p_id: id,
      p_tpa_ref_no: tpaRef ?? null,
      p_insurer_ref_no: insurerRef ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async recordResponse(input: {
    id: string;
    status: 'approved' | 'partial_approved' | 'rejected' | 'queried';
    approvedAmountCents?: number | null;
    approvalValidUntil?: string | null;
    rejectionReason?: string | null;
    queryText?: string | null;
    tpaRef?: string | null;
    insurerRef?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('auth_record_response', {
      p_id: input.id,
      p_status: input.status,
      p_approved_amount_cents: input.approvedAmountCents ?? null,
      p_approval_valid_until: input.approvalValidUntil ?? null,
      p_rejection_reason: input.rejectionReason ?? null,
      p_query_text: input.queryText ?? null,
      p_tpa_ref_no: input.tpaRef ?? null,
      p_insurer_ref_no: input.insurerRef ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async recordSettlement(input: {
    id: string;
    finalBillCents: number;
    settledAmountCents: number;
    settlementUtr?: string | null;
    copayCents?: number;
    patientPayableCents?: number;
    settledAt?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('auth_record_settlement', {
      p_id: input.id,
      p_final_bill_cents: input.finalBillCents,
      p_settled_amount_cents: input.settledAmountCents,
      p_settlement_utr: input.settlementUtr ?? null,
      p_copay_cents: input.copayCents ?? 0,
      p_patient_payable_cents: input.patientPayableCents ?? 0,
      p_settled_at: input.settledAt ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async cancel(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('auth_cancel', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
