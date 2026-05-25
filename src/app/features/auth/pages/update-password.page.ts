import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { CardComponent } from '../../../shared/ui/card/card.component';
import { FieldComponent } from '../../../shared/ui/field/field.component';
import { PasswordInputComponent } from '../../../shared/ui/password-input/password-input.component';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { strongPasswordValidator } from '../../../shared/validators/strong-password.validator';
import { LoggerService } from '../../../core/logging/logger.service';

@Component({
  selector: 'app-update-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    FieldComponent,
    PasswordInputComponent,
    AlertComponent,
  ],
  template: `
    <div class="max-w-[520px]">
      <header class="mb-6">
        <h1 class="font-display text-2xl text-ink leading-tight">Account security</h1>
        <p class="text-sm text-ink-soft mt-1">
          Update the password for <strong>{{ email() }}</strong>.
        </p>
      </header>

      <app-card padding="lg">
        @if (serverError()) {
          <div class="mb-4">
            <app-alert tone="danger" title="Could not update password">{{ serverError() }}</app-alert>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
          <app-field
            label="Current password"
            [required]="true"
            [error]="currentError()"
          >
            <app-password-input
              placeholder="Enter current password"
              autocomplete="current-password"
              formControlName="current"
              [invalid]="!!currentError()"
            />
          </app-field>

          <app-field
            label="New password"
            [required]="true"
            hint="At least 12 characters with upper, lower, number, and symbol."
            [error]="passwordError()"
          >
            <app-password-input
              placeholder="••••••••••••"
              autocomplete="new-password"
              formControlName="password"
              [showStrength]="true"
              [invalid]="!!passwordError()"
            />
          </app-field>

          <app-field label="Confirm new password" [required]="true" [error]="confirmError()">
            <app-password-input
              placeholder="••••••••••••"
              autocomplete="new-password"
              formControlName="confirm"
              [invalid]="!!confirmError()"
            />
          </app-field>

          <div class="flex justify-end">
            <app-button type="submit" size="lg" [loading]="loading()">Update password</app-button>
          </div>
        </form>
      </app-card>
    </div>
  `,
})
export class UpdatePasswordPage {
  private fb = inject(FormBuilder);
  private authSvc = inject(AuthService);
  private store = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private logger = inject(LoggerService);

  protected readonly loading = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly email = () => this.store.user()?.email ?? '';

  protected readonly form = this.fb.nonNullable.group({
    current: ['', [Validators.required]],
    password: ['', [Validators.required, strongPasswordValidator]],
    confirm: ['', [Validators.required]],
  });

  protected readonly currentError = computed(() => {
    const c = this.form.controls.current;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Current password is required.';
    return '';
  });

  protected readonly passwordError = computed(() => {
    const c = this.form.controls.password;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'New password is required.';
    if (c.hasError('strongPassword')) return 'Password does not meet requirements.';
    if (this.form.controls.current.value === c.value && c.value) return 'New password must differ from current.';
    return '';
  });

  protected readonly confirmError = computed(() => {
    const c = this.form.controls.confirm;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Please confirm your password.';
    if (this.form.controls.password.value !== c.value) return 'Passwords do not match.';
    return '';
  });

  protected async submit() {
    this.serverError.set(null);
    if (this.form.invalid || this.confirmError() || this.passwordError()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { current, password } = this.form.getRawValue();
    const email = this.store.user()?.email ?? '';

    // Re-verify identity by signing in with current password.
    const verify = await this.authSvc.signIn(email, current);
    if (verify.error) {
      this.loading.set(false);
      this.serverError.set('Current password is incorrect.');
      return;
    }

    const { error } = await this.authSvc.updatePassword(password);
    this.loading.set(false);
    if (error) {
      this.logger.warn('update_password_failed', { code: error.status });
      this.serverError.set('Something went wrong. Please try again.');
      return;
    }
    this.toast.success('Password updated');
    this.form.reset();
    this.router.navigate(['/dashboard']);
  }
}
