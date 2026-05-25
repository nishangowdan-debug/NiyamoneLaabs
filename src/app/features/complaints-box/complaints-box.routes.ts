import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const complaintsBoxRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/complaints-box.page').then((m) => m.ComplaintsBoxPage),
    canActivate: [permissionGuard('complaints_box.write')],
    title: 'Complaints Box · Sree Diagnostics',
  },
];
