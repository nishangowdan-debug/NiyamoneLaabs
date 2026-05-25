import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const linenRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/linen.page').then((m) => m.LinenPage),
    canActivate: [permissionGuard('inventory.read')],
    title: 'Linen & Laundry · Sree Diagnostics',
  },
];
