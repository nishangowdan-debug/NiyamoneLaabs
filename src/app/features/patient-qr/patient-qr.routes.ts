import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guards';

export const patientQrRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/qr-manage.page').then((m) => m.QrManagePage),
    title: 'Patient QR · Sree Diagnostics',
  },
  {
    path: 'request',
    loadComponent: () => import('./pages/qr-request.page').then((m) => m.QrRequestPage),
    title: 'Service Request · Sree Diagnostics',
  },
];
