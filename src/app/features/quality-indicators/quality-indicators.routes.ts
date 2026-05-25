import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const qualityIndicatorsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/quality-indicators.page').then((m) => m.QualityIndicatorsPage),
    canActivate: [permissionGuard('reports.read')],
    title: 'Quality Indicators · Sree Diagnostics',
  },
];
