import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const patientsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/patients-list.page').then((m) => m.PatientsListPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Patients · Sree Diagnostics',
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/patient-register.page').then((m) => m.PatientRegisterPage),
    canActivate: [permissionGuard('patients.write')],
    title: 'Register patient · Sree Diagnostics',
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/patient-detail.page').then((m) => m.PatientDetailPage),
    canActivate: [permissionGuard('patients.read')],
    title: 'Patient · Sree Diagnostics',
  },
];
