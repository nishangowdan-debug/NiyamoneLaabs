export type QcLevel = 'level_1' | 'level_2' | 'level_3';
export type QcRunStatus = 'accepted' | 'warning' | 'rejected';
export type SampleRejectionReason =
  | 'hemolysed' | 'lipemic' | 'icteric' | 'clotted' | 'insufficient_volume'
  | 'wrong_tube' | 'mislabeled' | 'unlabeled' | 'leaking' | 'expired_tube'
  | 'wrong_patient' | 'contaminated' | 'wrong_temperature' | 'delayed_transport' | 'other';
export type CalibrationType =
  | 'full' | 'linearity' | 'precision' | 'accuracy' | 'correlation' | 'two_point' | 'single_point';
export type CalibrationResult = 'pass' | 'fail' | 'marginal';
export type CriticalAlertStatus = 'open' | 'acknowledged' | 'closed';

export const QC_LEVEL_LABELS: Record<QcLevel, string> = {
  level_1: 'Level 1 (Low)', level_2: 'Level 2 (Normal)', level_3: 'Level 3 (High)',
};
export const REJECT_REASON_LABELS: Record<SampleRejectionReason, string> = {
  hemolysed: 'Hemolysed', lipemic: 'Lipemic', icteric: 'Icteric',
  clotted: 'Clotted', insufficient_volume: 'Insufficient volume',
  wrong_tube: 'Wrong tube', mislabeled: 'Mislabeled', unlabeled: 'Unlabeled',
  leaking: 'Leaking', expired_tube: 'Expired tube', wrong_patient: 'Wrong patient',
  contaminated: 'Contaminated', wrong_temperature: 'Wrong temperature',
  delayed_transport: 'Delayed transport', other: 'Other',
};

export interface LabInstrument {
  id: string; code: string; name: string; manufacturer: string | null;
  model: string | null; serial_no: string | null; location: string | null;
  category: string | null; is_active: boolean;
}

export interface QcMaterial {
  id: string;
  instrument_id: string | null;
  lab_test_id: string;
  level: QcLevel;
  lot_no: string;
  expiry_date: string | null;
  mean_target: number;
  sd_target: number;
  cv_target: number | null;
  unit: string | null;
  is_active: boolean;
}

export interface QcRun {
  id: string;
  qc_material_id: string;
  measured_at: string;
  value: number;
  deviation_sd: number;
  status: QcRunStatus;
  violations: string[];
  action_taken: string | null;
  ran_by_name: string | null;
  notes: string | null;
}

export interface SampleRejection {
  id: string;
  lab_order_id: string | null;
  patient_id: string | null;
  test_codes: string[];
  specimen_type: string | null;
  reason: SampleRejectionReason;
  reason_details: string | null;
  rejected_by_name: string | null;
  rejected_at: string;
  notified_doctor_at: string | null;
  notified_via: string | null;
  recollection_required: boolean;
  recollection_at: string | null;
  notes: string | null;
}

export interface Calibration {
  id: string;
  instrument_id: string;
  lab_test_id: string | null;
  performed_at: string;
  calibration_type: CalibrationType;
  result: CalibrationResult;
  next_due_at: string | null;
  certificate_no: string | null;
  performed_by_name: string | null;
  notes: string | null;
}

export interface CriticalAlert {
  id: string;
  lab_result_id: string;
  lab_order_id: string | null;
  patient_id: string | null;
  lab_test_id: string | null;
  test_name: string | null;
  value_numeric: number | null;
  value_text: string | null;
  reference_low: number | null;
  reference_high: number | null;
  status: CriticalAlertStatus;
  raised_at: string;
  notified_at: string | null;
  notified_to_name: string | null;
  notified_via: string | null;
  acknowledged_at: string | null;
  closed_at: string | null;
  notes: string | null;
}
