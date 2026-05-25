import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import type { Database } from './supabase.types';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    },
  );
}
