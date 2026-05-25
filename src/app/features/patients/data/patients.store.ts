import { Injectable, computed, inject, signal } from '@angular/core';
import { PatientsService } from './patients.service';
import { DEFAULT_FILTERS, Patient, PatientFilters } from './patients.types';

@Injectable({ providedIn: 'root' })
export class PatientsStore {
  private svc = inject(PatientsService);

  private readonly _patients = signal<Patient[]>([]);
  private readonly _total = signal(0);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filters = signal<PatientFilters>(DEFAULT_FILTERS);

  readonly patients = this._patients.asReadonly();
  readonly total = this._total.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filters = this._filters.asReadonly();

  readonly isEmpty = computed(() => !this._loading() && this._patients().length === 0);

  /** Monotonic request id — used to discard responses that arrive after a newer load was kicked off.
   *  Without this, two near-simultaneous loads (e.g. branch change + initial search debounce) can
   *  race and the slower one overwrites the fresher one, leaving the table with stale/partial rows. */
  private _loadSeq = 0;

  async load() {
    const seq = ++this._loadSeq;
    this._loading.set(true);
    this._error.set(null);
    try {
      const { rows, total } = await this.svc.list(this._filters());
      // Drop the response if a newer load has already been kicked off.
      if (seq !== this._loadSeq) return;
      this._patients.set(rows);
      this._total.set(total);
    } catch (e) {
      if (seq !== this._loadSeq) return;
      this._error.set(e instanceof Error ? e.message : 'Failed to load patients');
    } finally {
      // Only flip the spinner off for the latest load — earlier ones must not toggle UI.
      if (seq === this._loadSeq) this._loading.set(false);
    }
  }

  setFilters(patch: Partial<PatientFilters>) {
    const prev = this._filters();
    const next = { ...prev, ...patch };
    // Skip the round-trip when nothing meaningful changed (e.g. effect re-runs on the same branchId).
    const changed =
      next.search   !== prev.search   ||
      next.status   !== prev.status   ||
      next.branchId !== prev.branchId ||
      next.page     !== prev.page     ||
      next.pageSize !== prev.pageSize;
    if (next.search   !== prev.search)   next.page = 0;
    if (next.status   !== prev.status)   next.page = 0;
    if (next.branchId !== prev.branchId) next.page = 0;
    this._filters.set(next);
    if (changed) void this.load();
  }

  goToPage(page: number) {
    this.setFilters({ page });
  }
}
