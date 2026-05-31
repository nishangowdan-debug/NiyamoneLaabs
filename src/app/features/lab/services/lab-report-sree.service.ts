import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { LabReportDataService, type ReportBundle, type ReportResult } from './lab-report-data.service';
import {
  BUILTIN_INFOGRAPHICS,
  type InfographicConfig,
  type PrintOptions,
} from '../data/lab-print.types';
import {
  DEFAULT_PRINT_MODE,
  type HospitalSettings,
  type InstructionSection,
  type SealAsset,
} from '../../pharmacy/services/hospital-settings.service';
// @ts-ignore — pure-JS, default export
import QRCode from 'qrcode-svg';

@Injectable({ providedIn: 'root' })
export class LabReportSreeService {
  private dataSvc = inject(LabReportDataService);
  private supabase = inject(SupabaseService);

  /** Fetch the order + open a printable HTML report in a new window. */
  async openReport(orderId: string, overrides: Partial<PrintOptions> = {}): Promise<void> {
    const bundle = await this.dataSvc.fetch(orderId);
    // Mint a 30-day public_token so the QR on the footer resolves to a real
    // patient-facing report URL. Failure is non-fatal — QR falls back to /verify.
    if (!bundle.order.public_token) {
      try {
        const { data } = await (this.supabase.client as any)
          .rpc('issue_lab_order_public_token', { p_order_id: orderId });
        if (typeof data === 'string') bundle.order.public_token = data;
      } catch { /* keep going */ }
    }
    const opts: PrintOptions = {
      ...DEFAULT_PRINT_MODE,
      ...(bundle.settings.lab_report_print_mode ?? {}),
      ...overrides,
    };
    const filename = this.buildFilename(bundle);
    const html = this.buildHtml(bundle, opts, filename);
    // Open with a named window — Chrome reads `name` as the default Save-As
    // PDF filename when no `download` attribute is present.
    const win = window.open('', filename, 'width=900,height=1100,scrollbars=yes');
    if (!win) { alert('Allow popups to view the lab report.'); return; }
    win.document.write(html);
    win.document.close();
    try { win.document.title = filename; } catch {}
    if (opts.autoPrint) setTimeout(() => win.print(), 500);
  }

  /** PatientName_DD-MMM-YYYY_UHID — same convention as the billing invoice. */
  private buildFilename(b: ReportBundle): string {
    const patient = (b.patient.full_name
      || `${b.patient.first_name ?? ''} ${b.patient.last_name ?? ''}`.trim()
      || 'Patient').trim();
    const raw = b.order.reported_at || b.order.collected_at || b.order.ordered_at || new Date().toISOString();
    const d = new Date(raw);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = isNaN(d.getTime())
      ? 'Unknown'
      : `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
    const safe = (s: string) => (s ?? '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    return `${safe(patient)}_${dateStr}_${safe(b.patient.uhid || 'NO-UHID')}`;
  }

  // ── HTML builder ────────────────────────────────────────────────────
  private buildHtml(b: ReportBundle, opts: PrintOptions, filename?: string): string {
    const s = b.settings;
    const topMm = opts.headerMode === 'no-header' ? opts.letterheadTopMm : 12;
    const botMm = opts.footerMode === 'no-footer' ? opts.letterheadBottomMm : 14;
    const docTitle = filename || `Lab Report · ${b.patient.uhid}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this.esc(docTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: ${topMm}mm 10mm ${botMm}mm 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2530; background: #eef0f3; font-size: 10pt; }
    .page { width: 210mm; min-height: calc(297mm - ${topMm + botMm}mm); padding: 6mm 6mm; background: #fff; margin: 0 auto; display: flex; flex-direction: column; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    @media screen { .page { box-shadow: 0 2px 14px rgba(0,0,0,0.08); margin: 16px auto; } body { padding: 0; } }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { margin: 0; box-shadow: none; }
    }
    .print-btn { position: fixed; top: 14px; right: 14px; background: #0F9D58; color: white; border: 0; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); z-index: 999; }

    /* Header */
    header.top { display: grid; grid-template-columns: 1fr 50px 1fr; gap: 6mm; align-items: center; padding-bottom: 3mm; border-bottom: 2px solid #1C4587; margin-bottom: 4mm; }
    .h-left { display: flex; gap: 8px; align-items: flex-start; }
    .h-logo { width: 60px; height: 60px; object-fit: contain; }
    .h-logo-fallback { width: 60px; height: 60px; background: #1C4587; color: white; font-size: 22pt; font-weight: 900; font-family: Georgia, serif; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .h-addr { font-size: 8.5pt; color: #1c2530; line-height: 1.45; }
    .h-addr strong { display:block; color: #1C4587; font-size: 9pt; }
    .h-center { display: flex; justify-content: center; }
    .h-center img { max-height: 50px; }
    .h-right { text-align: right; }
    .h-name { font-size: 18pt; font-weight: 800; color: #1C4587; line-height: 1.05; letter-spacing: -0.5px; }
    .h-tag  { font-size: 8.5pt; color: #1C4587; font-style: italic; margin-top: 2px; }

    /* Title strip */
    .title-strip { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 4mm; padding: 3mm 0; margin-bottom: 2mm; background: #f3f6fb; border-radius: 4px; padding-left: 4mm; padding-right: 4mm; }
    .title-strip h1 { font-size: 16pt; font-weight: 700; color: #1C4587; }
    .title-strip .barcode { text-align: center; }
    .title-strip .barcode svg { height: 28px; }
    .title-strip .regno { text-align: right; font-size: 9.5pt; color: #1c2530; font-weight: 600; }
    .title-strip .regno strong { color: #1C4587; }

    /* Patient details */
    .patient-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #d0d7e2; border-radius: 4px; overflow: hidden; margin-bottom: 3mm; font-size: 9pt; }
    .patient-grid > div { padding: 2mm 3mm; border-bottom: 1px solid #eef1f6; }
    .patient-grid > div:nth-child(odd) { border-right: 1px solid #eef1f6; background: #fafbfd; }
    .patient-grid .k { color: #65758C; font-weight: 600; margin-right: 4mm; display: inline-block; min-width: 40mm; }
    .patient-grid .v { color: #1c2530; font-weight: 600; }

    /* Section banner */
    .section-banner { background: #1C4587; color: white; text-align: center; padding: 2mm; font-size: 10pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin: 3mm 0 0; }

    /* Results table */
    table.results { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    table.results thead th { background: #f3f6fb; color: #1C4587; padding: 5px 8px; text-align: left; font-size: 9pt; font-weight: 700; border-bottom: 2px solid #1C4587; border-top: 1px solid #1C4587; }
    table.results thead th.num { text-align: right; }
    table.results tbody td { padding: 4px 8px; border-bottom: 1px solid #eef1f6; vertical-align: top; }
    table.results .test-name { font-weight: 700; color: #1C4587; }
    table.results .method { font-size: 8pt; color: #65758C; font-style: italic; }
    table.results .sample-row td { background: #f8fafd; padding: 3px 8px; font-weight: 600; font-size: 9pt; color: #45556a; }
    .num { text-align: right; font-family: 'JetBrains Mono', Consolas, monospace; font-weight: 600; }
    .flag-low,.flag-high  { color: #946100; font-weight: 800; }
    .flag-clow,.flag-chigh { color: #9b2017; font-weight: 800; }

    /* Infographic card */
    .infographic { border: 1px solid #d0d7e2; border-radius: 6px; padding: 3mm 4mm; margin: 3mm 0 2mm; background: #fafbfd; }
    .infographic h4 { font-size: 11pt; color: #1C4587; text-align: center; margin-bottom: 2mm; letter-spacing: 0.05em; }
    .infographic .sub { font-size: 8.5pt; color: #45556a; text-align: center; margin-bottom: 3mm; }
    .info-ranges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin-bottom: 3mm; }
    .info-range { padding: 2mm; border-radius: 4px; text-align: center; color: white; font-size: 9pt; }
    .info-range.tone-danger { background: #c0392b; }
    .info-range.tone-good { background: #27ae60; }
    .info-range.tone-warn { background: #e67e22; }
    .info-range .label { font-weight: 700; font-size: 10pt; }
    .info-range .threshold { margin-top: 1mm; font-size: 9pt; }
    .info-range .badge { display: inline-block; background: rgba(0,0,0,0.18); border-radius: 999px; padding: 1px 8px; margin-top: 1mm; font-size: 8pt; }
    .info-causes-title { text-align: center; font-size: 9pt; font-weight: 700; letter-spacing: 0.15em; color: #45556a; margin: 2mm 0 1mm; }
    .info-causes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; font-size: 8.5pt; }
    .info-causes-col { padding: 2mm; border: 1px solid #eef1f6; border-radius: 4px; background: #fff; }
    .info-causes-col h5 { font-size: 8.5pt; margin-bottom: 1mm; color: #1C4587; }
    .info-interp { margin-top: 2mm; padding: 2mm; background: #fff; border-left: 3px solid #1C4587; font-size: 8.5pt; color: #1c2530; }

    /* Interpretation block */
    .interp { margin: 3mm 0; padding: 2mm 3mm; border: 1px solid #eef1f6; border-radius: 4px; font-size: 9pt; }
    .interp .label { font-weight: 700; color: #1C4587; }

    /* End marker */
    .end-marker { text-align: center; margin: 5mm 0 4mm; font-size: 9pt; color: #65758C; letter-spacing: 0.1em; }

    /* Footer */
    footer.bottom { margin-top: auto; padding-top: 4mm; border-top: 1px solid #d0d7e2; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; align-items: end; font-size: 8.5pt; }
    .sig-block { text-align: center; }
    .sig-block img.sig { display: block; max-height: 14mm; max-width: 50mm; margin: 0 auto 1mm auto; object-fit: contain; }
    .sig-block .sig-name { font-weight: 700; color: #1c2530; border-top: 1px solid #45556a; padding-top: 1mm; }
    .sig-block .sig-role { font-size: 8pt; color: #65758C; }
    .seals-and-qr { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
    .seals { display: flex; gap: 4mm; justify-content: center; align-items: center; }
    .qr-block { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
    .qr-block svg { width: 18mm; height: 18mm; }
    .qr-cap { font-size: 7pt; color: #45556a; text-align: center; max-width: 38mm; }
    .seals img { max-height: 16mm; max-width: 18mm; object-fit: contain; }
    .seal-fallback { display: inline-block; width: 16mm; height: 16mm; border-radius: 50%; border: 2px solid #b1985a; font-size: 6pt; color: #b1985a; font-weight: 800; text-align: center; line-height: 1.1; padding-top: 4mm; }
    .page-meta { display: flex; justify-content: space-between; padding-top: 3mm; font-size: 7.5pt; color: #65758C; }
    .terms { font-size: 7.5pt; color: #65758C; padding: 2mm 3mm; border-top: 1px dashed #d0d7e2; text-align: center; font-style: italic; }

    /* Watermark */
    .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 60pt; font-weight: 800; color: rgba(28,69,135,0.06); transform: rotate(-30deg); pointer-events: none; z-index: 0; }

    /* Instructions page */
    .instr-title { font-size: 12pt; font-weight: 800; color: #1C4587; text-align: center; padding: 2mm; border: 2px solid #1C4587; border-radius: 4px; margin-bottom: 4mm; }
    .instr-section { margin-bottom: 3mm; }
    .instr-section h3 { font-size: 10.5pt; color: #1C4587; margin-bottom: 1mm; border-bottom: 1px solid #d0d7e2; padding-bottom: 1mm; }
    .instr-section ul { padding-left: 5mm; font-size: 9.5pt; line-height: 1.55; }
    .instr-section li { margin-bottom: 0.5mm; }
    .stay-strong { text-align: center; margin: 4mm 0; font-size: 11pt; font-weight: 700; color: #1C4587; letter-spacing: 0.2em; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>

  ${s.watermark_text ? `<div class="watermark">${this.esc(s.watermark_text)}</div>` : ''}

  <!-- ─────────────── PAGE 1 — REPORT ─────────────── -->
  <div class="page">
    ${opts.headerMode === 'with-header' ? this.renderHeader(b) : ''}
    ${this.renderTitleStrip(b)}
    ${this.renderPatient(b)}
    ${this.renderResults(b, opts)}
    ${this.renderEndMarker()}
    ${opts.footerMode === 'with-footer' ? this.renderFooter(b, 1, opts.includeInstructions ? 3 : 2) : ''}
  </div>

  ${opts.includeInstructions ? this.renderInstructionsPage(b, opts) : ''}

</body></html>`;
  }

  // ── Section renderers ───────────────────────────────────────────────
  private renderHeader(b: ReportBundle): string {
    const s = b.settings;
    const logo = s.logo_url || s.hospital_logo_url || '';
    const headerSeals: SealAsset[] = Array.isArray(s.header_seal_urls) ? s.header_seal_urls : [];
    const addr = this.buildAddressLine(s);
    return `
    <header class="top">
      <div class="h-left">
        ${logo
          ? `<img class="h-logo" src="${this.attr(logo)}" alt="logo" />`
          : `<div class="h-logo-fallback">+</div>`}
        <div class="h-addr">
          <strong>${this.esc(s.hospital_name) || 'Diagnostics'}</strong>
          ${addr ? `<div>${this.esc(addr)}</div>` : ''}
          ${s.hospital_phone ? `<div>Cell: ${this.esc(s.hospital_phone)}</div>` : ''}
          ${s.hospital_email ? `<div>E-mail: ${this.esc(s.hospital_email)}</div>` : ''}
          ${s.hospital_website ? `<div>Web: ${this.esc(s.hospital_website)}</div>` : ''}
        </div>
      </div>
      <div class="h-center">
        ${headerSeals.length
          ? headerSeals.map(s => `<img src="${this.attr(s.url)}" alt="${this.attr(s.name)}" />`).join('')
          : ''}
      </div>
      <div class="h-right">
        <div class="h-name">${this.esc(s.hospital_name)}</div>
        ${s.hospital_tagline ? `<div class="h-tag">${this.esc(s.hospital_tagline)}</div>` : ''}
      </div>
    </header>`;
  }

  private renderTitleStrip(b: ReportBundle): string {
    const regNo = b.order.sample_id || `R-${b.order.id.slice(0, 6).toUpperCase()}`;
    return `
    <div class="title-strip">
      <h1>Report Summary</h1>
      <div class="barcode">${this.renderBarcodeSvg(regNo)}</div>
      <div class="regno"><strong>Registration No</strong> : ${this.esc(regNo)}</div>
    </div>`;
  }

  private renderPatient(b: ReportBundle): string {
    const fullName = b.patient.full_name || `${b.patient.first_name} ${b.patient.last_name}`.trim();
    const age = this.computeAge(b.patient.date_of_birth);
    const gender = b.patient.gender ? b.patient.gender.charAt(0).toUpperCase() + b.patient.gender.slice(1) : '';
    const doctor = b.doctor?.full_name || 'SELF';
    return `
    <div class="patient-grid">
      <div><span class="v" style="font-weight:800;color:#1C4587;">${this.esc(fullName)}</span></div>
      <div><span class="k">Registration Date</span><span class="v">: ${this.fmtDateTime(b.order.ordered_at)}</span></div>
      <div><span class="k">Age / Gender</span><span class="v">: ${age} / ${this.esc(gender)}</span></div>
      <div><span class="k">Collection Date</span><span class="v">: ${this.fmtDateTime(b.order.collected_at) || this.fmtDateTime(b.order.ordered_at)}</span></div>
      <div><span class="k">Ref By</span><span class="v">: Dr. ${this.esc(doctor)}</span></div>
      <div><span class="k">Reporting Date</span><span class="v">: ${this.fmtDateTime(b.order.reported_at)}</span></div>
      ${b.patient.mobile ? `<div><span class="k">Mobile</span><span class="v">: ${this.esc(b.patient.mobile)}</span></div>` : '<div></div>'}
      <div><span class="k">UHID</span><span class="v">: ${this.esc(b.patient.uhid)}</span></div>
    </div>`;
  }

  private renderResults(b: ReportBundle, opts: PrintOptions): string {
    // Group results by category
    const byCategory: Record<string, ReportResult[]> = {};
    for (const r of b.results) {
      const cat = (r.test.category ?? 'OTHER').toString().toUpperCase();
      (byCategory[cat] = byCategory[cat] ?? []).push(r);
    }

    const sections = Object.entries(byCategory).map(([cat, rs]) => {
      const sampleType = rs.find(r => r.test.specimen_type)?.test.specimen_type ?? 'Serum';
      const panelName = rs[0]?.test.code || cat;
      const rows = rs.map((r) => this.renderResultRow(r, opts, b)).join('');
      return `
        <div class="section-banner">${this.esc(cat)}</div>
        <table class="results">
          <thead>
            <tr>
              <th style="width:34%">Test Description</th>
              <th class="num" style="width:12%">Result</th>
              <th style="width:10%">Units</th>
              <th style="width:22%">Referral Ranges</th>
              <th style="width:22%">Method</th>
            </tr>
          </thead>
          <tbody>
            <tr class="sample-row">
              <td colspan="3"><strong>${this.esc(panelName)}</strong></td>
              <td colspan="2" style="text-align:right;">Sample Type : <strong>${this.esc(sampleType)}</strong></td>
            </tr>
            ${rows}
          </tbody>
        </table>`;
    }).join('');

    return sections;
  }

  private renderResultRow(r: ReportResult, opts: PrintOptions, b: ReportBundle): string {
    // If the test catalog defines parameter rows, expand them inline. Otherwise
    // fall back to the legacy one-row-per-test layout.
    const params = (r as any).parameters as any[] | undefined;
    if (params && params.length > 0) {
      return this.renderParameterRows(r, params, b);
    }

    const value = this.formatValue(r);
    const unit = r.test.unit ?? '';
    const ref = this.refRangeText(r.test);
    const method = r.test.method ? `(Method: ${this.esc(r.test.method)})` : '';
    const flagClass = this.flagClass(r);
    const info = this.resolveInfographic(r);

    const interpretation = r.test.clinical_significance
      ? `<div class="interp"><span class="label">Interpretation ::</span> ${this.esc(r.test.clinical_significance)}</div>`
      : '';

    const infoCard = opts.includeInfographics && info ? this.renderInfographic(info) : '';

    return `
      <tr>
        <td><span class="test-name">${this.esc(r.test.name)}</span></td>
        <td class="num ${flagClass}">${value}</td>
        <td>${this.esc(unit)}</td>
        <td>${this.esc(ref)}</td>
        <td><span class="method">${method}</span></td>
      </tr>
      ${infoCard ? `<tr><td colspan="5">${infoCard}</td></tr>` : ''}
      ${interpretation ? `<tr><td colspan="5">${interpretation}</td></tr>` : ''}
    `;
  }

  /** Render one row per catalog-defined parameter (CBC → Hb, RBC, WBC ...).
   *  Section-header rows span all columns. Each parameter's `font` JSON is
   *  applied inline so per-row typography from the editor survives into PDF. */
  private renderParameterRows(r: ReportResult, params: any[], b: ReportBundle): string {
    const testHeader = `
      <tr class="sample-row">
        <td colspan="5"><strong>${this.esc(r.test.name)}</strong> · <span style="color:#65758C;font-weight:500;">${this.esc(r.test.code)}</span></td>
      </tr>`;

    const rows = params.map((p) => {
      if (p.is_section_header) {
        const label = p.parameter || p.section || '';
        return `
          <tr>
            <td colspan="5" style="background:#eef1f6;font-weight:800;color:#1C4587;letter-spacing:0.05em;padding:3px 8px;text-transform:uppercase;">
              ${this.esc(label)}
            </td>
          </tr>`;
      }

      const range = this.resolveParameterRange(p, b.patient);
      const v = p.value ?? null;
      const value = this.formatParameterValue(v);
      const flag = v?.flag || this.derivedFlag(v, p);
      const flagCls = this.parameterFlagClass(flag);
      const cellStyle = this.parameterCellStyle(p.font);
      const method = p.method ? `(Method: ${this.esc(p.method)})` : '';

      return `
        <tr>
          <td style="${cellStyle}"><span class="test-name">${this.esc(p.parameter)}</span></td>
          <td class="num ${flagCls}" style="${cellStyle}">${value}</td>
          <td style="${cellStyle}">${this.esc(p.unit ?? '')}</td>
          <td style="${cellStyle}">${this.esc(range)}</td>
          <td style="${cellStyle}"><span class="method">${method}</span></td>
        </tr>`;
    }).join('');

    return testHeader + rows;
  }

  /** Pick the first ref_override matching the patient's cohort (currently just
   *  gender). Falls back to the row's scalar low/high or display string. */
  private resolveParameterRange(p: any, patient: ReportBundle['patient']): string {
    const overrides = Array.isArray(p.ref_overrides) ? p.ref_overrides : [];
    const gender = (patient?.gender ?? '').toLowerCase();
    const match = overrides.find((o: any) =>
      o.scope === gender || (gender === 'm' && o.scope === 'male') || (gender === 'f' && o.scope === 'female')
    );
    if (match) {
      if (match.display) return match.display;
      if (match.low != null && match.high != null) return `${match.low} – ${match.high}`;
    }
    if (p.normal_range_display) return p.normal_range_display;
    if (p.low_value != null && p.high_value != null) return `${p.low_value} – ${p.high_value}`;
    if (p.low_value != null) return `> ${p.low_value}`;
    if (p.high_value != null) return `< ${p.high_value}`;
    return '—';
  }

  private formatParameterValue(v: { value_numeric: number | null; value_text: string | null } | null): string {
    if (!v) return '—';
    if (v.value_numeric != null) return String(v.value_numeric);
    if (v.value_text != null && v.value_text !== '') return this.esc(v.value_text);
    return '—';
  }

  /** Derive a flag from the parameter's low/high when none was saved. */
  private derivedFlag(v: { value_numeric: number | null } | null, p: any): string | null {
    if (!v || v.value_numeric == null) return null;
    const n = Number(v.value_numeric);
    if (p.low_value != null && n < Number(p.low_value)) return 'low';
    if (p.high_value != null && n > Number(p.high_value)) return 'high';
    return null;
  }

  private parameterFlagClass(flag: string | null): string {
    switch (flag) {
      case 'low':           return 'flag-low';
      case 'high':          return 'flag-high';
      case 'critical_low':  return 'flag-clow';
      case 'critical_high': return 'flag-chigh';
      default:              return '';
    }
  }

  /** Convert the parameter's font JSON into an inline `style="…"` value. */
  private parameterCellStyle(font: any): string {
    if (!font || typeof font !== 'object') return '';
    const parts: string[] = [];
    if (font.family) parts.push(`font-family:${this.cssEsc(font.family)}`);
    if (font.size)   parts.push(`font-size:${Number(font.size)}pt`);
    if (font.weight) parts.push(`font-weight:${font.weight === 'bold' ? '700' : '400'}`);
    if (font.italic) parts.push(`font-style:italic`);
    if (font.color)  parts.push(`color:${this.cssEsc(font.color)}`);
    return parts.join(';');
  }

  /** Strip characters that would break out of an inline style attribute. */
  private cssEsc(s: string): string {
    return String(s).replace(/[";<>\\]/g, '');
  }

  private renderInfographic(info: InfographicConfig): string {
    const ranges = info.ranges
      .map((r) => `
        <div class="info-range tone-${r.tone}">
          ${r.badge ? `<div class="badge">${this.esc(r.badge)}</div>` : ''}
          <div class="label">${this.esc(r.label)}</div>
          <div class="threshold">${this.esc(r.threshold)}</div>
        </div>`)
      .join('');

    const causes = (info.causes ?? [])
      .map((c) => `
        <div class="info-causes-col">
          <h5>${this.esc(c.group)} Blood Sugar</h5>
          <ul style="padding-left:4mm;">
            ${(c.items ?? []).map((i) => `<li>${this.esc(i)}</li>`).join('')}
          </ul>
        </div>`)
      .join('');

    return `
      <div class="infographic">
        <h4>${this.esc(info.title)}</h4>
        ${info.subtitle ? `<div class="sub">${this.esc(info.subtitle)}</div>` : ''}
        <div class="info-ranges">${ranges}</div>
        ${causes ? `<div class="info-causes-title">CAUSES</div><div class="info-causes">${causes}</div>` : ''}
        ${info.interpretation ? `<div class="info-interp"><strong>INTERPRETATION</strong> — ${this.esc(info.interpretation)}</div>` : ''}
      </div>`;
  }

  private renderEndMarker(): string {
    return `<div class="end-marker">--------- End of the Report ---------</div>`;
  }

  private renderFooter(b: ReportBundle, page: number, total: number): string {
    const s = b.settings;
    const tech = b.technician;
    const verifier = b.verifier;
    // Render each configured seal: as an <img> when the admin has uploaded
    // an image, or as a clean text badge when the URL is empty. The old
    // implementation always emitted <img src="..."> which renders as a
    // broken-image icon in PDFs whenever the seal slot was named but no
    // image had been uploaded yet (the common state after fresh setup).
    const seals: SealAsset[] = Array.isArray(s.footer_seal_urls) ? s.footer_seal_urls : [];
    const sealsHtml = seals.length
      ? seals.map((x) => {
          const url = (x?.url ?? '').trim();
          if (url) {
            return `<img src="${this.attr(url)}" alt="${this.attr(x.name ?? '')}" />`;
          }
          // No image uploaded — show the seal name as a text badge so the
          // admin still sees their configured accreditations on the report.
          const label = (x?.name ?? '').replace(/\s+/g, '<br>') || 'QA';
          return `<div class="seal-fallback">${label}</div>`;
        }).join('')
      : `<div class="seal-fallback">ISO<br>9001:2015</div>
         <div class="seal-fallback">QUALITY<br>APPROVED</div>
         <div class="seal-fallback">${this.esc(s.accreditations?.[0]?.number || 'QA-NABL')}</div>`;

    const qrSvg = this.renderVerificationQr(b.order.public_token, b.order.id);

    return `
    <footer class="bottom">
      <div class="sig-block">
        ${tech?.signature_data_url ? `<img class="sig" src="${this.attr(tech.signature_data_url)}" alt="tech sig" />` : '<div style="height:14mm;"></div>'}
        <div class="sig-name">LAB TECHNICIAN</div>
        <div class="sig-role">${this.esc(tech?.full_name || 'Analysed & Reported by')}</div>
      </div>
      <div class="seals-and-qr">
        <div class="seals">${sealsHtml}</div>
        ${qrSvg ? `<div class="qr-block">${qrSvg}<div class="qr-cap">Scan QR here for reports download</div></div>` : ''}
      </div>
      <div class="sig-block">
        ${verifier?.signature_data_url ? `<img class="sig" src="${this.attr(verifier.signature_data_url)}" alt="verifier sig" />` : '<div style="height:14mm;"></div>'}
        <div class="sig-name">${this.esc(verifier?.full_name || 'Dr. Authorised Pathologist')}</div>
        <div class="sig-role">Approved by</div>
      </div>
    </footer>
    <div class="page-meta">
      <span>${s.show_medico_legal_note ? 'NOT FOR MEDICO-LEGAL PURPOSE.' : ''}</span>
      <span>Page ${page} of ${total}</span>
    </div>
    ${s.terms_overleaf ? `<div class="terms">${this.esc(s.terms_overleaf)}</div>` : ''}`;
  }

  private renderInstructionsPage(b: ReportBundle, opts: PrintOptions): string {
    const sections: InstructionSection[] = Array.isArray(b.instructions) && b.instructions.length
      ? b.instructions
      : [];
    const items = sections.map((sec, idx) => `
      <div class="instr-section">
        <h3>${idx + 1}. ${this.esc(sec.title)}</h3>
        <ul>${(sec.bullets ?? []).map((b) => `<li>${this.esc(b)}</li>`).join('')}</ul>
      </div>`).join('');

    return `
    <div class="page">
      ${opts.headerMode === 'with-header' ? this.renderHeader(b) : ''}
      ${this.renderTitleStrip(b)}
      <div class="instr-title">General Health Instructions &amp; Suggestions for Patients</div>
      ${items}
      <div class="stay-strong">* Stay Healthy, Stay Strong. *</div>
      ${opts.footerMode === 'with-footer' ? this.renderFooter(b, 2, 2) : ''}
    </div>`;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  private resolveInfographic(r: ReportResult): InfographicConfig | null {
    const fromTest = r.test.infographic;
    if (fromTest && typeof fromTest === 'object' && Array.isArray(fromTest.ranges)) {
      return fromTest as InfographicConfig;
    }
    const code = (r.test.code ?? '').toUpperCase();
    return BUILTIN_INFOGRAPHICS[code] ?? null;
  }

  private renderBarcodeSvg(text: string): string {
    // Lightweight Code-128-ish visual barcode via stripes.
    // (Replace with bwip-js render if/when added.)
    const seed = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    let bars = '';
    let x = 0;
    for (let i = 0; i < text.length * 4 + 16; i++) {
      const w = ((seed + i * 7) % 3) + 1;
      const fill = i % 2 === 0 ? '#1c2530' : '#fff';
      bars += `<rect x="${x}" y="0" width="${w}" height="28" fill="${fill}" />`;
      x += w;
    }
    return `<svg width="${x}" height="32" xmlns="http://www.w3.org/2000/svg">${bars}<text x="${x / 2}" y="32" text-anchor="middle" font-size="8" font-family="monospace" fill="#1c2530">${this.esc(text)}</text></svg>`;
  }

  private renderVerificationQr(token: string | null | undefined, fallback: string): string {
    if (typeof window === 'undefined') return '';
    const origin = window.location?.origin || '';
    // Prefer the public patient-facing report URL (covered by RLS via the
    // token). Fall back to the internal /lab/verify route for the order id
    // when no token is available.
    const url = token
      ? `${origin}/public/lab-report/${encodeURIComponent(token)}`
      : `${origin}/lab/verify/${encodeURIComponent(fallback)}`;
    try {
      const qr = new QRCode({ content: url, padding: 1, width: 70, height: 70, color: '#0F1B2D', background: '#FFFFFF', ecl: 'M', join: true });
      return qr.svg();
    } catch {
      return '';
    }
  }

  private buildAddressLine(s: HospitalSettings): string {
    if (s.hospital_address && s.hospital_address.trim()) return s.hospital_address;
    return [s.hospital_address_line1, s.hospital_address_line2, s.hospital_city, s.hospital_state, s.hospital_pincode]
      .filter((p) => p && String(p).trim().length).join(', ');
  }

  private esc(s: string | null | undefined): string {
    return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  private attr(s: string | null | undefined): string {
    return (s ?? '').toString().replace(/"/g, '&quot;');
  }
  private fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const yr = d.getFullYear();
    let hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ap = hh >= 12 ? 'pm' : 'am';
    hh = hh % 12 || 12;
    return `${day}-${mon}-${yr} / ${String(hh).padStart(2, '0')}:${mm}:${ss} ${ap}`;
  }
  private computeAge(dob: string | null | undefined): string {
    if (!dob) return '';
    const yrs = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    if (yrs < 0 || yrs > 130) return '';
    return `${yrs}Years`;
  }
  private formatValue(r: ReportResult): string {
    if (r.value_numeric != null) return String(r.value_numeric);
    if (r.value_text != null) return this.esc(r.value_text);
    return '—';
  }
  private refRangeText(t: ReportResult['test']): string {
    if (t.ref_min != null && t.ref_max != null) return `${t.ref_min} - ${t.ref_max}`;
    if (t.ref_min != null) return `> ${t.ref_min}`;
    if (t.ref_max != null) return `< ${t.ref_max}`;
    return '—';
  }
  private flagClass(r: ReportResult): string {
    switch (r.flag) {
      case 'low':           return 'flag-low';
      case 'high':          return 'flag-high';
      case 'critical_low':  return 'flag-clow';
      case 'critical_high': return 'flag-chigh';
      default:              return '';
    }
  }
}
