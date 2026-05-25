import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const pathwaysRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/pathways.page').then((m) => m.PathwaysPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Clinical Pathways · Sree Diagnostics',
  },
];
