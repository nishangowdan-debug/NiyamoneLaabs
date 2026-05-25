import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const identityRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/identity.page').then((m) => m.IdentityPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Patient Identity · Sree Diagnostics',
  },
];
