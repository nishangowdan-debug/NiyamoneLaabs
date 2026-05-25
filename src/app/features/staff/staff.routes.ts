import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const staffRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('staff.read')],
    loadComponent: () =>
      import('./pages/staff-list.page').then((m) => m.StaffListPage),
  },
  {
    path: 'onboard',
    canActivate: [permissionGuard('staff.write')],
    loadComponent: () =>
      import('./pages/staff-onboard.page').then((m) => m.StaffOnboardPage),
    title: 'Onboard Staff \u00b7 Sree Diagnostics',
  },
  {
    path: ':id',
    canActivate: [permissionGuard('staff.read')],
    loadComponent: () =>
      import('./pages/staff-detail.page').then((m) => m.StaffDetailPage),
  },
];
