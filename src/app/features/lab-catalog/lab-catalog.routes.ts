import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export const labCatalogRoutes: Routes = [
  {
    path: '',
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin', 'lab_tech'] },
    loadComponent: () => import('./pages/lab-catalog.page').then((m) => m.LabCatalogPage),
    title: 'Lab test catalog · Sree Diagnostics',
  },
];
