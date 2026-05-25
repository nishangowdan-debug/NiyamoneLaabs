// supabase/functions/send-lab-report/index.ts
//
// Edge Function that aggregates lab activity for a date range and emails an
// HTML report to every active recipient in `report_recipients` (or to a single
// override address when invoked manually).
//
// Trigger paths:
//   1. pg_cron — see `db/migrations/20260516_lab_report_schedule.sql`. Cron
//      hits this function on a daily / weekly / monthly cadence with a JSON
//      body { range_preset, branch_id? }.
//   2. Manual — anyone with the project's anon key can POST to it with a
//      `to_override` to test delivery without spamming the recipient list.
//
// Required env vars (set via `supabase secrets set`):
//   SUPABASE_URL              (auto-populated by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-populated by Supabase)
//   RESEND_API_KEY            (get from https://resend.com/api-keys)
//   REPORT_FROM_EMAIL         (e.g. "Niyamone Lab <reports@niyamone.com>")
//
// Returns: { sent_to: string[], errors: string[] }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';

type RangePreset = 'daily' | 'weekly' | 'monthly';

interface RequestBody {
  range_preset?: RangePreset;
  branch_id?: string | null;
  /** Test mode — overrides the recipient list and sends to this single email. */
  to_override?: string | null;
}

function rangeFor(preset: RangePreset): { from: string; to: string; label: string } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  let label = '';
  if (preset === 'daily') {
    from.setHours(0, 0, 0, 0);
    label = `Daily report · ${from.toISOString().slice(0, 10)}`;
  } else if (preset === 'weekly') {
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
    label = `Weekly report · ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    label = `Month-to-date report · ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
  }
  return { from: from.toISOString(), to: to.toISOString(), label };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Aggregate the slices needed for the email body. Mirrors the lighter half of
 *  the frontend lab-reports.service.ts so the email summary stays useful even
 *  if the Edge Function diverges. */
async function buildSummary(supabase: ReturnType<typeof createClient>, branchId: string | null, from: string, to: string) {
  // 1. Volume of lab_results in the window.
  let resultsQ = supabase.from('lab_results')
    .select('id, flag, lab_order:lab_order_id(branch_id)')
    .gte('created_at', from).lte('created_at', to);
  const { data: resultsRaw } = await resultsQ;
  let results = ((resultsRaw ?? []) as any[]);
  if (branchId) results = results.filter((r) => r.lab_order?.branch_id === branchId);
  const totalResults = results.length;
  const criticalCount = results.filter((r) => r.flag === 'critical_low' || r.flag === 'critical_high').length;

  // 2. Revenue from paid invoices in window.
  let invQ: any = supabase.from('invoices')
    .select('total_cents, status, branch_id')
    .gte('invoice_date', from).lte('invoice_date', to);
  if (branchId) invQ = invQ.eq('branch_id', branchId);
  const { data: invs } = await invQ;
  const revenueRupees = ((invs ?? []) as any[])
    .filter((i: any) => !['void', 'refunded', 'draft'].includes(i.status))
    .reduce((s: number, i: any) => s + (i.total_cents ?? 0) / 100, 0);

  // 3. Outstanding receivables (LIVE, ignores date range).
  let recvQ: any = supabase.from('invoices')
    .select('balance_cents, status, branch_id').gt('balance_cents', 0)
    .not('status', 'in', '(void,refunded,draft)');
  if (branchId) recvQ = recvQ.eq('branch_id', branchId);
  const { data: recv } = await recvQ;
  const outstandingRupees = ((recv ?? []) as any[]).reduce((s: number, r: any) => s + (r.balance_cents ?? 0) / 100, 0);
  const outstandingCount = ((recv ?? []) as any[]).length;

  // 4. Sample rejections.
  let rejQ: any = supabase.from('lab_orders')
    .select('id, rejection_reason, status, branch_id, ordered_at')
    .gte('ordered_at', from).lte('ordered_at', to);
  if (branchId) rejQ = rejQ.eq('branch_id', branchId);
  const { data: orders } = await rejQ;
  const orderRows = ((orders ?? []) as any[]);
  const rejected = orderRows.filter((o: any) => o.status === 'rejected' || !!o.rejection_reason).length;
  const totalOrders = orderRows.length;
  const rejectionRate = totalOrders > 0 ? +((rejected / totalOrders) * 100).toFixed(1) : 0;

  // 5. Outsource — pending count.
  let outsQ: any = supabase.from('reference_lab_dispatches')
    .select('status, branch_id').gte('dispatched_at', from).lte('dispatched_at', to);
  if (branchId) outsQ = outsQ.eq('branch_id', branchId);
  const { data: outs } = await outsQ;
  const outsRows = ((outs ?? []) as any[]);
  const dispatchedTotal = outsRows.length;
  const dispatchedReported = outsRows.filter((d: any) => d.status === 'reported').length;
  const dispatchedPending = outsRows.filter((d: any) => ['dispatched','in_transit','received'].includes(d.status)).length;

  return {
    totalResults, criticalCount, revenueRupees,
    outstandingRupees, outstandingCount,
    rejected, totalOrders, rejectionRate,
    dispatchedTotal, dispatchedReported, dispatchedPending,
  };
}

function buildEmailHtml(label: string, branchLabel: string, s: Awaited<ReturnType<typeof buildSummary>>): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font: 13px/1.4 'Helvetica Neue', Arial, sans-serif; color: #1F2937; margin: 0; padding: 16px; background: #F9FAFB; }
  .card { background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 18px; max-width: 640px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #0E4F8C; }
  .meta { color: #6B7280; font-size: 12px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; }
  td.label { color: #6B7280; }
  td.val { text-align: right; font-weight: 600; color: #111827; }
  .crit { color: #DC2626; }
  .good { color: #059669; }
  .warn { color: #D97706; }
  .footer { color: #9CA3AF; font-size: 11px; margin-top: 14px; text-align: center; }
</style></head><body>
<div class="card">
  <h1>${esc(label)}</h1>
  <div class="meta">${esc(branchLabel)}</div>
  <table>
    <tr><td class="label">Total results</td><td class="val">${s.totalResults}</td></tr>
    <tr><td class="label">Critical flags</td><td class="val ${s.criticalCount > 0 ? 'crit' : ''}">${s.criticalCount}</td></tr>
    <tr><td class="label">Revenue</td><td class="val">${inr(s.revenueRupees)}</td></tr>
    <tr><td class="label">Total orders</td><td class="val">${s.totalOrders}</td></tr>
    <tr><td class="label">Rejected samples</td><td class="val ${s.rejectionRate > 5 ? 'crit' : (s.rejectionRate > 2 ? 'warn' : 'good')}">${s.rejected} (${s.rejectionRate}%)</td></tr>
    <tr><td class="label">Outsource — dispatched / reported / pending</td><td class="val">${s.dispatchedTotal} / ${s.dispatchedReported} / ${s.dispatchedPending}</td></tr>
    <tr><td class="label">Outstanding receivables (live)</td><td class="val ${s.outstandingCount > 0 ? 'warn' : 'good'}">${inr(s.outstandingRupees)} · ${s.outstandingCount} invoices</td></tr>
  </table>
  <div class="footer">Niyamone Lab · automated report · open the dashboard for full detail and CSV/PDF exports.</div>
</div>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REPORT_FROM_EMAIL') ?? 'Niyamone Lab <reports@niyamone.com>';
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) {
    return { ok: false, error: `Resend ${r.status}: ${await r.text()}` };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const preset: RangePreset = body.range_preset ?? 'daily';
    const range = rangeFor(preset);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Recipients.
    let recipients: { email: string; branch_id: string | null }[] = [];
    if (body.to_override) {
      recipients = [{ email: body.to_override, branch_id: body.branch_id ?? null }];
    } else {
      let recvQ: any = supabase.from('report_recipients')
        .select('email, branch_id, is_active, cadence')
        .eq('is_active', true)
        .eq('cadence', preset);
      const { data, error } = await recvQ;
      if (error) throw error;
      recipients = (data ?? []) as any[];
    }
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent_to: [], errors: ['No active recipients for this cadence'] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sent_to: string[] = [];
    const errors: string[] = [];
    // Group by branch_id so each recipient gets their own branch slice.
    for (const rcpt of recipients) {
      const summary = await buildSummary(supabase, rcpt.branch_id, range.from, range.to);
      const html = buildEmailHtml(range.label, rcpt.branch_id ? `Branch: ${rcpt.branch_id}` : 'All hospitals', summary);
      const r = await sendEmail(rcpt.email, range.label, html);
      if (r.ok) sent_to.push(rcpt.email);
      else errors.push(`${rcpt.email}: ${r.error}`);
    }

    return new Response(JSON.stringify({ sent_to, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
