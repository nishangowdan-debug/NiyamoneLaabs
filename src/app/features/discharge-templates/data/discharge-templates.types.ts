export interface DischargeSummaryTemplate {
  id: string;
  code: string;
  title: string;
  specialty: string | null;
  description: string | null;
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
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}
