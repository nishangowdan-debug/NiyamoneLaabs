import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const insuranceAuthRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/insurance-auth.page').then((m) => m.InsuranceAuthPage),
    canActivate: [permissionGuard('billing.read')],
    title: 'Insurance Authorization · Sree Diagnostics',
  },
];
