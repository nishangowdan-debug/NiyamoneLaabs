import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { differenceInMinutes } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConciergeService } from '../data/concierge.service';
import type { ConciergeTicket, TicketPriority, TicketStatus, TicketCategory, TicketChannel } from '../data/concierge.types';

const STATUS_COLS: { status: TicketStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'pending_approval', label: 'Pending Approval' },
  { status: 'closed', label: 'Closed' },
];

const PRIORITY_STYLE: Record<TicketPriority, { bg: string; fg: string; label: string }> = {
  urgent: { bg: 'bg-danger-bg', fg: 'text-danger-fg', label: 'Urgent' },
  high:   { bg: 'bg-warn-bg',   fg: 'text-warn-fg',   label: 'High' },
  normal: { bg: 'bg-info-bg',   fg: 'text-info-fg',   label: 'Normal' },
  low:    { bg: 'bg-surface-subtle', fg: 'text-ink-muted', label: 'Low' },
};

const CATEGORY_ICON: Record<TicketCategory, string> = {
  housekeeping: '\u{1F9F9}',
  maintenance: '\u{1F527}',
  fnb: '\u{1F37D}\uFE0F',
  it: '\u{1F4BB}',
  security: '\u{1F6E1}\uFE0F',
  other: '\u{1F4CB}',
};

@Component({
  selector: 'app-concierge-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ──────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          Concierge
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Hospitality command center \u00b7
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      <button type="button" (click)="showNewTicket.set(true)"
              class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card inline-flex items-center gap-2">
        + New ticket
      </button>
    </header>

    <!-- ── Stats strip ────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
      @for (stat of stats(); track stat.label) {
        <div class="bg-surface-card border border-border rounded-[10px] p-3">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">{{ stat.label }}</p>
          <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1" [class]="stat.fg">{{ stat.value }}</p>
        </div>
      }
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- ── Kanban board ───────────────────────────────────── -->
    <div class="flex gap-3 overflow-x-auto pb-4">
      @for (col of columns; track col.status) {
        <div class="flex-shrink-0 w-[260px] flex flex-col">
          <div class="flex items-center justify-between px-2 py-2">
            <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">{{ col.label }}</span>
            <span class="text-[11px] font-mono text-ink-faint">{{ columnCount(col.status) }}</span>
          </div>
          <div class="flex-1 space-y-2 min-h-[200px]">
            @for (ticket of columnTickets(col.status); track ticket.id) {
              <div class="bg-surface-card border border-border rounded-lg p-3 hover:shadow-card transition-shadow cursor-pointer"
                   (click)="selectTicket(ticket)">
                <!-- Header: priority + ticket# -->
                <div class="flex items-center justify-between mb-1.5">
                  <span [class]="priorityChipCls(ticket.priority)">{{ priorityLabel(ticket.priority) }}</span>
                  <span class="text-[10px] font-mono text-ink-faint">{{ ticket.ticket_number }}</span>
                </div>
                <!-- Subject -->
                <p class="text-[12px] font-medium text-ink leading-tight mb-1.5 line-clamp-2">{{ ticket.subject }}</p>
                <!-- Location -->
                @if (ticket.location) {
                  <p class="text-[10px] text-ink-muted mb-1.5">\u{1F4CD} {{ ticket.location }}</p>
                }
                <!-- Footer: category + SLA + channel -->
                <div class="flex items-center justify-between">
                  <span class="text-[11px]">{{ categoryIcon(ticket.category) }}</span>
                  <span [class]="slaCls(ticket)">{{ slaLabel(ticket) }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted capitalize">{{ ticket.channel }}</span>
                </div>
                <!-- Assigned -->
                @if (ticket.assigned_staff_name) {
                  <p class="text-[10px] text-ink-muted mt-1.5 truncate">\u2192 {{ ticket.assigned_staff_name }}</p>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- ── New Ticket Modal ───────────────────────────────── -->
    @if (showNewTicket()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center" (document:keydown.escape)="showNewTicket.set(false)">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-surface-card rounded-xl shadow-pop border border-border w-full max-w-md overflow-hidden"
             (click)="$event.stopPropagation()">
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-[15px] font-semibold text-ink">New Ticket</h3>
            <button type="button" (click)="showNewTicket.set(false)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle text-lg">\u00d7</button>
          </header>
          <form [formGroup]="ticketForm" (ngSubmit)="createTicket()" class="p-5 space-y-4">
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Subject</label>
              <input formControlName="subject" placeholder="Brief description of issue" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Description</label>
              <textarea formControlName="description" rows="3" placeholder="Additional details\u2026" class="w-full px-3 py-2 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category</label>
                <select formControlName="category" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                  <option value="housekeeping">Housekeeping</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="fnb">F&B</option>
                  <option value="it">IT</option>
                  <option value="security">Security</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Priority</label>
                <select formControlName="priority" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Location</label>
                <input formControlName="location" placeholder="Room/Bed/Ward" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Channel</label>
                <select formControlName="channel" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                  <option value="phone">Phone</option>
                  <option value="staff">Staff-raised</option>
                  <option value="qr">QR scan</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Patient name (optional)</label>
              <input formControlName="patient_name" placeholder="Type patient name or leave blank" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showNewTicket.set(false)" class="h-9 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="submit" [disabled]="ticketForm.invalid || creating()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card disabled:opacity-60">
                {{ creating() ? 'Creating\u2026' : 'Create ticket' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- ── Ticket Detail Slide-over ───────────────────────── -->
    @if (selectedTicket(); as t) {
      <div class="fixed inset-0 z-[90] flex justify-end" (document:keydown.escape)="selectedTicket.set(null)">
        <div class="absolute inset-0 bg-black/30"></div>
        <aside class="relative w-full max-w-md bg-surface-card border-l border-border h-full overflow-y-auto shadow-pop"
               (click)="$event.stopPropagation()">
          <header class="sticky top-0 bg-surface-card border-b border-border px-5 py-3.5 flex items-center justify-between z-10">
            <div>
              <p class="text-[10px] font-mono text-ink-muted">{{ t.ticket_number }}</p>
              <h3 class="text-[15px] font-semibold text-ink mt-0.5">{{ t.subject }}</h3>
            </div>
            <button type="button" (click)="selectedTicket.set(null)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle text-lg">\u00d7</button>
          </header>
          <div class="p-5 space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Status</p>
                <p class="text-[13px] text-ink capitalize mt-0.5">{{ t.status.replace('_', ' ') }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Priority</p>
                <span [class]="priorityChipCls(t.priority)">{{ priorityLabel(t.priority) }}</span>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Category</p>
                <p class="text-[13px] text-ink mt-0.5">{{ categoryIcon(t.category) }} {{ t.category }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Channel</p>
                <p class="text-[13px] text-ink capitalize mt-0.5">{{ t.channel }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Location</p>
                <p class="text-[13px] text-ink mt-0.5">{{ t.location || '\u2014' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Patient</p>
                <p class="text-[13px] text-ink mt-0.5">{{ t.patient_name || '\u2014' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Assigned to</p>
                <p class="text-[13px] text-ink mt-0.5">{{ t.assigned_staff_name || 'Unassigned' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">SLA</p>
                <p [class]="'text-[13px] mt-0.5 font-mono ' + (slaBreached(t) ? 'text-danger-fg' : 'text-good-fg')">{{ slaLabel(t) }}</p>
              </div>
            </div>

            @if (t.description) {
              <div class="border-t border-border pt-3">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Description</p>
                <p class="text-[13px] text-ink-soft whitespace-pre-wrap">{{ t.description }}</p>
              </div>
            }

            <!-- Status actions -->
            @if (t.status !== 'closed') {
              <div class="border-t border-border pt-3">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Actions</p>
                <div class="flex flex-wrap gap-2">
                  @if (t.status === 'new') {
                    <button (click)="moveTicket(t, 'assigned')" class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Mark Assigned</button>
                  }
                  @if (t.status === 'assigned') {
                    <button (click)="moveTicket(t, 'in_progress')" class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Start Work</button>
                  }
                  @if (t.status === 'in_progress') {
                    <button (click)="moveTicket(t, 'pending_approval')" class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Submit for Approval</button>
                  }
                  @if (t.status === 'pending_approval') {
                    <button (click)="moveTicket(t, 'closed')" class="h-8 px-3 rounded-md bg-good-fg hover:bg-good-fg/90 text-white text-[12px] font-medium">Close Ticket</button>
                  }
                  <button (click)="moveTicket(t, 'closed')" class="h-8 px-3 rounded-md text-[12px] font-medium text-danger-fg hover:bg-danger-bg">Force Close</button>
                </div>
              </div>
            }
          </div>
        </aside>
      </div>
    }
  `,
})
export class ConciergePage implements OnInit, OnDestroy {
  private svc = inject(ConciergeService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  protected readonly tickets = signal<ConciergeTicket[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly showNewTicket = signal(false);
  protected readonly creating = signal(false);
  protected readonly selectedTicket = signal<ConciergeTicket | null>(null);

  protected readonly columns = STATUS_COLS;

  protected readonly ticketForm = this.fb.nonNullable.group({
    subject: ['', Validators.required],
    description: [''],
    category: ['housekeeping' as TicketCategory],
    priority: ['normal' as TicketPriority],
    channel: ['phone' as TicketChannel],
    location: [''],
    patient_name: [''],
  });

  protected readonly stats = computed(() => {
    const all = this.tickets();
    const open = all.filter((t) => t.status !== 'closed');
    const breached = open.filter((t) => this.slaBreached(t));
    const closedToday = all.filter((t) => t.status === 'closed' && t.closed_at && new Date(t.closed_at).toDateString() === new Date().toDateString());
    const avgTat = closedToday.length > 0
      ? Math.round(closedToday.reduce((sum, t) => sum + differenceInMinutes(new Date(t.closed_at!), new Date(t.created_at)), 0) / closedToday.length)
      : 0;
    const withinSla = open.length > 0
      ? Math.round(((open.length - breached.length) / open.length) * 100)
      : 100;

    return [
      { label: 'Open', value: open.length, fg: 'text-ink' },
      { label: 'Avg TAT', value: `${avgTat}m`, fg: 'text-ink' },
      { label: 'Within SLA', value: `${withinSla}%`, fg: withinSla >= 90 ? 'text-good-fg' : 'text-warn-fg' },
      { label: 'Breached', value: breached.length, fg: breached.length > 0 ? 'text-danger-fg' : 'text-ink' },
      { label: 'Closed today', value: closedToday.length, fg: 'text-ink' },
      { label: 'Total', value: all.length, fg: 'text-ink-muted' },
    ];
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.load();
    this.unsubscribe = this.svc.subscribe(() => void this.load());
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.tickets.set(await this.svc.list());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      this.loading.set(false);
    }
  }

  protected columnTickets(status: TicketStatus): ConciergeTicket[] {
    return this.tickets().filter((t) => t.status === status);
  }

  protected columnCount(status: TicketStatus): number {
    return this.tickets().filter((t) => t.status === status).length;
  }

  protected slaBreached(t: ConciergeTicket): boolean {
    if (t.status === 'closed') return false;
    const elapsed = differenceInMinutes(new Date(), new Date(t.created_at));
    return elapsed > t.sla_minutes;
  }

  protected slaLabel(t: ConciergeTicket): string {
    if (t.status === 'closed') return 'Done';
    const elapsed = differenceInMinutes(new Date(), new Date(t.created_at));
    const remaining = t.sla_minutes - elapsed;
    if (remaining <= 0) return `${Math.abs(remaining)}m over`;
    return `${remaining}m left`;
  }

  protected slaCls(t: ConciergeTicket): string {
    if (t.status === 'closed') return 'text-[10px] font-mono text-good-fg';
    const elapsed = differenceInMinutes(new Date(), new Date(t.created_at));
    const pct = elapsed / t.sla_minutes;
    if (pct >= 1) return 'text-[10px] font-mono text-danger-fg font-semibold';
    if (pct >= 0.75) return 'text-[10px] font-mono text-warn-fg';
    return 'text-[10px] font-mono text-ink-muted';
  }

  protected priorityChipCls(p: TicketPriority): string {
    const s = PRIORITY_STYLE[p];
    return `inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-medium ${s.bg} ${s.fg}`;
  }

  protected priorityLabel(p: TicketPriority): string {
    return PRIORITY_STYLE[p].label;
  }

  protected categoryIcon(c: TicketCategory): string {
    return CATEGORY_ICON[c] ?? '\u{1F4CB}';
  }

  protected selectTicket(t: ConciergeTicket) {
    this.selectedTicket.set(t);
  }

  protected async moveTicket(t: ConciergeTicket, status: TicketStatus) {
    try {
      await this.svc.updateStatus(t.id, status);
      this.toast.success('Ticket updated', `Moved to ${status.replace('_', ' ')}`);
      this.selectedTicket.set(null);
      await this.load();
    } catch (e) {
      this.toast.error('Failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  protected async createTicket() {
    if (this.ticketForm.invalid) return;
    this.creating.set(true);
    try {
      const val = this.ticketForm.getRawValue();
      await this.svc.create({
        subject: val.subject,
        description: val.description || undefined,
        category: val.category,
        priority: val.priority,
        channel: val.channel,
        location: val.location || undefined,
        patient_name: val.patient_name || undefined,
      });
      this.toast.success('Ticket created');
      this.showNewTicket.set(false);
      this.ticketForm.reset({ category: 'housekeeping', priority: 'normal', channel: 'phone' });
      await this.load();
    } catch (e) {
      this.toast.error('Failed to create', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.creating.set(false);
    }
  }
}
