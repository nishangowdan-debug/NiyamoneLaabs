import { Injectable } from '@angular/core';

export interface PrescriptionData {
  patient: {
    uhid: string;
    full_name: string;
    age_years?: number | string | null;
    gender: string | null;
    mobile: string;
    weight_kg?: number | null;
    allergies?: string[];
  };
  doctor: {
    full_name: string;
    role_slug?: string | null;
    registration_no?: string | null;
    signature_data_url?: string | null;
  };
  visit: {
    encounter_id?: string;
    visit_date: string;
    chief_complaint?: string | null;
    diagnosis?: string | null;
    vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string } | null;
  };
  items: Array<{
    drug_name: string;
    strength?: string | null;
    form?: string | null;
    route?: string | null;
    frequency?: string | null;
    dosage?: string | null;
    duration_days?: number | null;
    qty?: number | null;
    instructions?: string | null;
  }>;
  follow_up_date?: string | null;
  notes?: string | null;
  hospital: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    branch_label?: string;
  };
}

/**
 * Branded prescription pad — A5 friendly. Opens new tab, renders HTML, triggers print.
 */
@Injectable({ providedIn: 'root' })
export class PrescriptionPdfService {
  generate(data: PrescriptionData): void {
    const html = this.html(data);
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow popups to print prescriptions'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  private html(d: PrescriptionData): string {
    const p = d.patient;
    const doc = d.doctor;
    const v = d.visit;
    const h = d.hospital;

    const itemsHtml = d.items.map((it, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="rx-line">
            <strong>${escapeHtml(it.drug_name)}</strong>${it.strength ? ` <span class="dim">${escapeHtml(it.strength)}</span>` : ''}${it.form ? ` <span class="dim">· ${escapeHtml(it.form)}</span>` : ''}${it.route ? ` <span class="dim">· ${escapeHtml(it.route)}</span>` : ''}
          </div>
          <div class="rx-meta">
            ${it.dosage ? escapeHtml(it.dosage) : ''}${it.frequency ? ' · ' + escapeHtml(it.frequency) : ''}${it.duration_days ? ' · ' + it.duration_days + ' days' : ''}${it.qty ? ' · qty ' + it.qty : ''}
          </div>
          ${it.instructions ? `<div class="rx-instr">${escapeHtml(it.instructions)}</div>` : ''}
        </td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Prescription — ${escapeHtml(p.full_name)} · ${escapeHtml(v.visit_date)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #f3f4f6; line-height: 1.4; }
  .print-btn {
    position: fixed; top: 12px; right: 12px; padding: 9px 18px;
    background: #0d5a96; color: #fff; border: 0; border-radius: 6px;
    font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 99;
  }
  .sheet { max-width: 210mm; margin: 0 auto; background: #fff; padding: 14mm; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }

  /* Header */
  .hdr { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #0d5a96; }
  .logo { width: 50px; height: 50px; background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%); border-radius: 7px; display: grid; place-items: center; color: #fff; font-size: 28px; font-weight: 700; flex-shrink: 0; }
  .h-info { flex: 1; }
  .h-name { font-size: 20px; font-weight: 700; color: #0d5a96; line-height: 1.1; }
  .h-tag { font-size: 11px; color: #6b7280; margin-top: 1px; }
  .h-right { text-align: right; font-size: 10.5px; color: #6b7280; }
  .h-right .branch { color: #0d5a96; font-weight: 700; }

  /* Doctor strip */
  .doc { display: flex; justify-content: space-between; align-items: center; padding: 8px 0 10px; border-bottom: 1px dashed #d1d5db; margin-bottom: 12px; }
  .doc .nm { font-size: 14px; font-weight: 700; color: #111827; }
  .doc .meta { font-size: 11px; color: #6b7280; margin-top: 1px; }
  .doc .right { text-align: right; font-size: 11px; color: #6b7280; }

  /* Patient grid */
  .pgrid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .pgrid .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 8px 10px; }
  .pgrid .card .l { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 600; }
  .pgrid .card .v { font-size: 12px; font-weight: 600; color: #111827; margin-top: 1px; }

  /* Diagnosis / vitals strip */
  .strip { padding: 8px 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 5px; font-size: 11px; color: #1e3a8a; margin-bottom: 12px; }
  .strip .l { font-weight: 700; color: #0d5a96; margin-right: 4px; }
  .allergy { padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 5px; font-size: 11px; color: #991b1b; margin-bottom: 12px; }

  /* Rx symbol + items */
  .rx-mark { font-family: Georgia, 'Times New Roman', serif; font-size: 42px; font-weight: 700; color: #0d5a96; line-height: 1; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { padding: 7px 10px; text-align: left; vertical-align: top; }
  thead { background: #f3f4f6; color: #374151; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  tbody tr { border-bottom: 1px solid #e5e7eb; }
  .num { width: 26px; text-align: center; font-family: ui-monospace, 'Courier New', monospace; color: #6b7280; font-size: 11px; }
  .rx-line { font-size: 13px; }
  .rx-line .dim { color: #6b7280; font-weight: 400; }
  .rx-meta { font-size: 11px; color: #4b5563; font-family: ui-monospace, 'Courier New', monospace; margin-top: 2px; }
  .rx-instr { font-size: 11px; color: #1f2937; font-style: italic; margin-top: 3px; }

  /* Follow-up + notes */
  .fu { padding: 8px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 5px; font-size: 11.5px; color: #065f46; margin-bottom: 10px; }
  .fu .l { font-weight: 700; color: #047857; margin-right: 4px; }
  .notes { font-size: 11px; color: #4b5563; padding: 6px 0; }

  /* Signature */
  .sig { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
  .sig .ds { text-align: right; }
  .sig .ds img { max-height: 60px; max-width: 180px; display: block; margin-left: auto; }
  .sig .ds .line { border-top: 1px solid #6b7280; width: 200px; margin-top: 4px; }
  .sig .ds .label { font-size: 11px; font-weight: 700; color: #111827; margin-top: 3px; }
  .sig .ds .reg { font-size: 10px; color: #6b7280; margin-top: 1px; }

  /* Footer */
  .ftr { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9.5px; color: #9ca3af; line-height: 1.5; }

  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; padding: 0; max-width: 100%; }
    .print-btn { display: none; }
    .logo, thead, .strip, .allergy, .fu { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
      <div class="h-tag">Healthcare Services · Prescription</div>
      <div class="h-tag">${escapeHtml(h.address ?? '')}</div>
    </div>
    <div class="h-right">
      ${escapeHtml(h.phone ?? '')}<br>
      ${escapeHtml(h.email ?? '')}
      ${h.branch_label ? `<div class="branch">${escapeHtml(h.branch_label)}</div>` : ''}
    </div>
  </div>

  <div class="doc">
    <div>
      <div class="nm">Dr ${escapeHtml(doc.full_name)}</div>
      <div class="meta">
        ${escapeHtml(doc.role_slug ?? 'Doctor')}${doc.registration_no ? ' · Reg. No. ' + escapeHtml(doc.registration_no) : ''}
      </div>
    </div>
    <div class="right">
      Date: <strong>${escapeHtml(v.visit_date)}</strong>${v.encounter_id ? '<br>Visit: ' + escapeHtml(v.encounter_id.slice(0, 8)) : ''}
    </div>
  </div>

  <div class="pgrid">
    <div class="card">
      <div class="l">Patient</div>
      <div class="v">${escapeHtml(p.full_name)}</div>
    </div>
    <div class="card">
      <div class="l">UHID</div>
      <div class="v" style="font-family: ui-monospace, 'Courier New', monospace;">${escapeHtml(p.uhid)}</div>
    </div>
    <div class="card">
      <div class="l">Age / Sex / Wt</div>
      <div class="v">${p.age_years ?? '—'}${p.gender ? ' / ' + escapeHtml(p.gender.charAt(0).toUpperCase()) : ''}${p.weight_kg ? ' / ' + p.weight_kg + ' kg' : ''}</div>
    </div>
  </div>

  ${p.allergies && p.allergies.length > 0 ? `
  <div class="allergy">
    <strong>⚠ Allergies:</strong> ${p.allergies.map(escapeHtml).join(', ')}
  </div>` : ''}

  ${v.chief_complaint || v.diagnosis || v.vitals ? `
  <div class="strip">
    ${v.chief_complaint ? `<div><span class="l">Chief complaint:</span> ${escapeHtml(v.chief_complaint)}</div>` : ''}
    ${v.diagnosis ? `<div style="margin-top:3px;"><span class="l">Diagnosis:</span> ${escapeHtml(v.diagnosis)}</div>` : ''}
    ${v.vitals ? `<div style="margin-top:3px;"><span class="l">Vitals:</span> ${[
      v.vitals.bp ? 'BP ' + escapeHtml(v.vitals.bp) : '',
      v.vitals.pulse ? 'Pulse ' + escapeHtml(v.vitals.pulse) : '',
      v.vitals.temp ? 'Temp ' + escapeHtml(v.vitals.temp) : '',
      v.vitals.spo2 ? 'SpO2 ' + escapeHtml(v.vitals.spo2) : '',
    ].filter(Boolean).join(' · ')}</div>` : ''}
  </div>` : ''}

  <div class="rx-mark">℞</div>

  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Medication · Dosage · Instructions</th>
      </tr>
    </thead>
    <tbody>${itemsHtml || '<tr><td colspan="2" style="text-align:center; padding:14px; color:#9ca3af; font-style:italic;">No items prescribed.</td></tr>'}</tbody>
  </table>

  ${d.follow_up_date ? `
  <div class="fu">
    <span class="l">Follow-up:</span> ${escapeHtml(d.follow_up_date)}
  </div>` : ''}

  ${d.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(d.notes)}</div>` : ''}

  <div class="sig">
    <div>
      <div style="font-size:9.5px; color:#9ca3af;">For ${escapeHtml(h.name)}</div>
    </div>
    <div class="ds">
      ${doc.signature_data_url ? `<img src="${doc.signature_data_url}" alt="signature"/>` : '<div class="line"></div>'}
      <div class="label">Dr ${escapeHtml(doc.full_name)}</div>
      ${doc.registration_no ? `<div class="reg">Reg. No. ${escapeHtml(doc.registration_no)}</div>` : ''}
    </div>
  </div>

  <div class="ftr">
    Generated ${new Date().toLocaleString('en-IN')} · This prescription is valid as per the rules of the Medical Council of India.
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
