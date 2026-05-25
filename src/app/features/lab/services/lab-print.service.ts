import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface ResultRow {
  id: string;
  test_id: string;
  code: string;
  name: string;
  category: string | null;
  panel_group: string | null;
  specimen_type: string | null;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  critical_low: number | null;
  critical_high: number | null;
  reference_text: string | null;
  technology: string | null;
  methodology: string | null;
  clinical_significance: string | null;
  interpretation_table: { label: string; range: string }[] | null;
  value_numeric: number | null;
  value_text: string | null;
  flag: 'low' | 'high' | 'critical_low' | 'critical_high' | 'normal' | null;
  status: string;
  entered_at: string | null;
  verified_at: string | null;
  notes: string | null;
}

interface ReportBundle {
  order: any;
  patient: any;
  doctor: any | null;
  reporting_pathologist: any | null;
  verifier: any | null;
  branch: any;
  settings: any | null;
  sample: {
    sample_id: string | null;
    barcode_id: string | null;
    sample_status: string | null;
    collected_at: string | null;
    received_at: string | null;
    reported_at: string | null;
  };
  results: ResultRow[];
}

@Injectable({ providedIn: 'root' })
export class LabPrintService {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  async printLabReport(orderId: string): Promise<void> {
    const bundle = await this.fetchBundle(orderId);
    this.openHtml(this.buildReport(bundle), 'Lab Report');
  }

  private async fetchBundle(orderId: string): Promise<ReportBundle> {
    const { data, error } = await (this.supabase.client as any)
      .rpc('lab_report_bundle', { p_order_id: orderId });
    if (error) throw error;
    return data as ReportBundle;
  }

  // ── helpers ────────────────────────────────────────────────────────
  private esc(s: string | null | undefined): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  private fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  private hospitalName(b: any): string {
    return this.esc(b?.prescription_header ?? b?.name ?? 'Diagnostics');
  }
  private formatAddr(addr: unknown): string {
    if (!addr || typeof addr !== 'object') return '';
    const a = addr as Record<string, string>;
    return [a['line1'], a['line2'], a['city'], a['state'] ? `${a['state']} ${a['pin'] ?? ''}`.trim() : '']
      .map(x => this.esc(x)).filter(Boolean).join('<br>');
  }
  private patientLine(p: any): string {
    const dob = p?.date_of_birth;
    let agePart = '';
    if (dob) {
      const ms = Date.now() - new Date(dob).getTime();
      const totalMonths = Math.floor(ms / (30.44 * 86400000));
      const years = Math.floor(totalMonths / 12);
      agePart = `${years}Y`;
    }
    const g = p?.gender ? p.gender[0].toUpperCase() : '';
    return [agePart, g].filter(Boolean).join(' / ');
  }
  private flagChip(flag: ResultRow['flag']): string {
    if (!flag || flag === 'normal') return '';
    const tone: Record<string, { bg: string; fg: string; label: string }> = {
      low:           { bg: '#FEE2E2', fg: '#A4302B', label: 'L'   },
      high:          { bg: '#FEE2E2', fg: '#A4302B', label: 'H'   },
      critical_low:  { bg: '#7F1D1D', fg: '#FFFFFF', label: 'LL'  },
      critical_high: { bg: '#7F1D1D', fg: '#FFFFFF', label: 'HH'  },
    };
    const t = tone[flag] ?? tone['high'];
    return `<span style="display:inline-block;background:${t.bg};color:${t.fg};font-size:7.5pt;font-weight:700;padding:1.5px 5px;border-radius:3px;margin-left:4px;">${t.label}</span>`;
  }
  private valueDisplay(r: ResultRow): string {
    const isOutOfRange = !!r.flag && r.flag !== 'normal';
    const v = r.value_numeric != null ? this.fmtNumber(r.value_numeric) : this.esc(r.value_text);
    const weight = isOutOfRange ? '700' : '600';
    const color  = isOutOfRange ? '#A4302B' : '#0F1B2D';
    return `<span style="font-weight:${weight};color:${color};">${v ?? '—'}</span>${this.flagChip(r.flag)}`;
  }
  private fmtNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, '');
  }
  private refDisplay(r: ResultRow): string {
    if (r.reference_text && r.reference_text.trim()) return this.esc(r.reference_text);
    if (r.ref_min != null && r.ref_max != null) return `${this.fmtNumber(r.ref_min)} - ${this.fmtNumber(r.ref_max)}`;
    if (r.ref_min != null) return `≥ ${this.fmtNumber(r.ref_min)}`;
    if (r.ref_max != null) return `< ${this.fmtNumber(r.ref_max)}`;
    return '—';
  }

  private openHtml(html: string, title: string): void {
    const win = window.open('', '_blank', 'width=820,height=900,scrollbars=yes');
    if (!win) { alert(`Allow popups to print ${title}.`); return; }
    win.document.write(html);
    win.document.close();
  }

  // ── shared chrome ──────────────────────────────────────────────────
  private commonStyles(): string {
    return `
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #0F1B2D; background: #f5f5f5; }
      .page { width: 210mm; min-height: 297mm; background: #fff; margin: 0 auto; padding: 14mm 14mm 18mm; position: relative; }
      table { border-collapse: collapse; width: 100%; }
      .pageBreak { page-break-before: always; }
      @media print { body { background: white; } .no-print { display: none !important; } .page { margin: 0; box-shadow: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      @media screen { .page { box-shadow: 0 2px 20px rgba(0,0,0,.12); margin: 16px auto; } }`;
  }
  private printButton(): string {
    return `<button class="no-print" onclick="window.print()" style="position:fixed;top:14px;right:14px;background:#0E4F8C;color:white;border:none;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.3);">🖨 Print / Save PDF</button>`;
  }

  private headerBlock(b: ReportBundle): string {
    const br = b.branch;
    const addr = this.formatAddr(br?.address);
    const tagline = b.settings?.header_tagline ?? '98% reports released within 6 hours* | Comprehensive Diagnostics';
    const accreds: string[] = (b.settings?.accreditations as string[]) ?? [];
    const accredPills = accreds.map(a => `<span style="background:#0E4F8C;color:#fff;padding:2px 8px;border-radius:3px;font-size:7.5pt;font-weight:700;letter-spacing:0.5px;">${this.esc(a)}</span>`).join(' ');
    return `
    <header style="margin-bottom:5mm;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:3mm; border-bottom: 1px solid #DCE3EE;">
        <div style="font-size:8pt;color:#65758C;line-height:1.5;">
          <div style="font-weight:700;color:#0F1B2D;">Processed at:</div>
          ${addr || this.esc(br?.name ?? '')}
        </div>
        <div style="text-align:right;">
          <div style="font-size:18pt;font-weight:900;color:#0E4F8C;letter-spacing:-0.5px;line-height:1;">
            <span style="color:#0E4F8C;">${this.hospitalName(br)}</span>
            <span style="display:inline-block;background:#16A34A;color:#fff;font-size:8pt;font-weight:700;padding:2px 6px;border-radius:3px;vertical-align:middle;margin-left:4px;letter-spacing:0.5px;">Clinical<br>Diagnostics</span>
          </div>
          ${accredPills ? `<div style="margin-top:3mm;">${accredPills}</div>` : ''}
        </div>
      </div>
      <div style="background:linear-gradient(90deg,#16A34A,#0E4F8C);color:#fff;padding:5px 12px;font-size:10pt;font-weight:700;letter-spacing:0.4px;margin-top:4mm;">
        ${this.esc(tagline)}
      </div>
    </header>`;
  }

  private patientBanner(b: ReportBundle): string {
    const p = b.patient;
    const o = b.order;
    const s = b.sample;
    const addr = this.formatAddr(p?.address);
    return `
    <section style="display:grid;grid-template-columns:1.1fr 1fr;gap:8mm;border-bottom:1px solid #DCE3EE;padding-bottom:4mm;margin-bottom:4mm;">
      <div style="font-size:9pt;line-height:1.6;">
        <table style="font-size:9pt;">
          <tr><td style="color:#65758C;padding:1.5px 12px 1.5px 0;width:32%;">Patient Name</td><td style="font-weight:700;">: ${this.esc(p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())} (${this.patientLine(p)})</td></tr>
          <tr><td style="color:#65758C;padding:1.5px 12px 1.5px 0;">UHID</td><td style="font-weight:700;font-family:monospace;color:#0E4F8C;">: ${this.esc(p.uhid)}</td></tr>
          <tr><td style="color:#65758C;padding:1.5px 12px 1.5px 0;">Referred By</td><td>: ${b.doctor ? `Dr. ${this.esc(b.doctor.full_name).replace(/^Dr\.?\s*/i, '')}` : 'SELF'}</td></tr>
          ${addr ? `<tr><td style="color:#65758C;padding:3px 12px 0 0;vertical-align:top;">Address</td><td style="line-height:1.4;">: ${addr}</td></tr>` : ''}
        </table>
      </div>
      <div style="font-size:9pt;line-height:1.6;">
        <table style="font-size:9pt;">
          <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;width:46%;">Sample Collected on (SCT)</td><td>: <span style="font-weight:600;">${this.fmtDateTime(s.collected_at)}</span></td></tr>
          <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Sample Received on (SRT)</td><td>: <span style="font-weight:600;">${this.fmtDateTime(s.received_at)}</span></td></tr>
          <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Report Released on (RRT)</td><td>: <span style="font-weight:600;">${this.fmtDateTime(s.reported_at)}</span></td></tr>
          <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Sample Type | Barcode</td><td>: <span style="font-family:monospace;font-weight:700;">${this.esc(s.sample_status ?? '—')} | ${this.esc(s.barcode_id ?? s.sample_id ?? '—')}</span></td></tr>
          <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Tests Done</td><td>: <span style="font-weight:600;">${this.testsDoneLabel(b)}</span></td></tr>
        </table>
      </div>
    </section>`;
  }

  private testsDoneLabel(b: ReportBundle): string {
    const groups = new Set<string>();
    for (const r of b.results) groups.add((r.panel_group || r.category || 'GENERAL').toUpperCase());
    return [...groups].slice(0, 4).map(g => this.esc(g)).join(', ') + (groups.size > 4 ? ` +${groups.size - 4} more` : '');
  }

  // ── PAGE 1: availability summary ───────────────────────────────────
  private availabilitySummary(b: ReportBundle): string {
    const ready = b.results.filter(r => r.status === 'verified' || r.status === 'reported').length;
    const processing = b.results.filter(r => r.status === 'in_progress' || r.status === 'pending').length;
    const cancelled = b.results.filter(r => r.status === 'cancelled').length;
    const grouped = this.groupByPanel(b.results);
    const rows = grouped.map(([panel, items]) => `
      <tr><td colspan="2" style="padding:9px 10px;background:#F1F5F9;font-weight:700;color:#0F1B2D;font-size:10pt;">${this.esc(panel)}</td></tr>
      ${items.map(it => `
        <tr>
          <td style="padding:6px 10px 6px 18px;color:#0F1B2D;border-bottom:1px solid #EDF1F7;">${this.esc(it.name)}</td>
          <td style="padding:6px 10px;text-align:right;color:#16A34A;font-weight:600;border-bottom:1px solid #EDF1F7;">${this.statusChip(it.status)}</td>
        </tr>`).join('')}
    `).join('');

    return `
    <section style="margin-bottom:5mm;">
      <h2 style="font-size:14pt;font-weight:800;color:#0F1B2D;margin-bottom:2mm;">Report Availability Summary</h2>
      <p style="font-size:8.5pt;color:#65758C;margin-bottom:3mm;"><strong>Note:</strong> Refer to the table below for the status of your tests.</p>
      <div style="display:flex;gap:14mm;padding:3mm 0;border-top:1px dashed #DCE3EE;border-bottom:1px dashed #DCE3EE;margin-bottom:3mm;font-size:9pt;">
        <span><span style="color:#16A34A;font-weight:700;">✓ ${ready}</span> Ready</span>
        <span><span style="color:#0E4F8C;font-weight:700;">↻ ${processing}</span> Processing</span>
        <span><span style="color:#A4302B;font-weight:700;">✕ ${cancelled}</span> Cancelled</span>
      </div>
      <table style="border:1px solid #DCE3EE;border-radius:4px;overflow:hidden;">
        <thead><tr style="background:#0F1B2D;color:#fff;">
          <th style="padding:8px 10px;text-align:left;font-size:9pt;letter-spacing:0.06em;">TEST DETAILS</th>
          <th style="padding:8px 10px;text-align:right;font-size:9pt;letter-spacing:0.06em;width:30%;">REPORT STATUS</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }
  private statusChip(status: string): string {
    if (status === 'verified' || status === 'reported') return `Ready <span style="color:#16A34A;">✓</span>`;
    if (status === 'cancelled') return `Cancelled <span style="color:#A4302B;">✕</span>`;
    return `Processing ↻`;
  }

  // ── PAGE 2: tests outside reference range ──────────────────────────
  private outsideRange(b: ReportBundle): string {
    const out = b.results.filter(r => !!r.flag && r.flag !== 'normal');
    if (!out.length) {
      return `
      <section style="margin-bottom:5mm;">
        <h2 style="font-size:14pt;font-weight:800;color:#0F1B2D;margin-bottom:2mm;">Tests Outside Reference Range</h2>
        <p style="font-size:9pt;color:#16A34A;font-weight:600;background:#DCFCE7;padding:8px 12px;border-radius:4px;">All tested parameters are within their biological reference intervals. ✓</p>
      </section>`;
    }
    const grouped = this.groupByPanel(out);
    const rows = grouped.map(([panel, items]) => `
      <tr><td colspan="4" style="padding:9px 10px;background:#F1F5F9;font-weight:700;color:#0F1B2D;font-size:10pt;text-transform:uppercase;letter-spacing:0.04em;">${this.esc(panel)}</td></tr>
      ${items.map(r => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #EDF1F7;">${this.esc(r.name)}</td>
          <td style="padding:6px 10px;font-weight:700;border-bottom:1px solid #EDF1F7;">${this.valueDisplay(r)}</td>
          <td style="padding:6px 10px;color:#65758C;border-bottom:1px solid #EDF1F7;">${this.esc(r.unit ?? '')}</td>
          <td style="padding:6px 10px;color:#65758C;border-bottom:1px solid #EDF1F7;">${this.refDisplay(r)}</td>
        </tr>`).join('')}
    `).join('');
    return `
    <section style="margin-bottom:5mm;">
      <h2 style="font-size:14pt;font-weight:800;color:#0F1B2D;margin-bottom:2mm;">Tests Outside Reference Range</h2>
      <p style="font-size:8.5pt;color:#65758C;margin-bottom:3mm;"><strong>Note:</strong> The values below are outside the biological reference interval (BRI). Please correlate clinically.</p>
      <table style="border:1px solid #DCE3EE;font-size:9.5pt;">
        <thead><tr style="background:#0F1B2D;color:#fff;">
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;">Test Name</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:18%;">Observed</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:14%;">Units</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:24%;">Bio. Ref. Interval</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:7.5pt;color:#65758C;margin-top:3mm;font-style:italic;"><strong>Disclaimer:</strong> The above is a summary of out-of-range parameters. For detailed values, methodologies and clinical interpretation, refer to the subsequent pages.</p>
    </section>`;
  }

  // ── DETAIL PAGES: per-panel detailed view ──────────────────────────
  private detailPages(b: ReportBundle): string {
    const grouped = this.groupByPanel(b.results);
    return grouped.map(([panel, items]) => `
    <section class="pageBreak" style="margin-bottom:5mm;">
      <h2 style="font-size:12pt;font-weight:800;color:#0F1B2D;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #0E4F8C;padding-bottom:2mm;margin-bottom:3mm;">${this.esc(panel)}</h2>
      <table style="border:1px solid #DCE3EE;font-size:9.5pt;">
        <thead><tr style="background:#0F1B2D;color:#fff;">
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;">TEST NAME</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:24%;">TECHNOLOGY</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:14%;">VALUE</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:11%;">UNITS</th>
          <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:21%;">Bio. Ref. Interval</th>
        </tr></thead>
        <tbody>
          ${items.map(r => this.detailRow(r)).join('')}
        </tbody>
      </table>
    </section>`).join('');
  }

  private detailRow(r: ResultRow): string {
    const interpretation = (r.interpretation_table ?? []).map(it =>
      `<tr><td style="padding:3px 8px;border:1px solid #DCE3EE;color:#0F1B2D;">${this.esc(it.label)}</td><td style="padding:3px 8px;border:1px solid #DCE3EE;font-family:monospace;color:#65758C;">${this.esc(it.range)}</td></tr>`
    ).join('');
    const isOut = !!r.flag && r.flag !== 'normal';
    const rowBg = isOut ? '#FEF2F2' : '#fff';
    return `
      <tr style="background:${rowBg};">
        <td style="padding:8px 10px;font-weight:700;color:#0F1B2D;border-top:1px solid #DCE3EE;border-bottom:1px solid #EDF1F7;">${this.esc(r.name)}</td>
        <td style="padding:8px 10px;color:#65758C;border-top:1px solid #DCE3EE;border-bottom:1px solid #EDF1F7;">${this.esc(r.technology ?? r.methodology ?? '—')}</td>
        <td style="padding:8px 10px;border-top:1px solid #DCE3EE;border-bottom:1px solid #EDF1F7;">${this.valueDisplay(r)}</td>
        <td style="padding:8px 10px;color:#65758C;border-top:1px solid #DCE3EE;border-bottom:1px solid #EDF1F7;">${this.esc(r.unit ?? '')}</td>
        <td style="padding:8px 10px;color:#65758C;border-top:1px solid #DCE3EE;border-bottom:1px solid #EDF1F7;">${this.refDisplay(r)}</td>
      </tr>
      ${(r.clinical_significance || interpretation || r.methodology || r.notes) ? `
      <tr>
        <td colspan="5" style="padding:6px 10px 10px;border-bottom:1px solid #DCE3EE;background:#F8FAFD;">
          ${interpretation ? `<table style="margin-bottom:3mm;font-size:8.5pt;border-collapse:collapse;">${interpretation}</table>` : ''}
          ${r.clinical_significance ? `<div style="font-size:8.5pt;color:#0F1B2D;line-height:1.55;"><strong style="color:#0E4F8C;">Clinical Significance:</strong> ${this.esc(r.clinical_significance)}</div>` : ''}
          ${r.methodology ? `<div style="font-size:8pt;color:#65758C;margin-top:2mm;"><strong>Method:</strong> ${this.esc(r.methodology)}</div>` : ''}
          ${r.notes ? `<div style="font-size:8pt;color:#65758C;margin-top:2mm;font-style:italic;"><strong>Note:</strong> ${this.esc(r.notes)}</div>` : ''}
        </td>
      </tr>` : ''}
    `;
  }

  private groupByPanel(rows: ResultRow[]): [string, ResultRow[]][] {
    const map = new Map<string, ResultRow[]>();
    for (const r of rows) {
      const key = (r.panel_group || r.category || 'General').toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }

  // ── footer (per page, repeated) ────────────────────────────────────
  private footer(b: ReportBundle, pageNum: number, totalPages: number): string {
    const tests = this.testsDoneLabel(b);
    const path  = b.reporting_pathologist ?? b.verifier;
    const sig = (s: any) => s ? `
      <div style="text-align:center;">
        <div style="font-family:'Brush Script MT',cursive;font-size:18pt;color:#0F1B2D;line-height:1;">${this.esc((s.full_name ?? '').slice(0, 1))}.</div>
        <div style="font-size:8.5pt;font-weight:700;margin-top:2mm;color:#0F1B2D;">${this.esc(s.full_name ?? '—')}</div>
        <div style="font-size:7.5pt;color:#65758C;">MD(Path)</div>
      </div>` : '';
    return `
    <footer style="margin-top:auto;padding-top:5mm;border-top:1px solid #DCE3EE;display:flex;justify-content:space-between;align-items:flex-end;font-size:8pt;color:#65758C;">
      <div>
        <p><strong>Tests Done:</strong> ${tests}</p>
        <p style="margin-top:1mm;font-style:italic;">Please correlate with clinical conditions.</p>
      </div>
      <div style="display:flex;gap:14mm;align-items:flex-end;">
        ${sig(b.reporting_pathologist)}
        ${path && b.verifier && b.verifier.id !== b.reporting_pathologist?.id ? sig(b.verifier) : ''}
      </div>
      <div style="text-align:right;">
        <p style="font-family:monospace;">Page ${pageNum} of ${totalPages}</p>
        <p style="font-size:7pt;margin-top:1mm;">Generated ${this.fmtDateTime(new Date().toISOString())}</p>
      </div>
    </footer>`;
  }

  // ── disclaimer page ────────────────────────────────────────────────
  private disclaimerPage(b: ReportBundle, pageNum: number, totalPages: number): string {
    const cond = b.settings?.conditions_of_reporting ?? this.defaultConditions();
    const disc = b.settings?.footer_disclaimer ?? this.defaultDisclaimer();
    return `
    <div class="page pageBreak">
      ${this.headerBlock(b)}
      <section>
        <div style="border:1px solid #DCE3EE;border-radius:6px;padding:5mm;margin-bottom:4mm;">
          <h3 style="font-size:11pt;font-weight:800;color:#0F1B2D;text-align:center;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3mm;">Conditions of Reporting</h3>
          <ul style="font-size:9pt;color:#0F1B2D;line-height:1.6;padding-left:18px;">
            ${cond.split('\n').filter((l: string) => l.trim()).map((l: string) => `<li style="margin-bottom:1mm;">${this.esc(l.replace(/^[-•]\s*/, ''))}</li>`).join('')}
          </ul>
        </div>
        <div style="border:1px solid #DCE3EE;border-radius:6px;padding:5mm;">
          <h3 style="font-size:11pt;font-weight:800;color:#0F1B2D;text-align:center;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3mm;">Disclaimer</h3>
          <div style="font-size:9pt;color:#0F1B2D;line-height:1.6;">
            ${disc.split('\n').filter((l: string) => l.trim()).map((l: string) => `<p style="margin-bottom:2mm;">${this.esc(l)}</p>`).join('')}
          </div>
        </div>
      </section>
      ${this.footer(b, pageNum, totalPages)}
    </div>`;
  }

  private defaultConditions(): string {
    return `The reported results are for information and interpretation of the referring doctor only.
It is presumed that the tests performed on the specimen belong to the patient as named or identified.
Results of tests may vary from laboratory to laboratory and from time to time for the same patient.
Should the results indicate an unexpected abnormality, the same should be reconfirmed.
Only such medical professionals who understand reporting units, reference ranges, and limitations of technologies should interpret results.
This report is not valid for medico-legal purposes.
Reference Range — values within which 95% of the normal population would fall.`;
  }
  private defaultDisclaimer(): string {
    return `Results should always be interpreted using the reference range and methodology specific to the laboratory that performed the test.
Different laboratories may use different technologies and reagents, leading to differences in reference ranges. To diagnose and monitor therapy doses, it is recommended to get tested at the same laboratory consistently.
Values out of reference range require reconfirmation before starting any medical treatment. Retesting should be done in accredited laboratories if quality is suspected.
Pregnant women should seek guidance from a qualified obstetrician as test parameters may vary during pregnancy.
For queries, write to ${this.esc((this.auth.claims().email as string) ?? 'lab@sreediagnostics.in')}.`;
  }

  // ── compose full document ──────────────────────────────────────────
  private buildReport(b: ReportBundle): string {
    const grouped = this.groupByPanel(b.results);
    const totalPages = 2 + grouped.length + 1; // page1 + outOfRange + per-panel + disclaimer

    const detailPages = grouped.map(([panel, items], idx) => `
      <div class="page ${idx === 0 ? 'pageBreak' : 'pageBreak'}">
        ${this.headerBlock(b)}
        ${this.patientBanner(b)}
        <section>
          <h2 style="font-size:12pt;font-weight:800;color:#0F1B2D;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #0E4F8C;padding-bottom:2mm;margin-bottom:3mm;">${this.esc(panel)}</h2>
          <table style="border:1px solid #DCE3EE;font-size:9.5pt;">
            <thead><tr style="background:#0F1B2D;color:#fff;">
              <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;">TEST NAME</th>
              <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:22%;">TECHNOLOGY</th>
              <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:14%;">VALUE</th>
              <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:11%;">UNITS</th>
              <th style="padding:7px 10px;text-align:left;font-size:8.5pt;letter-spacing:0.04em;width:21%;">Bio. Ref. Interval</th>
            </tr></thead>
            <tbody>${items.map(r => this.detailRow(r)).join('')}</tbody>
          </table>
        </section>
        ${this.footer(b, 3 + idx, totalPages)}
      </div>
    `).join('');

    return `<!DOCTYPE html><html><head><title>Lab Report · ${this.esc(b.patient.full_name ?? b.patient.uhid)}</title><style>${this.commonStyles()}</style></head><body>
${this.printButton()}

<!-- Page 1: header + patient + availability summary -->
<div class="page">
  ${this.headerBlock(b)}
  ${this.patientBanner(b)}
  ${this.availabilitySummary(b)}
  ${this.footer(b, 1, totalPages)}
</div>

<!-- Page 2: tests outside reference range -->
<div class="page pageBreak">
  ${this.headerBlock(b)}
  ${this.patientBanner(b)}
  ${this.outsideRange(b)}
  ${this.footer(b, 2, totalPages)}
</div>

<!-- Per-panel detail pages -->
${detailPages}

<!-- Disclaimer page -->
${this.disclaimerPage(b, totalPages, totalPages)}

</body></html>`;
  }
}
