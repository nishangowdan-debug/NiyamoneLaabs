import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const opdQueueRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/opd-queue.page').then((m) => m.OpdQueuePage),
    canActivate: [permissionGuard('appointments.read')],
    title: 'OPD Queue · Sree Diagnostics',
  },
  {
    path: 'tv',
    loadComponent: () => import('./pages/opd-queue-tv.page').then((m) => m.OpdQueueTvPage),
    title: 'OPD Queue Display · Sree Diagnostics',
  },
  {
    path: 'triage/:id',
    loadComponent: () => import('./pages/triage-station.page').then((m) => m.TriageStationPage),
    canActivate: [permissionGuard('appointments.read')],
    title: 'Triage Station · Sree Diagnostics',
  },
];
