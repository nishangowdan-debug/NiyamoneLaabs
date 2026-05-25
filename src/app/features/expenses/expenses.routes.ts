import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const expensesRoutes: Routes = [
  { path: '',           redirectTo: 'vouchers', pathMatch: 'full' },
  {
    path: 'vouchers',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/expenses.page').then(m => m.ExpensesPage),
  },
  {
    path: 'petty-cash',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/petty-cash.page').then(m => m.PettyCashPage),
  },
];
