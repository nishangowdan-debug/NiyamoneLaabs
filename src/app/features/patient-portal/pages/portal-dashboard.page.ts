import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalService } from '../data/portal.service';
import type { MyAppointment, MyInvoice, MyLabOrder, MyPatient, MyPrescription } from '../data/portal.types';

@Component({
  selector: 'app-portal-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (error()) {
      <div class="bg-danger-bg border border-danger-border rounded-[10px] p-4 text-[13px] text-danger-fg">{{ error() }}</div>
    } @else {
      <header class="mb-6">
        <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          Hello, {{ patient()?.first_name ?? 'there' }}
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">UHID · {{ patient()?.uhid }}</p>
      </header>

      <!-- Stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="bg-surface-card border border-border rounded-[10px] p-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Next appointment</p>
          @if (nextAppointment(); as appt) {
            <p class="text-[16px] font-medium text-ink leading-snug">{{ formatDate(appt.appointment_at) }}</p>
            <p class="text-[12px] text-ink-muted mt-0.5 capitalize">{{ appt.visit_type.replace('_', ' ') }}</p>
          } @else {
            <p class="text-[15px] text-ink-muted">None scheduled</p>
          }
        </div>
        <div class="bg-surface-card border border-border rounded-[10px] p-4">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Active prescriptions</p>
          <p class="text-[28px] font-medium text-ink">{{ activePrescCount() }}</p>
        </div>
        <div class="bg-surface-card border border-border rounded-[10px] p-4"
             [class.!border-danger-border]="(patient()?.balance_cents ?? 0) > 0"
             [class.!bg-danger-bg]="(patient()?.balance_cents ?? 0) > 0">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Outstanding balance</p>
          <p class="text-[28px] font-medium"
             [class.text-danger-fg]="(patient()?.balance_cents ?? 0) > 0"
             [class.text-ink]="(patient()?.balance_cents ?? 0) === 0">
            {{ formatINR(patient()?.balance_cents ?? 0) }}
          </p>
        </div>
      </div>

      <!-- Upcoming appointments -->
      <section class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-[14px] font-semibold text-ink">Upcoming appointments</h2>
          <a routerLink="/patient-portal/appointments" class="text-[12px] text-primary-600 hover:underline">View all</a>
        </div>
        <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden divide-y divide-border">
          @for (appt of upcomingAppts(); track appt.id) {
            <div class="px-4 py-3 flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium text-ink">{{ formatDate(appt.appointment_at) }}</p>
                <p class="text-[11px] text-ink-muted mt-0.5 capitalize">
                  {{ appt.visit_type.replace('_', ' ') }}{{ appt.doctor_name ? ' · Dr. ' + appt.doctor_name : '' }}
                </p>
              </div>
              <span [class]="apptChip(appt.status)">{{ appt.status.replace(/_/g, ' ') }}</span>
            </div>
          } @empty {
            <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No upcoming appointments.</p>
          }
        </div>
      </section>

      <!-- Recent lab orders -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-[14px] font-semibold text-ink">Recent lab results</h2>
          <a routerLink="/patient-portal/lab-results" class="text-[12px] text-primary-600 hover:underline">View all</a>
        </div>
        <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden divide-y divide-border">
          @for (order of recentLab(); track order.id) {
            <div class="px-4 py-3 flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium text-ink">{{ formatDateShort(order.ordered_at) }}</p>
                <p class="text-[11px] text-ink-muted mt-0.5">
                  {{ order.results.length }} test{{ order.results.length !== 1 ? 's' : '' }}
                </p>
              </div>
              <span [class]="labChip(order.status)">{{ order.status }}</span>
            </div>
          } @empty {
            <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No lab orders yet.</p>
          }
        </div>
      </section>
    }
  `,
})
export class PortalDashboardPage implements OnInit {
  private svc = inject(PortalService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly patient = signal<MyPatient | null>(null);
  protected readonly appointments = signal<MyAppointment[]>([]);
  protected readonly prescriptions = signal<MyPrescription[]>([]);
  protected readonly labOrders = signal<MyLabOrder[]>([]);

  async ngOnInit() {
    try {
      const [p, a, pr, l] = await Promise.all([
        this.svc.getMyProfile(),
        this.svc.getMyAppointments(),
        this.svc.getMyPrescriptions(),
        this.svc.getMyLabOrders(),
      ]);
      this.patient.set(p);
      this.appointments.set(a);
      this.prescriptions.set(pr);
      this.labOrders.set(l);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load your data.');
    } finally {
      this.loading.set(false);
    }
  }

  protected nextAppointment(): MyAppointment | null {
    const now = new Date().toISOString();
    return this.appointments()
      .filter((a) => a.appointment_at >= now && !['cancelled', 'no_show'].includes(a.status))
      .at(-1) ?? null;
  }

  protected upcomingAppts(): MyAppointment[] {
    const now = new Date().toISOString();
    return this.appointments()
      .filter((a) => a.appointment_at >= now && !['cancelled', 'no_show'].includes(a.status))
      .slice(0, 3);
  }

  protected activePrescCount(): number {
    return this.prescriptions().filter((p) => ['issued', 'dispensed'].includes(p.status)).length;
  }

  protected recentLab(): MyLabOrder[] {
    return this.labOrders().slice(0, 3);
  }

  protected formatDate(dt: string) {
    return new Date(dt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  protected formatDateShort(dt: string) {
    return new Date(dt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  protected formatINR(cents: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(cents / 100);
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

  protected labChip(status: string) {
    const tone: Record<string, string> = {
      open:      'bg-primary-50 text-primary-700',
      completed: 'bg-good-bg text-good-fg',
      cancelled: 'bg-surface-subtle text-ink-muted',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize ${tone[status] ?? 'bg-surface-subtle text-ink-muted'}`;
  }
}
