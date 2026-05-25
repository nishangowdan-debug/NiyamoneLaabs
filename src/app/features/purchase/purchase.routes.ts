import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const purchaseRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/purchase.page').then((m) => m.PurchasePage),
    canActivate: [permissionGuard('purchase.read')],
    title: 'Purchase orders · Sree Diagnostics',
  },
];
