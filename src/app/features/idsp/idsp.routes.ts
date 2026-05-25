import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const idspRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/idsp.page').then((m) => m.IdspPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Disease Notifications · Sree Diagnostics',
  },
];
