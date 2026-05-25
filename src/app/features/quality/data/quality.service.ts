import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ActiveAdmissionLite, AdmissionOutcome, DeviceType, DeviceUsageRow,
  InfectionRow, InfectionSource, InfectionType, QualityMetrics, RiskGroup,
} from './quality.types';

@Injectable({ providedIn: 'root' })
export class QualityService {
  private supabase = inject(SupabaseService);

  async metrics(from: string, to: string): Promise<QualityMetrics> {
    const { data, error } = await (this.supabase.client as any).rpc('quality_metrics', { p_from: from, p_to: to });
    if (error) throw error;
    return data as QualityMetrics;
  }

  async listAdmissions(): Promise<ActiveAdmissionLite[]> {
    // Active or recently discharged (last 30d) — useful candidates for logging events.
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const { data, error } = await (this.supabase.client as any)
      .from('admissions')
      .select(`id, patient_id, admitted_at, primary_diagnosis_icd10, risk_group, outcome, status,
               patient:patient_id(id, uhid, full_name, first_name, last_name)`)
      .gte('admitted_at', cutoff.toISOString())
      .order('admitted_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      id: r.id, patient_id: r.patient_id,
      patient_name: r.patient?.full_name ?? `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim(),
      uhid: r.patient?.uhid ?? '—',
      admitted_at: r.admitted_at,
      primary_diagnosis_icd10: r.primary_diagnosis_icd10,
      risk_group: r.risk_group, outcome: r.outcome, status: r.status,
    }));
  }

  async recentInfections(limit = 10): Promise<(InfectionRow & { patient_name?: string; uhid?: string })[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('infections')
      .select(`*, patient:patient_id(uhid, full_name, first_name, last_name)`)
      .order('infection_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      ...r,
      patient_name: r.patient?.full_name ?? `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim(),
      uhid: r.patient?.uhid,
    }));
  }

  async activeDevices(): Promise<(DeviceUsageRow & { patient_name?: string; uhid?: string })[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('device_usage')
      .select(`*, patient:patient_id(uhid, full_name, first_name, last_name)`)
      .is('end_at', null)
      .order('start_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      ...r,
      patient_name: r.patient?.full_name ?? `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim(),
      uhid: r.patient?.uhid,
    }));
  }

  async recordInfection(input: {
    patientId: string; admissionId?: string | null;
    type: InfectionType; date: string;
    source: InfectionSource; deviceUsed?: string | null;
    organism?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('record_infection', {
      p_patient_id:     input.patientId,
      p_admission_id:   input.admissionId ?? null,
      p_infection_type: input.type,
      p_infection_date: input.date,
      p_source:         input.source,
      p_device_used:    input.deviceUsed ?? null,
      p_organism:       input.organism ?? null,
      p_notes:          input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async startDevice(input: {
    patientId: string; admissionId?: string | null;
    deviceType: DeviceType; site?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('start_device', {
      p_patient_id:   input.patientId,
      p_admission_id: input.admissionId ?? null,
      p_device_type:  input.deviceType,
      p_site:         input.site ?? null,
      p_notes:        input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async endDevice(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('end_device', { p_id: id });
    if (error) throw error;
  }

  async markOutcome(input: {
    admissionId: string;
    outcome: AdmissionOutcome;
    dateOfDeath?: string | null;
    dischargeType?: string | null;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('mark_admission_outcome', {
      p_admission_id:   input.admissionId,
      p_outcome:        input.outcome,
      p_date_of_death:  input.dateOfDeath ?? null,
      p_discharge_type: input.dischargeType ?? null,
    });
    if (error) throw error;
  }

  /** Update admission risk fields (severity, ICD-10, risk_group, comorbidities). */
  async updateAdmissionRisk(input: {
    admissionId: string;
    severityScore?: number | null;
    severityScale?: 'apache_ii'|'sofa'|'gcs'|'news2'|'other' | null;
    primaryDiagnosisIcd10?: string | null;
    riskGroup?: RiskGroup;
    comorbidities?: string[];
  }): Promise<void> {
    const patch: any = {};
    if (input.severityScore !== undefined) patch.severity_score = input.severityScore;
    if (input.severityScale !== undefined) patch.severity_scale = input.severityScale;
    if (input.primaryDiagnosisIcd10 !== undefined) patch.primary_diagnosis_icd10 = input.primaryDiagnosisIcd10;
    if (input.riskGroup) patch.risk_group = input.riskGroup;
    if (input.comorbidities) patch.comorbidities = input.comorbidities;
    const { error } = await (this.supabase.client as any)
      .from('admissions').update(patch).eq('id', input.admissionId);
    if (error) throw error;
  }

  async listIcd10Reference(): Promise<{ icd10_code: string; diagnosis_label: string; risk_group: RiskGroup; expected_mortality_pct: number }[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('mortality_risk_reference')
      .select('icd10_code, diagnosis_label, risk_group, expected_mortality_pct')
      .order('icd10_code');
    if (error) throw error;
    return (data ?? []) as any;
  }
}
