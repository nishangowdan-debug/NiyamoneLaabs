import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const cashierRoutes: Routes = [
  { path: '',         redirectTo: 'shift', pathMatch: 'full' },
  {
    path: 'shift',
    canActivate: [permissionGuard('billing.write')],
    loadComponent: () => import('./pages/cashier-shift.page').then(m => m.CashierShiftPage),
  },
  {
    path: 'handover',
    canActivate: [permissionGuard('billing.write')],
    loadComponent: () => import('./pages/cash-handover.page').then(m => m.CashHandoverPage),
  },
];
