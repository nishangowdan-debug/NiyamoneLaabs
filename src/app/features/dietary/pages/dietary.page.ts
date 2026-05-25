import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DietaryService } from '../data/dietary.service';
import {
  DELIVERY_STATUS_LABELS, MEAL_SLOT_LABELS, PLAN_STATUS_LABELS,
  type DietMealLog, type DietPlan, type DietPlanStatus, type DietType,
  type MealDeliveryStatus, type MealSlot,
} from '../data/dietary.types';

type Tab = 'active' | 'meals_today' | 'create' | 'types';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Therapeutic Dietary</h1>
    <p class="text-[12px] text-ink-soft">Diet prescriptions · meal delivery tracking · NABH FMS / Nutrition</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- ACTIVE PLANS -->
  @if (tab() === 'active') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Admission</th>
              <th class="px-3 py-2">Diet Type</th><th class="px-3 py-2">Doctor</th>
              <th class="px-3 py-2">Calories</th><th class="px-3 py-2">Allergies</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (p of activePlans(); track p.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="p.status === 'npo'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono text-[10px]">{{ p.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ p.admission_id ? p.admission_id.slice(0,8) : '—' }}</td>
              <td class="px-3 py-2">{{ dietTypeName(p.diet_type_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ p.prescribed_by_doctor_name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ p.total_calories_kcal ?? dietTypeCal(p.diet_type_id) }} kcal</td>
              <td class="px-3 py-2 text-[11px]">{{ p.allergies.join(', ') || '—' }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="p.status === 'active'"
                      [class.bg-warn-fg]="p.status === 'on_hold'"
                      [class.bg-danger-fg]="p.status === 'npo'"
                      [class.bg-surface-subtle]="p.status === 'completed' || p.status === 'cancelled'"
                      [class.text-white]="p.status !== 'completed' && p.status !== 'cancelled'">
                  {{ planStatusLabel(p.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (p.status === 'active' || p.status === 'on_hold' || p.status === 'npo') {
                  <button (click)="scheduleMealsForPlan(p)" class="text-[11px] text-brand hover:underline">+ Meals</button>
                  <span class="mx-1">·</span>
                  <button (click)="changeStatus(p, p.status === 'active' ? 'on_hold' : 'active')"
                          class="text-[11px] text-warn-fg hover:underline">
                    {{ p.status === 'active' ? 'Hold' : 'Resume' }}
                  </button>
                  <span class="mx-1">·</span>
                  <button (click)="changeStatus(p, 'completed')" class="text-[11px] text-good-fg hover:underline">Complete</button>
                }
              </td>
            </tr>
          }
          @if (activePlans().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No active diet plans.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- MEALS TODAY -->
  @if (tab() === 'meals_today') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Today's Meals</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Slot</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Diet</th><th class="px-3 py-2">Scheduled</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2">Consumed %</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (m of mealsToday(); track m.id) {
            <tr class="border-t border-border"
                [class.bg-warn-fg]="m.status === 'refused' || m.status === 'consumed_partial'"
                [class.bg-good-fg]="m.status === 'consumed_full'"
                [class.bg-danger-fg]="m.status === 'missed'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ mealSlotLabel(m.meal_slot) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ m.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ dietForPlan(m.diet_plan_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ m.scheduled_at | date:'shortTime' }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="m.status === 'consumed_full' || m.status === 'delivered'"
                      [class.bg-warn-fg]="m.status === 'consumed_partial'"
                      [class.bg-danger-fg]="m.status === 'refused' || m.status === 'missed'"
                      [class.bg-surface-subtle]="m.status === 'scheduled' || m.status === 'prepared'"
                      [class.text-white]="['consumed_full','delivered','consumed_partial','refused','missed','npo'].includes(m.status)">
                  {{ deliveryStatusLabel(m.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-center">{{ m.consumed_pct ?? '—' }}{{ m.consumed_pct !== null ? '%' : '' }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (m.status === 'scheduled' || m.status === 'prepared') {
                  <button (click)="markDelivered(m)" class="text-[11px] text-brand hover:underline">Delivered</button>
                }
                @if (m.status === 'delivered') {
                  <button (click)="markConsumed(m, 'consumed_full')" class="text-[11px] text-good-fg hover:underline">Full</button>
                  <span class="mx-1">·</span>
                  <button (click)="markConsumed(m, 'consumed_partial')" class="text-[11px] text-warn-fg hover:underline">Partial</button>
                  <span class="mx-1">·</span>
                  <button (click)="markConsumed(m, 'refused')" class="text-[11px] text-danger-fg hover:underline">Refused</button>
                }
              </td>
            </tr>
          }
          @if (mealsToday().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No meals scheduled today.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- CREATE PLAN -->
  @if (tab() === 'create') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl">
      <h3 class="text-sm font-semibold mb-3">+ New Diet Plan</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="cPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
          <input [(ngModel)]="cAdmissionId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Diet type *</span>
          <select [(ngModel)]="cDietTypeId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (t of dietTypes(); track t.id) {
              <option [ngValue]="t.id">{{ t.code }} · {{ t.name }} ({{ t.calories_kcal ?? '—' }} kcal)</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Prescribing doctor *</span>
          <input [(ngModel)]="cDoctor"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Calories override (kcal)</span>
          <input type="number" [(ngModel)]="cCalories"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Fluid restriction (ml)</span>
          <input type="number" [(ngModel)]="cFluidMl"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Cultural dietary</span>
          <input [(ngModel)]="cCultural" placeholder="halal / kosher / jain / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Allergies (comma-separated)</span>
          <input [(ngModel)]="cAllergies" placeholder="peanuts, dairy, shellfish"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Food preferences (comma-separated)</span>
          <input [(ngModel)]="cPreferences" placeholder="veg, no eggs, low spice"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Special instructions</span>
          <textarea rows="2" [(ngModel)]="cInstructions"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        @if (cError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ cError() }}</p> }
        @if (cSuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ cSuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="createPlan()"
                  [disabled]="!cPatientId.trim() || !cDietTypeId || !cDoctor.trim() || cBusy()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ cBusy() ? 'Creating…' : 'Create Plan' }}
          </button>
        </div>
      </div>
    </div>
  }

  <!-- DIET TYPES -->
  @if (tab() === 'types') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Diet</th>
              <th class="px-3 py-2">Texture</th>
              <th class="px-3 py-2 text-right">Calories</th>
              <th class="px-3 py-2 text-right">Protein</th>
              <th class="px-3 py-2 text-right">Carb</th>
              <th class="px-3 py-2 text-right">Fat</th>
              <th class="px-3 py-2 text-right">Sodium</th>
              <th class="px-3 py-2">NPO?</th></tr>
        </thead>
        <tbody>
          @for (t of dietTypes(); track t.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="t.is_npo" [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ t.code }}</td>
              <td class="px-3 py-2">
                {{ t.name }}
                <div class="text-[10px] text-ink-soft">{{ t.description }}</div>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ t.texture || '—' }}</td>
              <td class="px-3 py-2 text-right">{{ t.calories_kcal ?? '—' }}</td>
              <td class="px-3 py-2 text-right">{{ t.protein_g ?? '—' }}g</td>
              <td class="px-3 py-2 text-right">{{ t.carb_g ?? '—' }}g</td>
              <td class="px-3 py-2 text-right">{{ t.fat_g ?? '—' }}g</td>
              <td class="px-3 py-2 text-right">{{ t.sodium_mg ?? '—' }}mg</td>
              <td class="px-3 py-2">{{ t.is_npo ? '⚠ Yes' : '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class DietaryPage implements OnInit {
  private svc = inject(DietaryService);

  protected tab = signal<Tab>('active');
  protected dietTypes = signal<DietType[]>([]);
  protected plans = signal<DietPlan[]>([]);
  protected meals = signal<DietMealLog[]>([]);

  // Create plan form
  protected cPatientId = '';
  protected cAdmissionId = '';
  protected cDietTypeId: string | null = null;
  protected cDoctor = '';
  protected cCalories: number | null = null;
  protected cFluidMl: number | null = null;
  protected cCultural = '';
  protected cAllergies = '';
  protected cPreferences = '';
  protected cInstructions = '';
  protected cBusy = signal(false);
  protected cError = signal<string | null>(null);
  protected cSuccess = signal<string | null>(null);

  protected planStatusLabel = (s: DietPlanStatus) => PLAN_STATUS_LABELS[s];
  protected mealSlotLabel = (s: MealSlot) => MEAL_SLOT_LABELS[s];
  protected deliveryStatusLabel = (s: MealDeliveryStatus) => DELIVERY_STATUS_LABELS[s];
  protected dietTypeName = (id: string) => this.dietTypes().find(t => t.id === id)?.name ?? id.slice(0,8);
  protected dietTypeCal = (id: string) => this.dietTypes().find(t => t.id === id)?.calories_kcal ?? '—';
  protected dietForPlan = (planId: string) => {
    const p = this.plans().find(x => x.id === planId);
    return p ? this.dietTypeName(p.diet_type_id) : '—';
  };

  protected activePlans = computed(() =>
    this.plans().filter(p => p.status === 'active' || p.status === 'on_hold' || p.status === 'npo'),
  );
  protected mealsToday = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.meals().filter(m => m.scheduled_at.slice(0, 10) === today)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  });

  protected tabs = [
    { id: 'active'      as Tab, label: 'Active Plans',  count: () => this.activePlans().length },
    { id: 'meals_today' as Tab, label: "Today's Meals", count: () => this.mealsToday().length },
    { id: 'create'      as Tab, label: '+ New Plan',    count: () => 0 },
    { id: 'types'       as Tab, label: 'Diet Types',    count: () => this.dietTypes().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [types, plans, meals] = await Promise.all([
        this.svc.listDietTypes(),
        this.svc.listPlans({}),
        this.svc.listMealLogs({ date: new Date().toISOString().slice(0, 10) }),
      ]);
      this.dietTypes.set(types);
      this.plans.set(plans);
      this.meals.set(meals);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async createPlan() {
    if (!this.cPatientId.trim() || !this.cDietTypeId || !this.cDoctor.trim()) return;
    this.cBusy.set(true); this.cError.set(null); this.cSuccess.set(null);
    try {
      await this.svc.createPlan({
        patientId: this.cPatientId.trim(),
        dietTypeId: this.cDietTypeId,
        prescribedByDoctorName: this.cDoctor.trim(),
        admissionId: this.cAdmissionId.trim() || null,
        totalCaloriesKcal: this.cCalories,
        fluidRestrictionMl: this.cFluidMl,
        culturalDietary: this.cCultural.trim() || null,
        allergies: this.cAllergies.split(',').map(s => s.trim()).filter(s => s),
        foodPreferences: this.cPreferences.split(',').map(s => s.trim()).filter(s => s),
        specialInstructions: this.cInstructions.trim() || null,
      });
      this.cSuccess.set('Plan created.');
      this.cPatientId = ''; this.cAdmissionId = '';
      this.cCalories = null; this.cFluidMl = null;
      this.cCultural = ''; this.cAllergies = ''; this.cPreferences = '';
      this.cInstructions = '';
      await this.refresh();
      setTimeout(() => this.cSuccess.set(null), 3000);
    } catch (e: any) { this.cError.set(e?.message ?? 'Failed'); }
    finally { this.cBusy.set(false); }
  }

  protected async changeStatus(p: DietPlan, status: DietPlanStatus) {
    try { await this.svc.changePlanStatus(p.id, status); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async scheduleMealsForPlan(p: DietPlan) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const slots: { slot: MealSlot; hour: number; minute: number }[] = [
      { slot: 'breakfast', hour: 8, minute: 0 },
      { slot: 'lunch',     hour: 13, minute: 0 },
      { slot: 'tea',       hour: 16, minute: 30 },
      { slot: 'dinner',    hour: 20, minute: 0 },
    ];
    try {
      for (const s of slots) {
        const at = new Date(tomorrow);
        at.setHours(s.hour, s.minute, 0, 0);
        await this.svc.scheduleMeal({
          dietPlanId: p.id,
          mealSlot: s.slot,
          scheduledAt: at.toISOString(),
        });
      }
      await this.refresh();
      alert('Tomorrow\'s meals scheduled (4 slots).');
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async markDelivered(m: DietMealLog) {
    const by = prompt('Delivered by (name)?') ?? '';
    try { await this.svc.logDelivery({ id: m.id, status: 'delivered', deliveredByName: by || null }); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async markConsumed(m: DietMealLog, status: MealDeliveryStatus) {
    let pct: number | null = null;
    let reason: string | null = null;
    if (status === 'consumed_partial') {
      const v = prompt('Consumed % (0-100)?'); if (!v) return;
      pct = Number(v);
    } else if (status === 'refused') {
      reason = prompt('Refusal reason?');
      if (!reason) return;
    }
    try {
      await this.svc.logDelivery({ id: m.id, status, consumedPct: pct, refusalReason: reason });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
