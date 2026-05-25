import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalService } from '../data/portal.service';
import type { MyAppointment } from '../data/portal.types';

type Filter = 'all' | 'upcoming' | 'past';

@Component({
  selector: 'app-portal-appointments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">My appointments</h1>
        <p class="text-[13px] text-ink-muted mt-1">{{ total() }} total</p>
      </div>
    </header>

    <!-- Filter pills -->
    <div class="flex items-center gap-1.5 mb-4 flex-wrap">
      @for (f of filters; track f.value) {
        <button type="button" (click)="activeFilter.set(f.value)" [class]="pillCls(f.value)">{{ f.label }}</button>
      }
    </div>

    @if (loading()) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (error()) {
      <div class="bg-danger-bg border border-danger-border rounded-[10px] p-4 text-[13px] text-danger-fg">{{ error() }}</div>
    } @else {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden divide-y divide-border">
        @for (appt of visible(); track appt.id) {
          <div class="px-4 py-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-ink">{{ formatDate(appt.appointment_at) }}</p>
                <p class="text-[12px] text-ink-muted mt-0.5 capitalize">
                  {{ appt.visit_type.replace('_', ' ') }}
                  @if (appt.doctor_name) { · Dr. {{ appt.doctor_name }} }
                  @if (appt.room) { · Room {{ appt.room }} }
                </p>
                @if (appt.chief_complaint) {
                  <p class="text-[12px] text-ink-soft mt-1 italic">{{ appt.chief_complaint }}</p>
                }
              </div>
              <span [class]="apptChip(appt.status)">{{ appt.status.replace(/_/g, ' ') }}</span>
            </div>
            @if (appt.cancellation_reason) {
              <p class="text-[11px] text-danger-fg mt-1.5">Reason: {{ appt.cancellation_reason }}</p>
            }
          </div>
        } @empty {
          <p class="px-4 py-12 text-center text-[12px] text-ink-muted">No appointments match this filter.</p>
        }
      </div>
    }
  `,
})
export class PortalAppointmentsPage implements OnInit {
  private svc = inject(PortalService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly all = signal<MyAppointment[]>([]);
  protected readonly activeFilter = signal<Filter>('upcoming');

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past',     label: 'Past'     },
    { value: 'all',      label: 'All'      },
  ];

  protected readonly visible = computed(() => {
    const now = new Date().toISOString();
    switch (this.activeFilter()) {
      case 'upcoming': return this.all().filter((a) => a.appointment_at >= now && !['cancelled','no_show'].includes(a.status));
      case 'past':     return this.all().filter((a) => a.appointment_at < now || ['completed','cancelled','no_show'].includes(a.status));
      default:         return this.all();
    }
  });

  protected readonly total = computed(() => this.all().length);

  async ngOnInit() {
    try {
      this.all.set(await this.svc.getMyAppointments());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load appointments.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDate(dt: string) {
    return new Date(dt).toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  protected pillCls(value: Filter) {
    const active = this.activeFilter() === value;
    return active
      ? 'h-8 px-3 rounded-full text-[12px] font-medium bg-primary-600 text-white'
      : 'h-8 px-3 rounded-full text-[12px] font-medium border border-border text-ink-muted hover:text-ink-soft';
  }

  protected apptChip(status: string) {
    const tone: Record<string, string> = {
      scheduled:       'bg-primary-50 text-primary-700',
      checked_in:      'bg-warn-bg text-warn-fg',
      in_consultation: 'bg-warn-bg text-warn-fg',
      completed:       'bg-good-bg text-good-fg',
      no_show:         'bg-surface-subtle text-ink-muted',
      cancelled:       'bg-danger-bg text-danger-fg',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize ${tone[status] ?? 'bg-surface-subtle text-ink-muted'}`;
  }
}
