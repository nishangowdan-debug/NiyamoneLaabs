import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { format } from 'date-fns';
import { AppointmentsService } from '../../appointments/data/appointments.service';
import type { AppointmentRow } from '../../appointments/data/appointments.types';

@Component({
  selector: 'app-opd-queue-tv-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="fixed inset-0 bg-[#0A1929] text-white font-sans flex flex-col overflow-hidden">

      <!-- Header -->
      <header class="flex items-center justify-between px-10 py-5 bg-[#0C2A52] border-b border-white/10">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-lg bg-primary-600 grid place-items-center font-display italic text-xl text-white">n</div>
          <div>
            <h1 class="text-2xl font-display font-medium tracking-tight">Sree Diagnostics</h1>
            <p class="text-sm text-white/60">OPD Queue Display</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-3xl font-mono font-medium">{{ clock() }}</p>
          <p class="text-sm text-white/60 mt-0.5">{{ dateLabel() }}</p>
        </div>
      </header>

      <!-- Main content -->
      <div class="flex-1 grid grid-cols-12 gap-6 p-8 overflow-hidden">

        <!-- Now Serving (left, larger) -->
        <section class="col-span-5 flex flex-col">
          <h2 class="text-sm uppercase tracking-[0.12em] text-white/50 font-semibold mb-4">Now Serving</h2>
          <div class="flex-1 flex flex-col gap-4 overflow-y-auto">
            @for (row of nowServing(); track row.id) {
              <div class="bg-emerald-900/40 border border-emerald-400/30 rounded-xl p-6 animate-pulse-subtle">
                <div class="flex items-center justify-between">
                  <span class="text-6xl font-mono font-bold text-emerald-300">{{ row.token_number ?? '—' }}</span>
                  <span class="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-medium">In consultation</span>
                </div>
                <p class="text-2xl mt-3 font-medium">{{ patientName(row) }}</p>
                <p class="text-base text-white/60 mt-1">Dr. {{ row.doctor?.full_name || '—' }}</p>
              </div>
            } @empty {
              <div class="flex-1 grid place-items-center">
                <p class="text-xl text-white/30">No active consultations</p>
              </div>
            }
          </div>
        </section>

        <!-- Waiting queue (right) -->
        <section class="col-span-7 flex flex-col">
          <h2 class="text-sm uppercase tracking-[0.12em] text-white/50 font-semibold mb-4">
            Waiting · {{ waitingList().length }} patient(s)
          </h2>
          <div class="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
            <table class="w-full">
              <thead>
                <tr class="border-b border-white/10 text-left">
                  <th class="px-6 py-3 text-xs uppercase tracking-wider text-white/40 font-semibold">Token</th>
                  <th class="px-6 py-3 text-xs uppercase tracking-wider text-white/40 font-semibold">Patient</th>
                  <th class="px-6 py-3 text-xs uppercase tracking-wider text-white/40 font-semibold">Doctor</th>
                  <th class="px-6 py-3 text-xs uppercase tracking-wider text-white/40 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of waitingList(); track row.id; let i = $index) {
                  <tr [class]="i < 3 ? 'bg-amber-900/10 border-b border-white/5' : 'border-b border-white/5'">
                    <td class="px-6 py-4 font-mono text-2xl font-bold" [class.text-amber-300]="row.status === 'checked_in'" [class.text-blue-300]="row.status === 'scheduled'">
                      {{ row.token_number ?? '—' }}
                    </td>
                    <td class="px-6 py-4 text-lg">{{ patientName(row) }}</td>
                    <td class="px-6 py-4 text-base text-white/70">{{ row.doctor?.full_name || '—' }}</td>
                    <td class="px-6 py-4">
                      @if (row.status === 'checked_in') {
                        <span class="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">Waiting</span>
                      } @else {
                        <span class="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium">Scheduled</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="px-6 py-12 text-center text-white/30 text-lg">No patients waiting</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Footer -->
      <footer class="px-10 py-3 bg-[#0C2A52] border-t border-white/10 flex items-center justify-between text-xs text-white/40">
        <span>Auto-refreshes every 15 seconds</span>
        <span>Sree Diagnostics v2.4.1</span>
      </footer>
    </div>
  `,
  styles: [`
    @keyframes pulse-subtle {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.85; }
    }
    .animate-pulse-subtle { animation: pulse-subtle 3s ease-in-out infinite; }
  `],
})
export class OpdQueueTvPage implements OnInit, OnDestroy {
  private svc = inject(AppointmentsService);
  private rows = signal<AppointmentRow[]>([]);
  private _now = signal(new Date());
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly clock = computed(() => format(this._now(), 'HH:mm:ss'));
  protected readonly dateLabel = computed(() => format(this._now(), 'EEEE, d MMMM yyyy'));

  protected readonly nowServing = computed(() =>
    this.rows().filter((r) => r.status === 'in_consultation')
  );

  protected readonly waitingList = computed(() =>
    this.rows()
      .filter((r) => r.status === 'checked_in' || r.status === 'scheduled')
      .sort((a, b) => (a.token_number ?? 999) - (b.token_number ?? 999))
  );

  ngOnInit() {
    void this.loadQueue();
    this.timer = setInterval(() => this._now.set(new Date()), 1000);
    this.refreshTimer = setInterval(() => void this.loadQueue(), 15_000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async loadQueue() {
    try {
      const data = await this.svc.getTodayAppointments();
      this.rows.set(data);
    } catch { /* fail silently for TV display */ }
  }

  protected patientName(row: AppointmentRow): string {
    const p = row.patient;
    if (!p) return '—';
    return p.full_name || `${p.first_name} ${p.last_name}`;
  }
}
