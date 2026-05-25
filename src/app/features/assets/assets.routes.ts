import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guards';

export const assetsRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/assets.page').then((m) => m.AssetsPage),
    title: 'Assets & Movement \u00b7 Sree Diagnostics',
  },
];
