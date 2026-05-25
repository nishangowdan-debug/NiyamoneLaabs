import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  LabTest, LabTestPrice, LabTestWithPrice, LabTestForm,
  LabTestParameter, ParameterDraft, RefOverride, RefScope,
} from './lab-catalog.types';

/** Demographic input used to resolve which cohort-specific range applies. */
export interface PatientCohort {
  /** ISO date string. Used to derive pediatric vs adult. */
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | string | null;
  /** Pregnancy status at the time of the test. */
  is_pregnant?: boolean | null;
  /** 1 | 2 | 3 — pregnancy trimester at the time of the test. */
  pregnancy_trimester?: 1 | 2 | 3 | null;
}

/** Resolved range used by the result-entry / flagging code. */
export interface ResolvedRange {
  low: number | null;
  high: number | null;
  display: string | null;
  /** Which override matched, or 'fallback' if we used the row's scalar low/high. */
  source: RefScope | 'fallback';
}

function yearsBetween(iso: string, now = new Date()): number {
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return Number.POSITIVE_INFINITY;
  let yrs = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) yrs--;
  return yrs;
}

/** Pick the most specific RefOverride that matches the cohort. Order:
 *    1. Pregnancy trimester (T1/T2/T3) if the patient is currently pregnant
 *    2. Sex (male / female)
 *    3. Pediatric (<12) → Pediatric → Adult
 *  Falls back to the row's scalar `low_value` / `high_value` when no override
 *  matches. The "Display" string is preferred over `low – high` so the printed
 *  report uses the lab's own phrasing.
 */
export function resolveRange(p: LabTestParameter | ParameterDraft, cohort: PatientCohort): ResolvedRange {
  const overrides = (p.ref_overrides ?? []) as RefOverride[];
  const fallback: ResolvedRange = {
    low: p.low_value ?? null,
    high: p.high_value ?? null,
    display: p.normal_range_display ?? null,
    source: 'fallback',
  };

  // Build ordered preference list for this cohort.
  const wantedScopes: RefScope[] = [];
  if (cohort.is_pregnant && cohort.pregnancy_trimester) {
    wantedScopes.push(`pregnancy_t${cohort.pregnancy_trimester}` as RefScope);
  }
  if (cohort.gender === 'male' || cohort.gender === 'female') {
    wantedScopes.push(cohort.gender as RefScope);
  }
  if (cohort.date_of_birth) {
    const yrs = yearsBetween(cohort.date_of_birth);
    if (yrs < 12) wantedScopes.push('pediatric_under_12', 'pediatric');
    else          wantedScopes.push('adult');
  } else {
    wantedScopes.push('adult');
  }

  for (const want of wantedScopes) {
    const hit = overrides.find(o => o.scope === want);
    if (hit) {
      return {
        low: hit.low ?? null,
        high: hit.high ?? null,
        display: (hit.display ?? '').trim() || fallback.display,
        source: hit.scope as RefScope,
      };
    }
  }
  return fallback;
}

/** Classify a numeric value against the resolved range. Returns null when the
 *  value is missing or both bounds are missing (i.e. nothing to compare). */
export function classifyValue(value: number | null | undefined, range: ResolvedRange): 'low' | 'normal' | 'high' | null {
  if (value == null || Number.isNaN(value)) return null;
  if (range.low == null && range.high == null) return null;
  if (range.low != null && value < Number(range.low))   return 'low';
  if (range.high != null && value > Number(range.high)) return 'high';
  return 'normal';
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const msg = (e as any)?.message ?? (e as any)?.error_description ?? String(e);
  return new Error(msg);
}

/**
 * Detect "table doesn't exist on this database" from a Supabase / PostgREST error.
 * Covers all the phrasings we've seen across versions:
 *  - PostgREST PGRST205: "Could not find the table 'public.X' in the schema cache"
 *  - Postgres 42P01:     "relation 'X' does not exist"
 *  - HTTP 404 responses
 */
function isMissingTable(err: any): boolean {
  if (!err) return false;
  const code = String(err.code ?? '').toUpperCase();
  if (code === 'PGRST205' || code === '42P01') return true;
  const msg = String(err.message ?? err.details ?? '').toLowerCase();
  return /relation .* does not exist/.test(msg)
      || /could not find the table/.test(msg)
      || /schema cache/.test(msg)
      || msg.includes('404');
}

@Injectable({ providedIn: 'root' })
export class LabCatalogService {
  private supabase = inject(SupabaseService);

  async list(branchId: string | null, search = ''): Promise<LabTestWithPrice[]> {
    let q = this.supabase.client
      .from('lab_tests')
      .select('*')
      .order('name', { ascending: true });
    if (search.trim()) {
      const t = search.trim();
      q = q.or(`name.ilike.%${t}%,code.ilike.%${t}%`);
    }
    const { data: tests, error } = await q;
    if (error) throw toError(error);

    const ids = (tests ?? []).map((t) => t.id);
    let priceMap = new Map<string, LabTestPrice>();
    // Only join lab_test_prices when a specific branch is active.
    // For super_admin "All hospitals" view (branchId = null), show tests
    // without per-branch prices rather than blank the whole table.
    if (branchId && ids.length > 0) {
      const { data: prices, error: pErr } = await (this.supabase.client as any)
        .from('lab_test_prices')
        .select('*')
        .eq('branch_id', branchId)
        .in('lab_test_id', ids);
      if (pErr) {
        if (isMissingTable(pErr)) {
          console.warn('[lab-catalog] lab_test_prices missing — run migration 20260515_lab_settings.sql to see per-branch prices.');
        } else {
          throw toError(pErr);
        }
      } else {
        priceMap = new Map((prices ?? []).map((p: LabTestPrice) => [p.lab_test_id, p]));
      }
    }

    // Per-test parameter row counts. Done as one extra query (rather than a
    // groupBy RPC) so it gracefully degrades when the parameters table hasn't
    // been migrated yet — we just return parameter_count = 0 in that case.
    const countByTestId = new Map<string, number>();
    if (ids.length > 0) {
      const { data: paramRows, error: paramErr } = await (this.supabase.client as any)
        .from('lab_test_parameters')
        .select('lab_test_id')
        .in('lab_test_id', ids);
      if (paramErr) {
        if (!isMissingTable(paramErr)) {
          console.warn('[lab-catalog] could not load parameter counts:', paramErr.message);
        }
      } else {
        for (const row of (paramRows ?? []) as Array<{ lab_test_id: string }>) {
          countByTestId.set(row.lab_test_id, (countByTestId.get(row.lab_test_id) ?? 0) + 1);
        }
      }
    }

    return (tests ?? []).map((t: LabTest) => ({
      ...t,
      price: priceMap.get(t.id) ?? null,
      parameter_count: countByTestId.get(t.id) ?? 0,
    }));
  }

  async upsertTest(form: LabTestForm, branchId: string | null, existingId?: string | null): Promise<string> {
    const testPatch = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category,
      specimen_type: form.specimen_type,
      unit: form.unit?.trim() || null,
      ref_min: form.ref_min,
      ref_max: form.ref_max,
      critical_low: form.critical_low,
      critical_high: form.critical_high,
      turnaround_hours: form.turnaround_hours,
      is_active: form.is_active,
      default_routing: form.default_routing ?? 'inhouse',
    };

    let testId = existingId ?? null;
    if (testId) {
      const { error } = await (this.supabase.client as any)
        .from('lab_tests')
        .update(testPatch)
        .eq('id', testId);
      if (error) throw toError(error);
    } else {
      // Upsert by code (was raising "duplicate key" when adding a test whose code
      // already existed). With onConflict the user can re-save edits to an existing
      // test from the "+ Add test" dialog without it failing.
      const { data, error } = await (this.supabase.client as any)
        .from('lab_tests')
        .upsert(testPatch, { onConflict: 'code' })
        .select('id')
        .maybeSingle();
      if (error) throw toError(error);
      testId = data?.id ?? null;
      // Older PG versions may not return the row from upsert; fall back to lookup
      if (!testId) {
        const { data: existing } = await (this.supabase.client as any)
          .from('lab_tests').select('id').eq('code', testPatch.code).maybeSingle();
        testId = existing?.id ?? null;
      }
    }

    if (!testId) throw new Error('Could not save test');

    // Price + home-eligibility require the lab_test_prices table to exist. If
    // the migration hasn't been run yet, the test itself is saved but pricing is
    // skipped with a clear console warning instead of failing the whole save.
    if (branchId) {
      const { error: pErr } = await (this.supabase.client as any)
        .from('lab_test_prices')
        .upsert({
          branch_id: branchId,
          lab_test_id: testId,
          price_inr: form.price_inr,
          home_collection_eligible: form.home_collection_eligible,
          home_collection_surcharge_inr: form.home_collection_surcharge_inr,
          is_active: form.is_active,
        }, { onConflict: 'branch_id,lab_test_id' });
      if (pErr) {
        // The test row is already saved. If the prices table is simply missing
        // from this DB, swallow the error and warn — don't fail the whole save.
        if (isMissingTable(pErr)) {
          console.warn('[lab-catalog] lab_test_prices missing — run migration 20260515_lab_settings.sql to enable per-branch prices.');
        } else {
          throw toError(pErr);
        }
      }
    }

    return testId;
  }

  /** Soft-delete: mark inactive so historical orders keep working. */
  async deactivate(testId: string, branchId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('lab_test_prices')
      .update({ is_active: false })
      .eq('lab_test_id', testId)
      .eq('branch_id', branchId);
    if (error) throw toError(error);
  }

  async reactivate(testId: string, branchId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('lab_test_prices')
      .update({ is_active: true })
      .eq('lab_test_id', testId)
      .eq('branch_id', branchId);
    if (error) throw toError(error);
  }

  /**
   * One-click seed: inserts a starter lab catalog using ONLY the columns the
   * Supabase JS client confirms exist (everything else is left to defaults).
   * This is more robust than a hand-written SQL because the JS client adapts
   * to the live schema.
   */
  async seedStarterCatalog(branchId: string | null): Promise<{ tests: number; prices: number; errors: string[] }> {
    const errors: string[] = [];
    const STARTER: Array<{
      code: string; name: string; category: string; specimen_type: string;
      unit: string | null; ref_min: number | null; ref_max: number | null;
      turnaround_hours: number; price_inr: number; home_eligible: boolean;
    }> = [
      { code: 'CBC',       name: 'Complete Blood Count',        category: 'haematology',   specimen_type: 'blood',  unit: 'cells/mcL', ref_min: null, ref_max: null, turnaround_hours: 4,  price_inr: 300,  home_eligible: true },
      { code: 'HB',        name: 'Haemoglobin',                 category: 'haematology',   specimen_type: 'blood',  unit: 'g/dL',      ref_min: 12,   ref_max: 17,   turnaround_hours: 2,  price_inr: 150,  home_eligible: true },
      { code: 'ESR',       name: 'Erythrocyte Sedimentation Rate', category: 'haematology', specimen_type: 'blood', unit: 'mm/hr',    ref_min: 0,    ref_max: 20,   turnaround_hours: 4,  price_inr: 200,  home_eligible: true },
      { code: 'FBS',       name: 'Fasting Blood Sugar',         category: 'biochemistry',  specimen_type: 'serum',  unit: 'mg/dL',     ref_min: 70,   ref_max: 100,  turnaround_hours: 2,  price_inr: 100,  home_eligible: true },
      { code: 'PPBS',      name: 'Post-prandial Blood Sugar',   category: 'biochemistry',  specimen_type: 'serum',  unit: 'mg/dL',     ref_min: 100,  ref_max: 140,  turnaround_hours: 2,  price_inr: 100,  home_eligible: true },
      { code: 'HBA1C',     name: 'HbA1c (Glycated Haemoglobin)', category: 'biochemistry', specimen_type: 'blood',  unit: '%',         ref_min: 4,    ref_max: 5.7,  turnaround_hours: 24, price_inr: 500,  home_eligible: true },
      { code: 'LFT',       name: 'Liver Function Test (panel)', category: 'biochemistry',  specimen_type: 'serum',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 6,  price_inr: 600,  home_eligible: true },
      { code: 'RFT',       name: 'Renal Function Test (panel)', category: 'biochemistry',  specimen_type: 'serum',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 6,  price_inr: 600,  home_eligible: true },
      { code: 'LIPID',     name: 'Lipid Profile',               category: 'biochemistry',  specimen_type: 'serum',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 6,  price_inr: 500,  home_eligible: true },
      { code: 'TSH',       name: 'Thyroid Stimulating Hormone', category: 'endocrinology', specimen_type: 'serum',  unit: 'mIU/L',     ref_min: 0.4,  ref_max: 4.5,  turnaround_hours: 6,  price_inr: 300,  home_eligible: true },
      { code: 'T3T4',      name: 'Total T3 / T4',               category: 'endocrinology', specimen_type: 'serum',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 6,  price_inr: 400,  home_eligible: true },
      { code: 'VITD',      name: 'Vitamin D (25-OH)',           category: 'endocrinology', specimen_type: 'serum',  unit: 'ng/mL',     ref_min: 30,   ref_max: 100,  turnaround_hours: 24, price_inr: 1400, home_eligible: true },
      { code: 'VITB12',    name: 'Vitamin B12',                 category: 'endocrinology', specimen_type: 'serum',  unit: 'pg/mL',     ref_min: 200,  ref_max: 900,  turnaround_hours: 24, price_inr: 850,  home_eligible: true },
      { code: 'URINE-RM',  name: 'Urine Routine & Microscopy',  category: 'urinalysis',    specimen_type: 'urine',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 4,  price_inr: 120,  home_eligible: true },
      { code: 'CRP',       name: 'C-Reactive Protein',          category: 'biochemistry',  specimen_type: 'serum',  unit: 'mg/L',      ref_min: 0,    ref_max: 5,    turnaround_hours: 6,  price_inr: 400,  home_eligible: true },
      { code: 'DENGUE-NS1',name: 'Dengue NS1 Antigen',          category: 'immunology',    specimen_type: 'serum',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 4,  price_inr: 500,  home_eligible: true },
      { code: 'MALARIA',   name: 'Malaria Antigen (RDT)',       category: 'immunology',    specimen_type: 'blood',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 2,  price_inr: 200,  home_eligible: true },
      { code: 'BLOOD-GRP', name: 'Blood Group & Rh Typing',     category: 'haematology',   specimen_type: 'blood',  unit: null,        ref_min: null, ref_max: null, turnaround_hours: 2,  price_inr: 150,  home_eligible: true },
      { code: 'COVID-RAT', name: 'COVID-19 Rapid Antigen Test', category: 'immunology',    specimen_type: 'swab',   unit: null,        ref_min: null, ref_max: null, turnaround_hours: 1,  price_inr: 300,  home_eligible: true },
      { code: 'XRAY-CHEST',name: 'X-ray Chest PA',              category: 'imaging',       specimen_type: 'imaging',unit: null,        ref_min: null, ref_max: null, turnaround_hours: 1,  price_inr: 300,  home_eligible: false },
      { code: 'USG-ABD',   name: 'USG Abdomen',                 category: 'imaging',       specimen_type: 'imaging',unit: null,        ref_min: null, ref_max: null, turnaround_hours: 1,  price_inr: 800,  home_eligible: false },
      { code: 'ECG',       name: 'ECG (12-lead)',               category: 'imaging',       specimen_type: 'imaging',unit: null,        ref_min: null, ref_max: null, turnaround_hours: 1,  price_inr: 250,  home_eligible: false },
    ];

    let testsInserted = 0;
    let pricesInserted = 0;

    // 1. Upsert each test by code (the JS client adapts to the live schema)
    for (const t of STARTER) {
      const payload: Record<string, any> = {
        code: t.code, name: t.name, category: t.category, specimen_type: t.specimen_type,
        unit: t.unit, ref_min: t.ref_min, ref_max: t.ref_max,
        turnaround_hours: t.turnaround_hours, is_active: true,
      };
      const { data, error } = await (this.supabase.client as any)
        .from('lab_tests')
        .upsert(payload, { onConflict: 'code', ignoreDuplicates: false })
        .select('id, code')
        .maybeSingle();
      if (error) {
        errors.push(`${t.code}: ${error.message}`);
        continue;
      }
      if (data) testsInserted++;
    }

    // 2. If a branch is selected, upsert lab_test_prices for that branch
    if (branchId) {
      const { data: allTests, error: lErr } = await (this.supabase.client as any)
        .from('lab_tests')
        .select('id, code')
        .in('code', STARTER.map((s) => s.code));
      if (lErr) {
        errors.push(`load tests for pricing: ${lErr.message}`);
      } else {
        const byCode = new Map<string, string>(
          ((allTests ?? []) as any[]).map((r) => [r.code, r.id]),
        );
        const priceRows = STARTER
          .map((t) => {
            const id = byCode.get(t.code);
            if (!id) return null;
            return {
              branch_id: branchId, lab_test_id: id,
              price_inr: t.price_inr,
              home_collection_eligible: t.home_eligible,
              home_collection_surcharge_inr: t.home_eligible ? 150 : 0,
              is_active: true,
            };
          })
          .filter(Boolean);
        if (priceRows.length > 0) {
          const { error: pErr } = await (this.supabase.client as any)
            .from('lab_test_prices')
            .upsert(priceRows, { onConflict: 'branch_id,lab_test_id' });
          if (pErr) errors.push(`prices upsert: ${pErr.message}`);
          else pricesInserted = priceRows.length;
        }
      }
    }

    return { tests: testsInserted, prices: pricesInserted, errors };
  }

  // ── Per-test parameter rows (CBC → Hb, RBC, WBC …) ─────────────────

  /** All parameter rows for one test, ordered by display sequence. */
  async listParameters(testId: string): Promise<LabTestParameter[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_test_parameters')
      .select('*')
      .eq('lab_test_id', testId)
      .order('sno', { ascending: true });
    if (error) {
      if (isMissingTable(error)) {
        console.warn('[lab-catalog] lab_test_parameters missing — run migration 20260524_lab_test_parameters.sql.');
        return [];
      }
      throw toError(error);
    }
    return (data ?? []).map((r: any) => this.normalizeParameter(r));
  }

  /** Clone every parameter row (incl. section headers + cohort `ref_overrides`)
   *  from a source test onto a target test. Existing rows on the target are
   *  REPLACED — the editor's contract is "the latest save wins". */
  async copyParameters(fromTestId: string, toTestId: string): Promise<{ rows: number }> {
    const rows = await this.listParameters(fromTestId);
    if (rows.length === 0) return { rows: 0 };
    const drafts: ParameterDraft[] = rows.map((r) => ({
      id: null,
      sno: r.sno,
      is_section_header: r.is_section_header,
      section: r.section,
      parameter: r.parameter,
      default_value: r.default_value,
      unit: r.unit,
      low_value: r.low_value,
      high_value: r.high_value,
      normal_range_display: r.normal_range_display,
      method: r.method,
      font: { ...(r.font ?? {}) },
      ref_overrides: (r.ref_overrides ?? []).map((o) => ({ ...o })),
    }));
    await this.replaceParameters(toTestId, drafts);
    return { rows: drafts.length };
  }

  /** Replace the entire parameter set for a test in one transaction (atomic).
   *  Re-sequences `sno` server-side so the array order in the editor wins. */
  async replaceParameters(testId: string, drafts: ParameterDraft[]): Promise<void> {
    const payload = drafts.map((d, i) => ({
      id:                    d.id ?? null,
      sno:                   i + 1,
      is_section_header:     !!d.is_section_header,
      section:               d.section ?? null,
      parameter:             d.parameter ?? '',
      default_value:         d.default_value ?? null,
      unit:                  d.unit ?? null,
      low_value:             d.low_value ?? null,
      high_value:            d.high_value ?? null,
      normal_range_display:  d.normal_range_display ?? null,
      method:                d.method ?? null,
      font:                  d.font ?? {},
      ref_overrides:         d.ref_overrides ?? [],
    }));
    const { error } = await (this.supabase.client as any).rpc(
      'lab_replace_test_parameters',
      { p_test_id: testId, p_params: payload },
    );
    if (error) throw toError(error);
  }

  private normalizeParameter(row: any): LabTestParameter {
    return {
      id: row.id,
      lab_test_id: row.lab_test_id,
      sno: row.sno,
      is_section_header: !!row.is_section_header,
      section: row.section ?? null,
      parameter: row.parameter ?? '',
      default_value: row.default_value ?? null,
      unit: row.unit ?? null,
      low_value: row.low_value ?? null,
      high_value: row.high_value ?? null,
      normal_range_display: row.normal_range_display ?? null,
      method: row.method ?? null,
      font: (row.font && typeof row.font === 'object') ? row.font : {},
      ref_overrides: Array.isArray(row.ref_overrides) ? row.ref_overrides : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
