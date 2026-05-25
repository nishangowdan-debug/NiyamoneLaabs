import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

export interface SavedSearch {
  id: string;
  staff_id: string;
  module: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class SavedSearchService {
  private supabase = inject(SupabaseService);

  // Use `any` cast because saved_searches is not yet in the generated supabase.types.ts
  // (run `supabase gen types` after applying phase-13-setup.sql to remove these casts)
  private get table() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase.client as any).from('saved_searches');
  }

  async list(module: string): Promise<SavedSearch[]> {
    const { data, error } = await this.table
      .select('*')
      .eq('module', module)
      .order('created_at', { ascending: true });
    if (error) {
      // Table may exist but the user has no rows / RLS denied — treat as empty.
      console.warn('[saved-search] list failed', error);
      return [];
    }
    return (data ?? []) as SavedSearch[];
  }

  async save(module: string, name: string, filters: Record<string, unknown>): Promise<SavedSearch> {
    const { data, error } = await this.table
      .insert({ module, name, filters })
      .select('*')
      .single();
    if (error) throw error;
    return data as SavedSearch;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.table.delete().eq('id', id);
    if (error) throw error;
  }
}
