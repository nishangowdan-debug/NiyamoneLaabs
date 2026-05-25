export type MealSlot =
  | 'early_morning' | 'breakfast' | 'mid_morning' | 'lunch'
  | 'tea' | 'dinner' | 'bedtime' | 'custom';

export type DietPlanStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'npo';

export type MealDeliveryStatus =
  | 'scheduled' | 'prepared' | 'delivered' | 'consumed_full'
  | 'consumed_partial' | 'refused' | 'npo' | 'missed';

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  early_morning: 'Early Morning', breakfast: 'Breakfast',
  mid_morning: 'Mid Morning', lunch: 'Lunch',
  tea: 'Tea', dinner: 'Dinner',
  bedtime: 'Bedtime', custom: 'Custom',
};

export const PLAN_STATUS_LABELS: Record<DietPlanStatus, string> = {
  active: 'Active', on_hold: 'On Hold', completed: 'Completed',
  cancelled: 'Cancelled', npo: 'NPO',
};

export const DELIVERY_STATUS_LABELS: Record<MealDeliveryStatus, string> = {
  scheduled: 'Scheduled', prepared: 'Prepared', delivered: 'Delivered',
  consumed_full: 'Consumed Full', consumed_partial: 'Consumed Partial',
  refused: 'Refused', npo: 'NPO', missed: 'Missed',
};

export interface DietType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  calories_kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  is_npo: boolean;
  texture: string | null;
  is_active: boolean;
}

export interface DietPlan {
  id: string;
  patient_id: string;
  admission_id: string | null;
  diet_type_id: string;
  prescribed_by_doctor_name: string | null;
  prescribed_at: string;
  effective_from: string;
  effective_until: string | null;
  status: DietPlanStatus;
  total_calories_kcal: number | null;
  fluid_restriction_ml: number | null;
  allergies: string[];
  food_preferences: string[];
  cultural_dietary: string | null;
  special_instructions: string | null;
  notes: string | null;
}

export interface DietMealLog {
  id: string;
  diet_plan_id: string;
  patient_id: string;
  meal_slot: MealSlot;
  scheduled_at: string;
  delivered_at: string | null;
  delivered_by_name: string | null;
  status: MealDeliveryStatus;
  consumed_pct: number | null;
  refusal_reason: string | null;
  menu_items: { name: string; qty: string; calories?: number }[];
  total_calories_kcal: number | null;
  notes: string | null;
}
