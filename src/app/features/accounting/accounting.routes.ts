import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const accountingRoutes: Routes = [
  { path: '',              redirectTo: 'trial-balance', pathMatch: 'full' },
  {
    path: 'coa',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/coa.page').then(m => m.CoaPage),
  },
  {
    path: 'journals',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/journals.page').then(m => m.JournalsPage),
  },
  {
    path: 'trial-balance',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/trial-balance.page').then(m => m.TrialBalancePage),
  },
  {
    path: 'period-close',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/period-close.page').then(m => m.PeriodClosePage),
  },
];
