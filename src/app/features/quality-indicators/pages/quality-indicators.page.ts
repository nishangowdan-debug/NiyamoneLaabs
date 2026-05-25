import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QualityIndicatorsService } from '../data/quality-indicators.service';
import {
  CATEGORY_LABELS, DIRECTION_LABELS,
  type LiveKpiRow, type QiCategory, type QiDirection,
  type QualityIndicator, type QualityMeasurement,
} from '../data/quality-indicators.types';

type Tab = 'live' | 'master' | 'history';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Quality Indicators (NABH PMS)</h1>
      <p class="text-[12px] text-ink-soft">Live monthly KPIs · target tracking · NABH-mandatory metrics</p>
    </div>
    <button (click)="refreshLive()" [disabled]="loading()"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white disabled:opacity-50">
      {{ loading() ? 'Loading…' : 'Refresh' }}
    </button>
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

  <!-- LIVE -->
  @if (tab() === 'live') {
    <div class="text-[12px] text-ink-soft">
      Period: {{ currentMonthStart() | date:'mediumDate' }} — {{ currentMonthEnd() | date:'mediumDate' }}
    </div>

    @for (cat of categoriesInData(); track cat) {
      <div class="rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold flex items-center justify-between">
          <span>{{ categoryLabel(cat) }}</span>
          <span class="text-[10px] text-ink-soft">{{ liveByCategory(cat).length }} indicators</span>
        </h3>
        <div class="grid md:grid-cols-3 gap-3 p-4">
          @for (k of liveByCategory(cat); track k.code) {
            <div class="rounded-md border border-border p-3 space-y-1"
                 [class.bg-good-fg]="k.measured_value !== null && isOnTarget(k)"
                 [class.bg-warn-fg]="k.measured_value !== null && isAtRisk(k)"
                 [class.bg-danger-fg]="k.measured_value !== null && isOffTarget(k)"
                 [class.bg-opacity-10]="true"
                 [class.border-good-fg]="k.measured_value !== null && isOnTarget(k)"
                 [class.border-warn-fg]="k.measured_value !== null && isAtRisk(k)"
                 [class.border-danger-fg]="k.measured_value !== null && isOffTarget(k)">
              <p class="text-[10px] uppercase text-ink-soft font-mono">{{ k.code }}</p>
              <p class="text-[12px] font-semibold">{{ k.name }}</p>
              <div class="flex items-end justify-between mt-1">
                <p class="text-2xl font-bold"
                   [class.text-good-fg]="k.measured_value !== null && isOnTarget(k)"
                   [class.text-warn-fg]="k.measured_value !== null && isAtRisk(k)"
                   [class.text-danger-fg]="k.measured_value !== null && isOffTarget(k)">
                  {{ k.measured_value !== null ? k.measured_value : '—' }}
                  <span class="text-[10px] font-normal">{{ k.unit }}</span>
                </p>
                <div class="text-right text-[10px] text-ink-soft">
                  <p>Target: {{ k.target_value }}</p>
                  <p>{{ directionLabel(k.direction) }}</p>
                </div>
              </div>
              <button (click)="saveSnapshot(k)" [disabled]="k.measured_value === null"
                      class="w-full mt-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-surface-subtle disabled:opacity-50">
                Save snapshot
              </button>
            </div>
          }
        </div>
      </div>
    }
  }

  <!-- MASTER -->
  @if (tab() === 'master') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Indicator</th>
              <th class="px-3 py-2">Category</th><th class="px-3 py-2">Period</th>
              <th class="px-3 py-2 text-right">Target</th><th class="px-3 py-2">Direction</th>
              <th class="px-3 py-2">NABH</th><th class="px-3 py-2">Source</th></tr>
        </thead>
        <tbody>
          @for (i of indicators(); track i.id) {
            <tr class="border-t border-border" [class.opacity-50]="!i.is_active">
              <td class="px-3 py-2 font-mono">{{ i.code }}</td>
              <td class="px-3 py-2">
                {{ i.name }}
                @if (i.description) { <div class="text-[10px] text-ink-soft">{{ i.description }}</div> }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ categoryLabel(i.category) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.period }}</td>
              <td class="px-3 py-2 text-right">{{ i.target_value }} {{ i.unit }}</td>
              <td class="px-3 py-2 text-[11px]">{{ directionLabel(i.direction) }}</td>
              <td class="px-3 py-2">{{ i.is_nabh_mandatory ? '✓ Mandatory' : '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ i.data_source || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- HISTORY -->
  @if (tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <label class="block max-w-md">
        <span class="text-[10px] uppercase text-ink-soft">Indicator</span>
        <select [ngModel]="historyIndicatorId()" (ngModelChange)="loadHistory($event)"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">— pick —</option>
          @for (i of indicators(); track i.id) {
            <option [ngValue]="i.id">{{ i.code }} · {{ i.name }}</option>
          }
        </select>
      </label>
      @if (history().length > 0) {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Period</th><th class="px-3 py-2 text-right">Value</th>
                <th class="px-3 py-2 text-right">Numerator</th><th class="px-3 py-2 text-right">Denominator</th>
                <th class="px-3 py-2">Computed By</th><th class="px-3 py-2">Auto?</th></tr>
          </thead>
          <tbody>
            @for (m of history(); track m.id) {
              <tr class="border-t border-border">
                <td class="px-3 py-2 text-[11px]">{{ m.period_start }} — {{ m.period_end }}</td>
                <td class="px-3 py-2 text-right font-bold">{{ m.measured_value }}</td>
                <td class="px-3 py-2 text-right">{{ m.numerator ?? '—' }}</td>
                <td class="px-3 py-2 text-right">{{ m.denominator ?? '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ m.computed_by_name || '—' }}</td>
                <td class="px-3 py-2">{{ m.is_auto_computed ? '✓' : '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      } @else if (historyIndicatorId()) {
        <p class="text-[12px] text-ink-soft">No measurements recorded yet.</p>
      }
    </div>
  }
</section>
  `,
})
export class QualityIndicatorsPage implements OnInit {
  private svc = inject(QualityIndicatorsService);

  protected tab = signal<Tab>('live');
  protected indicators = signal<QualityIndicator[]>([]);
  protected liveData = signal<LiveKpiRow[]>([]);
  protected history = signal<QualityMeasurement[]>([]);
  protected historyIndicatorId = signal<string | null>(null);
  protected loading = signal(false);

  protected categoryLabel = (c: QiCategory) => CATEGORY_LABELS[c];
  protected directionLabel = (d: QiDirection) => DIRECTION_LABELS[d];

  protected categoriesInData = computed(() => {
    const set = new Set<QiCategory>();
    for (const k of this.liveData()) set.add(k.category);
    return [...set].sort();
  });
  protected liveByCategory(cat: QiCategory): LiveKpiRow[] {
    return this.liveData().filter(k => k.category === cat);
  }

  protected currentMonthStart(): Date {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  protected currentMonthEnd(): Date {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  protected isOnTarget(k: LiveKpiRow): boolean {
    if (k.measured_value === null || k.target_value === null) return false;
    if (k.direction === 'higher_is_better') return k.measured_value >= k.target_value;
    if (k.direction === 'lower_is_better')  return k.measured_value <= k.target_value;
    return Math.abs(k.measured_value - k.target_value) < (k.target_value * 0.1);
  }
  protected isAtRisk(k: LiveKpiRow): boolean {
    if (k.measured_value === null || k.target_value === null) return false;
    if (this.isOnTarget(k)) return false;
    const ratio = k.target_value > 0 ? k.measured_value / k.target_value : 0;
    if (k.direction === 'higher_is_better') return ratio >= 0.8 && ratio < 1;
    if (k.direction === 'lower_is_better')  return ratio > 1 && ratio <= 1.2;
    return Math.abs(k.measured_value - k.target_value) <= (k.target_value * 0.2);
  }
  protected isOffTarget(k: LiveKpiRow): boolean {
    return !this.isOnTarget(k) && !this.isAtRisk(k) && k.measured_value !== null;
  }

  protected tabs = [
    { id: 'live'    as Tab, label: 'Live KPIs',    count: () => this.liveData().length },
    { id: 'master'  as Tab, label: 'Indicator Master', count: () => this.indicators().length },
    { id: 'history' as Tab, label: 'History',      count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    this.loading.set(true);
    try {
      const [indicators, live] = await Promise.all([
        this.svc.listIndicators(true),
        this.svc.liveSnapshot(),
      ]);
      this.indicators.set(indicators);
      this.liveData.set(live);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    finally { this.loading.set(false); }
  }

  protected async refreshLive() { await this.refresh(); }

  protected async loadHistory(indicatorId: string | null) {
    this.historyIndicatorId.set(indicatorId);
    if (!indicatorId) { this.history.set([]); return; }
    try { this.history.set(await this.svc.listMeasurements(indicatorId)); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async saveSnapshot(k: LiveKpiRow) {
    if (k.measured_value === null) return;
    const ind = this.indicators().find(i => i.code === k.code);
    if (!ind) { alert('Indicator not found'); return; }
    const start = this.currentMonthStart().toISOString().slice(0,10);
    const end   = this.currentMonthEnd().toISOString().slice(0,10);
    try {
      await this.svc.saveMeasurement({
        indicatorId: ind.id,
        periodStart: start,
        periodEnd: end,
        measuredValue: k.measured_value,
        numerator: k.numerator,
        denominator: k.denominator,
        isAuto: true,
        notes: 'Auto-computed from live snapshot',
      });
      alert(`Snapshot saved for ${k.code}`);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
