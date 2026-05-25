import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const pacRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/pac.page').then((m) => m.PacPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Pre-Anaesthesia Evaluation · Sree Diagnostics',
  },
];
