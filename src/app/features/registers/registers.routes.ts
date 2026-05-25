import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const registersRoutes: Routes = [
  {
    path: '',
    canActivate: [permissionGuard('registers.read')],
    loadComponent: () =>
      import('./pages/registers-home.page').then((m) => m.RegistersHomePage),
    title: 'Registers · Sree Diagnostics',
  },
  {
    path: ':code/new',
    canActivate: [permissionGuard('registers.write')],
    loadComponent: () =>
      import('./pages/register-entry.page').then((m) => m.RegisterEntryPage),
    title: 'New register entry · Sree Diagnostics',
  },
  {
    path: ':code/:id',
    canActivate: [permissionGuard('registers.read')],
    loadComponent: () =>
      import('./pages/register-detail.page').then((m) => m.RegisterDetailPage),
    title: 'Register entry · Sree Diagnostics',
  },
  {
    path: ':code',
    canActivate: [permissionGuard('registers.read')],
    loadComponent: () =>
      import('./pages/register-list.page').then((m) => m.RegisterListPage),
    title: 'Register · Sree Diagnostics',
  },
];
