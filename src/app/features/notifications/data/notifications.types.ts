import type { NotificationCategory, NotificationSeverity, Tables } from '../../../core/supabase/supabase.types';

export type Notification = Tables<'notifications'>;

export type NotificationFilter = 'unread' | 'all' | NotificationCategory;

export const SEVERITY_TONE: Record<NotificationSeverity, { dot: string; chip: string; label: string }> = {
  info:    { dot: 'bg-info-fg',   chip: 'bg-info-bg text-info-fg',     label: 'Info' },
  warn:    { dot: 'bg-warn-fg',   chip: 'bg-warn-bg text-warn-fg',     label: 'Warn' },
  danger:  { dot: 'bg-danger-fg', chip: 'bg-danger-bg text-danger-fg', label: 'Urgent' },
  success: { dot: 'bg-good-fg',   chip: 'bg-good-bg text-good-fg',     label: 'Success' },
};

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  appointment: 'Appointments',
  billing:     'Billing',
  inventory:   'Inventory',
  procurement: 'Procurement',
  lab:         'Lab',
  ipd:         'IPD',
  system:      'System',
};

export const CATEGORY_ICON: Record<NotificationCategory, string> = {
  appointment: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  billing:     'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  inventory:   'M12.89 1.45 20 5.11V12c0 5-3.5 9-8 10-4.5-1-8-5-8-10V5.11l7.11-3.66a2 2 0 0 1 1.78 0Z',
  procurement: 'M3 3h2l3 12h11M7 13l4-8 4 8M9 21h.01M19 21h.01',
  lab:         'M10 2v8.5L4.5 21h15L14 10.5V2M9 2h6',
  ipd:         'M2 4v16M22 4v16M2 8h20M2 16h20M16 4v16',
  system:      'M12 1l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-2.01L12 1z',
};
