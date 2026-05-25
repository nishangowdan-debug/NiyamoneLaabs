import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { StepperComponent, Step } from '../../../shared/ui/stepper/stepper.component';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { StaffService } from '../data/staff.service';
import { DepartmentsService } from '../../departments/data/departments.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { indiaMobileValidator } from '../../../shared/validators/india-mobile.validator';
import { BranchStore } from '../../../core/branches/branch.store';
import type { RoleSlug } from '../../../core/auth/auth.types';

interface RoleTile {
  slug: RoleSlug;
  label: string;
  icon: string;
}

const ROLE_TILES: RoleTile[] = [
  { slug: 'doctor',       label: 'Doctor',       icon: '\u{1FA7A}' },
  { slug: 'nurse',        label: 'Nurse',        icon: '\u{1F489}' },
  { slug: 'pharmacist',   label: 'Pharmacist',   icon: '\u{1F48A}' },
  { slug: 'lab_tech',     label: 'Lab Tech',     icon: '\u{1F52C}' },
  { slug: 'reception',    label: 'Reception',    icon: '\u{1F5A5}\uFE0F' },
  { slug: 'accountant',   label: 'Accountant',   icon: '\u{1F4CA}' },
  { slug: 'hr',           label: 'HR',           icon: '\u{1F465}' },
  { slug: 'housekeeping', label: 'Housekeeping', icon: '\u{1F9F9}' },
  { slug: 'security',     label: 'Security',     icon: '\u{1F6E1}\uFE0F' },
  { slug: 'fnb',          label: 'F&B',          icon: '\u{1F37D}\uFE0F' },
  { slug: 'driver',       label: 'Driver',       icon: '\u{1F691}' },
];

const SHIFT_OPTIONS = [
  { value: 'general',  label: 'General (9 AM \u2013 6 PM)' },
  { value: 'morning',  label: 'Morning (6 AM \u2013 2 PM)' },
  { value: 'evening',  label: 'Evening (2 PM \u2013 10 PM)' },
  { value: 'night',    label: 'Night (10 PM \u2013 6 AM)' },
  { value: 'rotating', label: 'Rotating' },
];

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Chandigarh','Puducherry','Jammu & Kashmir','Ladakh',
];

const PERMISSION_MODULES = [
  { key: 'patients',     label: 'Patients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'ehr',          label: 'Clinical / EHR' },
  { key: 'billing',      label: 'Billing' },
  { key: 'lab',          label: 'Lab' },
  { key: 'pharmacy',     label: 'Pharmacy' },
  { key: 'inventory',    label: 'Inventory' },
  { key: 'vendors',      label: 'Vendors' },
  { key: 'purchase',     label: 'Purchase' },
  { key: 'materials',    label: 'Materials' },
  { key: 'ap',           label: 'Accounts Payable' },
  { key: 'staff',        label: 'Staff' },
  { key: 'reports',      label: 'Reports' },
];

const ACCESS_ZONES = [
  'Main entrance', 'OPD', 'IPD wards', 'ICU', 'OT', 'Pharmacy store',
  'Lab', 'Server room', 'Admin block', 'Kitchen', 'Ambulance bay',
];

@Component({
  selector: 'app-staff-onboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, StepperComponent, AlertComponent],
  template: `
    <header class="flex items-center justify-between pb-4 mb-5 border-b border-border">
      <div>
        <a routerLink="/staff" class="text-[12px] text-primary-600 hover:underline font-medium">\u2190 Back to staff</a>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">
          Onboard New Staff
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Complete all steps to activate the new team member.</p>
      </div>
    </header>

    <app-stepper [steps]="wizardSteps" [current]="step()" />

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- Step 1: Personal info -->
    @if (step() === 0) {
      <section class="bg-surface-card border border-border rounded-[10px] p-6 max-w-3xl">
        <h2 class="text-[15px] font-semibold text-ink mb-4">Personal Information</h2>
        <form [formGroup]="personalForm" class="space-y-4">
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-3">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Salutation</label>
              <select formControlName="salutation" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">\u2014</option>
                <option value="Mr">Mr</option><option value="Mrs">Mrs</option>
                <option value="Ms">Ms</option><option value="Dr">Dr</option>
              </select>
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">First name</label>
              <input formControlName="firstName" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-5">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Last name</label>
              <input formControlName="lastName" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
          </div>

          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Date of birth</label>
              <input type="date" formControlName="dob" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Gender</label>
              <select formControlName="gender" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">Select\u2026</option>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Mobile</label>
              <input type="tel" formControlName="mobile" placeholder="+91 98765 43210" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
          </div>

          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-8">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</label>
              <input type="email" formControlName="email" placeholder="name@hospital.com" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Aadhaar (last 4)</label>
              <input formControlName="aadhaarLast4" maxlength="4" placeholder="XXXX" class="w-full h-10 px-3 text-sm font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Address</label>
            <input formControlName="addressLine1" placeholder="Line 1" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md mb-2 focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            <input formControlName="addressLine2" placeholder="Line 2 (optional)" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </div>

          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">City</label>
              <input formControlName="city" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">State</label>
              <select formControlName="state" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">Select\u2026</option>
                @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Pincode</label>
              <input formControlName="pincode" maxlength="6" class="w-full h-10 px-3 text-sm font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
          </div>

          <h3 class="text-[13px] font-semibold text-ink pt-3 border-t border-border">Emergency Contact</h3>
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name</label>
              <input formControlName="emergencyName" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Mobile</label>
              <input type="tel" formControlName="emergencyMobile" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Relation</label>
              <select formControlName="emergencyRelation" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">Select\u2026</option>
                <option value="spouse">Spouse</option><option value="parent">Parent</option>
                <option value="sibling">Sibling</option><option value="child">Child</option><option value="other">Other</option>
              </select>
            </div>
          </div>
        </form>
      </section>
    }

    <!-- Step 2: Role & Department -->
    @if (step() === 1) {
      <section class="bg-surface-card border border-border rounded-[10px] p-6 max-w-3xl">
        <h2 class="text-[15px] font-semibold text-ink mb-4">Role & Department</h2>
        <p class="text-[12px] text-ink-muted mb-4">Select the role this person will perform.</p>

        <!-- Role tiles -->
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-6">
          @for (r of roleTiles; track r.slug) {
            <button type="button" (click)="selectedRole.set(r.slug)"
                    [class]="roleTileCls(r.slug)">
              <span class="text-xl">{{ r.icon }}</span>
              <span class="text-[11px] font-medium mt-1">{{ r.label }}</span>
            </button>
          }
        </div>

        <form [formGroup]="roleForm" class="space-y-4">
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-12">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
                Branch / Head Office <span class="text-danger-fg">*</span>
              </label>
              <select formControlName="branchId"
                      class="w-full h-10 px-3 text-sm bg-surface-card border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [class.border-danger-fg]="roleForm.controls.branchId.touched && roleForm.controls.branchId.invalid"
                      [class.border-border]="!(roleForm.controls.branchId.touched && roleForm.controls.branchId.invalid)">
                <option value="">Select branch or HO\u2026</option>
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }} ({{ b.code }})</option>
                }
              </select>
              <p class="text-[11px] text-ink-muted mt-1">Determines billing scope, lab access, and reporting cohort. Cannot be left blank.</p>
            </div>
          </div>
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-6">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Department</label>
              <select formControlName="departmentId" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">Select department\u2026</option>
                @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
              </select>
            </div>
            <div class="col-span-6">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Shift pattern</label>
              <select formControlName="shift" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                @for (s of shiftOptions; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
              </select>
            </div>
          </div>
          <div class="grid grid-cols-12 gap-3">
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Joining date</label>
              <input type="date" formControlName="joiningDate" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Salary (\u20B9/month)</label>
              <input type="number" formControlName="salary" min="0" class="w-full h-10 px-3 text-sm font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="col-span-4">
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Employee ID preview</label>
              <p class="h-10 flex items-center px-3 text-sm font-mono text-ink-muted bg-surface-muted rounded-md border border-border">
                {{ employeeIdPreview() }}
              </p>
            </div>
          </div>
        </form>
      </section>
    }

    <!-- Step 3: Documents -->
    @if (step() === 2) {
      <section class="bg-surface-card border border-border rounded-[10px] p-6 max-w-3xl">
        <h2 class="text-[15px] font-semibold text-ink mb-4">Documents</h2>
        <p class="text-[12px] text-ink-muted mb-4">Upload required KYC and certifications. Files are stored securely.</p>

        <div class="space-y-3">
          @for (doc of documentSlots(); track doc.key) {
            <div class="flex items-center justify-between py-3 px-4 border border-border rounded-lg">
              <div>
                <p class="text-[13px] font-medium text-ink">{{ doc.label }}</p>
                <p class="text-[11px] text-ink-muted">{{ doc.required ? 'Required' : 'Optional' }} \u00b7 PDF or Image</p>
              </div>
              <div class="flex items-center gap-2">
                @if (uploadedDocs()[doc.key]) {
                  <span class="text-[11px] text-good-fg font-medium px-2 py-0.5 rounded bg-good-bg">Uploaded</span>
                  <button type="button" (click)="removeDoc(doc.key)" class="text-[11px] text-danger-fg hover:underline">Remove</button>
                } @else {
                  <label class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle cursor-pointer">
                    Upload
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="onFileSelect($event, doc.key)" class="hidden" />
                  </label>
                }
              </div>
            </div>
          }
        </div>
      </section>
    }

    <!-- Step 4: Access & Permissions -->
    @if (step() === 3) {
      <section class="bg-surface-card border border-border rounded-[10px] p-6 max-w-3xl">
        <h2 class="text-[15px] font-semibold text-ink mb-1">Access & Permissions</h2>
        <p class="text-[12px] text-ink-muted mb-4">Configure system module access and physical zones.</p>

        <h3 class="text-[13px] font-semibold text-ink mb-2">System Modules</h3>
        <div class="border border-border rounded-lg divide-y divide-border mb-6">
          @for (mod of permModules; track mod.key) {
            <div class="flex items-center justify-between px-4 py-2.5">
              <span class="text-[13px] text-ink">{{ mod.label }}</span>
              <div class="flex items-center gap-4">
                <label class="inline-flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer">
                  <input type="checkbox" [checked]="hasPermission(mod.key + '.read')" (change)="togglePermission(mod.key + '.read')"
                         class="w-3.5 h-3.5 rounded-sm" style="accent-color: var(--color-primary-600);" />
                  Read
                </label>
                <label class="inline-flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer">
                  <input type="checkbox" [checked]="hasPermission(mod.key + '.write')" (change)="togglePermission(mod.key + '.write')"
                         class="w-3.5 h-3.5 rounded-sm" style="accent-color: var(--color-primary-600);" />
                  Write
                </label>
              </div>
            </div>
          }
        </div>

        <h3 class="text-[13px] font-semibold text-ink mb-2">Physical Access Zones</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          @for (zone of accessZones; track zone) {
            <label class="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-[12px] text-ink cursor-pointer hover:bg-surface-subtle"
                   [class.border-primary-500]="hasZone(zone)" [class.bg-primary-50]="hasZone(zone)">
              <input type="checkbox" [checked]="hasZone(zone)" (change)="toggleZone(zone)"
                     class="w-3.5 h-3.5 rounded-sm" style="accent-color: var(--color-primary-600);" />
              {{ zone }}
            </label>
          }
        </div>
      </section>
    }

    <!-- Step 5: Review & Submit -->
    @if (step() === 4) {
      <section class="bg-surface-card border border-border rounded-[10px] p-6 max-w-3xl">
        <h2 class="text-[15px] font-semibold text-ink mb-4">Review & Submit</h2>

        <!-- Personal summary -->
        <div class="border border-border rounded-lg p-4 mb-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Personal</p>
          <div class="grid grid-cols-2 gap-y-2 text-[13px]">
            <span class="text-ink-muted">Name</span><span class="text-ink font-medium">{{ personalForm.value.salutation }} {{ personalForm.value.firstName }} {{ personalForm.value.lastName }}</span>
            <span class="text-ink-muted">Email</span><span class="text-ink">{{ personalForm.value.email }}</span>
            <span class="text-ink-muted">Mobile</span><span class="text-ink font-mono">{{ personalForm.value.mobile }}</span>
            <span class="text-ink-muted">City, State</span><span class="text-ink">{{ personalForm.value.city }}, {{ personalForm.value.state }}</span>
          </div>
        </div>

        <!-- Role summary -->
        <div class="border border-border rounded-lg p-4 mb-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Role & Department</p>
          <div class="grid grid-cols-2 gap-y-2 text-[13px]">
            <span class="text-ink-muted">Role</span><span class="text-ink font-medium capitalize">{{ selectedRole()?.replace('_', ' ') ?? '\u2014' }}</span>
            <span class="text-ink-muted">Branch / HO</span><span class="text-ink font-medium">{{ branchName() }}</span>
            <span class="text-ink-muted">Department</span><span class="text-ink">{{ departmentName() }}</span>
            <span class="text-ink-muted">Shift</span><span class="text-ink capitalize">{{ roleForm.value.shift }}</span>
            <span class="text-ink-muted">Joining</span><span class="text-ink">{{ roleForm.value.joiningDate }}</span>
            <span class="text-ink-muted">Employee ID</span><span class="text-ink font-mono">{{ employeeIdPreview() }}</span>
          </div>
        </div>

        <!-- Documents summary -->
        <div class="border border-border rounded-lg p-4 mb-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Documents</p>
          <div class="flex flex-wrap gap-2">
            @for (doc of documentSlots(); track doc.key) {
              <span [class]="uploadedDocs()[doc.key] ? 'inline-flex items-center h-6 px-2 rounded bg-good-bg text-good-fg text-[11px] font-medium' : 'inline-flex items-center h-6 px-2 rounded bg-surface-muted text-ink-muted text-[11px]'">
                {{ doc.label }} {{ uploadedDocs()[doc.key] ? '\u2713' : '\u2014' }}
              </span>
            }
          </div>
        </div>

        <!-- Permissions summary -->
        <div class="border border-border rounded-lg p-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Permissions ({{ permissions().length }})</p>
          <div class="flex flex-wrap gap-1">
            @for (p of permissions(); track p) {
              <span class="inline-flex items-center h-5 px-2 rounded-full bg-primary-50 text-primary-700 text-[10px] font-medium">{{ p }}</span>
            }
            @if (permissions().length === 0) {
              <span class="text-[11px] text-ink-muted">No permissions assigned</span>
            }
          </div>
        </div>
      </section>
    }

    <!-- Navigation buttons -->
    <div class="flex items-center justify-between mt-6 max-w-3xl">
      <button type="button" (click)="prev()" [disabled]="step() === 0"
              class="h-10 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed">
        \u2190 Previous
      </button>
      <div class="flex gap-2">
        @if (step() < 4) {
          <button type="button" (click)="next()"
                  class="h-10 px-5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card">
            Continue \u2192
          </button>
        } @else {
          <button type="button" (click)="submit()" [disabled]="submitting()"
                  class="h-10 px-5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card disabled:opacity-60">
            {{ submitting() ? 'Creating\u2026' : 'Create staff member' }}
          </button>
        }
      </div>
    </div>
  `,
})
export class StaffOnboardPage implements OnInit {
  private fb = inject(FormBuilder);
  private staffSvc = inject(StaffService);
  private deptSvc = inject(DepartmentsService);
  private branchStore = inject(BranchStore);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected readonly step = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly departments = signal<{ id: string; name: string }[]>([]);
  protected readonly selectedRole = signal<RoleSlug | null>(null);
  protected readonly permissions = signal<string[]>([]);
  protected readonly zones = signal<string[]>([]);
  protected readonly uploadedDocs = signal<Record<string, boolean>>({});
  /** Branches the caller is allowed to assign — sourced from BranchStore,
   *  which is already restricted by role on load. */
  protected readonly branches = this.branchStore.branches;

  protected readonly roleTiles = ROLE_TILES;
  protected readonly shiftOptions = SHIFT_OPTIONS;
  protected readonly states = INDIAN_STATES;
  protected readonly permModules = PERMISSION_MODULES;
  protected readonly accessZones = ACCESS_ZONES;

  protected readonly wizardSteps: Step[] = [
    { label: 'Personal', description: 'Name, contact, address' },
    { label: 'Role & Dept', description: 'Assignment & shift' },
    { label: 'Documents', description: 'KYC & certificates' },
    { label: 'Access', description: 'Permissions & zones' },
    { label: 'Review', description: 'Confirm & submit' },
  ];

  protected readonly personalForm = this.fb.nonNullable.group({
    salutation: [''],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    dob: ['', Validators.required],
    gender: ['', Validators.required],
    mobile: ['', [Validators.required, indiaMobileValidator]],
    email: ['', [Validators.required, Validators.email]],
    aadhaarLast4: [''],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    city: ['', Validators.required],
    state: ['', Validators.required],
    pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    emergencyName: ['', Validators.required],
    emergencyMobile: ['', Validators.required],
    emergencyRelation: ['', Validators.required],
  });

  protected readonly roleForm = this.fb.nonNullable.group({
    branchId: ['', Validators.required],
    departmentId: [''],
    shift: ['general'],
    joiningDate: [new Date().toISOString().split('T')[0]],
    salary: [0],
  });

  protected readonly branchName = computed(() => {
    const id = this.roleForm.value.branchId;
    const b = this.branches().find((x) => x.id === id);
    return b ? `${b.name} (${b.code})` : '—';
  });

  protected readonly employeeIdPreview = computed(() => {
    const role = this.selectedRole();
    if (!role) return 'NIY-???-0000';
    const prefix = role.slice(0, 3).toUpperCase();
    return `NIY-${prefix}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  });

  protected readonly departmentName = computed(() => {
    const id = this.roleForm.value.departmentId;
    const dept = this.departments().find((d) => d.id === id);
    return dept?.name ?? '\u2014';
  });

  protected readonly documentSlots = computed(() => {
    const role = this.selectedRole();
    const base = [
      { key: 'aadhaar', label: 'Aadhaar Card', required: true },
      { key: 'pan', label: 'PAN Card', required: true },
      { key: 'photo', label: 'Passport Photo', required: true },
      { key: 'medical', label: 'Medical Fitness Certificate', required: true },
    ];
    if (role === 'doctor' || role === 'nurse' || role === 'pharmacist') {
      base.push({ key: 'registration', label: 'Registration Certificate', required: true });
      base.push({ key: 'degree', label: 'Degree/Diploma', required: true });
    }
    if (role === 'driver') {
      base.push({ key: 'licence', label: 'Driving Licence', required: true });
    }
    base.push({ key: 'experience', label: 'Experience Letters', required: false });
    base.push({ key: 'police', label: 'Police Verification', required: false });
    return base;
  });

  ngOnInit() {
    void this.loadDepartments();
    // Branches are required for staff onboarding — make sure the dropdown is
    // populated even if the user lands here before any other screen loaded them.
    void this.branchStore.load();
  }

  private async loadDepartments() {
    try {
      const deps = await this.deptSvc.list();
      this.departments.set(deps.map((d) => ({ id: d.id, name: d.name })));
    } catch { /* ignore */ }
  }

  protected next() {
    this.error.set(null);
    if (this.step() === 0 && this.personalForm.invalid) {
      this.personalForm.markAllAsTouched();
      this.error.set('Please fill in all required personal fields.');
      return;
    }
    if (this.step() === 1) {
      if (!this.selectedRole()) {
        this.error.set('Please select a role.');
        return;
      }
      if (!this.roleForm.value.branchId) {
        this.roleForm.controls.branchId.markAsTouched();
        this.error.set('Branch / Head Office is required.');
        return;
      }
    }
    this.step.update((s) => Math.min(s + 1, 4));
  }

  protected prev() {
    this.error.set(null);
    this.step.update((s) => Math.max(s - 1, 0));
  }

  protected roleTileCls(slug: RoleSlug) {
    const base = 'flex flex-col items-center justify-center p-3 border rounded-lg transition-colors';
    return this.selectedRole() === slug
      ? `${base} border-primary-500 bg-primary-50 text-primary-800`
      : `${base} border-border hover:bg-surface-subtle text-ink-soft`;
  }

  protected onFileSelect(event: Event, key: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.uploadedDocs.update((docs) => ({ ...docs, [key]: true }));
      // In production, upload to Supabase Storage here
    }
  }

  protected removeDoc(key: string) {
    this.uploadedDocs.update((docs) => {
      const next = { ...docs };
      delete next[key];
      return next;
    });
  }

  protected hasPermission(perm: string): boolean {
    return this.permissions().includes(perm);
  }

  protected togglePermission(perm: string) {
    this.permissions.update((list) =>
      list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm],
    );
  }

  protected hasZone(zone: string): boolean {
    return this.zones().includes(zone);
  }

  protected toggleZone(zone: string) {
    this.zones.update((list) =>
      list.includes(zone) ? list.filter((z) => z !== zone) : [...list, zone],
    );
  }

  protected async submit() {
    this.error.set(null);
    this.submitting.set(true);
    try {
      const branchId = this.roleForm.value.branchId;
      if (!branchId) {
        this.error.set('Branch / Head Office is required.');
        this.step.set(1);
        this.roleForm.controls.branchId.markAsTouched();
        return;
      }
      const p = this.personalForm.getRawValue();
      const { staff, password } = await this.staffSvc.createStaff({
        full_name: `${p.firstName} ${p.lastName}`.trim(),
        email: p.email,
        role_slug: this.selectedRole()!,
        primary_branch_id: branchId,
        phone: p.mobile || null,
        joined_at: this.roleForm.value.joiningDate || null,
      });
      this.toast.success('Staff onboarded!', `Temp password: ${password}`);
      this.router.navigate(['/staff', staff.id]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to create staff record.');
    } finally {
      this.submitting.set(false);
    }
  }
}
