import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const ipdBedsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/ipd-beds.page').then((m) => m.IpdBedsPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'IPD Beds · Sree Diagnostics',
  },
];
