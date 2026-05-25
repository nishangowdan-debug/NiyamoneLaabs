import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { RegistersService } from '../data/registers.service';
import type { RegisterDefinition, RegisterMeterAsset } from '../data/registers.types';

interface AssetForm {
  id: string | null;
  code: string;
  label: string;
  unit: string;
  capacity: number | null;
  active: boolean;
}

const blankForm = (): AssetForm => ({
  id: null, code: '', label: '', unit: '', capacity: null, active: true,
});

@Component({
  selector: 'app-asset-manager-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
@if (open) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="close()">
    <div class="w-full max-w-2xl rounded-lg bg-surface-card border border-border shadow-2xl flex flex-col max-h-[90vh]" (click)="$event.stopPropagation()">
      <header class="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h2 class="font-display text-[18px] font-medium text-ink leading-tight">Manage assets · {{ definition?.label }}</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Meters / tanks of type <span class="font-mono">{{ definition?.asset_type ?? 'any' }}</span> for this branch</p>
        </div>
        <button type="button" (click)="close()"
                class="h-8 w-8 rounded-md hover:bg-surface-subtle text-ink-muted text-[18px] leading-none">×</button>
      </header>

      <div class="overflow-y-auto px-5 py-4 flex flex-col gap-5">
        @if (error()) {
          <div class="rounded-md border border-danger-border bg-danger-bg/40 text-danger-fg text-[12px] px-3 py-2">{{ error() }}</div>
        }

        <!-- ── List of existing assets ─────────────────────────────────────── -->
        <section>
          <h3 class="text-[11px] uppercase tracking-[0.08em] text-ink-faint mb-2">Existing assets</h3>
          <div class="rounded-md border border-border overflow-hidden">
            <table class="w-full text-[13px]">
              <thead class="bg-bg-muted text-ink-muted">
                <tr>
                  <th class="text-left px-3 py-1.5 font-medium">Code</th>
                  <th class="text-left px-3 py-1.5 font-medium">Label</th>
                  <th class="text-left px-3 py-1.5 font-medium">Unit</th>
                  <th class="text-right px-3 py-1.5 font-medium">Capacity</th>
                  <th class="text-right px-3 py-1.5 font-medium">Last reading</th>
                  <th class="text-center px-3 py-1.5 font-medium">Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (a of assets(); track a.id) {
                  <tr class="border-t border-border" [class.opacity-50]="!a.active">
                    <td class="px-3 py-1.5 font-mono text-ink">{{ a.code }}</td>
                    <td class="px-3 py-1.5 text-ink">{{ a.label }}</td>
                    <td class="px-3 py-1.5 text-ink-muted">{{ a.unit }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-ink-muted">{{ a.capacity ?? '—' }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-ink-muted">{{ a.last_reading ?? '—' }}</td>
                    <td class="px-3 py-1.5 text-center">
                      @if (a.active) {
                        <span class="text-[11px] px-1.5 py-0.5 rounded bg-good-bg text-good-fg">yes</span>
                      } @else {
                        <span class="text-[11px] px-1.5 py-0.5 rounded bg-bg-muted text-ink-muted">no</span>
                      }
                    </td>
                    <td class="px-3 py-1.5 text-right whitespace-nowrap">
                      <button type="button" (click)="edit(a)"
                              class="text-[12px] text-primary-700 hover:underline mr-2">Edit</button>
                      <button type="button" (click)="remove(a)" [disabled]="busy()"
                              class="text-[12px] text-danger-fg hover:underline disabled:opacity-50">Delete</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="px-3 py-4 text-center text-ink-muted text-[12px]">No assets yet — add one below.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <!-- ── Add / edit form ─────────────────────────────────────────────── -->
        <section>
          <h3 class="text-[11px] uppercase tracking-[0.08em] text-ink-faint mb-2">
            {{ form().id ? 'Edit asset' : 'Add new asset' }}
          </h3>
          <div class="grid grid-cols-12 gap-3">
            <label class="col-span-3 block">
              <span class="block text-[11px] text-ink-muted mb-1">Code *</span>
              <input [(ngModel)]="formModel.code" name="code" maxlength="40"
                     [disabled]="!!form().id"
                     class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface-card disabled:bg-bg-muted disabled:text-ink-muted"/>
            </label>
            <label class="col-span-5 block">
              <span class="block text-[11px] text-ink-muted mb-1">Label *</span>
              <input [(ngModel)]="formModel.label" name="label" maxlength="120"
                     class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface-card"/>
            </label>
            <label class="col-span-2 block">
              <span class="block text-[11px] text-ink-muted mb-1">Unit *</span>
              <input [(ngModel)]="formModel.unit" name="unit" maxlength="16"
                     [placeholder]="defaultUnit()"
                     class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface-card"/>
            </label>
            <label class="col-span-2 block">
              <span class="block text-[11px] text-ink-muted mb-1">Capacity</span>
              <input type="number" [(ngModel)]="formModel.capacity" name="capacity" min="0" step="any"
                     class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface-card"/>
            </label>
            <label class="col-span-12 inline-flex items-center gap-2 text-[12px] text-ink-soft">
              <input type="checkbox" [(ngModel)]="formModel.active" name="active"/>
              Active (uncheck to retire without deleting)
            </label>
          </div>
        </section>
      </div>

      <footer class="px-5 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg-subtle/30">
        @if (form().id) {
          <button type="button" (click)="resetForm()" class="h-9 px-3 rounded-md border border-border text-[13px] text-ink-soft hover:bg-surface-subtle">Cancel edit</button>
        }
        <button type="button" (click)="close()" class="h-9 px-3 rounded-md border border-border text-[13px] text-ink-soft hover:bg-surface-subtle">Close</button>
        <button type="button" (click)="save()" [disabled]="busy() || !canSave()"
                class="h-9 px-3 rounded-md bg-primary-600 text-white text-[13px] font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ form().id ? 'Update asset' : 'Add asset' }}
        </button>
      </footer>
    </div>
  </div>
}
  `,
})
export class AssetManagerDialogComponent implements OnChanges {
  private regSvc = inject(RegistersService);
  private branch = inject(BranchStore);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() definition: RegisterDefinition | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  protected readonly assets = signal<RegisterMeterAsset[]>([]);
  protected readonly form = signal<AssetForm>(blankForm());
  protected formModel: AssetForm = blankForm();
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.resetForm();
      void this.reload();
    }
  }

  protected canSave(): boolean {
    const f = this.formModel;
    return f.code.trim().length > 0 && f.label.trim().length > 0 && f.unit.trim().length > 0;
  }

  protected defaultUnit(): string {
    const t = this.definition?.asset_type ?? '';
    if (t.startsWith('eb')) return 'kWh';
    if (t === 'dg_tank') return 'L';
    return '';
  }

  protected close(): void {
    this.closed.emit();
  }

  protected edit(a: RegisterMeterAsset): void {
    this.formModel = {
      id: a.id, code: a.code, label: a.label, unit: a.unit,
      capacity: a.capacity, active: a.active,
    };
    this.form.set({ ...this.formModel });
  }

  protected resetForm(): void {
    this.formModel = blankForm();
    this.form.set({ ...this.formModel });
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave() || !this.definition) return;
    const branchId = this.branch.activeBranchId();
    if (!branchId) { this.error.set('Pick a specific branch first (not "All hospitals").'); return; }

    this.busy.set(true);
    this.error.set(null);
    try {
      const f = this.formModel;
      const assetType = this.definition.asset_type ?? f.code; // when def is type-agnostic
      if (f.id) {
        await this.regSvc.updateAsset(f.id, {
          label: f.label.trim(),
          unit: (f.unit.trim() || this.defaultUnit()),
          capacity: f.capacity,
          active: f.active,
        });
        this.toast.success('Asset updated');
      } else {
        await this.regSvc.createAsset({
          branch_id: branchId,
          asset_type: assetType,
          code: f.code.trim(),
          label: f.label.trim(),
          unit: (f.unit.trim() || this.defaultUnit() || 'unit'),
          capacity: f.capacity,
          active: f.active,
        });
        this.toast.success('Asset added');
      }
      this.resetForm();
      await this.reload();
      this.changed.emit();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to save asset');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(a: RegisterMeterAsset): Promise<void> {
    if (!confirm(`Delete asset "${a.label}"? Entries that reference it will fail to load.`)) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.regSvc.deleteAsset(a.id);
      this.toast.success('Asset deleted');
      await this.reload();
      this.changed.emit();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to delete (asset may still be referenced by entries — uncheck Active instead).');
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    const branchId = this.branch.activeBranchId();
    if (!branchId || !this.definition) {
      this.assets.set([]);
      return;
    }
    try {
      // Show all assets (active + inactive) of this register's asset_type.
      // We bypass listAssets() because that filters by active=true.
      const list = await this.regSvc.listAssetsAll(branchId, this.definition.asset_type ?? null);
      this.assets.set(list);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load assets');
    }
  }
}
