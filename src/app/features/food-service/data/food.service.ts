import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { DietOrder, MealDelivery, DietType } from './food.types';

@Injectable({ providedIn: 'root' })
export class FoodService {
  private supabase = inject(SupabaseService);

  async listDietOrders(): Promise<DietOrder[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('diet_orders')
      .select('*')
      .eq('is_active', true)
      .order('ward_name')
      .order('bed_label');
    if (error) throw error;
    return (data ?? []) as DietOrder[];
  }

  async listMealsForDate(date: string): Promise<MealDelivery[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('meal_deliveries')
      .select('*')
      .eq('meal_date', date)
      .order('meal_type');
    if (error) throw error;
    return (data ?? []) as MealDelivery[];
  }

  async updateMealStatus(id: string, status: 'delivered' | 'skipped'): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'delivered') patch['delivered_at'] = new Date().toISOString();
    const { error } = await (this.supabase.client as any)
      .from('meal_deliveries')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async createDietOrder(input: {
    patient_id: string;
    patient_name: string;
    uhid: string;
    bed_label: string;
    ward_name: string;
    diet_type: DietType;
    allergies?: string[];
    calorie_target?: number | null;
    restrictions?: string[];
    special_instructions?: string | null;
  }): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('diet_orders')
      .insert({ ...input, is_active: true });
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('food-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diet_orders' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_deliveries' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
