import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const financialReportsRoutes: Routes = [
  { path: '',              redirectTo: 'pl', pathMatch: 'full' },
  {
    path: 'pl',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/pl.page').then(m => m.ProfitLossPage),
  },
  {
    path: 'balance-sheet',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/balance-sheet.page').then(m => m.BalanceSheetPage),
  },
  {
    path: 'daybook',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/daybook.page').then(m => m.DaybookPage),
  },
  {
    path: 'gst',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/gst.page').then(m => m.GstPage),
  },
];
