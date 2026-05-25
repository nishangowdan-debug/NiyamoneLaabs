export type CommChannel = 'sms' | 'email' | 'whatsapp' | 'voice_call' | 'push';

export type CommEvent =
  | 'appointment_reminder' | 'appointment_confirmation' | 'appointment_cancellation'
  | 'lab_report_ready' | 'prescription_ready' | 'admission_welcome'
  | 'discharge_followup' | 'birthday_wish' | 'health_tip' | 'feedback_request'
  | 'payment_reminder' | 'vaccination_due' | 'pre_op_instructions' | 'custom';

export type CommStatus =
  | 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | 'unsubscribed';

export const CHANNEL_LABELS: Record<CommChannel, string> = {
  sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp',
  voice_call: 'Voice Call', push: 'Push',
};

export const EVENT_LABELS: Record<CommEvent, string> = {
  appointment_reminder: 'Appointment Reminder',
  appointment_confirmation: 'Appointment Confirmation',
  appointment_cancellation: 'Appointment Cancellation',
  lab_report_ready: 'Lab Report Ready',
  prescription_ready: 'Prescription Ready',
  admission_welcome: 'Admission Welcome',
  discharge_followup: 'Discharge Follow-up',
  birthday_wish: 'Birthday Wish',
  health_tip: 'Health Tip',
  feedback_request: 'Feedback Request',
  payment_reminder: 'Payment Reminder',
  vaccination_due: 'Vaccination Due',
  pre_op_instructions: 'Pre-op Instructions',
  custom: 'Custom',
};

export const STATUS_LABELS: Record<CommStatus, string> = {
  pending: 'Pending', sent: 'Sent', delivered: 'Delivered',
  read: 'Read', failed: 'Failed', bounced: 'Bounced',
  unsubscribed: 'Unsubscribed',
};

export interface CommTemplate {
  id: string;
  code: string;
  name: string;
  channel: CommChannel;
  event_type: CommEvent;
  language: string;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  dlt_template_id: string | null;
  notes: string | null;
}

export interface CommLog {
  id: string;
  template_id: string | null;
  channel: CommChannel;
  event_type: CommEvent;
  patient_id: string | null;
  to_phone: string | null;
  to_email: string | null;
  rendered_subject: string | null;
  rendered_body: string;
  variables_used: Record<string, unknown>;
  status: CommStatus;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
}
