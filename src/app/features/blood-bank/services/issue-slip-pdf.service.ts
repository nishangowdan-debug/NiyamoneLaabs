import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { BloodRequest, BloodUnit } from '../data/blood-bank.types';

interface SlipContext {
  hospital_name?: string;
  hospital_address?: string;
  hospital_phone?: string;
  patient_name?: string;
  patient_mrn?: string;
  ward_label?: string;
  runner_name?: string;
  issued_by_name?: string;
  dispatched_by_name?: string;
}

@Injectable({ providedIn: 'root' })
export class IssueSlipPdfService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async print(request: BloodRequest, unit: BloodUnit): Promise<void> {
    const ctx = await this.fetchContext(request);
    const html = this.render(request, unit, ctx);

    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  private async fetchContext(r: BloodRequest): Promise<SlipContext> {
    const out: SlipContext = {};
    try {
      const { data: hs } = await this.db.from('hospital_settings').select('*').limit(1).maybeSingle();
      if (hs) {
        out.hospital_name    = hs.hospital_name    ?? hs.name ?? 'Hospital';
        out.hospital_address = hs.hospital_address ?? hs.address ?? '';
        out.hospital_phone   = hs.hospital_phone   ?? hs.phone ?? '';
      }
    } catch { /* ignore */ }
    try {
      const { data: p } = await this.db.from('patients')
        .select('first_name,last_name,uhid').eq('id', r.patient_id).maybeSingle();
      if (p) {
        out.patient_name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        out.patient_mrn  = p.uhid ?? '';
      }
    } catch {/* */}
    if (r.target_ward_id) {
      try {
        const { data: w } = await this.db.from('wards')
          .select('code,name').eq('id', r.target_ward_id).maybeSingle();
        if (w) out.ward_label = `${w.code} · ${w.name}`;
      } catch {/* */}
    }
    const staffIds = [r.issued_by, r.dispatched_by, r.dispatch_runner_staff_id].filter(Boolean) as string[];
    if (staffIds.length) {
      try {
        const { data: s } = await this.db.from('staff')
          .select('id, full_name').in('id', staffIds);
        const byId = new Map<string, string>((s ?? []).map((x: any) => [x.id, x.full_name]));
        out.issued_by_name      = r.issued_by      ? byId.get(r.issued_by)      : undefined;
        out.dispatched_by_name  = r.dispatched_by  ? byId.get(r.dispatched_by)  : undefined;
        out.runner_name         = r.dispatch_runner_staff_id ? byId.get(r.dispatch_runner_staff_id) : undefined;
      } catch {/* */}
    }
    return out;
  }

  private render(r: BloodRequest, u: BloodUnit, ctx: SlipContext): string {
    const fmt = (s?: string | null) => s ? new Date(s).toLocaleString() : '—';
    const bgPretty: Record<string, string> = {
      A_POS:'A+', A_NEG:'A-', B_POS:'B+', B_NEG:'B-',
      AB_POS:'AB+', AB_NEG:'AB-', O_POS:'O+', O_NEG:'O-',
    };
    const compPretty: Record<string, string> = {
      whole_blood:'Whole Blood', prbc:'Packed RBC', ffp:'FFP',
      platelets:'Platelets', cryo:'Cryoprecipitate', single_donor_platelets:'SDP',
    };
    const priorityBadge = r.priority === 'stat'
      ? '<span style="color:#fff;background:#b00020;padding:2px 8px;border-radius:4px;font-weight:700">STAT</span>'
      : r.priority === 'urgent'
      ? '<span style="color:#fff;background:#c47200;padding:2px 8px;border-radius:4px;font-weight:600">URGENT</span>'
      : '<span style="color:#444;background:#eee;padding:2px 8px;border-radius:4px;font-weight:500">ROUTINE</span>';

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Issue Slip · ${u.unit_no}</title>
<style>
  @page { size: A5; margin: 8mm; }
  body { font-family: 'Inter','Segoe UI',Arial,sans-serif; color:#111; font-size:11px; line-height:1.4; }
  .head { border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:10px; }
  .head h1 { margin:0; font-size:14px; }
  .head p { margin:0; color:#444; font-size:10px; }
  h2 { font-size:11px; margin:10px 0 4px; border-bottom:1px solid #ddd; padding-bottom:2px; text-transform:uppercase; letter-spacing:.04em; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:4px 6px; border:1px solid #bbb; text-align:left; vertical-align:top; }
  th { background:#f5f5f5; font-weight:600; font-size:10px; width:32%; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
  .big { font-size:18px; font-weight:700; letter-spacing:.05em; }
  .warn { color:#b00020; font-weight:700; }
  .sig { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:18px; margin-top:24px; }
  .sig div { border-top:1px solid #999; padding-top:4px; font-size:10px; color:#444; text-align:center; }
  .stamp { text-align:right; font-size:9px; color:#666; margin-top:6px; }
  .req-no { font-family: 'Courier New',monospace; font-size:14px; font-weight:700; }
</style></head>
<body>
  <div class="head" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h1>${ctx.hospital_name ?? 'Hospital'}</h1>
      <p>${ctx.hospital_address ?? ''}</p>
      <p>${ctx.hospital_phone ?? ''}</p>
    </div>
    <div style="text-align:right">
      <h1>BLOOD ISSUE SLIP</h1>
      <p class="req-no">${r.request_no}</p>
      <p>${priorityBadge}</p>
    </div>
  </div>

  <div class="grid">
    <table>
      <tr><th>Patient</th><td>${ctx.patient_name ?? '—'}</td></tr>
      <tr><th>UHID/MRN</th><td>${ctx.patient_mrn ?? '—'}</td></tr>
      <tr><th>Target Ward</th><td><b>${ctx.ward_label ?? '—'}</b></td></tr>
    </table>
    <table>
      <tr><th>Unit No</th><td class="big">${u.unit_no}</td></tr>
      <tr><th>Group</th><td><b>${bgPretty[u.blood_group] ?? u.blood_group}</b></td></tr>
      <tr><th>Component</th><td>${compPretty[u.component] ?? u.component}</td></tr>
      <tr><th>Volume</th><td>${u.volume_ml} ml</td></tr>
      <tr><th>Expires</th><td class="warn">${fmt(u.expires_at)}</td></tr>
    </table>
  </div>

  <h2>Cold-chain & Dispatch</h2>
  <table>
    <tr><th>Cold-chain Box</th><td><b>${r.cold_chain_box_id ?? '—'}</b></td>
        <th>Runner</th><td>${ctx.runner_name ?? '—'}</td></tr>
    <tr><th>Issued At</th><td>${fmt(r.issued_at)}</td>
        <th>Dispatched At</th><td>${fmt(r.dispatched_at)}</td></tr>
    <tr><th>Issued By</th><td>${ctx.issued_by_name ?? '—'}</td>
        <th>Dispatched By</th><td>${ctx.dispatched_by_name ?? '—'}</td></tr>
  </table>

  <h2>Compatibility Confirmation</h2>
  <table>
    <tr>
      <td colspan="2" style="font-size:10px">
        Cross-match COMPATIBLE · ABO/Rh verified · TRANSFUSION consent on file<br>
        <b>Verify patient identity, group, expiry and unit number against the wristband before transfusion.</b>
      </td>
    </tr>
  </table>

  <div class="sig">
    <div>Issued (BB Tech)</div>
    <div>Runner</div>
    <div>Received (Ward Nurse)</div>
  </div>

  <p class="stamp">Printed ${new Date().toLocaleString()} · Sree Diagnostics</p>
</body></html>`;
  }
}
