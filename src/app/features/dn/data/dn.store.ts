import { Injectable, computed, inject, signal } from '@angular/core';
import { DnService } from './dn.service';
import type { DnFilter, DnRow } from './dn.types';
import type { Vendor } from '../../vendors/data/vendors.types';

@Injectable({ providedIn: 'root' })
export class DnStore {
  private svc = inject(DnService);

  private readonly _items = signal<DnRow[]>([]);
  private readonly _vendors = signal<Vendor[]>([]);
  private readonly _eligibleGrns = signal<{ id: string; grn_number: string; received_at: string; vendor_id: string; vendor_name: string }[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _filter = signal<DnFilter>('open');

  readonly items   = this._items.asReadonly();
  readonly vendors = this._vendors.asReadonly();
  readonly eligibleGrns = this._eligibleGrns.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error   = this._error.asReadonly();
  readonly search  = this._search.asReadonly();
  readonly filter  = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._items();
    return {
      total: a.length,
      drafts: a.filter((d) => d.status === 'draft').length,
      issued: a.filter((d) => d.status === 'issued').length,
      applied: a.filter((d) => d.status === 'applied').length,
      openCreditCents: a.filter((d) => d.status === 'issued').reduce((s, d) => s + d.total_cents, 0),
      ytdValueCents: a.filter((d) => d.status !== 'cancelled').reduce((s, d) => s + d.total_cents, 0),
    };
  });

  readonly visible = computed<DnRow[]>(() => {
    const term = this._search().trim().toLowerCase();
    const f = this._filter();
    return this._items().filter((d) => {
      if (term) {
        const hay = (
          d.dn_number + ' ' +
          (d.vendor?.name ?? '') + ' ' +
          (d.vendor?.code ?? '') + ' ' +
          (d.grn?.grn_number ?? '') + ' ' +
          (d.bill?.bill_number_internal ?? '')
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      switch (f) {
        case 'all':       return true;
        case 'open':      return ['draft','issued'].includes(d.status);
        case 'draft':     return d.status === 'draft';
        case 'issued':    return d.status === 'issued';
        case 'applied':   return d.status === 'applied';
        case 'cancelled': return d.status === 'cancelled';
      }
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [items, vendors, grns] = await Promise.all([
        this.svc.list(),
        this.svc.listVendors(),
        this.svc.listEligibleGrns(),
      ]);
      this._items.set(items);
      this._vendors.set(vendors);
      this._eligibleGrns.set(grns);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load debit notes');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(v: string)    { this._search.set(v); }
  setFilter(v: DnFilter)  { this._filter.set(v); }
}
