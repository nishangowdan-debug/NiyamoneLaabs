import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const feedbackRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/feedback.page').then((m) => m.FeedbackPage),
    canActivate: [permissionGuard('ehr.read')],
    title: 'Feedback & Complaints · Sree Diagnostics',
  },
];
