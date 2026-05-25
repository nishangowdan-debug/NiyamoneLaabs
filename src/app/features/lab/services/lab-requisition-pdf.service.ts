import { Injectable } from '@angular/core';

export interface LabRequisitionData {
  order_id: string;
  order_number?: string | null;
  order_at: string;
  priority?: string | null;
  patient: {
    uhid: string;
    full_name: string;
    age_years?: number | string | null;
    gender: string | null;
    mobile: string;
    ward?: string | null;
    bed?: string | null;
  };
  doctor: {
    full_name: string;
    registration_no?: string | null;
  };
  clinical_notes?: string | null;
  tests: Array<{
    code: string;
    name: string;
    category?: string | null;
    specimen?: string | null;
    container?: string | null;
    fasting_required?: boolean | null;
  }>;
  /** SVG string for the order barcode (optional). */
  barcode_svg?: string | null;
  hospital: {
    name: string;
    address?: string;
    phone?: string;
    branch_label?: string;
  };
}

/**
 * Lab Requisition Slip — accompanies the sample to the lab.
 * Lists the tests, container hints, specimen type, fasting note, and
 * a barcode for the order. Window.open + print pattern.
 */
@Injectable({ providedIn: 'root' })
export class LabRequisitionPdfService {
  generate(data: LabRequisitionData): void {
    const html = this.html(data);
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow popups to print requisitions'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  private html(d: LabRequisitionData): string {
    const p = d.patient;
    const doc = d.doctor;
    const h = d.hospital;
    const orderRef = d.order_number || d.order_id.slice(0, 8).toUpperCase();
    const fasting = d.tests.some(t => t.fasting_required);

    const testsHtml = d.tests.map((t, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><strong>${escapeHtml(t.name)}</strong>${t.code ? ` <span class="dim">· ${escapeHtml(t.code)}</span>` : ''}</td>
        <td>${escapeHtml(t.category ?? '—')}</td>
        <td>${escapeHtml(t.specimen ?? '—')}</td>
        <td>${escapeHtml(t.container ?? '—')}</td>
        <td class="ck"><input type="checkbox"/></td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Lab Requisition · ${escapeHtml(orderRef)} · ${escapeHtml(p.full_name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #f3f4f6; line-height: 1.4; }
  .print-btn {
    position: fixed; top: 12px; right: 12px; padding: 9px 18px;
    background: #0d5a96; color: #fff; border: 0; border-radius: 6px;
    font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 99;
  }
  .sheet { max-width: 210mm; margin: 0 auto; background: #fff; padding: 12mm; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }

  .hdr { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 8px; border-bottom: 2px solid #0d5a96; }
  .logo { width: 46px; height: 46px; background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%); border-radius: 7px; display: grid; place-items: center; color: #fff; font-size: 26px; font-weight: 700; flex-shrink: 0; }
  .h-info { flex: 1; }
  .h-name { font-size: 18px; font-weight: 700; color: #0d5a96; line-height: 1.1; }
  .h-tag  { font-size: 11px; color: #6b7280; margin-top: 1px; }
  .h-right { text-align: right; font-size: 10.5px; color: #6b7280; }

  .title-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; margin: 10px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
  .title-bar .title { font-size: 16px; font-weight: 700; color: #0d5a96; }
  .title-bar .priority {
    padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;
    background: #fef3c7; color: #92400e;
  }
  .title-bar .priority.stat { background: #fee2e2; color: #991b1b; }

  /* Order + barcode strip */
  .order-strip { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; margin-bottom: 10px; }
  .order-strip .order-no { font-size: 12px; color: #6b7280; }
  .order-strip .order-no strong { color: #111827; font-family: ui-monospace, 'Courier New', monospace; font-size: 14px; }
  .order-strip .date { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .order-strip .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 36px; line-height: 1; letter-spacing: 1px; text-align: right; }
  .order-strip .barcode .code { font-family: ui-monospace, 'Courier New', monospace; font-size: 10px; letter-spacing: 0.6px; color: #6b7280; display: block; text-align: right; }

  /* Patient + doctor grid */
  .pgrid { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 9px 12px; font-size: 11.5px; line-height: 1.55; }
  .card .l { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 600; }
  .card strong { color: #111827; }

  /* Fasting / clinical notes */
  .alert { padding: 7px 12px; border-radius: 5px; font-size: 11px; margin-bottom: 10px; }
  .alert.fast { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
  .alert.note { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; }

  /* Tests table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { padding: 7px 9px; text-align: left; vertical-align: middle; }
  thead { background: #0d5a96; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  tbody tr { border-bottom: 1px solid #e5e7eb; }
  .num { width: 26px; text-align: center; font-family: ui-monospace, 'Courier New', monospace; color: #6b7280; }
  .ck { width: 36px; text-align: center; }
  .ck input { width: 18px; height: 18px; }
  .dim { color: #6b7280; font-weight: 400; font-family: ui-monospace, 'Courier New', monospace; font-size: 10.5px; }

  /* Signatures */
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 26px; }
  .sigs .blk { padding-top: 12px; border-top: 1px solid #6b7280; font-size: 11px; }
  .sigs .blk .label { font-weight: 700; color: #111827; }
  .sigs .blk .sub { font-size: 10px; color: #6b7280; margin-top: 1px; }

  .ftr { margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9.5px; color: #9ca3af; }

  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; padding: 0; max-width: 100%; }
    .print-btn { display: none; }
    .logo, thead, .order-strip, .alert { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">📄 Print / Save PDF</button>
<div class="sheet">

  <div class="hdr">
    <div class="logo">+</div>
    <div class="h-info">
      <div class="h-name">${escapeHtml(h.name)}</div>
      <div class="h-tag">Diagnostic Lab Services</div>
      <div class="h-tag">${escapeHtml(h.address ?? '')}</div>
    </div>
    <div class="h-right">
      ${escapeHtml(h.phone ?? '')}
      ${h.branch_label ? `<br><strong style="color:#0d5a96;">${escapeHtml(h.branch_label)}</strong>` : ''}
    </div>
  </div>

  <div class="title-bar">
    <div class="title">LABORATORY REQUISITION</div>
    ${d.priority ? `<div class="priority ${d.priority.toLowerCase() === 'stat' ? 'stat' : ''}">${escapeHtml(d.priority)}</div>` : ''}
  </div>

  <div class="order-strip">
    <div>
      <div class="order-no">Order: <strong>${escapeHtml(orderRef)}</strong></div>
      <div class="date">Ordered: ${escapeHtml(d.order_at)}</div>
    </div>
    <div class="barcode">
      ${d.barcode_svg ?? `*${escapeHtml(orderRef)}*`}
      <span class="code">${escapeHtml(orderRef)}</span>
    </div>
  </div>

  <div class="pgrid">
    <div class="card">
      <div class="l">Patient</div>
      <div><strong>${escapeHtml(p.full_name)}</strong> · UHID <strong>${escapeHtml(p.uhid)}</strong></div>
      <div>${p.age_years ?? '—'}${p.gender ? ' / ' + escapeHtml(p.gender.charAt(0).toUpperCase()) : ''} · 📱 ${escapeHtml(p.mobile)}</div>
      ${p.ward || p.bed ? `<div>Ward: <strong>${escapeHtml(p.ward ?? '—')}</strong> · Bed: <strong>${escapeHtml(p.bed ?? '—')}</strong></div>` : ''}
    </div>
    <div class="card">
      <div class="l">Referring Doctor</div>
      <div><strong>Dr ${escapeHtml(doc.full_name)}</strong></div>
      ${doc.registration_no ? `<div style="font-size:10.5px; color:#6b7280;">Reg. No. ${escapeHtml(doc.registration_no)}</div>` : ''}
    </div>
  </div>

  ${fasting ? `<div class="alert fast"><strong>⏱ Fasting required:</strong> one or more tests below requires 8–12 hours of fasting. Please confirm with the patient before collection.</div>` : ''}
  ${d.clinical_notes ? `<div class="alert note"><strong>Clinical notes:</strong> ${escapeHtml(d.clinical_notes)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Test</th>
        <th>Category</th>
        <th>Specimen</th>
        <th>Container</th>
        <th class="ck">✓</th>
      </tr>
    </thead>
    <tbody>${testsHtml || '<tr><td colspan="6" style="text-align:center; padding:14px; color:#9ca3af; font-style:italic;">No tests ordered.</td></tr>'}</tbody>
  </table>

  <div class="sigs">
    <div class="blk">
      <div class="label">Collected by</div>
      <div class="sub">Phlebotomist signature · Date · Time</div>
    </div>
    <div class="blk">
      <div class="label">Received in lab</div>
      <div class="sub">Lab tech signature · Date · Time</div>
    </div>
  </div>

  <div class="ftr">
    Generated ${new Date().toLocaleString('en-IN')} · This slip must accompany the sample to the laboratory.
  </div>

</div>
</body></html>`;
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
