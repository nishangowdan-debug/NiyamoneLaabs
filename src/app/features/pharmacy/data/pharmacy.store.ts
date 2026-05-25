import { Injectable, computed, inject, signal } from '@angular/core';
import { PharmacyService } from './pharmacy.service';
import type { QueueFilter, RxQueueRow } from './pharmacy.types';

@Injectable({ providedIn: 'root' })
export class PharmacyStore {
  private svc = inject(PharmacyService);

  private readonly _all = signal<RxQueueRow[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filter = signal<QueueFilter>('pending');

  readonly all = this._all.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly counts = computed(() => {
    const a = this._all();
    return {
      all: a.length,
      pending: a.filter((r) => r.totals.pending > 0).length,
      partial: a.filter((r) => r.totals.partial > 0 && r.totals.pending === 0).length,
      completed: a.filter((r) => r.totals.fully === r.totals.items && r.totals.items > 0).length,
    };
  });

  readonly visible = computed<RxQueueRow[]>(() => {
    const f = this._filter();
    const a = this._all();
    if (f === 'all') return a;
    if (f === 'pending')   return a.filter((r) => r.totals.pending > 0);
    if (f === 'partial')   return a.filter((r) => r.totals.partial > 0 && r.totals.pending === 0);
    if (f === 'completed') return a.filter((r) => r.totals.fully === r.totals.items && r.totals.items > 0);
    return a;
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const rows = await this.svc.listActive();
      this._all.set(rows);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load pharmacy queue');
    } finally {
      this._loading.set(false);
    }
  }

  setFilter(f: QueueFilter) { this._filter.set(f); }
}
