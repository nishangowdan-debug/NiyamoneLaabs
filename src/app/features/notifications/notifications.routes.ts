import { Routes } from '@angular/router';

export const notificationsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/notifications.page').then((m) => m.NotificationsPage),
    title: 'Notifications · Sree Diagnostics',
  },
];
