import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const disciplinaryRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/disciplinary.page').then((m) => m.DisciplinaryPage),
    canActivate: [permissionGuard('disciplinary.read')],
    title: 'Disciplinary Actions · Sree Diagnostics',
  },
];
