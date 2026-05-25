export type DietType = 'regular' | 'diabetic' | 'cardiac' | 'renal' | 'soft' | 'liquid' | 'npo' | 'custom';
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type MealStatus = 'pending' | 'preparing' | 'delivered' | 'skipped';

export interface DietOrder {
  id: string;
  patient_id: string;
  patient_name: string;
  uhid: string;
  bed_label: string;
  ward_name: string;
  diet_type: DietType;
  allergies: string[];
  calorie_target: number | null;
  restrictions: string[];
  special_instructions: string | null;
  doctor_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MealDelivery {
  id: string;
  diet_order_id: string;
  meal_type: MealType;
  meal_date: string;
  status: MealStatus;
  delivered_at: string | null;
  items: string[];
}
