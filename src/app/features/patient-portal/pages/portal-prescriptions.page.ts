import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { PortalService } from '../data/portal.service';
import type { MyPrescription } from '../data/portal.types';

@Component({
  selector: 'app-portal-prescriptions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="pb-4 mb-5 border-b border-border">
      <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">My prescriptions</h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ prescriptions().length }} prescription{{ prescriptions().length !== 1 ? 's' : '' }}</p>
    </header>

    @if (loading()) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (error()) {
      <div class="bg-danger-bg border border-danger-border rounded-[10px] p-4 text-[13px] text-danger-fg">{{ error() }}</div>
    } @else {
      <div class="space-y-4">
        @for (rx of prescriptions(); track rx.id) {
          <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
            <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-medium text-ink">{{ formatDate(rx.prescribed_at) }}</p>
                @if (rx.doctor_name) {
                  <p class="text-[11px] text-ink-muted mt-0.5">Dr. {{ rx.doctor_name }}</p>
                }
              </div>
              <span [class]="rxChip(rx.status)">{{ rx.status }}</span>
            </div>

            @if (rx.items.length > 0) {
              <div class="divide-y divide-border">
                @for (item of rx.items; track item.id) {
                  <div class="px-4 py-3">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-[13px] font-medium text-ink">
                        {{ item.drug_name }}
                        @if (item.strength) { <span class="font-normal text-ink-muted">{{ item.strength }}</span> }
                      </p>
                      @if (item.qty) {
                        <span class="text-[11px] font-mono text-ink-muted whitespace-nowrap">Qty {{ item.qty }}</span>
                      }
                    </div>
                    <p class="text-[12px] text-ink-soft mt-0.5">
                      @if (item.dosage) { {{ item.dosage }} }
                      @if (item.frequency) { · {{ item.frequency }} }
                      @if (item.duration_days) { · {{ item.duration_days }} day{{ item.duration_days !== 1 ? 's' : '' }} }
                    </p>
                    @if (item.instructions) {
                      <p class="text-[11px] text-ink-muted mt-0.5 italic">{{ item.instructions }}</p>
                    }
                  </div>
                }
              </div>
            } @else {
              <p class="px-4 py-3 text-[12px] text-ink-muted italic">No items recorded.</p>
            }

            @if (rx.notes) {
              <div class="px-4 py-2 bg-surface-muted border-t border-border">
                <p class="text-[11px] text-ink-soft">Note: {{ rx.notes }}</p>
              </div>
            }
          </div>
        } @empty {
          <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[12px] text-ink-muted">
            No prescriptions yet.
          </div>
        }
      </div>
    }
  `,
})
export class PortalPrescriptionsPage implements OnInit {
  private svc = inject(PortalService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly prescriptions = signal<MyPrescription[]>([]);

  async ngOnInit() {
    try {
      this.prescriptions.set(await this.svc.getMyPrescriptions());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load prescriptions.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDate(dt: string) {
    return new Date(dt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  protected rxChip(status: string) {
    const tone: Record<string, string> = {
      draft:      'bg-surface-subtle text-ink-muted',
      issued:     'bg-primary-50 text-primary-700',
      dispensed:  'bg-warn-bg text-warn-fg',
      completed:  'bg-good-bg text-good-fg',
      cancelled:  'bg-danger-bg text-danger-fg',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${tone[status] ?? 'bg-surface-subtle text-ink-muted'}`;
  }
}
