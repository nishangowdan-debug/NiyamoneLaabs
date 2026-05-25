import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { PortalService } from '../data/portal.service';
import { LabReportPdfService } from '../../lab/services/lab-report-pdf.service';
import type { LabResultWithTest, MyLabOrder } from '../data/portal.types';

@Component({
  selector: 'app-portal-lab-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="pb-4 mb-5 border-b border-border">
      <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Lab results</h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ orders().length }} order{{ orders().length !== 1 ? 's' : '' }}</p>
    </header>

    @if (loading()) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (error()) {
      <div class="bg-danger-bg border border-danger-border rounded-[10px] p-4 text-[13px] text-danger-fg">{{ error() }}</div>
    } @else {
      <div class="space-y-4">
        @for (order of orders(); track order.id) {
          <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
            <!-- Order header -->
            <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div>
                <p class="text-[13px] font-medium text-ink">{{ formatDate(order.ordered_at) }}</p>
                <p class="text-[11px] text-ink-muted mt-0.5 capitalize">
                  Priority: {{ order.priority }}
                  @if (order.sample_id) { <span> · Sample {{ order.sample_id }}</span> }
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span [class]="orderChip(order.status)">{{ order.status }}</span>
                @if (canDownload(order)) {
                  <button type="button" (click)="downloadReport(order.id)"
                          [disabled]="downloading() === order.id"
                          class="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                    {{ downloading() === order.id ? 'Opening…' : 'Download PDF' }}
                  </button>
                }
              </div>
            </div>

            <!-- Results table -->
            @if (order.results.length > 0) {
              <table class="w-full border-collapse">
                <thead>
                  <tr class="bg-surface-muted">
                    <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Test</th>
                    <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Result</th>
                    <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap hidden sm:table-cell">Reference range</th>
                    <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of order.results; track r.id) {
                    <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                      <td class="px-4 py-2.5">
                        <p class="text-[12px] text-ink">{{ r.test?.name ?? '—' }}</p>
                        <p class="text-[10px] font-mono text-ink-muted">{{ r.test?.code }}</p>
                      </td>
                      <td class="px-4 py-2.5 text-right font-mono text-[13px]"
                          [class.text-danger-fg]="r.flag && r.flag !== 'normal'"
                          [class.text-ink]="!r.flag || r.flag === 'normal'">
                        {{ r.value_numeric != null ? r.value_numeric : (r.value_text ?? '—') }}
                        @if (r.test?.unit) { <span class="text-[11px] text-ink-muted ml-0.5">{{ r.test!.unit }}</span> }
                      </td>
                      <td class="px-4 py-2.5 text-right text-[11px] font-mono text-ink-muted hidden sm:table-cell">
                        {{ refRange(r) }}
                      </td>
                      <td class="px-4 py-2.5 text-right">
                        @if (r.flag) {
                          <span [class]="flagChip(r.flag)">{{ r.flag.replace(/_/g, ' ') }}</span>
                        } @else {
                          <span class="text-[11px] text-ink-muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="px-4 py-3 text-[12px] text-ink-muted italic">Results pending.</p>
            }
          </div>
        } @empty {
          <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[12px] text-ink-muted">
            No lab orders yet.
          </div>
        }
      </div>
    }
  `,
})
export class PortalLabResultsPage implements OnInit {
  private svc    = inject(PortalService);
  private pdfSvc = inject(LabReportPdfService);

  protected readonly loading     = signal(true);
  protected readonly error       = signal<string | null>(null);
  protected readonly orders      = signal<MyLabOrder[]>([]);
  protected readonly downloading = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.orders.set(await this.svc.getMyLabOrders());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load lab results.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Patient can download a PDF only when at least one result is verified. */
  protected canDownload(order: MyLabOrder): boolean {
    return (order.results ?? []).some(r => r.status === 'verified');
  }

  protected async downloadReport(orderId: string): Promise<void> {
    this.downloading.set(orderId);
    try {
      await this.pdfSvc.openReport(orderId, { autoPrint: false });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not open report.');
    } finally {
      this.downloading.set(null);
    }
  }

  protected formatDate(dt: string) {
    return new Date(dt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  protected refRange(r: LabResultWithTest): string {
    const t = r.test;
    if (!t) return '—';
    if (t.ref_min != null && t.ref_max != null) return `${t.ref_min} – ${t.ref_max}`;
    if (t.ref_min != null) return `≥ ${t.ref_min}`;
    if (t.ref_max != null) return `≤ ${t.ref_max}`;
    return '—';
  }

  protected orderChip(status: string) {
    const tone: Record<string, string> = {
      open:      'bg-primary-50 text-primary-700',
      completed: 'bg-good-bg text-good-fg',
      cancelled: 'bg-surface-subtle text-ink-muted',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize ${tone[status] ?? 'bg-surface-subtle text-ink-muted'}`;
  }

  protected flagChip(flag: string) {
    const tone: Record<string, string> = {
      normal:        'bg-good-bg text-good-fg',
      low:           'bg-warn-bg text-warn-fg',
      high:          'bg-warn-bg text-warn-fg',
      critical_low:  'bg-danger-bg text-danger-fg',
      critical_high: 'bg-danger-bg text-danger-fg',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize ${tone[flag] ?? 'bg-surface-subtle text-ink-muted'}`;
  }
}
