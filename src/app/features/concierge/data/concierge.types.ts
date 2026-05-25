export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketStatus = 'new' | 'assigned' | 'in_progress' | 'pending_approval' | 'closed';
export type TicketChannel = 'qr' | 'whatsapp' | 'phone' | 'staff';
export type TicketCategory = 'housekeeping' | 'maintenance' | 'fnb' | 'it' | 'security' | 'other';

export interface ConciergeTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  category: TicketCategory;
  channel: TicketChannel;
  patient_id: string | null;
  patient_name: string | null;
  location: string | null;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  sla_minutes: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  satisfaction: 'up' | 'down' | null;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority: TicketPriority;
  category: TicketCategory;
  channel: TicketChannel;
  patient_id?: string | null;
  patient_name?: string | null;
  location?: string | null;
  assigned_staff_id?: string | null;
}
