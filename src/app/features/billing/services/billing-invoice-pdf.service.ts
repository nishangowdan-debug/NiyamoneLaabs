import { Injectable } from '@angular/core';
import type { HospitalSettings, SealAsset } from './hospital-settings.service';
import type { InvoiceDetail } from '../data/billing.types';
import type { TokenSlipData } from '../../appointments/data/appointments.types';
import { renderFooterHTML, FOOTER_CSS, FooterSignatureInput } from '../../../shared/print/footer-renderer';

export interface InvoicePrintOptions {
  headerMode?: 'with-header' | 'no-header';
  footerMode?: 'with-footer' | 'no-footer';
  letterheadTopMm?: number;
  letterheadBottomMm?: number;
  /** If false, opens preview without auto-print (caller can fire window.print()). */
  autoPrint?: boolean;
}

interface BillingInvoiceData {
  invoice: InvoiceDetail;
  settings: HospitalSettings;
  /** Optional OPD token info — when present, the receipt prints a token card. */
  token?: TokenSlipData | null;
  /** Map of lab_tests.code (or test name, lowercased) → routing. Renders a
   *  small Inhouse / Outsource badge next to lab line descriptions on the PDF. */
  routing?: Map<string, 'inhouse' | 'outsource'>;
  /** Print options (letterhead toggle). Defaults to with-header + with-footer. */
  print?: InvoicePrintOptions;
  /** ISO datetime for the patient's appointment / home-pickup. Rendered in the
   *  "Visit details" block below the totals. */
  appointmentAt?: string | null;
  /** Free-form patient address (multi-line OK). Rendered in the "Visit details"
   *  block below the totals. */
  patientAddress?: string | null;
  /** Resolved signature blocks for the footer. Caller decides which staff
   *  appear (e.g. authorised signatory, cashier). */
  signatures?: FooterSignatureInput[];
}

@Injectable({ providedIn: 'root' })
export class BillingInvoicePdfService {
  generatePDF(data: BillingInvoiceData): void {
    const html = this.generateHTML(data);
    const filename = this.makeFilename(data);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', filename);
    iframe.setAttribute('name', filename);
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) { iframe.remove(); return; }
    doc.open();
    doc.write(html);
    doc.close();
    try { doc.title = filename; } catch {}

    const originalTitle = document.title;
    document.title = filename;

    const cleanup = () => {
      document.title = originalTitle;
      setTimeout(() => { try { iframe.remove(); } catch {} }, 1000);
    };
    const autoPrint = data.print?.autoPrint !== false;
    const triggerPrint = () => {
      try {
        if (iframe.contentDocument) iframe.contentDocument.title = filename;
        iframe.contentWindow?.focus();
        if (autoPrint) iframe.contentWindow?.print();
      } finally {
        iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 60_000);
      }
    };
    if (doc.readyState === 'complete') triggerPrint();
    else iframe.addEventListener('load', triggerPrint, { once: true });
  }

  /** Build a clean PDF filename: "PatientName_DD-MMM-YYYY_InvoiceNo". */
  private makeFilename(data: BillingInvoiceData): string {
    const inv = data.invoice;
    const patient = (inv.patient?.full_name
      || `${inv.patient?.first_name ?? ''} ${inv.patient?.last_name ?? ''}`.trim()
      || 'Patient').trim();
    const raw = (inv as any).invoice_date ?? (inv as any).created_at ?? new Date().toISOString();
    const d = new Date(raw);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = isNaN(d.getTime())
      ? 'Unknown'
      : `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    return `${safe(patient)}_${dateStr}_${safe(inv.invoice_number)}`;
  }

  private generateHTML(data: BillingInvoiceData): string {
    const { invoice, settings, token, routing, print } = data;
    const totalRupees = (invoice.total_cents / 100).toFixed(2);
    const taxableRupees = ((invoice.subtotal_cents - invoice.discount_cents) / 100).toFixed(2);
    const gstRupees = ((invoice.cgst_cents + invoice.sgst_cents + invoice.igst_cents) / 100).toFixed(2);

    const headerMode = print?.headerMode ?? settings.lab_report_print_mode?.headerMode ?? 'with-header';
    const footerMode = print?.footerMode ?? settings.lab_report_print_mode?.footerMode ?? 'with-footer';
    const topMm = headerMode === 'no-header'
      ? (print?.letterheadTopMm ?? settings.lab_report_print_mode?.letterheadTopMm ?? 38)
      : 10;
    const botMm = footerMode === 'no-footer'
      ? (print?.letterheadBottomMm ?? settings.lab_report_print_mode?.letterheadBottomMm ?? 30)
      : 10;

    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length >= 2);
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const routingFor = (item: any): 'inhouse' | 'outsource' | null => {
      if (item?.routing === 'inhouse' || item?.routing === 'outsource') return item.routing;
      if (!routing || routing.size === 0) return null;
      const codeFromJoin = item?.service?.code;
      if (codeFromJoin) {
        if (routing.has(codeFromJoin)) return routing.get(codeFromJoin)!;
        if (routing.has(codeFromJoin.toLowerCase())) return routing.get(codeFromJoin.toLowerCase())!;
      }
      const desc = String(item?.description ?? '').toLowerCase().trim();
      if (!desc) return null;
      if (routing.has(desc)) return routing.get(desc)!;
      for (const [key, val] of routing) {
        if (key.startsWith('TOKENS:')) continue;
        if (key.length < 2) continue;
        if (new RegExp(`\\b${escapeRe(key)}\\b`, 'i').test(desc)) return val;
      }
      const descTokens = tokenize(desc);
      const descSig = [...descTokens].sort().join(' ');
      if (descSig && routing.has('TOKENS:' + descSig)) return routing.get('TOKENS:' + descSig)!;
      let best: { score: number; val: 'inhouse' | 'outsource' } | null = null;
      for (const [key, val] of routing) {
        if (!key.startsWith('TOKENS:')) continue;
        const keyTokens = key.slice('TOKENS:'.length).split(' ');
        if (keyTokens.length === 0 || descTokens.length === 0) continue;
        const overlap = keyTokens.filter((t) => descTokens.includes(t)).length;
        const score = overlap / Math.min(keyTokens.length, descTokens.length);
        if (score >= 0.5 && (!best || score > best.score)) best = { score, val };
      }
      return best?.val ?? null;
    };
    const badge = (r: 'inhouse' | 'outsource' | null) => {
      if (r === 'inhouse')
        return ` <span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#EEF2FF;color:#3730A3;border:1px solid #C7D2FE;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Inhouse</span>`;
      if (r === 'outsource')
        return ` <span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#F5F3FF;color:#5B21B6;border:1px solid #DDD6FE;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">Outsource</span>`;
      return '';
    };

    const itemsHTML = invoice.items.map((item, idx) => `
      <tr>
        <td class="cnum">${idx + 1}</td>
        <td>${escape(item.description)}${badge(routingFor(item))}</td>
        <td class="cnum">${item.qty.toFixed(2)}</td>
        <td class="rnum">₹${(item.unit_price_cents / 100).toFixed(2)}</td>
        <td class="rnum bold">₹${(item.total_cents / 100).toFixed(2)}</td>
      </tr>
    `).join('');

    const dense = invoice.items.length > 8;

    const logo = settings.logo_url || settings.hospital_logo_url || '';
    const headerSeals: SealAsset[] = Array.isArray(settings.header_seal_urls) ? settings.header_seal_urls : [];
    // footerSeals + accreditations are now read by renderFooterHTML directly.

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escape(this.makeFilename(data))}</title>
<style>
  @page { size: A4 portrait; margin: ${topMm}mm 10mm ${botMm}mm 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #f3f4f6; line-height: 1.35; position: relative; }
  .container { max-width: 210mm; margin: 0 auto; background: #fff; padding: 8mm 8mm 6mm; box-shadow: 0 2px 10px rgba(0,0,0,0.08); position: relative; }

  .print-btn {
    position: fixed; top: 12px; right: 12px; padding: 9px 18px;
    background: #0d5a96; color: #fff; border: 0; border-radius: 6px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 99;
  }

  /* ── Header (Sree style) ── */
  .header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #0d5a96; margin-bottom: 10px; }
  .h-left { display: flex; gap: 10px; align-items: flex-start; }
  .h-logo { width: 60px; height: 60px; object-fit: contain; flex-shrink: 0; }
  .h-logo-fallback { width: 60px; height: 60px; background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%); border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: bold; flex-shrink: 0; }
  .h-addr { font-size: 9.5px; color: #1f2937; line-height: 1.45; }
  .h-addr strong { display: block; color: #0d5a96; font-size: 11px; margin-bottom: 1px; }
  .h-center { display: flex; gap: 6px; justify-content: center; align-items: center; }
  .h-center img { max-height: 46px; max-width: 60px; object-fit: contain; }
  .h-right { text-align: right; }
  .h-name { font-size: 18px; font-weight: 800; color: #0d5a96; line-height: 1.05; letter-spacing: -0.3px; }
  .h-tag { font-size: 10px; color: #0d5a96; font-style: italic; margin-top: 2px; }
  .h-gstin { color: #0d5a96; font-weight: 700; margin-top: 4px; font-size: 10px; }

  /* ── 3-col card grid: TOKEN · INVOICE · DATE ── */
  .meta-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8px; margin: 8px 0 12px; }
  .meta-card { padding: 10px 12px; border-radius: 6px; background: #f9fafb; border: 1px solid #e5e7eb; }
  .meta-card .label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 600; }
  .meta-card .value { font-size: 13px; font-weight: 600; color: #111827; margin-top: 2px; }
  .meta-card .sub { font-size: 10.5px; color: #6b7280; margin-top: 2px; }

  .token-card { background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%); border-color: #0d5a96; color: #fff; }
  .token-card .label { color: rgba(255,255,255,0.75); }
  .token-card .value { color: #fff; }
  .token-card .sub   { color: rgba(255,255,255,0.85); }
  .token-card .num   { font-size: 36px; font-weight: 800; line-height: 1; letter-spacing: -1px; margin: 4px 0; }

  .patient { padding: 8px 0 10px; border-bottom: 1px dashed #e5e7eb; margin-bottom: 12px; font-size: 11.5px; color: #374151; }
  .patient .ll { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 600; margin-right: 8px; }
  .patient strong { color: #111827; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
  thead { background: #0d5a96; color: #fff; }
  th { padding: ${dense ? '6px 8px' : '8px 10px'}; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px; }
  td { padding: ${dense ? '6px 8px' : '8px 10px'}; border-bottom: 1px solid #e5e7eb; font-size: 11.5px; }
  td.cnum { text-align: center; font-variant-numeric: tabular-nums; }
  td.rnum { text-align: right; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 700; color: #111827; }
  tbody tr:nth-child(even) { background: #fafbfc; }

  .totals { display: grid; grid-template-columns: 1fr auto; gap: 4px 24px; margin: 4px 0 6px; padding: 0 4px; font-size: 11.5px; color: #4b5563; }
  .totals .lbl { text-align: right; }
  .totals .val { text-align: right; font-variant-numeric: tabular-nums; min-width: 90px; }
  .total-box { background: #0d5a96; color: #fff; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin: 6px 0 10px; }
  .total-box .lbl { font-size: 12px; font-weight: 600; letter-spacing: 0.4px; }
  .total-box .val { font-size: 22px; font-weight: 800; }

  .pay-line { padding: 8px 12px; background: #f3f4f6; border-radius: 5px; font-size: 11px; color: #374151; display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; }
  .pay-line strong { color: #111827; }

  /* Visit-details block: appointment + patient address */
  .visit-details { border: 1px solid #d0d7e2; border-radius: 6px; padding: 8px 12px; margin: 0 0 12px; background: #fafbfd; }
  .visit-details .vd-title { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #0d5a96; font-weight: 700; margin-bottom: 4px; }
  .visit-details .vd-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 4px 16px; }
  .visit-details .vd-cell { font-size: 11.5px; color: #1f2937; }
  .visit-details .vd-key { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600; margin-bottom: 1px; }
  .visit-details .vd-val { font-size: 11.5px; color: #1f2937; line-height: 1.45; }

  /* ── Footer (shared renderer) ── */
  ${FOOTER_CSS}
  /* Token instruction band (sits just above the shared footer) */
  .token-instruction { font-size: 10px; color: #0d5a96; margin-top: 4px; text-align: center; }
  .token-instruction strong { color: #0d5a96; }

  .watermark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 80pt; font-weight: 900; color: rgba(13,90,150,0.06); transform: rotate(-30deg); pointer-events: none; z-index: 0; letter-spacing: 8px; }

  @media print {
    body { background: #fff; }
    .container { box-shadow: none; padding: 0; max-width: 100%; }
    .print-btn { display: none; }
    table, .meta-grid, .total-box, .pay-line, .visit-details, .footer-band, .terms { page-break-inside: avoid; }
    .h-logo-fallback, thead, .total-box, .token-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">📄 Print / Save PDF</button>
  ${settings.watermark_text ? `<div class="watermark">${escape(settings.watermark_text)}</div>` : ''}

  <div class="container">

    ${headerMode === 'with-header' ? `
    <!-- Header -->
    <div class="header">
      <div class="h-left">
        ${logo
          ? `<img class="h-logo" src="${attr(logo)}" alt="logo" />`
          : `<div class="h-logo-fallback">+</div>`}
        <div class="h-addr">
          <strong>${escape(settings.hospital_name || 'Sree Diagnostics')}</strong>
          ${settings.hospital_address ? `<div>${escape(settings.hospital_address)}</div>` : ''}
          ${settings.hospital_phone ? `<div>Cell: ${escape(settings.hospital_phone)}</div>` : ''}
          ${settings.hospital_email ? `<div>E-mail: ${escape(settings.hospital_email)}</div>` : ''}
          ${settings.hospital_website ? `<div>Web: ${escape(settings.hospital_website)}</div>` : ''}
        </div>
      </div>
      <div class="h-center">
        ${headerSeals.length
          ? headerSeals.map(s => `<img src="${attr(s.url)}" alt="${attr(s.name)}" />`).join('')
          : ''}
      </div>
      <div class="h-right">
        <div class="h-name">${escape(settings.hospital_name || 'Sree Diagnostics')}</div>
        ${settings.hospital_tagline
          ? `<div class="h-tag">${escape(settings.hospital_tagline)}</div>`
          : `<div class="h-tag">Healthcare Services</div>`}
        ${settings.gst_number ? `<div class="h-gstin">GSTIN: ${escape(settings.gst_number)}</div>` : ''}
      </div>
    </div>` : ''}

    <!-- TOKEN · INVOICE · DATE -->
    <div class="meta-grid">
      ${this.tokenCardHTML(token)}
      <div class="meta-card">
        <div class="label">Invoice</div>
        <div class="value" style="color:#0d5a96;">${escape(invoice.invoice_number)}</div>
        <div class="sub">Status — <strong>${this.statusLabel(invoice.status)}</strong></div>
      </div>
      <div class="meta-card">
        <div class="label">Date</div>
        <div class="value">${this.formatDate(invoice.invoice_date)}</div>
        ${invoice.due_date ? `<div class="sub">Due ${this.formatDate(invoice.due_date)}</div>` : ''}
      </div>
    </div>

    <!-- Patient -->
    <div class="patient">
      <span class="ll">PATIENT</span>
      <strong>${escape(invoice.patient?.full_name || '—')}</strong>
      &nbsp;·&nbsp; UHID ${escape(invoice.patient?.uhid || '—')}
      &nbsp;·&nbsp; 📱 ${escape(invoice.patient?.mobile || '—')}
    </div>

    <!-- Items -->
    <table>
      <thead>
        <tr>
          <th style="width:32px; text-align:center;">#</th>
          <th>Description</th>
          <th style="width:60px; text-align:center;">Qty</th>
          <th style="width:90px; text-align:right;">Rate</th>
          <th style="width:90px; text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>

    <!-- Totals breakdown -->
    <div class="totals">
      <div class="lbl">Subtotal</div><div class="val">₹${taxableRupees}</div>
      <div class="lbl">CGST + SGST + IGST</div><div class="val">₹${gstRupees}</div>
    </div>
    <div class="total-box">
      <span class="lbl">Total amount due</span>
      <span class="val">₹${totalRupees}</span>
    </div>

    ${invoice.paid_cents > 0 ? `
    <div class="pay-line">
      <span><strong>Amount paid:</strong> ₹${(invoice.paid_cents / 100).toFixed(2)}</span>
      <span><strong>Outstanding:</strong> ₹${(invoice.balance_cents / 100).toFixed(2)}</span>
    </div>` : ''}

    ${(data.appointmentAt || data.patientAddress) ? `
    <div class="visit-details">
      <div class="vd-title">Visit details</div>
      <div class="vd-grid">
        ${data.appointmentAt ? `
          <div class="vd-cell">
            <div class="vd-key">Appointment / Pickup</div>
            <div class="vd-val">${escape(formatVisitDateTime(data.appointmentAt))}</div>
          </div>` : ''}
        ${data.patientAddress ? `
          <div class="vd-cell">
            <div class="vd-key">Patient address</div>
            <div class="vd-val">${escape(data.patientAddress).replace(/\n/g, '<br>')}</div>
          </div>` : ''}
      </div>
    </div>` : ''}

    ${footerMode === 'with-footer' ? `
    ${token ? `<div class="token-instruction"><strong>Please proceed to the triage station with this slip.</strong></div>` : ''}
    ${renderFooterHTML(settings, { document: 'invoice', signatures: data.signatures })}
    ` : ''}

  </div>
</body>
</html>`;
  }

  private tokenCardHTML(token: TokenSlipData | null | undefined): string {
    // Lab context: most invoices have no OPD token (walk-in or scheduled
    // collection). Show a lab-appropriate label rather than the OPD wording.
    if (!token || token.token_number == null) {
      return `
        <div class="meta-card">
          <div class="label">Service</div>
          <div class="value">Diagnostic services</div>
          <div class="sub">Walk-in / scheduled</div>
        </div>`;
    }
    const eta = token.estimated_wait_min;
    const etaText = eta == null ? '—' : (eta === 0 ? 'Now' : `~${eta} min`);
    const branch = token.branch_code ? ` · ${escape(token.branch_code)}` : '';
    return `
      <div class="meta-card token-card">
        <div class="label">Your token${branch}</div>
        <div class="num">#${token.token_number}</div>
        <div class="sub">${escape(token.doctor_name || 'Doctor')} · queue #${token.queue_position} · ETA ${etaText}</div>
      </div>`;
  }

  private formatDate(date: string): string {
    try { return new Date(date).toLocaleDateString('en-IN'); } catch { return date; }
  }
  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Draft', issued: 'Issued', paid: 'Paid',
      partially_paid: 'Partially paid', void: 'Void', refunded: 'Refunded',
    };
    return map[status] || status;
  }
}

function escape(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
  );
}
function attr(s: string): string {
  return (s ?? '').replace(/"/g, '&quot;');
}

function formatVisitDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}
