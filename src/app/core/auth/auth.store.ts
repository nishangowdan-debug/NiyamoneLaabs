import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { EMPTY_CLAIMS, JwtClaims, Permission, RoleSlug } from './auth.types';

function decodeJwt(token: string | undefined | null): JwtClaims {
  if (!token) return EMPTY_CLAIMS;
  try {
    const payload = token.split('.')[1];
    if (!payload) return EMPTY_CLAIMS;
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as Partial<JwtClaims> & {
      email?: string; sub?: string; exp?: number;
      app_metadata?: Partial<JwtClaims> & Record<string, unknown>;
      user_metadata?: Partial<JwtClaims> & Record<string, unknown>;
    };
    // Custom-access-token hooks put claims at the JWT root, but Supabase also
    // copies raw_app_meta_data → app_metadata on every token. Fall back to
    // app_metadata (then user_metadata) so users without an active hook still
    // get their role/branch claims.
    const amd = json.app_metadata ?? {};
    const umd = json.user_metadata ?? {};
    const pick = <T,>(key: string): T | undefined =>
      ((json as any)[key] ?? (amd as any)[key] ?? (umd as any)[key]) as T | undefined;
    return {
      user_role: (pick<string>('user_role') ?? 'none') as RoleSlug,
      staff_id:  pick<string>('staff_id')   ?? null,
      patient_id: pick<string>('patient_id') ?? null,
      branch_id:  pick<string>('branch_id')  ?? null,
      branch_ids: (pick<string[]>('branch_ids') ?? []) as string[],
      permissions: (pick<Permission[]>('permissions') ?? []) as Permission[],
      email: json.email,
      sub: json.sub,
      exp: json.exp,
    };
  } catch {
    return EMPTY_CLAIMS;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private supabase = inject(SupabaseService);

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);

  readonly session = this._session.asReadonly();
  readonly ready = this._ready.asReadonly();

  readonly user = computed(() => this._session()?.user ?? null);
  readonly claims = computed<JwtClaims>(() =>
    decodeJwt(this._session()?.access_token),
  );

  readonly role = computed<RoleSlug>(() => this.claims().user_role);
  readonly staffId = computed(() => this.claims().staff_id);
  readonly patientId = computed(() => this.claims().patient_id);
  readonly branchIds = computed(() => this.claims().branch_ids);
  readonly permissions = computed(() => this.claims().permissions);
  readonly isAuthed = computed(() => !!this._session());
  readonly isActive = computed(() => this.role() !== 'none');

  has(permission: Permission): boolean {
    // Super-admins and branch admins implicitly have every permission.
    const r = this.role();
    if (r === 'super_admin' || r === 'branch_admin') return true;
    return this.permissions().includes(permission);
  }

  hasRole(...roles: RoleSlug[]): boolean {
    return roles.includes(this.role());
  }

  /** Synchronously clear the session signal so `isAuthed()` becomes false
   *  immediately — used by timeout/sign-out flows to avoid the race between
   *  the Supabase `onAuthStateChange` callback and the router navigation. */
  clearSession(): void {
    this._session.set(null);
  }

  async init(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    this._session.set(data.session);
    this._ready.set(true);

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
    });
  }
}
