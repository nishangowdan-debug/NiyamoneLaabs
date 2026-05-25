import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Calibration, CalibrationResult, CalibrationType, CriticalAlert,
  LabInstrument, QcLevel, QcMaterial, QcRun, SampleRejection, SampleRejectionReason,
} from './lab-qc.types';

@Injectable({ providedIn: 'root' })
export class LabQcService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  // ── Instruments ───────────────────────────────────────────────
  async listInstruments(): Promise<LabInstrument[]> {
    const { data, error } = await this.db.from('lab_instruments').select('*').order('name');
    if (error) throw error;
    return (data ?? []) as LabInstrument[];
  }
  async createInstrument(input: Partial<LabInstrument>): Promise<LabInstrument> {
    const { data, error } = await this.db.from('lab_instruments').insert(input).select('*').single();
    if (error) throw error;
    return data as LabInstrument;
  }

  // ── QC Materials ──────────────────────────────────────────────
  async listMaterials(opts: { activeOnly?: boolean; testId?: string } = {}): Promise<QcMaterial[]> {
    let q = this.db.from('lab_qc_materials').select('*').order('lot_no');
    if (opts.activeOnly) q = q.eq('is_active', true);
    if (opts.testId)     q = q.eq('lab_test_id', opts.testId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as QcMaterial[];
  }
  async createMaterial(input: Partial<QcMaterial>): Promise<QcMaterial> {
    const { data, error } = await this.db.from('lab_qc_materials').insert(input).select('*').single();
    if (error) throw error;
    return data as QcMaterial;
  }

  // ── QC Runs ───────────────────────────────────────────────────
  async listRuns(materialId: string, limit = 60): Promise<QcRun[]> {
    const { data, error } = await this.db.from('lab_qc_runs')
      .select('*').eq('qc_material_id', materialId)
      .order('measured_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as QcRun[];
  }
  async recordRun(input: {
    qcMaterialId: string; value: number; measuredAt?: string;
    ranByName?: string | null; actionTaken?: string | null; notes?: string | null;
  }): Promise<{ id: string; deviation_sd: number; violations: string[]; status: string }> {
    const { data, error } = await this.db.rpc('lab_qc_record_run', {
      p_qc_material_id: input.qcMaterialId,
      p_value: input.value,
      p_measured_at: input.measuredAt ?? null,
      p_ran_by_name: input.ranByName ?? null,
      p_action_taken: input.actionTaken ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to record QC run');
    return data;
  }

  /** Save / update the action_taken (and optionally notes) on a QC run. The
   *  write-once trigger only allows these two columns to change. */
  async annotateRun(runId: string, patch: { action_taken?: string | null; notes?: string | null }): Promise<void> {
    const { error } = await this.db.from('lab_qc_runs').update(patch).eq('id', runId);
    if (error) throw new Error(error.message ?? 'Failed to save annotation');
  }

  // ── Sample rejections ─────────────────────────────────────────
  async listRejections(opts: { recent?: boolean; orderId?: string } = {}): Promise<SampleRejection[]> {
    let q = this.db.from('lab_sample_rejections').select('*').order('rejected_at', { ascending: false }).limit(500);
    if (opts.orderId) q = q.eq('lab_order_id', opts.orderId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SampleRejection[];
  }
  async rejectSample(input: {
    labOrderId?: string | null; reason: SampleRejectionReason;
    testCodes?: string[]; specimenType?: string | null;
    reasonDetails?: string | null; rejectedByName?: string | null;
    recollectionRequired?: boolean; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('lab_reject_sample', {
      p_lab_order_id:   input.labOrderId ?? null,
      p_reason:         input.reason,
      p_test_codes:     input.testCodes ?? [],
      p_specimen_type:  input.specimenType ?? null,
      p_reason_details: input.reasonDetails ?? null,
      p_rejected_by_name: input.rejectedByName ?? null,
      p_recollection_required: input.recollectionRequired ?? true,
      p_notes:          input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to reject sample');
    return data as string;
  }
  async markNotified(id: string, via: string, toName?: string | null): Promise<void> {
    const { error } = await this.db.rpc('lab_reject_mark_notified', { p_id: id, p_via: via, p_to_name: toName ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }
  async markRecollected(id: string): Promise<void> {
    const { error } = await this.db.rpc('lab_reject_mark_recollected', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Calibrations ──────────────────────────────────────────────
  async listCalibrations(instrumentId?: string): Promise<Calibration[]> {
    let q = this.db.from('lab_calibrations').select('*').order('performed_at', { ascending: false }).limit(500);
    if (instrumentId) q = q.eq('instrument_id', instrumentId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Calibration[];
  }
  async logCalibration(input: {
    instrumentId: string; calibrationType: CalibrationType; result: CalibrationResult;
    labTestId?: string | null; nextDueAt?: string | null;
    certificateNo?: string | null; certificateUrl?: string | null;
    performedByName?: string | null; notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('lab_log_calibration', {
      p_instrument_id:    input.instrumentId,
      p_calibration_type: input.calibrationType,
      p_result:           input.result,
      p_lab_test_id:      input.labTestId ?? null,
      p_next_due_at:      input.nextDueAt ?? null,
      p_certificate_no:   input.certificateNo ?? null,
      p_certificate_url:  input.certificateUrl ?? null,
      p_performed_by_name: input.performedByName ?? null,
      p_notes:            input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to log calibration');
    return data as string;
  }

  // ── Critical alerts ───────────────────────────────────────────
  async listCriticalAlerts(opts: { status?: 'open' | 'acknowledged' | 'closed' } = {}): Promise<CriticalAlert[]> {
    let q = this.db.from('lab_critical_alerts').select('*').order('raised_at', { ascending: false }).limit(500);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CriticalAlert[];
  }
  async notifyAlert(id: string, via: string, toName?: string | null): Promise<void> {
    const { error } = await this.db.rpc('lab_critical_notify', { p_alert_id: id, p_via: via, p_to_name: toName ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }
  async ackAlert(id: string, notes?: string | null): Promise<void> {
    const { error } = await this.db.rpc('lab_critical_acknowledge', { p_alert_id: id, p_notes: notes ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }
  async closeAlert(id: string, notes?: string | null): Promise<void> {
    const { error } = await this.db.rpc('lab_critical_close', { p_alert_id: id, p_notes: notes ?? null });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Helpers ───────────────────────────────────────────────────
  async listLabTests(): Promise<{ id: string; code: string; name: string; unit: string | null; critical_low: number | null; critical_high: number | null }[]> {
    const { data, error } = await this.db.from('lab_tests')
      .select('id, code, name, unit, critical_low, critical_high')
      .eq('is_active', true).order('name').limit(2000);
    if (error) throw error;
    return data ?? [];
  }
}
