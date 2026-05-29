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
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AppointmentsService } from '../data/appointments.service';
import { AppointmentsStore } from '../data/appointments.store';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { BranchContextService } from '../../../core/branches/branch-context.service';
import { ageFromDob } from '../../patients/utils/age-from-dob';
import type { AppointmentRow, DoctorBlockRow, DoctorInfo } from '../data/appointments.types';
import type { AppointmentStatus } from '../../../core/supabase/supabase.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface ApptExportRow {
  scheduled_at: string;
  token: string;
  uhid: string;
  patient_name: string;
  age_gender: string;
  mobile: string;
  doctor: string;
  visit_type: string;
  status: string;
  notes: string;
}

// ── Schedule grid constants ─────────────────────────────────────────────
const SCHED_START  = 8;
const SCHED_END    = 20;
const SLOT_H       = 44;
const TOTAL_SLOTS  = (SCHED_END - SCHED_START) * 2;
const TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_H;

const TIME_SLOTS = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
  const h = SCHED_START + Math.floor(i / 2);
  return { half: i % 2 !== 0, label: i % 2 === 0 ? `${String(h).padStart(2, '0')}:00` : '', top: i * SLOT_H };
});

// Visit-type colors (block fill)
const VISIT_BLOCK: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  new:        { bg: '#dbeafe', border: '#60a5fa', text: '#1e3a8a', dot: '#2563eb' },   // blue
  follow_up:  { bg: '#d1fae5', border: '#34d399', text: '#065f46', dot: '#059669' },   // emerald
  walk_in:    { bg: '#fef3c7', border: '#fbbf24', text: '#78350f', dot: '#d97706' },   // amber
  telehealth: { bg: '#cffafe', border: '#22d3ee', text: '#155e75', dot: '#0891b2' },   // cyan ("Web")
};

// Status overlay (the "critical" red look comes from status checked-in + no-show, etc.)
const STATUS_CHIP: Record<AppointmentStatus, { bg: string; fg: string; label: string }> = {
  scheduled:       { bg: 'bg-info-bg',        fg: 'text-info-fg',     label: 'Scheduled' },
  checked_in:      { bg: 'bg-warn-bg',        fg: 'text-warn-fg',     label: 'Checked in' },
  in_consultation: { bg: 'bg-good-bg',        fg: 'text-good-fg',     label: 'In consultation' },
  completed:       { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'Completed' },
  no_show:         { bg: 'bg-danger-bg',      fg: 'text-danger-fg',   label: 'No-show' },
  cancelled:       { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'Cancelled' },
  rescheduled:     { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'Rescheduled' },
};

// Cycling palette assigned to doctor columns
const DOCTOR_COLORS = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777'];

const STRIPE_BG =
  'background-image: repeating-linear-gradient(135deg, #e5e7eb 0, #e5e7eb 6px, #f3f4f6 6px, #f3f4f6 12px);';

@Component({
  selector: 'app-appointments-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent, ExportMenuComponent],
  template: `
<div class="flex flex-col gap-4 h-full">

  <!-- ═══ HEADER ═══════════════════════════════════════════════════════ -->
  <header class="flex items-end justify-between pb-3 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Appointments</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ dateHeading() }} ·
        <span class="font-medium text-ink-soft">{{ store.counts().total }}</span> booked across
        <span class="font-medium text-ink-soft">{{ activeDoctorsCount() }}</span> doctor{{ activeDoctorsCount() === 1 ? '' : 's' }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <app-export-menu [disabled]="store.rows().length === 0" (pick)="onExport($event)"/>
      <button class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
        Wait list ({{ waitListCount() }})
      </button>
      @if (canWrite()) {
        <button (click)="openBlockModal()"
          class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
          Block time
        </button>
        <button (click)="openModal()"
          class="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-primary-700 hover:bg-primary-600 text-white text-[12px] font-medium shadow-card">
          + New appointment
        </button>
      }
    </div>
  </header>

  @if (store.error()) {
    <app-alert tone="danger" title="Could not load appointments">{{ store.error() }}</app-alert>
  }

  <!-- ═══ KPI CARDS (6) ═══════════════════════════════════════════════ -->
  <div class="grid grid-cols-6 gap-3 shrink-0">
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] text-ink leading-none">{{ pad2(store.counts().total) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">Booked today</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] text-ink leading-none">{{ pad2(store.counts().completed) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">Completed</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] leading-none"
         [class.text-warn-fg]="store.counts().checked_in > 0"
         [class.text-ink]="store.counts().checked_in === 0">{{ pad2(store.counts().checked_in) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">Waiting</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] text-ink leading-none">{{ pad2(store.counts().web_bookings) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">Web bookings</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] leading-none"
         [class.text-danger-fg]="store.counts().no_show > 0"
         [class.text-ink]="store.counts().no_show === 0">{{ pad2(store.counts().no_show) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">No-shows</p>
    </div>
    <div class="bg-surface-card border border-border rounded-[10px] px-5 py-3.5">
      <p class="font-display text-[44px] font-medium tracking-[-0.02em] text-ink leading-none">{{ pad2(store.tomorrowRows().length) }}</p>
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mt-2">Tomorrow</p>
    </div>
  </div>

  <!-- ═══ MAIN BODY ════════════════════════════════════════════════════ -->
  <div class="flex gap-4 flex-1 min-h-0">

    <!-- ── Left sidebar ─────────────────────────────────────────────── -->
    <aside class="w-[260px] shrink-0 flex flex-col gap-3 min-h-0">

      <!-- Mini calendar -->
      <div class="bg-surface-card border border-border rounded-[10px] p-4 shrink-0">
        <div class="flex items-center justify-between mb-3">
          <button (click)="prevMonth()"
            class="size-6 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[16px] leading-none">‹</button>
          <span class="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{{ calMonthLabel() }}</span>
          <button (click)="nextMonth()"
            class="size-6 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[16px] leading-none">›</button>
        </div>
        <div class="grid grid-cols-7 mb-2">
          @for (d of ['M','T','W','T','F','S','S']; track $index) {
            <div class="text-[10px] text-ink-muted text-center">{{ d }}</div>
          }
        </div>
        <div class="grid grid-cols-7">
          @for (day of calDays(); track day.key) {
            <button (click)="selectCalDay(day.date)" [class]="calDayClass(day)" class="relative group h-8">
              <span>{{ day.date.getDate() }}</span>
              @if (day.count > 0 && !day.isSelected) {
                <span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary-500"></span>
              }
            </button>
          }
        </div>
      </div>

      <!-- Doctors list -->
      <div class="bg-surface-card border border-border rounded-[10px] p-4 flex-1 overflow-y-auto min-h-0">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-3">Doctors</p>
        @if (store.doctors().length === 0) {
          <p class="text-[12px] text-ink-muted">No doctors found.</p>
        }
        @for (doc of store.doctors(); track doc.id; let i = $index) {
          <label class="flex items-start gap-2 py-2 cursor-pointer select-none">
            <input type="checkbox"
                   [checked]="isDoctorVisible(doc.id)"
                   (change)="toggleDoctor(doc.id)"
                   class="mt-0.5 rounded border-border accent-primary-700 size-3.5" />
            <span class="size-2.5 rounded-full mt-1.5 shrink-0" [style.background]="doctorColor(doc.id, i)"></span>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold text-ink truncate leading-tight">{{ shortDoctor(doc.full_name) }}</p>
              <p class="text-[11px] text-ink-muted truncate">
                @if (doc.specialty) { {{ doc.specialty }} · }
                {{ store.doctorCounts().get(doc.id) ?? 0 }} booked
              </p>
            </div>
          </label>
        }
      </div>
    </aside>

    <!-- ── Schedule area ────────────────────────────────────────────── -->
    <div class="flex-1 bg-surface-card border border-border rounded-[10px] flex flex-col overflow-hidden min-h-0">

      <!-- Top toolbar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div class="flex items-center gap-2">
          <button (click)="prevDay()"
            class="size-8 grid place-items-center rounded-md border border-border text-ink-muted hover:bg-surface-muted text-[16px] leading-none">‹</button>
          <span class="font-display text-[18px] font-medium tracking-[-0.01em] text-ink mx-2">{{ dateHeading() }}</span>
          <button (click)="nextDay()"
            class="size-8 grid place-items-center rounded-md border border-border text-ink-muted hover:bg-surface-muted text-[16px] leading-none">›</button>
          <button (click)="goToday()"
            class="h-8 px-3 ml-1 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted">Today</button>
        </div>

        <div class="inline-flex items-center bg-surface-muted rounded-md p-0.5">
          @for (mode of viewModes; track mode.id) {
            <button (click)="setViewMode(mode.id)"
              class="h-7 px-3 rounded text-[12px] font-medium transition-colors"
              [class.bg-primary-700]="viewMode() === mode.id"
              [class.text-white]="viewMode() === mode.id"
              [class.text-ink-soft]="viewMode() !== mode.id"
              [class.hover:bg-surface-card]="viewMode() !== mode.id">
              {{ mode.label }}
            </button>
          }
        </div>
      </div>

      <!-- ─ DAY view ─ -->
      @if (viewMode() === 'day') {
        <div class="flex-1 overflow-y-auto min-h-0">
          @if (store.rows().length === 0) {
            <div class="px-6 py-16 text-center">
              <p class="text-[13px] text-ink-muted">No appointments scheduled for this day.</p>
            </div>
          } @else {
            <ul class="divide-y divide-border">
              @for (a of store.rows(); track a.id) {
                <li class="px-4 py-3 flex items-center gap-3 hover:bg-surface-muted cursor-pointer" (click)="selectApt(a)">
                  <div class="w-14 text-center shrink-0">
                    <p class="font-mono text-[13px] font-semibold text-ink">{{ formatTime(a.appointment_at) }}</p>
                    <p class="text-[10px] text-ink-muted">{{ a.duration_minutes }} min</p>
                  </div>
                  <span class="size-2.5 rounded-full shrink-0" [style.background]="visitDot(a.visit_type)"></span>
                  <div class="size-7 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[11px] shrink-0">
                    {{ aptInitials(a.patient) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-medium text-ink truncate">
                      {{ a.patient?.full_name || (a.patient?.first_name + ' ' + a.patient?.last_name) }}
                    </p>
                    <p class="text-[11px] text-ink-muted truncate">
                      {{ shortDoctor(a.doctor?.full_name || '') }} · {{ visitTypeLabel(a.visit_type) }}
                      @if (a.room) { · {{ a.room }} }
                    </p>
                  </div>
                  <span [class]="chipCls(a.status)">{{ chipLabel(a.status) }}</span>
                </li>
              }
            </ul>
          }
        </div>
      }

      <!-- ─ SCHEDULE view (matches screenshot) ─ -->
      @if (viewMode() === 'schedule') {
        <!-- Doctor column header row -->
        <div class="flex border-b border-border shrink-0">
          <div class="w-[58px] shrink-0 border-r border-border bg-surface-muted/30"></div>
          @for (doc of visibleDoctors(); track doc.id; let i = $index) {
            <div class="flex-1 min-w-0 border-r border-border last:border-r-0 px-3 py-2.5">
              <div class="flex items-center gap-2">
                <span class="size-2 rounded-full" [style.background]="doctorColor(doc.id, doctorIndex(doc.id))"></span>
                <span class="text-[13px] font-semibold text-ink truncate">{{ shortDoctor(doc.full_name) }}</span>
                @if (defaultRoom(doc); as r) {
                  <span class="text-[11px] text-ink-muted">{{ r }}</span>
                }
              </div>
            </div>
          }
          @if (visibleDoctors().length === 0) {
            <div class="flex-1 px-4 py-2.5 text-[12px] text-ink-muted">All doctors hidden — toggle in the sidebar to view their schedule.</div>
          }
        </div>

        <!-- Scrollable grid -->
        <div class="flex-1 overflow-y-auto min-h-0" #scrollHost>
          <div class="flex relative" [style.height.px]="TOTAL_HEIGHT">

            <!-- Time gutter -->
            <div class="w-[58px] shrink-0 border-r border-border relative bg-surface-muted/10">
              @for (slot of TIME_SLOTS; track slot.top) {
                @if (!slot.half) {
                  <div class="absolute right-1.5 text-[10px] text-ink-muted -translate-y-1/2 select-none"
                       [style.top.px]="slot.top">{{ slot.label }}</div>
                }
              }
            </div>

            <!-- Doctor columns -->
            @for (doc of visibleDoctors(); track doc.id; let dIdx = $index) {
              <div class="flex-1 min-w-0 border-r border-border last:border-r-0 relative">

                <!-- Slot lines -->
                @for (slot of TIME_SLOTS; track slot.top) {
                  <div class="absolute left-0 right-0 pointer-events-none"
                       [class]="slot.half ? 'border-t border-border/25' : 'border-t border-border/60'"
                       [style.top.px]="slot.top"></div>
                }

                <!-- Click-to-add overlay -->
                <button type="button"
                        (click)="quickNewAppointment(doc.id)"
                        class="absolute inset-0 w-full h-full hover:bg-primary-50/30 cursor-cell"
                        title="Add appointment"></button>

                <!-- BLOCKED entries -->
                @for (blk of (blocksByDoctor().get(doc.id) ?? []); track blk.id) {
                  <div class="absolute left-0.5 right-0.5 rounded border border-gray-300 overflow-hidden cursor-pointer"
                       [style]="blockStyles(blk)"
                       (click)="selectBlock(blk, $event)">
                    <div class="px-2 py-1 h-full">
                      <p class="text-[10px] font-bold uppercase tracking-[0.06em] text-gray-700">BLOCKED</p>
                      <p class="text-[10px] text-gray-600 truncate mt-0.5">
                        {{ blk.reason }}@if (blk.room) { · {{ blk.room }} }
                      </p>
                    </div>
                  </div>
                }

                <!-- Appointment blocks -->
                @for (apt of (aptsByDoctor().get(doc.id) ?? []); track apt.id) {
                  <div [style]="aptBlockStyle(apt)"
                       (click)="selectApt(apt, $event)"
                       class="absolute left-0.5 right-0.5 rounded border-l-[3px] cursor-pointer hover:opacity-90 hover:shadow-sm transition-all overflow-hidden">
                    <div class="px-2 py-1 h-full overflow-hidden">
                      <p class="text-[11px] font-semibold leading-tight truncate">
                        {{ aptTitle(apt) }}
                      </p>
                      <p class="text-[10px] opacity-75 truncate">
                        {{ visitTypeLabel(apt.visit_type) }} · {{ apt.duration_minutes }} min
                      </p>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- "Now" line (only on today's schedule) -->
            @if (showNowLine()) {
              <div class="absolute left-[58px] right-0 pointer-events-none z-10"
                   [style.top.px]="nowLineTop()">
                <div class="relative">
                  <div class="absolute left-[-4px] top-[-3px] size-2 rounded-full bg-red-600"></div>
                  <div class="border-t-2 border-red-600"></div>
                </div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ─ WEEK view ─ -->
      @if (viewMode() === 'week') {
        <div class="flex-1 overflow-auto min-h-0">
          <div class="grid grid-cols-7 border-b border-border sticky top-0 bg-surface-card z-10">
            @for (d of weekDays(); track d.date.toISOString()) {
              <div class="border-r border-border last:border-r-0 px-3 py-2 cursor-pointer"
                   [class.bg-primary-50]="d.isSelected"
                   (click)="selectCalDay(d.date)">
                <p class="text-[10px] uppercase tracking-[0.06em]"
                   [class.text-primary-700]="d.isSelected"
                   [class.text-ink-muted]="!d.isSelected">{{ d.dayLabel }}</p>
                <p class="font-display text-[18px] font-medium leading-tight"
                   [class.text-primary-700]="d.isSelected || d.isToday"
                   [class.text-ink]="!d.isSelected && !d.isToday">{{ d.date.getDate() }}</p>
                <p class="text-[10px] text-ink-muted mt-0.5">{{ d.count }} apts</p>
              </div>
            }
          </div>
          <div class="grid grid-cols-7" [style.height.px]="TOTAL_HEIGHT">
            @for (d of weekDays(); track d.date.toISOString()) {
              <div class="border-r border-border last:border-r-0 relative">
                @for (slot of TIME_SLOTS; track slot.top) {
                  <div class="absolute left-0 right-0 pointer-events-none"
                       [class]="slot.half ? 'border-t border-border/25' : 'border-t border-border/60'"
                       [style.top.px]="slot.top"></div>
                }
                @for (a of d.appointments; track a.id) {
                  <div [style]="aptBlockStyle(a)"
                       (click)="selectApt(a, $event)"
                       class="absolute left-0.5 right-0.5 rounded border-l-[3px] cursor-pointer hover:opacity-90 overflow-hidden">
                    <div class="px-1.5 py-0.5 h-full overflow-hidden">
                      <p class="text-[10px] font-semibold leading-tight truncate">{{ formatTime(a.appointment_at) }} {{ a.patient?.full_name || '—' }}</p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- ─ MONTH view ─ -->
      @if (viewMode() === 'month') {
        <div class="flex-1 overflow-auto min-h-0 p-4">
          <div class="grid grid-cols-7 mb-2">
            @for (d of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; track d) {
              <div class="text-[11px] text-ink-muted text-center font-medium uppercase tracking-[0.06em]">{{ d }}</div>
            }
          </div>
          <div class="grid grid-cols-7 gap-1">
            @for (day of calDays(); track day.key) {
              <button (click)="selectCalDay(day.date)"
                class="h-24 rounded-md border p-2 text-left transition-colors"
                [class.border-border]="!day.isSelected"
                [class.bg-surface-card]="day.inMonth && !day.isSelected"
                [class.bg-surface-muted]="!day.inMonth"
                [class.border-primary-600]="day.isSelected"
                [class.bg-primary-50]="day.isSelected">
                <div class="flex items-center justify-between">
                  <span class="font-display text-[15px]"
                    [class.font-semibold]="day.isToday"
                    [class.text-primary-700]="day.isToday"
                    [class.text-ink]="day.inMonth && !day.isToday"
                    [class.text-ink-muted]="!day.inMonth">{{ day.date.getDate() }}</span>
                  @if (day.count > 0) {
                    <span class="text-[10px] font-mono font-semibold text-primary-700 bg-primary-100 rounded-full px-1.5 py-0.5">{{ day.count }}</span>
                  }
                </div>
                @if (day.count > 0) {
                  <p class="text-[9px] text-ink-muted mt-2">{{ day.count }} appt{{ day.count === 1 ? '' : 's' }}</p>
                }
              </button>
            }
          </div>
        </div>
      }

    </div>
  </div>
</div>

<!-- ═══ APPOINTMENT DETAIL PANEL ═══════════════════════════════════════ -->
@if (selectedApt(); as apt) {
  <div class="fixed inset-0 z-30" (document:keydown.escape)="closePanel()"></div>
  <div class="fixed right-0 top-0 bottom-0 z-40 w-[380px] bg-surface-card border-l border-border shadow-2xl flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <div class="flex items-center gap-2">
        <span [class]="chipCls(apt.status)">{{ chipLabel(apt.status) }}</span>
        <span class="text-[12px] font-mono text-ink-muted">{{ formatTime(apt.appointment_at) }}</span>
      </div>
      <button (click)="closePanel()" class="size-7 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[20px] leading-none">×</button>
    </div>

    @if (apt.patient; as p) {
      <div class="px-4 py-3 border-b border-border shrink-0">
        <div class="flex items-center gap-3">
          <div class="size-10 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-bold text-[14px] shrink-0">
            {{ initials(p) }}
          </div>
          <div class="min-w-0">
            <a [routerLink]="['/patients', p.id]" class="block text-[14px] font-semibold text-ink hover:text-primary-700 truncate">
              {{ p.full_name || (p.first_name + ' ' + p.last_name) }}
            </a>
            <p class="text-[12px] text-ink-muted font-mono">{{ p.uhid }} · {{ ageGenderLabel(p.date_of_birth, p.gender) }}</p>
            @if (p.mobile) { <p class="text-[12px] text-ink-muted">{{ p.mobile }}</p> }
          </div>
        </div>
      </div>
    }

    <div class="px-4 py-3 border-b border-border space-y-2 shrink-0">
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Doctor</span><span class="text-[12px] text-ink text-right">{{ apt.doctor?.full_name || '—' }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Type</span><span class="text-[12px] text-ink">{{ visitTypeLabel(apt.visit_type) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Date &amp; Time</span><span class="text-[12px] text-ink font-mono">{{ formatDatetime(apt.appointment_at) }}</span></div>
      @if (apt.duration_minutes) { <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Duration</span><span class="text-[12px] text-ink">{{ apt.duration_minutes }} min</span></div> }
      @if (apt.room) { <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Room</span><span class="text-[12px] text-ink">{{ apt.room }}</span></div> }
      @if (apt.chief_complaint) { <div><span class="text-[12px] text-ink-muted">Chief complaint</span><p class="text-[12px] text-ink mt-0.5">{{ apt.chief_complaint }}</p></div> }
    </div>

    <div class="px-4 py-3 flex flex-col gap-2 shrink-0">
      @if (actionError()) { <p class="text-[12px] text-danger-fg mb-1">{{ actionError() }}</p> }
      @switch (apt.status) {
        @case ('scheduled') {
          <button (click)="checkIn(apt)" [disabled]="actionBusy()" class="h-9 w-full rounded-md bg-primary-700 hover:bg-primary-600 text-white text-[13px] font-medium disabled:opacity-50">Check In</button>
          <div class="flex gap-2">
            <button (click)="markNoShow(apt)" [disabled]="actionBusy()" class="flex-1 h-8 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted disabled:opacity-50">No-show</button>
            <button (click)="cancelApt(apt)" [disabled]="actionBusy()" class="flex-1 h-8 rounded-md border border-danger-fg/30 text-[12px] text-danger-fg hover:bg-danger-bg disabled:opacity-50">Cancel</button>
          </div>
        }
        @case ('checked_in') {
          <button (click)="startConsultation(apt)" class="h-9 w-full rounded-md bg-good-fg hover:opacity-90 text-white text-[13px] font-semibold">Start Consultation →</button>
          <button (click)="markNoShow(apt)" [disabled]="actionBusy()" class="h-8 w-full rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted disabled:opacity-50">Mark No-show</button>
        }
        @case ('in_consultation') {
          <button (click)="startConsultation(apt)" class="h-9 w-full rounded-md bg-good-fg hover:opacity-90 text-white text-[13px] font-semibold">Continue Consultation →</button>
          <button (click)="completeApt(apt)" [disabled]="actionBusy()" class="h-8 w-full rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted disabled:opacity-50">Mark Complete</button>
        }
        @case ('completed') {
          <a [routerLink]="['/consultation', apt.id]" class="h-9 w-full rounded-md border border-border text-[13px] text-ink-soft hover:bg-surface-muted inline-flex items-center justify-center">View Consultation</a>
        }
      }
    </div>
  </div>
}

<!-- ═══ BLOCK DETAIL (with Delete) ═════════════════════════════════════ -->
@if (selectedBlock(); as blk) {
  <div class="fixed inset-0 z-30" (document:keydown.escape)="closeBlockPanel()"></div>
  <div class="fixed right-0 top-0 bottom-0 z-40 w-[360px] bg-surface-card border-l border-border shadow-2xl flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <span class="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700">Time block</span>
      <button (click)="closeBlockPanel()" class="size-7 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[20px] leading-none">×</button>
    </div>
    <div class="px-4 py-3 border-b border-border space-y-2 shrink-0">
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Doctor</span><span class="text-[12px] text-ink">{{ doctorName(blk.doctor_staff_id) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Reason</span><span class="text-[12px] text-ink">{{ blk.reason }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">From</span><span class="text-[12px] text-ink font-mono">{{ formatTime(blk.starts_at) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">To</span><span class="text-[12px] text-ink font-mono">{{ formatTime(blk.ends_at) }}</span></div>
      @if (blk.room) { <div class="flex justify-between gap-2"><span class="text-[12px] text-ink-muted">Location</span><span class="text-[12px] text-ink">{{ blk.room }}</span></div> }
    </div>
    <div class="px-4 py-3 shrink-0">
      <button (click)="removeBlock(blk)" [disabled]="actionBusy()"
        class="h-8 w-full rounded-md border border-danger-fg/30 text-[12px] text-danger-fg hover:bg-danger-bg disabled:opacity-50">
        Remove block
      </button>
    </div>
  </div>
}

<!-- ═══ NEW APPOINTMENT MODAL ═════════════════════════════════════════ -->
@if (showModal()) {
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" (click)="closeModal()"></div>
    <div class="relative z-10 w-[520px] bg-surface-card rounded-[12px] border border-border shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-[15px] font-semibold text-ink">New Appointment</h2>
        <button (click)="closeModal()" class="size-7 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[20px] leading-none">×</button>
      </div>
      <div class="overflow-y-auto p-5 flex flex-col gap-4">
        <!-- Patient search -->
        <div class="relative">
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Patient *</label>
          <input type="text" [value]="ptSearch()" (input)="onPtSearchInput($any($event.target).value)"
            placeholder="Search by name, UHID, or mobile…" autocomplete="off"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-400 bg-surface-card" />
          @if (ptResults().length > 0) {
            <div class="absolute top-full left-0 right-0 z-20 bg-surface-card border border-border rounded-md shadow-lg mt-0.5 overflow-hidden max-h-[200px] overflow-y-auto">
              @for (pt of ptResults(); track pt.id) {
                <button type="button" (click)="selectPatient(pt)"
                  class="w-full text-left px-3 py-2 hover:bg-surface-muted border-b border-border last:border-b-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[13px] text-ink font-medium">{{ pt.full_name }}</span>
                    <span class="text-[11px] text-ink-muted font-mono">{{ pt.uhid }}</span>
                  </div>
                  @if (pt.mobile) { <p class="text-[11px] text-ink-muted">{{ pt.mobile }}</p> }
                </button>
              }
            </div>
          }
          @if (ptSelected()) { <p class="text-[11px] text-good-fg mt-0.5">✓ {{ ptSelected()!.full_name }} selected</p> }
        </div>
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Doctor *</label>
          <select [value]="fmDoctor()" (change)="fmDoctor.set($any($event.target).value)"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="" disabled>Select doctor</option>
            @for (doc of store.doctors(); track doc.id) { <option [value]="doc.id">{{ doc.full_name }}</option> }
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">Date *</label>
            <input type="date" [value]="fmDate()" (change)="fmDate.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">Time *</label>
            <input type="time" [value]="fmTime()" (change)="fmTime.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">Visit type</label>
            <select [value]="fmVisitType()" (change)="fmVisitType.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="new">New Visit</option><option value="follow_up">Follow-up</option>
              <option value="walk_in">Walk-in</option><option value="telehealth">Telehealth (Web)</option>
            </select>
          </div>
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">Duration</label>
            <select [value]="fmDuration()" (change)="fmDuration.set(+$any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option [value]="15">15 min</option><option [value]="30">30 min</option>
              <option [value]="45">45 min</option><option [value]="60">60 min</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Chief complaint</label>
          <input type="text" [value]="fmChief()" (input)="fmChief.set($any($event.target).value)" placeholder="e.g. Fever, headache…"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink placeholder-ink-muted bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Room</label>
          <input type="text" [value]="fmRoom()" (input)="fmRoom.set($any($event.target).value)" placeholder="e.g. Room 1"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink placeholder-ink-muted bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
        @if (formError()) { <p class="text-[12px] text-danger-fg">{{ formError() }}</p> }
      </div>
      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
        <button (click)="closeModal()" class="h-8 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted">Cancel</button>
        <button (click)="submitForm()" [disabled]="formBusy()"
          class="h-8 px-4 rounded-md bg-primary-700 hover:bg-primary-600 text-white text-[12px] font-medium disabled:opacity-50">
          {{ formBusy() ? 'Saving…' : 'Create appointment' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- ═══ BLOCK TIME MODAL ═══════════════════════════════════════════════ -->
@if (showBlockModal()) {
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" (click)="closeBlockModal()"></div>
    <div class="relative z-10 w-[480px] bg-surface-card rounded-[12px] border border-border shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <h2 class="text-[15px] font-semibold text-ink">Block time on calendar</h2>
          <p class="text-[11px] text-ink-muted mt-0.5">Mark a doctor as unavailable so the slot can't be double-booked.</p>
        </div>
        <button (click)="closeBlockModal()" class="size-7 grid place-items-center rounded hover:bg-surface-muted text-ink-muted text-[20px] leading-none">×</button>
      </div>
      <div class="overflow-y-auto p-5 flex flex-col gap-4">
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Doctor *</label>
          <select [value]="blkDoctor()" (change)="blkDoctor.set($any($event.target).value)"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="" disabled>Select doctor</option>
            @for (doc of store.doctors(); track doc.id) { <option [value]="doc.id">{{ doc.full_name }}</option> }
          </select>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Reason *</label>
          <select [value]="blkReason()" (change)="blkReason.set($any($event.target).value)"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option>Surgery prep</option><option>OT - emergency case</option><option>OT - planned</option>
            <option>Lunch</option><option>Leave - half day</option><option>Leave - full day</option>
            <option>Personal</option><option>Conference / meeting</option><option>Other</option>
          </select>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">Date *</label>
            <input type="date" [value]="blkDate()" (change)="blkDate.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">From *</label>
            <input type="time" [value]="blkStart()" (change)="blkStart.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label class="block text-[12px] font-medium text-ink-soft mb-1">To *</label>
            <input type="time" [value]="blkEnd()" (change)="blkEnd.set($any($event.target).value)"
              class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-ink-soft mb-1">Location / Room</label>
          <input type="text" [value]="blkRoom()" (input)="blkRoom.set($any($event.target).value)" placeholder="e.g. OT-1"
            class="w-full h-9 px-3 rounded-md border border-border text-[13px] text-ink placeholder-ink-muted bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
        @if (blkError()) { <p class="text-[12px] text-danger-fg">{{ blkError() }}</p> }
      </div>
      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
        <button (click)="closeBlockModal()" class="h-8 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-muted">Cancel</button>
        <button (click)="submitBlock()" [disabled]="blkBusy()"
          class="h-8 px-4 rounded-md bg-primary-700 hover:bg-primary-600 text-white text-[12px] font-medium disabled:opacity-50">
          {{ blkBusy() ? 'Saving…' : 'Block time' }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class AppointmentsPage implements OnInit, OnDestroy {
  protected readonly store = inject(AppointmentsStore);
  private readonly svc    = inject(AppointmentsService);
  private readonly auth   = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private   readonly branchGuard = inject(BranchContextService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly exportSvc = inject(ExportService);

  /** Active branch → store branch; reload follows. */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    untracked(() => this.store.setBranch(id));
  });

  protected readonly TOTAL_HEIGHT = TOTAL_HEIGHT;
  protected readonly TIME_SLOTS   = TIME_SLOTS;
  protected readonly canWrite     = computed(() => this.auth.has('appointments.write'));

  // View mode + sidebar state
  protected viewMode = signal<'day' | 'schedule' | 'week' | 'month'>('schedule');
  protected viewModes = [
    { id: 'day' as const,      label: 'Day' },
    { id: 'schedule' as const, label: 'Schedule' },
    { id: 'week' as const,     label: 'Week' },
    { id: 'month' as const,    label: 'Month' },
  ];

  protected calMonth = signal(new Date());
  private hiddenDoctorIds = signal<Set<string>>(new Set());

  // Detail panels
  protected selectedApt   = signal<AppointmentRow | null>(null);
  protected selectedBlock = signal<DoctorBlockRow | null>(null);
  protected actionBusy    = signal(false);
  protected actionError   = signal<string | null>(null);

  // Now ticker
  private nowTick    = signal<number>(Date.now());
  private tickerHandle: ReturnType<typeof setInterval> | null = null;

  // ── New Appointment modal ─────────────────────────────────────────
  protected showModal  = signal(false);
  protected formBusy   = signal(false);
  protected formError  = signal<string | null>(null);
  protected ptSearch   = signal('');
  protected ptResults  = signal<{ id: string; uhid: string; full_name: string; mobile: string }[]>([]);
  protected ptSelected = signal<{ id: string; uhid: string; full_name: string; mobile: string } | null>(null);
  protected fmDoctor    = signal('');
  protected fmDate      = signal(format(new Date(), 'yyyy-MM-dd'));
  protected fmTime      = signal('09:00');
  protected fmVisitType = signal('new');
  protected fmDuration  = signal(30);
  protected fmChief     = signal('');
  protected fmRoom      = signal('');

  // ── Block-time modal ──────────────────────────────────────────────
  protected showBlockModal = signal(false);
  protected blkBusy   = signal(false);
  protected blkError  = signal<string | null>(null);
  protected blkDoctor = signal('');
  protected blkDate   = signal(format(new Date(), 'yyyy-MM-dd'));
  protected blkStart  = signal('13:00');
  protected blkEnd    = signal('14:00');
  protected blkReason = signal('Lunch');
  protected blkRoom   = signal('');

  // ── Computed ──────────────────────────────────────────────────────
  protected readonly calDays = computed(() => {
    const month     = this.calMonth();
    const first     = startOfMonth(month);
    const last      = endOfMonth(month);
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    const gridEnd   = endOfWeek(last,   { weekStartsOn: 1 });
    const selected  = this.store.selectedDate();
    const counts    = this.store.monthCounts();
    const days: { date: Date; key: string; inMonth: boolean; isToday: boolean; isSelected: boolean; count: number }[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: new Date(d),
        key,
        inMonth: isSameMonth(d, month),
        isToday: isToday(d),
        isSelected: isSameDay(d, selected),
        count: counts.get(key) ?? 0,
      });
      d = addDays(d, 1);
    }
    return days;
  });

  protected readonly weekDays = computed(() => {
    const selected = this.store.selectedDate();
    const start    = startOfWeek(selected, { weekStartsOn: 1 });
    const days: { date: Date; dayLabel: string; isSelected: boolean; isToday: boolean; count: number; appointments: AppointmentRow[] }[] = [];
    const counts   = this.store.monthCounts();
    for (let i = 0; i < 7; i++) {
      const d   = addDays(start, i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const appointments = isSameDay(d, selected)
        ? this.store.rows()
        : [];
      days.push({
        date: d,
        dayLabel: format(d, 'EEE'),
        isSelected: isSameDay(d, selected),
        isToday: isToday(d),
        count: counts.get(key) ?? 0,
        appointments,
      });
    }
    return days;
  });

  protected readonly visibleDoctors = computed(() =>
    this.store.doctors().filter(d => !this.hiddenDoctorIds().has(d.id))
  );

  protected readonly activeDoctorsCount = computed(() => {
    const ids = new Set(this.store.rows().map(r => r.doctor_staff_id).filter(Boolean));
    return ids.size;
  });

  protected readonly aptsByDoctor = computed(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const apt of this.store.rows()) {
      const id = apt.doctor_staff_id ?? '__none__';
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(apt);
    }
    return map;
  });

  protected readonly blocksByDoctor = computed(() => {
    const map = new Map<string, DoctorBlockRow[]>();
    for (const blk of this.store.blocks()) {
      if (!map.has(blk.doctor_staff_id)) map.set(blk.doctor_staff_id, []);
      map.get(blk.doctor_staff_id)!.push(blk);
    }
    return map;
  });

  protected readonly waitListCount = computed(() =>
    this.store.rows().filter(r => r.status === 'scheduled' && !r.checked_in_at).length
  );

  protected readonly dateHeading   = computed(() => format(this.store.selectedDate(), 'EEEE, d MMMM'));
  protected readonly calMonthLabel = computed(() => format(this.calMonth(), 'MMMM yyyy').toUpperCase());

  protected readonly showNowLine = computed(() => {
    void this.nowTick();
    return isToday(this.store.selectedDate());
  });
  protected readonly nowLineTop  = computed(() => {
    void this.nowTick();
    const now = new Date();
    return ((getHours(now) - SCHED_START) * 60 + getMinutes(now)) / 30 * SLOT_H;
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.loadDoctors();
    void this.store.loadForDate(new Date());
    void this.store.loadMonthCounts(new Date());
    this.unsubscribe = this.svc.subscribe(() => {
      void this.store.loadForDate(this.store.selectedDate());
      void this.store.loadMonthCounts(this.calMonth());
    });
    this.tickerHandle = setInterval(() => this.nowTick.set(Date.now()), 60_000);
  }

  ngOnDestroy() {
    this.unsubscribe?.();
    if (this.tickerHandle) clearInterval(this.tickerHandle);
  }

  // ── View mode + nav ───────────────────────────────────────────────
  protected setViewMode(mode: 'day' | 'schedule' | 'week' | 'month') { this.viewMode.set(mode); }

  protected prevDay()   { this.store.prevDate(); this.calMonth.set(this.store.selectedDate()); }
  protected nextDay()   { this.store.nextDate(); this.calMonth.set(this.store.selectedDate()); }
  protected goToday()   { this.store.goToToday(); this.calMonth.set(new Date()); }
  protected selectCalDay(d: Date) {
    this.store.selectDate(d);
    if (!isSameMonth(d, this.calMonth())) {
      this.calMonth.set(startOfMonth(d));
      void this.store.loadMonthCounts(d);
    }
  }
  protected prevMonth() {
    this.calMonth.update(m => subMonths(m, 1));
    void this.store.loadMonthCounts(this.calMonth());
  }
  protected nextMonth() {
    this.calMonth.update(m => addMonths(m, 1));
    void this.store.loadMonthCounts(this.calMonth());
  }

  // ── Doctor visibility ─────────────────────────────────────────────
  protected toggleDoctor(id: string) {
    this.hiddenDoctorIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  protected isDoctorVisible(id: string) { return !this.hiddenDoctorIds().has(id); }
  protected doctorIndex(id: string)     { return this.store.doctors().findIndex(d => d.id === id); }
  protected doctorColor(_id: string, idx: number) { return DOCTOR_COLORS[idx % DOCTOR_COLORS.length]; }
  protected doctorName(id: string)      {
    const d = this.store.doctors().find(x => x.id === id);
    return d ? this.shortDoctor(d.full_name) : '—';
  }
  protected defaultRoom(_doc: DoctorInfo): string | null {
    // Use the most-used room from this doctor's appointments today
    const apts = this.store.rows().filter(r => r.doctor_staff_id === _doc.id && r.room);
    if (apts.length === 0) return null;
    const counts = new Map<string, number>();
    for (const a of apts) counts.set(a.room!, (counts.get(a.room!) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  // ── Schedule positioning ──────────────────────────────────────────
  protected aptBlockStyle(apt: AppointmentRow): string {
    const top    = this.minutesTop(apt.appointment_at);
    const height = Math.max(SLOT_H - 4, ((apt.duration_minutes ?? 30) / 30) * SLOT_H - 2);
    const c      = VISIT_BLOCK[apt.visit_type] ?? VISIT_BLOCK['new'];
    const dim    = apt.status === 'cancelled' || apt.status === 'no_show' ? 'opacity:0.55;' : '';
    return `top:${top}px; height:${height}px; background:${c.bg}; border-color:${c.border}; color:${c.text}; ${dim}`;
  }

  protected blockStyles(blk: DoctorBlockRow): string {
    const top    = this.minutesTop(blk.starts_at);
    const endTop = this.minutesTop(blk.ends_at);
    const height = Math.max(SLOT_H - 4, endTop - top - 2);
    return `top:${top}px; height:${height}px; ${STRIPE_BG}`;
  }

  private minutesTop(iso: string): number {
    try {
      const d = parseISO(iso);
      const top = ((getHours(d) - SCHED_START) * 60 + getMinutes(d)) / 30 * SLOT_H;
      return Math.max(0, top);
    } catch { return 0; }
  }

  // ── Actions ───────────────────────────────────────────────────────
  protected selectApt(apt: AppointmentRow, event?: MouseEvent) {
    event?.stopPropagation();
    this.selectedBlock.set(null);
    this.selectedApt.set(apt);
    this.actionError.set(null);
  }
  protected closePanel() { this.selectedApt.set(null); }

  protected selectBlock(blk: DoctorBlockRow, event?: MouseEvent) {
    event?.stopPropagation();
    this.selectedApt.set(null);
    this.selectedBlock.set(blk);
  }
  protected closeBlockPanel() { this.selectedBlock.set(null); }

  protected async checkIn(apt: AppointmentRow)    { await this.doAction(apt, 'checked_in'); }
  protected async markNoShow(apt: AppointmentRow) { await this.doAction(apt, 'no_show'); }
  protected async cancelApt(apt: AppointmentRow)  { await this.doAction(apt, 'cancelled'); }
  protected async completeApt(apt: AppointmentRow){ await this.doAction(apt, 'completed'); }

  protected startConsultation(apt: AppointmentRow) {
    void this.router.navigate(['/consultation', apt.id]);
  }

  private async doAction(apt: AppointmentRow, status: AppointmentStatus) {
    this.actionBusy.set(true);
    this.actionError.set(null);
    try {
      await this.svc.updateStatus(apt.id, status);
      const updated = await this.svc.getOne(apt.id);
      this.selectedApt.set(updated);
      void this.store.loadForDate(this.store.selectedDate());
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'Action failed');
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected async removeBlock(blk: DoctorBlockRow) {
    this.actionBusy.set(true);
    try {
      await this.svc.deleteBlock(blk.id);
      this.selectedBlock.set(null);
      void this.store.loadForDate(this.store.selectedDate());
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : 'Could not remove block');
    } finally {
      this.actionBusy.set(false);
    }
  }

  // ── New appointment modal ─────────────────────────────────────────
  protected async openModal(prefill?: { doctorId?: string; time?: string }) {
    const branchId = await this.branchGuard.require('New appointment');
    if (!branchId) return;
    this.fmDate.set(format(this.store.selectedDate(), 'yyyy-MM-dd'));
    this.fmTime.set(prefill?.time ?? '09:00');
    this.fmDoctor.set(prefill?.doctorId ?? this.store.doctors()[0]?.id ?? '');
    this.fmVisitType.set('new');
    this.fmDuration.set(30);
    this.fmChief.set('');
    this.fmRoom.set('');
    this.ptSearch.set('');
    this.ptResults.set([]);
    this.ptSelected.set(null);
    this.formError.set(null);
    this.showModal.set(true);
  }
  protected closeModal() { this.showModal.set(false); }
  protected quickNewAppointment(doctorId: string) {
    if (!this.canWrite()) return;
    this.openModal({ doctorId });
  }

  protected async onPtSearchInput(term: string) {
    this.ptSearch.set(term);
    this.ptSelected.set(null);
    if (term.trim().length < 2) { this.ptResults.set([]); return; }
    try {
      const results = await this.svc.searchPatients(term);
      this.ptResults.set(results);
    } catch { /* ignore */ }
  }
  protected selectPatient(pt: { id: string; uhid: string; full_name: string; mobile: string }) {
    this.ptSelected.set(pt);
    this.ptSearch.set(pt.full_name);
    this.ptResults.set([]);
  }

  protected async submitForm() {
    const pt = this.ptSelected();
    if (!pt)              { this.formError.set('Please select a patient'); return; }
    if (!this.fmDoctor()) { this.formError.set('Please select a doctor'); return; }
    if (!this.fmDate())   { this.formError.set('Please select a date'); return; }

    const aptAt = new Date(`${this.fmDate()}T${this.fmTime()}:00`).toISOString();
    this.formBusy.set(true);
    this.formError.set(null);
    try {
      await this.svc.create({
        patientId:       pt.id,
        doctorStaffId:   this.fmDoctor(),
        appointmentAt:   aptAt,
        visitType:       this.fmVisitType(),
        chiefComplaint:  this.fmChief() || null,
        durationMinutes: this.fmDuration(),
        room:            this.fmRoom() || null,
      });
      this.showModal.set(false);
      void this.store.loadForDate(this.store.selectedDate());
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Failed to create appointment');
    } finally {
      this.formBusy.set(false);
    }
  }

  // ── Block-time modal ──────────────────────────────────────────────
  protected openBlockModal() {
    this.blkDate.set(format(this.store.selectedDate(), 'yyyy-MM-dd'));
    this.blkStart.set('13:00');
    this.blkEnd.set('14:00');
    this.blkDoctor.set(this.store.doctors()[0]?.id ?? '');
    this.blkReason.set('Lunch');
    this.blkRoom.set('');
    this.blkError.set(null);
    this.showBlockModal.set(true);
  }
  protected closeBlockModal() { this.showBlockModal.set(false); }
  protected async submitBlock() {
    if (!this.blkDoctor())  { this.blkError.set('Select a doctor'); return; }
    if (!this.blkReason())  { this.blkError.set('Select a reason'); return; }
    if (this.blkEnd() <= this.blkStart()) { this.blkError.set('End time must be after start time'); return; }

    const startsAt = new Date(`${this.blkDate()}T${this.blkStart()}:00`).toISOString();
    const endsAt   = new Date(`${this.blkDate()}T${this.blkEnd()}:00`).toISOString();

    this.blkBusy.set(true);
    this.blkError.set(null);
    try {
      await this.svc.createBlock({
        doctorStaffId: this.blkDoctor(),
        startsAt,
        endsAt,
        reason: this.blkReason(),
        room:   this.blkRoom() || null,
      });
      this.showBlockModal.set(false);
      void this.store.loadForDate(this.store.selectedDate());
    } catch (e) {
      this.blkError.set(e instanceof Error ? e.message : 'Could not create block');
    } finally {
      this.blkBusy.set(false);
    }
  }

  // ── Display helpers ───────────────────────────────────────────────
  protected pad2(n: number): string { return String(n).padStart(2, '0'); }
  protected formatTime(iso: string)     { try { return format(parseISO(iso), 'HH:mm'); } catch { return '—'; } }
  protected formatDatetime(iso: string) { try { return format(parseISO(iso), 'd MMM yyyy, HH:mm'); } catch { return '—'; } }
  protected initials(p: { first_name: string; last_name: string }) {
    return ((p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')).toUpperCase() || '–';
  }
  protected aptInitials(p: { first_name: string; last_name: string } | null | undefined) {
    if (!p) return '–';
    return ((p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')).toUpperCase() || '–';
  }
  protected ageGenderLabel(dob: string, gender: string) {
    const age = ageFromDob(dob);
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (age === null && !g) return '—';
    if (age === null) return g;
    return `${age}${g}`;
  }
  protected chipCls(s: AppointmentStatus) {
    const t = STATUS_CHIP[s];
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${t.bg} ${t.fg}`;
  }
  protected chipLabel(s: AppointmentStatus) { return STATUS_CHIP[s]?.label ?? s; }
  protected visitTypeLabel(vt: string): string {
    const m: Record<string, string> = { new: 'New', follow_up: 'Follow-up', walk_in: 'Walk-in', telehealth: 'Web' };
    return m[vt] ?? vt;
  }
  protected visitDot(vt: string) { return VISIT_BLOCK[vt]?.dot ?? '#6b7280'; }
  protected shortDoctor(name: string): string {
    if (!name) return '—';
    const cleaned = name.replace(/^Dr\.?\s*/i, '').trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length === 0) return name;
    if (parts.length === 1) return `Dr ${parts[0]}`;
    return `Dr ${parts[0][0]}. ${parts[parts.length - 1]}`;
  }
  protected calDayClass(day: { inMonth: boolean; isToday: boolean; isSelected: boolean }): string {
    const base = 'text-[12px] flex items-center justify-center rounded transition-colors';
    if (day.isSelected) return `${base} bg-primary-700 text-white font-semibold`;
    if (day.isToday)    return `${base} bg-primary-100 text-primary-800 font-semibold cursor-pointer`;
    if (day.inMonth)    return `${base} text-ink hover:bg-surface-muted cursor-pointer`;
    return `${base} text-ink-muted/40 cursor-pointer`;
  }
  protected aptTitle(apt: AppointmentRow): string {
    if (apt.is_web_booking) {
      return `Web · ${apt.patient?.full_name?.split(' ').slice(-1)[0] ?? '—'}`;
    }
    if (apt.visit_type === 'walk_in' && apt.token_number) {
      return `Walk-in T-${apt.token_number}`;
    }
    return apt.patient?.full_name || `${apt.patient?.first_name ?? ''} ${apt.patient?.last_name ?? ''}`.trim() || '—';
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const rows = this.store.rows();
    if (rows.length === 0) return;

    const exportRows: ApptExportRow[] = rows.map(a => ({
      scheduled_at: a.appointment_at,
      token:        a.token_number != null ? String(a.token_number) : '',
      uhid:         a.patient?.uhid ?? '',
      patient_name: a.patient?.full_name || `${a.patient?.first_name ?? ''} ${a.patient?.last_name ?? ''}`.trim(),
      age_gender:   a.patient ? `${ageFromDob(a.patient.date_of_birth) ?? ''}${a.patient.gender ? a.patient.gender.charAt(0).toUpperCase() : ''}` : '',
      mobile:       a.patient?.mobile ?? '',
      doctor:       a.doctor?.full_name ?? '',
      visit_type:   (a.visit_type ?? '').replace(/_/g, ' '),
      status:       (a.status ?? '').replace(/_/g, ' '),
      notes:        a.chief_complaint ?? '',
    }));

    const columns: ExportColumn<ApptExportRow>[] = [
      { key: 'scheduled_at', header: 'Time',       width: 16, align: 'center', format: 'datetime' },
      { key: 'token',        header: 'Token',      width: 8,  align: 'right' },
      { key: 'uhid',         header: 'UHID',       width: 12, align: 'left' },
      { key: 'patient_name', header: 'Patient',    width: 26, align: 'left' },
      { key: 'age_gender',   header: 'Age/Sex',    width: 8,  align: 'center' },
      { key: 'mobile',       header: 'Mobile',     width: 14, align: 'left' },
      { key: 'doctor',       header: 'Doctor',     width: 22, align: 'left' },
      { key: 'visit_type',   header: 'Visit type', width: 14, align: 'left' },
      { key: 'status',       header: 'Status',     width: 14, align: 'left' },
      { key: 'notes',        header: 'Notes',      width: 24, align: 'left' },
    ];

    const dateLabel = format(this.store.selectedDate(), 'yyyy-MM-dd');

    const report: ExportableReport<ApptExportRow> = {
      filename: `Appointments_${this.branchStore.activeBranchName().replace(/\s+/g, '_')}_${dateLabel}`,
      title: 'Appointments',
      subtitle: `${rows.length} appointment${rows.length === 1 ? '' : 's'} for ${this.dateHeading()}`,
      meta: {
        periodLabel: this.dateHeading(),
        filters: [
          { label: 'Booked',       value: String(this.store.counts().total) },
          { label: 'Checked-in',   value: String(this.store.counts().checked_in) },
          { label: 'Completed',    value: String(this.store.counts().completed) },
          { label: 'No-shows',     value: String(this.store.counts().no_show) },
        ],
      },
      columns,
      rows: exportRows,
      footer: 'Sree Diagnostics · Appointments Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
