import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Tables } from '../../../core/supabase/supabase.types';

type Branch     = Tables<'branches'>;
type Encounter  = Tables<'encounters'>;
type Patient    = Tables<'patients'>;
type RxItem     = Tables<'prescription_items'>;
type Staff      = Tables<'staff'>;
type Vitals     = Tables<'vitals'>;

interface LabOrderRow {
  id: string;
  status: string;
  priority: string;
  ordered_at: string;
  notes: string | null;
  results: { id: string; status: string; lab_test: { code: string; name: string; unit: string | null } | null }[];
}

interface PrintBundle {
  encounter:  Encounter;
  patient:    Patient;
  doctor:     Staff | null;
  branch:     Branch | null;
  rxItems:    RxItem[];
  labOrders:  LabOrderRow[];
  vitals:     Vitals | null;
}

@Injectable({ providedIn: 'root' })
export class ConsultationPrintService {
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  /** Fetch everything for the encounter and open a print window. */
  async print(encounterId: string): Promise<void> {
    const bundle = await this.fetchBundle(encounterId);
    const html = this.buildHtml(bundle);
    const win = window.open('', '_blank', 'width=860,height=900,scrollbars=yes');
    if (!win) { alert('Allow popups for this site to print consultation.'); return; }
    win.document.write(html);
    win.document.close();
  }

  private async fetchBundle(encounterId: string): Promise<PrintBundle> {
    const { data: enc, error: encErr } = await this.supabase.client
      .from('encounters').select('*').eq('id', encounterId).single();
    if (encErr) throw encErr;

    const branchId = this.auth.claims().branch_id ?? enc.branch_id;

    const [patientResp, doctorResp, branchResp, rxResp, labResp, vitalsResp] = await Promise.all([
      this.supabase.client.from('patients').select('*').eq('id', enc.patient_id).single(),
      enc.doctor_staff_id
        ? this.supabase.client.from('staff').select('*').eq('id', enc.doctor_staff_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      branchId
        ? this.supabase.client.from('branches').select('*').eq('id', branchId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      this.supabase.client
        .from('prescriptions')
        .select('id, prescription_items(*)')
        .eq('encounter_id', encounterId)
        .order('prescribed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supabase.client
        .from('lab_orders')
        .select('id, status, priority, ordered_at, notes, lab_results(id, status, lab_test:lab_test_id(code, name, unit))')
        .eq('encounter_id', encounterId)
        .order('ordered_at', { ascending: true }),
      this.supabase.client
        .from('vitals')
        .select('*')
        .eq('encounter_id', encounterId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (patientResp.error) throw patientResp.error;

    const rxItems = (rxResp.data as any)?.prescription_items as RxItem[] | undefined;
    const sortedRx = (rxItems ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    return {
      encounter:  enc as Encounter,
      patient:    patientResp.data as Patient,
      doctor:     (doctorResp.data ?? null) as Staff | null,
      branch:     (branchResp.data ?? null) as Branch | null,
      rxItems:    sortedRx,
      labOrders:  ((labResp.data ?? []) as any[]).map(r => ({
        id: r.id, status: r.status, priority: r.priority, ordered_at: r.ordered_at, notes: r.notes,
        results: (r.lab_results ?? []) as any[],
      })),
      vitals:     (vitalsResp.data ?? null) as Vitals | null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private esc(s: string | null | undefined): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
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

  private doctorTitle(doc: Staff | null): string {
    if (!doc) return 'Attending Doctor';
    const meta = (doc.metadata ?? {}) as Record<string, string>;
    const qual = meta['qualifications'] ?? meta['qualification'] ?? '';
    const spec = meta['specialty']     ?? meta['speciality']    ?? '';
    const reg  = meta['registration_no'] ?? meta['license_no']  ?? '';
    return [
      `Dr. ${this.esc(doc.full_name)}`,
      qual ? `<span style="font-size:9pt;color:#6b7280;font-weight:500;"> · ${this.esc(qual)}</span>` : '',
      spec ? `<div style="font-size:9pt;color:#374151;">${this.esc(spec)}</div>` : '',
      reg  ? `<div style="font-size:8.5pt;color:#6b7280;">Reg. No: ${this.esc(reg)}</div>` : '',
    ].join('');
  }

  // ── Main HTML builder ──────────────────────────────────────────────────
  private buildHtml(b: PrintBundle): string {
    const enc = b.encounter, p = b.patient, doc = b.doctor, br = b.branch;

    const hospitalName = this.esc(br?.prescription_header ?? br?.name ?? 'Hospital');
    const addrLines    = this.formatAddr(br?.address);
    const branchContact = [br?.phone, br?.email, br?.website].filter(Boolean).map(v => this.esc(v!)).join(' &nbsp;|&nbsp; ');

    const ageLabel    = this.age(p.date_of_birth ?? null);
    const genderLabel = p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : '';
    const patientLine = [ageLabel, genderLabel].filter(Boolean).join(' / ');

    const rxRows = b.rxItems.map((it, i) => {
      const even = i % 2 === 1;
      const bg = even ? '#fafafa' : '#ffffff';
      const drug = [
        `<div style="font-weight:700;color:#111827;font-size:11pt;">${i + 1}. ${this.esc(it.drug_name)}${it.strength ? ` <span style="font-weight:500;color:#374151;">${this.esc(it.strength)}</span>` : ''}</div>`,
        it.form ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">${this.esc(it.form)}${it.route ? ` · ${this.esc(it.route)}` : ''}</div>` : '',
      ].join('');
      const sig = [
        it.dosage      ? `<b>${this.esc(it.dosage)}</b>` : '',
        it.frequency   ? this.esc(it.frequency) : '',
        it.duration_days ? `× ${it.duration_days} day${it.duration_days > 1 ? 's' : ''}` : '',
      ].filter(Boolean).join(' &nbsp; ');
      const qty = it.qty ? `Qty: <b>${it.qty}</b>` : '';
      const inst = it.instructions ? `<div style="font-size:9pt;color:#374151;margin-top:3px;font-style:italic;">${this.esc(it.instructions)}</div>` : '';
      return `
        <tr style="background:${bg}">
          <td style="${TD_RX} width:42%;">${drug}</td>
          <td style="${TD_RX} width:38%;">${sig || '<span style="color:#9ca3af;">—</span>'}${inst}</td>
          <td style="${TD_RX} width:20%;text-align:right;font-family:monospace;">${qty || '<span style="color:#9ca3af;">—</span>'}</td>
        </tr>`;
    }).join('');

    const labTests: { code: string; name: string; unit: string | null; status: string }[] = [];
    for (const ord of b.labOrders) {
      for (const res of ord.results) {
        if (res.lab_test) labTests.push({ ...res.lab_test, status: res.status });
      }
    }
    const labRows = labTests.map((t, i) => `
      <tr style="background:${i % 2 === 1 ? '#fafafa' : '#ffffff'}">
        <td style="${TD_LAB} width:6%;text-align:center;color:#6b7280;">${i + 1}</td>
        <td style="${TD_LAB} width:18%;font-family:monospace;font-weight:600;">${this.esc(t.code)}</td>
        <td style="${TD_LAB} width:56%;">${this.esc(t.name)}</td>
        <td style="${TD_LAB} width:20%;text-align:right;color:#6b7280;font-size:9pt;text-transform:capitalize;">${this.esc(t.status.replace(/_/g, ' '))}</td>
      </tr>`).join('');

    const v = b.vitals;
    const vitalsBoxes = v ? [
      v.bp_systolic && v.bp_diastolic ? `BP <b>${v.bp_systolic}/${v.bp_diastolic}</b> mmHg` : '',
      v.pulse        ? `Pulse <b>${v.pulse}</b> bpm` : '',
      v.spo2_pct     ? `SpO₂ <b>${v.spo2_pct}</b>%` : '',
      v.temp_celsius ? `Temp <b>${v.temp_celsius}</b>°C` : '',
      v.weight_kg    ? `Wt <b>${v.weight_kg}</b> kg` : '',
      v.height_cm    ? `Ht <b>${v.height_cm}</b> cm` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ') : '';

    const printedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Consultation Note · ${this.esc(p.full_name ?? p.uhid)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; background: #f5f5f5; }
    .page {
      width: 210mm; min-height: 297mm; background: #fff;
      margin: 0 auto; padding: 14mm 16mm 12mm;
      display: flex; flex-direction: column;
    }
    table { border-collapse: collapse; width: 100%; }
    .section-title {
      font-size: 8pt; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #0E4F8C; margin-bottom: 2mm;
      padding-bottom: 1.5mm; border-bottom: 1px solid #d1d5db;
    }
    .field-block { margin-bottom: 4mm; }
    .field-block p { font-size: 10.5pt; color: #1f2937; line-height: 1.5; white-space: pre-wrap; }
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
      ${br?.logo_url ? `<img src="${this.esc(br.logo_url)}" alt="Logo" style="width:56px;height:56px;object-fit:contain;border-radius:6px;">` : `<div style="width:56px;height:56px;background:#0E4F8C;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:22pt;font-weight:900;font-family:Georgia,serif;">+</div>`}
      <div>
        <div style="font-size:18pt;font-weight:800;color:#0E4F8C;letter-spacing:-0.5px;line-height:1.1;">${hospitalName}</div>
        ${br?.tagline ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">${this.esc(br.tagline)}</div>` : ''}
        ${addrLines ? `<div style="font-size:9pt;color:#6b7280;margin-top:3px;line-height:1.5;">${addrLines}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7.5pt;color:#6b7280;line-height:1.8;margin-bottom:4px;">
        ${branchContact ? `<div>${branchContact}</div>` : ''}
        ${br?.registration_no ? `<div>Reg. No: ${this.esc(br.registration_no)}</div>` : ''}
        ${br?.gstin ? `<div style="font-weight:700;color:#374151;">GSTIN: ${this.esc(br.gstin)}</div>` : ''}
      </div>
      <div style="background:#0E4F8C;color:white;padding:4px 14px;border-radius:4px;font-size:11pt;font-weight:800;letter-spacing:1.5px;display:inline-block;">CONSULTATION</div>
    </div>
  </header>

  <!-- ── PATIENT + ENCOUNTER META ─────────────────────────────── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm;">

    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #f3f4f6;">Patient</div>
      <div style="font-size:13pt;font-weight:700;color:#111827;margin-bottom:2px;">${this.esc(p.full_name ?? `${p.first_name} ${p.last_name}`)}</div>
      <div style="font-size:9pt;color:#6b7280;font-family:monospace;">UHID: ${this.esc(p.uhid)}</div>
      ${patientLine ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">${this.esc(patientLine)}${p.blood_group ? ` · <span style="color:#b91c1c;font-weight:700;">${this.esc(p.blood_group)}</span>` : ''}</div>` : ''}
      ${p.mobile ? `<div style="font-size:9pt;color:#6b7280;margin-top:1px;">&#128222; ${this.esc(p.mobile)}</div>` : ''}
    </div>

    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:4mm;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:2.5mm;padding-bottom:2mm;border-bottom:1px solid #f3f4f6;">Consultation</div>
      <table style="font-size:9pt;">
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;white-space:nowrap;">Date</td><td style="font-weight:600;">${this.fmtDate(enc.started_at)}</td></tr>
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Time</td><td style="font-weight:500;">${this.fmtDateTime(enc.started_at).split(', ').slice(-1)[0]}</td></tr>
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Type</td><td style="font-weight:500;text-transform:uppercase;">${this.esc(enc.encounter_type)}</td></tr>
        <tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Doctor</td><td style="font-weight:600;color:#0E4F8C;">${doc ? `Dr. ${this.esc(doc.full_name)}` : '—'}</td></tr>
        ${doc && (doc.metadata as any)?.specialty ? `<tr><td style="color:#6b7280;padding:1.5px 10px 1.5px 0;">Specialty</td><td>${this.esc((doc.metadata as any).specialty)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  ${vitalsBoxes ? `
  <!-- ── VITALS ─────────────────────────────────────────────────── -->
  <div style="background:#ECF6FF;border:1px solid #A8D6FF;border-radius:6px;padding:3mm 4mm;margin-bottom:5mm;font-size:10pt;color:#0E4F8C;">
    <span style="font-weight:700;text-transform:uppercase;letter-spacing:0.06em;font-size:8pt;">Vitals: </span>
    ${vitalsBoxes}
  </div>` : ''}

  <!-- ── CLINICAL NOTES ─────────────────────────────────────────── -->
  ${enc.presenting_complaint ? `
    <div class="field-block">
      <div class="section-title">Chief Complaint</div>
      <p>${this.esc(enc.presenting_complaint)}</p>
    </div>` : ''}

  ${enc.history ? `
    <div class="field-block">
      <div class="section-title">History</div>
      <p>${this.esc(enc.history)}</p>
    </div>` : ''}

  ${enc.physical_examination ? `
    <div class="field-block">
      <div class="section-title">Physical Examination</div>
      <p>${this.esc(enc.physical_examination)}</p>
    </div>` : ''}

  ${enc.assessment ? `
    <div class="field-block">
      <div class="section-title">Assessment / Diagnosis</div>
      <p>${this.esc(enc.assessment)}</p>
    </div>` : ''}

  ${enc.plan ? `
    <div class="field-block">
      <div class="section-title">Plan</div>
      <p>${this.esc(enc.plan)}</p>
    </div>` : ''}

  <!-- ── PRESCRIPTIONS ─────────────────────────────────────────── -->
  ${b.rxItems.length > 0 ? `
  <div style="margin-top:2mm;margin-bottom:5mm;">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:1px solid #d1d5db;">
      <span style="font-family:Georgia,serif;font-size:18pt;color:#0E4F8C;font-weight:700;line-height:1;">℞</span>
      <span style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E4F8C;">Prescription · ${b.rxItems.length} medication${b.rxItems.length > 1 ? 's' : ''}</span>
    </div>
    <table style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#0E4F8C;color:white;">
          <th style="${TH} text-align:left;">Medicine</th>
          <th style="${TH} text-align:left;">Dosage &amp; Direction</th>
          <th style="${TH} text-align:right;">Quantity</th>
        </tr>
      </thead>
      <tbody>${rxRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ── LAB ORDERS ─────────────────────────────────────────────── -->
  ${labTests.length > 0 ? `
  <div style="margin-bottom:5mm;">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:1px solid #d1d5db;">
      <span style="font-size:14pt;line-height:1;">&#128300;</span>
      <span style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0E4F8C;">Lab investigations · ${labTests.length} test${labTests.length > 1 ? 's' : ''}</span>
    </div>
    <table style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#f3f4f6;color:#374151;">
          <th style="${TH_LAB} text-align:center;">#</th>
          <th style="${TH_LAB} text-align:left;">Code</th>
          <th style="${TH_LAB} text-align:left;">Test Name</th>
          <th style="${TH_LAB} text-align:right;">Status</th>
        </tr>
      </thead>
      <tbody>${labRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ── FOOTER ──────────────────────────────────────────────────── -->
  <div style="margin-top:auto;padding-top:6mm;border-top:1px solid #e5e7eb;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm;align-items:end;">
      <div style="font-size:8.5pt;color:#6b7280;line-height:1.7;">
        ${br?.prescription_footer ? `<div style="margin-bottom:4px;">${this.esc(br.prescription_footer)}</div>` : ''}
        <div style="font-style:italic;">This is a computer-generated consultation note.</div>
        ${br?.email ? `<div style="margin-top:2px;">For queries: <span style="color:#0E4F8C;">${this.esc(br.email)}</span></div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="display:inline-block;text-align:center;margin-top:8mm;">
          <div style="border-top:1.5px solid #374151;width:200px;padding-top:4px;">
            ${this.doctorTitle(doc)}
          </div>
        </div>
      </div>
    </div>
    <div style="text-align:center;margin-top:5mm;font-size:8pt;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:3mm;">
      Printed on ${printedAt} &nbsp;|&nbsp; Encounter ID: ${this.esc(enc.id.slice(0, 8))}
    </div>
  </div>

</div><!-- /page -->
</body>
</html>`;
  }
}

const TH     = `padding:7px 10px; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;`;
const TH_LAB = `padding:6px 10px; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid #e5e7eb;`;
const TD_RX  = `padding:8px 10px; border-bottom:1px solid #f3f4f6; font-size:10pt; vertical-align:top;`;
const TD_LAB = `padding:7px 10px; border-bottom:1px solid #f3f4f6; font-size:10pt;`;
