import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AmbulanceAlertService, type PendingAlert } from './ambulance-alert.service';

/**
 * Sticky red banner shown at the top of the staff app whenever an inbound
 * ambulance is < 5 minutes away. Mounted once in the AppLayout. Multiple
 * concurrent alerts stack vertically.
 */
@Component({
  selector: 'app-ambulance-alert-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (svc.hasAlerts()) {
      <div class="sticky top-14 z-40 print-hide" role="alertdialog" aria-live="assertive">
        @for (a of svc.alerts(); track a.trip_id) {
          <article class="border-b border-rose-700/40 text-white animate-pulse-once"
                   [style.background]="'linear-gradient(90deg, #991B1B 0%, #B91C1C 50%, #991B1B 100%)'">
            <div class="px-4 py-3 flex items-center gap-4 flex-wrap">
              <div class="shrink-0 size-10 rounded-md bg-white/15 grid place-items-center text-[20px] animate-bounce">🚑</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <p class="font-display text-[16px] font-semibold leading-none">
                    Inbound ambulance — ETA <span class="font-mono tabular-nums">{{ a.eta_min }}m</span>
                  </p>
                  @if (a.priority) {
                    <span class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-white/15">{{ a.priority }}</span>
                  }
                  @if (a.ambulance_code) {
                    <span class="text-[10px] text-white/70">· {{ a.ambulance_code }}</span>
                  }
                </div>
                <p class="text-[12px] text-white/85 mt-1 truncate">
                  <span class="font-semibold">{{ a.patient_name }}</span>
                  @if (a.patient_age) { <span class="text-white/60">· {{ a.patient_age }}{{ a.patient_gender ? '/' + (a.patient_gender[0] || '').toUpperCase() : '' }}</span> }
                  @if (a.chief_complaint) { <span class="text-white/60"> · {{ a.chief_complaint }}</span> }
                </p>
                @if (a.equipment.length > 0) {
                  <p class="text-[11px] mt-1 flex items-center gap-1 flex-wrap">
                    <span class="text-white/60">Prepare:</span>
                    @for (eq of a.equipment; track eq) {
                      <span class="px-1.5 py-0.5 rounded bg-white/15 font-medium uppercase tracking-[0.04em] text-[10px]">{{ formatEquipment(eq) }}</span>
                    }
                  </p>
                }
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <a routerLink="/ambulance" class="h-8 px-3 inline-flex items-center rounded-md bg-white/15 hover:bg-white/25 text-white text-[12px] font-medium border border-white/20">
                  View dispatch
                </a>
                <button type="button" (click)="prepare(a.trip_id)"
                        class="h-8 px-3 rounded-md bg-white text-rose-800 hover:bg-white/90 text-[12px] font-semibold shadow">
                  ✓ Mark prepared
                </button>
              </div>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    @keyframes pulse-once {
      0%   { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0); }
      40%  { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0.06); }
      100% { box-shadow: inset 0 0 0 9999px rgba(255,255,255,0); }
    }
    .animate-pulse-once { animation: pulse-once 1.4s ease-in-out infinite; }
  `],
})
export class AmbulanceAlertBanner {
  protected readonly svc = inject(AmbulanceAlertService);
  protected readonly busy = signal<string | null>(null);

  protected async prepare(tripId: string): Promise<void> {
    if (this.busy() === tripId) return;
    this.busy.set(tripId);
    try {
      await this.svc.markPrepared(tripId);
    } finally {
      this.busy.set(null);
    }
  }

  protected formatEquipment(code: string): string {
    const map: Record<string, string> = {
      wheelchair: 'Wheelchair',
      stretcher:  'Stretcher',
      oxygen:     'Oxygen',
      defib:      'Defibrillator',
      cpap:       'CPAP',
      iv:         'IV setup',
    };
    return map[code.toLowerCase()] ?? code;
  }
}
