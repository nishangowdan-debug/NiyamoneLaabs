import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { ComplianceLicence, ComplianceSummary } from './compliance.types';

const BUCKET = 'compliance';

export type DocSlot = 'applied_copy' | 'acknowledgment' | 'licence' | 'notice_board_photo';

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private supabase = inject(SupabaseService);

  async list(): Promise<ComplianceLicence[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('compliance_licences')
      .select('*')
      .order('valid_until', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ComplianceLicence[];
  }

  async upsert(input: Omit<Partial<ComplianceLicence>, 'id'> & { id?: string | null }): Promise<string> {
    const { data, error } = await (this.supabase.client as any).rpc('upsert_compliance_licence', {
      p_id:                      input.id ?? null,
      p_name:                    input.name,
      p_license_number:          input.license_number ?? null,
      p_category:                input.category ?? 'registration',
      p_issuing_authority:       input.issuing_authority ?? null,
      p_issued_on:               input.issued_on ?? null,
      p_valid_from:              input.valid_from ?? null,
      p_valid_until:             input.valid_until ?? null,
      p_status:                  input.status ?? 'active',
      p_notes:                   input.notes ?? null,
      p_applied_copy_path:       input.applied_copy_path ?? null,
      p_acknowledgment_path:     input.acknowledgment_path ?? null,
      p_licence_path:            input.licence_path ?? null,
      p_notice_board_photo_path: input.notice_board_photo_path ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async remove(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc('delete_compliance_licence', { p_id: id });
    if (error) throw error;
  }

  async summary(): Promise<ComplianceSummary> {
    const { data, error } = await (this.supabase.client as any).rpc('compliance_summary');
    if (error) throw error;
    return data as ComplianceSummary;
  }

  // ── File handling via Supabase Storage ─────────────────────────────
  /**
   * Uploads `file` to compliance/<branchId>/<licenceId>/<slot>.<ext>
   * Returns the storage path.
   */
  async uploadDoc(branchId: string, licenceId: string, slot: DocSlot, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${branchId}/${licenceId}/${slot}-${Date.now()}.${ext}`;
    const { error } = await this.supabase.client.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return path;
  }

  /** Time-limited URL to display/download a private file. */
  async signedUrl(path: string, expiresInSec = 3600): Promise<string | null> {
    const { data, error } = await this.supabase.client.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  async removeDoc(path: string): Promise<void> {
    await this.supabase.client.storage.from(BUCKET).remove([path]);
  }
}
