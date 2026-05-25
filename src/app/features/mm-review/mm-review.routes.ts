import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const mmReviewRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/mm-review.page').then((m) => m.MmReviewPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'M&M Review · Sree Diagnostics',
  },
];
