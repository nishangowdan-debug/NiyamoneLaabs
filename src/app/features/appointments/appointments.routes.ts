import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const appointmentsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/appointments.page').then((m) => m.AppointmentsPage),
    canActivate: [permissionGuard('appointments.read')],
    title: 'Appointments · Sree Diagnostics',
  },
];
