import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const dischargeBillingRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('billing.write')],
    loadComponent: () =>
      import('./pages/discharge-billing.page').then((m) => m.DischargeBillingPage),
  },
  {
    path: 'edit/:admissionId',
    canActivate: [permissionGuard('billing.write')],
    loadComponent: () =>
      import('./pages/discharge-summary-form.page').then((m) => m.DischargeSummaryFormPage),
  },
  {
    path: 'print/:admissionId',
    canActivate: [permissionGuard('billing.read')],
    loadComponent: () =>
      import('./pages/discharge-print.page').then((m) => m.DischargePrintPage),
  },
];
