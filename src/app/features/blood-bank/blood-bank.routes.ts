import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const bloodBankRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/blood-bank.page').then((m) => m.BloodBankPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Blood Bank · Sree Diagnostics',
  },
];
