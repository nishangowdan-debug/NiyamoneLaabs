import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { Permission, RoleSlug } from './auth.types';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (auth.isAuthed()) return true;
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};

export const redirectIfAuthedGuard: CanMatchFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (!auth.isAuthed()) return true;
  // Patients have their own portal — don't send them to the staff dashboard
  if (auth.hasRole('patient')) return router.createUrlTree(['/patient-portal']);
  return router.createUrlTree(['/dashboard']);
};

export const roleGuard: CanMatchFn = (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const allowed = (route.data?.['roles'] as RoleSlug[] | undefined) ?? [];
  if (allowed.length === 0) return true;
  if (auth.hasRole(...allowed)) return true;
  return router.createUrlTree(['/forbidden']);
};

export const permissionGuard = (perm: Permission): CanActivateFn => () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  // super_admin / branch_admin bypass permission checks (they manage everything)
  if (auth.hasRole('super_admin', 'branch_admin')) return true;
  return auth.has(perm) ? true : router.createUrlTree(['/forbidden']);
};
