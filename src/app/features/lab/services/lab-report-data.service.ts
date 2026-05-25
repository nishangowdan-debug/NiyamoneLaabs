import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import {
  HospitalSettingsService,
  type HospitalSettings,
  type InstructionSection,
  DEFAULT_INSTRUCTIONS,
} from '../../pharmacy/services/hospital-settings.service';

/** One parameter row (CBC → Hb, RBC, WBC ...) attached to a test definition. */
export interface ReportParameter {
  id: string;
  sno: number;
  is_section_header: boolean;
  section: string | null;
  parameter: string;
  unit: string | null;
  low_value: number | null;
  high_value: number | null;
  normal_range_display: string | null;
  method: string | null;
  font: { family?: string; size?: number; weight?: string; italic?: boolean; color?: string } | null;
  ref_overrides: Array<{ scope: string; low?: number | null; high?: number | null; display?: string | null }>;
  // Patient-entered value for this parameter, joined in by fetch().
  value: {
    value_numeric: number | null;
    value_text: string | null;
    flag: string | null;
    notes: string | null;
  } | null;
}

export interface ReportResult {
  test: {
    id?: string;
    code: string; name: string; category: string | null;
    unit: string | null; ref_min: number | null; ref_max: number | null;
    critical_low: number | null; critical_high: number | null;
    is_radiology?: boolean | null;
    method?: string | null;
    specimen_type?: string | null;
    clinical_significance?: string | null;
    patient_instructions?: InstructionSection[] | null;
    pre_test_preparation?: string | null;
    infographic?: any;
  };
  status: string;
  flag: string | null;
  value_numeric: number | null;
  value_text: string | null;
  notes: string | null;
  /** Catalog-defined parameter rows (CBC → Hb, RBC, WBC ...) merged with the
   *  technician-entered per-parameter values for this result. Empty when the
   *  test's catalog has no parameters — caller falls back to the flat row. */
  parameters?: ReportParameter[];
}

export interface ReportBundle {
  order: {
    id: string;
    ordered_at: string;
    collected_at: string | null;
    reported_at: string | null;
    sample_id: string | null;
    source: 'opd' | 'ipd';
    notes: string | null;
    branch_id: string;
    verification_token?: string;
    public_token?: string | null;
  };
  patient: {
    full_name: string | null;
    first_name: string;
    last_name: string;
    uhid: string;
    date_of_birth: string;
    gender: string;
    mobile: string;
  };
  doctor: { full_name: string; signature_data_url?: string | null } | null;
  verifier: { full_name: string; signature_data_url?: string | null; signature_role?: string | null; metadata?: any } | null;
  technician: { full_name: string; signature_data_url?: string | null } | null;
  results: ReportResult[];
  settings: HospitalSettings;
  /** Resolved patient instructions (test → catalog → branch fallback). */
  instructions: InstructionSection[];
}

@Injectable({ providedIn: 'root' })
export class LabReportDataService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthStore);
  private settingsSvc = inject(HospitalSettingsService);

  async fetch(orderId: string): Promise<ReportBundle> {
    const { data, error } = await (this.supabase.client as any)
      .from('lab_orders')
      .select(`
        id, branch_id, source, notes, ordered_at, collected_at, reported_at, sample_id, verification_token, public_token,
        patient:patient_id(full_name, first_name, last_name, uhid, date_of_birth, gender, mobile),
        doctor:ordering_doctor_staff_id(full_name, signature_data_url),
        verifier:reported_by_staff_id(full_name, signature_data_url, metadata),
        results:lab_results(id, status, flag, value_numeric, value_text, notes,
          entered_by:entered_by_staff_id(full_name, signature_data_url),
          test:lab_test_id(id, code, name, category, unit, ref_min, ref_max, critical_low, critical_high,
            specimen_type, method, clinical_significance, patient_instructions, pre_test_preparation, infographic, is_radiology))
      `)
      .eq('id', orderId)
      .single();
    if (error) throw error;

    const branchId = (this.auth.claims().branch_id as string) || data.branch_id || '';
    const settings = await this.settingsSvc.loadSettings(branchId);

    const technician =
      (data.results ?? [])
        .map((r: any) => r.entered_by)
        .find((s: any) => s?.full_name) ?? null;

    const sortedResults: ReportResult[] = (data.results ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const ca = (a.test?.category ?? '').localeCompare(b.test?.category ?? '');
        if (ca !== 0) return ca;
        return (a.test?.name ?? '').localeCompare(b.test?.name ?? '');
      })
      .map((r: any) => ({
        ...r,
        test: r.test ?? {},
      }));

    // Attach parameter definitions + patient values per result. Best-effort:
    // if the parameter tables are missing (old DB), each result keeps an empty
    // `parameters` array and the renderer falls back to the flat-row layout.
    await this.attachParameters(sortedResults);

    const instructions = await this.resolveInstructions(branchId, sortedResults, settings);

    return {
      order: {
        id:           data.id,
        source:       data.source,
        notes:        data.notes,
        ordered_at:   data.ordered_at,
        collected_at: data.collected_at,
        reported_at:  data.reported_at ?? new Date().toISOString(),
        sample_id:    data.sample_id,
        branch_id:    data.branch_id,
        verification_token: data.verification_token,
        public_token: data.public_token,
      },
      patient: data.patient,
      doctor: data.doctor,
      verifier: data.verifier,
      technician,
      results: sortedResults,
      settings,
      instructions,
    };
  }

  /**
   * Resolve instructions with cascade priority:
   *   1. Test-level patient_instructions (union of all tests that define them)
   *   2. Catalog (per-category) general_instructions for categories in this order
   *   3. Branch hospital_settings.general_instructions
   *   4. DEFAULT_INSTRUCTIONS fallback
   */
  private async resolveInstructions(
    branchId: string,
    results: ReportResult[],
    settings: HospitalSettings,
  ): Promise<InstructionSection[]> {
    // 1. Test-level
    const perTest: InstructionSection[] = [];
    for (const r of results) {
      const ti = r.test?.patient_instructions;
      if (Array.isArray(ti) && ti.length) perTest.push(...ti);
    }
    if (perTest.length) return this.mergeUnique(perTest);

    // 2. Catalog-level
    const categories = Array.from(
      new Set(results.map((r) => r.test?.category).filter((c): c is string => !!c)),
    );
    if (categories.length) {
      try {
        const { data } = await (this.supabase.client as any)
          .from('lab_test_catalog_settings')
          .select('category, general_instructions')
          .eq('branch_id', branchId)
          .in('category', categories);
        const merged: InstructionSection[] = [];
        for (const row of data ?? []) {
          if (Array.isArray(row.general_instructions)) merged.push(...row.general_instructions);
        }
        if (merged.length) return this.mergeUnique(merged);
      } catch {
        /* table may not exist yet — fall through */
      }
    }

    // 3. Branch
    if (Array.isArray(settings.general_instructions) && settings.general_instructions.length) {
      return settings.general_instructions;
    }
    // 4. Built-in defaults
    return DEFAULT_INSTRUCTIONS;
  }

  /**
   * For each result, load the parameter rows defined on its test plus the
   * patient's per-parameter values. Mutates `results` in place. Failures are
   * swallowed so older DBs without the parameter tables still render.
   */
  private async attachParameters(results: ReportResult[]): Promise<void> {
    const testIds = Array.from(new Set(
      results.map((r) => r.test?.id).filter((x): x is string => !!x),
    ));
    const resultIds = results.map((r: any) => r.id).filter((x): x is string => !!x);
    if (testIds.length === 0) return;

    // 1. Parameters per test (catalog)
    let paramsByTest = new Map<string, any[]>();
    try {
      const { data: params } = await (this.supabase.client as any)
        .from('lab_test_parameters')
        .select('*')
        .in('lab_test_id', testIds)
        .order('sno', { ascending: true });
      for (const p of params ?? []) {
        const arr = paramsByTest.get(p.lab_test_id) ?? [];
        arr.push(p);
        paramsByTest.set(p.lab_test_id, arr);
      }
    } catch { return; /* table missing — fall back to flat */ }

    // 2. Values per (result, parameter)
    let valuesByKey = new Map<string, any>();
    if (resultIds.length > 0) {
      try {
        const { data: vals } = await (this.supabase.client as any)
          .from('lab_result_values')
          .select('*')
          .in('lab_result_id', resultIds);
        for (const v of vals ?? []) {
          valuesByKey.set(`${v.lab_result_id}:${v.lab_test_parameter_id}`, v);
        }
      } catch { /* keep going — parameters render with empty values */ }
    }

    // 3. Stitch into each result
    for (const r of results as any[]) {
      const testId = r.test?.id;
      const params = (testId && paramsByTest.get(testId)) ?? [];
      r.parameters = params.map((p: any) => ({
        id: p.id,
        sno: p.sno,
        is_section_header: !!p.is_section_header,
        section: p.section ?? null,
        parameter: p.parameter ?? '',
        unit: p.unit ?? null,
        low_value: p.low_value ?? null,
        high_value: p.high_value ?? null,
        normal_range_display: p.normal_range_display ?? null,
        method: p.method ?? null,
        font: (p.font && typeof p.font === 'object') ? p.font : null,
        ref_overrides: Array.isArray(p.ref_overrides) ? p.ref_overrides : [],
        value: (() => {
          const v = valuesByKey.get(`${r.id}:${p.id}`);
          if (!v) return null;
          return {
            value_numeric: v.value_numeric ?? null,
            value_text: v.value_text ?? null,
            flag: v.flag ?? null,
            notes: v.notes ?? null,
          };
        })(),
      }));
    }
  }

  private mergeUnique(sections: InstructionSection[]): InstructionSection[] {
    const seen = new Map<string, InstructionSection>();
    for (const s of sections) {
      if (!s?.title) continue;
      const key = s.title.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.set(key, { title: s.title, bullets: [...(s.bullets ?? [])] });
      } else {
        const cur = seen.get(key)!;
        for (const b of s.bullets ?? []) {
          if (!cur.bullets.includes(b)) cur.bullets.push(b);
        }
      }
    }
    return Array.from(seen.values());
  }
}
