import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { VoiceDictationComponent } from '../../../shared/ui/voice-dictation/voice-dictation.component';
import { InvestigationOrderPanelComponent } from '../../lab/components/investigation-order-panel.component';
import { LabService } from '../../lab/data/lab.service';
import { LabReportPdfService } from '../../lab/services/lab-report-pdf.service';
import { ConsentCaptureComponent } from '../../consent/components/consent-capture.component';
import { ConsentPdfService } from '../../consent/services/consent-pdf.service';
import { BloodRequestDialogComponent } from '../../blood-bank/components/blood-request-dialog.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AppointmentsService } from '../../appointments/data/appointments.service';
import { ConsultationService, ConsultationContext } from '../data/consultation.service';
import { RxTemplateService, RxTemplate } from '../data/rx-template.service';
import { ConsultationPrintService } from '../services/consultation-print.service';
import { PrescriptionPdfService } from '../services/prescription-pdf.service';
import { ageFromDob } from '../../patients/utils/age-from-dob';
import type {
  AllergySeverity,
  DrugForm,
  DrugRoute,
  InteractionSeverity,
} from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-consultation-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, VoiceDictationComponent, InvestigationOrderPanelComponent, ConsentCaptureComponent, BloodRequestDialogComponent],
  template: `
    @if (loadError()) {
      <div class="max-w-3xl">
        <a routerLink="/opd-queue" class="text-[12px] text-primary-600 hover:underline font-medium">← Back to queue</a>
        <div class="mt-3">
          <app-alert tone="danger" title="Could not open consultation">{{ loadError() }}</app-alert>
        </div>
      </div>
    } @else if (ctx(); as c) {

      <!-- ── Sticky patient banner ─────────────────────────────── -->
      <div class="sticky top-14 z-20 -mx-6 px-6 py-3 bg-surface-page/95 backdrop-blur border-b border-border">
        <div class="flex items-start gap-3 flex-wrap">
          <a routerLink="/opd-queue" class="text-[12px] text-primary-600 hover:underline font-medium shrink-0 mt-1">← Queue</a>

          <div class="size-10 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[13px] shrink-0">
            {{ initials(c) }}
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="font-display text-[22px] font-medium tracking-[-0.02em] text-ink leading-[1.1] truncate">
                {{ c.patient.full_name || (c.patient.first_name + ' ' + c.patient.last_name) }}
              </h1>
              <a [routerLink]="['/patients', c.patient.id]" class="text-[11px] text-primary-600 hover:underline font-medium">Open chart →</a>
            </div>
            <p class="text-[11px] font-mono text-ink-muted mt-0.5">
              {{ c.patient.uhid }} · {{ ageGenderLabel(c.patient) }}
              @if (c.patient.blood_group) { · <span class="text-danger-fg">{{ c.patient.blood_group }}</span> }
              · {{ c.patient.mobile }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button (click)="printNote()" type="button" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Print
            </button>
            <button (click)="save()" [disabled]="saving()" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Save draft' }}
            </button>
            <button (click)="finalise()" [disabled]="saving()" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              Finalise consultation
            </button>
          </div>
        </div>

        <!-- Allergies + interactions strip -->
        @if (c.allergies.length > 0 || interactions().length > 0) {
          <div class="mt-2.5 flex items-start gap-2 flex-wrap">
            @if (c.allergies.length > 0) {
              <span class="text-[10px] uppercase tracking-[0.06em] text-ink-muted shrink-0 mt-0.5">Allergies:</span>
              @for (a of c.allergies; track a.id) {
                <span [class]="allergyChipCls(a.severity)">⚠ {{ a.allergen }}</span>
              }
            }
            @for (i of interactions(); track i.a + i.b) {
              <span [class]="interactionChipCls(i.severity)">
                ⚠ {{ i.a }} + {{ i.b }}
              </span>
            }
          </div>
        }
      </div>

      <!-- ── Main grid ─────────────────────────────────────────── -->
      <div class="grid grid-cols-12 gap-[14px] mt-6">

        <!-- LEFT: clinical notes -->
        <div class="col-span-12 lg:col-span-8 space-y-[14px]">

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">Chief complaint</p>
            <textarea
              [formControl]="form.controls.presenting_complaint"
              rows="2"
              placeholder="Patient's primary concern in their own words…"
              class="w-full px-3 py-2 text-[13px] bg-surface-card text-ink border border-border rounded-md placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y transition-colors"
            ></textarea>
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">History</p>
              <app-voice-dictation [control]="form.controls.history" />
            </div>
            <textarea
              [formControl]="form.controls.history"
              rows="3"
              placeholder="HPI, prior conditions, medications, family/social history…"
              class="w-full px-3 py-2 text-[13px] bg-surface-card text-ink border border-border rounded-md placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y transition-colors"
            ></textarea>
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Physical examination</p>
              <app-voice-dictation [control]="form.controls.physical_examination" />
            </div>
            <textarea
              [formControl]="form.controls.physical_examination"
              rows="3"
              placeholder="General · CVS · RS · Abdo · CNS · Local…"
              class="w-full px-3 py-2 text-[13px] bg-surface-card text-ink border border-border rounded-md placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y transition-colors"
            ></textarea>
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Assessment / Diagnosis</p>
              <app-voice-dictation [control]="form.controls.assessment" />
            </div>
            <textarea
              [formControl]="form.controls.assessment"
              rows="3"
              placeholder="Working diagnosis, ICD-10 codes, differentials…"
              class="w-full px-3 py-2 text-[13px] bg-surface-card text-ink border border-border rounded-md placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y transition-colors"
            ></textarea>
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Plan</p>
              <div class="flex items-center gap-2">
                <button type="button" (click)="showConsentPanel.set(true)"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-warn-border text-warn-fg hover:bg-warn-bg/30">
                  📝 Consent
                </button>
                <button type="button" (click)="showBloodRequest.set(true)"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-danger-fg/40 text-danger-fg hover:bg-danger-fg/10">
                  🩸 Request Blood
                </button>
                <button type="button" (click)="showOrderPanel.set(true)"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
                  🧪 Order investigations
                </button>
                <app-voice-dictation [control]="form.controls.plan" />
              </div>
            </div>
            <textarea
              [formControl]="form.controls.plan"
              rows="3"
              placeholder="Investigations, follow-up, lifestyle advice, referrals…"
              class="w-full px-3 py-2 text-[13px] bg-surface-card text-ink border border-border rounded-md placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y transition-colors"
            ></textarea>
          </article>

          @if (showOrderPanel() && ctxView(); as ctxv) {
            <app-investigation-order-panel
              [patientId]="ctxv.patient.id"
              [patientName]="ctxv.patient.full_name || (ctxv.patient.first_name + ' ' + ctxv.patient.last_name)"
              source="opd"
              [encounterId]="ctxv.encounter?.id ?? null"
              (closed)="showOrderPanel.set(false)"
              (placed)="onInvestigationPlaced($event)"
            />
          }

          @if (showConsentPanel() && ctxView(); as ctxv) {
            <app-consent-capture
              [patientId]="ctxv.patient.id"
              [patientName]="ctxv.patient.full_name || (ctxv.patient.first_name + ' ' + ctxv.patient.last_name)"
              [encounterId]="ctxv.encounter?.id ?? null"
              (closed)="showConsentPanel.set(false)"
              (saved)="onConsentSaved($event)"
            />
          }

          @if (showBloodRequest() && ctxView(); as ctxv) {
            <app-blood-request-dialog
              [patientId]="ctxv.patient.id"
              [patientName]="ctxv.patient.full_name || (ctxv.patient.first_name + ' ' + ctxv.patient.last_name)"
              [encounterId]="ctxv.encounter?.id ?? null"
              [patientBloodGroupText]="ctxv.patient.blood_group ?? null"
              (cancelled)="showBloodRequest.set(false)"
              (created)="onBloodRequested($event)"
            />
          }

          <!-- Prescription builder -->
          <article class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
            <header class="flex items-center justify-between px-4 py-[14px] border-b border-border">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Prescriptions</p>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ c.prescriptionItems.length }} item(s) · interactions checked automatically</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" (click)="printRxOnly()"
                        [disabled]="c.prescriptionItems.length === 0"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                  🖨 Print Rx
                </button>
                <button type="button" (click)="showTemplates.set(true); loadTemplates()"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                  Templates
                </button>
                <button type="button" (click)="saveAsTemplate()"
                        class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                  Save as template
                </button>
              </div>
            </header>

            <ul class="divide-y divide-border">
              @for (item of c.prescriptionItems; track item.id) {
                <li class="px-4 py-3 flex items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-medium text-ink">
                      {{ item.drug_name }}
                      @if (item.strength) { <span class="text-ink-muted font-normal">· {{ item.strength }}</span> }
                      @if (item.form) { <span class="text-ink-muted font-normal">· {{ item.form }}</span> }
                    </p>
                    <p class="text-[11px] text-ink-muted mt-0.5 font-mono">
                      {{ item.dosage || '—' }}
                      @if (item.frequency) { · {{ item.frequency }} }
                      @if (item.duration_days) { · {{ item.duration_days }}d }
                      @if (item.qty) { · qty {{ item.qty }} }
                      @if (item.route) { · {{ item.route }} }
                    </p>
                    @if (item.instructions) {
                      <p class="text-[11px] text-ink-soft mt-0.5 italic">{{ item.instructions }}</p>
                    }
                  </div>
                  <button (click)="removeItem(item.id)" class="h-7 px-2 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">Remove</button>
                </li>
              } @empty {
                <li class="px-4 py-6 text-center text-[12px] text-ink-muted">No items yet — add a prescription below.</li>
              }
            </ul>

            <!-- Add item form -->
            <form [formGroup]="rxForm" (ngSubmit)="addItem()" class="border-t border-border bg-surface-muted px-4 py-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">Add medication</p>
              <div class="grid grid-cols-12 gap-2">
                <input formControlName="drug_name" placeholder="Drug name" class="col-span-12 md:col-span-4 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <input formControlName="strength" placeholder="500 mg" class="col-span-6 md:col-span-2 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <select formControlName="form" class="col-span-6 md:col-span-2 h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink-soft appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="">Form…</option>
                  @for (f of formOptions; track f) { <option [value]="f">{{ f }}</option> }
                </select>
                <select formControlName="route" class="col-span-6 md:col-span-2 h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink-soft appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="">Route…</option>
                  @for (r of routeOptions; track r) { <option [value]="r">{{ r }}</option> }
                </select>
                <input formControlName="frequency" placeholder="BD / TDS / QID" class="col-span-6 md:col-span-2 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

                <input formControlName="dosage" placeholder="1 tablet" class="col-span-6 md:col-span-3 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <input formControlName="duration_days" type="number" min="1" placeholder="Days" class="col-span-3 md:col-span-2 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <input formControlName="qty" type="number" min="1" placeholder="Qty" class="col-span-3 md:col-span-2 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <input formControlName="instructions" placeholder="After meals" class="col-span-12 md:col-span-5 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div class="flex justify-end mt-2">
                <button type="submit" [disabled]="rxForm.invalid || addingItem()"
                        class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                  + Add to prescription
                </button>
              </div>
            </form>
          </article>

          <!-- Templates modal -->
          @if (showTemplates()) {
            <div class="fixed inset-0 z-[100] flex items-center justify-center" (document:keydown.escape)="showTemplates.set(false)">
              <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
              <div class="relative bg-surface-card rounded-xl shadow-pop border border-border w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
                   (click)="$event.stopPropagation()">
                <header class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <h3 class="text-[14px] font-semibold text-ink">Prescription Templates</h3>
                  <button type="button" (click)="showTemplates.set(false)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle">&times;</button>
                </header>
                <div class="flex-1 overflow-y-auto p-3 space-y-2">
                  @if (loadingTemplates()) {
                    <p class="text-center text-[12px] text-ink-muted py-6">Loading templates...</p>
                  } @else {
                    @for (tpl of templates(); track tpl.id) {
                      <div class="border border-border rounded-lg p-3 hover:bg-surface-subtle transition-colors">
                        <div class="flex items-start justify-between">
                          <div>
                            <p class="text-[13px] font-medium text-ink">{{ tpl.name }}</p>
                            <p class="text-[11px] text-ink-muted mt-0.5">{{ tpl.condition || 'General' }} &middot; {{ tpl.items.length }} item(s)</p>
                          </div>
                          <div class="flex items-center gap-1">
                            <button type="button" (click)="applyTemplate(tpl)"
                                    class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white">
                              Apply
                            </button>
                            <button type="button" (click)="deleteTemplate(tpl.id)"
                                    class="h-7 px-2 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">
                              &times;
                            </button>
                          </div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1">
                          @for (item of tpl.items; track item.drug_name) {
                            <span class="inline-flex items-center h-5 px-2 rounded-full bg-surface-muted text-[10px] text-ink-soft">{{ item.drug_name }}</span>
                          }
                        </div>
                      </div>
                    } @empty {
                      <p class="text-center text-[12px] text-ink-muted py-6">No templates yet. Save your first from the prescription builder.</p>
                    }
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- RIGHT: vitals + actions -->
        <div class="col-span-12 lg:col-span-4 space-y-[14px]">

          <!-- Phase 5: Lab inbox — verified reports for this patient -->
          @if (labInbox().length > 0) {
            <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
              <header class="flex items-center justify-between mb-2.5">
                <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                  🧪 Lab inbox
                </p>
                <span class="text-[10px] text-ink-muted">{{ labInbox().length }} report{{ labInbox().length === 1 ? '' : 's' }}</span>
              </header>
              <ul class="space-y-2">
                @for (r of labInbox(); track r.id) {
                  <li class="rounded-md border border-border/70 px-2.5 py-2 hover:border-primary-200 hover:bg-primary-50/30 transition-colors cursor-pointer"
                      (click)="openLabReport(r.id)">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-[12px] font-semibold text-ink truncate flex-1">
                        {{ (r.results?.length ?? 0) }} test{{ r.results?.length === 1 ? '' : 's' }} ·
                        <span class="font-mono text-[10px] text-ink-muted">{{ r.sample_id || '—' }}</span>
                      </p>
                      <span class="px-1.5 py-px rounded text-[9px] font-semibold uppercase shrink-0"
                            [class.bg-emerald-50]="r.state !== 'delivered'"
                            [class.text-emerald-700]="r.state !== 'delivered'"
                            [class.bg-slate-100]="r.state === 'delivered'"
                            [class.text-slate-600]="r.state === 'delivered'">
                        {{ r.state.replace('_', ' ') }}
                      </span>
                    </div>
                    <p class="text-[10.5px] text-ink-muted truncate mt-0.5">
                      {{ labInboxSummary(r) }}
                    </p>
                    @if (labInboxCriticalCount(r) > 0) {
                      <p class="text-[10.5px] mt-1 text-rose-700 font-semibold">
                        🚨 {{ labInboxCriticalCount(r) }} critical value(s)
                      </p>
                    }
                  </li>
                }
              </ul>
            </article>
          }

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2.5">Latest vitals</p>
            <div class="grid grid-cols-2 gap-2">
              @for (v of vitalsTiles(); track v.label) {
                <div class="bg-surface-muted rounded-md p-2.5">
                  <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">{{ v.label }}</p>
                  <p class="font-mono text-[14px] text-ink mt-0.5">{{ v.value ?? '—' }}<span class="text-[10px] text-ink-muted ml-1">{{ v.unit }}</span></p>
                </div>
              }
            </div>
            @if (c.latestVitals) {
              <p class="text-[10px] text-ink-muted mt-2.5 font-mono">recorded {{ formatVitalTime(c.latestVitals.recorded_at) }}</p>
            }
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2.5">Capture vitals</p>
            <form [formGroup]="vitalsForm" (ngSubmit)="saveVitals()" class="space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">BP systolic</span>
                  <input formControlName="bp_systolic" type="number" min="50" max="260" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">BP diastolic</span>
                  <input formControlName="bp_diastolic" type="number" min="30" max="180" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Pulse</span>
                  <input formControlName="pulse" type="number" min="20" max="250" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">SpO₂ %</span>
                  <input formControlName="spo2_pct" type="number" min="50" max="100" step="0.1" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Temp °C</span>
                  <input formControlName="temp_celsius" type="number" min="30" max="45" step="0.1" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Sugar mg/dL</span>
                  <input formControlName="blood_sugar_mgdl" type="number" min="20" max="800" step="0.1" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Height cm</span>
                  <input formControlName="height_cm" type="number" min="30" max="250" step="0.1" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Weight kg</span>
                  <input formControlName="weight_kg" type="number" min="0.5" max="400" step="0.1" class="w-full h-8 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                </label>
              </div>
              <button type="submit" [disabled]="savingVitals()"
                      class="w-full h-9 mt-1 rounded-md border border-border bg-surface-card text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                {{ savingVitals() ? 'Saving…' : 'Record vitals' }}
              </button>
            </form>
          </article>

          <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">Encounter status</p>
            <p class="text-[13px] text-ink capitalize">{{ c.encounter.status }}</p>
            <p class="text-[11px] text-ink-muted font-mono mt-1">started {{ formatVitalTime(c.encounter.started_at) }}</p>
          </article>
        </div>
      </div>
    } @else {
      <div class="max-w-3xl">
        <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center">
          <p class="text-[13px] text-ink-muted">Loading consultation…</p>
        </div>
      </div>
    }
  `,
})
export class ConsultationPage implements OnInit {
  readonly appointmentId = input.required<string>();

  private fb = inject(FormBuilder);
  private auth = inject(AuthStore);
  private svc = inject(ConsultationService);
  private rxTemplateSvc = inject(RxTemplateService);
  private apptSvc = inject(AppointmentsService);
  private printSvc = inject(ConsultationPrintService);
  private rxPdf    = inject(PrescriptionPdfService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private labSvc = inject(LabService);
  private labReportSvc = inject(LabReportPdfService);

  /** Phase 5: lab inbox — recent verified reports for this consultation's patient. */
  protected readonly labInbox = signal<any[]>([]);

  protected labInboxSummary(o: any): string {
    const tests = (o.results ?? []).map((r: any) => r.test?.code ?? '').filter(Boolean).slice(0, 4);
    const more = (o.results?.length ?? 0) - tests.length;
    return tests.join(' · ') + (more > 0 ? ` + ${more} more` : '');
  }
  protected labInboxCriticalCount(o: any): number {
    return (o.results ?? []).filter((r: any) => r.flag === 'critical_low' || r.flag === 'critical_high').length;
  }
  protected openLabReport(orderId: string): void {
    void this.labReportSvc.openReport(orderId, { autoPrint: false });
  }

  protected readonly ctx = signal<ConsultationContext | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly savingVitals = signal(false);
  protected readonly addingItem = signal(false);
  protected readonly interactions = signal<{ a: string; b: string; severity: InteractionSeverity; message: string }[]>([]);
  protected readonly showTemplates = signal(false);
  protected readonly templates = signal<RxTemplate[]>([]);
  protected readonly loadingTemplates = signal(false);
  protected readonly showOrderPanel   = signal(false);
  protected readonly showConsentPanel = signal(false);
  protected readonly showBloodRequest = signal(false);
  private consentPdfSvc = inject(ConsentPdfService);

  // Convenience: a non-null view of the current context for the order panel inputs.
  protected readonly ctxView = computed(() => this.ctx());

  protected onInvestigationPlaced(_e: { orderId: string }) {
    this.toast.success('Investigations ordered', 'Sent to lab queue.');
    this.showOrderPanel.set(false);
  }

  protected onConsentSaved(e: { consentId: string }) {
    this.toast.success('Consent saved', 'Signed consent recorded in patient record.');
    this.showConsentPanel.set(false);
    void this.consentPdfSvc.openPrint(e.consentId, { autoPrint: false });
  }

  protected onBloodRequested(_requestId: string) {
    this.toast.success('Blood request created', 'Sent to Blood Bank queue.');
    this.showBloodRequest.set(false);
  }

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly formOptions: DrugForm[] = ['tablet','capsule','syrup','injection','inhaler','drops','cream','ointment','suspension','other'];
  protected readonly routeOptions: DrugRoute[] = ['oral','iv','im','sc','topical','inhaled','sublingual','rectal','ophthalmic','otic','nasal'];

  protected readonly form = this.fb.nonNullable.group({
    presenting_complaint: [''],
    history: [''],
    physical_examination: [''],
    assessment: [''],
    plan: [''],
  });

  protected readonly rxForm = this.fb.nonNullable.group({
    drug_name: ['', [Validators.required]],
    strength: [''],
    form: this.fb.control<DrugForm | ''>('', { nonNullable: true }),
    route: this.fb.control<DrugRoute | ''>('', { nonNullable: true }),
    frequency: [''],
    dosage: [''],
    duration_days: [''],
    qty: [''],
    instructions: [''],
  });

  protected readonly vitalsForm = this.fb.nonNullable.group({
    bp_systolic: [''],
    bp_diastolic: [''],
    pulse: [''],
    spo2_pct: [''],
    temp_celsius: [''],
    blood_sugar_mgdl: [''],
    height_cm: [''],
    weight_kg: [''],
  });

  protected readonly vitalsTiles = computed(() => {
    const v = this.ctx()?.latestVitals ?? null;
    const bp = v?.bp_systolic && v?.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : null;
    const m = v?.height_cm ? Number(v.height_cm) / 100 : 0;
    const bmi = m > 0 && v?.weight_kg ? (Number(v.weight_kg) / (m * m)).toFixed(1) : null;
    return [
      { label: 'BP',    value: bp,                          unit: 'mmHg' },
      { label: 'Pulse', value: v?.pulse ?? null,            unit: 'bpm' },
      { label: 'SpO₂',  value: v?.spo2_pct ?? null,         unit: '%' },
      { label: 'Temp',  value: v?.temp_celsius ?? null,     unit: '°C' },
      { label: 'Sugar', value: v?.blood_sugar_mgdl ?? null, unit: 'mg/dL' },
      { label: 'BMI',   value: bmi,                         unit: '' },
    ];
  });

  async ngOnInit() {
    const branchId = this.auth.claims().branch_id;
    const staffId  = this.auth.staffId();
    if (!branchId || !staffId) {
      this.loadError.set('Your session is missing branch / staff claims. Sign out and back in.');
      return;
    }
    try {
      const ctx = await this.svc.load({
        appointmentId: this.appointmentId(),
        branchId,
        doctorStaffId: staffId,
      });
      this.ctx.set(ctx);

      // Phase 5: load recent verified lab reports for this patient (non-blocking)
      this.labSvc.listRecentReportsForPatient(ctx.patient.id, 5)
        .then(reports => this.labInbox.set(reports))
        .catch(() => this.labInbox.set([]));

      this.form.patchValue({
        presenting_complaint: ctx.encounter.presenting_complaint ?? '',
        history: ctx.encounter.history ?? '',
        physical_examination: ctx.encounter.physical_examination ?? '',
        assessment: ctx.encounter.assessment ?? '',
        plan: ctx.encounter.plan ?? '',
      });
      void this.refreshInteractions();
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not load consultation.');
    }
  }

  protected initials(c: ConsultationContext) {
    return ((c.patient.first_name?.[0] ?? '') + (c.patient.last_name?.[0] ?? '')).toUpperCase() || '–';
  }

  protected ageGenderLabel(p: { date_of_birth: string; gender: string }) {
    const age = ageFromDob(p.date_of_birth);
    return age === null ? p.gender : `${age}y · ${p.gender}`;
  }

  protected formatVitalTime(iso: string) {
    try { return format(parseISO(iso), 'HH:mm · d MMM'); } catch { return ''; }
  }

  protected allergyChipCls(severity: AllergySeverity) {
    const tone = severity === 'life_threatening' || severity === 'severe' ? 'bg-danger-bg text-danger-strong'
                : severity === 'moderate' ? 'bg-warn-bg text-warn-strong'
                : 'bg-surface-subtle text-ink-soft';
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }

  protected interactionChipCls(severity: InteractionSeverity) {
    const tone = severity === 'contraindicated' || severity === 'severe' ? 'bg-danger-bg text-danger-strong' : 'bg-warn-bg text-warn-strong';
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }

  protected async save() {
    const c = this.ctx();
    if (!c) return;
    this.saving.set(true);
    try {
      const updated = await this.svc.updateEncounter(c.encounter.id, this.form.getRawValue());
      this.ctx.update((prev) => prev ? { ...prev, encounter: updated } : prev);
      this.toast.success('Saved', 'Encounter draft updated');
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async finalise() {
    const c = this.ctx();
    if (!c) return;
    this.saving.set(true);
    try {
      await this.svc.updateEncounter(c.encounter.id, this.form.getRawValue());
      await this.svc.finaliseEncounter(c.encounter.id);
      if (c.prescription && c.prescriptionItems.length > 0) {
        await this.svc.activatePrescription(c.prescription.id);
      }
      if (c.appointment) {
        await this.apptSvc.updateStatus(c.appointment.id, 'completed');
      }
      this.toast.success('Consultation finalised', 'Opening print preview…');
      try {
        await this.printSvc.print(c.encounter.id);
      } catch (e) {
        this.toast.error('Could not open print', e instanceof Error ? e.message : 'Try again.');
      }
      this.router.navigate(['/opd-queue']);
    } catch (e) {
      this.toast.error('Could not finalise', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async printNote() {
    const c = this.ctx();
    if (!c) return;
    try {
      await this.printSvc.print(c.encounter.id);
    } catch (e) {
      this.toast.error('Could not open print', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected async addItem() {
    const c = this.ctx();
    if (!c?.prescription || this.rxForm.invalid) return;
    this.addingItem.set(true);
    try {
      const v = this.rxForm.getRawValue();
      const created = await this.svc.addRxItem({
        prescription_id: c.prescription.id,
        drug_name: v.drug_name.trim(),
        strength: v.strength || null,
        form: (v.form || null) as DrugForm | null,
        route: (v.route || null) as DrugRoute | null,
        frequency: v.frequency || null,
        dosage: v.dosage || null,
        duration_days: v.duration_days ? Number(v.duration_days) : null,
        qty: v.qty ? Number(v.qty) : null,
        instructions: v.instructions || null,
        position: c.prescriptionItems.length,
      });
      this.ctx.update((prev) => prev ? { ...prev, prescriptionItems: [...prev.prescriptionItems, created] } : prev);
      this.rxForm.reset({ drug_name: '', strength: '', form: '', route: '', frequency: '', dosage: '', duration_days: '', qty: '', instructions: '' });
      void this.refreshInteractions();
    } catch (e) {
      this.toast.error('Could not add', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.addingItem.set(false);
    }
  }

  protected async removeItem(id: string) {
    try {
      await this.svc.removeRxItem(id);
      this.ctx.update((prev) => prev ? { ...prev, prescriptionItems: prev.prescriptionItems.filter((x) => x.id !== id) } : prev);
      void this.refreshInteractions();
    } catch (e) {
      this.toast.error('Could not remove', e instanceof Error ? e.message : 'Try again.');
    }
  }

  private async refreshInteractions() {
    const items = this.ctx()?.prescriptionItems ?? [];
    if (items.length < 2) {
      this.interactions.set([]);
      return;
    }
    const drugs = items.map((i) => i.drug_name.toLowerCase().trim()).filter(Boolean);
    try {
      const flags = await this.svc.checkInteractions(drugs);
      this.interactions.set(flags);
    } catch {
      this.interactions.set([]);
    }
  }

  protected async saveVitals() {
    const c = this.ctx();
    if (!c) return;
    const staffId = this.auth.staffId();
    const v = this.vitalsForm.getRawValue();
    const num = (s: string) => (s ? Number(s) : null);
    const hasAny = Object.values(v).some((x) => x !== '' && x !== null);
    if (!hasAny) return;

    // Client-side validation matching DB CHECK constraints (medically-valid ranges)
    const payload = {
      bp_systolic:      num(v.bp_systolic),
      bp_diastolic:     num(v.bp_diastolic),
      pulse:            num(v.pulse),
      spo2_pct:         num(v.spo2_pct),
      temp_celsius:     num(v.temp_celsius),
      blood_sugar_mgdl: num(v.blood_sugar_mgdl),
      height_cm:        num(v.height_cm),
      weight_kg:        num(v.weight_kg),
    };
    const ranges: Record<string, { label: string; min: number; max: number }> = {
      bp_systolic:      { label: 'BP systolic',       min: 50,  max: 260 },
      bp_diastolic:     { label: 'BP diastolic',      min: 30,  max: 180 },
      pulse:            { label: 'Pulse',             min: 20,  max: 250 },
      spo2_pct:         { label: 'SpO₂ %',            min: 50,  max: 100 },
      temp_celsius:     { label: 'Temperature (°C)',  min: 30,  max: 45  },
      blood_sugar_mgdl: { label: 'Blood sugar mg/dL', min: 20,  max: 800 },
      height_cm:        { label: 'Height (cm)',       min: 30,  max: 250 },
      weight_kg:        { label: 'Weight (kg)',       min: 0.5, max: 400 },
    };
    for (const [k, val] of Object.entries(payload)) {
      if (val == null) continue;
      const r = ranges[k];
      if (val < r.min || val > r.max) {
        this.toast.error(
          `${r.label} out of range`,
          `Allowed: ${r.min}–${r.max}. You entered ${val}. Leave blank if you don't have this reading.`,
        );
        return;
      }
    }

    this.savingVitals.set(true);
    try {
      const created = await this.svc.addVitals({
        patient_id: c.patient.id,
        encounter_id: c.encounter.id,
        recorded_by_staff_id: staffId,
        ...payload,
      });
      this.ctx.update((prev) => prev ? { ...prev, latestVitals: created } : prev);
      this.vitalsForm.reset({ bp_systolic:'', bp_diastolic:'', pulse:'', spo2_pct:'', temp_celsius:'', blood_sugar_mgdl:'', height_cm:'', weight_kg:'' });
      this.toast.success('Vitals recorded');
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.savingVitals.set(false);
    }
  }

  protected async loadTemplates() {
    this.loadingTemplates.set(true);
    try {
      this.templates.set(await this.rxTemplateSvc.list());
    } catch { /* ignore */ }
    finally { this.loadingTemplates.set(false); }
  }

  protected async applyTemplate(tpl: RxTemplate) {
    const c = this.ctx();
    if (!c?.prescription) return;
    for (const item of tpl.items) {
      const created = await this.svc.addRxItem({
        prescription_id: c.prescription.id,
        drug_name: item.drug_name,
        strength: item.strength || null,
        form: (item.form || null) as any,
        route: (item.route || null) as any,
        frequency: item.frequency || null,
        dosage: item.dosage || null,
        duration_days: item.duration_days,
        qty: item.qty,
        instructions: item.instructions || null,
        position: c.prescriptionItems.length,
      });
      this.ctx.update((prev) => prev ? { ...prev, prescriptionItems: [...prev.prescriptionItems, created] } : prev);
    }
    this.showTemplates.set(false);
    this.toast.success('Template applied', `${tpl.items.length} items added`);
    void this.refreshInteractions();
  }

  protected async saveAsTemplate() {
    const c = this.ctx();
    if (!c || c.prescriptionItems.length === 0) {
      this.toast.warn('No items', 'Add medications before saving as template.');
      return;
    }
    const name = prompt('Template name:');
    if (!name) return;
    const condition = prompt('Condition (optional):') || '';
    const items = c.prescriptionItems.map((i) => ({
      drug_name: i.drug_name,
      strength: i.strength || '',
      form: i.form || '',
      route: i.route || '',
      frequency: i.frequency || '',
      dosage: i.dosage || '',
      duration_days: i.duration_days,
      qty: i.qty,
      instructions: i.instructions || '',
    }));
    try {
      await this.rxTemplateSvc.create({ name, condition, is_shared: false, items });
      this.toast.success('Template saved', name);
    } catch {
      this.toast.error('Could not save', 'Please try again.');
    }
  }

  protected async deleteTemplate(id: string) {
    try {
      await this.rxTemplateSvc.remove(id);
      this.templates.update((list) => list.filter((t) => t.id !== id));
    } catch {
      this.toast.error('Could not delete', 'Please try again.');
    }
  }

  protected printRxOnly(): void {
    const c = this.ctx();
    if (!c || c.prescriptionItems.length === 0) return;
    const p = c.patient;
    const e = c.encounter;
    const allergies = (c.allergies ?? []).map((a: any) => a.allergen).filter(Boolean);

    this.rxPdf.generate({
      patient: {
        uhid: p.uhid,
        full_name: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
        age_years: ageFromDob(p.date_of_birth) ?? '',
        gender: p.gender,
        mobile: p.mobile,
        weight_kg: (e as any).weight_kg ?? null,
        allergies,
      },
      doctor: {
        full_name: (c as any).doctor?.full_name ?? this.auth.user()?.email?.split('@')[0] ?? 'Doctor',
        role_slug: (c as any).doctor?.role_slug ?? null,
        registration_no: (c as any).doctor?.metadata?.registration_no ?? null,
        signature_data_url: (c as any).doctor?.signature_data_url ?? null,
      },
      visit: {
        encounter_id: e.id,
        visit_date: new Date((e as any).visit_date ?? e.created_at).toISOString().slice(0, 10),
        chief_complaint: (e as any).chief_complaint ?? null,
        diagnosis: (e as any).assessment ?? null,
        vitals: (e as any).vitals_bp ? {
          bp:    (e as any).vitals_bp,
          pulse: (e as any).vitals_pulse,
          temp:  (e as any).vitals_temp,
          spo2:  (e as any).vitals_spo2,
        } : null,
      },
      items: c.prescriptionItems.map(i => ({
        drug_name: i.drug_name,
        strength: i.strength,
        form: i.form,
        route: i.route,
        frequency: i.frequency,
        dosage: i.dosage,
        duration_days: i.duration_days,
        qty: i.qty,
        instructions: i.instructions,
      })),
      follow_up_date: (e as any).follow_up_date ?? null,
      notes: (e as any).plan ?? null,
      hospital: {
        name: 'Sree Diagnostics',
        branch_label: undefined,
      },
    });
  }
}
