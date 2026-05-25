import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const drugDisposalRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/drug-disposal.page').then((m) => m.DrugDisposalPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Drug Disposal · Sree Diagnostics',
  },
];
