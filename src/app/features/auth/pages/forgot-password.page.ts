import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthService } from '../../../core/auth/auth.service';
import { LoggerService } from '../../../core/logging/logger.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent],
  template: `
    <h1 class="font-display text-[32px] font-medium tracking-[-0.02em] text-ink leading-tight mb-1.5">
      Forgot password
    </h1>
    <p class="text-ink-muted text-sm mb-8">
      Enter your account email and we'll send you a link to reset your password.
    </p>

    @if (sent()) {
      <app-alert tone="good" title="Check your inbox">
        If an account exists for <strong>{{ submittedEmail() }}</strong>, we've sent a reset link.
        The link expires in 60 minutes.
      </app-alert>
      <a routerLink="/auth/login" class="mt-6 inline-flex text-[13px] text-primary-600 hover:underline font-medium">
        ← Back to sign in
      </a>
    } @else {
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mb-2">
          <label for="email" class="block text-[11px] uppercase tracking-[0.08em] text-ink-muted font-medium mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="username"
            inputmode="email"
            placeholder="you@hospital.com"
            [class]="inputCls(emailError())"
          />
          @if (emailError()) {
            <p class="text-2xs text-danger-fg mt-1.5">{{ emailError() }}</p>
          }
        </div>

        <button
          type="submit"
          [disabled]="loading()"
          class="w-full mt-6 h-11 rounded-md bg-primary-600 hover:bg-primary-500 text-white font-medium text-[13px]
                 inline-flex items-center justify-center gap-2 transition-colors
                 disabled:opacity-60 disabled:cursor-not-allowed shadow-card"
        >
          @if (loading()) {
            <span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
            Sending…
          } @else {
            Send reset link
          }
        </button>

        <a routerLink="/auth/login" class="mt-5 block text-[13px] text-primary-600 hover:underline font-medium text-center">
          ← Back to sign in
        </a>
      </form>
    }
  `,
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private logger = inject(LoggerService);

  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly submittedEmail = signal('');

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly emailError = computed(() => {
    const c = this.form.controls.email;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Email is required.';
    if (c.hasError('email')) return 'Enter a valid email address.';
    return '';
  });

  protected inputCls(hasError: string): string {
    const base =
      'w-full h-10 px-3 text-sm bg-surface-card text-ink border rounded-md ' +
      'placeholder:text-ink-faint transition-colors ' +
      'focus:outline-none focus:border-primary-600 ' +
      'focus:ring-[3px] focus:ring-primary-100';
    return hasError
      ? `${base} border-danger-fg/60 focus:border-danger-fg focus:ring-danger-bg`
      : `${base} border-border`;
  }

  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { email } = this.form.getRawValue();
    const redirectTo = `${window.location.origin}/auth/reset`;
    const { error } = await this.auth.forgotPassword(email, redirectTo);
    this.loading.set(false);
    if (error) {
      this.logger.warn('forgot_password_failed', { code: error.status });
    }
    // Always show success — never leak whether the email exists.
    this.submittedEmail.set(email);
    this.sent.set(true);
  }
}
