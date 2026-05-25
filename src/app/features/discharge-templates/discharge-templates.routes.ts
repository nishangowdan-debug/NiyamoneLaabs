import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const dischargeTemplatesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/discharge-templates.page').then((m) => m.DischargeTemplatesPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Discharge Templates · Sree Diagnostics',
  },
];
