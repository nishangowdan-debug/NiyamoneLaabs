import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { NotificationsService } from '../data/notifications.service';
import { NotificationsStore } from '../data/notifications.store';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  Notification,
  NotificationFilter,
  SEVERITY_TONE,
} from '../data/notifications.types';
import type { NotificationCategory } from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Notifications</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Inbox · {{ store.unreadCount() }} unread ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" (click)="generate()" [disabled]="busy() === 'generate'"
                class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-ink-soft text-[12px] font-medium hover:bg-surface-subtle disabled:opacity-50">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.7L21 8"/><path d="M21 3v5h-5"/></svg>
          {{ busy() === 'generate' ? 'Scanning…' : 'Refresh from rules' }}
        </button>
        @if (store.unreadCount() > 0) {
          <button type="button" (click)="markAllRead()" [disabled]="busy() === 'all-read'"
                  class="h-8 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
            {{ busy() === 'all-read' ? 'Marking…' : 'Mark all read' }}
          </button>
        }
      </div>
    </header>

    <!-- ── Filter pills ─────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">
            {{ f.label }}
            @if (f.value === 'unread' && store.unreadCount() > 0) {
              <span class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] rounded-full bg-danger-fg text-white text-[10px] font-semibold px-1">{{ store.unreadCount() }}</span>
            }
          </button>
        }
      </div>
      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.items().length.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load notifications">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── List ───────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      @if (store.loading() && store.items().length === 0) {
        <p class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading…</p>
      } @else if (store.visible().length === 0) {
        <div class="px-4 py-16 text-center">
          <p class="text-[13px] text-ink-soft">No notifications match this filter.</p>
          <p class="text-[12px] text-ink-muted mt-1">Click "Refresh from rules" to scan POs · bills · expiry · QC · today's appointments.</p>
        </div>
      } @else {
        <ul class="divide-y divide-border">
          @for (n of store.visible(); track n.id) {
            <li class="px-4 py-3.5 hover:bg-surface-muted transition-colors flex items-start gap-3"
                [class.bg-info-bg/30]="n.read_at === null">
              <!-- Severity dot + category icon -->
              <div class="size-9 rounded-md grid place-items-center shrink-0" [class]="iconWrapCls(n)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path [attr.d]="CATEGORY_ICON[n.category]"/>
                </svg>
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-[13px] font-medium text-ink truncate">{{ n.title }}</p>
                  <span [class]="severityChipCls(n)">{{ SEVERITY_TONE[n.severity].label }}</span>
                  <span class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">{{ CATEGORY_LABEL[n.category] }}</span>
                </div>
                @if (n.body) {
                  <p class="text-[12px] text-ink-soft mt-0.5">{{ n.body }}</p>
                }
                <p class="text-[11px] font-mono text-ink-muted mt-1">{{ relative(n.created_at) }}</p>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1 shrink-0">
                @if (n.action_url) {
                  <button type="button" (click)="openAction(n)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                    Open
                  </button>
                }
                @if (n.read_at === null) {
                  <button type="button" (click)="markRead(n)" [disabled]="busy() === n.id" class="h-7 px-2.5 rounded-md text-[11px] text-info-fg hover:bg-info-bg disabled:opacity-50">
                    Mark read
                  </button>
                }
                <button type="button" (click)="dismiss(n)" [disabled]="busy() === n.id" class="h-7 px-2.5 rounded-md text-[11px] text-ink-muted hover:bg-surface-subtle disabled:opacity-50">
                  Dismiss
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class NotificationsPage implements OnInit, OnDestroy {
  protected readonly store = inject(NotificationsStore);
  private svc = inject(NotificationsService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly busy = signal<string | null>(null);
  protected readonly SEVERITY_TONE = SEVERITY_TONE;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly CATEGORY_ICON = CATEGORY_ICON;

  protected readonly filterPills: { value: NotificationFilter; label: string }[] = [
    { value: 'unread',      label: 'Unread' },
    { value: 'all',         label: 'All' },
    { value: 'appointment', label: 'Appointments' },
    { value: 'billing',     label: 'Billing' },
    { value: 'inventory',   label: 'Inventory' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'lab',         label: 'Lab' },
    { value: 'ipd',         label: 'IPD' },
  ];

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
  }
  ngOnDestroy() { this.unsubscribe?.(); }

  protected onFilter(v: NotificationFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: NotificationFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors inline-flex items-center';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected iconWrapCls(n: Notification): string {
    const tone = SEVERITY_TONE[n.severity].chip;
    return `${tone}`;
  }

  protected severityChipCls(n: Notification): string {
    return `inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-medium ${SEVERITY_TONE[n.severity].chip}`;
  }

  protected relative(iso: string): string {
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return iso; }
  }

  protected async generate() {
    this.busy.set('generate');
    try {
      const n = await this.svc.generate();
      this.toast.success(`Scan complete · ${n} new`);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not generate', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async markAllRead() {
    this.busy.set('all-read');
    try {
      const n = await this.svc.markAllRead();
      this.toast.success(`Marked ${n} read`);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not mark', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async markRead(n: Notification) {
    this.busy.set(n.id);
    try {
      await this.svc.markRead(n.id);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not mark read', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async dismiss(n: Notification) {
    this.busy.set(n.id);
    try {
      await this.svc.dismiss(n.id);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not dismiss', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async openAction(n: Notification) {
    if (n.read_at === null) {
      try { await this.svc.markRead(n.id); } catch { /* non-blocking */ }
    }
    if (n.action_url) {
      this.router.navigateByUrl(n.action_url);
    }
  }
}
