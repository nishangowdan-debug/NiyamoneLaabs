export interface EngagementSurvey {
  id: string;
  branch_id: string | null;
  title: string;
  description: string | null;
  is_active: boolean;
  is_anonymous: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  created_by: string | null;
}

export type QuestionKind = 'likert' | 'text' | 'enps';

export interface EngagementQuestion {
  id: string;
  survey_id: string;
  ord: number;
  prompt: string;
  kind: QuestionKind;
}

export interface EngagementResponse {
  id: string;
  survey_id: string;
  question_id: string;
  staff_id: string | null;
  score: number | null;
  text_answer: string | null;
  created_at: string;
}

export interface EngagementKudos {
  id: string;
  branch_id: string | null;
  from_staff_id: string;
  to_staff_id: string;
  message: string;
  category: string;
  is_public: boolean;
  created_at: string;
}

export interface SurveySummaryRow {
  question_id: string;
  prompt: string;
  kind: QuestionKind;
  responses: number;
  avg_score: number | null;
  score_distribution: Record<string, number>;
}

export const KUDOS_CATEGORIES = ['teamwork', 'patient_care', 'innovation', 'leadership', 'safety'] as const;
export const KUDOS_CATEGORY_LABELS: Record<string, string> = {
  teamwork: 'Teamwork',
  patient_care: 'Patient Care',
  innovation: 'Innovation',
  leadership: 'Leadership',
  safety: 'Safety',
};
