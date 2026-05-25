import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guards';

export const authRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
    title: 'Sign in · Sree Diagnostics',
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password.page').then((m) => m.ForgotPasswordPage),
    title: 'Forgot password · Sree Diagnostics',
  },
  {
    path: 'reset',
    loadComponent: () => import('./pages/reset-password.page').then((m) => m.ResetPasswordPage),
    title: 'Reset password · Sree Diagnostics',
  },
  {
    path: 'update-password',
    loadComponent: () => import('./pages/update-password.page').then((m) => m.UpdatePasswordPage),
    canActivate: [authGuard],
    title: 'Update password · Sree Diagnostics',
  },
];
