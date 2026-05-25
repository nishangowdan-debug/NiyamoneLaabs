import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { ConciergeTicket, CreateTicketInput, TicketStatus } from './concierge.types';

@Injectable({ providedIn: 'root' })
export class ConciergeService {
  private supabase = inject(SupabaseService);

  async list(): Promise<ConciergeTicket[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('concierge_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ConciergeTicket[];
  }

  async create(input: CreateTicketInput): Promise<ConciergeTicket> {
    const { data, error } = await (this.supabase.client as any)
      .from('concierge_tickets')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as ConciergeTicket;
  }

  async updateStatus(id: string, status: TicketStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'closed') patch['closed_at'] = new Date().toISOString();
    const { error } = await (this.supabase.client as any)
      .from('concierge_tickets')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async assign(id: string, staffId: string, staffName: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('concierge_tickets')
      .update({ assigned_staff_id: staffId, assigned_staff_name: staffName, status: 'assigned' })
      .eq('id', id);
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('concierge-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concierge_tickets' }, () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(channel); };
  }
}
