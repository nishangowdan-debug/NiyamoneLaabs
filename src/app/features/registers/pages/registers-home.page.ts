import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { RegistersStore } from '../data/registers.store';
import { CATEGORY_LABELS, type RegisterCategory, type RegisterDefinition } from '../data/registers.types';

interface CategoryGroup {
  category: RegisterCategory;
  label: string;
  items: RegisterDefinition[];
}

@Component({
  selector: 'app-registers-home-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent],
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Registers</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ store.definitions().length }} registers across {{ groups().length }} categories · digital log books for facility &amp; statutory compliance
      </p>
    </div>
  </header>

  @if (error()) {
    <app-alert tone="danger">{{ error() }}</app-alert>
  }

  @if (!store.loaded()) {
    <p class="text-[13px] text-ink-muted">Loading registers…</p>
  }

  @for (g of groups(); track g.category) {
    <section class="flex flex-col gap-2">
      <h2 class="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">{{ g.label }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        @for (d of g.items; track d.code) {
          <a [routerLink]="['/registers', d.code]"
             class="rounded-lg border border-border bg-surface-card p-4 hover:border-primary-400 hover:shadow-sm transition flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="font-medium text-ink text-[14px]">{{ d.label }}</div>
              @if (d.requires_photo) {
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-info-bg text-info-fg">photo</span>
              }
            </div>
            @if (d.description) {
              <p class="text-[12px] text-ink-muted leading-snug">{{ d.description }}</p>
            }
            <div class="flex items-center gap-2 mt-auto pt-2 text-[11px] text-ink-faint">
              @if (d.uses_meter_asset) { <span>meter</span> }
              @if (d.requires_vendor)  { <span>· vendor</span> }
              @if (d.requires_ref_no)  { <span>· ref-no</span> }
              @if (d.retention_days)   { <span>· retain {{ d.retention_days }}d</span> }
            </div>
          </a>
        }
      </div>
    </section>
  }
</div>
  `,
})
export class RegistersHomePage implements OnInit {
  protected readonly store = inject(RegistersStore);
  protected readonly error = signal<string | null>(null);

  protected readonly groups = computed<CategoryGroup[]>(() => {
    const defs = this.store.definitions();
    const order: RegisterCategory[] = ['utility','fuel','housekeeping','waste','statutory','security','facility'];
    return order
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: defs.filter((d) => d.category === cat),
      }))
      .filter((g) => g.items.length > 0);
  });

  async ngOnInit() {
    try { await this.store.load(); }
    catch (e: any) { this.error.set(e?.message ?? 'Failed to load registers'); }
  }
}
