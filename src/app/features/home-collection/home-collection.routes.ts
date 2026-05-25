import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export const homeCollectionRoutes: Routes = [
  {
    path: '',
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin', 'lab_tech', 'reception', 'nurse'] },
    loadComponent: () => import('./pages/home-collection-list.page').then((m) => m.HomeCollectionListPage),
    title: 'Home collection · Sree Diagnostics',
  },
  {
    path: 'new',
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin', 'lab_tech', 'reception', 'nurse'] },
    loadComponent: () => import('./pages/home-collection-create.page').then((m) => m.HomeCollectionCreatePage),
    title: 'New home collection · Sree Diagnostics',
  },
  {
    path: 'phlebotomists',
    canMatch: [roleGuard],
    data: { roles: ['super_admin', 'branch_admin'] },
    loadComponent: () => import('./pages/phlebotomists.page').then((m) => m.PhlebotomistsPage),
    title: 'Phlebotomists · Sree Diagnostics',
  },
];
