import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const infectionControlRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/infection-control.page').then((m) => m.InfectionControlPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Infection Control · Sree Diagnostics',
  },
];
