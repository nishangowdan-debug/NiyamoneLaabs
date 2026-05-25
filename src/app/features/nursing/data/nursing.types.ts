export type MarStatus = 'pending' | 'given' | 'missed' | 'refused' | 'held' | 'withheld';
export type IoDirection = 'intake' | 'output';
export type NoteType = 'soap' | 'progress' | 'procedure' | 'nursing' | 'consult';

export interface ActiveAdmission {
  id: string; patient_id: string;
  patient_name: string; uhid: string;
  admitted_at: string;
  ward_name: string | null; bed_code: string | null;
  primary_diagnosis_icd10: string | null;
}

export interface MedicationOrder {
  id: string; admission_id: string;
  drug_name: string; strength: string | null;
  form: string | null; route: string | null;
  dose: string;
  frequency: string; frequency_per_day: number;
  duration_days: number;
  unit_price_cents: number;
  start_at: string; end_at: string | null;
  status: 'active' | 'completed' | 'cancelled' | 'on_hold';
  notes: string | null;
}

export interface MarRecord {
  id: string;
  medication_order_id: string;
  admission_id: string;
  scheduled_at: string;
  status: MarStatus;
  administered_at: string | null;
  reason_not_given: string | null;
  notes: string | null;
}

export interface IoEntry {
  id: string;
  admission_id: string;
  recorded_at: string;
  direction: IoDirection;
  category: string;
  volume_ml: number;
  notes: string | null;
}

export interface ClinicalNote {
  id: string;
  admission_id: string | null;
  note_type: NoteType;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  body: string | null;
  diagnosis_icd10: string | null;
  noted_at: string;
}

export interface PharmacyIndent {
  id: string;
  admission_id: string;
  medication_order_id: string | null;
  drug_name: string; strength: string | null;
  qty_requested: number; qty_dispensed: number;
  unit_price_cents: number;
  status: 'INDENT_CREATED' | 'DISPENSED_TO_WARD' | 'RECEIVED_IN_WARD' | 'CANCELLED';
  batch_number: string | null;
  requested_at: string;
  dispensed_at: string | null;
  acknowledged_at: string | null;
}

export interface LedgerEntry {
  id: string;
  event_at: string;
  event_type: 'charge' | 'credit' | 'payment' | 'adjustment' | 'reversal';
  category: string;
  description: string;
  amount_cents: number;
}

export interface LedgerSummary {
  total_charges_cents: number;
  total_credits_cents: number;
  net_payable_cents: number;
  by_category: Record<string, number>;
  entries: LedgerEntry[];
}

export interface DoctorVisit {
  id: string;
  visit_type: 'routine' | 'consultation' | 'emergency' | 'procedure' | 'specialist';
  visited_at: string;
  charge_cents: number;
  doctor_name: string | null;
}

export interface DischargeChecklist {
  admission_id: string;
  item_meds_returned: boolean;
  item_iv_lines_removed: boolean;
  item_belongings_returned: boolean;
  item_final_vitals_recorded: boolean;
  item_summary_signed: boolean;
  item_followup_scheduled: boolean;
  item_prescription_handed: boolean;
  item_education_given: boolean;
  item_lab_reports_handed: boolean;
  item_imaging_reports_handed: boolean;
  item_consents_complete: boolean;
  item_billing_notified: boolean;
  notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
}

export interface DischargeSummaryNarrative {
  admission_id: string;
  presenting_complaint: string | null;
  history_of_present_illness: string | null;
  examination_findings: string | null;
  course_in_hospital: string | null;
  procedures_performed: string | null;
  condition_at_discharge: string | null;
  discharge_diagnosis_icd10: string | null;
  discharge_medications: string | null;
  follow_up_instructions: string | null;
  diet_advice: string | null;
  activity_advice: string | null;
  next_review_at: string | null;
  signed_by: string | null;
  signed_at: string | null;
  insurance_provider: string | null;
  insurance_claim_number: string | null;
  insurance_claim_cents: number;
  discount_cents: number;
  discount_reason: string | null;
}

export interface DischargeBundle {
  admission: any;
  patient: any;
  doctor: any;
  branch: any;
  invoice: any | null;
  invoice_items: any[];
  checklist: DischargeChecklist | null;
  summary: DischargeSummaryNarrative | null;
  visits: DoctorVisit[];
  lab_orders: { id: string; ordered_at: string; status: string; reported_at: string | null; is_radiology: boolean }[];
}

export const MAR_STATUS_TONE: Record<MarStatus, { chip: string; label: string }> = {
  pending:  { chip: 'bg-info-bg text-info-fg',          label: 'Due' },
  given:    { chip: 'bg-good-bg text-good-fg',          label: '✓ Given' },
  missed:   { chip: 'bg-danger-bg text-danger-fg',      label: 'Missed' },
  refused:  { chip: 'bg-warn-bg text-warn-fg',          label: 'Refused' },
  held:     { chip: 'bg-surface-subtle text-ink-muted', label: 'Held' },
  withheld: { chip: 'bg-surface-subtle text-ink-muted', label: 'Withheld' },
};
