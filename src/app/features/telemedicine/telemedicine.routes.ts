import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const telemedicineRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/telemedicine.page').then((m) => m.TelemedicinePage),
    canActivate: [permissionGuard('appointments.read')],
    title: 'Telemedicine · Sree Diagnostics',
  },
];
