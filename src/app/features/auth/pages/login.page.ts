import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { LoggerService } from '../../../core/logging/logger.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent],
  template: `
    <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-primary-600 mb-3 inline-flex items-center gap-2">
      <span class="w-[5px] h-[5px] rounded-full bg-primary-600 inline-block"></span>
      Sree Diagnostics Healthcare Suite
    </p>
    <h1 class="font-display text-[36px] font-light tracking-[-0.02em] text-ink leading-[1] mb-2">
      Welcome <em class="italic font-normal" style="color:#2db8c4;">back.</em>
    </h1>
    <p class="text-ink-muted text-sm mb-8">Sign in to continue to your dashboard.</p>

    @if (banner()) {
      <div class="mb-5">
        <app-alert [tone]="banner()!.tone" [title]="banner()!.title">
          {{ banner()!.message }}
        </app-alert>
      </div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>

      <!-- Email -->
      <div class="mb-4">
        <label for="email" class="block text-[11px] uppercase tracking-[0.08em] text-ink-muted font-medium mb-1.5">
          Email
        </label>
        <input
          id="email"
          type="email"
          formControlName="email"
          autocomplete="email"
          inputmode="email"
          placeholder="you@hospital.com"
          [class]="inputCls(emailError())"
        />
        @if (emailError()) {
          <p class="text-2xs text-danger-fg mt-1.5">{{ emailError() }}</p>
        }
      </div>

      <!-- Password -->
      <div class="mb-2">
        <label for="password" class="block text-[11px] uppercase tracking-[0.08em] text-ink-muted font-medium mb-1.5">
          Password
        </label>
        <div class="relative">
          <input
            id="password"
            [type]="reveal() ? 'text' : 'password'"
            formControlName="password"
            autocomplete="current-password"
            placeholder="••••••••••••"
            [class]="inputCls(passwordError()) + ' pr-16 font-mono'"
          />
          <button
            type="button"
            (click)="reveal.set(!reveal())"
            class="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-ink-muted hover:text-ink rounded"
            [attr.aria-label]="reveal() ? 'Hide password' : 'Show password'"
          >
            {{ reveal() ? 'Hide' : 'Show' }}
          </button>
        </div>
        @if (passwordError()) {
          <p class="text-2xs text-danger-fg mt-1.5">{{ passwordError() }}</p>
        }
      </div>

      <!-- Actions row -->
      <div class="flex items-center justify-between mt-2">
        <label class="inline-flex items-center gap-2 text-[13px] text-ink-soft cursor-pointer">
          <input
            type="checkbox"
            formControlName="remember"
            class="w-3.5 h-3.5 rounded-sm"
            style="accent-color: var(--color-primary-600);"
          />
          Trust this device for 30 days
        </label>
        <a routerLink="/auth/forgot-password" class="text-[13px] text-primary-600 hover:underline font-medium">
          Forgot?
        </a>
      </div>

      <!-- Block primary -->
      <button
        type="submit"
        [disabled]="loading()"
        class="w-full mt-6 h-11 rounded-md bg-primary-600 hover:bg-primary-500 text-white font-medium text-[13px]
               inline-flex items-center justify-center gap-2 transition-colors
               disabled:opacity-60 disabled:cursor-not-allowed shadow-card"
      >
        @if (loading()) {
          <span class="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
          Signing in…
        } @else {
          Continue
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        }
      </button>
    </form>

    <!-- SSO divider -->
    <div class="flex items-center gap-3 my-6">
      <div class="flex-1 h-px bg-border"></div>
      <span class="text-[11px] text-ink-muted uppercase tracking-[0.06em]">Or continue with</span>
      <div class="flex-1 h-px bg-border"></div>
    </div>

    <!-- SSO buttons -->
    <div class="flex gap-2">
      <button type="button" (click)="ssoLogin('google')"
        class="flex-1 h-[38px] inline-flex items-center justify-center gap-2 border border-border rounded-md bg-surface-card text-[12px] font-medium text-ink-soft hover:bg-surface-subtle transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Google
      </button>
      <button type="button" (click)="ssoLogin('azure')"
        class="flex-1 h-[38px] inline-flex items-center justify-center gap-2 border border-border rounded-md bg-surface-card text-[12px] font-medium text-ink-soft hover:bg-surface-subtle transition-colors">
        <svg width="16" height="16" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
        Microsoft
      </button>
    </div>

    <p class="mt-6 text-2xs text-ink-muted text-center">
      Trouble signing in? Contact your branch administrator.
    </p>
  `,
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private store = inject(AuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private logger = inject(LoggerService);

  protected readonly loading = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly reveal = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  protected readonly emailError = computed(() => {
    const c = this.form.controls.email;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Email is required.';
    if (c.hasError('email')) return 'Enter a valid email address.';
    return '';
  });

  protected readonly passwordError = computed(() => {
    const c = this.form.controls.password;
    if (!c.touched && !c.dirty) return '';
    if (c.hasError('required')) return 'Password is required.';
    return '';
  });

  protected readonly banner = computed<{ tone: 'good' | 'info' | 'warn' | 'danger'; title: string; message: string } | null>(() => {
    if (this.serverError()) {
      return { tone: 'danger', title: 'Sign-in failed', message: this.serverError()! };
    }
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'idle') return { tone: 'warn', title: 'Signed out', message: 'You were signed out due to inactivity.' };
    if (reason === 'expired') return { tone: 'warn', title: 'Session expired', message: 'Please sign in again to continue.' };
    return null;
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
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { email, password } = this.form.getRawValue();
    const { error } = await this.auth.signIn(email, password);
    this.loading.set(false);

    if (error) {
      this.logger.warn('login_failed', { code: error.status });
      this.serverError.set('Email or password is incorrect.');
      return;
    }

    if (!this.store.isActive()) {
      await this.auth.signOut();
      this.serverError.set('Your account is inactive. Contact your administrator.');
      return;
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
    this.router.navigateByUrl(returnUrl);
  }

  protected async ssoLogin(provider: 'google' | 'azure') {
    const { error } = await this.auth.signInWithOAuth(provider);
    if (error) {
      this.serverError.set('SSO sign-in failed. Please try again.');
    }
  }
}
