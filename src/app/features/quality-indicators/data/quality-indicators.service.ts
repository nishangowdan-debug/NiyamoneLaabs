import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  LiveKpiRow, QualityIndicator, QualityMeasurement,
} from './quality-indicators.types';

@Injectable({ providedIn: 'root' })
export class QualityIndicatorsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listIndicators(activeOnly = true): Promise<QualityIndicator[]> {
    let q = this.db.from('quality_indicators').select('*').order('code');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as QualityIndicator[];
  }

  async listMeasurements(indicatorId: string): Promise<QualityMeasurement[]> {
    const { data, error } = await this.db.from('quality_measurements')
      .select('*').eq('indicator_id', indicatorId)
      .order('period_start', { ascending: false }).limit(24);
    if (error) throw error;
    return (data ?? []) as QualityMeasurement[];
  }

  async liveSnapshot(): Promise<LiveKpiRow[]> {
    const { data, error } = await this.db.rpc('qi_live_snapshot');
    if (error) throw error;
    return (data ?? []) as LiveKpiRow[];
  }

  async saveMeasurement(input: {
    indicatorId: string;
    periodStart: string;
    periodEnd: string;
    measuredValue: number;
    numerator?: number | null;
    denominator?: number | null;
    notes?: string | null;
    isAuto?: boolean;
    computedByName?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('qi_save_measurement', {
      p_indicator_id: input.indicatorId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_measured_value: input.measuredValue,
      p_numerator: input.numerator ?? null,
      p_denominator: input.denominator ?? null,
      p_notes: input.notes ?? null,
      p_is_auto: input.isAuto ?? false,
      p_computed_by_name: input.computedByName ?? null,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }
}
