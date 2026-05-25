import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  CodeBlueAction, CodeBlueActionType, CodeBlueEvent, CodeBlueOutcome,
  CodeBlueTeamMember, CodeBlueTeamRole, DnrDecisionBasis, DnrOrder, DnrOrderType,
} from './code-blue.types';

@Injectable({ providedIn: 'root' })
export class CodeBlueService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Code Blue ──────────────────────────────────────────────────
  async listEvents(opts: { onlyActive?: boolean; patientId?: string } = {}): Promise<CodeBlueEvent[]> {
    let q = this.db.from('code_blue_events').select('*').order('called_at', { ascending: false }).limit(500);
    if (opts.onlyActive) q = q.eq('outcome', 'in_progress');
    if (opts.patientId)  q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CodeBlueEvent[];
  }

  async getEvent(id: string): Promise<CodeBlueEvent> {
    const { data, error } = await this.db.from('code_blue_events').select('*').eq('id', id).single();
    if (error) throw error;
    return data as CodeBlueEvent;
  }

  async createEvent(input: {
    patientId?: string | null; admissionId?: string | null; encounterId?: string | null;
    wardId?: string | null; bedId?: string | null; locationText?: string | null;
    teamLeadDoctorId?: string | null; precipitatingEvent?: string | null;
    branchId?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('code_blue_create', {
      p_patient_id:   input.patientId ?? null,
      p_admission_id: input.admissionId ?? null,
      p_encounter_id: input.encounterId ?? null,
      p_ward_id:      input.wardId ?? null,
      p_bed_id:       input.bedId ?? null,
      p_location_text: input.locationText ?? null,
      p_team_lead_doctor_id: input.teamLeadDoctorId ?? null,
      p_precipitating_event: input.precipitatingEvent ?? null,
      p_branch_id:    input.branchId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create code blue event');
    return data as string;
  }

  async ackDnr(eventId: string, note: string): Promise<void> {
    const { error } = await this.db.rpc('code_blue_ack_dnr', { p_event_id: eventId, p_note: note });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async logAction(input: {
    eventId: string;
    actionType: CodeBlueActionType;
    details?: Record<string, unknown>;
    actionAt?: string;
    performerName?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('code_blue_log_action', {
      p_event_id: input.eventId,
      p_action_type: input.actionType,
      p_details: input.details ?? {},
      p_action_at: input.actionAt ?? null,
      p_performer_name: input.performerName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async listActions(eventId: string): Promise<CodeBlueAction[]> {
    const { data, error } = await this.db.from('code_blue_actions')
      .select('*').eq('event_id', eventId).order('action_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CodeBlueAction[];
  }

  async addMember(input: {
    eventId: string; staffName: string; role: CodeBlueTeamRole;
    staffId?: string | null; joinedAt?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('code_blue_add_member', {
      p_event_id: input.eventId, p_staff_name: input.staffName,
      p_role: input.role, p_staff_id: input.staffId ?? null,
      p_joined_at: input.joinedAt ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async listMembers(eventId: string): Promise<CodeBlueTeamMember[]> {
    const { data, error } = await this.db.from('code_blue_team')
      .select('*').eq('event_id', eventId).order('joined_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CodeBlueTeamMember[];
  }

  async setTiming(input: {
    eventId: string;
    arrivedAt?: string | null; cprStartedAt?: string | null;
    intubatedAt?: string | null; roscAt?: string | null;
    presentingRhythm?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('code_blue_set_timing', {
      p_event_id: input.eventId,
      p_arrived_at:     input.arrivedAt ?? null,
      p_cpr_started_at: input.cprStartedAt ?? null,
      p_intubated_at:   input.intubatedAt ?? null,
      p_rosc_at:        input.roscAt ?? null,
      p_presenting_rhythm: input.presentingRhythm ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async closeEvent(input: {
    eventId: string; outcome: CodeBlueOutcome;
    outcomeAt?: string; timeOfDeath?: string | null; debrief?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('code_blue_close', {
      p_event_id: input.eventId,
      p_outcome:  input.outcome,
      p_outcome_at: input.outcomeAt ?? null,
      p_time_of_death: input.timeOfDeath ?? null,
      p_debrief:  input.debrief ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── DNR ────────────────────────────────────────────────────────
  async listDnrOrders(opts: { patientId?: string; status?: string; admissionId?: string } = {}): Promise<DnrOrder[]> {
    let q = this.db.from('dnr_orders').select('*').order('created_at', { ascending: false }).limit(500);
    if (opts.patientId)   q = q.eq('patient_id', opts.patientId);
    if (opts.admissionId) q = q.eq('admission_id', opts.admissionId);
    if (opts.status)      q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DnrOrder[];
  }

  async hasActiveDnr(patientId: string, admissionId?: string | null): Promise<boolean> {
    const { data, error } = await this.db.rpc('has_active_dnr', {
      p_patient_id: patientId, p_admission_id: admissionId ?? null,
    });
    if (error) throw error;
    return !!data;
  }

  async createDnr(input: {
    patientId: string;
    orderType: DnrOrderType;
    decisionBasis: DnrDecisionBasis;
    clinicalBasis: string;
    admissionId?: string | null;
    authorizingDoctorId?: string | null;
    authorizingDoctorName?: string | null;
    familyDiscussionAt?: string | null;
    familyPresentNames?: string | null;
    consentId?: string | null;
    effectiveFrom?: string | null;
    effectiveUntil?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('dnr_create', {
      p_patient_id:    input.patientId,
      p_order_type:    input.orderType,
      p_decision_basis: input.decisionBasis,
      p_clinical_basis: input.clinicalBasis,
      p_admission_id:  input.admissionId ?? null,
      p_authorizing_doctor_id:   input.authorizingDoctorId ?? null,
      p_authorizing_doctor_name: input.authorizingDoctorName ?? null,
      p_family_discussion_at:    input.familyDiscussionAt ?? null,
      p_family_present_names:    input.familyPresentNames ?? null,
      p_consent_id:    input.consentId ?? null,
      p_effective_from: input.effectiveFrom ?? null,
      p_effective_until: input.effectiveUntil ?? null,
      p_notes:         input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to create DNR order');
    return data as string;
  }

  async revokeDnr(orderId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('dnr_revoke', { p_order_id: orderId, p_reason: reason });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
