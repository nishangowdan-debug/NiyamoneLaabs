import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { format, parseISO, differenceInMinutes } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { AppointmentsService } from '../../appointments/data/appointments.service';
import { AppointmentsStore } from '../../appointments/data/appointments.store';
import { QUEUE_STATUS_OPTIONS } from '../../appointments/data/appointments.types';
import type { AppointmentRow } from '../../appointments/data/appointments.types';
import type { AppointmentStatus } from '../../../core/supabase/supabase.types';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ageFromDob } from '../../patients/utils/age-from-dob';
import { TokenSlipDialog } from '../components/token-slip-dialog';
import type { TokenSlipData } from '../../appointments/data/appointments.types';

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  scheduled:       { bg: 'bg-info-bg',    fg: 'text-info-fg',    label: 'Scheduled' },
  checked_in:      { bg: 'bg-warn-bg',    fg: 'text-warn-fg',    label: 'Checked in' },
  triaged:         { bg: 'bg-good-bg',    fg: 'text-good-fg',    label: 'Triaged' },
  in_consultation: { bg: 'bg-good-bg',    fg: 'text-good-fg',    label: 'In consultation' },
  completed:       { bg: 'bg-surface-subtle', fg: 'text-ink-muted', label: 'Completed' },
  exited:          { bg: 'bg-surface-subtle', fg: 'text-ink-muted', label: 'Exited' },
  no_show:         { bg: 'bg-danger-bg',  fg: 'text-danger-fg',  label: 'No-show' },
  cancelled:       { bg: 'bg-surface-subtle', fg: 'text-ink-muted', label: 'Cancelled' },
  rescheduled:     { bg: 'bg-surface-subtle', fg: 'text-ink-muted', label: 'Rescheduled' },
};

@Component({
  selector: 'app-opd-queue-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent, TokenSlipDialog],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          OPD Queue
        </h1>
        <p class="text-[13px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
          <span>{{ today() }}</span>
          @if (branchStore.activeBranchId() === null) {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[11px] font-medium">🌐 network view</span>
          } @else {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-good-bg text-good-fg text-[11px] font-medium">{{ branchStore.activeBranchName() }}</span>
          }
          <span>· live across all doctors</span>
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
    </header>

    <!-- ── Status pills (counts) ─────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      @for (s of statusCards(); track s.value) {
        <button type="button"
                (click)="setStatus(s.value)"
                [class]="cardCls(s.value)"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] uppercase tracking-[0.06em] font-semibold">{{ s.label }}</span>
            @if (s.value === 'in_consultation') {
              <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>
            }
          </div>
          <div class="font-display text-[28px] font-medium tracking-[-0.02em] mt-1.5">{{ s.count }}</div>
        </button>
      }
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <span class="text-[11px] uppercase tracking-[0.08em] text-ink-muted font-semibold pr-2 border-r border-border mr-1">
        Filters
      </span>

      <select [value]="store.filters().doctorStaffId" (change)="onDoctorChange($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option value="all">All doctors</option>
        @for (d of store.doctors(); track d.id) {
          <option [value]="d.id">{{ d.full_name }}</option>
        }
      </select>

      <select [value]="store.filters().status" (change)="onStatusSelectChange($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        @for (o of statusOptions; track o.value) {
          <option [value]="o.value">{{ o.label }}</option>
        }
      </select>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ now() }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load queue">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Queue table ───────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Token</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Time</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Patient</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Doctor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Type</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Wait</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.rows().length === 0) {
            <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading queue…</td></tr>
          } @else {
            @for (row of store.rows(); track row.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink">{{ row.token_number ?? '—' }}</td>
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ formatTime(row.appointment_at) }}</td>
                <td class="px-4 py-2.5">
                  @if (row.patient; as p) {
                    <div class="flex items-center gap-2.5">
                      <div class="size-7 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[11px] shrink-0">
                        {{ patientInitials(p) }}
                      </div>
                      <div class="min-w-0">
                        <a [routerLink]="['/patients', p.id]" class="block text-[13px] font-medium text-ink hover:text-primary-700 truncate max-w-[220px]">
                          {{ p.full_name || (p.first_name + ' ' + p.last_name) }}
                        </a>
                        <small class="block font-mono text-[11px] text-ink-muted mt-0.5">
                          {{ p.uhid }} · {{ ageGenderLabel(p.date_of_birth, p.gender) }}
                        </small>
                      </div>
                    </div>
                  } @else { <span class="text-ink-muted text-[12px]">—</span> }
                </td>
                <td class="px-4 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">
                  {{ row.doctor?.full_name || '—' }}
                </td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ row.visit_type.replace('_', ' ') }}</td>
                <td class="px-4 py-2.5">
                  <span [class]="statusChipCls(row.status)">{{ statusLabel(row.status) }}</span>
                </td>
                <td class="px-4 py-2.5 font-mono text-[12px]"
                    [class.text-warn-fg]="(waitMinutes(row) ?? 0) > 30"
                    [class.text-ink-muted]="(waitMinutes(row) ?? 0) <= 30 || waitMinutes(row) === null">
                  {{ waitLabel(row) }}
                </td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-1">
                    @switch (asAnyStatus(row.status)) {
                      @case ('scheduled') {
                        @if (canWrite()) {
                          <button (click)="checkInRow(row)" [disabled]="busy() === row.id" class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50">Check in</button>
                          <button (click)="setRowStatus(row, 'no_show')" [disabled]="busy() === row.id" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">No-show</button>
                        }
                      }
                      @case ('checked_in') {
                        <a [routerLink]="['/opd-queue/triage', row.id]"
                           class="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-medium bg-amber-500 hover:bg-amber-600 text-white">🩺 Triage ›</a>
                      }
                      @case ('triaged') {
                        @if (canStartConsult()) {
                          <button (click)="startConsult(row)" [disabled]="busy() === row.id" class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50">Start ›</button>
                        }
                      }
                      @case ('in_consultation') {
                        <a [routerLink]="['/consultation', row.id]" class="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-medium bg-primary-100 text-primary-800 hover:bg-primary-200">Open chart</a>
                      }
                      @default {
                        <a [routerLink]="['/patients', row.patient?.id]" class="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">View</a>
                      }
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No appointments scheduled today.</p>
                  <p class="text-[11px] text-ink-muted mt-1">Schedule from a patient's chart or appointments page.</p>
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Token slip dialog (after check-in) ───────────────── -->
    @if (slipData(); as s) {
      <app-token-slip-dialog [data]="s" (close)="slipData.set(null)"></app-token-slip-dialog>
    }
  `,
})
export class OpdQueuePage implements OnInit, OnDestroy {
  protected readonly store = inject(AppointmentsStore);
  private svc = inject(AppointmentsService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private router = inject(Router);

  /** Push the active branch into the appointments store; reload follows. */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    untracked(() => this.store.setBranch(id));
  });
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly statusOptions = QUEUE_STATUS_OPTIONS;
  protected readonly busy = signal<string | null>(null);
  protected readonly _now = signal<Date>(new Date());

  protected readonly canWrite = computed(() => this.auth.has('appointments.write'));
  protected readonly canStartConsult = computed(() => this.auth.has('ehr.write'));

  protected readonly today = computed(() => format(new Date(), 'EEEE, d MMMM yyyy'));
  protected readonly now = computed(() => format(this._now(), "EEE d MMM · HH:mm 'IST'"));

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly statusCards = computed(() => {
    const c = this.store.counts() as any;
    return [
      { value: 'all' as const,             label: 'Total today',     count: c.total },
      { value: 'scheduled' as const,       label: 'Scheduled',       count: c.scheduled },
      { value: 'checked_in' as const,      label: 'Checked in',      count: c.checked_in },
      { value: 'triaged' as const,         label: 'Triaged',         count: c.triaged ?? 0 },
      { value: 'in_consultation' as const, label: 'In consultation', count: c.in_consultation },
      { value: 'completed' as const,       label: 'Completed',       count: c.completed },
    ];
  });

  private unsubscribe: (() => void) | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    void this.store.loadDoctors();
    void this.store.loadToday();
    this.unsubscribe = this.svc.subscribe(() => void this.store.loadToday());
    this.clockTimer = setInterval(() => this._now.set(new Date()), 30_000);
  }

  ngOnDestroy() {
    this.unsubscribe?.();
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  /** Widens the appointment status to a plain string so @switch can match values
   *  not yet present in the auto-generated AppointmentStatus enum (e.g. 'triaged'). */
  protected asAnyStatus(s: AppointmentStatus | string | null): string { return (s ?? '') as string; }

  protected setStatus(value: string) {
    this.store.setFilters({ status: value as any });
  }
  protected onDoctorChange(value: string) {
    this.store.setFilters({ doctorStaffId: value as 'all' | string });
  }
  protected onStatusSelectChange(value: string) {
    this.store.setFilters({ status: value as any });
  }

  protected cardCls(value: string) {
    const isActive = this.store.filters().status === (value as any);
    const base = 'text-left bg-surface-card border rounded-[10px] p-[14px_16px] transition-colors';
    return isActive
      ? `${base} border-primary-600 ring-2 ring-primary-100 text-ink`
      : `${base} border-border text-ink-soft hover:border-border-strong`;
  }

  protected statusChipCls(s: AppointmentStatus) {
    const t = STATUS_TONE[s];
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${t.bg} ${t.fg}`;
  }

  protected statusLabel(s: AppointmentStatus) {
    return STATUS_TONE[s].label;
  }

  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'HH:mm'); } catch { return '—'; }
  }

  protected waitMinutes(row: AppointmentRow): number | null {
    if (row.status !== 'scheduled' && row.status !== 'checked_in' && (row.status as string) !== 'triaged') return null;
    try {
      const ref = row.checked_in_at ? parseISO(row.checked_in_at) : parseISO(row.appointment_at);
      const m = differenceInMinutes(this._now(), ref);
      return m > 0 ? m : 0;
    } catch { return null; }
  }

  protected waitLabel(row: AppointmentRow): string {
    const m = this.waitMinutes(row);
    return m === null ? '—' : `${m}m`;
  }

  protected patientInitials(p: { first_name: string; last_name: string }) {
    return ((p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')).toUpperCase() || '–';
  }

  protected ageGenderLabel(dob: string, gender: string) {
    const age = ageFromDob(dob);
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (age === null && !g) return '—';
    if (age === null) return g;
    return `${age}${g}`;
  }

  /** Active token slip data; non-null while the dialog is open. */
  protected readonly slipData = signal<TokenSlipData | null>(null);

  protected async checkInRow(row: AppointmentRow) {
    this.busy.set(row.id);
    try {
      const slip = await this.svc.checkInWithSlip(row.id);
      this.slipData.set(slip);
      this.toast.success('Checked in', `Token #${slip.token_number ?? '–'} · ETA ~${slip.estimated_wait_min}m`);
      void this.store.loadToday();
    } catch (e) {
      this.toast.error('Could not check in', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async setRowStatus(row: AppointmentRow, status: AppointmentStatus) {
    this.busy.set(row.id);
    try {
      await this.svc.updateStatus(row.id, status);
      this.toast.success(`${STATUS_TONE[status].label}`, row.patient?.full_name ?? '');
      void this.store.loadToday();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async startConsult(row: AppointmentRow) {
    this.busy.set(row.id);
    try {
      await this.svc.updateStatus(row.id, 'in_consultation');
      this.router.navigate(['/consultation', row.id]);
    } catch (e) {
      this.toast.error('Could not start', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }
}
