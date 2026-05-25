import type { Routes } from '@angular/router';

export const departmentsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/departments.page').then(m => m.DepartmentsPage),
  },
];
