import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { CredentialType, ExpiringCredential, StaffCredential } from './credentials.types';

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private supabase = inject(SupabaseService);
  private get db() { return this.supabase.client as any; }

  async listMine(staffId: string): Promise<StaffCredential[]> {
    const { data, error } = await this.db.from('v_staff_credentials').select('*')
      .eq('staff_id', staffId).order('expires_on', { ascending: true, nullsFirst: false }).limit(500);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as StaffCredential[];
  }

  async listAll(): Promise<StaffCredential[]> {
    const { data, error } = await this.db.from('v_staff_credentials').select('*')
      .order('expires_on', { ascending: true, nullsFirst: false }).limit(2000);
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as StaffCredential[];
  }

  async upsert(input: {
    id?: string | null;
    staffId?: string | null;
    type: CredentialType;
    name: string;
    issuer?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    documentUrl?: string | null;
    notes?: string | null;
    isMandatory?: boolean;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('staff_credential_upsert', {
      p_id: input.id ?? null,
      p_staff_id: input.staffId ?? null,
      p_type: input.type,
      p_name: input.name,
      p_issuer: input.issuer ?? null,
      p_issued_on: input.issuedOn ?? null,
      p_expires_on: input.expiresOn ?? null,
      p_document_url: input.documentUrl ?? null,
      p_notes: input.notes ?? null,
      p_is_mandatory: input.isMandatory ?? false,
    });
    if (error) throw new Error(error.message ?? 'Failed');
    return data as string;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.rpc('staff_credential_delete', { p_id: id });
    if (error) throw new Error(error.message ?? 'Failed');
  }

  async expiring(windowDays = 90): Promise<ExpiringCredential[]> {
    const { data, error } = await this.db.rpc('credentials_expiring', { p_window_days: windowDays });
    if (error) throw new Error(error.message ?? 'Failed');
    return (data ?? []) as ExpiringCredential[];
  }
}
