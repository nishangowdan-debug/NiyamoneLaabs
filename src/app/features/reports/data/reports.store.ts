import { Injectable, inject, signal } from '@angular/core';
import { ReportsService } from './reports.service';
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
export class ReportsStore {
  private svc = inject(ReportsService);

  private readonly _kpis = signal<ReportKpis | null>(null);
  private readonly _apAging = signal<ApAgingBucket[]>([]);
  private readonly _procurement = signal<ProcurementSpendRow[]>([]);
  private readonly _expiry = signal<ExpiryRiskBucket[]>([]);
  private readonly _vendors = signal<VendorScorecardRow[]>([]);
  private readonly _revenue = signal<RevenueRow[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _window = signal<WindowDays>(90);

  readonly kpis        = this._kpis.asReadonly();
  readonly apAging     = this._apAging.asReadonly();
  readonly procurement = this._procurement.asReadonly();
  readonly expiry      = this._expiry.asReadonly();
  readonly vendors     = this._vendors.asReadonly();
  readonly revenue     = this._revenue.asReadonly();
  readonly loading     = this._loading.asReadonly();
  readonly error       = this._error.asReadonly();
  readonly window      = this._window.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    const w = this._window();
    try {
      const [kpis, apAging, procurement, expiry, vendors, revenue] = await Promise.all([
        this.svc.kpis(),
        this.svc.apAging(),
        this.svc.procurementSpend(w),
        this.svc.expiryRisk(),
        this.svc.vendorScorecard(w),
        this.svc.revenue(w === 180 ? 180 : (w === 90 ? 90 : (w === 60 ? 60 : 30))),
      ]);
      this._kpis.set(kpis);
      this._apAging.set(apAging);
      this._procurement.set(procurement);
      this._expiry.set(expiry);
      this._vendors.set(vendors);
      this._revenue.set(revenue);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      this._loading.set(false);
    }
  }

  setWindow(w: WindowDays): void {
    this._window.set(w);
    void this.load();
  }
}
