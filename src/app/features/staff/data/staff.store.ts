import { Injectable, computed, inject, signal } from '@angular/core';
import { StaffService } from './staff.service';
import { DEFAULT_STAFF_FILTERS, StaffFilters, StaffMember } from './staff.types';

@Injectable({ providedIn: 'root' })
export class StaffStore {
  private svc = inject(StaffService);

  private readonly _members = signal<StaffMember[]>([]);
  private readonly _total = signal(0);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filters = signal<StaffFilters>(DEFAULT_STAFF_FILTERS);

  readonly members = this._members.asReadonly();
  readonly total = this._total.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filters = this._filters.asReadonly();

  readonly isEmpty = computed(() => !this._loading() && this._members().length === 0);

  async load() {
    this._loading.set(true);
    this._error.set(null);
    try {
      const { rows, total } = await this.svc.list(this._filters());
      this._members.set(rows);
      this._total.set(total);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      this._loading.set(false);
    }
  }

  setFilters(patch: Partial<StaffFilters>) {
    const prev = this._filters();
    const next = { ...prev, ...patch };
    if (patch.search   !== undefined && patch.search   !== prev.search)   next.page = 0;
    if (patch.role     !== undefined && patch.role     !== prev.role)     next.page = 0;
    if (patch.status   !== undefined && patch.status   !== prev.status)   next.page = 0;
    if (patch.branchId !== undefined && patch.branchId !== prev.branchId) next.page = 0;
    this._filters.set(next);
    void this.load();
  }

  goToPage(page: number) {
    this.setFilters({ page });
  }
}
