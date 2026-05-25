import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { RegistersService } from '../data/registers.service';
import { RegistersStore } from '../data/registers.store';
import type { RegisterDefinition, RegisterMeterAsset } from '../data/registers.types';

@Component({
  selector: 'app-register-entry-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AlertComponent],
  template: `
<div class="flex flex-col gap-4 max-w-[640px]">
  <header class="pb-4 border-b border-border">
    <div class="text-[11px] uppercase tracking-[0.08em] text-ink-faint mb-1">
      <a routerLink="/registers" class="hover:underline">Registers</a> ·
      <a [routerLink]="['/registers', code()]" class="hover:underline">{{ definition()?.label }}</a>
    </div>
    <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
      New entry
    </h1>
  </header>

  @if (error()) { <app-alert tone="danger">{{ error() }}</app-alert> }

  @if (definition(); as def) {
    <form (submit)="$event.preventDefault(); submit()" class="flex flex-col gap-3.5">

      @if (def.uses_meter_asset) {
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium text-ink-soft">Meter / Asset <span class="text-danger-fg">*</span></span>
          <select [(ngModel)]="assetId" name="asset" required class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card">
            <option [ngValue]="null" disabled>Select…</option>
            @for (a of assets(); track a.id) {
              <option [ngValue]="a.id">{{ a.label }} ({{ a.code }}) · last {{ a.last_reading ?? '—' }} {{ a.unit }}</option>
            }
          </select>
          @if (assets().length === 0) {
            <small class="text-[11px] text-warn-fg">No active assets configured for this register in your branch.</small>
          }
        </label>
      }

      @for (f of def.fields; track f.key) {
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium text-ink-soft">
            {{ f.label }}
            @if (f.unit) { <span class="text-ink-faint">({{ f.unit }})</span> }
            @if (f.required) { <span class="text-danger-fg">*</span> }
          </span>

          @switch (f.type) {
            @case ('meter_reading') {
              <input type="number" inputmode="decimal" step="any"
                     [name]="f.key" [(ngModel)]="payload[f.key]"
                     [required]="!!f.required" [min]="f.min ?? null"
                     class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card font-mono"/>
              @if (selectedAsset(); as a) {
                @if (a.last_reading != null && payload[f.key] != null && payload[f.key] !== '') {
                  <small class="text-[11px] text-ink-muted">
                    Previous: <b>{{ a.last_reading }} {{ a.unit }}</b> ·
                    Computed consumption: <b>{{ liveConsumption(f.key) }}</b>
                  </small>
                }
              }
            }
            @case ('number') {
              <input type="number" inputmode="decimal" step="any"
                     [name]="f.key" [(ngModel)]="payload[f.key]"
                     [required]="!!f.required" [min]="f.min ?? null" [max]="f.max ?? null"
                     class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card"/>
            }
            @case ('select') {
              <select [name]="f.key" [(ngModel)]="payload[f.key]" [required]="!!f.required"
                      class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card">
                <option [ngValue]="null" disabled>Select…</option>
                @for (opt of f.options ?? []; track opt) {
                  <option [ngValue]="opt">{{ opt }}</option>
                }
              </select>
            }
            @case ('textarea') {
              <textarea [name]="f.key" [(ngModel)]="payload[f.key]" rows="3"
                        class="px-2.5 py-1.5 border border-border rounded-md text-[13px] bg-surface-card"></textarea>
            }
            @case ('datetime') {
              <input type="datetime-local" [name]="f.key" [(ngModel)]="payload[f.key]" [required]="!!f.required"
                     class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card"/>
            }
            @default {
              <input type="text" [name]="f.key" [(ngModel)]="payload[f.key]" [required]="!!f.required"
                     class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card"/>
            }
          }
        </label>
      }

      @if (def.requires_ref_no) {
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium text-ink-soft">Reference / Invoice no <span class="text-danger-fg">*</span></span>
          <input type="text" name="refno" [(ngModel)]="refNumber" required
                 class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card"/>
        </label>
      }
      @if (def.requires_vendor) {
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium text-ink-soft">Vendor ID <span class="text-danger-fg">*</span></span>
          <input type="text" name="vendor" [(ngModel)]="vendorId" required placeholder="vendor uuid"
                 class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card font-mono"/>
          <small class="text-[11px] text-ink-faint">Vendor picker integration pending — paste UUID for now.</small>
        </label>
      }
      @if (def.requires_photo) {
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium text-ink-soft">Photo URL <span class="text-danger-fg">*</span></span>
          <input type="url" name="photo" [(ngModel)]="photoUrl" required placeholder="https://…"
                 class="h-9 px-2.5 border border-border rounded-md text-[13px] bg-surface-card"/>
          <small class="text-[11px] text-ink-faint">Storage upload integration pending — paste URL for now.</small>
        </label>
      }

      <div class="flex items-center gap-2 pt-3 border-t border-border mt-2">
        <button type="submit" [disabled]="saving()"
                class="h-9 px-3 rounded-md bg-primary-600 text-white text-[13px] font-medium hover:bg-primary-700 disabled:opacity-50">
          {{ saving() ? 'Saving…' : 'Save entry' }}
        </button>
        <a [routerLink]="['/registers', code()]"
           class="h-9 px-3 inline-flex items-center text-[13px] text-ink-muted hover:text-ink">Cancel</a>
      </div>
    </form>
  }
</div>
  `,
})
export class RegisterEntryPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private regSvc = inject(RegistersService);
  protected store = inject(RegistersStore);
  protected branch = inject(BranchStore);
  private toast = inject(ToastService);

  protected readonly code = signal<string>('');
  protected readonly assets = signal<RegisterMeterAsset[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly definition = computed<RegisterDefinition | undefined>(() =>
    this.store.byCode(this.code()),
  );

  protected payload: Record<string, any> = {};
  protected assetId: string | null = null;
  protected refNumber: string | null = null;
  protected vendorId: string | null = null;
  protected photoUrl: string | null = null;

  protected selectedAsset = computed<RegisterMeterAsset | undefined>(() =>
    this.assets().find((a) => a.id === this.assetId),
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((pm) => {
      this.code.set(pm.get('code') ?? '');
      this.payload = {};
      this.assetId = null;
      this.refNumber = null;
      this.vendorId = null;
      this.photoUrl = null;
      this.assets.set([]);
      this.error.set(null);
    });

    effect(async () => {
      const code = this.code();
      const branchId = this.branch.activeBranchId();
      if (!code) return;
      try {
        await this.store.load();
        const def = this.definition();
        if (def?.uses_meter_asset && branchId) {
          this.assets.set(await this.regSvc.listAssets(branchId, def.asset_type ?? null));
        } else {
          this.assets.set([]);
        }
      } catch (e: any) {
        this.error.set(e?.message ?? 'Failed to load definition');
      }
    });
  }

  protected liveConsumption(readingKey: string): string {
    const a = this.selectedAsset();
    const cur = Number(this.payload[readingKey]);
    if (!a || a.last_reading == null || isNaN(cur)) return '—';
    const diff = cur - Number(a.last_reading);
    return `${diff.toFixed(2)} ${a.unit}`;
  }

  async submit() {
    const def = this.definition();
    const branchId = this.branch.activeBranchId();
    if (!def || !branchId) {
      this.error.set('Pick an active branch first');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const id = await this.regSvc.createEntry({
        registerCode: def.code,
        branchId,
        payload:   this.payload,
        assetId:   def.uses_meter_asset ? this.assetId : null,
        refNumber: def.requires_ref_no ? this.refNumber : null,
        vendorId:  def.requires_vendor ? this.vendorId : null,
        photoUrl:  def.requires_photo  ? this.photoUrl : null,
        clientUuid: crypto.randomUUID(),
      });
      this.toast.success('Entry saved');
      this.router.navigate(['/registers', def.code, id]);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
