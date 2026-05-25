// Front-end types for the patient_consents module.
// These mirror the DB schema; we keep them as plain interfaces because the
// generated Supabase types haven't been regenerated for these new tables yet.

export type ConsentStatus = 'draft' | 'signed' | 'withdrawn' | 'expired' | 'superseded';

export type ConsentSignerRelation =
  | 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'guardian' | 'other';

export type ConsentValidityScope = 'admission' | 'encounter' | 'event' | 'time' | 'lifetime';

export interface ConsentForm {
  id: string;
  code: string;
  title: string;
  category: string | null;
  body_template: string;
  language: string;
  version: number;
  requires_witness: boolean;
  requires_relative: boolean;
  retention_years: number;
  is_active: boolean;
  /** Phase D — when does a signed consent stop being valid? */
  validity_scope: ConsentValidityScope;
  /** Phase D — used only when validity_scope='time'. NULL otherwise. */
  validity_days: number | null;
  /** When true, the consent capture flow must include an OTP step against the
   *  relative's phone before the signature is accepted. */
  requires_otp: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientConsent {
  id: string;
  branch_id: string;
  patient_id: string;
  encounter_id: string | null;
  admission_id: string | null;
  consent_form_id: string;
  consent_form_code: string;
  consent_form_version: number;

  related_entity_type: string | null;
  related_entity_id: string | null;

  rendered_body: string;
  language: string;

  patient_name_at_signing: string;
  patient_signature: string | null;        // data:image/png;base64,…
  patient_signed_at: string | null;

  relative_name: string | null;
  relative_relation: ConsentSignerRelation | null;
  relative_signature: string | null;
  relative_signed_at: string | null;
  relative_id_proof: string | null;

  doctor_staff_id: string | null;
  doctor_signed_at: string | null;
  witness_staff_id: string | null;
  witness_signed_at: string | null;

  status: ConsentStatus;
  withdrawn_at: string | null;
  withdrawn_by_staff_id: string | null;
  withdrawn_reason: string | null;
  superseded_by_id: string | null;

  pdf_url: string | null;
  notes: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
  // Phase: medico-legal audit metadata captured at sign time
  signed_user_agent?: string | null;
  signed_device?: string | null;
  signed_ip_hint?: string | null;
  pdf_hash?: string | null;
  // Phase D — only present when row was fetched from patient_consents_effective view
  validity_scope?: ConsentValidityScope;
  validity_days?: number | null;
  valid_until?: string | null;
  effective_status?: ConsentStatus;
}

/** Joined view: consent with related staff names — used in lists. */
export interface ConsentRow extends PatientConsent {
  doctor: { id: string; full_name: string } | null;
  witness: { id: string; full_name: string } | null;
  withdrawn_by: { id: string; full_name: string } | null;
}
