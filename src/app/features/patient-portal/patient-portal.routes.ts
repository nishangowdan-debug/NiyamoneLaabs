import { Routes } from '@angular/router';

export const patientPortalRoutes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/portal-dashboard.page').then((m) => m.PortalDashboardPage),
  },
  {
    path: 'appointments',
    loadComponent: () =>
      import('./pages/portal-appointments.page').then((m) => m.PortalAppointmentsPage),
  },
  {
    path: 'prescriptions',
    loadComponent: () =>
      import('./pages/portal-prescriptions.page').then((m) => m.PortalPrescriptionsPage),
  },
  {
    path: 'lab-results',
    loadComponent: () =>
      import('./pages/portal-lab-results.page').then((m) => m.PortalLabResultsPage),
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./pages/portal-invoices.page').then((m) => m.PortalInvoicesPage),
  },
];
