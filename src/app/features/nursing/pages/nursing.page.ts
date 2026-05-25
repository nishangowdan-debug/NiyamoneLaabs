import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  LucideAngularModule,
  type LucideIconData,
  Stethoscope,
  FileSignature,
  Droplet,
  Siren,
  ClipboardX,
  FlaskConical,
  Tablets,
  Droplets,
  NotebookPen,
  Package,
  LogOut,
  FileText,
  CalendarClock,
  CalendarPlus,
  Wallet,
  Zap,
} from 'lucide-angular';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { NursingService } from '../data/nursing.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentsService } from '../../appointments/data/appointments.service';
import type { AppointmentRow } from '../../appointments/data/appointments.types';
import {
  MAR_STATUS_TONE,
  type ActiveAdmission, type ClinicalNote, type DischargeChecklist, type DischargeSummaryNarrative,
  type DoctorVisit, type IoEntry, type LedgerSummary,
  type MarRecord, type MarStatus, type MedicationOrder, type PharmacyIndent,
} from '../data/nursing.types';
import { InvestigationOrderPanelComponent } from '../../lab/components/investigation-order-panel.component';
import { ConsentCaptureComponent } from '../../consent/components/consent-capture.component';
import { ConsentStatusChipsComponent } from '../../consent/components/consent-status-chips.component';
import { ConsentPdfService } from '../../consent/services/consent-pdf.service';
import { ConsentService } from '../../consent/data/consent.service';
import { BloodRequestDialogComponent } from '../../blood-bank/components/blood-request-dialog.component';
import { BloodRequestDetailComponent } from '../../blood-bank/components/blood-request-detail.component';
import { TransfusionRunsheetComponent } from '../../blood-bank/components/transfusion-runsheet.component';
import { BloodBankService } from '../../blood-bank/data/blood-bank.service';
import {
  BLOOD_GROUP_LABELS, COMPONENT_LABELS,
  type BloodRequest, type BloodUnit,
} from '../../blood-bank/data/blood-bank.types';
import { IssueSlipPdfService } from '../../blood-bank/services/issue-slip-pdf.service';
import { CallCodeBlueDialogComponent } from '../../code-blue/components/call-code-blue-dialog.component';
import { DnrOrderFormComponent } from '../../code-blue/components/dnr-order-form.component';

type TabId = 'mar' | 'io' | 'notes' | 'indents' | 'visits' | 'blood' | 'discharge';

@Component({
  selector: 'app-nursing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, AlertComponent, InvestigationOrderPanelComponent, ConsentCaptureComponent, ConsentStatusChipsComponent, BloodRequestDialogComponent, BloodRequestDetailComponent, TransfusionRunsheetComponent, CallCodeBlueDialogComponent, DnrOrderFormComponent],
  template: `
<div class="flex flex-col gap-4 h-full">

  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconStethoscope" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Nursing Station</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        EMR core — MAR · I/O chart · clinical notes · ward indents · ledger ·
        <span class="inline-flex items-center gap-1.5 text-good-fg">
          <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
        </span>
      </p>
    </div>
  </header>

  @if (error()) { <app-alert tone="danger" title="Could not load">{{ error() }}</app-alert> }

  <div class="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_13rem] gap-3 flex-1 min-h-0">

    <!-- ── Admission picker ─────────────────────────────── -->
    <aside class="bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
      <header class="px-4 py-3 border-b border-border">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active admissions</p>
        <p class="text-[11px] text-ink-muted mt-0.5">{{ admissions().length }} in care</p>
      </header>
      @if (loading() && admissions().length === 0) {
        <div class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading…</div>
      } @else if (admissions().length === 0) {
        <div class="px-4 py-12 text-center text-[13px] text-ink-soft">No active admissions.</div>
      } @else {
        <ul class="divide-y divide-border overflow-y-auto">
          @for (a of admissions(); track a.id) {
            <li>
              <button type="button" (click)="select(a)"
                      class="w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors"
                      [class.bg-primary-50]="selected()?.id === a.id">
                <p class="text-[13px] font-semibold text-ink truncate">{{ a.patient_name }}</p>
                <p class="text-[11px] font-mono text-ink-muted">{{ a.uhid }}</p>
                <p class="text-[10px] text-ink-muted mt-0.5">
                  @if (a.bed_code) { Bed {{ a.bed_code }} · }
                  @if (a.ward_name) { {{ a.ward_name }} · }
                  Day {{ admissionDay(a.admitted_at) }}
                </p>
                @if (a.primary_diagnosis_icd10) {
                  <p class="text-[10px] font-mono text-primary-700 mt-0.5">{{ a.primary_diagnosis_icd10 }}</p>
                }
              </button>
            </li>
          }
        </ul>
      }
    </aside>

    <!-- ── Workspace ─────────────────────────────────────── -->
    <section class="flex flex-col gap-3 min-h-0 min-w-0">
      @if (selected(); as a) {

        <!-- Admission summary banner + tabs -->
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <div class="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p class="text-[14px] font-semibold text-ink">{{ a.patient_name }} <span class="text-[11px] font-mono text-ink-muted">· {{ a.uhid }}</span></p>
              <p class="text-[11px] text-ink-muted mt-0.5">
                @if (a.bed_code) { 🛏 {{ a.bed_code }} · {{ a.ward_name }} · }
                Day {{ admissionDay(a.admitted_at) }} of stay
                @if (ledger(); as l) {
                  · Net payable <b [class.text-warn-fg]="l.net_payable_cents > 0" [class.text-ink]="l.net_payable_cents === 0">{{ formatINR(l.net_payable_cents) }}</b>
                }
              </p>
              <!-- Phase B: consent status chips on the patient header -->
              <div class="mt-2">
                <app-consent-status-chips
                  [patientId]="a.patient_id"
                  [patientName]="a.patient_name"
                  [admissionId]="a.id" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" (click)="showConsentPanel.set(true)"
                      class="h-9 px-3.5 rounded-md text-[13px] font-medium border border-warn-border text-warn-fg hover:bg-warn-bg/30 inline-flex items-center gap-2 whitespace-nowrap">
                <i-lucide [name]="iconConsent" [size]="18" [strokeWidth]="1.75"></i-lucide>
                <span>Consent</span>
              </button>
              <button type="button" (click)="showCodeBlue.set(true)"
                      class="h-9 px-3.5 rounded-md text-[13px] font-bold border border-danger-fg bg-danger-fg text-white hover:bg-danger-fg/90 inline-flex items-center gap-2 whitespace-nowrap">
                <i-lucide [name]="iconCodeBlue" [size]="18" [strokeWidth]="2"></i-lucide>
                <span>Code Blue</span>
              </button>
              <button type="button" (click)="showDnr.set(true)"
                      class="h-9 px-3.5 rounded-md text-[13px] font-medium border border-warn-border text-warn-fg hover:bg-warn-bg/30 inline-flex items-center gap-2 whitespace-nowrap">
                <i-lucide [name]="iconDnr" [size]="18" [strokeWidth]="1.75"></i-lucide>
                <span>DNR Order</span>
              </button>
              <button type="button" (click)="showOrderPanel.set(true)"
                      class="h-9 px-3.5 rounded-md text-[13px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50 inline-flex items-center gap-2 whitespace-nowrap">
                <i-lucide [name]="iconLab" [size]="18" [strokeWidth]="1.75"></i-lucide>
                <span>Order labs / radiology</span>
              </button>
              <div class="inline-flex bg-surface-muted rounded-md p-0.5">
                @for (t of tabs; track t.id) {
                  <button (click)="tab.set(t.id)" [class]="tabBtnCls(t.id)">
                    <i-lucide [name]="t.icon" [size]="19" [strokeWidth]="1.75"></i-lucide>
                    <span>{{ t.label }}</span>
                    @if (t.id === 'mar' && pendingMar() > 0) {
                      <span class="ml-1 inline-block px-1.5 h-[16px] rounded-full bg-warn-fg text-white text-[9px] font-bold">{{ pendingMar() }}</span>
                    }
                  </button>
                }
              </div>
            </div>
          </div>
        </article>

        @if (showOrderPanel() && a) {
          <app-investigation-order-panel
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            source="ipd"
            [admissionId]="a.id"
            (closed)="showOrderPanel.set(false)"
            (placed)="onInvestigationPlaced($event)"
          />
        }

        @if (showConsentPanel() && a) {
          <app-consent-capture
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            [admissionId]="a.id"
            (closed)="showConsentPanel.set(false)"
            (saved)="onConsentSaved($event)"
          />
        }

        @if (showBloodRequest() && a) {
          <app-blood-request-dialog
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            [admissionId]="a.id"
            (cancelled)="showBloodRequest.set(false)"
            (created)="onBloodRequested($event)"
          />
        }

        <!-- Phase A trigger #2: Transfusion-consent gate before opening blood request -->
        @if (transfusionConsentGate() && a) {
          <app-consent-capture
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            [admissionId]="a.id"
            prefillFormCode="TRANSFUSION"
            (closed)="transfusionConsentGate.set(false)"
            (saved)="onTransfusionConsentSaved($event)" />
        }

        @if (showCodeBlue() && a) {
          <app-call-code-blue-dialog
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            [admissionId]="a.id"
            (cancelled)="showCodeBlue.set(false)"
            (created)="onCodeBlueCreated($event)"
          />
        }

        @if (showDnr() && a) {
          <app-dnr-order-form
            [patientId]="a.patient_id"
            [patientName]="a.patient_name"
            [admissionId]="a.id"
            (cancelled)="showDnr.set(false)"
            (created)="onDnrCreated($event)"
          />
        }

        <!-- ══════════════ MAR ══════════════ -->
        @if (tab() === 'mar') {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden flex-1 min-h-0 flex flex-col">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconMar" [size]="19" [strokeWidth]="1.75"></i-lucide><span>MAR — Medication Administration Record</span></p>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ orders().length }} active order(s) · {{ pendingMar() }} dose(s) due</p>
              </div>
              <button (click)="openOrder()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">+ New medication order</button>
            </header>

            <div class="overflow-auto flex-1">
              @if (orders().length === 0) {
                <div class="p-8 text-center text-[13px] text-ink-muted">No medication orders yet.</div>
              } @else {
                <ul class="divide-y divide-border">
                  @for (o of orders(); track o.id) {
                    <li class="px-5 py-4">
                      <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div class="min-w-0">
                          <p class="text-[14px] font-semibold text-ink">
                            {{ o.drug_name }}
                            @if (o.strength) { <span class="text-ink-muted font-normal">· {{ o.strength }}</span> }
                          </p>
                          <p class="text-[11px] text-ink-muted">
                            <b>{{ o.dose }}</b> · {{ o.frequency }} ({{ o.frequency_per_day }}/day) · {{ o.duration_days }}d
                            @if (o.route) { · {{ o.route }} }
                          </p>
                        </div>
                        <span class="text-[10px] font-bold uppercase px-2 h-[20px] inline-flex items-center rounded-full"
                              [class.bg-good-bg]="o.status === 'active'"
                              [class.text-good-fg]="o.status === 'active'"
                              [class.bg-surface-subtle]="o.status !== 'active'"
                              [class.text-ink-muted]="o.status !== 'active'">{{ o.status }}</span>
                      </div>

                      <!-- Timeline of doses -->
                      <div class="mt-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">
                        @for (m of orderMar(o.id); track m.id) {
                          <button type="button" [disabled]="m.status === 'given'"
                                  (click)="m.status === 'pending' ? openMar(m) : null"
                                  class="text-left px-2 py-1.5 rounded-md border transition-colors disabled:cursor-default"
                                  [class.border-good-fg]="m.status === 'given'"
                                  [class.bg-good-bg]="m.status === 'given'"
                                  [class.border-warn-fg]="m.status === 'pending' && isOverdue(m)"
                                  [class.bg-warn-bg]="m.status === 'pending' && isOverdue(m)"
                                  [class.border-info-fg]="m.status === 'pending' && !isOverdue(m)"
                                  [class.bg-info-bg]="m.status === 'pending' && !isOverdue(m)"
                                  [class.border-danger-fg]="m.status === 'missed' || m.status === 'refused'"
                                  [class.bg-danger-bg]="m.status === 'missed' || m.status === 'refused'"
                                  [class.border-border]="m.status === 'held' || m.status === 'withheld'"
                                  [class.bg-surface-muted]="m.status === 'held' || m.status === 'withheld'">
                            <p class="text-[10px] font-mono">{{ formatTime(m.scheduled_at) }}</p>
                            <p class="text-[10px] font-semibold mt-0.5"
                               [class.text-good-fg]="m.status === 'given'"
                               [class.text-warn-fg]="m.status === 'pending' && isOverdue(m)"
                               [class.text-info-fg]="m.status === 'pending' && !isOverdue(m)"
                               [class.text-danger-fg]="m.status === 'missed' || m.status === 'refused'"
                               [class.text-ink-muted]="m.status === 'held' || m.status === 'withheld'">
                              {{ MAR_LABEL[m.status].label }}
                            </p>
                          </button>
                        }
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </article>
        }

        <!-- ══════════════ I/O ══════════════ -->
        @if (tab() === 'io') {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconIo" [size]="19" [strokeWidth]="1.75"></i-lucide><span>I/O Chart — fluid balance</span></p>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ ioEntries().length }} entries</p>
              </div>
              @if (canWrite()) {
                <button (click)="openIo()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0891B2;">+ Add entry</button>
              }
            </header>

            <!-- Net balance card -->
            <div class="grid grid-cols-3 divide-x divide-border border-b border-border">
              <div class="px-5 py-4">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Intake total</p>
                <p class="font-display text-[24px] font-medium text-info-fg leading-none mt-1.5">{{ ioTotal('intake') }} mL</p>
              </div>
              <div class="px-5 py-4">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Output total</p>
                <p class="font-display text-[24px] font-medium text-warn-fg leading-none mt-1.5">{{ ioTotal('output') }} mL</p>
              </div>
              <div class="px-5 py-4">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Net balance</p>
                <p class="font-display text-[24px] font-medium leading-none mt-1.5"
                   [class.text-danger-fg]="Math.abs(ioBalance()) > 1500"
                   [class.text-warn-fg]="Math.abs(ioBalance()) <= 1500 && Math.abs(ioBalance()) > 500"
                   [class.text-good-fg]="Math.abs(ioBalance()) <= 500">
                  {{ ioBalance() > 0 ? '+' : '' }}{{ ioBalance() }} mL
                </p>
              </div>
            </div>

            <table class="w-full text-[13px]">
              <thead class="bg-surface-muted">
                <tr>
                  <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Time</th>
                  <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Direction</th>
                  <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Category</th>
                  <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Volume</th>
                  <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                @for (e of ioEntries(); track e.id) {
                  <tr class="border-t border-border">
                    <td class="px-4 py-2 font-mono text-[11px] text-ink-soft">{{ shortDateTime(e.recorded_at) }}</td>
                    <td class="px-4 py-2">
                      <span class="text-[10px] font-bold uppercase px-1.5 h-[18px] inline-flex items-center rounded-full"
                            [class.bg-info-bg]="e.direction === 'intake'"
                            [class.text-info-fg]="e.direction === 'intake'"
                            [class.bg-warn-bg]="e.direction === 'output'"
                            [class.text-warn-fg]="e.direction === 'output'">
                        {{ e.direction === 'intake' ? '↓ IN' : '↑ OUT' }}
                      </span>
                    </td>
                    <td class="px-4 py-2 text-ink-soft capitalize">{{ e.category }}</td>
                    <td class="px-4 py-2 text-right font-mono">{{ e.volume_ml }} mL</td>
                    <td class="px-4 py-2 text-ink-muted truncate max-w-[200px]">{{ e.notes }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </article>
        }

        <!-- ══════════════ NOTES ══════════════ -->
        @if (tab() === 'notes') {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconNotes" [size]="19" [strokeWidth]="1.75"></i-lucide><span>Clinical notes</span></p>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ notes().length }} note(s)</p>
              </div>
              <div class="flex gap-2 flex-wrap">
                @if (canWrite()) {
                  <button (click)="openNote('soap')"     class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-muted">+ SOAP</button>
                  <button (click)="openNote('progress')" class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-muted">+ Progress</button>
                  <button (click)="openNote('nursing')"  class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-muted">+ Nursing</button>
                }
                <button (click)="tab.set('discharge')"
                        title="Open the discharge summary form"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold border border-primary-200 text-primary-700 hover:bg-primary-50">
                  📋 Discharge summary →
                </button>
              </div>
            </header>
            @if (notes().length === 0) {
              <div class="px-6 py-12 text-center text-[13px] text-ink-muted">No notes yet — add a SOAP / progress / nursing entry, or jump straight to the <button (click)="tab.set('discharge')" class="text-primary-700 hover:underline font-medium">Discharge summary →</button></div>
            } @else {
              <ul class="divide-y divide-border">
                @for (n of notes(); track n.id) {
                  <li class="px-5 py-4">
                    <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <span class="text-[10px] font-bold uppercase px-2 h-[20px] inline-flex items-center rounded-full bg-info-bg text-info-fg">{{ n.note_type }}</span>
                      <span class="text-[11px] text-ink-muted">{{ shortDateTime(n.noted_at) }}</span>
                    </div>
                    @if (n.note_type === 'soap') {
                      <dl class="text-[12px] text-ink-soft space-y-1">
                        @if (n.subjective) { <div><dt class="inline font-bold text-primary-700">S:</dt> <dd class="inline whitespace-pre-wrap">{{ n.subjective }}</dd></div> }
                        @if (n.objective)  { <div><dt class="inline font-bold text-primary-700">O:</dt> <dd class="inline whitespace-pre-wrap">{{ n.objective }}</dd></div> }
                        @if (n.assessment) { <div><dt class="inline font-bold text-primary-700">A:</dt> <dd class="inline whitespace-pre-wrap">{{ n.assessment }}</dd>
                          @if (n.diagnosis_icd10) { <span class="ml-1 text-[10px] font-mono px-1.5 h-[16px] inline-flex items-center rounded-full bg-surface-subtle text-ink-muted">{{ n.diagnosis_icd10 }}</span> }
                        </div> }
                        @if (n.plan)       { <div><dt class="inline font-bold text-primary-700">P:</dt> <dd class="inline whitespace-pre-wrap">{{ n.plan }}</dd></div> }
                      </dl>
                    } @else {
                      <p class="text-[12px] text-ink-soft whitespace-pre-wrap">{{ n.body }}</p>
                    }
                  </li>
                }
              </ul>
            }
          </article>
        }

        <!-- ══════════════ INDENTS + LEDGER ══════════════ -->
        @if (tab() === 'indents') {
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <!-- Indents -->
            <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconIndents" [size]="19" [strokeWidth]="1.75"></i-lucide><span>Pharmacy indents</span></p>
                  <p class="text-[11px] text-ink-muted mt-0.5">Indent → Dispense → Acknowledge → Return</p>
                </div>
                <button (click)="openIndent()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">+ New indent</button>
              </header>
              @if (indents().length === 0) {
                <div class="px-6 py-12 text-center text-[13px] text-ink-muted">No indents yet.</div>
              } @else {
                <ul class="divide-y divide-border">
                  @for (i of indents(); track i.id) {
                    <li class="px-4 py-3">
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <p class="text-[12px] font-semibold text-ink">
                          {{ i.drug_name }}
                          @if (i.strength) { <span class="text-ink-muted font-normal">· {{ i.strength }}</span> }
                        </p>
                        <span class="text-[9px] font-bold uppercase px-2 h-[18px] inline-flex items-center rounded-full"
                              [class.bg-warn-bg]="i.status === 'INDENT_CREATED'"
                              [class.text-warn-fg]="i.status === 'INDENT_CREATED'"
                              [class.bg-info-bg]="i.status === 'DISPENSED_TO_WARD'"
                              [class.text-info-fg]="i.status === 'DISPENSED_TO_WARD'"
                              [class.bg-good-bg]="i.status === 'RECEIVED_IN_WARD'"
                              [class.text-good-fg]="i.status === 'RECEIVED_IN_WARD'"
                              [class.bg-surface-subtle]="i.status === 'CANCELLED'"
                              [class.text-ink-muted]="i.status === 'CANCELLED'">{{ i.status.replace('_', ' ') }}</span>
                      </div>
                      <p class="text-[11px] text-ink-muted mt-0.5">
                        Qty {{ i.qty_dispensed }}/{{ i.qty_requested }}
                        @if (i.batch_number) { · batch <span class="font-mono">{{ i.batch_number }}</span> }
                        · {{ formatINR(i.qty_dispensed * i.unit_price_cents) }}
                      </p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        @if (i.status === 'INDENT_CREATED') {
                          <button (click)="quickDispense(i)" class="h-7 px-2.5 rounded-md text-[11px] font-semibold text-white shadow-card" style="background:#0E4F8C;">Dispense all</button>
                        }
                        @if (i.status === 'DISPENSED_TO_WARD') {
                          <button (click)="acknowledge(i)" class="h-7 px-2.5 rounded-md text-[11px] font-semibold text-white shadow-card" style="background:#16A34A;">✓ Acknowledge</button>
                        }
                        @if (i.status === 'DISPENSED_TO_WARD' || i.status === 'RECEIVED_IN_WARD') {
                          <button (click)="openReturn(i)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-danger-fg/30 text-danger-fg hover:bg-danger-bg">↩ Return</button>
                        }
                      </div>
                    </li>
                  }
                </ul>
              }
            </article>

            <!-- Ledger -->
            <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border">
                <p class="text-[13px] font-semibold text-ink">💼 Patient ledger (this admission)</p>
                <p class="text-[11px] text-ink-muted mt-0.5">Append-only · audited · finalized at discharge</p>
              </header>
              @if (ledger(); as l) {
                <div class="grid grid-cols-3 divide-x divide-border border-b border-border">
                  <div class="px-4 py-3">
                    <p class="text-[10px] uppercase text-ink-muted">Charges</p>
                    <p class="font-display text-[18px] font-medium text-ink leading-none mt-1">{{ formatINR(l.total_charges_cents) }}</p>
                  </div>
                  <div class="px-4 py-3">
                    <p class="text-[10px] uppercase text-ink-muted">Credits</p>
                    <p class="font-display text-[18px] font-medium text-good-fg leading-none mt-1">−{{ formatINR(l.total_credits_cents) }}</p>
                  </div>
                  <div class="px-4 py-3">
                    <p class="text-[10px] uppercase text-ink-muted">Net payable</p>
                    <p class="font-display text-[18px] font-medium text-primary-700 leading-none mt-1">{{ formatINR(l.net_payable_cents) }}</p>
                  </div>
                </div>
                @if (l.entries.length === 0) {
                  <div class="px-6 py-8 text-center text-[12px] text-ink-muted">No ledger activity yet.</div>
                } @else {
                  <ul class="divide-y divide-border max-h-[300px] overflow-y-auto">
                    @for (e of l.entries; track e.id) {
                      <li class="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-[12px] text-ink truncate">{{ e.description }}</p>
                          <p class="text-[10px] text-ink-muted">{{ shortDateTime(e.event_at) }} · <span class="capitalize">{{ e.category }}</span></p>
                        </div>
                        <p class="font-mono text-[12px] font-semibold shrink-0"
                           [class.text-good-fg]="e.amount_cents < 0"
                           [class.text-ink]="e.amount_cents > 0">
                          {{ e.amount_cents < 0 ? '−' : '' }}{{ formatINR(Math.abs(e.amount_cents)) }}
                        </p>
                      </li>
                    }
                  </ul>
                }
              } @else {
                <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading…</div>
              }
            </article>
          </div>
        }

        <!-- ══════════════ DOCTOR VISITS ══════════════ -->
        @if (tab() === 'visits') {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconStethoscope" [size]="19" [strokeWidth]="1.75"></i-lucide><span>Doctor visits / rounds</span></p>
                <p class="text-[11px] text-ink-muted mt-0.5">Each round posts a charge to the ledger. Goes to the discharge bill.</p>
              </div>
              <button (click)="openVisitModal()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">+ Log visit</button>
            </header>
            @if (visits().length === 0) {
              <div class="px-6 py-12 text-center text-[13px] text-ink-muted">No visits logged yet.</div>
            } @else {
              <ul class="divide-y divide-border">
                @for (v of visits(); track v.id) {
                  <li class="px-4 py-3 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-[12px] font-semibold text-ink">
                        {{ v.doctor_name ?? 'Doctor' }}
                        <span class="text-ink-muted font-normal ml-1.5">· {{ v.visit_type }}</span>
                      </p>
                      <p class="text-[10px] text-ink-muted mt-0.5">{{ shortDateTime(v.visited_at) }}</p>
                    </div>
                    <p class="font-mono text-[12px] font-semibold text-ink shrink-0">{{ formatINR(v.charge_cents) }}</p>
                  </li>
                }
              </ul>
            }
          </article>
        }

        <!-- ══════════════ BLOOD ══════════════ -->
        @if (tab() === 'blood') {
          <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
            <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconBlood" [size]="19" [strokeWidth]="1.75"></i-lucide>
                  <span>Blood — Receipt & Transfusion</span>
                </p>
                <p class="text-[11px] text-ink-muted mt-0.5">
                  {{ bloodIncoming().length }} incoming · {{ bloodAtWard().length }} at ward
                </p>
              </div>
              <button (click)="onRequestBloodClicked(a)"
                      class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
                      style="background:#0E4F8C;">+ Request blood</button>
            </header>

            <div class="p-4 space-y-5">

              <!-- Incoming dispatched -->
              <section>
                <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">
                  Incoming · awaiting receipt
                </h3>
                @if (bloodIncoming().length === 0) {
                  <p class="text-[12px] text-ink-soft">No units in transit to this admission.</p>
                } @else {
                  <ul class="space-y-2">
                    @for (r of bloodIncoming(); track r.id) {
                      <li class="rounded-md border border-warn-fg/40 bg-warn-fg/5 p-3 flex items-start justify-between gap-3 flex-wrap">
                        <div class="text-[12px] space-y-0.5">
                          <p class="font-mono font-semibold text-ink">{{ r.request_no }}
                            <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                                  [class.bg-danger-fg]="r.priority==='stat'" [class.text-white]="r.priority==='stat'"
                                  [class.bg-warn-fg]="r.priority==='urgent'"
                                  [class.bg-surface-subtle]="r.priority==='routine'">
                              {{ r.priority }}
                            </span>
                          </p>
                          @for (u of unitsForReq(r.id); track u.id) {
                            <p class="text-ink">
                              <span class="font-mono font-semibold">{{ u.unit_no }}</span>
                              · <b>{{ bloodGroupLabel(u.blood_group) }}</b>
                              · {{ bloodComponentLabel(u.component) }}
                              · {{ u.volume_ml }} ml
                              · expires {{ shortDateTime(u.expires_at) }}
                            </p>
                          }
                          <p class="text-[10px] text-ink-soft">
                            Cold-chain box <b class="font-mono text-ink">{{ r.cold_chain_box_id ?? '—' }}</b>
                            · Dispatched {{ formatTime(r.dispatched_at!) }}
                          </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <button (click)="printBloodIssueSlip(r)"
                                  class="h-8 px-2.5 rounded-md text-[11px] border border-border hover:bg-surface-subtle">
                            Slip
                          </button>
                          <button (click)="confirmBloodReceipt(r)"
                                  class="h-8 px-3 rounded-md text-[11px] font-semibold text-white"
                                  style="background:#137333;">
                            Confirm receipt
                          </button>
                        </div>
                      </li>
                    }
                  </ul>
                }
              </section>

              <!-- At-ward / ready to transfuse -->
              <section>
                <h3 class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">
                  At ward · ready to transfuse
                </h3>
                @if (bloodAtWard().length === 0) {
                  <p class="text-[12px] text-ink-soft">No units waiting to be transfused.</p>
                } @else {
                  <ul class="space-y-2">
                    @for (r of bloodAtWard(); track r.id) {
                      <li class="rounded-md border border-border bg-surface-subtle p-3 space-y-2">
                        <div class="flex items-center justify-between gap-3 flex-wrap text-[12px]">
                          <p class="font-mono font-semibold text-ink">{{ r.request_no }}</p>
                          <div class="flex items-center gap-2 text-[10px] text-ink-soft">
                            <span>Received {{ formatTime(r.ward_received_at!) }}</span>
                            <button (click)="printBloodIssueSlip(r)"
                                    class="h-7 px-2 rounded-md text-[11px] border border-border hover:bg-surface">
                              Slip
                            </button>
                          </div>
                        </div>
                        <ul class="space-y-1.5">
                          @for (u of unitsForReq(r.id); track u.id) {
                            <li class="flex items-center justify-between gap-2 rounded-md bg-surface-card border border-border px-2.5 py-1.5 text-[12px]">
                              <div>
                                <span class="font-mono font-semibold">{{ u.unit_no }}</span>
                                · <b>{{ bloodGroupLabel(u.blood_group) }}</b>
                                · {{ bloodComponentLabel(u.component) }}
                                · <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                                        [class.bg-good-fg]="u.state === 'transfused'"
                                        [class.text-white]="u.state === 'transfused' || u.state === 'issued'"
                                        [class.bg-warn-fg]="u.state === 'issued'">{{ u.state }}</span>
                              </div>
                              @if (u.state === 'issued') {
                                <button (click)="openRunsheet(r, u)"
                                        class="h-7 px-3 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500">
                                  ▶ {{ hasOpenTransfusion(u.id) ? 'Continue' : 'Start' }} transfusion
                                </button>
                              } @else if (u.state === 'transfused') {
                                <span class="text-[10px] text-good-fg">✓ Transfused</span>
                              }
                            </li>
                          }
                        </ul>
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>
          </article>
        }

        @if (bloodSelected()) {
          <app-blood-request-detail
            [request]="bloodSelected()!"
            (closed)="onBloodDetailClosed()" />
        }

        @if (runsheetFor(); as rs) {
          <app-transfusion-runsheet
            [request]="rs.request"
            [unit]="rs.unit"
            (closed)="runsheetFor.set(null)"
            (saved)="onRunsheetSaved()" />
        }

        <!-- ══════════════ DISCHARGE ══════════════ -->
        @if (tab() === 'discharge') {
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <!-- Left: checklist + handoff -->
            <article class="lg:col-span-3 bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconDischarge" [size]="19" [strokeWidth]="1.75"></i-lucide><span>Discharge handoff</span></p>
                  <p class="text-[11px] text-ink-muted mt-0.5">
                    Status: <span class="font-medium text-ink-soft capitalize">{{ dischargeStatusLabel() }}</span>
                    · {{ checklistDoneCount }}/12 items
                  </p>
                </div>
              </header>
              <div class="p-4">
                <ul class="space-y-2">
                  <li class="flex items-center gap-2">
                    <input type="checkbox" id="dc1" [(ngModel)]="dc_meds" class="size-4 rounded">
                    <label for="dc1" class="text-[13px] text-ink-soft">Unused medicines returned to pharmacy</label>
                  </li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc2" [(ngModel)]="dc_iv" class="size-4 rounded"><label for="dc2" class="text-[13px] text-ink-soft">IV lines / catheters removed</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc3" [(ngModel)]="dc_belongings" class="size-4 rounded"><label for="dc3" class="text-[13px] text-ink-soft">Personal belongings handed over</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc4" [(ngModel)]="dc_vitals" class="size-4 rounded"><label for="dc4" class="text-[13px] text-ink-soft">Final vitals recorded</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc5" [(ngModel)]="dc_summary" class="size-4 rounded"><label for="dc5" class="text-[13px] text-ink-soft">Discharge summary signed by doctor</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc6" [(ngModel)]="dc_followup" class="size-4 rounded"><label for="dc6" class="text-[13px] text-ink-soft">Follow-up appointment scheduled</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc7" [(ngModel)]="dc_prescription" class="size-4 rounded"><label for="dc7" class="text-[13px] text-ink-soft">Discharge prescription handed</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc8" [(ngModel)]="dc_education" class="size-4 rounded"><label for="dc8" class="text-[13px] text-ink-soft">Patient education / counseling given</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc9" [(ngModel)]="dc_lab_reports" class="size-4 rounded"><label for="dc9" class="text-[13px] text-ink-soft">Lab reports handed (or e-shared)</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc10" [(ngModel)]="dc_imaging_reports" class="size-4 rounded"><label for="dc10" class="text-[13px] text-ink-soft">Imaging reports / films handed</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc11" [(ngModel)]="dc_consents" class="size-4 rounded"><label for="dc11" class="text-[13px] text-ink-soft">All consents complete</label></li>
                  <li class="flex items-center gap-2"><input type="checkbox" id="dc12" [(ngModel)]="dc_billing" class="size-4 rounded"><label for="dc12" class="text-[13px] text-ink-soft">IP billing team notified</label></li>
                </ul>

                <!-- Returns picker -->
                @if (indents().length) {
                  <div class="mt-5 pt-4 border-t border-border">
                    <p class="text-[11px] uppercase text-ink-muted font-medium mb-2">Return unused indents</p>
                    <ul class="space-y-1.5 max-h-[140px] overflow-y-auto">
                      @for (i of indents(); track i.id) {
                        @if (i.status === 'DISPENSED_TO_WARD' || i.status === 'RECEIVED_IN_WARD') {
                          <li class="flex items-center justify-between gap-2 text-[12px]">
                            <label class="flex items-center gap-2">
                              <input type="checkbox" [checked]="isReturnSelected(i.id)"
                                     (change)="toggleReturn(i.id, $any($event.target).checked)" class="size-4 rounded">
                              <span class="text-ink-soft">{{ i.drug_name }}<span class="text-ink-muted"> · {{ i.qty_dispensed }} unit(s)</span></span>
                            </label>
                            <span class="font-mono text-[10px] text-ink-muted">{{ formatINR(i.qty_dispensed * i.unit_price_cents) }}</span>
                          </li>
                        }
                      }
                    </ul>
                  </div>
                }

                <textarea [(ngModel)]="dc_notes" rows="2" placeholder="Handoff notes (optional)"
                          class="mt-4 w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>

                <div class="mt-4 flex items-center justify-between gap-2">
                  <p class="text-[11px] text-ink-muted">
                    @if (checklistComplete) { ✓ All items complete — submitting will mark <strong>Ready for billing</strong>. }
                    @else { Save progress; submit when all 12 items are checked. }
                  </p>
                  <button (click)="submitHandoff()" [disabled]="busy() || !canWrite()"
                          class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                          [style.background]="checklistComplete ? '#16A34A' : '#0E4F8C'">
                    {{ checklistComplete ? '✓ Complete handoff' : 'Save progress' }}
                  </button>
                </div>
              </div>
            </article>

            <!-- Right: discharge narrative -->
            <article class="lg:col-span-2 bg-surface-card border border-border rounded-[12px] overflow-hidden">
              <header class="px-5 py-3 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5"><i-lucide [name]="iconSummary" [size]="19" [strokeWidth]="1.75"></i-lucide><span>Discharge summary narrative</span></p>
                  <p class="text-[11px] text-ink-muted mt-0.5">Goes onto the printed summary alongside the bill.</p>
                </div>
                <button (click)="autofillNarrative()" [disabled]="busy()"
                        class="h-7 px-2.5 rounded-md text-[11px] font-semibold border border-primary-600 text-primary-700 hover:bg-primary-100 disabled:opacity-50 shrink-0"
                        title="Pull from admission reason, SOAP notes, encounters, active meds">
                  📥 Pull from chart
                </button>
              </header>
              <div class="p-4 space-y-2.5">
                <input [(ngModel)]="dn_complaint"  placeholder="Presenting complaint"
                       class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                <textarea [(ngModel)]="dn_history" rows="2" placeholder="History of present illness"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <textarea [(ngModel)]="dn_exam" rows="2" placeholder="Examination findings"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <textarea [(ngModel)]="dn_course" rows="2" placeholder="Course in hospital"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <textarea [(ngModel)]="dn_procedures" rows="1" placeholder="Procedures performed"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <input [(ngModel)]="dn_diagnosis" placeholder="Discharge diagnosis (ICD-10)"
                       class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                <input [(ngModel)]="dn_condition" placeholder="Condition at discharge"
                       class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                <textarea [(ngModel)]="dn_meds" rows="2" placeholder="Discharge medications"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <textarea [(ngModel)]="dn_followup" rows="1" placeholder="Follow-up instructions"
                          class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                <div class="grid grid-cols-2 gap-2">
                  <input [(ngModel)]="dn_diet"     placeholder="Diet" class="text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <input [(ngModel)]="dn_activity" placeholder="Activity" class="text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input [(ngModel)]="dn_insurance_provider" placeholder="Insurance provider" class="text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <input [(ngModel)]="dn_insurance_claim"    placeholder="Claim number" class="text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-500">
                </div>
                <button (click)="saveDischargeNarrative()" [disabled]="busy() || !canWrite()"
                        class="mt-2 h-9 w-full rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0E4F8C;">
                  Save narrative
                </button>
              </div>
            </article>
          </div>
        }

      } @else {
        <article class="bg-surface-card border border-border rounded-[12px] flex-1 grid place-items-center text-[13px] text-ink-muted py-16">
          Pick an active admission on the left to start charting.
        </article>
      }
    </section>

    <!-- ── Right pane: Alerts & Quick Actions ───────────── -->
    <aside class="flex flex-col gap-3 min-h-0">

      <!-- Next Appointments -->
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden flex flex-col">
        <header class="px-4 py-3 border-b border-border flex items-center gap-2">
          <i-lucide [name]="iconAppts" [size]="16" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">Next Appointments</p>
        </header>
        @if (upcomingAppointments().length === 0) {
          <div class="px-4 py-6 text-center text-[12px] text-ink-muted">No upcoming today.</div>
        } @else {
          <ul class="divide-y divide-border max-h-[240px] overflow-y-auto">
            @for (ap of upcomingAppointments(); track ap.id) {
              <li class="px-4 py-2.5">
                <p class="text-[12px] font-semibold text-ink">{{ formatApptTime(ap.appointment_at) }}</p>
                <p class="text-[12px] text-ink-soft truncate">{{ ap.patient?.full_name ?? 'Walk-in' }}</p>
                @if (ap.chief_complaint) {
                  <p class="text-[10px] text-ink-muted truncate">{{ ap.chief_complaint }}</p>
                }
              </li>
            }
          </ul>
        }
      </section>

      <!-- Quick Actions -->
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border flex items-center gap-2">
          <i-lucide [name]="iconQuick" [size]="16" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">Quick Actions</p>
        </header>
        <div class="p-2 flex flex-col gap-1">
          <button type="button" (click)="quickBookFollowUp()"
                  class="w-full text-left px-3 py-2 rounded-md text-[12px] font-medium text-ink-soft hover:bg-primary-50 hover:text-primary-700 inline-flex items-center gap-2">
            <i-lucide [name]="iconFollowUp" [size]="16" [strokeWidth]="1.75"></i-lucide>
            <span>Book Follow-up</span>
          </button>
          <button type="button" (click)="quickCollectPayment()"
                  class="w-full text-left px-3 py-2 rounded-md text-[12px] font-medium text-ink-soft hover:bg-primary-50 hover:text-primary-700 inline-flex items-center gap-2">
            <i-lucide [name]="iconPay" [size]="16" [strokeWidth]="1.75"></i-lucide>
            <span>Collect Payment</span>
          </button>
          <button type="button" (click)="quickOrderLabTest()"
                  [disabled]="!selected()"
                  class="w-full text-left px-3 py-2 rounded-md text-[12px] font-medium text-ink-soft hover:bg-primary-50 hover:text-primary-700 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <i-lucide [name]="iconLab" [size]="16" [strokeWidth]="1.75"></i-lucide>
            <span>Order Lab Test</span>
          </button>
        </div>
      </section>
    </aside>
  </div>
</div>

<!-- ── New medication order modal ──────────────────────────── -->
@if (modal() === 'order' && selected()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[560px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">+ New medication order</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Generates a MAR schedule automatically (frequency × duration).</p>
      <div class="mt-4 grid grid-cols-12 gap-3">
        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
            From pharmacy inventory · {{ inventoryMeds().length }} item(s)
          </span>
          <select [ngModel]="o_inventoryId" (ngModelChange)="onInventoryPicked($event)" name="o_inv"
                  class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">— Other / not in inventory (type below) —</option>
            @for (m of inventoryMeds(); track m.id) {
              <option [value]="m.id">
                {{ m.name }}@if (m.strengths.length) {  · {{ m.strengths[0] }}}@if (m.default_unit_price_cents) {  · ₹{{ m.default_unit_price_cents/100 }}}
              </option>
            }
          </select>
        </label>
        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Drug *</span>
          <input type="text" [(ngModel)]="o_drug" name="o_drug" placeholder="e.g. Paracetamol"
                 [readonly]="!!o_inventoryId"
                 [class.bg-surface-subtle]="!!o_inventoryId"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Strength</span>
          <input type="text" [(ngModel)]="o_strength" name="o_st" placeholder="650 mg"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Form</span>
          <select [(ngModel)]="o_form" name="o_fm" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">—</option><option value="tablet">tablet</option><option value="capsule">capsule</option>
            <option value="syrup">syrup</option><option value="injection">injection</option>
          </select>
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Route</span>
          <select [(ngModel)]="o_route" name="o_rt" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="oral">oral</option><option value="iv">IV</option><option value="im">IM</option>
            <option value="sc">SC</option><option value="topical">topical</option>
          </select>
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Dose *</span>
          <input type="text" [(ngModel)]="o_dose" name="o_d" placeholder="1 tablet"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Frequency *</span>
          <select [(ngModel)]="o_freq" name="o_fq" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="OD">OD (once)</option>
            <option value="BD">BD (twice)</option>
            <option value="TDS">TDS (3×)</option>
            <option value="QID">QID (4×)</option>
            <option value="Q6H">Q6H</option>
            <option value="Q4H">Q4H</option>
            <option value="HS">HS (bedtime)</option>
            <option value="SOS">SOS (PRN)</option>
          </select>
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Duration (days) *</span>
          <input type="number" [(ngModel)]="o_days" name="o_da" min="1" max="30"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Unit price (₹)</span>
          <input type="number" [(ngModel)]="o_price" name="o_p" min="0" step="0.5"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
          <input type="text" [(ngModel)]="o_notes" name="o_n" placeholder="After meals / PRN / etc."
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        @if (formError()) { <p class="col-span-12 text-[12px] text-danger-fg">{{ formError() }}</p> }
      </div>
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmOrder()" [disabled]="!o_drug || !o_dose || !o_freq || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0E4F8C;">Save order</button>
      </footer>
    </div>
  </div>
}

<!-- ── MAR action modal ─────────────────────────────────────── -->
@if (modal() === 'mar' && marTarget()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[440px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">Record dose</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">{{ marDrug(marTarget()!) }} · scheduled {{ formatTime(marTarget()!.scheduled_at) }}</p>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button (click)="markGiven()" [disabled]="busy() || !canWrite()"
                class="h-12 rounded-md text-[14px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#16A34A;">
          ✓ Given
        </button>
        <button (click)="m_status = 'refused'" [class]="reasonBtnCls('refused')">Refused</button>
        <button (click)="m_status = 'missed'"  [class]="reasonBtnCls('missed')">Missed</button>
        <button (click)="m_status = 'held'"    [class]="reasonBtnCls('held')">Held</button>
      </div>

      @if (m_status !== 'given' && m_status !== '') {
        <label class="block mt-3">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason *</span>
          <select [(ngModel)]="m_reason" name="m_r" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">Select reason…</option>
            <option>Patient refused</option><option>NPO / fasting</option>
            <option>Drug unavailable</option><option>Clinical hold by doctor</option>
            <option>IV access issue</option><option>Patient asleep / could not be woken</option>
            <option>Other</option>
          </select>
        </label>
        <label class="block mt-3">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
          <input type="text" [(ngModel)]="m_notes" name="m_n"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

        <footer class="mt-5 flex justify-end gap-2">
          <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
          <button (click)="confirmMar()" [disabled]="!m_reason || busy()"
                  class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#A4302B;">
            Save {{ m_status }}
          </button>
        </footer>
      }
    </div>
  </div>
}

<!-- ── I/O entry modal ─────────────────────────────────────── -->
@if (modal() === 'io' && selected()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[440px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">+ I/O entry</h2>
      <div class="mt-4 grid grid-cols-2 gap-2">
        <button (click)="i_dir = 'intake'" [class]="ioDirBtnCls('intake')">↓ Intake</button>
        <button (click)="i_dir = 'output'" [class]="ioDirBtnCls('output')">↑ Output</button>
      </div>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category *</span>
        <select [(ngModel)]="i_cat" name="i_c" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          @if (i_dir === 'intake') {
            <option value="oral">Oral</option><option value="iv">IV fluid</option><option value="ng">NG / feed</option><option value="other">Other</option>
          } @else {
            <option value="urine">Urine</option><option value="drain">Drain</option><option value="vomit">Vomit</option><option value="stool">Stool</option><option value="blood_loss">Blood loss</option><option value="other">Other</option>
          }
        </select>
      </label>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Volume (mL) *</span>
        <input type="number" [(ngModel)]="i_vol" name="i_v" min="1" step="10"
               class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
        <input type="text" [(ngModel)]="i_notes" name="i_n"
               class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>
      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmIo()" [disabled]="!i_cat || !i_vol || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0891B2;">Save</button>
      </footer>
    </div>
  </div>
}

<!-- ── Note modal ──────────────────────────────────────────── -->
@if (modal() === 'note' && selected()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[640px] bg-surface-card rounded-[14px] shadow-pop p-5 max-h-[92vh] overflow-y-auto" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink capitalize">+ {{ n_type }} note</h2>
      @if (n_type === 'soap') {
        <div class="mt-4 space-y-3">
          <label class="block"><span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5"><b class="text-primary-700">S</b>ubjective</span>
            <textarea [(ngModel)]="n_s" name="ns" rows="2" placeholder="Patient-reported symptoms…" class="w-full px-3 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
          </label>
          <label class="block"><span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5"><b class="text-primary-700">O</b>bjective</span>
            <textarea [(ngModel)]="n_o" name="no" rows="2" placeholder="Vitals, exam findings…" class="w-full px-3 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
          </label>
          <div class="grid grid-cols-12 gap-2">
            <label class="col-span-9 block"><span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5"><b class="text-primary-700">A</b>ssessment</span>
              <textarea [(ngModel)]="n_a" name="na" rows="2" placeholder="Working diagnosis…" class="w-full px-3 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
            </label>
            <label class="col-span-3 block"><span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">ICD-10</span>
              <input type="text" [(ngModel)]="n_icd" name="ni" placeholder="K21.9" class="w-full h-9 px-2 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>
          <label class="block"><span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5"><b class="text-primary-700">P</b>lan</span>
            <textarea [(ngModel)]="n_p" name="np" rows="2" placeholder="Investigations, follow-up…" class="w-full px-3 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
          </label>
        </div>
      } @else {
        <label class="block mt-4">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Note body</span>
          <textarea [(ngModel)]="n_body" name="nb" rows="6" class="w-full px-3 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
        </label>
      }
      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmNote()" [disabled]="busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0E4F8C;">Save note</button>
      </footer>
    </div>
  </div>
}

<!-- ── Indent modal ────────────────────────────────────────── -->
@if (modal() === 'indent' && selected()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">+ Pharmacy indent</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Request stock from the pharmacy. Charge posts on dispense.</p>
      <div class="mt-4 grid grid-cols-12 gap-3">
        <label class="col-span-7 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Drug *</span>
          <input type="text" [(ngModel)]="x_drug" name="x_d" placeholder="Pantoprazole"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-5 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Strength</span>
          <input type="text" [(ngModel)]="x_strength" name="x_s" placeholder="40 mg"
                 class="w-full h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Quantity *</span>
          <input type="number" [(ngModel)]="x_qty" name="x_q" min="1"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Unit price (₹)</span>
          <input type="number" [(ngModel)]="x_price" name="x_p" min="0" step="0.5"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
      </div>
      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmIndent()" [disabled]="!x_drug || !x_qty || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0E4F8C;">Create indent</button>
      </footer>
    </div>
  </div>
}

<!-- ── Return modal ────────────────────────────────────────── -->
@if (modal() === 'return' && returnTarget()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[440px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">Return to pharmacy</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">{{ returnTarget()!.drug_name }} · dispensed {{ returnTarget()!.qty_dispensed }} unit(s)</p>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Qty to return *</span>
          <input type="number" [(ngModel)]="r_qty" name="r_q" min="1" [max]="returnTarget()!.qty_dispensed"
                 class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason *</span>
          <select [(ngModel)]="r_reason" name="r_r" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="unused">Unused</option><option value="dose_stopped">Dose stopped by doctor</option>
            <option value="expired">Expired</option><option value="wrong_drug">Wrong drug</option>
            <option value="damaged">Damaged</option><option value="other">Other</option>
          </select>
        </label>
      </div>
      <label class="block mt-3">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
        <input type="text" [(ngModel)]="r_notes" name="r_n" class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </label>
      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmReturn()" [disabled]="!r_qty || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#A4302B;">Process return</button>
      </footer>
    </div>
  </div>
}

<!-- ── Doctor visit modal ───────────────────────────────────── -->
@if (modal() === 'visit' && selected()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true" class="w-full max-w-[480px] bg-surface-card rounded-[14px] shadow-pop p-5" (click)="$event.stopPropagation()">
      <header class="mb-4">
        <h2 class="font-display text-[18px] font-medium text-ink inline-flex items-center gap-2"><i-lucide [name]="iconStethoscope" [size]="18" [strokeWidth]="1.75" class="text-primary-600"></i-lucide><span>Log doctor visit</span></h2>
        <p class="text-[12px] text-ink-muted mt-0.5">A round / consult — charge posts to the patient ledger.</p>
      </header>
      <div class="space-y-3">
        <label class="block">
          <span class="text-[11px] uppercase text-ink-muted font-medium">Doctor</span>
          <select [(ngModel)]="v_doctor" class="mt-1 w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600">
            <option value="">— select —</option>
            @for (d of doctors(); track d.id) { <option [value]="d.id">{{ d.full_name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] uppercase text-ink-muted font-medium">Visit type</span>
          <select [(ngModel)]="v_type" class="mt-1 w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600">
            <option value="routine">Routine round</option>
            <option value="consultation">Consultation</option>
            <option value="emergency">Emergency</option>
            <option value="procedure">Procedure</option>
            <option value="specialist">Specialist</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[11px] uppercase text-ink-muted font-medium">Visit date &amp; time *</span>
            <input type="datetime-local" [(ngModel)]="v_visited_at" [max]="nowLocal()"
                   class="mt-1 w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
            <p class="text-[10px] text-ink-muted mt-0.5">Defaults to now. Back-date if logging an earlier visit.</p>
          </label>
          <label class="block">
            <span class="text-[11px] uppercase text-ink-muted font-medium">Charge (₹)</span>
            <input type="number" min="0" [(ngModel)]="v_charge"
                   class="mt-1 w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
          </label>
        </div>
        <label class="block">
          <span class="text-[11px] uppercase text-ink-muted font-medium">Notes</span>
          <input type="text" [(ngModel)]="v_notes" placeholder="(optional)"
                 class="mt-1 w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
        </label>
      </div>
      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <footer class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirmVisit()" [disabled]="!v_doctor || busy()"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50" style="background:#0E4F8C;">Log visit</button>
      </footer>
    </div>
  </div>
}
  `,
})
export class NursingPage implements OnInit, OnDestroy {
  private svc      = inject(NursingService);
  private auth     = inject(AuthStore);
  private toast    = inject(ToastService);
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private supabase = inject(SupabaseService);
  private apptSvc  = inject(AppointmentsService);

  protected readonly Math = Math;
  protected readonly MAR_LABEL = MAR_STATUS_TONE;
  protected readonly canWrite = computed(() => this.auth.has('ehr.write'));

  protected readonly admissions = signal<ActiveAdmission[]>([]);
  protected readonly upcomingAppointments = signal<AppointmentRow[]>([]);
  protected readonly selected   = signal<ActiveAdmission | null>(null);
  protected readonly orders     = signal<MedicationOrder[]>([]);
  protected readonly mar        = signal<MarRecord[]>([]);
  protected readonly ioEntries  = signal<IoEntry[]>([]);
  protected readonly notes      = signal<ClinicalNote[]>([]);
  protected readonly indents    = signal<PharmacyIndent[]>([]);
  protected readonly ledger     = signal<LedgerSummary | null>(null);
  protected readonly visits     = signal<DoctorVisit[]>([]);
  protected readonly checklist  = signal<DischargeChecklist | null>(null);
  protected readonly narrative  = signal<DischargeSummaryNarrative | null>(null);
  protected readonly doctors    = signal<{ id: string; full_name: string }[]>([]);
  protected readonly loading    = signal(true);
  protected readonly busy       = signal(false);
  protected readonly error      = signal<string | null>(null);
  protected readonly formError  = signal<string | null>(null);
  protected readonly modal      = signal<'order'|'mar'|'io'|'note'|'indent'|'return'|'visit'|null>(null);
  protected readonly showOrderPanel   = signal(false);
  protected readonly showConsentPanel = signal(false);
  protected readonly showBloodRequest = signal(false);
  /** Phase A: gate flag for the transfusion-consent capture before opening Request Blood. */
  protected readonly transfusionConsentGate = signal(false);
  protected readonly showCodeBlue     = signal(false);
  protected readonly showDnr          = signal(false);
  private consentPdfSvc = inject(ConsentPdfService);
  private consentSvc    = inject(ConsentService);

  /**
   * Phase A trigger #2 — Request Blood checks for an active TRANSFUSION consent
   * on this admission. If none, opens the consent modal first; on save, the
   * blood-request dialog opens automatically.
   */
  protected async onRequestBloodClicked(a: ActiveAdmission): Promise<void> {
    let captured = false;
    try {
      captured = await this.consentSvc.hasActive(a.patient_id, 'TRANSFUSION', a.id);
    } catch { captured = false; }
    if (captured) {
      this.showBloodRequest.set(true);
    } else {
      this.transfusionConsentGate.set(true);
    }
  }

  protected onTransfusionConsentSaved(_e: { consentId: string }): void {
    this.transfusionConsentGate.set(false);
    this.toast.success('Transfusion consent captured', 'Opening blood request dialog…');
    this.showBloodRequest.set(true);
  }

  protected onInvestigationPlaced(_e: { orderId: string }) {
    this.toast.success('Investigations ordered', 'Auto-billed to admission ledger.');
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

  protected onCodeBlueCreated(_eventId: string) {
    this.toast.error('Code Blue logged', 'Open the cockpit at /code-blue to track timeline.');
    this.showCodeBlue.set(false);
  }

  protected onDnrCreated(_orderId: string) {
    this.toast.success('DNR order created', 'Active DNR will be flagged on resuscitation calls.');
    this.showDnr.set(false);
  }

  // ── Lucide icon refs ───────────────────────────────────────
  protected readonly iconStethoscope = Stethoscope;
  protected readonly iconConsent     = FileSignature;
  protected readonly iconBlood       = Droplet;
  protected readonly iconCodeBlue    = Siren;
  protected readonly iconDnr         = ClipboardX;
  protected readonly iconLab         = FlaskConical;
  protected readonly iconMar         = Tablets;
  protected readonly iconIo          = Droplets;
  protected readonly iconNotes       = NotebookPen;
  protected readonly iconIndents     = Package;
  protected readonly iconDischarge   = LogOut;
  protected readonly iconSummary     = FileText;
  protected readonly iconAppts       = CalendarClock;
  protected readonly iconFollowUp    = CalendarPlus;
  protected readonly iconPay         = Wallet;
  protected readonly iconQuick       = Zap;

  protected formatApptTime(iso: string): string {
    try { return format(parseISO(iso), 'h:mm a'); } catch { return '—'; }
  }

  protected async quickBookFollowUp() {
    const a = this.selected();
    if (a) {
      await this.router.navigate(['/appointments'], { queryParams: { patient: a.patient_id } });
    } else {
      await this.router.navigate(['/appointments']);
    }
  }

  protected async quickCollectPayment() {
    const a = this.selected();
    if (a) {
      await this.router.navigate(['/billing'], { queryParams: { patient: a.patient_id } });
    } else {
      await this.router.navigate(['/billing']);
    }
  }

  protected quickOrderLabTest() {
    if (this.selected()) this.showOrderPanel.set(true);
  }

  private async loadUpcomingAppointments() {
    try {
      const all = await this.apptSvc.getTodayAppointments();
      const now = new Date();
      const upcoming = all
        .filter(a => {
          const at = new Date(a.appointment_at);
          return at >= now && (a.status === 'scheduled' || a.status === 'checked_in');
        })
        .slice(0, 5);
      this.upcomingAppointments.set(upcoming);
    } catch {
      this.upcomingAppointments.set([]);
    }
  }

  protected readonly tabs: { id: TabId; icon: LucideIconData; label: string }[] = [
    { id: 'mar',       icon: Tablets,      label: 'MAR' },
    { id: 'io',        icon: Droplets,     label: 'I/O' },
    { id: 'notes',     icon: NotebookPen,  label: 'Notes' },
    { id: 'indents',   icon: Package,      label: 'Indents' },
    { id: 'visits',    icon: Stethoscope,  label: 'Visits' },
    { id: 'blood',     icon: Droplet,      label: 'Blood' },
    { id: 'discharge', icon: LogOut,       label: 'Discharge' },
  ];
  protected readonly tab = signal<TabId>('mar');

  // ── Blood tab state ─────────────────────────────────────────
  private bb = inject(BloodBankService);
  private issueSlipPdf = inject(IssueSlipPdfService);
  protected readonly bloodIncoming  = signal<BloodRequest[]>([]);
  protected readonly bloodAtWard    = signal<BloodRequest[]>([]);
  protected readonly bloodUnitsByReq = signal<Record<string, BloodUnit[]>>({});
  protected readonly bloodLoading   = signal(false);
  protected readonly bloodSelected  = signal<BloodRequest | null>(null);

  protected bloodGroupLabel = (g: any) => BLOOD_GROUP_LABELS[g as keyof typeof BLOOD_GROUP_LABELS];
  protected bloodComponentLabel = (c: any) => COMPONENT_LABELS[c as keyof typeof COMPONENT_LABELS];

  protected unitsForReq(reqId: string): BloodUnit[] {
    return this.bloodUnitsByReq()[reqId] ?? [];
  }

  protected readonly pendingMar = computed(() => this.mar().filter(m => m.status === 'pending').length);

  // Form state
  protected o_drug = ''; protected o_strength = ''; protected o_form = 'tablet'; protected o_route = 'oral';
  /** Inventory medications loaded on order-modal open. Empty = freeform only. */
  protected readonly inventoryMeds = signal<Array<{
    id: string; name: string; generic_name: string | null;
    strengths: string[]; forms: string[];
    default_unit_price_cents: number | null; category: string | null;
  }>>([]);
  /** Selected inventory id (empty = "Other / not in inventory" → freeform). */
  protected o_inventoryId: string = '';
  protected o_dose = ''; protected o_freq = 'BD'; protected o_days = 3; protected o_price: number | null = null;
  protected o_notes = '';

  protected readonly marTarget = signal<MarRecord | null>(null);
  protected m_status: MarStatus | '' = ''; protected m_reason = ''; protected m_notes = '';

  protected i_dir: 'intake' | 'output' = 'intake';
  protected i_cat = 'oral'; protected i_vol: number | null = null; protected i_notes = '';

  protected n_type: 'soap'|'progress'|'procedure'|'nursing'|'consult' = 'soap';
  protected n_s = ''; protected n_o = ''; protected n_a = ''; protected n_p = ''; protected n_icd = ''; protected n_body = '';

  protected x_drug = ''; protected x_strength = ''; protected x_qty: number | null = 1; protected x_price: number | null = null;

  protected readonly returnTarget = signal<PharmacyIndent | null>(null);
  protected r_qty: number | null = 1; protected r_reason = 'unused'; protected r_notes = '';

  // Doctor visit form
  protected v_doctor = ''; protected v_type: 'routine'|'consultation'|'emergency'|'procedure'|'specialist' = 'routine';
  protected v_charge: number | null = 500; protected v_notes = '';
  /** datetime-local string (YYYY-MM-DDTHH:mm) for the Visit date input. */
  protected v_visited_at = '';

  // Discharge tab — checklist + narrative
  protected dc_meds = false; protected dc_iv = false; protected dc_belongings = false;
  protected dc_vitals = false; protected dc_summary = false; protected dc_followup = false;
  protected dc_prescription = false; protected dc_education = false; protected dc_lab_reports = false;
  protected dc_imaging_reports = false; protected dc_consents = false; protected dc_billing = false;
  protected dc_notes = '';
  protected dc_returnIds = new Set<string>();

  protected dn_complaint = ''; protected dn_history = ''; protected dn_exam = '';
  protected dn_course = ''; protected dn_procedures = ''; protected dn_condition = '';
  protected dn_diagnosis = ''; protected dn_meds = ''; protected dn_followup = '';
  protected dn_diet = ''; protected dn_activity = ''; protected dn_review = '';
  protected dn_insurance_provider = ''; protected dn_insurance_claim = '';

  protected readonly checklistItems: ReadonlyArray<{ key: string; label: string }> = [
    { key: 'item_meds_returned',          label: 'Unused medicines returned to pharmacy' },
    { key: 'item_iv_lines_removed',       label: 'IV lines / catheters removed' },
    { key: 'item_belongings_returned',    label: 'Personal belongings handed over' },
    { key: 'item_final_vitals_recorded',  label: 'Final vitals recorded' },
    { key: 'item_summary_signed',         label: 'Discharge summary signed by doctor' },
    { key: 'item_followup_scheduled',     label: 'Follow-up appointment scheduled' },
    { key: 'item_prescription_handed',    label: 'Discharge prescription handed' },
    { key: 'item_education_given',        label: 'Patient education / counseling given' },
    { key: 'item_lab_reports_handed',     label: 'Lab reports handed (or e-shared)' },
    { key: 'item_imaging_reports_handed', label: 'Imaging reports / films handed' },
    { key: 'item_consents_complete',      label: 'All consents complete' },
    { key: 'item_billing_notified',       label: 'IP billing team notified' },
  ];

  private unsubscribe: (() => void) | null = null;

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [admissions, doctors] = await Promise.all([
        this.svc.listActiveAdmissions(),
        this.svc.listDoctors(),
      ]);
      this.admissions.set(admissions);
      this.doctors.set(doctors);
      void this.loadUpcomingAppointments();
      const wanted = this.route.snapshot.queryParamMap.get('admission');
      const target = wanted ? admissions.find(a => a.id === wanted) ?? admissions[0] : admissions[0];
      if (target) {
        await this.select(target);
        if (wanted) this.tab.set('discharge');
      }
    } catch (e) {
      this.error.set(this.errMsg(e));
    } finally {
      this.loading.set(false);
    }
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  protected async select(a: ActiveAdmission) {
    this.unsubscribe?.();
    this.selected.set(a);
    await this.refreshAll();
    this.unsubscribe = this.svc.subscribe(a.id, () => void this.refreshAll());
  }

  private async refreshAll() {
    const a = this.selected();
    if (!a) return;
    const [orders, mar, io, notes, indents, ledger, visits, bundle] = await Promise.all([
      this.svc.listMedicationOrders(a.id), this.svc.listMar(a.id),
      this.svc.listIo(a.id), this.svc.listNotes(a.id),
      this.svc.listIndents(a.id), this.svc.ledger(a.id),
      this.svc.listDoctorVisits(a.id), this.svc.getDischargeBundle(a.id),
    ]);
    this.orders.set(orders); this.mar.set(mar);
    this.ioEntries.set(io); this.notes.set(notes);
    this.indents.set(indents); this.ledger.set(ledger);
    this.visits.set(visits);
    this.checklist.set((bundle.checklist as DischargeChecklist | null) ?? null);
    this.narrative.set((bundle.summary as DischargeSummaryNarrative | null) ?? null);
    this.hydrateChecklistForm(this.checklist());
    this.hydrateNarrativeForm(this.narrative());
    void this.refreshBlood(a.id);
  }

  private async refreshBlood(admissionId: string) {
    this.bloodLoading.set(true);
    try {
      const all = await this.bb.listRequests({ admissionId });
      // Incoming: dispatched but ward hasn't acknowledged receipt yet.
      const incoming = all.filter(r => r.dispatched_at && !r.ward_received_at && r.state !== 'cancelled');
      // At-ward: received but transfusion not yet completed for the request.
      const atWard   = all.filter(r => r.ward_received_at && !['completed','cancelled'].includes(r.state));

      // Pull units once and group by request_id (for serving the unit_no on cards).
      const requestIds = [...incoming, ...atWard].map(r => r.id);
      const unitMap: Record<string, BloodUnit[]> = {};
      if (requestIds.length) {
        const allUnits = await this.bb.listUnits({});
        for (const u of allUnits) {
          if (u.reserved_for_request_id && requestIds.includes(u.reserved_for_request_id)) {
            (unitMap[u.reserved_for_request_id] ||= []).push(u);
          }
        }
      }
      this.bloodIncoming.set(incoming);
      this.bloodAtWard.set(atWard);
      this.bloodUnitsByReq.set(unitMap);

      // Build open-transfusion lookup so the bedside CTA reads
      // 'Continue transfusion' instead of 'Start' when a record exists.
      const open: Record<string, string> = {};
      const atWardIds = atWard.map(r => r.id);
      if (atWardIds.length) {
        const txs = await this.bb.listTransfusions({});
        for (const t of txs) {
          if (t.outcome === null && atWardIds.includes(t.request_id)) {
            open[t.unit_id] = t.id;
          }
        }
      }
      this.openTransfusionByUnit.set(open);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load blood requests');
    } finally {
      this.bloodLoading.set(false);
    }
  }

  protected async confirmBloodReceipt(req: BloodRequest) {
    const u = this.unitsForReq(req.id)[0];
    if (!u) { this.toast.error('No unit linked', 'Cannot confirm receipt without a linked unit'); return; }
    try {
      await this.bb.confirmWardReceipt(req.id, u.id);
      this.toast.success('Receipt confirmed', `${u.unit_no} received at ward`);
      const a = this.selected(); if (a) await this.refreshBlood(a.id);
    } catch (e: any) {
      this.toast.error('Failed', e?.message ?? 'Could not confirm receipt');
    }
  }

  protected async printBloodIssueSlip(req: BloodRequest) {
    const u = this.unitsForReq(req.id)[0];
    if (!u) return;
    try { await this.issueSlipPdf.print(req, u); }
    catch (e: any) { this.toast.error('Print failed', e?.message ?? 'Could not open print view'); }
  }

  protected openBloodRequestDetail(req: BloodRequest) {
    this.bloodSelected.set(req);
  }

  protected onBloodDetailClosed() {
    this.bloodSelected.set(null);
    const a = this.selected(); if (a) void this.refreshBlood(a.id);
  }

  // ── Bedside transfusion run-sheet (Phase 2) ─────────────────────
  /** {request, unit} currently being transfused; null when no run-sheet is open. */
  protected readonly runsheetFor = signal<{ request: BloodRequest; unit: BloodUnit } | null>(null);
  /** Cache of unit_id → in-progress transfusion record id, refreshed alongside blood data. */
  protected readonly openTransfusionByUnit = signal<Record<string, string>>({});

  protected hasOpenTransfusion(unitId: string): boolean {
    return !!this.openTransfusionByUnit()[unitId];
  }

  protected openRunsheet(request: BloodRequest, unit: BloodUnit) {
    this.runsheetFor.set({ request, unit });
  }

  protected async onRunsheetSaved() {
    this.runsheetFor.set(null);
    const a = this.selected(); if (a) await this.refreshBlood(a.id);
  }

  private hydrateChecklistForm(c: DischargeChecklist | null): void {
    this.dc_meds              = c?.item_meds_returned ?? false;
    this.dc_iv                = c?.item_iv_lines_removed ?? false;
    this.dc_belongings        = c?.item_belongings_returned ?? false;
    this.dc_vitals            = c?.item_final_vitals_recorded ?? false;
    this.dc_summary           = c?.item_summary_signed ?? false;
    this.dc_followup          = c?.item_followup_scheduled ?? false;
    this.dc_prescription      = c?.item_prescription_handed ?? false;
    this.dc_education         = c?.item_education_given ?? false;
    this.dc_lab_reports       = c?.item_lab_reports_handed ?? false;
    this.dc_imaging_reports   = c?.item_imaging_reports_handed ?? false;
    this.dc_consents          = c?.item_consents_complete ?? false;
    this.dc_billing           = c?.item_billing_notified ?? false;
    this.dc_notes             = c?.notes ?? '';
  }
  private hydrateNarrativeForm(n: DischargeSummaryNarrative | null): void {
    this.dn_complaint    = n?.presenting_complaint ?? '';
    this.dn_history      = n?.history_of_present_illness ?? '';
    this.dn_exam         = n?.examination_findings ?? '';
    this.dn_course       = n?.course_in_hospital ?? '';
    this.dn_procedures   = n?.procedures_performed ?? '';
    this.dn_condition    = n?.condition_at_discharge ?? '';
    this.dn_diagnosis    = n?.discharge_diagnosis_icd10 ?? '';
    this.dn_meds         = n?.discharge_medications ?? '';
    this.dn_followup     = n?.follow_up_instructions ?? '';
    this.dn_diet         = n?.diet_advice ?? '';
    this.dn_activity     = n?.activity_advice ?? '';
    this.dn_review       = n?.next_review_at ?? '';
    this.dn_insurance_provider = n?.insurance_provider ?? '';
    this.dn_insurance_claim    = n?.insurance_claim_number ?? '';
  }

  // ── Display helpers ────────────────────────────────────────
  protected admissionDay(iso: string): number {
    try { return Math.max(1, Math.floor((Date.now() - parseISO(iso).getTime()) / 86400000) + 1); }
    catch { return 1; }
  }
  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM HH:mm'); } catch { return ''; }
  }
  protected shortDateTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM HH:mm'); } catch { return iso; }
  }
  protected formatINR(c: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((c ?? 0) / 100);
  }
  protected isOverdue(m: MarRecord): boolean {
    try { return parseISO(m.scheduled_at).getTime() < Date.now() - 30 * 60 * 1000; } catch { return false; }
  }
  protected orderMar(orderId: string): MarRecord[] {
    return this.mar().filter(m => m.medication_order_id === orderId).slice(0, 24);
  }
  protected marDrug(m: MarRecord): string {
    const o = this.orders().find(x => x.id === m.medication_order_id);
    return o ? (o.drug_name + (o.strength ? ' · ' + o.strength : '')) : '';
  }
  protected tabBtnCls(t: TabId): string {
    const active = this.tab() === t;
    const base = 'h-8 px-3 rounded-md text-[13px] font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap';
    return active ? `${base} bg-primary-700 text-white` : `${base} text-ink-soft hover:bg-surface-card`;
  }
  protected reasonBtnCls(s: string): string {
    const active = this.m_status === s;
    return `h-12 rounded-md text-[14px] font-semibold transition-colors ${
      active ? 'bg-warn-fg text-white' : 'bg-surface-card border border-border text-ink-soft hover:bg-surface-muted'
    }`;
  }
  protected ioDirBtnCls(d: string): string {
    const active = this.i_dir === d;
    return `h-12 rounded-md text-[14px] font-semibold transition-colors ${
      active
        ? (d === 'intake' ? 'bg-info-fg text-white' : 'bg-warn-fg text-white')
        : 'bg-surface-card border border-border text-ink-soft hover:bg-surface-muted'
    }`;
  }

  protected ioTotal(dir: 'intake' | 'output'): number {
    return Math.round(this.ioEntries().filter(e => e.direction === dir).reduce((s, e) => s + Number(e.volume_ml), 0));
  }
  protected ioBalance(): number { return this.ioTotal('intake') - this.ioTotal('output'); }

  protected errMsg(e: unknown, fallback = 'Try again'): string {
    if (!e) return fallback;
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (typeof e === 'object') {
      const o = e as Record<string, unknown>;
      return (o['message'] as string) || (o['error_description'] as string) || (o['details'] as string) || (o['hint'] as string) || fallback;
    }
    return fallback;
  }

  // ── Modal lifecycle ────────────────────────────────────────
  protected closeModal() { this.modal.set(null); this.formError.set(null); }
  protected async openOrder() {
    this.o_drug = ''; this.o_strength = ''; this.o_dose = ''; this.o_freq = 'BD';
    this.o_days = 3; this.o_price = null; this.o_notes = ''; this.o_inventoryId = '';
    this.formError.set(null);
    this.modal.set('order');
    // Load pharmacy inventory medications (cached after first load)
    if (this.inventoryMeds().length === 0) {
      try {
        const { data } = await (this.supabase.client as any)
          .from('inventory_items')
          .select('id, name, generic_name, strengths, forms, default_unit_price_cents, category')
          .eq('is_active', true)
          .eq('category', 'medication')
          .order('name');
        this.inventoryMeds.set(data ?? []);
      } catch { /* fall back to freeform */ }
    }
  }

  /** When a pharmacy item is picked, auto-populate strength / form / price. */
  protected onInventoryPicked(invId: string): void {
    this.o_inventoryId = invId;
    if (!invId) { return; }   // "Other (type below)" — leave fields untouched
    const item = this.inventoryMeds().find(m => m.id === invId);
    if (!item) return;
    this.o_drug     = item.name;
    this.o_strength = item.strengths?.[0] ?? this.o_strength;
    const formMap: Record<string, string> = { tab: 'tablet', cap: 'capsule', syr: 'syrup', inj: 'injection' };
    const f = (item.forms?.[0] ?? '').toLowerCase();
    this.o_form = formMap[f] ?? this.o_form;
    if (item.default_unit_price_cents != null) {
      this.o_price = item.default_unit_price_cents / 100;
    }
  }
  protected openMar(m: MarRecord) { this.marTarget.set(m); this.m_status = ''; this.m_reason = ''; this.m_notes = ''; this.formError.set(null); this.modal.set('mar'); }
  protected openIo() { this.i_dir = 'intake'; this.i_cat = 'oral'; this.i_vol = null; this.i_notes = ''; this.formError.set(null); this.modal.set('io'); }
  protected openNote(t: 'soap'|'progress'|'nursing') {
    this.n_type = t; this.n_s = ''; this.n_o = ''; this.n_a = ''; this.n_p = ''; this.n_icd = ''; this.n_body = '';
    this.formError.set(null); this.modal.set('note');
  }
  protected openIndent() { this.x_drug = ''; this.x_strength = ''; this.x_qty = 1; this.x_price = null; this.formError.set(null); this.modal.set('indent'); }
  protected openReturn(i: PharmacyIndent) { this.returnTarget.set(i); this.r_qty = i.qty_dispensed; this.r_reason = 'unused'; this.r_notes = ''; this.formError.set(null); this.modal.set('return'); }

  // ── Actions ────────────────────────────────────────────────
  protected async confirmOrder() {
    const a = this.selected(); if (!a) return;
    this.busy.set(true); this.formError.set(null);
    try {
      await this.svc.createOrder({
        admissionId: a.id, drugName: this.o_drug, strength: this.o_strength || null,
        form: this.o_form || null, route: this.o_route || null, dose: this.o_dose,
        frequency: this.o_freq, durationDays: this.o_days,
        unitPriceRupees: this.o_price ?? 0, notes: this.o_notes || null,
      });
      this.toast.success('Medication order created', `${this.o_drug} ${this.o_freq}`);
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async markGiven() {
    const m = this.marTarget(); if (!m) return;
    this.busy.set(true);
    try {
      await this.svc.marDose({ id: m.id, status: 'given' });
      this.toast.success('Dose given');
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async confirmMar() {
    const m = this.marTarget(); if (!m) return;
    if (!this.m_status) return;
    if (!this.m_reason) { this.formError.set('Reason is required'); return; }
    this.busy.set(true);
    try {
      await this.svc.marDose({ id: m.id, status: this.m_status as MarStatus, reason: this.m_reason, notes: this.m_notes || null });
      this.toast.success('Recorded', this.m_status);
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async confirmIo() {
    const a = this.selected(); if (!a || !this.i_vol) return;
    this.busy.set(true);
    try {
      await this.svc.ioRecord({ admissionId: a.id, direction: this.i_dir, category: this.i_cat, volumeMl: this.i_vol, notes: this.i_notes || null });
      this.toast.success('I/O recorded', `${this.i_dir} · ${this.i_vol} mL`);
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async confirmNote() {
    const a = this.selected(); if (!a) return;
    this.busy.set(true);
    try {
      await this.svc.saveNote({
        admissionId: a.id, noteType: this.n_type,
        subjective: this.n_s, objective: this.n_o, assessment: this.n_a, plan: this.n_p,
        body: this.n_body, diagnosisIcd10: this.n_icd || null,
      });
      this.toast.success('Note saved', this.n_type);
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async confirmIndent() {
    const a = this.selected(); if (!a || !this.x_qty) return;
    this.busy.set(true);
    try {
      await this.svc.createIndent({
        admissionId: a.id, drugName: this.x_drug, strength: this.x_strength || null,
        qty: this.x_qty, unitPriceRupees: this.x_price ?? 0,
      });
      this.toast.success('Indent raised');
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  protected async quickDispense(i: PharmacyIndent) {
    this.busy.set(true);
    try {
      await this.svc.dispenseIndent(i.id, i.qty_requested, null);
      this.toast.success('Dispensed', `${i.qty_requested} unit(s) · charge posted`);
      await this.refreshAll();
    } catch (e) { this.toast.error('Could not dispense', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }
  protected async acknowledge(i: PharmacyIndent) {
    this.busy.set(true);
    try {
      await this.svc.acknowledgeIndent(i.id);
      this.toast.success('Acknowledged');
      await this.refreshAll();
    } catch (e) { this.toast.error('Could not acknowledge', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }
  protected async confirmReturn() {
    const i = this.returnTarget(); if (!i || !this.r_qty) return;
    this.busy.set(true);
    try {
      await this.svc.returnIndent(i.id, this.r_qty, this.r_reason, this.r_notes || null);
      this.toast.success('Return processed', '— credit posted to ledger');
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  // ── Doctor visit ──────────────────────────────────────────
  protected openVisitModal(): void {
    this.formError.set(null);
    this.v_doctor = this.doctors()[0]?.id ?? '';
    this.v_type = 'routine'; this.v_charge = 500; this.v_notes = '';
    this.v_visited_at = this.nowLocal();
    this.modal.set('visit');
  }
  protected async confirmVisit() {
    const a = this.selected(); if (!a || !this.v_doctor) return;
    this.busy.set(true);
    try {
      await this.svc.logDoctorVisit({
        admissionId: a.id, doctorId: this.v_doctor,
        visitType: this.v_type, chargeRupees: this.v_charge ?? 0,
        notes: this.v_notes || null,
        visitedAt: this.v_visited_at ? new Date(this.v_visited_at).toISOString() : null,
      });
      const when = this.v_visited_at ? new Date(this.v_visited_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'now';
      this.toast.success('Visit logged', `${this.v_type} · ${when} · ${this.formatINR((this.v_charge ?? 0) * 100)}`);
      this.closeModal(); await this.refreshAll();
    } catch (e) { this.formError.set(this.errMsg(e)); } finally { this.busy.set(false); }
  }

  /** Local datetime in 'YYYY-MM-DDTHH:mm' for the datetime-local input default + max. */
  protected nowLocal(): string {
    const d = new Date();
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ── Discharge tab actions ─────────────────────────────────
  protected get checklistComplete(): boolean {
    return this.dc_meds && this.dc_iv && this.dc_belongings && this.dc_vitals
        && this.dc_summary && this.dc_followup && this.dc_prescription
        && this.dc_education && this.dc_lab_reports && this.dc_imaging_reports
        && this.dc_consents && this.dc_billing;
  }
  protected get checklistDoneCount(): number {
    return [this.dc_meds, this.dc_iv, this.dc_belongings, this.dc_vitals,
            this.dc_summary, this.dc_followup, this.dc_prescription, this.dc_education,
            this.dc_lab_reports, this.dc_imaging_reports, this.dc_consents, this.dc_billing]
            .filter(Boolean).length;
  }
  protected toggleReturn(id: string, on: boolean) {
    const next = new Set(this.dc_returnIds);
    on ? next.add(id) : next.delete(id);
    this.dc_returnIds = next;
  }
  protected isReturnSelected(id: string): boolean { return this.dc_returnIds.has(id); }

  protected async autofillNarrative() {
    const a = this.selected(); if (!a) return;
    this.busy.set(true);
    try {
      const filled = await this.svc.autofillDischargeNarrative(a.id);
      // Only overwrite empty fields — preserve any edits the user already made.
      const merge = (current: string, next: string | null | undefined) => current.trim() ? current : (next ?? '');
      this.dn_complaint  = merge(this.dn_complaint,  filled['presenting_complaint']);
      this.dn_history    = merge(this.dn_history,    filled['history_of_present_illness']);
      this.dn_exam       = merge(this.dn_exam,       filled['examination_findings']);
      this.dn_course     = merge(this.dn_course,     filled['course_in_hospital']);
      this.dn_procedures = merge(this.dn_procedures, filled['procedures_performed']);
      this.dn_condition  = merge(this.dn_condition,  filled['condition_at_discharge']);
      this.dn_diagnosis  = merge(this.dn_diagnosis,  filled['discharge_diagnosis_icd10']);
      this.dn_meds       = merge(this.dn_meds,       filled['discharge_medications']);
      this.dn_followup   = merge(this.dn_followup,   filled['follow_up_instructions']);
      const filledCount = Object.values(filled).filter(v => !!v && String(v).trim()).length;
      this.toast.success('Pulled from chart', `${filledCount} field${filledCount === 1 ? '' : 's'} populated`);
    } catch (e) { this.toast.error('Auto-fill failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected async saveDischargeNarrative() {
    const a = this.selected(); if (!a) return;
    this.busy.set(true);
    try {
      await this.svc.saveDischargeNarrative(a.id, {
        presenting_complaint: this.dn_complaint,
        history_of_present_illness: this.dn_history,
        examination_findings: this.dn_exam,
        course_in_hospital: this.dn_course,
        procedures_performed: this.dn_procedures,
        condition_at_discharge: this.dn_condition,
        discharge_diagnosis_icd10: this.dn_diagnosis,
        discharge_medications: this.dn_meds,
        follow_up_instructions: this.dn_followup,
        diet_advice: this.dn_diet,
        activity_advice: this.dn_activity,
        next_review_at: this.dn_review || null,
        insurance_provider: this.dn_insurance_provider,
        insurance_claim_number: this.dn_insurance_claim,
        sign_now: this.dc_summary,
      });
      this.toast.success('Saved', 'Discharge narrative updated');
      await this.refreshAll();
    } catch (e) { this.toast.error('Save failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected async submitHandoff() {
    const a = this.selected(); if (!a) return;
    this.busy.set(true);
    try {
      const res = await this.svc.submitDischargeHandoff({
        admissionId: a.id,
        checklist: {
          item_meds_returned: this.dc_meds,
          item_iv_lines_removed: this.dc_iv,
          item_belongings_returned: this.dc_belongings,
          item_final_vitals_recorded: this.dc_vitals,
          item_summary_signed: this.dc_summary,
          item_followup_scheduled: this.dc_followup,
          item_prescription_handed: this.dc_prescription,
          item_education_given: this.dc_education,
          item_lab_reports_handed: this.dc_lab_reports,
          item_imaging_reports_handed: this.dc_imaging_reports,
          item_consents_complete: this.dc_consents,
          item_billing_notified: this.dc_billing,
        },
        returnedIndents: Array.from(this.dc_returnIds),
        notes: this.dc_notes || null,
      });
      this.dc_returnIds = new Set();
      if (res.checklist_complete) {
        this.toast.success('Handoff complete', 'Patient is ready for billing');
      } else {
        this.toast.success('Saved', 'Continue checklist when ready');
      }
      await this.refreshAll();
    } catch (e) { this.toast.error('Handoff failed', this.errMsg(e)); }
    finally { this.busy.set(false); }
  }

  protected dischargeStatusLabel(): string {
    const a = this.selected(); if (!a) return '';
    const wf = (a as any).discharge_workflow_status as string | undefined;
    if (!wf || wf === 'none') return 'Not requested yet';
    return wf.replace(/_/g, ' ');
  }
}
