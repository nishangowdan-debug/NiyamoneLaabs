import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const qualityRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/quality.page').then(m => m.QualityPage),
  },
];
