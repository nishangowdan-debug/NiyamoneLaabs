import type { AppointmentStatus, Tables } from '../../../core/supabase/supabase.types';

/** Returned by appointment_check_in RPC — used to render a printable token slip. */
export interface TokenSlipData {
  appointment_id: string;
  token_number: number | null;
  patient_id: string;
  doctor_name: string | null;
  branch_code: string | null;
  branch_name: string | null;
  wristband_id: string | null;
  wristband_uid: string | null;
  queue_position: number;
  estimated_wait_min: number;
  checked_in_at: string;
}

export type Appointment = Tables<'appointments'>;

export interface AppointmentRow extends Appointment {
  is_web_booking?: boolean | null;
  patient: { id: string; uhid: string; full_name: string | null; first_name: string; last_name: string; date_of_birth: string; gender: string; mobile: string } | null;
  doctor: { id: string; full_name: string; role_slug: string } | null;
}

export interface DoctorInfo {
  id: string;
  full_name: string;
  specialty: string | null;
  metadata: Record<string, unknown> | null;
}

export interface DoctorBlockRow {
  id: string;
  doctor_staff_id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  room: string | null;
  created_by_staff_id: string | null;
  created_at: string;
}

export interface QueueFilters {
  doctorStaffId: 'all' | string;
  status: 'all' | AppointmentStatus;
}

export const QUEUE_STATUS_OPTIONS: { value: 'all' | AppointmentStatus | 'triaged' | 'exited'; label: string; tone: 'neutral' | 'good' | 'info' | 'warn' | 'danger' }[] = [
  { value: 'all',             label: 'All',             tone: 'neutral' },
  { value: 'scheduled',       label: 'Scheduled',       tone: 'info' },
  { value: 'checked_in',      label: 'Checked in',      tone: 'warn' },
  { value: 'triaged',         label: 'Triaged',         tone: 'good' },
  { value: 'in_consultation', label: 'In consultation', tone: 'good' },
  { value: 'completed',       label: 'Completed',       tone: 'neutral' },
  { value: 'no_show',         label: 'No-show',         tone: 'danger' },
  { value: 'cancelled',       label: 'Cancelled',       tone: 'neutral' },
];
