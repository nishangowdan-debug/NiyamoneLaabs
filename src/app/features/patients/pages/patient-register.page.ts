import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { CardComponent } from '../../../shared/ui/card/card.component';
import { FieldComponent } from '../../../shared/ui/field/field.component';
import { InputComponent } from '../../../shared/ui/input/input.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { TextareaComponent } from '../../../shared/ui/textarea/textarea.component';
import { StepperComponent } from '../../../shared/ui/stepper/stepper.component';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AuthStore } from '../../../core/auth/auth.store';
import {
  indiaMobileValidator,
  normaliseMobile,
  pincodeValidator,
} from '../../../shared/validators/india-mobile.validator';
import { PatientsService } from '../data/patients.service';
import type { Patient } from '../data/patients.types';

/** Group-level validator: one of `age` / `date_of_birth` must be supplied.
 *  Per-field pattern validation still runs separately, so the user gets a
 *  precise "Use YYYY-MM-DD" instead of a generic "missing" if they typo'd
 *  the date. */
function ageOrDobValidator(group: AbstractControl): ValidationErrors | null {
  const age = (group.get('age')?.value ?? '').toString().trim();
  const dob = (group.get('date_of_birth')?.value ?? '').toString().trim();
  return age || dob ? null : { ageOrDobRequired: true };
}

@Component({
  selector: 'app-patient-register-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    CardComponent,
    FieldComponent,
    InputComponent,
    SelectComponent,
    TextareaComponent,
    StepperComponent,
    AlertComponent,
  ],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <a routerLink="/patients" class="text-[12px] text-primary-600 hover:underline font-medium">← Back to patients</a>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">
          Register a new patient
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Step {{ step() + 1 }} of 4</p>
      </div>
    </header>

    <app-stepper [steps]="steps" [current]="step()" />

    @switch (step()) {
      @case (0) {
        <app-card padding="lg" title="Find existing record" subtitle="Avoid duplicates by searching mobile first">
          <form [formGroup]="searchForm" (ngSubmit)="searchExisting()" class="flex items-end gap-3">
            <app-field label="Mobile number" [required]="true" hint="10-digit Indian mobile" [error]="searchMobileError()" class="flex-1">
              <app-input
                type="tel"
                placeholder="98765 43210"
                inputmode="numeric"
                autocomplete="tel"
                formControlName="mobile"
                [invalid]="!!searchMobileError()"
              />
            </app-field>
            <app-button type="submit" size="lg" [loading]="searching()">Search</app-button>
            <app-button type="button" variant="ghost" size="lg" (click)="skipSearch()">Skip</app-button>
          </form>

          @if (duplicates().length > 0) {
            <div class="mt-5">
              <app-alert tone="warn" title="{{ duplicates().length }} existing patient(s) with this mobile">
                Confirm whether this is one of them before continuing.
              </app-alert>
              <ul class="mt-3 divide-y divide-border border border-border rounded-md overflow-hidden">
                @for (p of duplicates(); track p.id) {
                  <li class="flex items-center justify-between px-4 py-3 bg-surface-card">
                    <div>
                      <p class="text-sm font-medium text-ink">{{ p.full_name }}</p>
                      <p class="text-2xs font-mono text-ink-muted">{{ p.uhid }} · {{ p.mobile }}</p>
                    </div>
                    <a [routerLink]="['/patients', p.id]" class="text-xs text-primary-600 hover:text-primary-700 font-medium">Open chart →</a>
                  </li>
                }
              </ul>
              <div class="mt-4 flex gap-2">
                <app-button (click)="step.set(1)">Continue with new record</app-button>
                <a routerLink=".."><app-button variant="secondary">Cancel</app-button></a>
              </div>
            </div>
          } @else if (searchTried()) {
            <div class="mt-5">
              <app-alert tone="good" title="No duplicates found">You can register this person as a new patient.</app-alert>
              <div class="mt-4 flex gap-2">
                <app-button (click)="step.set(1)">Continue</app-button>
                <a routerLink=".."><app-button variant="secondary">Cancel</app-button></a>
              </div>
            </div>
          }
        </app-card>
      }

      @case (1) {
        <app-card padding="lg" title="Demographics" subtitle="All fields with * are required">
          <form [formGroup]="patientForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <app-field label="Salutation" class="md:col-span-1">
              <app-select [options]="salutationOpts" placeholder="—" formControlName="salutation" />
            </app-field>
            <div class="hidden md:block"></div>

            <app-field label="First name" [required]="true" [error]="err('first_name')">
              <app-input formControlName="first_name" placeholder="First name" autocomplete="given-name" [invalid]="!!err('first_name')" />
            </app-field>
            <app-field label="Last name" [required]="true" [error]="err('last_name')">
              <app-input formControlName="last_name" placeholder="Last name" autocomplete="family-name" [invalid]="!!err('last_name')" />
            </app-field>

            <app-field [label]="ageDobLabel()" [required]="true" [error]="ageDobError()">
              <div class="grid grid-cols-[1fr_auto_2fr] items-center gap-2">
                <app-input type="text" inputmode="numeric" placeholder="e.g. 40"
                           formControlName="age"
                           [invalid]="!!ageDobError() && !patientForm.controls.age.value && !patientForm.controls.date_of_birth.value" />
                <span class="text-[11px] uppercase tracking-wide text-ink-muted px-1">or</span>
                <app-input type="text" inputmode="numeric" placeholder="YYYY-MM-DD"
                           formControlName="date_of_birth"
                           [invalid]="!!ageDobError() && !patientForm.controls.age.value && !patientForm.controls.date_of_birth.value" />
              </div>
              <p class="text-[11px] text-ink-muted mt-1">
                Enter age in years if the exact birth date isn't known — we'll record an approximate DOB.
              </p>
            </app-field>
            <app-field label="Gender" [required]="true" [error]="err('gender')">
              <app-select [options]="genderOpts" placeholder="Select" formControlName="gender" [invalid]="!!err('gender')" />
            </app-field>

            <app-field label="Mobile" [required]="true" [error]="err('mobile')">
              <app-input type="tel" inputmode="numeric" placeholder="98765 43210" autocomplete="tel" formControlName="mobile" [invalid]="!!err('mobile')" />
            </app-field>
            <app-field label="Email" [error]="err('email')">
              <app-input type="email" placeholder="optional@example.com" inputmode="email" autocomplete="email" formControlName="email" [invalid]="!!err('email')" />
            </app-field>

            <app-field label="Blood group">
              <app-select [options]="bloodOpts" placeholder="—" formControlName="blood_group" />
            </app-field>
            <app-field label="Marital status">
              <app-select [options]="maritalOpts" placeholder="—" formControlName="marital_status" />
            </app-field>

            <app-field label="Aadhaar (last 4)" hint="For ID match — never store full number" [error]="err('aadhaar_last4')">
              <app-input formControlName="aadhaar_last4" inputmode="numeric" placeholder="0000" [invalid]="!!err('aadhaar_last4')" />
            </app-field>
            <app-field label="ABHA ID">
              <app-input formControlName="abha" placeholder="14-digit ABHA" />
            </app-field>

            <app-field label="Emergency contact name" class="md:col-span-1">
              <app-input formControlName="emergency_contact_name" />
            </app-field>
            <app-field label="Emergency contact phone" [error]="err('emergency_contact_phone')">
              <app-input type="tel" inputmode="numeric" formControlName="emergency_contact_phone" [invalid]="!!err('emergency_contact_phone')" />
            </app-field>

            <app-field label="Emergency contact relation">
              <app-input formControlName="emergency_contact_relation" placeholder="Spouse / Parent / Child" />
            </app-field>
            <app-field label="Referred by">
              <app-select [options]="referralOpts" placeholder="—" formControlName="referred_by" />
            </app-field>

            <app-field label="Notes" class="md:col-span-2">
              <app-textarea formControlName="notes" placeholder="Allergies, conditions, special preferences…" [rows]="3" />
            </app-field>
          </form>

          <hr class="my-6 border-border">

          <h3 class="font-display text-md text-ink mb-3">Address</h3>
          <form [formGroup]="addressForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <app-field label="Address line 1" class="md:col-span-2">
              <app-input formControlName="line1" autocomplete="address-line1" />
            </app-field>
            <app-field label="Address line 2" class="md:col-span-2">
              <app-input formControlName="line2" autocomplete="address-line2" />
            </app-field>
            <app-field label="City">
              <app-input formControlName="city" autocomplete="address-level2" />
            </app-field>
            <app-field label="State">
              <app-input formControlName="state" autocomplete="address-level1" />
            </app-field>
            <app-field label="PIN code" [error]="addrErr('pincode')">
              <app-input formControlName="pincode" inputmode="numeric" placeholder="6-digit" [invalid]="!!addrErr('pincode')" />
            </app-field>
          </form>

          <div class="mt-6 flex justify-between">
            <app-button variant="secondary" (click)="step.set(0)">← Back</app-button>
            <app-button (click)="reviewStep()">Review →</app-button>
          </div>
        </app-card>
      }

      @case (2) {
        <app-card padding="lg" title="Review & confirm" subtitle="Double-check before creating the record">
          @if (serverError()) {
            <div class="mb-4">
              <app-alert tone="danger" title="Could not save">{{ serverError() }}</app-alert>
            </div>
          }

          <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Name</dt><dd class="text-ink mt-0.5">{{ summary().fullName }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">DOB / Gender</dt><dd class="text-ink mt-0.5">{{ summary().dobGender }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Mobile</dt><dd class="font-mono text-ink mt-0.5">{{ summary().mobile }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Email</dt><dd class="text-ink mt-0.5">{{ summary().email || '—' }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Blood group</dt><dd class="text-ink mt-0.5">{{ summary().bloodGroup || '—' }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Address</dt><dd class="text-ink mt-0.5">{{ summary().address || '—' }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Emergency</dt><dd class="text-ink mt-0.5">{{ summary().emergency || '—' }}</dd></div>
            <div><dt class="text-2xs uppercase tracking-wide text-ink-muted">Referred by</dt><dd class="text-ink mt-0.5">{{ summary().referredBy || '—' }}</dd></div>
          </dl>

          <div class="mt-6 flex justify-between">
            <app-button variant="secondary" (click)="step.set(1)">← Back</app-button>
            <app-button (click)="confirm()" [loading]="saving()">Create patient</app-button>
          </div>
        </app-card>
      }

      @case (3) {
        <app-card padding="lg">
          <div class="text-center py-6">
            <div class="inline-grid place-items-center size-12 rounded-full bg-good-bg text-good-fg mb-4">
              <svg class="size-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>
            </div>
            <h2 class="font-display text-xl text-ink">Patient registered</h2>
            <p class="text-sm text-ink-soft mt-1">UHID has been generated and a record is now in the master list.</p>
            @if (created()) {
              <div class="mt-4 inline-block bg-surface-page border border-border rounded-md px-4 py-3 text-left">
                <p class="text-2xs uppercase tracking-wide text-ink-muted">UHID</p>
                <p class="font-mono text-lg text-ink">{{ created()!.uhid }}</p>
              </div>
            }
          </div>
          <div class="mt-2 flex justify-center gap-2">
            <a [routerLink]="['/patients', created()?.id]"><app-button>Open chart</app-button></a>
            <a routerLink=".."><app-button variant="secondary">Back to patients</app-button></a>
          </div>
        </app-card>
      }
    }
  `,
})
export class PatientRegisterPage {
  private fb = inject(FormBuilder);
  private svc = inject(PatientsService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected readonly steps = [
    { label: 'Search', description: 'Avoid duplicates' },
    { label: 'Demographics', description: 'Patient details' },
    { label: 'Review', description: 'Confirm & save' },
    { label: 'Done', description: 'Print & open chart' },
  ];

  protected readonly step = signal(0);
  protected readonly saving = signal(false);
  protected readonly searching = signal(false);
  protected readonly searchTried = signal(false);
  protected readonly duplicates = signal<Patient[]>([]);
  protected readonly serverError = signal<string | null>(null);
  protected readonly created = signal<Patient | null>(null);

  protected readonly searchForm = this.fb.nonNullable.group({
    mobile: ['', [Validators.required, indiaMobileValidator]],
  });

  protected readonly patientForm = this.fb.nonNullable.group({
    salutation: this.fb.control<'' | 'Mr' | 'Ms' | 'Mrs' | 'Dr' | 'Master'>('', { nonNullable: true }),
    first_name: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(60)]],
    last_name: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(60)]],
    // Either age OR date_of_birth must be present — enforced by the
    // ageOrDobValidator on the parent group below.
    age: ['', [Validators.pattern(/^\d{1,3}$/)]],
    date_of_birth: ['', [Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    // Default to 'male' to match the visible select value. Previously this was
    // '' but most browsers render the first non-placeholder option ("Male"),
    // so the visible value didn't match the form model — users had to switch
    // Female → Male before validation passed.
    gender: this.fb.control<'' | 'male' | 'female' | 'other'>('male', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    mobile: ['', [Validators.required, indiaMobileValidator]],
    email: ['', [Validators.email]],
    blood_group: this.fb.control<'' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'>('', { nonNullable: true }),
    marital_status: this.fb.control<'' | 'single' | 'married' | 'widowed' | 'divorced' | 'other'>('', { nonNullable: true }),
    aadhaar_last4: ['', [Validators.pattern(/^\d{4}$/)]],
    abha: [''],
    emergency_contact_name: [''],
    emergency_contact_phone: ['', [indiaMobileValidator]],
    emergency_contact_relation: [''],
    referred_by: [''],
    notes: [''],
  }, { validators: [ageOrDobValidator] });

  protected readonly addressForm = this.fb.nonNullable.group({
    line1: [''],
    line2: [''],
    city: [''],
    state: [''],
    pincode: ['', [pincodeValidator]],
  });

  protected readonly salutationOpts = [
    { value: 'Mr', label: 'Mr' }, { value: 'Ms', label: 'Ms' }, { value: 'Mrs', label: 'Mrs' },
    { value: 'Dr', label: 'Dr' }, { value: 'Master', label: 'Master' },
  ];
  protected readonly genderOpts = [
    { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' },
  ];
  protected readonly bloodOpts = [
    { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A−' },
    { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B−' },
    { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB−' },
    { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O−' },
  ];
  protected readonly maritalOpts = [
    { value: 'single', label: 'Single' }, { value: 'married', label: 'Married' },
    { value: 'widowed', label: 'Widowed' }, { value: 'divorced', label: 'Divorced' },
    { value: 'other', label: 'Other' },
  ];
  protected readonly referralOpts = [
    { value: 'walk_in', label: 'Walk-in' }, { value: 'web', label: 'Web booking' },
    { value: 'doctor', label: 'External doctor' }, { value: 'family', label: 'Friend / family' },
  ];

  protected readonly searchMobileError = computed(() => {
    const c = this.searchForm.controls.mobile;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Mobile number is required.';
    if (c.hasError('indiaMobile')) return 'Enter a valid 10-digit Indian mobile.';
    return '';
  });

  protected err(name: keyof typeof this.patientForm.controls): string {
    const c = this.patientForm.controls[name];
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Required.';
    if (c.hasError('email')) return 'Enter a valid email.';
    if (c.hasError('pattern')) {
      if (name === 'date_of_birth') return 'Use YYYY-MM-DD.';
      if (name === 'age') return 'Age in years (0–130).';
      if (name === 'aadhaar_last4') return 'Enter 4 digits.';
      return 'Invalid format.';
    }
    if (c.hasError('indiaMobile')) return 'Enter a valid 10-digit Indian mobile.';
    return '';
  }

  /** Label flips to reflect which side the user just typed into. */
  protected readonly ageDobLabel = computed(() => {
    const age = this.patientForm.controls.age.value;
    const dob = this.patientForm.controls.date_of_birth.value;
    if (age && !dob) return 'Age';
    if (dob && !age) return 'Date of birth';
    return 'Age  or  Date of birth';
  });

  /** Surface the group-level "one of them required" error + per-field pattern errors. */
  protected ageDobError(): string {
    const ageCtrl = this.patientForm.controls.age;
    const dobCtrl = this.patientForm.controls.date_of_birth;
    if (ageCtrl.touched && ageCtrl.hasError('pattern')) return 'Age in years (0–130).';
    if (dobCtrl.touched && dobCtrl.hasError('pattern')) return 'Use YYYY-MM-DD.';
    const formTouched = ageCtrl.touched || dobCtrl.touched || this.patientForm.touched;
    if (formTouched && this.patientForm.hasError('ageOrDobRequired')) {
      return 'Enter either age or date of birth.';
    }
    return '';
  }

  /** Convert age (years) → an approximate DOB. Uses 1-July of the implied year
   *  so the calendar age stays correct year-round (no boundary flip on Jan 1). */
  private ageToDob(years: number): string {
    const yyyy = new Date().getFullYear() - Math.max(0, Math.min(130, Math.floor(years)));
    return `${yyyy}-07-01`;
  }

  /** Returns the DOB the form will persist — either the typed YYYY-MM-DD or the
   *  one derived from `age`. Empty string when neither is valid. */
  private resolvedDob(): string {
    const v = this.patientForm.getRawValue();
    if (v.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(v.date_of_birth)) return v.date_of_birth;
    if (v.age && /^\d{1,3}$/.test(v.age)) return this.ageToDob(Number(v.age));
    return '';
  }

  protected addrErr(name: keyof typeof this.addressForm.controls): string {
    const c = this.addressForm.controls[name];
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('pincode')) return 'Enter a valid 6-digit PIN.';
    return '';
  }

  async searchExisting() {
    this.searchTried.set(false);
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }
    this.searching.set(true);
    try {
      const mobile = normaliseMobile(this.searchForm.controls.mobile.value);
      const matches = await this.svc.findByMobile(mobile);
      this.duplicates.set(matches);
      this.searchTried.set(true);
      // Pre-fill into demographics step
      this.patientForm.patchValue({ mobile });
    } catch (e) {
      this.toast.error('Search failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.searching.set(false);
    }
  }

  skipSearch() {
    this.duplicates.set([]);
    this.step.set(1);
  }

  protected reviewStep() {
    if (this.patientForm.invalid || this.addressForm.invalid) {
      this.patientForm.markAllAsTouched();
      this.addressForm.markAllAsTouched();
      this.toast.warn('Form incomplete', 'Fix the highlighted fields before continuing.');
      return;
    }
    this.step.set(2);
  }

  protected readonly summary = computed(() => {
    const v = this.patientForm.getRawValue();
    const a = this.addressForm.getRawValue();
    const fullName = [v.salutation, v.first_name, v.last_name].filter(Boolean).join(' ');
    const dob = this.resolvedDob();
    const derived = !v.date_of_birth && v.age ? ' (from age)' : '';
    const dobGender = `${dob || '—'}${derived} · ${v.gender}`;
    const address = [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
    const emergency = v.emergency_contact_name
      ? `${v.emergency_contact_name} (${v.emergency_contact_relation || 'contact'}) · ${v.emergency_contact_phone || ''}`.trim()
      : '';
    return {
      fullName, dobGender,
      mobile: v.mobile, email: v.email, bloodGroup: v.blood_group,
      address, emergency, referredBy: v.referred_by,
    };
  });

  async confirm() {
    this.serverError.set(null);
    const branchId = this.auth.claims().branch_id;
    if (!branchId) {
      this.serverError.set('No branch in your session. Sign out and back in.');
      return;
    }
    this.saving.set(true);
    try {
      const v = this.patientForm.getRawValue();
      const a = this.addressForm.getRawValue();
      const created = await this.svc.create({
        patient: {
          salutation: v.salutation || null,
          first_name: v.first_name,
          last_name: v.last_name,
          date_of_birth: this.resolvedDob(),
          gender: v.gender || 'other',
          blood_group: v.blood_group || null,
          marital_status: v.marital_status || null,
          mobile: normaliseMobile(v.mobile),
          email: v.email || null,
          aadhaar_last4: v.aadhaar_last4 || null,
          abha: v.abha || null,
          emergency_contact_name: v.emergency_contact_name || null,
          emergency_contact_phone: v.emergency_contact_phone ? normaliseMobile(v.emergency_contact_phone) : null,
          emergency_contact_relation: v.emergency_contact_relation || null,
          referred_by: v.referred_by || null,
          notes: v.notes || null,
        },
        branchId,
        createdByStaffId: this.auth.staffId(),
        address: a.line1 ? {
          line1: a.line1,
          line2: a.line2 || null,
          city: a.city,
          state: a.state,
          pincode: a.pincode || null,
          country: 'IN',
          is_primary: true,
        } : undefined,
      });
      this.created.set(created);
      this.toast.success('Patient registered', created.uhid);
      this.step.set(3);
    } catch (e: unknown) {
      this.serverError.set(this.errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** Surface real Postgres / PostgREST errors — they aren't Error instances. */
  private errorMessage(e: unknown): string {
    if (e == null) return 'Could not save the patient.';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const o = e as any;
    const parts = [o?.message, o?.details, o?.hint, o?.code]
      .filter((s) => typeof s === 'string' && s.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
    try { return JSON.stringify(e); } catch { return String(e); }
  }
}
