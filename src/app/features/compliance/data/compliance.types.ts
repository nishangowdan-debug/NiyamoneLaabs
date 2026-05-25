export type ComplianceCategory =
  | 'registration'
  | 'fire_safety'
  | 'biomedical_waste'
  | 'drug_licence'
  | 'pollution'
  | 'radiology'
  | 'blood_bank'
  | 'accreditation'
  | 'tax'
  | 'other';

export type ComplianceStatus =
  | 'applied'
  | 'active'
  | 'expired'
  | 'renewed'
  | 'rejected'
  | 'revoked';

export interface ComplianceLicence {
  id: string;
  branch_id: string;
  name: string;
  license_number: string | null;
  category: ComplianceCategory;
  issuing_authority: string | null;
  issued_on: string | null;       // YYYY-MM-DD
  valid_from: string | null;
  valid_until: string | null;
  status: ComplianceStatus;
  notes: string | null;
  applied_copy_path:       string | null;
  acknowledgment_path:     string | null;
  licence_path:            string | null;
  notice_board_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceSummary {
  total: number;
  active: number;
  applied: number;
  expired: number;
  expiring_30: number;
  expiring_90: number;
  next_expiry: { id: string; name: string; valid_until: string; days_left: number } | null;
}

export const CATEGORY_LABEL: Record<ComplianceCategory, { label: string; color: string; icon: string }> = {
  registration:     { label: 'Registration',         color: '#0E4F8C', icon: '📜' },
  fire_safety:      { label: 'Fire safety',          color: '#A4302B', icon: '🔥' },
  biomedical_waste: { label: 'Bio-medical waste',    color: '#117A3A', icon: '♻️' },
  drug_licence:     { label: 'Drug licence',         color: '#7C3AED', icon: '💊' },
  pollution:        { label: 'Pollution control',    color: '#D97706', icon: '🌫' },
  radiology:        { label: 'Radiology / AERB',     color: '#0891B2', icon: '☢️' },
  blood_bank:       { label: 'Blood bank',           color: '#DC2626', icon: '🩸' },
  accreditation:    { label: 'Accreditation',        color: '#0C2A52', icon: '⭐' },
  tax:              { label: 'Tax / GST',            color: '#475569', icon: '💼' },
  other:            { label: 'Other',                color: '#65758C', icon: '📄' },
};

export const STATUS_LABEL: Record<ComplianceStatus, { label: string; chip: string }> = {
  applied:  { label: 'Applied',  chip: 'bg-info-bg text-info-fg' },
  active:   { label: 'Active',   chip: 'bg-good-bg text-good-fg' },
  expired:  { label: 'Expired',  chip: 'bg-danger-bg text-danger-fg' },
  renewed:  { label: 'Renewed',  chip: 'bg-good-bg text-good-fg' },
  rejected: { label: 'Rejected', chip: 'bg-danger-bg text-danger-fg' },
  revoked:  { label: 'Revoked',  chip: 'bg-surface-subtle text-ink-muted' },
};
