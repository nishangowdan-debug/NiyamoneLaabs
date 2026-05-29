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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { BranchContextService } from '../../../core/branches/branch-context.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { BillingService } from '../data/billing.service';
import { BillingStore } from '../data/billing.store';
import { SmartInboxService } from '../../smart-inbox/data/smart-inbox.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { InvoicePrintService } from '../services/invoice-print.service';
import { HospitalSettingsService, type HospitalSettings } from '../services/hospital-settings.service';
import { BillingInvoicePdfService } from '../services/billing-invoice-pdf.service';
import { HomeCollectionService } from '../../home-collection/data/home-collection.service';
import { WhatsAppService } from '../../../core/whatsapp/whatsapp.service';
import type { TokenSlipData } from '../../appointments/data/appointments.types';
import {
  CATEGORY_LABEL,
  DraftLine,
  InvoiceDetail,
  InvoiceFilter,
  InvoiceRow,
  LINE_KIND_TONE,
  METHOD_LABEL,
  STATUS_TONE,
} from '../data/billing.types';
import type { InvoiceStatus, PaymentMethod, ServiceCategory } from '../../../core/supabase/supabase.types';

interface PatientHit { id: string; uhid: string; full_name: string; mobile: string; }

@Component({
  selector: 'app-billing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Billing</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Invoices · payments · GST ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" (click)="openSettings()" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-ink-soft hover:bg-surface-subtle text-[12px] font-medium">⚙️ Settings</button>
        @if (canWrite()) {
          <button type="button" (click)="openNew()"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New invoice
          </button>
        }
      </div>
    </header>

    <!-- ── KPI grid (4 cards) ────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Total invoices</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().total.toLocaleString('en-IN') }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">All-time records</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Collected today</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2 text-good-fg">{{ formatINR(store.totals().collectedTodayCents) }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Payments recorded today</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Pending balance</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().pendingCents > 0">
          {{ formatINR(store.totals().pendingCents) }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">{{ store.totals().unpaid }} unpaid invoice(s)</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Overdue</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-danger-fg]="store.totals().overdue > 0">
          {{ store.totals().overdue }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">Past due date</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl" placeholder="Search by invoice #, patient name, UHID, or mobile…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">{{ f.label }}</button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.totals().total.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load billing">{{ store.error() }}</app-alert>
      </div>
    }

    @if (backfillStatus() === 'pending') {
      <div class="mb-4 bg-info-bg/40 border border-info-fg/30 rounded-[10px] p-3 text-[12px] text-info-fg">
        ⏳ Lab sync running…
      </div>
    } @else if (backfillStatus() === 'errored') {
      <div class="mb-4 bg-danger-bg/40 border border-danger-fg/30 rounded-[10px] p-3 text-[12px] text-danger-fg">
        ⚠ Lab sync errored — open DevTools console (F12) for details.
      </div>
    } @else if (unflowed().length > 0) {
      <div class="mb-4 bg-warn-bg/40 border border-warn-fg/30 rounded-[10px] p-3">
        <header class="flex items-center justify-between mb-2">
          <h3 class="font-display text-[14px] font-medium text-warn-fg">
            ⚠ {{ unflowed().length }} invoice{{ unflowed().length === 1 ? '' : 's' }} did not flow to /lab
            @if (backfillPushedCount() > 0) {
              <span class="text-[11px] text-ink-muted font-normal">· {{ backfillPushedCount() }} just pushed successfully</span>
            }
          </h3>
          <button type="button" (click)="unflowed.set([])" class="text-[11px] text-ink-muted hover:text-ink-soft">Dismiss</button>
        </header>
        <ul class="text-[12px] text-ink-soft divide-y divide-warn-fg/20 max-h-[200px] overflow-y-auto">
          @for (u of unflowed(); track u.invoiceNumber) {
            <li class="py-1.5">
              <span class="font-mono font-semibold">{{ u.invoiceNumber }}</span>
              <span class="text-ink-muted"> — {{ u.reason }}</span>
            </li>
          }
        </ul>
        <p class="text-[11px] text-ink-muted mt-2">
          Fix path: pick lab services from the dropdown when generating invoices, or add the missing tests to
          <a routerLink="/lab-catalog" class="text-primary-600 hover:underline">/lab-catalog</a>.
        </p>
      </div>
    } @else {
      <div class="mb-4 bg-good-bg/40 border border-good-fg/30 rounded-[10px] p-2.5 text-[12px] text-good-fg flex items-center justify-between">
        <span>✓ Lab sync — all {{ backfillPushedCount() }} invoice{{ backfillPushedCount() === 1 ? '' : 's' }} flowed to /lab.</span>
      </div>
    }

    <!-- ── Invoice table ─────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Invoice #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Patient</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Branch</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Date</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Total</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Paid</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Balance</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.invoices().length === 0) {
            <tr><td colspan="9" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading invoices…</td></tr>
          } @else {
            @for (inv of store.visible(); track inv.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ inv.invoice_number }}</td>
                <td class="px-4 py-2.5">
                  @if (inv.patient; as p) {
                    <p class="text-[13px] font-medium text-ink truncate">{{ p.full_name || (p.first_name + ' ' + p.last_name) }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ p.uhid }} · {{ p.mobile }}</p>
                  }
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  @if (inv.branch; as b) {
                    <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-primary-50 text-primary-700 text-[10px] font-medium" [title]="b.name">
                      <span class="font-mono">{{ b.code }}</span>
                      <span class="text-primary-800/70 truncate max-w-[140px]">· {{ shortBranchName(b.name) }}</span>
                    </span>
                  } @else {
                    <span class="text-[11px] text-ink-muted">—</span>
                  }
                </td>
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">
                  {{ formatDate(inv.invoice_date) }}
                  @if (inv.due_date) { <small class="block text-[10px] text-ink-muted">due {{ formatDate(inv.due_date) }}</small> }
                </td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink">{{ formatINR(inv.total_cents) }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-good-fg">{{ formatINR(inv.paid_cents) }}</td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px]"
                    [class.text-warn-fg]="inv.balance_cents > 0"
                    [class.text-ink-muted]="inv.balance_cents === 0">
                  {{ formatINR(inv.balance_cents) }}
                </td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(inv.status)">{{ STATUS_TONE[inv.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-1">
                    <button type="button" (click)="openDetail(inv)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                      View
                    </button>
                    @if (inv.patient?.mobile) {
                      <button type="button" (click)="sendBillWhatsApp(inv)"
                              title="Open chat in WhatsApp Web — staff sends the message"
                              class="h-7 px-2 rounded-md text-[11px] font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                        📱
                      </button>
                    }
                    @if (canWrite() && inv.balance_cents > 0 && inv.status !== 'void' && inv.status !== 'refunded') {
                      <button type="button" (click)="openPay(inv)" class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white">
                        Pay
                      </button>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No invoices match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openNew()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Generate the first invoice →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── New-invoice modal ─────────────────────────────────── -->
    @if (newOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeNew()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[1040px] bg-surface-card border border-border rounded-[12px] shadow-pop p-6 max-h-[94vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[20px] font-medium text-ink">New invoice &amp; payment</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Pick a patient, add line items, apply discount and collect — all in one go.</p>

          <!-- Patient search -->
          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Patient</span>
            <input type="search" [formControl]="patientSearchCtrl" placeholder="Name, UHID or mobile…" autofocus
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

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
          }

          <!-- Referring doctor (optional, prints on invoice only) -->
          <div class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Referring doctor <span class="text-ink-muted normal-case tracking-normal">(optional)</span>
            </span>
            @if (!newDoctorManual) {
              <select [(ngModel)]="newDoctorId" name="newdoctor"
                      class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">— No referring doctor —</option>
                @for (d of doctors(); track d.id) {
                  <option [value]="d.id">{{ d.full_name }}@if (d.specialty) { · {{ d.specialty }} }</option>
                }
              </select>
              <button type="button" (click)="toggleManualDoctor(true)"
                      class="mt-1.5 text-[11px] text-primary-600 hover:text-primary-700 underline">
                Doctor not in the list? Type a name manually
              </button>
            } @else {
              <input type="text" [(ngModel)]="newDoctorName" name="newdoctorname"
                     placeholder="e.g. Dr. Suresh Kumar · Cardiology"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              <button type="button" (click)="toggleManualDoctor(false)"
                      class="mt-1.5 text-[11px] text-primary-600 hover:text-primary-700 underline">
                Pick from list instead
              </button>
            }
          </div>

          <!-- Home sample collection toggle -->
          <div class="mt-4 border border-border rounded-md">
            <label class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="hcEnabled" name="hcEnabled"
                     (ngModelChange)="onHcToggle($event)"
                     class="size-4" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">📍 Home sample collection</span>
              <span class="text-[11px] text-ink-muted ml-2">One flat pickup surcharge appears as a row below; edit or remove anytime.</span>
            </label>
            @if (hcEnabled) {
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2 px-3 pb-3 border-t border-border pt-3">
                <label class="md:col-span-2 block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Address line 1 *</span>
                  <input type="text" [(ngModel)]="hcLine1" name="hcLine1" placeholder="House / flat / street"
                         class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Pincode *</span>
                  <input type="text" [(ngModel)]="hcPincode" name="hcPincode" maxlength="6" pattern="[0-9]{6}"
                         placeholder="560067"
                         class="w-full h-8 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md" />
                </label>
                <label class="md:col-span-2 block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Address line 2</span>
                  <input type="text" [(ngModel)]="hcLine2" name="hcLine2" placeholder="Landmark, area"
                         class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">City *</span>
                  <input type="text" [(ngModel)]="hcCity" name="hcCity" placeholder="Bengaluru"
                         class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Pickup date & time *</span>
                  <input type="datetime-local" [(ngModel)]="hcScheduledAt" name="hcScheduledAt"
                         class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md" />
                </label>
                <label class="block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Contact mobile *</span>
                  <input type="tel" [(ngModel)]="hcMobile" name="hcMobile" maxlength="13" placeholder="+91…"
                         class="w-full h-8 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md" />
                </label>
                <label class="md:col-span-3 block">
                  <span class="block text-[10px] uppercase text-ink-muted font-medium mb-1">Notes</span>
                  <input type="text" [(ngModel)]="hcNotes" name="hcNotes" placeholder="Special instructions for the phlebotomist"
                         class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md" />
                </label>
                @if (hcValidationError(); as err) {
                  <p class="md:col-span-3 text-[11px] text-danger-fg">{{ err }}</p>
                }
              </div>
            }
          </div>

          <!-- Line items -->
          <div class="mt-5 border border-border rounded-md overflow-hidden">
            <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Line items</p>
              <button type="button" (click)="addLine()" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">+ Add line</button>
            </header>

            @if (draftLines().length === 0) {
              <p class="px-3 py-4 text-[12px] text-ink-muted text-center">No items yet — add a line.</p>
            } @else {
              <ul class="divide-y divide-border">
                @for (line of draftLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-2.5"
                      [class.bg-cyan-50\/40]="isHomePickupLine(line)"
                      [class.border-l-4]="isHomePickupLine(line)"
                      [class.border-l-cyan-500]="isHomePickupLine(line)">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      @if (isHomePickupLine(line)) {
                        <!-- Pickup line: badge instead of service picker, locked description -->
                        <div class="col-span-12 md:col-span-4 h-9 inline-flex items-center gap-2 px-2.5 rounded-md border border-cyan-200 bg-cyan-50">
                          <span class="text-[11px] font-semibold uppercase tracking-[0.04em] text-cyan-700">🏠 Pickup</span>
                          <span class="text-[10px] text-cyan-700/70">auto · editable price</span>
                        </div>
                        <input type="text" [ngModel]="line.description" (ngModelChange)="onDraftDescription(line.id, $event)" [name]="'desc-' + idx" readonly
                               class="col-span-12 md:col-span-4 h-9 px-2.5 text-[12px] bg-cyan-50/60 border border-cyan-200 rounded-md text-cyan-900 cursor-default" />
                      } @else {
                        <!-- Service select — one-way bind so the [(ngModel)] banana doesn't
                             mutate the signal's line element in place. The change is
                             routed through onServicePicked which patches via the signal. -->
                        <select [ngModel]="line.service_code" (ngModelChange)="onServicePicked(line, $event)"
                                [name]="'svc-' + idx"
                                class="col-span-12 md:col-span-4 h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                                [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                          <option value="">(custom)</option>
                          @for (s of store.services(); track s.id) {
                            <option [value]="s.code">{{ s.code }} · {{ s.name }}</option>
                          }
                        </select>

                        <input type="text" [ngModel]="line.description" (ngModelChange)="onDraftDescription(line.id, $event)" [name]="'desc-' + idx" placeholder="Description"
                               class="col-span-12 md:col-span-4 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                      }

                      <input type="number" [ngModel]="line.qty" (ngModelChange)="onDraftQty(line.id, $event)" [name]="'qty-' + idx" min="0.5" step="0.5"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />

                      <input type="number" [ngModel]="line.unit_price_cents / 100"
                             (ngModelChange)="onDraftPrice(line.id, $event)"
                             [name]="'price-' + idx"
                             min="0" step="0.01"
                             class="col-span-4 md:col-span-2 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Price ₹" />

                      <input type="number" [ngModel]="line.gst_rate" (ngModelChange)="onDraftGst(line.id, $event)" [name]="'gst-' + idx"
                             min="0" max="28" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="GST %" />

                      <button type="button" (click)="removeLine(line.id)"
                              class="col-span-2 md:col-span-0 h-9 inline-flex items-center justify-center rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">
                        Remove
                      </button>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                      @if (isHomePickupLine(line)) {
                        <div class="text-[10.5px] text-cyan-700/80 flex items-center gap-2 flex-wrap">
                          <span>📅 {{ pickupSchedLabel() }}</span>
                          <span class="text-cyan-400">·</span>
                          <span>📍 {{ pickupLocationLabel() }}</span>
                          <span class="text-cyan-400">·</span>
                          <span>👤 Phlebotomist <em>TBD</em></span>
                        </div>
                      } @else if (isLabLine(line)) {
                        <div class="inline-flex items-center gap-1 text-[10px]">
                          <span class="text-ink-muted">Routing</span>
                          <div class="inline-flex border border-border rounded-md overflow-hidden">
                            <button type="button" (click)="patchDraftLine(line.id, { routing: 'inhouse' })"
                                    [class]="(line.routing ?? 'inhouse') === 'inhouse' ? 'px-2 h-6 bg-primary-600 text-white' : 'px-2 h-6 bg-surface-card text-ink-soft hover:bg-surface-subtle'">
                              Inhouse
                            </button>
                            <button type="button" (click)="patchDraftLine(line.id, { routing: 'outsource' })"
                                    [class]="line.routing === 'outsource' ? 'px-2 h-6 bg-violet-600 text-white' : 'px-2 h-6 bg-surface-card text-ink-soft hover:bg-surface-subtle'">
                              Outsource
                            </button>
                          </div>
                        </div>
                      } @else {
                        <span></span>
                      }
                      <p class="text-[10px] text-ink-muted font-mono">
                        Line total: {{ formatINR(lineTotal(line)) }}
                      </p>
                    </div>
                  </li>
                }
              </ul>
            }

            <!-- Total summary -->
            <div class="px-3 py-2.5 border-t border-border bg-surface-muted text-right">
              <p class="text-[11px] text-ink-muted">
                Taxable {{ formatINR(draftSummary().taxable) }}
                · GST {{ formatINR(draftSummary().gst) }}
              </p>
              <p class="font-display text-[18px] font-medium text-ink mt-0.5">
                Total {{ formatINR(draftSummary().total) }}
              </p>
            </div>
          </div>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes (optional)</span>
            <input type="text" [(ngModel)]="newNotes" name="notes" placeholder="OPD consultation · 26 May 2026"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <!-- ── Collect cash NOW (discount + payment in same flow) ─── -->
          <section class="mt-5 rounded-[10px] border border-primary-200 bg-primary-50/40 p-4">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="collectNow" name="collectNow"
                     class="size-4" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] font-medium text-ink">💵 Collect cash &amp; close invoice now</span>
              <span class="text-[11px] text-ink-muted">— skip the second "Record payment" pop-up</span>
            </label>

            @if (collectNow) {
              <div class="grid grid-cols-12 gap-3 mt-3">
                @if (canApplyDiscount()) {
                  <div class="col-span-12">
                    <p class="text-[11px] uppercase tracking-[0.06em] text-primary-800 font-semibold mb-1.5">Discount (optional)</p>
                    <div class="grid grid-cols-12 gap-2">
                      <input type="number" min="0" step="1" [(ngModel)]="newDiscountRupees" name="newDisc"
                             (ngModelChange)="onNewDiscountChange()"
                             placeholder="₹ 0"
                             class="col-span-3 h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600"/>
                      <div class="col-span-5 flex items-end gap-1">
                        @for (pct of discountPresets; track pct) {
                          <button type="button" (click)="setNewDiscountPct(pct)"
                                  class="flex-1 h-9 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle">
                            {{ pct }}%
                          </button>
                        }
                      </div>
                      <input type="text" [(ngModel)]="newDiscountReason" name="newDiscReason"
                             placeholder="Reason (required when discount > 0)"
                             class="col-span-4 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600"/>
                    </div>
                  </div>
                }

                <div class="col-span-12 grid grid-cols-12 gap-2">
                  <label class="col-span-3 block">
                    <span class="flex items-center justify-between mb-1">
                      <span class="text-[10px] uppercase tracking-wider text-ink-muted">Amount ₹</span>
                      <button type="button" (click)="newPayAmount = newNetPayableCents() / 100; payAmountTouched = false"
                              class="text-[10px] text-primary-600 hover:underline font-medium">auto</button>
                    </span>
                    <input type="number" min="0" step="0.01" [(ngModel)]="newPayAmount"
                           (input)="onPayAmountInput()" name="newPayAmt"
                           class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600"/>
                  </label>
                  <label class="col-span-3 block">
                    <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Method</span>
                    <select [(ngModel)]="payMethod" name="newPayMethod"
                            class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md appearance-none bg-no-repeat focus:outline-none focus:border-primary-600"
                            [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                      @for (m of methodOptions; track m) { <option [value]="m">{{ METHOD_LABEL[m] }}</option> }
                    </select>
                  </label>
                  <label class="col-span-6 block">
                    <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Reference (optional)</span>
                    <input type="text" [(ngModel)]="payReference" name="newPayRef" placeholder="Txn ID, cheque #…"
                           class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600"/>
                  </label>
                </div>

                <!-- Live recap card -->
                <div class="col-span-12 rounded-md bg-surface-card border border-border text-[11.5px] font-mono px-3 py-2 leading-relaxed">
                  <div class="flex justify-between"><span class="text-ink-muted">Subtotal</span><span>{{ formatINR(draftSummary().taxable) }}</span></div>
                  @if (newDiscountCents() > 0) {
                    <div class="flex justify-between text-primary-700">
                      <span>− Discount</span><span>−{{ formatINR(newDiscountCents()) }}</span>
                    </div>
                  }
                  <div class="flex justify-between font-semibold text-ink border-t border-border mt-1 pt-1">
                    <span>Net payable</span><span>{{ formatINR(newNetPayableCents()) }}</span>
                  </div>
                  <div class="flex justify-between text-good-fg">
                    <span>Collecting now</span><span>{{ formatINR(Math.round((newPayAmount ?? 0) * 100)) }} ({{ METHOD_LABEL[payMethod] }})</span>
                  </div>
                </div>
              </div>
            }
          </section>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeNew()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmNew()" [disabled]="!canSubmitCombined() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Working…' : (collectNow ? 'Generate &amp; collect' : 'Generate invoice') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Pay modal ─────────────────────────────────────────── -->
    @if (payFor(); as inv) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closePay()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[460px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[92vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">
            {{ pendingSlip() ? 'Collect cash' : 'Record payment' }}
          </h2>
          <p class="text-[12px] text-ink-muted mt-0.5">
            {{ inv.invoice_number }} · subtotal {{ formatINR(inv.subtotal_cents) }} · paid {{ formatINR(inv.paid_cents) }} · balance
            <span class="font-semibold text-ink">{{ formatINR(payBalanceCents()) }}</span>
          </p>
          @if (pendingSlip()) {
            <p class="mt-2 text-[11px] text-primary-700 bg-primary-50 border border-primary-200 rounded-md px-2.5 py-1.5">
              Token slip will print after cash is recorded.
            </p>
          }

          <!-- Inline discount block (expanded by default for cashier visibility) -->
          @if (canApplyDiscount()) {
            <section class="mt-4 rounded-md border border-primary-200 bg-primary-50/40 p-3">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[11px] uppercase tracking-[0.06em] text-primary-800 font-semibold">Apply discount</p>
                <button type="button" (click)="resetPayDiscount()"
                        class="text-[10px] text-ink-muted hover:text-ink underline">Clear</button>
              </div>
              <div class="grid grid-cols-12 gap-2">
                <label class="col-span-7 block">
                  <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Discount ₹</span>
                  <input type="number" min="0" step="1" [(ngModel)]="payDiscountRupees" name="payDisc"
                         (ngModelChange)="onPayDiscountChange()"
                         placeholder="0"
                         class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"/>
                </label>
                <div class="col-span-5 flex items-end gap-1">
                  @for (pct of discountPresets; track pct) {
                    <button type="button" (click)="setPayDiscountPct(inv, pct)"
                            class="flex-1 h-9 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle">
                      {{ pct }}%
                    </button>
                  }
                </div>
                <label class="col-span-12 block">
                  <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Reason (required when discount &gt; 0)</span>
                  <input type="text" [(ngModel)]="payDiscountReason" name="payDiscReason"
                         placeholder="e.g. Camp price · Loyal patient · Staff family"
                         class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"/>
                </label>
              </div>

              @if (payDiscountCents() > 0) {
                <div class="mt-2.5 rounded-md bg-surface-card border border-border text-[11.5px] font-mono px-3 py-2 leading-relaxed">
                  <div class="flex justify-between"><span class="text-ink-muted">Subtotal</span><span>{{ formatINR(inv.subtotal_cents) }}</span></div>
                  <div class="flex justify-between text-primary-700">
                    <span>− Discount ({{ payDiscountPctText(inv) }})</span><span>−{{ formatINR(payDiscountCents()) }}</span>
                  </div>
                  <div class="flex justify-between font-semibold text-ink border-t border-border mt-1.5 pt-1.5">
                    <span>Net payable</span><span>{{ formatINR(payBalanceCents()) }}</span>
                  </div>
                  @if (isFullWaiver(inv)) {
                    <p class="mt-1.5 text-[10.5px] text-warn-fg">⚠ Full waiver — balance becomes ₹0. Reason will be logged.</p>
                  }
                </div>
              }
            </section>
          }

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Amount (₹)</span>
            <input type="number" [(ngModel)]="payAmountRupees" name="amt" min="0" [max]="payBalanceCents() / 100" step="0.01"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            <button type="button" (click)="payAmountRupees = payBalanceCents() / 100" class="mt-1 text-[11px] text-primary-600 hover:underline font-medium">Pay full balance</button>
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Method</span>
            <select [(ngModel)]="payMethod" name="method"
                    class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                    [style.background-image]="chevronUrl" style="background-position: right 8px center;">
              @for (m of methodOptions; track m) {
                <option [value]="m">{{ METHOD_LABEL[m] }}</option>
              }
            </select>
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reference (optional)</span>
            <input type="text" [(ngModel)]="payReference" name="ref" placeholder="Txn ID, cheque #…"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2 flex-wrap">
            <button type="button" (click)="closePay()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmPayAndPrint()" [disabled]="!canSubmitPay() || busy()"
                    class="h-9 px-4 inline-flex items-center gap-1.5 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-50 text-[12px] font-medium disabled:opacity-50">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              {{ busy() ? '…' : 'Record &amp; print receipt' }}
            </button>
            <button type="button" (click)="confirmPay()" [disabled]="!canSubmitPay() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Recording…' : 'Record payment' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Detail panel ──────────────────────────────────────── -->
    @if (detail(); as d) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeDetail()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[640px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">{{ d.invoice_number }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">{{ formatDate(d.invoice_date) }} @if (d.due_date) { · due {{ formatDate(d.due_date) }} }</p>
              @if (d.patient; as p) {
                <p class="text-[13px] text-ink mt-1">{{ p.full_name }} <span class="text-ink-muted font-mono text-[11px]">· {{ p.uhid }} · {{ p.mobile }}</span></p>
              }
            </div>
            <div class="flex items-center gap-2">
              <span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span>
              <button type="button" (click)="printInvoice(d)" [disabled]="printing()"
                      class="h-[26px] px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50"
                      title="Print / Save as PDF">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                {{ printing() ? '…' : 'Print' }}
              </button>
            </div>
          </header>

          <ul class="mt-4 border border-border rounded-md overflow-hidden">
            <li class="px-3 py-1.5 bg-surface-muted text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold grid grid-cols-12 gap-2">
              <span class="col-span-6">Item</span>
              <span class="col-span-2 text-right">Qty</span>
              <span class="col-span-2 text-right">Price</span>
              <span class="col-span-2 text-right">Total</span>
            </li>
            @for (it of d.items; track it.id) {
              <li class="px-3 py-2 grid grid-cols-12 gap-2 border-t border-border text-[12px]">
                <span class="col-span-6 text-ink">
                  {{ it.description }}
                  @if (routingFor(it); as r) {
                    @if (r === 'inhouse') {
                      <span class="ml-1.5 inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wider bg-primary-50 text-primary-700 border border-primary-200">Inhouse</span>
                    } @else {
                      <span class="ml-1.5 inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200">Outsource</span>
                    }
                  }
                </span>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ it.qty }}</span>
                <span class="col-span-2 text-right font-mono text-ink-soft">{{ formatINR(it.unit_price_cents) }}</span>
                <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(it.total_cents) }}</span>
              </li>
            }
            <li class="px-3 py-2 border-t border-border text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-10 text-right text-ink-muted">Subtotal</span>
              <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(d.subtotal_cents - d.discount_cents) }}</span>
            </li>
            <li class="px-3 py-2 text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-10 text-right text-ink-muted">CGST + SGST</span>
              <span class="col-span-2 text-right font-mono text-ink">{{ formatINR(d.cgst_cents + d.sgst_cents) }}</span>
            </li>
            <li class="px-3 py-2.5 border-t border-border text-[13px] grid grid-cols-12 gap-2 bg-surface-muted">
              <span class="col-span-10 text-right font-medium text-ink">Total</span>
              <span class="col-span-2 text-right font-mono text-ink font-semibold">{{ formatINR(d.total_cents) }}</span>
            </li>
            <li class="px-3 py-1.5 text-[12px] grid grid-cols-12 gap-2">
              <span class="col-span-10 text-right text-good-fg">Paid</span>
              <span class="col-span-2 text-right font-mono text-good-fg">{{ formatINR(d.paid_cents) }}</span>
            </li>
            <li class="px-3 py-1.5 text-[12px] grid grid-cols-12 gap-2"
                [class.text-warn-fg]="d.balance_cents > 0">
              <span class="col-span-10 text-right">Balance</span>
              <span class="col-span-2 text-right font-mono">{{ formatINR(d.balance_cents) }}</span>
            </li>
          </ul>

          <!-- Discount status banner -->
          @if (pendingDiscount(); as pd) {
            <div class="mt-3 rounded-md bg-warn-bg border border-warn-border px-3 py-2 text-[12px] text-warn-fg">
              <p class="font-medium">⏳ Discount of {{ formatINR(pd.discount_cents) }} is pending approval.</p>
              <p class="text-[11px] mt-0.5 opacity-90">Ticket {{ pd.ticket_no }} · waiting for {{ pd.tier === 'super' ? 'super-admin' : 'branch-admin' }} sign-off in Smart Inbox.</p>
            </div>
          } @else if (d.discount_cents > 0) {
            <div class="mt-3 rounded-md bg-good-bg border border-good-border px-3 py-2 text-[12px] text-good-fg">
              <p class="font-medium">✅ Discount of {{ formatINR(d.discount_cents) }} already applied to this invoice.</p>
              <p class="text-[11px] mt-0.5 opacity-90">An invoice can only carry one discount entry.</p>
            </div>
          }

          @if (d.payments.length > 0) {
            <div class="mt-4">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Payments</p>
              <ul class="border border-border rounded-md divide-y divide-border">
                @for (p of d.payments; track p.id) {
                  <li class="px-3 py-2 flex items-center justify-between text-[12px]"
                      [class.opacity-50]="p.is_void"
                      [class.line-through]="p.is_void">
                    <div>
                      <p class="text-ink">{{ METHOD_LABEL[p.method] }} <span class="text-ink-muted">· {{ p.reference || '—' }}</span></p>
                      <p class="text-[11px] text-ink-muted font-mono">{{ formatDateTime(p.paid_at) }}</p>
                    </div>
                    <p class="font-mono text-good-fg">{{ formatINR(p.amount_cents) }}</p>
                  </li>
                }
              </ul>
            </div>
          }

          <div class="mt-5 flex flex-wrap items-center gap-2 justify-between">
            <div class="flex flex-wrap items-center gap-2">
              @if (canWrite() && d.balance_cents > 0 && d.status !== 'void' && d.status !== 'refunded') {
                <button type="button" (click)="openPay(d)"
                        class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
                  Record payment
                </button>
              }
              @if (canWrite() && d.status !== 'void' && d.status !== 'refunded') {
                <button type="button" (click)="openEdit(d)"
                        class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle inline-flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit invoice
                </button>
              }
              @if (canWrite() && d.status !== 'void' && d.status !== 'refunded'
                   && d.discount_cents === 0 && pendingDiscount() === null) {
                <button type="button" (click)="openDiscount(d)"
                        class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle inline-flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                  Apply discount
                </button>
              }
              @if (canWrite() && d.paid_cents === 0 && d.status !== 'void' && d.status !== 'refunded') {
                <button type="button" (click)="voidInvoicePrompt(d)"
                        class="h-9 px-4 rounded-md border border-border text-danger-fg text-[12px] font-medium hover:bg-danger-bg">
                  Void invoice
                </button>
              }
            </div>
            <button type="button" (click)="closeDetail()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle ml-auto">
              Close
            </button>
          </div>
        </div>
      </div>
    }
    <!-- ── Edit invoice modal ───────────────────────────────── -->
    @if (editFor(); as d) {
      <div class="fixed inset-0 z-[60] grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeEdit()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[760px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">Edit invoice</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">
                {{ d.invoice_number }}
                @if (d.patient; as p) { · {{ p.full_name || (p.first_name + ' ' + p.last_name) }} }
              </p>
            </div>
            @if (d.paid_cents > 0) {
              <div class="shrink-0 px-3 py-1.5 rounded-md bg-warn-bg text-warn-fg text-[11px] font-medium">
                ₹{{ (d.paid_cents / 100).toLocaleString('en-IN') }} already paid — balance will be recalculated
              </div>
            }
          </div>

          <!-- Line items -->
          <div class="border border-border rounded-md overflow-hidden">
            <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
              <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Line items</p>
              <button type="button" (click)="addEditLine()" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">+ Add line</button>
            </header>

            @if (editLines().length === 0) {
              <p class="px-3 py-4 text-[12px] text-ink-muted text-center">No items — add a line.</p>
            } @else {
              <ul class="divide-y divide-border">
                @if (editLines().length > 0) {
                  <li class="px-3 py-1.5 bg-surface-muted/60 border-b border-border">
                    <div class="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">
                      <span class="col-span-12 md:col-span-4">Catalog link <span class="font-normal normal-case text-ink-faint">(routes to lab + commission)</span></span>
                      <span class="col-span-12 md:col-span-4">Invoice description <span class="font-normal normal-case text-ink-faint">(prints on bill)</span></span>
                      <span class="col-span-3 md:col-span-1 text-right">Qty</span>
                      <span class="col-span-4 md:col-span-2 text-right">Price ₹</span>
                      <span class="col-span-3 md:col-span-1 text-right">GST %</span>
                    </div>
                  </li>
                }
                @for (line of editLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-2.5">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      @if (isAutoBilledLine(line)) {
                        <!-- Auto-billed line: show provenance badge, lock from service-mapping -->
                        <div class="col-span-12 md:col-span-4 h-9 inline-flex items-center gap-1.5 px-2.5 rounded-md border bg-surface-subtle"
                             [class]="lineKind(line).chip"
                             [attr.title]="'Auto-billed from ' + line.related_entity_type">
                          <span class="text-[11px] font-semibold uppercase tracking-[0.04em]">{{ lineKind(line).label }}</span>
                          <span class="text-[10px] opacity-70">· auto-billed</span>
                        </div>
                      } @else {
                        <!-- Manual/custom line: free-form service picker (catalog link) -->
                        <select [ngModel]="line.service_code" (ngModelChange)="onEditServicePicked(line, $event)"
                                [name]="'esvc-' + idx"
                                [title]="line.service_code ? 'Catalog link — used by lab routing &amp; commission. Editing the description on the right doesn\\'t change this.' : 'No catalog link — this prints fine but won\\'t auto-route to the lab. Pick a service to link.'"
                                class="col-span-12 md:col-span-4 h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                                [class.border-warn-fg]="!line.service_code"
                                [class.bg-warn-bg]="!line.service_code"
                                [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                          <option value="">— not linked (custom row) —</option>
                          @for (s of store.services(); track s.id) {
                            <option [value]="s.code">{{ s.code }} · {{ s.name }}</option>
                          }
                        </select>
                      }

                      <input type="text" [ngModel]="line.description" (ngModelChange)="onEditDescription(line.id, $event)" [name]="'edesc-' + idx" placeholder="Prints on the invoice"
                             title="Invoice description — what the patient sees on the printed bill. Same line as the catalog link on the left."
                             class="col-span-12 md:col-span-4 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

                      <input type="number" [ngModel]="line.qty" (ngModelChange)="onEditQty(line.id, $event)" [name]="'eqty-' + idx" min="0.5" step="0.5"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />

                      <input type="number" [ngModel]="line.unit_price_cents / 100" (ngModelChange)="onEditPrice(line.id, $event)" [name]="'eprice-' + idx"
                             min="0" step="0.01"
                             class="col-span-4 md:col-span-2 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Price ₹" />

                      <input type="number" [ngModel]="line.gst_rate" (ngModelChange)="onEditGst(line.id, $event)" [name]="'egst-' + idx"
                             min="0" max="28" step="0.01"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="GST %" />

                      <button type="button" (click)="removeEditLine(line.id)"
                              class="col-span-2 md:col-span-0 h-9 inline-flex items-center justify-center rounded-md text-[11px] text-danger-fg hover:bg-danger-bg">
                        Remove
                      </button>
                    </div>
                    <p class="text-[10px] text-ink-muted mt-1 font-mono text-right">
                      Line total: {{ formatINR(lineTotal(line)) }}
                    </p>
                  </li>
                }
              </ul>
            }

            <div class="px-3 py-2.5 border-t border-border bg-surface-muted text-right">
              <p class="text-[11px] text-ink-muted">
                Taxable {{ formatINR(editSummary().taxable) }}
                · GST {{ formatINR(editSummary().gst) }}
              </p>
              <p class="font-display text-[18px] font-medium text-ink mt-0.5">
                Total {{ formatINR(editSummary().total) }}
              </p>
            </div>
          </div>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes (optional)</span>
            <input type="text" [(ngModel)]="editNotes" name="editNotes"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeEdit()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmEdit(d)" [disabled]="!canSubmitEdit() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Discount dialog ──────────────────────────────────── -->
    @if (discountFor(); as d) {
      <div class="fixed inset-0 z-[60] grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeDiscount()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">

          <div class="mb-4">
            <h2 class="font-display text-[18px] font-medium text-ink">Apply discount</h2>
            <p class="text-[12px] text-ink-muted mt-0.5">{{ d.invoice_number }} · subtotal {{ formatINR(d.subtotal_cents) }}</p>
          </div>

          <label class="block mb-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Discount amount (₹)</span>
            <input type="number" [(ngModel)]="discountRupees" name="discountRupees" min="0" step="1"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            <p class="mt-1 text-[11px] text-ink-muted font-mono">
              {{ discountPctText(d) }}
            </p>
          </label>

          <label class="block mb-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason <span class="text-danger-fg">*</span></span>
            <input type="text" [(ngModel)]="discountReason" name="discountReason" placeholder="e.g. staff family member, charity case"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="rounded-[8px] border border-border bg-surface-muted p-2.5 text-[12px] mb-4"
               [class.text-good-fg]="discountTier(d) === 'auto'"
               [class.text-warn-fg]="discountTier(d) === 'branch'"
               [class.text-danger-fg]="discountTier(d) === 'super'">
            @switch (discountTier(d)) {
              @case ('auto')   { ✅ Auto-tier — applied immediately, no approval. }
              @case ('branch') { ⚠ Branch-admin tier — submitted to Smart Inbox for branch admin approval. }
              @case ('super')  { 🔒 Super-admin tier — submitted to Smart Inbox for super-admin approval. }
              @case ('none')   { Enter an amount above 0. }
            }
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" (click)="closeDiscount()"
                    class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Cancel
            </button>
            <button type="button" (click)="submitDiscount(d)"
                    [disabled]="!canSubmitDiscount(d) || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Working…' : (discountTier(d) === 'auto' ? 'Apply discount' : 'Submit for approval') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class BillingPage implements OnInit, OnDestroy {
  protected readonly store = inject(BillingStore);
  private svc = inject(BillingService);
  private printSvc = inject(InvoicePrintService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private readonly branchGuard = inject(BranchContextService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private settingsSvc = inject(HospitalSettingsService);
  private pdfSvc = inject(BillingInvoicePdfService);
  private hcSvc = inject(HomeCollectionService);
  private waSvc = inject(WhatsAppService);

  /** Click handler for the per-row "📱 WhatsApp" button. */
  protected async sendBillWhatsApp(inv: InvoiceRow) {
    if (!inv.patient) { this.toast.warn('No patient on invoice'); return; }
    const r = await this.waSvc.sendBill({
      invoiceId: inv.id,
      invoiceNo: inv.invoice_number,
      patient: { id: inv.patient.id, full_name: inv.patient.full_name, mobile: inv.patient.mobile },
      amountRupees: (inv.total_cents ?? 0) / 100,
    });
    if (r.ok) {
      this.toast.success('WhatsApp opened', 'Send the message from the new tab.');
    } else {
      this.toast.warn('Could not open WhatsApp', r.reason ?? 'Try again.');
    }
  }

  // ── Home sample collection (toggle inside New Invoice modal) ──
  protected hcEnabled = false;
  protected hcLine1 = '';
  protected hcLine2 = '';
  protected hcCity = '';
  protected hcPincode = '';
  protected hcScheduledAt = '';
  protected hcMobile = '';
  protected hcNotes = '';
  protected hcValidationError(): string | null {
    if (!this.hcEnabled) return null;
    if (!this.hcLine1.trim() || !this.hcCity.trim()) return 'Address line 1 and city are required.';
    if (!/^[0-9]{6}$/.test(this.hcPincode.trim())) return 'Pincode must be 6 digits.';
    if (!this.hcScheduledAt) return 'Pickup date & time is required.';
    if (new Date(this.hcScheduledAt).getTime() < Date.now()) return 'Pickup time must be in the future.';
    if (this.hcMobile.replace(/\D/g, '').length < 10) return 'Mobile must be at least 10 digits.';
    return null;
  }
  private inboxSvc = inject(SmartInboxService);
  private supabase = inject(SupabaseService);

  /** Token-slip dialog data — non-null when the slip is showing. */
  /** Pending token-slip + branch info, queued until the cash payment is recorded. */
  protected readonly pendingSlip = signal<{ slip: TokenSlipData; branchId: string | null } | null>(null);
  /** Last token captured during the just-issued flow — used to embed on the printed invoice. */
  protected lastIssuedToken: TokenSlipData | null = null;

  protected readonly hospitalSettings = signal<HospitalSettings | null>(null);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly patientSearchCtrl = new FormControl('', { nonNullable: true });

  protected readonly canWrite = computed(() => this.auth.has('billing.write'));
  protected readonly busy = signal(false);
  protected readonly printing = signal(false);

  // Re-export to template
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly METHOD_LABEL = METHOD_LABEL;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly Math = Math;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: InvoiceFilter; label: string }[] = [
    { value: 'all',            label: 'All' },
    { value: 'unpaid',         label: 'Unpaid' },
    { value: 'partially_paid', label: 'Partial' },
    { value: 'paid',           label: 'Paid' },
    { value: 'draft',          label: 'Draft' },
    { value: 'void',           label: 'Void' },
  ];

  protected readonly methodOptions: PaymentMethod[] = ['cash', 'upi', 'card', 'net_banking', 'cheque', 'insurance', 'adjustment'];

  // ── New-invoice modal state
  protected readonly newOpen = signal(false);
  protected readonly draftLines = signal<DraftLine[]>([]);
  protected readonly patientHits = signal<PatientHit[]>([]);
  protected readonly selectedPatient = signal<PatientHit | null>(null);
  protected newNotes = '';
  protected newDoctorId = '';
  protected newDoctorName = '';
  protected newDoctorManual = false;
  protected readonly doctors = signal<{ id: string; full_name: string; specialty: string | null }[]>([]);

  // ── Pay modal state
  protected readonly payFor = signal<InvoiceRow | InvoiceDetail | null>(null);
  protected payAmountRupees: number | null = null;

  // ── Combined "Generate & collect" state on the New Invoice modal ───
  /** Defaults to ON so the cashier doesn't bounce between two pop-ups. */
  protected collectNow = true;
  protected newDiscountRupees: number | null = null;
  protected newDiscountReason = '';
  protected readonly newDiscountCents = signal(0);
  protected newPayAmount: number | null = null;
  /** True once the cashier types into the Amount field — disables the
   *  auto-fill effect so we don't fight their input. Reset on modal open. */
  protected payAmountTouched = false;
  /** True once the cashier manually changes the pickup row price — disables
   *  the auto-recompute when lab lines change downstream. */
  private pickupPriceTouched = false;

  // ── Home pickup line helpers ────────────────────────────────────────
  protected readonly HOME_COLL_CODE = 'HOME-COLL';
  protected isHomePickupLine(line: DraftLine): boolean {
    return line.service_code === this.HOME_COLL_CODE || (line as any).related_entity_type === 'home_collection';
  }
  protected pickupSchedLabel(): string {
    if (!this.hcScheduledAt) return 'Pickup time not set';
    try {
      return new Date(this.hcScheduledAt).toLocaleString('en-IN',
        { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return this.hcScheduledAt; }
  }
  protected pickupLocationLabel(): string {
    const parts = [this.hcCity?.trim(), this.hcPincode?.trim()].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Address pending';
  }
  /** Mark either the Amount field or the pickup line as user-touched so the
   *  auto-recompute effects stop overwriting their value. */
  protected onLinePriceTouched(line: DraftLine): void {
    if (this.isHomePickupLine(line)) this.pickupPriceTouched = true;
  }

  /** Patch a draft line in the New-invoice signal. Mutating `line.*` directly
   *  via ngModel leaves the array reference unchanged, so `draftSummary`
   *  (a `computed`) never re-evaluates — that's the bug behind Total ₹0 even
   *  when individual `Line total:` rows are correct. Always go through this. */
  protected patchDraftLine(id: string, patch: Partial<DraftLine>): void {
    this.draftLines.update(lines =>
      lines.map(l => (l.id === id ? { ...l, ...patch } : l)),
    );
  }
  protected onDraftQty(id: string, v: unknown): void {
    const qty = Number(v);
    this.patchDraftLine(id, { qty: Number.isFinite(qty) ? qty : 0 });
  }
  protected onDraftPrice(id: string, rupees: unknown): void {
    const r = Number(rupees);
    const cents = Number.isFinite(r) ? Math.round(r * 100) : 0;
    const line = this.draftLines().find(l => l.id === id);
    if (line && this.isHomePickupLine(line)) this.pickupPriceTouched = true;
    this.patchDraftLine(id, { unit_price_cents: cents });
  }
  protected onDraftGst(id: string, v: unknown): void {
    const rate = Number(v);
    this.patchDraftLine(id, { gst_rate: Number.isFinite(rate) ? rate : 0 });
  }
  protected onDraftDescription(id: string, description: string): void {
    this.patchDraftLine(id, { description });
  }

  /** Edit-modal counterpart of patchDraftLine — same rationale. */
  protected patchEditLine(id: string, patch: Partial<DraftLine>): void {
    this.editLines.update(lines =>
      lines.map(l => (l.id === id ? { ...l, ...patch } : l)),
    );
  }
  protected onEditQty(id: string, v: unknown): void {
    const qty = Number(v);
    this.patchEditLine(id, { qty: Number.isFinite(qty) ? qty : 0 });
  }
  protected onEditPrice(id: string, rupees: unknown): void {
    const r = Number(rupees);
    this.patchEditLine(id, { unit_price_cents: Number.isFinite(r) ? Math.round(r * 100) : 0 });
  }
  protected onEditGst(id: string, v: unknown): void {
    const rate = Number(v);
    this.patchEditLine(id, { gst_rate: Number.isFinite(rate) ? rate : 0 });
  }
  protected onEditDescription(id: string, description: string): void {
    this.patchEditLine(id, { description });
  }
  protected onPayAmountInput(): void { this.payAmountTouched = true; }

  protected onNewDiscountChange(): void {
    const rupees = Number(this.newDiscountRupees ?? 0);
    const cents = Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
    this.newDiscountCents.set(cents);
    this.newPayAmount = this.newNetPayableCents() / 100;
  }
  protected setNewDiscountPct(pct: number): void {
    const subtotal = this.draftSummary().taxable;
    const cents = Math.round((subtotal * pct) / 100);
    this.newDiscountRupees = +(cents / 100).toFixed(2);
    this.onNewDiscountChange();
  }
  /** Total payable after the inline discount; clamped to zero. */
  protected newNetPayableCents(): number {
    return Math.max(0, this.draftSummary().total - this.newDiscountCents());
  }
  protected canSubmitCombined(): boolean {
    if (!this.canSubmitNew()) return false;
    if (!this.collectNow) return true; // legacy "invoice only" path
    if (this.newDiscountCents() > 0 && this.newDiscountReason.trim().length < 4) return false;
    const amt = this.newPayAmount ?? 0;
    // Full waiver via discount: amount can be 0 only when discount clears the bill.
    if (amt > 0) return true;
    return this.newDiscountCents() > 0 && this.newNetPayableCents() === 0;
  }
  private resetCombined(): void {
    this.collectNow = true;
    this.newDiscountRupees = null;
    this.newDiscountReason = '';
    this.newDiscountCents.set(0);
    this.newPayAmount = null;
  }

  // ── Inline discount in the Pay modal ────────────────────────────────
  protected readonly discountPresets = [5, 10, 15, 20] as const;
  protected payDiscountRupees: number | null = null;
  protected payDiscountReason = '';
  /** Live computed cents — used by the totals block + the Amount default. */
  protected readonly payDiscountCents = signal(0);
  protected readonly canApplyDiscount = computed(() =>
    this.auth.has('discount.apply') || this.auth.hasRole('super_admin'),
  );
  /** Balance the cashier needs to collect, factoring in the inline discount. */
  protected payBalanceCents(): number {
    const inv = this.payFor();
    if (!inv) return 0;
    return Math.max(0, inv.balance_cents - this.payDiscountCents());
  }
  protected isFullWaiver(inv: InvoiceRow | InvoiceDetail): boolean {
    return this.payDiscountCents() > 0 && this.payBalanceCents() === 0
        && (inv.subtotal_cents - this.payDiscountCents() <= 0 || this.payAmountRupees === 0);
  }
  protected payDiscountPctText(inv: InvoiceRow | InvoiceDetail): string {
    if (!inv.subtotal_cents) return '—';
    const pct = (this.payDiscountCents() / inv.subtotal_cents) * 100;
    return `${pct.toFixed(2)}%`;
  }

  /** Recompute discount-in-cents whenever the cashier types into the field. */
  protected onPayDiscountChange(): void {
    const rupees = Number(this.payDiscountRupees ?? 0);
    const cents = Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
    this.payDiscountCents.set(cents);
    // Auto-sync the Amount field to the new balance so the cashier never has
    // to do the math by hand. They can still override afterwards.
    this.payAmountRupees = this.payBalanceCents() / 100;
  }

  protected setPayDiscountPct(inv: InvoiceRow | InvoiceDetail, pct: number): void {
    const cents = Math.round((inv.subtotal_cents * pct) / 100);
    this.payDiscountRupees = +(cents / 100).toFixed(2);
    this.onPayDiscountChange();
  }

  protected resetPayDiscount(): void {
    this.payDiscountRupees = null;
    this.payDiscountReason = '';
    this.payDiscountCents.set(0);
    const inv = this.payFor();
    if (inv) this.payAmountRupees = inv.balance_cents / 100;
  }
  protected payMethod: PaymentMethod = 'cash';
  protected payReference = '';

  // ── Detail panel
  protected readonly detail = signal<InvoiceDetail | null>(null);

  // ── Edit modal state
  protected readonly editFor = signal<InvoiceDetail | null>(null);
  protected readonly editLines = signal<DraftLine[]>([]);
  protected editNotes = '';

  // ── Discount dialog state
  protected readonly discountFor = signal<InvoiceDetail | null>(null);
  protected discountRupees: number | null = null;
  protected discountReason = '';

  /** Pending discount approval (if any) for the invoice currently in detail panel. */
  protected readonly pendingDiscount = signal<{
    ticket_no: string;
    discount_cents: number;
    tier: 'branch' | 'super';
  } | null>(null);

  protected readonly editSummary = computed(() => {
    const lines = this.editLines();
    const taxable = lines.reduce((s, l) =>
      s + Math.max(0, Math.round(l.qty * l.unit_price_cents) - l.discount_cents), 0);
    const gst = lines.reduce((s, l) => {
      const t = Math.max(0, Math.round(l.qty * l.unit_price_cents) - l.discount_cents);
      return s + Math.round(t * (l.gst_rate / 100));
    }, 0);
    return { taxable, gst, total: taxable + gst };
  });

  protected readonly draftSummary = computed(() => {
    const lines = this.draftLines();
    const taxable = lines.reduce((s, l) =>
      s + Math.max(0, Math.round(l.qty * l.unit_price_cents) - l.discount_cents), 0);
    const gst = lines.reduce((s, l) => {
      const t = Math.max(0, Math.round(l.qty * l.unit_price_cents) - l.discount_cents);
      return s + Math.round(t * (l.gst_rate / 100));
    }, 0);
    return { taxable, gst, total: taxable + gst };
  });

  private unsubscribe: (() => void) | null = null;
  private backfilledOnce = false;
  private readonly _backfillFx = effect(() => {
    const invs = this.store.invoices();
    if (this.backfilledOnce || invs.length === 0) return;
    this.backfilledOnce = true;
    void this.runSilentLabBackfill();
  });

  /** Auto-fill the Amount field in the combined modal whenever the line
   *  items or discount change — until the cashier types their own value. */
  private readonly _payAmountSyncFx = effect(() => {
    const total = this.draftSummary().total;        // tracked
    const disc  = this.newDiscountCents();          // tracked
    if (!this.newOpen() || !this.collectNow || this.payAmountTouched) return;
    // Mutating bare class fields inside effect is fine — they're consumed by
    // the template directly via ngModel, no signal write needed.
    void disc; void total;
    this.newPayAmount = this.newNetPayableCents() / 100;
  });

  /** Re-sync the pickup row price whenever lab lines change AND home
   *  collection is currently enabled. The toggle itself is handled by the
   *  direct `onHcToggle` callback because hcEnabled is a plain class field
   *  that Angular effects can't observe. */
  private hcSyncInFlight = false;
  private readonly _hcLineSyncFx = effect(() => {
    const lines = this.draftLines();  // tracked
    if (!this.newOpen() || !this.hcEnabled) return;
    void this.syncPickupRow(lines);
  });

  /** Add/refresh the single pickup row (idempotent — safe to call repeatedly). */
  private async syncPickupRow(lines = this.draftLines()): Promise<void> {
    if (this.hcSyncInFlight) return;
    this.hcSyncInFlight = true;
    try {
      const rupees = await this.computeHomeCollectionSurcharge(lines);
      const cents = Math.round(rupees * 100);
      const cur = this.draftLines();
      const existing = cur.find((l) => this.isHomePickupLine(l));
      if (existing) {
        if (!this.pickupPriceTouched && existing.unit_price_cents !== cents) {
          this.draftLines.set(cur.map((l) =>
            this.isHomePickupLine(l) ? { ...l, unit_price_cents: cents } : l,
          ));
        }
        return;
      }
      const row: DraftLine = {
        id: crypto.randomUUID(),
        service_code: this.HOME_COLL_CODE,
        description: 'Home sample collection — pickup',
        qty: 1,
        unit_price_cents: cents,
        discount_cents: 0,
        gst_rate: 0,
        routing: null,
        related_entity_type: 'home_collection',
      } as any;
      // withPickupLast keeps service rows above pickup even on first insert.
      this.draftLines.set(this.withPickupLast([...cur, row]));
    } finally {
      this.hcSyncInFlight = false;
    }
  }

  /** Direct ngModelChange callback — the only place that adds or removes
   *  the pickup row in response to the user ticking the checkbox.
   *  (Effect-based observation doesn't work for plain class fields.) */
  protected onHcToggle(enabled: boolean): void {
    if (!enabled) {
      this.draftLines.update((lines) => lines.filter((l) => !this.isHomePickupLine(l)));
      this.pickupPriceTouched = false;
      return;
    }
    void this.syncPickupRow();
  }

  /** Reorders draft lines so every Home-pickup row sits at the bottom.
   *  Applied after every mutation that could push pickup above a real
   *  service (e.g. `+ Add line`) so the printed invoice and the on-screen
   *  list both show: services first → pickup last. */
  private withPickupLast(lines: DraftLine[]): DraftLine[] {
    const services = lines.filter((l) => !this.isHomePickupLine(l));
    const pickups  = lines.filter((l) =>  this.isHomePickupLine(l));
    return [...services, ...pickups];
  }

  protected readonly unflowed = signal<{ invoiceNumber: string; reason: string }[]>([]);
  protected readonly backfillStatus = signal<'pending' | 'ran' | 'errored'>('pending');
  protected readonly backfillPushedCount = signal(0);

  private async runSilentLabBackfill() {
    try {
      const invs = this.store.invoices().slice(0, 200).map(i => ({
        id: i.id,
        invoice_number: i.invoice_number,
        invoice_date: (i as any).invoice_date ?? (i as any).created_at ?? null,
        status: String(i.status),
      }));
      const r = await this.svc.backfillLabPush(invs);
      for (const p of r.pushed) {
        this.toast.success('Sent to lab', `${p.invoiceNumber}: ${p.codes.join(', ')}`);
      }
      this.unflowed.set(r.skipped);
      this.backfillPushedCount.set(r.pushed.length);
      this.backfillStatus.set('ran');
      for (const s of r.skipped) {
        console.warn(`[billing] Lab push failed · ${s.invoiceNumber}:`, s.reason);
      }
    } catch (e: any) {
      this.backfillStatus.set('errored');
      console.warn('[billing] backfill skipped:', e?.message ?? e);
    }
  }

  ngOnInit() {
    // Load hospital settings
    const branchId = (this.auth.claims().branch_id as string | undefined) ?? null;
    if (branchId) {
      void this.settingsSvc.loadSettings(branchId).then(settings => {
        this.hospitalSettings.set(settings);
      });
    }

    void this.store.load();
    void this.svc.listDoctors().then(d => this.doctors.set(d)).catch(() => { /* non-fatal */ });
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));

    this.patientSearchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (term) => {
        const t = (term ?? '').trim();
        if (t.length < 2) { this.patientHits.set([]); return; }
        try {
          const hits = await this.svc.searchPatients(t);
          this.patientHits.set(hits);
        } catch { /* non-fatal */ }
      });
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected onFilter(v: InvoiceFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: InvoiceFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected statusChipCls(s: InvoiceStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }

  protected lineTotal(l: DraftLine): number {
    const taxable = Math.max(0, Math.round(l.qty * l.unit_price_cents) - l.discount_cents);
    const gst = Math.round(taxable * (l.gst_rate / 100));
    return taxable + gst;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  }

  protected formatDateTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM HH:mm'); } catch { return iso; }
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  /** Strip the brand prefix from a branch name so the inline pill stays
   *  short — "Sree Diagnostics — Bengaluru" → "Bengaluru". Falls back to
   *  the full name when no separator is present. */
  protected shortBranchName(name: string | null | undefined): string {
    if (!name) return '';
    const sep = name.split(/—|–|-/);
    return (sep.length > 1 ? sep[sep.length - 1] : name).trim();
  }

  // ── New-invoice flow ──────────────────────────────
  protected async openNew() {
    // Force a target branch BEFORE the form opens. Without this guard a
    // super admin in "All hospitals" mode could file the invoice against
    // the patient's home branch or (worse) the oldest active branch via
    // the create_invoice RPC's silent fallback — leading to branch-wise
    // revenue mismatch and cancel-and-reissue churn.
    const branchId = await this.branchGuard.require('New invoice');
    if (!branchId) return;
    this.draftLines.set([this.makeBlankLine()]);
    this.selectedPatient.set(null);
    this.patientHits.set([]);
    this.patientSearchCtrl.setValue('');
    this.newNotes = '';
    this.newDoctorId = '';
    this.newDoctorName = '';
    this.newDoctorManual = false;
    this.hcEnabled = false;
    this.hcLine1 = ''; this.hcLine2 = ''; this.hcCity = ''; this.hcPincode = '';
    this.hcScheduledAt = ''; this.hcMobile = ''; this.hcNotes = '';
    this.resetCombined();
    this.payAmountTouched = false;
    this.pickupPriceTouched = false;
    // Default cash + zero pay amount; auto-updates as lines/discount change.
    this.payMethod = 'cash';
    this.payReference = '';
    if (this.doctors().length === 0) {
      void this.svc.listDoctors().then(d => this.doctors.set(d));
    }
    this.newOpen.set(true);
  }

  protected closeNew() {
    this.newOpen.set(false);
    this.resetCombined();
  }

  protected addLine() {
    // Append the new service row BEFORE any pickup line so pickup stays last.
    this.draftLines.update((lines) => this.withPickupLast([...lines, this.makeBlankLine()]));
  }

  protected removeLine(id: string) {
    const line = this.draftLines().find((l) => l.id === id);
    this.draftLines.update((lines) => lines.filter((l) => l.id !== id));
    // Manually nuking the pickup row also untoggles the Home-collection
    // checkbox so the modal stays consistent.
    if (line && this.isHomePickupLine(line)) {
      this.hcEnabled = false;
      this.pickupPriceTouched = false;
    }
  }

  protected onServicePicked(line: DraftLine, code: string) {
    if (!code) {
      // Custom row chosen — clear the code, keep the rest of the line.
      this.patchDraftLine(line.id, { service_code: '' });
      return;
    }
    const svc = this.store.services().find((s) => s.code === code);
    if (!svc) {
      // Still write the code so the dropdown shows the user's choice.
      this.patchDraftLine(line.id, { service_code: code });
      return;
    }
    // Build the patch from the CURRENT signal-held line, not the (potentially
    // stale) `line` reference Angular passed in. Otherwise concurrent edits
    // on other lines could be clobbered when this patch lands.
    const cur = this.draftLines().find((l) => l.id === line.id) ?? line;
    const patch: Partial<DraftLine> = { service_code: code };
    if (!cur.description || cur.description === '') patch.description = svc.name;
    if (!cur.unit_price_cents)                       patch.unit_price_cents = svc.unit_price_cents;
    if (cur.gst_rate === 0)                          patch.gst_rate = +svc.gst_rate;
    this.patchDraftLine(line.id, patch);

    if (svc.category === 'lab') {
      // Prefill routing from catalog default; user can flip the toggle.
      void this.svc.getDefaultRoutings([code]).then((m) => {
        const def = m.get(code) ?? 'inhouse';
        const fresh = this.draftLines().find((l) => l.id === line.id);
        if (fresh && !fresh.routing) this.patchDraftLine(line.id, { routing: def });
      });
    }
  }

  /** A draft line counts as a lab line when its picked service is in the lab catalog. */
  protected isLabLine(line: DraftLine): boolean {
    if (!line.service_code) return false;
    const svc = this.store.services().find((s) => s.code === line.service_code);
    return svc?.category === 'lab';
  }

  protected pickPatient(p: PatientHit) {
    this.selectedPatient.set(p);
    this.patientHits.set([]);
    this.patientSearchCtrl.setValue('', { emitEvent: false });
  }

  /** Extract a human-readable message from any thrown value. Supabase RPC
   *  errors are plain objects ({message, details, hint, code}) — not Error
   *  instances — so the standard `instanceof Error` check silently drops
   *  them. This helper drills through the common shapes and falls back to
   *  JSON so the user always sees *something* actionable. */
  private errorMessage(e: unknown): string {
    if (e == null) return 'Try again.';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const obj = e as any;
    const parts = [obj?.message, obj?.details, obj?.hint, obj?.code]
      .filter((s) => typeof s === 'string' && s.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
    try { return JSON.stringify(e); } catch { return String(e); }
  }

  protected canSubmitNew(): boolean {
    const lines = this.draftLines();
    return !!this.selectedPatient()
      && lines.length > 0
      && lines.every((l) => l.qty > 0 && l.unit_price_cents >= 0 && l.description.trim().length > 0);
  }

  protected toggleManualDoctor(manual: boolean): void {
    this.newDoctorManual = manual;
    if (manual) this.newDoctorId = '';
    else this.newDoctorName = '';
  }

  protected async confirmNew() {
    const patient = this.selectedPatient();
    if (!patient || !this.canSubmitNew()) return;
    // Validate home-collection fields up-front so we don't leave a half-state.
    const hcErr = this.hcValidationError();
    if (hcErr) {
      this.toast.error('Home collection details incomplete', hcErr);
      return;
    }
    const manualName = this.newDoctorName.trim();
    this.busy.set(true);
    try {
      // The pickup row is already in draftLines() (added live by the
      // _hcLineSyncFx effect when the cashier ticked Home collection), so
      // the createInvoice call below uses the user-visible items as-is.
      // Safety net: always send pickup as the LAST line, regardless of
      // whatever order the user shuffled rows into — the printed invoice
      // then shows services first and pickup last, like Amazon's "Shipping
      // & handling" sits below the cart.
      const items = this.withPickupLast([...this.draftLines()]);

      // The branch guard at openNew() guarantees activeBranchId is set
      // by the time we reach confirm. Re-read it here so a topbar change
      // mid-flight still pins the invoice to whatever the cashier last
      // confirmed; fall back to null only if something truly broke.
      const targetBranchId = this.branchStore.activeBranchId();
      const inv = await this.svc.createInvoice({
        patientId: patient.id,
        branchId: targetBranchId,
        doctorStaffId: this.newDoctorManual ? null : this.newDoctorId,
        doctorName: this.newDoctorManual ? manualName : null,
        items,
        notes: this.newNotes.trim() || undefined,
        chiefComplaint: this.newNotes.trim() || null,
      });
      this.toast.success('Invoice generated', inv.invoice_number);

      // ── Home sample collection — file alongside the invoice ──────────
      if (this.hcEnabled) {
        try {
          const branchId = this.branchStore.activeBranchId();
          if (!branchId) {
            this.toast.warn('Home collection not filed', 'Pick a specific branch to file a home-collection request.');
          } else {
            const tests = this.draftLines()
              .filter((l) => this.isLabLine(l) && l.service_code)
              .map((l) => ({
                lab_test_id: '',     // resolved below via service_code
                service_code: l.service_code,
                price_inr: (l.unit_price_cents || 0) / 100,
                surcharge_inr: 0,
              }));
            // Resolve lab_test_id + surcharge from lab_tests + lab_test_prices.
            const codes = tests.map((t) => t.service_code).filter(Boolean);
            const resolved = await this.hcSvc.resolveTestsForBilling(branchId, codes);
            const items = tests
              .map((t) => {
                const r = resolved.get(t.service_code) ?? null;
                return r ? { lab_test_id: r.lab_test_id, price_inr: t.price_inr, surcharge_inr: r.surcharge_inr } : null;
              })
              .filter((x): x is { lab_test_id: string; price_inr: number; surcharge_inr: number } => !!x);
            if (items.length === 0) {
              this.toast.warn('Home collection skipped',
                'No home-eligible lab tests on this invoice. Mark tests as home-eligible in /lab-catalog.');
            } else {
              const id = await this.hcSvc.create({
                branch_id: branchId,
                patient_id: patient.id,
                address: {
                  line1: this.hcLine1.trim(),
                  line2: this.hcLine2.trim() || null,
                  city: this.hcCity.trim(),
                  pincode: this.hcPincode.trim(),
                  lat: null, lng: null,
                },
                scheduled_at: new Date(this.hcScheduledAt).toISOString(),
                contact_mobile: this.hcMobile.trim(),
                notes: this.hcNotes.trim() || null,
                tests: items,
              });
              this.toast.success('Home collection scheduled',
                `Request ${id.slice(0, 8)}… created with ${items.length} test${items.length === 1 ? '' : 's'}.`);
            }
          }
        } catch (e: any) {
          this.toast.error('Home collection failed', e?.message ?? String(e));
          console.error('[billing] hc create failed', e);
        }
      }

      // Build per-test routing overrides from the user's Inhouse/Outsource picks.
      const routingOverrides = new Map<string, 'inhouse' | 'outsource'>();
      for (const l of this.draftLines()) {
        if (l.service_code && l.routing) {
          routingOverrides.set(l.service_code, l.routing);
          routingOverrides.set(l.service_code.replace(/^LAB[-_ ]/i, ''), l.routing);
        }
      }

      // ── Auto-push lab/imaging line items to /lab ─────────────────────
      try {
        const r = await this.svc.pushInvoiceToLab(inv.id, routingOverrides);
        if (r.sent.length > 0) {
          this.toast.success(
            'Sent to lab',
            `${r.sent.length} test${r.sent.length === 1 ? '' : 's'} (${r.sent.join(', ')})`,
          );
        } else if (r.reason) {
          // Surface every skip reason — no more silent failures. Lets the user
          // diagnose mismatches (catalog missing test, custom row, etc.).
          this.toast.warn('Not sent to lab', r.reason);
          console.warn('[billing] lab push skipped:', r.reason);
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        this.toast.error('Lab push errored', msg);
        console.error('[billing] auto lab push threw:', e);
      }

      this.pendingSlip.set(null);

      // ── One-shot discount + payment when "Collect now" is checked ─────
      if (this.collectNow) {
        try {
          if (this.newDiscountCents() > 0) {
            const reason = this.newDiscountReason.trim();
            const { error } = await (this.supabase.client as any).rpc('apply_invoice_discount_internal', {
              p_invoice_id: inv.id,
              p_discount_cents: this.newDiscountCents(),
              p_reason: reason,
            });
            if (error) throw new Error(error.message ?? 'Discount failed');
          }
          const payCents = Math.round((this.newPayAmount ?? 0) * 100);
          if (payCents > 0) {
            await this.svc.recordPayment({
              invoiceId: inv.id,
              amountCents: payCents,
              method: this.payMethod,
              reference: this.payReference.trim() || undefined,
            });
          }
          if (this.newDiscountCents() > 0 && payCents > 0) {
            this.toast.success('Invoice + discount + payment recorded',
              `Disc ${this.formatINR(this.newDiscountCents())} · Paid ${this.formatINR(payCents)} · ${METHOD_LABEL[this.payMethod]}`);
          } else if (this.newDiscountCents() > 0) {
            this.toast.success('Invoice + full waiver',
              `Discount ${this.formatINR(this.newDiscountCents())} · balance cleared`);
          } else if (payCents > 0) {
            this.toast.success('Invoice + payment recorded',
              `Paid ${this.formatINR(payCents)} · ${METHOD_LABEL[this.payMethod]}`);
          }
        } catch (e: any) {
          this.toast.error('Collection failed (invoice was saved)', this.errorMessage(e));
          // Fall back to the standalone Pay modal so the cashier can retry.
          this.newOpen.set(false);
          this.resetCombined();
          void this.store.load();
          this.openPay(inv as unknown as InvoiceRow);
          return;
        }
      }

      this.newOpen.set(false);
      this.resetCombined();
      void this.store.load();

      // Legacy path: if cashier deliberately UN-ticked "Collect now", open
      // the standalone Pay modal so they can collect later.
      if (!this.collectNow) {
        this.openPay(inv as unknown as InvoiceRow);
      }
    } catch (e) {
      this.toast.error('Could not generate invoice', this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  // ── Pay flow ──────────────────────────────────────
  protected openPay(inv: InvoiceRow | InvoiceDetail) {
    this.payFor.set(inv);
    this.payAmountRupees = inv.balance_cents / 100;
    this.payMethod = 'cash';
    this.payReference = '';
    // Pre-fill any existing invoice-level discount so the cashier sees what's
    // already on file and can adjust or zero it.
    this.payDiscountRupees = (inv as any).discount_cents > 0 ? (inv as any).discount_cents / 100 : null;
    this.payDiscountReason = '';
    this.payDiscountCents.set(0);  // delta from current state — starts at 0
  }

  protected closePay() {
    this.payFor.set(null);
    this.resetPayDiscount();
  }

  /** A payment is submittable when:
   *   - amount > 0 (normal cash collection), OR
   *   - amount = 0 AND a discount is configured that wipes the balance
   *     (full waiver still needs reason text). */
  protected canSubmitPay(): boolean {
    const inv = this.payFor();
    if (!inv) return false;
    const amount = this.payAmountRupees ?? 0;
    const disc = this.payDiscountCents();
    if (disc > 0 && this.payDiscountReason.trim().length < 4) return false;
    if (amount > 0) return true;
    // Zero-amount only legitimate when a discount waives the balance.
    return disc > 0 && this.payBalanceCents() === 0;
  }

  protected async confirmPay() {
    const inv = this.payFor();
    if (!inv || !this.canSubmitPay()) return;
    this.busy.set(true);
    try {
      // Step 1: apply discount first (if any) so the balance is right before
      // the payment is taken. Failure here aborts — we never collect against
      // a stale balance.
      const discCents = this.payDiscountCents();
      if (discCents > 0) {
        const reason = this.payDiscountReason.trim();
        const { error } = await (this.supabase.client as any).rpc('apply_invoice_discount_internal', {
          p_invoice_id: inv.id,
          p_discount_cents: discCents,
          p_reason: reason,
        });
        if (error) throw new Error(error.message ?? 'Discount failed');
      }

      const cents = Math.round((this.payAmountRupees ?? 0) * 100);
      if (cents > 0) {
        await this.svc.recordPayment({
          invoiceId: inv.id,
          amountCents: cents,
          method: this.payMethod,
          reference: this.payReference.trim() || undefined,
        });
      }

      // Combined success message — covers all three legitimate combos.
      if (discCents > 0 && cents > 0) {
        this.toast.success('Discount + payment recorded',
          `Disc ${this.formatINR(discCents)} · Paid ${this.formatINR(cents)} · ${METHOD_LABEL[this.payMethod]}`);
      } else if (discCents > 0) {
        this.toast.success('Full waiver applied', `Discount ${this.formatINR(discCents)} · balance cleared`);
      } else {
        this.toast.success('Payment recorded', `${this.formatINR(cents)} · ${METHOD_LABEL[this.payMethod]}`);
      }

      this.payFor.set(null);
      this.resetPayDiscount();
      // Refresh detail panel if open
      if (this.detail()?.id === inv.id) {
        this.detail.set(await this.svc.getInvoice(inv.id));
      }
      void this.store.load();

      this.pendingSlip.set(null);

      // Auto-fire WhatsApp send for the paid invoice if patient has opted in
      // (default) and has a mobile number on file. Single confirm() because
      // the staff might not always want to ping the patient immediately.
      const newBalance = inv.balance_cents - cents;
      if (newBalance <= 0 && inv.patient?.mobile && (inv.patient as any).whatsapp_opt_in !== false) {
        const ok = confirm(`Send invoice ${inv.invoice_number} to ${inv.patient.full_name} on WhatsApp?`);
        if (ok) {
          await this.sendBillWhatsApp(inv as any);
        }
      }
    } catch (e) {
      this.toast.error('Could not record payment', this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Record cash, then print the invoice receipt before continuing into the token slip. */
  protected async confirmPayAndPrint() {
    const inv = this.payFor();
    if (!inv || !this.canSubmitPay()) return;
    const invoiceId = inv.id;
    // Capture the token BEFORE confirmPay() consumes pendingSlip into the dialog.
    this.lastIssuedToken = this.pendingSlip()?.slip ?? null;
    await this.confirmPay();
    // confirmPay sets payFor=null on success; if it's still set, payment failed — bail.
    if (this.payFor() != null) return;
    try {
      const detail = await this.svc.getInvoice(invoiceId);
      if (detail) await this.printInvoice(detail);
    } catch (e) {
      this.toast.error('Could not print receipt', this.errorMessage(e));
    } finally {
      // One-shot — don't carry over to a later "Print" click on a different invoice.
      this.lastIssuedToken = null;
    }
  }

  // ── Detail flow ───────────────────────────────────
  protected readonly detailRouting = signal<Map<string, 'inhouse' | 'outsource'>>(new Map());

  protected async openDetail(inv: InvoiceRow) {
    try {
      this.detail.set(await this.svc.getInvoice(inv.id));
      await this.loadPendingDiscount(inv.id);
      this.detailRouting.set(await this.svc.getInvoiceRouting(inv.invoice_number));
    } catch (e) {
      this.toast.error('Could not load invoice', this.errorMessage(e));
    }
  }

  /** Returns 'inhouse', 'outsource', or null for an invoice item.
   *  Priority: persisted column → joined service code → exact desc →
   *  word-boundary code/name inside desc → token signature → token overlap. */
  protected routingFor(it: any): 'inhouse' | 'outsource' | null {
    if (it?.routing === 'inhouse' || it?.routing === 'outsource') return it.routing;
    const m = this.detailRouting();
    if (m.size === 0) return null;
    const codeFromJoin = it?.service?.code;
    if (codeFromJoin) {
      if (m.has(codeFromJoin)) return m.get(codeFromJoin)!;
      if (m.has(codeFromJoin.toLowerCase())) return m.get(codeFromJoin.toLowerCase())!;
    }
    const desc = String(it?.description ?? '').toLowerCase().trim();
    if (!desc) return null;
    if (m.has(desc)) return m.get(desc)!;

    // Word-boundary match: catalog code or name appears as a whole word in the
    // description (e.g. "CBC panel" contains the code "CBC", or "Chest X-ray"
    // contains tokens of the catalog name).
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [key, val] of m) {
      if (key.startsWith('TOKENS:')) continue;
      if (key.length < 2) continue;
      if (new RegExp(`\\b${escapeRe(key)}\\b`, 'i').test(desc)) return val;
    }

    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length >= 2);
    const descTokens = tokenize(desc);
    const descSig = [...descTokens].sort().join(' ');
    if (descSig && m.has('TOKENS:' + descSig)) return m.get('TOKENS:' + descSig)!;

    let best: { score: number; val: 'inhouse' | 'outsource' } | null = null;
    for (const [key, val] of m) {
      if (!key.startsWith('TOKENS:')) continue;
      const keyTokens = key.slice('TOKENS:'.length).split(' ');
      if (keyTokens.length === 0 || descTokens.length === 0) continue;
      const overlap = keyTokens.filter((t) => descTokens.includes(t)).length;
      const score = overlap / Math.min(keyTokens.length, descTokens.length);
      if (score >= 0.5 && (!best || score > best.score)) best = { score, val };
    }
    return best?.val ?? null;
  }

  protected closeDetail() {
    this.detail.set(null);
    this.pendingDiscount.set(null);
  }

  /** Loads any pending discount-approval exception for the given invoice. */
  private async loadPendingDiscount(invoiceId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('exception_requests' as any)
      .select('ticket_no, payload, exception_type')
      .eq('source_table', 'invoices')
      .eq('source_id', invoiceId)
      .eq('status', 'pending')
      .in('exception_type', ['invoice_discount_branch', 'invoice_discount_super'])
      .order('requested_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) {
      this.pendingDiscount.set(null);
      return;
    }
    const row = data[0] as unknown as { ticket_no: string; payload: any; exception_type: string };
    this.pendingDiscount.set({
      ticket_no: row.ticket_no,
      discount_cents: Number(row.payload?.discount_cents ?? 0),
      tier: row.exception_type === 'invoice_discount_super' ? 'super' : 'branch',
    });
  }

  protected async printInvoice(d: InvoiceDetail) {
    this.printing.set(true);
    try {
      let settings = this.hospitalSettings();

      // Use default settings if not loaded
      if (!settings) {
        settings = {
          hospital_name: 'Sree Diagnostics',
          hospital_address: 'Vijayawada, Andhra Pradesh',
          hospital_phone: '8008331234',
          hospital_email: 'info@sreediagnostics.in',
          hospital_website: 'www.sreediagnostics.in',
          pharmacy_name: 'Sree Diagnostics',
          gst_number: 'GST11211233',
          branch_id: (this.auth.claims().branch_id as string) || '',
        };
      }

      // Pass through OPD token info when this print follows a fresh-invoice flow.
      // (The pendingSlip is set in confirmNew() and consumed by confirmPay() — but
      // confirmPayAndPrint clears pendingSlip *before* printInvoice runs, so we
      // also stash the slip on the invoice's appointment_id when needed.)
      const pending = this.pendingSlip();
      const token = pending?.slip ?? this.lastIssuedToken;

      const routing = await this.svc.getInvoiceRouting(d.invoice_number);
      const visit = await this.fetchVisitDetails(d);
      this.pdfSvc.generatePDF({
        invoice: d,
        settings,
        token,
        routing,
        appointmentAt: visit.appointmentAt,
        patientAddress: visit.patientAddress,
      });
      this.toast.success('Invoice PDF opened', 'Check print preview to save or print.');
    } catch (e) {
      this.toast.error('Could not generate invoice', this.errorMessage(e));
    } finally {
      this.printing.set(false);
    }
  }

  // ── Edit flow ─────────────────────────────────────
  protected openEdit(d: InvoiceDetail) {
    const services = this.store.services();
    // Build a case-insensitive description → service.code map so we can
    // back-fill the "catalog link" dropdown for lines that were originally
    // saved without a service_id (custom rows, legacy invoices, etc.).
    // Saving doesn't create a duplicate — service_code and description are
    // the same line, this just keeps the dropdown in sync visually.
    const byName = new Map<string, string>();
    for (const s of services) {
      if (s.name) byName.set(s.name.toLowerCase().trim(), s.code);
    }
    this.editLines.set(d.items.map((it) => {
      const linkedByJoin = services.find((s) => s.id === it.service_id)?.code ?? '';
      const fallback    = byName.get((it.description ?? '').toLowerCase().trim()) ?? '';
      return {
        id: crypto.randomUUID(),
        _origItemId: it.id,
        service_code: linkedByJoin || fallback,
        description: it.description,
        qty: it.qty,
        unit_price_cents: it.unit_price_cents,
        discount_cents: it.discount_cents,
        gst_rate: Number(it.gst_rate),
        related_entity_type: (it as any).related_entity_type ?? null,
      };
    }));
    this.editNotes = d.notes ?? '';
    this.editFor.set(d);
  }

  protected closeEdit() { this.editFor.set(null); }

  // ── Discount flow ────────────────────────────────────────────
  protected openDiscount(d: InvoiceDetail) {
    this.discountRupees = d.discount_cents > 0 ? d.discount_cents / 100 : null;
    this.discountReason = '';
    this.discountFor.set(d);
  }
  protected closeDiscount() {
    this.discountFor.set(null);
    this.discountRupees = null;
    this.discountReason = '';
  }

  /** Tier classification per the locked thresholds. */
  protected discountTier(d: InvoiceDetail): 'none' | 'auto' | 'branch' | 'super' {
    const cents = Math.round((this.discountRupees ?? 0) * 100);
    if (cents <= 0 || d.subtotal_cents <= 0) return 'none';
    const pct = (cents / d.subtotal_cents) * 100;
    if (pct <= 5  && cents <= 50000)   return 'auto';   // ≤5% AND ≤₹500
    if (pct <= 15 && cents <= 1000000) return 'branch'; // ≤15% AND ≤₹10,000
    return 'super';
  }

  protected discountPctText(d: InvoiceDetail): string {
    const cents = Math.round((this.discountRupees ?? 0) * 100);
    if (!cents || !d.subtotal_cents) return '—';
    const pct = (cents / d.subtotal_cents) * 100;
    return `${pct.toFixed(2)}% of subtotal · net ${this.formatINR(d.subtotal_cents - cents)}`;
  }

  protected canSubmitDiscount(d: InvoiceDetail): boolean {
    const tier = this.discountTier(d);
    if (tier === 'none') return false;
    if (this.discountReason.trim().length < 4) return false;
    if (tier === 'auto') return this.auth.has('discount.apply.auto') || this.auth.hasRole('super_admin');
    return true; // branch & super tiers always submittable; approval gates the apply
  }

  protected async submitDiscount(d: InvoiceDetail) {
    const cents = Math.round((this.discountRupees ?? 0) * 100);
    const tier = this.discountTier(d);
    const reason = this.discountReason.trim();
    if (!cents || tier === 'none' || reason.length < 4) return;

    this.busy.set(true);
    try {
      if (tier === 'auto') {
        const { error } = await (this.supabase.client as any).rpc('apply_invoice_discount_internal', {
          p_invoice_id: d.id,
          p_discount_cents: cents,
          p_reason: reason,
        });
        if (error) throw new Error(error.message);
        this.toast.success('Discount applied', `${this.formatINR(cents)} on ${d.invoice_number}`);
        this.closeDiscount();
        this.detail.set(await this.svc.getInvoice(d.id));
        await this.loadPendingDiscount(d.id);
        await this.store.load();
      } else {
        const result = await this.inboxSvc.submit({
          exceptionType: tier === 'branch' ? 'invoice_discount_branch' : 'invoice_discount_super',
          sourceTable: 'invoices',
          sourceId: d.id,
          title: `Discount ${this.formatINR(cents)} on ${d.invoice_number}`,
          reason,
          payload: {
            discount_cents: cents,
            subtotal_cents: d.subtotal_cents,
            invoice_number: d.invoice_number,
            amount_cents: cents,
          },
          branchId: d.branch_id ?? this.branchStore.activeBranchId() ?? null,
          severity: tier === 'super' ? 'high' : 'normal',
        });
        this.toast.success('Submitted for approval', `Ticket ${result.ticket_no}`);
        this.closeDiscount();
        await this.loadPendingDiscount(d.id);
      }
    } catch (e) {
      this.toast.error('Could not apply discount', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      this.busy.set(false);
    }
  }

  protected addEditLine() {
    this.editLines.update((lines) => [...lines, this.makeBlankLine()]);
  }

  protected removeEditLine(id: string) {
    this.editLines.update((lines) => lines.filter((l) => l.id !== id));
  }

  // ── Line provenance helpers ─────────────────────────────
  protected lineKind(line: DraftLine): { label: string; chip: string } {
    const t = line.related_entity_type;
    if (t && LINE_KIND_TONE[t]) return LINE_KIND_TONE[t];
    return LINE_KIND_TONE['manual'];
  }
  /** Auto-billed lines (lab / pharmacy / blood / doctor / bed) shouldn't be re-mapped
   *  to a service catalogue code — that data came from the clinical action. */
  protected isAutoBilledLine(line: DraftLine): boolean {
    const t = line.related_entity_type;
    return !!(t && t !== 'manual' && LINE_KIND_TONE[t]);
  }

  protected onEditServicePicked(line: DraftLine, code: string) {
    if (!code) {
      this.patchEditLine(line.id, { service_code: '' });
      return;
    }
    const svc = this.store.services().find((s) => s.code === code);
    if (!svc) {
      this.patchEditLine(line.id, { service_code: code });
      return;
    }
    const cur = this.editLines().find((l) => l.id === line.id) ?? line;
    const patch: Partial<DraftLine> = { service_code: code };
    if (!cur.description)         patch.description      = svc.name;
    if (!cur.unit_price_cents)    patch.unit_price_cents = svc.unit_price_cents;
    if (cur.gst_rate === 0)       patch.gst_rate         = +svc.gst_rate;
    this.patchEditLine(line.id, patch);
  }

  protected canSubmitEdit(): boolean {
    const lines = this.editLines();
    return lines.length > 0
      && lines.every((l) => l.qty > 0 && l.unit_price_cents >= 0 && l.description.trim().length > 0);
  }

  protected async confirmEdit(d: InvoiceDetail) {
    if (!this.canSubmitEdit()) return;
    this.busy.set(true);
    try {
      await this.svc.updateInvoice(d.id, {
        items: this.editLines(),
        originalItems: d.items,
        notes: this.editNotes.trim() || undefined,
      });
      this.toast.success('Invoice updated', d.invoice_number);
      this.editFor.set(null);
      // Refresh detail panel
      this.detail.set(await this.svc.getInvoice(d.id));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not update invoice', this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async voidInvoicePrompt(d: InvoiceDetail) {
    const reason = prompt('Reason to void this invoice?');
    if (!reason || !reason.trim()) return;
    this.busy.set(true);
    try {
      await this.svc.voidInvoice(d.id, reason.trim());
      this.toast.warn('Invoice voided');
      this.detail.set(null);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not void', this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected openSettings(): void {
    const hospitalName = prompt('Enter Hospital Name:', this.hospitalSettings()?.hospital_name || 'NIYAMONE HOSPITAL');
    if (!hospitalName) return;

    const settings: HospitalSettings = {
      hospital_name: hospitalName,
      hospital_address: this.hospitalSettings()?.hospital_address || '',
      hospital_phone: this.hospitalSettings()?.hospital_phone || '',
      hospital_email: this.hospitalSettings()?.hospital_email || '',
      hospital_website: this.hospitalSettings()?.hospital_website || '',
      pharmacy_name: this.hospitalSettings()?.pharmacy_name || 'NIYAMONE PHARMACY',
      pharmacy_license: this.hospitalSettings()?.pharmacy_license || '',
      branch_id: (this.auth.claims().branch_id as string) || '',
    };

    void this.settingsSvc.saveSettings(settings).then(() => {
      this.hospitalSettings.set(settings);
      this.toast.success('Settings saved', `Hospital: ${hospitalName}`);
    });
  }

  private makeBlankLine(): DraftLine {
    return {
      id: crypto.randomUUID(),
      service_code: '',
      description: '',
      qty: 1,
      unit_price_cents: 0,
      discount_cents: 0,
      gst_rate: 0,
    };
  }

  /**
   * Look up appointment date + patient address to render in the invoice PDF
   * footer. Priority:
   *   1. Home-collection scheduled_at + address (if a home_collection_requests
   *      row exists for this patient within ±1 day of the invoice).
   *   2. Otherwise: invoice_date + the patient's primary address.
   */
  private async fetchVisitDetails(inv: InvoiceDetail): Promise<{
    appointmentAt: string | null;
    patientAddress: string | null;
  }> {
    const patientId = (inv as any).patient_id ?? (inv as any).patient?.id;
    if (!patientId) return { appointmentAt: inv.invoice_date ?? null, patientAddress: null };

    // 1. Try the most recent matching home_collection_requests row.
    try {
      const since = new Date(new Date(inv.invoice_date).getTime() - 2 * 86400000).toISOString();
      const { data: hc } = await (this.supabase.client as any)
        .from('home_collection_requests')
        .select('scheduled_at, address')
        .eq('patient_id', patientId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hc) {
        const a = (hc.address ?? {}) as any;
        const lines = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean);
        return {
          appointmentAt: hc.scheduled_at ?? inv.invoice_date ?? null,
          patientAddress: lines.join(', ') || null,
        };
      }
    } catch { /* fall through */ }

    // 2. Fallback: primary patient address.
    try {
      const { data: addrs } = await (this.supabase.client as any)
        .from('patient_addresses')
        .select('line1, line2, city, state, pincode')
        .eq('patient_id', patientId)
        .order('is_primary', { ascending: false })
        .limit(1);
      const a = (addrs && addrs[0]) || null;
      const parts = a ? [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean) : [];
      return {
        appointmentAt: inv.invoice_date ?? null,
        patientAddress: parts.length ? parts.join(', ') : null,
      };
    } catch {
      return { appointmentAt: inv.invoice_date ?? null, patientAddress: null };
    }
  }

  /**
   * One flat home-pickup fee per invoice, configured at the branch level
   * (`branches.home_collection_surcharge_inr`, default ₹250). Returns 0 when
   * the order contains no home-eligible lab lines, so non-lab invoices aren't
   * charged. The cashier can still override the resulting surcharge line.
   */
  private async computeHomeCollectionSurcharge(lines: DraftLine[]): Promise<number> {
    const branchId = this.branchStore.activeBranchId();
    if (!branchId) return 0;
    const labLines = lines.filter((l) => this.isLabLine(l) && l.service_code);
    if (labLines.length === 0) return 0;
    const codes = Array.from(new Set(labLines.map((l) => l.service_code!.trim()).filter(Boolean)));
    try {
      // Only charge the flat fee when at least one selected test is actually
      // home-eligible. `resolveTestsForBilling` only returns rows for eligible
      // tests, so a non-empty map ⇒ at least one eligible line.
      const resolved = await this.hcSvc.resolveTestsForBilling(branchId, codes);
      if (resolved.size === 0) return 0;
      return this.branchStore.homeCollectionSurcharge(branchId);
    } catch (e) {
      console.warn('[billing] surcharge lookup failed', e);
      return 0;
    }
  }
}
