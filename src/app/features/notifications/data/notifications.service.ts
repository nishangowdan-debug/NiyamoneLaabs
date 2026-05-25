import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Notification } from './notifications.types';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private supabase = inject(SupabaseService);

  async list(opts: { onlyUnread?: boolean; limit?: number } = {}): Promise<Notification[]> {
    let q = this.supabase.client
      .from('notifications')
      .select('*')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.onlyUnread) q = q.is('read_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async unreadCount(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('unread_notification_count');
    if (error) throw error;
    return (data as unknown as number) ?? 0;
  }

  async generate(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('generate_notifications');
    if (error) throw error;
    return (data as unknown as number) ?? 0;
  }

  async markRead(id: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('mark_notification_read', { p_id: id });
    if (error) throw error;
  }

  async markAllRead(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('mark_all_notifications_read');
    if (error) throw error;
    return (data as unknown as number) ?? 0;
  }

  async dismiss(id: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('dismiss_notification', { p_id: id });
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const name = `notifications-changes-${Math.random().toString(36).slice(2)}`;
    const ch = this.supabase.client
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange())
      .subscribe();
    return () => { void this.supabase.client.removeChannel(ch); };
  }
}
