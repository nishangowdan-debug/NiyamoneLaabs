import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const hrRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'staff' },

  {
    path: 'staff',
    canActivate: [permissionGuard('staff.read')],
    loadComponent: () =>
      import('../staff/pages/staff-list.page').then((m) => m.StaffListPage),
    title: 'HR · Staff · Sree Diagnostics',
  },
  {
    path: 'staff/onboard',
    canActivate: [permissionGuard('staff.write')],
    loadComponent: () =>
      import('../staff/pages/staff-onboard.page').then((m) => m.StaffOnboardPage),
    title: 'HR · Onboard Staff · Sree Diagnostics',
  },
  {
    path: 'staff/:id',
    canActivate: [permissionGuard('staff.read')],
    loadComponent: () =>
      import('../staff/pages/staff-detail.page').then((m) => m.StaffDetailPage),
    title: 'HR · Staff Detail · Sree Diagnostics',
  },

  {
    path: 'attendance',
    loadComponent: () =>
      import('../attendance/pages/attendance.page').then((m) => m.AttendancePage),
    title: 'HR · Attendance · Sree Diagnostics',
  },
  {
    path: 'attendance/leave',
    loadComponent: () =>
      import('../attendance/pages/leave-management.page').then((m) => m.LeaveManagementPage),
    title: 'HR · Leave & Shifts · Sree Diagnostics',
  },

  {
    path: 'roles',
    loadComponent: () =>
      import('./pages/roles.page').then((m) => m.RolesPage),
    title: 'HR · Roles · Sree Diagnostics',
  },
];
