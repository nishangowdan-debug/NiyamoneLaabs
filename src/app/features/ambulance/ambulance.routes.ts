import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const ambulanceRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('appointments.read')],
    loadComponent: () => import('./pages/ambulance.page').then(m => m.AmbulancePage),
  },
];
