import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const riskRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/risk.page').then((m) => m.RiskPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Risk Assessments · Sree Diagnostics',
  },
];
