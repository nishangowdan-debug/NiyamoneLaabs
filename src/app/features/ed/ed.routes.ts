import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const edRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/ed.page').then((m) => m.EdPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Emergency Department · Sree Diagnostics',
  },
];
