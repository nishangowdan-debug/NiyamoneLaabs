import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const employeeHealthRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/employee-health.page').then((m) => m.EmployeeHealthPage),
    canActivate: [permissionGuard('staff.read')],
    title: 'Employee Health · Sree Diagnostics',
  },
];
