import { Routes } from '@angular/router';

export const smartInboxRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./smart-inbox.page').then((m) => m.SmartInboxPage),
  },
];
