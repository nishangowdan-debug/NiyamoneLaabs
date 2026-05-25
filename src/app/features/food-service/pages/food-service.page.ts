import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { format } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { FoodService } from '../data/food.service';
import type { DietOrder, MealDelivery, DietType, MealStatus } from '../data/food.types';

type Tab = 'ipd' | 'cafeteria' | 'staff';

const DIET_CHIP: Record<DietType, { bg: string; fg: string; label: string }> = {
  regular:  { bg: 'bg-surface-muted', fg: 'text-ink-soft', label: 'Regular' },
  diabetic: { bg: 'bg-warn-bg',       fg: 'text-warn-fg', label: 'Diabetic' },
  cardiac:  { bg: 'bg-danger-bg',     fg: 'text-danger-fg', label: 'Cardiac' },
  renal:    { bg: 'bg-info-bg',       fg: 'text-info-fg', label: 'Renal' },
  soft:     { bg: 'bg-good-bg',       fg: 'text-good-fg', label: 'Soft' },
  liquid:   { bg: 'bg-info-bg',       fg: 'text-info-fg', label: 'Liquid' },
  npo:      { bg: 'bg-danger-bg',     fg: 'text-danger-fg', label: 'NPO' },
  custom:   { bg: 'bg-surface-muted', fg: 'text-ink-soft', label: 'Custom' },
};

@Component({
  selector: 'app-food-service-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ──────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          Food Service
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">
          IPD diet management, meal tracking & delivery ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      <button type="button" (click)="showNewOrder.set(true)"
              class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card">
        + New diet order
      </button>
    </header>

    <!-- ── Stats strip ────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">IPD trays today</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-ink">{{ totalTrays() }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Active diets</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-ink">{{ orders().length }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Special / NPO</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-warn-fg">{{ specialCount() }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Allergies</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-danger-fg">{{ allergyCount() }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Delivered</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-good-fg">{{ deliveredPct() }}%</p>
      </div>
    </div>

    <!-- ── Tabs ───────────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-5 bg-surface-muted rounded-lg p-1 w-fit">
      <button type="button" (click)="activeTab.set('ipd')"
              [class]="activeTab() === 'ipd' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        IPD Diet Orders
      </button>
      <button type="button" (click)="activeTab.set('cafeteria')"
              [class]="activeTab() === 'cafeteria' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        Cafeteria
      </button>
      <button type="button" (click)="activeTab.set('staff')"
              [class]="activeTab() === 'staff' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        Staff Meals
      </button>
    </div>

    <!-- ── Diet filter pills ──────────────────────────────── -->
    @if (activeTab() === 'ipd') {
      <div class="flex items-center gap-1.5 mb-4 flex-wrap">
        <button (click)="dietFilter.set('all')" [class]="filterCls('all')">All</button>
        <button (click)="dietFilter.set('diabetic')" [class]="filterCls('diabetic')">Diabetic</button>
        <button (click)="dietFilter.set('cardiac')" [class]="filterCls('cardiac')">Cardiac</button>
        <button (click)="dietFilter.set('npo')" [class]="filterCls('npo')">NPO</button>
        <button (click)="dietFilter.set('soft')" [class]="filterCls('soft')">Soft</button>
        <button (click)="dietFilter.set('renal')" [class]="filterCls('renal')">Renal</button>
        <button (click)="dietFilter.set('liquid')" [class]="filterCls('liquid')">Liquid</button>
      </div>
    }

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- ── IPD Diet table ─────────────────────────────────── -->
    @if (activeTab() === 'ipd') {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Bed</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Patient</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Diet</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Allergies</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Next meal</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Instructions</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="6" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading…</td></tr>
            } @else {
              @for (order of filteredOrders(); track order.id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                  <td class="px-4 py-2.5">
                    <p class="text-[12px] font-medium text-ink">{{ order.bed_label }}</p>
                    <p class="text-[10px] text-ink-muted">{{ order.ward_name }}</p>
                  </td>
                  <td class="px-4 py-2.5">
                    <p class="text-[13px] font-medium text-ink">{{ order.patient_name }}</p>
                    <p class="text-[10px] font-mono text-ink-muted">{{ order.uhid }}</p>
                  </td>
                  <td class="px-4 py-2.5">
                    <span [class]="dietChipCls(order.diet_type)">{{ dietLabel(order.diet_type) }}</span>
                  </td>
                  <td class="px-4 py-2.5">
                    @if (order.allergies.length > 0) {
                      <div class="flex flex-wrap gap-1">
                        @for (a of order.allergies; track a) {
                          <span class="inline-flex items-center h-[18px] px-1.5 rounded bg-danger-bg text-danger-fg text-[9px] font-medium">⚠ {{ a }}</span>
                        }
                      </div>
                    } @else {
                      <span class="text-[11px] text-ink-muted">None</span>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ nextMealLabel() }}</td>
                  <td class="px-4 py-2.5 text-[11px] text-ink-soft max-w-[160px] truncate">{{ order.special_instructions || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-4 py-12 text-center text-[13px] text-ink-muted">No active diet orders.</td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ── Cafeteria tab ──────────────────────────────────── -->
    @if (activeTab() === 'cafeteria') {
      <div class="bg-surface-card border border-border rounded-[10px] p-8 text-center">
        <p class="text-[14px] text-ink-soft mb-2">Cafeteria POS</p>
        <p class="text-[12px] text-ink-muted">Quick billing for walk-in orders. Coming soon.</p>
      </div>
    }

    <!-- ── Staff meals tab ────────────────────────────────── -->
    @if (activeTab() === 'staff') {
      <div class="bg-surface-card border border-border rounded-[10px] p-8 text-center">
        <p class="text-[14px] text-ink-soft mb-2">Staff Meal Tracking</p>
        <p class="text-[12px] text-ink-muted">Subsidised meal registration and monthly reports. Coming soon.</p>
      </div>
    }

    <!-- ── New diet order modal ───────────────────────────── -->
    @if (showNewOrder()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center" (document:keydown.escape)="showNewOrder.set(false)">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-surface-card rounded-xl shadow-pop border border-border w-full max-w-md overflow-hidden"
             (click)="$event.stopPropagation()">
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-[15px] font-semibold text-ink">New Diet Order</h3>
            <button type="button" (click)="showNewOrder.set(false)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle text-lg">×</button>
          </header>
          <form [formGroup]="orderForm" (ngSubmit)="createOrder()" class="p-5 space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Patient name</label>
                <input formControlName="patient_name" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">UHID</label>
                <input formControlName="uhid" class="w-full h-10 px-3 text-sm font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Bed</label>
                <input formControlName="bed_label" placeholder="Bed 3A" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Ward</label>
                <input formControlName="ward_name" placeholder="General" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Diet type</label>
              <select formControlName="diet_type" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="regular">Regular</option>
                <option value="diabetic">Diabetic</option>
                <option value="cardiac">Cardiac</option>
                <option value="renal">Renal</option>
                <option value="soft">Soft</option>
                <option value="liquid">Liquid</option>
                <option value="npo">NPO (Nil per os)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Allergies (comma-separated)</label>
              <input formControlName="allergies" placeholder="Nuts, Shellfish" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Special instructions</label>
              <textarea formControlName="instructions" rows="2" placeholder="Low sodium, no sugar, etc." class="w-full px-3 py-2 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y"></textarea>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showNewOrder.set(false)" class="h-9 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="submit" [disabled]="orderForm.invalid || creating()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card disabled:opacity-60">
                {{ creating() ? 'Creating…' : 'Create order' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class FoodServicePage implements OnInit, OnDestroy {
  private svc = inject(FoodService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly activeTab = signal<Tab>('ipd');
  protected readonly dietFilter = signal<DietType | 'all'>('all');
  protected readonly orders = signal<DietOrder[]>([]);
  protected readonly meals = signal<MealDelivery[]>([]);
  protected readonly showNewOrder = signal(false);
  protected readonly creating = signal(false);

  protected readonly orderForm = this.fb.nonNullable.group({
    patient_name: ['', Validators.required],
    uhid: ['', Validators.required],
    bed_label: ['', Validators.required],
    ward_name: ['', Validators.required],
    diet_type: ['regular' as DietType],
    allergies: [''],
    instructions: [''],
  });

  protected readonly filteredOrders = computed(() => {
    const f = this.dietFilter();
    if (f === 'all') return this.orders();
    return this.orders().filter(o => o.diet_type === f);
  });

  protected readonly totalTrays = computed(() => this.meals().length);
  protected readonly specialCount = computed(() => this.orders().filter(o => o.diet_type !== 'regular').length);
  protected readonly allergyCount = computed(() => this.orders().filter(o => o.allergies.length > 0).length);
  protected readonly deliveredPct = computed(() => {
    const all = this.meals();
    if (all.length === 0) return 100;
    const delivered = all.filter(m => m.status === 'delivered').length;
    return Math.round((delivered / all.length) * 100);
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.load();
    this.unsubscribe = this.svc.subscribe(() => void this.load());
  }

  ngOnDestroy() { this.unsubscribe?.(); }

  private async load() {
    this.loading.set(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [orders, meals] = await Promise.all([
        this.svc.listDietOrders(),
        this.svc.listMealsForDate(today),
      ]);
      this.orders.set(orders);
      this.meals.set(meals);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected nextMealLabel(): string {
    const hour = new Date().getHours();
    if (hour < 10) return 'Breakfast (7:30 AM)';
    if (hour < 13) return 'Lunch (12:30 PM)';
    if (hour < 17) return 'Snack (4:00 PM)';
    return 'Dinner (7:30 PM)';
  }

  protected dietLabel(t: DietType): string { return DIET_CHIP[t]?.label ?? t; }
  protected dietChipCls(t: DietType): string {
    const c = DIET_CHIP[t] ?? DIET_CHIP.regular;
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${c.bg} ${c.fg}`;
  }

  protected filterCls(f: DietType | 'all'): string {
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return this.dietFilter() === f
      ? `${base} bg-primary-100 text-primary-800`
      : `${base} text-ink-muted hover:text-ink hover:bg-surface-subtle`;
  }

  protected async createOrder() {
    if (this.orderForm.invalid) return;
    this.creating.set(true);
    try {
      const val = this.orderForm.getRawValue();
      await this.svc.createDietOrder({
        patient_id: '',
        patient_name: val.patient_name,
        uhid: val.uhid,
        bed_label: val.bed_label,
        ward_name: val.ward_name,
        diet_type: val.diet_type,
        allergies: val.allergies ? val.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        special_instructions: val.instructions || null,
      });
      this.toast.success('Diet order created');
      this.showNewOrder.set(false);
      this.orderForm.reset({ diet_type: 'regular' });
      await this.load();
    } catch (e) {
      this.toast.error('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.creating.set(false);
    }
  }
}
