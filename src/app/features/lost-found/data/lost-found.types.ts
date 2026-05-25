export type LfItemType =
  | 'valuable' | 'document' | 'phone' | 'jewelry' | 'clothing'
  | 'luggage' | 'medical_device' | 'keys' | 'medication' | 'other';

export type LfStatus =
  | 'found' | 'reported_lost' | 'matched' | 'claimed'
  | 'unclaimed' | 'disposed' | 'transferred_to_police';

export const ITEM_TYPE_LABELS: Record<LfItemType, string> = {
  valuable: 'Valuable', document: 'Document', phone: 'Phone',
  jewelry: 'Jewelry', clothing: 'Clothing', luggage: 'Luggage',
  medical_device: 'Medical Device', keys: 'Keys',
  medication: 'Medication', other: 'Other',
};

export const STATUS_LABELS: Record<LfStatus, string> = {
  found: 'Found (in storage)', reported_lost: 'Reported Lost',
  matched: 'Matched', claimed: 'Claimed',
  unclaimed: 'Unclaimed', disposed: 'Disposed',
  transferred_to_police: 'Transferred to Police',
};

export interface LostFoundItem {
  id: string;
  ref_no: string;
  item_type: LfItemType;
  description: string;
  estimated_value_cents: number | null;
  brand_or_make: string | null;
  identifying_marks: string | null;
  photo_url: string | null;
  found_at: string | null;
  found_location: string | null;
  found_by_name: string | null;
  reported_lost_at: string | null;
  lost_location: string | null;
  reported_by_name: string | null;
  reported_by_phone: string | null;
  reported_by_relation: string | null;
  storage_location: string | null;
  bagged_at: string | null;
  claimed_at: string | null;
  claimed_by_name: string | null;
  claimed_by_phone: string | null;
  claimed_by_id_proof: string | null;
  claimed_by_id_number: string | null;
  released_by_name: string | null;
  status: LfStatus;
  matched_with_id: string | null;
  disposal_method: string | null;
  disposal_at: string | null;
  police_intimation_at: string | null;
  police_station: string | null;
  fir_no: string | null;
  notes: string | null;
  created_at: string;
}
