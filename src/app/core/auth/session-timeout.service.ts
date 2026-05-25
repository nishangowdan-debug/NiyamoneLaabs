import { DestroyRef, Injectable, NgZone, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';

const IDLE_MS = 15 * 60 * 1000; // 15 minutes idle
const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // 8 hours absolute

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private auth = inject(AuthService);
  private store = inject(AuthStore);
  private router = inject(Router);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private absoluteTimer: ReturnType<typeof setTimeout> | null = null;
  private signedInAt = 0;

  start() {
    effect(() => {
      const authed = this.store.isAuthed();
      if (authed) {
        this.signedInAt = Date.now();
        this.attachListeners();
        this.resetIdle();
        this.startAbsolute();
      } else {
        this.detachListeners();
        this.clearTimers();
      }
    });
  }

  private listener = () => this.resetIdle();

  private attachListeners() {
    this.zone.runOutsideAngular(() => {
      ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) =>
        document.addEventListener(evt, this.listener, { passive: true }),
      );
    });
  }

  private detachListeners() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) =>
      document.removeEventListener(evt, this.listener),
    );
  }

  private resetIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.signOutDueToIdle(), IDLE_MS);
  }

  private startAbsolute() {
    if (this.absoluteTimer) clearTimeout(this.absoluteTimer);
    const elapsed = Date.now() - this.signedInAt;
    const remaining = Math.max(0, ABSOLUTE_MS - elapsed);
    this.absoluteTimer = setTimeout(() => this.signOutDueToAbsolute(), remaining);
  }

  private clearTimers() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.absoluteTimer) clearTimeout(this.absoluteTimer);
    this.idleTimer = null;
    this.absoluteTimer = null;
  }

  private async signOutDueToIdle() {
    await this.auth.signOut();
    // Synchronously clear the session so the redirectIfAuthedGuard
    // sees isAuthed() === false before the navigation is processed.
    this.store.clearSession();
    this.router.navigate(['/auth/login'], {
      queryParams: { reason: 'idle' },
    });
  }

  private async signOutDueToAbsolute() {
    await this.auth.signOut();
    this.store.clearSession();
    this.router.navigate(['/auth/login'], {
      queryParams: { reason: 'expired' },
    });
  }
}

