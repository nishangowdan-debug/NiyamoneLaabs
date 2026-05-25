import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage),
    title: 'Dashboard · Sree Diagnostics',
  },
  {
    path: 'security',
    loadComponent: () =>
      import('../auth/pages/update-password.page').then((m) => m.UpdatePasswordPage),
    title: 'Account security · Sree Diagnostics',
  },
];
