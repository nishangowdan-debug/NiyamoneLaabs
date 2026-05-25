import { Injectable, computed, inject, signal } from '@angular/core';
import { addDays, endOfMonth, startOfMonth } from 'date-fns';
import { AppointmentsService } from './appointments.service';
import type { AppointmentRow, DoctorBlockRow, DoctorInfo, QueueFilters } from './appointments.types';

@Injectable({ providedIn: 'root' })
export class AppointmentsStore {
  private svc = inject(AppointmentsService);

  private readonly _rows         = signal<AppointmentRow[]>([]);
  private readonly _blocks       = signal<DoctorBlockRow[]>([]);
  private readonly _tomorrowRows = signal<AppointmentRow[]>([]);
  private readonly _loading      = signal(false);
  private readonly _error        = signal<string | null>(null);
  private readonly _filters      = signal<QueueFilters>({ doctorStaffId: 'all', status: 'all' });
  private readonly _doctors      = signal<DoctorInfo[]>([]);
  private readonly _doctorCounts = signal<Map<string, number>>(new Map());
  private readonly _monthCounts  = signal<Map<string, number>>(new Map());
  private readonly _selectedDate = signal<Date>(new Date());
  /** Active branch scope. null = all hospitals (super_admin). */
  private readonly _branchId     = signal<string | null>(null);

  readonly rows         = this._rows.asReadonly();
  readonly blocks       = this._blocks.asReadonly();
  readonly tomorrowRows = this._tomorrowRows.asReadonly();
  readonly loading      = this._loading.asReadonly();
  readonly error        = this._error.asReadonly();
  readonly filters      = this._filters.asReadonly();
  readonly doctors      = this._doctors.asReadonly();
  readonly doctorCounts = this._doctorCounts.asReadonly();
  readonly monthCounts  = this._monthCounts.asReadonly();
  readonly selectedDate = this._selectedDate.asReadonly();
  readonly branchId     = this._branchId.asReadonly();

  readonly counts = computed(() => {
    const r = this._rows();
    return {
      total:           r.length,
      scheduled:       r.filter(x => x.status === 'scheduled').length,
      checked_in:      r.filter(x => x.status === 'checked_in').length,
      triaged:         r.filter(x => (x.status as string) === 'triaged').length,
      in_consultation: r.filter(x => x.status === 'in_consultation').length,
      completed:       r.filter(x => x.status === 'completed').length,
      no_show:         r.filter(x => x.status === 'no_show').length,
      web_bookings:    r.filter(x => !!x.is_web_booking).length,
      cancelled:       r.filter(x => x.status === 'cancelled').length,
    };
  });

  async loadForDate(date: Date): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const tomorrow = addDays(date, 1);
      const branchId = this._branchId();
      const [rows, blocks, tomorrowRows, doctorCounts] = await Promise.all([
        this.svc.listForDate(date, branchId),
        this.svc.listBlocksForDate(date).catch(() => [] as DoctorBlockRow[]),
        this.svc.listForDate(tomorrow, branchId),
        this.svc.countAppointmentsByDoctor(date),
      ]);
      this._rows.set(rows);
      this._blocks.set(blocks);
      this._tomorrowRows.set(tomorrowRows);
      this._doctorCounts.set(doctorCounts);
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load appointments');
    } finally {
      this._loading.set(false);
    }
  }

  async loadMonthCounts(monthAnchor: Date): Promise<void> {
    try {
      const monthStart = startOfMonth(monthAnchor);
      const monthEnd   = addDays(endOfMonth(monthAnchor), 1);
      const counts = await this.svc.countAppointmentsByDay(monthStart, monthEnd);
      this._monthCounts.set(counts);
    } catch {
      // non-fatal
    }
  }

  async loadToday(): Promise<void> { return this.loadForDate(new Date()); }

  async loadDoctors(): Promise<void> {
    try {
      const docs = await this.svc.listDoctors();
      this._doctors.set(docs);
    } catch {
      // non-fatal
    }
  }

  selectDate(d: Date): void {
    this._selectedDate.set(d);
    void this.loadForDate(d);
  }

  prevDate(): void { this.selectDate(addDays(this._selectedDate(), -1)); }
  nextDate(): void { this.selectDate(addDays(this._selectedDate(), 1)); }
  goToToday(): void { this.selectDate(new Date()); }

  setFilters(patch: Partial<QueueFilters>): void {
    this._filters.update(f => ({ ...f, ...patch }));
    void this.loadForDate(this._selectedDate());
  }

  /** Switch the active branch and reload appointments + tomorrow snapshot. */
  setBranch(branchId: string | null): void {
    if (this._branchId() === branchId) return;
    this._branchId.set(branchId);
    void this.loadForDate(this._selectedDate());
  }
}
