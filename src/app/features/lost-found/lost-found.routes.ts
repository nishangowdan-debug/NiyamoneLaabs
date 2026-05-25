import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const lostFoundRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/lost-found.page').then((m) => m.LostFoundPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Lost & Found · Sree Diagnostics',
  },
];
