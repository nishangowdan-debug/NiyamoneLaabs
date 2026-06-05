import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthStore } from '../auth/auth.store';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: any;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  /** Flat fee charged once per home-collection order at this branch.
   *  Defaults to ₹250 in the DB; cashier can override at billing time. */
  home_collection_surcharge_inr: number;
}

const STORAGE_KEY = 'niyamone:active_branch';

@Injectable({ providedIn: 'root' })
export class BranchStore {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthStore);

  private readonly _branches = signal<Branch[]>([]);
  private readonly _activeBranchId = signal<string | null>(null);
  private readonly _ready = signal(false);
  private loadPromise: Promise<void> | null = null;

  readonly branches = this._branches.asReadonly();
  readonly activeBranchId = this._activeBranchId.asReadonly();
  readonly ready = this._ready.asReadonly();

  readonly activeBranch = computed(() =>
    this._branches().find((b) => b.id === this._activeBranchId()) ?? null,
  );

  readonly activeBranchName = computed(() => {
    if (this._activeBranchId() === null) return 'All hospitals';
    return this.activeBranch()?.name ?? '—';
  });

  /** Whether the user can pick across multiple branches (super_admin / branch_admin). */
  readonly canSwitch = computed(
    () => this.auth.hasRole('super_admin', 'branch_admin') && this._branches().length > 1,
  );

  /** Whether to show the "All hospitals" cross-branch option. Super_admin only. */
  readonly canSeeAll = computed(() => this.auth.hasRole('super_admin'));

  /** Reactive bootstrap: whenever the auth session changes (sign-in,
   *  sign-out, token refresh) we BUST the load cache and re-fetch. This
   *  closes the original race where BranchStore was injected before
   *  AuthStore.init() resolved → `load()` ran with isAuthed=false, cached
   *  an empty result, and never re-tried after sign-in → branch picker
   *  permanently showed "no access to any active branch". */
  private readonly _authSyncFx = effect(() => {
    const session = this.auth.session();
    if (session) {
      this.loadPromise = null;        // bust stale cache
      void this.load();
    } else {
      this.loadPromise = null;
      this._branches.set([]);
      this._activeBranchId.set(null);
    }
  });

  /** Loads branches once. Subsequent calls dedupe via the cached promise.
   *  The auth-sync effect above resets the cache on every session change
   *  so this still re-runs after sign-in. */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    if (!this.auth.isAuthed()) {
      this._branches.set([]);
      this._ready.set(true);
      return;
    }

    let query = (this.supabase.client as any)
      .from('branches')
      .select('id, code, name, address, lat, lng, is_active, home_collection_surcharge_inr')
      .eq('is_active', true)
      .order('name');

    // Non-super-admin: restrict to user's assigned branches
    if (!this.auth.hasRole('super_admin')) {
      let accessibleIds = this.auth.branchIds();

      // Fallback: claims may be stale; query staff_branches directly
      if (accessibleIds.length === 0 && this.auth.staffId()) {
        const { data } = await this.supabase.client
          .from('staff_branches')
          .select('branch_id')
          .eq('staff_id', this.auth.staffId()!);
        accessibleIds = (data ?? []).map((r: any) => r.branch_id);
      }

      if (accessibleIds.length > 0) {
        query = query.in('id', accessibleIds);
      } else {
        // No branches assigned — empty list
        this._branches.set([]);
        this._ready.set(true);
        return;
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('BranchStore.load error', error);
      this._branches.set([]);
      this._ready.set(true);
      return;
    }

    const branches = (data ?? []) as Branch[];
    this._branches.set(branches);

    // Hydrate active selection from localStorage
    const stored = this.readStored();
    if (stored === 'all' && this.auth.hasRole('super_admin')) {
      this._activeBranchId.set(null);
    } else if (stored && stored !== 'all' && branches.some((b) => b.id === stored)) {
      this._activeBranchId.set(stored);
    } else if (this.auth.hasRole('super_admin')) {
      // Super_admin default → All hospitals
      this._activeBranchId.set(null);
    } else {
      // Other admins / staff → first accessible branch
      this._activeBranchId.set(branches[0]?.id ?? null);
    }

    this._ready.set(true);
  }

  setActive(branchId: string | null): void {
    if (this._activeBranchId() === branchId) return;
    this._activeBranchId.set(branchId);
    this.writeStored(branchId === null ? 'all' : branchId);
  }

  /** Home-collection surcharge configured at the active branch (or the
   *  branch with the given id). Returns 0 when no branch is active so callers
   *  can render "—" without special-casing. */
  homeCollectionSurcharge(branchId?: string | null): number {
    const id = branchId ?? this._activeBranchId();
    if (!id) return 0;
    const b = this._branches().find((x) => x.id === id);
    return Number(b?.home_collection_surcharge_inr ?? 0);
  }

  /** Persist a new surcharge for the active branch. Cashiers should override
   *  per-order at billing time; this is the branch-level default they fall
   *  back to. Refreshes the local cache on success. */
  async updateHomeCollectionSurcharge(branchId: string, amount: number): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('branches')
      .update({ home_collection_surcharge_inr: amount })
      .eq('id', branchId);
    if (error) throw new Error(error.message ?? 'Could not update surcharge');
    this._branches.update((rows) =>
      rows.map((b) => (b.id === branchId ? { ...b, home_collection_surcharge_inr: amount } : b)),
    );
  }

  /** Reset on sign-out. */
  reset(): void {
    this._branches.set([]);
    this._activeBranchId.set(null);
    this._ready.set(false);
    this.loadPromise = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  private readStored(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }
  private writeStored(value: string): void {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
  }
}
