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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TitleCasePipe } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { IpdService } from '../data/ipd.service';
import { IpdStore } from '../data/ipd.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { PharmacyPrintService } from '../../pharmacy/services/pharmacy-print.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConsentCaptureComponent } from '../../consent/components/consent-capture.component';
import type { BedView, DischargeWorkflowStatus, WardView } from '../data/ipd.types';
import { ACUITY_TONE, DISCHARGE_WF_TONE, STATUS_TONE } from '../data/ipd.types';
import { ageFromDob } from '../../patients/utils/age-from-dob';

interface PatientHit { id: string; uhid: string; full_name: string; mobile: string; }

@Component({
  selector: 'app-ipd-beds-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, AlertComponent, TitleCasePipe, ConsentCaptureComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">IPD Beds</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          {{ store.totals().occupied }}/{{ store.totals().total }} occupied · {{ store.totals().critical }} critical · {{ store.totals().preDischarge }} ready for discharge ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      @if (canManage()) {
        <button type="button" (click)="openNewWard()"
                class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
          + New ward
        </button>
      }
    </header>

    <!-- ── Ward tabs ─────────────────────────────────────────── -->
    <div class="flex items-center gap-1.5 flex-wrap mb-4">
      <button type="button" (click)="setWard('all')" [class]="tabCls('all')">
        All wards
        <span class="font-mono text-[11px] ml-1 opacity-70">{{ store.totals().occupied }}/{{ store.totals().total }}</span>
      </button>
      @for (w of store.wardViews(); track w.id) {
        <button type="button" (click)="setWard(w.id)" [class]="tabCls(w.id)">
          {{ w.name }}
          <span class="font-mono text-[11px] ml-1 opacity-70">{{ w.totals.occupied }}/{{ w.totals.total }}</span>
        </button>
      }
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load IPD">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Wards list (each shows beds grid) ─────────────────── -->
    @if (store.loading() && store.beds().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-muted">
        Loading beds…
      </div>
    } @else {
      <div class="flex flex-col gap-4">
        @for (w of visibleWards(); track w.id) {
          <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
            <header class="flex items-center justify-between px-4 py-[14px] border-b border-border gap-3 flex-wrap">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{{ w.name }}</p>
                  <span class="text-[10px] font-mono text-ink-muted">{{ w.code }}</span>
                </div>
                <p class="text-[11px] text-ink-muted mt-0.5 capitalize">
                  {{ w.ward_type }} · {{ w.totals.total }} beds
                  @if (wardFloor(w)) { · <span class="text-ink-soft">{{ wardFloor(w) }}</span> }
                  @if (wardRate(w) > 0) { · <span class="font-mono text-ink-soft">{{ formatINR(wardRate(w)) }}/day</span> }
                </p>
              </div>
              <div class="flex items-center gap-2 text-[10px] text-ink-muted flex-wrap">
                <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-good-fg"></span>{{ w.totals.available }} avail</span>
                <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-info-fg"></span>{{ w.totals.occupied }} occ</span>
                @if (w.totals.critical > 0) {
                  <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-danger-fg"></span>{{ w.totals.critical }} crit</span>
                }
                @if (w.totals.cleaning > 0) {
                  <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-ink-muted"></span>{{ w.totals.cleaning }} clean</span>
                }
                @if (canManage()) {
                  <span class="text-ink-muted/40">|</span>
                  <button type="button" (click)="openEditWard(w); $event.stopPropagation()"
                          class="h-6 px-2 rounded text-[11px] font-medium text-ink-soft border border-border hover:bg-surface-subtle">Edit ward</button>
                  <button type="button" (click)="openNewBed(w); $event.stopPropagation()"
                          class="h-6 px-2 rounded text-[11px] font-medium text-white bg-primary-600 hover:bg-primary-500">+ Add bed</button>
                }
              </div>
            </header>

            <div class="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              @for (b of w.beds; track b.id) {
                <button type="button" (click)="openBed(b)" [class]="bedCardCls(b)">
                  <!-- Top row: code + status chip -->
                  <div class="flex items-start justify-between gap-1">
                    <span class="font-mono text-[12px] font-semibold text-ink">{{ b.code }}</span>
                    <span [class]="bedChipCls(b)">{{ bedChipLabel(b) }}</span>
                  </div>

                  @if (b.patient && b.admission) {
                    <div class="mt-2 text-left">
                      <p class="text-[12px] font-medium text-ink truncate">
                        {{ b.patient.full_name || (b.patient.first_name + ' ' + b.patient.last_name) }}
                      </p>
                      <p class="text-[10px] font-mono text-ink-muted mt-0.5 truncate">
                        {{ b.patient.uhid }} · {{ ageGenderLabel(b.patient.date_of_birth, b.patient.gender) }}
                      </p>
                      <p class="text-[10px] text-ink-muted mt-1 truncate">
                        Day {{ admissionDay(b.admission.admitted_at) }} · {{ b.doctor?.full_name || '—' }}
                      </p>
                    </div>
                  } @else {
                    <p class="mt-2 text-[11px] text-ink-muted text-left">
                      @switch (b.status) {
                        @case ('available')   { Tap to admit a patient }
                        @case ('cleaning')    { Awaiting cleanup }
                        @case ('maintenance') { Out of service }
                        @case ('blocked')     { Blocked }
                        @default              { — }
                      }
                    </p>
                  }
                </button>
              }
            </div>
          </section>
        } @empty {
          <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-muted">
            No wards configured.
          </div>
        }
      </div>
    }

    <!-- ── Admission consent (gates the admit insert) ───────── -->
    @if (pendingAdmit(); as ctx) {
      <app-consent-capture
        [patientId]="ctx.patientId"
        [patientName]="ctx.patientName"
        [patientMobile]="ctx.patientMobile"
        [prefillFormCode]="ctx.consentStep"
        (saved)="onAdmissionConsentSaved($event)"
        (closed)="onAdmissionConsentClosed()" />
    }

    <!-- ── DAMA discharge consent (gates discharge_request_dama) ── -->
    @if (pendingDama(); as ctx) {
      <app-consent-capture
        [patientId]="ctx.patientId"
        [patientName]="ctx.patientName"
        [patientMobile]="ctx.patientMobile"
        [admissionId]="ctx.admissionId"
        prefillFormCode="DAMA"
        (saved)="onDamaConsentSaved($event)"
        (closed)="onDamaConsentClosed()" />
    }

    <!-- ── Admit modal ──────────────────────────────────────── -->
    @if (admitFor(); as bed) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeAdmit()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Admit to bed {{ bed.code }}</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">{{ bed.ward.name }} · {{ bed.ward.ward_type }}</p>

          <!-- Patient search -->
          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Find patient</span>
            <input type="search" [formControl]="searchCtrl" placeholder="Name, UHID or mobile…" autofocus
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <!-- Search results / selected -->
          @if (selectedPatient(); as sp) {
            <div class="mt-2 px-3 py-2 rounded-md border border-primary-200 bg-primary-50 flex items-center gap-2.5">
              <div class="size-7 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[11px] shrink-0">
                {{ sp.full_name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-medium text-ink truncate">{{ sp.full_name }}</p>
                <p class="text-[11px] font-mono text-ink-muted truncate">{{ sp.uhid }} · {{ sp.mobile }}</p>
              </div>
              <button type="button" (click)="selectedPatient.set(null)" class="text-[11px] text-primary-600 hover:underline font-medium">Change</button>
            </div>
          } @else if (patientHits().length > 0) {
            <ul class="mt-2 max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border">
              @for (p of patientHits(); track p.id) {
                <li>
                  <button type="button" (click)="pickPatient(p)" class="w-full text-left px-3 py-2 hover:bg-surface-muted">
                    <p class="text-[13px] font-medium text-ink truncate">{{ p.full_name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ p.uhid }} · {{ p.mobile }}</p>
                  </button>
                </li>
              }
            </ul>
          } @else if (searchCtrl.value && searchCtrl.value.length >= 2 && !searching()) {
            <p class="mt-2 text-[12px] text-ink-muted">No patients found. Try another search.</p>
          }

          <!-- Doctor + reason -->
          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Attending doctor</span>
            <select [(ngModel)]="admitDoctorId" name="doctor"
                    class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                    [style.background-image]="chevronUrl" style="background-position: right 8px center;">
              <option value="">—</option>
              @for (d of doctors(); track d.id) {
                <option [value]="d.id">{{ d.full_name }}</option>
              }
            </select>
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason / chief complaint</span>
            <input type="text" [(ngModel)]="admitReason" name="reason"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeAdmit()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmAdmit()" [disabled]="!selectedPatient() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Admitting…' : 'Admit patient' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Request discharge modal (doctor) ─────────────────── -->
    @if (requestFor(); as bed) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeRequest()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[460px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Request discharge</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">
            {{ bed.patient?.full_name }} · {{ bed.code }} · Day {{ admissionDay(bed.admission!.admitted_at) }}
          </p>
          <p class="text-[11px] text-ink-soft mt-3">
            This requests a discharge. The nursing team will run the handoff checklist
            (medicine return, IV removal, summary sign-off, lab/imaging reports) and
            hand the patient over to the IP billing team for the final bill.
          </p>
          <div class="mt-3">
            <label class="block text-[11px] text-ink-muted mb-1">Reason / clinical note (optional)</label>
            <textarea [(ngModel)]="requestReason" rows="3"
                      placeholder="e.g. Stable, advised home with oral antibiotics"
                      class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeRequest()" [disabled]="busy()"
                    class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Cancel
            </button>
            <button type="button" (click)="confirmRequest()" [disabled]="busy()"
                    class="h-9 px-4 rounded-md bg-warn-fg hover:bg-warn-strong text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Requesting…' : 'Request discharge' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Bed detail / Discharge modal ─────────────────────── -->
    @if (detailFor(); as bed) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeDetail()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[460px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">Bed {{ bed.code }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">{{ bed.ward.name }} · {{ bed.ward.ward_type }}</p>
            </div>
            <span [class]="bedChipCls(bed)">{{ bedChipLabel(bed) }}</span>
          </div>

          @if (bed.patient && bed.admission) {
            <div class="mt-4 px-3 py-2.5 rounded-md bg-surface-muted">
              <p class="text-[13px] font-medium text-ink">{{ bed.patient.full_name || (bed.patient.first_name + ' ' + bed.patient.last_name) }}</p>
              <p class="text-[11px] font-mono text-ink-muted mt-0.5">
                {{ bed.patient.uhid }} · {{ ageGenderLabel(bed.patient.date_of_birth, bed.patient.gender) }} · {{ bed.patient.mobile }}
              </p>
              <p class="text-[11px] text-ink-muted mt-2">
                Admitted <strong class="text-ink-soft">{{ relativeTime(bed.admission.admitted_at) }}</strong>
                · Day {{ admissionDay(bed.admission.admitted_at) }}
                @if (bed.doctor) { · Dr {{ bed.doctor.full_name }} }
              </p>
              @if (bed.admission.reason) {
                <p class="text-[12px] text-ink-soft italic mt-2">"{{ bed.admission.reason }}"</p>
              }
            </div>

            <!-- Acuity chips -->
            @if (canWrite()) {
              <div class="mt-4">
                <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Set acuity</p>
                <div class="flex items-center gap-1.5 flex-wrap">
                  @for (a of acuityChoices; track a.value) {
                    <button type="button" (click)="changeAcuity(bed, a.value)"
                            [class]="acuityBtnCls(bed.acuity === a.value)">
                      {{ a.label }}
                    </button>
                  }
                  <button type="button" (click)="changeAcuity(bed, null)"
                          [class]="acuityBtnCls(!bed.acuity)">
                    Clear
                  </button>
                </div>
              </div>
            }

            <!-- Discharge workflow chip -->
            @if (workflowStatus(bed); as wf) {
              @if (wf !== 'none') {
                <div class="mt-3 px-3 py-2 rounded-md bg-info-bg/40 border border-info-fg/20">
                  <div class="flex items-center justify-between gap-2">
                    <span [class]="wfChipCls(wf)">{{ wfLabel(wf) }}</span>
                    @if (bed.admission?.discharge_requested_at) {
                      <span class="text-[10px] font-mono text-ink-muted">{{ relativeTime(bed.admission!.discharge_requested_at!) }}</span>
                    }
                  </div>
                  @if (bed.admission?.discharge_request_reason) {
                    <p class="text-[11px] text-ink-soft italic mt-1">"{{ bed.admission!.discharge_request_reason }}"</p>
                  }
                </div>
              }
            }

            @if (canWrite()) {
              <div class="mt-5 flex flex-wrap items-center justify-between gap-2">
                <a [routerLink]="['/patients', bed.patient.id]" class="h-9 px-4 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                  Open chart
                </a>

                @switch (workflowStatus(bed)) {
                  @case ('none') {
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="openDamaDischarge(bed)" [disabled]="busy()"
                              title="Discharge Against Medical Advice — requires DAMA consent"
                              class="h-9 px-3 rounded-md border border-danger-fg text-danger-fg hover:bg-danger-fg/10 text-[12px] font-medium disabled:opacity-50">
                        DAMA
                      </button>
                      <button type="button" (click)="openRequestDischarge(bed)" [disabled]="busy()"
                              class="h-9 px-4 rounded-md bg-warn-fg hover:bg-warn-strong text-white text-[12px] font-medium disabled:opacity-50">
                        Request discharge
                      </button>
                    </div>
                  }
                  @case ('cancelled') {
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="openDamaDischarge(bed)" [disabled]="busy()"
                              title="Discharge Against Medical Advice — requires DAMA consent"
                              class="h-9 px-3 rounded-md border border-danger-fg text-danger-fg hover:bg-danger-fg/10 text-[12px] font-medium disabled:opacity-50">
                        DAMA
                      </button>
                      <button type="button" (click)="openRequestDischarge(bed)" [disabled]="busy()"
                              class="h-9 px-4 rounded-md bg-warn-fg hover:bg-warn-strong text-white text-[12px] font-medium disabled:opacity-50">
                        Re-request discharge
                      </button>
                    </div>
                  }
                  @case ('requested') {
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="openDamaDischarge(bed)" [disabled]="busy()"
                              title="Convert to DAMA — patient leaves against medical advice"
                              class="h-9 px-3 rounded-md border border-danger-fg text-danger-fg hover:bg-danger-fg/10 text-[12px] font-medium disabled:opacity-50">
                        DAMA
                      </button>
                      <a [routerLink]="['/nursing']" [queryParams]="{ admission: bed.admission?.id }"
                         class="h-9 px-4 inline-flex items-center rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">
                        Open in Nursing
                      </a>
                      <button type="button" (click)="cancelDischarge(bed)" [disabled]="busy()"
                              class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  }
                  @case ('nurse_handoff') {
                    <a [routerLink]="['/nursing']" [queryParams]="{ admission: bed.admission?.id }"
                       class="h-9 px-4 inline-flex items-center rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">
                      Continue handoff
                    </a>
                  }
                  @case ('ready_for_billing') {
                    <a [routerLink]="['/discharge-billing']" [queryParams]="{ admission: bed.admission.id }"
                       class="h-9 px-4 inline-flex items-center rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">
                      Open in Billing
                    </a>
                  }
                  @case ('insurance_processing') {
                    <a [routerLink]="['/discharge-billing']" [queryParams]="{ admission: bed.admission.id }"
                       class="h-9 px-4 inline-flex items-center rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">
                      Open in Billing
                    </a>
                  }
                }
              </div>
            }
          } @else {
            <p class="text-[12px] text-ink-muted mt-3">
              @switch (bed.status) {
                @case ('available')   { This bed is available. }
                @case ('cleaning')    { This bed is being cleaned. }
                @case ('maintenance') { This bed is in maintenance. }
                @case ('blocked')     { This bed is blocked. }
                @default              { — }
              }
            </p>
            @if (canWrite()) {
              <div class="mt-5 flex flex-wrap items-center gap-2">
                @if (bed.status !== 'available') {
                  <button type="button" (click)="changeStatus(bed, 'available')" [disabled]="busy()" class="h-8 px-3 rounded-md text-[12px] font-medium bg-good-fg hover:bg-good-strong text-white disabled:opacity-50">Mark available</button>
                }
                @if (bed.status !== 'cleaning') {
                  <button type="button" (click)="changeStatus(bed, 'cleaning')" [disabled]="busy()" class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">Cleaning</button>
                }
                @if (bed.status !== 'maintenance') {
                  <button type="button" (click)="changeStatus(bed, 'maintenance')" [disabled]="busy()" class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">Maintenance</button>
                }
                @if (bed.status !== 'blocked') {
                  <button type="button" (click)="changeStatus(bed, 'blocked')" [disabled]="busy()" class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">Block</button>
                }
              </div>
            }
          }

          <div class="mt-5 flex items-center justify-between gap-2">
            @if (canManage() && bed.status !== 'occupied') {
              <button type="button" (click)="openEditBed(bed)" class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Edit bed</button>
            } @else {
              <span></span>
            }
            <button type="button" (click)="closeDetail()" class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Close</button>
          </div>
        </div>
      </div>
    }

    <!-- ── Ward modal (new / edit) ──────────────────────────── -->
    @if (wardModal()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeWardModal()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[520px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">
            {{ wardEditId() ? 'Edit ward' : 'New ward' }}
          </h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Group beds by floor + ward type for billing &amp; staffing.</p>

          <div class="mt-4 grid grid-cols-12 gap-3">
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
              <input type="text" [(ngModel)]="wf_code" name="wcode" placeholder="W-GEN1"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-8 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
              <input type="text" [(ngModel)]="wf_name" name="wname" placeholder="General Ward A"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Ward type *</span>
              <select [(ngModel)]="wf_type" name="wtype"
                      class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (t of wardTypes; track t) { <option [value]="t">{{ t | titlecase }}</option> }
              </select>
            </label>
            <label class="col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Floor</span>
              <input type="text" [(ngModel)]="wf_floor" name="wfloor" placeholder="Ground / 1st / 2nd"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Daily rate (₹)</span>
              <input type="number" [(ngModel)]="wf_rate" name="wrate" min="0" step="50"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            @if (wardEditId()) {
              <label class="col-span-6 flex items-center gap-2 mt-6">
                <input type="checkbox" [(ngModel)]="wf_active" name="wactive" class="size-4 rounded border-border accent-primary-600" />
                <span class="text-[12px] text-ink-soft">Active</span>
              </label>
            }
          </div>

          @if (wardError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ wardError() }}</p> }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeWardModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmWard()" [disabled]="!wf_code || !wf_name || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Saving…' : (wardEditId() ? 'Save changes' : 'Create ward') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Bed modal (new / edit) ───────────────────────────── -->
    @if (bedModal(); as bm) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeBedModal()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[520px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">
            {{ bedEditId() ? 'Edit bed' : 'Add bed' }}
          </h2>
          <p class="text-[12px] text-ink-muted mt-0.5">{{ bm.wardName }}</p>

          <div class="mt-4 grid grid-cols-12 gap-3">
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Bed code *</span>
              <input type="text" [(ngModel)]="bf_code" name="bcode" placeholder="B-101"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-8 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Bed type *</span>
              <select [(ngModel)]="bf_type" name="btype"
                      class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (t of bedTypes; track t) { <option [value]="t">{{ bedTypeLabel(t) }}</option> }
              </select>
            </label>

            <label class="col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Daily rate (₹) <span class="text-ink-muted/70 font-normal">— leave blank to use ward rate</span></span>
              <input type="number" [(ngModel)]="bf_rate" name="brate" min="0" step="50" placeholder="—"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            @if (bedEditId()) {
              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Status</span>
                <select [(ngModel)]="bf_status" name="bstatus"
                        class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="available">Available</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
            }

            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
              <input type="text" [(ngModel)]="bf_notes" name="bnotes" placeholder="Window side, oxygen point…"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          @if (bedError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ bedError() }}</p> }

          <div class="mt-5 flex items-center justify-between gap-2">
            @if (bedEditId()) {
              <button type="button" (click)="confirmDeleteBed()" [disabled]="busy()" class="h-9 px-3 rounded-md border border-danger-fg/30 text-[12px] font-medium text-danger-fg hover:bg-danger-bg disabled:opacity-50">
                Delete bed
              </button>
            } @else { <span></span> }
            <div class="flex gap-2">
              <button type="button" (click)="closeBedModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="button" (click)="confirmBed()" [disabled]="!bf_code || !bf_type || busy()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() ? 'Saving…' : (bedEditId() ? 'Save changes' : 'Add bed') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class IpdBedsPage implements OnInit, OnDestroy {
  protected readonly store = inject(IpdStore);
  private svc = inject(IpdService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private toast = inject(ToastService);
  private printSvc = inject(PharmacyPrintService);
  private destroyRef = inject(DestroyRef);

  /**
   * Push the active branch into the IPD store; reload follows. Wrapped in
   * untracked() because setBranch reads + writes _branchId — without untracked
   * the effect would re-fire on every reload (same loop pattern we hit on
   * patients/staff/appointments).
   */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    untracked(() => this.store.setBranch(id));
  });

  protected readonly canWrite = computed(() => this.auth.has('patients.write') || this.auth.has('ehr.write'));
  protected readonly canManage = computed(() => this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.has('staff.write'));

  protected readonly admitFor = signal<BedView | null>(null);
  /** Pending admit context — set when we need a consent before the admission insert. */
  protected readonly pendingAdmit = signal<{
    bedId: string; patientId: string;
    patientName: string; patientMobile: string;
    doctorId: string | null; reason: string;
    /** When true, the bed's ward is ICU and an ICU-CARE consent step follows GEN-ADMISSION. */
    needsIcuConsent: boolean;
    /** Tracks which consent code is currently being captured. */
    consentStep: 'GEN-ADMISSION' | 'ICU-CARE';
  } | null>(null);
  protected readonly detailFor = signal<BedView | null>(null);
  protected readonly requestFor = signal<BedView | null>(null);
  protected requestReason = '';

  /** Pending DAMA discharge — set when user clicks DAMA button; consent fires next. */
  protected readonly pendingDama = signal<{
    admissionId: string; patientId: string; patientName: string; patientMobile: string;
  } | null>(null);
  protected readonly busy = signal(false);

  // ── Ward / bed management modal state ───────────────────────
  protected readonly wardTypes = ['general','icu','maternity','pediatric','private','daycare','emergency'] as const;
  protected readonly bedTypes  = ['standard','semi_private','private','deluxe','icu','hdu','pediatric','maternity','isolation'] as const;

  protected readonly wardModal   = signal(false);
  protected readonly wardEditId  = signal<string | null>(null);
  protected readonly wardError   = signal<string | null>(null);
  protected wf_code = ''; protected wf_name = ''; protected wf_type = 'general';
  protected wf_floor = ''; protected wf_rate = 0; protected wf_active = true;

  protected readonly bedModal  = signal<{ wardId: string; wardName: string } | null>(null);
  protected readonly bedEditId = signal<string | null>(null);
  protected readonly bedError  = signal<string | null>(null);
  protected bf_code = ''; protected bf_type = 'standard'; protected bf_status = 'available';
  protected bf_rate: number | null = null; protected bf_notes = '';

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly patientHits = signal<PatientHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly selectedPatient = signal<PatientHit | null>(null);
  protected readonly doctors = signal<{ id: string; full_name: string }[]>([]);
  protected admitDoctorId = '';
  protected admitReason = '';

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly acuityChoices = [
    { value: 'stable' as const,        label: 'Stable' },
    { value: 'watch' as const,         label: 'Watch' },
    { value: 'critical' as const,      label: 'Critical' },
    { value: 'pre_discharge' as const, label: 'Pre-discharge' },
  ];

  protected readonly visibleWards = computed<WardView[]>(() => {
    const wid = this.store.activeWardId();
    const all = this.store.wardViews();
    if (wid === 'all') return all;
    return all.filter((w) => w.id === wid);
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    // Explicit initial load so the page never appears blank under zoneless CD.
    this.store.setBranch(this.branchStore.activeBranchId());
    void this.svc.listDoctors().then((d) => this.doctors.set(d));
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (term) => {
        const t = (term ?? '').trim();
        if (t.length < 2) {
          this.patientHits.set([]);
          return;
        }
        this.searching.set(true);
        try {
          const hits = await this.svc.searchPatients(t);
          this.patientHits.set(hits);
        } finally {
          this.searching.set(false);
        }
      });
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected setWard(id: string | 'all') {
    this.store.setActiveWard(id);
  }

  protected tabCls(id: string | 'all'): string {
    const isActive = this.store.activeWardId() === id;
    const base = 'h-8 px-3 rounded-md text-[12px] font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-subtle`;
  }

  protected bedCardCls(b: BedView): string {
    const tone = (b.acuity && b.status === 'occupied') ? ACUITY_TONE[b.acuity].card : STATUS_TONE[b.status].card;
    return [
      'block text-left p-3 rounded-md border',
      'transition-shadow hover:shadow-card',
      'cursor-pointer',
      tone,
    ].join(' ');
  }

  protected bedChipCls(b: BedView): string {
    const tone = (b.acuity && b.status === 'occupied') ? ACUITY_TONE[b.acuity].chip : STATUS_TONE[b.status].chip;
    return `inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] font-semibold uppercase tracking-[0.04em] ${tone}`;
  }

  protected bedChipLabel(b: BedView): string {
    if (b.status === 'occupied' && b.acuity) return ACUITY_TONE[b.acuity].label;
    return STATUS_TONE[b.status].label;
  }

  protected acuityBtnCls(active: boolean): string {
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-subtle`;
  }

  protected ageGenderLabel(dob: string, gender: string) {
    const age = ageFromDob(dob);
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (age === null && !g) return '—';
    if (age === null) return g;
    return `${age}${g}`;
  }

  protected admissionDay(iso: string): number {
    try {
      const adm = parseISO(iso);
      const days = Math.max(1, Math.floor((Date.now() - adm.getTime()) / 86400000) + 1);
      return days;
    } catch { return 1; }
  }

  protected relativeTime(iso: string): string {
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }

  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
  }

  protected openBed(b: BedView): void {
    if (!this.canWrite()) return;
    if (b.status === 'available') {
      this.admitDoctorId = '';
      this.admitReason = '';
      this.selectedPatient.set(null);
      this.patientHits.set([]);
      this.searchCtrl.setValue('');
      this.admitFor.set(b);
    } else {
      this.detailFor.set(b);
    }
  }

  protected closeAdmit(): void {
    this.admitFor.set(null);
  }

  protected closeDetail(): void {
    this.detailFor.set(null);
  }

  protected pickPatient(p: PatientHit): void {
    this.selectedPatient.set(p);
    this.patientHits.set([]);
    this.searchCtrl.setValue('', { emitEvent: false });
  }

  protected async confirmAdmit(): Promise<void> {
    const bed = this.admitFor();
    const patient = this.selectedPatient();
    if (!bed || !patient) return;
    // Stash the admission context and pop the consent modal. Insert happens in
    // onAdmissionConsentSaved() after the patient/relative signs.
    const isIcu = bed.ward.ward_type === 'icu';
    this.pendingAdmit.set({
      bedId: bed.id,
      patientId: patient.id,
      patientName: patient.full_name,
      patientMobile: patient.mobile,
      doctorId: this.admitDoctorId || null,
      reason: this.admitReason || '',
      needsIcuConsent: isIcu,
      consentStep: 'GEN-ADMISSION',
    });
    // Hide the admit dialog while the consent modal is up.
    this.admitFor.set(null);
  }

  /** Fires after a consent step is signed. For ICU beds we chain GEN-ADMISSION → ICU-CARE before admitting. */
  protected async onAdmissionConsentSaved(_e: { consentId: string }): Promise<void> {
    const ctx = this.pendingAdmit();
    if (!ctx) return;

    // Step 1 done — if ICU and ICU-CARE not yet captured, switch to that consent next.
    if (ctx.consentStep === 'GEN-ADMISSION' && ctx.needsIcuConsent) {
      this.pendingAdmit.set({ ...ctx, consentStep: 'ICU-CARE' });
      return;
    }

    // All required consents captured — proceed with the admission insert.
    this.busy.set(true);
    try {
      await this.svc.admit({
        bedId: ctx.bedId,
        patientId: ctx.patientId,
        doctorId: ctx.doctorId,
        reason: ctx.reason || undefined,
      });
      this.toast.success('Admitted', `${ctx.patientName} → bed admitted with consent`);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not admit', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.pendingAdmit.set(null);
      this.busy.set(false);
    }
  }

  /** User cancelled the consent modal — abort the admission. */
  protected onAdmissionConsentClosed(): void {
    this.pendingAdmit.set(null);
    this.toast.warn('Admission cancelled', 'Consent was not captured — patient was not admitted.');
  }

  // ── Discharge workflow helpers ─────────────────────────────
  protected workflowStatus(bed: BedView): DischargeWorkflowStatus {
    return ((bed.admission?.discharge_workflow_status as DischargeWorkflowStatus) ?? 'none');
  }
  protected wfLabel(s: DischargeWorkflowStatus): string { return DISCHARGE_WF_TONE[s].label; }
  protected wfChipCls(s: DischargeWorkflowStatus): string {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.04em]';
    return `${base} ${DISCHARGE_WF_TONE[s].chip}`;
  }

  protected openRequestDischarge(bed: BedView): void {
    this.requestReason = '';
    this.requestFor.set(bed);
  }
  protected closeRequest(): void { this.requestFor.set(null); }

  // ── DAMA flow ─────────────────────────────────────────────
  protected openDamaDischarge(bed: BedView): void {
    if (!bed.admission || !bed.patient) return;
    this.pendingDama.set({
      admissionId:   bed.admission.id,
      patientId:     bed.patient.id,
      patientName:   bed.patient.full_name ?? '',
      patientMobile: bed.patient.mobile ?? '',
    });
  }

  protected onDamaConsentClosed(): void {
    this.pendingDama.set(null);
    this.toast.warn('DAMA cancelled', 'Consent was not captured — admission unchanged.');
  }

  protected async onDamaConsentSaved(e: { consentId: string }): Promise<void> {
    const ctx = this.pendingDama();
    if (!ctx) return;
    this.busy.set(true);
    try {
      await this.svc.dischargeRequestDama({
        admissionId:   ctx.admissionId,
        damaConsentId: e.consentId,
      });
      this.toast.success('DAMA recorded', `${ctx.patientName} → forwarded to discharge billing.`);
      void this.store.load();
    } catch (err) {
      this.toast.error('Could not record DAMA', this.errMsg(err));
    } finally {
      this.pendingDama.set(null);
      this.busy.set(false);
    }
  }

  protected async confirmRequest(): Promise<void> {
    const bed = this.requestFor();
    if (!bed?.admission) return;
    this.busy.set(true);
    try {
      await this.svc.dischargeRequest(bed.admission.id, this.requestReason || null);
      this.toast.success('Discharge requested', `${bed.patient?.full_name} · nurse handoff next`);
      this.requestFor.set(null);
      this.detailFor.set(null);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not request', this.errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelDischarge(bed: BedView): Promise<void> {
    if (!bed.admission) return;
    if (!confirm(`Cancel the discharge request for ${bed.patient?.full_name}?`)) return;
    this.busy.set(true);
    try {
      await this.svc.dischargeCancel(bed.admission.id, 'Cancelled from IPD beds');
      this.toast.success('Cancelled', 'Discharge workflow cleared');
      this.detailFor.set(null);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not cancel', this.errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }

  private errMsg(e: unknown): string {
    if (!e) return 'Try again.';
    if (typeof e === 'string') return e;
    const obj = e as Record<string, any>;
    return obj['message'] || obj['error_description'] || obj['details'] || obj['hint'] || 'Try again.';
  }

  protected async changeStatus(bed: BedView, status: 'available' | 'cleaning' | 'maintenance' | 'blocked'): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.setBedStatus(bed.id, status);
      this.toast.success('Bed updated', `${bed.code} → ${status}`);
      this.detailFor.set(null);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async changeAcuity(bed: BedView, acuity: 'stable' | 'watch' | 'critical' | 'pre_discharge' | null): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.setBedAcuity(bed.id, acuity);
      this.toast.success('Acuity updated', acuity ?? 'cleared');
      void this.store.load();
      const fresh = this.store.beds().find((b) => b.id === bed.id);
      if (fresh) this.detailFor.set(fresh);
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  // ── Ward management ─────────────────────────────────────────
  protected wardFloor(w: WardView): string | null { return (w as any).floor ?? null; }
  protected wardRate(w: WardView): number { return ((w as any).daily_rate_cents ?? 0) as number; }
  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
      .format((cents ?? 0) / 100);
  }

  protected openNewWard(): void {
    this.wardEditId.set(null);
    this.wf_code = ''; this.wf_name = ''; this.wf_type = 'general';
    this.wf_floor = ''; this.wf_rate = 0; this.wf_active = true;
    this.wardError.set(null);
    this.wardModal.set(true);
  }

  protected openEditWard(w: WardView): void {
    this.wardEditId.set(w.id);
    this.wf_code   = w.code ?? '';
    this.wf_name   = w.name ?? '';
    this.wf_type   = (w.ward_type ?? 'general') as string;
    this.wf_floor  = (w as any).floor ?? '';
    this.wf_rate   = Math.round(((w as any).daily_rate_cents ?? 0) / 100);
    this.wf_active = w.is_active;
    this.wardError.set(null);
    this.wardModal.set(true);
  }

  protected closeWardModal(): void { this.wardModal.set(false); }

  protected async confirmWard(): Promise<void> {
    this.busy.set(true);
    this.wardError.set(null);
    try {
      const editing = this.wardEditId();
      if (editing) {
        await this.svc.updateWard({
          id: editing, code: this.wf_code.trim(), name: this.wf_name.trim(),
          wardType: this.wf_type, floor: this.wf_floor.trim() || null,
          dailyRateRupees: Number(this.wf_rate) || 0, isActive: this.wf_active,
        });
        this.toast.success('Ward updated');
      } else {
        await this.svc.createWard({
          code: this.wf_code.trim(), name: this.wf_name.trim(),
          wardType: this.wf_type, floor: this.wf_floor.trim() || null,
          dailyRateRupees: Number(this.wf_rate) || 0,
        });
        this.toast.success('Ward created');
      }
      this.wardModal.set(false);
      void this.store.load();
    } catch (e) {
      this.wardError.set(e instanceof Error ? e.message : 'Could not save ward.');
    } finally {
      this.busy.set(false);
    }
  }

  // ── Bed management ──────────────────────────────────────────
  protected bedTypeLabel(t: string): string {
    const map: Record<string, string> = {
      standard: 'Standard', semi_private: 'Semi-private', private: 'Private',
      deluxe: 'Deluxe', icu: 'ICU', hdu: 'HDU',
      pediatric: 'Pediatric', maternity: 'Maternity', isolation: 'Isolation',
    };
    return map[t] ?? t;
  }

  protected openNewBed(w: WardView): void {
    this.bedEditId.set(null);
    this.bf_code = ''; this.bf_type = 'standard'; this.bf_status = 'available';
    this.bf_rate = null; this.bf_notes = '';
    this.bedError.set(null);
    this.bedModal.set({ wardId: w.id, wardName: w.name });
  }

  protected openEditBed(b: BedView): void {
    this.bedEditId.set(b.id);
    this.bf_code = b.code ?? '';
    this.bf_type = ((b as any).bed_type ?? 'standard') as string;
    this.bf_status = b.status ?? 'available';
    this.bf_rate = (b as any).daily_rate_cents != null ? Math.round((b as any).daily_rate_cents / 100) : null;
    this.bf_notes = b.notes ?? '';
    this.bedError.set(null);
    this.bedModal.set({ wardId: b.ward_id, wardName: b.ward.name });
    this.detailFor.set(null);
  }

  protected closeBedModal(): void { this.bedModal.set(null); }

  protected async confirmBed(): Promise<void> {
    const ctx = this.bedModal();
    if (!ctx) return;
    this.busy.set(true);
    this.bedError.set(null);
    try {
      const editing = this.bedEditId();
      if (editing) {
        await this.svc.updateBed({
          id: editing, code: this.bf_code.trim(), bedType: this.bf_type,
          status: this.bf_status,
          dailyRateRupees: this.bf_rate != null && this.bf_rate > 0 ? Number(this.bf_rate) : null,
          notes: this.bf_notes.trim() || null,
        });
        this.toast.success('Bed updated');
      } else {
        await this.svc.createBed({
          wardId: ctx.wardId, code: this.bf_code.trim(), bedType: this.bf_type,
          dailyRateRupees: this.bf_rate != null && this.bf_rate > 0 ? Number(this.bf_rate) : null,
          notes: this.bf_notes.trim() || null,
        });
        this.toast.success('Bed added');
      }
      this.bedModal.set(null);
      void this.store.load();
    } catch (e) {
      this.bedError.set(e instanceof Error ? e.message : 'Could not save bed.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmDeleteBed(): Promise<void> {
    const id = this.bedEditId();
    if (!id) return;
    if (!confirm('Delete this bed? This cannot be undone (only allowed if not occupied).')) return;
    this.busy.set(true);
    this.bedError.set(null);
    try {
      await this.svc.deleteBed(id);
      this.toast.success('Bed deleted');
      this.bedModal.set(null);
      void this.store.load();
    } catch (e) {
      this.bedError.set(e instanceof Error ? e.message : 'Could not delete bed.');
    } finally {
      this.busy.set(false);
    }
  }
}
