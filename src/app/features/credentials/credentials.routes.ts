import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const credentialsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/credentials.page').then((m) => m.CredentialsPage),
    canActivate: [permissionGuard('credentials.read')],
    title: 'Credentials & Training · Sree Diagnostics',
  },
];
