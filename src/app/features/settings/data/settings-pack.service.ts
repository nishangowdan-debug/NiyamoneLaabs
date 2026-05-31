import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/** Single CRUD service backing the 4 new settings tabs:
 *  GST rates · HSN codes · Letter templates · Integrations (Meta).
 *
 *  Kept thin: every method is a direct table call. RLS on the server
 *  handles access (super_admin / branch_admin gated for writes; reads
 *  open to authenticated). */

// ── GST rates ────────────────────────────────────────────────────────
export interface GstRate {
  id?: string;
  name: string;
  rate_percent: number;
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
  is_default: boolean;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ── HSN codes ────────────────────────────────────────────────────────
export interface HsnCode {
  id?: string;
  code: string;
  description: string;
  category?: string | null;
  default_gst_rate_id?: string | null;
  is_active: boolean;
  created_at?: string;
  // joined
  gst_rate?: GstRate | null;
}

// ── Letter templates ─────────────────────────────────────────────────
export interface LetterTemplate {
  id?: string;
  code: string;
  name: string;
  category: 'consent' | 'referral' | 'certificate' | 'notice' | string;
  branch_id?: string | null;
  body_html: string;
  header_html?: string | null;
  footer_html?: string | null;
  variables: string[];
  default_signatory_role?: string | null;
  is_active: boolean;
  current_version?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LetterTemplateVersion {
  id: string;
  template_id: string;
  version_no: number;
  body_html: string;
  header_html?: string | null;
  footer_html?: string | null;
  variables: string[];
  archived_at: string;
  archived_by?: string | null;
}

// ── Meta lead config (stored in system_settings) ─────────────────────
export interface MetaLeadConfig {
  verify_token: string;
  field_map: Record<string, string>;
  auto_assign_branch_id?: string | null;
  active: boolean;
}

// ── Signatory (read from v_signatories) ──────────────────────────────
export interface Signatory {
  id: string;
  full_name: string;
  email: string;
  role_slug: string;
  signature_role: string | null;
  signature_data_url: string;
  primary_branch_id: string | null;
  branch_code?: string | null;
  branch_name?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SettingsPackService {
  private readonly db = inject(SupabaseService).client;

  // ── GST rates ──────────────────────────────────────────────────────
  async listGstRates(): Promise<GstRate[]> {
    const { data, error } = await this.db
      .from('gst_rates')
      .select('*')
      .order('rate_percent', { ascending: true });
    if (error) throw error;
    return (data ?? []) as GstRate[];
  }

  async upsertGstRate(rate: Partial<GstRate>): Promise<GstRate> {
    const { data, error } = await (this.db as any)
      .from('gst_rates')
      .upsert(rate)
      .select('*')
      .single();
    if (error) throw error;
    return data as GstRate;
  }

  async deleteGstRate(id: string): Promise<void> {
    const { error } = await this.db.from('gst_rates').delete().eq('id', id);
    if (error) throw error;
  }

  // ── HSN codes ──────────────────────────────────────────────────────
  async listHsnCodes(search = ''): Promise<HsnCode[]> {
    let q = (this.db as any)
      .from('hsn_codes')
      .select('*, gst_rate:default_gst_rate_id(id, name, rate_percent)')
      .order('code', { ascending: true });
    if (search.trim()) {
      const t = search.trim();
      q = q.or(`code.ilike.%${t}%,description.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HsnCode[];
  }

  async upsertHsnCode(c: Partial<HsnCode>): Promise<HsnCode> {
    const { gst_rate: _drop, ...row } = c as any;
    const { data, error } = await (this.db as any)
      .from('hsn_codes')
      .upsert(row)
      .select('*, gst_rate:default_gst_rate_id(id, name, rate_percent)')
      .single();
    if (error) throw error;
    return data as HsnCode;
  }

  async deleteHsnCode(id: string): Promise<void> {
    const { error } = await this.db.from('hsn_codes').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Letter templates ───────────────────────────────────────────────
  async listLetterTemplates(): Promise<LetterTemplate[]> {
    const { data, error } = await this.db
      .from('letter_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LetterTemplate[];
  }

  async getLetterTemplate(id: string): Promise<LetterTemplate | null> {
    const { data, error } = await this.db
      .from('letter_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as LetterTemplate;
  }

  async upsertLetterTemplate(t: Partial<LetterTemplate>): Promise<LetterTemplate> {
    const { current_version: _v, ...row } = t as any;  // trigger handles versioning
    const { data, error } = await (this.db as any)
      .from('letter_templates')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data as LetterTemplate;
  }

  async listTemplateVersions(templateId: string): Promise<LetterTemplateVersion[]> {
    const { data, error } = await this.db
      .from('letter_template_versions')
      .select('*')
      .eq('template_id', templateId)
      .order('version_no', { ascending: false });
    if (error) throw error;
    return (data ?? []) as LetterTemplateVersion[];
  }

  // ── Signatories ────────────────────────────────────────────────────
  async listSignatories(branchId?: string | null): Promise<Signatory[]> {
    let q = this.db.from('v_signatories').select('*');
    if (branchId) q = q.eq('primary_branch_id', branchId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Signatory[];
  }

  // ── System settings (Meta config + company info) ───────────────────
  async getSetting<T = any>(key: string): Promise<T | null> {
    // Table isn't in supabase.types.ts yet — cast through any so the
    // generic .from chain doesn't collapse to `never`.
    const { data, error } = await (this.db as any)
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return (data?.value ?? null) as T | null;
  }

  async setSetting(key: string, value: any): Promise<void> {
    const { error } = await (this.db as any)
      .from('system_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async getMetaConfig(): Promise<MetaLeadConfig> {
    const v = await this.getSetting<MetaLeadConfig>('meta_lead_config');
    return v ?? { verify_token: '', field_map: {}, auto_assign_branch_id: null, active: false };
  }
  async setMetaConfig(c: MetaLeadConfig): Promise<void> {
    await this.setSetting('meta_lead_config', c);
  }

  // ── Meta summary view ──────────────────────────────────────────────
  async metaLeadSummary(): Promise<Array<{ day: string; received: number; verified: number; mapped: number; failed: number }>> {
    const { data, error } = await this.db
      .from('v_meta_leads_summary')
      .select('*')
      .limit(14);
    if (error) throw error;
    return (data ?? []) as any;
  }

  async listLeads(limit = 200): Promise<any[]> {
    const { data, error } = await this.db
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}
