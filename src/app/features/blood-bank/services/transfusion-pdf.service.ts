import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { TransfusionRecord } from '../data/blood-bank.types';

interface PrintContext {
  hospital_name?: string;
  hospital_address?: string;
  hospital_phone?: string;
  patient_name?: string;
  patient_mrn?: string;
  unit_no?: string;
  blood_group?: string;
  component?: string;
  request_no?: string;
}

@Injectable({ providedIn: 'root' })
export class TransfusionPdfService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async print(tx: TransfusionRecord): Promise<void> {
    const ctx = await this.fetchContext(tx);
    const html = this.render(tx, ctx);

    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  private async fetchContext(tx: TransfusionRecord): Promise<PrintContext> {
    const out: PrintContext = {};
    try {
      const { data: hs } = await this.db.from('hospital_settings').select('*').limit(1).maybeSingle();
      if (hs) {
        out.hospital_name    = hs.hospital_name    ?? hs.name ?? 'Hospital';
        out.hospital_address = hs.hospital_address ?? hs.address ?? '';
        out.hospital_phone   = hs.hospital_phone   ?? hs.phone ?? '';
      }
    } catch { /* ignore */ }
    try {
      const { data: p } = await this.db.from('patients').select('first_name,last_name,uhid').eq('id', tx.patient_id).maybeSingle();
      if (p) {
        out.patient_name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        out.patient_mrn = p.uhid ?? '';
      }
    } catch {/* */}
    try {
      const { data: u } = await this.db.from('blood_units').select('unit_no, blood_group, component').eq('id', tx.unit_id).maybeSingle();
      if (u) {
        out.unit_no = u.unit_no;
        out.blood_group = u.blood_group;
        out.component = u.component;
      }
    } catch {/* */}
    try {
      const { data: r } = await this.db.from('blood_requests').select('request_no').eq('id', tx.request_id).maybeSingle();
      if (r) out.request_no = r.request_no;
    } catch {/* */}
    return out;
  }

  private render(tx: TransfusionRecord, ctx: PrintContext): string {
    const fmt = (s?: string | null) => s ? new Date(s).toLocaleString() : '—';
    const vital = (v: any) => v?.raw ?? (typeof v === 'string' ? v : JSON.stringify(v ?? {}));
    const bgPretty: Record<string,string> = {
      A_POS:'A+', A_NEG:'A-', B_POS:'B+', B_NEG:'B-',
      AB_POS:'AB+', AB_NEG:'AB-', O_POS:'O+', O_NEG:'O-',
    };
    const compPretty: Record<string,string> = {
      whole_blood:'Whole Blood', prbc:'Packed RBC', ffp:'FFP',
      platelets:'Platelets', cryo:'Cryoprecipitate', single_donor_platelets:'SDP',
    };
    const reactionBadge = tx.reaction === 'none'
      ? '<span style="color:#137333;font-weight:600">No Reaction</span>'
      : `<span style="color:#b00020;font-weight:700">${tx.reaction.toUpperCase()} REACTION</span>`;
    const outcomeBadge = tx.outcome === 'completed'
      ? '<span style="color:#137333;font-weight:600">COMPLETED</span>'
      : tx.outcome
        ? `<span style="color:#b00020;font-weight:700">${tx.outcome.toUpperCase()}</span>`
        : '<span style="color:#946100;font-weight:700">IN PROGRESS</span>';

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Transfusion Record · ${ctx.unit_no ?? ''}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Inter','Segoe UI',Arial,sans-serif; color:#111; font-size:12px; line-height:1.4; }
  .head { border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:14px; }
  .head h1 { margin:0; font-size:16px; }
  .head p { margin:0; color:#444; font-size:11px; }
  h2 { font-size:13px; margin:16px 0 6px; border-bottom:1px solid #ddd; padding-bottom:3px; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:5px 8px; border:1px solid #ccc; text-align:left; vertical-align:top; }
  th { background:#f5f5f5; font-weight:600; font-size:11px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .pill { display:inline-block; padding:2px 8px; border-radius:4px; background:#eef; font-weight:600; font-size:11px; }
  .sig { display:grid; grid-template-columns: 1fr 1fr; gap:30px; margin-top:30px; }
  .sig div { border-top:1px solid #999; padding-top:4px; font-size:11px; color:#444; }
  .stamp { text-align:right; font-size:10px; color:#666; margin-top:6px; }
</style></head>
<body>
  <div class="head">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1>${ctx.hospital_name ?? 'Hospital'}</h1>
        <p>${ctx.hospital_address ?? ''}</p>
        <p>${ctx.hospital_phone ?? ''}</p>
      </div>
      <div style="text-align:right">
        <h1>BLOOD TRANSFUSION RECORD</h1>
        <p>Request: <b>${ctx.request_no ?? '—'}</b></p>
      </div>
    </div>
  </div>

  <div class="grid">
    <div>
      <table>
        <tr><th>Patient</th><td>${ctx.patient_name ?? '—'}</td></tr>
        <tr><th>MRN</th><td>${ctx.patient_mrn ?? '—'}</td></tr>
      </table>
    </div>
    <div>
      <table>
        <tr><th>Unit No</th><td><b>${ctx.unit_no ?? '—'}</b></td></tr>
        <tr><th>Group</th><td><span class="pill">${bgPretty[ctx.blood_group ?? '']  ?? ctx.blood_group ?? '—'}</span></td></tr>
        <tr><th>Component</th><td>${compPretty[ctx.component ?? ''] ?? ctx.component ?? '—'}</td></tr>
      </table>
    </div>
  </div>

  <h2>Transfusion Timing</h2>
  <table>
    <tr><th>Started At</th><td>${fmt(tx.started_at)}</td>
        <th>Ended At</th><td>${fmt(tx.ended_at)}</td></tr>
    <tr><th>Outcome</th><td colspan="3">${outcomeBadge} · Reaction: ${reactionBadge}</td></tr>
  </table>

  <h2>Vitals Monitoring</h2>
  <table>
    <tr><th style="width:18%">Pre-transfusion</th><td>${vital(tx.vitals_pre) || '—'}</td></tr>
    <tr><th>15 min</th><td>${vital(tx.vitals_15min) || '—'}</td></tr>
    <tr><th>Post-transfusion</th><td>${vital(tx.vitals_post) || '—'}</td></tr>
  </table>

  ${tx.reaction !== 'none' || tx.reaction_notes ? `
  <h2>Reaction Notes</h2>
  <table><tr><td style="white-space:pre-wrap">${tx.reaction_notes ?? ''}</td></tr></table>
  ` : ''}

  <div class="sig">
    <div>Performing Nurse / Technologist</div>
    <div>Supervising Doctor</div>
  </div>

  <p class="stamp">Generated ${new Date().toLocaleString()} · Sree Diagnostics</p>
</body></html>`;
  }
}
