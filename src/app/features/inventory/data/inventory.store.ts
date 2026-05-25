import { Injectable, computed, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import type { InventoryFilter, InventoryItemView } from './inventory.types';
import type { InventoryCategory } from '../../../core/supabase/supabase.types';

@Injectable({ providedIn: 'root' })
export class InventoryStore {
  private svc = inject(InventoryService);

  private readonly _items = signal<InventoryItemView[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _search = signal('');
  private readonly _category = signal<'all' | InventoryCategory>('all');
  private readonly _filter = signal<InventoryFilter>('all');

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly search = this._search.asReadonly();
  readonly category = this._category.asReadonly();
  readonly filter = this._filter.asReadonly();

  readonly totals = computed(() => {
    const a = this._items();
    return {
      total: a.length,
      below: a.filter((i) => i.status === 'low' || i.status === 'out').length,
      expiring: a.filter((i) => i.expiryDays !== null && i.expiryDays >= 0 && i.expiryDays <= 90).length,
      stockValueCents: a.reduce((s, i) => s + i.totalCostCents, 0),
    };
  });

  readonly visible = computed<InventoryItemView[]>(() => {
    const term = this._search().trim().toLowerCase();
    const cat = this._category();
    const f = this._filter();
    return this._items().filter((i) => {
      if (cat !== 'all' && i.category !== cat) return false;
      if (term && !(
        i.name.toLowerCase().includes(term) ||
        i.sku.toLowerCase().includes(term)
      )) return false;
      if (f === 'low'      && i.status !== 'low' && i.status !== 'out') return false;
      if (f === 'out'      && i.status !== 'out') return false;
      if (f === 'expiring' && !(i.expiryDays !== null && i.expiryDays >= 0 && i.expiryDays <= 90)) return false;
      return true;
    });
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await this.svc.listItems());
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      this._loading.set(false);
    }
  }

  setSearch(value: string)                                { this._search.set(value); }
  setCategory(value: 'all' | InventoryCategory)           { this._category.set(value); }
  setFilter(value: InventoryFilter)                       { this._filter.set(value); }
}
