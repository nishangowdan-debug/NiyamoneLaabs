import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Tables } from '../../../core/supabase/supabase.types';

type Branch  = Tables<'branches'>;
type Patient = Tables<'patients'>;
type Staff   = Tables<'staff'>;

interface BillItem {
  drug_name: string; strength: string | null;
  qty: number; unit_price_cents: number; total_cents: number;
}

interface OpBundle {
  invoice: { id: string; invoice_number: string; invoice_date: string; total_cents: number; notes: string | null };
  patient: Patient;
  doctor:  Staff | null;
  branch:  Branch | null;
  items:   BillItem[];
}

interface IpSlipBundle {
  admission: { id: string; admitted_at: string; reason: string | null };
  patient:   Patient;
  doctor:    Staff | null;
  branch:    Branch | null;
  items:     BillItem[];   // just the items being dispensed RIGHT NOW
  ward:      { name: string; code: string } | null;
  bed:       { code: string } | null;
}

interface InvoiceLine {
  description: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
  related_entity_type?: string | null;
}

interface DischargeBundle {
  admission: { id: string; admitted_at: string; discharged_at: string | null; reason: string | null; notes: string | null };
  patient:   Patient;
  doctor:    Staff | null;
  branch:    Branch | null;
  invoice:   { id: string; invoice_number: string; invoice_date: string; total_cents: number; subtotal_cents: number; discount_cents: number };
  bedItems:        InvoiceLine[];
  pharmacyItems:   InvoiceLine[];
  visitItems:      InvoiceLine[];
  labItems:        InvoiceLine[];
  radiologyItems:  InvoiceLine[];
  otherItems:      InvoiceLine[];
  bedTotal:    number;
  pharmTotal:  number;
  visitTotal:  number;
  labTotal:    number;
  radTotal:    number;
  otherTotal:  number;
  subTotal:    number;
  insuranceCents: number;
  discountCents:  number;
  insuranceProvider: string | null;
  insuranceClaimNumber: string | null;
  discountReason: string | null;
  grandTotal:    number;
  days:          number;
  // Clinical narrative (signed by doctor)
  narrative: {
    presenting_complaint: string | null;
    history_of_present_illness: string | null;
    examination_findings: string | null;
    course_in_hospital: string | null;
    procedures_performed: string | null;
    condition_at_discharge: string | null;
    discharge_diagnosis_icd10: string | null;
    discharge_medications: string | null;
    follow_up_instructions: string | null;
    diet_advice: string | null;
    activity_advice: string | null;
    next_review_at: string | null;
  } | null;
  // Lab / imaging report list (filed under reports)
  labOrders: { id: string; ordered_at: string; status: string; reported_at: string | null; is_radiology: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class PharmacyPrintService {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  // ── Public API ──────────────────────────────────────────────────────
  async printOpReceipt(invoiceId: string): Promise<void> {
    const bundle = await this.fetchOp(invoiceId);
    this.openHtml(this.buildOpReceipt(bundle), 'OP Pharmacy Receipt');
  }

  async printIpSlip(admissionId: string, items: BillItem[]): Promise<void> {
    const bundle = await this.fetchIp(admissionId, items);
    this.openHtml(this.buildIpSlip(bundle), 'IP Dispense Slip');
  }

  async printDischargeSummary(admissionId: string, invoiceId: string): Promise<void> {
    const bundle = await this.fetchDischarge(admissionId, invoiceId);
    this.openHtml(this.buildDischargeSummary(bundle), 'Discharge Summary');
  }

  // ── Fetchers ────────────────────────────────────────────────────────
  private async fetchOp(invoiceId: string): Promise<OpBundle> {
    const branchId = this.auth.claims().branch_id;
    const [{ data: inv, error: ie }, { data: items, error: ite }] = await Promise.all([
      this.supabase.client.from('invoices')
        .select('id, invoice_number, invoice_date, total_cents, notes, patient_id, doctor_staff_id, branch_id')
        .eq('id', invoiceId).single(),
      this.supabase.client.from('invoice_items')
        .select('description, qty, unit_price_cents, total_cents, position')
        .eq('invoice_id', invoiceId).order('position'),
    ]);
    if (ie) throw ie; if (ite) throw ite;

    const [{ data: pt }, { data: doc }, { data: br }] = await Promise.all([
      this.supabase.client.from('patients').select('*').eq('id', (inv as any).patient_id).single(),
      (inv as any).doctor_staff_id
        ? this.supabase.client.from('staff').select('*').eq('id', (inv as any).doctor_staff_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      (branchId ?? (inv as any).branch_id)
        ? this.supabase.client.from('branches').select('*').eq('id', branchId ?? (inv as any).branch_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const billItems: BillItem[] = ((items ?? []) as any[]).map(it => {
      const m = String(it.description).split(/\s+·\s+/);
      return {
        drug_name: m[0] ?? it.description,
        strength: m[1] ?? null,
        qty: it.qty, unit_price_cents: it.unit_price_cents, total_cents: it.total_cents,
      };
    });

    return {
      invoice: { id: (inv as any).id, invoice_number: (inv as any).invoice_number, invoice_date: (inv as any).invoice_date, total_cents: (inv as any).total_cents, notes: (inv as any).notes },
      patient: pt as Patient, doctor: (doc ?? null) as Staff | null, branch: (br ?? null) as Branch | null,
      items:   billItems,
    };
  }

  private async fetchIp(admissionId: string, items: BillItem[]): Promise<IpSlipBundle> {
    const branchId = this.auth.claims().branch_id;
    const { data: adm, error } = await this.supabase.client
      .from('admissions')
      .select('id, admitted_at, reason, patient_id, attending_doctor_staff_id, branch_id')
      .eq('id', admissionId).single();
    if (error) throw error;

    const [{ data: pt }, { data: doc }, { data: br }, { data: bedRow }] = await Promise.all([
      this.supabase.client.from('patients').select('*').eq('id', (adm as any).patient_id).single(),
      (adm as any).attending_doctor_staff_id
        ? this.supabase.client.from('staff').select('*').eq('id', (adm as any).attending_doctor_staff_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      (branchId ?? (adm as any).branch_id)
        ? this.supabase.client.from('branches').select('*').eq('id', branchId ?? (adm as any).branch_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      this.supabase.client.from('beds').select('code, ward:ward_id(name, code)')
        .eq('current_admission_id', admissionId).maybeSingle(),
    ]);

    return {
      admission: { id: (adm as any).id, admitted_at: (adm as any).admitted_at, reason: (adm as any).reason },
      patient: pt as Patient,
      doctor: (doc ?? null) as Staff | null,
      branch: (br ?? null) as Branch | null,
      items,
      ward: (bedRow as any)?.ward ?? null,
      bed:  (bedRow as any) ? { code: (bedRow as any).code } : null,
    };
  }

  private async fetchDischarge(admissionId: string, invoiceId: string): Promise<DischargeBundle> {
    const branchId = this.auth.claims().branch_id;

    // Pull everything via the RPC (same source as the billing UI).
    const { data: bundle, error } = await (this.supabase.client as any)
      .rpc('discharge_summary_get', { p_admission_id: admissionId });
    if (error) throw error;

    const adm = bundle.admission;
    const pt = bundle.patient as Patient;
    const doc = (bundle.doctor ?? null) as Staff | null;

    // The branch in the bundle includes only basics — re-fetch to get tagline/header/etc.
    let br: Branch | null = null;
    const targetBranchId = branchId ?? bundle.branch?.id;
    if (targetBranchId) {
      const { data: brData } = await this.supabase.client.from('branches').select('*').eq('id', targetBranchId).maybeSingle();
      br = (brData ?? null) as Branch | null;
    }

    // Use the requested invoice if it exists; otherwise fall back to the one in the bundle.
    let inv = bundle.invoice;
    let allItems: any[] = bundle.invoice_items ?? [];
    if (invoiceId && (!inv || inv.id !== invoiceId)) {
      const [{ data: invData }, { data: itemsData }] = await Promise.all([
        this.supabase.client.from('invoices')
          .select('id, invoice_number, invoice_date, total_cents, subtotal_cents, discount_cents')
          .eq('id', invoiceId).maybeSingle(),
        this.supabase.client.from('invoice_items')
          .select('description, qty, unit_price_cents, total_cents, position, related_entity_type')
          .eq('invoice_id', invoiceId).order('position'),
      ]);
      inv = invData ?? inv;
      allItems = (itemsData ?? []) as any[];
    }

    // Categorize via related_entity_type with a description-prefix fallback for legacy invoices.
    const pickCat = (it: any): string => {
      const t = (it.related_entity_type ?? '').toLowerCase();
      if (t === 'bed' || t === 'pharmacy' || t === 'doctor_visit' || t === 'lab_order' || t === 'radiology_order') return t;
      const d = String(it.description ?? '');
      if (/^Bed charges/i.test(d)) return 'bed';
      if (/^Pharmacy/i.test(d))    return 'pharmacy';
      if (/^Doctor visit/i.test(d)) return 'doctor_visit';
      if (/^Lab/i.test(d))         return 'lab_order';
      if (/^Radiology/i.test(d))   return 'radiology_order';
      return 'other';
    };

    const bedItems       = allItems.filter(i => pickCat(i) === 'bed');
    const pharmacyItems  = allItems.filter(i => pickCat(i) === 'pharmacy');
    const visitItems     = allItems.filter(i => pickCat(i) === 'doctor_visit');
    const labItems       = allItems.filter(i => pickCat(i) === 'lab_order');
    const radiologyItems = allItems.filter(i => pickCat(i) === 'radiology_order');
    const otherItems     = allItems.filter(i => pickCat(i) === 'other');

    const sum = (xs: any[]) => xs.reduce((s, i) => s + (i.total_cents ?? 0), 0);
    const bedTotal   = sum(bedItems);
    const pharmTotal = sum(pharmacyItems);
    const visitTotal = sum(visitItems);
    const labTotal   = sum(labItems);
    const radTotal   = sum(radiologyItems);
    const otherTotal = sum(otherItems);
    const subTotal   = bedTotal + pharmTotal + visitTotal + labTotal + radTotal + otherTotal;

    const summary = bundle.summary ?? null;
    const insuranceCents = summary?.insurance_claim_cents ?? 0;
    const discountCents  = summary?.discount_cents ?? 0;
    const grandTotal = inv?.total_cents ?? Math.max(0, subTotal - insuranceCents - discountCents);

    const admittedAt = new Date(adm.admitted_at);
    const dischargedAt = adm.discharged_at ? new Date(adm.discharged_at) : new Date();
    const days = Math.max(1, Math.ceil((dischargedAt.getTime() - admittedAt.getTime()) / 86400000));

    return {
      admission: {
        id: adm.id, admitted_at: adm.admitted_at,
        discharged_at: adm.discharged_at, reason: adm.reason, notes: adm.notes,
      },
      patient: pt, doctor: doc, branch: br,
      invoice: inv ?? { id: '', invoice_number: '—', invoice_date: '', total_cents: subTotal, subtotal_cents: subTotal, discount_cents: 0 },
      bedItems, pharmacyItems, visitItems, labItems, radiologyItems, otherItems,
      bedTotal, pharmTotal, visitTotal, labTotal, radTotal, otherTotal,
      subTotal, insuranceCents, discountCents,
      insuranceProvider: summary?.insurance_provider ?? null,
      insuranceClaimNumber: summary?.insurance_claim_number ?? null,
      discountReason: summary?.discount_reason ?? null,
      grandTotal, days,
      narrative: summary
        ? {
            presenting_complaint: summary.presenting_complaint,
            history_of_present_illness: summary.history_of_present_illness,
            examination_findings: summary.examination_findings,
            course_in_hospital: summary.course_in_hospital,
            procedures_performed: summary.procedures_performed,
            condition_at_discharge: summary.condition_at_discharge,
            discharge_diagnosis_icd10: summary.discharge_diagnosis_icd10,
            discharge_medications: summary.discharge_medications,
            follow_up_instructions: summary.follow_up_instructions,
            diet_advice: summary.diet_advice,
            activity_advice: summary.activity_advice,
            next_review_at: summary.next_review_at,
          }
        : null,
      labOrders: (bundle.lab_orders ?? []) as any[],
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  private esc(s: string | null | undefined): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  private inr(c: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format((c ?? 0) / 100);
  }
  private fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  private fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  private hospitalName(b: Branch | null): string {
    return this.esc(b?.prescription_header ?? b?.name ?? 'Hospital');
  }
  private formatAddr(addr: unknown): string {
    if (!addr || typeof addr !== 'object') return '';
    const a = addr as Record<string, string>;
    return [a['line1'], a['line2'], a['city'], a['state'] ? `${a['state']} ${a['pin'] ?? ''}`.trim() : '']
      .map(x => this.esc(x)).filter(Boolean).join('<br>');
  }
  private patientLine(p: Patient): string {
    const dob = p.date_of_birth;
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : null;
    const g = p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : '';
    return [age ? `${age} yrs` : '', g].filter(Boolean).join(' / ');
  }
  private openHtml(html: string, title: string) {
    const win = window.open('', '_blank', 'width=820,height=900,scrollbars=yes');
    if (!win) { alert('Allow popups to print ' + title + '.'); return; }
    win.document.write(html);
    win.document.close();
  }

  private commonHeader(b: Branch | null, badge: string, color = '#0E4F8C'): string {
    const addr = this.formatAddr(b?.address);
    const contact = [b?.phone, b?.email].filter(Boolean).map(v => this.esc(v!)).join(' &nbsp;|&nbsp; ');
    return `
    <header style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:5mm; border-bottom: 2.5px solid ${color}; margin-bottom:5mm;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:54px;height:54px;background:${color};border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:22pt;font-weight:900;font-family:Georgia,serif;">+</div>
        <div>
          <div style="font-size:18pt;font-weight:800;color:${color};letter-spacing:-0.5px;line-height:1.1;">${this.hospitalName(b)}</div>
          ${b?.tagline ? `<div style="font-size:9pt;color:#65758C;margin-top:1px;">${this.esc(b.tagline)}</div>` : ''}
          ${addr ? `<div style="font-size:9pt;color:#65758C;margin-top:3px;line-height:1.5;">${addr}</div>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:7.5pt;color:#65758C;line-height:1.7;margin-bottom:4px;">
          ${contact ? `<div>${contact}</div>` : ''}
          ${b?.gstin ? `<div style="font-weight:700;color:#0F1B2D;">GSTIN: ${this.esc(b.gstin)}</div>` : ''}
        </div>
        <div style="background:${color};color:white;padding:4px 14px;border-radius:4px;font-size:11pt;font-weight:800;letter-spacing:1.2px;display:inline-block;">${badge}</div>
      </div>
    </header>`;
  }

  private patientCard(p: Patient): string {
    const line = this.patientLine(p);
    return `
    <div style="border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#65758C;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #EDF1F7;">Patient</div>
      <div style="font-size:13pt;font-weight:700;color:#0F1B2D;">${this.esc(p.full_name ?? `${p.first_name} ${p.last_name}`)}</div>
      <div style="font-size:9pt;color:#65758C;font-family:monospace;">UHID: ${this.esc(p.uhid)}</div>
      ${line ? `<div style="font-size:9pt;color:#65758C;margin-top:1px;">${this.esc(line)}${p.blood_group ? ` · <span style="color:#A4302B;font-weight:700;">${this.esc(p.blood_group)}</span>` : ''}</div>` : ''}
      ${p.mobile ? `<div style="font-size:9pt;color:#65758C;margin-top:1px;">📞 ${this.esc(p.mobile)}</div>` : ''}
    </div>`;
  }

  private printButton(): string {
    return `<button class="no-print" onclick="window.print()" style="position:fixed;top:14px;right:14px;background:#0E4F8C;color:white;border:none;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.3);">🖨 Print / Save PDF</button>`;
  }

  private commonStyles(): string {
    return `
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #0F1B2D; background: #f5f5f5; }
      .page { width: 210mm; min-height: 297mm; background: #fff; margin: 0 auto; padding: 12mm 14mm; display: flex; flex-direction: column; }
      table { border-collapse: collapse; width: 100%; }
      @media print { body { background: white; } .no-print { display: none !important; } .page { margin: 0; box-shadow: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      @media screen { .page { box-shadow: 0 2px 20px rgba(0,0,0,.12); margin: 20px auto; } }`;
  }

  // ── OP receipt ──────────────────────────────────────────────────────
  private buildOpReceipt(b: OpBundle): string {
    const rows = b.items.map((it, i) => `
      <tr style="background:${i % 2 ? '#F8FAFD' : '#fff'}">
        <td style="padding:6px 8px;text-align:center;color:#65758C;font-size:9pt;">${i + 1}</td>
        <td style="padding:6px 8px;font-size:10pt;">${this.esc(it.drug_name)}${it.strength ? ` <span style="color:#65758C;">${this.esc(it.strength)}</span>` : ''}</td>
        <td style="padding:6px 8px;text-align:center;font-family:monospace;">${it.qty}</td>
        <td style="padding:6px 8px;text-align:right;font-family:monospace;">${this.inr(it.unit_price_cents)}</td>
        <td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:600;">${this.inr(it.total_cents)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><title>OP Receipt · ${this.esc(b.invoice.invoice_number)}</title><style>${this.commonStyles()}</style></head><body>
${this.printButton()}
<div class="page">
  ${this.commonHeader(b.branch, 'PHARMACY · OP', '#0E4F8C')}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">
    ${this.patientCard(b.patient)}
    <div style="border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#65758C;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #EDF1F7;">Receipt</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Bill No.</td><td style="font-weight:700;font-family:monospace;color:#0E4F8C;">${this.esc(b.invoice.invoice_number)}</td></tr>
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Date</td><td>${this.fmtDate(b.invoice.invoice_date)}</td></tr>
        ${b.doctor ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Doctor</td><td style="font-weight:700;color:#0E4F8C;">Dr. ${this.esc(b.doctor.full_name.replace(/^Dr\.?\s*/i, ''))}</td></tr>` : (b.invoice.notes && b.invoice.notes.includes('Dr.') ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Doctor</td><td style="font-weight:700;color:#0E4F8C;">${this.esc(b.invoice.notes.split(' · ')[0] ?? '')}</td></tr>` : '')}
      </table>
    </div>
  </div>

  <table style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;margin-bottom:4mm;">
    <thead><tr style="background:#0E4F8C;color:white;">
      <th style="padding:7px 8px;text-align:center;width:6%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">#</th>
      <th style="padding:7px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Drug</th>
      <th style="padding:7px 8px;text-align:center;width:10%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Rate</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Total</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="padding:10px;text-align:center;color:#65758C;">No items</td></tr>'}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-bottom:5mm;">
    <div style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;min-width:240px;">
      <table style="font-size:11pt;">
        <tr style="background:#0E4F8C;color:white;">
          <td style="padding:8px 12px;font-weight:700;">Total</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;">${this.inr(b.invoice.total_cents)}</td>
        </tr>
      </table>
    </div>
  </div>

  <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #EDF1F7;font-size:8.5pt;color:#65758C;line-height:1.7;">
    <p>Pharmacy supplied as per prescription. Keep this receipt for your records.</p>
    <p style="text-align:center;margin-top:4mm;color:#99A6B8;font-size:8pt;">Computer-generated. Printed on ${this.fmtDateTime(new Date().toISOString())}</p>
  </div>
</div>
</body></html>`;
  }

  // ── IP dispense slip ────────────────────────────────────────────────
  private buildIpSlip(b: IpSlipBundle): string {
    const rows = b.items.map((it, i) => `
      <tr style="background:${i % 2 ? '#F8FAFD' : '#fff'}">
        <td style="padding:6px 8px;text-align:center;color:#65758C;font-size:9pt;">${i + 1}</td>
        <td style="padding:6px 8px;font-size:10pt;">${this.esc(it.drug_name)}${it.strength ? ` <span style="color:#65758C;">${this.esc(it.strength)}</span>` : ''}</td>
        <td style="padding:6px 8px;text-align:center;font-family:monospace;">${it.qty}</td>
        <td style="padding:6px 8px;text-align:right;font-family:monospace;">${this.inr(it.unit_price_cents)}</td>
        <td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:600;">${this.inr(it.total_cents)}</td>
      </tr>`).join('');
    const total = b.items.reduce((s, it) => s + it.total_cents, 0);
    return `<!DOCTYPE html><html><head><title>IP Dispense Slip</title><style>${this.commonStyles()}</style></head><body>
${this.printButton()}
<div class="page">
  ${this.commonHeader(b.branch, 'IP DISPENSE SLIP', '#00C3FF')}
  <div style="background:#FFFBEB;border:1px solid #FBE9C7;color:#8B5A0F;font-size:9pt;padding:2mm 4mm;border-radius:6px;margin-bottom:5mm;">
    ⚠ This is a dispense slip — <b>not a final bill</b>. Charges are added to the patient's IP account and billed at discharge.
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">
    ${this.patientCard(b.patient)}
    <div style="border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#65758C;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #EDF1F7;">Admission</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Admitted</td><td>${this.fmtDateTime(b.admission.admitted_at)}</td></tr>
        ${b.ward ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Ward</td><td>${this.esc(b.ward.name)}</td></tr>` : ''}
        ${b.bed ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Bed</td><td style="font-family:monospace;font-weight:700;">${this.esc(b.bed.code)}</td></tr>` : ''}
        ${b.doctor ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Doctor</td><td style="font-weight:700;color:#0E4F8C;">Dr. ${this.esc(b.doctor.full_name.replace(/^Dr\.?\s*/i, ''))}</td></tr>` : ''}
        ${b.admission.reason ? `<tr><td style="color:#65758C;padding:3px 10px 0 0;vertical-align:top;">Reason</td><td>${this.esc(b.admission.reason)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <table style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;margin-bottom:4mm;">
    <thead><tr style="background:#00C3FF;color:white;">
      <th style="padding:7px 8px;text-align:center;width:6%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">#</th>
      <th style="padding:7px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Drug dispensed now</th>
      <th style="padding:7px 8px;text-align:center;width:10%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Rate</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Subtotal</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#EDF1F7;font-weight:700;">
      <td colspan="4" style="padding:7px 8px;text-align:right;">This dispense subtotal</td>
      <td style="padding:7px 8px;text-align:right;font-family:monospace;">${this.inr(total)}</td>
    </tr></tfoot>
  </table>

  <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #EDF1F7;display:grid;grid-template-columns:1fr 1fr;gap:6mm;font-size:9pt;color:#65758C;">
    <div>
      <p>Two copies printed:</p>
      <ul style="margin:1mm 0 0 4mm;line-height:1.7;">
        <li><b>Copy 1</b> — Patient / nurse station</li>
        <li><b>Copy 2</b> — Filed for the discharge summary</li>
      </ul>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;text-align:center;margin-top:6mm;">
        <div style="border-top:1.5px solid #2A374A;width:170px;padding-top:4px;font-size:8.5pt;color:#65758C;">Pharmacist signature</div>
      </div>
    </div>
  </div>

  <!-- Carbon copy 2 (file copy) — same content, marked as the file copy -->
  <div style="page-break-before:always;"></div>
</div>

<div class="page">
  ${this.commonHeader(b.branch, 'IP DISPENSE · FILE COPY', '#0E4F8C')}
  <div style="background:#D6ECFF;border:1px solid #A8D6FF;color:#0A3A6B;font-size:9pt;padding:2mm 4mm;border-radius:6px;margin-bottom:5mm;">
    📎 <b>FILE COPY</b> — file this slip with the patient's IP folder. Charges will appear on the discharge summary.
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">
    ${this.patientCard(b.patient)}
    <div style="border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#65758C;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #EDF1F7;">Admission</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Admitted</td><td>${this.fmtDateTime(b.admission.admitted_at)}</td></tr>
        ${b.ward ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Ward</td><td>${this.esc(b.ward.name)}</td></tr>` : ''}
        ${b.bed ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Bed</td><td style="font-family:monospace;font-weight:700;">${this.esc(b.bed.code)}</td></tr>` : ''}
      </table>
    </div>
  </div>
  <table style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;margin-bottom:4mm;">
    <thead><tr style="background:#0E4F8C;color:white;">
      <th style="padding:7px 8px;text-align:center;width:6%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">#</th>
      <th style="padding:7px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Drug</th>
      <th style="padding:7px 8px;text-align:center;width:10%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Rate</th>
      <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Subtotal</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#EDF1F7;font-weight:700;">
      <td colspan="4" style="padding:7px 8px;text-align:right;">Subtotal added to IP account</td>
      <td style="padding:7px 8px;text-align:right;font-family:monospace;">${this.inr(total)}</td>
    </tr></tfoot>
  </table>
  <p style="margin-top:auto;padding-top:5mm;border-top:1px solid #EDF1F7;font-size:8pt;color:#99A6B8;text-align:center;">Computer-generated · Printed on ${this.fmtDateTime(new Date().toISOString())}</p>
</div>
</body></html>`;
  }

  // ── Discharge summary ───────────────────────────────────────────────
  private chargesTable(title: string, items: InvoiceLine[], unitLabel: string, qtyLabel: string, totalLabel: string, subtotal: number, stripPrefix?: RegExp): string {
    if (!items.length) return '';
    const rows = items.map(it => {
      const desc = stripPrefix ? this.esc(String(it.description).replace(stripPrefix, '')) : this.esc(it.description);
      return `
      <tr><td style="padding:6px 8px;font-size:9.5pt;">${desc}</td>
          <td style="padding:6px 8px;text-align:center;font-family:monospace;">${it.qty}</td>
          <td style="padding:6px 8px;text-align:right;font-family:monospace;">${this.inr(it.unit_price_cents)}</td>
          <td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:600;">${this.inr(it.total_cents)}</td></tr>`;
    }).join('');
    return `
    <div style="margin-bottom:4mm;">
      <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E4F8C;margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:1px solid #DCE3EE;">${this.esc(title)}</p>
      <table style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;font-size:10pt;">
        <thead><tr style="background:#EDF1F7;color:#0F1B2D;">
          <th style="padding:7px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Description</th>
          <th style="padding:7px 8px;text-align:center;width:10%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">${this.esc(qtyLabel)}</th>
          <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">${this.esc(unitLabel)}</th>
          <th style="padding:7px 8px;text-align:right;width:18%;font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#F8FAFD;font-weight:700;">
          <td colspan="3" style="padding:7px 8px;text-align:right;">${this.esc(totalLabel)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:monospace;">${this.inr(subtotal)}</td>
        </tr></tfoot>
      </table>
    </div>`;
  }

  private narrativeBlock(n: DischargeBundle['narrative']): string {
    if (!n) return '';
    const row = (label: string, body: string | null | undefined) =>
      body ? `<div style="margin-bottom:2.5mm;"><div style="font-size:8pt;font-weight:700;color:#65758C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:1mm;">${label}</div><div style="font-size:9.5pt;color:#0F1B2D;line-height:1.45;">${this.esc(body)}</div></div>` : '';
    const anything = [n.presenting_complaint, n.history_of_present_illness, n.examination_findings, n.course_in_hospital,
      n.procedures_performed, n.condition_at_discharge, n.discharge_diagnosis_icd10, n.discharge_medications,
      n.follow_up_instructions, n.diet_advice, n.activity_advice].some(Boolean);
    if (!anything) return '';
    return `
    <div style="margin-bottom:5mm;border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E4F8C;margin-bottom:3mm;">Clinical discharge summary</p>
      ${row('Presenting complaint', n.presenting_complaint)}
      ${row('History of present illness', n.history_of_present_illness)}
      ${row('Examination findings', n.examination_findings)}
      ${row('Course in hospital', n.course_in_hospital)}
      ${row('Procedures performed', n.procedures_performed)}
      ${row('Discharge diagnosis (ICD-10)', n.discharge_diagnosis_icd10)}
      ${row('Condition at discharge', n.condition_at_discharge)}
      ${row('Discharge medications', n.discharge_medications)}
      ${row('Follow-up instructions', n.follow_up_instructions)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;">
        ${row('Diet advice', n.diet_advice)}
        ${row('Activity advice', n.activity_advice)}
      </div>
    </div>`;
  }

  private reportsBlock(b: DischargeBundle): string {
    if (!b.labOrders.length) return '';
    const labs   = b.labOrders.filter(o => !o.is_radiology);
    const images = b.labOrders.filter(o =>  o.is_radiology);
    const li = (o: typeof b.labOrders[number]) =>
      `<li style="font-size:9pt;color:#0F1B2D;">${this.fmtDate(o.ordered_at)} · <span style="font-family:monospace;color:#65758C;">${this.esc(o.id.slice(0,8))}</span> · status: ${this.esc(o.status)}${o.reported_at ? ` · reported ${this.fmtDate(o.reported_at)}` : ''}</li>`;
    if (!labs.length && !images.length) return '';
    return `
    <div style="margin-bottom:5mm;border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <p style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E4F8C;margin-bottom:3mm;">Investigations &amp; reports</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;">
        <div>
          <p style="font-size:8pt;font-weight:700;color:#65758C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2mm;">Laboratory (${labs.length})</p>
          ${labs.length ? `<ul style="padding-left:14px;line-height:1.6;">${labs.map(li).join('')}</ul>` : '<p style="font-size:9pt;color:#65758C;font-style:italic;">None.</p>'}
        </div>
        <div>
          <p style="font-size:8pt;font-weight:700;color:#65758C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2mm;">Imaging / Radiology (${images.length})</p>
          ${images.length ? `<ul style="padding-left:14px;line-height:1.6;">${images.map(li).join('')}</ul>` : '<p style="font-size:9pt;color:#65758C;font-style:italic;">None.</p>'}
        </div>
      </div>
      <p style="font-size:8pt;color:#65758C;margin-top:3mm;">Detailed reports are appended / available on the patient portal.</p>
    </div>`;
  }

  private buildDischargeSummary(b: DischargeBundle): string {
    const sections =
      this.chargesTable('Bed & ward charges',  b.bedItems,      'Rate',     'Days', 'Bed subtotal',      b.bedTotal) +
      this.chargesTable('Pharmacy (IP)',       b.pharmacyItems, 'Rate',     'Qty',  'Pharmacy subtotal', b.pharmTotal,  /^Pharmacy · /) +
      this.chargesTable('Doctor visits',       b.visitItems,    'Rate',     'Qty',  'Visits subtotal',   b.visitTotal,  /^Doctor visit · /) +
      this.chargesTable('Laboratory',          b.labItems,      'Price',    'Tests','Lab subtotal',      b.labTotal,    /^Lab · /) +
      this.chargesTable('Radiology / Imaging', b.radiologyItems,'Price',    'Studies','Radiology subtotal', b.radTotal,  /^Radiology · /) +
      this.chargesTable('Other charges',       b.otherItems,    'Rate',     'Qty',  'Other subtotal',    b.otherTotal);

    const totalsRows = [
      ['Bed total',         b.bedTotal,   b.bedItems.length],
      ['Pharmacy total',    b.pharmTotal, b.pharmacyItems.length],
      ['Doctor visits',     b.visitTotal, b.visitItems.length],
      ['Lab total',         b.labTotal,   b.labItems.length],
      ['Radiology total',   b.radTotal,   b.radiologyItems.length],
      ['Other',             b.otherTotal, b.otherItems.length],
    ].filter(([, , c]) => (c as number) > 0)
     .map(([label, val]) => `<tr><td style="padding:6px 12px;color:#65758C;border-bottom:1px solid #EDF1F7;">${label}</td><td style="padding:6px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #EDF1F7;">${this.inr(val as number)}</td></tr>`)
     .join('');

    const adjRows = (b.discountCents > 0 || b.insuranceCents > 0)
      ? `
        <tr><td style="padding:6px 12px;color:#65758C;border-bottom:1px solid #EDF1F7;">Subtotal</td>
            <td style="padding:6px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #EDF1F7;">${this.inr(b.subTotal)}</td></tr>
        ${b.insuranceCents > 0 ? `<tr><td style="padding:6px 12px;color:#16A34A;border-bottom:1px solid #EDF1F7;">Insurance${b.insuranceProvider ? ` (${this.esc(b.insuranceProvider)})` : ''}</td><td style="padding:6px 12px;text-align:right;font-family:monospace;color:#16A34A;border-bottom:1px solid #EDF1F7;">−${this.inr(b.insuranceCents)}</td></tr>` : ''}
        ${b.discountCents > 0 ? `<tr><td style="padding:6px 12px;color:#16A34A;border-bottom:1px solid #EDF1F7;">Discount${b.discountReason ? ` (${this.esc(b.discountReason)})` : ''}</td><td style="padding:6px 12px;text-align:right;font-family:monospace;color:#16A34A;border-bottom:1px solid #EDF1F7;">−${this.inr(b.discountCents)}</td></tr>` : ''}
      `
      : '';

    return `<!DOCTYPE html><html><head><title>Discharge Summary · ${this.esc(b.invoice.invoice_number)}</title><style>${this.commonStyles()}</style></head><body>
${this.printButton()}
<div class="page">
  ${this.commonHeader(b.branch, 'DISCHARGE SUMMARY', '#0C2A52')}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">
    ${this.patientCard(b.patient)}
    <div style="border:1px solid #DCE3EE;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#65758C;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #EDF1F7;">Admission</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Bill No.</td><td style="font-weight:700;font-family:monospace;color:#0E4F8C;">${this.esc(b.invoice.invoice_number)}</td></tr>
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Admitted</td><td>${this.fmtDateTime(b.admission.admitted_at)}</td></tr>
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Discharged</td><td>${b.admission.discharged_at ? this.fmtDateTime(b.admission.discharged_at) : '—'}</td></tr>
        <tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Stay</td><td><b>${b.days}</b> day${b.days === 1 ? '' : 's'}</td></tr>
        ${b.doctor ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Doctor</td><td style="font-weight:700;color:#0E4F8C;">Dr. ${this.esc(b.doctor.full_name.replace(/^Dr\.?\s*/i, ''))}</td></tr>` : ''}
        ${b.admission.reason ? `<tr><td style="color:#65758C;padding:3px 10px 0 0;vertical-align:top;">Reason</td><td>${this.esc(b.admission.reason)}</td></tr>` : ''}
        ${b.insuranceClaimNumber ? `<tr><td style="color:#65758C;padding:1.5px 10px 1.5px 0;">Claim no.</td><td style="font-family:monospace;">${this.esc(b.insuranceClaimNumber)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  ${this.narrativeBlock(b.narrative)}
  ${this.reportsBlock(b)}
  ${sections}

  <div style="display:flex;justify-content:flex-end;margin-bottom:5mm;">
    <div style="border:1px solid #DCE3EE;border-radius:6px;overflow:hidden;min-width:340px;">
      <table style="font-size:11pt;width:100%;">
        ${totalsRows}
        ${adjRows}
        <tr style="background:#0C2A52;color:white;">
          <td style="padding:9px 12px;font-weight:700;font-size:12pt;">Grand total</td>
          <td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:700;font-size:12pt;">${this.inr(b.grandTotal)}</td>
        </tr>
      </table>
    </div>
  </div>

  <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #EDF1F7;display:grid;grid-template-columns:1fr 1fr;gap:6mm;font-size:8.5pt;color:#65758C;">
    <div>
      <p style="font-weight:700;color:#0F1B2D;margin-bottom:2px;">Notes</p>
      ${b.admission.notes ? `<p>${this.esc(b.admission.notes)}</p>` : '<p style="font-style:italic;">No clinical notes recorded.</p>'}
      <p style="margin-top:4mm;">Please collect medications, follow-up appointment slip and any pending reports at the discharge counter.</p>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;text-align:center;margin-top:8mm;">
        <div style="border-top:1.5px solid #2A374A;width:200px;padding-top:4px;font-size:8.5pt;color:#65758C;">Authorised signatory</div>
        ${b.doctor ? `<div style="font-size:9pt;font-weight:700;color:#0F1B2D;margin-top:2px;">Dr. ${this.esc(b.doctor.full_name.replace(/^Dr\.?\s*/i, ''))}</div>` : ''}
      </div>
    </div>
  </div>
  <p style="text-align:center;margin-top:4mm;font-size:8pt;color:#99A6B8;">Computer-generated · Printed on ${this.fmtDateTime(new Date().toISOString())}</p>
</div>
</body></html>`;
  }
}
