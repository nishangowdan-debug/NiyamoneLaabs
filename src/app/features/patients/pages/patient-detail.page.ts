import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CardComponent } from '../../../shared/ui/card/card.component';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { PatientStatusBadgeComponent } from '../components/patient-status-badge.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PatientsService } from '../data/patients.service';
import type {
  InsurancePolicy,
  Patient,
  PatientDetail,
} from '../data/patients.types';
import type {
  AllergySeverity,
  BloodGroup,
  InsuranceStatus,
  MaritalStatus,
  Salutation,
} from '../../../core/supabase/supabase.types';
import { ageFromDob, formatINR } from '../utils/age-from-dob';
import { PatientIdCardPdfService } from '../services/patient-id-card-pdf.service';
import { BranchStore } from '../../../core/branches/branch.store';

@Component({
  selector: 'app-patient-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    CardComponent,
    BadgeComponent,
    SkeletonComponent,
    AlertComponent,
    ButtonComponent,
    PatientStatusBadgeComponent,
  ],
  template: `
    <a routerLink="/patients" class="text-[12px] text-primary-600 hover:underline font-medium">← Back to patients</a>

    @if (loading()) {
      <div class="mt-3 flex flex-col gap-3">
        <app-skeleton width="100%" height="6rem" />
        <app-skeleton width="100%" height="12rem" />
      </div>
    } @else if (loadError()) {
      <div class="mt-3">
        <app-alert tone="danger" title="Could not load patient">{{ loadError() }}</app-alert>
      </div>
    } @else if (detail(); as d) {
      <!-- Sticky banner -->
      <div class="sticky top-14 z-10 -mx-6 px-6 py-4 mt-3 bg-surface-page/95 backdrop-blur border-b border-border">
        <div class="flex items-start gap-4 flex-wrap">
          <div class="size-12 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-display text-base shrink-0">
            {{ initials(d) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="font-display text-xl text-ink leading-tight">{{ d.patient.full_name || (d.patient.first_name + ' ' + d.patient.last_name) }}</h1>
              <app-patient-status-badge [status]="d.patient.status" />
              @for (tag of d.patient.tags; track tag) {
                <app-badge tone="neutral">{{ tag }}</app-badge>
              }
            </div>
            <p class="text-2xs font-mono text-ink-muted mt-0.5">
              {{ d.patient.uhid }} · {{ ageGender(d.patient.date_of_birth, d.patient.gender) }}
              @if (d.patient.blood_group) { · <span class="text-danger-fg">{{ d.patient.blood_group }}</span> }
            </p>
          </div>
          @if (d.patient.balance_cents > 0) {
            <div class="text-right">
              <p class="text-2xs uppercase tracking-wide text-ink-muted">Balance due</p>
              <p class="font-display text-lg text-warn-fg">{{ formatBalance(d.patient.balance_cents) }}</p>
            </div>
          }
          <div class="flex items-center gap-2">
            <app-button variant="secondary" size="sm" (click)="printIdCard(d.patient)">🪪 Print ID card</app-button>
            @if (canWrite()) {
              <app-button variant="secondary" size="sm" (click)="openProfile(d.patient)">Edit profile</app-button>
            }
          </div>
        </div>

        @if (d.allergies.length > 0) {
          <div class="mt-3 flex items-start gap-2 text-xs">
            <span class="text-2xs uppercase tracking-wide text-ink-muted shrink-0 mt-0.5">Allergies:</span>
            <div class="flex flex-wrap gap-1.5">
              @for (a of d.allergies; track a.id) {
                <app-badge [tone]="allergyTone(a.severity)">{{ a.allergen }}</app-badge>
              }
            </div>
          </div>
        }
      </div>

      <!-- Vitals snapshot -->
      <div class="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        @for (v of vitalsTiles(); track v.label) {
          <div class="bg-surface-card border border-border rounded-md p-3">
            <p class="text-2xs uppercase tracking-wide text-ink-muted">{{ v.label }}</p>
            <p class="font-mono text-md text-ink mt-1">
              {{ v.value ?? '—' }}<span class="text-2xs text-ink-muted ml-1">{{ v.unit }}</span>
            </p>
          </div>
        }
      </div>

      <!-- Demographics + address + emergency -->
      <div class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <app-card title="Demographics" subtitle="Personal record">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">DOB</dt>
            <dd class="text-ink">{{ d.patient.date_of_birth }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">Mobile</dt>
            <dd class="text-ink font-mono">{{ d.patient.mobile }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">Alt</dt>
            <dd class="text-ink font-mono">{{ d.patient.alt_mobile || '—' }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">Email</dt>
            <dd class="text-ink truncate">{{ d.patient.email || '—' }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">Marital</dt>
            <dd class="text-ink">{{ d.patient.marital_status || '—' }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">Aadhaar</dt>
            <dd class="text-ink font-mono">{{ d.patient.aadhaar_last4 ? '••••' + d.patient.aadhaar_last4 : '—' }}</dd>
            <dt class="text-2xs uppercase tracking-wide text-ink-muted">ABHA</dt>
            <dd class="text-ink">{{ d.patient.abha || '—' }}</dd>
          </dl>
        </app-card>

        <app-card title="Address" [subtitle]="d.addresses.length + ' on file'">
          @if (d.addresses[0]; as a) {
            <p class="text-sm text-ink leading-relaxed">{{ a.line1 }}<br>
              @if (a.line2) { {{ a.line2 }}<br> }
              {{ a.city }}, {{ a.state }} {{ a.pincode }}<br>
              <span class="text-ink-muted">{{ a.country }}</span>
            </p>
          } @else {
            <p class="text-sm text-ink-muted">No address on record.</p>
          }
        </app-card>

        <app-card title="Emergency contact">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              @if (d.patient.emergency_contact_name) {
                <p class="text-sm text-ink">{{ d.patient.emergency_contact_name }}
                  <span class="text-ink-muted"> · {{ d.patient.emergency_contact_relation || 'contact' }}</span>
                </p>
                <p class="font-mono text-xs text-ink-soft mt-1">{{ d.patient.emergency_contact_phone }}</p>
              } @else {
                <p class="text-sm text-ink-muted">No emergency contact on record.</p>
              }
            </div>
            @if (canWrite()) {
              <button type="button" (click)="openEmergency(d.patient)" class="text-[11px] text-primary-600 hover:underline font-medium shrink-0">Edit</button>
            }
          </div>
        </app-card>
      </div>

      <!-- Allergies + Insurance -->
      <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <app-card title="Allergies" [subtitle]="d.allergies.length + ' recorded'">
          @if (d.allergies.length === 0) {
            <p class="text-sm text-ink-muted">No allergies recorded.</p>
          } @else {
            <ul class="divide-y divide-border -mx-5">
              @for (a of d.allergies; track a.id) {
                <li class="px-5 py-3 flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-ink font-medium">{{ a.allergen }}</p>
                    @if (a.reaction) {
                      <p class="text-xs text-ink-soft mt-0.5">{{ a.reaction }}</p>
                    }
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <app-badge [tone]="allergyTone(a.severity)">{{ a.severity }}</app-badge>
                    @if (canWrite()) {
                      <button type="button" (click)="removeAllergy(a.id)" [disabled]="busy() === a.id"
                              class="text-[10px] text-danger-fg hover:underline disabled:opacity-50">Remove</button>
                    }
                  </div>
                </li>
              }
            </ul>
          }

          @if (canWrite()) {
            @if (allergyAddOpen()) {
              <form class="mt-4 grid grid-cols-12 gap-2" (submit)="$event.preventDefault(); confirmAddAllergy()">
                <input type="text" [(ngModel)]="newAllergen" name="al" placeholder="Allergen *" required
                       class="col-span-12 md:col-span-5 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <select [(ngModel)]="newSeverity" name="sv"
                        class="col-span-6 md:col-span-3 h-9 px-2 pr-6 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 6px center;">
                  @for (s of severityOptions; track s.value) {
                    <option [value]="s.value">{{ s.label }}</option>
                  }
                </select>
                <input type="text" [(ngModel)]="newReaction" name="rx" placeholder="Reaction"
                       class="col-span-12 md:col-span-4 h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                <div class="col-span-12 flex justify-end gap-2 mt-1">
                  <button type="button" (click)="cancelAddAllergy()" class="h-8 px-3 text-[12px] rounded-md border border-border text-ink-soft hover:bg-surface-subtle">Cancel</button>
                  <button type="submit" [disabled]="!newAllergen.trim() || busy() === 'allergy'"
                          class="h-8 px-3 text-[12px] rounded-md bg-primary-600 hover:bg-primary-500 text-white font-medium disabled:opacity-50">
                    {{ busy() === 'allergy' ? 'Saving…' : 'Add' }}
                  </button>
                </div>
              </form>
            } @else {
              <button type="button" (click)="openAddAllergy()" class="mt-3 text-[12px] text-primary-600 hover:underline font-medium">+ Add allergy</button>
            }
          }
        </app-card>

        <app-card title="Insurance" [subtitle]="d.insurance.length + ' polic' + (d.insurance.length === 1 ? 'y' : 'ies')">
          @if (d.insurance.length === 0) {
            <p class="text-sm text-ink-muted">No insurance policies on record.</p>
          } @else {
            <ul class="divide-y divide-border -mx-5">
              @for (p of d.insurance; track p.id) {
                <li class="px-5 py-3 flex items-start justify-between gap-3" [class.opacity-60]="p.status === 'cancelled' || p.status === 'expired'">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <p class="text-sm text-ink font-medium truncate">{{ p.payer_name }}</p>
                      @if (p.is_primary) { <app-badge tone="info">Primary</app-badge> }
                      <app-badge [tone]="insuranceTone(p.status)">{{ p.status }}</app-badge>
                    </div>
                    <p class="text-xs font-mono text-ink-soft mt-0.5">{{ p.policy_number }}@if (p.group_number) { · grp {{ p.group_number }} }</p>
                    @if (p.valid_to || p.sum_assured_cents > 0) {
                      <p class="text-2xs text-ink-muted mt-0.5">
                        @if (p.valid_to) { Valid till {{ p.valid_to }} }
                        @if (p.valid_to && p.sum_assured_cents > 0) { · }
                        @if (p.sum_assured_cents > 0) { Sum {{ formatBalance(p.sum_assured_cents) }} }
                        @if (p.copay_pct > 0) { · {{ p.copay_pct }}% copay }
                      </p>
                    }
                  </div>
                  @if (canWrite()) {
                    <div class="flex items-center gap-2 shrink-0">
                      <button type="button" (click)="openInsurance(p)" class="text-[10px] text-primary-600 hover:underline">Edit</button>
                      <button type="button" (click)="removeInsurance(p.id)" [disabled]="busy() === p.id"
                              class="text-[10px] text-danger-fg hover:underline disabled:opacity-50">Remove</button>
                    </div>
                  }
                </li>
              }
            </ul>
          }

          @if (canWrite()) {
            <button type="button" (click)="openInsurance(null)" class="mt-3 text-[12px] text-primary-600 hover:underline font-medium">+ Add policy</button>
          }
        </app-card>
      </div>

      <!-- Care team -->
      <div class="mt-4">
        <app-card title="Care team" [subtitle]="d.careTeam.length + ' assigned'">
          @if (d.careTeam.length === 0) {
            <p class="text-sm text-ink-muted">No care-team members assigned.</p>
          } @else {
            <ul class="divide-y divide-border -mx-5">
              @for (m of d.careTeam; track m.staff_id) {
                <li class="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p class="text-sm text-ink">{{ m.staff_full_name || m.staff_id }}</p>
                    <p class="text-2xs text-ink-muted">{{ (m.staff_role || '').replace('_', ' ') }} · {{ m.role }}</p>
                  </div>
                </li>
              }
            </ul>
          }
        </app-card>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <a [routerLink]="['/appointments']" fragment="patient-{{ d.patient.id }}">
          <app-button variant="secondary">View appointments</app-button>
        </a>
      </div>

      <!-- ── Profile edit modal ──────────────────────────────── -->
      @if (profileOpen()) {
        <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="profileOpen.set(false)">
          <div role="dialog" aria-modal="true"
               class="w-full max-w-[680px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <h2 class="font-display text-[18px] font-medium text-ink">Edit profile</h2>
            <p class="text-[12px] text-ink-muted mt-0.5">UHID {{ d.patient.uhid }}</p>

            <div class="grid grid-cols-12 gap-3 mt-4">
              <label class="col-span-3 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Salutation</span>
                <select [(ngModel)]="formSalutation" name="sal"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="">—</option>
                  <option value="Mr">Mr</option><option value="Ms">Ms</option><option value="Mrs">Mrs</option>
                  <option value="Dr">Dr</option><option value="Master">Master</option>
                </select>
              </label>
              <label class="col-span-9 md:col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">First name *</span>
                <input type="text" [(ngModel)]="formFirstName" name="fn" required
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-12 md:col-span-5 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Last name *</span>
                <input type="text" [(ngModel)]="formLastName" name="ln" required
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Mobile *</span>
                <input type="tel" [(ngModel)]="formMobile" name="mob" required
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Alt mobile</span>
                <input type="tel" [(ngModel)]="formAltMobile" name="amob"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</span>
                <input type="email" [(ngModel)]="formEmail" name="em"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Blood</span>
                <select [(ngModel)]="formBloodGroup" name="bg"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="">—</option>
                  @for (b of bloodGroups; track b) { <option [value]="b">{{ b }}</option> }
                </select>
              </label>
              <label class="col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Marital</span>
                <select [(ngModel)]="formMarital" name="mar"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="">—</option>
                  <option value="single">Single</option><option value="married">Married</option>
                  <option value="widowed">Widowed</option><option value="divorced">Divorced</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label class="col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Aadhaar last 4</span>
                <input type="text" maxlength="4" [(ngModel)]="formAadhaar" name="aad" pattern="[0-9]{4}"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">ABHA</span>
                <input type="text" [(ngModel)]="formAbha" name="abha"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button type="button" (click)="profileOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="button" (click)="confirmProfile()" [disabled]="!profileValid() || busy() === 'profile'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'profile' ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── Emergency contact modal ─────────────────────────── -->
      @if (emergencyOpen()) {
        <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="emergencyOpen.set(false)">
          <div role="dialog" aria-modal="true"
               class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
               (click)="$event.stopPropagation()">
            <h2 class="font-display text-[18px] font-medium text-ink">Emergency contact</h2>
            <div class="grid grid-cols-12 gap-3 mt-4">
              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name</span>
                <input type="text" [(ngModel)]="emName" name="emn"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-7 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Phone</span>
                <input type="tel" [(ngModel)]="emPhone" name="emp"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-5 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Relation</span>
                <input type="text" [(ngModel)]="emRelation" name="emr" placeholder="spouse / parent / sibling…"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button type="button" (click)="emergencyOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="button" (click)="confirmEmergency()" [disabled]="busy() === 'emergency'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'emergency' ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ── Insurance modal ─────────────────────────────────── -->
      @if (insuranceOpen()) {
        <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="insuranceOpen.set(false)">
          <div role="dialog" aria-modal="true"
               class="w-full max-w-[640px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <h2 class="font-display text-[18px] font-medium text-ink">{{ insEditId() ? 'Edit policy' : 'New policy' }}</h2>

            <div class="grid grid-cols-12 gap-3 mt-4">
              <label class="col-span-12 md:col-span-7 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Payer name *</span>
                <input type="text" [(ngModel)]="insPayer" name="ipy" required placeholder="e.g. Star Health · TATA AIG · ICICI Lombard"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-12 md:col-span-5 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Status</span>
                <select [(ngModel)]="insStatus" name="ist"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              <label class="col-span-12 md:col-span-7 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Policy number *</span>
                <input type="text" [(ngModel)]="insPolicyNo" name="ipn" required
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-12 md:col-span-5 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Group number</span>
                <input type="text" [(ngModel)]="insGroupNo" name="ign"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Valid from</span>
                <input type="date" [(ngModel)]="insValidFrom" name="ivf"
                       class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-6 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Valid till</span>
                <input type="date" [(ngModel)]="insValidTo" name="ivt"
                       class="w-full h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-6 md:col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Sum assured (₹)</span>
                <input type="number" [(ngModel)]="insSumRupees" name="isr" min="0" step="1000"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-6 md:col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Copay %</span>
                <input type="number" [(ngModel)]="insCopayPct" name="icp" min="0" max="100" step="0.5"
                       class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
              <label class="col-span-12 md:col-span-4 inline-flex items-end gap-2 pb-2">
                <input type="checkbox" [(ngModel)]="insPrimary" name="ipr"
                       class="size-3.5" style="accent-color: var(--color-primary-600);" />
                <span class="text-[13px] text-ink">Primary policy</span>
              </label>

              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
                <input type="text" [(ngModel)]="insNotes" name="inot"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <button type="button" (click)="insuranceOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="button" (click)="confirmInsurance()" [disabled]="!insValid() || busy() === 'insurance'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'insurance' ? 'Saving…' : (insEditId() ? 'Save changes' : 'Add policy') }}
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class PatientDetailPage implements OnInit {
  readonly id = input.required<string>();

  private svc = inject(PatientsService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private idCardSvc = inject(PatientIdCardPdfService);
  private branch = inject(BranchStore);

  protected readonly detail = signal<PatientDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly canWrite = computed(() => this.auth.has('patients.write'));

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  // ── Profile edit
  protected readonly profileOpen = signal(false);
  protected formSalutation: Salutation | '' = '';
  protected formFirstName = '';
  protected formLastName = '';
  protected formMobile = '';
  protected formAltMobile = '';
  protected formEmail = '';
  protected formBloodGroup: BloodGroup | '' = '';
  protected formMarital: MaritalStatus | '' = '';
  protected formAadhaar = '';
  protected formAbha = '';

  // ── Emergency edit
  protected readonly emergencyOpen = signal(false);
  protected emName = '';
  protected emPhone = '';
  protected emRelation = '';

  // ── Allergies inline form
  protected readonly allergyAddOpen = signal(false);
  protected newAllergen = '';
  protected newSeverity: AllergySeverity = 'moderate';
  protected newReaction = '';

  // ── Insurance modal state
  protected readonly insuranceOpen = signal(false);
  protected readonly insEditId = signal<string | null>(null);
  protected insPayer = '';
  protected insPolicyNo = '';
  protected insGroupNo = '';
  protected insValidFrom = '';
  protected insValidTo = '';
  protected insSumRupees = 0;
  protected insCopayPct = 0;
  protected insPrimary = false;
  protected insStatus: InsuranceStatus = 'active';
  protected insNotes = '';

  protected readonly bloodGroups: BloodGroup[] = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  protected readonly severityOptions: { value: AllergySeverity; label: string }[] = [
    { value: 'mild',             label: 'Mild' },
    { value: 'moderate',         label: 'Moderate' },
    { value: 'severe',           label: 'Severe' },
    { value: 'life_threatening', label: 'Life-threatening' },
  ];

  async ngOnInit() {
    await this.reload();
  }

  private async reload() {
    try {
      this.loading.set(true);
      const d = await this.svc.getDetail(this.id());
      this.detail.set(d);
      this.loadError.set(null);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not load this patient.');
    } finally {
      this.loading.set(false);
    }
  }

  protected initials(d: PatientDetail) {
    const n = d.patient.full_name || `${d.patient.first_name} ${d.patient.last_name}`;
    return n.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  protected ageGender(dob: string, gender: string) {
    const age = ageFromDob(dob);
    return age === null ? gender : `${age}y · ${gender}`;
  }

  protected formatBalance(cents: number) { return formatINR(cents); }

  protected readonly vitalsTiles = computed<{ label: string; value: string | number | null; unit: string }[]>(() => {
    const d = this.detail();
    const v = d?.latestVitals ?? null;
    const bp = v?.bp_systolic && v?.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : null;
    const m = v?.height_cm ? Number(v.height_cm) / 100 : 0;
    const bmi = m > 0 && v?.weight_kg ? (Number(v.weight_kg) / (m * m)).toFixed(1) : null;
    return [
      { label: 'BP',    value: bp,                       unit: 'mmHg' },
      { label: 'Pulse', value: v?.pulse ?? null,         unit: 'bpm' },
      { label: 'SpO₂',  value: v?.spo2_pct ?? null,      unit: '%' },
      { label: 'Temp',  value: v?.temp_celsius ?? null,  unit: '°C' },
      { label: 'Sugar', value: v?.blood_sugar_mgdl ?? null, unit: 'mg/dL' },
      { label: 'BMI',   value: bmi,                      unit: '' },
    ];
  });

  protected allergyTone(severity: string) {
    switch (severity) {
      case 'life_threatening': return 'danger' as const;
      case 'severe':           return 'danger' as const;
      case 'moderate':         return 'warn' as const;
      default:                 return 'neutral' as const;
    }
  }

  protected insuranceTone(status: InsuranceStatus) {
    switch (status) {
      case 'active':    return 'good' as const;
      case 'pending':   return 'warn' as const;
      case 'expired':   return 'neutral' as const;
      case 'cancelled': return 'neutral' as const;
    }
  }

  // ── Profile flow ───────────────────────────────────────────────
  protected openProfile(p: Patient) {
    this.formSalutation = p.salutation ?? '';
    this.formFirstName  = p.first_name;
    this.formLastName   = p.last_name;
    this.formMobile     = p.mobile;
    this.formAltMobile  = p.alt_mobile ?? '';
    this.formEmail      = p.email ?? '';
    this.formBloodGroup = p.blood_group ?? '';
    this.formMarital    = p.marital_status ?? '';
    this.formAadhaar    = p.aadhaar_last4 ?? '';
    this.formAbha       = p.abha ?? '';
    this.profileOpen.set(true);
  }
  protected profileValid(): boolean {
    return this.formFirstName.trim().length > 0
      && this.formLastName.trim().length > 0
      && this.formMobile.trim().length >= 6;
  }
  protected async confirmProfile() {
    const d = this.detail();
    if (!d || !this.profileValid()) return;
    this.busy.set('profile');
    try {
      await this.svc.updatePatient(d.patient.id, {
        salutation: this.formSalutation || null,
        first_name: this.formFirstName.trim(),
        last_name:  this.formLastName.trim(),
        mobile:     this.formMobile.trim(),
        alt_mobile: this.formAltMobile.trim() || null,
        email:      this.formEmail.trim() || null,
        blood_group: this.formBloodGroup || null,
        marital_status: this.formMarital || null,
        aadhaar_last4: this.formAadhaar.trim() || null,
        abha:       this.formAbha.trim() || null,
      });
      this.toast.success('Profile updated');
      this.profileOpen.set(false);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Emergency flow ─────────────────────────────────────────────
  protected openEmergency(p: Patient) {
    this.emName     = p.emergency_contact_name ?? '';
    this.emPhone    = p.emergency_contact_phone ?? '';
    this.emRelation = p.emergency_contact_relation ?? '';
    this.emergencyOpen.set(true);
  }
  protected async confirmEmergency() {
    const d = this.detail();
    if (!d) return;
    this.busy.set('emergency');
    try {
      await this.svc.updatePatient(d.patient.id, {
        emergency_contact_name: this.emName.trim() || null,
        emergency_contact_phone: this.emPhone.trim() || null,
        emergency_contact_relation: this.emRelation.trim() || null,
      });
      this.toast.success('Emergency contact saved');
      this.emergencyOpen.set(false);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Allergy flow ───────────────────────────────────────────────
  protected openAddAllergy() {
    this.newAllergen = '';
    this.newSeverity = 'moderate';
    this.newReaction = '';
    this.allergyAddOpen.set(true);
  }
  protected cancelAddAllergy() { this.allergyAddOpen.set(false); }

  protected async confirmAddAllergy() {
    const d = this.detail();
    if (!d || !this.newAllergen.trim()) return;
    this.busy.set('allergy');
    try {
      await this.svc.addAllergy({
        patientId: d.patient.id,
        allergen: this.newAllergen.trim(),
        severity: this.newSeverity,
        reaction: this.newReaction,
      });
      this.toast.success('Allergy recorded');
      this.allergyAddOpen.set(false);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not add allergy', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async removeAllergy(id: string) {
    if (!confirm('Remove this allergy?')) return;
    this.busy.set(id);
    try {
      await this.svc.removeAllergy(id);
      this.toast.warn('Allergy removed');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not remove', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Insurance flow ─────────────────────────────────────────────
  protected openInsurance(p: InsurancePolicy | null) {
    this.insEditId.set(p?.id ?? null);
    this.insPayer       = p?.payer_name ?? '';
    this.insPolicyNo    = p?.policy_number ?? '';
    this.insGroupNo     = p?.group_number ?? '';
    this.insValidFrom   = p?.valid_from ?? '';
    this.insValidTo     = p?.valid_to ?? '';
    this.insSumRupees   = p ? p.sum_assured_cents / 100 : 0;
    this.insCopayPct    = p ? Number(p.copay_pct) : 0;
    this.insPrimary     = p?.is_primary ?? false;
    this.insStatus      = p?.status ?? 'active';
    this.insNotes       = p?.notes ?? '';
    this.insuranceOpen.set(true);
  }
  protected insValid(): boolean {
    return this.insPayer.trim().length > 0 && this.insPolicyNo.trim().length > 0;
  }
  protected async confirmInsurance() {
    const d = this.detail();
    if (!d || !this.insValid()) return;
    this.busy.set('insurance');
    try {
      const editId = this.insEditId();
      const patch = {
        payer_name: this.insPayer.trim(),
        policy_number: this.insPolicyNo.trim(),
        group_number: this.insGroupNo.trim() || null,
        valid_from: this.insValidFrom || null,
        valid_to:   this.insValidTo || null,
        sum_assured_cents: Math.round((this.insSumRupees || 0) * 100),
        copay_pct: this.insCopayPct || 0,
        is_primary: this.insPrimary,
        status: this.insStatus,
        notes: this.insNotes.trim() || null,
      };
      if (editId) {
        await this.svc.updateInsurance(editId, patch);
        this.toast.success('Policy updated');
      } else {
        await this.svc.addInsurance({ patient_id: d.patient.id, ...patch });
        this.toast.success('Policy added');
      }
      this.insuranceOpen.set(false);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save policy', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async removeInsurance(id: string) {
    if (!confirm('Remove this insurance policy? Only super_admin can permanently delete.')) return;
    this.busy.set(id);
    try {
      await this.svc.removeInsurance(id);
      this.toast.warn('Policy removed');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not remove', e instanceof Error ? e.message : 'Try again. (Note: only super_admin can delete.)');
    } finally {
      this.busy.set(null);
    }
  }

  protected async printIdCard(p: Patient): Promise<void> {
    try {
      await this.idCardSvc.generate({
        patient: {
          uhid: p.uhid,
          full_name: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          date_of_birth: p.date_of_birth,
          gender: p.gender,
          blood_group: p.blood_group,
          mobile: p.mobile,
          abha_id: (p as any).abha_id ?? null,
          emergency_contact: (p as any).emergency_contact ?? null,
        },
        hospital: {
          name: 'Sree Diagnostics',
          branch_label: this.branch.activeBranchName(),
        },
        qrPayload: p.uhid,
      });
    } catch (e) {
      this.toast.error('Could not generate ID card', e instanceof Error ? e.message : 'Try again.');
    }
  }
}
