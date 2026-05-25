import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guards';

export const conciergeRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/concierge.page').then((m) => m.ConciergePage),
    title: 'Concierge \u00b7 Sree Diagnostics',
  },
];
