import { Injectable } from '@angular/core';

export interface PatientIdCardData {
  patient: {
    uhid: string;
    full_name: string;
    date_of_birth: string | null;
    gender: string | null;
    blood_group?: string | null;
    mobile: string;
    abha_id?: string | null;
    emergency_contact?: string | null;
  };
  hospital: {
    name: string;
    address?: string;
    phone?: string;
    website?: string;
    branch_label?: string;
  };
  /** Optional QR payload — usually the UHID or a URL. Rendered as a QR via qrcode-svg. */
  qrPayload?: string | null;
}

/**
 * Patient ID card — printable on both standard ID-card paper (85.6 × 53.98 mm)
 * AND on a normal A4 sheet (two-up card layout).
 * Opens a new tab, renders branded HTML, triggers print.
 */
@Injectable({ providedIn: 'root' })
export class PatientIdCardPdfService {
  async generate(data: PatientIdCardData): Promise<void> {
    const qrSvg = await this.buildQrSvg(data.qrPayload ?? data.patient.uhid);
    const html = this.html(data, qrSvg);
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow popups to print ID cards'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  private async buildQrSvg(payload: string): Promise<string> {
    try {
      // qrcode-svg has no published types; ignore the import-type check.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const mod: any = await import('qrcode-svg');
      const QrCode = mod.default ?? mod;
      const qr = new QrCode({
        content: payload, padding: 0, width: 120, height: 120, ecl: 'M', join: true,
      });
      return qr.svg();
    } catch {
      return '';
    }
  }

  private html(d: PatientIdCardData, qrSvg: string): string {
    const p = d.patient;
    const h = d.hospital;
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>${escapeHtml(h.name)} — Patient ID · ${escapeHtml(p.uhid)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f3f4f6; color: #111827; }
  .print-btn {
    position: fixed; top: 12px; right: 12px; padding: 9px 18px;
    background: #0d5a96; color: #fff; border: 0; border-radius: 6px;
    font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 99;
  }
  .page { max-width: 210mm; margin: 0 auto; padding: 14mm; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .card {
    width: 86mm; height: 54mm;
    background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%);
    color: #fff; border-radius: 9px;
    padding: 9px 11px;
    display: grid; grid-template-rows: auto 1fr auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    position: relative; overflow: hidden;
  }
  .card.back { background: #ffffff; color: #1f2937; border: 1px solid #d1d5db; }

  /* watermark */
  .card::before {
    content: ''; position: absolute; right: -20px; bottom: -20px;
    width: 110px; height: 110px;
    background: rgba(255,255,255,0.08);
    border-radius: 50%;
  }

  .card .hdr { display: flex; justify-content: space-between; align-items: center; }
  .card .h-name { font-size: 13px; font-weight: 700; letter-spacing: 0.2px; }
  .card .h-sub  { font-size: 9px; opacity: 0.85; }
  .card .logo {
    width: 28px; height: 28px; background: rgba(255,255,255,0.18);
    border-radius: 5px; display: grid; place-items: center;
    font-size: 16px; font-weight: 700;
  }

  .card .body { display: grid; grid-template-columns: 1fr 78px; gap: 8px; align-items: end; }
  .card .nm { font-size: 14px; font-weight: 700; line-height: 1.15; word-break: break-word; }
  .card .uhid { font-family: ui-monospace, 'Courier New', monospace; font-size: 11px; opacity: 0.95; letter-spacing: 0.4px; margin-top: 3px; }
  .card .meta { font-size: 10px; opacity: 0.92; margin-top: 4px; line-height: 1.3; }
  .card .qr-wrap { background: #fff; padding: 3px; border-radius: 4px; width: 78px; height: 78px; display: grid; place-items: center; align-self: end; }
  .card .qr-wrap svg { width: 72px; height: 72px; }

  .card .ftr { display: flex; justify-content: space-between; align-items: center; font-size: 8px; opacity: 0.85; }

  /* Back card content */
  .card.back .row { padding: 2px 0; font-size: 10px; }
  .card.back .row .l { color: #6b7280; text-transform: uppercase; font-size: 8px; letter-spacing: 0.4px; }
  .card.back .row .v { color: #111827; font-weight: 600; font-size: 11px; }
  .card.back .emer { background: #fee2e2; color: #991b1b; padding: 4px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; margin-top: 4px; }
  .card.back .h-name { color: #0d5a96; font-size: 11px; }
  .card.back .logo { background: #0d5a96; color: #fff; width: 22px; height: 22px; font-size: 13px; }

  @media print {
    body { background: #fff; }
    .print-btn { display: none; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">📄 Print / Save PDF</button>
<div class="page">
  <div class="cards">

    <!-- ── FRONT ── -->
    <div class="card">
      <div class="hdr">
        <div>
          <div class="h-name">${escapeHtml(h.name)}</div>
          <div class="h-sub">${escapeHtml(h.branch_label ?? 'Patient Identification')}</div>
        </div>
        <div class="logo">+</div>
      </div>

      <div class="body">
        <div>
          <div class="nm">${escapeHtml(p.full_name)}</div>
          <div class="uhid">UHID: ${escapeHtml(p.uhid)}</div>
          <div class="meta">
            ${formatAge(p.date_of_birth)}${p.gender ? ' · ' + escapeHtml(p.gender.charAt(0).toUpperCase()) : ''}
            ${p.blood_group ? ' · Blood ' + escapeHtml(p.blood_group) : ''}
          </div>
        </div>
        <div class="qr-wrap">${qrSvg || ''}</div>
      </div>

      <div class="ftr">
        <span>${escapeHtml(h.phone ?? '')}</span>
        <span>Valid lifetime · Non-transferable</span>
      </div>
    </div>

    <!-- ── BACK ── -->
    <div class="card back">
      <div class="hdr">
        <div>
          <div class="h-name">${escapeHtml(h.name)}</div>
          <div class="h-sub" style="color:#6b7280;">If found, please return</div>
        </div>
        <div class="logo">+</div>
      </div>

      <div>
        <div class="row"><div class="l">Mobile</div><div class="v">${escapeHtml(p.mobile)}</div></div>
        ${p.abha_id ? `<div class="row"><div class="l">ABHA ID</div><div class="v" style="font-family:ui-monospace,'Courier New',monospace;">${escapeHtml(p.abha_id)}</div></div>` : ''}
        ${p.emergency_contact ? `<div class="emer">🚨 Emergency: ${escapeHtml(p.emergency_contact)}</div>` : ''}
      </div>

      <div class="ftr" style="color:#6b7280;">
        <span>${escapeHtml(h.address ?? '')}</span>
        <span>${escapeHtml(h.website ?? '')}</span>
      </div>
    </div>

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

function formatAge(dob: string | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return `${age}y`;
}
