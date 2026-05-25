import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const dietaryRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dietary.page').then((m) => m.DietaryPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Dietary · Sree Diagnostics',
  },
];
