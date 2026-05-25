import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const inventoryRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/inventory.page').then((m) => m.InventoryPage),
    canActivate: [permissionGuard('inventory.read')],
    title: 'Inventory · Sree Diagnostics',
  },
];
