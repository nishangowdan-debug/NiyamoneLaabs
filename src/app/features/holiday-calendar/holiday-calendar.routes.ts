import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const holidayCalendarRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/holiday-calendar.page').then((m) => m.HolidayCalendarPage),
    canActivate: [permissionGuard('holidays.read')],
    title: 'Holiday Calendar · Sree Diagnostics',
  },
];
