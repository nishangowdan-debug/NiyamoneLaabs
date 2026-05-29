import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { BranchContextService } from '../../../core/branches/branch-context.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { LabCatalogService } from '../data/lab-catalog.service';
import type { LabTestForm, LabTestWithPrice } from '../data/lab-catalog.types';
import type { LabCategory, LabSpecimenType } from '../../../core/supabase/supabase.types';
import { ParameterEditorDialog } from '../components/parameter-editor.dialog';

const CATEGORIES: LabCategory[] = [
  'haematology','biochemistry','microbiology','endocrinology','immunology','urinalysis','imaging','other',
];

const SPECIMENS: LabSpecimenType[] = [
  'blood','serum','plasma','urine','stool','sputum','swab','tissue','imaging','other',
];

@Component({
  selector: 'app-lab-catalog-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, AlertComponent, ParameterEditorDialog],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Lab test catalog</h1>
        <p class="text-[13px] text-ink-muted mt-1">Tests, reference ranges, price &amp; home-collection eligibility per branch.</p>
      </div>
      @if (canEdit()) {
        <div class="flex items-center gap-2">
          @if (tests().length === 0) {
            <button type="button" (click)="seedStarter()" [disabled]="seeding()"
                    class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-50 text-[12px] font-medium disabled:opacity-50">
              {{ seeding() ? 'Seeding…' : '✨ Seed starter catalog' }}
            </button>
          }
          <button type="button" (click)="openNew()"
                  class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            + Add test
          </button>
        </div>
      }
    </header>

    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <input type="search" [(ngModel)]="search" name="q" (input)="reload()" placeholder="Search by code or name…"
             class="h-9 w-72 px-3 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <span class="text-[12px] text-ink-muted">{{ tests().length }} test{{ tests().length === 1 ? '' : 's' }}</span>

      @if (branchStore.activeBranchId()) {
        <div class="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-surface-muted/40 text-[12px]">
          <span class="text-ink-muted">Home-collection surcharge:</span>
          @if (editSurcharge()) {
            <input type="number" min="0" step="1" [(ngModel)]="surchargeDraft" name="hsd"
                   class="w-20 h-7 px-1.5 text-right font-mono text-[12px] bg-surface-card border border-primary-600 rounded-md focus:outline-none focus:ring-[2px] focus:ring-primary-100" />
            <button type="button" (click)="saveSurcharge()" [disabled]="savingSurcharge()"
                    class="h-7 px-2 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[11px] font-medium disabled:opacity-50">
              {{ savingSurcharge() ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" (click)="editSurcharge.set(false)"
                    class="h-7 px-2 rounded-md border border-border text-[11px] text-ink-muted hover:bg-surface-subtle">
              Cancel
            </button>
          } @else {
            <span class="font-mono text-ink">₹{{ branchStore.homeCollectionSurcharge() | number:'1.0-0' }}</span>
            @if (canEdit()) {
              <button type="button" (click)="beginEditSurcharge()"
                      class="text-[11px] text-primary-700 hover:underline">
                Edit
              </button>
            }
            <span class="text-[10px] text-ink-muted ml-1">flat per order · cashier may override at billing</span>
          }
        </div>
      }
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load">{{ error() }}</app-alert></div>
    }

    @if (!branchStore.activeBranchId()) {
      <div class="mb-4"><app-alert tone="info" title="Showing master catalog">
        Pick a specific branch in the top-bar to see per-branch prices and home-collection settings, and to edit / archive tests.
      </app-alert></div>
    }

    <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Code</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Name</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Category</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Specimen</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Parameters</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Price (₹)</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Home</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (t of tests(); track t.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted" [class.opacity-60]="!isActive(t)">
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ t.code }}</td>
              <td class="px-4 py-2.5 text-[13px] text-ink truncate max-w-[280px]">{{ t.name }}</td>
              <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ t.category }}</td>
              <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ t.specimen_type }}</td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                @if ((t.parameter_count ?? 0) > 0) {
                  <button type="button" (click)="openParameters(t)"
                          class="font-mono text-[11px] text-primary-700 hover:underline"
                          title="View / edit parameter rows">
                    {{ t.parameter_count }} row{{ t.parameter_count === 1 ? '' : 's' }}
                  </button>
                } @else {
                  <span class="text-[11px] text-ink-muted">—</span>
                }
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ t.price?.price_inr ?? 0 | number:'1.2-2' }}</td>
              <td class="px-4 py-2.5 text-right text-[11px] whitespace-nowrap">
                @if (t.price?.home_collection_eligible) {
                  <span class="text-good-fg" title="Eligible for home collection — branch surcharge applies once per order">✓</span>
                } @else {
                  <span class="text-ink-muted">—</span>
                }
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <span [class]="statusChipCls(isActive(t))">{{ isActive(t) ? 'Active' : 'Archived' }}</span>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                @if (canEdit()) {
                  <button type="button" (click)="openEdit(t)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">Edit</button>
                  <button type="button" (click)="openParameters(t)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-primary-600 text-primary-700 hover:bg-primary-50 ml-1" title="Set up parameter rows (CBC → Hb, RBC, WBC ...)">Parameters</button>
                  @if (isActive(t)) {
                    <button type="button" (click)="archive(t)" class="h-7 px-2.5 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg ml-1">Archive</button>
                  } @else {
                    <button type="button" (click)="restore(t)" class="h-7 px-2.5 rounded-md text-[11px] text-good-fg hover:bg-good-bg ml-1">Restore</button>
                  }
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="px-4 py-12 text-center text-[12px] text-ink-muted">No tests yet — add your first test to start.</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (paramEditor(); as pe) {
      <app-parameter-editor-dialog
        [testId]="pe.id"
        [testName]="pe.name"
        (closed)="paramEditor.set(null)"
        (saved)="onParametersSaved()"></app-parameter-editor-dialog>
    }

    @if (modal()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="closeModal()">
        <div role="dialog" aria-modal="true"
             class="relative w-full max-w-[720px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto">
          <button type="button" (click)="closeModal()" aria-label="Close"
                  class="absolute top-3 right-3 size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h2 class="font-display text-[18px] font-medium text-ink">{{ form.id ? 'Edit test' : 'New test' }}</h2>

          @if (modal() === 'new' && tests().length > 0) {
            <div class="mt-4 p-3 rounded-md border border-primary-100 bg-primary-50/40">
              <div class="flex items-center justify-between gap-3 mb-1">
                <label class="text-[11px] uppercase tracking-[0.06em] text-primary-700 font-semibold">
                  Copy from existing test
                </label>
                @if (cloneFromId()) {
                  <button type="button" (click)="onCloneSelect('')"
                          class="text-[11px] text-ink-muted hover:text-ink underline">
                    Clear &amp; start blank
                  </button>
                }
              </div>
              <select [ngModel]="cloneFromId()" (ngModelChange)="onCloneSelect($event)" name="cloneSrc"
                      class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">— Start from blank —</option>
                @for (t of tests(); track t.id) {
                  <option [value]="t.id">{{ t.code }} · {{ t.name }}{{ (t.parameter_count ?? 0) > 0 ? ' (' + t.parameter_count + ' params)' : '' }}</option>
                }
              </select>
              @if (cloneFromId()) {
                <p class="text-[11px] text-ink-soft mt-1.5">
                  ✓ All fields below are prefilled. <strong>Enter a fresh code</strong> — codes must be unique.
                  All parameter rows (including cohort ranges) will be copied after you click <strong>Save</strong>.
                </p>
              } @else {
                <p class="text-[11px] text-ink-muted mt-1.5">
                  Pick a master test to clone — fields and all parameter rows will be copied. You can still edit before saving.
                </p>
              }
            </div>
          }

          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Code *</span>
              <input type="text" [(ngModel)]="form.code" name="c"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-8 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Name *</span>
              <input type="text" [(ngModel)]="form.name" name="n"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Category</span>
              <select [(ngModel)]="form.category" name="cat"
                      class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </label>
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Specimen</span>
              <select [(ngModel)]="form.specimen_type" name="sp"
                      class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                @for (s of specimens; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </label>
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Unit</span>
              <input type="text" [(ngModel)]="form.unit" name="u" placeholder="mg/dL"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <div class="col-span-12 -mb-1.5 mt-1 text-[11px] text-ink-muted">
              Reference range = normal results · Critical = panic-level values. Order:
              <span class="font-mono text-[10px] bg-surface-muted border border-border rounded px-1.5 py-0.5 ml-0.5">
                crit low ≤ ref min ≤ ref max ≤ crit high
              </span>
              <span class="block mt-1">Example (Fasting Blood Sugar, mg/dL): crit low <b>40</b>, ref min <b>70</b>, ref max <b>100</b>, crit high <b>400</b>.</span>
            </div>
            <label class="col-span-3 block">
              <span [class]="labelCls('critical_low')">Crit low</span>
              <input type="number" [(ngModel)]="form.critical_low" name="cl" step="0.01" placeholder="e.g. 40"
                     [class]="fieldCls('critical_low', 'w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100')" />
              <span class="block text-[10px] text-ink-muted mt-0.5">Lowest safe value</span>
            </label>
            <label class="col-span-3 block">
              <span [class]="labelCls('ref_min')">Ref min</span>
              <input type="number" [(ngModel)]="form.ref_min" name="rmin" step="0.01" placeholder="e.g. 70"
                     [class]="fieldCls('ref_min', 'w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100')" />
              <span class="block text-[10px] text-ink-muted mt-0.5">Normal range lower</span>
            </label>
            <label class="col-span-3 block">
              <span [class]="labelCls('ref_max')">Ref max</span>
              <input type="number" [(ngModel)]="form.ref_max" name="rmax" step="0.01" placeholder="e.g. 100"
                     [class]="fieldCls('ref_max', 'w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100')" />
              <span class="block text-[10px] text-ink-muted mt-0.5">Normal range upper</span>
            </label>
            <label class="col-span-3 block">
              <span [class]="labelCls('critical_high')">Crit high</span>
              <input type="number" [(ngModel)]="form.critical_high" name="ch" step="0.01" placeholder="e.g. 400"
                     [class]="fieldCls('critical_high', 'w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100')" />
              <span class="block text-[10px] text-ink-muted mt-0.5">Highest safe value</span>
            </label>

            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Turnaround (hrs)</span>
              <input type="number" [(ngModel)]="form.turnaround_hours" name="th" min="0"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-4 block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Price (₹) *</span>
              <input type="number" [(ngModel)]="form.price_inr" name="p" min="0" step="1"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <div class="col-span-12 pt-1">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Default routing</span>
              <div class="inline-flex border border-border rounded-md overflow-hidden">
                <button type="button" (click)="form.default_routing = 'inhouse'"
                        [class]="form.default_routing === 'inhouse' ? 'px-3 h-8 text-[12px] bg-primary-600 text-white' : 'px-3 h-8 text-[12px] bg-surface-card text-ink-soft hover:bg-surface-subtle'">
                  Inhouse
                </button>
                <button type="button" (click)="form.default_routing = 'outsource'"
                        [class]="form.default_routing === 'outsource' ? 'px-3 h-8 text-[12px] bg-violet-600 text-white' : 'px-3 h-8 text-[12px] bg-surface-card text-ink-soft hover:bg-surface-subtle'">
                  Outsource
                </button>
              </div>
              <p class="text-[11px] text-ink-muted mt-1">Used to prefill the toggle on each billing line. Cashier can still flip it per invoice.</p>
            </div>

            <label class="col-span-12 inline-flex items-center gap-2 pt-1">
              <input type="checkbox" [(ngModel)]="form.home_collection_eligible" name="he"
                     class="size-4" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">Available for home sample collection</span>
            </label>
            <label class="col-span-12 inline-flex items-center gap-2">
              <input type="checkbox" [(ngModel)]="form.is_active" name="ia"
                     class="size-4" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">Active (orderable)</span>
            </label>
          </div>

          @if (rangeError()) {
            <p class="mt-3 text-[12px] text-danger-fg bg-danger-bg/40 border border-danger-fg/30 rounded-md px-3 py-2">
              ⚠ <strong>{{ rangeError() }}</strong>
              <span class="block text-[11px] mt-1 opacity-80">Check the highlighted fields above.</span>
            </p>
          }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="save()" [disabled]="!isValid() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class LabCatalogPage implements OnInit {
  private svc = inject(LabCatalogService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private   readonly branchGuard = inject(BranchContextService);
  private toast = inject(ToastService);

  protected readonly tests = signal<LabTestWithPrice[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly seeding = signal(false);
  protected search = '';

  protected readonly modal = signal<'new' | 'edit' | null>(null);
  protected form: LabTestForm & { id?: string | null } = this.emptyForm();

  /** ID of the source test the user picked to clone from in the "New test"
   *  modal. Empty string = none selected. On save, parameter rows of the
   *  source are copied onto the newly-created test. */
  protected readonly cloneFromId = signal<string>('');

  /** Inline editor state for the branch-level home-collection surcharge. */
  protected readonly editSurcharge   = signal(false);
  protected readonly savingSurcharge = signal(false);
  protected surchargeDraft = 250;

  /** Parameter-editor target. Null when closed. */
  protected readonly paramEditor = signal<{ id: string; name: string } | null>(null);

  protected readonly categories = CATEGORIES;
  protected readonly specimens = SPECIMENS;

  protected readonly canEdit = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin'),
  );

  constructor() {
    effect(() => {
      // Reload when active branch changes
      this.branchStore.activeBranchId();
      void this.reload();
    });
  }

  ngOnInit() { void this.reload(); }

  protected async reload() {
    const branchId = this.branchStore.activeBranchId();
    this.error.set(null);
    try {
      const rows = await this.svc.list(branchId, this.search);
      this.tests.set(rows);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected isActive(t: LabTestWithPrice): boolean {
    return t.is_active && (t.price?.is_active ?? true);
  }

  protected statusChipCls(active: boolean): string {
    const tone = active ? 'bg-good-bg text-good-fg' : 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }

  protected async openNew() {
    // Branch context guard — per-branch price rows are written on save, so
    // a new test created without a scoped branch silently misses the price
    // row and shows as "unpriced" everywhere downstream.
    const branchId = await this.branchGuard.require('New lab test');
    if (!branchId) return;
    this.form = this.emptyForm();
    this.cloneFromId.set('');
    this.modal.set('new');
  }

  protected closeModal() {
    this.modal.set(null);
    this.cloneFromId.set('');
  }

  protected beginEditSurcharge() {
    this.surchargeDraft = this.branchStore.homeCollectionSurcharge();
    this.editSurcharge.set(true);
  }

  protected async saveSurcharge() {
    const branchId = this.branchStore.activeBranchId();
    if (!branchId) return;
    const amount = Number(this.surchargeDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      this.toast.error('Invalid amount', 'Surcharge must be ≥ 0.');
      return;
    }
    this.savingSurcharge.set(true);
    try {
      await this.branchStore.updateHomeCollectionSurcharge(branchId, amount);
      this.toast.success('Home-collection surcharge updated', `Now ₹${amount} per order at this branch.`);
      this.editSurcharge.set(false);
    } catch (e) {
      this.toast.error('Could not update surcharge', this.errorMessage(e));
    } finally {
      this.savingSurcharge.set(false);
    }
  }

  /** Triggered when the user picks a source test in the "Copy from" dropdown.
   *  Pre-fills all form fields except `code` (which must remain unique). The
   *  parameter rows themselves are copied AFTER save, since the target test
   *  has no id yet. */
  protected onCloneSelect(sourceId: string) {
    this.cloneFromId.set(sourceId);
    if (!sourceId) return;
    const src = this.tests().find(t => t.id === sourceId);
    if (!src) return;
    this.form = {
      // Keep id undefined (still a NEW test) and force user to pick a fresh code.
      id: null,
      code: '',
      name: `${src.name} (copy)`,
      category: src.category,
      specimen_type: src.specimen_type,
      unit: src.unit,
      ref_min: src.ref_min,
      ref_max: src.ref_max,
      critical_low: src.critical_low,
      critical_high: src.critical_high,
      turnaround_hours: src.turnaround_hours,
      price_inr: src.price?.price_inr ?? 0,
      home_collection_eligible: src.price?.home_collection_eligible ?? false,
      home_collection_surcharge_inr: src.price?.home_collection_surcharge_inr ?? 0,
      is_active: true,
      default_routing: ((src as any).default_routing === 'outsource' ? 'outsource' : 'inhouse'),
    };
  }

  protected openParameters(t: LabTestWithPrice) {
    this.paramEditor.set({ id: t.id, name: t.name });
  }

  /** Hook fired by the editor after a successful save. Reload list so the
   *  parameter count badge (added later) stays in sync. */
  protected onParametersSaved() {
    void this.reload();
  }

  protected openEdit(t: LabTestWithPrice) {
    this.form = {
      id: t.id,
      code: t.code,
      name: t.name,
      category: t.category,
      specimen_type: t.specimen_type,
      unit: t.unit,
      ref_min: t.ref_min,
      ref_max: t.ref_max,
      critical_low: t.critical_low,
      critical_high: t.critical_high,
      turnaround_hours: t.turnaround_hours,
      price_inr: t.price?.price_inr ?? 0,
      home_collection_eligible: t.price?.home_collection_eligible ?? false,
      home_collection_surcharge_inr: t.price?.home_collection_surcharge_inr ?? 0,
      is_active: t.is_active && (t.price?.is_active ?? true),
      default_routing: ((t as any).default_routing === 'outsource' ? 'outsource' : 'inhouse'),
    };
    this.modal.set('edit');
  }

  protected isValid(): boolean {
    return !!this.form.code?.trim()
      && !!this.form.name?.trim()
      && (this.form.price_inr ?? 0) >= 0
      && (this.form.home_collection_surcharge_inr ?? 0) >= 0
      && !this.rangeError();
  }

  /** Returns a human-readable validation error for ref / critical ranges, or null. */
  protected rangeError(): string | null {
    const { ref_min, ref_max, critical_low, critical_high } = this.form;
    if (ref_min != null && ref_max != null && Number(ref_min) > Number(ref_max)) {
      return 'Reference min must be ≤ reference max';
    }
    if (critical_low != null && critical_high != null && Number(critical_low) > Number(critical_high)) {
      return 'Critical low must be ≤ critical high';
    }
    if (critical_low != null && ref_min != null && Number(critical_low) > Number(ref_min)) {
      return 'Critical low should be ≤ reference min';
    }
    if (critical_high != null && ref_max != null && Number(critical_high) < Number(ref_max)) {
      return 'Critical high should be ≥ reference max';
    }
    return null;
  }

  /** Set of field names that should be highlighted because they participate in the current range error. */
  protected fieldErrors(): Set<string> {
    const out = new Set<string>();
    const { ref_min, ref_max, critical_low, critical_high } = this.form;
    if (ref_min != null && ref_max != null && Number(ref_min) > Number(ref_max)) {
      out.add('ref_min'); out.add('ref_max');
    }
    if (critical_low != null && critical_high != null && Number(critical_low) > Number(critical_high)) {
      out.add('critical_low'); out.add('critical_high');
    }
    if (critical_low != null && ref_min != null && Number(critical_low) > Number(ref_min)) {
      out.add('critical_low'); out.add('ref_min');
    }
    if (critical_high != null && ref_max != null && Number(critical_high) < Number(ref_max)) {
      out.add('critical_high'); out.add('ref_max');
    }
    return out;
  }

  protected hasFieldError(field: string): boolean {
    return this.fieldErrors().has(field);
  }

  protected fieldCls(field: string, base: string): string {
    return this.hasFieldError(field)
      ? `${base} border-danger-fg bg-danger-bg/30 ring-1 ring-danger-fg/40 focus:border-danger-fg focus:ring-danger-fg/40`
      : base;
  }

  protected labelCls(field: string): string {
    return this.hasFieldError(field)
      ? 'block text-[11px] uppercase text-danger-fg font-semibold mb-1.5'
      : 'block text-[11px] uppercase text-ink-muted font-medium mb-1.5';
  }

  protected async save() {
    const branchId = this.branchStore.activeBranchId();
    if (!this.isValid()) {
      this.toast.error(
        'Cannot save',
        this.rangeError() ?? 'Code, name, price and home surcharge are required.',
      );
      return;
    }
    // Guard against accidentally clobbering an existing test when the user is
    // creating a "new" one — the underlying upsert uses onConflict:code and
    // would silently UPDATE the existing row.
    if (!this.form.id) {
      const wantCode = (this.form.code ?? '').trim().toUpperCase();
      const clash = this.tests().find(t => (t.code ?? '').toUpperCase() === wantCode);
      if (clash) {
        this.toast.error(
          'Code already in use',
          `"${clash.code}" is already assigned to "${clash.name}". Pick a fresh code (e.g. "${clash.code}2" or "${clash.code}-V2") to create a separate test.`,
        );
        return;
      }
    }
    this.busy.set(true);
    try {
      const isNew = !this.form.id;
      const newId = await this.svc.upsertTest(this.form, branchId, this.form.id ?? null);
      // If this was a fresh test created via "Copy from existing", clone the
      // source's parameter rows onto it now that we have an id.
      const cloneFrom = this.cloneFromId();
      let copiedRows = 0;
      if (isNew && cloneFrom && cloneFrom !== newId) {
        try {
          const result = await this.svc.copyParameters(cloneFrom, newId);
          copiedRows = result.rows;
        } catch (cloneErr) {
          // Test was saved — only the parameter clone failed. Tell the user
          // so they can retry the parameters step from the editor.
          this.toast.warn(
            'Test saved, but copy failed',
            'Could not copy parameter rows: ' + this.errorMessage(cloneErr) + '. Open the Parameters editor to set them manually.',
          );
        }
      }
      const verb = this.form.id ? 'Test updated' : 'Test added';
      const suffix = copiedRows > 0 ? ` · ${copiedRows} parameter row${copiedRows === 1 ? '' : 's'} copied` : '';
      if (!branchId && isNew) {
        this.toast.info(verb + suffix, 'Master catalog only — switch to a specific branch to set price & home-collection eligibility.');
      } else {
        this.toast.success(verb + suffix);
      }
      this.modal.set(null);
      this.cloneFromId.set('');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save', this.errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Drill through Supabase / Error / plain-object shapes to surface a real
   *  message — RPC and PostgREST errors are not Error instances, so the naive
   *  `e instanceof Error` check silently drops them. */
  private errorMessage(e: unknown): string {
    if (e == null) return 'Try again.';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const o = e as any;
    const parts = [o?.message, o?.details, o?.hint, o?.code]
      .filter((s) => typeof s === 'string' && s.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
    try { return JSON.stringify(e); } catch { return String(e); }
  }

  protected async archive(t: LabTestWithPrice) {
    if (!confirm(`Archive "${t.name}"? It will no longer appear in order pickers.`)) return;
    const branchId = this.branchStore.activeBranchId();
    if (!branchId) return;
    try {
      await this.svc.deactivate(t.id, branchId);
      this.toast.warn('Test archived');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not archive', this.errorMessage(e));
    }
  }

  protected async restore(t: LabTestWithPrice) {
    const branchId = this.branchStore.activeBranchId();
    if (!branchId) return;
    try {
      await this.svc.reactivate(t.id, branchId);
      this.toast.success('Test restored');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not restore', this.errorMessage(e));
    }
  }

  protected async seedStarter() {
    if (!confirm('Add 22 common lab tests (haematology, biochemistry, endocrine, urinalysis, imaging) to your catalog?\n\nExisting tests with the same code will be left alone.')) return;
    this.seeding.set(true);
    try {
      const branchId = this.branchStore.activeBranchId();
      const r = await this.svc.seedStarterCatalog(branchId);
      if (r.errors.length > 0) {
        this.toast.warn(
          `Seeded ${r.tests} tests (${r.errors.length} errors)`,
          r.errors.slice(0, 3).join(' · ') + (r.errors.length > 3 ? ' …' : ''),
        );
      } else {
        this.toast.success(
          'Catalog seeded',
          branchId
            ? `${r.tests} tests · ${r.prices} prices set for this branch`
            : `${r.tests} tests added. Pick a specific branch to set prices.`,
        );
      }
      await this.reload();
    } catch (e) {
      this.toast.error('Seed failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.seeding.set(false);
    }
  }

  private emptyForm(): LabTestForm & { id?: string | null } {
    return {
      id: null,
      code: '',
      name: '',
      category: 'biochemistry' as any,
      specimen_type: 'serum' as any,
      unit: '',
      ref_min: null,
      ref_max: null,
      critical_low: null,
      critical_high: null,
      turnaround_hours: 24,
      price_inr: 0,
      home_collection_eligible: false,
      home_collection_surcharge_inr: 0,
      is_active: true,
      default_routing: 'inhouse',
    };
  }
}
