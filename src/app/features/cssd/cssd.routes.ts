import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const cssdRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/cssd.page').then((m) => m.CssdPage),
    canActivate: [permissionGuard('inventory.read')],
    title: 'CSSD · Sree Diagnostics',
  },
];
