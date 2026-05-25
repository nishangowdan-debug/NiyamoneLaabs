import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const performanceRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/performance.page').then((m) => m.PerformancePage),
    canActivate: [permissionGuard('perf.read')],
    title: 'Performance Reviews · Sree Diagnostics',
  },
];
