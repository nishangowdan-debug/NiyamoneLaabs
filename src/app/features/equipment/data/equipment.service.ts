import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  BiomedEquipment, CalibrationResult, EquipmentCalibration, EquipmentCategory,
  EquipmentCriticality, EquipmentMaintenance, EquipmentStatus,
  MaintenanceStatus, MaintenanceType,
} from './equipment.types';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listEquipment(opts: { activeOnly?: boolean; status?: EquipmentStatus } = {}): Promise<BiomedEquipment[]> {
    let q = this.db.from('biomedical_equipment').select('*').order('name').limit(2000);
    if (opts.activeOnly) q = q.eq('is_active', true);
    if (opts.status)     q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BiomedEquipment[];
  }

  async listDue(): Promise<BiomedEquipment[]> {
    const { data, error } = await this.db.from('v_equipment_due').select('*').limit(2000);
    if (error) throw error;
    return (data ?? []) as BiomedEquipment[];
  }

  async register(input: {
    name: string;
    category: EquipmentCategory;
    manufacturer?: string | null;
    model?: string | null;
    serialNo?: string | null;
    locationText?: string | null;
    wardId?: string | null;
    department?: string | null;
    custodianName?: string | null;
    vendorId?: string | null;
    purchaseDate?: string | null;
    purchaseCostCents?: number | null;
    warrantyUntil?: string | null;
    criticality?: EquipmentCriticality;
    maintenanceFrequencyDays?: number | null;
    calibrationFrequencyDays?: number | null;
    amcProvider?: string | null;
    amcUntil?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('equipment_register', {
      p_name: input.name,
      p_category: input.category,
      p_manufacturer: input.manufacturer ?? null,
      p_model: input.model ?? null,
      p_serial_no: input.serialNo ?? null,
      p_location_text: input.locationText ?? null,
      p_ward_id: input.wardId ?? null,
      p_department: input.department ?? null,
      p_custodian_name: input.custodianName ?? null,
      p_vendor_id: input.vendorId ?? null,
      p_purchase_date: input.purchaseDate ?? null,
      p_purchase_cost_cents: input.purchaseCostCents ?? null,
      p_warranty_until: input.warrantyUntil ?? null,
      p_criticality: input.criticality ?? 'medium',
      p_maintenance_frequency_days: input.maintenanceFrequencyDays ?? null,
      p_calibration_frequency_days: input.calibrationFrequencyDays ?? null,
      p_amc_provider: input.amcProvider ?? null,
      p_amc_until: input.amcUntil ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed to register equipment');
    return data as string;
  }

  async updateStatus(id: string, status: EquipmentStatus, reason?: string): Promise<void> {
    const { error } = await this.db.rpc('equipment_update_status', {
      p_id: id, p_status: status, p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  // ── Maintenance ───────────────────────────────────────────────
  async listMaintenance(opts: { equipmentId?: string; status?: MaintenanceStatus } = {}): Promise<EquipmentMaintenance[]> {
    let q = this.db.from('equipment_maintenance').select('*').order('scheduled_at', { ascending: false }).limit(500);
    if (opts.equipmentId) q = q.eq('equipment_id', opts.equipmentId);
    if (opts.status)      q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EquipmentMaintenance[];
  }

  async scheduleMaintenance(input: {
    equipmentId: string;
    maintenanceType: MaintenanceType;
    scheduledAt: string;
    description?: string | null;
    vendorId?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('maintenance_schedule', {
      p_equipment_id: input.equipmentId,
      p_maintenance_type: input.maintenanceType,
      p_scheduled_at: input.scheduledAt,
      p_description: input.description ?? null,
      p_vendor_id: input.vendorId ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async completeMaintenance(input: {
    id: string;
    findings?: string | null;
    actionTaken: string;
    performedByName: string;
    partsReplaced?: string[];
    costCents?: number | null;
    downtimeHours?: number | null;
    certificateNo?: string | null;
    certificateUrl?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('maintenance_complete', {
      p_id: input.id,
      p_findings: input.findings ?? null,
      p_action_taken: input.actionTaken,
      p_performed_by_name: input.performedByName,
      p_parts_replaced: input.partsReplaced ?? [],
      p_cost_cents: input.costCents ?? null,
      p_downtime_hours: input.downtimeHours ?? null,
      p_certificate_no: input.certificateNo ?? null,
      p_certificate_url: input.certificateUrl ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async reportBreakdown(equipmentId: string, description: string, reportedByName?: string): Promise<string> {
    const { data, error } = await this.db.rpc('equipment_report_breakdown', {
      p_equipment_id: equipmentId,
      p_description: description,
      p_reported_by_name: reportedByName ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  // ── Calibration ───────────────────────────────────────────────
  async listCalibrations(equipmentId?: string): Promise<EquipmentCalibration[]> {
    let q = this.db.from('equipment_calibrations').select('*').order('calibration_date', { ascending: false }).limit(500);
    if (equipmentId) q = q.eq('equipment_id', equipmentId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EquipmentCalibration[];
  }

  async calibrate(input: {
    equipmentId: string;
    result: CalibrationResult;
    calibratedByName: string;
    calibrationDate?: string;
    certifyingAgency?: string | null;
    certifyingAgencyNablNo?: string | null;
    calibrationStandard?: string | null;
    measurements?: Record<string, unknown>;
    certificateNo?: string | null;
    certificateUrl?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('equipment_calibrate', {
      p_equipment_id: input.equipmentId,
      p_result: input.result,
      p_calibrated_by_name: input.calibratedByName,
      p_calibration_date: input.calibrationDate ?? null,
      p_certifying_agency: input.certifyingAgency ?? null,
      p_certifying_agency_nabl_no: input.certifyingAgencyNablNo ?? null,
      p_calibration_standard: input.calibrationStandard ?? null,
      p_measurements: input.measurements ?? {},
      p_certificate_no: input.certificateNo ?? null,
      p_certificate_url: input.certificateUrl ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }
}
