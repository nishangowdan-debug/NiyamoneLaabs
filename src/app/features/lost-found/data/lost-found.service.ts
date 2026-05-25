import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { LfItemType, LfStatus, LostFoundItem } from './lost-found.types';

@Injectable({ providedIn: 'root' })
export class LostFoundService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async list(opts: { status?: LfStatus } = {}): Promise<LostFoundItem[]> {
    let q = this.db.from('lost_and_found').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as LostFoundItem[];
  }

  async logFound(input: {
    itemType: LfItemType;
    description: string;
    foundLocation: string;
    foundByName?: string | null;
    brandOrMake?: string | null;
    identifyingMarks?: string | null;
    estimatedValueCents?: number | null;
    storageLocation?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('lf_log_found', {
      p_item_type: input.itemType,
      p_description: input.description,
      p_found_location: input.foundLocation,
      p_found_by_name: input.foundByName ?? null,
      p_brand_or_make: input.brandOrMake ?? null,
      p_identifying_marks: input.identifyingMarks ?? null,
      p_estimated_value_cents: input.estimatedValueCents ?? null,
      p_storage_location: input.storageLocation ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async logLostReport(input: {
    itemType: LfItemType;
    description: string;
    lostLocation: string;
    reportedByName: string;
    reportedByPhone?: string | null;
    reportedByEmail?: string | null;
    reportedByRelation?: string | null;
    reportedByPatientId?: string | null;
    reportedByAdmissionId?: string | null;
    brandOrMake?: string | null;
    identifyingMarks?: string | null;
    estimatedValueCents?: number | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('lf_log_lost_report', {
      p_item_type: input.itemType,
      p_description: input.description,
      p_lost_location: input.lostLocation,
      p_reported_by_name: input.reportedByName,
      p_reported_by_phone: input.reportedByPhone ?? null,
      p_reported_by_email: input.reportedByEmail ?? null,
      p_reported_by_relation: input.reportedByRelation ?? null,
      p_reported_by_patient_id: input.reportedByPatientId ?? null,
      p_reported_by_admission_id: input.reportedByAdmissionId ?? null,
      p_brand_or_make: input.brandOrMake ?? null,
      p_identifying_marks: input.identifyingMarks ?? null,
      p_estimated_value_cents: input.estimatedValueCents ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async match(foundId: string, lostId: string): Promise<void> {
    const { error } = await this.db.rpc('lf_match', { p_found_id: foundId, p_lost_id: lostId });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async claim(input: {
    id: string;
    claimedByName: string;
    claimedByPhone?: string | null;
    claimedByIdProof?: string | null;
    claimedByIdNumber: string;
    claimWitnessName?: string | null;
    claimWitnessSignature?: string | null;
    releasedByName?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('lf_claim', {
      p_id: input.id,
      p_claimed_by_name: input.claimedByName,
      p_claimed_by_phone: input.claimedByPhone ?? null,
      p_claimed_by_id_proof: input.claimedByIdProof ?? null,
      p_claimed_by_id_number: input.claimedByIdNumber,
      p_claim_witness_name: input.claimWitnessName ?? null,
      p_claim_witness_signature: input.claimWitnessSignature ?? null,
      p_released_by_name: input.releasedByName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async dispose(input: {
    id: string;
    method: 'destroyed' | 'donated' | 'auctioned' | 'handed_to_police';
    authorizedBy: string;
    policeStation?: string | null;
    firNo?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('lf_dispose', {
      p_id: input.id, p_method: input.method, p_authorized_by: input.authorizedBy,
      p_police_station: input.policeStation ?? null, p_fir_no: input.firNo ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
