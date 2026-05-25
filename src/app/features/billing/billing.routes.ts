import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const billingRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/billing.page').then((m) => m.BillingPage),
    canActivate: [permissionGuard('billing.read')],
    title: 'Billing · Sree Diagnostics',
  },
];
