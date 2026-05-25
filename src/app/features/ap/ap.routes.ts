import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const apRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/ap.page').then((m) => m.ApPage),
    canActivate: [permissionGuard('ap.read')],
    title: 'Vendor bills · Sree Diagnostics',
  },
];
