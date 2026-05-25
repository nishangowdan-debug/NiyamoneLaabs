import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

export const pharmacyRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/pharmacy-queue.page').then((m) => m.PharmacyQueuePage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy queue · Sree Diagnostics',
  },
  {
    path: 'pos',
    loadComponent: () => import('./pages/pharmacy-pos.page').then((m) => m.PharmacyPosPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy POS · Sree Diagnostics',
  },
  {
    path: 'catalog',
    loadComponent: () => import('./pages/pharmacy-catalog.page').then((m) => m.PharmacyCatalogPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy catalog · Sree Diagnostics',
  },
  {
    path: 'stock',
    loadComponent: () => import('./pages/pharmacy-stock.page').then((m) => m.PharmacyStockPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy Stock · Sree Diagnostics',
  },
  {
    path: 'history',
    loadComponent: () => import('./pages/pharmacy-billing-history.page').then((m) => m.PharmacyBillingHistoryPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy Billing History · Sree Diagnostics',
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/pharmacy-settings.page').then((m) => m.PharmacySettingsPage),
    canActivate: [permissionGuard('pharmacy.read')],
    title: 'Pharmacy Settings · Sree Diagnostics',
  },
];
