export type VisitorPurpose =
  | 'patient_visit' | 'vendor' | 'contractor' | 'interview'
  | 'meeting' | 'delivery' | 'official' | 'training' | 'other';

export type VisitorIdType =
  | 'aadhaar' | 'pan' | 'passport' | 'driving_license'
  | 'voter_id' | 'employee_id' | 'other';

export type VisitorStatus = 'checked_in' | 'checked_out' | 'overstay' | 'denied' | 'blacklisted';

export const PURPOSE_LABELS: Record<VisitorPurpose, string> = {
  patient_visit: 'Patient Visit', vendor: 'Vendor', contractor: 'Contractor',
  interview: 'Interview', meeting: 'Meeting', delivery: 'Delivery',
  official: 'Official', training: 'Training', other: 'Other',
};

export const ID_TYPE_LABELS: Record<VisitorIdType, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN', passport: 'Passport',
  driving_license: 'DL', voter_id: 'Voter ID',
  employee_id: 'Employee ID', other: 'Other',
};

export interface Visitor {
  id: string;
  pass_no: string;
  visitor_name: string;
  visitor_phone: string | null;
  id_type: VisitorIdType | null;
  id_number: string | null;
  purpose: VisitorPurpose;
  meeting_with_name: string | null;
  meeting_with_department: string | null;
  patient_id: string | null;
  admission_id: string | null;
  ward_id: string | null;
  vendor_id: string | null;
  vehicle_no: string | null;
  accompanying_count: number;
  checked_in_at: string;
  expected_checkout_at: string | null;
  expected_duration_min: number | null;
  checked_out_at: string | null;
  status: VisitorStatus;
  blacklist_reason: string | null;
  notes: string | null;
  // From v_visitors_inside
  minutes_inside?: number;
  minutes_overstay?: number;
}
