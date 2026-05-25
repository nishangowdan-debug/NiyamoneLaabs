import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit,
  computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import {
  LabDashboardService,
  type LabKpis,
  type PendingSampleRow,
  type HomeCollectionRow,
  type CriticalResultRow,
  type TopTestRow,
  type DashboardPeriod,
  type RevenueSeries,
  type VolumeBucket,
  type StatusMix,
  type BranchRevenue,
} from '../data/lab-dashboard.service';
import { PayrollService, type DoctorReferralRow } from '../../payroll/data/payroll.service';

const AUTO_REFRESH_MS = 30_000;
const SYNC_TICK_MS    = 1_000;

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
};

const PERIOD_WINDOWS: Record<DashboardPeriod, string> = {
  daily:   'last 24 hours',
  weekly:  'last 7 days',
  monthly: 'last 30 days',
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, AlertComponent],
  template: `
    <!-- ── Hero ────────────────────────────────────────────────── -->
    <header class="relative overflow-hidden rounded-[14px] mb-5 px-6 py-5"
            style="background: linear-gradient(120deg, #0C2A52 0%, #0E4F8C 55%, #00C3FF 130%);
                   box-shadow: 0 2px 4px rgba(12,42,82,0.15), 0 24px 48px -16px rgba(12,42,82,0.45);">
      <div class="absolute inset-x-0 top-0 h-px"
           style="background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);"></div>
      <svg class="absolute -right-10 -top-10 opacity-10" width="280" height="280" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="80" fill="none" stroke="white" stroke-width="0.6"/>
        <circle cx="100" cy="100" r="60" fill="none" stroke="white" stroke-width="0.6"/>
        <circle cx="100" cy="100" r="40" fill="none" stroke="white" stroke-width="0.6"/>
        <circle cx="100" cy="100" r="20" fill="none" stroke="white" stroke-width="0.6"/>
      </svg>
      <div class="relative flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-[0.12em] text-white/70 font-medium">{{ greeting() }}</p>
          <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-white leading-[1.1] mt-1">
            Sree Diagnostics · {{ branchName() }}
          </h1>
          <p class="text-[13px] text-white/80 mt-1">
            {{ today() | date:'EEEE, d MMMM yyyy' }} · {{ periodLabel() }} view
          </p>
        </div>
        <div class="flex flex-col items-end gap-2 shrink-0">
          <!-- Master period toggle — drives every section -->
          <div class="inline-flex rounded-md border border-white/25 bg-white/10 p-0.5 backdrop-blur">
            @for (p of periods; track p.value) {
              <button (click)="setPeriod(p.value)"
                      [class.bg-white]="period() === p.value"
                      [class.text-primary-700]="period() === p.value"
                      [class.text-white]="period() !== p.value"
                      [class.hover:bg-white\\/20]="period() !== p.value"
                      class="h-7 px-3 rounded-[5px] text-[12px] font-semibold transition-colors">
                {{ p.label }}
              </button>
            }
          </div>
          <div class="flex items-center gap-2">
            <button (click)="reload()" [disabled]="loading()"
                    class="h-8 inline-flex items-center gap-1.5 px-3 rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white text-[12px] font-medium border border-white/20 backdrop-blur">
              <span class="inline-block" [class.animate-spin]="loading()">⟳</span>
              {{ loading() ? 'Syncing…' : 'Refresh' }}
            </button>
            <button (click)="exportDashboardPdf()" [disabled]="exporting() || loading()"
                    class="h-8 inline-flex items-center gap-1.5 px-3 rounded-md bg-white text-primary-700 hover:bg-white/90 disabled:opacity-50 text-[12px] font-semibold shadow-card">
              ⬇ {{ exporting() ? 'Building PDF…' : 'Export PDF' }}
            </button>
          </div>
          <span class="text-[10px] text-white/70 font-mono">Synced {{ syncedAgo() }}</span>
        </div>
      </div>
    </header>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load dashboard">{{ error() }}</app-alert></div>
    }

    <!-- ── KPI row — every label respects the period ───────────── -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      <a routerLink="/lab" [queryParams]="{ filter: 'pending' }"
         class="rounded-[12px] bg-gradient-to-br from-primary-50 to-surface-card border border-primary-100 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">To collect</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-primary-700 mt-1">{{ kpis().toCollect }}</p>
        <p class="text-[11px] text-ink-muted mt-1">Samples awaiting phlebotomy</p>
      </a>
      <a routerLink="/lab" [queryParams]="{ filter: 'running' }"
         class="rounded-[12px] bg-gradient-to-br from-warn-bg/40 to-surface-card border border-warn-fg/15 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">In process</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-warn-fg mt-1">{{ kpis().inProcess }}</p>
        <p class="text-[11px] text-ink-muted mt-1">Collected + running</p>
      </a>
      <a routerLink="/lab" [queryParams]="{ filter: 'verify' }"
         class="rounded-[12px] bg-gradient-to-br from-info-bg/50 to-surface-card border border-info-fg/15 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">To verify</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-info-fg mt-1">{{ kpis().toVerify }}</p>
        <p class="text-[11px] text-ink-muted mt-1">Awaiting sign-off</p>
      </a>
      <a routerLink="/lab" [queryParams]="{ filter: 'verified' }"
         class="rounded-[12px] bg-gradient-to-br from-good-bg/50 to-surface-card border border-good-fg/15 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Reports · {{ periodShort() }}</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-good-fg mt-1">{{ kpis().reportsToday }}</p>
        <p class="text-[11px] text-ink-muted mt-1">Finalised in {{ periodWindow() }}</p>
      </a>
      <a routerLink="/lab" [queryParams]="{ filter: 'critical' }"
         class="rounded-[12px] bg-gradient-to-br from-danger-bg to-surface-card border border-danger-fg/30 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-danger-fg font-semibold">Critical · {{ periodShort() }}</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-danger-fg mt-1">{{ kpis().critical }}</p>
        <p class="text-[11px] text-danger-fg/80 mt-1">Critical flags in {{ periodWindow() }}</p>
      </a>
      <a routerLink="/home-collection"
         class="rounded-[12px] bg-gradient-to-br from-primary-50 to-surface-card border border-primary-100 p-4 hover:shadow-card hover:-translate-y-px transition-all">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Home · {{ periodShort() }}</p>
        <p class="font-display text-[28px] leading-[1] font-medium text-primary-700 mt-1">{{ kpis().homeToday }}</p>
        <p class="text-[11px] text-ink-muted mt-1">Visits in {{ periodWindow() }}</p>
      </a>
    </div>

    <!-- ── Quick actions ───────────────────────────────────────── -->
    <section class="bg-surface-card border border-border rounded-[12px] p-4 mb-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-[13px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Quick actions</h2>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <a routerLink="/lab" class="h-10 inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card">
          🧪 Lab workbench
        </a>
        <a routerLink="/home-collection/new" class="h-10 inline-flex items-center justify-center gap-2 rounded-md bg-primary-50 hover:bg-primary-100 text-primary-700 text-[13px] font-medium border border-primary-200">
          🏠 Home collection
        </a>
        <a routerLink="/billing" class="h-10 inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-card hover:bg-surface-muted text-[13px] font-medium text-ink-soft">
          🧾 New invoice
        </a>
        <a routerLink="/lab-catalog" class="h-10 inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-card hover:bg-surface-muted text-[13px] font-medium text-ink-soft">
          📋 Test catalog
        </a>
      </div>
    </section>

    <!-- ── Revenue insights — bar + donut + legend ─────────────── -->
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden mb-5">
      <header class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 class="text-[14px] font-medium text-ink">Revenue insights · {{ periodLabel() }}</h2>
          <p class="text-[11px] text-ink-muted">
            {{ revenue().windowStart | date:'d MMM' }} → {{ revenue().windowEnd | date:'d MMM yyyy' }}
            · live from invoice_line_items
          </p>
        </div>
      </header>

      <!-- Totals strip -->
      <div class="px-4 py-3 border-b border-border grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface-subtle/40">
        <div>
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Total revenue</p>
          <p class="font-display text-[22px] leading-[1] font-medium text-primary-700 mt-1">₹{{ totalRupees() | number:'1.0-0' }}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">vs prior period</p>
          <p class="font-display text-[22px] leading-[1] font-medium mt-1"
             [class.text-good-fg]="(revenue().deltaPct ?? 0) >= 0"
             [class.text-danger-fg]="(revenue().deltaPct ?? 0) < 0">
            {{ deltaLabel() }}
          </p>
          <p class="text-[10px] text-ink-muted">prior ₹{{ prevRupees() | number:'1.0-0' }}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Buckets</p>
          <p class="font-display text-[22px] leading-[1] font-medium text-ink mt-1">{{ revenue().buckets.length }}</p>
          <p class="text-[10px] text-ink-muted">{{ granularityHint() }}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Categories</p>
          <p class="font-display text-[22px] leading-[1] font-medium text-ink mt-1">{{ revenue().categories.length }}</p>
          <p class="text-[10px] text-ink-muted">{{ topCategoryLabel() }}</p>
        </div>
      </div>

      <!-- Bar + donut side by side -->
      <div class="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-4 px-4 py-4">
        <!-- Stacked bar chart -->
        <div>
          @if (revenue().totalCents === 0) {
            <p class="py-12 text-center text-[12px] text-ink-muted">
              No revenue in this window. Check that invoices are issued and not voided.
            </p>
          } @else {
            <svg [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight"
                 class="w-full" preserveAspectRatio="none"
                 style="height: 220px;" role="img" aria-label="Revenue by period and category">
              @for (g of gridLines(); track g.y) {
                <line [attr.x1]="0" [attr.x2]="chartWidth" [attr.y1]="g.y" [attr.y2]="g.y"
                      stroke="#E5EAF3" stroke-width="0.5"/>
                <text [attr.x]="0" [attr.y]="g.y - 2" font-size="9" fill="#94A3B8">
                  ₹{{ g.value | number:'1.0-0' }}
                </text>
              }
              @for (b of stackedBars(); track b.key) {
                @for (seg of b.segments; track seg.code) {
                  <rect [attr.x]="b.x" [attr.y]="seg.y" [attr.width]="b.width" [attr.height]="seg.height"
                        [attr.fill]="seg.color" rx="1">
                    <title>{{ b.label }} · {{ seg.label }}: ₹{{ seg.rupees | number:'1.0-0' }}</title>
                  </rect>
                }
              }
            </svg>
            <div class="flex justify-between mt-1 px-[2px]">
              @for (b of stackedBars(); track b.key; let i = $index) {
                <span class="text-[9px] text-ink-muted font-mono"
                      [class.invisible]="i % xLabelStride() !== 0 && i !== stackedBars().length - 1">
                  {{ b.label }}
                </span>
              }
            </div>
          }
        </div>
        <!-- Donut: category share -->
        <div class="flex flex-col items-center justify-center">
          @if (revenue().categories.length === 0) {
            <div class="size-[180px] rounded-full bg-surface-muted/40 flex items-center justify-center text-[11px] text-ink-muted">
              No data
            </div>
          } @else {
            <svg viewBox="0 0 100 100" class="size-[180px] -rotate-90">
              <circle cx="50" cy="50" r="40" fill="#FAFBFC" stroke="#E5EAF3" stroke-width="0.5"/>
              @for (slice of revenueDonut(); track slice.code) {
                <circle cx="50" cy="50" r="40" fill="transparent"
                        [attr.stroke]="slice.color" stroke-width="18"
                        [attr.stroke-dasharray]="slice.dasharray"
                        [attr.stroke-dashoffset]="slice.dashoffset">
                  <title>{{ slice.label }}: ₹{{ slice.rupees | number:'1.0-0' }} ({{ (slice.share * 100) | number:'1.0-1' }}%)</title>
                </circle>
              }
            </svg>
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mt-2">Category share</p>
          }
        </div>
      </div>

      <!-- Category legend with bars -->
      @if (revenue().categories.length) {
        <div class="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          @for (c of revenue().categories; track c.code) {
            <div>
              <div class="flex items-center justify-between text-[12px]">
                <span class="inline-flex items-center gap-2 text-ink truncate min-w-0">
                  <span class="size-2.5 rounded-sm shrink-0" [style.background]="c.color"></span>
                  <span class="truncate">{{ c.label }}</span>
                </span>
                <span class="font-mono text-ink-muted whitespace-nowrap">
                  ₹{{ (c.cents/100) | number:'1.0-0' }} · {{ (c.share * 100) | number:'1.0-1' }}%
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-muted overflow-hidden mt-1">
                <div class="h-full rounded-full" [style.width.%]="c.share * 100" [style.background]="c.color"></div>
              </div>
            </div>
          }
        </div>
      }
    </section>

    <!-- ── Branch performance (only when no branch is selected) ─ -->
    @if (showBranchCard()) {
      <section class="rounded-[12px] overflow-hidden mb-5 relative"
               style="background: linear-gradient(135deg, #0C2A52 0%, #0E4F8C 60%, #1E40AF 100%);
                      box-shadow: 0 24px 48px -16px rgba(12,42,82,0.35);">
        <svg class="absolute right-0 top-0 opacity-[0.07] pointer-events-none" width="320" height="320" viewBox="0 0 200 200">
          <circle cx="170" cy="40" r="80" fill="none" stroke="white" stroke-width="0.6"/>
          <circle cx="170" cy="40" r="60" fill="none" stroke="white" stroke-width="0.6"/>
          <circle cx="170" cy="40" r="40" fill="none" stroke="white" stroke-width="0.6"/>
        </svg>
        <header class="px-5 py-4 border-b border-white/10 flex flex-wrap items-center gap-3 justify-between relative">
          <div>
            <h2 class="text-[14px] font-medium text-white">Branch performance · {{ periodLabel() }}</h2>
            <p class="text-[11px] text-white/70">
              {{ branchRevenue().rows.length }} active
              branch{{ branchRevenue().rows.length === 1 ? '' : 'es' }}
              · ranked by collected revenue
            </p>
          </div>
          <div class="text-right">
            <p class="text-[10px] uppercase tracking-[0.06em] text-white/70 font-semibold">Network total</p>
            <p class="font-display text-[24px] leading-[1] font-medium text-white mt-0.5">
              ₹{{ (branchRevenue().totalCents / 100) | number:'1.0-0' }}
            </p>
            <p class="text-[10px] text-white/70 mt-0.5">
              vs prior ₹{{ (branchRevenue().prevTotalCents / 100) | number:'1.0-0' }}
              · {{ networkDeltaLabel() }}
            </p>
          </div>
        </header>

        <!-- Share strip — colored segments per branch -->
        @if (branchRevenue().rows.length > 0 && branchRevenue().totalCents > 0) {
          <div class="px-5 pt-4 relative">
            <div class="h-2 rounded-full overflow-hidden flex bg-white/10">
              @for (b of branchRevenue().rows; track b.branch_id; let i = $index) {
                <div [style.width.%]="b.share * 100"
                     [style.background]="branchColor(i)"
                     [attr.title]="b.name + ': ' + ((b.cents/100) | number:'1.0-0') + ' (' + ((b.share*100) | number:'1.0-1') + '%)'"
                     class="h-full transition-all"></div>
              }
            </div>
          </div>
        }

        <div class="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 relative">
          @if (branchRevenue().rows.length === 0) {
            <div class="md:col-span-2 py-10 text-center text-[12px] text-white/70">
              No branch revenue in this window.
            </div>
          } @else {
            @for (b of branchRevenue().rows; track b.branch_id; let i = $index) {
              <div class="rounded-[10px] p-3 bg-white/10 backdrop-blur border border-white/15 hover:bg-white/15 transition-colors">
                <div class="flex items-center gap-2 mb-2">
                  <span class="inline-flex items-center justify-center size-6 rounded-md font-mono text-[10px] font-bold"
                        [style.background]="branchColor(i) + '40'"
                        [style.color]="branchColor(i)"
                        [style.border]="'1px solid ' + branchColor(i)">
                    {{ b.rank === 1 ? '👑' : '#' + b.rank }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-medium text-white truncate">{{ b.name }}</div>
                    <div class="text-[10px] text-white/60 font-mono">{{ b.code }}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-[14px] font-display font-medium text-white">
                      ₹{{ (b.cents/100) | number:'1.0-0' }}
                    </div>
                    <div class="text-[10px]"
                         [class.text-good-bg]="(b.deltaPct ?? 0) >= 0"
                         [class.text-warn-bg]="(b.deltaPct ?? 0) < 0">
                      {{ branchDeltaLabel(b.deltaPct) }}
                    </div>
                  </div>
                </div>
                <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                       [style.width.%]="(b.cents / (branchRevenue().topCents || 1)) * 100"
                       [style.background]="branchColor(i)"></div>
                </div>
                <div class="flex items-center justify-between mt-1 text-[10px] text-white/60">
                  <span>{{ (b.share * 100) | number:'1.0-1' }}% share</span>
                  <span class="font-mono">prior ₹{{ (b.prev_cents/100) | number:'1.0-0' }}</span>
                </div>
              </div>
            }
          }
        </div>
      </section>
    }

    <!-- ── Volume trend + Status mix ───────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-5 mb-5">
      <!-- Order/Report volume trend -->
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[14px] font-medium text-ink">Volume trend · {{ periodLabel() }}</h2>
          <p class="text-[11px] text-ink-muted">
            Orders placed vs reports finalised across each {{ granularityHint() }} bucket
          </p>
        </header>
        <div class="px-4 py-4">
          @if (volumeTotal() === 0) {
            <p class="py-12 text-center text-[12px] text-ink-muted">No order activity in this window.</p>
          } @else {
            <svg [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight"
                 class="w-full" preserveAspectRatio="none" style="height: 200px;">
              <!-- area fills -->
              <path [attr.d]="orderArea()"   fill="#0E4F8C" fill-opacity="0.15"/>
              <path [attr.d]="reportsArea()" fill="#10B981" fill-opacity="0.15"/>
              <!-- lines -->
              <polyline [attr.points]="orderLine()"   fill="none" stroke="#0E4F8C" stroke-width="1.5"/>
              <polyline [attr.points]="reportsLine()" fill="none" stroke="#10B981" stroke-width="1.5"/>
              <!-- point markers -->
              @for (p of volumePoints(); track p.key) {
                <circle [attr.cx]="p.x" [attr.cy]="p.yOrders"  r="2" fill="#0E4F8C"><title>{{ p.label }} · {{ p.orders }} orders</title></circle>
                <circle [attr.cx]="p.x" [attr.cy]="p.yReports" r="2" fill="#10B981"><title>{{ p.label }} · {{ p.reports }} reports</title></circle>
              }
            </svg>
            <div class="flex items-center justify-between mt-2 text-[11px] text-ink-muted">
              <div class="flex items-center gap-3">
                <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-sm bg-primary-700"></span>Orders ({{ totalOrders() }})</span>
                <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-sm" style="background:#10B981"></span>Reports ({{ totalReports() }})</span>
              </div>
              <span class="font-mono">{{ volume().length }} buckets</span>
            </div>
          }
        </div>
      </section>

      <!-- Sample status mix donut -->
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[14px] font-medium text-ink">Sample status</h2>
          <p class="text-[11px] text-ink-muted">Distribution across the order pipeline</p>
        </header>
        <div class="px-4 py-4 flex flex-col items-center">
          @if (mix().total === 0) {
            <div class="size-[160px] rounded-full bg-surface-muted/40 flex items-center justify-center text-[11px] text-ink-muted">
              No samples
            </div>
          } @else {
            <div class="relative">
              <svg viewBox="0 0 100 100" class="size-[160px] -rotate-90">
                <circle cx="50" cy="50" r="40" fill="#FAFBFC" stroke="#E5EAF3" stroke-width="0.5"/>
                @for (slice of statusDonut(); track slice.code) {
                  <circle cx="50" cy="50" r="40" fill="transparent"
                          [attr.stroke]="slice.color" stroke-width="14"
                          [attr.stroke-dasharray]="slice.dasharray"
                          [attr.stroke-dashoffset]="slice.dashoffset">
                    <title>{{ slice.label }}: {{ slice.count }}</title>
                  </circle>
                }
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span class="font-display text-[22px] font-medium text-ink leading-none">{{ mix().total }}</span>
                <span class="text-[10px] text-ink-muted uppercase tracking-[0.06em]">samples</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 w-full text-[11px]">
              @for (s of statusLegend(); track s.code) {
                <div class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1.5 truncate">
                    <span class="size-2 rounded-sm shrink-0" [style.background]="s.color"></span>
                    <span class="text-ink truncate">{{ s.label }}</span>
                  </span>
                  <span class="font-mono text-ink-muted">{{ s.count }}</span>
                </div>
              }
            </div>
          }
        </div>
      </section>
    </div>

    <!-- ── Two-column body: pending + home ─────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 class="text-[14px] font-medium text-ink">Awaiting collection</h2>
            <p class="text-[11px] text-ink-muted">STAT / urgent first, then oldest order</p>
          </div>
          <a routerLink="/lab" [queryParams]="{ filter: 'pending' }" class="text-[12px] text-primary-600 hover:underline">View all →</a>
        </header>
        @if (pending().length === 0) {
          <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No pending samples — great work.</p>
        } @else {
          <ul class="divide-y divide-border">
            @for (r of pending(); track r.order_id) {
              <li class="flex items-center gap-3 px-4 py-2.5">
                <span [class]="priorityChipCls(r.priority)">{{ r.priority.toUpperCase() }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] text-ink truncate">{{ r.patient_name }}</div>
                  <div class="text-[11px] text-ink-muted font-mono">{{ r.uhid }} · {{ r.pending_count }} test{{ r.pending_count === 1 ? '' : 's' }}</div>
                </div>
                <div class="text-right text-[11px] text-ink-muted whitespace-nowrap">{{ r.ordered_at | date:'h:mm a' }}</div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 class="text-[14px] font-medium text-ink">Today's home collections</h2>
            <p class="text-[11px] text-ink-muted">Scheduled visits in chronological order</p>
          </div>
          <a routerLink="/home-collection" class="text-[12px] text-primary-600 hover:underline">View all →</a>
        </header>
        @if (homeToday().length === 0) {
          <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No home collections scheduled today.</p>
        } @else {
          <ul class="divide-y divide-border">
            @for (r of homeToday(); track r.id) {
              <li class="flex items-center gap-3 px-4 py-2.5">
                <span class="text-[11px] font-mono text-ink-muted w-12">{{ r.scheduled_at | date:'HH:mm' }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] text-ink truncate">{{ r.patient_name }}</div>
                  <div class="text-[11px] text-ink-muted">{{ r.pincode }} · {{ r.phlebotomist_name || 'unassigned' }}</div>
                </div>
                <span [class]="homeStatusChipCls(r.status)">{{ r.status }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>

    <!-- ── Bottom row: critical / top tests ────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[14px] font-medium text-ink">Critical results · {{ periodLabel() }}</h2>
          <p class="text-[11px] text-ink-muted">Acknowledge in the Lab QC tab</p>
        </header>
        @if (critical().length === 0) {
          <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No critical results in {{ periodWindow() }}.</p>
        } @else {
          <ul class="divide-y divide-border">
            @for (r of critical(); track r.result_id) {
              <li class="px-4 py-2.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-[12px] text-ink truncate"><span class="font-mono">{{ r.test_code }}</span> · {{ r.test_name }}</div>
                    <div class="text-[11px] text-ink-muted truncate">{{ r.patient_name }} · {{ r.uhid }}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-[12px] font-mono text-danger-fg font-semibold">{{ r.value }} {{ r.unit }}</div>
                    <div class="text-[10px] uppercase tracking-[0.06em] text-danger-fg/80">{{ r.flag.replace('_','-') }}</div>
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Top referring doctors — sync'd to /payroll/doctors -->
      <section class="bg-gradient-to-br from-primary-600 to-primary-700 border border-primary-700 rounded-[12px] overflow-hidden text-white shadow-card">
        <header class="px-4 py-3 border-b border-white/15 flex items-center justify-between">
          <div>
            <h2 class="text-[14px] font-medium inline-flex items-center gap-2">
              <span class="inline-grid place-items-center size-6 rounded-md bg-white/15">🩺</span>
              Top referring doctors
            </h2>
            <p class="text-[11px] text-white/70">Patients referred &amp; commission earned · {{ periodLabel() }}</p>
          </div>
          <a routerLink="/payroll/doctors"
             class="text-[11px] font-semibold uppercase tracking-wider bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-md transition-colors">
            View all →
          </a>
        </header>
        @if (topDoctors().length === 0) {
          <p class="px-4 py-10 text-center text-[12px] text-white/70">No referrals in {{ topTestsWindowLabel() }}.</p>
        } @else {
          <ul class="px-4 py-3 space-y-3">
            @for (d of topDoctors(); track d.doctor_id; let i = $index) {
              <li>
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <span class="text-[12.5px] font-medium flex items-center gap-2 min-w-0">
                    <span class="size-5 grid place-items-center rounded-full bg-white/20 text-[10px] font-bold shrink-0">{{ i + 1 }}</span>
                    <span class="truncate">{{ d.doctor_name }}</span>
                  </span>
                  <span class="text-[12px] font-mono font-semibold shrink-0">
                    {{ d.patients_count }} <span class="text-white/60 text-[10px]">pts</span>
                  </span>
                </div>
                <div class="h-2 rounded-full bg-white/15 overflow-hidden">
                  <div class="h-full bg-white rounded-full transition-all duration-500"
                       [style.width.%]="doctorBarWidth(d.patients_count)"></div>
                </div>
                <div class="flex items-center justify-between mt-1 text-[10.5px] text-white/75 font-mono">
                  <span>{{ d.tests_count }} tests · gross {{ inrShort(d.gross_cents) }}</span>
                  <span class="text-[11px] font-semibold text-white">🪙 {{ inrShort(d.commission_cents) }}</span>
                </div>
              </li>
            }
          </ul>
          <footer class="px-4 py-2.5 bg-white/5 border-t border-white/10 flex justify-between text-[10.5px] uppercase tracking-wider text-white/75">
            <span>Total · {{ topDoctorsTotals().patients }} patients</span>
            <span>Commission · {{ inrShort(topDoctorsTotals().commission) }}</span>
          </footer>
        }
      </section>

      <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[14px] font-medium text-ink">Top tests · {{ periodLabel() }}</h2>
          <p class="text-[11px] text-ink-muted">By result volume in {{ topTestsWindowLabel() }}</p>
        </header>
        @if (topTests().length === 0) {
          <p class="px-4 py-8 text-center text-[12px] text-ink-muted">No results in this period.</p>
        } @else {
          <ul class="px-4 py-3 space-y-2">
            @for (t of topTests(); track t.code) {
              <li>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[12px] text-ink truncate flex-1 min-w-0"><span class="font-mono text-ink-muted">{{ t.code }}</span> · {{ t.name }}</span>
                  <span class="text-[12px] font-mono text-ink shrink-0">{{ t.count }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-surface-muted overflow-hidden mt-1">
                  <div class="h-full bg-primary-600" [style.width.%]="barWidth(t.count)"></div>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class DashboardPage implements OnInit, OnDestroy {
  private svc = inject(LabDashboardService);
  private auth = inject(AuthStore);
  private branchStore = inject(BranchStore);
  private payrollSvc = inject(PayrollService);

  protected readonly periods: { value: DashboardPeriod; label: string }[] = [
    { value: 'daily',   label: 'Daily'   },
    { value: 'weekly',  label: 'Weekly'  },
    { value: 'monthly', label: 'Monthly' },
  ];

  protected readonly chartWidth  = 600;
  protected readonly chartHeight = 200;

  protected readonly today = signal(new Date());
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly period = signal<DashboardPeriod>('daily');
  protected readonly lastSyncedAt = signal<number>(Date.now());
  protected readonly syncTick = signal(0);

  protected readonly kpis = signal<LabKpis>({
    toCollect: 0, inProcess: 0, toVerify: 0, reportsToday: 0, critical: 0, homeToday: 0,
  });
  protected readonly pending = signal<PendingSampleRow[]>([]);
  protected readonly homeToday = signal<HomeCollectionRow[]>([]);
  protected readonly critical = signal<CriticalResultRow[]>([]);
  protected readonly topTests = signal<TopTestRow[]>([]);
  /** Live top-5 referring doctors for the same period as the rest of the
   *  dashboard. Synced from the same RPC that backs /payroll/doctors. */
  protected readonly topDoctors = signal<DoctorReferralRow[]>([]);
  protected readonly topDoctorsTotals = computed(() => {
    const rows = this.topDoctors();
    return {
      patients:   rows.reduce((s, r) => s + r.patients_count, 0),
      commission: rows.reduce((s, r) => s + r.commission_cents, 0),
    };
  });
  private readonly maxDoctorReferrals = computed(() =>
    this.topDoctors().reduce((m, d) => Math.max(m, d.patients_count), 0),
  );

  protected doctorBarWidth(count: number): number {
    const max = this.maxDoctorReferrals();
    return max > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0;
  }

  /** Compact INR formatter — "₹1.2L", "₹40K", "₹250". Keeps the bar text tight. */
  protected inrShort(cents: number): string {
    const r = (cents ?? 0) / 100;
    if (r >= 10000000) return `₹${(r / 10000000).toFixed(1)}Cr`;
    if (r >= 100000)   return `₹${(r / 100000).toFixed(1)}L`;
    if (r >= 1000)     return `₹${(r / 1000).toFixed(1)}K`;
    return `₹${Math.round(r)}`;
  }
  protected readonly revenue = signal<RevenueSeries>(this.emptySeries('daily'));
  protected readonly volume  = signal<VolumeBucket[]>([]);
  protected readonly mix     = signal<StatusMix>({ to_collect: 0, in_process: 0, to_verify: 0, verified: 0, total: 0 });
  protected readonly branchRevenue = signal<BranchRevenue>({
    rows: [], totalCents: 0, prevTotalCents: 0, topCents: 0, windowStart: '', windowEnd: '',
  });

  // Branch card is shown only when no specific branch is selected (i.e. "All hospitals")
  protected readonly showBranchCard = computed(() => !this.branchStore.activeBranchId());

  // Color cycle for branch cards / share strip — distinct enough to read at small sizes.
  private readonly BRANCH_COLORS = ['#00C3FF', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#6366F1', '#22D3EE'];
  protected branchColor(i: number): string {
    return this.BRANCH_COLORS[i % this.BRANCH_COLORS.length];
  }

  protected branchDeltaLabel(d: number | null): string {
    if (d === null) return 'new';
    const sign = d >= 0 ? '↑' : '↓';
    return `${sign} ${Math.abs(d).toFixed(1)}%`;
  }

  protected readonly networkDeltaLabel = computed(() => {
    const br = this.branchRevenue();
    if (br.prevTotalCents === 0) return br.totalCents > 0 ? 'new' : '—';
    const d = ((br.totalCents - br.prevTotalCents) / br.prevTotalCents) * 100;
    const sign = d >= 0 ? '↑' : '↓';
    return `${sign} ${Math.abs(d).toFixed(1)}%`;
  });

  protected readonly maxTopCount = computed(() =>
    this.topTests().reduce((m, t) => Math.max(m, t.count), 0) || 1,
  );

  protected readonly maxBucket = computed(() =>
    this.revenue().buckets.reduce((m, b) => Math.max(m, b.total), 0) || 1,
  );

  protected readonly totalRupees = computed(() => this.revenue().totalCents / 100);
  protected readonly prevRupees  = computed(() => this.revenue().prevTotalCents / 100);

  protected readonly branchName = computed(() =>
    this.branchStore.activeBranchName() || 'All branches',
  );

  protected readonly periodLabel  = computed(() => PERIOD_LABELS[this.period()]);
  protected readonly periodWindow = computed(() => PERIOD_WINDOWS[this.period()]);
  protected readonly periodShort  = computed(() => {
    const p = this.period();
    return p === 'daily' ? '24h' : p === 'weekly' ? '7d' : '30d';
  });

  protected readonly topTestsWindowLabel = computed(() => {
    const p = this.period();
    return p === 'daily' ? 'last 7 days' : p === 'weekly' ? 'last 30 days' : 'last 90 days';
  });

  protected readonly greeting = computed(() => {
    const hr = new Date().getHours();
    const part = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const email = this.auth.user()?.email ?? '';
    const name = email.split('@')[0] || 'team';
    return `${part}, ${name}`;
  });

  protected readonly syncedAgo = computed(() => {
    this.syncTick();
    const ms = Date.now() - this.lastSyncedAt();
    if (ms < 5_000)   return 'just now';
    if (ms < 60_000)  return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    return `${Math.floor(ms / 3_600_000)}h ago`;
  });

  protected readonly granularityHint = computed(() => {
    const g = this.period();
    if (g === 'daily')   return 'one per day';
    if (g === 'weekly')  return 'Mon-Sun ISO weeks';
    return 'calendar months';
  });

  protected readonly topCategoryLabel = computed(() => {
    const cats = this.revenue().categories;
    if (!cats.length) return '—';
    return `Top: ${cats[0].label} ${(cats[0].share * 100).toFixed(0)}%`;
  });

  protected readonly deltaLabel = computed(() => {
    const d = this.revenue().deltaPct;
    if (d === null) return 'new';
    const sign = d >= 0 ? '↑' : '↓';
    return `${sign} ${Math.abs(d).toFixed(1)}%`;
  });

  protected readonly stackedBars = computed(() => {
    const series = this.revenue();
    const max = this.maxBucket();
    const n   = series.buckets.length;
    if (!n) return [];
    const gap = 2;
    const barWidthVal = Math.max(2, (this.chartWidth - gap * (n - 1)) / n);
    return series.buckets.map((b, i) => {
      const x = i * (barWidthVal + gap);
      let yCursor = this.chartHeight;
      const segments = series.categories.map((c) => {
        const cents = b.byCategory[c.code] ?? 0;
        const h = max ? (cents / max) * this.chartHeight : 0;
        yCursor -= h;
        return {
          code:   c.code,
          label:  c.label,
          color:  c.color,
          rupees: cents / 100,
          y:      yCursor,
          height: h,
        };
      });
      return { key: b.key, label: b.label, x, width: barWidthVal, segments };
    });
  });

  protected readonly gridLines = computed(() => {
    const max = this.maxBucket();
    if (!max) return [];
    const steps = 4;
    return Array.from({ length: steps }, (_, i) => {
      const value = (max * (steps - i) / steps) / 100;
      const y = (i * this.chartHeight) / steps + 8;
      return { y, value };
    });
  });

  protected readonly xLabelStride = computed(() => {
    const n = this.revenue().buckets.length;
    if (n <= 7)  return 1;
    if (n <= 14) return 2;
    if (n <= 30) return 5;
    return Math.ceil(n / 6);
  });

  // ── Revenue donut ────────────────────────────────────────────
  protected readonly revenueDonut = computed(() => this.buildDonut(
    this.revenue().categories.map((c) => ({ code: c.code, label: c.label, color: c.color, value: c.cents })),
  ));

  // ── Volume trend ─────────────────────────────────────────────
  private readonly volumePadX = 4;
  private readonly volumePadY = 12;

  protected readonly volumePoints = computed(() => {
    const rows = this.volume();
    if (!rows.length) return [] as { key: string; label: string; x: number; yOrders: number; yReports: number; orders: number; reports: number }[];
    const max = Math.max(1, ...rows.flatMap((r) => [r.orders, r.reports]));
    const stepX = (this.chartWidth - this.volumePadX * 2) / Math.max(1, rows.length - 1);
    const yScale = (v: number) => this.chartHeight - this.volumePadY - (v / max) * (this.chartHeight - this.volumePadY * 2);
    return rows.map((r, i) => ({
      key: r.key, label: r.label,
      x: this.volumePadX + i * stepX,
      yOrders:  yScale(r.orders),
      yReports: yScale(r.reports),
      orders: r.orders, reports: r.reports,
    }));
  });

  protected readonly orderLine = computed(() =>
    this.volumePoints().map((p) => `${p.x.toFixed(1)},${p.yOrders.toFixed(1)}`).join(' '),
  );

  protected readonly reportsLine = computed(() =>
    this.volumePoints().map((p) => `${p.x.toFixed(1)},${p.yReports.toFixed(1)}`).join(' '),
  );

  protected readonly orderArea = computed(() => {
    const pts = this.volumePoints(); if (!pts.length) return '';
    const baseY = this.chartHeight - this.volumePadY;
    const d = [`M ${pts[0].x.toFixed(1)},${baseY.toFixed(1)}`];
    for (const p of pts) d.push(`L ${p.x.toFixed(1)},${p.yOrders.toFixed(1)}`);
    d.push(`L ${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} Z`);
    return d.join(' ');
  });

  protected readonly reportsArea = computed(() => {
    const pts = this.volumePoints(); if (!pts.length) return '';
    const baseY = this.chartHeight - this.volumePadY;
    const d = [`M ${pts[0].x.toFixed(1)},${baseY.toFixed(1)}`];
    for (const p of pts) d.push(`L ${p.x.toFixed(1)},${p.yReports.toFixed(1)}`);
    d.push(`L ${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} Z`);
    return d.join(' ');
  });

  protected readonly volumeTotal  = computed(() => this.volume().reduce((s, r) => s + r.orders + r.reports, 0));
  protected readonly totalOrders  = computed(() => this.volume().reduce((s, r) => s + r.orders, 0));
  protected readonly totalReports = computed(() => this.volume().reduce((s, r) => s + r.reports, 0));

  // ── Status mix donut ─────────────────────────────────────────
  private readonly STATUS_COLORS = {
    to_collect: '#0E4F8C',
    in_process: '#F59E0B',
    to_verify:  '#00C3FF',
    verified:   '#10B981',
  };

  protected readonly statusLegend = computed(() => {
    const m = this.mix();
    return [
      { code: 'to_collect', label: 'To collect',  count: m.to_collect, color: this.STATUS_COLORS.to_collect },
      { code: 'in_process', label: 'In process',  count: m.in_process, color: this.STATUS_COLORS.in_process },
      { code: 'to_verify',  label: 'To verify',   count: m.to_verify,  color: this.STATUS_COLORS.to_verify  },
      { code: 'verified',   label: 'Verified',    count: m.verified,   color: this.STATUS_COLORS.verified   },
    ];
  });

  protected readonly statusDonut = computed(() => this.buildDonut(
    this.statusLegend().map((s) => ({ code: s.code, label: s.label, color: s.color, value: s.count })),
  ));

  private buildDonut(items: { code: string; label: string; color: string; value: number }[]) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const C = 2 * Math.PI * 40;                       // r = 40 in viewBox 0..100
    let offset = 0;
    return items
      .filter((i) => i.value > 0)
      .map((i) => {
        const share = total > 0 ? i.value / total : 0;
        const len = share * C;
        const slice = {
          code: i.code,
          label: i.label,
          color: i.color,
          count: i.value,
          rupees: i.value / 100,
          share,
          dasharray:  `${len.toFixed(3)} ${(C - len).toFixed(3)}`,
          dashoffset: (-offset).toFixed(3),
        };
        offset += len;
        return slice;
      });
  }

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer:    ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      this.branchStore.activeBranchId();
      void this.reload();
    });
  }

  ngOnInit() {
    void this.reload();
    this.refreshTimer = setInterval(() => { void this.reload(true); }, AUTO_REFRESH_MS);
    this.syncTimer    = setInterval(() => this.syncTick.update((v) => v + 1), SYNC_TICK_MS);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.syncTimer)    clearInterval(this.syncTimer);
  }

  setPeriod(p: DashboardPeriod) {
    if (this.period() === p) return;
    this.period.set(p);
    void this.reload();
  }

  /** Map dashboard period → date window for the doctor-referrals RPC. */
  private doctorReferralRange(period: DashboardPeriod): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now);
    if (period === 'daily')        { /* today */ }
    else if (period === 'weekly')  { from.setDate(now.getDate() - 6); }
    else                            { from.setDate(now.getDate() - 29); }
    return { from: from.toISOString().slice(0, 10), to };
  }

  async reload(silent = false) {
    const branchId = this.branchStore.activeBranchId();
    const period = this.period();
    if (!silent) this.loading.set(true);
    this.error.set(null);
    try {
      const branchPromise: Promise<BranchRevenue> = branchId
        ? Promise.resolve({ rows: [], totalCents: 0, prevTotalCents: 0, topCents: 0, windowStart: '', windowEnd: '' })
        : this.svc.loadRevenueByBranch(period);

      const docRange = this.doctorReferralRange(period);
      const [k, p, h, c, t, r, v, m, br, td] = await Promise.all([
        this.svc.loadKpis(branchId, period),
        this.svc.pendingSamples(branchId),
        this.svc.todaysHomeCollections(branchId),
        this.svc.criticalResults(branchId, this.criticalHoursFor(period)),
        this.svc.topTestsByPeriod(branchId, period),
        this.svc.revenueSeries(branchId, period),
        this.svc.loadVolumeTrend(branchId, period),
        this.svc.loadStatusMix(branchId),
        branchPromise,
        this.payrollSvc.referralsSummary(branchId, docRange.from, docRange.to)
          .then((rows) => rows.slice(0, 5))
          .catch(() => [] as DoctorReferralRow[]),
      ]);
      this.kpis.set(k);
      this.pending.set(p);
      this.homeToday.set(h);
      this.critical.set(c);
      this.topTests.set(t);
      this.revenue.set(r);
      this.volume.set(v);
      this.mix.set(m);
      this.branchRevenue.set(br);
      this.topDoctors.set(td);
      this.lastSyncedAt.set(Date.now());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  private criticalHoursFor(p: DashboardPeriod): number {
    return p === 'daily' ? 24 : p === 'weekly' ? 24 * 7 : 24 * 30;
  }

  /**
   * Export the rendered dashboard (hero, KPI cards, charts, tables) into a
   * multi-page PDF by screenshotting the live DOM. This preserves every visual
   * element — gradients, donut, stacked bars — exactly as seen on screen,
   * instead of rebuilding plain tables in jsPDF.
   */
  async exportDashboardPdf() {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const { jsPDF }: any = await import('jspdf');
      // html2canvas-pro is a maintained fork that handles modern CSS colour
      // functions (oklab / oklch / color()). The classic html2canvas chokes on
      // Tailwind v4's colour palette which uses oklab().
      const html2canvas: any = (await import('html2canvas-pro')).default;

      const host = document.querySelector('app-dashboard-page') as HTMLElement | null;
      if (!host) throw new Error('Dashboard not mounted');

      // Hide the action buttons (Refresh / Export PDF / period toggle) so they
      // don't appear in the captured image.
      const hideTargets = Array.from(host.querySelectorAll<HTMLElement>('button, .no-export'));
      const prevDisplay = hideTargets.map((el) => el.style.display);
      hideTargets.forEach((el) => { el.style.display = 'none'; });

      // Force light backgrounds + suppress lazy effects while capturing
      const canvas: HTMLCanvasElement = await html2canvas(host, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: host.scrollWidth,
        windowHeight: host.scrollHeight,
      });

      // Restore hidden elements
      hideTargets.forEach((el, i) => { el.style.display = prevDisplay[i]; });

      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const pageWidth  = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 0;

      const imgWidth  = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightRemaining = imgHeight;
      let position = 0;

      const fullImg = canvas.toDataURL('image/png');
      // First page
      doc.addImage(fullImg, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightRemaining -= pageHeight;

      // Subsequent pages — offset the same image upward to scroll through it
      while (heightRemaining > 0) {
        position -= pageHeight;
        doc.addPage();
        doc.addImage(fullImg, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightRemaining -= pageHeight;
      }

      // Footer stamp on every page
      const stampDate = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(8);
        doc.text(`Sree Diagnostics · ${this.branchName()} · ${this.periodLabel()}`, 18, pageHeight - 10);
        doc.text(`Page ${i} of ${total}  ·  ${stampDate}`, pageWidth - 18, pageHeight - 10, { align: 'right' });
      }

      const filename = `dashboard-${this.period()}-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (e: any) {
      this.error.set(e?.message ?? 'PDF export failed');
    } finally {
      this.exporting.set(false);
    }
  }

  private sectionHeading(doc: any, text: string, x: number, y: number) {
    doc.setDrawColor(14, 79, 140);
    doc.setFillColor(14, 79, 140);
    doc.rect(x, y - 4, 3, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 27, 45);
    doc.text(text, x + 8, y + 6);
  }

  protected priorityChipCls(p: 'routine' | 'urgent' | 'stat'): string {
    const base = 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-mono font-semibold shrink-0';
    if (p === 'stat')    return `${base} bg-danger-bg text-danger-fg`;
    if (p === 'urgent')  return `${base} bg-warn-bg text-warn-fg`;
    return `${base} bg-surface-subtle text-ink-muted`;
  }

  protected homeStatusChipCls(s: string): string {
    const base = 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium shrink-0 capitalize';
    if (s === 'requested')                          return `${base} bg-info-bg text-info-fg`;
    if (s === 'assigned' || s === 'en_route')       return `${base} bg-warn-bg text-warn-fg`;
    if (s === 'collected')                          return `${base} bg-good-bg text-good-fg`;
    return `${base} bg-surface-subtle text-ink-muted`;
  }

  protected barWidth(count: number): number {
    return Math.max(2, Math.round((count / this.maxTopCount()) * 100));
  }

  private emptySeries(g: DashboardPeriod): RevenueSeries {
    const today = new Date();
    return {
      granularity: g,
      buckets: [],
      categories: [],
      totalCents: 0,
      prevTotalCents: 0,
      deltaPct: 0,
      windowStart: today.toISOString().slice(0, 10),
      windowEnd:   today.toISOString().slice(0, 10),
      fetchedAt:   today.toISOString(),
    };
  }
}
