import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import {
  HospitalSettingsService,
  type HospitalSettings,
} from '../../pharmacy/services/hospital-settings.service';
import { LabReportSreeService } from './lab-report-sree.service';
// @ts-ignore — pure-JS, default export
import QRCode from 'qrcode-svg';

interface ReportResult {
  test: {
    code: string; name: string; category: string | null;
    unit: string | null; ref_min: number | null; ref_max: number | null;
    critical_low: number | null; critical_high: number | null;
    is_radiology?: boolean | null;
  };
  status: string;
  flag: string | null;
  value_numeric: number | null;
  value_text: string | null;
  notes: string | null;
}

interface ReportBundle {
  order: {
    id: string;
    ordered_at: string;
    collected_at: string | null;
    reported_at: string | null;
    sample_id: string | null;
    source: 'opd' | 'ipd';
    notes: string | null;
  };
  patient: {
    full_name: string | null;
    first_name: string;
    last_name: string;
    uhid: string;
    date_of_birth: string;
    gender: string;
    mobile: string;
  };
  doctor: { full_name: string; signature_data_url?: string | null } | null;
  verifier: { full_name: string; signature_data_url?: string | null; metadata?: any } | null;
  results: ReportResult[];
  settings: HospitalSettings;
}

@Injectable({ providedIn: 'root' })
export class LabReportPdfService {
  private supabase    = inject(SupabaseService);
  private auth        = inject(AuthStore);
  private settingsSvc = inject(HospitalSettingsService);
  private sree        = inject(LabReportSreeService);

  /**
   * Every print path renders the Sree Diagnostics template. The legacy green
   * layout was removed for the client demo — there is no fallback option.
   */
  async openReport(orderId: string, opts: { autoPrint?: boolean } = {}): Promise<void> {
    return this.sree.openReport(orderId, { autoPrint: opts.autoPrint });
  }

  // ── Fetch ──────────────────────────────────────────────────────────
  private async fetch(orderId: string): Promise<ReportBundle> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_orders')
      .select(`
        id, branch_id, source, notes, ordered_at, collected_at, reported_at, sample_id, verification_token,
        patient:patient_id(full_name, first_name, last_name, uhid, date_of_birth, gender, mobile),
        doctor:ordering_doctor_staff_id(full_name, signature_data_url),
        verifier:reported_by_staff_id(full_name, signature_data_url, metadata),
        results:lab_results(status, flag, value_numeric, value_text, notes,
            test:lab_test_id(code, name, category, unit, ref_min, ref_max, critical_low, critical_high, is_radiology))
      `)
      .eq('id', orderId)
      .single();
    if (error) throw error;

    // Resolve branch from claims first (staff context); fall back to the order's
    // own branch_id (patient-portal context, where claims have no branch_id).
    const branchId = (this.auth.claims().branch_id as string) || data.branch_id || '';
    const settings = await this.settingsSvc.loadSettings(branchId);

    return {
      order: {
        id:           data.id,
        source:       data.source,
        notes:        data.notes,
        ordered_at:   data.ordered_at,
        collected_at: data.collected_at,
        reported_at:  data.reported_at ?? new Date().toISOString(),
        sample_id:    data.sample_id,
        verification_token: data.verification_token,
      } as any,
      patient:  data.patient,
      doctor:   data.doctor,
      verifier: data.verifier,
      results: (data.results ?? []).slice().sort((a: any, b: any) => {
        // Group by category, then by test name
        const ca = (a.test.category ?? '').localeCompare(b.test.category ?? '');
        if (ca !== 0) return ca;
        return a.test.name.localeCompare(b.test.name);
      }),
      settings,
    };
  }

  // ── HTML builder ──────────────────────────────────────────────────
  private buildHtml(b: ReportBundle): string {
    const ageStr = this.computeAge(b.patient.date_of_birth);
    const gender = b.patient.gender ? b.patient.gender.charAt(0).toUpperCase() + b.patient.gender.slice(1) : '';
    const fullName = b.patient.full_name || `${b.patient.first_name} ${b.patient.last_name}`.trim();
    const doctor   = b.doctor?.full_name || '—';

    // Group results by category
    const byCategory: Record<string, ReportResult[]> = {};
    for (const r of b.results) {
      const cat = r.test.category ?? 'Other';
      (byCategory[cat] = byCategory[cat] ?? []).push(r);
    }

    // Tests outside reference range (Vimta-inspired summary)
    const outOfRange = b.results.filter(r => this.isOutOfRange(r));

    // Per-category tables
    const categorySections = Object.entries(byCategory)
      .map(([cat, rs]) => this.renderCategory(cat, rs)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lab Report · ${this.esc(b.patient.uhid)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2530; background: #eef0f3; font-size: 10pt; }
    .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm; background: #fff; margin: 0 auto; display: flex; flex-direction: column; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    @media screen { .page { box-shadow: 0 2px 14px rgba(0,0,0,0.08); margin: 16px auto; } body { padding: 0; } }
    @media print { body { background: #fff; } .no-print { display: none !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

    .print-btn { position: fixed; top: 14px; right: 14px; background: #0F9D58; color: white; border: 0; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); z-index: 999; }

    /* Header */
    header.top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4mm; border-bottom: 2.5px solid #0F9D58; margin-bottom: 4mm; }
    .h-left { display: flex; gap: 10px; align-items: center; }
    .logo { width: 46px; height: 46px; background: #0F9D58; color: white; font-size: 22pt; font-weight: 900; font-family: Georgia, serif; display: flex; align-items: center; justify-content: center; border-radius: 5px; }
    .h-name { font-size: 16pt; font-weight: 800; color: #0F9D58; line-height: 1.1; letter-spacing: -0.3px; }
    .h-tag { font-size: 8pt; color: #65758C; margin-top: 1px; }
    .h-addr { font-size: 8pt; color: #65758C; margin-top: 2px; line-height: 1.4; }
    .h-right { text-align: right; }
    .h-contact { font-size: 7.5pt; color: #65758C; line-height: 1.5; margin-bottom: 3px; }
    .h-gstin { font-size: 8pt; font-weight: 700; color: #1c2530; }
    .h-badge { display: inline-block; background: #0F9D58; color: white; padding: 3px 10px; border-radius: 3px; font-size: 8pt; font-weight: 800; letter-spacing: 1px; margin-top: 5px; }

    /* Patient + Sample meta */
    .meta-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 4mm; margin-bottom: 4mm; }
    .card { border: 1px solid #e3e8ef; border-radius: 5px; padding: 3mm 3.5mm; }
    .card-title { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #65758C; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px solid #eef1f6; }
    .kv { font-size: 9pt; line-height: 1.7; }
    .kv .k { display: inline-block; width: 92px; color: #65758C; font-weight: 600; }

    /* Status pills */
    .status-bar { display: flex; gap: 4mm; padding: 2mm 0 4mm 0; border-bottom: 1px dashed #d0d7e2; margin-bottom: 4mm; font-size: 8.5pt; flex-wrap: wrap; }
    .pill { padding: 2px 9px; border-radius: 999px; font-weight: 700; font-size: 8pt; display: inline-flex; align-items: center; gap: 4px; }
    .pill.ok   { background: #d6f5e6; color: #0a7a3a; }
    .pill.warn { background: #fff2cf; color: #946100; }
    .pill.crit { background: #fde0de; color: #9b2017; }
    .pill.gray { background: #eef1f6; color: #65758C; }

    /* Out-of-range table (Vimta-style summary page) */
    h2.section { font-size: 13pt; font-weight: 700; color: #1c2530; margin: 5mm 0 2mm; padding-left: 6px; border-left: 4px solid #0F9D58; }
    h3.subhead { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #0F9D58; margin: 3mm 0 1.5mm; padding-bottom: 1mm; border-bottom: 1px solid #d0d7e2; }
    table.flat { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 3mm; }
    table.flat thead th { background: #0F9D58; color: white; padding: 6px 8px; text-align: left; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    table.flat thead th.num { text-align: right; }
    table.flat tbody td { padding: 5px 8px; border-bottom: 1px solid #eef1f6; }
    table.flat tbody tr:nth-child(even) { background: #f8fafd; }
    .num { text-align: right; font-family: 'JetBrains Mono', Consolas, monospace; }
    .bold { font-weight: 700; }
    .flag-low,  .flag-high  { color: #946100; font-weight: 700; }
    .flag-clow, .flag-chigh { color: #9b2017; font-weight: 800; }
    .normal { color: #1c2530; }

    /* Footer */
    footer.bottom { margin-top: auto; padding-top: 5mm; border-top: 1px solid #e3e8ef; display: grid; grid-template-columns: 1.5fr 1fr; gap: 6mm; font-size: 8pt; color: #65758C; }
    footer.bottom strong { color: #1c2530; }
    .sign { text-align: right; }
    .sign .line { display: inline-block; border-top: 1px solid #45556a; width: 160px; padding-top: 3px; margin-top: 14mm; font-weight: 700; color: #1c2530; }
    .sign .line.with-img { margin-top: 2mm; }
    .sign .sig-img { display: block; max-height: 18mm; max-width: 60mm; margin: 0 auto 1mm auto; object-fit: contain; }
    .gen { text-align: center; margin-top: 3mm; color: #99a6b8; font-size: 7pt; }
    .qr-placeholder { display: inline-block; width: 56px; height: 56px; border: 1.5px solid #c3c9d1; border-radius: 4px; font-size: 7pt; color: #65758C; padding: 4px; text-align: center; line-height: 1.2; vertical-align: middle; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>

  <!-- ─────────────── PAGE 1 — COVER / SUMMARY ─────────────── -->
  <div class="page">
    ${this.commonHeader(b)}

    <!-- Patient + Sample cards -->
    <div class="meta-grid">
      <div class="card">
        <div class="card-title">Patient</div>
        <div class="kv">
          <div><span class="k">Name</span> <strong>${this.esc(fullName)}</strong></div>
          <div><span class="k">UHID</span> <span style="font-family:monospace">${this.esc(b.patient.uhid)}</span></div>
          <div><span class="k">Age / Sex</span> ${ageStr ? `${ageStr} / ${this.esc(gender)}` : this.esc(gender)}</div>
          ${b.patient.mobile ? `<div><span class="k">Mobile</span> ${this.esc(b.patient.mobile)}</div>` : ''}
          <div><span class="k">Referred by</span> ${this.esc(doctor)}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Sample</div>
        <div class="kv">
          <div><span class="k">Order ID</span> <span style="font-family:monospace">${b.order.id.slice(0, 8).toUpperCase()}</span></div>
          ${b.order.sample_id ? `<div><span class="k">Barcode</span> <span style="font-family:monospace;font-weight:700">${this.esc(b.order.sample_id)}</span></div>` : ''}
          <div><span class="k">Collected</span> ${this.fmtDateTime(b.order.collected_at) || '—'}</div>
          <div><span class="k">Reported</span> ${this.fmtDateTime(b.order.reported_at) || '—'}</div>
          <div><span class="k">Source</span> <strong>${b.order.source.toUpperCase()}</strong></div>
        </div>
      </div>
    </div>

    <!-- Status summary pills -->
    <div class="status-bar">
      <span class="pill ok">✓ ${b.results.filter(r => r.status === 'verified').length} Verified</span>
      <span class="pill warn">⏳ ${b.results.filter(r => r.status === 'entered').length} Entered</span>
      <span class="pill gray">… ${b.results.filter(r => r.status === 'pending').length} Pending</span>
      <span class="pill crit">⚠ ${b.results.filter(r => r.flag === 'critical_low' || r.flag === 'critical_high').length} Critical</span>
      <span style="margin-left:auto;font-size:8pt;color:#65758C;font-weight:600;">Total ${b.results.length} test(s)</span>
    </div>

    <!-- Tests outside range -->
    <h2 class="section">Tests Outside Reference Range</h2>
    ${outOfRange.length === 0
      ? `<p style="font-size:9.5pt; color:#0a7a3a; padding:6mm 4mm; background:#d6f5e6; border-radius:4px;">✓ All tests within normal reference range.</p>`
      : `<table class="flat">
        <thead><tr>
          <th>Test</th><th class="num">Result</th><th>Unit</th><th>Bio. Ref.</th><th>Flag</th>
        </tr></thead>
        <tbody>${outOfRange.map(r => `
          <tr>
            <td><strong>${this.esc(r.test.name)}</strong>${r.test.category ? ` <span style="color:#65758C">· ${this.esc(r.test.category)}</span>` : ''}</td>
            <td class="num bold ${this.flagClass(r)}">${this.formatValue(r)}</td>
            <td>${this.esc(r.test.unit ?? '—')}</td>
            <td>${this.refRangeText(r.test)}</td>
            <td><span class="pill ${this.flagPillClass(r)}">${this.flagLabel(r)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`}

    <!-- Test list summary -->
    <h2 class="section">Tests Performed</h2>
    <table class="flat">
      <thead><tr><th>Test</th><th>Category</th><th class="num">Result</th><th>Status</th></tr></thead>
      <tbody>
        ${b.results.map(r => `
          <tr>
            <td>${this.esc(r.test.name)}</td>
            <td><span style="color:#65758C">${this.esc(r.test.category ?? '—')}</span></td>
            <td class="num ${this.flagClass(r)}">${this.formatValue(r)}</td>
            <td><span class="pill ${this.statusPillClass(r.status)}">${this.esc(r.status)}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>

    ${this.footer(b, 1)}
  </div>

  <!-- ─────────────── PAGE 2+ — DETAILED RESULTS ─────────────── -->
  <div class="page">
    ${this.commonHeader(b)}
    ${this.patientStrip(b)}
    <h2 class="section">Detailed Results</h2>
    ${categorySections}
    ${this.footer(b, 2)}
  </div>

</body></html>`;
  }

  // ── Page section builders ─────────────────────────────────────────
  private commonHeader(b: ReportBundle): string {
    const s = b.settings;
    return `
    <header class="top">
      <div class="h-left">
        <div class="logo">+</div>
        <div>
          <div class="h-name">${this.esc(s.hospital_name) || 'Hospital'}</div>
          ${s.hospital_tagline ? `<div class="h-tag">${this.esc(s.hospital_tagline)}</div>` : ''}
          ${(s as any).hospital_address ? `<div class="h-addr">${this.esc((s as any).hospital_address)}</div>` : ''}
        </div>
      </div>
      <div class="h-right">
        <div class="h-contact">
          ${s.hospital_phone ? `${this.esc(s.hospital_phone)}` : ''}
          ${s.hospital_email ? ` &nbsp;·&nbsp; ${this.esc(s.hospital_email)}` : ''}
        </div>
        ${s.gst_number ? `<div class="h-gstin">GSTIN: ${this.esc(s.gst_number)}</div>` : ''}
        <div class="h-badge">LAB · DIAGNOSTICS</div>
      </div>
    </header>`;
  }

  private patientStrip(b: ReportBundle): string {
    const fullName = b.patient.full_name || `${b.patient.first_name} ${b.patient.last_name}`.trim();
    return `
    <div style="display:flex;justify-content:space-between;font-size:8.5pt;color:#65758C;border-bottom:1px solid #d0d7e2;padding-bottom:2mm;margin-bottom:3mm;">
      <div><strong style="color:#1c2530;">${this.esc(fullName)}</strong> · UHID <span style="font-family:monospace">${this.esc(b.patient.uhid)}</span></div>
      <div>Order <span style="font-family:monospace">${b.order.id.slice(0,8).toUpperCase()}</span></div>
    </div>`;
  }

  private renderCategory(cat: string, rs: ReportResult[]): string {
    const rows = rs.map(r => `
      <tr>
        <td>
          <strong>${this.esc(r.test.name)}</strong>
          ${r.notes ? `<div style="font-size:8pt;color:#65758C;margin-top:1px;">${this.esc(r.notes)}</div>` : ''}
        </td>
        <td class="num ${this.flagClass(r)} bold">${this.formatValue(r)}</td>
        <td>${this.esc(r.test.unit ?? '—')}</td>
        <td>${this.refRangeText(r.test)}</td>
        <td>${this.flagBadge(r)}</td>
      </tr>`).join('');
    return `
      <h3 class="subhead">${this.esc(cat)}</h3>
      <table class="flat">
        <thead><tr><th>Test</th><th class="num">Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  private footer(b: ReportBundle, pageNo: number): string {
    const s = b.settings;
    // Prefer the actual verifier (reported_by_staff_id) over the hospital settings fallback
    const verifierName  = b.verifier?.full_name || (s as any).pharmacist_name || 'Authorised Pathologist';
    const verifierReg   = b.verifier?.metadata?.registration_number
                       || b.verifier?.metadata?.medical_council_number
                       || (s as any).pharmacist_registration_number
                       || '';
    const verifierSigUrl = b.verifier?.signature_data_url || '';

    const sigBlock = verifierSigUrl
      ? `<img class="sig-img" src="${verifierSigUrl}" alt="signature" />
         <div class="line with-img">${this.esc(verifierName)}${verifierReg ? `<div style="font-size:7.5pt;font-weight:500;color:#65758C;">Reg ${this.esc(verifierReg)}</div>` : ''}</div>`
      : `<div class="line">${this.esc(verifierName)}${verifierReg ? `<div style="font-size:7.5pt;font-weight:500;color:#65758C;">Reg ${this.esc(verifierReg)}</div>` : ''}</div>`;

    return `
    <footer class="bottom">
      <div>
        <strong>${this.esc(s.hospital_name)} — Diagnostics</strong>
        ${(s as any).hospital_phone ? ` · ${this.esc(s.hospital_phone)}` : ''}
        <div style="margin-top:1mm;">This is a computer-generated report. Verify the QR / barcode for authenticity.</div>
        ${(s as any).receipt_terms_and_conditions ? `<div style="margin-top:1mm; font-size:7.5pt;">${this.esc((s as any).receipt_terms_and_conditions)}</div>` : ''}
      </div>
      <div class="sign">
        <div style="display:inline-block;text-align:center;">
          ${this.verificationQrSvg((b.order as any).verification_token, b.order.id)}
          ${sigBlock}
        </div>
      </div>
    </footer>
    <div class="gen">Computer-generated · Page ${pageNo} · ${this.fmtDateTime(new Date().toISOString())}</div>`;
  }

  /** Render a small QR pointing at the public verification URL. */
  private verificationQrSvg(token: string | null | undefined, fallback: string): string {
    if (typeof window === 'undefined') return '';
    const origin = window.location?.origin || '';
    const url = token
      ? `${origin}/lab/verify/${encodeURIComponent(token)}`
      : `${origin}/lab/verify/${encodeURIComponent(fallback)}`;
    try {
      const qr = new QRCode({
        content: url, padding: 1, width: 70, height: 70,
        color: '#0F1B2D', background: '#FFFFFF', ecl: 'M', join: true,
      });
      // The svg() output is already a self-contained <svg>…</svg>
      return `<div style="display:inline-block;background:#FFF;padding:1mm;">${qr.svg()}</div>
              <div style="font-size:7pt;color:#65758C;margin-top:0.5mm;">Scan to verify</div>`;
    } catch {
      return `<div class="qr-placeholder">Scan<br>${this.esc(fallback.slice(0,8))}</div>`;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  private esc(s: string | null | undefined): string {
    return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  private fmtDateTime(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  private computeAge(dob: string | null | undefined): string {
    if (!dob) return '';
    const yrs = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    if (yrs < 0 || yrs > 130) return '';
    return `${yrs} yrs`;
  }
  private formatValue(r: ReportResult): string {
    if (r.value_numeric != null) return r.value_numeric.toString();
    if (r.value_text != null) return this.esc(r.value_text);
    return '—';
  }
  private refRangeText(t: ReportResult['test']): string {
    if (t.ref_min != null && t.ref_max != null) return `${t.ref_min} – ${t.ref_max}`;
    if (t.ref_min != null) return `> ${t.ref_min}`;
    if (t.ref_max != null) return `< ${t.ref_max}`;
    return '—';
  }
  private isOutOfRange(r: ReportResult): boolean {
    return ['low','high','critical_low','critical_high'].includes(r.flag ?? '');
  }
  private flagClass(r: ReportResult): string {
    switch (r.flag) {
      case 'low':           return 'flag-low';
      case 'high':          return 'flag-high';
      case 'critical_low':  return 'flag-clow';
      case 'critical_high': return 'flag-chigh';
      default:              return 'normal';
    }
  }
  private flagLabel(r: ReportResult): string {
    switch (r.flag) {
      case 'low':           return 'L (low)';
      case 'high':          return 'H (high)';
      case 'critical_low':  return 'CRIT-LOW ⚠';
      case 'critical_high': return 'CRIT-HIGH ⚠';
      case 'normal':        return 'Normal';
      default:              return '—';
    }
  }
  private flagPillClass(r: ReportResult): string {
    if (r.flag === 'critical_low' || r.flag === 'critical_high') return 'crit';
    if (r.flag === 'low' || r.flag === 'high') return 'warn';
    return 'ok';
  }
  private statusPillClass(s: string): string {
    if (s === 'verified') return 'ok';
    if (s === 'entered') return 'warn';
    return 'gray';
  }
  private flagBadge(r: ReportResult): string {
    if (!r.flag || r.flag === 'normal') return `<span class="pill ok">Normal</span>`;
    return `<span class="pill ${this.flagPillClass(r)}">${this.flagLabel(r)}</span>`;
  }
}
