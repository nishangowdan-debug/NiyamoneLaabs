import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BranchStore } from './branch.store';

/**
 * Imperative dialog used by BranchContextService.require(). The dialog is
 * mounted once at the app-layout level; callers don't interact with the
 * component directly — they ask the service to `open(action)` and await
 * the user's pick.
 *
 * Design intentionally avoids a generic Dialog/Overlay infrastructure
 * because none exists in this app yet — every modal so far is an inline
 * overlay div. Keeping the pattern consistent.
 */

/** Internal dialog state — null when the modal isn't shown. */
interface DialogState {
  action: string;
  resolve: (branchId: string | null) => void;
}

@Injectable({ providedIn: 'root' })
export class BranchPickerDialogService {
  /** Component reads this and renders when non-null. */
  readonly state = signal<DialogState | null>(null);

  /**
   * Show the picker. Resolves with the selected branchId, or null when
   * the user cancels (Esc / Cancel / backdrop click).
   *
   * If a previous prompt is still open, that one is auto-cancelled before
   * the new one opens — avoids overlapping prompts when a user click-spams.
   */
  open(action: string): Promise<string | null> {
    const existing = this.state();
    if (existing) existing.resolve(null);
    return new Promise((resolve) => {
      this.state.set({ action, resolve });
    });
  }

  /** Internal — close paths funnel through here. */
  resolve(branchId: string | null): void {
    const s = this.state();
    if (!s) return;
    this.state.set(null);
    s.resolve(branchId);
  }
}

@Component({
  selector: 'app-branch-picker-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    @if (svc.state(); as st) {
      <div class="fixed inset-0 z-[80] grid place-items-center bg-ink/40 backdrop-blur-sm p-4"
           (document:keydown.escape)="cancel()"
           (click)="cancel()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[440px] bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <header class="mb-3">
            <h2 class="font-display text-[17px] font-medium text-ink">
              Pick a branch for <span class="text-primary-700">{{ st.action }}</span>
            </h2>
            <p class="text-[12px] text-ink-muted mt-1">
              This action needs a target branch. The topbar will switch to
              your pick — all subsequent creations stay in that branch until
              you change it.
            </p>
          </header>

          @if (branches().length === 0) {
            <div class="rounded-md border border-warn-border bg-warn-bg text-warn-fg px-3 py-2 text-[12px]">
              ⚠ You don't have access to any active branch. Ask an admin to
              assign one before creating records.
            </div>
          } @else {
            <label class="block">
              <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">
                Branch / Head Office <span class="text-danger-fg">*</span>
              </span>
              <select [(ngModel)]="selectedId" name="branchPick" autofocus
                      class="w-full h-10 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">Select a branch…</option>
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }} · {{ b.code }}</option>
                }
              </select>
            </label>
          }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="cancel()"
                    class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Cancel
            </button>
            <button type="button" (click)="confirm()"
                    [disabled]="!selectedId || branches().length === 0"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              Continue
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class BranchPickerDialogComponent {
  protected readonly svc   = inject(BranchPickerDialogService);
  protected readonly store = inject(BranchStore);

  /** Currently-selected branch id in the dropdown. Reset on each open. */
  protected selectedId = '';

  /** Branches the user can pick from — already RLS-filtered by BranchStore. */
  protected readonly branches = this.store.branches;

  /** Reset selection whenever the dialog re-opens for a new action.
   *  `effect` (not `computed`) — we want to run a side effect when the
   *  signal changes, not memoize a derived value. */
  private readonly _resetFx = effect(() => {
    if (this.svc.state()) this.selectedId = '';
  });

  protected cancel(): void {
    this.svc.resolve(null);
  }

  protected confirm(): void {
    if (!this.selectedId) return;
    this.svc.resolve(this.selectedId);
  }
}
