import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  DietMealLog, DietPlan, DietPlanStatus, DietType,
  MealDeliveryStatus, MealSlot,
} from './dietary.types';

@Injectable({ providedIn: 'root' })
export class DietaryService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listDietTypes(): Promise<DietType[]> {
    const { data, error } = await this.db.from('diet_types')
      .select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []) as DietType[];
  }

  async listPlans(opts: { status?: DietPlanStatus; patientId?: string } = {}): Promise<DietPlan[]> {
    let q = this.db.from('diet_plans').select('*').order('prescribed_at', { ascending: false }).limit(500);
    if (opts.status)    q = q.eq('status', opts.status);
    if (opts.patientId) q = q.eq('patient_id', opts.patientId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DietPlan[];
  }

  async listMealLogs(opts: { dietPlanId?: string; date?: string } = {}): Promise<DietMealLog[]> {
    let q = this.db.from('diet_meal_logs').select('*').order('scheduled_at', { ascending: false }).limit(500);
    if (opts.dietPlanId) q = q.eq('diet_plan_id', opts.dietPlanId);
    if (opts.date) {
      const start = new Date(opts.date + 'T00:00:00').toISOString();
      const end   = new Date(opts.date + 'T23:59:59').toISOString();
      q = q.gte('scheduled_at', start).lte('scheduled_at', end);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DietMealLog[];
  }

  async createPlan(input: {
    patientId: string;
    dietTypeId: string;
    prescribedByDoctorName: string;
    admissionId?: string | null;
    totalCaloriesKcal?: number | null;
    fluidRestrictionMl?: number | null;
    allergies?: string[];
    foodPreferences?: string[];
    culturalDietary?: string | null;
    specialInstructions?: string | null;
    effectiveUntil?: string | null;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('diet_plan_create', {
      p_patient_id: input.patientId,
      p_diet_type_id: input.dietTypeId,
      p_prescribed_by_doctor_name: input.prescribedByDoctorName,
      p_admission_id: input.admissionId ?? null,
      p_total_calories_kcal: input.totalCaloriesKcal ?? null,
      p_fluid_restriction_ml: input.fluidRestrictionMl ?? null,
      p_allergies: input.allergies ?? [],
      p_food_preferences: input.foodPreferences ?? [],
      p_cultural_dietary: input.culturalDietary ?? null,
      p_special_instructions: input.specialInstructions ?? null,
      p_effective_until: input.effectiveUntil ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async changePlanStatus(id: string, status: DietPlanStatus, notes?: string): Promise<void> {
    const { error } = await this.db.rpc('diet_plan_change_status', {
      p_id: id, p_status: status, p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async scheduleMeal(input: {
    dietPlanId: string;
    mealSlot: MealSlot;
    scheduledAt: string;
    menuItems?: any[];
    totalCaloriesKcal?: number | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('diet_meal_schedule', {
      p_diet_plan_id: input.dietPlanId,
      p_meal_slot: input.mealSlot,
      p_scheduled_at: input.scheduledAt,
      p_menu_items: input.menuItems ?? [],
      p_total_calories_kcal: input.totalCaloriesKcal ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async logDelivery(input: {
    id: string;
    status: MealDeliveryStatus;
    consumedPct?: number | null;
    deliveredByName?: string | null;
    refusalReason?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.db.rpc('diet_meal_log_delivery', {
      p_id: input.id,
      p_status: input.status,
      p_consumed_pct: input.consumedPct ?? null,
      p_delivered_by_name: input.deliveredByName ?? null,
      p_refusal_reason: input.refusalReason ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
  }
}
