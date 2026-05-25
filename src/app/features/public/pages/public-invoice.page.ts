import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/**
 * Token-secured invoice view served to patients via WhatsApp link. No auth
 * required — RLS on `invoices` allows anon SELECT when public_token is set
 * and unexpired. The token lives in the URL path.
 */
@Component({
  selector: 'app-public-invoice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe, DecimalPipe],
  template: `
    <div class="min-h-screen bg-slate-50 py-6 px-4">
      <div class="max-w-2xl mx-auto">
        @if (loading()) {
          <p class="text-center text-slate-500 py-12">Loading…</p>
        } @else if (error()) {
          <div class="bg-white border border-amber-300 rounded-lg p-6 text-center">
            <h1 class="text-xl font-medium text-amber-700 mb-2">Link unavailable</h1>
            <p class="text-sm text-slate-600">{{ error() }}</p>
            <p class="text-xs text-slate-400 mt-3">For a fresh link, contact Sree Diagnostics.</p>
          </div>
        } @else if (invoice(); as inv) {
          <header class="bg-white border border-slate-200 rounded-t-lg p-5 flex items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-slate-900">Sree Diagnostics</h1>
              <p class="text-xs text-slate-500">Vijayawada, Andhra Pradesh</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] uppercase tracking-wider text-slate-500">Invoice</p>
              <p class="font-mono text-sm text-slate-900">{{ inv.invoice_number }}</p>
              <p class="text-xs text-slate-500 mt-1">{{ inv.invoice_date | date:'d MMM yyyy' }}</p>
              <span class="inline-block mt-1 px-2 py-px text-[10px] rounded-full"
                    [class.bg-emerald-100]="inv.status === 'paid'"
                    [class.text-emerald-700]="inv.status === 'paid'"
                    [class.bg-amber-100]="inv.status !== 'paid'"
                    [class.text-amber-700]="inv.status !== 'paid'">
                {{ inv.status }}
              </span>
            </div>
          </header>

          <section class="bg-white border-x border-slate-200 px-5 py-3 text-sm">
            <p class="text-slate-800 font-medium">{{ inv.patient?.full_name || '—' }}</p>
            <p class="text-xs text-slate-500 font-mono">
              UHID {{ inv.patient?.uhid }}
              @if (inv.patient?.mobile) { · {{ inv.patient.mobile }} }
            </p>
          </section>

          <table class="w-full bg-white border-x border-slate-200 text-sm">
            <thead class="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2 text-left">Description</th>
                <th class="px-3 py-2 text-right">Qty</th>
                <th class="px-3 py-2 text-right">Rate</th>
                <th class="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (it of items(); track it.id) {
                <tr class="border-t border-slate-100">
                  <td class="px-4 py-2 text-slate-800">{{ it.description }}</td>
                  <td class="px-3 py-2 text-right font-mono text-slate-600">{{ it.qty }}</td>
                  <td class="px-3 py-2 text-right font-mono text-slate-600">₹{{ (it.unit_price_cents / 100) | number:'1.0-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-slate-900">₹{{ (it.total_cents / 100) | number:'1.0-2' }}</td>
                </tr>
              }
              <tr class="border-t border-slate-200 bg-slate-50">
                <td colspan="3" class="px-4 py-2 text-right text-xs text-slate-500">Subtotal</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ (inv.subtotal_cents / 100) | number:'1.0-2' }}</td>
              </tr>
              @if ((inv.cgst_cents + inv.sgst_cents + inv.igst_cents) > 0) {
                <tr class="bg-slate-50">
                  <td colspan="3" class="px-4 py-2 text-right text-xs text-slate-500">GST</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ ((inv.cgst_cents + inv.sgst_cents + inv.igst_cents) / 100) | number:'1.0-2' }}</td>
                </tr>
              }
            </tbody>
          </table>

          <footer class="bg-blue-600 text-white border-x border-b border-blue-600 rounded-b-lg px-5 py-4 flex items-center justify-between">
            <span class="text-sm font-medium">Total amount</span>
            <span class="text-2xl font-mono font-semibold">₹{{ (inv.total_cents / 100) | number:'1.0-2' }}</span>
          </footer>

          <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Paid ₹{{ (inv.paid_cents / 100) | number:'1.0-2' }} · Outstanding ₹{{ (inv.balance_cents / 100) | number:'1.0-2' }}</span>
            <button (click)="savePdf()" class="px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">
              💾 Save as PDF
            </button>
          </div>

          <p class="text-center text-[10px] text-slate-400 mt-6">
            Sree Diagnostics · This link expires {{ inv.public_token_expires_at | date:'d MMM yyyy' }} ·
            Reach us at infosrinivasa&#64;sreediagnostics.in
          </p>
        }
      </div>
    </div>
  `,
})
export class PublicInvoicePage implements OnInit {
  private route    = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);

  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly invoice = signal<any | null>(null);
  protected readonly items   = computed(() => (this.invoice()?.items ?? []) as any[]);

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Missing access token.');
      this.loading.set(false);
      return;
    }
    try {
      // Anon SELECT allowed by `invoice_public_token_read` RLS.
      const { data, error } = await (this.supabase.client as any)
        .from('invoices')
        .select(`*,
                 patient:patient_id(uhid, full_name, mobile),
                 items:invoice_items(*)`)
        .eq('public_token', token)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        this.error.set('This link has expired or is invalid. Please request a fresh link from Sree Diagnostics.');
      } else {
        // Sort items by position for stable display
        data.items = (data.items ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
        this.invoice.set(data);
        // Update link_opened_at on the most recent matching dispatch (best-effort)
        this.markOpened(token).catch(() => {});

        // Set a sensible filename via document.title so Save-as-PDF lands on a
        // human-readable name. Same convention as the staff-side print flow.
        try {
          const patient = (data.patient?.full_name || 'Patient').trim();
          const d = new Date((data as any).invoice_date || Date.now());
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dateStr = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
          const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
          document.title = `${safe(patient)}_${dateStr}_${safe(data.invoice_number ?? '')}`;
        } catch { /* non-fatal */ }

        // ?download=1 in the URL → auto-trigger Save-as-PDF dialog so the
        // patient gets the PDF in one tap from WhatsApp.
        if (this.route.snapshot.queryParamMap.get('download') === '1') {
          // Wait for layout to settle before invoking print.
          setTimeout(() => { try { window.print(); } catch { /* user-blocked */ } }, 600);
        }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not load invoice.');
    } finally {
      this.loading.set(false);
    }
  }

  private async markOpened(token: string) {
    const url = `${window.location.origin}/public/invoice/${token}`;
    await (this.supabase.client as any)
      .from('whatsapp_messages')
      .update({ link_opened_at: new Date().toISOString() })
      .eq('public_url', url)
      .is('link_opened_at', null);
  }

  protected savePdf() {
    window.print();
  }
}
