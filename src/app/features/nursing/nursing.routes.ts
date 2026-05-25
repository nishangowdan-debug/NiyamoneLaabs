import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const nursingRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('ehr.write')],
    loadComponent: () => import('./pages/nursing.page').then(m => m.NursingPage),
  },
];
