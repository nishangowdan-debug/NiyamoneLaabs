import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const fixedAssetsRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('ap.write')],
    loadComponent: () => import('./pages/fixed-assets.page').then(m => m.FixedAssetsPage),
  },
];
