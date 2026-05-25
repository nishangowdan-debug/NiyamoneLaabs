import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const grievancesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/grievances.page').then((m) => m.GrievancesPage),
    canActivate: [permissionGuard('grievances.write')],
    title: 'Grievances · Sree Diagnostics',
  },
];
