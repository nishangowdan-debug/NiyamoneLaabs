import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LinenService } from '../data/linen.service';
import {
  MOVEMENT_LABELS, STATE_LABELS,
  type LinenCategory, type LinenMovement, type LinenMovementType,
  type LinenState, type LinenStockRow, type LinenWashCycle,
} from '../data/linen.types';

type Tab = 'stock' | 'movements' | 'wash' | 'log';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Linen &amp; Laundry</h1>
    <p class="text-[12px] text-ink-soft">Stock by state · ward issue / return · wash cycles · NABH FMS</p>
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

  <!-- STOCK -->
  @if (tab() === 'stock') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Stock by Category × State</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Linen</th>
              <th class="px-3 py-2 text-right">Par</th>
              <th class="px-3 py-2 text-right">Clean</th>
              <th class="px-3 py-2 text-right">In Use</th>
              <th class="px-3 py-2 text-right">Soiled</th>
              <th class="px-3 py-2 text-right">In Wash</th>
              <th class="px-3 py-2 text-right">Condemned</th>
              <th class="px-3 py-2 text-right">Lost</th>
              <th class="px-3 py-2 text-right">Active Total</th></tr>
        </thead>
        <tbody>
          @for (r of stock(); track r.category_id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="r.clean < r.reorder_level"
                [class.bg-warn-fg]="r.clean >= r.reorder_level && r.clean < r.par_stock * 0.6"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ r.code }}</td>
              <td class="px-3 py-2">{{ r.name }}</td>
              <td class="px-3 py-2 text-right">{{ r.par_stock }}</td>
              <td class="px-3 py-2 text-right font-bold"
                  [class.text-good-fg]="r.clean >= r.par_stock * 0.6"
                  [class.text-warn-fg]="r.clean < r.par_stock * 0.6 && r.clean >= r.reorder_level"
                  [class.text-danger-fg]="r.clean < r.reorder_level">
                {{ r.clean }}
              </td>
              <td class="px-3 py-2 text-right">{{ r.in_use }}</td>
              <td class="px-3 py-2 text-right text-warn-fg">{{ r.soiled }}</td>
              <td class="px-3 py-2 text-right">{{ r.in_wash }}</td>
              <td class="px-3 py-2 text-right text-danger-fg">{{ r.condemned }}</td>
              <td class="px-3 py-2 text-right text-danger-fg">{{ r.lost }}</td>
              <td class="px-3 py-2 text-right font-bold">{{ r.active_total }}</td>
            </tr>
          }
          @if (stock().length === 0) {
            <tr><td colspan="10" class="px-3 py-3 text-center text-ink-soft">No data.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- MOVEMENTS / LOG -->
  @if (tab() === 'movements') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Movement Log (last 500)</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Linen</th>
              <th class="px-3 py-2">Movement</th><th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2">From</th><th class="px-3 py-2">To</th>
              <th class="px-3 py-2">By</th><th class="px-3 py-2">Reason</th></tr>
        </thead>
        <tbody>
          @for (m of movements(); track m.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="m.movement_type === 'lost' || m.movement_type === 'condemned' || m.movement_type === 'damaged'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ m.performed_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ categoryName(m.category_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ movementLabel(m.movement_type) }}</td>
              <td class="px-3 py-2 text-right font-bold">{{ m.qty }}</td>
              <td class="px-3 py-2 text-[11px]">
                {{ m.from_location || '—' }}
                @if (m.from_state) { <span class="text-[10px] text-ink-soft">({{ stateLabel(m.from_state) }})</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">
                {{ m.to_location || '—' }}
                @if (m.to_state) { <span class="text-[10px] text-ink-soft">({{ stateLabel(m.to_state) }})</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ m.performed_by_name || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ m.reason || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- WASH CYCLES -->
  @if (tab() === 'wash') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Start Wash Cycle</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Total pieces *</span>
          <input type="number" min="1" [(ngModel)]="wTotal"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Temp (°C)</span>
            <input type="number" step="0.1" [(ngModel)]="wTemp"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Duration (min)</span>
            <input type="number" [(ngModel)]="wDuration"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Detergent</span>
            <input [(ngModel)]="wDetergent"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Disinfectant</span>
            <input [(ngModel)]="wDisinfectant"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Disinfectant ppm</span>
            <input type="number" [(ngModel)]="wPpm"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Operator</span>
            <input [(ngModel)]="wOperator"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="wHighRisk" />
          High-risk cycle (contaminated linen)
        </label>
        @if (wError()) { <p class="text-[12px] text-danger-fg">{{ wError() }}</p> }
        <button (click)="startCycle()"
                [disabled]="wBusy() || !wTotal"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ wBusy() ? 'Starting…' : 'Start Cycle' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Wash Cycles</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Lot</th><th class="px-3 py-2">Started</th>
                <th class="px-3 py-2">Pieces</th><th class="px-3 py-2">Temp / Time</th>
                <th class="px-3 py-2">Disinfectant</th><th class="px-3 py-2">High Risk</th>
                <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (c of cycles(); track c.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="c.is_high_risk"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ c.lot_no }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.started_at | date:'short' }}</td>
                <td class="px-3 py-2 text-right">{{ c.total_pieces }}</td>
                <td class="px-3 py-2 text-[11px]">{{ c.wash_temperature_c ?? '—' }}°C / {{ c.wash_duration_min ?? '—' }}m</td>
                <td class="px-3 py-2 text-[11px]">
                  {{ c.disinfectant || '—' }}
                  @if (c.disinfectant_ppm) { <span class="text-[10px]">@ {{ c.disinfectant_ppm }}ppm</span> }
                </td>
                <td class="px-3 py-2">{{ c.is_high_risk ? '⚠ Yes' : 'No' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  {{ c.completed_at ? '✓ ' + (c.completed_at | date:'shortTime') : 'In progress' }}
                  @if (c.rejected_pieces > 0) { <span class="text-danger-fg block">{{ c.rejected_pieces }} rejected</span> }
                </td>
                <td class="px-3 py-2 text-right">
                  @if (!c.completed_at) {
                    <button (click)="completeCycle(c)" class="text-[11px] text-brand hover:underline">Complete</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- LOG MOVEMENT -->
  @if (tab() === 'log') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-3">
      <h3 class="text-sm font-semibold">+ Log Movement</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Linen *</span>
          <select [(ngModel)]="mCategoryId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.code }} · {{ c.name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Movement *</span>
          <select [(ngModel)]="mType" (ngModelChange)="onMovementChange()"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of movementOptions; track t) { <option [value]="t">{{ movementLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Quantity *</span>
          <input type="number" min="1" [(ngModel)]="mQty"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From location</span>
          <input [(ngModel)]="mFromLoc" placeholder="Storage / Ward 3 / Laundry"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To location</span>
          <input [(ngModel)]="mToLoc"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From state</span>
          <select [(ngModel)]="mFromState"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">—</option>
            @for (s of stateOptions; track s) { <option [value]="s">{{ stateLabel(s) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To state</span>
          <select [(ngModel)]="mToState"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">—</option>
            @for (s of stateOptions; track s) { <option [value]="s">{{ stateLabel(s) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Performed by</span>
          <input [(ngModel)]="mBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Reason / Notes</span>
          <input [(ngModel)]="mReason"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (mError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ mError() }}</p> }
        @if (mSuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ mSuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="logMovement()"
                  [disabled]="!mCategoryId || !mQty || mBusy()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ mBusy() ? 'Logging…' : 'Log Movement' }}
          </button>
        </div>
      </div>
    </div>
  }
</section>
  `,
})
export class LinenPage implements OnInit {
  private svc = inject(LinenService);

  protected tab = signal<Tab>('stock');
  protected categories = signal<LinenCategory[]>([]);
  protected stock = signal<LinenStockRow[]>([]);
  protected movements = signal<LinenMovement[]>([]);
  protected cycles = signal<LinenWashCycle[]>([]);

  // Wash cycle form
  protected wTotal: number | null = null;
  protected wTemp: number | null = 71;
  protected wDuration: number | null = 30;
  protected wDetergent = '';
  protected wDisinfectant = 'Sodium hypochlorite';
  protected wPpm: number | null = 1000;
  protected wOperator = '';
  protected wHighRisk = false;
  protected wBusy = signal(false);
  protected wError = signal<string | null>(null);

  // Movement form
  protected mCategoryId: string | null = null;
  protected mType: LinenMovementType = 'issue_to_ward';
  protected mQty: number | null = null;
  protected mFromLoc = '';
  protected mToLoc = '';
  protected mFromState: LinenState | null = null;
  protected mToState: LinenState | null = null;
  protected mBy = '';
  protected mReason = '';
  protected mBusy = signal(false);
  protected mError = signal<string | null>(null);
  protected mSuccess = signal<string | null>(null);

  protected movementOptions: LinenMovementType[] = ['procurement','issue_to_ward','return_soiled','sent_to_laundry','returned_clean','condemned','lost','damaged','adjustment','transfer'];
  protected stateOptions: LinenState[] = ['clean','in_use','soiled','in_wash','condemned','lost'];

  protected movementLabel = (t: LinenMovementType) => MOVEMENT_LABELS[t];
  protected stateLabel = (s: LinenState) => STATE_LABELS[s];
  protected categoryName = (id: string) => this.categories().find(c => c.id === id)?.name ?? id.slice(0,8);

  protected tabs = [
    { id: 'stock'     as Tab, label: 'Stock',     count: () => this.stock().length },
    { id: 'movements' as Tab, label: 'Movements', count: () => this.movements().length },
    { id: 'wash'      as Tab, label: 'Wash Cycles', count: () => this.cycles().length },
    { id: 'log'       as Tab, label: 'Log Movement', count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [cats, stock, mvs, cyc] = await Promise.all([
        this.svc.listCategories(), this.svc.listStock(),
        this.svc.listMovements({}), this.svc.listWashCycles(),
      ]);
      this.categories.set(cats);
      this.stock.set(stock);
      this.movements.set(mvs);
      this.cycles.set(cyc);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onMovementChange() {
    // Auto-suggest from/to states
    switch (this.mType) {
      case 'procurement':       this.mFromState = null;       this.mToState = 'clean';     break;
      case 'issue_to_ward':     this.mFromState = 'clean';    this.mToState = 'in_use';    break;
      case 'return_soiled':     this.mFromState = 'in_use';   this.mToState = 'soiled';    break;
      case 'sent_to_laundry':   this.mFromState = 'soiled';   this.mToState = 'in_wash';   break;
      case 'returned_clean':    this.mFromState = 'in_wash';  this.mToState = 'clean';     break;
      case 'condemned':         this.mFromState = null;       this.mToState = 'condemned'; break;
      case 'lost':              this.mFromState = null;       this.mToState = 'lost';      break;
    }
  }

  protected async logMovement() {
    if (!this.mCategoryId || !this.mQty) return;
    this.mBusy.set(true); this.mError.set(null); this.mSuccess.set(null);
    try {
      await this.svc.logMovement({
        categoryId: this.mCategoryId,
        movementType: this.mType,
        qty: this.mQty,
        fromLocation: this.mFromLoc.trim() || null,
        toLocation: this.mToLoc.trim() || null,
        fromState: this.mFromState,
        toState: this.mToState,
        performedByName: this.mBy.trim() || null,
        reason: this.mReason.trim() || null,
      });
      this.mSuccess.set('Movement logged.');
      this.mQty = null; this.mFromLoc = ''; this.mToLoc = '';
      this.mReason = '';
      await this.refresh();
      setTimeout(() => this.mSuccess.set(null), 3000);
    } catch (e: any) { this.mError.set(e?.message ?? 'Failed'); }
    finally { this.mBusy.set(false); }
  }

  protected async startCycle() {
    if (!this.wTotal) return;
    this.wBusy.set(true); this.wError.set(null);
    try {
      await this.svc.createWashCycle({
        totalPieces: this.wTotal,
        washTemperatureC: this.wTemp,
        washDurationMin: this.wDuration,
        detergent: this.wDetergent.trim() || null,
        disinfectant: this.wDisinfectant.trim() || null,
        disinfectantPpm: this.wPpm,
        isHighRisk: this.wHighRisk,
        operatorName: this.wOperator.trim() || null,
      });
      this.wTotal = null;
      await this.refresh();
    } catch (e: any) { this.wError.set(e?.message ?? 'Failed'); }
    finally { this.wBusy.set(false); }
  }

  protected async completeCycle(c: LinenWashCycle) {
    const rejected = prompt('Rejected pieces (default 0)?') ?? '0';
    const notes = prompt('Notes?') ?? '';
    try { await this.svc.completeWashCycle(c.id, Number(rejected) || 0, notes); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
