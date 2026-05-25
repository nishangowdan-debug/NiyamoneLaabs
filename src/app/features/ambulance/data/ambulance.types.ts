export type AmbType = 'basic' | 'als' | 'icu' | 'neonatal';
export type AmbStatus = 'available' | 'dispatched' | 'on_trip' | 'maintenance' | 'offline';
export type TripPriority = 'routine' | 'urgent' | 'critical';
export type TripStatus =
  | 'requested'
  | 'assigned'
  | 'en_route_pickup'
  | 'on_scene'
  | 'en_route_back'
  | 'arrived'
  | 'cancelled';

export type AmbSize = 'small' | 'medium' | 'large';

export interface Ambulance {
  id: string;
  branch_id: string;
  code: string;
  reg_number: string | null;
  type: AmbType;
  size: AmbSize;
  has_ac: boolean;
  has_doctor_on_board: boolean;
  capacity: number | null;
  make_model: string | null;
  base_charge_cents: number | null;
  driver_staff_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  status: AmbStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AmbulanceTrip {
  id: string;
  branch_id: string;
  trip_number: string;

  caller_name: string | null;
  caller_phone: string | null;

  patient_id: string | null;
  patient_name: string;
  patient_age: number | null;
  patient_gender: 'male' | 'female' | 'other' | null;

  pickup_address: string;
  pickup_landmark: string | null;
  destination: string;

  chief_complaint: string | null;
  priority: TripPriority;

  ambulance_id: string | null;
  driver_staff_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;

  status: TripStatus;
  requested_at: string;
  assigned_at: string | null;
  en_route_pickup_at: string | null;
  on_scene_at: string | null;
  en_route_back_at: string | null;
  arrived_at: string | null;
  cancelled_at: string | null;

  invoice_id: string | null;
  bill_type: 'op' | 'ip' | null;
  charge_cents: number | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const PRIORITY_TONE: Record<TripPriority, { bg: string; fg: string; ring: string; label: string }> = {
  routine:  { bg: '#ECF6FF', fg: '#0E4F8C', ring: '#A8D6FF', label: 'ROUTINE'  },
  urgent:   { bg: '#FBE9C7', fg: '#8B5A0F', ring: '#F4D08A', label: 'URGENT'   },
  critical: { bg: '#F9D9D6', fg: '#A4302B', ring: '#F2A19C', label: '🚨 CRITICAL' },
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  requested:       'New call',
  assigned:        'Assigned',
  en_route_pickup: 'En route',
  on_scene:        'On scene',
  en_route_back:   'Returning',
  arrived:         'Arrived',
  cancelled:       'Cancelled',
};

export const TRIP_STATUS_TONE: Record<TripStatus, string> = {
  requested:       'bg-danger-bg text-danger-fg',
  assigned:        'bg-info-bg text-info-fg',
  en_route_pickup: 'bg-info-bg text-info-fg',
  on_scene:        'bg-warn-bg text-warn-fg',
  en_route_back:   'bg-info-bg text-info-fg',
  arrived:         'bg-good-bg text-good-fg',
  cancelled:       'bg-surface-subtle text-ink-muted',
};

export const AMB_STATUS_TONE: Record<AmbStatus, { bg: string; fg: string; dot: string; label: string }> = {
  available:   { bg: '#DCF5E5', fg: '#117A3A', dot: '#16A34A', label: 'Available'   },
  dispatched: { bg: '#D6ECFF', fg: '#0E4F8C', dot: '#0E4F8C', label: 'Dispatched'  },
  on_trip:    { bg: '#FBE9C7', fg: '#8B5A0F', dot: '#D97706', label: 'On trip'     },
  maintenance:{ bg: '#F9D9D6', fg: '#A4302B', dot: '#DC2626', label: 'Maintenance' },
  offline:    { bg: '#EDF1F7', fg: '#65758C', dot: '#99A6B8', label: 'Offline'     },
};
