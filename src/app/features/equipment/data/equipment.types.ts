export type EquipmentCategory =
  | 'icu' | 'imaging' | 'lab' | 'ot' | 'anaesthesia' | 'diagnostic'
  | 'dialysis' | 'sterilisation' | 'monitoring' | 'infusion'
  | 'respiratory' | 'endoscopy' | 'rehabilitation' | 'general' | 'utility';

export type EquipmentStatus =
  | 'operational' | 'under_maintenance' | 'breakdown' | 'decommissioned'
  | 'quarantined' | 'reserved';

export type EquipmentCriticality = 'critical' | 'high' | 'medium' | 'low';

export type MaintenanceType =
  | 'preventive' | 'corrective' | 'breakdown' | 'inspection'
  | 'installation' | 'decommissioning';

export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'deferred' | 'cancelled';

export type CalibrationResult = 'pass' | 'conditional' | 'fail';

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  icu: 'ICU', imaging: 'Imaging', lab: 'Lab', ot: 'OT',
  anaesthesia: 'Anaesthesia', diagnostic: 'Diagnostic',
  dialysis: 'Dialysis', sterilisation: 'Sterilisation',
  monitoring: 'Monitoring', infusion: 'Infusion',
  respiratory: 'Respiratory', endoscopy: 'Endoscopy',
  rehabilitation: 'Rehab', general: 'General', utility: 'Utility',
};

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  operational: 'Operational', under_maintenance: 'Under Maintenance',
  breakdown: 'Breakdown', decommissioned: 'Decommissioned',
  quarantined: 'Quarantined', reserved: 'Reserved',
};

export const CRITICALITY_LABELS: Record<EquipmentCriticality, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  preventive: 'Preventive (PPM)', corrective: 'Corrective',
  breakdown: 'Breakdown', inspection: 'Inspection',
  installation: 'Installation', decommissioning: 'Decommissioning',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress',
  completed: 'Completed', deferred: 'Deferred', cancelled: 'Cancelled',
};

export interface BiomedEquipment {
  id: string;
  asset_no: string;
  name: string;
  category: EquipmentCategory;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  asset_tag: string | null;
  location_text: string | null;
  ward_id: string | null;
  department: string | null;
  custodian_name: string | null;
  vendor_id: string | null;
  purchase_date: string | null;
  purchase_cost_cents: number | null;
  warranty_until: string | null;
  status: EquipmentStatus;
  criticality: EquipmentCriticality;
  amc_provider: string | null;
  amc_until: string | null;
  amc_cost_cents: number | null;
  last_maintenance_at: string | null;
  next_maintenance_due_at: string | null;
  maintenance_frequency_days: number | null;
  last_calibration_at: string | null;
  next_calibration_due_at: string | null;
  calibration_frequency_days: number | null;
  decommissioned_at: string | null;
  decommissioned_reason: string | null;
  notes: string | null;
  is_active: boolean;
  // From v_equipment_due
  days_overdue_maintenance?: number | null;
  days_overdue_calibration?: number | null;
  days_until_maintenance?: number | null;
}

export interface EquipmentMaintenance {
  id: string;
  maintenance_no: string;
  equipment_id: string;
  maintenance_type: MaintenanceType;
  scheduled_at: string | null;
  performed_at: string | null;
  completed_at: string | null;
  performed_by_name: string | null;
  vendor_engineer_name: string | null;
  description: string | null;
  findings: string | null;
  action_taken: string | null;
  parts_replaced: string[];
  cost_cents: number | null;
  downtime_hours: number | null;
  certificate_no: string | null;
  certificate_url: string | null;
  status: MaintenanceStatus;
  next_due_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface EquipmentCalibration {
  id: string;
  equipment_id: string;
  calibration_date: string;
  next_due_at: string | null;
  calibrated_by_name: string | null;
  certifying_agency: string | null;
  certifying_agency_nabl_no: string | null;
  calibration_standard: string | null;
  result: CalibrationResult;
  measurements: Record<string, unknown>;
  certificate_no: string | null;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
}
