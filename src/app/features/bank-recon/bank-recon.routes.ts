import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const bankReconRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/bank-recon.page').then(m => m.BankReconPage),
  },
];
