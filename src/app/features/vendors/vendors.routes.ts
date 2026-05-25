import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const vendorsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/vendors.page').then((m) => m.VendorsPage),
    canActivate: [permissionGuard('vendors.read')],
    title: 'Vendors · Sree Diagnostics',
  },
];
