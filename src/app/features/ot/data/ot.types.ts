export type OtRecordStatus =
  | 'booked' | 'sign_in' | 'in_progress' | 'completed' | 'cancelled' | 'aborted';

export type AnesthesiaType =
  | 'general' | 'regional' | 'spinal' | 'epidural' | 'combined_spinal_epidural'
  | 'local' | 'sedation' | 'none';

export type AsaGrade = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'E';

export type OtTeamRole =
  | 'primary_surgeon' | 'assistant_surgeon' | 'anesthetist' | 'assistant_anesthetist'
  | 'scrub_nurse' | 'circulating_nurse' | 'technician' | 'observer' | 'perfusionist';

export type ChecklistPhase = 'sign_in' | 'time_out' | 'sign_out';

export const STATUS_LABELS: Record<OtRecordStatus, string> = {
  booked: 'Booked', sign_in: 'Sign-in', in_progress: 'In Progress',
  completed: 'Completed', cancelled: 'Cancelled', aborted: 'Aborted',
};

export const ANESTHESIA_LABELS: Record<AnesthesiaType, string> = {
  general: 'General', regional: 'Regional', spinal: 'Spinal', epidural: 'Epidural',
  combined_spinal_epidural: 'CSE', local: 'Local', sedation: 'Sedation', none: 'None',
};

export const TEAM_ROLE_LABELS: Record<OtTeamRole, string> = {
  primary_surgeon: 'Primary Surgeon',
  assistant_surgeon: 'Assistant Surgeon',
  anesthetist: 'Anesthetist',
  assistant_anesthetist: 'Asst. Anesthetist',
  scrub_nurse: 'Scrub Nurse',
  circulating_nurse: 'Circulating Nurse',
  technician: 'Technician',
  observer: 'Observer',
  perfusionist: 'Perfusionist',
};

// WHO Surgical Safety Checklist — 19-item core
export const WHO_CHECKLIST: Record<ChecklistPhase, { key: string; label: string }[]> = {
  sign_in: [
    { key: 'patient_id_confirmed', label: 'Patient identity confirmed' },
    { key: 'site_marked', label: 'Surgical site marked / NA' },
    { key: 'consent_confirmed', label: 'Consent (procedure + anaesthesia) confirmed' },
    { key: 'anaesth_check_done', label: 'Anaesthesia safety check completed' },
    { key: 'pulse_oximeter', label: 'Pulse oximeter on patient & functioning' },
    { key: 'allergy_known', label: 'Known allergies reviewed' },
    { key: 'difficult_airway', label: 'Difficult airway / aspiration risk reviewed' },
    { key: 'blood_loss_risk', label: 'Risk of >500 ml blood loss assessed; access ready' },
  ],
  time_out: [
    { key: 'introductions', label: 'Team introduced themselves by name & role' },
    { key: 'patient_procedure_site', label: 'Patient, procedure & site verbally confirmed' },
    { key: 'antibiotic_prophylaxis', label: 'Antibiotic prophylaxis given in last 60 min / NA' },
    { key: 'critical_steps_surgeon', label: 'Surgeon: critical / unexpected steps reviewed' },
    { key: 'critical_steps_anaesth', label: 'Anaesthetist: patient-specific concerns reviewed' },
    { key: 'critical_steps_nurse', label: 'Nursing: sterility, equipment issues reviewed' },
    { key: 'imaging_displayed', label: 'Essential imaging displayed' },
  ],
  sign_out: [
    { key: 'name_of_procedure', label: 'Name of procedure recorded' },
    { key: 'instrument_sponge_needle_counts', label: 'Instrument, sponge & needle counts correct' },
    { key: 'specimen_labelled', label: 'Specimen labelled (incl. patient name)' },
    { key: 'equipment_problems', label: 'Equipment problems addressed (if any)' },
    { key: 'recovery_concerns', label: 'Surgeon, anaesth & nurse: key recovery concerns' },
  ],
};

export interface SurgicalProcedure {
  id: string; code: string | null; name: string; category: string | null;
  default_duration_min: number | null; default_asa_grade: AsaGrade | null; is_active: boolean;
}

export interface OtRecord {
  id: string;
  record_no: string;
  ot_booking_id: string | null;
  patient_id: string;
  admission_id: string | null;
  encounter_id: string | null;
  ot_room: string | null;
  procedure_id: string | null;
  procedure_name: string;
  primary_surgeon_id: string | null;
  primary_surgeon_name: string | null;
  anesthetist_id: string | null;
  anesthetist_name: string | null;
  asa_grade: AsaGrade | null;
  anesthesia_type: AnesthesiaType | null;
  scheduled_start: string | null;
  actual_start: string | null;
  anesthesia_start: string | null;
  incision_at: string | null;
  closure_at: string | null;
  anesthesia_end: string | null;
  actual_end: string | null;
  pre_op_diagnosis: string | null;
  post_op_diagnosis: string | null;
  procedure_performed: string | null;
  operative_findings: string | null;
  complications: string | null;
  estimated_blood_loss_ml: number | null;
  implants_used: any[];
  specimens_sent: any[];
  sign_in_at: string | null;
  sign_in_by_name: string | null;
  sign_in_items: { key: string; checked: boolean }[];
  time_out_at: string | null;
  time_out_by_name: string | null;
  time_out_items: { key: string; checked: boolean }[];
  sign_out_at: string | null;
  sign_out_by_name: string | null;
  sign_out_items: { key: string; checked: boolean }[];
  sponge_count_correct: boolean | null;
  needle_count_correct: boolean | null;
  instrument_count_correct: boolean | null;
  consent_surgery_id: string | null;
  consent_anaesthesia_id: string | null;
  status: OtRecordStatus;
  cancelled_reason: string | null;
  debrief_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OtTeamMember {
  id: string;
  record_id: string;
  staff_id: string | null;
  staff_name: string;
  role: OtTeamRole;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
}
