import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const stewardshipRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/stewardship.page').then((m) => m.StewardshipPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Antibiotic Stewardship · Sree Diagnostics',
  },
];
