import {
  ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AmbulanceService } from '../data/ambulance.service';
import {
  AMB_STATUS_TONE, PRIORITY_TONE, TRIP_STATUS_LABEL, TRIP_STATUS_TONE,
  type Ambulance, type AmbulanceTrip, type TripStatus, type TripPriority,
} from '../data/ambulance.types';

interface PatientHit { id: string; uhid: string; full_name: string; mobile: string; }

@Component({
  selector: 'app-ambulance-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent, UpperCasePipe],
  template: `
<div class="flex flex-col gap-4">

  <!-- ── Hero header ────────────────────────────────────────────── -->
  <header class="relative overflow-hidden rounded-[14px] px-5 py-4"
          style="background: linear-gradient(120deg, #A4302B 0%, #DC2626 50%, #F97316 110%);">
    <svg class="absolute -right-8 -top-6 opacity-10" width="220" height="160" viewBox="0 0 200 160">
      <rect x="20" y="60" width="120" height="60" fill="white"/>
      <rect x="140" y="80" width="40" height="40" fill="white"/>
      <circle cx="50" cy="130" r="12" fill="white"/>
      <circle cx="150" cy="130" r="12" fill="white"/>
      <line x1="80" y1="90" x2="100" y2="90" stroke="#A4302B" stroke-width="4"/>
      <line x1="90" y1="80" x2="90" y2="100" stroke="#A4302B" stroke-width="4"/>
    </svg>
    <div class="relative flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-white leading-[1.05]">
          🚑 Ambulance dispatch
        </h1>
        <p class="text-[13px] text-white/85 mt-1">
          {{ activeTrips().length }} active · {{ availableAmbs().length }}/{{ ambulances().length }} ambulances available ·
          <span class="inline-flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-white animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      <button (click)="openNewCall()"
              class="h-12 px-5 rounded-full bg-white text-danger-fg text-[14px] font-semibold shadow-pop hover:bg-cyan-50 transition-colors flex items-center gap-2">
        📞 NEW EMERGENCY CALL
      </button>
    </div>
  </header>

  @if (error()) { <app-alert tone="danger" title="Could not load ambulance data">{{ error() }}</app-alert> }

  <!-- ── KPI strip ────────────────────────────────────────────── -->
  <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active trips</p>
      <p class="font-display text-[28px] font-medium leading-none mt-1.5"
         [class.text-danger-fg]="activeTrips().length > 0"
         [class.text-ink]="activeTrips().length === 0">{{ activeTrips().length }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Today's calls</p>
      <p class="font-display text-[28px] font-medium leading-none text-ink mt-1.5">{{ trips().length }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Completed</p>
      <p class="font-display text-[28px] font-medium leading-none text-good-fg mt-1.5">{{ completedTrips().length }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Critical</p>
      <p class="font-display text-[28px] font-medium leading-none mt-1.5"
         [class.text-danger-fg]="criticalActive() > 0"
         [class.text-ink]="criticalActive() === 0">{{ criticalActive() }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3 col-span-2 sm:col-span-1">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Fleet ready</p>
      <p class="font-display text-[28px] font-medium leading-none text-good-fg mt-1.5">{{ availableAmbs().length }}/{{ ambulances().length }}</p>
    </article>
  </div>

  <!-- ── Utilisation + revenue strip ──────────────────────── -->
  @if (utilisation(); as u) {
    <article class="rounded-[12px] overflow-hidden border border-border bg-surface-card flex flex-wrap items-stretch divide-x divide-border">
      <div class="px-5 py-4 flex-1 min-w-[160px]">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Revenue today</p>
        <p class="font-display text-[24px] font-medium leading-none mt-1.5 text-good-fg">{{ formatINR(u.totals.revenue_today_cents) }}</p>
        <p class="text-[10px] text-ink-muted mt-1">{{ u.totals.trips_today }} trip{{ u.totals.trips_today === 1 ? '' : 's' }} dispatched</p>
      </div>
      <div class="px-5 py-4 flex-1 min-w-[160px]">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Last 7 days</p>
        <p class="font-display text-[24px] font-medium leading-none mt-1.5 text-ink">{{ formatINR(u.totals.revenue_window_cents) }}</p>
        <p class="text-[10px] text-ink-muted mt-1">{{ u.totals.trips_window }} trip{{ u.totals.trips_window === 1 ? '' : 's' }}</p>
      </div>
      <div class="px-5 py-4 flex-1 min-w-[160px]">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Avg / trip (7d)</p>
        <p class="font-display text-[24px] font-medium leading-none mt-1.5 text-ink">
          {{ u.totals.trips_window > 0 ? formatINR(u.totals.revenue_window_cents / u.totals.trips_window) : '—' }}
        </p>
        <p class="text-[10px] text-ink-muted mt-1">across all ambulances</p>
      </div>
      <div class="px-5 py-4 flex-1 min-w-[200px]">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Top ambulance (7d)</p>
        @if (topAmb(); as t) {
          <p class="font-display text-[20px] font-medium leading-none mt-1.5 text-primary-700">{{ t.code }}</p>
          <p class="text-[10px] text-ink-muted mt-1">{{ t.trips_window }} trips · {{ formatINR(t.revenue_window_cents) }}</p>
        } @else {
          <p class="font-display text-[20px] font-medium leading-none mt-1.5 text-ink-muted">—</p>
          <p class="text-[10px] text-ink-muted mt-1">no trips yet</p>
        }
      </div>
    </article>
  }

  <!-- ── Two-column main: fleet (left) + trips (right) ─────────── -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">

    <!-- Fleet panel -->
    <aside class="lg:col-span-4 bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
      <header class="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Fleet</p>
          <span class="text-[10px] text-ink-muted">tap to edit</span>
        </div>
        @if (canManage()) {
          <button (click)="openNewAmb()" class="h-7 px-2.5 rounded-md text-[11px] font-semibold text-white shadow-card" style="background:#0E4F8C;">
            + Add ambulance
          </button>
        }
      </header>
      @if (loading() && ambulances().length === 0) {
        <div class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading…</div>
      } @else {
        <ul class="divide-y divide-border">
          @for (a of ambulances(); track a.id) {
            <li class="px-4 py-3 cursor-pointer hover:bg-surface-muted/50 transition-colors"
                (click)="openEditAmb(a)">
              <div class="flex items-center gap-3">
                <span class="size-2.5 rounded-full" [style.background]="ambDot(a.status)"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-[13px] font-mono font-semibold text-ink">{{ a.code }}</p>
                    <span [class]="ambChipCls(a.status)" [style]="ambChipStyle(a.status)">{{ ambLabel(a.status) }}</span>
                  </div>
                  <p class="text-[11px] text-ink-muted truncate">
                    {{ a.type | uppercase }} · {{ sizeLabel(a.size) }} · {{ a.reg_number || '—' }}
                    @if (a.make_model) { · <span class="text-ink-soft">{{ a.make_model }}</span> }
                  </p>
                  <!-- Capability chips -->
                  <div class="mt-1.5 flex items-center gap-1 flex-wrap">
                    @if (a.has_ac) {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-bold bg-info-bg text-info-fg">❄ AC</span>
                    }
                    @if (a.has_doctor_on_board) {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-bold bg-good-bg text-good-fg">🩺 DOC</span>
                    }
                    @if (a.type === 'icu') {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-bold bg-danger-bg text-danger-fg">🚨 ICU</span>
                    }
                    @if (a.type === 'als') {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-bold bg-warn-bg text-warn-fg">⚡ ALS</span>
                    }
                    @if (a.type === 'neonatal') {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-bold bg-warn-bg text-warn-fg">🍼 NICU</span>
                    }
                    @if (a.capacity) {
                      <span class="inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-medium bg-surface-subtle text-ink-muted font-mono">👥 {{ a.capacity }}</span>
                    }
                  </div>
                  @if (a.driver_name) {
                    <p class="text-[12px] text-ink-soft truncate mt-0.5">
                      🧑‍✈️ {{ a.driver_name }}
                      @if (a.driver_phone) {
                        · <a [href]="'tel:' + a.driver_phone" (click)="$event.stopPropagation()"
                             class="text-primary-700 hover:underline font-mono">{{ a.driver_phone }}</a>
                      }
                    </p>
                  }
                  @if (utilFor(a.id); as u) {
                    <div class="mt-2 flex items-center gap-1.5 text-[10px] flex-wrap">
                      <span class="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full bg-info-bg text-info-fg font-semibold">
                        🚑 {{ u.trips_today }} today
                      </span>
                      <span class="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full bg-good-bg text-good-fg font-semibold">
                        💰 {{ formatINR(u.revenue_today_cents) }}
                      </span>
                      <span class="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-full bg-surface-subtle text-ink-muted font-mono">
                        7d · {{ u.trips_window }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            </li>
          }
        </ul>
      }
    </aside>

    <!-- Trips panel -->
    <section class="lg:col-span-8 flex flex-col gap-3">

      <!-- Active trips -->
      <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active trips</p>
            <p class="text-[11px] text-ink-muted mt-0.5">{{ activeTrips().length }} in progress</p>
          </div>
        </header>
        @if (activeTrips().length === 0) {
          <div class="px-6 py-12 text-center">
            <div class="text-[40px] mb-2">🟢</div>
            <p class="text-[13px] text-ink-soft">No active dispatches.</p>
            <p class="text-[11px] text-ink-muted mt-1">Tap <b>NEW EMERGENCY CALL</b> when a request comes in.</p>
          </div>
        } @else {
          <ul class="divide-y divide-border">
            @for (t of activeTrips(); track t.id) {
              <li class="px-4 py-3" [style.border-left]="'4px solid ' + priorityColor(t.priority)">
                <!-- top row: trip number + priority + status -->
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[11px] font-mono text-ink-muted">{{ t.trip_number }}</span>
                    <span [class]="priorityChipCls(t.priority)" [style]="priorityChipStyle(t.priority)">{{ priorityLabel(t.priority) }}</span>
                    <span [class]="statusChipCls(t.status)">{{ statusLabel(t.status) }}</span>
                  </div>
                  <span class="text-[11px] text-ink-muted">{{ relativeTime(t.requested_at) }}</span>
                </div>

                <!-- patient + pickup -->
                <div class="mt-2 flex items-start gap-3">
                  <div class="size-9 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-bold text-[12px] shrink-0">
                    {{ initials(t.patient_name) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[14px] font-semibold text-ink truncate">
                      {{ t.patient_name }}
                      @if (t.patient_age) { · {{ t.patient_age }}{{ t.patient_gender ? ((t.patient_gender)[0] | uppercase) : '' }} }
                    </p>
                    <p class="text-[12px] text-ink-soft mt-0.5">
                      📍 {{ t.pickup_address }}@if (t.pickup_landmark) { · <span class="text-ink-muted">{{ t.pickup_landmark }}</span> }
                    </p>
                    @if (t.chief_complaint) {
                      <p class="text-[11px] text-ink-muted mt-0.5 italic">"{{ t.chief_complaint }}"</p>
                    }
                    <div class="text-[11px] text-ink-muted mt-1 flex items-center gap-3 flex-wrap">
                      @if (t.caller_phone) {
                        <a [href]="'tel:' + t.caller_phone" class="text-primary-700 hover:underline font-mono">📞 {{ t.caller_phone }}</a>
                      }
                      @if (t.driver_name) {
                        <span class="inline-flex items-center gap-1">🧑‍✈️ {{ t.driver_name }}
                          @if (t.driver_phone) {
                            <a [href]="'tel:' + t.driver_phone" class="text-primary-700 hover:underline font-mono">{{ t.driver_phone }}</a>
                          }
                        </span>
                      }
                    </div>
                  </div>
                </div>

                <!-- Status timeline (5 dots) -->
                <div class="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-muted">
                  @for (step of timelineSteps; track step.key) {
                    <div class="flex items-center gap-1.5">
                      <span class="size-2 rounded-full transition-colors"
                            [class.bg-good-fg]="reachedStep(t.status, step.key)"
                            [class.bg-border]="!reachedStep(t.status, step.key)"></span>
                      <span [class.text-good-fg]="reachedStep(t.status, step.key)"
                            [class.font-semibold]="t.status === step.key">{{ step.label }}</span>
                    </div>
                    @if (!$last) { <span class="text-border">—</span> }
                  }
                </div>

                <!-- Action buttons (one tap to advance) -->
                <div class="mt-3 flex gap-2 flex-wrap">
                  @switch (t.status) {
                    @case ('requested') {
                      <button (click)="openAssign(t)"
                              class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                              style="background:#0E4F8C;">
                        🚑 Assign ambulance
                      </button>
                      <button (click)="cancelTrip(t)" class="h-8 px-3 rounded-md text-[11px] font-medium border border-danger-fg/30 text-danger-fg hover:bg-danger-bg">
                        Cancel
                      </button>
                    }
                    @case ('assigned') {
                      <button (click)="advanceStatus(t, 'en_route_pickup')"
                              class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                              style="background:#16A34A;">
                        ▶ Driver dispatched
                      </button>
                      <button (click)="openAssign(t)" class="h-8 px-3 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-muted">
                        Reassign
                      </button>
                    }
                    @case ('en_route_pickup') {
                      <button (click)="advanceStatus(t, 'on_scene')"
                              class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                              style="background:#D97706;">
                        📍 Arrived at pickup
                      </button>
                    }
                    @case ('on_scene') {
                      <button (click)="advanceStatus(t, 'en_route_back')"
                              class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                              style="background:#0E4F8C;">
                        🏥 Patient picked up — returning
                      </button>
                    }
                    @case ('en_route_back') {
                      <button (click)="advanceStatus(t, 'arrived')"
                              class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                              style="background:#16A34A;">
                        ✓ Arrived at hospital
                      </button>
                    }
                  }
                </div>
              </li>
            }
          </ul>
        }
      </article>

      <!-- Arrived / awaiting bill -->
      @if (awaitingBilling().length > 0) {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-good-fg">✓ Arrived — generate bill</p>
            <p class="text-[11px] text-ink-muted mt-0.5">Pick OP for direct discharge home, IP if patient is being admitted</p>
          </header>
          <ul class="divide-y divide-border">
            @for (t of awaitingBilling(); track t.id) {
              <li class="px-4 py-3" [style.border-left]="'4px solid ' + priorityColor(t.priority)">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <p class="text-[13px] font-semibold text-ink">{{ t.patient_name }}</p>
                    <p class="text-[11px] text-ink-muted font-mono">{{ t.trip_number }} · arrived {{ relativeTime(t.arrived_at) }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    @if (!t.patient_id) {
                      <button (click)="openLink(t)" class="h-8 px-3 rounded-md text-[11px] font-medium border border-warn-fg/40 text-warn-fg hover:bg-warn-bg">
                        Link to patient
                      </button>
                    } @else {
                      <button (click)="openBill(t, 'op')"
                              class="h-8 px-3 rounded-md text-[11px] font-semibold text-white shadow-card"
                              style="background:#16A34A;">
                        💳 OP bill
                      </button>
                      <button (click)="openBill(t, 'ip')"
                              class="h-8 px-3 rounded-md text-[11px] font-semibold text-white shadow-card"
                              style="background:#0E4F8C;">
                        🛏 IP bill
                      </button>
                    }
                  </div>
                </div>
              </li>
            }
          </ul>
        </article>
      }

      <!-- Completed today -->
      @if (completedTrips().length > 0) {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Completed today</p>
          </header>
          <ul class="divide-y divide-border">
            @for (t of completedTrips(); track t.id) {
              <li class="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
                <div class="min-w-0">
                  <p class="text-[13px] text-ink truncate">{{ t.patient_name }} · <span class="font-mono text-[11px] text-ink-muted">{{ t.trip_number }}</span></p>
                  <p class="text-[11px] text-ink-muted">{{ t.pickup_address }}</p>
                </div>
                <div class="text-right shrink-0">
                  @if (t.invoice_id) {
                    <p class="text-[11px] text-good-fg font-medium">{{ formatINR(t.charge_cents ?? 0) }} · {{ t.bill_type | uppercase }} billed</p>
                  } @else {
                    <p class="text-[11px] text-warn-fg">Not billed</p>
                  }
                  <p class="text-[10px] text-ink-muted">{{ relativeTime(t.arrived_at ?? t.cancelled_at ?? t.requested_at) }}</p>
                </div>
              </li>
            }
          </ul>
        </article>
      }
    </section>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- New emergency call modal                                         -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'new') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[640px] bg-surface-card rounded-[14px] shadow-pop max-h-[92vh] overflow-y-auto"
         (click)="$event.stopPropagation()">

      <!-- header -->
      <header class="px-5 py-4 text-white" style="background:linear-gradient(120deg, #A4302B, #DC2626);">
        <h2 class="font-display text-[20px] font-medium tracking-[-0.01em] flex items-center gap-2">📞 New emergency call</h2>
        <p class="text-[12px] text-white/85 mt-0.5">Capture quickly — assign the ambulance in the next step.</p>
      </header>

      <div class="p-5 grid grid-cols-12 gap-3">
        <!-- Priority chips -->
        <div class="col-span-12">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Priority *</span>
          <div class="flex gap-2">
            @for (p of priorityOptions; track p) {
              <button type="button" (click)="f_priority = p" [class]="priorityBtnCls(p)">
                {{ priorityLabel(p) }}
              </button>
            }
          </div>
        </div>

        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Patient name *</span>
          <input type="text" [(ngModel)]="f_patient" name="pn" placeholder="Mr. Suresh / Unknown male"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Age</span>
          <input type="number" [(ngModel)]="f_age" name="age" min="0" max="120"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-2 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Sex</span>
          <select [(ngModel)]="f_gender" name="g"
                  class="w-full h-10 px-2 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">—</option><option value="male">M</option><option value="female">F</option><option value="other">O</option>
          </select>
        </label>

        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Pickup address *</span>
          <input type="text" [(ngModel)]="f_address" name="addr" placeholder="House #, street, locality"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Landmark</span>
          <input type="text" [(ngModel)]="f_landmark" name="lm" placeholder="Near... / opposite..."
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Caller name</span>
          <input type="text" [(ngModel)]="f_caller" name="cn" placeholder="(if different from patient)"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Caller phone</span>
          <input type="tel" [(ngModel)]="f_phone" name="cp" placeholder="+91-9XXXXXXXXX"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Chief complaint / condition</span>
          <input type="text" [(ngModel)]="f_complaint" name="cc" placeholder="e.g. Chest pain, RTA, breathlessness"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        @if (formError()) { <p class="col-span-12 text-[12px] text-danger-fg">{{ formError() }}</p> }
      </div>

      <footer class="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
        <button (click)="closeModal()" class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmNew()" [disabled]="!f_patient || !f_address || busy()"
                class="h-10 px-5 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:linear-gradient(120deg, #A4302B, #DC2626);">
          {{ busy() ? 'Dispatching…' : '🚑 Log call' }}
        </button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- Assign ambulance modal                                          -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'assign' && current(); as t) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[560px] bg-surface-card rounded-[14px] shadow-pop max-h-[92vh] overflow-y-auto"
         (click)="$event.stopPropagation()">
      <header class="px-5 py-4 text-white" style="background:linear-gradient(120deg, #0C2A52, #0E4F8C);">
        <h2 class="font-display text-[18px] font-medium">Assign ambulance</h2>
        <p class="text-[12px] text-white/85 mt-0.5">{{ t.patient_name }} · {{ t.pickup_address }}</p>
      </header>
      <div class="p-5">
        @if (availableAmbs().length === 0) {
          <div class="text-center py-6 text-[13px] text-ink-muted">All ambulances busy. Mark one available first.</div>
        } @else {
          <ul class="space-y-2">
            @for (a of availableAmbs(); track a.id) {
              <li>
                <button type="button" (click)="assign(t, a)" [disabled]="busy()"
                        class="w-full text-left px-4 py-3 rounded-md border border-border hover:border-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50">
                  <div class="flex items-center gap-3">
                    <span class="size-9 rounded-md grid place-items-center text-white text-[12px] font-bold shrink-0"
                          style="background:#0E4F8C;">{{ a.code.slice(-2) }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[14px] font-mono font-semibold text-ink">{{ a.code }} <span class="text-[11px] text-ink-muted font-sans">· {{ a.type | uppercase }}</span></p>
                      <p class="text-[11px] text-ink-muted truncate">
                        {{ a.driver_name || '— driver TBD' }}
                        @if (a.driver_phone) { · {{ a.driver_phone }} }
                      </p>
                    </div>
                    <span class="text-[12px] font-semibold text-good-fg">Dispatch ▶</span>
                  </div>
                </button>
              </li>
            }
          </ul>
        }
      </div>
      <footer class="px-5 py-3 border-t border-border flex justify-end">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- Link-to-patient modal                                            -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'link' && current(); as t) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">Link to patient</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Search the registered patient before billing this trip.</p>

      <input type="search" [(ngModel)]="ptQ" name="q" (ngModelChange)="onPtSearch($event)"
             placeholder="Name, UHID or mobile…" autofocus
             class="mt-4 w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

      @if (ptHits().length > 0) {
        <ul class="mt-2 max-h-60 overflow-y-auto rounded-md border border-border divide-y divide-border">
          @for (p of ptHits(); track p.id) {
            <li>
              <button type="button" (click)="linkPatient(t, p)" [disabled]="busy()"
                      class="w-full text-left px-3 py-2.5 hover:bg-surface-muted disabled:opacity-50">
                <p class="text-[13px] font-medium text-ink truncate">{{ p.full_name }}</p>
                <p class="text-[11px] font-mono text-ink-muted truncate">{{ p.uhid }} · {{ p.mobile }}</p>
              </button>
            </li>
          }
        </ul>
      } @else if (ptQ.length >= 2) {
        <p class="mt-2 text-[12px] text-ink-muted">No matches.</p>
      }

      <footer class="mt-4 flex justify-end">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- Bill modal                                                       -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'bill' && current(); as t) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[420px] bg-surface-card rounded-[14px] shadow-pop p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">Generate {{ billType().toUpperCase() }} bill</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">{{ t.patient_name }} · {{ t.trip_number }}</p>

      <label class="block mt-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Amount (₹)</span>
        <input type="number" [(ngModel)]="billRupees" name="b" min="0" step="50"
               class="w-full h-11 px-3 text-[16px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>

      <p class="mt-2 text-[11px] text-ink-muted">
        @switch (billType()) {
          @case ('op') { OP — direct bill to patient (walk-out after pickup) }
          @case ('ip') { IP — added to patient's admission account, finalized at discharge }
        }
      </p>

      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmBill(t)" [disabled]="!billRupees || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0E4F8C;">
          {{ busy() ? 'Generating…' : 'Generate bill' }}
        </button>
      </footer>
    </div>
  </div>
}

<!-- ══════════════════════════════════════════════════════════════ -->
<!-- Add / edit ambulance modal                                        -->
<!-- ══════════════════════════════════════════════════════════════ -->
@if (modal() === 'fleet') {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[680px] bg-surface-card rounded-[14px] shadow-pop max-h-[92vh] overflow-y-auto"
         (click)="$event.stopPropagation()">
      <header class="px-5 py-4 text-white" style="background:linear-gradient(120deg, #0C2A52, #0E4F8C);">
        <h2 class="font-display text-[20px] font-medium">{{ ambEditId() ? '🚑 Edit ambulance' : '🚑 Add ambulance' }}</h2>
        <p class="text-[12px] text-white/85 mt-0.5">All fields can be edited later.</p>
      </header>

      <div class="p-5 grid grid-cols-12 gap-3">
        <!-- Type quick-pick chips -->
        <div class="col-span-12">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Type *</span>
          <div class="flex gap-2 flex-wrap">
            @for (t of typeOptions; track t.key) {
              <button type="button" (click)="af_type = t.key" [class]="typeBtnCls(t.key)">
                {{ t.icon }} {{ t.label }}
              </button>
            }
          </div>
        </div>

        <!-- Code + reg + size -->
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
          <input type="text" [(ngModel)]="af_code" name="acode" placeholder="AMB-06"
                 class="w-full h-10 px-3 text-[14px] font-mono uppercase bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reg. number</span>
          <input type="text" [(ngModel)]="af_reg" name="areg" placeholder="KA-01-AB-1234"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Size *</span>
          <select [(ngModel)]="af_size" name="asize"
                  class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="small">Small (Eeco / Bolero)</option>
            <option value="medium">Medium (Force Traveller)</option>
            <option value="large">Large (Tata Winger / minibus)</option>
          </select>
        </label>

        <!-- Capability toggles -->
        <div class="col-span-12 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label class="flex items-center gap-2 px-3 py-2.5 rounded-md border cursor-pointer transition-colors"
                 [class.border-primary-600]="af_ac" [class.bg-primary-50]="af_ac" [class.border-border]="!af_ac">
            <input type="checkbox" [(ngModel)]="af_ac" name="aac" class="size-4 rounded border-border accent-primary-600" />
            <span class="text-[13px] font-medium text-ink">❄ Air-conditioned</span>
          </label>
          <label class="flex items-center gap-2 px-3 py-2.5 rounded-md border cursor-pointer transition-colors"
                 [class.border-primary-600]="af_doctor" [class.bg-primary-50]="af_doctor" [class.border-border]="!af_doctor">
            <input type="checkbox" [(ngModel)]="af_doctor" name="adoc" class="size-4 rounded border-border accent-primary-600" />
            <span class="text-[13px] font-medium text-ink">🩺 Doctor on board</span>
          </label>
          <label class="flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-surface-card">
            <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Capacity</span>
            <input type="number" [(ngModel)]="af_capacity" name="acap" min="1" max="20"
                   class="w-16 h-7 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none" />
            <span class="text-[11px] text-ink-muted">pax</span>
          </label>
        </div>

        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Make / model</span>
          <input type="text" [(ngModel)]="af_make" name="amake" placeholder="e.g. Force Traveller, Tata Winger ICU"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Default OP charge (₹)</span>
          <input type="number" [(ngModel)]="af_charge" name="acharge" min="0" step="50"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <!-- Driver -->
        <div class="col-span-12 p-3 rounded-md border border-border bg-surface-muted/40">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Driver</p>
          <div class="grid grid-cols-12 gap-2">
            <label class="col-span-12 block">
              <span class="block text-[10px] text-ink-muted mb-1">Pick from staff (role: driver) — or fill the manual fields below</span>
              <select [(ngModel)]="af_driverStaff" name="adrv" (ngModelChange)="onPickDriver($event)"
                      class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">— No staff driver / external —</option>
                @for (d of drivers(); track d.id) {
                  <option [value]="d.id">{{ d.full_name }}@if (d.phone) { · {{ d.phone }} }</option>
                }
              </select>
            </label>
            <label class="col-span-7 block">
              <span class="block text-[10px] text-ink-muted mb-1">Driver name</span>
              <input type="text" [(ngModel)]="af_driverName" name="adrvn"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-5 block">
              <span class="block text-[10px] text-ink-muted mb-1">Driver phone</span>
              <input type="tel" [(ngModel)]="af_driverPhone" name="adrvp" placeholder="+91-9XXXXXXXXX"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>
        </div>

        <!-- Status (edit only) + notes -->
        @if (ambEditId()) {
          <label class="col-span-4 block">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Status</span>
            <select [(ngModel)]="af_status" name="astatus"
                    class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
              <option value="available">Available</option>
              <option value="dispatched">Dispatched</option>
              <option value="on_trip">On trip</option>
              <option value="maintenance">Maintenance</option>
              <option value="offline">Offline</option>
            </select>
          </label>
          <label class="col-span-8 block">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
            <input type="text" [(ngModel)]="af_notes" name="anotes" placeholder="Service due, equipment, etc."
                   class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
        } @else {
          <label class="col-span-12 block">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
            <input type="text" [(ngModel)]="af_notes" name="anotes" placeholder="Service due, equipment, etc."
                   class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
        }

        @if (formError()) { <p class="col-span-12 text-[12px] text-danger-fg">{{ formError() }}</p> }
      </div>

      <footer class="px-5 py-4 border-t border-border flex items-center justify-between gap-2">
        @if (ambEditId()) {
          <button (click)="confirmDeleteAmb()" [disabled]="busy()"
                  class="h-10 px-3 rounded-md text-[12px] font-medium border border-danger-fg/30 text-danger-fg hover:bg-danger-bg disabled:opacity-50">
            Delete (archive)
          </button>
        } @else { <span></span> }
        <div class="flex items-center gap-2">
          <button (click)="closeModal()" class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
          <button (click)="confirmAmb()" [disabled]="!af_code || busy()"
                  class="h-10 px-4 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
                  style="background:#0E4F8C;">
            {{ busy() ? 'Saving…' : (ambEditId() ? 'Save changes' : 'Add ambulance') }}
          </button>
        </div>
      </footer>
    </div>
  </div>
}
  `,
})
export class AmbulancePage implements OnInit, OnDestroy {
  private svc   = inject(AmbulanceService);
  private auth  = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly ambulances  = signal<Ambulance[]>([]);
  protected readonly trips       = signal<AmbulanceTrip[]>([]);
  protected readonly utilisation = signal<{
    totals: { trips_today: number; trips_window: number; revenue_today_cents: number; revenue_window_cents: number; fleet_total: number; fleet_available: number };
    per_ambulance: { id: string; code: string; trips_today: number; trips_window: number; revenue_today_cents: number; revenue_window_cents: number; hours_today: number }[];
  } | null>(null);
  protected readonly loading    = signal(true);
  protected readonly error      = signal<string | null>(null);
  protected readonly busy       = signal(false);
  protected readonly modal      = signal<'new' | 'assign' | 'link' | 'bill' | 'fleet' | null>(null);
  protected readonly current    = signal<AmbulanceTrip | null>(null);
  protected readonly formError  = signal<string | null>(null);
  protected readonly billType   = signal<'op' | 'ip'>('op');

  protected readonly availableAmbs = computed(() => this.ambulances().filter(a => a.status === 'available'));
  protected readonly topAmb = computed(() => {
    const arr = this.utilisation()?.per_ambulance ?? [];
    if (arr.length === 0) return null;
    return arr.reduce((best, x) => (x.revenue_window_cents > (best?.revenue_window_cents ?? -1) ? x : best),
                      arr[0] as { code: string; trips_window: number; revenue_window_cents: number });
  });
  protected readonly activeTrips   = computed(() => this.trips().filter(t =>
    ['requested','assigned','en_route_pickup','on_scene','en_route_back'].includes(t.status)));
  protected readonly awaitingBilling = computed(() => this.trips().filter(t =>
    t.status === 'arrived' && !t.invoice_id));
  protected readonly completedTrips = computed(() => this.trips().filter(t =>
    (t.status === 'arrived' && t.invoice_id) || t.status === 'cancelled'));
  protected readonly criticalActive = computed(() =>
    this.activeTrips().filter(t => t.priority === 'critical').length);

  // Form fields
  protected f_priority: TripPriority = 'urgent';
  protected f_patient = '';
  protected f_age: number | null = null;
  protected f_gender: '' | 'male' | 'female' | 'other' = '';
  protected f_address = '';
  protected f_landmark = '';
  protected f_caller = '';
  protected f_phone = '';
  protected f_complaint = '';

  // Patient search (link modal)
  protected ptQ = '';
  protected readonly ptHits = signal<PatientHit[]>([]);

  // Bill
  protected billRupees: number | null = 800;

  // ── Fleet admin form state ─────────────────────────────────
  protected readonly ambEditId = signal<string | null>(null);
  protected readonly drivers   = signal<{ id: string; full_name: string; phone: string | null }[]>([]);
  protected readonly canManage = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.has('staff.write')
  );
  protected readonly typeOptions = [
    { key: 'basic'    as const, label: 'Basic',    icon: '🚐' },
    { key: 'als'      as const, label: 'ALS',      icon: '⚡' },
    { key: 'icu'      as const, label: 'ICU',      icon: '🚨' },
    { key: 'neonatal' as const, label: 'Neonatal', icon: '🍼' },
  ];

  protected af_code = '';
  protected af_reg = '';
  protected af_type: 'basic' | 'als' | 'icu' | 'neonatal' = 'basic';
  protected af_size: 'small' | 'medium' | 'large' = 'medium';
  protected af_ac = false;
  protected af_doctor = false;
  protected af_capacity: number | null = 4;
  protected af_make = '';
  protected af_charge: number | null = 800;
  protected af_driverStaff = '';
  protected af_driverName = '';
  protected af_driverPhone = '';
  protected af_status: 'available'|'dispatched'|'on_trip'|'maintenance'|'offline' = 'available';
  protected af_notes = '';

  protected readonly priorityOptions: TripPriority[] = ['routine', 'urgent', 'critical'];
  protected readonly timelineSteps: { key: TripStatus; label: string }[] = [
    { key: 'requested',       label: 'Call' },
    { key: 'assigned',        label: 'Assigned' },
    { key: 'en_route_pickup', label: 'En route' },
    { key: 'on_scene',        label: 'On scene' },
    { key: 'en_route_back',   label: 'Returning' },
    { key: 'arrived',         label: 'Arrived' },
  ];

  private unsubscribe: (() => void) | null = null;

  async ngOnInit() {
    await this.reload();
    this.svc.listDrivers().then(d => this.drivers.set(d)).catch(() => { /* non-fatal */ });
    this.unsubscribe = this.svc.subscribe(() => void this.reload());
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  async reload() {
    this.error.set(null);
    try {
      const [ambs, trips, util] = await Promise.all([
        this.svc.listAmbulances(),
        this.svc.listTripsToday(),
        this.svc.utilisation(7).catch(() => null),
      ]);
      this.ambulances.set(ambs);
      this.trips.set(trips);
      if (util) this.utilisation.set(util as any);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load');
    } finally {
      this.loading.set(false);
    }
  }

  protected utilFor(ambulanceId: string) {
    return this.utilisation()?.per_ambulance.find(p => p.id === ambulanceId) ?? null;
  }

  // ── Display helpers ─────────────────────────────────────────
  protected initials(name: string): string {
    return (name || '?').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  }
  protected relativeTime(iso: string | null): string {
    if (!iso) return '';
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }
  protected priorityLabel(p: TripPriority): string { return PRIORITY_TONE[p].label; }
  protected priorityColor(p: TripPriority): string { return PRIORITY_TONE[p].fg; }
  protected priorityChipCls(_p: TripPriority): string {
    return 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-bold tracking-[0.04em] shrink-0';
  }
  protected priorityChipStyle(p: TripPriority): string {
    const t = PRIORITY_TONE[p];
    return `background:${t.bg}; color:${t.fg};`;
  }
  protected statusLabel(s: TripStatus): string { return TRIP_STATUS_LABEL[s]; }
  protected statusChipCls(s: TripStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${TRIP_STATUS_TONE[s]}`;
  }
  protected ambDot(s: Ambulance['status']): string  { return AMB_STATUS_TONE[s].dot; }
  protected ambLabel(s: Ambulance['status']): string { return AMB_STATUS_TONE[s].label; }
  protected ambChipCls(_s: Ambulance['status']): string {
    return 'inline-flex items-center h-[18px] px-1.5 rounded-full text-[10px] font-semibold shrink-0';
  }
  protected ambChipStyle(s: Ambulance['status']): string {
    const t = AMB_STATUS_TONE[s];
    return `background:${t.bg}; color:${t.fg};`;
  }
  protected priorityBtnCls(p: TripPriority): string {
    const active = this.f_priority === p;
    const base = 'h-9 px-3 rounded-md text-[12px] font-semibold transition-colors flex-1';
    if (!active) return `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
    if (p === 'critical') return `${base} bg-danger-fg text-white`;
    if (p === 'urgent')   return `${base} bg-warn-fg text-white`;
    return `${base} bg-primary-600 text-white`;
  }
  protected reachedStep(current: TripStatus, step: TripStatus): boolean {
    const order: TripStatus[] = ['requested','assigned','en_route_pickup','on_scene','en_route_back','arrived'];
    return order.indexOf(current) >= order.indexOf(step);
  }
  protected formatINR(c: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((c ?? 0) / 100);
  }

  // ── Modal lifecycle ─────────────────────────────────────────
  protected openNewCall() {
    this.f_priority = 'urgent';
    this.f_patient = ''; this.f_age = null; this.f_gender = '';
    this.f_address = ''; this.f_landmark = '';
    this.f_caller = ''; this.f_phone = '';
    this.f_complaint = '';
    this.formError.set(null);
    this.modal.set('new');
  }
  protected openAssign(t: AmbulanceTrip)  { this.current.set(t); this.modal.set('assign'); }
  protected openLink(t: AmbulanceTrip)    { this.current.set(t); this.ptQ = ''; this.ptHits.set([]); this.modal.set('link'); }
  protected openBill(t: AmbulanceTrip, type: 'op' | 'ip') {
    this.current.set(t); this.billType.set(type);
    this.billRupees = t.priority === 'critical' ? 1500 : t.priority === 'urgent' ? 1000 : 800;
    this.formError.set(null);
    this.modal.set('bill');
  }
  protected closeModal() { this.modal.set(null); this.current.set(null); }

  // ── Actions ─────────────────────────────────────────────────
  protected async confirmNew() {
    if (!this.f_patient || !this.f_address) {
      this.formError.set('Patient name and pickup address are required');
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const res = await this.svc.createTrip({
        callerName:   this.f_caller || null,
        callerPhone:  this.f_phone || null,
        patientName:  this.f_patient,
        patientAge:   this.f_age,
        patientGender: this.f_gender || null,
        pickupAddress: this.f_address,
        pickupLandmark: this.f_landmark || null,
        chiefComplaint: this.f_complaint || null,
        priority:     this.f_priority,
      });
      this.toast.success('Call logged', `${res.trip_number} · pick an ambulance to dispatch`);
      this.modal.set(null);
      await this.reload();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save call');
    } finally {
      this.busy.set(false);
    }
  }

  protected async assign(t: AmbulanceTrip, a: Ambulance) {
    this.busy.set(true);
    try {
      await this.svc.assignAmbulance(t.id, a.id, a.driver_staff_id, a.driver_name, a.driver_phone);
      this.toast.success('Ambulance assigned', `${a.code} → ${t.patient_name}`);
      this.closeModal();
      await this.reload();
    } catch (e) {
      this.toast.error('Could not assign', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.busy.set(false);
    }
  }

  protected async advanceStatus(t: AmbulanceTrip, status: TripStatus) {
    this.busy.set(true);
    try {
      await this.svc.setTripStatus(t.id, status);
      this.toast.success('Status updated', this.statusLabel(status));
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelTrip(t: AmbulanceTrip) {
    if (!confirm(`Cancel trip ${t.trip_number}?`)) return;
    await this.advanceStatus(t, 'cancelled');
  }

  protected async onPtSearch(q: string) {
    if (!q || q.length < 2) { this.ptHits.set([]); return; }
    try { this.ptHits.set(await this.svc.searchPatients(q)); }
    catch { this.ptHits.set([]); }
  }

  protected async linkPatient(t: AmbulanceTrip, p: PatientHit) {
    this.busy.set(true);
    try {
      await this.svc.linkTripToPatient(t.id, p.id);
      this.toast.success('Linked', p.full_name);
      this.closeModal();
      await this.reload();
    } catch (e) {
      this.toast.error('Could not link', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmBill(t: AmbulanceTrip) {
    if (!this.billRupees || this.billRupees <= 0) {
      this.formError.set('Enter an amount'); return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const res = await this.svc.billTrip(t.id, this.billType(), this.billRupees);
      this.toast.success('Bill generated', `${res.invoice_number} · ${this.formatINR(res.total_cents)}`);
      this.closeModal();
      await this.reload();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not generate bill');
    } finally {
      this.busy.set(false);
    }
  }

  // ── Fleet admin (add / edit / delete) ─────────────────────────
  protected sizeLabel(s: string): string {
    return s === 'small' ? 'Small' : s === 'large' ? 'Large' : 'Medium';
  }

  protected typeBtnCls(t: 'basic'|'als'|'icu'|'neonatal'): string {
    const active = this.af_type === t;
    const base = 'h-9 px-3 rounded-md text-[12px] font-semibold transition-colors';
    if (!active) return `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
    if (t === 'icu')      return `${base} bg-danger-fg text-white`;
    if (t === 'als')      return `${base} bg-warn-fg text-white`;
    if (t === 'neonatal') return `${base} bg-warn-fg text-white`;
    return `${base} bg-primary-600 text-white`;
  }

  protected openNewAmb() {
    this.ambEditId.set(null);
    this.af_code = ''; this.af_reg = ''; this.af_type = 'basic'; this.af_size = 'medium';
    this.af_ac = true; this.af_doctor = false; this.af_capacity = 4;
    this.af_make = ''; this.af_charge = 800;
    this.af_driverStaff = ''; this.af_driverName = ''; this.af_driverPhone = '';
    this.af_status = 'available'; this.af_notes = '';
    this.formError.set(null);
    this.modal.set('fleet');
  }

  protected openEditAmb(a: Ambulance) {
    this.ambEditId.set(a.id);
    this.af_code = a.code;
    this.af_reg = a.reg_number ?? '';
    this.af_type = a.type;
    this.af_size = a.size ?? 'medium';
    this.af_ac = !!a.has_ac;
    this.af_doctor = !!a.has_doctor_on_board;
    this.af_capacity = a.capacity ?? null;
    this.af_make = a.make_model ?? '';
    this.af_charge = a.base_charge_cents != null ? Math.round(a.base_charge_cents / 100) : null;
    this.af_driverStaff = a.driver_staff_id ?? '';
    this.af_driverName = a.driver_name ?? '';
    this.af_driverPhone = a.driver_phone ?? '';
    this.af_status = a.status;
    this.af_notes = a.notes ?? '';
    this.formError.set(null);
    this.modal.set('fleet');
  }

  protected onPickDriver(staffId: string) {
    if (!staffId) return;
    const d = this.drivers().find(x => x.id === staffId);
    if (d) {
      this.af_driverName = d.full_name;
      this.af_driverPhone = d.phone ?? '';
    }
  }

  protected async confirmAmb() {
    if (!this.af_code) { this.formError.set('Code is required'); return; }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const editing = this.ambEditId();
      if (editing) {
        await this.svc.updateAmbulance({
          id: editing, code: this.af_code, reg_number: this.af_reg || null,
          type: this.af_type, size: this.af_size, has_ac: this.af_ac,
          has_doctor_on_board: this.af_doctor, capacity: this.af_capacity,
          make_model: this.af_make || null, base_charge_rupees: this.af_charge,
          driver_staff_id: this.af_driverStaff || null,
          driver_name: this.af_driverName || null, driver_phone: this.af_driverPhone || null,
          status: this.af_status, notes: this.af_notes || null, is_active: true,
        });
        this.toast.success('Ambulance updated', this.af_code);
      } else {
        await this.svc.createAmbulance({
          code: this.af_code, reg_number: this.af_reg || null,
          type: this.af_type, size: this.af_size, has_ac: this.af_ac,
          has_doctor_on_board: this.af_doctor, capacity: this.af_capacity,
          make_model: this.af_make || null, base_charge_rupees: this.af_charge,
          driver_staff_id: this.af_driverStaff || null,
          driver_name: this.af_driverName || null, driver_phone: this.af_driverPhone || null,
          notes: this.af_notes || null,
        });
        this.toast.success('Ambulance added', this.af_code);
      }
      this.closeModal();
      await this.reload();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmDeleteAmb() {
    const id = this.ambEditId();
    if (!id) return;
    if (!confirm(`Archive ${this.af_code}? It will be removed from the dispatch board (trip history is kept).`)) return;
    this.busy.set(true);
    try {
      await this.svc.deleteAmbulance(id);
      this.toast.success('Archived', this.af_code);
      this.closeModal();
      await this.reload();
    } catch (e) {
      this.toast.error('Could not archive', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.busy.set(false);
    }
  }
}
