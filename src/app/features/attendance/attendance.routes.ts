import type { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const attendanceRoutes: Routes = [
  {
    // Attendance page lets every staff member check themselves in,
    // so we gate by holidays.read (granted to every internal role)
    // rather than the stricter staff.read which is HR-only.
    path: '',
    canActivate: [permissionGuard('holidays.read')],
    loadComponent: () => import('./pages/attendance.page').then(m => m.AttendancePage),
  },
  {
    path: 'leave',
    canActivate: [permissionGuard('holidays.read')],
    loadComponent: () => import('./pages/leave-management.page').then(m => m.LeaveManagementPage),
    title: 'Leave & Shifts \u00b7 Sree Diagnostics',
  },
];
