export type WristbandType =
  | 'rfid' | 'barcode' | 'qr' | 'printed_only'
  | 'allergy_red' | 'dnr_purple' | 'fall_risk_yellow';

export type WristbandStatus = 'active' | 'reissued' | 'removed' | 'damaged' | 'expired';

export type VerificationContext =
  | 'admission' | 'medication' | 'blood_transfusion' | 'procedure'
  | 'specimen_collection' | 'surgery' | 'transfer' | 'discharge' | 'imaging' | 'other';

export type CheckMethod =
  | 'two_identifiers_verbal' | 'wristband_scan' | 'rfid_tap'
  | 'barcode_scan' | 'photo' | 'biometric' | 'manual_match';

export type VerificationResult =
  | 'confirmed' | 'mismatch' | 'wristband_missing'
  | 'wristband_damaged' | 'manual_override';

export const WRISTBAND_TYPE_LABELS: Record<WristbandType, string> = {
  rfid: 'RFID', barcode: 'Barcode', qr: 'QR Code',
  printed_only: 'Printed only',
  allergy_red: 'Red (Allergy)',
  dnr_purple: 'Purple (DNR)',
  fall_risk_yellow: 'Yellow (Fall Risk)',
};

export const CONTEXT_LABELS: Record<VerificationContext, string> = {
  admission: 'Admission', medication: 'Medication',
  blood_transfusion: 'Blood Transfusion', procedure: 'Procedure',
  specimen_collection: 'Specimen Collection', surgery: 'Surgery',
  transfer: 'Transfer', discharge: 'Discharge',
  imaging: 'Imaging', other: 'Other',
};

export const METHOD_LABELS: Record<CheckMethod, string> = {
  two_identifiers_verbal: 'Two-identifier verbal',
  wristband_scan: 'Wristband scan',
  rfid_tap: 'RFID tap', barcode_scan: 'Barcode scan',
  photo: 'Photo match', biometric: 'Biometric',
  manual_match: 'Manual match',
};

export const RESULT_LABELS: Record<VerificationResult, string> = {
  confirmed: 'Confirmed', mismatch: 'MISMATCH',
  wristband_missing: 'Wristband Missing',
  wristband_damaged: 'Wristband Damaged',
  manual_override: 'Manual Override',
};

export interface PatientWristband {
  id: string;
  patient_id: string;
  admission_id: string | null;
  wristband_uid: string;
  wristband_type: WristbandType;
  rfid_tag_id: string | null;
  barcode_value: string | null;
  printed_data: string | null;
  has_allergy_alert: boolean;
  has_dnr_alert: boolean;
  has_fall_risk_alert: boolean;
  issued_at: string;
  issued_by_name: string | null;
  status: WristbandStatus;
  removed_at: string | null;
  removed_reason: string | null;
}

export interface IdentityVerification {
  id: string;
  patient_id: string;
  admission_id: string | null;
  wristband_id: string | null;
  context: VerificationContext;
  method: CheckMethod;
  result: VerificationResult;
  identifiers_used: string[];
  performed_at: string;
  performed_by_name: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  override_reason: string | null;
  mismatch_details: string | null;
  notes: string | null;
}

export interface IdentityLookup {
  wristband_id: string;
  patient_id: string;
  admission_id: string | null;
  wristband_uid: string;
  has_allergy_alert: boolean;
  has_dnr_alert: boolean;
  has_fall_risk_alert: boolean;
  uhid: string | null;
  full_name: string;
  blood_group: string | null;
  date_of_birth: string | null;
}
