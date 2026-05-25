import { Injectable, computed, inject, signal } from '@angular/core';
import { PurchaseService } from './purchase.service';
import type { PoFilter, PoRow } from './purchase.types';
import type { Vendor } from '../../vendors/data/vendors.types';

@Injectable({ providedIn: 'root' })
export class PurchaseStore {
  private svc = inject(PurchaseService);

  private readonly _pos = signal<PoRow[]>([]);
  private readonly _vendors = signal<Vendor[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _filter = signal<PoFilter>('open');

  readonly pos = this._pos.asReadonly();
  readonly vendors = this._vendors.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly search = this._search.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._pos();
    const isOpen = (s: string) => ['draft','awaiting_approval','approved','sent','partially_received'].includes(s);
    return {
      total: a.length,
      active: a.filter((p) => isOpen(p.status)).length,
      awaitingApproval: a.filter((p) => p.status === 'awaiting_approval').length,
      drafts: a.filter((p) => p.status === 'draft').length,
      inflightCents: a.filter((p) => isOpen(p.status)).reduce((s, p) => s + p.total_cents, 0),
    };
  });

  readonly visible = computed<PoRow[]>(() => {
    const term = this._search().trim().toLowerCase();
    const f = this._filter();
    const isOpen = (s: string) => ['draft','awaiting_approval','approved','sent','partially_received'].includes(s);
    const isReceived = (s: string) => ['partially_received','fully_received'].includes(s);
    return this._pos().filter((p) => {
      if (term) {
        const hay = (p.po_number + ' ' + (p.vendor?.name ?? '') + ' ' + (p.vendor?.code ?? '')).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      switch (f) {
        case 'all':                 return true;
        case 'open':                return isOpen(p.status);
        case 'awaiting_approval':   return p.status === 'awaiting_approval';
        case 'sent':                return p.status === 'sent';
        case 'received':            return isReceived(p.status);
        case 'closed':              return p.status === 'closed' || p.status === 'cancelled';
        case 'draft':               return p.status === 'draft';
      }
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [pos, vendors] = await Promise.all([
        this.svc.list(),
        this.svc.listVendors(),
      ]);
      this._pos.set(pos);
      this._vendors.set(vendors);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load purchase orders');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(v: string)         { this._search.set(v); }
  setFilter(v: PoFilter)       { this._filter.set(v); }
}
