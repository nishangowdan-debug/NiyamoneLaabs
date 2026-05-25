import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const engagementRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/engagement.page').then((m) => m.EngagementPage),
    canActivate: [permissionGuard('engagement.read')],
    title: 'Engagement · Sree Diagnostics',
  },
];
