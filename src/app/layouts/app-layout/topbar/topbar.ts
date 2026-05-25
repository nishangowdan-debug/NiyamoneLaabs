import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { NotificationsService } from '../../../features/notifications/data/notifications.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { BranchSwitcher } from './branch-switcher';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, BranchSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="h-14 sticky top-0 z-50 bg-surface-card border-b border-border flex items-center px-4 gap-4">

      <!-- ── Brand mark (left, same width as sidebar) ─────────── -->
      <a routerLink="/dashboard"
         class="flex items-center gap-2.5 shrink-0 font-display text-[17px] font-medium tracking-[-0.01em]"
         style="width: calc(336px - 32px);">
        <div class="w-[26px] h-[26px] rounded-md grid place-items-center bg-primary-600 text-white font-display italic text-[16px] shrink-0">n</div>
        <div class="leading-tight whitespace-nowrap overflow-hidden">
          <div>niyamone <span class="italic text-ink-muted font-normal">lab</span></div>
          <small class="block font-sans text-[10px] text-ink-muted uppercase tracking-[0.06em] font-medium">
            {{ activeBranchName() }}
          </small>
        </div>
      </a>

      <!-- ── Global search ───────────────────────────────────── -->
      <div class="flex-1 max-w-[480px] relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
             width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          readonly
          (click)="dispatchCmdK()"
          (focus)="dispatchCmdK()"
          placeholder="Search patient, drug, or jump to a screen..."
          class="w-full h-8 pl-9 pr-12 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:bg-surface-card focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 cursor-pointer"
        />
        <span class="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-faint border border-border rounded px-1.5 py-0.5 bg-surface-card">⌘K</span>
      </div>

      <div class="flex-1"></div>

      <!-- ── Branch switcher ─────────────────────────────────── -->
      <app-branch-switcher></app-branch-switcher>

      <!-- ── Notifications ───────────────────────────────────── -->
      <button type="button" routerLink="/notifications"
              class="size-8 grid place-items-center rounded-md text-ink-soft hover:bg-surface-subtle relative" aria-label="Notifications">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        @if (unreadCount() > 0) {
          <span class="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full bg-danger-fg text-white text-[9px] font-semibold grid place-items-center px-1">
            {{ unreadCount() > 99 ? '99+' : unreadCount() }}
          </span>
        }
      </button>

      <!-- ── User pill ───────────────────────────────────────── -->
      <button type="button" (click)="signOut()"
              class="flex items-center gap-2 pl-1 pr-2.5 h-8 border border-border rounded-full hover:bg-surface-subtle"
              [attr.aria-label]="'Sign out ' + email()">
        <div class="size-6 rounded-full bg-primary-600 text-white grid place-items-center text-[10px] font-semibold uppercase">
          {{ initials() }}
        </div>
        <div class="leading-[1.1] text-left">
          <div class="text-[12px] font-medium text-ink truncate max-w-[160px]">{{ email() }}</div>
          <small class="block text-[10px] text-ink-muted capitalize">{{ role() }}</small>
        </div>
      </button>
    </header>
  `,
})
export class Topbar implements OnInit, OnDestroy {
  private authSvc = inject(AuthService);
  private store = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private notifSvc = inject(NotificationsService);
  private branchStore = inject(BranchStore);

  protected readonly activeBranchName = computed(() =>
    this.branchStore.activeBranchName() || 'All hospitals',
  );

  protected readonly email = computed(() => this.store.user()?.email ?? '');
  protected readonly role = computed(() => this.store.role().replace('_', ' '));
  protected readonly initials = computed(() => {
    const e = this.store.user()?.email ?? '';
    return e.slice(0, 2).toUpperCase();
  });

  protected readonly unreadCount = signal(0);
  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.refreshCount();
    this.unsubscribe = this.notifSvc.subscribe(() => void this.refreshCount());
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  private async refreshCount() {
    try { this.unreadCount.set(await this.notifSvc.unreadCount()); }
    catch { /* non-blocking */ }
  }

  protected dispatchCmdK() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  protected async signOut() {
    await this.authSvc.signOut();
    this.toast.info('Signed out');
    this.router.navigate(['/auth/login']);
  }
}
