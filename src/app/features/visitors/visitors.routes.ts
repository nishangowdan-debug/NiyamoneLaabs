import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const visitorsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/visitors.page').then((m) => m.VisitorsPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Visitors · Sree Diagnostics',
  },
];
