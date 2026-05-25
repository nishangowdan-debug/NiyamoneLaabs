import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const controlledDrugsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/controlled-drugs.page').then((m) => m.ControlledDrugsPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Controlled Drugs · Sree Diagnostics',
  },
];
