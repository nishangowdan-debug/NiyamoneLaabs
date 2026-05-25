import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthService } from '../../../core/auth/auth.service';
import { LoggerService } from '../../../core/logging/logger.service';
import {
  passwordStrengthLabel,
  strongPasswordValidator,
} from '../../../shared/validators/strong-password.validator';
import { ToastService } from '../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent],
  template: `
    <h1 class="font-display text-[32px] font-medium tracking-[-0.02em] text-ink leading-tight mb-1.5">
      Set a new password
    </h1>
    <p class="text-ink-muted text-sm mb-8">Choose a strong password you don't use elsewhere.</p>

    @if (linkError()) {
      <app-alert tone="danger" title="This link is invalid or has expired">
        Request a new password reset email to continue.
      </app-alert>
      <a routerLink="/auth/forgot-password" class="mt-6 inline-flex text-[13px] text-primary-600 hover:underline font-medium">
        ← Request a new link
      </a>
    } @else {
      @if (serverError()) {
        <div class="mb-5">
          <app-alert tone="danger" title="Could not update password">{{ serverError() }}</app-alert>
        </div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>

        <div class="mb-4">
          <label class="block text-[11px] uppercase tracking-[0.08em] text-ink-muted font-medium mb-1.5">
            New password
          </label>
          <div class="relative">
            <input
              [type]="reveal() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="new-password"
              placeholder="••••••••••••"
              [class]="inputCls(passwordError()) + ' pr-16 font-mono'"
            />
            <button
              type="button"
              (click)="reveal.set(!reveal())"
              class="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-ink-muted hover:text-ink rounded"
            >{{ reveal() ? 'Hide' : 'Show' }}</button>
          </div>
          @if (passwordValue().length > 0) {
            <div class="mt-2 flex items-center gap-2">
              <div class="flex-1 grid grid-cols-4 gap-1">
                @for (i of [0,1,2,3]; track i) {
                  <div
                    class="h-1 rounded-full"
                    [class.bg-surface-muted]="strength().score <= i"
                    [class.bg-danger-fg]="strength().score === i + 1 && i === 0"
                    [class.bg-warn-fg]="strength().score === i + 1 && i === 1"
                    [class.bg-info-fg]="strength().score === i + 1 && i === 2"
                    [class.bg-good-fg]="strength().score >= i + 1 && i === 3"
                  ></div>
                }
              </div>
              <span class="text-2xs text-ink-muted w-16 text-right">{{ strength().label }}</span>
            </div>
          }
          <p class="text-2xs text-ink-muted mt-1.5">
            At least 12 characters with upper, lower, number, and symbol.
          </p>
          @if (passwordError()) {
            <p class="text-2xs text-danger-fg mt-1.5">{{ passwordError() }}</p>
          }
        </div>

        <div class="mb-2">
          <label class="block text-[11px] uppercase tracking-[0.08em] text-ink-muted font-medium mb-1.5">
            Confirm new password
          </label>
          <input
            [type]="reveal() ? 'text' : 'password'"
            formControlName="confirm"
            autocomplete="new-password"
            placeholder="••••••••••••"
            [class]="inputCls(confirmError()) + ' font-mono'"
          />
          @if (confirmError()) {
            <p class="text-2xs text-danger-fg mt-1.5">{{ confirmError() }}</p>
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
            Updating…
          } @else {
            Update password
          }
        </button>
      </form>
    }
  `,
})
export class ResetPasswordPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private logger = inject(LoggerService);

  protected readonly loading = signal(false);
  protected readonly linkError = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly reveal = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, strongPasswordValidator]],
    confirm: ['', [Validators.required]],
  });

  protected readonly passwordValue = computed(() => this.form.controls.password.value || '');
  protected readonly strength = computed(() => passwordStrengthLabel(this.passwordValue()));

  protected readonly passwordError = computed(() => {
    const c = this.form.controls.password;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Password is required.';
    if (c.hasError('strongPassword')) return 'Password does not meet requirements.';
    return '';
  });

  protected readonly confirmError = computed(() => {
    const c = this.form.controls.confirm;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Please confirm your password.';
    if (this.form.controls.password.value !== c.value) return 'Passwords do not match.';
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

  async ngOnInit() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      this.linkError.set(true);
      return;
    }
    const { error } = await this.auth.exchangeCodeForSession(code);
    if (error) {
      this.logger.warn('reset_exchange_failed', { code: error.status });
      this.linkError.set(true);
    }
  }

  protected async submit() {
    this.serverError.set(null);
    if (this.form.invalid || this.confirmError()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { password } = this.form.getRawValue();
    const { error } = await this.auth.updatePassword(password);
    this.loading.set(false);
    if (error) {
      this.logger.warn('reset_update_failed', { code: error.status });
      this.serverError.set('Something went wrong. Please request a new reset link.');
      return;
    }
    this.toast.success('Password updated', 'You are now signed in.');
    this.router.navigate(['/dashboard']);
  }
}
