import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { BranchStore } from '../branches/branch.store';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

/**
 * Click-to-chat WhatsApp dispatcher.
 *
 * Flow:
 *  1. Caller asks for a public token for the invoice/lab order being shared.
 *  2. We build a `wa.me/<phone>?text=…` URL and open it in a new tab.
 *  3. The staff member's WhatsApp Web (already signed in to the Sree Diagnostics lab
 *     number) picks up the pre-filled message — they press Send.
 *  4. We log a row in `whatsapp_messages` so the audit trail shows who
 *     dispatched what and when.
 *
 * No outbound API calls — entirely browser-driven. Zero per-message cost,
 * no Meta approvals required.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private supabase = inject(SupabaseService);
  private branches = inject(BranchStore);
  private auth     = inject(AuthStore);

  /**
   * Public base URL used for WhatsApp / SMS share links.
   * Priority: explicit baseUrl arg → environment.publicBaseUrl → window.origin.
   * The first two take precedence so the link points at a deployed domain
   * even when staff send from a localhost dev build.
   */
  private resolveBaseUrl(override?: string): string {
    if (override && override.trim()) return override.replace(/\/$/, '');
    const envUrl = (environment as { publicBaseUrl?: string }).publicBaseUrl;
    if (envUrl && envUrl.trim()) return envUrl.replace(/\/$/, '');
    return (typeof window !== 'undefined' ? window.location.origin : '').replace(/\/$/, '');
  }

  /** Normalise an Indian mobile number to E.164 digits (no '+'), e.g.
   *  '+919811001001' or '09811001001' → '919811001001'. */
  toE164(mobile: string | null | undefined): string | null {
    if (!mobile) return null;
    let s = String(mobile).replace(/\D/g, '');
    if (s.length === 0) return null;
    if (s.startsWith('0')) s = s.slice(1);
    if (s.length === 10) s = '91' + s;
    if (!/^\d{12}$/.test(s)) return null;     // E.164 IN = 12 digits
    return s;
  }

  /** Mint or reuse a token for an invoice's public URL (30-day TTL). */
  async ensureInvoiceToken(invoiceId: string): Promise<string> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('issue_invoice_public_token', { p_invoice_id: invoiceId });
    if (error) throw error;
    return data as string;
  }

  async ensureLabOrderToken(orderId: string): Promise<string> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('issue_lab_order_public_token', { p_order_id: orderId });
    if (error) throw error;
    return data as string;
  }

  /** Open `wa.me/<phone>?text=...` in a new tab. Always returns the URL we
   *  attempted to open so callers can paste it as a manual fallback if the
   *  popup was blocked. */
  openChat(phoneRaw: string, text: string): { ok: boolean; url: string; phone: string | null } {
    const phone = this.toE164(phoneRaw);
    if (!phone) return { ok: false, url: '', phone: null };
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    const win = window.open(url, '_blank', 'noopener');
    return { ok: !!win, url, phone };
  }

  // ── Editable templates (Settings → WhatsApp messages) ───────────────
  // Loaded lazily and cached for 60s so every send doesn't hit the DB.
  private _templatesCache: { data: any; at: number } | null = null;
  private async loadTemplates(): Promise<any> {
    const now = Date.now();
    if (this._templatesCache && now - this._templatesCache.at < 60_000) {
      return this._templatesCache.data;
    }
    const { data } = await (this.supabase.client as any)
      .from('system_settings').select('value').eq('key', 'wa_templates_v1').maybeSingle();
    const value = data?.value ?? null;
    this._templatesCache = { data: value, at: now };
    return value;
  }
  /** Public — let admin tabs invalidate the cache after saving. */
  invalidateTemplatesCache(): void { this._templatesCache = null; }

  /** Substitute {{key}} placeholders in a template body. */
  private applyVars(body: string, vars: Record<string, string>): string {
    return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? `[${k}]`);
  }

  /** Resolve the active company/branch name shown in templates. */
  private companyName(): string {
    return this.branches.activeBranchName() || 'Sree Diagnostics';
  }

  /** Compose the bill message body. Reads the admin-editable template
   *  from system_settings; falls back to a clean default if absent. */
  async composeBillMessage(input: {
    patientName: string;
    invoiceNo: string;
    amount: number;        // rupees
    link: string;
  }): Promise<string> {
    const tpl = await this.loadTemplates();
    const body: string = tpl?.bill?.body
      ?? `Hi {{first_name}},

Your bill from {{company_name}} is ready.
Invoice: {{invoice_no}}
Amount: {{amount}}

View / save your bill:
{{viewer_url}}

Thanks for choosing {{company_name}}!`;
    return this.applyVars(body, {
      first_name:   input.patientName.split(' ')[0] || 'patient',
      full_name:    input.patientName,
      invoice_no:   input.invoiceNo,
      amount:       `₹${Math.round(input.amount).toLocaleString('en-IN')}`,
      viewer_url:   input.link,
      company_name: this.companyName(),
    });
  }

  async composeReportMessage(input: {
    patientName: string;
    testList: string[];    // codes or names
    /** Direct .pdf URL — WhatsApp renders this as a document attachment card. */
    pdfUrl?: string;
    /** Fallback online viewer URL (the existing /public/lab-report page). */
    viewerUrl: string;
  }): Promise<string> {
    const tpl = await this.loadTemplates();
    const body: string = tpl?.report?.body
      ?? `Hi {{first_name}},

Your lab report is ready.
Tests: {{test_list}}

📄 Download PDF:
{{pdf_url}}

View online:
{{viewer_url}}

— {{company_name}}`;

    const tests = input.testList.slice(0, 6).join(', ') +
      (input.testList.length > 6 ? ` +${input.testList.length - 6} more` : '');

    let composed = this.applyVars(body, {
      first_name:   input.patientName.split(' ')[0] || 'patient',
      full_name:    input.patientName,
      test_list:    tests,
      pdf_url:      input.pdfUrl ?? input.viewerUrl,   // fall back to viewer if PDF mint failed
      viewer_url:   input.viewerUrl,
      company_name: this.companyName(),
    });

    // Auto-append the Google review block when admin has enabled it.
    const rr = tpl?.review_request;
    if (rr?.enabled && rr?.auto_after_report && rr?.url && rr?.body) {
      const reviewBlock = this.applyVars(rr.body, {
        first_name:   input.patientName.split(' ')[0] || 'patient',
        full_name:    input.patientName,
        company_name: this.companyName(),
        review_url:   rr.url,
      });
      composed = composed + reviewBlock;
    }
    return composed;
  }

  /** Render the public report in a hidden iframe in `?upload=1` mode and
   *  wait for the page to post the resulting public PDF URL back. Resolves
   *  with `null` if generation fails or times out — caller should fall back
   *  to the viewer-only link in that case so dispatch is never blocked. */
  private async mintReportPdf(viewerUrl: string, timeoutMs = 25000): Promise<string | null> {
    const url = viewerUrl + (viewerUrl.includes('?') ? '&' : '?') + 'upload=1';
    return new Promise<string | null>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        clearTimeout(timer);
        try { iframe.remove(); } catch { /* gone */ }
      };
      const onMsg = (ev: MessageEvent) => {
        const m = ev.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'pdf-ready' && typeof m.url === 'string') {
          cleanup();
          resolve(m.url);
        } else if (m.type === 'pdf-error') {
          console.warn('[whatsapp] PDF mint failed:', m.reason);
          cleanup();
          resolve(null);
        }
      };
      const timer = setTimeout(() => {
        console.warn('[whatsapp] PDF mint timed out');
        cleanup();
        resolve(null);
      }, timeoutMs);

      window.addEventListener('message', onMsg);
      document.body.appendChild(iframe);
    });
  }

  /** Record a dispatch attempt. Failure is non-fatal — we don't block the
   *  send-tab opening on a logging error. */
  async logSend(input: {
    patient_id: string | null;
    to_phone: string;
    message_type: 'bill' | 'lab_report' | 'reminder' | 'custom';
    message_text: string;
    public_url: string | null;
    pdf_url?: string | null;
    related_invoice_id?: string | null;
    related_lab_order_id?: string | null;
  }): Promise<void> {
    try {
      await (this.supabase.client as any).from('whatsapp_messages').insert({
        branch_id: this.branches.activeBranchId(),
        patient_id: input.patient_id,
        to_phone: input.to_phone,
        message_type: input.message_type,
        message_text: input.message_text,
        public_url: input.public_url,
        pdf_url: input.pdf_url ?? null,
        related_invoice_id: input.related_invoice_id ?? null,
        related_lab_order_id: input.related_lab_order_id ?? null,
        triggered_by: (this.auth.claims() as any)?.sub ?? null,
      });
    } catch (e) {
      console.warn('[whatsapp] could not log dispatch', e);
    }
  }

  /** Convenience — full dispatch flow for a paid invoice. Returns the URL
   *  in case the popup was blocked and the UI wants to surface it as a
   *  copy-link fallback. */
  async sendBill(input: {
    invoiceId: string;
    invoiceNo: string;
    patient: { id: string; full_name: string | null; mobile: string | null };
    amountRupees: number;
    baseUrl?: string;     // override window.location.origin for tests
  }): Promise<{ ok: boolean; url: string; reason?: string }> {
    if (!input.patient.mobile) return { ok: false, url: '', reason: 'No mobile on file' };
    const phone = this.toE164(input.patient.mobile);
    if (!phone) return { ok: false, url: '', reason: 'Mobile is not a valid 10-digit number' };
    const token = await this.ensureInvoiceToken(input.invoiceId);
    const origin = this.resolveBaseUrl(input.baseUrl);
    // ?download=1 makes the public page auto-trigger Save-as-PDF on mobile.
    const link = `${origin}/public/invoice/${token}?download=1`;
    const message = await this.composeBillMessage({
      patientName: input.patient.full_name || 'patient',
      invoiceNo: input.invoiceNo,
      amount: input.amountRupees,
      link,
    });
    const opened = this.openChat(phone, message);
    await this.logSend({
      patient_id: input.patient.id,
      to_phone: phone,
      message_type: 'bill',
      message_text: message,
      public_url: link,
      related_invoice_id: input.invoiceId,
    });
    return { ok: opened.ok, url: opened.url, reason: opened.ok ? undefined : 'Popup blocked — copy the link manually.' };
  }

  async sendLabReport(input: {
    labOrderId: string;
    patient: { id: string; full_name: string | null; mobile: string | null };
    testList: string[];
    baseUrl?: string;
  }): Promise<{ ok: boolean; url: string; pdfUrl?: string; reason?: string }> {
    if (!input.patient.mobile) return { ok: false, url: '', reason: 'No mobile on file' };
    const phone = this.toE164(input.patient.mobile);
    if (!phone) return { ok: false, url: '', reason: 'Mobile is not a valid 10-digit number' };
    const token = await this.ensureLabOrderToken(input.labOrderId);
    const origin = this.resolveBaseUrl(input.baseUrl);
    const viewerUrl = `${origin}/public/lab-report/${token}`;

    // Mint the PDF first so the WhatsApp message can carry a direct .pdf URL
    // (WhatsApp renders these as document cards with one-tap download instead
    // of a generic web preview). Falls back to viewer-only when generation
    // fails so the user is never blocked.
    const pdfUrl = await this.mintReportPdf(viewerUrl);

    const message = await this.composeReportMessage({
      patientName: input.patient.full_name || 'patient',
      testList: input.testList,
      pdfUrl: pdfUrl ?? undefined,
      viewerUrl,
    });
    const opened = this.openChat(phone, message);
    await this.logSend({
      patient_id: input.patient.id,
      to_phone: phone,
      message_type: 'lab_report',
      message_text: message,
      public_url: viewerUrl,
      pdf_url: pdfUrl,
      related_lab_order_id: input.labOrderId,
    });
    return {
      ok: opened.ok,
      url: opened.url,
      pdfUrl: pdfUrl ?? undefined,
      reason: opened.ok ? undefined : 'Popup blocked — copy the link manually.',
    };
  }
}
