import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { differenceInDays, format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { InventoryService } from '../data/inventory.service';
import { InventoryStore } from '../data/inventory.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import type {
  InventoryBatch,
  InventoryFilter,
  InventoryItemView,
} from '../data/inventory.types';
import { CATEGORY_LABEL, CATEGORY_TONE } from '../data/inventory.types';
import type { InventoryCategory } from '../../../core/supabase/supabase.types';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface InventoryExportRow {
  sku: string;
  name: string;
  category: string;
  on_hand: number;
  unit: string;
  reorder_level: number;
  stock_value_rupees: number;
  earliest_expiry: string;
  days_to_expiry: string;
  status: string;
}

const STATUS_TONE: Record<InventoryItemView['status'], { chip: string; label: string }> = {
  in_stock: { chip: 'bg-good-bg text-good-fg',           label: 'In stock' },
  low:      { chip: 'bg-warn-bg text-warn-fg',           label: 'Below reorder' },
  out:      { chip: 'bg-danger-bg text-danger-fg',       label: 'Out of stock' },
  expiring: { chip: 'bg-warn-bg text-warn-fg',           label: 'Expiring soon' },
  expired:  { chip: 'bg-danger-bg text-danger-strong',   label: 'Expired' },
};

const COMPONENT_LABELS: Record<string, string> = {
  whole_blood:            'Whole Blood',
  prbc:                   'Packed RBC',
  ffp:                    'FFP',
  platelets:              'Platelets',
  cryo:                   'Cryoprecipitate',
  single_donor_platelets: 'SDP',
};

interface HaemovigilanceReport {
  window_from: string;
  window_to: string;
  transfusions: {
    total: number;
    completed: number;
    aborted: number;
    with_reaction: number;
    reaction_breakdown: Record<string, number>;
    by_component: Record<string, number>;
  };
  inventory: {
    discarded_units: number;
    discard_reasons: Record<string, number>;
    expired_units: number;
  };
  donations: {
    screen_failed_tti: number;
    screen_pending: number;
  };
  requests: {
    total: number;
    sla_breached: number;
    avg_tat_minutes: number;
  };
}

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Inventory</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          {{ store.totals().total.toLocaleString('en-IN') }} SKUs · branch HQ ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <app-export-menu [disabled]="store.visible().length === 0" (pick)="onExport($event)"/>
        @if (canWrite()) {
          <button type="button" (click)="openReceive()" class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Receive stock
          </button>
        }
      </div>
    </header>

    <!-- ── KPI grid (4 cards) ────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Total SKUs</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">
          {{ store.totals().total.toLocaleString('en-IN') }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">Active items in branch</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Below reorder</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().below > 0">
          {{ store.totals().below }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">Need restocking</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Expiring 90 d</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-danger-fg]="store.totals().expiring > 0">
          {{ store.totals().expiring }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">Items with batches near expiry</p>
      </article>

      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Stock value</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">
          {{ formatINR(store.totals().stockValueCents) }}
        </p>
        <p class="text-[11px] text-ink-muted mt-1.5">At cost basis</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl"
               placeholder="Search by name or SKU…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <select [value]="store.category()" (change)="onCategory($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option value="all">All categories</option>
        <option value="medication">Medications</option>
        <option value="disposable">Disposables</option>
        <option value="consumable">Consumables</option>
        <option value="reagent">Reagents</option>
        <option value="equipment">Equipment</option>
        <option value="other">Other</option>
      </select>

      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">{{ f.label }}</button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.totals().total.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load inventory">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Item table ────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">SKU</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Item</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Category</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Stock</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Earliest expiry</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Cost value</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.items().length === 0) {
            <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading inventory…</td></tr>
          } @else {
            @for (it of store.visible(); track it.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ it.sku }}</td>
                <td class="px-4 py-2.5">
                  <p class="text-[13px] font-medium text-ink">{{ it.name }}</p>
                  @if (it.notes) { <p class="text-[11px] text-ink-muted truncate max-w-[420px]">{{ it.notes }}</p> }
                </td>
                <td class="px-4 py-2.5">
                  <span [class]="categoryChipCls(it.category)">{{ CATEGORY_LABEL[it.category] }}</span>
                </td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2 min-w-[120px]">
                    <div class="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div [class]="stockBarCls(it)" [style.width]="stockBarWidth(it)"></div>
                    </div>
                    <span class="font-mono text-[12px] text-ink-soft whitespace-nowrap">
                      {{ it.totalOnHand }}
                      @if (it.reorder_point > 0) {
                        <span class="text-ink-muted text-[10px]">/ {{ it.reorder_point }}</span>
                      }
                      <span class="text-ink-muted text-[10px] ml-0.5">{{ it.unit_of_measure }}</span>
                    </span>
                  </div>
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  @if (it.earliestExpiry) {
                    <span class="font-mono text-[12px]"
                          [class.text-danger-fg]="(it.expiryDays ?? 999) < 0"
                          [class.text-warn-fg]="(it.expiryDays ?? 999) >= 0 && (it.expiryDays ?? 999) <= 90"
                          [class.text-ink-soft]="(it.expiryDays ?? 999) > 90">
                      {{ formatDate(it.earliestExpiry) }}
                    </span>
                    @if (it.expiryDays !== null) {
                      <small class="block text-[10px] text-ink-muted">{{ expiryLabel(it.expiryDays) }}</small>
                    }
                  } @else {
                    <span class="text-[12px] text-ink-muted">—</span>
                  }
                </td>
                <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink-soft">{{ formatINR(it.totalCostCents) }}</td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(it.status)">{{ STATUS_TONE[it.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  @if (canWrite()) {
                    <div class="inline-flex items-center gap-1">
                      <button type="button" (click)="openReceive(it)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                        Receive
                      </button>
                      <button type="button" (click)="openAdjust(it)" [disabled]="it.batches.length === 0" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                        Adjust
                      </button>
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No items match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openReceive()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Receive your first batch →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Haemovigilance report (B7) ─────────────────────────── -->
    <article class="bg-surface-card border border-border rounded-[10px] p-[16px_18px] mt-5">
      <header class="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Blood Bank</p>
          <h2 class="font-display text-[18px] font-medium tracking-[-0.01em] leading-[1.2] mt-0.5">
            Haemovigilance · period summary
          </h2>
          <p class="text-[11px] text-ink-muted mt-0.5">
            Aggregates across transfusions, discards, expiries, donor screening and SLA.
          </p>
        </div>
        <div class="flex items-end gap-2 flex-wrap">
          <label class="block">
            <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">From</span>
            <input type="date" [(ngModel)]="hvFrom" name="hvFrom"
                   class="h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md text-ink" />
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">To</span>
            <input type="date" [(ngModel)]="hvTo" name="hvTo"
                   class="h-8 px-2 text-[12px] bg-surface-card border border-border rounded-md text-ink" />
          </label>
          <button type="button" (click)="runHaemovigilance()" [disabled]="hvBusy()"
                  class="h-8 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
            {{ hvBusy() ? 'Running…' : 'Run report' }}
          </button>
          <button type="button" (click)="exportHaemovigilanceCsv()" [disabled]="!hvReport()"
                  class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            Export CSV
          </button>
        </div>
      </header>

      @if (hvError()) {
        <p class="text-[12px] text-danger-fg mb-2">{{ hvError() }}</p>
      }

      @if (hvReport(); as r) {
        <!-- Top-line metrics -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Requests</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5">{{ r.requests.total }}</p>
            <p class="text-[10px] text-ink-muted mt-0.5">avg TAT {{ r.requests.avg_tat_minutes }} m</p>
          </div>
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">SLA breached</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5"
               [class.text-danger-fg]="r.requests.sla_breached > 0">
              {{ r.requests.sla_breached }}
            </p>
            <p class="text-[10px] text-ink-muted mt-0.5">of {{ r.requests.total }}</p>
          </div>
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Transfusions</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5">{{ r.transfusions.total }}</p>
            <p class="text-[10px] text-ink-muted mt-0.5">{{ r.transfusions.completed }} completed · {{ r.transfusions.aborted }} aborted</p>
          </div>
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Reactions</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5"
               [class.text-warn-fg]="r.transfusions.with_reaction > 0">
              {{ r.transfusions.with_reaction }}
            </p>
            <p class="text-[10px] text-ink-muted mt-0.5">incl. mild / moderate / severe</p>
          </div>
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Discards</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5">{{ r.inventory.discarded_units }}</p>
            <p class="text-[10px] text-ink-muted mt-0.5">{{ r.inventory.expired_units }} expired</p>
          </div>
          <div class="rounded-md border border-border p-2.5">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">TTI failed</p>
            <p class="font-display text-[22px] font-medium leading-[1.1] mt-0.5"
               [class.text-danger-fg]="r.donations.screen_failed_tti > 0">
              {{ r.donations.screen_failed_tti }}
            </p>
            <p class="text-[10px] text-ink-muted mt-0.5">{{ r.donations.screen_pending }} screening pending</p>
          </div>
        </div>

        <!-- Reaction breakdown -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="rounded-md border border-border p-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">Reaction breakdown</p>
            @if (objectKeys(r.transfusions.reaction_breakdown).length === 0) {
              <p class="text-[12px] text-ink-soft">No transfusions in window.</p>
            } @else {
              <table class="min-w-full text-[12px]">
                <thead class="text-ink-soft text-left">
                  <tr><th class="px-2 py-1">Reaction</th><th class="px-2 py-1 text-right">Count</th></tr>
                </thead>
                <tbody>
                  @for (k of objectKeys(r.transfusions.reaction_breakdown); track k) {
                    <tr class="border-t border-border">
                      <td class="px-2 py-1 capitalize">{{ k }}</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ r.transfusions.reaction_breakdown[k] }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>

          <div class="rounded-md border border-border p-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">Components transfused</p>
            @if (objectKeys(r.transfusions.by_component).length === 0) {
              <p class="text-[12px] text-ink-soft">No components transfused in window.</p>
            } @else {
              <table class="min-w-full text-[12px]">
                <thead class="text-ink-soft text-left">
                  <tr><th class="px-2 py-1">Component</th><th class="px-2 py-1 text-right">Units</th></tr>
                </thead>
                <tbody>
                  @for (k of objectKeys(r.transfusions.by_component); track k) {
                    <tr class="border-t border-border">
                      <td class="px-2 py-1">{{ componentLabel(k) }}</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ r.transfusions.by_component[k] }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </div>

        <p class="mt-3 text-[10px] text-ink-muted">
          Window: {{ dateOnly(r.window_from) }} → {{ dateOnly(r.window_to) }}
          · generated {{ formatGenerated(hvGeneratedAt()) }}
        </p>
      } @else {
        <p class="text-[12px] text-ink-soft">Pick a date range and run the report.</p>
      }
    </article>

    <!-- ── Receive modal ─────────────────────────────────────── -->
    @if (receiveOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeReceive()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Receive stock</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Adds a new batch to inventory and writes a ledger entry.</p>

          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-12 md:col-span-7 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Item SKU</span>
              <select [(ngModel)]="receiveSku" name="sku"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (i of store.items(); track i.id) {
                  <option [value]="i.sku">{{ i.sku }} · {{ i.name }}</option>
                }
              </select>
            </label>

            <label class="col-span-6 md:col-span-5 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Batch #</span>
              <input type="text" [(ngModel)]="receiveBatch" name="batch" placeholder="B240501"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Qty received</span>
              <input type="number" [(ngModel)]="receiveQty" name="qty" min="1"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Unit cost (₹)</span>
              <input type="number" [(ngModel)]="receiveUnitCostRupees" name="cost" min="0" step="0.01" placeholder="0.00"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Vendor (optional)</span>
              <input type="text" [(ngModel)]="receiveVendor" name="vendor"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Mfg date</span>
              <input type="date" [(ngModel)]="receiveMfg" name="mfg"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Expiry date</span>
              <input type="date" [(ngModel)]="receiveExp" name="exp"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes (optional)</span>
              <input type="text" [(ngModel)]="receiveNotes" name="notes"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeReceive()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmReceive()" [disabled]="!canSubmitReceive() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Receiving…' : 'Receive batch' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Adjust modal ──────────────────────────────────────── -->
    @if (adjustOpen(); as ctx) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeAdjust()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[440px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Adjust stock</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">{{ ctx.item.name }} · {{ ctx.item.sku }}</p>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Batch</span>
            <select [(ngModel)]="adjustBatchId" name="batch"
                    class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                    [style.background-image]="chevronUrl" style="background-position: right 8px center;">
              <option value="">—</option>
              @for (b of ctx.item.batches; track b.id) {
                <option [value]="b.id">{{ b.batch_number }} · qty {{ b.qty_on_hand }}{{ b.expiry_date ? ' · exp ' + formatDate(b.expiry_date) : '' }}{{ b.is_expired ? ' · expired' : '' }}</option>
              }
            </select>
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Qty delta (negative to reduce)
            </span>
            <input type="number" [(ngModel)]="adjustDelta" name="delta" placeholder="-3"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason</span>
            <input type="text" [(ngModel)]="adjustReason" name="reason" placeholder="Damaged in transit, count correction…"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeAdjust()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmAdjust()" [disabled]="!canSubmitAdjust() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Adjusting…' : 'Apply adjustment' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InventoryPage implements OnInit, OnDestroy {
  protected readonly store = inject(InventoryStore);
  private svc = inject(InventoryService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });

  protected readonly canWrite = computed(() => this.auth.has('inventory.write'));
  protected readonly busy = signal(false);

  // Re-export to template
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly STATUS_TONE = STATUS_TONE;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: InventoryFilter; label: string }[] = [
    { value: 'all',      label: 'All' },
    { value: 'low',      label: 'Below reorder' },
    { value: 'expiring', label: 'Expiring' },
    { value: 'out',      label: 'Out' },
  ];

  // ── Receive modal state
  protected readonly receiveOpen = signal(false);
  protected receiveSku = '';
  protected receiveBatch = '';
  protected receiveQty: number | null = null;
  protected receiveUnitCostRupees: number | null = null;
  protected receiveVendor = '';
  protected receiveMfg = '';
  protected receiveExp = '';
  protected receiveNotes = '';

  // ── Adjust modal state
  protected readonly adjustOpen = signal<{ item: InventoryItemView } | null>(null);
  protected adjustBatchId = '';
  protected adjustDelta: number | null = null;
  protected adjustReason = '';

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected onCategory(value: string)              { this.store.setCategory(value as 'all' | InventoryCategory); }
  protected onFilter(value: InventoryFilter)       { this.store.setFilter(value); }

  protected filterBtnCls(value: InventoryFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected statusChipCls(s: InventoryItemView['status']): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }

  protected categoryChipCls(c: InventoryCategory): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${CATEGORY_TONE[c]}`;
  }

  protected stockBarCls(it: InventoryItemView): string {
    if (it.totalOnHand === 0)              return 'h-full bg-danger-fg';
    if (it.totalOnHand <= it.reorder_point) return 'h-full bg-warn-fg';
    return 'h-full bg-good-fg';
  }

  protected stockBarWidth(it: InventoryItemView): string {
    const target = Math.max(it.reorder_point * 2, 1);
    const pct = Math.min(100, Math.round((it.totalOnHand / target) * 100));
    return `${pct}%`;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  }

  protected expiryLabel(days: number): string {
    if (days < 0) return `${-days}d overdue`;
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days <= 90) return `${days}d`;
    const months = Math.round(days / 30);
    return `${months}mo`;
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  // ── Receive flow ──────────────────────────────────
  protected openReceive(prefill?: InventoryItemView) {
    this.receiveSku = prefill?.sku ?? '';
    this.receiveBatch = '';
    this.receiveQty = null;
    this.receiveUnitCostRupees = null;
    this.receiveVendor = '';
    this.receiveMfg = '';
    this.receiveExp = '';
    this.receiveNotes = '';
    this.receiveOpen.set(true);
  }

  protected closeReceive() {
    this.receiveOpen.set(false);
  }

  protected canSubmitReceive(): boolean {
    return !!(this.receiveSku && this.receiveBatch.trim() && this.receiveQty && this.receiveQty > 0);
  }

  protected async confirmReceive() {
    if (!this.canSubmitReceive()) return;
    this.busy.set(true);
    try {
      await this.svc.receive({
        sku: this.receiveSku,
        batchNumber: this.receiveBatch.trim(),
        qty: this.receiveQty!,
        unitCostCents: this.receiveUnitCostRupees ? Math.round(this.receiveUnitCostRupees * 100) : undefined,
        mfgDate: this.receiveMfg || undefined,
        expiryDate: this.receiveExp || undefined,
        vendorName: this.receiveVendor.trim() || undefined,
        notes: this.receiveNotes.trim() || undefined,
      });
      this.toast.success('Received', `${this.receiveQty} × ${this.receiveSku}`);
      this.receiveOpen.set(false);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not receive', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  // ── Haemovigilance (B7) ──────────────────────────────
  private supabase = inject(SupabaseService);
  protected hvFrom = this.toIsoDate(new Date(Date.now() - 30 * 86_400_000));
  protected hvTo   = this.toIsoDate(new Date());
  protected hvBusy = signal(false);
  protected hvError = signal<string | null>(null);
  protected hvReport = signal<HaemovigilanceReport | null>(null);
  protected hvGeneratedAt = signal<Date | null>(null);

  protected objectKeys = (o: Record<string, unknown> | null | undefined): string[] =>
    o ? Object.keys(o) : [];

  protected componentLabel(code: string): string {
    return COMPONENT_LABELS[code] ?? code;
  }

  protected dateOnly(iso: string): string {
    return (iso ?? '').slice(0, 10);
  }

  protected formatGenerated(d: Date | null): string {
    return d ? format(d, 'd MMM HH:mm') : '';
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  protected async runHaemovigilance() {
    this.hvBusy.set(true);
    this.hvError.set(null);
    try {
      const fromIso = `${this.hvFrom}T00:00:00Z`;
      const toIso   = `${this.hvTo}T23:59:59Z`;
      const { data, error } = await (this.supabase.client as any)
        .rpc('bb_haemovigilance_report', { p_from: fromIso, p_to: toIso });
      if (error) throw error;
      this.hvReport.set(data as HaemovigilanceReport);
      this.hvGeneratedAt.set(new Date());
    } catch (e: any) {
      this.hvError.set(e?.message ?? 'Failed to run report');
    } finally {
      this.hvBusy.set(false);
    }
  }

  protected exportHaemovigilanceCsv() {
    const r = this.hvReport();
    if (!r) return;
    const rows: string[][] = [
      ['Window From', this.dateOnly(r.window_from)],
      ['Window To',   this.dateOnly(r.window_to)],
      [],
      ['Section', 'Metric', 'Value'],
      ['requests', 'total',                   String(r.requests.total)],
      ['requests', 'sla_breached',            String(r.requests.sla_breached)],
      ['requests', 'avg_tat_minutes',         String(r.requests.avg_tat_minutes)],
      ['transfusions', 'total',               String(r.transfusions.total)],
      ['transfusions', 'completed',           String(r.transfusions.completed)],
      ['transfusions', 'aborted',             String(r.transfusions.aborted)],
      ['transfusions', 'with_reaction',       String(r.transfusions.with_reaction)],
      ['inventory', 'discarded_units',        String(r.inventory.discarded_units)],
      ['inventory', 'expired_units',          String(r.inventory.expired_units)],
      ['donations', 'screen_failed_tti',      String(r.donations.screen_failed_tti)],
      ['donations', 'screen_pending',         String(r.donations.screen_pending)],
    ];
    for (const k of this.objectKeys(r.transfusions.reaction_breakdown)) {
      rows.push(['reaction', k, String(r.transfusions.reaction_breakdown[k])]);
    }
    for (const k of this.objectKeys(r.transfusions.by_component)) {
      rows.push(['component', k, String(r.transfusions.by_component[k])]);
    }
    const csv = rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haemovigilance_${this.hvFrom}_${this.hvTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Adjust flow ────────────────────────────────────
  protected openAdjust(item: InventoryItemView) {
    this.adjustBatchId = item.batches[0]?.id ?? '';
    this.adjustDelta = null;
    this.adjustReason = '';
    this.adjustOpen.set({ item });
  }

  protected closeAdjust() {
    this.adjustOpen.set(null);
  }

  protected canSubmitAdjust(): boolean {
    return !!(this.adjustBatchId && this.adjustDelta && this.adjustDelta !== 0 && this.adjustReason.trim());
  }

  protected async confirmAdjust() {
    if (!this.canSubmitAdjust()) return;
    this.busy.set(true);
    try {
      await this.svc.adjust({
        batchId: this.adjustBatchId,
        qtyDelta: this.adjustDelta!,
        reason: this.adjustReason.trim(),
      });
      this.toast.success('Adjusted', `Δ ${this.adjustDelta}`);
      this.adjustOpen.set(null);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not adjust', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const items = this.store.visible();
    if (items.length === 0) return;

    const STATUS_LABEL: Record<InventoryItemView['status'], string> = {
      in_stock: 'In stock', low: 'Below reorder', out: 'Out of stock',
      expiring: 'Expiring soon', expired: 'Expired',
    };

    const rows: InventoryExportRow[] = items.map(it => ({
      sku:                (it as any).sku ?? (it as any).code ?? '',
      name:               it.name,
      category:           CATEGORY_LABEL[it.category],
      on_hand:            it.totalOnHand,
      unit:               (it as any).unit ?? '',
      reorder_level:      (it as any).reorder_level ?? 0,
      stock_value_rupees: it.totalCostCents / 100,
      earliest_expiry:    it.earliestExpiry ?? '',
      days_to_expiry:     it.expiryDays == null ? '' : String(it.expiryDays),
      status:             STATUS_LABEL[it.status],
    }));

    const columns: ExportColumn<InventoryExportRow>[] = [
      { key: 'sku',                header: 'SKU',          width: 14, align: 'left' },
      { key: 'name',               header: 'Item',         width: 32, align: 'left' },
      { key: 'category',           header: 'Category',     width: 14, align: 'left' },
      { key: 'on_hand',            header: 'On hand',      width: 10, align: 'right', format: 'integer' },
      { key: 'unit',               header: 'Unit',         width: 8,  align: 'left' },
      { key: 'reorder_level',      header: 'Reorder lvl.', width: 10, align: 'right', format: 'integer' },
      { key: 'stock_value_rupees', header: 'Stock value (₹)', width: 16, align: 'right', format: 'inr' },
      { key: 'earliest_expiry',    header: 'Earliest exp.', width: 12, align: 'center', format: 'date' },
      { key: 'days_to_expiry',     header: 'Days to exp.',  width: 10, align: 'right' },
      { key: 'status',             header: 'Status',        width: 14, align: 'left' },
    ];

    const totalValueCents = items.reduce((s, it) => s + it.totalCostCents, 0);

    const report: ExportableReport<InventoryExportRow> = {
      filename: `Inventory_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Inventory Stock Report',
      subtitle: `${items.length} SKUs visible`,
      meta: {
        filters: [
          { label: 'Total SKUs',  value: String(this.store.totals().total) },
          { label: 'Below reorder', value: String(this.store.totals().below) },
          { label: 'Expiring',    value: String(this.store.totals().expiring) },
          { label: 'Stock value', value: '₹' + (totalValueCents / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
        ],
      },
      columns,
      rows,
      grandTotals: {
        name: 'TOTAL STOCK VALUE',
        stock_value_rupees: totalValueCents / 100,
      },
      footer: 'Sree Diagnostics · Inventory Stock Report',
    };

    await this.exportSvc.export(fmt, report);
  }
}
