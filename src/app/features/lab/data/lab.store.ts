import { Injectable, computed, inject, signal } from '@angular/core';
import { LabService } from './lab.service';
import type { LabFilter, LabOrderRow } from './lab.types';

@Injectable({ providedIn: 'root' })
export class LabStore {
  private svc = inject(LabService);

  private readonly _orders = signal<LabOrderRow[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filter = signal<LabFilter>('pending');

  readonly orders = this._orders.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly counts = computed(() => {
    const a = this._orders();
    return {
      all: a.length,
      pending:   a.filter((o) => o.sample_status === 'pending').length,
      collected: a.filter((o) => o.sample_status === 'collected').length,
      running:   a.filter((o) => o.sample_status === 'running').length,
      verify:    a.filter((o) => o.sample_status === 'running' && o.totals.entered > 0 && o.totals.verified < o.totals.total).length,
      verified:  a.filter((o) => o.sample_status === 'verified').length,
      critical:  a.filter((o) => o.totals.critical > 0).length,
    };
  });

  readonly visible = computed<LabOrderRow[]>(() => {
    const f = this._filter();
    const a = this._orders();
    switch (f) {
      case 'all':       return a;
      case 'pending':   return a.filter((o) => o.sample_status === 'pending');
      case 'collected': return a.filter((o) => o.sample_status === 'collected');
      case 'running':   return a.filter((o) => o.sample_status === 'running');
      case 'verify':    return a.filter((o) => o.sample_status === 'running' && o.totals.entered > 0 && o.totals.verified < o.totals.total);
      case 'verified':  return a.filter((o) => o.sample_status === 'verified');
      case 'critical':  return a.filter((o) => o.totals.critical > 0);
    }
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._orders.set(await this.svc.listOrders());
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load lab queue');
    } finally {
      this._loading.set(false);
    }
  }

  setFilter(f: LabFilter): void {
    this._filter.set(f);
  }
}
