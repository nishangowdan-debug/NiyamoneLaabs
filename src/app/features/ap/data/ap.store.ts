import { Injectable, computed, inject, signal } from '@angular/core';
import { ApService } from './ap.service';
import type { BillFilter, BillRow, BillablePo } from './ap.types';
import type { Vendor } from '../../vendors/data/vendors.types';

@Injectable({ providedIn: 'root' })
export class ApStore {
  private svc = inject(ApService);

  private readonly _bills = signal<BillRow[]>([]);
  private readonly _vendors = signal<Vendor[]>([]);
  private readonly _billablePos = signal<BillablePo[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _filter = signal<BillFilter>('open');

  readonly bills        = this._bills.asReadonly();
  readonly vendors      = this._vendors.asReadonly();
  readonly billablePos  = this._billablePos.asReadonly();
  readonly loading      = this._loading.asReadonly();
  readonly error        = this._error.asReadonly();
  readonly search       = this._search.asReadonly();
  readonly filter       = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._bills();
    const todayKey = new Date().toISOString().slice(0, 10);
    const isOpen = (s: string) => ['draft','awaiting_approval','approved','partially_paid'].includes(s);
    return {
      total: a.length,
      open: a.filter((b) => isOpen(b.status)).length,
      awaitingApproval: a.filter((b) => b.status === 'awaiting_approval').length,
      mismatch: a.filter((b) => b.match_status === 'mismatch' && b.status !== 'cancelled').length,
      overdue: a.filter((b) => isOpen(b.status) && b.due_date < todayKey).length,
      payableCents: a.filter((b) => isOpen(b.status)).reduce((s, b) => s + (b.total_cents - b.paid_total_cents), 0),
    };
  });

  readonly visible = computed<BillRow[]>(() => {
    const term = this._search().trim().toLowerCase();
    const f = this._filter();
    const todayKey = new Date().toISOString().slice(0, 10);
    const isOpen = (s: string) => ['draft','awaiting_approval','approved','partially_paid'].includes(s);
    return this._bills().filter((b) => {
      if (term) {
        const hay = (
          b.bill_number_internal + ' ' +
          b.vendor_bill_number + ' ' +
          (b.vendor?.name ?? '') + ' ' +
          (b.vendor?.code ?? '') + ' ' +
          (b.po?.po_number ?? '')
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      switch (f) {
        case 'all':                return true;
        case 'open':               return isOpen(b.status);
        case 'awaiting_approval':  return b.status === 'awaiting_approval';
        case 'mismatch':           return b.match_status === 'mismatch' && b.status !== 'cancelled';
        case 'overdue':            return isOpen(b.status) && b.due_date < todayKey;
        case 'paid':               return b.status === 'paid';
      }
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [bills, vendors, pos] = await Promise.all([
        this.svc.list(),
        this.svc.listVendors(),
        this.svc.listBillablePos(),
      ]);
      this._bills.set(bills);
      this._vendors.set(vendors);
      this._billablePos.set(pos);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load vendor bills');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(v: string)        { this._search.set(v); }
  setFilter(v: BillFilter)    { this._filter.set(v); }
}
