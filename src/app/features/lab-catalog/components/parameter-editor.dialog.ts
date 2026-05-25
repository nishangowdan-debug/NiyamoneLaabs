import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import { LabCatalogService } from '../data/lab-catalog.service';
import {
  REF_SCOPES,
  type LabTestParameter, type ParameterDraft, type ParameterFont,
  type RefOverride, type RefScope,
} from '../data/lab-catalog.types';

/**
 * Per-test parameter editor — opens from the Lab Catalog row.
 *
 * Intentionally NON-DISMISSIBLE: there is no ESC key listener and no backdrop
 * click handler. Only the explicit "Save & close" or "Discard changes" buttons
 * can close it. This protects against losing many edits to a stray click.
 *
 * Columns mirror the lab-template reference:
 *   SNo · Parameter · Test Values (default) · Normal Range · Unit · Low · High · Method · Font
 */
@Component({
  selector: 'app-parameter-editor-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="paramEditorTitle"
           class="relative w-full max-w-[1180px] bg-surface-card border border-border rounded-[10px] shadow-pop max-h-[92vh] flex flex-col">

        <!-- Header -->
        <header class="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 id="paramEditorTitle" class="font-display text-[18px] font-medium text-ink">
              {{ testName }} <span class="text-ink-muted text-[13px]">· parameter setup</span>
            </h2>
            <p class="text-[11px] text-ink-muted mt-1">
              Define the rows that appear under this test in the patient report.
              Drag <span class="font-mono">⠿</span> to reorder.
              <span class="ml-1 text-warn-fg font-medium">Press “Save &amp; close” when done — this window does not auto-close.</span>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" (click)="addParameter()"
                    class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              + Parameter
            </button>
            <button type="button" (click)="addSectionHeader()"
                    class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              + Section header
            </button>
          </div>
        </header>

        <!-- Body -->
        <div class="flex-1 overflow-auto p-5">
          @if (loading()) {
            <p class="text-[12px] text-ink-muted py-10 text-center">Loading parameters…</p>
          } @else if (drafts().length === 0) {
            <div class="py-12 text-center">
              <p class="text-[13px] text-ink-muted mb-3">No parameters yet — add the first row to get started.</p>
              <button type="button" (click)="addParameter()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
                + Add parameter
              </button>
            </div>
          } @else {
            <table class="w-full border-collapse text-[12px]">
              <thead>
                <tr class="bg-surface-muted">
                  <th class="w-6 px-1 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border"></th>
                  <th class="w-10 px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">SNo</th>
                  <th class="px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="min-width:200px;">Parameter</th>
                  <th class="px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:200px;">Normal Range</th>
                  <th class="px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:90px;">Units</th>
                  <th class="px-2 py-2 text-right text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:80px;">Low</th>
                  <th class="px-2 py-2 text-right text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:80px;">High</th>
                  <th class="px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:160px;">Method</th>
                  <th class="px-2 py-2 text-center text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:50px;">Font</th>
                  <th class="px-2 py-2 text-right text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border" style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                @for (d of drafts(); track $index; let i = $index) {
                  <tr class="border-b border-border hover:bg-surface-subtle/40"
                      draggable="true"
                      (dragstart)="onDragStart(i)"
                      (dragover)="$event.preventDefault()"
                      (drop)="onDrop(i)">
                    <td class="px-1 py-1.5 text-center text-ink-muted cursor-grab select-none" title="Drag to reorder">⠿</td>
                    <td class="px-2 py-1.5 font-mono text-ink-soft">{{ i + 1 }}</td>

                    @if (d.is_section_header) {
                      <td colspan="6" class="px-2 py-1.5">
                        <input type="text" [(ngModel)]="d.parameter" [name]="'sec-' + i"
                               placeholder="Section header (e.g. DIFFERENTIAL COUNT:)"
                               class="w-full h-8 px-2 text-[12px] font-semibold uppercase tracking-[0.04em] bg-primary-50 border border-primary-100 rounded-md text-primary-700 focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                      </td>
                    } @else {
                      <td class="px-2 py-1.5">
                        <input type="text" [(ngModel)]="d.parameter" [name]="'p-' + i"
                               [class]="inputCls(rowError(i, 'parameter'))"
                               placeholder="Haemoglobin" />
                      </td>
                      <td class="px-2 py-1.5 align-top">
                        <textarea [(ngModel)]="d.normal_range_display" [name]="'nr-' + i"
                                  rows="1"
                                  placeholder="Male: 13.5 - 18.0"
                                  class="w-full min-h-8 px-2 py-1 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100 resize-y leading-tight"></textarea>
                      </td>
                      <td class="px-2 py-1.5">
                        <input type="text" [(ngModel)]="d.unit" [name]="'u-' + i"
                               placeholder="gm/dl"
                               class="w-full h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                      </td>
                      <td class="px-1 py-1.5">
                        <input type="number" step="0.01" [(ngModel)]="d.low_value" [name]="'lo-' + i"
                               [class]="inputCls(rowError(i, 'range'), 'text-right font-mono')" />
                      </td>
                      <td class="px-1 py-1.5">
                        <input type="number" step="0.01" [(ngModel)]="d.high_value" [name]="'hi-' + i"
                               [class]="inputCls(rowError(i, 'range'), 'text-right font-mono')" />
                      </td>
                      <td class="px-2 py-1.5">
                        <input type="text" [(ngModel)]="d.method" [name]="'m-' + i"
                               placeholder="Spectrophotometry"
                               class="w-full h-8 px-2 text-[11px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
                      </td>
                      <td class="px-1 py-1.5 text-center">
                        <div class="inline-flex items-center gap-1">
                          <button type="button" (click)="openRanges(i)"
                                  class="h-7 px-2 inline-flex items-center gap-1 rounded-md text-[10.5px] font-medium border"
                                  [class]="d.ref_overrides.length > 0
                                    ? 'border-primary-600 text-primary-700 bg-primary-50 hover:bg-primary-100'
                                    : 'border-border text-ink-muted hover:bg-surface-muted'"
                                  title="Cohort-specific ranges (male/female/pregnancy/pediatric)">
                            Ranges
                            @if (d.ref_overrides.length > 0) {
                              <span class="font-mono">({{ d.ref_overrides.length }})</span>
                            }
                          </button>
                          <button type="button" (click)="openFont(i)"
                                  class="size-7 inline-grid place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
                                  title="Font / styling">⚙</button>
                        </div>
                      </td>
                    }

                    <td class="px-1 py-1.5 text-right">
                      <button type="button" (click)="removeRow(i)"
                              class="size-7 grid place-items-center rounded-md text-danger-fg hover:bg-danger-bg/40"
                              title="Remove row">×</button>
                    </td>
                  </tr>

                  @if (rangesOpenIdx() === i && !d.is_section_header) {
                    <tr class="bg-info-bg/30">
                      <td colspan="10" class="px-5 py-3">
                        <div class="flex items-center justify-between mb-2">
                          <p class="text-[11px] text-ink-soft">
                            <strong>Cohort-specific ranges</strong> — overrides the row's Low/High when the patient matches.
                            Leave Display blank to auto-format <span class="font-mono">low – high</span>.
                          </p>
                          <div class="flex items-center gap-2">
                            <button type="button" (click)="autofillNormalRange(i)"
                                    [disabled]="d.ref_overrides.length === 0"
                                    class="h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
                                    title="Build the row's Normal Range cell from these cohort entries">
                              ↻ Build Normal Range
                            </button>
                            <button type="button" (click)="addRange(i)"
                                    class="h-7 px-2.5 rounded-md border border-primary-600 text-[11px] font-medium text-primary-700 hover:bg-primary-50">
                              + Cohort
                            </button>
                            <button type="button" (click)="rangesOpenIdx.set(null)"
                                    class="h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-muted">
                              Done
                            </button>
                          </div>
                        </div>

                        @if (d.ref_overrides.length === 0) {
                          <p class="text-[11px] text-ink-muted italic py-2">No cohort ranges yet. Click "+ Cohort" to add one.</p>
                        } @else {
                          <table class="w-full text-[11px] border-collapse">
                            <thead>
                              <tr>
                                <th class="text-left px-2 py-1 font-semibold text-ink-muted uppercase tracking-[0.04em]" style="width:200px;">Scope</th>
                                <th class="text-right px-2 py-1 font-semibold text-ink-muted uppercase tracking-[0.04em]" style="width:90px;">Low</th>
                                <th class="text-right px-2 py-1 font-semibold text-ink-muted uppercase tracking-[0.04em]" style="width:90px;">High</th>
                                <th class="text-left px-2 py-1 font-semibold text-ink-muted uppercase tracking-[0.04em]">Display (printed)</th>
                                <th class="px-2 py-1" style="width:32px;"></th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (ov of d.ref_overrides; track $index; let oi = $index) {
                                <tr>
                                  <td class="px-2 py-1">
                                    <select [(ngModel)]="ov.scope" [name]="'os-' + i + '-' + oi"
                                            class="w-full h-7 px-1.5 text-[11px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                                      @for (s of refScopes; track s.value) {
                                        <option [value]="s.value">{{ s.label }}</option>
                                      }
                                    </select>
                                  </td>
                                  <td class="px-1 py-1">
                                    <input type="number" step="0.01" [(ngModel)]="ov.low" [name]="'olo-' + i + '-' + oi"
                                           class="w-full h-7 px-1.5 text-[11px] font-mono text-right bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600" />
                                  </td>
                                  <td class="px-1 py-1">
                                    <input type="number" step="0.01" [(ngModel)]="ov.high" [name]="'ohi-' + i + '-' + oi"
                                           class="w-full h-7 px-1.5 text-[11px] font-mono text-right bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600" />
                                  </td>
                                  <td class="px-2 py-1">
                                    <input type="text" [(ngModel)]="ov.display" [name]="'od-' + i + '-' + oi"
                                           placeholder="(auto from low–high if blank)"
                                           class="w-full h-7 px-1.5 text-[11px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600" />
                                  </td>
                                  <td class="px-1 py-1 text-right">
                                    <button type="button" (click)="removeRange(i, oi)"
                                            class="size-6 grid place-items-center rounded-md text-danger-fg hover:bg-danger-bg/40"
                                            title="Remove cohort range">×</button>
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      </td>
                    </tr>
                  }

                  @if (fontOpenIdx() === i) {
                    <tr class="bg-surface-subtle/60">
                      <td colspan="10" class="px-5 py-3">
                        <div class="flex flex-wrap items-end gap-3 text-[11px]">
                          <label class="block">
                            <span class="block text-ink-muted mb-1">Family</span>
                            <select [(ngModel)]="d.font.family" [name]="'ff-' + i"
                                    class="h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md">
                              <option [ngValue]="undefined">(default)</option>
                              <option value="Arial">Arial</option>
                              <option value="Helvetica">Helvetica</option>
                              <option value="Georgia">Georgia</option>
                              <option value="Times New Roman">Times</option>
                              <option value="Courier New">Courier</option>
                            </select>
                          </label>
                          <label class="block">
                            <span class="block text-ink-muted mb-1">Size (pt)</span>
                            <input type="number" min="6" max="20" [(ngModel)]="d.font.size" [name]="'fs-' + i"
                                   class="h-8 w-20 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md" />
                          </label>
                          <label class="inline-flex items-center gap-1.5">
                            <input type="checkbox"
                                   [checked]="d.font.weight === 'bold'"
                                   (change)="d.font.weight = ($any($event.target).checked ? 'bold' : 'normal')"
                                   class="size-3.5" />
                            <span>Bold</span>
                          </label>
                          <label class="inline-flex items-center gap-1.5">
                            <input type="checkbox" [(ngModel)]="d.font.italic" [name]="'fi-' + i" class="size-3.5" />
                            <span>Italic</span>
                          </label>
                          <label class="block">
                            <span class="block text-ink-muted mb-1">Colour</span>
                            <input type="color" [(ngModel)]="d.font.color" [name]="'fc-' + i"
                                   class="h-8 w-12 p-0 border border-border rounded-md" />
                          </label>
                          <button type="button" (click)="fontOpenIdx.set(null)"
                                  class="h-8 px-3 ml-auto rounded-md border border-border text-ink-soft hover:bg-surface-muted">Done</button>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>

            @if (validationErrors().length > 0) {
              <div class="mt-3 text-[12px] text-danger-fg bg-danger-bg/40 border border-danger-fg/30 rounded-md px-3 py-2">
                ⚠ <strong>Fix before saving:</strong>
                <ul class="list-disc pl-5 mt-1">
                  @for (msg of validationErrors(); track $index) { <li>{{ msg }}</li> }
                </ul>
              </div>
            }
          }
        </div>

        <!-- Footer -->
        <footer class="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-surface-muted/40">
          <span class="text-[11px] text-ink-muted">
            {{ drafts().length }} row(s)
            @if (dirty()) { · <span class="text-warn-fg font-medium">unsaved changes</span> }
          </span>
          <div class="flex items-center gap-2">
            <button type="button" (click)="onDiscard()" [disabled]="saving()"
                    class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Discard changes
            </button>
            <button type="button" (click)="onSave()"
                    [disabled]="saving() || validationErrors().length > 0"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Save & close' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `,
})
export class ParameterEditorDialog {
  @Input({ required: true }) testId!: string;
  @Input({ required: true }) testName = '';
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved  = new EventEmitter<void>();

  private svc   = inject(LabCatalogService);
  private toast = inject(ToastService);

  protected readonly drafts   = signal<ParameterDraft[]>([]);
  protected readonly loading  = signal(true);
  protected readonly saving   = signal(false);
  protected readonly fontOpenIdx   = signal<number | null>(null);
  protected readonly rangesOpenIdx = signal<number | null>(null);
  protected readonly refScopes = REF_SCOPES;

  /** Snapshot of the loaded rows used to detect dirty state. JSON compare is
   *  cheap enough for the row counts a real test will have (<100). */
  private original = '';
  protected readonly dirty = computed(() => JSON.stringify(this.drafts()) !== this.original);

  protected readonly validationErrors = computed<string[]>(() => {
    const errs: string[] = [];
    this.drafts().forEach((d, i) => {
      if (!d.is_section_header && !d.parameter?.trim()) {
        errs.push(`Row ${i + 1}: parameter name is required.`);
      }
      if (!d.is_section_header && d.low_value != null && d.high_value != null
          && Number(d.low_value) > Number(d.high_value)) {
        errs.push(`Row ${i + 1}: Low must be ≤ High.`);
      }
      // Cohort range checks: low ≤ high, no duplicate scopes, scope not blank.
      const seen = new Set<string>();
      (d.ref_overrides ?? []).forEach((ov, oi) => {
        const scope = (ov.scope ?? '').toString().trim();
        if (!scope) {
          errs.push(`Row ${i + 1} cohort #${oi + 1}: scope is required.`);
        } else if (seen.has(scope)) {
          errs.push(`Row ${i + 1}: duplicate cohort scope "${scope}".`);
        } else {
          seen.add(scope);
        }
        if (ov.low != null && ov.high != null && Number(ov.low) > Number(ov.high)) {
          errs.push(`Row ${i + 1} cohort #${oi + 1}: Low must be ≤ High.`);
        }
      });
    });
    return errs;
  });

  private dragIdx: number | null = null;

  async ngOnInit() {
    try {
      const rows = await this.svc.listParameters(this.testId);
      const drafts = rows.map((r): ParameterDraft => ({
        id: r.id,
        sno: r.sno,
        is_section_header: r.is_section_header,
        section: r.section,
        parameter: r.parameter,
        default_value: r.default_value,
        unit: r.unit,
        low_value: r.low_value,
        high_value: r.high_value,
        normal_range_display: r.normal_range_display,
        method: r.method,
        font: { ...(r.font ?? {}) } as ParameterFont,
        ref_overrides: (r.ref_overrides ?? []) as RefOverride[],
      }));
      this.drafts.set(drafts);
      this.original = JSON.stringify(drafts);
    } catch (e) {
      this.toast.error('Could not load parameters', this.errMsg(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected addParameter() {
    this.drafts.update(rows => [...rows, this.emptyParameter(rows.length + 1)]);
  }

  protected addSectionHeader() {
    this.drafts.update(rows => [...rows, {
      ...this.emptyParameter(rows.length + 1),
      is_section_header: true,
      parameter: '',
      section: '',
    }]);
  }

  protected removeRow(i: number) {
    this.drafts.update(rows => rows.filter((_, idx) => idx !== i));
    if (this.fontOpenIdx() === i) this.fontOpenIdx.set(null);
  }

  protected openFont(i: number) {
    this.fontOpenIdx.set(this.fontOpenIdx() === i ? null : i);
  }

  protected openRanges(i: number) {
    this.rangesOpenIdx.set(this.rangesOpenIdx() === i ? null : i);
  }

  protected addRange(rowIdx: number) {
    this.drafts.update(rows => rows.map((r, idx) => {
      if (idx !== rowIdx) return r;
      const used = new Set((r.ref_overrides ?? []).map(o => o.scope));
      const firstFree = REF_SCOPES.find(s => !used.has(s.value))?.value ?? 'adult';
      const next: RefOverride = { scope: firstFree as RefScope, low: null, high: null, display: null };
      return { ...r, ref_overrides: [...(r.ref_overrides ?? []), next] };
    }));
  }

  protected removeRange(rowIdx: number, ovIdx: number) {
    this.drafts.update(rows => rows.map((r, idx) => {
      if (idx !== rowIdx) return r;
      return { ...r, ref_overrides: r.ref_overrides.filter((_, j) => j !== ovIdx) };
    }));
  }

  /** Compose a printable multi-line "Normal Range" string from the cohort
   *  overrides, mirroring the layout in clinical templates (one line per
   *  cohort with a friendly label). Replaces the current normal_range_display.
   */
  protected autofillNormalRange(rowIdx: number) {
    this.drafts.update(rows => rows.map((r, idx) => {
      if (idx !== rowIdx) return r;
      const lines = (r.ref_overrides ?? []).map(ov => {
        const label = REF_SCOPES.find(s => s.value === ov.scope)?.label ?? ov.scope;
        const txt = (ov.display ?? '').toString().trim()
          || (ov.low != null && ov.high != null ? `${ov.low} – ${ov.high}` : (ov.low != null ? `≥ ${ov.low}` : (ov.high != null ? `≤ ${ov.high}` : '—')));
        return `${label}: ${txt}`;
      });
      return { ...r, normal_range_display: lines.join('\n') };
    }));
  }

  protected onDragStart(i: number) { this.dragIdx = i; }
  protected onDrop(target: number) {
    const src = this.dragIdx;
    this.dragIdx = null;
    if (src == null || src === target) return;
    this.drafts.update(rows => {
      const next = rows.slice();
      const [moved] = next.splice(src, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  protected rowError(i: number, kind: 'parameter' | 'range'): boolean {
    const d = this.drafts()[i];
    if (!d) return false;
    if (kind === 'parameter') return !d.is_section_header && !d.parameter?.trim();
    if (kind === 'range') {
      return !d.is_section_header
        && d.low_value != null && d.high_value != null
        && Number(d.low_value) > Number(d.high_value);
    }
    return false;
  }

  protected inputCls(error: boolean, extra = ''): string {
    const base = `w-full h-8 px-2 text-[12px] bg-surface-card border rounded-md focus:outline-none focus:ring-[2px] ${extra}`;
    return error
      ? `${base} border-danger-fg ring-danger-fg/30 focus:border-danger-fg focus:ring-danger-fg/40`
      : `${base} border-border focus:border-primary-600 focus:ring-primary-100`;
  }

  protected async onSave() {
    if (this.validationErrors().length > 0) return;
    this.saving.set(true);
    try {
      await this.svc.replaceParameters(this.testId, this.drafts());
      this.toast.success('Parameters saved', `${this.drafts().length} row(s)`);
      this.saved.emit();
      this.closed.emit();
    } catch (e) {
      this.toast.error('Could not save', this.errMsg(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected onDiscard() {
    if (this.dirty() && !confirm('Discard unsaved changes to parameters?')) return;
    this.closed.emit();
  }

  private emptyParameter(sno: number): ParameterDraft {
    return {
      id: null,
      sno,
      is_section_header: false,
      section: null,
      parameter: '',
      default_value: null,
      unit: null,
      low_value: null,
      high_value: null,
      normal_range_display: null,
      method: null,
      font: {},
      ref_overrides: [],
    };
  }

  private errMsg(e: unknown): string {
    if (e == null) return 'Try again.';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const o = e as any;
    const parts = [o?.message, o?.details, o?.hint].filter(Boolean);
    return parts.length ? parts.join(' · ') : String(e);
  }
}
