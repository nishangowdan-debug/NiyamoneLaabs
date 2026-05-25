import {
  ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';
import {
  LabComplianceService,
  type QcRunAuditRow, type QcRunsLedgerFilters,
  type ShiftComplianceRow, type ShiftFilters,
  type PeriodSummary,
} from '../data/lab-compliance.service';
import { LabAuditPackService } from '../services/lab-audit-pack.service';
import { LabQcService } from '../../lab-qc/data/lab-qc.service';
import type { LabInstrument } from '../../lab-qc/data/lab-qc.types';

type Tab = 'runs' | 'lj' | 'shifts' | 'summary';

const ALL_VIOLATIONS = ['1-2s','1-3s','2-2s','R-4s','4-1s','10x','expired_lot'];
const PAGE_SIZE = 25;

@Component({
  selector: 'app-lab-compliance-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, RouterLinkActive, ExportMenuComponent],
  template: `
@if (!embedded) {
  <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">🧬 Lab &amp; Radiology</h1>
      <nav class="mt-2 flex gap-1 flex-wrap">
        <a routerLink="/lab" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #wb="routerLinkActive"
           [class]="tabCls(wb.isActive)">📋 Workflow</a>
        <a routerLink="/lab/history" routerLinkActive #hi="routerLinkActive"
           [class]="tabCls(hi.isActive)">📚 Reports History</a>
        <a routerLink="/lab/reference" routerLinkActive #ra="routerLinkActive"
           [class]="tabCls(ra.isActive)">↗ Outsource</a>
        <a routerLink="/lab/qc" routerLinkActive #qa="routerLinkActive"
           [class]="tabCls(qa.isActive)">🔬 QC &amp; Audit</a>
      </nav>
    </div>
    <div class="text-right text-[11px] text-ink-muted">
      <p>Branch: <strong>{{ branch.activeBranchName() }}</strong></p>
      <p>Audit retention: 2 years</p>
    </div>
  </header>
}

<!-- Inner tabs -->
<nav class="flex gap-1 border-b border-border mb-4">
  @for (t of innerTabs; track t.id) {
    <button (click)="setInnerTab(t.id)"
            class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
            [class.text-primary-700]="tab() === t.id"
            [class.border-primary-700]="tab() === t.id"
            [class.border-transparent]="tab() !== t.id"
            [class.text-ink-soft]="tab() !== t.id">
      {{ t.icon }} {{ t.label }}
    </button>
  }
</nav>

<!-- ═════════════ Tab 1 — QC Runs ledger ═════════════ -->
@if (tab() === 'runs') {
  <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">

    <!-- Filters -->
    <header class="px-3 py-3 border-b border-border space-y-2">
      <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From</span>
          <input type="date" [(ngModel)]="fromDate" (ngModelChange)="onFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To</span>
          <input type="date" [(ngModel)]="toDate" (ngModelChange)="onFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Instrument</span>
          <select [(ngModel)]="instrumentId" (ngModelChange)="onFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">All</option>
            @for (i of instruments(); track i.id) {
              <option [ngValue]="i.id">{{ i.code }} · {{ i.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Test</span>
          <select [(ngModel)]="testId" (ngModelChange)="onFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">All</option>
            @for (t of labTests(); track t.id) {
              <option [ngValue]="t.id">{{ t.code }} · {{ t.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Status</span>
          <select [(ngModel)]="status" (ngModelChange)="onFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">All</option>
            <option value="accepted">Accepted</option>
            <option value="warning">Warning</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Violation</span>
          <select [(ngModel)]="violation" (ngModelChange)="onFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">Any</option>
            @for (v of violations; track v) { <option [ngValue]="v">{{ v }}</option> }
          </select>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input [(ngModel)]="runBy" (ngModelChange)="onFilterChange()"
               placeholder="Run by name (search)…"
               class="h-8 px-2.5 text-[12px] w-64 bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        <button type="button" (click)="resetFilters()"
                class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle">
          Reset
        </button>
        <app-export-menu [disabled]="loading() || rows().length === 0" (pick)="onExport($event)"/>
        <span class="text-[11px] text-ink-muted ml-auto">
          @if (!loading()) {
            <strong>{{ total() }}</strong> matching run(s) ·
            page <strong>{{ page() + 1 }}</strong> of <strong>{{ pageCount() || 1 }}</strong>
          } @else { Loading… }
        </span>
      </div>
    </header>

    <!-- Table -->
    @if (loading()) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading runs…</div>
    } @else if (rows().length === 0) {
      <div class="px-6 py-12 text-center text-[12.5px] text-ink-muted">
        No QC runs match the current filters.
      </div>
    } @else {
      <div class="overflow-x-auto">
        <table class="w-full text-[12px]">
          <thead class="bg-surface-muted">
            <tr>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">When</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Instrument</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Test · Material lot</th>
              <th class="text-right px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Value · μ ± SD</th>
              <th class="text-right px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">SD</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Status</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Violations</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Action</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Run by</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.run_id) {
              <tr class="border-t border-border align-top hover:bg-surface-subtle/40">
                <td class="px-3 py-2 whitespace-nowrap">{{ shortDateTime(r.measured_at) }}</td>
                <td class="px-3 py-2">
                  <p class="font-mono text-[11px] text-ink">{{ r.instrument_code || '—' }}</p>
                  <p class="text-[10.5px] text-ink-muted">{{ r.instrument_name }}</p>
                </td>
                <td class="px-3 py-2">
                  <p class="font-mono text-[11px] text-ink">{{ r.test_code }}</p>
                  <p class="text-[10.5px] text-ink-muted">lot {{ r.material_lot }} · {{ r.material_level }}
                    @if (r.material_expiry) { · exp {{ r.material_expiry }} }
                  </p>
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <p class="font-mono">{{ r.value }} <span class="text-ink-muted">{{ r.material_unit }}</span></p>
                  <p class="text-[10.5px] text-ink-muted font-mono">μ {{ r.mean_target }} ± {{ r.sd_target }}</p>
                </td>
                <td class="px-3 py-2 text-right font-mono"
                    [class.text-warn-fg]="r.run_status === 'warning'"
                    [class.text-danger-fg]="r.run_status === 'rejected'">
                  {{ r.deviation_sd?.toFixed(2) ?? '—' }}
                </td>
                <td class="px-3 py-2">
                  <span [class]="statusChip(r.run_status)">{{ r.run_status }}</span>
                </td>
                <td class="px-3 py-2">
                  @if (r.violations?.length) {
                    <div class="flex flex-wrap gap-1">
                      @for (v of r.violations; track v) {
                        <span class="text-[10px] font-mono px-1.5 py-px rounded bg-danger-bg/40 text-danger-fg">{{ v }}</span>
                      }
                    </div>
                  } @else { <span class="text-ink-muted">—</span> }
                </td>
                <td class="px-3 py-2 min-w-[180px]">
                  @if (r.run_status !== 'accepted' && !r.action_taken) {
                    <span class="text-[10.5px] text-warn-fg font-semibold">⚠ Action note required</span>
                  }
                  @if (editingId() === r.run_id) {
                    <textarea rows="2" [(ngModel)]="editAction"
                              class="mt-1 w-full text-[11px] bg-surface-card border border-border rounded-md px-2 py-1"></textarea>
                    <div class="mt-1 flex gap-1">
                      <button type="button" (click)="saveAnnotation(r)" [disabled]="saving()"
                              class="h-6 px-2 rounded-md text-[10px] font-semibold text-white"
                              style="background:#0E4F8C;">Save</button>
                      <button type="button" (click)="cancelEdit()"
                              class="h-6 px-2 rounded-md text-[10px] border border-border">Cancel</button>
                    </div>
                  } @else {
                    <p class="text-[11px] text-ink whitespace-pre-wrap">{{ r.action_taken || '—' }}</p>
                    <button type="button" (click)="startEdit(r)"
                            class="mt-1 text-[10px] text-primary-700 hover:underline">
                      {{ r.action_taken ? 'Edit' : '+ Add note' }}
                    </button>
                  }
                </td>
                <td class="px-3 py-2 whitespace-nowrap">{{ r.ran_by_full_name || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <footer class="px-3 py-2 border-t border-border flex items-center gap-2 text-[12px]">
        <button type="button" (click)="setPage(0)"           [disabled]="page() === 0"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">«</button>
        <button type="button" (click)="setPage(page() - 1)"  [disabled]="page() === 0"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">‹ Prev</button>
        <span class="text-ink-muted">Page {{ page() + 1 }} of {{ pageCount() || 1 }}</span>
        <button type="button" (click)="setPage(page() + 1)"  [disabled]="page() + 1 >= pageCount()"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">Next ›</button>
        <button type="button" (click)="setPage(pageCount() - 1)" [disabled]="page() + 1 >= pageCount()"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">»</button>
        <span class="ml-auto text-ink-muted">{{ PAGE_SIZE }} per page</span>
      </footer>
    }
  </section>
}

<!-- ═════════════ Tabs 2-4 stubs ═════════════ -->
@if (tab() === 'lj') {
  <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">

    <!-- Filters -->
    <header class="px-3 py-3 border-b border-border space-y-2">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-2">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Test *</span>
          <select [(ngModel)]="ljTestId" (ngModelChange)="onLjFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">— pick test —</option>
            @for (t of labTests(); track t.id) {
              <option [ngValue]="t.id">{{ t.code }} · {{ t.name }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Instrument</span>
          <select [(ngModel)]="ljInstrumentId" (ngModelChange)="onLjFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option [ngValue]="null">All</option>
            @for (i of instruments(); track i.id) {
              <option [ngValue]="i.id">{{ i.code }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From</span>
          <input type="date" [(ngModel)]="ljFromDate" (ngModelChange)="onLjFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To</span>
          <input type="date" [(ngModel)]="ljToDate" (ngModelChange)="onLjFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Y-axis</span>
          <select [(ngModel)]="ljMode" (ngModelChange)="onLjFilterChange()"
                  class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option value="sd">Deviation (SD) — normalised across lots</option>
            <option value="raw">Raw value (per-lot mean shifts visible)</option>
          </select>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" (click)="exportLjPng()" [disabled]="ljLoading() || ljRuns().length === 0"
                class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
          ⬇ Export PNG
        </button>
        <button type="button" (click)="exportLjCsv()" [disabled]="ljLoading() || ljRuns().length === 0"
                class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
          ⬇ Export CSV
        </button>
        <span class="text-[11px] text-ink-muted ml-auto">
          @if (ljLoading()) { Loading… }
          @else if (ljRuns().length > 0) {
            <strong>{{ ljRuns().length }}</strong> run(s) ·
            <strong>{{ ljLotChanges().length }}</strong> lot change(s) in window
          }
        </span>
      </div>
    </header>

    <!-- Chart -->
    @if (!ljTestId) {
      <div class="px-6 py-12 text-center text-[12.5px] text-ink-muted">
        Select a test to chart its QC runs.
      </div>
    } @else if (ljLoading()) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading runs…</div>
    } @else if (ljRuns().length === 0) {
      <div class="px-6 py-12 text-center text-[12.5px] text-ink-muted">
        No QC runs in the selected window for this test.
      </div>
    } @else {
      <div class="p-3">
        <svg #ljSvg [attr.viewBox]="'0 0 ' + LJ_W + ' ' + LJ_H" class="w-full h-[360px] bg-white rounded-md border border-border"
             xmlns="http://www.w3.org/2000/svg">
          <!-- y-axis labels + ±SD lines (only meaningful in normalised mode) -->
          @if (ljMode === 'sd') {
            @for (b of ljSdBands; track b.k) {
              <line [attr.x1]="LJ_PAD" [attr.x2]="LJ_W - 8" [attr.y1]="ljYSd(b.k)" [attr.y2]="ljYSd(b.k)"
                    [attr.stroke]="b.color" [attr.stroke-dasharray]="b.dash" stroke-width="1" />
              <text [attr.x]="LJ_PAD - 4" [attr.y]="ljYSd(b.k) + 3" font-size="10" text-anchor="end"
                    [attr.fill]="b.color">{{ b.k > 0 ? '+' : '' }}{{ b.k }} SD</text>
            }
          } @else {
            <!-- raw-value mode: a horizontal line per material's mean -->
            @for (m of ljMaterialsInWindow(); track m.material_id) {
              <line [attr.x1]="LJ_PAD" [attr.x2]="LJ_W - 8"
                    [attr.y1]="ljYRaw(m.mean_target)" [attr.y2]="ljYRaw(m.mean_target)"
                    stroke="#888" stroke-dasharray="2,3" stroke-width="0.7" />
              <text [attr.x]="LJ_W - 10" [attr.y]="ljYRaw(m.mean_target) - 2"
                    font-size="9" text-anchor="end" fill="#666">μ {{ m.mean_target }} (lot {{ m.material_lot }})</text>
            }
          }

          <!-- Lot-change vertical markers -->
          @for (lc of ljLotChanges(); track lc.at) {
            <line [attr.x1]="ljX(lc.at)" [attr.x2]="ljX(lc.at)" [attr.y1]="20" [attr.y2]="LJ_H - 20"
                  stroke="#A4302B" stroke-dasharray="3,3" stroke-width="1" />
            <text [attr.x]="ljX(lc.at) + 3" [attr.y]="28" font-size="9" fill="#A4302B">↳ lot {{ lc.toLot }}</text>
          }

          <!-- Connecting line -->
          @if (ljRuns().length > 1) {
            <polyline [attr.points]="ljPolyline()" fill="none" stroke="#888" stroke-width="0.8" />
          }

          <!-- Data points -->
          @for (r of ljRuns(); track r.run_id) {
            <circle [attr.cx]="ljX(r.measured_at)"
                    [attr.cy]="ljYFor(r)"
                    r="3.2"
                    [attr.fill]="ljPointColor(r.run_status)"
                    [attr.stroke]="'#fff'" stroke-width="1">
              <title>{{ r.measured_at }} · value {{ r.value }} · {{ r.deviation_sd?.toFixed(2) }} SD · {{ r.run_status }}</title>
            </circle>
          }

          <!-- x-axis date ticks (start, mid, end) -->
          @for (t of ljXTicks(); track t.label) {
            <line [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="LJ_H - 18" [attr.y2]="LJ_H - 14"
                  stroke="#999" stroke-width="0.6" />
            <text [attr.x]="t.x" [attr.y]="LJ_H - 4" font-size="10" text-anchor="middle" fill="#666">{{ t.label }}</text>
          }
        </svg>

        <!-- Summary chips -->
        <div class="mt-3 flex flex-wrap gap-3 text-[12px]">
          <div class="px-2 py-1 rounded-md bg-good-bg text-good-fg">
            ✓ Accepted <strong>{{ ljCounts().accepted }}</strong>
          </div>
          <div class="px-2 py-1 rounded-md bg-warn-bg text-warn-fg">
            ⚠ Warning <strong>{{ ljCounts().warning }}</strong>
          </div>
          <div class="px-2 py-1 rounded-md bg-danger-bg text-danger-fg">
            ✗ Rejected <strong>{{ ljCounts().rejected }}</strong>
          </div>
          @if (ljLotChanges().length > 0) {
            <div class="px-2 py-1 rounded-md border border-border text-ink-soft">
              🔀 Lot changes in window: <strong>{{ ljLotChanges().length }}</strong>
              ({{ ljLotChanges()[ljLotChanges().length - 1]?.toLot }} active)
            </div>
          }
        </div>
      </div>
    }
  </section>
}
@if (tab() === 'shifts') {
  <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">

    <!-- Filters -->
    <header class="px-3 py-3 border-b border-border space-y-2">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From</span>
          <input type="date" [(ngModel)]="shFromDate" (ngModelChange)="onShFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To</span>
          <input type="date" [(ngModel)]="shToDate" (ngModelChange)="onShFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block md:col-span-2">
          <span class="text-[10px] uppercase text-ink-soft">Staff name</span>
          <input [(ngModel)]="shStaffName" (ngModelChange)="onShFilterChange()" placeholder="Search staff name…"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" (click)="resetShFilters()"
                class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle">
          Reset
        </button>
        <button type="button" (click)="exportShCsv()" [disabled]="shLoading() || shRows().length === 0"
                class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
          ⬇ Export CSV (current filter)
        </button>

        <!-- Summary chips -->
        <div class="flex flex-wrap gap-2 ml-auto text-[11.5px]">
          <span class="px-2 py-1 rounded-md bg-surface-subtle text-ink-soft">
            Total <strong>{{ shTotal() }}</strong>
          </span>
          <span class="px-2 py-1 rounded-md bg-good-bg text-good-fg">
            ✓ Cleared <strong>{{ shCounts().cleared }}</strong>
          </span>
          <span class="px-2 py-1 rounded-md bg-info-bg text-info-fg">
            🟢 Open now <strong>{{ shCounts().open }}</strong>
          </span>
          <span class="px-2 py-1 rounded-md bg-danger-bg text-danger-fg"
                [class.font-semibold]="shCounts().closedWithoutClear > 0">
            ⚠ Closed without QC clear <strong>{{ shCounts().closedWithoutClear }}</strong>
          </span>
          <span class="px-2 py-1 rounded-md border border-border text-ink-soft">
            ⏱ Median time-to-clear <strong>{{ shMedianTtc() ?? '—' }}</strong> min
          </span>
        </div>
      </div>
    </header>

    @if (shLoading()) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading shifts…</div>
    } @else if (shRows().length === 0) {
      <div class="px-6 py-12 text-center text-[12.5px] text-ink-muted">
        No shift sessions in the selected window.
        <p class="text-[11px] text-ink-faint mt-1">Sessions are created on the first /lab page hit by a lab_tech in a fresh login.</p>
      </div>
    } @else {
      <div class="overflow-x-auto">
        <table class="w-full text-[12px]">
          <thead class="bg-surface-muted">
            <tr>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Opened</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Staff</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Overdue at open</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">QC cleared</th>
              <th class="text-right px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Time to clear</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Closed</th>
              <th class="text-right px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Shift length</th>
              <th class="text-left px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (s of shRows(); track s.session_id) {
              <tr class="border-t border-border align-top"
                  [class.bg-danger-bg]="s.closed_without_qc_clear"
                  [class.hover:bg-surface-subtle/40]="!s.closed_without_qc_clear">
                <td class="px-3 py-2 whitespace-nowrap">{{ shortDateTime(s.opened_at) }}</td>
                <td class="px-3 py-2">
                  <p class="text-ink">{{ s.staff_name || '—' }}</p>
                  <p class="text-[10.5px] font-mono text-ink-muted">{{ s.staff_role }}</p>
                </td>
                <td class="px-3 py-2 max-w-[280px]">
                  @if ((s.qc_overdue_snapshot ?? []).length === 0) {
                    <span class="text-[11px] text-good-fg">No overdue at open</span>
                  } @else {
                    <div class="flex flex-wrap gap-1">
                      @for (code of s.qc_overdue_snapshot; track code) {
                        <span class="text-[10px] font-mono px-1.5 py-px rounded bg-danger-bg/40 text-danger-fg">{{ code }}</span>
                      }
                    </div>
                  }
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  @if (s.qc_cleared_at) {
                    {{ shortDateTime(s.qc_cleared_at) }}
                  } @else {
                    <span class="text-warn-fg">— not cleared</span>
                  }
                </td>
                <td class="px-3 py-2 text-right font-mono">
                  @if (s.time_to_clear_minutes != null) {
                    {{ s.time_to_clear_minutes }} min
                  } @else { <span class="text-ink-muted">—</span> }
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  @if (s.closed_at) { {{ shortDateTime(s.closed_at) }} }
                  @else { <span class="text-info-fg font-semibold">🟢 open</span> }
                </td>
                <td class="px-3 py-2 text-right font-mono">
                  @if (s.shift_length_minutes != null) {
                    {{ s.shift_length_minutes }} min
                  } @else { <span class="text-ink-muted">—</span> }
                </td>
                <td class="px-3 py-2">
                  <span [class]="shiftChip(s)">{{ shiftLabel(s) }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <footer class="px-3 py-2 border-t border-border flex items-center gap-2 text-[12px]">
        <button type="button" (click)="setShPage(0)"           [disabled]="shPage() === 0"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">«</button>
        <button type="button" (click)="setShPage(shPage() - 1)"  [disabled]="shPage() === 0"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">‹ Prev</button>
        <span class="text-ink-muted">Page {{ shPage() + 1 }} of {{ shPageCount() || 1 }}</span>
        <button type="button" (click)="setShPage(shPage() + 1)"  [disabled]="shPage() + 1 >= shPageCount()"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">Next ›</button>
        <button type="button" (click)="setShPage(shPageCount() - 1)" [disabled]="shPage() + 1 >= shPageCount()"
                class="h-7 px-2 rounded border border-border text-ink-soft disabled:opacity-40">»</button>
        <span class="ml-auto text-ink-muted">{{ PAGE_SIZE }} per page</span>
      </footer>
    }
  </section>
}
@if (tab() === 'summary') {
  <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">

    <!-- Filters -->
    <header class="px-3 py-3 border-b border-border space-y-2">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From</span>
          <input type="date" [(ngModel)]="psFromDate" (ngModelChange)="onPsFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To</span>
          <input type="date" [(ngModel)]="psToDate" (ngModelChange)="onPsFilterChange()"
                 class="mt-1 w-full h-9 px-2 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <div class="md:col-span-2 flex flex-wrap items-end gap-2">
          <button type="button" (click)="setPsRange(7)"   class="h-7 px-3 rounded-md border border-border text-[11px] hover:bg-surface-subtle">Last 7 days</button>
          <button type="button" (click)="setPsRange(30)"  class="h-7 px-3 rounded-md border border-border text-[11px] hover:bg-surface-subtle">Last 30 days</button>
          <button type="button" (click)="setPsRange(90)"  class="h-7 px-3 rounded-md border border-border text-[11px] hover:bg-surface-subtle">Last 90 days</button>
          <button type="button" (click)="setPsRange(365)" class="h-7 px-3 rounded-md border border-border text-[11px] hover:bg-surface-subtle">Last 12 months</button>
          <button type="button" (click)="generatePdfPack()" [disabled]="psBuilding() || psLoading()"
                  class="ml-auto h-9 px-4 rounded-md text-[12.5px] font-semibold text-white shadow-card disabled:opacity-50"
                  style="background:#117A3A;">
            {{ psBuilding() ? 'Building pack…' : '📥 Generate audit pack PDF' }}
          </button>
        </div>
      </div>
      <p class="text-[11px] text-ink-muted">
        Branch: <strong>{{ branch.activeBranchName() }}</strong> ·
        Period: <strong>{{ shortDate(psFromDate) }} → {{ shortDate(psToDate) }}</strong>
      </p>
    </header>

    @if (psLoading()) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading summary…</div>
    } @else if (psSummary(); as s) {
      <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

        <!-- QC runs -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">QC runs</p>
          <p class="text-[28px] font-bold text-primary-700 mt-1 leading-none">{{ s.runs.total }}</p>
          <ul class="mt-3 text-[12px] divide-y divide-border">
            <li class="flex justify-between py-1.5"><span>Accepted</span>
              <strong class="text-good-fg">{{ s.runs.accepted }} ({{ s.runs.pct_accepted }}%)</strong></li>
            <li class="flex justify-between py-1.5"><span>Warning</span>
              <strong class="text-warn-fg">{{ s.runs.warning }} ({{ s.runs.pct_warning }}%)</strong></li>
            <li class="flex justify-between py-1.5"><span>Rejected</span>
              <strong class="text-danger-fg">{{ s.runs.rejected }} ({{ s.runs.pct_rejected }}%)</strong></li>
          </ul>
        </article>

        <!-- Top violations -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">Top violations</p>
          @if (s.top_violations.length === 0) {
            <p class="text-[28px] font-bold text-good-fg mt-1 leading-none">0</p>
            <p class="mt-3 text-[12px] text-ink-muted">No Westgard violations in window.</p>
          } @else {
            <p class="text-[28px] font-bold text-danger-fg mt-1 leading-none">{{ totalViolations(s) }}</p>
            <ul class="mt-3 text-[12px] divide-y divide-border">
              @for (v of s.top_violations; track v.rule + (v.instrument_code ?? '')) {
                <li class="flex justify-between py-1.5">
                  <span><span class="font-mono">{{ v.instrument_code || '—' }}</span> · <code class="text-danger-fg">{{ v.rule }}</code></span>
                  <strong>{{ v.count }}</strong>
                </li>
              }
            </ul>
          }
        </article>

        <!-- Calibrations -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">Calibrations</p>
          <p class="text-[28px] font-bold text-primary-700 mt-1 leading-none">{{ s.calibrations.performed_in_window }}</p>
          <ul class="mt-3 text-[12px] divide-y divide-border">
            <li class="flex justify-between py-1.5"><span>Performed in window</span><strong>{{ s.calibrations.performed_in_window }}</strong></li>
            <li class="flex justify-between py-1.5"><span>Overdue right now</span>
              <strong [class.text-danger-fg]="s.calibrations.overdue_now > 0"
                      [class.text-good-fg]="s.calibrations.overdue_now === 0">{{ s.calibrations.overdue_now }}</strong></li>
          </ul>
        </article>

        <!-- Critical alerts -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">Critical alerts</p>
          <p class="text-[28px] font-bold text-primary-700 mt-1 leading-none">{{ s.critical_alerts.total }}</p>
          <ul class="mt-3 text-[12px] divide-y divide-border">
            <li class="flex justify-between py-1.5"><span>Acknowledged</span>
              <strong class="text-good-fg">{{ s.critical_alerts.acknowledged }}</strong></li>
            <li class="flex justify-between py-1.5"><span>Median ack TAT</span>
              <strong>{{ s.critical_alerts.median_ack_minutes != null ? (+s.critical_alerts.median_ack_minutes).toFixed(1) + ' min' : '—' }}</strong></li>
          </ul>
        </article>

        <!-- Sample rejections -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">Sample rejections</p>
          <p class="text-[28px] font-bold text-primary-700 mt-1 leading-none">{{ s.rejections.total }}</p>
          @if (s.rejections.by_reason.length === 0) {
            <p class="mt-3 text-[12px] text-ink-muted">None recorded.</p>
          } @else {
            <ul class="mt-3 text-[12px] divide-y divide-border">
              @for (r of s.rejections.by_reason.slice(0, 4); track r.reason) {
                <li class="flex justify-between py-1.5"><span>{{ r.reason }}</span><strong>{{ r.count }}</strong></li>
              }
            </ul>
          }
        </article>

        <!-- Shift compliance -->
        <article class="rounded-md border border-border bg-surface-card p-4">
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-soft">Shift compliance</p>
          <p class="text-[28px] font-bold text-primary-700 mt-1 leading-none">{{ s.shifts.total }}</p>
          <ul class="mt-3 text-[12px] divide-y divide-border">
            <li class="flex justify-between py-1.5"><span>QC cleared</span>
              <strong class="text-good-fg">{{ s.shifts.cleared }}</strong></li>
            <li class="flex justify-between py-1.5"><span>Closed without clear</span>
              <strong [class.text-danger-fg]="s.shifts.closed_without_qc_clear > 0"
                      [class.text-good-fg]="s.shifts.closed_without_qc_clear === 0">{{ s.shifts.closed_without_qc_clear }}</strong></li>
            <li class="flex justify-between py-1.5"><span>Avg time-to-clear</span>
              <strong>{{ s.shifts.avg_time_to_clear_minutes ?? '—' }} min</strong></li>
          </ul>
        </article>
      </div>
    }
  </section>
}
  `,
})
export class LabCompliancePage implements OnInit {
  /** When true, the outer Lab & Radiology header is suppressed (used when this
   *  page is embedded as an inner tab inside the QC page). */
  @Input() embedded = false;

  protected readonly branch = inject(BranchStore);
  private compliance = inject(LabComplianceService);
  private qcSvc      = inject(LabQcService);
  private toast      = inject(ToastService);
  private auditPack  = inject(LabAuditPackService);
  private exportSvc  = inject(ExportService);

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly violations = ALL_VIOLATIONS;

  protected readonly innerTabs = [
    { id: 'runs',    label: 'QC Runs ledger',     icon: '📋' },
    { id: 'lj',      label: 'Levey-Jennings',     icon: '📈' },
    { id: 'shifts',  label: 'Shift compliance',   icon: '👤' },
    { id: 'summary', label: 'Period summary',     icon: '📊' },
  ] as const;
  protected readonly tab = signal<Tab>('runs');

  // Filters
  protected fromDate = '';
  protected toDate   = '';
  protected instrumentId: string | null = null;
  protected testId: string | null = null;
  protected status: 'accepted' | 'warning' | 'rejected' | null = null;
  protected violation: string | null = null;
  protected runBy = '';

  protected readonly page    = signal(0);
  protected readonly rows    = signal<QcRunAuditRow[]>([]);
  protected readonly total   = signal(0);
  protected readonly loading = signal(false);
  protected readonly pageCount = computed(() => Math.ceil(this.total() / PAGE_SIZE));

  protected readonly instruments = signal<LabInstrument[]>([]);
  protected readonly labTests    = signal<{ id: string; code: string; name: string }[]>([]);

  // Annotation editor
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving    = signal(false);
  protected editAction = '';

  async ngOnInit() {
    // Default ranges
    const now = new Date();
    const past7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.toDate   = this.toIsoDate(now);
    this.fromDate = this.toIsoDate(past7);
    this.ljToDate   = this.toIsoDate(now);
    this.ljFromDate = this.toIsoDate(past30);
    this.shToDate   = this.toIsoDate(now);
    this.shFromDate = this.toIsoDate(past30);
    this.psToDate   = this.toIsoDate(now);
    this.psFromDate = this.toIsoDate(past30);

    try {
      const [insts, tests] = await Promise.all([
        this.qcSvc.listInstruments(),
        this.qcSvc.listLabTests(),
      ]);
      this.instruments.set(insts);
      this.labTests.set(tests as any);
    } catch (e: any) {
      this.toast.error('Could not load filters', e?.message ?? 'Try again.');
    }

    await this.reload();
  }

  protected onFilterChange() { this.page.set(0); void this.reload(); }
  protected setPage(p: number) {
    if (p < 0 || (this.pageCount() > 0 && p >= this.pageCount())) return;
    this.page.set(p); void this.reload();
  }

  protected resetFilters() {
    this.instrumentId = null; this.testId = null; this.status = null;
    this.violation = null; this.runBy = '';
    const now = new Date(); const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.toDate   = this.toIsoDate(now);
    this.fromDate = this.toIsoDate(past);
    this.onFilterChange();
  }

  private async reload() {
    this.loading.set(true);
    try {
      const filters: QcRunsLedgerFilters = {
        from: this.toBoundIso(this.fromDate, 'start'),
        to:   this.toBoundIso(this.toDate,   'end'),
        branchId:     this.branch.activeBranchId(),
        instrumentId: this.instrumentId,
        testId:       this.testId,
        status:       this.status,
        violation:    this.violation,
        runBy:        this.runBy.trim() || null,
        page:     this.page(),
        pageSize: PAGE_SIZE,
      };
      const { rows, total } = await this.compliance.listQcRuns(filters);
      this.rows.set(rows);
      this.total.set(total);
    } catch (e: any) {
      this.toast.error('Load failed', e?.message ?? 'Could not fetch QC runs.');
      this.rows.set([]); this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  protected startEdit(r: QcRunAuditRow) {
    this.editingId.set(r.run_id);
    this.editAction = r.action_taken ?? '';
  }
  protected cancelEdit() { this.editingId.set(null); this.editAction = ''; }

  protected async saveAnnotation(r: QcRunAuditRow) {
    this.saving.set(true);
    try {
      await this.compliance.annotateRun(r.run_id, { action_taken: this.editAction.trim() || null });
      this.toast.success('Action note saved');
      this.editingId.set(null); this.editAction = '';
      await this.reload();
    } catch (e: any) {
      this.toast.error('Could not save', e?.message ?? 'Try again.');
    } finally { this.saving.set(false); }
  }

  protected async onExport(fmt: ExportFormat) {
    try {
      this.loading.set(true);
      const fromIso = this.toBoundIso(this.fromDate, 'start');
      const toIso   = this.toBoundIso(this.toDate,   'end');
      const branchId = this.branch.activeBranchId();
      const all = await this.compliance.exportSection(fromIso, toIso, branchId, 'runs');

      const columns: ExportColumn<any>[] = [
        { key: 'measured_at',        header: 'Measured at',     width: 18, align: 'center', format: 'datetime' },
        { key: 'instrument_code',    header: 'Inst. code',      width: 12, align: 'left' },
        { key: 'instrument_name',    header: 'Instrument',      width: 22, align: 'left' },
        { key: 'test_code',          header: 'Test code',       width: 10, align: 'left' },
        { key: 'test_name',          header: 'Test',            width: 22, align: 'left' },
        { key: 'material_lot',       header: 'Material lot',    width: 14, align: 'left' },
        { key: 'material_level',     header: 'Level',           width: 8,  align: 'center' },
        { key: 'mean_target',        header: 'Mean target',     width: 12, align: 'right', format: 'number' },
        { key: 'sd_target',          header: 'SD target',       width: 10, align: 'right', format: 'number' },
        { key: 'value',              header: 'Value',           width: 12, align: 'right', format: 'number' },
        { key: 'deviation_sd',       header: 'Deviation (SD)',  width: 14, align: 'right', format: 'number' },
        { key: 'run_status',         header: 'Status',          width: 10, align: 'left' },
        { key: 'violations',         header: 'Violations',      width: 18, align: 'left' },
        { key: 'action_taken',       header: 'Action taken',    width: 24, align: 'left' },
        { key: 'run_notes',          header: 'Notes',           width: 24, align: 'left' },
        { key: 'ran_by_full_name',   header: 'Run by',          width: 18, align: 'left' },
      ];

      const report: ExportableReport<any> = {
        filename: `LabQcRuns_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${fromIso.slice(0,10)}_to_${toIso.slice(0,10)}`,
        title: 'Lab QC Runs Ledger',
        subtitle: `${all.length} run${all.length === 1 ? '' : 's'} · ${fromIso.slice(0,10)} → ${toIso.slice(0,10)}`,
        meta: { periodLabel: `${fromIso.slice(0,10)} → ${toIso.slice(0,10)}` },
        columns,
        rows: all,
        footer: 'Sree Diagnostics · Lab QC Compliance Ledger',
      };

      await this.exportSvc.export(fmt, report);
      this.toast.success('Exported', `${all.length} row(s)`);
    } catch (e: any) {
      this.toast.error('Export failed', e?.message ?? 'Try again.');
    } finally { this.loading.set(false); }
  }

  // ──────────────────────────────────────────────────────────────────
  //   Tab 3 — Shift compliance
  // ──────────────────────────────────────────────────────────────────
  protected shFromDate = '';
  protected shToDate   = '';
  protected shStaffName = '';

  protected readonly shPage      = signal(0);
  protected readonly shRows      = signal<ShiftComplianceRow[]>([]);
  protected readonly shTotal     = signal(0);
  protected readonly shLoading   = signal(false);
  protected readonly shPageCount = computed(() => Math.ceil(this.shTotal() / PAGE_SIZE));

  /** Quick counts over the rows currently on screen (one page). */
  protected readonly shCounts = computed(() => {
    const c = { cleared: 0, open: 0, closedWithoutClear: 0 };
    for (const s of this.shRows()) {
      if (s.qc_was_cleared) c.cleared++;
      if (!s.closed_at)     c.open++;
      if (s.closed_without_qc_clear) c.closedWithoutClear++;
    }
    return c;
  });

  /** Median time-to-clear across the rows currently on screen. */
  protected readonly shMedianTtc = computed(() => {
    const xs = this.shRows()
      .map(s => s.time_to_clear_minutes)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (xs.length === 0) return null;
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 === 0 ? Math.round((xs[mid - 1] + xs[mid]) / 2) : xs[mid];
  });

  protected setInnerTab(id: Tab) {
    this.tab.set(id);
    if (id === 'shifts' && this.shRows().length === 0 && !this.shLoading()) void this.shReload();
    if (id === 'summary' && this.psSummary() === null && !this.psLoading()) void this.psReload();
  }

  protected onShFilterChange() { this.shPage.set(0); void this.shReload(); }
  protected setShPage(p: number) {
    if (p < 0 || (this.shPageCount() > 0 && p >= this.shPageCount())) return;
    this.shPage.set(p); void this.shReload();
  }
  protected resetShFilters() {
    this.shStaffName = '';
    const now = new Date(); const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.shToDate   = this.toIsoDate(now);
    this.shFromDate = this.toIsoDate(past);
    this.onShFilterChange();
  }

  private async shReload() {
    this.shLoading.set(true);
    try {
      const filters: ShiftFilters = {
        from: this.toBoundIso(this.shFromDate, 'start'),
        to:   this.toBoundIso(this.shToDate,   'end'),
        branchId:  this.branch.activeBranchId(),
        staffName: this.shStaffName.trim() || null,
        page:     this.shPage(),
        pageSize: PAGE_SIZE,
      };
      const { rows, total } = await this.compliance.listShiftSessions(filters);
      this.shRows.set(rows);
      this.shTotal.set(total);
    } catch (e: any) {
      this.toast.error('Load failed', e?.message ?? 'Could not fetch shift sessions.');
      this.shRows.set([]); this.shTotal.set(0);
    } finally { this.shLoading.set(false); }
  }

  protected async exportShCsv() {
    try {
      this.shLoading.set(true);
      const fromIso = this.toBoundIso(this.shFromDate, 'start');
      const toIso   = this.toBoundIso(this.shToDate,   'end');
      const all = await this.compliance.exportSection(fromIso, toIso, this.branch.activeBranchId(), 'shifts');
      const headers = ['opened_at','staff_name','staff_role','qc_overdue_snapshot','qc_cleared_at',
                       'time_to_clear_minutes','closed_at','shift_length_minutes',
                       'qc_was_cleared','closed_without_qc_clear','branch_id','session_id'];
      const csv = [headers.join(',')]
        .concat(all.map((r: any) => headers.map(h => csvCell(r[h])).join(',')))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `shift-compliance-${fromIso.slice(0,10)}_to_${toIso.slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      this.toast.success('CSV exported', `${all.length} session(s)`);
    } catch (e: any) {
      this.toast.error('Export failed', e?.message ?? 'Try again.');
    } finally { this.shLoading.set(false); }
  }

  protected shiftChip(s: ShiftComplianceRow): string {
    const base = 'inline-flex items-center h-[18px] px-1.5 rounded-full text-[10px] font-semibold uppercase';
    if (s.closed_without_qc_clear) return `${base} bg-danger-bg text-danger-fg`;
    if (!s.closed_at)              return `${base} bg-info-bg text-info-fg`;
    if (s.qc_was_cleared)          return `${base} bg-good-bg text-good-fg`;
    return `${base} bg-surface-subtle text-ink-muted`;
  }
  protected shiftLabel(s: ShiftComplianceRow): string {
    if (s.closed_without_qc_clear) return 'NABL gap';
    if (!s.closed_at)              return 'Open';
    if (s.qc_was_cleared)          return 'Cleared';
    return 'Closed';
  }

  // ──────────────────────────────────────────────────────────────────
  //   Tab 4 — Period summary + PDF audit pack
  // ──────────────────────────────────────────────────────────────────
  protected psFromDate = '';
  protected psToDate   = '';
  protected readonly psSummary  = signal<PeriodSummary | null>(null);
  protected readonly psLoading  = signal(false);
  protected readonly psBuilding = signal(false);

  protected setPsRange(days: number) {
    const now = new Date(); const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    this.psToDate   = this.toIsoDate(now);
    this.psFromDate = this.toIsoDate(past);
    void this.psReload();
  }
  protected onPsFilterChange() { void this.psReload(); }

  protected totalViolations(s: PeriodSummary): number {
    return s.top_violations.reduce((acc, v) => acc + (v.count ?? 0), 0);
  }
  protected shortDate(d: string): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN',
      { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
  }

  private async psReload() {
    this.psLoading.set(true);
    try {
      const fromIso = this.toBoundIso(this.psFromDate, 'start');
      const toIso   = this.toBoundIso(this.psToDate,   'end');
      const s = await this.compliance.periodSummary(fromIso, toIso, this.branch.activeBranchId());
      this.psSummary.set(s);
    } catch (e: any) {
      this.toast.error('Could not load summary', e?.message ?? 'Try again.');
      this.psSummary.set(null);
    } finally { this.psLoading.set(false); }
  }

  protected async generatePdfPack() {
    this.psBuilding.set(true);
    try {
      await this.auditPack.open({
        fromIso:  this.toBoundIso(this.psFromDate, 'start'),
        toIso:    this.toBoundIso(this.psToDate,   'end'),
        branchId: this.branch.activeBranchId(),
      });
      this.toast.success('Audit pack opened', 'Use "Save as PDF" in the print dialog');
    } catch (e: any) {
      this.toast.error('Could not build pack', e?.message ?? 'Try again.');
    } finally { this.psBuilding.set(false); }
  }

  // ──────────────────────────────────────────────────────────────────
  //   Tab 2 — Levey-Jennings (audit-grade)
  // ──────────────────────────────────────────────────────────────────
  @ViewChild('ljSvg') private ljSvgEl?: ElementRef<SVGSVGElement>;

  protected readonly LJ_W = 920;
  protected readonly LJ_H = 320;
  protected readonly LJ_PAD = 40;
  protected readonly ljSdBands = [
    { k:  3, color: '#A4302B', dash: '4,2' },
    { k:  2, color: '#D97706', dash: '4,2' },
    { k:  1, color: '#999',    dash: '2,3' },
    { k:  0, color: '#000',    dash: '0' },
    { k: -1, color: '#999',    dash: '2,3' },
    { k: -2, color: '#D97706', dash: '4,2' },
    { k: -3, color: '#A4302B', dash: '4,2' },
  ] as const;

  protected ljTestId: string | null = null;
  protected ljInstrumentId: string | null = null;
  protected ljFromDate = '';
  protected ljToDate   = '';
  protected ljMode: 'sd' | 'raw' = 'sd';

  protected readonly ljLoading = signal(false);
  protected readonly ljRuns    = signal<QcRunAuditRow[]>([]);

  protected readonly ljCounts = computed(() => {
    const c = { accepted: 0, warning: 0, rejected: 0 };
    for (const r of this.ljRuns()) {
      if      (r.run_status === 'accepted') c.accepted++;
      else if (r.run_status === 'warning')  c.warning++;
      else if (r.run_status === 'rejected') c.rejected++;
    }
    return c;
  });

  /** Distinct material lots that appear in the current chart window. */
  protected readonly ljMaterialsInWindow = computed(() => {
    const seen = new Map<string, QcRunAuditRow>();
    for (const r of this.ljRuns()) if (!seen.has(r.material_id)) seen.set(r.material_id, r);
    return [...seen.values()];
  });

  /** Lot-change boundaries — when the material_id changes between consecutive runs. */
  protected readonly ljLotChanges = computed<{ at: string; toLot: string }[]>(() => {
    const out: { at: string; toLot: string }[] = [];
    let prev: string | null = null;
    for (const r of this.ljRuns()) {
      if (prev !== null && r.material_id !== prev) out.push({ at: r.measured_at, toLot: r.material_lot });
      prev = r.material_id;
    }
    return out;
  });

  /** Auto-fill instrument when user picks a test that maps to one. */
  private autoFillInstrumentForTest() {
    if (!this.ljTestId) { this.ljInstrumentId = null; return; }
    // We don't have lab_tests.instrument_id in the catalogue payload here, so
    // leave as-is — user can pick manually or just rely on the test filter.
  }

  protected onLjFilterChange() {
    this.autoFillInstrumentForTest();
    void this.ljReload();
  }

  private async ljReload() {
    if (!this.ljTestId) { this.ljRuns.set([]); return; }
    this.ljLoading.set(true);
    try {
      const fromIso = this.toBoundIso(this.ljFromDate, 'start');
      const toIso   = this.toBoundIso(this.ljToDate,   'end');
      const rows = await this.compliance.listRunsForChart({
        fromIso, toIso,
        branchId:     this.branch.activeBranchId(),
        testId:       this.ljTestId,
        instrumentId: this.ljInstrumentId ?? null,
      });
      this.ljRuns.set(rows);
    } catch (e: any) {
      this.toast.error('Could not load chart', e?.message ?? 'Try again.');
      this.ljRuns.set([]);
    } finally { this.ljLoading.set(false); }
  }

  // ── Chart math ────────────────────────────────────────────────────
  protected ljX(iso: string): number {
    const runs = this.ljRuns();
    if (runs.length === 0) return this.LJ_PAD;
    const min = +new Date(runs[0].measured_at);
    const max = +new Date(runs[runs.length - 1].measured_at);
    const span = max - min || 1;
    const t = +new Date(iso);
    const usableW = this.LJ_W - this.LJ_PAD - 12;
    return this.LJ_PAD + ((t - min) / span) * usableW;
  }
  protected ljYSd(k: number): number {
    // ±4 SD viewport, padded vertically
    const top = this.LJ_H - 24;
    const bot = 28;
    const t = (k + 4) / 8;     // map [-4,+4] to [0,1] (inverted later)
    return top - t * (top - bot);
  }
  protected ljYRaw(value: number): number {
    // Pick min/max from materials in window (mean ± 4SD)
    const mats = this.ljMaterialsInWindow();
    if (mats.length === 0) return this.LJ_H / 2;
    const lows  = mats.map(m => m.mean_target - 4 * m.sd_target);
    const highs = mats.map(m => m.mean_target + 4 * m.sd_target);
    const lo = Math.min(...lows), hi = Math.max(...highs);
    const span = hi - lo || 1;
    const top = this.LJ_H - 24, bot = 28;
    const t = (value - lo) / span;
    return top - t * (top - bot);
  }
  protected ljYFor(r: QcRunAuditRow): number {
    return this.ljMode === 'sd' ? this.ljYSd(Number(r.deviation_sd ?? 0)) : this.ljYRaw(Number(r.value));
  }
  protected ljPolyline(): string {
    return this.ljRuns().map(r => `${this.ljX(r.measured_at)},${this.ljYFor(r)}`).join(' ');
  }
  protected ljPointColor(s: string): string {
    return s === 'rejected' ? '#A4302B' : s === 'warning' ? '#D97706' : '#117A3A';
  }
  protected ljXTicks(): { x: number; label: string }[] {
    const runs = this.ljRuns();
    if (runs.length === 0) return [];
    const first = runs[0].measured_at;
    const last  = runs[runs.length - 1].measured_at;
    const mid   = new Date((+new Date(first) + +new Date(last)) / 2).toISOString();
    const fmt = (iso: string) => {
      try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
      catch { return iso.slice(0, 10); }
    };
    return [
      { x: this.ljX(first), label: fmt(first) },
      { x: this.ljX(mid),   label: fmt(mid) },
      { x: this.ljX(last),  label: fmt(last) },
    ];
  }

  // ── Exports ───────────────────────────────────────────────────────
  protected exportLjPng() {
    const svg = this.ljSvgEl?.nativeElement;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;   // 2x for retina
      canvas.width  = this.LJ_W * scale;
      canvas.height = this.LJ_H * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `lj-${this.ljTestId?.slice(0,8)}-${this.ljFromDate}_to_${this.ljToDate}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toast.error('PNG export failed'); };
    img.src = url;
  }

  protected exportLjCsv() {
    const rows = this.ljRuns();
    if (rows.length === 0) return;
    const headers = ['measured_at','instrument_code','test_code','material_lot','material_level',
                     'mean_target','sd_target','value','deviation_sd','run_status','violations',
                     'action_taken','ran_by_full_name'];
    const csv = [headers.join(',')]
      .concat(rows.map(r => headers.map(h => csvCell((r as any)[h])).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lj-${this.ljTestId?.slice(0,8)}-${this.ljFromDate}_to_${this.ljToDate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ────────────────────────────────────────────────────────
  protected statusChip(s: string): string {
    const tone = s === 'accepted' ? 'bg-good-bg text-good-fg'
              : s === 'warning'  ? 'bg-warn-bg text-warn-fg'
              : 'bg-danger-bg text-danger-fg';
    return `inline-flex items-center h-[18px] px-1.5 rounded-full text-[10px] font-semibold uppercase ${tone}`;
  }
  protected shortDateTime(iso: string): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN',
      { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }
  protected tabCls(active: boolean): string {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
  private toIsoDate(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  /** Convert a yyyy-MM-dd input value to a timezone-aware ISO at start/end of day. */
  private toBoundIso(date: string, bound: 'start' | 'end'): string {
    if (!date) {
      const now = new Date();
      return bound === 'end' ? now.toISOString() : new Date(now.getTime() - 7*24*60*60*1000).toISOString();
    }
    const t = bound === 'end' ? 'T23:59:59.999' : 'T00:00:00.000';
    return new Date(date + t).toISOString();
  }
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : Array.isArray(v) ? v.join('|') : JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
  // Escape quotes + wrap if needed
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
