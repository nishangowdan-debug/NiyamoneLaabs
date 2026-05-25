import { Injectable, computed, inject, signal } from '@angular/core';
import { VendorsService } from './vendors.service';
import type { Vendor, VendorFilter } from './vendors.types';
import type { VendorCategory } from '../../../core/supabase/supabase.types';

@Injectable({ providedIn: 'root' })
export class VendorsStore {
  private svc = inject(VendorsService);

  private readonly _vendors = signal<Vendor[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _category = signal<'all' | VendorCategory>('all');
  private readonly _filter = signal<VendorFilter>('active');

  readonly vendors = this._vendors.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly search = this._search.asReadonly();
  readonly category = this._category.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._vendors();
    return {
      total: a.length,
      active: a.filter((v) => v.is_active).length,
      inactive: a.filter((v) => !v.is_active).length,
      byCategory: a.reduce<Record<string, number>>((acc, v) => {
        if (!v.is_active) return acc;
        acc[v.category] = (acc[v.category] ?? 0) + 1;
        return acc;
      }, {}),
    };
  });

  readonly visible = computed<Vendor[]>(() => {
    const term = this._search().trim().toLowerCase();
    const cat = this._category();
    const f = this._filter();
    return this._vendors().filter((v) => {
      if (f === 'active' && !v.is_active) return false;
      if (f === 'inactive' && v.is_active) return false;
      if (cat !== 'all' && v.category !== cat) return false;
      if (term && !(
        v.name.toLowerCase().includes(term) ||
        v.code.toLowerCase().includes(term) ||
        (v.gstn ?? '').toLowerCase().includes(term) ||
        (v.contact_name ?? '').toLowerCase().includes(term) ||
        (v.contact_email ?? '').toLowerCase().includes(term) ||
        (v.contact_phone ?? '').toLowerCase().includes(term)
      )) return false;
      return true;
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._vendors.set(await this.svc.list());
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load vendors');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(v: string)                              { this._search.set(v); }
  setCategory(v: 'all' | VendorCategory)            { this._category.set(v); }
  setFilter(v: VendorFilter)                        { this._filter.set(v); }
}
