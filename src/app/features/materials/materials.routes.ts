import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const materialsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/materials.page').then((m) => m.MaterialsPage),
    canActivate: [permissionGuard('materials.read')],
    title: 'Material inward · Sree Diagnostics',
  },
];
