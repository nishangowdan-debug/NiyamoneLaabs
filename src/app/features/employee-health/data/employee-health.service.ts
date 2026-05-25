import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  EmployeeHealthCheck, EmployeeImmunization, ExposureStatus, ExposureType,
  FitnessStatus, HealthCheckType, ImmunizationStatus, OccupationalExposure,
} from './employee-health.types';

@Injectable({ providedIn: 'root' })
export class EmployeeHealthService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listStaff(): Promise<{ id: string; full_name: string; role_slug: string | null }[]> {
    const { data, error } = await this.db.from('staff')
      .select('id, full_name, role_slug')
      .eq('is_active', true).order('full_name').limit(2000);
    if (error) throw error;
    return data ?? [];
  }

  // ── Immunizations ─────────────────────────────────────────────
  async listImmunizations(staffId?: string): Promise<EmployeeImmunization[]> {
    let q = this.db.from('employee_immunizations').select('*').order('given_at', { ascending: false }).limit(2000);
    if (staffId) q = q.eq('staff_id', staffId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EmployeeImmunization[];
  }

  async recordImmunization(input: {
    staffId: string;
    vaccineName: string;
    status?: ImmunizationStatus;
    doseNumber?: number | null;
    totalDoses?: number | null;
    givenAt?: string | null;
    givenByName?: string | null;
    manufacturer?: string | null;
    batchNo?: string | null;
    expiryDate?: string | null;
    site?: string | null;
    route?: string | null;
    nextDoseDueAt?: string | null;
    vaccineCode?: string | null;
    reactionObserved?: boolean;
    reactionNotes?: string | null;
    refusalReason?: string | null;
    certificateNo?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('eh_record_immunization', {
      p_staff_id: input.staffId,
      p_vaccine_name: input.vaccineName,
      p_status: input.status ?? 'given',
      p_dose_number: input.doseNumber ?? null,
      p_total_doses: input.totalDoses ?? null,
      p_given_at: input.givenAt ?? null,
      p_given_by_name: input.givenByName ?? null,
      p_manufacturer: input.manufacturer ?? null,
      p_batch_no: input.batchNo ?? null,
      p_expiry_date: input.expiryDate ?? null,
      p_site: input.site ?? null,
      p_route: input.route ?? null,
      p_next_dose_due_at: input.nextDoseDueAt ?? null,
      p_vaccine_code: input.vaccineCode ?? null,
      p_reaction_observed: input.reactionObserved ?? false,
      p_reaction_notes: input.reactionNotes ?? null,
      p_refusal_reason: input.refusalReason ?? null,
      p_certificate_no: input.certificateNo ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  // ── Occupational Exposures ────────────────────────────────────
  async listExposures(opts: { status?: ExposureStatus; staffId?: string } = {}): Promise<OccupationalExposure[]> {
    let q = this.db.from('occupational_exposures').select('*').order('exposure_at', { ascending: false }).limit(500);
    if (opts.status)  q = q.eq('status', opts.status);
    if (opts.staffId) q = q.eq('staff_id', opts.staffId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as OccupationalExposure[];
  }

  async reportExposure(input: {
    staffId: string;
    exposureType: ExposureType;
    description: string;
    exposureAt?: string | null;
    location?: string | null;
    sourcePatientId?: string | null;
    sourceKnown?: boolean;
    deviceInvolved?: string | null;
    bodyPart?: string | null;
    ppeUsed?: string[];
    immediateAction?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('eh_report_exposure', {
      p_staff_id: input.staffId,
      p_exposure_type: input.exposureType,
      p_description: input.description,
      p_exposure_at: input.exposureAt ?? null,
      p_location: input.location ?? null,
      p_source_patient_id: input.sourcePatientId ?? null,
      p_source_known: input.sourceKnown ?? false,
      p_device_involved: input.deviceInvolved ?? null,
      p_body_part: input.bodyPart ?? null,
      p_ppe_used: input.ppeUsed ?? [],
      p_immediate_action: input.immediateAction ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async updateExposure(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('eh_update_exposure', { p_id: id, p_patch: patch });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Health Checks ─────────────────────────────────────────────
  async listChecks(staffId?: string): Promise<EmployeeHealthCheck[]> {
    let q = this.db.from('employee_health_checks').select('*').order('performed_at', { ascending: false }).limit(500);
    if (staffId) q = q.eq('staff_id', staffId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EmployeeHealthCheck[];
  }

  async recordHealthCheck(input: {
    staffId: string;
    checkType: HealthCheckType;
    performingDoctor: string;
    fitnessStatus?: FitnessStatus;
    performedAt?: string;
    heightCm?: number | null;
    weightKg?: number | null;
    bp?: string | null;
    pulse?: number | null;
    cbcSummary?: string | null;
    rftSummary?: string | null;
    lftSummary?: string | null;
    hbsag?: string | null;
    hcv?: string | null;
    hiv?: string | null;
    tbScreening?: string | null;
    ecg?: string | null;
    cxr?: string | null;
    restrictions?: string | null;
    recommendations?: string | null;
    nextDueDate?: string | null;
    certificateNo?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('eh_record_health_check', {
      p_staff_id: input.staffId,
      p_check_type: input.checkType,
      p_performing_doctor: input.performingDoctor,
      p_fitness_status: input.fitnessStatus ?? 'fit',
      p_performed_at: input.performedAt ?? null,
      p_height_cm: input.heightCm ?? null,
      p_weight_kg: input.weightKg ?? null,
      p_bp: input.bp ?? null,
      p_pulse: input.pulse ?? null,
      p_cbc_summary: input.cbcSummary ?? null,
      p_rft_summary: input.rftSummary ?? null,
      p_lft_summary: input.lftSummary ?? null,
      p_hbsag: input.hbsag ?? null,
      p_hcv: input.hcv ?? null,
      p_hiv: input.hiv ?? null,
      p_tb_screening: input.tbScreening ?? null,
      p_ecg: input.ecg ?? null,
      p_cxr: input.cxr ?? null,
      p_restrictions: input.restrictions ?? null,
      p_recommendations: input.recommendations ?? null,
      p_next_due_date: input.nextDueDate ?? null,
      p_certificate_no: input.certificateNo ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }
}
