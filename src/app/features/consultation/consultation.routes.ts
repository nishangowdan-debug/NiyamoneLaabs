import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const consultationRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/opd-queue' },
  {
    path: ':appointmentId',
    loadComponent: () => import('./pages/consultation.page').then((m) => m.ConsultationPage),
    canActivate: [permissionGuard('ehr.write')],
    title: 'Consultation · Sree Diagnostics',
  },
];
