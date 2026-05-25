import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const reportsRoutes: Routes = [
  // Approval history moved into Smart Inbox; deep-link to the History tab.
  // Returning a UrlTree (vs. plain string) ensures query params survive.
  {
    path: 'exceptions',
    pathMatch: 'full',
    redirectTo: () => inject(Router).parseUrl('/smart-inbox?tab=history'),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/reports.page').then((m) => m.ReportsPage),
    canActivate: [permissionGuard('reports.read')],
    title: 'Reports · Sree Diagnostics',
  },
];
