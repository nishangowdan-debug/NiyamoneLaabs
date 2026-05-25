import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ActiveAdmission, ClinicalNote, DischargeBundle, DoctorVisit, IoEntry, LedgerSummary,
  MarRecord, MarStatus, MedicationOrder, NoteType, PharmacyIndent,
} from './nursing.types';

@Injectable({ providedIn: 'root' })
export class NursingService {
  private supabase = inject(SupabaseService);

  /** Active admissions with patient + bed info, for the picker. */
  async listActiveAdmissions(): Promise<ActiveAdmission[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('admissions')
      .select(`id, patient_id, admitted_at, primary_diagnosis_icd10,
               patient:patient_id(uhid, full_name, first_name, last_name),
               bed:beds!current_admission_id(code, ward:ward_id(name))`)
      .eq('status', 'active')
      .order('admitted_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      id: r.id, patient_id: r.patient_id,
      patient_name: r.patient?.full_name ?? `${r.patient?.first_name ?? ''} ${r.patient?.last_name ?? ''}`.trim(),
      uhid: r.patient?.uhid ?? '—',
      admitted_at: r.admitted_at,
      primary_diagnosis_icd10: r.primary_diagnosis_icd10,
      ward_name: r.bed?.[0]?.ward?.name ?? null,
      bed_code:  r.bed?.[0]?.code ?? null,
    }));
  }

  // ── Medication orders + MAR ───────────────────────────────────
  async listMedicationOrders(admissionId: string): Promise<MedicationOrder[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('medication_orders').select('*')
      .eq('admission_id', admissionId).order('prescribed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MedicationOrder[];
  }

  async listMar(admissionId: string): Promise<MarRecord[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('mar_records').select('*')
      .eq('admission_id', admissionId).order('scheduled_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MarRecord[];
  }

  async createOrder(input: {
    admissionId: string; drugName: string; strength?: string | null;
    form?: string | null; route?: string | null; dose: string;
    frequency: string; durationDays: number;
    unitPriceRupees?: number; startAt?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('medication_order_create', {
      p_admission_id: input.admissionId,
      p_drug_name: input.drugName,
      p_strength: input.strength ?? null,
      p_form: input.form ?? null,
      p_route: input.route ?? null,
      p_dose: input.dose,
      p_frequency: input.frequency,
      p_duration_days: input.durationDays,
      p_unit_price_cents: Math.round((input.unitPriceRupees ?? 0) * 100),
      p_start_at: input.startAt ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async marDose(input: { id: string; status: MarStatus; reason?: string | null; notes?: string | null }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('mar_record_dose', {
      p_mar_id: input.id, p_status: input.status,
      p_reason: input.reason ?? null, p_notes: input.notes ?? null,
    });
    if (error) throw error;
  }

  // ── I/O ───────────────────────────────────────────────────────
  async listIo(admissionId: string): Promise<IoEntry[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('io_charts').select('*')
      .eq('admission_id', admissionId).order('recorded_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []) as IoEntry[];
  }

  async ioRecord(input: {
    admissionId: string; direction: 'intake' | 'output'; category: string;
    volumeMl: number; recordedAt?: string | null; notes?: string | null;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('io_record', {
      p_admission_id: input.admissionId, p_direction: input.direction,
      p_category: input.category, p_volume_ml: input.volumeMl,
      p_recorded_at: input.recordedAt ?? null, p_notes: input.notes ?? null,
    });
    if (error) throw error;
  }

  // ── Notes ─────────────────────────────────────────────────────
  async listNotes(admissionId: string): Promise<ClinicalNote[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('clinical_notes').select('*')
      .eq('admission_id', admissionId).order('noted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ClinicalNote[];
  }

  async saveNote(input: {
    admissionId: string; noteType: NoteType;
    subjective?: string | null; objective?: string | null;
    assessment?: string | null; plan?: string | null;
    body?: string | null; diagnosisIcd10?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('clinical_note_save', {
      p_admission_id: input.admissionId, p_encounter_id: null,
      p_note_type: input.noteType,
      p_subjective: input.subjective ?? null, p_objective: input.objective ?? null,
      p_assessment: input.assessment ?? null, p_plan: input.plan ?? null,
      p_body: input.body ?? null, p_diagnosis_icd10: input.diagnosisIcd10 ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Mark/unmark a clinical note as a milestone the discharge-summary stitcher
   *  should pick up. Keeps daily progress notes out of the take-home document
   *  unless the doctor explicitly opts a note in. */
  async setNoteFlagForDischarge(noteId: string, flag: boolean): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('clinical_notes')
      .update({ flag_for_discharge_summary: flag })
      .eq('id', noteId);
    if (error) throw error;
  }

  // ── Pharmacy indents ──────────────────────────────────────────
  async listIndents(admissionId?: string | null): Promise<PharmacyIndent[]> {
    let q = (this.supabase.client as any).from('pharmacy_indents').select('*')
      .order('requested_at', { ascending: false });
    if (admissionId) q = q.eq('admission_id', admissionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PharmacyIndent[];
  }

  async createIndent(input: { admissionId: string; medicationOrderId?: string | null; drugName: string; strength?: string | null; qty: number; unitPriceRupees?: number; notes?: string | null }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('pharmacy_indent_create', {
      p_admission_id: input.admissionId,
      p_medication_order_id: input.medicationOrderId ?? null,
      p_drug_name: input.drugName, p_strength: input.strength ?? null,
      p_qty: input.qty, p_unit_price_cents: Math.round((input.unitPriceRupees ?? 0) * 100),
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async dispenseIndent(id: string, qty: number, batch?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('pharmacy_indent_dispense', {
      p_indent_id: id, p_qty_dispensed: qty, p_batch_number: batch ?? null,
    });
    if (error) throw error;
  }
  async acknowledgeIndent(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('pharmacy_indent_acknowledge', { p_indent_id: id });
    if (error) throw error;
  }
  async returnIndent(id: string, qty: number, reason: string, notes?: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('pharmacy_return_process', {
      p_indent_id: id, p_qty_returned: qty, p_reason: reason, p_notes: notes ?? null,
    });
    if (error) throw error;
  }

  // ── Ledger ─────────────────────────────────────────────────
  async ledger(admissionId: string): Promise<LedgerSummary> {
    const { data, error } = await (this.supabase.client as any).rpc('admission_ledger_summary', { p_admission_id: admissionId });
    if (error) throw error;
    return data as LedgerSummary;
  }

  // ── Doctor visits (IPD rounds) ────────────────────────────
  async listDoctorVisits(admissionId: string): Promise<DoctorVisit[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('doctor_visits')
      .select('id, visit_type, visited_at, charge_cents, doctor:doctor_staff_id(full_name)')
      .eq('admission_id', admissionId)
      .order('visited_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map(r => ({
      id: r.id, visit_type: r.visit_type, visited_at: r.visited_at,
      charge_cents: r.charge_cents, doctor_name: r.doctor?.full_name ?? null,
    }));
  }

  async logDoctorVisit(input: {
    admissionId: string; doctorId: string; visitType: string;
    chargeRupees: number; notes?: string | null; visitedAt?: string | null;
  }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('doctor_visit_log', {
      p_admission_id: input.admissionId,
      p_doctor_staff_id: input.doctorId,
      p_visit_type: input.visitType,
      p_charge_rupees: input.chargeRupees,
      p_notes: input.notes ?? null,
      p_visited_at: input.visitedAt ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async listDoctors(): Promise<{ id: string; full_name: string }[]> {
    const { data, error } = await this.supabase.client
      .from('staff').select('id, full_name')
      .eq('role_slug', 'doctor').eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return data ?? [];
  }

  // ── Discharge workflow ─────────────────────────────────────
  async getDischargeBundle(admissionId: string): Promise<DischargeBundle> {
    const { data, error } = await (this.supabase.client as any).rpc('discharge_summary_get', {
      p_admission_id: admissionId,
    });
    if (error) throw error;
    return data as DischargeBundle;
  }

  /** Pull narrative fields from chart data (encounters, SOAP notes, meds, etc). */
  async autofillDischargeNarrative(admissionId: string): Promise<Record<string, string | null>> {
    const { data, error } = await (this.supabase.client as any).rpc('discharge_summary_autofill', {
      p_admission_id: admissionId,
    });
    if (error) throw error;
    return (data ?? {}) as Record<string, string | null>;
  }

  async saveDischargeNarrative(admissionId: string, data: Record<string, unknown>): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('discharge_summary_save', {
      p_admission_id: admissionId,
      p_data: data,
    });
    if (error) throw error;
  }

  async submitDischargeHandoff(input: {
    admissionId: string;
    checklist: Record<string, boolean>;
    returnedIndents?: string[];
    notes?: string | null;
  }): Promise<{ admission_id: string; workflow_status: string; checklist_complete: boolean }> {
    const { data, error } = await (this.supabase.client as any).rpc('discharge_handoff_complete', {
      p_admission_id: input.admissionId,
      p_checklist: input.checklist,
      p_returned_indents: input.returnedIndents ?? null,
      p_handoff_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data;
  }

  subscribe(admissionId: string, onChange: () => void): () => void {
    const ch = this.supabase.client.channel('nursing-' + admissionId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mar_records',         filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medication_orders',   filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'io_charts',           filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinical_notes',      filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pharmacy_indents',    filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_ledger',      filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_visits',       filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discharge_checklist', filter: `admission_id=eq.${admissionId}` }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
