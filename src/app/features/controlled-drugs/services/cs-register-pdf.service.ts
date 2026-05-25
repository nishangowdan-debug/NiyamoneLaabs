import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { CS_ENTRY_LABELS, type RegisterEntry } from '../data/controlled-drugs.types';

@Injectable({ providedIn: 'root' })
export class CsRegisterPdfService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async print(opts: {
    itemId: string;
    batchId: string;
    fromIso: string;
    toIso: string;
    entries: RegisterEntry[];
  }) {
    const ctx = await this.fetchContext(opts.itemId, opts.batchId);
    const html = this.render(opts.entries, ctx, opts.fromIso, opts.toIso);
    const w = window.open('', '_blank', 'width=1100,height=1100');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  private async fetchContext(itemId: string, batchId: string) {
    const out: any = {};
    try {
      const { data: hs } = await this.db.from('hospital_settings').select('*').limit(1).maybeSingle();
      if (hs) {
        out.hospital_name    = hs.hospital_name ?? hs.name ?? 'Hospital';
        out.hospital_address = hs.hospital_address ?? hs.address ?? '';
        out.license_no       = hs.drug_license_no ?? hs.license_no ?? '';
      }
    } catch { /* ignore */ }
    try {
      const { data: i } = await this.db.from('inventory_items')
        .select('name, generic_name, strengths, sku, controlled_class').eq('id', itemId).maybeSingle();
      if (i) Object.assign(out, { item: i });
    } catch {/* */}
    try {
      const { data: b } = await this.db.from('inventory_batches')
        .select('id, expiry_date').eq('id', batchId).maybeSingle();
      if (b) Object.assign(out, { batch: b });
    } catch {/* */}
    return out;
  }

  private render(entries: RegisterEntry[], ctx: any, fromIso: string, toIso: string): string {
    const fmt = (s?: string | null) => s ? new Date(s).toLocaleString() : '—';
    const sortedAsc = [...entries].sort((a, b) => +new Date(a.entry_at) - +new Date(b.entry_at));
    const rows = sortedAsc.map((e, i) => {
      const isReceipt = e.qty_change > 0;
      const qty = Math.abs(Number(e.qty_change));
      return `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${fmt(e.entry_at)}</td>
          <td>${CS_ENTRY_LABELS[e.entry_type] ?? e.entry_type}</td>
          <td style="text-align:right">${isReceipt ? qty.toFixed(3) : ''}</td>
          <td style="text-align:right">${!isReceipt ? qty.toFixed(3) : ''}</td>
          <td style="text-align:right;font-weight:600">${Number(e.balance_after).toFixed(3)}</td>
          <td>${e.patient_id ? e.patient_id.slice(0,8) : ''}</td>
          <td>${e.witness_name ?? ''}</td>
          <td style="font-size:9px">${e.reason ?? ''}${e.notes ? ' · ' + e.notes : ''}</td>
        </tr>`;
    }).join('');

    const item = ctx.item || {};

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Controlled Drug Register</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Inter','Segoe UI',Arial,sans-serif; color:#111; font-size:11px; }
  h1 { font-size:14px; margin:0 0 6px; }
  .head { border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:10px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; font-size:10.5px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #555; padding:4px 6px; text-align:left; vertical-align:top; }
  th { background:#eee; font-weight:600; font-size:10px; }
  .stamp { font-size:9px; color:#666; margin-top:8px; text-align:right; }
  .sig { display:flex; justify-content:space-between; margin-top:30px; gap:40px; }
  .sig div { flex:1; border-top:1px solid #555; padding-top:4px; font-size:10px; color:#444; text-align:center; }
</style></head>
<body>
  <div class="head">
    <h1>${ctx.hospital_name ?? 'Hospital'} — Controlled Drug Register</h1>
    <p style="margin:0;font-size:10px;color:#444">${ctx.hospital_address ?? ''} · Drug Licence: ${ctx.license_no || '—'}</p>
  </div>
  <div class="meta">
    <div><b>Drug:</b> ${item.name ?? '—'} ${item.strengths?.length ? '(' + item.strengths.join(', ') + ')' : ''}</div>
    <div><b>Schedule:</b> ${(item.controlled_class ?? '').replace('_',' ').toUpperCase()}</div>
    <div><b>Generic:</b> ${item.generic_name ?? '—'}</div>
    <div><b>SKU:</b> ${item.sku ?? '—'}</div>
    <div><b>Batch:</b> ${ctx.batch?.id?.slice(0,8) ?? '—'}</div>
    <div><b>Expiry:</b> ${ctx.batch?.expiry_date ?? '—'}</div>
    <div><b>Period:</b> ${new Date(fromIso).toLocaleDateString()} — ${new Date(toIso).toLocaleDateString()}</div>
    <div><b>Generated:</b> ${new Date().toLocaleString()}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:24px">#</th>
        <th style="width:110px">Date / Time</th>
        <th style="width:70px">Type</th>
        <th style="width:60px">Receipt</th>
        <th style="width:60px">Issued</th>
        <th style="width:60px">Balance</th>
        <th style="width:80px">Patient (UID)</th>
        <th style="width:120px">Witness</th>
        <th>Reason / Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="9" style="text-align:center;padding:20px;color:#888">No entries in selected period.</td></tr>`}
    </tbody>
  </table>
  <div class="sig">
    <div>Pharmacist In-Charge</div>
    <div>Witness</div>
    <div>Verified By</div>
  </div>
  <p class="stamp">Sree Diagnostics · register entries are immutable per NDPS Act</p>
</body></html>`;
  }
}
