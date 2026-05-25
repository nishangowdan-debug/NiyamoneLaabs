import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const communicationsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/communications.page').then((m) => m.CommunicationsPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Communications · Sree Diagnostics',
  },
];
