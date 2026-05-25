import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BloodBankService } from '../data/blood-bank.service';
import {
  BLOOD_GROUP_LABELS, COMPONENT_LABELS, STAGE_LABELS,
  type BBRequestPriority, type BloodComponent, type BloodGroup,
  type BloodRequest, type BloodRequestSlaStatus, type BloodRequestStage,
  type BloodUnit, type Donation, type Donor, type InventorySummaryRow,
  type TransfusionRecord,
} from '../data/blood-bank.types';
import {
  bloodGroupEnumToText, currentStage, daysUntil, formatPending,
  pendingDays, pendingMinutes, slaStatus, slaTargetMinutes,
} from '../data/blood-bank.utils';
import { BloodRequestDetailComponent } from '../components/blood-request-detail.component';
import { DonorFormComponent } from '../components/donor-form.component';
import { DonationFormComponent } from '../components/donation-form.component';
import { TransfusionRunsheetComponent } from '../components/transfusion-runsheet.component';
import { TransfusionPdfService } from '../services/transfusion-pdf.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

type Tab = 'inventory' | 'donors' | 'requests' | 'transfusions';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, RouterLink,
    BloodRequestDetailComponent, DonorFormComponent, DonationFormComponent,
    TransfusionRunsheetComponent, ExportMenuComponent,
  ],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Blood Bank</h1>
      <p class="text-[12px] text-ink-soft">Donor → Donation → Screening → Inventory → Cross-match → Issue → Transfusion</p>
    </div>
    <div class="flex items-center gap-2">
      <button (click)="runSlaSweep()" class="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-surface-subtle">
        Run SLA sweep
      </button>
      <button (click)="runExpireSweep()" class="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-surface-subtle">
        Run expiry sweep
      </button>
      @if (sweepMsg()) { <span class="text-[11px] text-good-fg">{{ sweepMsg() }}</span> }
      <app-export-menu (pick)="onExport($event)"/>
    </div>
  </header>

  <!-- Tabs -->
  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }} <span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- ── INVENTORY ── -->
  @if (tab() === 'inventory') {
    <div class="space-y-4">
      <div class="rounded-md border border-border bg-surface-card p-4">
        <h2 class="text-sm font-semibold mb-3">Available Inventory · by group × component</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full text-[12px]">
            <thead>
              <tr class="text-ink-soft text-left">
                <th class="px-2 py-1">Group</th>
                @for (c of componentCols; track c) {
                  <th class="px-2 py-1 text-center">{{ componentLabel(c) }}</th>
                }
                <th class="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (g of groupRows; track g) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1 font-semibold">{{ groupLabel(g) }}</td>
                  @for (c of componentCols; track c) {
                    <td class="px-2 py-1 text-center"
                        [class.text-danger-fg]="cellCount(g, c) === 0"
                        [class.font-bold]="cellCount(g, c) > 0">
                      {{ cellCount(g, c) }}
                    </td>
                  }
                  <td class="px-2 py-1 text-right font-semibold">{{ rowTotal(g) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h2 class="text-sm font-semibold mb-3">Expiring within 7 days</h2>
        @if (expiringSoon().length === 0) {
          <p class="text-[12px] text-ink-soft">Nothing expiring soon.</p>
        } @else {
          <table class="min-w-full text-[12px]">
            <thead class="text-ink-soft text-left">
              <tr><th class="px-2 py-1">Unit</th><th class="px-2 py-1">Group</th><th class="px-2 py-1">Comp.</th>
                  <th class="px-2 py-1">State</th><th class="px-2 py-1">Expires</th><th class="px-2 py-1 text-right">Action</th></tr>
            </thead>
            <tbody>
              @for (u of expiringSoon(); track u.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1 font-mono">{{ u.unit_no }}</td>
                  <td class="px-2 py-1">{{ groupLabel(u.blood_group) }}</td>
                  <td class="px-2 py-1">{{ componentLabel(u.component) }}</td>
                  <td class="px-2 py-1">{{ u.state }}</td>
                  <td class="px-2 py-1" [class.text-danger-fg]="daysLeft(u.expires_at) <= 1">
                    {{ u.expires_at | date:'short' }} <span class="text-[10px]">({{ daysLeft(u.expires_at) }}d)</span>
                  </td>
                  <td class="px-2 py-1 text-right">
                    <button (click)="discard(u)" class="text-[11px] text-danger-fg hover:underline">Discard</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h2 class="text-sm font-semibold mb-3">Quarantined / Awaiting Release</h2>
        @if (quarantined().length === 0) {
          <p class="text-[12px] text-ink-soft">No quarantined units.</p>
        } @else {
          <table class="min-w-full text-[12px]">
            <thead class="text-ink-soft text-left">
              <tr><th class="px-2 py-1">Unit</th><th class="px-2 py-1">Group</th>
                  <th class="px-2 py-1">Comp.</th><th class="px-2 py-1">State</th>
                  <th class="px-2 py-1">Collected</th><th class="px-2 py-1 text-right">Action</th></tr>
            </thead>
            <tbody>
              @for (u of quarantined(); track u.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1 font-mono">{{ u.unit_no }}</td>
                  <td class="px-2 py-1">{{ groupLabel(u.blood_group) }}</td>
                  <td class="px-2 py-1">{{ componentLabel(u.component) }}</td>
                  <td class="px-2 py-1">{{ u.state }}</td>
                  <td class="px-2 py-1">{{ u.collected_at | date:'short' }}</td>
                  <td class="px-2 py-1 text-right">
                    @if (u.state === 'tested') {
                      <button (click)="release(u)" class="text-[11px] text-good-fg hover:underline">Release</button>
                    } @else {
                      <span class="text-[10px] text-ink-soft">screening pending</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  }

  <!-- ── DONORS ── -->
  @if (tab() === 'donors') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold">Donors</h2>
          <button (click)="showDonorForm.set(true)" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">+ Register</button>
        </div>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Donor No</th><th class="px-2 py-1">Name</th><th class="px-2 py-1">Group</th>
                <th class="px-2 py-1">Mobile</th><th class="px-2 py-1 text-right">Donations</th>
                <th class="px-2 py-1">Last Donated</th><th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (d of donors(); track d.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ d.donor_no }}</td>
                <td class="px-2 py-1">{{ d.first_name }} {{ d.last_name }}</td>
                <td class="px-2 py-1">{{ groupLabel(d.blood_group) }}</td>
                <td class="px-2 py-1">{{ d.mobile }}</td>
                <td class="px-2 py-1 text-right">{{ d.total_donations }}</td>
                <td class="px-2 py-1">{{ d.last_donation_at ? (d.last_donation_at | date:'mediumDate') : '—' }}</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="openDonation(d)" class="text-[11px] text-brand hover:underline">+ Donation</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h2 class="text-sm font-semibold mb-3">Pending Screenings</h2>
        @if (pendingScreening().length === 0) {
          <p class="text-[12px] text-ink-soft">All caught up.</p>
        } @else {
          <ul class="space-y-2">
            @for (don of pendingScreening(); track don.id) {
              <li class="rounded border border-border p-2 text-[12px]">
                <p class="font-mono text-[11px] text-ink-soft">{{ don.id.slice(0,8) }}</p>
                <p>Volume {{ don.volume_ml }} ml · {{ don.donated_at | date:'short' }}</p>
                <div class="mt-2 flex gap-2">
                  <button (click)="screen(don, 'passed')" class="px-2 py-0.5 text-[11px] rounded bg-good-fg text-white">Pass</button>
                  <button (click)="screen(don, 'failed')" class="px-2 py-0.5 text-[11px] rounded bg-danger-fg text-white">Fail</button>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  }

  <!-- ── REQUESTS (with TAT / SLA) ── -->
  @if (tab() === 'requests') {
    <div class="space-y-3">
      <!-- Filter bar + SLA tile counts -->
      <div class="rounded-md border border-border bg-surface-card p-3 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1 text-[11px]">
          <span class="text-ink-soft mr-1">SLA:</span>
          <button class="px-2 py-0.5 rounded border"
                  [class.bg-danger-fg]="reqSlaFilter()==='breached'"
                  [class.text-white]="reqSlaFilter()==='breached'"
                  [class.border-danger-fg]="true"
                  (click)="toggleSlaFilter('breached')">
            Breached <b>{{ slaCount('breached') }}</b>
          </button>
          <button class="px-2 py-0.5 rounded border"
                  [class.bg-warn-fg]="reqSlaFilter()==='at_risk'"
                  [class.text-white]="reqSlaFilter()==='at_risk'"
                  [class.border-warn-fg]="true"
                  (click)="toggleSlaFilter('at_risk')">
            At Risk <b>{{ slaCount('at_risk') }}</b>
          </button>
          <button class="px-2 py-0.5 rounded border"
                  [class.bg-good-fg]="reqSlaFilter()==='ok'"
                  [class.text-white]="reqSlaFilter()==='ok'"
                  [class.border-good-fg]="true"
                  (click)="toggleSlaFilter('ok')">
            On Time <b>{{ slaCount('ok') }}</b>
          </button>
        </div>

        <div class="h-5 w-px bg-border"></div>

        <label class="text-[11px] flex items-center gap-1">
          <span class="text-ink-soft">Priority:</span>
          <select [ngModel]="reqPriorityFilter()" (ngModelChange)="reqPriorityFilter.set($event)"
                  class="rounded border border-border px-1.5 py-0.5 text-[11px]">
            <option value="all">All</option>
            <option value="stat">STAT</option>
            <option value="urgent">Urgent</option>
            <option value="routine">Routine</option>
          </select>
        </label>

        <label class="text-[11px] flex items-center gap-1">
          <span class="text-ink-soft">Stage:</span>
          <select [ngModel]="reqStageFilter()" (ngModelChange)="reqStageFilter.set($event)"
                  class="rounded border border-border px-1.5 py-0.5 text-[11px]">
            <option value="all">All</option>
            <option value="pending_acknowledgement">Awaiting Ack</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="sample_received">Sample Received</option>
            <option value="crossmatching">Cross-matching</option>
            <option value="cross_matched">Cross-matched</option>
            <option value="issued">Issued</option>
            <option value="dispatched">Dispatched</option>
            <option value="ward_received">At Ward</option>
          </select>
        </label>

        <label class="text-[11px] flex items-center gap-1 ml-auto">
          <input type="checkbox" [ngModel]="reqIncludeClosed()" (ngModelChange)="reqIncludeClosed.set($event)" />
          <span class="text-ink-soft">Include completed / cancelled</span>
        </label>
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h2 class="text-sm font-semibold mb-3">
          Pending Requests
          <span class="text-[11px] font-normal text-ink-soft">({{ filteredRequests().length }} of {{ requests().length }})</span>
        </h2>

        @if (filteredRequests().length === 0) {
          <p class="text-[12px] text-ink-soft">Nothing matches the current filters.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full text-[12px]">
              <thead class="text-ink-soft text-left">
                <tr>
                  <th class="px-2 py-1">Request</th>
                  <th class="px-2 py-1">Patient</th>
                  <th class="px-2 py-1">Group · Comp.</th>
                  <th class="px-2 py-1 text-right">Units</th>
                  <th class="px-2 py-1">Priority</th>
                  <th class="px-2 py-1">Stage</th>
                  <th class="px-2 py-1">Raised</th>
                  <th class="px-2 py-1 text-right">Pending</th>
                  <th class="px-2 py-1 text-right">SLA target</th>
                  <th class="px-2 py-1">SLA</th>
                  <th class="px-2 py-1 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (r of filteredRequests(); track r.id) {
                  <tr class="border-t border-border align-top"
                      [class.bg-danger-fg]="rowSla(r)==='breached'"
                      [class.bg-opacity-5]="rowSla(r)==='breached'"
                      [class.bg-warn-fg]="rowSla(r)==='at_risk'"
                      [class.bg-opacity-5]="rowSla(r)==='at_risk'">
                    <td class="px-2 py-1 font-mono">{{ r.request_no }}</td>
                    <td class="px-2 py-1">
                      <a [routerLink]="['/patients', r.patient_id]"
                         class="font-medium text-ink hover:text-primary-700">
                        {{ r.patient?.full_name || '—' }}
                      </a>
                      @if (r.patient?.uhid) {
                        <div class="text-[10px] font-mono text-ink-muted">{{ r.patient?.uhid }}</div>
                      }
                    </td>
                    <td class="px-2 py-1">
                      <span class="font-semibold">{{ groupLabel(r.blood_group) }}</span>
                      <span class="text-ink-soft"> · {{ componentLabel(r.component) }}</span>
                    </td>
                    <td class="px-2 py-1 text-right">{{ r.units_required }}</td>
                    <td class="px-2 py-1">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                            [class.bg-danger-fg]="r.priority==='stat'"
                            [class.text-white]="r.priority==='stat'"
                            [class.bg-warn-fg]="r.priority==='urgent'"
                            [class.bg-surface-subtle]="r.priority==='routine'">
                        {{ r.priority }}
                      </span>
                    </td>
                    <td class="px-2 py-1">
                      <span class="px-1.5 py-0.5 rounded text-[10px] bg-surface-subtle">
                        {{ stageLabel(rowStage(r)) }}
                      </span>
                    </td>
                    <td class="px-2 py-1">{{ r.created_at | date:'short' }}</td>
                    <td class="px-2 py-1 text-right tabular-nums"
                        [class.text-danger-fg]="rowSla(r)==='breached'"
                        [class.text-warn-fg]="rowSla(r)==='at_risk'">
                      {{ rowPendingLabel(r) }}
                      @if (rowDays(r) > 0) {
                        <div class="text-[10px] text-ink-soft">{{ rowDays(r) }} day{{ rowDays(r)===1?'':'s' }}</div>
                      }
                    </td>
                    <td class="px-2 py-1 text-right tabular-nums text-ink-soft">{{ rowSlaTarget(r) }}m</td>
                    <td class="px-2 py-1">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                            [class.bg-danger-fg]="rowSla(r)==='breached'"
                            [class.bg-warn-fg]="rowSla(r)==='at_risk'"
                            [class.bg-good-fg]="rowSla(r)==='ok'"
                            [class.bg-surface-subtle]="rowSla(r)==='closed'"
                            [class.text-white]="rowSla(r)!=='closed'">
                        {{ slaLabel(rowSla(r)) }}
                      </span>
                    </td>
                    <td class="px-2 py-1 text-right">
                      <button (click)="openRequest(r)" class="text-[11px] text-brand hover:underline">Open</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  }

  <!-- ── TRANSFUSIONS ── -->
  @if (tab() === 'transfusions') {
    <!-- Ready-to-transfuse: ward-received units waiting for nurse to start -->
    <div class="rounded-md border border-border bg-surface-card p-4 mb-4">
      <h2 class="text-sm font-semibold mb-3">Ready to Transfuse <span class="text-[11px] text-ink-soft font-normal">({{ readyToTransfuse().length }})</span></h2>
      @if (readyToTransfuse().length === 0) {
        <p class="text-[12px] text-ink-soft">No units waiting at the bedside.</p>
      } @else {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Request</th><th class="px-2 py-1">Patient</th>
                <th class="px-2 py-1">Unit</th><th class="px-2 py-1">Group · Comp</th>
                <th class="px-2 py-1">Ward received</th><th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (r of readyToTransfuse(); track r.unit_id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1 font-mono">{{ r.request_no }}</td>
                <td class="px-2 py-1">{{ r.patient_name }}</td>
                <td class="px-2 py-1 font-mono">{{ r.unit_no }}</td>
                <td class="px-2 py-1">{{ r.blood_group }} · {{ r.component }}</td>
                <td class="px-2 py-1">{{ r.ward_received_at | date:'shortTime' }}</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="openRunsheet(r)"
                          class="px-2 h-7 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
                    {{ r.has_open_record ? '▶ Continue run-sheet' : '▶ Start transfusion' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    <div class="rounded-md border border-border bg-surface-card p-4">
      <h2 class="text-sm font-semibold mb-3">Recent Transfusions</h2>
      @if (transfusions().length === 0) {
        <p class="text-[12px] text-ink-soft">No records.</p>
      } @else {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Started</th><th class="px-2 py-1">Patient</th>
                <th class="px-2 py-1">Outcome</th><th class="px-2 py-1">Reaction</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (t of transfusions(); track t.id) {
              <tr class="border-t border-border">
                <td class="px-2 py-1">{{ t.started_at | date:'short' }}</td>
                <td class="px-2 py-1 font-mono">{{ t.patient_id.slice(0,8) }}</td>
                <td class="px-2 py-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-good-fg]="t.outcome==='completed'"
                        [class.text-white]="t.outcome!=='completed'"
                        [class.bg-danger-fg]="t.outcome==='aborted' || t.outcome==='reaction'">
                    {{ t.outcome }}
                  </span>
                </td>
                <td class="px-2 py-1">{{ t.reaction }}</td>
                <td class="px-2 py-1 text-right">
                  <button (click)="printTransfusion(t.id)" class="text-[11px] text-brand hover:underline">Print</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  }
</section>

@if (showDonorForm()) {
  <app-donor-form
    (saved)="onDonorSaved($event)"
    (cancelled)="showDonorForm.set(false)" />
}

@if (donationFor()) {
  <app-donation-form
    [donor]="donationFor()!"
    (saved)="onDonationSaved()"
    (cancelled)="donationFor.set(null)" />
}

@if (runsheetFor(); as ctx) {
  <app-transfusion-runsheet
    [request]="ctx.request"
    [unit]="ctx.unit"
    (closed)="runsheetFor.set(null)"
    (saved)="onTransfusionClosed()" />
}

@if (selectedRequest()) {
  <app-blood-request-detail
    [request]="selectedRequest()!"
    (closed)="onRequestDetailClosed()" />
}
  `,
})
export class BloodBankPage implements OnInit {
  private bb = inject(BloodBankService);
  private pdf = inject(TransfusionPdfService);
  private branchStore = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected tab = signal<Tab>('inventory');
  protected sweepMsg = signal<string | null>(null);

  protected donors = signal<Donor[]>([]);
  protected donations = signal<Donation[]>([]);
  protected units = signal<BloodUnit[]>([]);
  protected requests = signal<BloodRequest[]>([]);
  protected transfusions = signal<{ id: string; patient_id: string; started_at: string; outcome: string; reaction: string; }[]>([]);

  protected showDonorForm = signal(false);
  protected donationFor = signal<Donor | null>(null);
  protected selectedRequest = signal<BloodRequest | null>(null);
  /** Phase 2 — bedside transfusion run-sheet: { request, unit } currently being run. */
  protected runsheetFor = signal<{ request: BloodRequest; unit: BloodUnit } | null>(null);
  /** Cache of in-progress (outcome IS NULL) transfusion records keyed by unit_id. */
  protected openTransfusionByUnit = signal<Record<string, string>>({});

  protected componentCols: BloodComponent[] = ['whole_blood','prbc','ffp','platelets','single_donor_platelets','cryo'];
  protected groupRows:    BloodGroup[]    = ['O_POS','O_NEG','A_POS','A_NEG','B_POS','B_NEG','AB_POS','AB_NEG'];

  protected tabs = [
    { id: 'inventory'    as Tab, label: 'Inventory',    count: () => this.availableCount() },
    { id: 'donors'       as Tab, label: 'Donors',       count: () => this.donors().length },
    { id: 'requests'     as Tab, label: 'Requests',     count: () => this.activeRequests().length },
    { id: 'transfusions' as Tab, label: 'Transfusions', count: () => this.transfusions().length },
  ];

  protected availableUnits = computed(() => this.units().filter(u => u.state === 'available'));
  protected availableCount = computed(() => this.availableUnits().length);

  protected expiringSoon = computed(() =>
    this.units()
      .filter(u => ['quarantined','tested','available','reserved'].includes(u.state))
      .filter(u => daysUntil(u.expires_at) <= 7)
      .sort((a, b) => +new Date(a.expires_at) - +new Date(b.expires_at)),
  );

  protected quarantined = computed(() =>
    this.units().filter(u => u.state === 'quarantined' || u.state === 'tested'),
  );

  protected pendingScreening = computed(() =>
    this.donations().filter(d => d.screening_status === 'pending'),
  );

  protected activeRequests = computed(() =>
    this.requests().filter(r => !['completed','cancelled'].includes(r.state))
      .sort((a, b) => {
        const order = { stat: 0, urgent: 1, routine: 2 } as const;
        return order[a.priority] - order[b.priority];
      }),
  );

  // ── Pending-requests TAT filters ───────────────────────────────
  protected reqSlaFilter      = signal<BloodRequestSlaStatus | 'all'>('all');
  protected reqPriorityFilter = signal<BBRequestPriority | 'all'>('all');
  protected reqStageFilter    = signal<BloodRequestStage | 'all'>('all');
  protected reqIncludeClosed  = signal(false);

  protected toggleSlaFilter(s: BloodRequestSlaStatus) {
    this.reqSlaFilter.set(this.reqSlaFilter() === s ? 'all' : s);
  }

  protected slaCount(s: BloodRequestSlaStatus): number {
    return this.requests().filter(r => slaStatus(r) === s).length;
  }

  protected filteredRequests = computed(() => {
    const sf  = this.reqSlaFilter();
    const pf  = this.reqPriorityFilter();
    const stf = this.reqStageFilter();
    const inc = this.reqIncludeClosed();
    const priorityOrder = { stat: 0, urgent: 1, routine: 2 } as const;

    return this.requests()
      .filter(r => inc || !['completed','cancelled'].includes(r.state))
      .filter(r => sf  === 'all' || slaStatus(r) === sf)
      .filter(r => pf  === 'all' || r.priority === pf)
      .filter(r => stf === 'all' || currentStage(r) === stf)
      .sort((a, b) => {
        const sa = slaStatus(a), sb = slaStatus(b);
        const slaOrder = { breached: 0, at_risk: 1, ok: 2, closed: 3 } as const;
        if (sa !== sb) return slaOrder[sa] - slaOrder[sb];
        if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority];
        return +new Date(a.created_at) - +new Date(b.created_at);
      });
  });

  /** Phase 2 — units physically at the bedside (request issued + ward received,
   *  unit still in 'issued' state, not yet transfused). */
  protected readonly readyToTransfuse = computed(() => {
    const open = this.openTransfusionByUnit();
    const reqs = this.requests().filter(r => r.state === 'issued' && r.ward_received_at);
    const reqById = new Map(reqs.map(r => [r.id, r]));
    return this.units()
      .filter(u => u.state === 'issued' && u.reserved_for_request_id && reqById.has(u.reserved_for_request_id))
      .map(u => {
        const r = reqById.get(u.reserved_for_request_id!)!;
        return {
          request_id:   r.id,
          request_no:   r.request_no,
          patient_name: (r as any).patient?.full_name ?? '—',
          unit_id:      u.id,
          unit_no:      u.unit_no,
          blood_group:  u.blood_group,
          component:    u.component,
          ward_received_at: r.ward_received_at,
          has_open_record: !!open[u.id],
          _request: r,
          _unit: u,
        };
      })
      .sort((a, b) => +new Date(a.ward_received_at!) - +new Date(b.ward_received_at!));
  });

  protected rowSla        = (r: BloodRequest) => slaStatus(r);
  protected rowStage      = (r: BloodRequest) => currentStage(r);
  protected rowSlaTarget  = (r: BloodRequest) => slaTargetMinutes(r);
  protected rowDays       = (r: BloodRequest) => pendingDays(r);
  protected rowPendingLabel = (r: BloodRequest) => formatPending(pendingMinutes(r));
  protected stageLabel    = (s: BloodRequestStage) => STAGE_LABELS[s];
  protected slaLabel      = (s: BloodRequestSlaStatus) =>
    s === 'breached' ? 'Breached' : s === 'at_risk' ? 'At Risk' : s === 'ok' ? 'On Time' : 'Closed';

  ngOnInit() { this.refreshAll(); }

  /** Re-fetch when the user switches branch via the top-right picker. */
  private readonly branchSwitchEffect = effect(() => {
    const _ = this.branchStore.activeBranchId();
    queueMicrotask(() => this.refreshAll());
  });

  protected setTab(t: Tab) { this.tab.set(t); }

  protected groupLabel(g: BloodGroup) { return BLOOD_GROUP_LABELS[g]; }
  protected componentLabel(c: BloodComponent) { return COMPONENT_LABELS[c]; }
  protected daysLeft = (iso: string) => daysUntil(iso);

  protected cellCount(g: BloodGroup, c: BloodComponent): number {
    return this.availableUnits().filter(u => u.blood_group === g && u.component === c).length;
  }
  protected rowTotal(g: BloodGroup): number {
    return this.availableUnits().filter(u => u.blood_group === g).length;
  }

  private async refreshAll() {
    const branchId = this.branchStore.activeBranchId();
    const [donors, donations, units, requests, transfusions] = await Promise.all([
      this.bb.listDonors(),
      this.bb.listDonations(),
      this.bb.listUnits(),
      this.bb.listRequests({ branchId }),
      this.bb.listTransfusions({ branchId }),
    ]);
    this.donors.set(donors);
    this.donations.set(donations);
    this.units.set(units);
    this.requests.set(requests);
    this.transfusions.set(transfusions as any);
    // Build open-transfusion lookup so the "Continue run-sheet" CTA labels right.
    const open: Record<string, string> = {};
    for (const t of transfusions as TransfusionRecord[]) {
      if (t.outcome === null) open[t.unit_id] = t.id;
    }
    this.openTransfusionByUnit.set(open);
  }

  // ── Phase 2 — bedside transfusion ──────────────────────────────
  protected openRunsheet(row: { _request: BloodRequest; _unit: BloodUnit }) {
    this.runsheetFor.set({ request: row._request, unit: row._unit });
  }

  protected async onTransfusionClosed() {
    this.runsheetFor.set(null);
    await this.refreshAll();
  }

  // ── Actions ────────────────────────────────────────────────────
  protected async runExpireSweep() {
    try {
      const n = await this.bb.expireSweep();
      this.sweepMsg.set(`Expired ${n} unit${n === 1 ? '' : 's'}`);
      setTimeout(() => this.sweepMsg.set(null), 4000);
      await this.refreshAll();
    } catch (e: any) {
      alert(e?.message ?? 'Sweep failed');
    }
  }

  protected async runSlaSweep() {
    try {
      const r = await this.bb.slaSweep();
      this.sweepMsg.set(
        `SLA: ${r.warn_50} @50% · ${r.warn_80} @80% · ${r.breach_alerts} breach (${r.newly_breach_flag} newly flagged)`,
      );
      setTimeout(() => this.sweepMsg.set(null), 6000);
      await this.refreshAll();
    } catch (e: any) {
      alert(e?.message ?? 'SLA sweep failed');
    }
  }

  protected async release(u: BloodUnit) {
    try { await this.bb.releaseUnit(u.id); await this.refreshAll(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async discard(u: BloodUnit) {
    const reason = prompt('Reason for discarding?');
    if (!reason) return;
    try { await this.bb.discardUnit(u.id, reason); await this.refreshAll(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async screen(d: Donation, status: 'passed' | 'failed') {
    try { await this.bb.screenDonation({ donationId: d.id, status }); await this.refreshAll(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onDonorSaved(_d: Donor) { this.showDonorForm.set(false); this.refreshAll(); }
  protected openDonation(d: Donor) { this.donationFor.set(d); }
  protected onDonationSaved() { this.donationFor.set(null); this.refreshAll(); }

  protected openRequest(r: BloodRequest) { this.selectedRequest.set(r); }
  protected onRequestDetailClosed() { this.selectedRequest.set(null); this.refreshAll(); }

  protected async printTransfusion(id: string) {
    try {
      const tx = await this.bb.getTransfusion(id);
      this.pdf.print(tx);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const branchLabel = this.branchStore.activeBranchName().replace(/\s+/g, '_');
    const today = new Date().toISOString().slice(0,10);

    if (this.tab() === 'inventory') {
      const rows = this.groupRows.map(g => {
        const row: any = { group: BLOOD_GROUP_LABELS[g] };
        let total = 0;
        for (const c of this.componentCols) {
          const n = this.cellCount(g, c);
          row['c_' + c] = n;
          total += n;
        }
        row.total = total;
        return row;
      });
      const columns: ExportColumn<any>[] = [
        { key: 'group', header: 'Group', width: 10, align: 'left' },
        ...this.componentCols.map(c => ({
          key: 'c_' + c, header: COMPONENT_LABELS[c], width: 10, align: 'right' as const, format: 'integer' as const,
        })),
        { key: 'total', header: 'Total', width: 10, align: 'right', format: 'integer' as const },
      ];
      await this.exportSvc.export(fmt, {
        filename: `BloodBank_Inventory_${branchLabel}_${today}`,
        title: 'Blood Bank · Inventory',
        subtitle: `${this.availableCount()} available unit${this.availableCount() === 1 ? '' : 's'}`,
        columns, rows,
        footer: 'Sree Diagnostics · Blood Bank Inventory',
      });
      return;
    }

    if (this.tab() === 'donors') {
      const rows = this.donors().map((d: any) => ({
        donor_code: d.donor_code ?? d.id?.slice(0, 8),
        full_name: d.full_name ?? '',
        gender: d.gender ?? '',
        blood_group: d.blood_group ? BLOOD_GROUP_LABELS[d.blood_group as BloodGroup] : '',
        mobile: d.mobile ?? '',
        last_donated_at: d.last_donated_at ?? '',
      }));
      const columns: ExportColumn<any>[] = [
        { key: 'donor_code',      header: 'Donor code',  width: 14, align: 'left' },
        { key: 'full_name',       header: 'Name',        width: 26, align: 'left' },
        { key: 'gender',          header: 'Gender',      width: 8,  align: 'center' },
        { key: 'blood_group',     header: 'Group',       width: 8,  align: 'center' },
        { key: 'mobile',          header: 'Mobile',      width: 14, align: 'left' },
        { key: 'last_donated_at', header: 'Last donation', width: 16, align: 'center', format: 'date' },
      ];
      await this.exportSvc.export(fmt, {
        filename: `BloodBank_Donors_${branchLabel}_${today}`,
        title: 'Blood Bank · Donors',
        subtitle: `${rows.length} donor${rows.length === 1 ? '' : 's'}`,
        columns, rows,
        footer: 'Sree Diagnostics · Blood Bank Donors',
      });
      return;
    }

    if (this.tab() === 'requests') {
      const rows = this.requests().map((r: any) => ({
        request_no:   r.request_number ?? r.id?.slice(0, 8),
        patient_name: r.patient_name ?? '',
        group:        r.blood_group ? BLOOD_GROUP_LABELS[r.blood_group as BloodGroup] : '',
        component:    r.component ? COMPONENT_LABELS[r.component as BloodComponent] : '',
        units:        r.units_requested ?? r.units ?? '',
        priority:     r.priority ?? '',
        state:        r.state ?? '',
        sla:          slaStatus(r),
        requested_at: r.created_at ?? '',
      }));
      const columns: ExportColumn<any>[] = [
        { key: 'request_no',   header: 'Req #',     width: 14, align: 'left' },
        { key: 'patient_name', header: 'Patient',   width: 22, align: 'left' },
        { key: 'group',        header: 'Group',     width: 8,  align: 'center' },
        { key: 'component',    header: 'Component', width: 16, align: 'left' },
        { key: 'units',        header: 'Units',     width: 6,  align: 'right', format: 'integer' as const },
        { key: 'priority',     header: 'Priority',  width: 10, align: 'center' },
        { key: 'state',        header: 'State',     width: 14, align: 'left' },
        { key: 'sla',          header: 'SLA',       width: 8,  align: 'center' },
        { key: 'requested_at', header: 'Requested', width: 18, align: 'center', format: 'datetime' as const },
      ];
      await this.exportSvc.export(fmt, {
        filename: `BloodBank_Requests_${branchLabel}_${today}`,
        title: 'Blood Bank · Requests',
        subtitle: `${rows.length} request${rows.length === 1 ? '' : 's'}`,
        columns, rows,
        footer: 'Sree Diagnostics · Blood Bank Requests',
      });
      return;
    }

    // transfusions
    const rows = this.transfusions().map(t => ({
      id: t.id.slice(0, 8),
      started_at: t.started_at,
      outcome:    t.outcome ?? '',
      reaction:   t.reaction ?? '',
    }));
    const columns: ExportColumn<any>[] = [
      { key: 'id',         header: 'Tx ID',     width: 14, align: 'left' },
      { key: 'started_at', header: 'Started',   width: 18, align: 'center', format: 'datetime' as const },
      { key: 'outcome',    header: 'Outcome',   width: 12, align: 'left' },
      { key: 'reaction',   header: 'Reaction',  width: 14, align: 'left' },
    ];
    await this.exportSvc.export(fmt, {
      filename: `BloodBank_Transfusions_${branchLabel}_${today}`,
      title: 'Blood Bank · Transfusions',
      subtitle: `${rows.length} transfusion${rows.length === 1 ? '' : 's'}`,
      columns, rows,
      footer: 'Sree Diagnostics · Blood Bank Transfusion Log',
    });
  }
}
