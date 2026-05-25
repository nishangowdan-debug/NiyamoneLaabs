import { CanActivateFn } from '@angular/router';

/**
 * NABL shift-QC gate.
 *
 * Pre-go-live: this guard is a pass-through so labs aren't blocked from the
 * Workflow / Reports History tabs while QC infrastructure is still being
 * commissioned. Re-enable at go-live by restoring the original implementation
 * (calls lab_open_or_get_shift_session() and redirects lab_tech users to
 * /lab/qc?gate=1 until the session has qc_cleared_at).
 */
export const shiftQcGuard: CanActivateFn = () => true;
