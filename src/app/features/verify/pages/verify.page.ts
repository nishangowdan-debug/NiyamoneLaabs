import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/**
 * Public document-verification page.
 *
 * Reached by scanning the QR printed on an invoice or a lab report. Anyone
 * with the URL gets a minimal "yes this document was issued by this lab"
 * confirmation card — patient initials + UHID + branch + date + total +
 * status for invoices; same shape for lab orders.
 *
 * No PII (patient full name, mobile, line items, test results) is exposed
 * here; full detail requires logging in to the patient portal.
 *
 * Routes:
 *   /v/inv/:number     — verify an invoice by its invoice_number
 *   /v/report/:orderId — verify a lab report by its lab_order.id
 */
@Component({
  selector: 'app-verify-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh bg-gradient-to-br from-primary-50 to-surface-page grid place-items-center p-6">
      <main class="w-full max-w-[460px] bg-surface-card border border-border rounded-[16px] shadow-pop p-6">
        <header class="text-center mb-5">
          <div class="inline-grid place-items-center size-12 rounded-full bg-primary-600 text-white font-display text-[18px] font-bold mb-2">N</div>
          <p class="text-[11px] uppercase tracking-[0.08em] text-ink-muted font-semibold">Niyamone Lab</p>
          <h1 class="font-display text-[20px] font-medium text-ink leading-tight">Document verification</h1>
        </header>

        @if (loading()) {
          <p class="text-center text-[12.5px] text-ink-muted py-8">Verifying…</p>
        } @else if (notFound()) {
          <div class="rounded-[10px] border border-danger-fg/40 bg-danger-bg/40 p-4 text-center">
            <p class="text-[15px] font-semibold text-danger-fg mb-1">⚠ Document not found</p>
            <p class="text-[12px] text-ink-soft">This identifier does not match any document issued by this lab.<br/>If you have a printed copy, please verify the QR was scanned correctly.</p>
          </div>
        } @else if (data(); as d) {
          <div class="rounded-[10px] border border-good-fg/40 bg-good-bg/40 px-4 py-3 mb-4 flex items-center gap-2">
            <span class="text-good-fg text-[18px]">✓</span>
            <p class="text-[13px] font-semibold text-good-fg">Authentic — issued by Niyamone Lab</p>
          </div>

          @if (kind === 'invoice') {
            <dl class="grid grid-cols-3 gap-y-3 gap-x-3 text-[12.5px]">
              <dt class="col-span-1 text-ink-muted">Invoice no.</dt>
              <dd class="col-span-2 font-mono font-semibold text-ink">{{ d.invoice_number }}</dd>

              <dt class="col-span-1 text-ink-muted">Date</dt>
              <dd class="col-span-2 text-ink">{{ d.invoice_date }}</dd>

              <dt class="col-span-1 text-ink-muted">Branch</dt>
              <dd class="col-span-2 text-ink">{{ d.branch_name }} <span class="font-mono text-ink-muted">· {{ d.branch_code }}</span></dd>

              <dt class="col-span-1 text-ink-muted">Patient</dt>
              <dd class="col-span-2 text-ink">{{ d.patient_initials || '—' }} <span class="font-mono text-ink-muted">{{ d.patient_uhid }}</span></dd>

              <dt class="col-span-1 text-ink-muted">Total</dt>
              <dd class="col-span-2 font-mono text-ink">{{ formatINR(d.total_cents) }}</dd>

              <dt class="col-span-1 text-ink-muted">Status</dt>
              <dd class="col-span-2">
                <span [class]="statusChipCls(d.status)">{{ d.status }}</span>
                @if (d.balance_cents > 0) {
                  <span class="ml-2 text-[11px] text-warn-fg">balance {{ formatINR(d.balance_cents) }}</span>
                }
              </dd>
            </dl>
          } @else {
            <dl class="grid grid-cols-3 gap-y-3 gap-x-3 text-[12.5px]">
              <dt class="col-span-1 text-ink-muted">Order id</dt>
              <dd class="col-span-2 font-mono font-semibold text-ink truncate">{{ d.order_id }}</dd>

              <dt class="col-span-1 text-ink-muted">Branch</dt>
              <dd class="col-span-2 text-ink">{{ d.branch_name }} <span class="font-mono text-ink-muted">· {{ d.branch_code }}</span></dd>

              <dt class="col-span-1 text-ink-muted">Patient</dt>
              <dd class="col-span-2 text-ink">{{ d.patient_initials || '—' }} <span class="font-mono text-ink-muted">{{ d.patient_uhid }}</span></dd>

              <dt class="col-span-1 text-ink-muted">Tests</dt>
              <dd class="col-span-2 text-ink">{{ d.test_count }} test(s)</dd>

              <dt class="col-span-1 text-ink-muted">Status</dt>
              <dd class="col-span-2">
                <span [class]="statusChipCls(d.state)">{{ d.state }}</span>
              </dd>

              @if (d.reported_at) {
                <dt class="col-span-1 text-ink-muted">Reported</dt>
                <dd class="col-span-2 text-ink">{{ formatDate(d.reported_at) }}</dd>
              }
            </dl>
          }

          <p class="mt-5 text-[10.5px] text-ink-muted text-center border-t border-border pt-3">
            For the full document, please log in to the patient portal or contact your lab branch.
            <br/>Verified at {{ formatDate(d.verified_at) }}.
          </p>
        }
      </main>
    </div>
  `,
})
export class VerifyPage implements OnInit {
  private route = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);

  protected readonly loading  = signal(true);
  protected readonly notFound = signal(false);
  protected readonly data     = signal<any | null>(null);
  protected kind: 'invoice' | 'report' = 'invoice';

  async ngOnInit() {
    const path = this.route.snapshot.url.map(s => s.path);
    // /v/inv/:number  → path = ['inv', '<number>']
    // /v/report/:id   → path = ['report', '<uuid>']
    this.kind = (path[0] === 'report') ? 'report' : 'invoice';
    const arg = path[1] ?? '';
    try {
      const { data, error } = await (this.supabase.client as any).rpc(
        this.kind === 'report' ? 'verify_lab_order_public' : 'verify_invoice_public',
        this.kind === 'report' ? { p_order_id: arg } : { p_number: arg },
      );
      if (error) throw error;
      if (!data || data.found === false) {
        this.notFound.set(true);
      } else {
        this.data.set(data);
      }
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
      .format((cents ?? 0) / 100);
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  protected statusChipCls(s: string): string {
    const tone: Record<string, string> = {
      paid: 'bg-good-bg text-good-fg', issued: 'bg-info-bg text-info-fg',
      partially_paid: 'bg-warn-bg text-warn-fg', draft: 'bg-surface-subtle text-ink-muted',
      void: 'bg-surface-subtle text-ink-muted line-through', refunded: 'bg-danger-bg text-danger-fg',
      verified: 'bg-good-bg text-good-fg', report_ready: 'bg-info-bg text-info-fg',
      delivered: 'bg-good-bg text-good-fg', in_process: 'bg-warn-bg text-warn-fg',
    };
    const c = tone[s] ?? 'bg-surface-subtle text-ink-soft';
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-medium uppercase tracking-wider ${c}`;
  }
}
