import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { authGuard, redirectIfAuthedGuard, roleGuard } from './core/auth/auth.guards';
import { AuthStore } from './core/auth/auth.store';

export const routes: Routes = [
  {
    path: 'auth',
    canMatch: [redirectIfAuthedGuard],
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },

  // ── Patient portal — separate layout, role-gated ─────────────
  {
    path: 'patient-portal',
    canActivate: [authGuard],
    canMatch: [roleGuard],
    data: { roles: ['patient'] },
    loadComponent: () =>
      import('./layouts/patient-portal-layout/patient-portal-layout').then(
        (m) => m.PatientPortalLayout,
      ),
    loadChildren: () =>
      import('./features/patient-portal/patient-portal.routes').then(
        (m) => m.patientPortalRoutes,
      ),
  },

  // ── Public patient QR request (no auth) ─────────────────────
  {
    path: 'patient-qr/request',
    loadComponent: () =>
      import('./features/patient-qr/pages/qr-request.page').then((m) => m.QrRequestPage),
    title: 'Service Request · Sree Diagnostics',
  },

  // ── Public lobby waiting screen (no auth) ────────────────────
  {
    path: 'wait/:branchCode',
    loadComponent: () =>
      import('./features/public-wait/pages/waiting-screen.page').then((m) => m.WaitingScreenPage),
    title: 'Waiting · Sree Diagnostics',
  },

  // ── Public lab-report verification (no auth, anonymous) ──────
  {
    path: 'lab/verify/:token',
    loadComponent: () =>
      import('./features/public-lab-verify/pages/lab-verify.page').then((m) => m.LabVerifyPage),
    title: 'Verify lab report · Sree Diagnostics',
  },

  // ── Public patient-facing views (WhatsApp click-to-chat targets) ─
  {
    path: 'public/invoice/:token',
    loadComponent: () =>
      import('./features/public/pages/public-invoice.page').then((m) => m.PublicInvoicePage),
    title: 'Invoice · Sree Diagnostics',
  },
  {
    path: 'public/lab-report/:token',
    loadComponent: () =>
      import('./features/public/pages/public-lab-report.page').then((m) => m.PublicLabReportPage),
    title: 'Lab report · Sree Diagnostics',
  },

  // ── Staff app layout ─────────────────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    // Redirect patients away from the staff layout
    canMatch: [() => {
      const auth = inject(AuthStore);
      const router = inject(Router);
      if (auth.hasRole('patient')) return router.createUrlTree(['/patient-portal']);
      return true;
    }],
    loadComponent: () =>
      import('./layouts/app-layout/app-layout').then((m) => m.AppLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
      },
      {
        path: 'patients',
        loadChildren: () =>
          import('./features/patients/patients.routes').then((m) => m.patientsRoutes),
      },
      {
        path: 'pharmacy',
        loadChildren: () =>
          import('./features/pharmacy/pharmacy.routes').then((m) => m.pharmacyRoutes),
      },
      {
        path: 'ipd-beds',
        loadChildren: () =>
          import('./features/ipd-beds/ipd-beds.routes').then((m) => m.ipdBedsRoutes),
      },
      {
        path: 'nursing',
        loadChildren: () =>
          import('./features/nursing/nursing.routes').then((m) => m.nursingRoutes),
      },
      {
        path: 'discharge-billing',
        loadChildren: () =>
          import('./features/discharge-billing/discharge-billing.routes').then((m) => m.dischargeBillingRoutes),
      },
      {
        path: 'lab',
        loadChildren: () =>
          import('./features/lab/lab.routes').then((m) => m.labRoutes),
      },
      {
        path: 'lab-catalog',
        loadChildren: () =>
          import('./features/lab-catalog/lab-catalog.routes').then((m) => m.labCatalogRoutes),
      },
      // Legacy /home-collection paths now redirect into the Lab module. The
      // feature folder still ships its service + types — the standalone menu
      // is gone.
      { path: 'home-collection',                  redirectTo: 'lab/home-collection',           pathMatch: 'full' },
      { path: 'home-collection/new',              redirectTo: 'billing',                       pathMatch: 'full' },
      { path: 'home-collection/phlebotomists',    redirectTo: 'settings/phlebotomists',        pathMatch: 'full' },
      { path: 'home-collection/:id',              redirectTo: 'lab/home-collection' },
      {
        path: 'lab-reports',
        loadChildren: () =>
          import('./features/lab-reports/lab-reports.routes').then((m) => m.labReportsRoutes),
      },
      {
        path: 'blood-bank',
        loadChildren: () =>
          import('./features/blood-bank/blood-bank.routes').then((m) => m.bloodBankRoutes),
      },
      {
        path: 'controlled-drugs',
        loadChildren: () =>
          import('./features/controlled-drugs/controlled-drugs.routes').then((m) => m.controlledDrugsRoutes),
      },
      {
        path: 'code-blue',
        loadChildren: () =>
          import('./features/code-blue/code-blue.routes').then((m) => m.codeBlueRoutes),
      },
      {
        path: 'lab-qc',
        redirectTo: 'lab/qc',
        pathMatch: 'full',
      },
      {
        path: 'drug-disposal',
        loadChildren: () =>
          import('./features/drug-disposal/drug-disposal.routes').then((m) => m.drugDisposalRoutes),
      },
      {
        path: 'ot',
        loadChildren: () =>
          import('./features/ot/ot.routes').then((m) => m.otRoutes),
      },
      {
        path: 'allergies',
        loadChildren: () =>
          import('./features/allergies/allergies.routes').then((m) => m.allergiesRoutes),
      },
      {
        path: 'ed',
        loadChildren: () =>
          import('./features/ed/ed.routes').then((m) => m.edRoutes),
      },
      {
        path: 'life-events',
        loadChildren: () =>
          import('./features/life-events/life-events.routes').then((m) => m.lifeEventsRoutes),
      },
      {
        path: 'infection-control',
        loadChildren: () =>
          import('./features/infection-control/infection-control.routes').then((m) => m.infectionControlRoutes),
      },
      {
        path: 'pac',
        loadChildren: () =>
          import('./features/pac/pac.routes').then((m) => m.pacRoutes),
      },
      {
        path: 'discharge-templates',
        loadChildren: () =>
          import('./features/discharge-templates/discharge-templates.routes').then((m) => m.dischargeTemplatesRoutes),
      },
      {
        path: 'mm-review',
        loadChildren: () =>
          import('./features/mm-review/mm-review.routes').then((m) => m.mmReviewRoutes),
      },
      {
        path: 'insurance-auth',
        loadChildren: () =>
          import('./features/insurance-auth/insurance-auth.routes').then((m) => m.insuranceAuthRoutes),
      },
      {
        path: 'feedback',
        loadChildren: () =>
          import('./features/feedback/feedback.routes').then((m) => m.feedbackRoutes),
      },
      {
        path: 'equipment',
        loadChildren: () =>
          import('./features/equipment/equipment.routes').then((m) => m.equipmentRoutes),
      },
      {
        path: 'employee-health',
        loadChildren: () =>
          import('./features/employee-health/employee-health.routes').then((m) => m.employeeHealthRoutes),
      },
      {
        path: 'cssd',
        loadChildren: () =>
          import('./features/cssd/cssd.routes').then((m) => m.cssdRoutes),
      },
      {
        path: 'visitors',
        loadChildren: () =>
          import('./features/visitors/visitors.routes').then((m) => m.visitorsRoutes),
      },
      {
        path: 'linen',
        loadChildren: () =>
          import('./features/linen/linen.routes').then((m) => m.linenRoutes),
      },
      {
        path: 'dietary',
        loadChildren: () =>
          import('./features/dietary/dietary.routes').then((m) => m.dietaryRoutes),
      },
      {
        path: 'lost-found',
        loadChildren: () =>
          import('./features/lost-found/lost-found.routes').then((m) => m.lostFoundRoutes),
      },
      {
        path: 'identity',
        loadChildren: () =>
          import('./features/identity/identity.routes').then((m) => m.identityRoutes),
      },
      {
        path: 'quality-indicators',
        loadChildren: () =>
          import('./features/quality-indicators/quality-indicators.routes').then((m) => m.qualityIndicatorsRoutes),
      },
      {
        path: 'communications',
        loadChildren: () =>
          import('./features/communications/communications.routes').then((m) => m.communicationsRoutes),
      },
      {
        path: 'telemedicine',
        loadChildren: () =>
          import('./features/telemedicine/telemedicine.routes').then((m) => m.telemedicineRoutes),
      },
      {
        path: 'idsp',
        loadChildren: () =>
          import('./features/idsp/idsp.routes').then((m) => m.idspRoutes),
      },
      {
        path: 'stewardship',
        loadChildren: () =>
          import('./features/stewardship/stewardship.routes').then((m) => m.stewardshipRoutes),
      },
      {
        path: 'pathways',
        loadChildren: () =>
          import('./features/pathways/pathways.routes').then((m) => m.pathwaysRoutes),
      },
      {
        path: 'risk',
        loadChildren: () =>
          import('./features/risk/risk.routes').then((m) => m.riskRoutes),
      },
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then((m) => m.inventoryRoutes),
      },
      {
        path: 'billing',
        loadChildren: () =>
          import('./features/billing/billing.routes').then((m) => m.billingRoutes),
      },
      {
        path: 'ambulance',
        loadChildren: () =>
          import('./features/ambulance/ambulance.routes').then((m) => m.ambulanceRoutes),
      },
      {
        path: 'concierge',
        loadChildren: () =>
          import('./features/concierge/concierge.routes').then((m) => m.conciergeRoutes),
      },
      {
        path: 'food',
        loadChildren: () =>
          import('./features/food-service/food-service.routes').then((m) => m.foodServiceRoutes),
      },
      {
        path: 'assets',
        loadChildren: () =>
          import('./features/assets/assets.routes').then((m) => m.assetsRoutes),
      },
      {
        path: 'patient-qr',
        loadChildren: () =>
          import('./features/patient-qr/patient-qr.routes').then((m) => m.patientQrRoutes),
      },
      {
        path: 'vendors',
        loadChildren: () =>
          import('./features/vendors/vendors.routes').then((m) => m.vendorsRoutes),
      },
      {
        path: 'purchase',
        loadChildren: () =>
          import('./features/purchase/purchase.routes').then((m) => m.purchaseRoutes),
      },
      {
        path: 'materials',
        loadChildren: () =>
          import('./features/materials/materials.routes').then((m) => m.materialsRoutes),
      },
      {
        path: 'ap',
        loadChildren: () =>
          import('./features/ap/ap.routes').then((m) => m.apRoutes),
      },
      {
        path: 'dn',
        loadChildren: () =>
          import('./features/dn/dn.routes').then((m) => m.dnRoutes),
      },
      {
        path: 'accounting',
        loadChildren: () =>
          import('./features/accounting/accounting.routes').then((m) => m.accountingRoutes),
      },
      {
        path: 'cashier',
        loadChildren: () =>
          import('./features/cashier/cashier.routes').then((m) => m.cashierRoutes),
      },
      {
        path: 'expenses',
        loadChildren: () =>
          import('./features/expenses/expenses.routes').then((m) => m.expensesRoutes),
      },
      {
        path: 'payroll',
        loadChildren: () =>
          import('./features/payroll/payroll.routes').then((m) => m.payrollRoutes),
      },
      {
        path: 'financial-reports',
        loadChildren: () =>
          import('./features/financial-reports/financial-reports.routes').then((m) => m.financialReportsRoutes),
      },
      {
        path: 'fixed-assets',
        loadChildren: () =>
          import('./features/fixed-assets/fixed-assets.routes').then((m) => m.fixedAssetsRoutes),
      },
      {
        path: 'bank-recon',
        loadChildren: () =>
          import('./features/bank-recon/bank-recon.routes').then((m) => m.bankReconRoutes),
      },
      {
        path: 'reports',
        loadChildren: () =>
          import('./features/reports/reports.routes').then((m) => m.reportsRoutes),
      },
      {
        path: 'compliance',
        loadChildren: () =>
          import('./features/compliance/compliance.routes').then((m) => m.complianceRoutes),
      },
      {
        path: 'quality',
        loadChildren: () =>
          import('./features/quality/quality.routes').then((m) => m.qualityRoutes),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then((m) => m.notificationsRoutes),
      },
      {
        path: 'smart-inbox',
        loadChildren: () =>
          import('./features/smart-inbox/smart-inbox.routes').then((m) => m.smartInboxRoutes),
      },
      {
        path: 'hr',
        loadChildren: () =>
          import('./features/hr/hr.routes').then((m) => m.hrRoutes),
      },
      {
        path: 'registers',
        loadChildren: () =>
          import('./features/registers/registers.routes').then((m) => m.registersRoutes),
      },
      {
        path: 'staff',
        loadChildren: () =>
          import('./features/staff/staff.routes').then((m) => m.staffRoutes),
      },
      {
        path: 'holiday-calendar',
        loadChildren: () =>
          import('./features/holiday-calendar/holiday-calendar.routes').then((m) => m.holidayCalendarRoutes),
      },
      {
        path: 'hr-policies',
        loadChildren: () =>
          import('./features/hr-policies/hr-policies.routes').then((m) => m.hrPoliciesRoutes),
      },
      {
        path: 'grievances',
        loadChildren: () =>
          import('./features/grievances/grievances.routes').then((m) => m.grievancesRoutes),
      },
      {
        path: 'complaints-box',
        loadChildren: () =>
          import('./features/complaints-box/complaints-box.routes').then((m) => m.complaintsBoxRoutes),
      },
      {
        path: 'engagement',
        loadChildren: () =>
          import('./features/engagement/engagement.routes').then((m) => m.engagementRoutes),
      },
      {
        path: 'credentials',
        loadChildren: () =>
          import('./features/credentials/credentials.routes').then((m) => m.credentialsRoutes),
      },
      {
        path: 'disciplinary',
        loadChildren: () =>
          import('./features/disciplinary/disciplinary.routes').then((m) => m.disciplinaryRoutes),
      },
      {
        path: 'exit-management',
        loadChildren: () =>
          import('./features/exit-management/exit-management.routes').then((m) => m.exitManagementRoutes),
      },
      {
        path: 'performance',
        loadChildren: () =>
          import('./features/performance/performance.routes').then((m) => m.performanceRoutes),
      },
      {
        path: 'attendance',
        loadChildren: () =>
          import('./features/attendance/attendance.routes').then((m) => m.attendanceRoutes),
      },
      {
        path: 'departments',
        loadChildren: () =>
          import('./features/departments/departments.routes').then((m) => m.departmentsRoutes),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.settingsRoutes),
      },
      {
        path: 'forbidden',
        loadComponent: () =>
          import('./features/forbidden/forbidden.page').then((m) => m.ForbiddenPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
