import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const hrPoliciesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/hr-policies.page').then((m) => m.HrPoliciesPage),
    canActivate: [permissionGuard('hr_policies.read')],
    title: 'HR Policies · Sree Diagnostics',
  },
];
