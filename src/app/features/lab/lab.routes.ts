import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';
import { shiftQcGuard } from './lab.guards';

export const labRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/lab-workflow.page').then((m) => m.LabWorkflowPage),
    canActivate: [permissionGuard('lab.read'), shiftQcGuard],
    title: 'Lab Workflow · Sree Diagnostics',
  },
  {
    path: 'history',
    loadComponent: () => import('./pages/lab-history.page').then((m) => m.LabHistoryPage),
    canActivate: [permissionGuard('lab.read'), shiftQcGuard],
    title: 'Lab Reports History · Sree Diagnostics',
  },
  {
    path: 'qc',
    loadComponent: () => import('./pages/lab-qc-shell.page').then((m) => m.LabQcShellPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Lab QC · Sree Diagnostics',
  },
  {
    path: 'reference',
    loadComponent: () => import('./pages/reference-lab.page').then((m) => m.ReferenceLabPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Reference Lab · Sree Diagnostics',
  },
  {
    path: 'home-collection',
    loadComponent: () => import('../home-collection/pages/home-collection-list.page').then((m) => m.HomeCollectionListPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Home Collection · Sree Diagnostics',
  },
  {
    path: 'compliance',
    loadComponent: () => import('./pages/lab-compliance.page').then((m) => m.LabCompliancePage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Lab Compliance · Sree Diagnostics',
  },
  {
    path: 'report-settings',
    loadComponent: () => import('./pages/lab-report-settings.page').then((m) => m.LabReportSettingsPage),
    canActivate: [permissionGuard('lab.read')],
    title: 'Lab Report Settings · Sree Diagnostics',
  },
];
