export type CredentialType = 'licence' | 'registration' | 'certification' | 'training' | 'degree';
export type CredentialStatus = 'active' | 'expired' | 'expiring_30' | 'expiring_60' | 'expiring_90';

export interface StaffCredential {
  id: string;
  staff_id: string;
  type: CredentialType;
  name: string;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  document_url: string | null;
  notes: string | null;
  is_mandatory: boolean;
  status: CredentialStatus;
  days_left: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ExpiringCredential {
  staff_id: string;
  full_name: string;
  role_slug: string;
  credential_id: string;
  name: string;
  type: CredentialType;
  expires_on: string;
  days_left: number;
  is_mandatory: boolean;
}

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  licence: 'Licence',
  registration: 'Registration',
  certification: 'Certification',
  training: 'Training',
  degree: 'Degree',
};

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  expiring_30: 'Expires in 30 days',
  expiring_60: 'Expires in 60 days',
  expiring_90: 'Expires in 90 days',
};
