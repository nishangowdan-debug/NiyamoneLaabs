export type RegisterCategory =
  | 'utility' | 'fuel' | 'housekeeping' | 'waste' | 'statutory' | 'security' | 'facility';

export type FieldType =
  | 'number' | 'text' | 'textarea' | 'select' | 'datetime' | 'meter_reading';

export interface RegisterField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

export interface RegisterDefinition {
  code: string;
  label: string;
  category: RegisterCategory;
  description: string | null;
  fields: RegisterField[];
  uses_meter_asset: boolean;
  asset_type: string | null;
  requires_photo: boolean;
  requires_vendor: boolean;
  requires_ref_no: boolean;
  retention_days: number | null;
  permission_read: string;
  permission_write: string;
  active: boolean;
  sort_order: number;
}

export interface RegisterMeterAsset {
  id: string;
  branch_id: string;
  asset_type: string;
  code: string;
  label: string;
  unit: string;
  capacity: number | null;
  last_reading: number | null;
  last_reading_at: string | null;
  active: boolean;
}

export interface RegisterEntry {
  id: string;
  branch_id: string;
  register_code: string;
  asset_id: string | null;
  entry_at: string;
  shift: 'A' | 'B' | 'C' | null;
  payload: Record<string, unknown>;
  computed: { consumption?: number; previous?: number } | null;
  ref_number: string | null;
  vendor_id: string | null;
  photo_url: string | null;
  recorded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  voided: boolean;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface CreateRegisterEntryInput {
  registerCode: string;
  branchId: string;
  payload: Record<string, unknown>;
  assetId?: string | null;
  entryAt?: string;
  shift?: 'A' | 'B' | 'C' | null;
  refNumber?: string | null;
  vendorId?: string | null;
  photoUrl?: string | null;
  clientUuid?: string;
}

export const CATEGORY_LABELS: Record<RegisterCategory, string> = {
  utility: 'Utilities',
  fuel: 'Fuel',
  housekeeping: 'Housekeeping',
  waste: 'Waste',
  statutory: 'Statutory',
  security: 'Security',
  facility: 'Facility',
};
