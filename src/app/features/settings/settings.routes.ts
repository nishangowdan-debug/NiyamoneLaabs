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
  // ── Settings pack (GST rates, HSN codes, letter templates, integrations) ──
  {
    path: 'gst-rates',
    loadComponent: () => import('./pages/gst-rates.page').then((m) => m.GstRatesPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'GST rates · Sree Diagnostics',
  },
  {
    path: 'hsn-codes',
    loadComponent: () => import('./pages/hsn-codes.page').then((m) => m.HsnCodesPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'HSN codes · Sree Diagnostics',
  },
  {
    path: 'letter-templates',
    loadComponent: () => import('./pages/letter-templates.page').then((m) => m.LetterTemplatesPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Letter templates · Sree Diagnostics',
  },
  {
    path: 'integrations',
    loadComponent: () => import('./pages/integrations.page').then((m) => m.IntegrationsPage),
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    title: 'Integrations · Sree Diagnostics',
  },
];
