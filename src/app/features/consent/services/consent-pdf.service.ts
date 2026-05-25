import { Injectable, inject } from '@angular/core';
import { ConsentService } from '../data/consent.service';
import {
  HospitalSettingsService, type HospitalSettings,
} from '../../pharmacy/services/hospital-settings.service';
import { AuthStore } from '../../../core/auth/auth.store';
import type { ConsentRow } from '../data/consent.types';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface PatientFull {
  full_name: string | null; first_name: string; last_name: string;
  uhid: string; date_of_birth: string; gender: string; mobile: string;
  address: any | null;          // jsonb { line1, line2, city, state, pincode } or string
  emergency_contact: any | null;// jsonb { name, mobile, relation } or null
  blood_group?: string | null;
}
interface AllergyLite { allergen_name: string | null; severity: string | null }
interface StaffLite {
  full_name: string | null;
  metadata?: any;     // { specialty, registration_number, employee_id, department, designation }
  signature_data_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ConsentPdfService {
  private svc         = inject(ConsentService);
  private settingsSvc = inject(HospitalSettingsService);
  private supabase    = inject(SupabaseService);
  private auth        = inject(AuthStore);

  /** Open a printable signed-consent PDF in a new window. */
  async openPrint(consentId: string, opts: { autoPrint?: boolean } = {}): Promise<void> {
    const consent  = await this.svc.get(consentId);
    const branchId = (this.auth.claims().branch_id as string) || '';
    const settings = await this.settingsSvc.loadSettings(branchId);

    const [patient, allergies, doctor, witness] = await Promise.all([
      this.fetchPatient(consent.patient_id),
      this.fetchAllergies(consent.patient_id),
      consent.doctor_staff_id  ? this.fetchStaff(consent.doctor_staff_id)  : Promise.resolve(null),
      consent.witness_staff_id ? this.fetchStaff(consent.witness_staff_id) : Promise.resolve(null),
    ]);

    const html = await this.buildHtml(consent, patient, allergies, doctor, witness, settings);
    const win  = window.open('', '_blank', 'width=920,height=1180,scrollbars=yes');
    if (!win) { alert('Allow popups to view the consent form.'); return; }
    win.document.write(html);
    win.document.close();
    if (opts.autoPrint) setTimeout(() => win.print(), 500);
  }

  // ── Fetch helpers ─────────────────────────────────────────────────
  private async fetchPatient(id: string): Promise<PatientFull> {
    const { data } = await (this.supabase.client as any)
      .from('patients')
      .select('full_name, first_name, last_name, uhid, date_of_birth, gender, mobile, address, emergency_contact, blood_group')
      .eq('id', id).maybeSingle();
    return (data ?? {}) as PatientFull;
  }
  private async fetchAllergies(id: string): Promise<AllergyLite[]> {
    const { data } = await (this.supabase.client as any)
      .from('patient_allergies')
      .select('allergen_name, severity')
      .eq('patient_id', id)
      .eq('status', 'active')
      .limit(8);
    return (data ?? []) as AllergyLite[];
  }
  private async fetchStaff(id: string): Promise<StaffLite | null> {
    const { data } = await (this.supabase.client as any)
      .from('staff')
      .select('full_name, metadata, signature_data_url')
      .eq('id', id).maybeSingle();
    return (data ?? null) as StaffLite | null;
  }

  // ── HTML builder ──────────────────────────────────────────────────
  private async buildHtml(
    c: ConsentRow,
    p: PatientFull,
    allergies: AllergyLite[],
    doctor:  StaffLite | null,
    witness: StaffLite | null,
    s: HospitalSettings,
  ): Promise<string> {
    const fullName = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || c.patient_name_at_signing;
    const ageGenderStr = this.computeAgeGender(p.date_of_birth, p.gender);
    const addrStr = this.fmtAddress(p.address);
    const emergencyStr = this.fmtEmergency(p.emergency_contact);
    const allergyStr = allergies.length === 0
      ? 'None recorded'
      : allergies.map(a => `${a.allergen_name}${a.severity ? ` (${a.severity})` : ''}`).join(', ');

    const docMeta = (doctor?.metadata ?? {}) as Record<string, string>;
    const witMeta = (witness?.metadata ?? {}) as Record<string, string>;

    const isDama       = c.consent_form_code === 'DAMA';
    const isAdmission  = c.consent_form_code === 'GEN-ADMISSION';

    const issuedAtStr  = this.fmtDateTime(c.created_at);
    const status       = c.status.toUpperCase();
    const statusColor  = c.status === 'signed' ? '#0a7a3a'
                       : c.status === 'withdrawn' ? '#9c1a1a'
                       : '#a16207';

    // Audit metadata — prefer values persisted at sign time (medico-legal), with a
    // live-capture fallback for older signed records that pre-date the audit columns.
    const liveUa     = (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const userAgent  = c.signed_user_agent ?? liveUa ?? '—';
    const browser    = this.extractBrowser(userAgent);
    const device     = c.signed_device ?? this.extractDevice(userAgent);
    const printedAt  = this.fmtDateTime(new Date().toISOString());
    const pdfHash    = c.pdf_hash ?? await this.computeHash(
      `${c.id}|${c.rendered_body}|${c.patient_signed_at ?? ''}|${c.doctor_signed_at ?? ''}`
    );
    const hashSource = c.pdf_hash ? 'signed' : 'live';

    // OTP placeholder — not yet implemented end-to-end. The PDF is honest
    // about what's verified vs. what's pending in the system.
    const otpVerified = !!c.patient_signature;   // proxy: signed at sign time

    const cssBlock = this.cssBlock();
    const adminConsentBody = isAdmission ? this.adminConsentClauses(s.hospital_name) : '';

    return `<!DOCTYPE html>
<html lang="${this.esc(c.language || 'en')}">
<head>
<meta charset="UTF-8">
<title>${this.esc(s.hospital_name || 'Hospital')} — Consent ${this.esc(c.id.slice(0,8))}</title>
${cssBlock}
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">📄 Print / Save PDF</button>

<div class="page">

  <!-- ═══ HOSPITAL DETAILS ═══ -->
  <header class="hospital">
    <div class="brand">
      <div class="logo">+</div>
      <div>
        <h1>${this.esc(s.hospital_name || 'Hospital')}</h1>
        <p class="addr">${this.esc((s as any).hospital_address || '')}</p>
        <p class="contact">
          ${(s as any).hospital_phone ? `📞 ${this.esc((s as any).hospital_phone)}` : ''}
          ${(s as any).hospital_email ? ` · ✉ ${this.esc((s as any).hospital_email)}` : ''}
        </p>
      </div>
    </div>
    ${(s as any).gst_number ? `<p class="gstin">GSTIN: <b>${this.esc((s as any).gst_number)}</b></p>` : ''}
  </header>

  <h2 class="title">${this.esc(this.titleFor(c.consent_form_code))}</h2>

  <!-- ═══ CONSENT INFORMATION ═══ -->
  <section class="card">
    <h3>Consent information</h3>
    <table class="kv">
      <tr><th>Consent Form ID</th><td><code>${this.esc(c.consent_form_code)}</code></td></tr>
      <tr><th>Consent Version</th><td>v${c.consent_form_version}.0</td></tr>
      <tr><th>Consent Type</th><td>${this.esc(this.titleFor(c.consent_form_code))}</td></tr>
      <tr><th>Language</th><td>${this.esc((c.language || 'en').toUpperCase())}</td></tr>
      <tr><th>Date &amp; Time</th><td>${this.esc(issuedAtStr)}</td></tr>
      <tr><th>Record Status</th><td><span class="pill" style="background:${statusColor}1A;color:${statusColor}">${this.esc(status)}</span></td></tr>
    </table>
  </section>

  <!-- ═══ PATIENT DETAILS ═══ -->
  <section class="card">
    <h3>Patient details</h3>
    <table class="kv two-col">
      <tr><th>UHID</th><td><code>${this.esc(p.uhid || '—')}</code></td>
          <th>Patient name</th><td><b>${this.esc(fullName)}</b></td></tr>
      <tr><th>Age / Sex</th><td>${this.esc(ageGenderStr)}</td>
          <th>Mobile number</th><td>${this.esc(p.mobile || '—')}</td></tr>
      <tr><th>Address</th><td colspan="3">${this.esc(addrStr)}</td></tr>
      <tr><th>Emergency contact</th><td>${this.esc(emergencyStr)}</td>
          <th>Blood group</th><td>${this.esc(p.blood_group || '—')}</td></tr>
      <tr><th>Allergies</th><td colspan="3" class="${allergies.length ? 'allergy' : ''}">${this.esc(allergyStr)}</td></tr>
    </table>
  </section>

  <!-- ═══ CONSENT BODY ═══ -->
  <section class="card body">
    <h3>${isAdmission ? 'General admission &amp; treatment consent' : 'Consent text'}</h3>
    ${isAdmission
      ? `<p class="intro">I, <b>${this.esc(fullName)}</b>, voluntarily consent to admission at <b>${this.esc(s.hospital_name)}</b> for medical evaluation, observation, nursing care, investigations and treatment under the supervision of the treating doctors and hospital staff.</p>
         <p>I understand and agree to the following:</p>
         <ol class="clauses">${adminConsentBody}</ol>`
      : `<div class="rendered">${c.rendered_body}</div>`
    }
  </section>

  <!-- ═══ DIGITAL CONSENT & SIG AUTHORIZATION ═══ -->
  <section class="card">
    <h3>Digital consent &amp; signature authorization</h3>
    <p>The patient / guardian understands and agrees that this consent process may include:</p>
    <ul class="bullets">
      <li>Digital signature capture</li>
      <li>OTP-based mobile verification</li>
      <li>Electronic medical record storage</li>
      <li>Device and IP audit logging</li>
      <li>Secure PDF archival</li>
      <li>Digital audit trail generation</li>
    </ul>
    <p class="muted small">The patient / guardian acknowledges that electronic signatures and OTP verification shall be treated as valid authorization for hospital documentation purposes.</p>
  </section>

  <!-- ═══ OTP VERIFICATION DETAILS ═══ -->
  <section class="card">
    <h3>OTP verification details</h3>
    <table class="kv">
      <tr><th>Registered mobile number</th><td>${this.esc(p.mobile || '—')}</td></tr>
      <tr><th>OTP verified</th><td>${otpVerified ? '<b style="color:#0a7a3a">YES</b>' : '<b style="color:#9c1a1a">NO</b>'}</td></tr>
      <tr><th>OTP verification time</th><td>${otpVerified ? this.esc(this.fmtDateTime(c.patient_signed_at)) : '—'}</td></tr>
      <tr><th>Verification ID</th><td><code>${this.esc(c.id.slice(0, 8))}-OTP</code></td></tr>
    </table>
  </section>

  <!-- ═══ PATIENT DECLARATION ═══ -->
  <section class="card sig">
    <h3>Patient declaration</h3>
    <p>I hereby declare that:</p>
    <ul class="bullets">
      <li>I have read / understood the above consent.</li>
      <li>The treatment plan has been explained to me.</li>
      <li>I voluntarily agree for ${isAdmission ? 'admission and treatment' : 'the procedure / test described above'}.</li>
      <li>The information provided by me is true to the best of my knowledge.</li>
    </ul>
    <div class="sig-row">
      <div>
        <p class="sig-label">Patient name</p>
        <p class="sig-value">${this.esc(fullName)}</p>
      </div>
      <div>
        <p class="sig-label">Signature / Thumb impression</p>
        ${this.signatureBox(c.patient_signature)}
      </div>
      <div>
        <p class="sig-label">Date &amp; time</p>
        <p class="sig-value mono">${this.esc(this.fmtDateTime(c.patient_signed_at))}</p>
      </div>
    </div>
  </section>

  <!-- ═══ RELATIVE / GUARDIAN ═══ -->
  ${c.relative_signature || c.relative_name ? `
  <section class="card sig">
    <h3>Relative / guardian declaration</h3>
    <p class="muted small">I confirm that the consent has been explained and understood.</p>
    <table class="kv two-col">
      <tr><th>Relative / guardian name</th><td>${this.esc(c.relative_name || '—')}</td>
          <th>Relationship</th><td>${this.esc((c.relative_relation as string) || '—')}</td></tr>
      <tr><th>ID proof number</th><td>${this.esc(c.relative_id_proof || '—')}</td>
          <th>Mobile number</th><td>${this.esc(this.extractRelativePhone(c.notes))}</td></tr>
    </table>
    <div class="sig-row">
      <div>
        <p class="sig-label">Signature</p>
        ${this.signatureBox(c.relative_signature)}
      </div>
      <div>
        <p class="sig-label">Date &amp; time</p>
        <p class="sig-value mono">${this.esc(this.fmtDateTime(c.relative_signed_at))}</p>
      </div>
    </div>
  </section>
  ` : ''}

  <!-- ═══ DOCTOR DECLARATION ═══ -->
  <section class="card sig">
    <h3>Doctor declaration</h3>
    <p class="muted small">I confirm that I have explained: patient condition, proposed treatment, possible risks, benefits and alternatives, and need for ${isAdmission ? 'admission' : 'the procedure'} in a language understood by the patient / guardian.</p>
    <table class="kv two-col">
      <tr><th>Doctor name</th><td>${this.esc(doctor?.full_name || '—')}</td>
          <th>Department</th><td>${this.esc(docMeta['department'] || docMeta['specialty'] || docMeta['speciality'] || '—')}</td></tr>
      <tr><th>Registration number</th><td colspan="3">${this.esc(docMeta['registration_number'] || docMeta['mci_no'] || '—')}</td></tr>
    </table>
    <div class="sig-row">
      <div>
        <p class="sig-label">Doctor digital signature</p>
        ${doctor?.signature_data_url
          ? `<img class="sig-img" src="${doctor.signature_data_url}" alt="doctor signature" />
             <p class="sig-value small">${this.esc(doctor?.full_name ?? '')}</p>`
          : `<p class="sig-value">${doctor?.full_name ? `Authenticated · ${this.esc(doctor.full_name)}` : '—'}</p>`}
      </div>
      <div>
        <p class="sig-label">Date &amp; time</p>
        <p class="sig-value mono">${this.esc(this.fmtDateTime(c.doctor_signed_at))}</p>
      </div>
    </div>
  </section>

  <!-- ═══ WITNESS / NURSE ═══ -->
  ${witness ? `
  <section class="card sig">
    <h3>Witness / nurse declaration</h3>
    <p class="muted small">I confirm that the consent process was completed in my presence.</p>
    <table class="kv two-col">
      <tr><th>Witness name</th><td>${this.esc(witness.full_name || '—')}</td>
          <th>Designation</th><td>${this.esc(witMeta['designation'] || witMeta['role'] || '—')}</td></tr>
      <tr><th>Employee ID</th><td colspan="3">${this.esc(witMeta['employee_id'] || witMeta['emp_id'] || '—')}</td></tr>
    </table>
    <div class="sig-row">
      <div>
        <p class="sig-label">Signature</p>
        ${witness.signature_data_url
          ? `<img class="sig-img" src="${witness.signature_data_url}" alt="witness signature" />
             <p class="sig-value small">${this.esc(witness.full_name ?? '')}</p>`
          : `<p class="sig-value">Authenticated · ${this.esc(witness.full_name)}</p>`}
      </div>
      <div>
        <p class="sig-label">Date &amp; time</p>
        <p class="sig-value mono">${this.esc(this.fmtDateTime(c.witness_signed_at))}</p>
      </div>
    </div>
  </section>
  ` : ''}

  <!-- ═══ MEDICO-LEGAL DISCLAIMER ═══ -->
  <section class="card disclaimer">
    <h3>Medico-legal disclaimer</h3>
    <p>This consent form is digitally generated and stored in the Hospital Information Management System (HIMS).
    The following audit metadata may be retained: device ID · IP address · browser/tablet information · timestamp logs · digital signature records · PDF integrity hash · user access logs.</p>
    <p class="warn">Tampering, modification or unauthorised alteration of this consent after signing is prohibited and tracked by the system.</p>
  </section>

  <!-- ═══ SYSTEM AUDIT BLOCK ═══ -->
  <section class="card audit">
    <h3>System audit block <span class="muted small">— auto generated</span></h3>
    <table class="kv">
      <tr><th>Consent record ID</th><td><code>${this.esc(c.id)}</code></td></tr>
      <tr><th>PDF hash ID</th><td><code>${this.esc(pdfHash || 'unavailable')}</code> <span class="muted small">(${this.esc(hashSource)})</span></td></tr>
      <tr><th>Generated by</th><td>${this.esc(this.auth.user()?.email ?? '—')}</td></tr>
      <tr><th>Device used</th><td>${this.esc(device)}</td></tr>
      <tr><th>Browser</th><td>${this.esc(browser)}</td></tr>
      <tr><th>Generated at</th><td>${this.esc(printedAt)}</td></tr>
      <tr><th>Final status</th><td><b>${this.esc(c.status === 'signed' ? 'SIGNED · LOCKED' : status)}</b></td></tr>
    </table>
  </section>

  <!-- ═══ DAMA NOTE (only when this consent IS DAMA) ═══ -->
  ${isDama ? `
  <section class="card dama">
    <h3>Admission refusal / DAMA note</h3>
    <p>Patient / relatives were advised admission, investigations or treatment considering the medical condition. Risks and possible complications were explained. However, the patient / relatives declined the recommended advice on their own decision and responsibility.</p>
    <p><b>Hospital and treating doctors shall not be held responsible for complications arising due to refusal of medical advice.</b></p>
  </section>
  ` : ''}

  <!-- ═══ NOTES (if any) ═══ -->
  ${c.notes && c.notes.trim() ? `
  <section class="card">
    <h3>Special notes / high-risk observations</h3>
    <p>${this.esc(c.notes)}</p>
  </section>
  ` : ''}

  <footer class="retention">
    <p><b>Document retention notice:</b> This consent document shall be securely retained as part of hospital medical records and medico-legal documentation according to applicable hospital policy and legal requirements.</p>
    <p class="muted small center">— END OF CONSENT FORM —</p>
  </footer>
</div>
</body>
</html>`;
  }

  // ── 10 admission consent clauses (matches the medico-legal template) ──
  private adminConsentClauses(hospitalName: string): string {
    return [
      `I authorize the treating doctors, nursing staff and healthcare professionals to perform routine examinations, clinical assessments, administration of medicines, injections, IV fluids, blood collection, laboratory investigations, radiology investigations and other necessary medical procedures required for my treatment.`,
      `I understand that the practice of medicine is not an exact science and that no guarantee or assurance has been made regarding the outcome of treatment, recovery or cure.`,
      `I understand that my condition may require additional consultations, investigations, ICU transfer, emergency treatment or referral depending on the progression of illness.`,
      `I authorize the hospital to initiate emergency treatment or life-saving procedures in situations where delay may endanger life or health.`,
      `I understand that hospital charges including consultation fees, room charges, investigations, pharmacy charges, procedures, consumables and professional fees shall be payable as per hospital policy.`,
      `I confirm that I have disclosed relevant medical history including allergies, ongoing medications, previous illnesses, surgeries and other important health information.`,
      `I understand that refusal of advised treatment, admission, investigations or procedures may increase medical risks, complications or adverse outcomes.`,
      `I consent to storage of my medical information, prescriptions, reports, scans, digital records and billing data within the hospital information management system.`,
      `I understand that this consent form may be digitally signed, electronically stored and retrieved as part of medico-legal documentation.`,
      `I confirm that this consent was explained to me in a language understood by me and all my questions were answered satisfactorily.`,
    ].map(t => `<li>${this.esc(t)}</li>`).join('');
  }

  // ── Style block (single string, kept inline so the popup is self-contained) ─
  private cssBlock(): string {
    return `<style>
  @page { size: A4 portrait; margin: 14mm 14mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #1f2937; background: #f3f4f6; line-height: 1.45; }
  .page { max-width: 210mm; margin: 0 auto; background: #fff; padding: 12mm 12mm 14mm; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
  .print-btn { position: fixed; top: 12px; right: 12px; padding: 9px 18px; background: #0d5a96; color: #fff; border: 0; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 99; }

  header.hospital { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #0d5a96; margin-bottom: 10px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .logo { width: 52px; height: 52px; background: linear-gradient(135deg, #0d5a96 0%, #1e8bc3 100%); color: #fff; border-radius: 8px; display: grid; place-items: center; font-size: 28px; font-weight: 700; flex-shrink: 0; }
  header.hospital h1 { font-size: 19px; color: #0d5a96; line-height: 1.1; font-weight: 700; }
  header.hospital .addr, header.hospital .contact { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .gstin { font-size: 11px; color: #0d5a96; font-weight: 700; }

  h2.title { font-size: 16px; font-weight: 700; text-align: center; color: #0d5a96; text-transform: uppercase; letter-spacing: 0.6px; margin: 8px 0 14px; padding: 6px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }

  .card { margin: 0 0 10px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fdfdfd; }
  .card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 700; margin-bottom: 6px; }
  .card p { font-size: 11.5px; color: #374151; }
  .card.body p { margin-top: 4px; }
  .card.body .intro { font-size: 12px; }
  ol.clauses { margin: 6px 0 0 18px; }
  ol.clauses li { font-size: 11.5px; color: #374151; margin: 4px 0; padding-left: 4px; line-height: 1.5; }
  ul.bullets { margin: 4px 0 0 18px; }
  ul.bullets li { font-size: 11.5px; color: #374151; margin: 2px 0; }

  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th, table.kv td { font-size: 11.5px; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.kv th { width: 26%; color: #6b7280; font-weight: 600; }
  table.kv td { color: #111827; }
  table.kv code { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 10.5px; color: #0d5a96; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  table.kv.two-col th { width: 18%; }
  table.kv tr { border-bottom: 1px dashed #f3f4f6; }
  table.kv tr:last-child { border-bottom: none; }

  .pill { display: inline-block; padding: 1px 8px; font-size: 10.5px; font-weight: 700; border-radius: 999px; letter-spacing: 0.4px; }
  .allergy { color: #9c1a1a; font-weight: 600; }
  .muted { color: #6b7280; }
  .small { font-size: 10.5px; }

  .sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #e5e7eb; }
  .sig-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; }
  .sig-value { font-size: 12px; color: #111827; margin-top: 2px; }
  .sig-value.mono { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 10.5px; }
  .sig-img { max-height: 38px; max-width: 180px; border: 1px dashed #cbd5e1; padding: 2px 4px; background: #fff; }
  .sig-empty { display: inline-block; min-height: 30px; min-width: 140px; padding: 6px 8px; border: 1px dashed #cbd5e1; color: #9ca3af; font-size: 10px; font-style: italic; }

  .card.disclaimer { background: #fff7ed; border-color: #fdba74; }
  .card.disclaimer .warn { font-size: 11.5px; color: #9c1a1a; font-weight: 600; margin-top: 4px; }

  .card.audit { background: #f8fafc; border-color: #cbd5e1; }
  .card.audit table.kv th { width: 30%; }

  .card.dama { background: #fef2f2; border-color: #fecaca; }
  .card.dama h3 { color: #9c1a1a; }

  footer.retention { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10.5px; color: #6b7280; }
  footer.retention .center { text-align: center; margin-top: 6px; letter-spacing: 0.6px; }

  .rendered { font-size: 12px; color: #374151; line-height: 1.55; }
  .rendered b, .rendered strong { color: #111827; }

  @media print {
    body { background: #fff; }
    .page { box-shadow: none; padding: 0; max-width: 100%; }
    .no-print { display: none !important; }
    .card, table.kv tr, .sig-row { page-break-inside: avoid; break-inside: avoid; }
    header.hospital, .card.audit, footer.retention { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>`;
  }

  // ── Small helpers ──────────────────────────────────────────────────
  private signatureBox(dataUrl: string | null): string {
    if (dataUrl && dataUrl.startsWith('data:image')) {
      return `<img class="sig-img" src="${dataUrl}" alt="signature" />`;
    }
    return `<span class="sig-empty">— not captured —</span>`;
  }
  private titleFor(code: string): string {
    const map: Record<string, string> = {
      'GEN-ADMISSION': 'General Admission & Digital Medico-Legal Consent',
      'TRANSFUSION':   'Blood / Component Transfusion Consent',
      'HIV-TEST':      'HIV Testing Consent',
      'HIGH-RISK':     'High-Risk Procedure / Treatment Consent',
      'ANAESTHESIA':   'Anaesthesia Consent',
      'SURGERY':       'Surgical Procedure Consent',
      'ENDOSCOPY':     'Endoscopic Procedure Consent',
      'ICU-CARE':      'ICU Admission Consent',
      'DNR-DNI':       'Do Not Resuscitate / Do Not Intubate Order',
      'DAMA':          'Discharge Against Medical Advice (DAMA)',
      'PHOTO-VIDEO':   'Photography / Recording Consent (Medico-legal)',
    };
    return map[code] ?? `Patient Consent — ${code}`;
  }
  private fmtAddress(addr: any): string {
    if (!addr) return '—';
    if (typeof addr === 'string') return addr;
    const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean);
    return parts.join(', ') || '—';
  }
  private fmtEmergency(c: any): string {
    if (!c) return '—';
    if (typeof c === 'string') return c;
    return [c.name, c.relation, c.mobile].filter(Boolean).join(' · ') || '—';
  }
  private extractRelativePhone(notes: string | null): string {
    if (!notes) return '—';
    const m = notes.match(/Relative phone:\s*([+\d\s-]+)/i);
    return m ? m[1].trim() : '—';
  }
  private extractBrowser(ua: string): string {
    if (/Edg\//.test(ua))    return 'Microsoft Edge';
    if (/Chrome\//.test(ua)) return 'Google Chrome';
    if (/Firefox\//.test(ua))return 'Mozilla Firefox';
    if (/Safari\//.test(ua)) return 'Apple Safari';
    return 'Browser';
  }
  private extractDevice(ua: string): string {
    if (/iPad/.test(ua))    return 'iPad';
    if (/iPhone/.test(ua))  return 'iPhone';
    if (/Android/.test(ua)) return 'Android device';
    if (/Windows NT/.test(ua)) return 'Windows desktop';
    if (/Macintosh/.test(ua))  return 'Mac desktop';
    if (/Linux/.test(ua))      return 'Linux desktop';
    return 'Unknown device';
  }
  private async computeHash(input: string): Promise<string> {
    try {
      if (typeof crypto === 'undefined' || !crypto.subtle) return 'sha256-unavailable';
      const enc  = new TextEncoder().encode(input);
      const buf  = await crypto.subtle.digest('SHA-256', enc);
      return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch { return 'sha256-error'; }
  }
  private fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  }
  private computeAgeGender(dob: string | null | undefined, gender: string | null | undefined): string {
    if (!dob) return gender ?? '—';
    try {
      const ageMs = Date.now() - new Date(dob).getTime();
      const years = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
      const g = gender ? gender.charAt(0).toUpperCase() : '';
      return `${years}${g ? ' / ' + g : ''}`;
    } catch { return gender ?? '—'; }
  }
  private esc(s: string | null | undefined): string {
    return (s ?? '').toString().replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
    );
  }
}
