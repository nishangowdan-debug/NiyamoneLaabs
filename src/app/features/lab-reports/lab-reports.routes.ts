import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export const labReportsRoutes: Routes = [
  {
    path: '',
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin', 'doctor', 'lab_tech', 'accountant'] },
    loadComponent: () => import('./pages/lab-reports.page').then((m) => m.LabReportsPage),
    title: 'Reports · Sree Diagnostics',
  },
];
