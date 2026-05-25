import { Injectable, computed, inject, signal } from '@angular/core';
import { NotificationsService } from './notifications.service';
import type { Notification, NotificationFilter } from './notifications.types';

@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private svc = inject(NotificationsService);

  private readonly _items = signal<Notification[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filter = signal<NotificationFilter>('unread');

  readonly items   = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error   = this._error.asReadonly();
  readonly filter  = this._filter.asReadonly();

  readonly unreadCount = computed(() =>
    this._items().filter((n) => n.read_at === null).length,
  );

  readonly visible = computed<Notification[]>(() => {
    const f = this._filter();
    const all = this._items();
    if (f === 'all')    return all;
    if (f === 'unread') return all.filter((n) => n.read_at === null);
    return all.filter((n) => n.category === f);
  });

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await this.svc.list({ onlyUnread: false, limit: 200 }));
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      this._loading.set(false);
    }
  }

  setFilter(v: NotificationFilter) { this._filter.set(v); }
}
