import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { Json, PaymentMethod } from '../../../core/supabase/supabase.types';
import type { DraftLine, Invoice, InvoiceDetail, InvoiceItem, InvoiceRow, Service } from './billing.types';

interface RawInvoice extends Invoice {
  patient: InvoiceRow['patient'];
  doctor?: InvoiceRow['doctor'];
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private supabase = inject(SupabaseService);

  async listInvoices(limit = 1000): Promise<InvoiceRow[]> {
    // Sort by invoice_date DESC, then created_at DESC so a freshly-issued
    // invoice with the same calendar date as older ones still floats to the
    // top instead of getting buried by alphabetical/id tiebreakers.
    const { data, error } = await this.supabase.client
      .from('invoices')
      .select(`*, patient:patient_id(id, uhid, full_name, first_name, last_name, mobile), doctor:doctor_staff_id(id, full_name, metadata), branch:branch_id(id, code, name)`)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<RawInvoice[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getInvoice(id: string): Promise<InvoiceDetail> {
    const [hdrResp, itemsResp, paysResp] = await Promise.all([
      this.supabase.client
        .from('invoices')
        .select(`*, patient:patient_id(id, uhid, full_name, first_name, last_name, mobile), doctor:doctor_staff_id(id, full_name, metadata), branch:branch_id(id, code, name)`)
        .eq('id', id)
        .single(),
      this.supabase.client
        .from('invoice_items')
        .select('*, service:service_id(code, category)')
        .eq('invoice_id', id)
        .order('position'),
      this.supabase.client
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('paid_at', { ascending: false }),
    ]);
    if (hdrResp.error)   throw hdrResp.error;
    if (itemsResp.error) throw itemsResp.error;
    if (paysResp.error)  throw paysResp.error;

    const hdr = hdrResp.data as unknown as RawInvoice;
    return {
      ...hdr,
      items: itemsResp.data ?? [],
      payments: paysResp.data ?? [],
    };
  }

  /**
   * Branch-scoped service catalog. Sree Diagnostics-Lab restricts billable services to
   * lab + imaging (radiology) only — consultation, IPD, ambulance etc. don't apply
   * to a standalone diagnostic centre.
   *
   * When `branchId` is null (super_admin "All hospitals" view), the result is deduped
   * by `code` so the dropdown shows each service once.
   */
  async listServices(branchId: string | null = null): Promise<Service[]> {
    let q = this.supabase.client
      .from('services')
      .select('*')
      .eq('is_active', true)
      .in('category', ['lab', 'imaging'])
      .order('category')
      .order('name');
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    if (branchId) return rows;
    // Dedup by lower(code) — keep first occurrence
    const seen = new Set<string>();
    return rows.filter(s => {
      const k = (s.code || '').toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Search patients (active, non-archived) for the new-invoice modal. */
  async searchPatients(term: string, limit = 10): Promise<{ id: string; uhid: string; full_name: string; mobile: string }[]> {
    const t = term.trim();
    if (t.length < 2) return [];
    const { data, error } = await this.supabase.client
      .from('patients')
      .select('id, uhid, full_name, first_name, last_name, mobile')
      .is('archived_at', null)
      .or(`full_name.ilike.%${t}%,uhid.ilike.%${t}%,mobile.ilike.%${t}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      uhid: p.uhid,
      full_name: p.full_name || `${p.first_name} ${p.last_name}`,
      mobile: p.mobile,
    }));
  }

  async createInvoice(input: {
    patientId: string;
    /** Target branch the invoice should file under. Set by the cashier via
     *  the topbar branch selector (enforced by BranchContextService.require
     *  before openNew). Optional in the type for backwards compatibility,
     *  but the RPC will reject null in production paths. */
    branchId?: string | null;
    doctorStaffId?: string | null;     // optional — referring doctor only, printed on invoice
    doctorName?: string | null;        // manual entry when doctor isn't in the staff table
    items: DraftLine[];
    encounterId?: string | null;
    admissionId?: string | null;
    dueDays?: number;
    notes?: string;
    issue?: boolean;
    chiefComplaint?: string | null;
    room?: string | null;
  }): Promise<Invoice> {
    const manualName = (input.doctorName ?? '').trim();

    const lines = input.items.map((l) => ({
      service_code: l.service_code || undefined,
      description: l.description,
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
      discount_cents: l.discount_cents,
      gst_rate: l.gst_rate,
    }));

    // Capture referring doctor name into invoice notes so the printed invoice shows it.
    const notesWithDoctor = manualName && !input.doctorStaffId
      ? [`Referring doctor: ${manualName}`, input.notes].filter(Boolean).join(' · ')
      : input.notes;

    const { data, error } = await (this.supabase.client as any).rpc('create_invoice', {
      p_patient_id:   input.patientId,
      p_branch_id:    input.branchId ?? null,
      p_items:        lines as unknown as Json,
      p_encounter_id: input.encounterId ?? undefined,
      p_admission_id: input.admissionId ?? undefined,
      p_due_days:     input.dueDays ?? 7,
      p_notes:        notesWithDoctor ?? undefined,
      p_issue:        input.issue ?? true,
    });
    if (error) throw error;
    const invoice = data as Invoice;

    // Persist per-line routing (inhouse / outsource) chosen on the form.
    // Best-effort: skip silently if the column hasn't been migrated.
    const linesWithRouting = input.items.filter((l) => l.routing && l.service_code);
    if (linesWithRouting.length > 0) {
      try {
        const { data: items } = await this.supabase.client
          .from('invoice_items')
          .select('id, service_id, services:service_id(code)')
          .eq('invoice_id', (invoice as any).id);
        if (items) {
          for (const draft of linesWithRouting) {
            const match = (items as any[]).find((it) => it.services?.code === draft.service_code);
            if (!match?.id) continue;
            await (this.supabase.client as any)
              .from('invoice_items')
              .update({ routing: draft.routing })
              .eq('id', match.id);
          }
        }
      } catch (e: any) {
        const msg = String(e?.message ?? '').toLowerCase();
        if (!msg.includes('routing') || !msg.includes('does not exist')) {
          console.warn('[billing] could not persist invoice_item routing:', e?.message);
        }
      }
    }

    return {
      ...(invoice as any),
      doctor_staff_id: input.doctorStaffId ?? null,
      doctor_name_manual: input.doctorStaffId ? null : manualName,
    } as Invoice;
  }

  /** Active doctors for the New Invoice doctor selector.
   *  Dedupes by full_name (legacy seeds can create multiple rows for the same person).
   *  Preference order when collapsing: row with specialty > newest created_at.
   */
  async listDoctors(): Promise<{ id: string; full_name: string; specialty: string | null }[]> {
    const { data, error } = await this.supabase.client
      .from('staff')
      .select('id, full_name, metadata, created_at')
      .eq('role_slug', 'doctor')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;

    const mapped = (data ?? []).map(d => {
      const meta = (d.metadata ?? {}) as Record<string, unknown>;
      const specialty = (meta['specialty'] as string) ?? (meta['speciality'] as string) ?? null;
      return { id: d.id, full_name: d.full_name, specialty, created_at: (d as any).created_at as string | null };
    });

    const byName = new Map<string, typeof mapped[number]>();
    for (const d of mapped) {
      const key = (d.full_name || '').trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing) { byName.set(key, d); continue; }
      const preferNew =
        (!!d.specialty && !existing.specialty) ||
        ((d.created_at ?? '') > (existing.created_at ?? ''));
      if (preferNew) byName.set(key, d);
    }
    return Array.from(byName.values())
      .map(({ id, full_name, specialty }) => ({ id, full_name, specialty }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  /** Place a lab order for the given patient and test codes (lab_tests.code, no LAB- prefix).
   *  `routings` (parallel array) chooses inhouse/outsource per test. Omit any entry
   *  and the RPC falls back to `lab_tests.default_routing`. */
  async placeLabOrder(input: {
    patientId: string;
    testCodes: string[];
    routings?: ('inhouse' | 'outsource')[];
    notes?: string;
  }): Promise<{ id: string } | null> {
    if (input.testCodes.length === 0) return null;
    const base = {
      p_patient_id: input.patientId,
      p_test_codes: input.testCodes,
      p_priority: 'routine',
      p_notes: input.notes ?? undefined,
    } as any;
    if (input.routings && input.routings.length > 0) {
      const { data, error } = await (this.supabase.client as any).rpc('place_lab_order', {
        ...base,
        p_routings: input.routings,
      });
      if (!error) return data as { id: string };
      // RPC hasn't been upgraded yet — retry without the new param.
      const msg = String(error?.message ?? '').toLowerCase();
      const isUnknownParam =
        msg.includes('p_routings') ||
        msg.includes('does not exist') ||
        msg.includes('function') && msg.includes('place_lab_order');
      if (!isUnknownParam) throw error;
    }
    const { data, error } = await (this.supabase.client as any).rpc('place_lab_order', base);
    if (error) throw error;
    return data as { id: string };
  }

  /**
   * Push an existing invoice's lab line items to the Lab workbench. Used to
   * retry / backfill invoices that were created before the auto-push was wired
   * (or when the auto-push silently failed). Returns the test codes sent and
   * the new lab order id (if any).
   *
   * Strategy:
   *  1. Load invoice items (each has service_code, possibly null for custom rows).
   *  2. Look up the service for each non-null code → keep ones with category='lab'.
   *  3. Try matching each kept code to a row in `lab_tests` — first by exact code,
   *     then by code with the 'LAB-' prefix stripped (covers both seed styles).
   *  4. Call place_lab_order with the resolved lab_tests.code list.
   */
  async pushInvoiceToLab(
    invoiceId: string,
    overrides?: Map<string, 'inhouse' | 'outsource'>,
  ): Promise<{ sent: string[]; orderId: string | null; reason?: string }> {
    try {
      return await this.pushInvoiceToLabInner(invoiceId, overrides);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('[pushInvoiceToLab] threw:', e);
      return { sent: [], orderId: null, reason: `Error: ${msg}` };
    }
  }

  private async pushInvoiceToLabInner(
    invoiceId: string,
    overrides?: Map<string, 'inhouse' | 'outsource'>,
  ): Promise<{ sent: string[]; orderId: string | null; reason?: string }> {
    const inv = await this.getInvoice(invoiceId);
    const items = (inv.items ?? []) as any[];

    // invoice_items stores `service_id` (UUID) — `service.code` comes from the
    // join. Fall back to legacy `service_code` if some path stashes it directly.
    const serviceCodes = items
      .map((it) => (it.service?.code ?? it.service_code ?? '').toString().trim())
      .filter((c) => c.length > 0);

    // Same join provides the category, so we can skip a second `services` query
    // in many cases — but we still re-check below to handle legacy rows.
    const labCodesFromJoin = items
      .map((it) => it.service)
      .filter((s: any) => s && s.category === 'lab')
      .map((s: any) => s.code as string);

    const resolved = new Set<string>();
    let labServiceCodes: string[] = [];

    if (serviceCodes.length > 0) {
      labServiceCodes = [...labCodesFromJoin];
      const codesWithoutCategory = serviceCodes.filter(
        (c) => !items.some((it) => (it.service?.code === c) && it.service?.category),
      );
      if (codesWithoutCategory.length > 0) {
        const { data: svcs, error: sErr } = await this.supabase.client
          .from('services')
          .select('code, category')
          .in('code', codesWithoutCategory);
        if (sErr) throw sErr;
        labServiceCodes.push(
          ...((svcs ?? []) as any[]).filter((s) => s.category === 'lab' || s.category === 'imaging').map((s) => s.code as string),
        );
      }
      labServiceCodes = Array.from(new Set(labServiceCodes));

      if (labServiceCodes.length > 0) {
        const candidates = Array.from(new Set(
          labServiceCodes.flatMap((c) => [c, c.replace(/^LAB[-_ ]/i, '')]),
        ));
        const { data: tests, error: tErr } = await this.supabase.client
          .from('lab_tests').select('code').in('code', candidates);
        if (tErr) throw tErr;
        const known = new Set(((tests ?? []) as any[]).map((t) => t.code as string));
        for (const c of labServiceCodes) {
          if (known.has(c)) resolved.add(c);
          else {
            const stripped = c.replace(/^LAB[-_ ]/i, '');
            if (known.has(stripped)) resolved.add(stripped);
          }
        }
      }
    }

    // Always try description matching too — covers mixed invoices where SOME
    // lines have valid service_id and others are typed-in custom rows. The Set
    // dedupes, so re-matching the same code is harmless.
    {
      const descs = items
        .map((it) => (it.description ?? '').toString().trim())
        .filter((d) => d.length > 0);
      if (descs.length > 0) {
        const { data: allTests, error: ltErr } = await this.supabase.client
          .from('lab_tests').select('code, name');
        if (ltErr) throw ltErr;
        const tests = ((allTests ?? []) as any[]).map((t) => ({ code: t.code as string, name: (t.name ?? '') as string }));
        const byNameLower = new Map<string, string>();
        const byCodeLower = new Map<string, string>();
        for (const t of tests) {
          if (t.name) byNameLower.set(t.name.toLowerCase().trim(), t.code);
          if (t.code) byCodeLower.set(t.code.toLowerCase().trim(), t.code);
        }
        const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tokenize = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length >= 2);

        for (const d of descs) {
          const key = d.toLowerCase().trim();
          // 1. Exact equality on name or code.
          let hit = byNameLower.get(key) ?? byCodeLower.get(key);
          // 2. Whole-word code inside the description (e.g. "CBC - fasting").
          if (!hit) {
            for (const [cLower, code] of byCodeLower) {
              if (cLower.length >= 2 && new RegExp(`\\b${escapeRe(cLower)}\\b`, 'i').test(d)) {
                hit = code; break;
              }
            }
          }
          // 3. Description contains the full test name, or vice-versa.
          if (!hit) {
            for (const [nLower, code] of byNameLower) {
              if (nLower.length >= 4 && (key.includes(nLower) || nLower.includes(key))) {
                hit = code; break;
              }
            }
          }
          // 4. Token-overlap (handles word reorder: "Chest X-ray" ↔ "X-ray Chest PA").
          if (!hit) {
            const dTokens = tokenize(d);
            if (dTokens.length > 0) {
              let bestScore = 0;
              let bestCode: string | null = null;
              for (const t of tests) {
                const nTokens = tokenize(t.name);
                if (nTokens.length === 0) continue;
                const overlap = nTokens.filter((tk) => dTokens.includes(tk)).length;
                const score = overlap / Math.min(nTokens.length, dTokens.length);
                if (score > bestScore) { bestScore = score; bestCode = t.code; }
              }
              if (bestScore >= 0.5 && bestCode) hit = bestCode;
            }
          }
          if (hit) resolved.add(hit);
        }
      }
    }

    if (resolved.size === 0) {
      // Classify the reason precisely so the UI can silence non-lab invoices
      // (consultation/pharmacy/bed charges) and only highlight genuine failures.
      if (labServiceCodes.length === 0) {
        // No lab/imaging-category services on the invoice → it's a non-lab
        // bill (consultation, pharmacy, IPD, etc.). Mark as silent so the
        // backfill banner doesn't list it.
        return {
          sent: [], orderId: null,
          reason: 'SILENT: not a lab invoice (no lab/imaging line items).',
        };
      }
      // Lab/imaging services exist but lab_tests catalog has no matching row.
      return {
        sent: [], orderId: null,
        reason: `Lab catalog missing entries for: ${labServiceCodes.join(', ')}. Add these codes in /lab-catalog.`,
      };
    }

    const codes = Array.from(resolved);
    const routings = await this.resolveRoutings(codes, overrides);
    console.log('[pushInvoiceToLab] resolved', { codes, routings });

    // Group codes by routing so each lab_orders row has a single routing value.
    const grouped = new Map<'inhouse' | 'outsource', string[]>();
    codes.forEach((c, i) => {
      const r = routings[i];
      const arr = grouped.get(r) ?? [];
      arr.push(c);
      grouped.set(r, arr);
    });

    let firstOrderId: string | null = null;
    for (const [routing, groupCodes] of grouped) {
      const r = await this.placeLabOrder({
        patientId: (inv as any).patient_id,
        testCodes: groupCodes,
        routings: groupCodes.map(() => routing),
        notes: `Pushed from invoice ${inv.invoice_number}`,
      });
      console.log('[pushInvoiceToLab] placed', { routing, groupCodes, orderId: r?.id });
      if (!firstOrderId && r?.id) firstOrderId = r.id;
    }
    return { sent: codes, orderId: firstOrderId };
  }

  /** Public helper for the New-Invoice form: given service.code values (which
   *  may carry a LAB- prefix), return a map of input code → default routing. */
  async getDefaultRoutings(serviceCodes: string[]): Promise<Map<string, 'inhouse' | 'outsource'>> {
    const result = new Map<string, 'inhouse' | 'outsource'>();
    if (serviceCodes.length === 0) return result;
    const candidates = Array.from(new Set(
      serviceCodes.flatMap((c) => [c, c.replace(/^LAB[-_ ]/i, '')]),
    ));
    const data = await this.fetchTestRoutings(candidates);
    const byCode = new Map<string, 'inhouse' | 'outsource'>();
    for (const r of data) byCode.set(r.code, r.default_routing);
    for (const c of serviceCodes) {
      const hit = byCode.get(c) ?? byCode.get(c.replace(/^LAB[-_ ]/i, ''));
      if (hit) result.set(c, hit);
    }
    return result;
  }

  /** Fetches { code, default_routing } from lab_tests, swallowing the missing-column
   *  error from pre-migration DBs (returns empty so callers default to 'inhouse'). */
  private async fetchTestRoutings(codes: string[]): Promise<{ code: string; default_routing: 'inhouse' | 'outsource' }[]> {
    const { data, error } = await this.supabase.client
      .from('lab_tests').select('code, default_routing').in('code', codes);
    if (error) {
      const msg = String(error?.message ?? '').toLowerCase();
      if ((error as any).code === '42703' || (msg.includes('default_routing') && msg.includes('does not exist'))) {
        return [];
      }
      throw error;
    }
    return ((data ?? []) as any[]).map((r) => ({
      code: r.code,
      default_routing: r.default_routing === 'outsource' ? 'outsource' : 'inhouse',
    }));
  }

  /** Look up each test's catalog default_routing, with per-code overrides applied. */
  private async resolveRoutings(
    codes: string[],
    overrides?: Map<string, 'inhouse' | 'outsource'>,
  ): Promise<('inhouse' | 'outsource')[]> {
    if (codes.length === 0) return [];
    const rows = await this.fetchTestRoutings(codes);
    const byCode = new Map<string, 'inhouse' | 'outsource'>();
    for (const r of rows) byCode.set(r.code, r.default_routing);
    return codes.map((c) => overrides?.get(c) ?? byCode.get(c) ?? 'inhouse');
  }

  /**
   * Walk recent invoices and push any that haven't been sent to /lab yet.
   * Dedup is based on `lab_orders.notes` (we tag every push with
   * "Pushed from invoice {invoice_number}"). Older than 30 days is skipped to
   * keep the work bounded. Per-invoice failures are swallowed — caller gets the
   * list of successful pushes only.
   */
  /** For a single invoice, look up the lab_orders created from it and return
   *  a map of various keys → routing. Keys include lowercased code, lowercased
   *  name, AND a token-set bag for fuzzy lookup. The detail view + PDF use this
   *  to render an "Inhouse / Outsource" badge next to each line. */
  async getInvoiceRouting(invoiceNumber: string): Promise<Map<string, 'inhouse' | 'outsource'>> {
    const result = new Map<string, 'inhouse' | 'outsource'>();
    const { data, error } = await this.supabase.client
      .from('lab_orders')
      .select('routing, results:lab_results(test:lab_test_id(code, name))')
      .like('notes', `Pushed from invoice ${invoiceNumber}%`);
    if (error) return result;
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length >= 2);
    for (const o of ((data ?? []) as any[])) {
      const routing = o.routing === 'outsource' ? 'outsource' : 'inhouse';
      for (const r of (o.results ?? [])) {
        if (r.test?.code) {
          result.set(r.test.code, routing);
          result.set(String(r.test.code).toLowerCase(), routing);
        }
        if (r.test?.name) {
          const nameLower = String(r.test.name).toLowerCase();
          result.set(nameLower, routing);
          // Store a sorted-token signature so reordered words still match.
          const sig = tokenize(nameLower).sort().join(' ');
          if (sig) result.set('TOKENS:' + sig, routing);
        }
      }
    }
    return result;
  }

  /** Returns the set of invoice numbers that already have a lab_order. Used by
   *  the /billing UI to render a "not in lab" badge on rows that didn't flow. */
  async listPushedInvoiceNumbers(): Promise<Set<string>> {
    const result = new Set<string>();
    const { data, error } = await this.supabase.client
      .from('lab_orders').select('notes').like('notes', 'Pushed from invoice%');
    if (error) return result;
    for (const o of ((data ?? []) as any[])) {
      const m = String(o.notes || '').match(/Pushed from invoice (\S+)/);
      if (m) result.add(m[1]);
    }
    return result;
  }

  async backfillLabPush(invoices: { id: string; invoice_number: string; invoice_date: string | null; status: string }[]):
    Promise<{ pushed: { invoiceNumber: string; codes: string[] }[]; skipped: { invoiceNumber: string; reason: string }[] }> {
    const { data: orders, error } = await this.supabase.client
      .from('lab_orders').select('notes').like('notes', 'Pushed from invoice%');
    if (error) {
      return { pushed: [], skipped: [] };
    }
    const already = new Set<string>();
    for (const o of (orders ?? []) as any[]) {
      const m = String(o.notes || '').match(/Pushed from invoice (\S+)/);
      if (m) already.add(m[1]);
    }
    const result: { invoiceNumber: string; codes: string[] }[] = [];
    const skipped: { invoiceNumber: string; reason: string }[] = [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const inv of invoices) {
      if (already.has(inv.invoice_number)) continue;
      if (inv.status === 'void' || inv.status === 'refunded') continue;
      const t = inv.invoice_date ? new Date(inv.invoice_date).getTime() : Date.now();
      if (!isNaN(t) && t < cutoff) continue;
      try {
        const r = await this.pushInvoiceToLab(inv.id);
        if (r.sent.length > 0) {
          result.push({ invoiceNumber: inv.invoice_number, codes: r.sent });
        } else if (r.reason && !r.reason.startsWith('SILENT:')) {
          // Skip 'SILENT' reasons — those are non-lab invoices (consultation,
          // pharmacy, etc.) that legitimately shouldn't flow to /lab.
          skipped.push({ invoiceNumber: inv.invoice_number, reason: r.reason });
        }
      } catch (e: any) {
        skipped.push({ invoiceNumber: inv.invoice_number, reason: e?.message ?? String(e) });
      }
    }
    return { pushed: result, skipped };
  }

  async recordPayment(input: {
    invoiceId: string;
    amountCents: number;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
  }) {
    const { error } = await this.supabase.client.rpc('record_payment', {
      p_invoice_id: input.invoiceId,
      p_amount_cents: input.amountCents,
      p_method: input.method,
      p_reference: input.reference ?? undefined,
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
  }

  /** Persist edits made on the Edit-invoice screen. Diffs `editedLines` against
   *  `originalItems` and routes each change through the Phase-3 RPCs
   *  (`bill_edit_item / bill_delete_item / bill_add_item`) — SECURITY DEFINER,
   *  audit-logged, and they call `recompute_invoice_totals` so subtotal / total /
   *  balance / status stay in sync without us recomputing client-side. Critically,
   *  this preserves auto-billed line provenance (`related_entity_type` +
   *  back-pointers from `doctor_visits` / `pharmacy_dispenses` / `lab_orders`)
   *  instead of destroying it via the old delete-then-reinsert pattern. */
  async updateInvoice(id: string, input: {
    items: DraftLine[];
    originalItems: InvoiceItem[];
    notes?: string;
  }): Promise<void> {
    const keptOrigIds = new Set(
      input.items.map(l => l._origItemId).filter((x): x is string => !!x),
    );

    for (const orig of input.originalItems) {
      if (keptOrigIds.has(orig.id)) continue;
      const { error } = await (this.supabase.client as any).rpc('bill_delete_item', {
        p_item_id: orig.id, p_reason: 'Removed via Edit invoice',
      });
      if (error) throw error;
    }

    for (const l of input.items) {
      if (l._origItemId) continue;
      const { error } = await (this.supabase.client as any).rpc('bill_add_item', {
        p_invoice_id: id,
        p_description: l.description,
        p_qty: l.qty,
        p_unit_price_cents: l.unit_price_cents,
        p_discount_cents: l.discount_cents,
        p_reason: 'Added via Edit invoice',
      });
      if (error) throw error;
    }

    for (const l of input.items) {
      if (!l._origItemId) continue;
      const orig = input.originalItems.find(o => o.id === l._origItemId);
      if (!orig) continue;
      const changed =
           Number(orig.qty) !== Number(l.qty)
        || Number(orig.unit_price_cents) !== Number(l.unit_price_cents)
        || Number(orig.discount_cents)   !== Number(l.discount_cents)
        || (orig.description ?? '')      !== (l.description ?? '');
      if (!changed) continue;
      const { error } = await (this.supabase.client as any).rpc('bill_edit_item', {
        p_item_id:          l._origItemId,
        p_description:      l.description,
        p_qty:              l.qty,
        p_unit_price_cents: l.unit_price_cents,
        p_discount_cents:   l.discount_cents,
        p_reason:           'Updated via Edit invoice',
      });
      if (error) throw error;
    }

    if (input.notes !== undefined) {
      const { error } = await this.supabase.client
        .from('invoices').update({ notes: input.notes ?? null }).eq('id', id);
      if (error) throw error;
    }
  }

  async voidInvoice(id: string, reason: string) {
    const { error } = await this.supabase.client.rpc('void_invoice', { p_invoice_id: id, p_reason: reason });
    if (error) throw error;
  }

  async voidPayment(id: string, reason: string) {
    const { error } = await this.supabase.client.rpc('void_payment', { p_payment_id: id, p_reason: reason });
    if (error) throw error;
  }

  subscribe(onChange: () => void): () => void {
    const ch = this.supabase.client
      .channel('billing-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' },      () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_items' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },      () => onChange())
      .subscribe();
    return () => { this.supabase.client.removeChannel(ch); };
  }
}
