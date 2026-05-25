import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  InteractionSeverity,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../../../core/supabase/supabase.types';

export interface ConsultationContext {
  appointment: Tables<'appointments'> | null;
  patient: Tables<'patients'>;
  allergies: Tables<'patient_allergies'>[];
  latestVitals: Tables<'vitals'> | null;
  encounter: Tables<'encounters'>;
  prescriptionItems: Tables<'prescription_items'>[];
  prescription: Tables<'prescriptions'> | null;
}

@Injectable({ providedIn: 'root' })
export class ConsultationService {
  private supabase = inject(SupabaseService);

  /** Load a patient's consultation context. Creates a draft encounter + prescription if none exist. */
  async load(args: {
    appointmentId?: string;
    patientId?: string;
    branchId: string;
    doctorStaffId: string;
  }): Promise<ConsultationContext> {
    let appointment: Tables<'appointments'> | null = null;
    let patientId = args.patientId;

    if (args.appointmentId) {
      const { data, error } = await this.supabase.client
        .from('appointments')
        .select('*')
        .eq('id', args.appointmentId)
        .single();
      if (error) throw error;
      appointment = data;
      patientId = data.patient_id;
    }

    if (!patientId) throw new Error('No patient supplied for consultation.');

    const [patientResp, allergyResp, vitalsResp, encResp] = await Promise.all([
      this.supabase.client.from('patients').select('*').eq('id', patientId).single(),
      this.supabase.client
        .from('patient_allergies')
        .select('*')
        .eq('patient_id', patientId)
        .order('recorded_at', { ascending: false }),
      this.supabase.client
        .from('vitals')
        .select('*')
        .eq('patient_id', patientId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.findOrCreateEncounter({
        patientId,
        appointmentId: appointment?.id ?? null,
        branchId: args.branchId,
        doctorStaffId: args.doctorStaffId,
      }),
    ]);

    if (patientResp.error) throw patientResp.error;
    if (allergyResp.error) throw allergyResp.error;
    if (vitalsResp.error)  throw vitalsResp.error;

    const encounter = encResp;
    const rxResp = await this.findOrCreateActivePrescription({
      patientId,
      encounterId: encounter.id,
      branchId: args.branchId,
      doctorStaffId: args.doctorStaffId,
    });

    const itemsResp = await this.supabase.client
      .from('prescription_items')
      .select('*')
      .eq('prescription_id', rxResp.id)
      .order('position', { ascending: true });
    if (itemsResp.error) throw itemsResp.error;

    return {
      appointment,
      patient: patientResp.data,
      allergies: allergyResp.data ?? [],
      latestVitals: vitalsResp.data ?? null,
      encounter,
      prescription: rxResp,
      prescriptionItems: itemsResp.data ?? [],
    };
  }

  private async findOrCreateEncounter(args: {
    patientId: string;
    appointmentId: string | null;
    branchId: string;
    doctorStaffId: string;
  }): Promise<Tables<'encounters'>> {
    if (args.appointmentId) {
      const { data, error } = await this.supabase.client
        .from('encounters')
        .select('*')
        .eq('appointment_id', args.appointmentId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    }

    const insert: TablesInsert<'encounters'> = {
      patient_id: args.patientId,
      branch_id: args.branchId,
      doctor_staff_id: args.doctorStaffId,
      appointment_id: args.appointmentId,
      encounter_type: 'opd',
      status: 'draft',
    };
    const { data, error } = await this.supabase.client
      .from('encounters')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  private async findOrCreateActivePrescription(args: {
    patientId: string;
    encounterId: string;
    branchId: string;
    doctorStaffId: string;
  }): Promise<Tables<'prescriptions'>> {
    const { data: existing, error: e1 } = await this.supabase.client
      .from('prescriptions')
      .select('*')
      .eq('encounter_id', args.encounterId)
      .order('prescribed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;
    if (existing) return existing;

    const insert: TablesInsert<'prescriptions'> = {
      branch_id: args.branchId,
      patient_id: args.patientId,
      encounter_id: args.encounterId,
      prescribed_by_staff_id: args.doctorStaffId,
      status: 'draft',
    };
    const { data, error } = await this.supabase.client
      .from('prescriptions')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async updateEncounter(id: string, patch: TablesUpdate<'encounters'>): Promise<Tables<'encounters'>> {
    const { data, error } = await this.supabase.client
      .from('encounters')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async finaliseEncounter(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('encounters')
      .update({ status: 'finalised', ended_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async addVitals(input: TablesInsert<'vitals'>): Promise<Tables<'vitals'>> {
    const { data, error } = await this.supabase.client
      .from('vitals')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async addRxItem(input: TablesInsert<'prescription_items'>): Promise<Tables<'prescription_items'>> {
    const { data, error } = await this.supabase.client
      .from('prescription_items')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async removeRxItem(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('prescription_items').delete().eq('id', id);
    if (error) throw error;
  }

  async activatePrescription(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('prescriptions')
      .update({ status: 'active' })
      .eq('id', id);
    if (error) throw error;
  }

  /** Check pairwise interactions across the prescription. Returns flagged pairs. */
  async checkInteractions(drugs: string[]): Promise<{ a: string; b: string; severity: InteractionSeverity; message: string }[]> {
    const flags: { a: string; b: string; severity: InteractionSeverity; message: string }[] = [];
    for (let i = 0; i < drugs.length; i++) {
      for (let j = i + 1; j < drugs.length; j++) {
        const { data, error } = await this.supabase.client.rpc('check_drug_interaction', {
          d1: drugs[i]!, d2: drugs[j]!,
        });
        if (error) continue;
        for (const row of data ?? []) {
          flags.push({
            a: drugs[i]!,
            b: drugs[j]!,
            severity: row.severity,
            message: row.message,
          });
        }
      }
    }
    return flags;
  }
}
