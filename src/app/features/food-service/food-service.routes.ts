import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guards';

export const foodServiceRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/food-service.page').then((m) => m.FoodServicePage),
    title: 'Food Service · Sree Diagnostics',
  },
];
