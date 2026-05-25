import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const dnRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dn.page').then((m) => m.DnPage),
    canActivate: [permissionGuard('ap.read')],
    title: 'Debit notes · Sree Diagnostics',
  },
];
