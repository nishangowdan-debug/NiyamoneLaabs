import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const labQcRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/lab-qc.page').then((m) => m.LabQcPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Lab QC & Compliance · Sree Diagnostics',
  },
];
