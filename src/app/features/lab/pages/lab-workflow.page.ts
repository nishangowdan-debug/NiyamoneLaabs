import {
  ChangeDetectionStrategy, Component, OnInit, OnDestroy,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LabService } from '../data/lab.service';
import { LabReportPdfService } from '../services/lab-report-pdf.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { WhatsAppService } from '../../../core/whatsapp/whatsapp.service';

type StateKey =
  | 'ordered'
  | 'billed'             // ready to collect
  | 'sample_collected'   // tube taken at phlebotomy
  | 'accessioned'        // sample arrived at lab + on bench
  | 'in_process'
  | 'verified'           // ready to release report
  | 'report_ready'
  | 'delivered';

interface ColumnDef {
  key: StateKey;
  label: string;
  icon: string;
  hint: string;
  /** What action button to render on each card in this column. */
  action: { label: string; nextState: StateKey } | null;
}

@Component({
  selector: 'app-lab-workflow-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, RouterLinkActive],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">🧬 Lab &amp; Radiology</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/lab" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #wb="routerLinkActive"
         [class]="tabCls(wb.isActive)">📋 Workflow</a>
      <a routerLink="/lab/history" routerLinkActive #hi="routerLinkActive"
         [class]="tabCls(hi.isActive)">📚 Reports History</a>
      <a routerLink="/lab/reference" routerLinkActive #ra="routerLinkActive"
         [class]="tabCls(ra.isActive)">↗ Outsource</a>
      <a routerLink="/lab/home-collection" routerLinkActive #hc="routerLinkActive"
         [class]="tabCls(hc.isActive)">🏠 Home collection</a>
      <a routerLink="/lab/qc" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive)">🔬 QC &amp; Audit</a>
    </nav>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    <p>{{ totalOrders() }} active order(s)</p>
    @if (criticalCount() > 0) {
      <p class="text-danger-fg font-semibold">⚠ {{ criticalCount() }} critical pending</p>
    }
  </div>
</header>

<!-- Phase 4: QC overdue banner — blocks downstream verify until QC re-run -->
@if (qcOverdue().length > 0) {
  <article class="mb-3 rounded-[10px] border border-warn-fg/40 bg-warn-bg/40 px-3 py-2 flex items-center gap-3 flex-wrap"
           role="status">
    <span class="size-2 rounded-full bg-warn-fg animate-pulse shrink-0"></span>
    <p class="text-[12px] font-semibold text-warn-fg uppercase tracking-[0.06em]">
      ⚠ QC overdue — {{ qcOverdue().length }} instrument(s) require a fresh QC run
    </p>
    <ul class="flex flex-wrap gap-2 text-[11px] text-ink-soft flex-1">
      @for (q of qcOverdue(); track q.instrument_id) {
        <li class="px-2 py-0.5 rounded-md bg-surface-card border border-border">
          <span class="font-mono">{{ q.instrument_code }}</span>
          <span class="text-ink-muted"> · </span>
          <span>{{ q.instrument_name }}</span>
          <span class="text-warn-fg ml-1">
            @if (q.last_qc_passed_at) { last pass {{ q.hours_since_pass }}h ago }
            @else { no passing QC on record }
          </span>
        </li>
      }
    </ul>
    <a routerLink="/lab/qc" class="h-7 px-3 inline-flex items-center rounded-md bg-warn-fg text-white text-[11px] font-semibold hover:bg-warn-fg/90">
      Run QC →
    </a>
  </article>
}

<!-- Phase 3: Critical alert strip (auto-raised on entering critical_low / critical_high results) -->
@if (criticalAlerts().length > 0) {
  <article class="mb-3 rounded-[10px] border border-danger-fg/40 bg-danger-bg/30 overflow-hidden"
           role="alertdialog" aria-live="assertive">
    <header class="flex items-center justify-between px-3 py-2 bg-danger-fg/10 border-b border-danger-fg/40">
      <p class="text-[12px] font-semibold text-danger-fg uppercase tracking-[0.06em]">
        🚨 {{ criticalAlerts().length }} critical lab value{{ criticalAlerts().length === 1 ? '' : 's' }} awaiting doctor acknowledgement
      </p>
      <p class="text-[11px] text-danger-fg/80">Order verification is blocked until each is acknowledged.</p>
    </header>
    <ul class="divide-y divide-danger-fg/20">
      @for (a of criticalAlerts(); track a.id) {
        <li class="flex items-center gap-3 px-3 py-2 text-[12px]">
          <span class="size-2 rounded-full bg-danger-fg animate-pulse shrink-0"></span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-ink truncate">
              {{ a.patient?.full_name }} <span class="text-ink-muted font-mono text-[10px]">{{ a.patient?.uhid }}</span>
              <span class="ml-2 text-danger-fg">· {{ a.test_name }}</span>
              <span class="ml-1 font-mono">{{ a.value_numeric ?? a.value_text }}</span>
              @if (a.reference_low !== null && a.reference_high !== null) {
                <span class="text-ink-muted text-[10px]"> (ref {{ a.reference_low }}–{{ a.reference_high }})</span>
              }
            </p>
            <p class="text-[10px] text-ink-muted">
              Ordering doctor: {{ a.order?.doctor?.full_name || '—' }} · raised {{ shortDateTime(a.raised_at) }}
            </p>
          </div>
          <button type="button" (click)="ackCritical(a)" [disabled]="busyId() === a.id"
                  class="h-7 px-3 rounded-md bg-danger-fg text-white text-[11px] font-semibold hover:bg-danger-fg/90 disabled:opacity-50 shrink-0">
            {{ busyId() === a.id ? '…' : 'Acknowledge' }}
          </button>
        </li>
      }
    </ul>
  </article>
}

<!-- Filters bar -->
<div class="bg-surface-card border border-border rounded-[10px] px-3 py-2 mb-3 flex items-center gap-3 flex-wrap">
  <input [(ngModel)]="search" placeholder="Search by UHID, name or order id…"
         class="h-8 px-2.5 text-[12px] w-72 bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
  <label class="inline-flex items-center gap-1 text-[12px] text-ink-soft">
    <input type="checkbox" [(ngModel)]="onlyIp" class="size-3.5 rounded">
    IP only
  </label>
  <label class="inline-flex items-center gap-1 text-[12px] text-ink-soft">
    <input type="checkbox" [(ngModel)]="onlyStat" class="size-3.5 rounded">
    STAT / urgent
  </label>
  <span class="text-[11px] text-ink-muted ml-auto">Realtime · auto-refresh on changes</span>
</div>

<!-- Workflow columns -->
<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
  @for (col of columns; track col.key) {
    <section class="bg-surface-subtle border border-border rounded-[10px] flex flex-col min-h-[420px]">
      <header class="px-3 py-2 border-b border-border">
        <p class="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft flex items-center justify-between">
          <span>{{ col.icon }} {{ col.label }}</span>
          <span class="font-mono text-[10.5px] text-ink-muted">{{ countFor(col.key) }}</span>
        </p>
        <p class="text-[10px] text-ink-faint mt-0.5">{{ col.hint }}</p>
      </header>
      <ul class="flex-1 overflow-y-auto p-2 space-y-2 max-h-[60vh]">
        @for (o of visibleFor(col.key); track o.id) {
          <li class="bg-surface-card rounded-md border border-border p-2.5 hover:border-primary-200 transition">
            <div class="flex items-center justify-between gap-2 mb-1">
              <p class="text-[12px] font-semibold text-ink truncate">{{ patientName(o) }}</p>
              @if (o.priority === 'stat') {
                <span class="px-1.5 py-px rounded text-[8.5px] font-bold uppercase bg-danger-bg text-danger-fg">STAT</span>
              } @else if (o.priority === 'urgent') {
                <span class="px-1.5 py-px rounded text-[8.5px] font-bold uppercase bg-warn-bg text-warn-fg">URGENT</span>
              }
            </div>
            <p class="text-[10px] text-ink-muted font-mono mb-1">
              {{ o.patient?.uhid }}
              @if (o.source === 'ipd') { · <span class="text-warn-fg">IP</span> } @else { · OPD }
              · {{ shortDate(o.ordered_at) }}
              @if (tatBadge(o); as tat) {
                <span class="ml-1 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-[0.04em]"
                      [class.bg-emerald-100]="tat.tone === 'good'"
                      [class.text-emerald-800]="tat.tone === 'good'"
                      [class.bg-amber-100]="tat.tone === 'warn'"
                      [class.text-amber-800]="tat.tone === 'warn'"
                      [class.bg-rose-100]="tat.tone === 'breach'"
                      [class.text-rose-800]="tat.tone === 'breach'"
                      [attr.title]="'Target ' + tat.target + 'm · elapsed ' + tat.elapsed + 'm'">
                  {{ tat.label }}
                </span>
              }
            </p>
            <ul class="text-[10.5px] text-ink-soft mb-2 max-h-[60px] overflow-hidden">
              @for (r of o.results.slice(0, 3); track r.id) {
                <li class="truncate"
                    [attr.title]="r.test.name + (r.test.instrument?.code ? ' · runs on ' + r.test.instrument.code : '')">
                  <span class="font-mono">{{ r.test.code }}</span> · {{ r.test.name }}
                  @if (r.test.instrument?.code) {
                    <span class="ml-1 px-1 py-px rounded text-[8.5px] font-mono bg-info-bg text-info-fg">{{ r.test.instrument.code }}</span>
                  }
                  @if (r.flag === 'critical_low' || r.flag === 'critical_high') {
                    <span class="ml-1 px-1 py-px rounded text-[8.5px] font-bold bg-danger-bg text-danger-fg">CRIT</span>
                  }
                  @if (r.test.is_outsourced) {
                    <span class="ml-1 px-1 py-px rounded text-[8.5px] font-bold bg-violet-100 text-violet-700"
                          [attr.title]="r.test.reference_lab_name || 'Outsourced'">REF</span>
                  }
                </li>
              }
              @if (o.results.length > 3) {
                <li class="text-ink-faint">+ {{ o.results.length - 3 }} more</li>
              }
            </ul>

            @if (col.action) {
              <button (click)="actOnCol(o, col)"
                      [disabled]="busyId() === o.id"
                      class="w-full h-7 px-2 rounded-md text-[11px] font-semibold text-white shadow-card disabled:opacity-50"
                      [style.background]="actionColor(col.key)">
                {{ busyId() === o.id ? '…' : col.action.label }}
              </button>
            } @else {
              <p class="text-[10px] text-center text-ink-faint py-1">{{ terminalLabel(col.key) }}</p>
            }

            @if (col.key === 'sample_collected' || col.key === 'accessioned' || col.key === 'in_process') {
              <button (click)="openResultEntry(o)"
                      class="w-full mt-1 h-7 px-2 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                ✏ Enter results
              </button>
            }

            <!-- Phase 2: reject button on any in-the-lab state -->
            @if (col.key === 'sample_collected' || col.key === 'accessioned' || col.key === 'in_process') {
              <button (click)="openRejectDialog(o)"
                      class="w-full mt-1 h-7 px-2 rounded-md text-[11px] font-medium border border-danger-fg/40 text-danger-fg hover:bg-danger-fg/10">
                ⚠ Reject sample
              </button>
            }

            <!-- Reference-lab outsourcing — only show on actually-outsourced
                 orders. On the inhouse workflow board the outsource/dispatch
                 link is misleading clutter. -->
            @if ((col.key === 'ordered' || col.key === 'billed' || col.key === 'sample_collected' || col.key === 'accessioned') && o.routing !== 'inhouse') {
              @if (o.reference_dispatch_id) {
                <a [routerLink]="['/lab/reference']"
                   class="w-full mt-1 h-7 px-2 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-violet-300 text-violet-700 hover:bg-violet-50">
                  ↗ View dispatch
                </a>
              } @else {
                <a [routerLink]="['/lab/reference']" [queryParams]="{ orderId: o.id }"
                   class="w-full mt-1 h-7 px-2 inline-flex items-center justify-center rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                  ↗ Outsource
                </a>
              }
            }

            @if (col.key === 'verified' || col.key === 'report_ready' || col.key === 'delivered') {
              <button (click)="printReport(o)"
                      class="w-full mt-1 h-7 px-2 rounded-md text-[11px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
                📄 View / print report
              </button>
              @if (o.patient?.mobile) {
                <button (click)="sendReportWhatsApp(o)"
                        class="w-full mt-1 h-7 px-2 rounded-md text-[11px] font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  📱 Send to WhatsApp
                </button>
              }
            }
          </li>
        } @empty {
          <li class="px-2 py-6 text-center text-[11px] text-ink-faint">No orders</li>
        }
      </ul>
    </section>
  }
</div>

<!-- Result entry overlay (very compact) -->
@if (entryFor(); as eo) {
  <div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] pb-4 overflow-auto" (document:keydown.escape)="closeEntry($event)">
    <div class="bg-surface-card rounded-[14px] shadow-card w-full max-w-[820px] mx-4" (click)="$event.stopPropagation()">
      <header class="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p class="text-[14px] font-semibold text-ink">Result entry · {{ patientName(eo) }}</p>
          <p class="text-[11px] text-ink-muted">{{ eo.patient?.uhid }} · {{ eo.results.length }} test(s)</p>
        </div>
        <button (click)="entryFor.set(null)" class="size-8 rounded-md hover:bg-surface-subtle text-ink-muted">✕</button>
      </header>

      @if (loadingEntry()) {
        <div class="px-5 py-6 text-center text-[12px] text-ink-muted">Loading test parameters…</div>
      }

      <ul class="divide-y divide-border max-h-[60vh] overflow-y-auto">
        @for (r of eo.results; track r.id) {
          <li class="px-5 py-3">
            <!-- Test header -->
            <div class="flex items-center justify-between mb-2">
              <div class="min-w-0">
                <p class="text-[13px] font-semibold text-ink truncate">{{ r.test.name }}</p>
                <p class="text-[10px] text-ink-muted font-mono">
                  {{ r.test.code }}
                  @if (r.test.unit) { · {{ r.test.unit }} }
                  @if (r.test.ref_min != null && r.test.ref_max != null) { · ref {{ r.test.ref_min }}–{{ r.test.ref_max }} }
                </p>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                    [class.text-good-fg]="r.status === 'verified'"
                    [class.border-good-fg]="r.status === 'verified'"
                    [class.text-warn-fg]="r.status === 'entered'"
                    [class.border-warn-fg]="r.status === 'entered'"
                    [class.text-ink-faint]="r.status === 'pending'"
                    [class.border-border]="r.status === 'pending'">
                {{ r.status }}
              </span>
            </div>

            @if (entryParams()[r.id]?.length) {
              <!-- Per-parameter entry (from lab_test_parameters catalog) -->
              <div class="rounded-md border border-border overflow-hidden">
                <div class="grid grid-cols-12 px-2 py-1 bg-surface-subtle text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">
                  <span class="col-span-5">Parameter</span>
                  <span class="col-span-4">Value</span>
                  <span class="col-span-2">Unit</span>
                  <span class="col-span-1 text-right">Ref</span>
                </div>
                @for (p of entryParams()[r.id]; track p.id) {
                  @if (p.is_section_header) {
                    <div class="px-2 py-1 bg-primary-50/60 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary-800 border-t border-border">
                      {{ p.section || p.parameter }}
                    </div>
                  } @else {
                    <div class="grid grid-cols-12 items-center gap-2 px-2 py-1.5 border-t border-border">
                      <label class="col-span-5 text-[12px] text-ink truncate" [attr.title]="p.parameter">{{ p.parameter }}</label>
                      <div class="col-span-4 flex items-stretch gap-1">
                        <input type="text" [ngModel]="paramValues[r.id][p.id]"
                               (ngModelChange)="onParamInput(r.id, p.id, $event)"
                               [name]="'pv-' + r.id + '-' + p.id"
                               [placeholder]="paramPlaceholder(p)"
                               [disabled]="isNa(r.id, p.id)"
                               class="flex-1 min-w-0 h-7 px-2 text-[12px] font-mono bg-surface-card border border-border rounded focus:outline-none focus:border-primary-600 disabled:bg-surface-subtle disabled:text-ink-muted">
                        <button type="button" (click)="toggleParamNa(r.id, p.id)"
                                [title]="isNa(r.id, p.id) ? 'Clear NA' : 'Mark as Not Applicable'"
                                class="px-2 h-7 rounded border text-[10px] font-semibold tracking-wider transition-colors"
                                [class.bg-amber-100]="isNa(r.id, p.id)"
                                [class.text-amber-800]="isNa(r.id, p.id)"
                                [class.border-amber-300]="isNa(r.id, p.id)"
                                [class.bg-surface-card]="!isNa(r.id, p.id)"
                                [class.text-ink-muted]="!isNa(r.id, p.id)"
                                [class.border-border]="!isNa(r.id, p.id)"
                                [class.hover:bg-surface-subtle]="!isNa(r.id, p.id)">
                          NA
                        </button>
                      </div>
                      <span class="col-span-2 text-[10.5px] text-ink-muted font-mono truncate">{{ p.unit || '—' }}</span>
                      <span class="col-span-1 text-[10px] text-ink-muted text-right truncate"
                            [attr.title]="p.normal_range_display || ((p.low_value != null && p.high_value != null) ? (p.low_value + '–' + p.high_value) : '')">
                        @if (p.normal_range_display) { {{ p.normal_range_display }} }
                        @else if (p.low_value != null && p.high_value != null) { {{ p.low_value }}–{{ p.high_value }} }
                      </span>
                    </div>
                  }
                }
              </div>
            } @else {
              <!-- Legacy single-value fallback (no catalog params configured) -->
              <div class="grid grid-cols-12 items-center gap-2">
                <div class="col-span-6 flex items-stretch gap-1">
                  <input type="text" [ngModel]="entryValues[r.id]"
                         (ngModelChange)="onLegacyValueInput(r.id, $event)"
                         [placeholder]="(r.test.ref_min != null && r.test.ref_max != null) ? ((r.test.ref_min + r.test.ref_max) / 2 + '') : 'Value'"
                         [disabled]="isNa(r.id)"
                         class="flex-1 min-w-0 h-8 px-2 text-[12.5px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 disabled:bg-surface-subtle disabled:text-ink-muted">
                  <button type="button" (click)="toggleLegacyNa(r.id)"
                          [title]="isNa(r.id) ? 'Clear NA' : 'Mark as Not Applicable'"
                          class="px-2.5 h-8 rounded border text-[11px] font-semibold tracking-wider transition-colors"
                          [class.bg-amber-100]="isNa(r.id)"
                          [class.text-amber-800]="isNa(r.id)"
                          [class.border-amber-300]="isNa(r.id)"
                          [class.bg-surface-card]="!isNa(r.id)"
                          [class.text-ink-muted]="!isNa(r.id)"
                          [class.border-border]="!isNa(r.id)"
                          [class.hover:bg-surface-subtle]="!isNa(r.id)">
                    NA
                  </button>
                </div>
                <span class="col-span-6 text-[10.5px] text-ink-muted">
                  @if (r.value_numeric != null) { last: {{ r.value_numeric }} }
                  @else if (r.value_text) { last: {{ r.value_text }} }
                  @else { No parameters configured in catalog — single value entry }
                </span>
              </div>
            }
          </li>
        }
      </ul>

      <!-- Phase 6: reflex-test suggestions -->
      @if (reflexSuggestions().length > 0) {
        <section class="px-5 pt-2 pb-3 border-t border-border bg-amber-50/50">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800 mb-2">
            🧪 Reflex test suggestions ({{ reflexSuggestions().length }})
          </p>
          <ul class="space-y-1.5">
            @for (s of reflexSuggestions(); track s.rule_id) {
              <li class="text-[12px] flex items-start gap-2">
                <span class="text-amber-700">→</span>
                <div class="flex-1 min-w-0">
                  <p class="text-ink">
                    <span class="font-mono font-bold">{{ s.target_test_code }}</span>
                    @if (s.target_test_name) { <span class="text-ink-muted">· {{ s.target_test_name }}</span> }
                  </p>
                  <p class="text-[10.5px] text-ink-muted">{{ s.description }}</p>
                </div>
              </li>
            }
          </ul>
          <p class="text-[10px] text-amber-700/70 mt-2">Discuss with the ordering doctor — these are not auto-ordered.</p>
        </section>
      }

      <footer class="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
        <p class="text-[11px] text-ink-muted">
          @if (!canSaveEntry()) {
            <span class="text-warn-fg">⚠ Enter every parameter to enable report generation.</span>
          } @else {
            <span class="text-good-fg">All parameters entered — ready to verify.</span>
          }
        </p>
        <div class="flex items-center gap-2">
          <button (click)="entryFor.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Close</button>
          <button (click)="saveResults()" [disabled]="savingResults() || loadingEntry() || !canSaveEntry()"
                  [attr.title]="canSaveEntry() ? '' : 'Fill every parameter first'"
                  class="h-9 px-4 rounded-md text-[12.5px] font-semibold text-white shadow-card disabled:opacity-50"
                  style="background:#0E4F8C;">
            {{ savingResults() ? 'Saving…' : 'Save & verify' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
}

<!-- Phase 2: Collect-sample dialog -->
@if (collectFor(); as co) {
  <div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" (document:keydown.escape)="closeCollect()">
    <div role="dialog" class="bg-surface-card rounded-[12px] shadow-pop w-full max-w-[420px] p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[17px] font-medium text-ink">Collect sample</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">{{ patientName(co) }} · {{ co.results?.length ?? 0 }} test(s)</p>

      <label class="block mt-4">
        <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Wristband UID (scan or type)</span>
        <input type="text" [(ngModel)]="collectWristband" autofocus
               placeholder="e.g. WB-2026-0042"
               class="w-full h-10 px-3 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
      </label>

      <label class="block mt-3">
        <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Tube count</span>
        <input type="number" min="1" max="20" [(ngModel)]="collectTubes"
               class="w-full h-10 px-3 text-[14px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
      </label>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" (click)="closeCollect()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button type="button" (click)="confirmCollect()" [disabled]="!collectTubes || collectTubes < 1 || busyId() === co.id"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#3E64FF;">
          {{ busyId() === co.id ? 'Collecting…' : 'Mark collected' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Phase 2: Reject-sample dialog -->
@if (rejectFor(); as ro) {
  <div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" (document:keydown.escape)="closeReject()">
    <div role="dialog" class="bg-surface-card rounded-[12px] shadow-pop w-full max-w-[440px] p-5"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[17px] font-medium text-danger-fg">⚠ Reject sample</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">{{ patientName(ro) }} · this triggers a re-collection request</p>

      <label class="block mt-4">
        <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Reason</span>
        <select [(ngModel)]="rejectReason"
                class="w-full h-10 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          @for (r of rejectionReasons; track r) {
            <option [value]="r">{{ r.replace('_', ' ').replace('_', ' ') }}</option>
          }
        </select>
      </label>

      <label class="block mt-3">
        <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Details (optional)</span>
        <textarea [(ngModel)]="rejectDetails" rows="2" placeholder="e.g. EDTA tube, expected SST"
                  class="w-full px-3 py-2 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 resize-y"></textarea>
      </label>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" (click)="closeReject()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button type="button" (click)="confirmReject()" [disabled]="busyId() === ro.id"
                class="h-9 px-4 rounded-md text-[12px] font-semibold text-white bg-danger-fg hover:bg-danger-fg/90 disabled:opacity-50">
          {{ busyId() === ro.id ? 'Rejecting…' : 'Reject + request re-collect' }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class LabWorkflowPage implements OnInit, OnDestroy {
  private svc      = inject(LabService);
  private pdfSvc   = inject(LabReportPdfService);
  private waSvc    = inject(WhatsAppService);

  protected async sendReportWhatsApp(o: any) {
    try {
      const tests = (o.results ?? [])
        .map((r: any) => r.test?.code)
        .filter(Boolean) as string[];
      // Generating the PDF + uploading to storage takes a couple of seconds —
      // tell the user something is happening instead of leaving them staring
      // at a blank UI while the hidden iframe renders the report.
      this.toast.info('Preparing PDF…', 'Generating report attachment for WhatsApp.');
      const r = await this.waSvc.sendLabReport({
        labOrderId: o.id,
        patient: { id: o.patient?.id, full_name: o.patient?.full_name, mobile: o.patient?.mobile },
        testList: tests,
      });
      if (r.ok) {
        const detail = r.pdfUrl
          ? 'PDF attached. Press Send in the new tab.'
          : 'Viewer link sent (PDF generation skipped). Press Send in the new tab.';
        this.toast.success('WhatsApp opened', detail);
      } else {
        this.toast.warn('Could not open WhatsApp', r.reason ?? '');
      }
    } catch (e: any) {
      this.toast.error('WhatsApp failed', e?.message ?? String(e));
    }
  }
  private toast    = inject(ToastService);
  private supabase = inject(SupabaseService);

  protected readonly columns: ColumnDef[] = [
    // ORDERED merges legacy 'billed' rows too — diagnostic centre always
    // pre-pays so the two states are semantically identical.
    { key: 'ordered',          icon: '📝', label: 'Ordered',     hint: 'Paid — ready to collect sample',
      action: { label: 'Collect sample', nextState: 'sample_collected' } },
    { key: 'sample_collected', icon: '🧪', label: 'Collected',   hint: 'En route to lab — accession on arrival',
      action: { label: 'Accession', nextState: 'accessioned' } },
    { key: 'accessioned',      icon: '📥', label: 'Accessioned', hint: 'On bench — start processing',
      action: { label: 'Start processing', nextState: 'in_process' } },
    { key: 'in_process',       icon: '⚗', label: 'Processing',   hint: 'Analyser running · enter results',
      action: { label: 'Mark verified', nextState: 'verified' } },
    { key: 'verified',         icon: '✅', label: 'Verified',    hint: 'Pathologist signed · generate report',
      action: { label: 'Generate report', nextState: 'report_ready' } },
    { key: 'report_ready',     icon: '📄', label: 'Report ready',hint: 'PDF ready · deliver to patient/doctor',
      action: { label: 'Mark delivered', nextState: 'delivered' } },
    { key: 'delivered',        icon: '📬', label: 'Delivered',   hint: 'Closed · printed / portal / SMS',
      action: null },
  ];

  protected readonly orders   = signal<any[]>([]);
  protected readonly busyId   = signal<string | null>(null);
  protected readonly entryFor = signal<any | null>(null);
  protected readonly savingResults = signal(false);
  /** Phase 3: Open critical alerts polled alongside orders. */
  protected readonly criticalAlerts = signal<any[]>([]);
  /** Phase 4: per-instrument QC status from v_lab_instrument_qc_status. */
  protected readonly qcStatus = signal<any[]>([]);
  /** Pre-go-live: QC-overdue banner is suppressed at the source so the rest of
   *  the workflow board is unaffected. Re-enable by switching back to:
   *  `this.qcStatus().filter(r => r.qc_overdue)` */
  protected readonly qcOverdue = computed<any[]>(() => []);

  protected search = '';
  protected onlyIp = false;
  protected onlyStat = false;
  /** Legacy flat value per result (only used for tests without catalog params). */
  protected entryValues: Record<string, number | string | null> = {};
  /** Catalog parameters keyed by result.id. Loaded on dialog open. */
  protected readonly entryParams = signal<Record<string, any[]>>({});
  /** User-typed value per (resultId → parameterId). Strings so we can carry
   *  text answers like "Negative" / "Few" alongside numerics; the save path
   *  routes each entry to value_numeric vs value_text based on parsability. */
  protected paramValues: Record<string, Record<string, string>> = {};
  /** Tick bumped on every parameter/value edit. `canSaveEntry` reads this so
   *  the computed re-runs even though `paramValues` is a plain object (not a
   *  signal). Without this, OnPush + plain mutation leaves the Save button
   *  stuck disabled even after every field is filled. */
  protected readonly entryTick = signal(0);
  /** True while we fetch catalog params + prior values for the open dialog. */
  protected readonly loadingEntry = signal(false);

  /** Bump the tick on every keystroke so `canSaveEntry` re-evaluates. */
  protected onParamInput(resultId: string, parameterId: string, value: unknown): void {
    if (!this.paramValues[resultId]) this.paramValues[resultId] = {};
    this.paramValues[resultId][parameterId] = value == null ? '' : String(value);
    this.entryTick.update(v => v + 1);
  }
  protected onLegacyValueInput(resultId: string, value: unknown): void {
    this.entryValues[resultId] = value == null ? '' : String(value);
    this.entryTick.update(v => v + 1);
  }

  /** Toggle the value to / from "NA" for a single parameter — fast one-click
   *  for techs marking a parameter as not applicable (e.g. stain failed,
   *  insufficient sample). Saves as value_text='NA' downstream. */
  protected toggleParamNa(resultId: string, parameterId: string): void {
    const cur = this.paramValues[resultId]?.[parameterId] ?? '';
    this.onParamInput(resultId, parameterId, cur === 'NA' ? '' : 'NA');
  }
  protected toggleLegacyNa(resultId: string): void {
    const cur = this.entryValues[resultId] ?? '';
    this.onLegacyValueInput(resultId, String(cur) === 'NA' ? '' : 'NA');
  }
  protected isNa(resultId: string, parameterId?: string): boolean {
    const v = parameterId
      ? this.paramValues[resultId]?.[parameterId]
      : this.entryValues[resultId];
    return String(v ?? '') === 'NA';
  }

  /** Placeholder shown in an empty Value field. Prefers the catalog
   *  default_value (e.g. "Negative", "Clear"); otherwise the midpoint of the
   *  ref range so the tech sees a sensible expected magnitude. */
  protected paramPlaceholder(p: any): string {
    if (p?.default_value != null && String(p.default_value).trim() !== '') {
      return String(p.default_value);
    }
    const lo = p?.low_value, hi = p?.high_value;
    if (typeof lo === 'number' && typeof hi === 'number') {
      const mid = (lo + hi) / 2;
      // Round to one decimal unless both bounds are whole numbers.
      const isWhole = Number.isInteger(lo) && Number.isInteger(hi);
      return isWhole ? String(Math.round(mid)) : mid.toFixed(1);
    }
    if (typeof lo === 'number') return String(lo);
    if (typeof hi === 'number') return String(hi);
    return '—';
  }

  /** Verify-gate: every catalog parameter (per test that has any) must have a
   *  value, and tests without params must have their legacy value. Drives the
   *  "Save & verify" disabled state — reports can't be generated until then. */
  protected readonly canSaveEntry = computed<boolean>(() => {
    this.entryTick();                     // tracked — re-eval on every edit
    const o = this.entryFor();
    if (!o) return false;
    const params = this.entryParams();
    for (const r of o.results ?? []) {
      const ps = params[r.id];
      if (ps && ps.length > 0) {
        const required = ps.filter(p => !p.is_section_header);
        if (required.length === 0) continue;
        const vals = this.paramValues[r.id] ?? {};
        for (const p of required) {
          const v = vals[p.id];
          if (v == null || String(v).trim() === '') return false;
        }
      } else {
        const v = this.entryValues[r.id];
        if (v == null || String(v).trim() === '') return false;
      }
    }
    return true;
  });

  protected readonly totalOrders = computed(() => this.orders().length);
  protected readonly criticalCount = computed(() =>
    this.orders().filter(o => (o.results ?? []).some((r: any) => r.flag === 'critical_low' || r.flag === 'critical_high')).length
  );

  private channel: any = null;

  async ngOnInit() {
    await this.reload();
    this.channel = this.supabase.client
      .channel('lab-workflow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_orders' },          () => this.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_results' },         () => this.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_critical_alerts' }, () => this.reload())
      .subscribe();
  }

  ngOnDestroy() {
    if (this.channel) this.supabase.client.removeChannel(this.channel);
  }

  protected async reload() {
    try {
      // Pull all active states; final 'delivered' shown last
      const [data, alerts, qc] = await Promise.all([
        this.svc.listOrdersByStates(
          ['ordered','billed','sample_collected','accessioned','in_process','verified','report_ready','delivered'],
        ),
        this.svc.listOpenCriticalAlerts().catch(() => []),
        this.svc.listInstrumentQcStatus().catch(() => []),
      ]);
      this.orders.set(data);
      this.criticalAlerts.set(alerts);
      this.qcStatus.set(qc);
    } catch (e: any) {
      this.toast.error('Load failed', e?.message ?? 'Could not fetch lab queue.');
    }
  }

  protected visibleFor(state: StateKey): any[] {
    const term = this.search.trim().toLowerCase();
    return this.orders().filter(o => {
      // ORDERED column absorbs legacy 'billed' orders — diagnostic centre
      // doesn't distinguish "ordered" from "ready to collect after payment".
      const matches = state === 'ordered'
        ? (o.state === 'ordered' || o.state === 'billed')
        : o.state === state;
      if (!matches) return false;
      if (this.onlyIp   && o.source !== 'ipd') return false;
      if (this.onlyStat && o.priority === 'routine') return false;
      if (term) {
        const haystack = [
          o.patient?.uhid, o.patient?.full_name, o.patient?.first_name, o.patient?.last_name, o.id,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }

  protected countFor(state: StateKey): number {
    return this.visibleFor(state).length;
  }

  protected patientName(o: any): string {
    return o.patient?.full_name || `${o.patient?.first_name ?? ''} ${o.patient?.last_name ?? ''}`.trim() || '—';
  }

  protected shortDate(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  protected shortDateTime(iso: string) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  /**
   * Phase 4: TAT badge per order card.
   * Picks the strictest target across the order's tests; STAT priority uses the
   * test's stat target. Hidden on terminal states (delivered).
   * Tone: good (≤80% of target) · warn (80–100%) · breach (>100%).
   */
  protected tatBadge(o: any): { label: string; elapsed: number; target: number; tone: 'good'|'warn'|'breach' } | null {
    if (!o.ordered_at || o.state === 'delivered' || o.state === 'cancelled') return null;
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(o.ordered_at).getTime()) / 60000));
    const isStat = o.priority === 'stat';
    const tests = (o.results ?? []).map((r: any) => r.test).filter(Boolean);
    if (tests.length === 0) return null;
    const targets = tests.map((t: any) =>
      isStat ? (t.stat_target_tat_minutes ?? t.target_tat_minutes ?? 60)
             : (t.target_tat_minutes ?? 120)
    );
    const target = Math.min(...targets);   // strictest
    const ratio = elapsed / target;
    const tone: 'good'|'warn'|'breach' = ratio > 1 ? 'breach' : ratio >= 0.8 ? 'warn' : 'good';
    const label = ratio > 1 ? `TAT +${Math.round((ratio - 1) * 100)}%`
                : `TAT ${Math.round(ratio * 100)}%`;
    return { label, elapsed, target, tone };
  }

  /** Phase 3: doctor acknowledges a critical lab value. */
  protected async ackCritical(a: any) {
    if (this.busyId()) return;
    this.busyId.set(a.id);
    try {
      await this.svc.ackCriticalAlert(a.id, { via: 'in_app' });
      this.toast.success('Acknowledged', a.test_name + ' · ' + (a.patient?.full_name ?? ''));
      await this.reload();
    } catch (e: any) {
      this.toast.error('Could not acknowledge', e?.message ?? 'Try again.');
    } finally { this.busyId.set(null); }
  }

  protected actionColor(state: StateKey): string {
    const map: Record<StateKey, string> = {
      ordered: '#65758C', billed: '#0E4F8C', sample_collected: '#3E64FF',
      accessioned: '#1A6FB8',
      in_process: '#7A48F0', verified: '#0F9D58', report_ready: '#0E4F8C', delivered: '#65758C',
    };
    return map[state];
  }

  protected terminalLabel(state: StateKey): string {
    if (state === 'delivered') return '✓ Closed';
    return '';
  }

  // ── State transitions ───────────────────────────────────────────────
  /**
   * Column-specific action.  For 'verified → report_ready' we ALSO open the PDF
   * so the user can print or save it immediately.
   */
  protected async actOnCol(o: any, col: ColumnDef) {
    if (!col.action) return;
    await this.advance(o, col.action.nextState);
    if (col.key === 'verified' && col.action.nextState === 'report_ready') {
      // Auto-open the report after generating it
      try { await this.pdfSvc.openReport(o.id, { autoPrint: false }); } catch {}
    }
  }

  /** Manually open the report PDF for verified / report_ready / delivered orders. */
  protected async printReport(o: any) {
    try {
      await this.pdfSvc.openReport(o.id, { autoPrint: false });
    } catch (e: any) {
      this.toast.error('Report failed', e?.message ?? 'Could not open report.');
    }
  }

  protected async advance(o: any, nextState: StateKey) {
    if (this.busyId()) return;

    // Phase 2 — route to the dedicated RPCs that stamp wristband / accession / etc.
    // billed → sample_collected uses a dialog (collect form) handled below.
    if (o.state === 'billed' && nextState === 'sample_collected') {
      this.openCollectDialog(o); return;
    }
    if (o.state === 'sample_collected' && nextState === 'accessioned') {
      this.busyId.set(o.id);
      try {
        await this.svc.accessionSample(o.id);
        this.toast.success('Accessioned', `${this.patientName(o)} on the bench`);
        await this.reload();
      } catch (e: any) {
        this.toast.error('Could not accession', e?.message ?? 'Try again.');
      } finally { this.busyId.set(null); }
      return;
    }

    // Phase 3 — verify-order goes through dedicated RPC (blocks on unacked criticals)
    if (o.state === 'in_process' && nextState === 'verified') {
      this.busyId.set(o.id);
      try {
        await this.svc.verifyOrder(o.id);
        this.toast.success('Verified', `${this.patientName(o)} signed off`);
        await this.reload();
      } catch (e: any) {
        const msg = e?.message ?? 'Try again.';
        // Friendlier framing for the two expected NABL/safety blocks
        if (msg.includes('QC overdue')) {
          this.toast.warn('Verification blocked — run QC first', msg);
          void this.svc.logVerifyBlocked(o.id, 'qc_overdue', { message: msg });
        } else if (msg.includes('critical')) {
          this.toast.warn('Verification blocked', msg);
          void this.svc.logVerifyBlocked(o.id, 'unacked_critical', { message: msg });
        } else if (msg.includes('result(s) have no value entered')) {
          this.toast.error('Could not verify', msg);
          void this.svc.logVerifyBlocked(o.id, 'missing_values', { message: msg });
        } else {
          this.toast.error('Could not verify', msg);
        }
      } finally { this.busyId.set(null); }
      return;
    }

    // All other transitions still use the generic state setter.
    this.busyId.set(o.id);
    try {
      await this.svc.setOrderState(o.id, nextState as any);
      this.toast.success('Updated', `${this.patientName(o)} → ${nextState.replace('_', ' ')}`);
      await this.reload();
    } catch (e: any) {
      this.toast.error('Action failed', e?.message ?? 'Could not update state.');
    } finally {
      this.busyId.set(null);
    }
  }

  // ── Phase 2: Collect-sample dialog ────────────────────────────────────
  protected readonly collectFor = signal<any | null>(null);
  protected collectWristband = '';
  protected collectTubes = 1;

  protected openCollectDialog(o: any) {
    this.collectWristband = o.wristband_uid ?? '';
    this.collectTubes = 1;
    this.collectFor.set(o);
  }
  protected closeCollect() { if (!this.busyId()) this.collectFor.set(null); }

  protected async confirmCollect() {
    const o = this.collectFor();
    if (!o || !this.collectTubes || this.collectTubes < 1) return;
    this.busyId.set(o.id);
    try {
      await this.svc.collectSample(o.id, {
        wristbandUid: this.collectWristband.trim() || undefined,
        tubeCount:    this.collectTubes,
      });
      this.toast.success('Sample collected', `${this.collectTubes} tube(s) labelled`);
      this.collectFor.set(null);
      await this.reload();
    } catch (e: any) {
      this.toast.error('Could not collect', e?.message ?? 'Try again.');
    } finally { this.busyId.set(null); }
  }

  // ── Phase 2: Reject-sample dialog ─────────────────────────────────────
  protected readonly rejectFor = signal<any | null>(null);
  protected rejectReason: string = 'hemolysed';
  protected rejectDetails = '';
  protected readonly rejectionReasons = [
    'hemolysed', 'lipemic', 'icteric', 'clotted', 'insufficient_volume',
    'wrong_tube', 'mislabeled', 'unlabeled', 'leaking', 'expired_tube',
    'wrong_patient', 'contaminated', 'wrong_temperature', 'delayed_transport', 'other',
  ];

  protected openRejectDialog(o: any) {
    this.rejectReason = 'hemolysed';
    this.rejectDetails = '';
    this.rejectFor.set(o);
  }
  protected closeReject() { if (!this.busyId()) this.rejectFor.set(null); }

  protected async confirmReject() {
    const o = this.rejectFor();
    if (!o) return;
    this.busyId.set(o.id);
    try {
      await this.svc.rejectSample(o.id, this.rejectReason, this.rejectDetails || undefined);
      this.toast.warn('Sample rejected', 're-collection required');
      this.rejectFor.set(null);
      await this.reload();
    } catch (e: any) {
      this.toast.error('Could not reject', e?.message ?? 'Try again.');
    } finally { this.busyId.set(null); }
  }

  // Reopen rejected order back to "Ready"
  protected async recollect(o: any) {
    if (this.busyId()) return;
    this.busyId.set(o.id);
    try {
      await this.svc.reopenForRecollection(o.id);
      this.toast.success('Reopened', 'Order moved back to Ready for re-collection');
      await this.reload();
    } catch (e: any) {
      this.toast.error('Could not reopen', e?.message ?? 'Try again.');
    } finally { this.busyId.set(null); }
  }

  // ── Result entry ────────────────────────────────────────────────────
  /** Phase 6: reflex-test suggestions for the open result-entry dialog. */
  protected readonly reflexSuggestions = signal<any[]>([]);

  protected async openResultEntry(o: any) {
    this.entryValues = {};
    this.paramValues = {};
    this.entryParams.set({});
    for (const r of o.results ?? []) {
      this.entryValues[r.id] = r.value_numeric ?? r.value_text ?? null;
      this.paramValues[r.id] = {};
    }
    this.entryFor.set(o);
    // Pull reflex suggestions in the background — empty until first values are saved.
    this.svc.getReflexSuggestions(o.id).then(s => this.reflexSuggestions.set(s)).catch(() => this.reflexSuggestions.set([]));

    // Load catalog parameters + any previously-saved per-parameter values so
    // the user can edit existing entries instead of starting from scratch.
    this.loadingEntry.set(true);
    try {
      const results: any[] = o.results ?? [];
      const pairs = await Promise.all(results.map(async (r) => {
        const testId = r?.test?.id;
        if (!testId) return [r.id, [] as any[], [] as any[]] as const;
        const [params, vals] = await Promise.all([
          this.svc.listTestParameters(testId),
          this.svc.listResultValues(r.id),
        ]);
        return [r.id, params, vals] as const;
      }));
      const nextParams: Record<string, any[]> = {};
      for (const [rid, params, vals] of pairs) {
        nextParams[rid] = params;
        const byParam: Record<string, string> = {};
        const seedFromCatalog = (p: any) => {
          if (p.is_section_header) return;
          // Prefer the catalog default_value (e.g. "Negative", "Clear") so the
          // tech only has to touch values that diverge from normal.
          if (p.default_value != null && String(p.default_value).trim() !== '') {
            byParam[p.id] = String(p.default_value);
          }
        };
        for (const p of params) seedFromCatalog(p);
        // Existing saved values override the catalog default.
        for (const v of vals) {
          const pid = v.lab_test_parameter_id;
          if (!pid) continue;
          if (v.value_numeric != null) byParam[pid] = String(v.value_numeric);
          else if (v.value_text != null) byParam[pid] = String(v.value_text);
        }
        this.paramValues[rid] = byParam;
      }
      this.entryParams.set(nextParams);
    } catch {
      // Catalog table may be missing in older schemas — fall back to flat entry.
      this.entryParams.set({});
    } finally {
      this.loadingEntry.set(false);
    }
  }

  /** Re-fetch suggestions after Save & verify so the next dialog open reflects new triggers. */
  protected async refreshReflex(orderId: string) {
    try { this.reflexSuggestions.set(await this.svc.getReflexSuggestions(orderId)); } catch {}
  }

  protected closeEntry(_e: Event) {
    if (!this.savingResults()) this.entryFor.set(null);
  }

  protected async saveResults() {
    const o = this.entryFor();
    if (!o) return;
    if (!this.canSaveEntry()) {
      this.toast.warn('Incomplete', 'Enter every parameter before saving.');
      return;
    }
    this.savingResults.set(true);
    try {
      // Per-result dispatch: tests with catalog parameters go through the
      // batch RPC `lab_save_result_values`; the rest still use the legacy
      // single-value path so this works for tests that haven't been broken
      // out into the parameters table yet.
      const params = this.entryParams();
      let savedCount = 0;
      for (const r of (o.results ?? [])) {
        const ps = params[r.id];
        if (ps && ps.length > 0) {
          // Numeric when the trimmed value parses cleanly; text otherwise.
          // We don't gate on catalog low/high — labs sometimes record
          // qualitative results (e.g. "Trace") even for ranged parameters.
          const entries: Array<{ parameter_id: string; value_numeric?: number | null; value_text?: string | null }> = [];
          for (const p of ps as any[]) {
            if (p.is_section_header) continue;
            const raw = (this.paramValues[r.id]?.[p.id] ?? '').toString().trim();
            if (raw === '') continue;
            const n = Number(raw);
            if (Number.isFinite(n) && /^[-+]?[0-9]*\.?[0-9]+$/.test(raw)) {
              entries.push({ parameter_id: p.id, value_numeric: n });
            } else {
              entries.push({ parameter_id: p.id, value_text: raw });
            }
          }
          if (entries.length > 0) {
            await this.svc.saveResultValues(r.id, entries);
            savedCount++;
          }
        } else {
          const v = this.entryValues[r.id];
          if (v === null || v === '' || v === undefined) continue;
          const n = Number(v);
          await this.svc.enterResultRpc({
            resultId: r.id,
            valueNumeric: Number.isFinite(n) ? n : null,
            valueText:    Number.isFinite(n) ? null : String(v),
          });
          savedCount++;
        }
      }
      // Bulk verify after the per-result writes. Two failure shapes worth
      // surfacing: unacked critical alerts (NABL block) and QC overdue.
      // Anything else gets a generic error toast so the cashier isn't
      // misled by a green "Saved" while verification silently failed.
      let verified = true;
      try {
        await this.svc.verifyOrder(o.id);
      } catch (verr: any) {
        verified = false;
        const msg = verr?.message ?? 'Try again.';
        if (msg.includes('critical')) {
          this.toast.warn('Verification blocked', msg);
        } else if (msg.includes('QC overdue')) {
          this.toast.warn('Verification blocked — run QC first', msg);
        } else if (msg.includes('result(s) have no value entered')) {
          this.toast.error('Could not verify', msg);
        } else {
          this.toast.error('Verify failed', msg);
        }
      }
      if (savedCount > 0) {
        this.toast.success(
          verified ? 'Saved & verified' : 'Saved',
          `${savedCount} test(s) recorded` + (verified ? '' : ' — verification deferred'),
        );
      } else if (verified) {
        this.toast.info('Already up to date', 'No changes to save.');
      }

      // Phase 6 — re-evaluate reflex rules with the freshly entered values; if
      // any new ones fire, surface them as a toast so the user knows even
      // before reopening the dialog.
      const sugg = await this.svc.getReflexSuggestions(o.id).catch(() => []);
      this.reflexSuggestions.set(sugg);
      if (sugg.length > 0) {
        this.toast.info(
          `${sugg.length} reflex test suggestion(s)`,
          sugg.slice(0, 2).map((s: any) => s.target_test_code).join(', ')
            + (sugg.length > 2 ? ` + ${sugg.length - 2} more` : ''),
        );
      }

      this.entryFor.set(null);
      await this.reload();
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? 'Could not save results.');
    } finally {
      this.savingResults.set(false);
    }
  }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
}
