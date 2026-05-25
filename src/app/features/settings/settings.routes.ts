import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export const settingsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Settings · Sree Diagnostics',
  },
  {
    path: 'print',
    loadComponent: () => import('./pages/print-settings.page').then((m) => m.PrintSettingsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Print Settings · Sree Diagnostics',
  },
  {
    path: 'phlebotomists',
    loadComponent: () => import('../home-collection/pages/phlebotomists.page').then((m) => m.PhlebotomistsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Phlebotomists · Sree Diagnostics',
  },
];
