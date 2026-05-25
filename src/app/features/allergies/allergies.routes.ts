import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const allergiesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/allergies.page').then((m) => m.AllergiesPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Allergies & ADR · Sree Diagnostics',
  },
];
