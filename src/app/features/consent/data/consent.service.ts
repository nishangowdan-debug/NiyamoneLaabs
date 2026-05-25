import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ConsentForm, ConsentRow, ConsentSignerRelation, PatientConsent,
} from './consent.types';

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private supabase = inject(SupabaseService);

  // ── Templates ──────────────────────────────────────────────────────
  async listForms(): Promise<ConsentForm[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('consent_forms')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('title');
    if (error) throw error;
    return (data ?? []) as ConsentForm[];
  }

  async getFormByCode(code: string): Promise<ConsentForm | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('consent_forms')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as ConsentForm | null;
  }

  // ── Consents per patient ───────────────────────────────────────────
  async listForPatient(patientId: string): Promise<ConsentRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_consents')
      .select(`
        *,
        doctor:doctor_staff_id(id, full_name),
        witness:witness_staff_id(id, full_name),
        withdrawn_by:withdrawn_by_staff_id(id, full_name)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConsentRow[];
  }

  async listForAdmission(admissionId: string): Promise<ConsentRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_consents')
      .select(`
        *,
        doctor:doctor_staff_id(id, full_name),
        witness:witness_staff_id(id, full_name),
        withdrawn_by:withdrawn_by_staff_id(id, full_name)
      `)
      .eq('admission_id', admissionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConsentRow[];
  }

  /**
   * Phase D — read from the `patient_consents_effective` view so the caller gets
   * `effective_status` (auto-flipped to 'expired' when a time-scoped form is past
   * its validity window) and `valid_until` for display.
   */
  async listEffectiveForAdmission(admissionId: string): Promise<ConsentRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_consents_effective')
      .select('*')
      .eq('admission_id', admissionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConsentRow[];
  }

  async listEffectiveForPatient(patientId: string): Promise<ConsentRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_consents_effective')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConsentRow[];
  }

  async get(consentId: string): Promise<ConsentRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_consents')
      .select(`
        *,
        doctor:doctor_staff_id(id, full_name),
        witness:witness_staff_id(id, full_name),
        withdrawn_by:withdrawn_by_staff_id(id, full_name)
      `)
      .eq('id', consentId)
      .single();
    if (error) throw error;
    return data as ConsentRow;
  }

  // ── Workflow RPCs ─────────────────────────────────────────────────
  async createDraft(input: {
    patientId: string;
    formCode: string;
    encounterId?: string | null;
    admissionId?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    mergeData?: Record<string, string>;
    language?: string;
  }): Promise<PatientConsent> {
    const { data, error } = await (this.supabase.client as any).rpc('create_consent_record', {
      p_patient_id:          input.patientId,
      p_consent_form_code:   input.formCode,
      p_encounter_id:        input.encounterId ?? null,
      p_admission_id:        input.admissionId ?? null,
      p_related_entity_type: input.relatedEntityType ?? null,
      p_related_entity_id:   input.relatedEntityId ?? null,
      p_merge_data:          input.mergeData ?? {},
      p_language:            input.language ?? 'en',
    });
    if (error) throw new Error(error.message ?? 'Failed to create consent draft');
    return data as PatientConsent;
  }

  async sign(input: {
    consentId: string;
    patientSignature?: string | null;
    relativeName?: string | null;
    relativeRelation?: ConsentSignerRelation | null;
    relativeIdProof?: string | null;
    relativeSignature?: string | null;
    witnessStaffId?: string | null;
    doctorStaffId: string;
    notes?: string | null;
    /** Optional audit metadata captured by the consent-capture component at sign time. */
    userAgent?: string | null;
    device?: string | null;
    ipHint?: string | null;
    pdfHash?: string | null;
  }): Promise<PatientConsent> {
    const { data, error } = await (this.supabase.client as any).rpc('sign_consent', {
      p_consent_id:          input.consentId,
      p_patient_signature:   input.patientSignature  ?? null,
      p_relative_name:       input.relativeName      ?? null,
      p_relative_relation:   input.relativeRelation  ?? null,
      p_relative_id_proof:   input.relativeIdProof   ?? null,
      p_relative_signature:  input.relativeSignature ?? null,
      p_witness_staff_id:    input.witnessStaffId    ?? null,
      p_doctor_staff_id:     input.doctorStaffId,
      p_notes:               input.notes             ?? null,
      p_user_agent:          input.userAgent         ?? null,
      p_device:              input.device            ?? null,
      p_ip_hint:             input.ipHint            ?? null,
      p_pdf_hash:            input.pdfHash           ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to sign consent');
    return data as PatientConsent;
  }

  async withdraw(consentId: string, reason: string): Promise<PatientConsent> {
    const { data, error } = await (this.supabase.client as any).rpc('withdraw_consent', {
      p_consent_id: consentId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message ?? 'Failed to withdraw consent');
    return data as PatientConsent;
  }

  // ── OTP-verified consent ───────────────────────────────────────────
  /**
   * Generates a 6-digit OTP and "sends" it via the configured SMS provider.
   * In mock-mode (default), returns the plaintext OTP in the response so the
   * demo flow can verify without a real handset. When a real provider is
   * wired, mock_otp will be omitted from the payload.
   */
  async requestOtp(consentId: string, phone: string): Promise<{ mock_otp?: string; expires_at: string; sms_log_id: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('consent_otp_request', {
      p_consent_id: consentId,
      p_phone:      phone,
    });
    if (error) throw new Error(error.message ?? 'Failed to send OTP');
    return data as { mock_otp?: string; expires_at: string; sms_log_id: string };
  }

  async verifyOtp(consentId: string, otp: string): Promise<boolean> {
    const { data, error } = await (this.supabase.client as any).rpc('consent_otp_verify', {
      p_consent_id: consentId,
      p_otp:        otp,
    });
    if (error) throw new Error(error.message ?? 'Failed to verify OTP');
    return !!(data as any)?.verified;
  }

  async hasActive(patientId: string, formCode: string, admissionId?: string | null): Promise<boolean> {
    const { data, error } = await (this.supabase.client as any).rpc('has_active_consent', {
      p_patient_id: patientId,
      p_form_code: formCode,
      p_admission_id: admissionId ?? null,
    });
    if (error) throw error;
    return !!data;
  }
}
