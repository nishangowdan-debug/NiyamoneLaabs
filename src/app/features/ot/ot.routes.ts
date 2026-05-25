import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const otRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/ot.page').then((m) => m.OtPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Operating Theatre · Sree Diagnostics',
  },
];
