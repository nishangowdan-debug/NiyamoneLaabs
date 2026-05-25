import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { HospitalSettingsService, type HospitalSettings } from '../../pharmacy/services/hospital-settings.service';
import type { SalaryPayment } from '../data/payroll.service';
import { renderFooterHTML, FOOTER_CSS } from '../../../shared/print/footer-renderer';

/**
 * Indian-style monthly payslip PDF.
 *
 * Layout follows the standard Indian payslip convention:
 *   - Top: company header (name, address, phone, email, web — pulled from
 *     hospital_settings for the active branch so Sree Diagnostics looks
 *     consistent across every doc).
 *   - Employee block: code, name, designation, branch, days worked.
 *   - Two-column earnings / deductions table, both totaled.
 *   - Net pay in figures + in words.
 *   - Footer: system-generated note + signature placeholder.
 */
@Injectable({ providedIn: 'root' })
export class PayslipPdfService {
  private supabase = inject(SupabaseService);
  private hospitalSvc = inject(HospitalSettingsService);

  /** Fetch joined payment + staff + branch + settings, build HTML, print. */
  async generate(paymentId: string): Promise<void> {
    const detail = await this.fetchDetail(paymentId);
    if (!detail) {
      alert('Payslip not found.');
      return;
    }
    const settings = await this.hospitalSvc.loadSettings(detail.branch_id);
    const html = this.buildHtml(detail, settings);
    this.openPrint(html, `payslip_${detail.staff_code || 'staff'}_${detail.period}.html`);
  }

  // ── Data ───────────────────────────────────────────────────────────
  private async fetchDetail(paymentId: string): Promise<PayslipData | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('salary_payments')
      .select(`
        *,
        staff:staff_id(id, staff_code, full_name, email, phone, role_slug, primary_branch_id, metadata),
        run:payroll_run_id(period_year, period_month, branch_id, status, approved_at, paid_at)
      `)
      .eq('id', paymentId)
      .single();
    if (error || !data) return null;

    const r: any = data;
    const period = `${String(r.run.period_month).padStart(2, '0')}-${r.run.period_year}`;
    const monthLabel = new Date(r.run.period_year, r.run.period_month - 1, 1)
      .toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    return {
      period,
      monthLabel,
      branch_id: r.run.branch_id as string,
      run_status: r.run.status as string,
      paid_at: r.paid_at ?? r.run.paid_at,
      staff_id: r.staff.id,
      staff_code: r.staff.staff_code,
      staff_name: r.staff.full_name,
      staff_email: r.staff.email,
      staff_phone: r.staff.phone,
      role: r.staff.role_slug,
      designation: this.designationFromRole(r.staff.role_slug),
      payment: r as SalaryPayment & { pay_reference: string | null },
    };
  }

  // ── HTML builder ───────────────────────────────────────────────────
  private buildHtml(d: PayslipData, s: HospitalSettings): string {
    const p = d.payment;
    const inr = (cents: number) => '₹' + (cents / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    const totalEarnings = p.basic_cents + p.hra_cents + p.conveyance_cents + p.special_cents
                        + (p.other_earnings_cents ?? 0);
    const totalDeductions = p.lop_deduction_cents + p.pf_emp_cents + p.esi_emp_cents
                          + p.pt_cents + p.tds_cents + (p.other_deductions_cents ?? 0);
    const netWords = numberToIndianWords(Math.round((totalEarnings - totalDeductions) / 100));

    const branchAddr = [
      s.hospital_address_line1, s.hospital_address_line2,
      s.hospital_city, s.hospital_state, s.hospital_pincode,
    ].filter(Boolean).join(', ');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Payslip · ${esc(d.staff_name)} · ${esc(d.monthLabel)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1c2530; background: #fff; }
  .page { width: 186mm; margin: 0 auto; padding: 0; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #0E4F8C; color: white;
               border: 0; padding: 8px 18px; border-radius: 6px; font-weight: 700;
               font-size: 12px; cursor: pointer; z-index: 999; }
  @media print { .no-print { display: none !important; } body { background: #fff; } }

  /* Header */
  header.hdr { padding-bottom: 6mm; border-bottom: 2px solid #0E4F8C; display: flex;
               justify-content: space-between; align-items: flex-start; }
  .hdr-left .name { font-size: 18pt; font-weight: 800; color: #0E4F8C; letter-spacing: -0.4px; }
  .hdr-left .tag  { font-size: 9pt; color: #65758C; margin-top: 1mm; font-style: italic; }
  .hdr-left .addr { font-size: 9pt; color: #45556a; margin-top: 2mm; line-height: 1.4; max-width: 110mm; }
  .hdr-right { text-align: right; font-size: 9pt; color: #45556a; line-height: 1.55; }
  .hdr-right strong { color: #0E4F8C; }

  .title { background: #0E4F8C; color: white; text-align: center; padding: 2.5mm;
           font-size: 13pt; font-weight: 700; letter-spacing: 0.06em;
           margin: 4mm 0 4mm; text-transform: uppercase; }

  /* Employee details */
  .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0;
              border: 1px solid #d0d7e2; border-radius: 4px; overflow: hidden;
              font-size: 10pt; margin-bottom: 4mm; }
  .emp-grid > div { padding: 2mm 3mm; border-bottom: 1px solid #eef1f6; }
  .emp-grid > div:nth-child(odd) { border-right: 1px solid #eef1f6; background: #fafbfd; }
  .emp-grid .k { color: #65758C; font-weight: 600; display: inline-block; min-width: 38mm; }
  .emp-grid .v { color: #1c2530; font-weight: 600; }

  /* Earnings / deductions */
  .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; }
  .pay-col table { width: 100%; border-collapse: collapse; }
  .pay-col thead th { background: #f3f6fb; color: #0E4F8C; font-size: 10pt; font-weight: 700;
                      padding: 2.5mm 3mm; text-align: left; border-bottom: 2px solid #0E4F8C; }
  .pay-col thead th.num { text-align: right; }
  .pay-col td { padding: 2.5mm 3mm; font-size: 10pt; border-bottom: 1px solid #eef1f6; }
  .pay-col td.num { text-align: right; font-family: 'JetBrains Mono', Consolas, monospace; }
  .pay-col tfoot td { border-top: 2px solid #0E4F8C; font-weight: 700; background: #fafbfd; }

  /* Net pay */
  .net { background: #0E4F8C; color: white; padding: 4mm 5mm; border-radius: 4px;
         display: flex; justify-content: space-between; align-items: center;
         margin-bottom: 5mm; }
  .net .label { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .net .amount { font-size: 16pt; font-weight: 800; font-family: 'JetBrains Mono', Consolas, monospace; }
  .net-words { background: #ECF6FF; border-left: 4px solid #0E4F8C; padding: 2.5mm 4mm;
               font-size: 10pt; color: #1c2530; margin-bottom: 5mm; }
  .net-words strong { color: #0E4F8C; }

  /* Signature row (legacy 2-col; superseded by shared footer when branding is set) */
  footer.foot { margin-top: 8mm; padding-top: 6mm; border-top: 1px dashed #d0d7e2;
                display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; align-items: end; }
  .sig { text-align: center; font-size: 9pt; color: #65758C; }
  .sig .line { border-top: 1px solid #45556a; margin-top: 14mm; padding-top: 1.5mm; }
  .disclaimer { margin-top: 6mm; font-size: 8.5pt; color: #65758C; text-align: center;
                font-style: italic; padding: 2mm; background: #fafbfd; border-radius: 3px; }

  /* Shared footer renderer styles */
  ${FOOTER_CSS}
</style></head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>
<div class="page">

  <header class="hdr">
    <div class="hdr-left">
      <div class="name">${esc(s.hospital_name || 'Diagnostic Lab')}</div>
      ${s.hospital_tagline ? `<div class="tag">${esc(s.hospital_tagline)}</div>` : ''}
      ${branchAddr ? `<div class="addr">${esc(branchAddr)}</div>` : ''}
    </div>
    <div class="hdr-right">
      ${s.hospital_phone   ? `<div>📞 ${esc(s.hospital_phone)}</div>` : ''}
      ${s.hospital_email   ? `<div>✉ ${esc(s.hospital_email)}</div>`  : ''}
      ${s.hospital_website ? `<div>🌐 ${esc(s.hospital_website)}</div>` : ''}
      ${s.gst_number       ? `<div><strong>GSTIN</strong> ${esc(s.gst_number)}</div>` : ''}
    </div>
  </header>

  <div class="title">Salary Slip · ${esc(d.monthLabel)}</div>

  <div class="emp-grid">
    <div><span class="k">Employee Code</span><span class="v">${esc(d.staff_code)}</span></div>
    <div><span class="k">Pay Period</span><span class="v">${esc(d.monthLabel)}</span></div>
    <div><span class="k">Employee Name</span><span class="v">${esc(d.staff_name)}</span></div>
    <div><span class="k">Designation</span><span class="v">${esc(d.designation)}</span></div>
    <div><span class="k">Working Days</span><span class="v">${p.working_days}</span></div>
    <div><span class="k">Days Present</span><span class="v">${p.days_present}</span></div>
    <div><span class="k">Paid Leaves</span><span class="v">${p.days_leave_paid}</span></div>
    <div><span class="k">Loss of Pay (LOP)</span><span class="v">${p.days_lop}</span></div>
    ${d.staff_email ? `<div><span class="k">Email</span><span class="v">${esc(d.staff_email)}</span></div>` : '<div></div>'}
    <div><span class="k">Status</span><span class="v">${esc(d.run_status.toUpperCase())}${d.paid_at ? ` · paid ${new Date(d.paid_at).toLocaleDateString('en-IN')}` : ''}</span></div>
  </div>

  <div class="pay-grid">
    <div class="pay-col">
      <table>
        <thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td>Basic</td>           <td class="num">${inr(p.basic_cents)}</td></tr>
          <tr><td>HRA</td>             <td class="num">${inr(p.hra_cents)}</td></tr>
          <tr><td>Conveyance</td>      <td class="num">${inr(p.conveyance_cents)}</td></tr>
          <tr><td>Special allowance</td><td class="num">${inr(p.special_cents)}</td></tr>
          ${(p.other_earnings_cents ?? 0) > 0
            ? `<tr><td>Other earnings</td><td class="num">${inr(p.other_earnings_cents ?? 0)}</td></tr>` : ''}
        </tbody>
        <tfoot><tr><td>Gross earnings</td><td class="num">${inr(totalEarnings)}</td></tr></tfoot>
      </table>
    </div>
    <div class="pay-col">
      <table>
        <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${p.lop_deduction_cents > 0
            ? `<tr><td>Loss of Pay (${p.days_lop}d)</td><td class="num">${inr(p.lop_deduction_cents)}</td></tr>` : ''}
          <tr><td>Provident Fund (12%)</td><td class="num">${inr(p.pf_emp_cents)}</td></tr>
          ${p.esi_emp_cents > 0
            ? `<tr><td>ESI (0.75%)</td><td class="num">${inr(p.esi_emp_cents)}</td></tr>` : ''}
          <tr><td>Professional Tax</td>   <td class="num">${inr(p.pt_cents)}</td></tr>
          ${p.tds_cents > 0
            ? `<tr><td>TDS</td><td class="num">${inr(p.tds_cents)}</td></tr>` : ''}
          ${(p.other_deductions_cents ?? 0) > 0
            ? `<tr><td>Other deductions</td><td class="num">${inr(p.other_deductions_cents ?? 0)}</td></tr>` : ''}
        </tbody>
        <tfoot><tr><td>Total deductions</td><td class="num">${inr(totalDeductions)}</td></tr></tfoot>
      </table>
    </div>
  </div>

  <div class="net">
    <span class="label">Net Pay</span>
    <span class="amount">${inr(totalEarnings - totalDeductions)}</span>
  </div>
  <div class="net-words"><strong>Amount in words:</strong> Rupees ${netWords} only.</div>

  <footer class="foot">
    <div class="sig"><div class="line">Employee signature</div></div>
    <div class="sig"><div class="line">Authorised signatory</div></div>
  </footer>

  ${renderFooterHTML(s as any, { document: 'payslip' })}

</div></body></html>`;
  }

  /** Hidden-iframe print pattern — same as invoice + lab report. */
  private openPrint(html: string, filename: string): void {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', filename);
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) { iframe.remove(); return; }
    doc.open(); doc.write(html); doc.close();
    try { doc.title = filename; } catch {}
    const cleanup = () => setTimeout(() => { try { iframe.remove(); } catch {} }, 1000);
    const trigger = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      finally {
        iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 60_000);
      }
    };
    if (doc.readyState === 'complete') trigger();
    else iframe.addEventListener('load', trigger, { once: true });
  }

  private designationFromRole(role: string | null | undefined): string {
    const map: Record<string, string> = {
      super_admin:  'Director / Super Admin',
      branch_admin: 'Branch Manager',
      doctor:       'Consultant',
      lab_tech:     'Lab Technician',
      pharmacist:   'Pharmacist',
      nurse:        'Nurse',
      reception:    'Reception',
      accountant:   'Accountant',
      hr:           'Human Resources',
      housekeeping: 'Housekeeping',
      driver:       'Driver',
      security:     'Security',
    };
    return map[(role || '').toLowerCase()] || (role || 'Staff');
  }
}

interface PayslipData {
  period: string;
  monthLabel: string;
  branch_id: string;
  run_status: string;
  paid_at: string | null;
  staff_id: string;
  staff_code: string;
  staff_name: string;
  staff_email: string | null;
  staff_phone: string | null;
  role: string | null;
  designation: string;
  payment: SalaryPayment & { pay_reference?: string | null };
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert an integer to Indian-numbering English words (lakhs/crores). */
function numberToIndianWords(num: number): string {
  if (!Number.isFinite(num)) return 'Zero';
  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToIndianWords(-num);

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10), o = n % 10;
    return tens[t] + (o ? ' ' + ones[o] : '');
  };
  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100), rest = n % 100;
    return (h ? ones[h] + ' Hundred' + (rest ? ' ' : '') : '') + (rest ? twoDigits(rest) : '');
  };

  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh  = Math.floor(num / 100000);   num %= 100000;
  const thou  = Math.floor(num / 1000);     num %= 1000;
  const rest  = num;

  const parts: string[] = [];
  if (crore) parts.push(twoDigits(crore) + ' Crore');
  if (lakh)  parts.push(twoDigits(lakh)  + ' Lakh');
  if (thou)  parts.push(twoDigits(thou)  + ' Thousand');
  if (rest)  parts.push(threeDigits(rest));
  return parts.join(' ').trim();
}
