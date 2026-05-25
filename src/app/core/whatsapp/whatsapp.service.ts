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

  /** Compose the bill message body. Keep within ~600 chars so it fits one
   *  WhatsApp bubble cleanly. */
  composeBillMessage(input: {
    patientName: string;
    invoiceNo: string;
    amount: number;        // rupees
    link: string;
  }): string {
    const amt = `₹${Math.round(input.amount).toLocaleString('en-IN')}`;
    return (
`Hi ${input.patientName.split(' ')[0]},

Your bill from Sree Diagnostics is ready.
Invoice: ${input.invoiceNo}
Amount paid: ${amt}

View / save your bill:
${input.link}

Thanks for choosing Sree Diagnostics!`);
  }

  composeReportMessage(input: {
    patientName: string;
    testList: string[];    // codes or names
    link: string;
  }): string {
    const tests = input.testList.slice(0, 6).join(', ') +
      (input.testList.length > 6 ? ` +${input.testList.length - 6} more` : '');
    return (
`Hi ${input.patientName.split(' ')[0]},

Your lab report is ready.
Tests: ${tests}

View securely:
${input.link}

— Sree Diagnostics`);
  }

  /** Record a dispatch attempt. Failure is non-fatal — we don't block the
   *  send-tab opening on a logging error. */
  async logSend(input: {
    patient_id: string | null;
    to_phone: string;
    message_type: 'bill' | 'lab_report' | 'reminder' | 'custom';
    message_text: string;
    public_url: string | null;
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
    const message = this.composeBillMessage({
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
  }): Promise<{ ok: boolean; url: string; reason?: string }> {
    if (!input.patient.mobile) return { ok: false, url: '', reason: 'No mobile on file' };
    const phone = this.toE164(input.patient.mobile);
    if (!phone) return { ok: false, url: '', reason: 'Mobile is not a valid 10-digit number' };
    const token = await this.ensureLabOrderToken(input.labOrderId);
    const origin = this.resolveBaseUrl(input.baseUrl);
    // ?download=1 makes the public page auto-trigger Save-as-PDF on mobile.
    const link = `${origin}/public/lab-report/${token}?download=1`;
    const message = this.composeReportMessage({
      patientName: input.patient.full_name || 'patient',
      testList: input.testList,
      link,
    });
    const opened = this.openChat(phone, message);
    await this.logSend({
      patient_id: input.patient.id,
      to_phone: phone,
      message_type: 'lab_report',
      message_text: message,
      public_url: link,
      related_lab_order_id: input.labOrderId,
    });
    return { ok: opened.ok, url: opened.url, reason: opened.ok ? undefined : 'Popup blocked — copy the link manually.' };
  }
}
