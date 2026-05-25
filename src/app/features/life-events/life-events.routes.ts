import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const lifeEventsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/life-events.page').then((m) => m.LifeEventsPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Birth & Death Registration · Sree Diagnostics',
  },
];
