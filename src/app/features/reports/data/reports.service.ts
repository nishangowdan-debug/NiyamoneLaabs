import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ApAgingBucket,
  ExpiryRiskBucket,
  ProcurementSpendRow,
  ReportKpis,
  RevenueRow,
  VendorScorecardRow,
  WindowDays,
} from './reports.types';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private supabase = inject(SupabaseService);

  async kpis(): Promise<ReportKpis> {
    const { data, error } = await this.supabase.client.rpc('report_kpis');
    if (error) throw error;
    return data as unknown as ReportKpis;
  }

  async apAging(): Promise<ApAgingBucket[]> {
    const { data, error } = await this.supabase.client.rpc('report_ap_aging');
    if (error) throw error;
    return (data ?? []) as ApAgingBucket[];
  }

  async procurementSpend(days: WindowDays): Promise<ProcurementSpendRow[]> {
    const { data, error } = await this.supabase.client.rpc('report_procurement_spend', { p_days: days });
    if (error) throw error;
    return (data ?? []) as ProcurementSpendRow[];
  }

  async expiryRisk(): Promise<ExpiryRiskBucket[]> {
    const { data, error } = await this.supabase.client.rpc('report_expiry_risk');
    if (error) throw error;
    return (data ?? []) as ExpiryRiskBucket[];
  }

  async vendorScorecard(days: WindowDays): Promise<VendorScorecardRow[]> {
    const { data, error } = await this.supabase.client.rpc('report_vendor_scorecard', { p_days: days });
    if (error) throw error;
    return (data ?? []) as VendorScorecardRow[];
  }

  async revenue(days: WindowDays): Promise<RevenueRow[]> {
    const { data, error } = await this.supabase.client.rpc('report_revenue', { p_days: days });
    if (error) throw error;
    return (data ?? []) as RevenueRow[];
  }
}
