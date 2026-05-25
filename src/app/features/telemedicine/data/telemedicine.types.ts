export type TeleSessionStatus =
  | 'scheduled' | 'waiting_room' | 'in_progress' | 'completed'
  | 'cancelled' | 'no_show' | 'technical_failure' | 'rescheduled';

export type TeleProvider =
  | 'jitsi' | 'zoom' | 'google_meet' | 'webex' | 'ms_teams'
  | 'custom_webrtc' | 'phone' | 'whatsapp_video';

export type TeleConsultType =
  | 'first_consultation' | 'follow_up' | 'second_opinion'
  | 'prescription_renewal' | 'tele_icu' | 'specialist_referral';

export const STATUS_LABELS: Record<TeleSessionStatus, string> = {
  scheduled: 'Scheduled', waiting_room: 'Waiting Room',
  in_progress: 'In Progress', completed: 'Completed',
  cancelled: 'Cancelled', no_show: 'No Show',
  technical_failure: 'Technical Failure', rescheduled: 'Rescheduled',
};

export const PROVIDER_LABELS: Record<TeleProvider, string> = {
  jitsi: 'Jitsi', zoom: 'Zoom', google_meet: 'Google Meet',
  webex: 'Webex', ms_teams: 'MS Teams', custom_webrtc: 'Custom WebRTC',
  phone: 'Phone', whatsapp_video: 'WhatsApp Video',
};

export const CONSULT_TYPE_LABELS: Record<TeleConsultType, string> = {
  first_consultation: 'First Consultation',
  follow_up: 'Follow-up',
  second_opinion: 'Second Opinion',
  prescription_renewal: 'Rx Renewal',
  tele_icu: 'Tele-ICU',
  specialist_referral: 'Specialist Referral',
};

export interface TeleSession {
  id: string;
  session_no: string;
  patient_id: string;
  appointment_id: string | null;
  encounter_id: string | null;
  doctor_staff_id: string | null;
  doctor_name: string;
  consult_type: TeleConsultType;
  scheduled_at: string;
  duration_minutes: number;
  provider: TeleProvider;
  meeting_url: string | null;
  meeting_id: string | null;
  patient_join_url: string | null;
  doctor_join_url: string | null;
  passcode: string | null;
  patient_consent_recorded: boolean;
  patient_consent_at: string | null;
  patient_joined_at: string | null;
  doctor_joined_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  actual_duration_minutes: number | null;
  recording_enabled: boolean;
  recording_url: string | null;
  technical_quality_score: number | null;
  presenting_complaint: string | null;
  consultation_notes: string | null;
  prescription_id: string | null;
  status: TeleSessionStatus;
  cancelled_reason: string | null;
  no_show_at: string | null;
  fee_cents: number | null;
  payment_status: string | null;
  created_at: string;
  // From v_tele_today
  minutes_to_start?: number;
}
