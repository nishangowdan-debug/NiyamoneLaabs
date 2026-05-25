import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { InvoiceDetail } from '../data/billing.types';
import type { Tables } from '../../../core/supabase/supabase.types';

type Branch = Tables<'branches'>;
interface PatientExtra { date_of_birth: string | null; gender: string | null; }

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI', net_banking: 'Net Banking',
  cheque: 'Cheque', insurance: 'Insurance', adjustment: 'Adjustment',
};

@Injectable({ providedIn: 'root' })
export class InvoicePrintService {
  private supabase = inject(SupabaseService);
  private auth    = inject(AuthStore);

  async print(detail: InvoiceDetail): Promise<void> {
    const branchId = this.auth.branchIds()[0] ?? null;
    const [branch, extra] = await Promise.all([
      branchId ? this.fetchBranch(branchId) : Promise.resolve(null),
      detail.patient?.id ? this.fetchPatientExtra(detail.patient.id) : Promise.resolve(null),
    ]);
    const html = this.buildHtml(detail, branch, extra);
    const filename = this.makeFilename(detail);

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

    const triggerPrint = () => {
      try {
        if (iframe.contentDocument) iframe.contentDocument.title = filename;
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 60_000);
      }
    };

    if (iframe.contentDocument?.readyState === 'complete') {
      triggerPrint();
    } else {
      iframe.addEventListener('load', triggerPrint, { once: true });
    }
  }

  private makeFilename(d: InvoiceDetail): string {
    const patient = (d.patient?.full_name
      || `${d.patient?.first_name ?? ''} ${d.patient?.last_name ?? ''}`.trim()
      || 'Patient').trim();
    const raw = (d as any).invoice_date ?? (d as any).created_at ?? new Date().toISOString();
    const dt = new Date(raw);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = isNaN(dt.getTime())
      ? 'Unknown'
      : `${String(dt.getDate()).padStart(2,'0')}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    return `${safe(patient)}_${dateStr}_${safe(d.invoice_number)}`;
  }

  private async fetchBranch(id: string): Promise<Branch | null> {
    const { data } = await this.supabase.client.from('branches').select('*').eq('id', id).single();
    return data ?? null;
  }

  private async fetchPatientExtra(id: string): Promise<PatientExtra | null> {
    const { data } = await this.supabase.client
      .from('patients').select('date_of_birth, gender').eq('id', id).single();
    return data ?? null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private esc(s: string | null | undefined): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private inr(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
      .format(cents / 100);
  }

  private fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  private age(dob: string | null): string {
    if (!dob) return '';
    const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    return `${y} yrs`;
  }

  private formatAddr(addr: unknown): string {
    if (!addr) return '';
    if (typeof addr === 'string') return this.esc(addr);
    if (typeof addr === 'object' && addr !== null) {
      const a = addr as Record<string, string>;
      return [a['line1'], a['line2'], a['city'], a['state'] ? `${a['state']} ${a['pin'] ?? ''}`.trim() : '']
        .map((x) => this.esc(x)).filter(Boolean).join('<br>');
    }
    return '';
  }

  private doctorRows(d: InvoiceDetail): string {
    const doc = (d as any).doctor as { id: string; full_name: string; metadata?: Record<string, unknown> | null } | null | undefined;
    if (!doc) return '';
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    const specialty = (meta['specialty'] as string) ?? (meta['speciality'] as string) ?? '';
    const reg       = (meta['registration_no'] as string) ?? (meta['license_no'] as string) ?? '';
    const docLine   = `Dr. ${this.esc(doc.full_name.replace(/^Dr\.?\s*/i, ''))}`;
    const sub       = [specialty, reg ? `Reg. ${reg}` : ''].filter(Boolean).map(s => this.esc(s)).join(' · ');
    return `
      <tr>
        <td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Doctor</td>
        <td style="font-weight:700;color:#0E4F8C;">${docLine}${sub ? `<div style="font-weight:500;color:#374151;font-size:8.5pt;margin-top:1px;">${sub}</div>` : ''}</td>
      </tr>`;
  }

  private statusBadge(status: string): string {
    const map: Record<string, [string, string]> = {
      paid:             ['#D6ECFF', '#0E4F8C'],
      partially_paid:   ['#dbeafe', '#1e3a8a'],
      issued:           ['#fef3c7', '#92400e'],
      draft:            ['#f3f4f6', '#4b5563'],
      void:             ['#fee2e2', '#991b1b'],
      refunded:         ['#ede9fe', '#4c1d95'],
    };
    const [bg, fg] = map[status] ?? ['#f3f4f6', '#4b5563'];
    const label = status.replace(/_/g, ' ').toUpperCase();
    return `<span style="background:${bg};color:${fg};padding:3px 12px;border-radius:20px;font-size:9pt;font-weight:700;letter-spacing:0.06em;">${label}</span>`;
  }

  // ── Main HTML builder ──────────────────────────────────────────────────
  private buildHtml(d: InvoiceDetail, b: Branch | null, px: PatientExtra | null): string {
    const p = d.patient;
    const genderLabel = px?.gender ? px.gender.charAt(0).toUpperCase() + px.gender.slice(1) : '';
    const ageLabel = this.age(px?.date_of_birth ?? null);
    const patientLine2 = [ageLabel, genderLabel].filter(Boolean).join(' / ');

    // prescription_header is the display name for medical documents.
    // Falls back to branch name if not set (set it in Settings → Branch).
    const hospitalName = this.esc(b?.prescription_header ?? b?.name ?? 'Hospital');
    const addrLines = this.formatAddr(b?.address);
    const branchContact = [b?.phone, b?.email, b?.website].filter(Boolean).map((v) => this.esc(v!)).join(' &nbsp;|&nbsp; ');

    // Items rows
    const itemRows = d.items.map((it, i) => {
      const taxTotal = it.cgst_cents + it.sgst_cents + it.igst_cents;
      const even = i % 2 === 1;
      const bg = even ? '#f9fafb' : '#ffffff';
      return `
        <tr style="background:${bg}">
          <td style="${TD} text-align:center; color:#6b7280;">${it.position ?? i + 1}</td>
          <td style="${TD}">
            <span style="font-weight:500;">${this.esc(it.description)}</span>
          </td>
          <td style="${TD} text-align:center; font-family:monospace;">${it.qty}</td>
          <td style="${TD} text-align:right; font-family:monospace;">${this.inr(it.unit_price_cents)}</td>
          <td style="${TD} text-align:right; font-family:monospace; color:#6b7280;">${it.discount_cents > 0 ? this.inr(it.discount_cents) : '—'}</td>
          <td style="${TD} text-align:center; color:#6b7280;">${it.gst_rate > 0 ? it.gst_rate + '%' : '—'}</td>
          <td style="${TD} text-align:right; font-family:monospace; color:#6b7280;">${taxTotal > 0 ? this.inr(taxTotal) : '—'}</td>
          <td style="${TD} text-align:right; font-family:monospace; font-weight:600;">${this.inr(it.total_cents)}</td>
        </tr>`;
    }).join('');

    // Payment rows
    const payRows = d.payments.filter((pm) => !pm.is_void).map((pm) => `
      <tr>
        <td style="padding:7px 10px; border-bottom:1px solid #f3f4f6;">
          <span style="font-weight:500;">${this.esc(METHOD_LABEL[pm.method] ?? pm.method)}</span>
          ${pm.reference ? `<span style="color:#6b7280; font-size:9pt;"> · Ref: ${this.esc(pm.reference)}</span>` : ''}
        </td>
        <td style="padding:7px 10px; border-bottom:1px solid #f3f4f6; color:#6b7280; font-size:9pt;">${this.fmtDateTime(pm.paid_at)}</td>
        <td style="padding:7px 10px; border-bottom:1px solid #f3f4f6; text-align:right; font-family:monospace; color:#15803d; font-weight:600;">${this.inr(pm.amount_cents)}</td>
      </tr>`).join('');

    const totalTax = d.cgst_cents + d.sgst_cents + d.igst_cents;
    const discountRow = d.discount_cents > 0
      ? `<tr><td style="${SUMMARY_TD} color:#6b7280;">Discount</td><td style="${SUMMARY_AMT} color:#15803d;">− ${this.inr(d.discount_cents)}</td></tr>` : '';
    const igstRow = d.igst_cents > 0
      ? `<tr><td style="${SUMMARY_TD} color:#6b7280;">IGST</td><td style="${SUMMARY_AMT}">${this.inr(d.igst_cents)}</td></tr>` : '';

    const printedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${this.esc(this.makeFilename(d))}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; background: #f5f5f5; }
    .page {
      width: 210mm; min-height: 297mm; background: #fff;
      margin: 0 auto; padding: 14mm 16mm 14mm;
      display: flex; flex-direction: column;
    }
    table { border-collapse: collapse; width: 100%; }
    @media print {
      body { background: white; }
      .no-print { display: none !important; }
      .page { margin: 0; box-shadow: none; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media screen { .page { box-shadow: 0 2px 20px rgba(0,0,0,.12); margin: 20px auto; } }
  </style>
</head>
<body>

<button class="no-print" onclick="window.print()"
  style="position:fixed;top:14px;right:14px;background:#0E4F8C;color:white;border:none;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.3);">
  &#128438; Print / Save PDF
</button>

<div class="page">

  <!-- ── HOSPITAL HEADER ─────────────────────────────────────────── -->
  <header style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:5mm; border-bottom: 2.5px solid #0E4F8C; margin-bottom:5mm;">
    <div style="display:flex; align-items:center; gap:12px;">
      ${b?.logo_url ? `<img src="${this.esc(b.logo_url)}" alt="Logo" style="width:56px;height:56px;object-fit:contain;border-radius:6px;">` : `<div style="width:56px;height:56px;background:#0E4F8C;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:24pt;font-weight:900;font-family:Georgia,serif;">n</div>`}
      <div>
        <div style="font-size:18pt;font-weight:800;color:#0E4F8C;letter-spacing:-0.5px;line-height:1.1;">${hospitalName}</div>
        ${b?.tagline ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">${this.esc(b.tagline)}</div>` : ''}
        ${addrLines ? `<div style="font-size:9pt;color:#6b7280;margin-top:3px;line-height:1.5;">${addrLines}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7.5pt;color:#6b7280;line-height:1.8; margin-bottom:4px;">
        ${branchContact ? `<div>${branchContact}</div>` : ''}
        ${b?.registration_no ? `<div>Reg. No: ${this.esc(b.registration_no)}</div>` : ''}
        ${b?.gstin ? `<div style="font-weight:700;color:#374151;">GSTIN: ${this.esc(b.gstin)}</div>` : ''}
      </div>
      <div style="background:#0E4F8C;color:white;padding:4px 14px;border-radius:4px;font-size:11pt;font-weight:800;letter-spacing:1.5px;display:inline-block;">TAX INVOICE</div>
    </div>
  </header>

  <!-- ── INVOICE META ────────────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">

    <!-- Bill To -->
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #f3f4f6;">Bill To</div>
      <div style="font-size:13pt;font-weight:700;color:#111827;margin-bottom:2px;">${this.esc(p?.full_name ?? '—')}</div>
      <div style="font-size:9pt;color:#6b7280;font-family:monospace;">UHID: ${this.esc(p?.uhid ?? '—')}</div>
      ${patientLine2 ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">${this.esc(patientLine2)}</div>` : ''}
      ${p?.mobile ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">&#128222; ${this.esc(p.mobile)}</div>` : ''}
    </div>

    <!-- Invoice details -->
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #f3f4f6;">Invoice Details</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;white-space:nowrap;">Invoice No.</td><td style="font-weight:700;font-family:monospace;color:#0E4F8C;">${this.esc(d.invoice_number)}</td></tr>
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Invoice Date</td><td style="font-weight:500;">${this.fmtDate(d.invoice_date)}</td></tr>
        ${d.due_date ? `<tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Due Date</td><td style="font-weight:500;">${this.fmtDate(d.due_date)}</td></tr>` : ''}
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Status</td><td style="padding-top:2px;">${this.statusBadge(d.status)}</td></tr>
        ${this.doctorRows(d)}
        ${d.notes ? `<tr><td style="color:#6b7280;padding:3px 10px 0 0;vertical-align:top;">Notes</td><td style="color:#374151;font-size:9pt;padding-top:3px;">${this.esc(d.notes)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <!-- ── ITEMS TABLE ─────────────────────────────────────────────── -->
  <table style="margin-bottom:5mm;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <thead>
      <tr style="background:#0E4F8C;color:white;">
        <th style="${TH} text-align:center; width:5%;">#</th>
        <th style="${TH} text-align:left; width:33%;">Description</th>
        <th style="${TH} text-align:center; width:7%;">Qty</th>
        <th style="${TH} text-align:right; width:13%;">Rate</th>
        <th style="${TH} text-align:right; width:10%;">Disc.</th>
        <th style="${TH} text-align:center; width:8%;">GST%</th>
        <th style="${TH} text-align:right; width:11%;">Tax</th>
        <th style="${TH} text-align:right; width:13%;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="8" style="text-align:center;padding:10px;color:#6b7280;">No items</td></tr>'}</tbody>
  </table>

  <!-- ── TOTALS + PAYMENTS ───────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr auto;gap:6mm;margin-bottom:5mm;align-items:start;">

    <!-- Payments (left) -->
    <div>
      ${d.payments.filter((x) => !x.is_void).length > 0 ? `
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2mm;">Payment History</div>
      <table style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:9pt;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:6px 10px;text-align:left;font-weight:600;color:#6b7280;font-size:8pt;border-bottom:1px solid #e5e7eb;">Method</th>
          <th style="padding:6px 10px;text-align:left;font-weight:600;color:#6b7280;font-size:8pt;border-bottom:1px solid #e5e7eb;">Date & Time</th>
          <th style="padding:6px 10px;text-align:right;font-weight:600;color:#6b7280;font-size:8pt;border-bottom:1px solid #e5e7eb;">Amount</th>
        </tr></thead>
        <tbody>${payRows}</tbody>
      </table>` : '<div style="color:#9ca3af;font-size:9pt;font-style:italic;">No payments recorded.</div>'}
    </div>

    <!-- Summary box (right) -->
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;min-width:220px;">
      <table style="font-size:10pt;">
        <tr><td style="${SUMMARY_TD} color:#6b7280;">Subtotal</td><td style="${SUMMARY_AMT}">${this.inr(d.subtotal_cents)}</td></tr>
        ${discountRow}
        <tr><td style="${SUMMARY_TD} color:#6b7280;">CGST</td><td style="${SUMMARY_AMT}">${this.inr(d.cgst_cents)}</td></tr>
        <tr><td style="${SUMMARY_TD} color:#6b7280;">SGST</td><td style="${SUMMARY_AMT}">${this.inr(d.sgst_cents)}</td></tr>
        ${igstRow}
        <tr style="background:#0E4F8C;color:white;">
          <td style="padding:8px 12px;font-weight:700;font-size:11pt;">Total</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;font-size:11pt;">${this.inr(d.total_cents)}</td>
        </tr>
        <tr style="background:#ECF6FF;">
          <td style="${SUMMARY_TD} color:#15803d;font-weight:600;">Paid</td>
          <td style="${SUMMARY_AMT} color:#15803d;font-weight:600;">${this.inr(d.paid_cents)}</td>
        </tr>
        <tr style="${d.balance_cents > 0 ? 'background:#fff7ed;' : ''}">
          <td style="${SUMMARY_TD} ${d.balance_cents > 0 ? 'color:#b45309;font-weight:600;' : 'color:#6b7280;'}">Balance Due</td>
          <td style="${SUMMARY_AMT} ${d.balance_cents > 0 ? 'color:#b45309;font-weight:700;font-size:11pt;' : 'color:#6b7280;'}">${this.inr(d.balance_cents)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ── TAX SUMMARY (CGST/SGST breakdown) ──────────────────────── -->
  ${totalTax > 0 ? `
  <div style="margin-bottom:5mm;">
    <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2mm;">GST Summary</div>
    <table style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:9pt;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:5px 10px;text-align:left;color:#6b7280;font-weight:600;font-size:8pt;border-bottom:1px solid #e5e7eb;">Taxable Amount</th>
        <th style="padding:5px 10px;text-align:right;color:#6b7280;font-weight:600;font-size:8pt;border-bottom:1px solid #e5e7eb;">CGST</th>
        <th style="padding:5px 10px;text-align:right;color:#6b7280;font-weight:600;font-size:8pt;border-bottom:1px solid #e5e7eb;">SGST</th>
        <th style="padding:5px 10px;text-align:right;color:#6b7280;font-weight:600;font-size:8pt;border-bottom:1px solid #e5e7eb;">Total Tax</th>
      </tr></thead>
      <tbody><tr>
        <td style="padding:6px 10px;font-family:monospace;">${this.inr(d.subtotal_cents - d.discount_cents)}</td>
        <td style="padding:6px 10px;text-align:right;font-family:monospace;">${this.inr(d.cgst_cents)}</td>
        <td style="padding:6px 10px;text-align:right;font-family:monospace;">${this.inr(d.sgst_cents)}</td>
        <td style="padding:6px 10px;text-align:right;font-family:monospace;font-weight:600;">${this.inr(totalTax)}</td>
      </tr></tbody>
    </table>
  </div>` : ''}

  <!-- ── FOOTER ──────────────────────────────────────────────────── -->
  <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #e5e7eb;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm;">
      <div style="font-size:8.5pt;color:#6b7280;line-height:1.7;">
        <div style="font-weight:700;color:#374151;margin-bottom:2px;">Terms &amp; Conditions</div>
        <div>• Payment is due by the date mentioned above.</div>
        <div>• Please quote the invoice number in all correspondence.</div>
        <div>• This is a computer-generated invoice and does not require a physical signature.</div>
        ${b?.email ? `<div style="margin-top:4px;">Billing queries: <span style="color:#0E4F8C;">${this.esc(b.email)}</span></div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="display:inline-block;text-align:center;margin-top:10mm;">
          <div style="border-top:1.5px solid #374151;width:160px;padding-top:4px;font-size:8.5pt;color:#6b7280;">Authorised Signatory</div>
          <div style="font-size:9pt;font-weight:600;color:#374151;margin-top:2px;">${this.esc(b?.name ?? '')}</div>
        </div>
      </div>
    </div>
    <div style="text-align:center;margin-top:6mm;font-size:8pt;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:3mm;">
      This is a computer-generated document. No signature required. &nbsp;|&nbsp; Printed on ${printedAt}
    </div>
  </div>

</div><!-- /page -->
</body>
</html>`;
  }
}

// ── Style constants (keep template readable) ───────────────────────────
const TH = `padding:7px 10px; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;`;
const TD = `padding:7px 10px; border-bottom:1px solid #f3f4f6; font-size:10pt;`;
const SUMMARY_TD = `padding:7px 12px; white-space:nowrap; border-bottom:1px solid #f3f4f6;`;
const SUMMARY_AMT = `padding:7px 12px; text-align:right; font-family:monospace; border-bottom:1px solid #f3f4f6;`;
