import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CaseClassification, DiseaseNotification, DiseaseOutcome,
  IdspWeeklyRow, NotifiableDisease, NotificationStatus,
} from './idsp.types';

@Injectable({ providedIn: 'root' })
export class IdspService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listDiseases(): Promise<NotifiableDisease[]> {
    const { data, error } = await this.db.from('notifiable_diseases')
      .select('*').eq('is_active', true).order('priority').order('name');
    if (error) throw error;
    return (data ?? []) as NotifiableDisease[];
  }

  async listNotifications(opts: { status?: NotificationStatus; diseaseId?: string } = {}): Promise<DiseaseNotification[]> {
    let q = this.db.from('disease_notifications').select('*').order('onset_date', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.diseaseId) q = q.eq('disease_id', opts.diseaseId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DiseaseNotification[];
  }

  async weeklySummary(): Promise<IdspWeeklyRow[]> {
    const { data, error } = await this.db.from('v_idsp_weekly').select('*');
    if (error) throw error;
    return (data ?? []) as IdspWeeklyRow[];
  }

  async notify(input: {
    diseaseId: string;
    patientName: string;
    onsetDate: string;
    reportedByDoctorName: string;
    caseClassification?: CaseClassification;
    patientId?: string | null;
    admissionId?: string | null;
    patientAge?: number | null;
    patientGender?: 'male' | 'female' | 'other' | null;
    patientAddress?: string | null;
    patientDistrict?: string | null;
    patientPincode?: string | null;
    patientPhone?: string | null;
    symptoms?: string[];
    diagnosisDate?: string | null;
    diagnosisMethod?: string | null;
    laboratoryResults?: string | null;
    travelHistory?: string | null;
    contactHistory?: string | null;
    treatmentGiven?: string | null;
    reportingUnit?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('idsp_notify', {
      p_disease_id: input.diseaseId,
      p_patient_name: input.patientName,
      p_onset_date: input.onsetDate,
      p_reported_by_doctor_name: input.reportedByDoctorName,
      p_case_classification: input.caseClassification ?? 'suspected',
      p_patient_id: input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_patient_age: input.patientAge ?? null,
      p_patient_gender: input.patientGender ?? null,
      p_patient_address: input.patientAddress ?? null,
      p_patient_district: input.patientDistrict ?? null,
      p_patient_pincode: input.patientPincode ?? null,
      p_patient_phone: input.patientPhone ?? null,
      p_symptoms: input.symptoms ?? [],
      p_diagnosis_date: input.diagnosisDate ?? null,
      p_diagnosis_method: input.diagnosisMethod ?? null,
      p_laboratory_results: input.laboratoryResults ?? null,
      p_travel_history: input.travelHistory ?? null,
      p_contact_history: input.contactHistory ?? null,
      p_treatment_given: input.treatmentGiven ?? null,
      p_reporting_unit: input.reportingUnit ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async submitToIdsp(id: string, ackNo?: string): Promise<void> {
    const { error } = await this.db.rpc('idsp_submit', {
      p_id: id, p_idsp_acknowledgement_no: ackNo ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async updateOutcome(input: {
    id: string;
    outcome: DiseaseOutcome;
    outcomeDate?: string | null;
    dateOfDeath?: string | null;
    causeOfDeath?: string | null;
    classification?: CaseClassification | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('idsp_update_outcome', {
      p_id: input.id,
      p_outcome: input.outcome,
      p_outcome_date: input.outcomeDate ?? null,
      p_date_of_death: input.dateOfDeath ?? null,
      p_cause_of_death: input.causeOfDeath ?? null,
      p_classification: input.classification ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async close(id: string, notes?: string): Promise<void> {
    const { error } = await this.db.rpc('idsp_close', { p_id: id, p_notes: notes ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
