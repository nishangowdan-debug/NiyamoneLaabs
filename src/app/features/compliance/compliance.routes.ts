import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const complianceRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('reports.read')],
    loadComponent: () => import('./pages/compliance.page').then(m => m.CompliancePage),
  },
];
