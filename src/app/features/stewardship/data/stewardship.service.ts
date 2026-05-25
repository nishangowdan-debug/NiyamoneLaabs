import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  AntibioticClass, Recommendation, ReviewStatus, StewardshipAntibiotic,
  StewardshipReview, StewardshipUsageRow,
} from './stewardship.types';

@Injectable({ providedIn: 'root' })
export class StewardshipService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listAntibiotics(): Promise<StewardshipAntibiotic[]> {
    const { data, error } = await this.db.from('stewardship_antibiotics')
      .select('*').eq('is_active', true).order('who_aware_class').order('generic_name');
    if (error) throw error;
    return (data ?? []) as StewardshipAntibiotic[];
  }

  async listReviews(opts: { status?: ReviewStatus; patientId?: string } = {}): Promise<StewardshipReview[]> {
    let q = this.db.from('stewardship_reviews').select('*').order('prescribed_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as StewardshipReview[];
  }

  async usage(): Promise<StewardshipUsageRow[]> {
    const { data, error } = await this.db.from('v_stewardship_usage').select('*').limit(200);
    if (error) throw error;
    return (data ?? []) as StewardshipUsageRow[];
  }

  async flag(input: {
    patientId: string;
    drugName: string;
    prescribedByDoctorName: string;
    indication: string;
    admissionId?: string | null;
    encounterId?: string | null;
    prescriptionId?: string | null;
    dose?: string | null;
    route?: string | null;
    frequency?: string | null;
    durationDays?: number | null;
    empiricalOrTargeted?: 'empirical' | 'targeted';
    cultureSent?: boolean;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('stewardship_flag_prescription', {
      p_patient_id: input.patientId,
      p_drug_name: input.drugName,
      p_prescribed_by_doctor_name: input.prescribedByDoctorName,
      p_indication: input.indication,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_prescription_id: input.prescriptionId ?? null,
      p_dose: input.dose ?? null,
      p_route: input.route ?? null,
      p_frequency: input.frequency ?? null,
      p_duration_days: input.durationDays ?? null,
      p_empirical_or_targeted: input.empiricalOrTargeted ?? 'empirical',
      p_culture_sent: input.cultureSent ?? false,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async review(input: {
    id: string;
    recommendation: Recommendation;
    status?: ReviewStatus;
    reviewedByName?: string | null;
    notes?: string | null;
    modifiedDrug?: string | null;
    modifiedDose?: string | null;
    modifiedDurationDays?: number | null;
    escalatedTo?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('stewardship_review', {
      p_id: input.id,
      p_recommendation: input.recommendation,
      p_status: input.status ?? 'approved',
      p_reviewed_by_name: input.reviewedByName ?? null,
      p_recommendation_notes: input.notes ?? null,
      p_modified_drug: input.modifiedDrug ?? null,
      p_modified_dose: input.modifiedDose ?? null,
      p_modified_duration_days: input.modifiedDurationDays ?? null,
      p_escalated_to: input.escalatedTo ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
