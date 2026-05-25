import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);

  signIn(email: string, password: string) {
    return this.supabase.client.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    // Best-effort: close any open lab shift session so the next login re-arms
    // the NABL QC gate. The RPC is a no-op for users without an open session.
    try { await (this.supabase.client as any).rpc('lab_close_shift_session'); }
    catch { /* swallow — never block logout on this */ }
    return this.supabase.client.auth.signOut();
  }

  forgotPassword(email: string, redirectTo: string) {
    return this.supabase.client.auth.resetPasswordForEmail(email, { redirectTo });
  }

  exchangeCodeForSession(code: string) {
    return this.supabase.client.auth.exchangeCodeForSession(code);
  }

  updatePassword(password: string) {
    return this.supabase.client.auth.updateUser({ password });
  }

  refreshSession() {
    return this.supabase.client.auth.refreshSession();
  }

  signInWithOAuth(provider: 'google' | 'azure') {
    return this.supabase.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/reset` },
    });
  }
}
