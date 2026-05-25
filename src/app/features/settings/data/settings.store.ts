import { Injectable, computed, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import type { Branch, Permission, PermissionsByNamespace, Role, RolePermission, Service } from './settings.types';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private svc = inject(SettingsService);

  private readonly _branches = signal<Branch[]>([]);
  private readonly _selectedBranchId = signal<string | null>(null);
  private readonly _services = signal<Service[]>([]);
  private readonly _roles = signal<Role[]>([]);
  private readonly _permissions = signal<Permission[]>([]);
  private readonly _rolePermissions = signal<RolePermission[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly roles            = this._roles.asReadonly();
  readonly permissions      = this._permissions.asReadonly();
  readonly rolePermissions  = this._rolePermissions.asReadonly();
  readonly branches         = this._branches.asReadonly();
  readonly selectedBranchId = this._selectedBranchId.asReadonly();
  readonly services         = this._services.asReadonly();
  readonly loading          = this._loading.asReadonly();
  readonly error            = this._error.asReadonly();

  readonly selectedBranch = computed<Branch | null>(() => {
    const id = this._selectedBranchId();
    if (!id) return null;
    return this._branches().find((b) => b.id === id) ?? null;
  });

  readonly serviceTotals = computed(() => {
    const a = this._services();
    return {
      total: a.length,
      active: a.filter((s) => s.is_active).length,
      inactive: a.filter((s) => !s.is_active).length,
    };
  });

  /** Permissions grouped by namespace (the part before the dot in `slug`). */
  readonly permissionsByNamespace = computed<PermissionsByNamespace[]>(() => {
    const groups = new Map<string, Permission[]>();
    for (const p of this._permissions()) {
      const ns = p.slug.includes('.') ? p.slug.split('.', 1)[0] : 'general';
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns)!.push(p);
    }
    return Array.from(groups.entries())
      .map(([namespace, permissions]) => ({ namespace, permissions }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  });

  /** Quick lookup: does role X have permission Y? */
  readonly permissionLookup = computed(() => {
    const set = new Set<string>();
    for (const rp of this._rolePermissions()) {
      set.add(`${rp.role_slug}::${rp.permission_slug}`);
    }
    return set;
  });

  hasRolePermission(roleSlug: string, permSlug: string): boolean {
    return this.permissionLookup().has(`${roleSlug}::${permSlug}`);
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [branches, roles, permissions, rolePermissions] = await Promise.all([
        this.svc.listBranches(),
        this.svc.listRoles(),
        this.svc.listPermissions(),
        this.svc.listRolePermissions(),
      ]);
      this._branches.set(branches);
      this._roles.set(roles);
      this._permissions.set(permissions);
      this._rolePermissions.set(rolePermissions);
      // Default selection: caller's primary branch (whatever first row RLS returns) — fallback to none
      if (!this._selectedBranchId() && branches.length > 0) {
        this._selectedBranchId.set(branches[0].id);
      }
      if (this._selectedBranchId()) {
        this._services.set(await this.svc.listServices(this._selectedBranchId()!));
      }
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      this._loading.set(false);
    }
  }

  async refreshRolePermissions(): Promise<void> {
    this._rolePermissions.set(await this.svc.listRolePermissions());
  }

  async selectBranch(id: string): Promise<void> {
    this._selectedBranchId.set(id);
    try {
      this._services.set(await this.svc.listServices(id));
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Failed to load services');
    }
  }

  async refreshServices(): Promise<void> {
    const id = this._selectedBranchId();
    if (!id) return;
    this._services.set(await this.svc.listServices(id));
  }

  async refreshBranches(): Promise<void> {
    this._branches.set(await this.svc.listBranches());
  }
}
