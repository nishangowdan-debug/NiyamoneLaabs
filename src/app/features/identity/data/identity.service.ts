import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CheckMethod, IdentityLookup, IdentityVerification, PatientWristband,
  VerificationContext, VerificationResult, WristbandStatus, WristbandType,
} from './identity.types';

@Injectable({ providedIn: 'root' })
export class IdentityService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listWristbands(opts: { activeOnly?: boolean; patientId?: string } = {}): Promise<PatientWristband[]> {
    let q = this.db.from('patient_wristbands').select('*').order('issued_at', { ascending: false }).limit(500);
    if (opts.activeOnly) q = q.eq('status', 'active');
    if (opts.patientId)  q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PatientWristband[];
  }

  async listVerifications(opts: { patientId?: string; result?: VerificationResult } = {}): Promise<IdentityVerification[]> {
    let q = this.db.from('identity_verifications').select('*').order('performed_at', { ascending: false }).limit(500);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    if (opts.result)    q = q.eq('result', opts.result);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as IdentityVerification[];
  }

  async issueWristband(input: {
    patientId: string;
    wristbandUid: string;
    wristbandType?: WristbandType;
    admissionId?: string | null;
    rfidTagId?: string | null;
    barcodeValue?: string | null;
    printedData?: string | null;
    issuedByName?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('wristband_issue', {
      p_patient_id: input.patientId,
      p_wristband_uid: input.wristbandUid,
      p_wristband_type: input.wristbandType ?? 'barcode',
      p_admission_id: input.admissionId ?? null,
      p_rfid_tag_id: input.rfidTagId ?? null,
      p_barcode_value: input.barcodeValue ?? null,
      p_printed_data: input.printedData ?? null,
      p_issued_by_name: input.issuedByName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async removeWristband(id: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('wristband_remove', { p_id: id, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async verify(input: {
    patientId: string;
    context: VerificationContext;
    method: CheckMethod;
    result?: VerificationResult;
    identifiersUsed?: string[];
    performedByName?: string | null;
    admissionId?: string | null;
    wristbandId?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    overrideReason?: string | null;
    mismatchDetails?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('identity_verify', {
      p_patient_id: input.patientId,
      p_context: input.context,
      p_method: input.method,
      p_result: input.result ?? 'confirmed',
      p_identifiers_used: input.identifiersUsed ?? [],
      p_performed_by_name: input.performedByName ?? null,
      p_admission_id: input.admissionId ?? null,
      p_wristband_id: input.wristbandId ?? null,
      p_related_entity_type: input.relatedEntityType ?? null,
      p_related_entity_id: input.relatedEntityId ?? null,
      p_override_reason: input.overrideReason ?? null,
      p_mismatch_details: input.mismatchDetails ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async lookup(scanValue: string): Promise<IdentityLookup | null> {
    const { data, error } = await this.db.rpc('identity_lookup', { p_scan_value: scanValue });
    if (error) throw error;
    return (data && data[0]) ? (data[0] as IdentityLookup) : null;
  }
}
