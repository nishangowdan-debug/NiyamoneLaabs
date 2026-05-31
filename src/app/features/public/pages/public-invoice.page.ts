import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { BillingInvoicePdfService } from '../../../features/billing/services/billing-invoice-pdf.service';
import type { HospitalSettings } from '../../../features/billing/services/hospital-settings.service';
import type { InvoiceDetail } from '../../../features/billing/data/billing.types';

/**
 * Token-secured invoice view served to patients via the WhatsApp link.
 *
 * Renders the EXACT same branded HTML the in-app print produces —
 * BillingInvoicePdfService.renderHtml() — so the patient's WhatsApp
 * download and the staff's printed copy are pixel-identical (letterhead,
 * GST split, INHOUSE/OUTSOURCE badges, footer seals, accreditations,
 * terms, etc.).
 *
 * Data is fetched via the SECURITY DEFINER RPC `get_invoice_print_bundle`
 * which returns invoice + items + patient + hospital_settings in a
 * single anon-callable round-trip.
 */
@Component({
  selector: 'app-public-invoice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (loading()) {
      <div class="min-h-screen bg-slate-50 grid place-items-center">
        <p class="text-slate-500 py-12">Loading invoice…</p>
      </div>
    } @else if (error()) {
      <div class="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div class="bg-white border border-amber-300 rounded-lg p-6 text-center max-w-md">
          <h1 class="text-xl font-medium text-amber-700 mb-2">Link unavailable</h1>
          <p class="text-sm text-slate-600">{{ error() }}</p>
          <p class="text-xs text-slate-400 mt-3">For a fresh link, contact Sree Diagnostics.</p>
        </div>
      </div>
    } @else if (html(); as h) {
      <!-- The generated HTML is a complete <!DOCTYPE html> document with
           its own <head> + <body> + inline styles. We inject it as-is so
           the patient's PDF matches the staff print byte-for-byte. -->
      <div class="bg-slate-50 min-h-screen" [innerHTML]="h"></div>

      <!-- Floating save bar — hidden when printing -->
      <div class="fixed bottom-3 right-3 print:hidden flex items-center gap-2">
        <button (click)="savePdf()" class="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium shadow-lg">
          💾 Save as PDF
        </button>
      </div>
    }
  `,
})
export class PublicInvoicePage implements OnInit {
  private route    = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);
  private pdf      = inject(BillingInvoicePdfService);
  private sanitizer = inject(DomSanitizer);

  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly html    = signal<SafeHtml | null>(null);

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Missing access token.');
      this.loading.set(false);
      return;
    }

    try {
      const { data, error } = await (this.supabase.client as any)
        .rpc('get_invoice_print_bundle', { p_token: token });

      if (error) throw error;
      if (!data || data.found === false) {
        this.error.set('This link has expired or is invalid. Please request a fresh link from Sree Diagnostics.');
        return;
      }

      const invoice = this.normaliseInvoice(data.invoice);
      const settings = (data.settings ?? {}) as HospitalSettings;

      // Render with the SAME pipeline as the in-app print. Sigantures are
      // intentionally omitted — staff signature images are private. The
      // QR code is included because show_qr is a public-facing setting and
      // the verification URL is itself public.
      const htmlString = this.pdf.renderHtml({
        invoice,
        settings,
        signatures: [],
      });
      this.html.set(this.sanitizer.bypassSecurityTrustHtml(htmlString));

      // Title → human-readable filename when the patient hits Save-as-PDF
      try {
        const patient = (invoice.patient?.full_name || 'Patient').trim();
        const d = new Date(invoice.invoice_date || Date.now());
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dateStr = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
        const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
        document.title = `${safe(patient)}_${dateStr}_${safe(invoice.invoice_number ?? '')}`;
      } catch { /* non-fatal */ }

      // Best-effort tracking — when the patient opens the link
      this.markOpened(token).catch(() => {});

      // ?download=1 → auto Save-as-PDF, used by the WhatsApp share flow
      if (this.route.snapshot.queryParamMap.get('download') === '1') {
        setTimeout(() => { try { window.print(); } catch { /* user-blocked */ } }, 600);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not load invoice.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Shape the RPC payload into the InvoiceDetail the renderer expects.
   *  Defensive about nulls because seed data sometimes lacks fields. */
  private normaliseInvoice(raw: any): InvoiceDetail {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return {
      ...raw,
      items: items.map((it: any) => ({
        ...it,
        qty:              Number(it.qty ?? 0),
        unit_price_cents: Number(it.unit_price_cents ?? 0),
        total_cents:      Number(it.total_cents ?? 0),
        taxable_cents:    Number(it.taxable_cents ?? 0),
        discount_cents:   Number(it.discount_cents ?? 0),
        cgst_cents:       Number(it.cgst_cents ?? 0),
        sgst_cents:       Number(it.sgst_cents ?? 0),
        igst_cents:       Number(it.igst_cents ?? 0),
      })),
      payments: [],   // public renderer doesn't display the payments list
    } as InvoiceDetail;
  }

  private async markOpened(token: string) {
    const url = `${window.location.origin}/public/invoice/${token}`;
    try {
      await (this.supabase.client as any)
        .from('whatsapp_messages')
        .update({ link_opened_at: new Date().toISOString() })
        .eq('public_url', url)
        .is('link_opened_at', null);
    } catch { /* RLS on whatsapp_messages may reject anon — silent */ }
  }

  protected savePdf() {
    window.print();
  }
}
