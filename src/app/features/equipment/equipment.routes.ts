import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const equipmentRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/equipment.page').then((m) => m.EquipmentPage),
    canActivate: [permissionGuard('inventory.read')],
    title: 'Biomedical Equipment · Sree Diagnostics',
  },
];
