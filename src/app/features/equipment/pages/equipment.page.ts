import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EquipmentService } from '../data/equipment.service';
import {
  CATEGORY_LABELS, CRITICALITY_LABELS, MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS, STATUS_LABELS,
  type BiomedEquipment, type CalibrationResult, type EquipmentCalibration,
  type EquipmentCategory, type EquipmentCriticality, type EquipmentMaintenance,
  type EquipmentStatus, type MaintenanceStatus, type MaintenanceType,
} from '../data/equipment.types';

type Tab = 'dashboard' | 'registry' | 'maintenance' | 'calibrations';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Biomedical Equipment</h1>
      <p class="text-[12px] text-ink-soft">Asset registry · PPM scheduling · calibration certificates · breakdown tracking · NABH FMS</p>
    </div>
    <button (click)="showNew.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ Register Equipment</button>
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
        <p class="text-[10px] uppercase text-ink-soft">Total Active</p>
        <p class="text-3xl font-bold mt-1">{{ activeEquipment().length }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Maintenance Overdue</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="overdueMaintenance().length > 0">
          {{ overdueMaintenance().length }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Calibration Overdue</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="overdueCalibration().length > 0">
          {{ overdueCalibration().length }}
        </p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Breakdowns</p>
        <p class="text-3xl font-bold mt-1" [class.text-danger-fg]="breakdownCount() > 0">{{ breakdownCount() }}</p>
      </div>
    </div>

    @if (overdueMaintenance().length > 0) {
      <div class="rounded-md border border-danger-fg bg-danger-fg/5 p-4">
        <h3 class="text-sm font-semibold mb-2 text-danger-fg">Maintenance Overdue</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Asset No</th><th class="px-2 py-1">Name</th>
                <th class="px-2 py-1">Category</th><th class="px-2 py-1">Criticality</th>
                <th class="px-2 py-1 text-right">Days Overdue</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (e of overdueMaintenance(); track e.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ e.asset_no }}</td>
                <td class="px-2 py-1">{{ e.name }}</td>
                <td class="px-2 py-1 text-[11px]">{{ categoryLabel(e.category) }}</td>
                <td class="px-2 py-1">{{ criticalityLabel(e.criticality) }}</td>
                <td class="px-2 py-1 text-right font-bold text-danger-fg">{{ e.days_overdue_maintenance }}d</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="openSchedule(e)" class="text-[11px] text-brand hover:underline">Schedule</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (overdueCalibration().length > 0) {
      <div class="rounded-md border border-warn-fg bg-warn-fg/5 p-4">
        <h3 class="text-sm font-semibold mb-2 text-warn-fg">Calibration Overdue</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Asset No</th><th class="px-2 py-1">Name</th>
                <th class="px-2 py-1">Last Calibrated</th>
                <th class="px-2 py-1 text-right">Days Overdue</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (e of overdueCalibration(); track e.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ e.asset_no }}</td>
                <td class="px-2 py-1">{{ e.name }}</td>
                <td class="px-2 py-1 text-[11px]">{{ e.last_calibration_at ? (e.last_calibration_at | date:'mediumDate') : '—' }}</td>
                <td class="px-2 py-1 text-right font-bold text-warn-fg">{{ e.days_overdue_calibration }}d</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="openCalibrate(e)" class="text-[11px] text-brand hover:underline">Calibrate</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  }

  <!-- REGISTRY -->
  @if (tab() === 'registry') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <input [(ngModel)]="search" placeholder="Search name / model / serial…"
               class="w-64 rounded-md border border-border bg-surface px-2 py-1 text-[12px]" />
        <select [(ngModel)]="categoryFilter"
                class="rounded-md border border-border bg-surface px-2 py-1 text-[12px]">
          <option [ngValue]="null">All categories</option>
          @for (c of categories; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }
        </select>
        <select [(ngModel)]="statusFilter"
                class="rounded-md border border-border bg-surface px-2 py-1 text-[12px]">
          <option [ngValue]="null">All statuses</option>
          @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
        </select>
      </div>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Asset</th><th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Category</th><th class="px-3 py-2">Critical.</th>
              <th class="px-3 py-2">Location</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Next Maint.</th><th class="px-3 py-2">Next Calib.</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (e of filteredEquipment(); track e.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="e.status === 'breakdown'"
                [class.bg-warn-fg]="e.status === 'under_maintenance'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono text-[10px]">{{ e.asset_no }}</td>
              <td class="px-3 py-2">
                {{ e.name }}
                <div class="text-[10px] text-ink-soft">{{ e.manufacturer }} {{ e.model }}</div>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ categoryLabel(e.category) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-danger-fg]="e.criticality === 'critical'"
                      [class.bg-warn-fg]="e.criticality === 'high'"
                      [class.bg-surface-subtle]="e.criticality === 'medium' || e.criticality === 'low'"
                      [class.text-white]="e.criticality === 'critical' || e.criticality === 'high'">
                  {{ e.criticality }}
                </span>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ e.location_text || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ statusLabel(e.status) }}</td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="isOverdue(e.next_maintenance_due_at)">
                {{ e.next_maintenance_due_at ? (e.next_maintenance_due_at | date:'mediumDate') : '—' }}
              </td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="isOverdue(e.next_calibration_due_at)">
                {{ e.next_calibration_due_at ? (e.next_calibration_due_at | date:'mediumDate') : '—' }}
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="openSchedule(e)" class="text-[11px] text-brand hover:underline">Schedule</button>
                <span class="mx-1">·</span>
                <button (click)="openCalibrate(e)" class="text-[11px] text-brand hover:underline">Calibrate</button>
                @if (e.status !== 'breakdown' && e.status !== 'decommissioned') {
                  <span class="mx-1">·</span>
                  <button (click)="reportBreakdown(e)" class="text-[11px] text-danger-fg hover:underline">Breakdown</button>
                }
              </td>
            </tr>
          }
          @if (filteredEquipment().length === 0) {
            <tr><td colspan="9" class="px-3 py-3 text-center text-ink-soft">No equipment.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- MAINTENANCE -->
  @if (tab() === 'maintenance') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">No</th><th class="px-3 py-2">Equipment</th>
              <th class="px-3 py-2">Type</th><th class="px-3 py-2">Scheduled</th>
              <th class="px-3 py-2">Performed</th><th class="px-3 py-2">By</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (m of maintenance(); track m.id) {
            <tr class="border-t border-border"
                [class.bg-warn-fg]="m.status === 'in_progress' || isOverdueMaint(m)"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ m.maintenance_no }}</td>
              <td class="px-3 py-2 text-[11px]">{{ equipmentName(m.equipment_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ maintenanceTypeLabel(m.maintenance_type) }}</td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="isOverdueMaint(m)">
                {{ m.scheduled_at ? (m.scheduled_at | date:'short') : '—' }}
              </td>
              <td class="px-3 py-2 text-[11px]">{{ m.performed_at ? (m.performed_at | date:'short') : '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ m.performed_by_name || '—' }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="m.status === 'completed'"
                      [class.bg-warn-fg]="m.status === 'in_progress'"
                      [class.bg-surface-subtle]="m.status === 'scheduled' || m.status === 'cancelled' || m.status === 'deferred'"
                      [class.text-white]="m.status === 'completed' || m.status === 'in_progress'">
                  {{ maintenanceStatusLabel(m.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-right">
                @if (m.status === 'scheduled' || m.status === 'in_progress') {
                  <button (click)="completeMaintenance(m)" class="text-[11px] text-brand hover:underline">Complete</button>
                }
              </td>
            </tr>
          }
          @if (maintenance().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No maintenance records.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- CALIBRATIONS -->
  @if (tab() === 'calibrations') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Date</th><th class="px-3 py-2">Equipment</th>
              <th class="px-3 py-2">Result</th><th class="px-3 py-2">Agency</th>
              <th class="px-3 py-2">NABL No</th><th class="px-3 py-2">Cert No</th>
              <th class="px-3 py-2">Next Due</th></tr>
        </thead>
        <tbody>
          @for (c of calibrations(); track c.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="c.result === 'fail'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2">{{ c.calibration_date }}</td>
              <td class="px-3 py-2 text-[11px]">{{ equipmentName(c.equipment_id) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="c.result === 'pass'"
                      [class.bg-warn-fg]="c.result === 'conditional'"
                      [class.bg-danger-fg]="c.result === 'fail'"
                      [class.text-white]="true">
                  {{ c.result }}
                </span>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ c.certifying_agency || '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ c.certifying_agency_nabl_no || '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ c.certificate_no || '—' }}</td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="isOverdue(c.next_due_at)">
                {{ c.next_due_at || '—' }}
              </td>
            </tr>
          }
          @if (calibrations().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No calibrations.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>

<!-- New equipment dialog -->
@if (showNew()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="showNew.set(false)">
    <div class="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 class="text-base font-semibold">Register Equipment</h3>
        <button (click)="showNew.set(false)">✕</button>
      </div>
      <div class="p-4 grid md:grid-cols-2 gap-3 text-sm">
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Name *</span>
          <input [(ngModel)]="nName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Category *</span>
          <select [(ngModel)]="nCategory"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (c of categories; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Criticality</span>
          <select [(ngModel)]="nCriticality"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="critical">Critical</option><option value="high">High</option>
            <option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Manufacturer</span>
          <input [(ngModel)]="nManufacturer"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Model</span>
          <input [(ngModel)]="nModel"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Serial No</span>
          <input [(ngModel)]="nSerial"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Location</span>
          <input [(ngModel)]="nLocation"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Custodian</span>
          <input [(ngModel)]="nCustodian"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Department</span>
          <input [(ngModel)]="nDepartment"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Purchase date</span>
          <input type="date" [(ngModel)]="nPurchaseDate"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Warranty until</span>
          <input type="date" [(ngModel)]="nWarrantyUntil"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Maintenance freq (days)</span>
          <input type="number" min="1" [(ngModel)]="nMaintFreq"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Calibration freq (days)</span>
          <input type="number" min="1" [(ngModel)]="nCalibFreq"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">AMC provider</span>
          <input [(ngModel)]="nAmcProvider"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">AMC until</span>
          <input type="date" [(ngModel)]="nAmcUntil"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (nError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ nError() }}</p> }
      </div>
      <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button (click)="showNew.set(false)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="register()"
                [disabled]="!nName.trim() || nBusy()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nBusy() ? 'Registering…' : 'Register' }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class EquipmentPage implements OnInit {
  private svc = inject(EquipmentService);

  protected tab = signal<Tab>('dashboard');
  protected equipment = signal<BiomedEquipment[]>([]);
  protected dueRows = signal<BiomedEquipment[]>([]);
  protected maintenance = signal<EquipmentMaintenance[]>([]);
  protected calibrations = signal<EquipmentCalibration[]>([]);

  protected search = '';
  protected categoryFilter: EquipmentCategory | null = null;
  protected statusFilter: EquipmentStatus | null = null;

  protected categories: EquipmentCategory[] = ['icu','imaging','lab','ot','anaesthesia','diagnostic','dialysis','sterilisation','monitoring','infusion','respiratory','endoscopy','rehabilitation','general','utility'];
  protected statuses: EquipmentStatus[] = ['operational','under_maintenance','breakdown','decommissioned','quarantined','reserved'];

  protected showNew = signal(false);
  protected nName = '';
  protected nCategory: EquipmentCategory = 'general';
  protected nCriticality: EquipmentCriticality = 'medium';
  protected nManufacturer = '';
  protected nModel = '';
  protected nSerial = '';
  protected nLocation = '';
  protected nCustodian = '';
  protected nDepartment = '';
  protected nPurchaseDate = '';
  protected nWarrantyUntil = '';
  protected nMaintFreq: number | null = null;
  protected nCalibFreq: number | null = null;
  protected nAmcProvider = '';
  protected nAmcUntil = '';
  protected nBusy = signal(false);
  protected nError = signal<string | null>(null);

  protected categoryLabel = (c: EquipmentCategory) => CATEGORY_LABELS[c];
  protected statusLabel = (s: EquipmentStatus) => STATUS_LABELS[s];
  protected criticalityLabel = (c: EquipmentCriticality) => CRITICALITY_LABELS[c];
  protected maintenanceTypeLabel = (t: MaintenanceType) => MAINTENANCE_TYPE_LABELS[t];
  protected maintenanceStatusLabel = (s: MaintenanceStatus) => MAINTENANCE_STATUS_LABELS[s];

  protected activeEquipment = computed(() => this.equipment().filter(e => e.is_active));
  protected breakdownCount = computed(() => this.equipment().filter(e => e.status === 'breakdown').length);
  protected overdueMaintenance = computed(() =>
    this.dueRows().filter(e => (e.days_overdue_maintenance ?? 0) > 0)
      .sort((a, b) => (b.days_overdue_maintenance ?? 0) - (a.days_overdue_maintenance ?? 0)),
  );
  protected overdueCalibration = computed(() =>
    this.dueRows().filter(e => (e.days_overdue_calibration ?? 0) > 0)
      .sort((a, b) => (b.days_overdue_calibration ?? 0) - (a.days_overdue_calibration ?? 0)),
  );

  protected filteredEquipment = computed(() => {
    const q = this.search.trim().toLowerCase();
    return this.equipment().filter(e => {
      if (this.categoryFilter && e.category !== this.categoryFilter) return false;
      if (this.statusFilter && e.status !== this.statusFilter) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) ||
             (e.model ?? '').toLowerCase().includes(q) ||
             (e.serial_no ?? '').toLowerCase().includes(q) ||
             e.asset_no.toLowerCase().includes(q);
    });
  });

  protected isOverdue(iso: string | null): boolean {
    return !!iso && new Date(iso) < new Date();
  }
  protected isOverdueMaint(m: EquipmentMaintenance): boolean {
    if (m.status === 'completed' || m.status === 'cancelled') return false;
    return !!m.scheduled_at && new Date(m.scheduled_at) < new Date();
  }
  protected equipmentName = (id: string) => this.equipment().find(e => e.id === id)?.name ?? id.slice(0,8);

  protected tabs = [
    { id: 'dashboard'    as Tab, label: 'Dashboard',    count: () => this.overdueMaintenance().length + this.overdueCalibration().length },
    { id: 'registry'     as Tab, label: 'Registry',     count: () => this.equipment().length },
    { id: 'maintenance'  as Tab, label: 'Maintenance',  count: () => this.maintenance().length },
    { id: 'calibrations' as Tab, label: 'Calibrations', count: () => this.calibrations().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [eq, due, maint, cal] = await Promise.all([
        this.svc.listEquipment({}),
        this.svc.listDue(),
        this.svc.listMaintenance({}),
        this.svc.listCalibrations(),
      ]);
      this.equipment.set(eq);
      this.dueRows.set(due);
      this.maintenance.set(maint);
      this.calibrations.set(cal);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async register() {
    if (!this.nName.trim() || this.nBusy()) return;
    this.nBusy.set(true); this.nError.set(null);
    try {
      await this.svc.register({
        name: this.nName.trim(),
        category: this.nCategory,
        criticality: this.nCriticality,
        manufacturer: this.nManufacturer.trim() || null,
        model: this.nModel.trim() || null,
        serialNo: this.nSerial.trim() || null,
        locationText: this.nLocation.trim() || null,
        custodianName: this.nCustodian.trim() || null,
        department: this.nDepartment.trim() || null,
        purchaseDate: this.nPurchaseDate || null,
        warrantyUntil: this.nWarrantyUntil || null,
        maintenanceFrequencyDays: this.nMaintFreq,
        calibrationFrequencyDays: this.nCalibFreq,
        amcProvider: this.nAmcProvider.trim() || null,
        amcUntil: this.nAmcUntil || null,
      });
      this.showNew.set(false);
      this.nName = ''; this.nManufacturer = ''; this.nModel = ''; this.nSerial = '';
      this.nLocation = ''; this.nCustodian = ''; this.nDepartment = '';
      this.nPurchaseDate = ''; this.nWarrantyUntil = '';
      this.nMaintFreq = null; this.nCalibFreq = null;
      this.nAmcProvider = ''; this.nAmcUntil = '';
      await this.refresh();
    } catch (e: any) { this.nError.set(e?.message ?? 'Failed'); }
    finally { this.nBusy.set(false); }
  }

  protected async openSchedule(e: BiomedEquipment) {
    const type = prompt('Type (preventive/corrective/inspection)?', 'preventive');
    if (!type) return;
    const date = prompt('Scheduled date (YYYY-MM-DD)?');
    if (!date) return;
    const desc = prompt('Description?') ?? '';
    try {
      await this.svc.scheduleMaintenance({
        equipmentId: e.id,
        maintenanceType: type as MaintenanceType,
        scheduledAt: new Date(date).toISOString(),
        description: desc || null,
      });
      await this.refresh();
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected async completeMaintenance(m: EquipmentMaintenance) {
    const action = prompt('Action taken?'); if (!action) return;
    const findings = prompt('Findings?') ?? '';
    const performedBy = prompt('Performed by (name)?'); if (!performedBy) return;
    const cost = prompt('Cost (₹)?') ?? '0';
    const downtime = prompt('Downtime (hours)?') ?? '0';
    try {
      await this.svc.completeMaintenance({
        id: m.id,
        actionTaken: action,
        findings: findings || null,
        performedByName: performedBy,
        costCents: Math.round(Number(cost) * 100),
        downtimeHours: Number(downtime) || null,
      });
      await this.refresh();
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected async openCalibrate(e: BiomedEquipment) {
    const calibratedBy = prompt('Calibrated by (name)?'); if (!calibratedBy) return;
    const result = prompt('Result (pass/conditional/fail)?', 'pass') ?? 'pass';
    const agency = prompt('Certifying agency?') ?? '';
    const nablNo = prompt('NABL accreditation no?') ?? '';
    const certNo = prompt('Certificate no?') ?? '';
    try {
      await this.svc.calibrate({
        equipmentId: e.id,
        result: result as CalibrationResult,
        calibratedByName: calibratedBy,
        certifyingAgency: agency || null,
        certifyingAgencyNablNo: nablNo || null,
        certificateNo: certNo || null,
      });
      await this.refresh();
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected async reportBreakdown(e: BiomedEquipment) {
    const desc = prompt('Breakdown description?'); if (!desc) return;
    const reportedBy = prompt('Reported by (name)?') ?? '';
    try {
      await this.svc.reportBreakdown(e.id, desc, reportedBy);
      await this.refresh();
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }
}
