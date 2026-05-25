import { Injectable } from '@angular/core';
import type { HospitalSettings } from './hospital-settings.service';
import type { PosCartItem } from '../data/pharmacy.types';

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'OP' | 'IP';
  patient_name: string;
  patient_uhid: string;
  patient_mobile: string;
  patient_age?: string;
  doctor_name: string;
  items: PosCartItem[];
  subtotal_cents: number;
  discount_cents: number;
  cgst_cents: number;
  sgst_cents: number;
  igst_cents: number;
  total_cents: number;
  payment_method: string;
  notes?: string;
  settings: HospitalSettings;
}

@Injectable({
  providedIn: 'root'
})
export class InvoicePdfService {
  generatePDF(invoiceData: InvoiceData, isPrint: boolean = false): void {
    console.log('🖨️  [PDF SERVICE] generatePDF called');
    console.log('📋 [PDF SERVICE] Invoice Number:', invoiceData.invoice_number);
    console.log('🏥 [PDF SERVICE] Hospital:', invoiceData.settings.hospital_name);

    try {
      const html = this.generateHTML(invoiceData);
      console.log('✅ [PDF SERVICE] HTML generated, length:', html.length, 'characters');

      console.log('🪟 [PDF SERVICE] Opening print window...');
      const printWindow = window.open('', '_blank');

      if (!printWindow) {
        console.error('❌ [PDF SERVICE] Print window is null - popups may be blocked');
        alert('❌ Popup blocked! Please allow popups to print invoices');
        return;
      }

      console.log('✅ [PDF SERVICE] Print window opened successfully');
      console.log('📝 [PDF SERVICE] Writing HTML to print window...');

      printWindow.document.write(html);
      printWindow.document.close();

      console.log('✅ [PDF SERVICE] HTML written to print window');

      if (isPrint) {
        console.log('🖨️  [PDF SERVICE] Triggering print dialog after 500ms...');
        setTimeout(() => {
          console.log('🖨️  [PDF SERVICE] Calling print() method...');
          printWindow.print();
          console.log('✅ [PDF SERVICE] Print dialog triggered');
        }, 500);
      }

      console.log('✅ [PDF SERVICE] PDF generation complete');
    } catch (error) {
      console.error('❌ [PDF SERVICE] Error generating PDF:', error);
      alert('Error generating PDF: ' + (error as any)?.message);
    }
  }

  private generateHTML(data: InvoiceData): string {
    const subtotal = (data.subtotal_cents / 100).toFixed(2);
    const discount = (data.discount_cents / 100).toFixed(2);
    const netAmount = ((data.subtotal_cents - data.discount_cents) / 100).toFixed(2);
    const cgst = (data.cgst_cents / 100).toFixed(2);
    const sgst = (data.sgst_cents / 100).toFixed(2);
    const igst = (data.igst_cents / 100).toFixed(2);
    const gstTotal = ((data.cgst_cents + data.sgst_cents + data.igst_cents) / 100).toFixed(2);
    const grandTotal = (data.total_cents / 100).toFixed(2);

    const itemsHTML = data.items.map((item, idx) => `
      <tr>
        <td class="td-num">${idx + 1}</td>
        <td>${item.drug_name}${item.strength ? ` <span style="color:#7a8593;">${item.strength}</span>` : ''}${item.form ? ` <span style="color:#7a8593;">(${item.form})</span>` : ''}</td>
        <td class="td-num">${item.qty}</td>
        <td class="td-num">₹${(item.unit_price_cents / 100).toFixed(2)}</td>
        <td class="td-num td-bold">₹${(item.line_total_cents / 100).toFixed(2)}</td>
      </tr>
    `).join('');

    const invoiceTitle = data.invoice_type === 'OP' ? 'OUT-PATIENT RECEIPT & INVOICE' : 'IN-PATIENT RECEIPT & INVOICE';
    const headerColor = data.invoice_type === 'OP' ? '#0E4F8C' : '#c0392b';
    const accentColor = data.invoice_type === 'OP' ? '#0E4F8C' : '#c0392b';
    const gstRatePercent = this.calculateGSTRate(data.items);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${invoiceTitle} · ${data.invoice_number}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2530; background: #eef0f3; }
          .page { width: 210mm; min-height: 297mm; padding: 12mm 14mm; background: #fff; margin: 0 auto; display: flex; flex-direction: column; }
          @media screen { .page { box-shadow: 0 2px 14px rgba(0,0,0,0.08); margin: 16px auto; } body { padding: 0; } }
          @media print { body { background: #fff; } .no-print { display: none !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

          .print-btn { position: fixed; top: 14px; right: 14px; background: ${accentColor}; color: white; border: 0; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); z-index: 999; }

          /* Header */
          header.top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4mm; border-bottom: 2.5px solid ${headerColor}; margin-bottom: 4mm; }
          .h-left { display: flex; gap: 10px; align-items: center; }
          .logo { width: 46px; height: 46px; background: ${headerColor}; color: white; font-size: 24pt; font-weight: 900; font-family: Georgia, serif; display: flex; align-items: center; justify-content: center; border-radius: 5px; }
          .h-name { font-size: 16pt; font-weight: 800; color: ${headerColor}; line-height: 1.1; letter-spacing: -0.3px; }
          .h-tag { font-size: 8pt; color: #65758C; margin-top: 1px; }
          .h-addr { font-size: 8pt; color: #65758C; margin-top: 2px; line-height: 1.4; }
          .h-right { text-align: right; }
          .h-pharm { font-size: 9.5pt; color: #1c2530; margin-bottom: 1px; }
          .h-contact { font-size: 7.5pt; color: #65758C; line-height: 1.5; margin-bottom: 3px; }
          .h-gstin { font-size: 8pt; font-weight: 700; color: #1c2530; }
          .h-badge { display: inline-block; background: ${accentColor}; color: white; padding: 3px 10px; border-radius: 3px; font-size: 8pt; font-weight: 800; letter-spacing: 1px; margin-top: 5px; }

          /* Compact invoice meta line */
          .meta-strip { display: flex; justify-content: space-between; align-items: center; padding: 2mm 0 3mm 0; font-size: 9pt; color: #45556a; border-bottom: 1px solid #e3e8ef; margin-bottom: 4mm; }
          .meta-strip strong { color: #1c2530; font-weight: 700; font-family: 'JetBrains Mono', Consolas, monospace; }
          .meta-k { color: #65758C; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-right: 4px; }

          /* Patient + Doctor cards */
          .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; }
          .card { border: 1px solid #e3e8ef; border-radius: 5px; padding: 3mm 3.5mm; }
          .card-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #65758C; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #eef1f6; }
          .kv { font-size: 9pt; line-height: 1.6; color: #1c2530; }
          .kv .k { display: inline-block; width: 64px; color: #65758C; font-weight: 600; }

          /* Items table */
          table.items { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4mm; }
          table.items thead th { background: ${headerColor}; color: white; padding: 6px 8px; text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
          table.items thead th.th-num { text-align: right; }
          table.items tbody td { padding: 5px 8px; border-bottom: 1px solid #eef1f6; }
          table.items tbody tr:nth-child(even) { background: #f8fafd; }
          .td-num { text-align: right; font-family: 'JetBrains Mono', Consolas, monospace; }
          .td-bold { font-weight: 700; }

          /* Totals (right-aligned, compact) */
          .totals-wrap { display: grid; grid-template-columns: 1.2fr 1fr; gap: 6mm; margin-bottom: 4mm; }
          .legal-note { font-size: 8pt; color: #65758C; line-height: 1.55; padding: 3mm 0; }
          .legal-note strong { color: #1c2530; }
          .totals { border: 1px solid #e3e8ef; border-radius: 5px; overflow: hidden; }
          .totals .row { display: flex; justify-content: space-between; padding: 4px 10px; font-size: 9pt; border-bottom: 1px solid #eef1f6; }
          .totals .row:last-child { border-bottom: 0; }
          .totals .label { color: #65758C; }
          .totals .val { font-family: 'JetBrains Mono', Consolas, monospace; }
          .totals .grand { background: ${headerColor}; color: white; padding: 7px 10px; font-size: 11pt; font-weight: 800; }
          .totals .grand .label, .totals .grand .val { color: white; }

          /* Footer */
          footer.bottom { margin-top: auto; padding-top: 4mm; border-top: 1px solid #e3e8ef; display: grid; grid-template-columns: 1.2fr 1fr; gap: 6mm; font-size: 7.5pt; color: #65758C; }
          footer.bottom strong { color: #1c2530; }
          .sign { text-align: right; }
          .sign .line { display: inline-block; border-top: 1px solid #45556a; width: 140px; padding-top: 3px; margin-top: 8mm; font-weight: 700; color: #1c2530; }
          .gen { text-align: center; margin-top: 3mm; color: #99a6b8; font-size: 7pt; }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>

        <div class="page">

          <!-- ── Top header ────────────────────────────────────────────── -->
          <header class="top">
            <div class="h-left">
              <div class="logo">+</div>
              <div>
                <div class="h-name">${this.esc(data.settings.hospital_name) || 'Sree Diagnostics'}</div>
                ${data.settings.hospital_tagline ? `<div class="h-tag">${this.esc(data.settings.hospital_tagline)}</div>` : ''}
                ${data.settings.hospital_address ? `<div class="h-addr">${this.esc(data.settings.hospital_address)}</div>` : ''}
              </div>
            </div>
            <div class="h-right">
              <div class="h-pharm"><strong>${this.esc(data.settings.pharmacy_name) || 'Pharmacy'}</strong></div>
              <div class="h-contact">
                ${data.settings.hospital_phone ? `${this.esc(data.settings.hospital_phone)}` : ''}
                ${data.settings.hospital_email ? ` &nbsp;·&nbsp; ${this.esc(data.settings.hospital_email)}` : ''}
              </div>
              ${data.settings.gst_number ? `<div class="h-gstin">GSTIN: ${this.esc(data.settings.gst_number)}</div>` : ''}
              <div class="h-badge">${data.invoice_type === 'OP' ? 'PHARMACY · OP' : 'PHARMACY · IP'}</div>
            </div>
          </header>

          <!-- ── Invoice no + Date (single line) ──────────────────────── -->
          <div class="meta-strip">
            <div><span class="meta-k">Invoice No.</span> <strong>${this.esc(data.invoice_number)}</strong></div>
            <div style="text-align:right;"><span class="meta-k">Date</span> <strong>${this.esc(data.invoice_date)}</strong></div>
          </div>

          <!-- ── Patient + Doctor cards ────────────────────────────────── -->
          <div class="grid2">
            <div class="card">
              <div class="card-title">Patient</div>
              <div class="kv">
                <div><span class="k">Name</span> <strong>${this.esc(data.patient_name)}</strong></div>
                <div><span class="k">UHID</span> ${this.esc(data.patient_uhid)}</div>
                ${this.shouldShowMobile(data.patient_mobile) ? `<div><span class="k">Mobile</span> ${this.esc(data.patient_mobile)}</div>` : ''}
                ${this.shouldShowAge(data.patient_age) ? `<div><span class="k">Age</span> ${this.esc(data.patient_age)}</div>` : ''}
              </div>
            </div>
            <div class="card">
              <div class="card-title">Doctor</div>
              <div class="kv">
                <div><span class="k">Name</span> <strong>${this.esc(data.doctor_name) || '—'}</strong></div>
                <div><span class="k">Payment</span> ${this.esc((data.payment_method || 'Cash').toUpperCase())}</div>
              </div>
            </div>
          </div>

          <!-- ── Items table ───────────────────────────────────────────── -->
          <table class="items">
            <thead>
              <tr>
                <th style="width:6%;">#</th>
                <th>Description</th>
                <th class="th-num" style="width:8%;">Qty</th>
                <th class="th-num" style="width:14%;">Rate</th>
                <th class="th-num" style="width:16%;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
          </table>

          <!-- ── Legal note + Totals (side by side) ───────────────────── -->
          <div class="totals-wrap">
            <div class="legal-note">
              ${data.settings['drug_license_retail_number'] ? `<div><strong>Drug License:</strong> ${this.esc(data.settings['drug_license_retail_number'])}</div>` : ''}
              ${data.settings['pharmacist_name'] ? `<div><strong>Pharmacist:</strong> ${this.esc(data.settings['pharmacist_name'])}${data.settings['pharmacist_registration_number'] ? ` · Reg. No. ${this.esc(data.settings['pharmacist_registration_number'])}` : ''}</div>` : ''}
              ${data.settings['fssai_number'] ? `<div><strong>FSSAI:</strong> ${this.esc(data.settings['fssai_number'])}</div>` : ''}
              <div style="margin-top:2mm;">All medicines once dispensed are non-refundable.<br>Keep this receipt for warranty / insurance claims.</div>
            </div>
            <div class="totals">
              <div class="row"><span class="label">Subtotal</span><span class="val">₹${subtotal}</span></div>
              ${Number(discount) > 0 ? `<div class="row"><span class="label">Discount</span><span class="val">−₹${discount}</span></div>` : ''}
              <div class="row"><span class="label">CGST (${(gstRatePercent / 2).toFixed(1)}%)</span><span class="val">₹${cgst}</span></div>
              <div class="row"><span class="label">SGST (${(gstRatePercent / 2).toFixed(1)}%)</span><span class="val">₹${sgst}</span></div>
              ${Number(igst) > 0 ? `<div class="row"><span class="label">IGST</span><span class="val">₹${igst}</span></div>` : ''}
              <div class="row" style="background:#f8fafd;"><span class="label" style="font-weight:700;color:#1c2530;">Net total GST</span><span class="val" style="font-weight:700;">₹${gstTotal}</span></div>
              <div class="grand row"><span class="label">GRAND TOTAL</span><span class="val">₹${grandTotal}</span></div>
            </div>
          </div>

          <!-- ── Footer ────────────────────────────────────────────────── -->
          <footer class="bottom">
            <div>
              ${this.esc((data.settings as any).receipt_footer_note) || 'Thank you for choosing us. Get well soon!'}
            </div>
            <div class="sign">
              <div class="line">Authorised signatory</div>
            </div>
          </footer>
          <div class="gen">Computer-generated · ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </body>
      </html>
    `;
  }

  private esc(s: string | null | undefined): string {
    return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Hide placeholder mobile numbers used for walk-ins (e.g. "WALKIN-9727954") */
  private shouldShowMobile(m: string | null | undefined): boolean {
    if (!m) return false;
    const v = m.toString().trim();
    if (!v || v === 'N/A') return false;
    if (/^WALKIN[-_]/i.test(v)) return false;
    return true;
  }

  /** Hide age strings derived from placeholder DOBs (1900-01-01 → ~125 yrs) */
  private shouldShowAge(a: string | null | undefined): boolean {
    if (!a) return false;
    const v = a.toString().trim();
    if (!v) return false;
    const m = v.match(/^(\d+)\s*yrs?/i);
    if (m && parseInt(m[1], 10) >= 110) return false;
    return true;
  }

  private calculateGSTRate(items: PosCartItem[]): number {
    if (items.length === 0) return 0;
    const rates = items.map(i => i.gst_rate);
    const freq: Record<number, number> = {};
    rates.forEach(r => freq[r] = (freq[r] || 0) + 1);
    return Object.keys(freq).reduce((a, b) => freq[+a] > freq[+b] ? +a : +b, rates[0]);
  }
}
