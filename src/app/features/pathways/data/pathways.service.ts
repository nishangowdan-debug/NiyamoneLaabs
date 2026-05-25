import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ApplicationStatus, ClinicalPathway, PathwayApplication, StepInstance, StepStatus,
} from './pathways.types';

@Injectable({ providedIn: 'root' })
export class PathwaysService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listPathways(): Promise<ClinicalPathway[]> {
    const { data, error } = await this.db.from('clinical_pathways')
      .select('*').eq('is_active', true).order('category').order('name');
    if (error) throw error;
    return (data ?? []) as ClinicalPathway[];
  }

  async listApplications(opts: { status?: ApplicationStatus; patientId?: string } = {}): Promise<PathwayApplication[]> {
    let q = this.db.from('pathway_applications').select('*').order('applied_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PathwayApplication[];
  }

  async listSteps(applicationId: string): Promise<StepInstance[]> {
    const { data, error } = await this.db.from('pathway_step_instances')
      .select('*').eq('application_id', applicationId).order('step_order');
    if (error) throw error;
    return (data ?? []) as StepInstance[];
  }

  async apply(input: {
    pathwayId: string;
    patientId: string;
    admissionId?: string | null;
    encounterId?: string | null;
    edVisitId?: string | null;
    triggeredByDoctorName?: string | null;
    triggerReason?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('pathway_apply', {
      p_pathway_id: input.pathwayId,
      p_patient_id: input.patientId,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_ed_visit_id: input.edVisitId ?? null,
      p_triggered_by_doctor_name: input.triggeredByDoctorName ?? null,
      p_trigger_reason: input.triggerReason ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async completeStep(input: {
    stepId: string;
    status: StepStatus;
    completedByName?: string | null;
    skippedReason?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('pathway_step_complete', {
      p_step_id: input.stepId,
      p_status: input.status,
      p_completed_by_name: input.completedByName ?? null,
      p_skipped_reason: input.skippedReason ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async close(applicationId: string, status: ApplicationStatus, reason?: string): Promise<void> {
    const { error } = await this.db.rpc('pathway_close', {
      p_application_id: applicationId, p_status: status, p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
