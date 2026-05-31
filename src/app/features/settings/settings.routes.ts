import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export const settingsRoutes: Routes = [
  // New 8-tab settings hub (Company info / Letterhead / Letter templates /
  // Integrations / GST rates / HSN-SAC / Categories / Users & roles)
  {
    path: '',
    loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Settings · Sree Diagnostics',
  },
  // Legacy 5-tab page (Lab profile / Roles & permissions / Digital signatures
  // / Demo data) — preserved so the older logo / RLS-permissions / signature
  // upload / demo seeding flows stay reachable while we migrate equivalents
  // into the new hub.
  {
    path: 'legacy',
    loadComponent: () => import('./pages/legacy-settings.page').then((m) => m.LegacySettingsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Legacy settings · Sree Diagnostics',
  },
  // /settings/print is now a tab in the main hub; keep the URL working as a
  // redirect so old sidebar links / bookmarks land on the right tab.
  {
    path: 'print',
    redirectTo: '/settings?tab=print-branding',
    pathMatch: 'full',
  },
  {
    path: 'phlebotomists',
    loadComponent: () => import('../home-collection/pages/phlebotomists.page').then((m) => m.PhlebotomistsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Phlebotomists · Sree Diagnostics',
  },
];
