import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const payrollRoutes: Routes = [
  { path: '',          redirectTo: 'salary', pathMatch: 'full' },
  {
    path: 'salary',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/payroll.page').then(m => m.PayrollPage),
  },
  {
    path: 'doctors',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/doctor-payouts.page').then(m => m.DoctorPayoutsPage),
  },
];
