import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const exitManagementRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/exit-management.page').then((m) => m.ExitManagementPage),
    canActivate: [permissionGuard('exit.read')],
    title: 'Exit Management · Sree Diagnostics',
  },
];
