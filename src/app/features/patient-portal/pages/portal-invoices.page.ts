import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { PortalService } from '../data/portal.service';
import type { MyInvoice } from '../data/portal.types';

@Component({
  selector: 'app-portal-invoices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="pb-4 mb-5 border-b border-border">
      <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Invoices</h1>
      <p class="text-[13px] text-ink-muted mt-1">{{ invoices().length }} invoice{{ invoices().length !== 1 ? 's' : '' }}</p>
    </header>

    @if (loading()) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (error()) {
      <div class="bg-danger-bg border border-danger-border rounded-[10px] p-4 text-[13px] text-danger-fg">{{ error() }}</div>
    } @else {
      <!-- Outstanding balance banner -->
      @if (totalBalance() > 0) {
        <div class="bg-danger-bg border border-danger-border rounded-[10px] px-5 py-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p class="text-[13px] font-semibold text-danger-fg">Outstanding balance</p>
            <p class="text-[11px] text-danger-fg/80 mt-0.5">Please contact reception to clear dues.</p>
          </div>
          <p class="text-[22px] font-bold text-danger-fg shrink-0">{{ formatINR(totalBalance()) }}</p>
        </div>
      }

      <!-- Invoice cards -->
      <div class="space-y-4">
        @for (inv of invoices(); track inv.id) {
          <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
            <!-- Invoice header -->
            <div class="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p class="text-[13px] font-medium text-ink font-mono">{{ inv.invoice_number }}</p>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ formatDate(inv.invoice_date) }}</p>
              </div>
              <div class="flex items-center gap-3">
                <span [class]="invChip(inv.status)">{{ inv.status.replace('_', ' ') }}</span>
                <p class="text-[15px] font-semibold text-ink">{{ formatINR(inv.total_cents) }}</p>
              </div>
            </div>

            <!-- Line items -->
            @if (inv.items.length > 0) {
              <div class="px-4 py-2">
                @for (item of inv.items; track item.id) {
                  <div class="flex items-center justify-between py-1.5 text-[12px] border-b border-border last:border-b-0">
                    <span class="text-ink-soft flex-1 truncate">{{ item.description }}</span>
                    <span class="text-ink-muted ml-3 shrink-0">× {{ item.qty }}</span>
                    <span class="text-ink font-mono ml-3 shrink-0">{{ formatINR(item.total_cents) }}</span>
                  </div>
                }
              </div>
            }

            <!-- Totals strip -->
            <div class="px-4 py-2 bg-surface-muted border-t border-border text-[12px] text-ink-muted flex flex-wrap gap-x-5 gap-y-1">
              <span>Subtotal {{ formatINR(inv.subtotal_cents) }}</span>
              @if (inv.discount_cents > 0) { <span>Discount −{{ formatINR(inv.discount_cents) }}</span> }
              @if (inv.cgst_cents + inv.sgst_cents + inv.igst_cents > 0) {
                <span>Tax {{ formatINR(inv.cgst_cents + inv.sgst_cents + inv.igst_cents) }}</span>
              }
              <span class="text-ink font-medium">Paid {{ formatINR(inv.paid_cents) }}</span>
              @if (inv.balance_cents > 0) {
                <span class="text-danger-fg font-medium">Balance due {{ formatINR(inv.balance_cents) }}</span>
              }
            </div>
          </div>
        } @empty {
          <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[12px] text-ink-muted">
            No invoices yet.
          </div>
        }
      </div>
    }
  `,
})
export class PortalInvoicesPage implements OnInit {
  private svc = inject(PortalService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly invoices = signal<MyInvoice[]>([]);

  protected readonly totalBalance = computed(() =>
    this.invoices().reduce((sum, inv) => sum + (inv.balance_cents ?? 0), 0),
  );

  async ngOnInit() {
    try {
      this.invoices.set(await this.svc.getMyInvoices());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load invoices.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDate(dt: string) {
    return new Date(dt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  protected formatINR(cents: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  protected invChip(status: string) {
    const tone: Record<string, string> = {
      draft:           'bg-surface-subtle text-ink-muted',
      issued:          'bg-primary-50 text-primary-700',
      partially_paid:  'bg-warn-bg text-warn-fg',
      paid:            'bg-good-bg text-good-fg',
      void:            'bg-surface-subtle text-ink-muted',
      refunded:        'bg-surface-subtle text-ink-muted',
    };
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize ${tone[status] ?? 'bg-surface-subtle text-ink-muted'}`;
  }
}
