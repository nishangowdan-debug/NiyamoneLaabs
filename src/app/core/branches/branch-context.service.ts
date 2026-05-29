import { Injectable, inject } from '@angular/core';
import { BranchStore } from './branch.store';
import { BranchPickerDialogService } from './branch-picker.dialog';

/**
 * Branch-context guard for every create-flow.
 *
 * Background: super admins (and anyone with access to ≥1 branch) can sit
 * in "All hospitals" mode where `BranchStore.activeBranchId()` is null.
 * Creating an invoice / staff / patient / lab test in that state used to
 * fall back to the patient's home branch OR the oldest-active-branch —
 * leading to invoices that quietly file under the wrong branch and have
 * to be cancelled later.
 *
 * Call `.require('New invoice')` at the entry point of any create flow.
 * It returns the branch the action should run against, or null if the
 * user cancelled. Behaviour:
 *
 *   - active branch already set            → returns it (no UI)
 *   - user has exactly one accessible      → auto-picks it, sets active,
 *     branch (single-branch cashier)         returns it (no UI)
 *   - active is null AND user has ≥2       → opens BranchPickerDialog;
 *     accessible branches                    on pick, sets active + returns;
 *                                            on cancel, returns null
 *
 * The dialog is mounted at the app-layout level (see AppLayout).
 */
@Injectable({ providedIn: 'root' })
export class BranchContextService {
  private readonly store  = inject(BranchStore);
  private readonly dialog = inject(BranchPickerDialogService);

  async require(action: string): Promise<string | null> {
    // Make sure the branch list is loaded — deep-link straight into a
    // create flow shouldn't dead-end on an empty list.
    if (this.store.branches().length === 0) {
      try { await this.store.load(); } catch { /* surfaced by the dialog as empty state */ }
    }

    const active = this.store.activeBranchId();
    if (active) return active;

    const accessible = this.store.branches();
    if (accessible.length === 1) {
      // Single-branch user: pick silently, no friction.
      this.store.setActive(accessible[0].id);
      return accessible[0].id;
    }

    // Multi-branch user + nothing scoped — ask.
    const chosen = await this.dialog.open(action);
    if (chosen) this.store.setActive(chosen);
    return chosen;
  }
}
