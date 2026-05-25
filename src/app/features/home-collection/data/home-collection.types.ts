export type HomeCollectionStatus =
  | 'requested' | 'assigned' | 'en_route' | 'collected' | 'received' | 'cancelled';

export type HomeCollectionPaymentMethod = 'cash' | 'upi' | 'pending';

export interface HomeAddress {
  line1: string;
  line2?: string | null;
  city: string;
  pincode: string;
  lat?: number | null;
  lng?: number | null;
}

export interface HomeCollectionItem {
  request_id: string;
  lab_test_id: string;
  price_inr: number;
  surcharge_inr: number;
  lab_order_id: string | null;
  test_name?: string;
  test_code?: string;
}

export interface HomeCollectionRequest {
  id: string;
  branch_id: string;
  patient_id: string;
  address: HomeAddress;
  scheduled_at: string;
  contact_mobile: string;
  status: HomeCollectionStatus;
  phlebotomist_id: string | null;
  notes: string | null;
  total_inr: number;
  surcharge_inr: number;
  payment_method: HomeCollectionPaymentMethod;
  payment_ref: string | null;
  paid_inr: number | null;
  created_at: string;
  created_by: string | null;
  assigned_at: string | null;
  collected_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface HomeCollectionRow extends HomeCollectionRequest {
  patient?: { uhid: string; first_name: string; last_name: string; mobile: string } | null;
  phlebotomist?: { staff_id: string; full_name: string; vehicle_no: string | null } | null;
  items?: HomeCollectionItem[];
}

export interface Phlebotomist {
  id: string;
  branch_id: string;
  staff_id: string;
  vehicle_no: string | null;
  service_areas: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  staff?: { full_name: string; phone: string | null; role_slug: string } | null;
}

export const STATUS_LABEL: Record<HomeCollectionStatus, string> = {
  requested:  'Requested',
  assigned:   'Assigned',
  en_route:   'En route',
  collected:  'Collected',
  received:   'Received at lab',
  cancelled:  'Cancelled',
};

export const STATUS_TONE: Record<HomeCollectionStatus, string> = {
  requested:  'bg-info-bg text-info-fg',
  assigned:   'bg-warn-bg text-warn-fg',
  en_route:   'bg-warn-bg text-warn-fg',
  collected:  'bg-good-bg text-good-fg',
  received:   'bg-surface-subtle text-ink-muted',
  cancelled:  'bg-danger-bg text-danger-fg',
};
