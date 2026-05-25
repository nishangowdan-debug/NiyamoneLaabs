import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { HospitalSettingsService } from '../../pharmacy/services/hospital-settings.service';
import type { DoctorPayout } from '../data/payroll.service';

/**
 * Generates an Indian-format payslip (HTML, print-to-PDF via the browser)
 * for a doctor's per-visit payout. Layout includes the Sree Diagnostics
 * header, employee details, earnings, deductions, net pay (figures + words)
 * and an authorised-signatory line, matching the standard Indian salary
 * slip convention used by most diagnostics chains.
 */
@Injectable({ providedIn: 'root' })
export class DoctorPayslipService {
  private supabase = inject(SupabaseService);
  private settingsSvc = inject(HospitalSettingsService);

  async openPayslip(payout: DoctorPayout & { doctor_name?: string | null }): Promise<void> {
    const [settings, staff] = await Promise.all([
      this.settingsSvc.loadSettings(payout.branch_id),
      this.fetchStaff(payout.doctor_staff_id),
    ]);

    const filename = this.buildFilename(payout, staff?.full_name ?? payout.doctor_name ?? 'Doctor');
    const html = this.buildHtml(payout, settings, staff, filename);

    const win = window.open('', filename, 'width=900,height=1100,scrollbars=yes');
    if (!win) { alert('Allow popups to view the payslip.'); return; }
    win.document.write(html);
    win.document.close();
    try { win.document.title = filename; } catch {}
  }

  private async fetchStaff(staffId: string): Promise<any | null> {
    try {
      const { data } = await (this.supabase.client as any)
        .from('staff')
        .select('id, full_name, staff_code, email, phone, role_slug, joined_at, metadata, signature_data_url, signature_role')
        .eq('id', staffId)
        .maybeSingle();
      return data ?? null;
    } catch {
      return null;
    }
  }

  private buildFilename(p: DoctorPayout, name: string): string {
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    const end = p.period_end || new Date().toISOString().slice(0, 10);
    return `Payslip_${safe(name)}_${end}`;
  }

  private buildHtml(p: DoctorPayout, settings: any, staff: any, title: string): string {
    const escape = (s: any) => (s ?? '').toString().replace(/[&<>"']/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
    );

    const fmtINR = (paise: number) =>
      `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fmtDateRange = (s: string, e: string) => {
      const fmt = (iso: string) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      };
      return `${fmt(s)} → ${fmt(e)}`;
    };

    const fmtMonth = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    const periodDays = Math.max(1, Math.round(
      (new Date(p.period_end).getTime() - new Date(p.period_start).getTime()) / 86400000,
    ) + 1);

    const grossPaise = p.total_amount_cents;
    const tdsPaise   = p.tds_cents;
    const netPaise   = p.net_cents;
    const netRupees  = Math.round(netPaise / 100);
    const netInWords = `Indian Rupees ${numberToWords(netRupees)} Only`;

    const addr = this.buildAddressLine(settings);
    const logo = settings.logo_url || settings.hospital_logo_url || '';
    const seals: Array<{ name: string; url: string }> = Array.isArray(settings.footer_seal_urls) ? settings.footer_seal_urls : [];

    const meta = (staff?.metadata ?? {}) as Record<string, any>;
    const designation = (meta['designation'] as string)
      || (staff?.role_slug === 'doctor' ? 'Visiting Consultant' : (staff?.role_slug ?? 'Doctor'));
    const department  = (meta['department']  as string) || 'Diagnostics';
    const pan         = (meta['pan'] as string) || '—';
    const uan         = (meta['uan'] as string) || '—';
    const bankName    = (meta['bank_name'] as string) || '—';
    const bankAcct    = (meta['bank_account_number'] as string) || '—';
    const bankIfsc    = (meta['bank_ifsc'] as string) || '—';
    const joinedAt    = staff?.joined_at ? new Date(staff.joined_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escape(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2530; background: #fff; font-size: 10pt; }
    .page { width: 210mm; min-height: 297mm; padding: 0; margin: 0 auto; background: #fff; }
    .no-print { position: fixed; top: 14px; right: 14px; background: #0d5a96; color: #fff; border: 0; padding: 9px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; z-index: 999; }
    @media print { .no-print { display: none !important; } body { background: #fff; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

    /* Header */
    .header { display: grid; grid-template-columns: 70px 1fr 1fr; gap: 12px; align-items: center; padding: 6mm 6mm; border-bottom: 2px solid #0d5a96; }
    .h-logo img { width: 60px; height: 60px; object-fit: contain; }
    .h-logo-fallback { width: 60px; height: 60px; background: #0d5a96; border-radius: 6px; display: grid; place-items: center; color: #fff; font-size: 28pt; font-weight: 900; font-family: Georgia, serif; }
    .h-name { font-size: 18pt; font-weight: 800; color: #0d5a96; letter-spacing: -0.3px; line-height: 1.05; }
    .h-tag  { font-size: 9pt; color: #45556a; font-style: italic; margin-top: 2px; }
    .h-addr { font-size: 8.5pt; color: #45556a; line-height: 1.4; margin-top: 3px; }
    .h-right { text-align: right; font-size: 8.5pt; color: #45556a; line-height: 1.5; }
    .h-right strong { color: #1c2530; }

    .title-strip { text-align: center; background: #f3f6fb; padding: 5mm 0; }
    .title-strip h2 { font-size: 14pt; color: #0d5a96; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; }
    .title-strip .sub { font-size: 10pt; color: #45556a; margin-top: 1mm; }

    /* Employee details grid */
    .emp { padding: 4mm 6mm; }
    .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #d0d7e2; border-radius: 4px; overflow: hidden; }
    .emp-grid > div { padding: 1.5mm 3mm; border-bottom: 1px solid #eef1f6; font-size: 9.5pt; display: flex; gap: 4mm; }
    .emp-grid > div:nth-child(odd)  { border-right: 1px solid #eef1f6; background: #fafbfd; }
    .emp-grid .k { color: #65758C; font-weight: 600; min-width: 38mm; }
    .emp-grid .v { color: #1c2530; font-weight: 600; flex: 1; }

    /* Earnings + Deductions tables side-by-side */
    .pay-block { padding: 0 6mm; }
    .pay-row { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .pay-card { border: 1px solid #d0d7e2; border-radius: 4px; overflow: hidden; }
    .pay-card h3 { background: #0d5a96; color: #fff; font-size: 10pt; padding: 2mm 3mm; text-transform: uppercase; letter-spacing: 0.08em; }
    .pay-card table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .pay-card td { padding: 1.8mm 3mm; border-bottom: 1px solid #eef1f6; }
    .pay-card td.num { text-align: right; font-family: 'JetBrains Mono', Consolas, monospace; }
    .pay-card tr:last-child td { border-bottom: 0; }
    .pay-card tfoot td { font-weight: 700; background: #f3f6fb; }

    /* Net pay highlight */
    .net-row { margin: 4mm 6mm; padding: 4mm; background: #0d5a96; color: #fff; border-radius: 5px; display: flex; align-items: center; justify-content: space-between; }
    .net-row .lbl { font-size: 11pt; font-weight: 700; letter-spacing: 0.06em; }
    .net-row .val { font-size: 18pt; font-weight: 800; font-family: 'JetBrains Mono', Consolas, monospace; }
    .net-words { padding: 0 6mm; font-size: 9.5pt; color: #1c2530; font-style: italic; }
    .net-words strong { color: #0d5a96; font-style: normal; }

    /* Footer */
    .foot { margin-top: 6mm; padding: 4mm 6mm; border-top: 1px solid #d0d7e2; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; align-items: end; }
    .foot .col { font-size: 8.5pt; color: #45556a; }
    .foot .sig-line { border-top: 1px solid #45556a; padding-top: 1.5mm; font-weight: 700; color: #1c2530; font-size: 9pt; margin-top: 12mm; text-align: center; }
    .seals { display: flex; gap: 3mm; justify-content: center; }
    .seals img { max-height: 16mm; max-width: 18mm; object-fit: contain; }
    .seal-fallback { display: inline-block; width: 14mm; height: 14mm; border-radius: 50%; border: 2px solid #b1985a; font-size: 6pt; color: #b1985a; font-weight: 800; text-align: center; line-height: 1.05; padding-top: 3.5mm; }
    .note { padding: 2mm 6mm; font-size: 7.5pt; color: #65758C; text-align: center; font-style: italic; border-top: 1px dashed #d0d7e2; margin-top: 3mm; }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">🖨 Print / Save PDF</button>

  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="h-logo">
        ${logo
          ? `<img src="${escape(logo)}" alt="logo" />`
          : `<div class="h-logo-fallback">+</div>`}
      </div>
      <div>
        <div class="h-name">${escape(settings.hospital_name || 'Sree Diagnostics')}</div>
        ${settings.hospital_tagline ? `<div class="h-tag">${escape(settings.hospital_tagline)}</div>` : ''}
        <div class="h-addr">${escape(addr)}</div>
      </div>
      <div class="h-right">
        ${settings.hospital_phone ? `<div>📞 ${escape(settings.hospital_phone)}</div>` : ''}
        ${settings.hospital_email ? `<div>✉ ${escape(settings.hospital_email)}</div>` : ''}
        ${settings.hospital_website ? `<div>🌐 ${escape(settings.hospital_website)}</div>` : ''}
        ${settings.gst_number ? `<div><strong>GSTIN:</strong> ${escape(settings.gst_number)}</div>` : ''}
      </div>
    </div>

    <!-- Title -->
    <div class="title-strip">
      <h2>Pay Slip</h2>
      <div class="sub">For the period <strong>${escape(fmtDateRange(p.period_start, p.period_end))}</strong>
        &nbsp;·&nbsp; <strong>${escape(fmtMonth(p.period_start))}</strong></div>
    </div>

    <!-- Employee details -->
    <div class="emp">
      <div class="emp-grid">
        <div><span class="k">Employee Name</span><span class="v">${escape(staff?.full_name ?? (p as any).doctor_name ?? '—')}</span></div>
        <div><span class="k">Employee Code</span><span class="v">${escape(staff?.staff_code ?? '—')}</span></div>
        <div><span class="k">Designation</span><span class="v">${escape(designation)}</span></div>
        <div><span class="k">Department</span><span class="v">${escape(department)}</span></div>
        <div><span class="k">Date of Joining</span><span class="v">${escape(joinedAt)}</span></div>
        <div><span class="k">Pay Period</span><span class="v">${escape(fmtMonth(p.period_start))}</span></div>
        <div><span class="k">PAN</span><span class="v">${escape(pan)}</span></div>
        <div><span class="k">UAN</span><span class="v">${escape(uan)}</span></div>
        <div><span class="k">Bank</span><span class="v">${escape(bankName)}</span></div>
        <div><span class="k">A/C No.</span><span class="v">${escape(bankAcct)}</span></div>
        <div><span class="k">IFSC</span><span class="v">${escape(bankIfsc)}</span></div>
        <div><span class="k">Working Days</span><span class="v">${periodDays} · Visits ${p.visits_count}</span></div>
      </div>
    </div>

    <!-- Earnings + Deductions -->
    <div class="pay-block">
      <div class="pay-row">
        <div class="pay-card">
          <h3>Earnings</h3>
          <table>
            <tr><td>Professional Fees · ${p.visits_count} visit${p.visits_count === 1 ? '' : 's'}</td>
                <td class="num">${fmtINR(grossPaise)}</td></tr>
            <tr><td>Reimbursements</td><td class="num">${fmtINR(0)}</td></tr>
            <tfoot><tr><td><strong>Gross Earnings (A)</strong></td>
                       <td class="num"><strong>${fmtINR(grossPaise)}</strong></td></tr></tfoot>
          </table>
        </div>
        <div class="pay-card">
          <h3>Deductions</h3>
          <table>
            <tr><td>TDS (194J · Professional services)</td><td class="num">${fmtINR(tdsPaise)}</td></tr>
            <tr><td>Other deductions</td><td class="num">${fmtINR(0)}</td></tr>
            <tfoot><tr><td><strong>Total Deductions (B)</strong></td>
                       <td class="num"><strong>${fmtINR(tdsPaise)}</strong></td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Net pay -->
    <div class="net-row">
      <span class="lbl">Net Pay (A − B)</span>
      <span class="val">${fmtINR(netPaise)}</span>
    </div>
    <div class="net-words">
      <strong>Amount in words:</strong> ${escape(netInWords)}
    </div>

    <!-- Footer -->
    <div class="foot">
      <div class="col">
        <strong>Payment status:</strong> ${escape(String(p.status).toUpperCase())}<br>
        Generated on: ${escape(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}
      </div>
      <div class="col">
        <div class="seals">
          ${seals.length
            ? seals.slice(0, 3).map((s) => `<img src="${escape(s.url)}" alt="${escape(s.name)}" />`).join('')
            : `<div class="seal-fallback">ISO<br>9001<br>:2015</div>
               <div class="seal-fallback">QUALITY<br>APPROVED</div>`}
        </div>
      </div>
      <div class="col">
        <div class="sig-line">Authorised Signatory</div>
        <div style="text-align:center; font-size: 8pt; color: #65758C; margin-top:1mm;">
          ${escape(settings.hospital_name || 'Sree Diagnostics')}
        </div>
      </div>
    </div>

    <div class="note">
      This is a system-generated pay slip and does not require a manual signature.
      Statutory deductions are made as per applicable Indian tax laws (Income Tax Act, 1961 — Section 194J).
    </div>
  </div>
</body>
</html>`;
  }

  private buildAddressLine(s: any): string {
    if (s?.hospital_address && s.hospital_address.trim()) return s.hospital_address;
    return [s?.hospital_address_line1, s?.hospital_address_line2, s?.hospital_city, s?.hospital_state, s?.hospital_pincode]
      .filter((p) => p && String(p).trim().length).join(', ');
  }
}

/** Indian-format number-to-words. Supports up to crores. */
function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return 'Minus ' + numberToWords(-n);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
                'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below100(num: number): string {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10), u = num % 10;
    return tens[t] + (u ? ' ' + ones[u] : '');
  }
  function below1000(num: number): string {
    const h = Math.floor(num / 100), rest = num % 100;
    let out = '';
    if (h) out = ones[h] + ' Hundred';
    if (rest) out += (out ? ' ' : '') + below100(rest);
    return out;
  }
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n = n % 10000000;
  const lakh  = Math.floor(n / 100000);   n = n % 100000;
  const thou  = Math.floor(n / 1000);     n = n % 1000;
  const rest  = n;
  if (crore) parts.push(below1000(crore) + ' Crore');
  if (lakh)  parts.push(below1000(lakh)  + ' Lakh');
  if (thou)  parts.push(below1000(thou)  + ' Thousand');
  if (rest)  parts.push(below1000(rest));
  return parts.join(' ');
}
