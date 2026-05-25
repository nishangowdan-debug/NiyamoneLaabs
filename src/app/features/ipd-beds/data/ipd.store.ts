import { Injectable, computed, inject, signal } from '@angular/core';
import { IpdService } from './ipd.service';
import type { BedView, Ward, WardView } from './ipd.types';

@Injectable({ providedIn: 'root' })
export class IpdStore {
  private svc = inject(IpdService);

  private readonly _wards = signal<Ward[]>([]);
  private readonly _beds = signal<BedView[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _activeWardId = signal<string | 'all'>('all');
  /** Active branch scope. null = all hospitals. */
  private readonly _branchId = signal<string | null>(null);

  readonly wards = this._wards.asReadonly();
  readonly beds = this._beds.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly activeWardId = this._activeWardId.asReadonly();
  readonly branchId = this._branchId.asReadonly();

  /**
   * Ward chips. When a branch is active, returns one entry per ward row.
   * When "All hospitals", groups by lowercased ward name so chips show
   * once with summed totals across branches.
   */
  readonly wardViews = computed<WardView[]>(() => {
    const raw = IpdService.buildWardViews(this._wards(), this._beds());
    if (this._branchId()) return raw;          // single branch — no grouping needed

    // Multi-branch grouping by case-insensitive name. Keep the first ward's
    // id/branch_id as a representative, sum the totals, concat all beds.
    const groups = new Map<string, WardView>();
    for (const w of raw) {
      const key = (w.name || '').toLowerCase().trim();
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, { ...w, beds: [...w.beds], totals: { ...w.totals } });
      } else {
        prev.beds = prev.beds.concat(w.beds);
        for (const k of Object.keys(prev.totals) as (keyof typeof prev.totals)[]) {
          prev.totals[k] = (prev.totals[k] ?? 0) + (w.totals[k] ?? 0);
        }
      }
    }
    return Array.from(groups.values());
  });

  readonly totals = computed(() => {
    const all = this._beds();
    return {
      total: all.length,
      occupied: all.filter((b) => b.status === 'occupied').length,
      available: all.filter((b) => b.status === 'available').length,
      critical: all.filter((b) => b.acuity === 'critical').length,
      preDischarge: all.filter((b) => b.acuity === 'pre_discharge').length,
    };
  });

  readonly visibleBeds = computed<BedView[]>(() => {
    const ward = this._activeWardId();
    if (ward === 'all') return this._beds();
    // When grouped (multi-branch), the chip id is the *representative* ward id —
    // match all beds whose ward NAME matches that ward's name.
    const wv = this.wardViews().find(w => w.id === ward);
    if (!wv) return this._beds().filter((b) => b.ward_id === ward);
    if (this._branchId()) return this._beds().filter((b) => b.ward_id === ward);
    const target = (wv.name || '').toLowerCase().trim();
    return this._beds().filter((b) => (b.ward?.name || '').toLowerCase().trim() === target);
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const branchId = this._branchId();
      const [wards, beds] = await Promise.all([
        this.svc.listWards(branchId),
        this.svc.listBeds(branchId),
      ]);
      this._wards.set(wards);
      this._beds.set(beds);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load IPD');
    } finally {
      this._loading.set(false);
    }
  }

  setActiveWard(id: string | 'all'): void {
    this._activeWardId.set(id);
  }

  /** Switch the active branch and reload. */
  setBranch(branchId: string | null): void {
    if (this._branchId() === branchId) return;
    this._branchId.set(branchId);
    this._activeWardId.set('all');             // reset ward selection on branch change
    void this.load();
  }
}
