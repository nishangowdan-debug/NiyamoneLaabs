import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CssdService } from '../data/cssd.service';
import {
  LOAD_STATUS_LABELS, SET_STATUS_LABELS, STERILIZER_TYPE_LABELS,
  type CssdItemSet, type CssdLoad, type CssdSetInstance, type CssdSterilizer,
  type IndicatorResult, type LoadStatus, type SetInstanceStatus, type SterileStockRow,
} from '../data/cssd.types';

type Tab = 'dashboard' | 'loads' | 'sets' | 'inventory';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">CSSD &mdash; Sterilization Tracking</h1>
    <p class="text-[12px] text-ink-soft">NABH HIC · BI/CI tracking · load traceability · recall capability</p>
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

  <!-- DASHBOARD -->
  @if (tab() === 'dashboard') {
    <div class="grid md:grid-cols-4 gap-3">
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Active Loads</p>
        <p class="text-3xl font-bold mt-1">{{ activeLoadsCount() }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Awaiting BI Result</p>
        <p class="text-3xl font-bold mt-1" [class.text-warn-fg]="quarantinedLoadsCount() > 0">
          {{ quarantinedLoadsCount() }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Failed / Recalled</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="failedLoadsCount() > 0">
          {{ failedLoadsCount() }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Sterile Sets Available</p>
        <p class="text-3xl font-bold mt-1 text-good-fg">{{ totalSterileAvailable() }}</p>
      </div>
    </div>

    @if (quarantinedLoads().length > 0) {
      <div class="rounded-md border border-warn-fg bg-warn-fg/5 p-4">
        <h3 class="text-sm font-semibold mb-2 text-warn-fg">Loads Awaiting BI Result</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Load No</th><th class="px-2 py-1">Sterilizer</th>
                <th class="px-2 py-1">Completed</th><th class="px-2 py-1">CI</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (l of quarantinedLoads(); track l.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ l.load_no }}</td>
                <td class="px-2 py-1 text-[11px]">{{ sterilizerName(l.sterilizer_id) }}</td>
                <td class="px-2 py-1 text-[11px]">{{ l.completed_at | date:'short' }}</td>
                <td class="px-2 py-1">{{ l.chemical_indicator || '—' }}</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="releaseLoad(l, 'pass')" class="text-[11px] text-good-fg hover:underline">BI Pass — Release</button>
                  <span class="mx-1">·</span>
                  <button (click)="releaseLoad(l, 'fail')" class="text-[11px] text-danger-fg hover:underline">BI Fail — Recall</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  }

  <!-- LOADS -->
  @if (tab() === 'loads') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Start New Load</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Sterilizer *</span>
          <select [(ngModel)]="nlSterilizerId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of sterilizers(); track s.id) {
              <option [ngValue]="s.id">{{ s.code }} · {{ s.name }} ({{ sterilizerTypeLabel(s.sterilizer_type) }})</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Cycle program</span>
          <input [(ngModel)]="nlCycle" placeholder="121°C 30min / Flash / etc."
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Operator name</span>
          <input [(ngModel)]="nlOperator"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (nlError()) { <p class="text-[12px] text-danger-fg">{{ nlError() }}</p> }
        <button (click)="createLoad()"
                [disabled]="!nlSterilizerId || nlBusy()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nlBusy() ? 'Creating…' : 'Create Load' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Recent Loads</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Load No</th><th class="px-3 py-2">Sterilizer</th>
                <th class="px-3 py-2">Status</th><th class="px-3 py-2">Started</th>
                <th class="px-3 py-2">CI / BI</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (l of loads(); track l.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="l.status === 'failed' || l.status === 'recalled'"
                  [class.bg-warn-fg]="l.status === 'quarantined'"
                  [class.bg-good-fg]="l.status === 'released'"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ l.load_no }}</td>
                <td class="px-3 py-2 text-[11px]">{{ sterilizerName(l.sterilizer_id) }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="l.status === 'released' || l.status === 'passed'"
                        [class.bg-warn-fg]="l.status === 'running' || l.status === 'quarantined'"
                        [class.bg-danger-fg]="l.status === 'failed' || l.status === 'recalled'"
                        [class.bg-surface-subtle]="l.status === 'preparing'"
                        [class.text-white]="['released','passed','running','quarantined','failed','recalled'].includes(l.status)">
                    {{ loadStatusLabel(l.status) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-[11px]">{{ l.started_at ? (l.started_at | date:'short') : '—' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  CI: {{ l.chemical_indicator || '—' }}
                  · BI: {{ l.biological_indicator || '—' }}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (l.status === 'preparing') {
                    <button (click)="attachSet(l)" class="text-[11px] text-brand hover:underline">+ Set</button>
                    <span class="mx-1">·</span>
                    <button (click)="startLoad(l)" class="text-[11px] text-good-fg hover:underline">Start</button>
                  }
                  @if (l.status === 'running') {
                    <button (click)="completeLoad(l)" class="text-[11px] text-brand hover:underline">Complete</button>
                  }
                  @if (l.status === 'quarantined') {
                    <button (click)="releaseLoad(l, 'pass')" class="text-[11px] text-good-fg hover:underline">Release</button>
                    <span class="mx-1">·</span>
                    <button (click)="releaseLoad(l, 'fail')" class="text-[11px] text-danger-fg hover:underline">Fail</button>
                  }
                  @if (l.status === 'released' || l.status === 'passed') {
                    <button (click)="recallLoad(l)" class="text-[11px] text-danger-fg hover:underline">Recall</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- SETS -->
  @if (tab() === 'sets') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Package New Set</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Item set *</span>
          <select [(ngModel)]="nsItemSetId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (s of itemSets(); track s.id) {
              <option [ngValue]="s.id">{{ s.code }} · {{ s.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Count *</span>
          <input type="number" [(ngModel)]="nsCount"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Packaged by *</span>
          <input [(ngModel)]="nsBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (nsError()) { <p class="text-[12px] text-danger-fg">{{ nsError() }}</p> }
        <button (click)="createSet()"
                [disabled]="!nsItemSetId || !nsCount || !nsBy.trim() || nsBusy()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nsBusy() ? 'Saving…' : 'Package Set' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Set Instances</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Set No</th><th class="px-3 py-2">Item Set</th>
                <th class="px-3 py-2">Status</th><th class="px-3 py-2">Sterilized</th>
                <th class="px-3 py-2">Expires</th><th class="px-3 py-2">Reprocess #</th>
                <th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (s of setsList(); track s.id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="s.current_status === 'contaminated' || (s.expires_at && isExpired(s.expires_at) && s.current_status === 'sterile')"
                  [class.bg-good-fg]="s.current_status === 'sterile' && !isExpired(s.expires_at)"
                  [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono">{{ s.set_no }}</td>
                <td class="px-3 py-2 text-[11px]">{{ itemSetName(s.item_set_id) }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="s.current_status === 'sterile'"
                        [class.bg-warn-fg]="s.current_status === 'in_load' || s.current_status === 'returned'"
                        [class.bg-danger-fg]="s.current_status === 'contaminated'"
                        [class.bg-surface-subtle]="s.current_status === 'clean' || s.current_status === 'packaged'"
                        [class.text-white]="['sterile','in_load','returned','contaminated','dispatched','in_use'].includes(s.current_status)">
                    {{ setStatusLabel(s.current_status) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-[11px]">{{ s.sterilized_at ? (s.sterilized_at | date:'mediumDate') : '—' }}</td>
                <td class="px-3 py-2 text-[11px]"
                    [class.text-danger-fg]="s.expires_at && isExpired(s.expires_at)">
                  {{ s.expires_at ? (s.expires_at | date:'mediumDate') : '—' }}
                </td>
                <td class="px-3 py-2 text-center">{{ s.reprocess_count }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  @if (s.current_status === 'sterile' && !isExpired(s.expires_at)) {
                    <button (click)="dispatch(s)" class="text-[11px] text-brand hover:underline">Dispatch</button>
                  }
                  @if (s.current_status === 'dispatched' || s.current_status === 'in_use') {
                    <button (click)="returnSet(s)" class="text-[11px] text-warn-fg hover:underline">Return</button>
                  }
                </td>
              </tr>
            }
            @if (setsList().length === 0) {
              <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No sets yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- INVENTORY -->
  @if (tab() === 'inventory') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Sterile Stock by Set</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Set</th>
              <th class="px-3 py-2">Category</th><th class="px-3 py-2 text-right">Sterile Available</th>
              <th class="px-3 py-2 text-right">Expired</th><th class="px-3 py-2 text-right">In Use</th>
              <th class="px-3 py-2 text-right">In Load</th><th class="px-3 py-2 text-right">Pending Reprocess</th></tr>
        </thead>
        <tbody>
          @for (r of stock(); track r.item_set_id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="r.sterile_available === 0"
                [class.bg-warn-fg]="r.sterile_available > 0 && r.sterile_available < 2"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ r.code }}</td>
              <td class="px-3 py-2">{{ r.name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ r.category || '—' }}</td>
              <td class="px-3 py-2 text-right font-bold"
                  [class.text-good-fg]="r.sterile_available >= 2"
                  [class.text-warn-fg]="r.sterile_available > 0 && r.sterile_available < 2"
                  [class.text-danger-fg]="r.sterile_available === 0">
                {{ r.sterile_available }}
              </td>
              <td class="px-3 py-2 text-right text-warn-fg">{{ r.sterile_expired }}</td>
              <td class="px-3 py-2 text-right">{{ r.in_use }}</td>
              <td class="px-3 py-2 text-right">{{ r.in_load }}</td>
              <td class="px-3 py-2 text-right text-warn-fg">{{ r.pending_reprocess }}</td>
            </tr>
          }
          @if (stock().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No data.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class CssdPage implements OnInit {
  private svc = inject(CssdService);

  protected tab = signal<Tab>('dashboard');
  protected sterilizers = signal<CssdSterilizer[]>([]);
  protected itemSets = signal<CssdItemSet[]>([]);
  protected loads = signal<CssdLoad[]>([]);
  protected setsList = signal<CssdSetInstance[]>([]);
  protected stock = signal<SterileStockRow[]>([]);

  // New load form
  protected nlSterilizerId: string | null = null;
  protected nlCycle = '';
  protected nlOperator = '';
  protected nlBusy = signal(false);
  protected nlError = signal<string | null>(null);

  // New set form
  protected nsItemSetId: string | null = null;
  protected nsCount: number | null = null;
  protected nsBy = '';
  protected nsBusy = signal(false);
  protected nsError = signal<string | null>(null);

  protected sterilizerName = (id: string) => this.sterilizers().find(s => s.id === id)?.name ?? id.slice(0,8);
  protected itemSetName    = (id: string) => this.itemSets().find(s => s.id === id)?.name ?? id.slice(0,8);
  protected loadStatusLabel = (s: LoadStatus) => LOAD_STATUS_LABELS[s];
  protected setStatusLabel  = (s: SetInstanceStatus) => SET_STATUS_LABELS[s];
  protected sterilizerTypeLabel = (t: any) => STERILIZER_TYPE_LABELS[t as keyof typeof STERILIZER_TYPE_LABELS] ?? t;

  protected isExpired(iso: string | null): boolean { return !!iso && new Date(iso) < new Date(); }

  protected activeLoadsCount = computed(() => this.loads().filter(l => l.status === 'preparing' || l.status === 'running').length);
  protected quarantinedLoads = computed(() => this.loads().filter(l => l.status === 'quarantined'));
  protected quarantinedLoadsCount = computed(() => this.quarantinedLoads().length);
  protected failedLoadsCount = computed(() => this.loads().filter(l => l.status === 'failed' || l.status === 'recalled').length);
  protected totalSterileAvailable = computed(() => this.stock().reduce((s, r) => s + r.sterile_available, 0));

  protected tabs = [
    { id: 'dashboard'  as Tab, label: 'Dashboard',  count: () => this.activeLoadsCount() + this.quarantinedLoadsCount() },
    { id: 'loads'      as Tab, label: 'Loads',      count: () => this.loads().length },
    { id: 'sets'       as Tab, label: 'Sets',       count: () => this.setsList().length },
    { id: 'inventory'  as Tab, label: 'Inventory',  count: () => this.stock().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [sterilizers, itemSets, loads, sets, stock] = await Promise.all([
        this.svc.listSterilizers(), this.svc.listItemSets(),
        this.svc.listLoads({}), this.svc.listSets({}), this.svc.sterileStock(),
      ]);
      this.sterilizers.set(sterilizers);
      this.itemSets.set(itemSets);
      this.loads.set(loads);
      this.setsList.set(sets);
      this.stock.set(stock);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async createLoad() {
    if (!this.nlSterilizerId) return;
    this.nlBusy.set(true); this.nlError.set(null);
    try {
      await this.svc.createLoad({
        sterilizerId: this.nlSterilizerId,
        cycleProgram: this.nlCycle.trim() || null,
        operatorName: this.nlOperator.trim() || null,
      });
      this.nlCycle = ''; this.nlOperator = '';
      await this.refresh();
    } catch (e: any) { this.nlError.set(e?.message ?? 'Failed'); }
    finally { this.nlBusy.set(false); }
  }

  protected async createSet() {
    if (!this.nsItemSetId || !this.nsCount || !this.nsBy.trim()) return;
    this.nsBusy.set(true); this.nsError.set(null);
    try {
      await this.svc.createSet(this.nsItemSetId, this.nsCount, this.nsBy.trim());
      this.nsCount = null; this.nsBy = '';
      await this.refresh();
    } catch (e: any) { this.nsError.set(e?.message ?? 'Failed'); }
    finally { this.nsBusy.set(false); }
  }

  protected async attachSet(l: CssdLoad) {
    const setId = prompt('Set instance ID to attach (UUID)?');
    if (!setId) return;
    try { await this.svc.attachSet(l.id, setId); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async startLoad(l: CssdLoad) {
    try { await this.svc.startLoad(l.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async completeLoad(l: CssdLoad) {
    const temp = prompt('Temperature (°C)?', '121') ?? '';
    const pressure = prompt('Pressure (bar)?', '1.05') ?? '';
    const hold = prompt('Hold time (min)?', '30') ?? '';
    const ci = prompt('Chemical indicator (pass/fail)?', 'pass') ?? 'pass';
    const biLot = prompt('BI lot number?') ?? '';
    try {
      await this.svc.completeLoad({
        id: l.id,
        tempC: Number(temp) || null,
        pressureBar: Number(pressure) || null,
        holdTimeMinutes: Number(hold) || null,
        chemicalIndicator: ci as IndicatorResult,
        biologicalIndicator: 'pending',
        biLotNo: biLot || null,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async releaseLoad(l: CssdLoad, biResult: 'pass' | 'fail') {
    const releasedBy = prompt('Released by (name)?'); if (!releasedBy) return;
    let failureReason: string | null = null;
    if (biResult === 'fail') {
      failureReason = prompt('Failure reason?');
      if (!failureReason) return;
    }
    try {
      await this.svc.releaseLoad({
        id: l.id, biResult, releasedByName: releasedBy, failureReason,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async recallLoad(l: CssdLoad) {
    const reason = prompt('Recall reason?'); if (!reason) return;
    try { await this.svc.recallLoad(l.id, reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async dispatch(s: CssdSetInstance) {
    const to = prompt('Dispatched to (location)?'); if (!to) return;
    try { await this.svc.dispatchSet({ id: s.id, dispatchedTo: to }); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async returnSet(s: CssdSetInstance) {
    const cnt = prompt(`Returned count? (packaged was ${s.packaged_count ?? '?'})`);
    const notes = prompt('Notes (if discrepancy)?') ?? '';
    try { await this.svc.returnSet(s.id, cnt ? Number(cnt) : null, notes); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
