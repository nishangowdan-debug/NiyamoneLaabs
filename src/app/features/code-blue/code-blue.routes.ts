import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const codeBlueRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/code-blue.page').then((m) => m.CodeBluePage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Code Blue & DNR · Sree Diagnostics',
  },
];
