import { Injectable, computed, inject, signal } from '@angular/core';
import { isToday, parseISO } from 'date-fns';
import { BillingService } from './billing.service';
import { BranchStore } from '../../../core/branches/branch.store';
import type { InvoiceFilter, InvoiceRow, Service } from './billing.types';

@Injectable({ providedIn: 'root' })
export class BillingStore {
  private svc = inject(BillingService);
  private branches = inject(BranchStore);

  private readonly _invoices = signal<InvoiceRow[]>([]);
  private readonly _services = signal<Service[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _filter = signal<InvoiceFilter>('all');

  readonly invoices = this._invoices.asReadonly();
  readonly services = this._services.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly search = this._search.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._invoices();
    const today = a.filter((i) => isPaymentToday(i));
    return {
      total: a.length,
      collectedTodayCents: today.reduce((s, i) => s + Math.min(i.paid_cents, i.total_cents), 0),
      pendingCents: a
        .filter((i) => i.status === 'issued' || i.status === 'partially_paid')
        .reduce((s, i) => s + i.balance_cents, 0),
      unpaid: a.filter((i) => i.status === 'issued' || i.status === 'partially_paid').length,
      overdue: a.filter((i) => isOverdue(i)).length,
    };
  });

  readonly visible = computed<InvoiceRow[]>(() => {
    const term = this._search().trim().toLowerCase();
    const f = this._filter();
    return this._invoices().filter((i) => {
      if (term) {
        const hay = (
          i.invoice_number + ' ' +
          (i.patient?.full_name ?? '') + ' ' +
          (i.patient?.uhid ?? '') + ' ' +
          (i.patient?.mobile ?? '')
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      switch (f) {
        case 'all':            return true;
        case 'unpaid':         return i.status === 'issued' || i.status === 'partially_paid';
        case 'partially_paid': return i.status === 'partially_paid';
        case 'paid':           return i.status === 'paid';
        case 'draft':          return i.status === 'draft';
        case 'void':           return i.status === 'void' || i.status === 'refunded';
      }
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [invoices, services] = await Promise.all([
        this.svc.listInvoices(),
        this.svc.listServices(this.branches.activeBranchId()),
      ]);
      this._invoices.set(invoices);
      this._services.set(services);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load billing');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(value: string)             { this._search.set(value); }
  setFilter(value: InvoiceFilter)      { this._filter.set(value); }
}

function isPaymentToday(i: InvoiceRow): boolean {
  // Approximation: invoice updated_at today and has paid amount
  if (i.paid_cents === 0) return false;
  try {
    return isToday(parseISO(i.updated_at));
  } catch { return false; }
}

function isOverdue(i: InvoiceRow): boolean {
  if (i.status !== 'issued' && i.status !== 'partially_paid') return false;
  if (!i.due_date) return false;
  try {
    return parseISO(i.due_date) < new Date();
  } catch { return false; }
}
