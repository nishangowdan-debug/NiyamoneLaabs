import { Injectable, computed, inject, signal } from '@angular/core';
import { MaterialsService } from './materials.service';
import type { GrnFilter, GrnRow, ReceivablePo } from './materials.types';

@Injectable({ providedIn: 'root' })
export class MaterialsStore {
  private svc = inject(MaterialsService);

  private readonly _grns = signal<GrnRow[]>([]);
  private readonly _receivablePos = signal<ReceivablePo[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _filter = signal<GrnFilter>('all');

  readonly grns = this._grns.asReadonly();
  readonly receivablePos = this._receivablePos.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly search = this._search.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._grns();
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      total: a.length,
      today: a.filter((g) => g.received_at.slice(0, 10) === todayKey).length,
      pendingQc: a.filter((g) => g.qc_status === 'pending').length,
      failedQc: a.filter((g) => g.qc_status === 'failed').length,
      receivableCount: this._receivablePos().length,
    };
  });

  readonly visible = computed<GrnRow[]>(() => {
    const term = this._search().trim().toLowerCase();
    const f = this._filter();
    const todayKey = new Date().toISOString().slice(0, 10);
    return this._grns().filter((g) => {
      if (term) {
        const hay = (
          g.grn_number + ' ' +
          (g.po?.po_number ?? '') + ' ' +
          (g.po?.vendor?.name ?? '') + ' ' +
          (g.po?.vendor?.code ?? '')
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      switch (f) {
        case 'all':         return true;
        case 'today':       return g.received_at.slice(0, 10) === todayKey;
        case 'pending_qc':  return g.qc_status === 'pending';
        case 'passed':      return g.qc_status === 'passed';
        case 'failed':      return g.qc_status === 'failed';
      }
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [grns, pos] = await Promise.all([
        this.svc.list(),
        this.svc.listReceivablePos(),
      ]);
      this._grns.set(grns);
      this._receivablePos.set(pos);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load goods receipts');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(v: string)   { this._search.set(v); }
  setFilter(v: GrnFilter) { this._filter.set(v); }
}
