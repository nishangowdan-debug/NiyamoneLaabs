import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { PharmacyService } from '../data/pharmacy.service';
import type { CatalogItem } from '../data/pharmacy.types';
import { ToastService } from '../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-pharmacy-catalog-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Pharmacy</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/pharmacy" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive)">📋 Queue</a>
      <a routerLink="/pharmacy/pos" routerLinkActive #pa="routerLinkActive"
         [class]="tabCls(pa.isActive)">🧾 POS / Walk-in</a>
      <a routerLink="/pharmacy/stock" routerLinkActive #sa="routerLinkActive"
         [class]="tabCls(sa.isActive)">📦 Stock</a>
      <a routerLink="/pharmacy/history" routerLinkActive #ha="routerLinkActive"
         [class]="tabCls(ha.isActive)">🧾 History</a>
      <a routerLink="/pharmacy/settings" routerLinkActive #se="routerLinkActive"
         [class]="tabCls(se.isActive)">⚙️ Settings</a>
    </nav>
  </div>
  <p class="text-[11px] text-ink-muted">{{ total() }} active medication(s)</p>
</header>

<article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
  <header class="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
    <div class="flex-1">
      <input [formControl]="searchCtrl" type="text"
             placeholder="Search by generic, brand, SKU, therapeutic class…"
             class="w-full max-w-[420px] h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
    </div>
    <div class="flex items-center gap-2">
      <button (click)="prevPage()" [disabled]="offset() === 0 || loading()"
              class="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">← Prev</button>
      <span class="text-[11px] text-ink-muted font-mono">{{ pageStart() }}–{{ pageEnd() }} / {{ total() }}</span>
      <button (click)="nextPage()" [disabled]="!hasMore() || loading()"
              class="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">Next →</button>
    </div>
  </header>

  @if (loading()) {
    <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading…</div>
  } @else if (!items().length) {
    <div class="px-6 py-12 text-center text-[12px] text-ink-muted">No matches.</div>
  } @else {
    <div class="overflow-x-auto">
      <table class="w-full text-[12px]">
        <thead>
          <tr class="bg-surface-muted text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">
            <th class="px-3 py-2 w-[6%]">SKU</th>
            <th class="px-3 py-2 w-[22%]">Generic</th>
            <th class="px-3 py-2 w-[20%]">Brands</th>
            <th class="px-3 py-2 w-[14%]">Forms</th>
            <th class="px-3 py-2 w-[14%]">Strengths</th>
            <th class="px-3 py-2 w-[14%]">Class / Use</th>
            <th class="px-3 py-2 w-[5%] text-right">GST</th>
            <th class="px-3 py-2 w-[5%] text-right">MRP</th>
          </tr>
        </thead>
        <tbody>
          @for (it of items(); track it.id; let i = $index) {
            <tr class="border-t border-border" [class.bg-surface-muted]="i % 2 === 1">
              <td class="px-3 py-2 font-mono text-[11px] text-ink-muted">{{ it.sku }}</td>
              <td class="px-3 py-2 font-semibold text-ink">{{ it.generic_name }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ (it.brand_names ?? []).join(', ') }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ (it.forms ?? []).join(' / ') }}</td>
              <td class="px-3 py-2 text-ink-soft">{{ (it.strengths ?? []).join(', ') }}</td>
              <td class="px-3 py-2">
                <p class="text-ink-soft">{{ it.therapeutic_class }}</p>
                @if (it.primary_use) { <p class="text-[10px] text-ink-faint italic">{{ it.primary_use }}</p> }
              </td>
              <td class="px-3 py-2 text-right font-mono">{{ it.gst_rate }}%</td>
              <td class="px-3 py-2 text-right font-mono font-semibold text-primary-700">{{ formatINR(it.default_unit_price_cents) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</article>
  `,
})
export class PharmacyCatalogPage implements OnInit {
  private svc   = inject(PharmacyService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly items   = signal<CatalogItem[]>([]);
  protected readonly total   = signal(0);
  protected readonly offset  = signal(0);
  protected readonly limit   = signal(50);
  protected readonly loading = signal(false);

  protected readonly pageStart = computed(() => this.items().length ? this.offset() + 1 : 0);
  protected readonly pageEnd   = computed(() => this.offset() + this.items().length);
  protected readonly hasMore   = computed(() => this.pageEnd() < this.total());

  async ngOnInit() {
    await this.load();
    this.searchCtrl.valueChanges
      .pipe(debounceTime(220), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.offset.set(0); void this.load(); });
  }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.svc.listCatalog({
        search: this.searchCtrl.value, offset: this.offset(), limit: this.limit(),
      });
      this.items.set(res.items);
      this.total.set(res.total);
    } catch (e) {
      this.toast.error('Could not load catalog', this.errMsg(e));
    } finally { this.loading.set(false); }
  }

  protected nextPage() { this.offset.update(o => o + this.limit()); void this.load(); }
  protected prevPage() { this.offset.update(o => Math.max(0, o - this.limit())); void this.load(); }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
  protected formatINR(c: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((c ?? 0) / 100);
  }
  private errMsg(e: unknown): string {
    if (!e) return 'Try again.';
    if (typeof e === 'string') return e;
    const o = e as Record<string, any>;
    return o['message'] || o['error_description'] || o['details'] || o['hint'] || 'Try again.';
  }
}
