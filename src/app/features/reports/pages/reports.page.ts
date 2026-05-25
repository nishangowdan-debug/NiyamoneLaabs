import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { format } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ReportsStore } from '../data/reports.store';
import {
  ApAgingBucket,
  ExpiryRiskBucket,
  ProcurementSpendRow,
  RevenueRow,
  VendorScorecardRow,
  WINDOW_OPTIONS,
  WindowDays,
  categoryLabel,
} from '../data/reports.types';
import { downloadCsv } from '../utils/csv';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Reports</h1>
        <p class="text-[13px] text-ink-muted mt-1">Cross-cutting analytics — patient flow · revenue · procurement · inventory · AP</p>
      </div>
      <label class="inline-flex items-center gap-2">
        <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Window</span>
        <select [ngModel]="store.window()" (ngModelChange)="onWindowChange($event)" name="window"
                class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                [style.background-image]="chevronUrl" style="background-position: right 8px center;">
          @for (w of windowOptions; track w.value) {
            <option [ngValue]="w.value">{{ w.label }}</option>
          }
        </select>
      </label>
    </header>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load reports">{{ store.error() }}</app-alert>
      </div>
    }

    @if (store.loading() && !store.kpis()) {
      <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[13px] text-ink-muted">Loading reports…</div>
    } @else if (store.kpis(); as k) {

      <!-- ── KPI grid (each card is a drill-down button) ────── -->
      <div class="grid grid-cols-12 gap-[14px] mb-5">
        <button type="button" (click)="goPatients()" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Patients</p>
          <p class="font-display text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">{{ formatNum(k.patients_total) }}</p>
          <p class="text-[10px] text-ink-muted mt-1">Total registered →</p>
        </button>
        <button type="button" (click)="goAppointments()" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Today</p>
          <p class="font-display text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">{{ formatNum(k.appointments_today) }}</p>
          <p class="text-[10px] text-ink-muted mt-1">Appointments →</p>
        </button>
        <button type="button" (click)="goBeds()" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Beds</p>
          <p class="font-display text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">
            <span [class.text-warn-fg]="bedOccupancyPct() >= 85">{{ k.beds_occupied }}</span><span class="text-ink-muted text-[18px]"> / {{ k.beds_total }}</span>
          </p>
          <p class="text-[10px] text-ink-muted mt-1">{{ bedOccupancyPct() }}% occupancy →</p>
        </button>
        <button type="button" (click)="goLab()" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Lab pending</p>
          <p class="font-display text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">{{ formatNum(k.lab_samples_pending) }}</p>
          <p class="text-[10px] text-ink-muted mt-1">Awaiting verification →</p>
        </button>
        <button type="button" (click)="goRevenue()" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Revenue 30d</p>
          <p class="font-display text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">{{ formatINR(k.revenue_30d_cents) }}</p>
          <p class="text-[10px] text-ink-muted mt-1">Today: {{ formatINR(k.revenue_today_cents) }} →</p>
        </button>
        <button type="button" (click)="goAp('open')" [class]="kpiCardCls">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Cash flow</p>
          <p class="font-display text-[18px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">
            <span class="text-good-fg">+{{ formatINR(k.ar_outstanding_cents) }}</span>
          </p>
          <p class="font-display text-[18px] font-medium tracking-[-0.02em] leading-[1.1] mt-0.5">
            <span class="text-danger-fg">−{{ formatINR(k.ap_outstanding_cents) }}</span>
          </p>
          <p class="text-[10px] text-ink-muted mt-1">AR · AP outstanding →</p>
        </button>
      </div>

      <!-- ── Two-column layout for the wider reports ─────────── -->
      <div class="grid grid-cols-12 gap-4 mb-4">

        <!-- AP Aging -->
        <section class="col-span-12 lg:col-span-6 bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <h2 class="text-[13px] font-medium text-ink">AP aging</h2>
              <p class="text-[10px] text-ink-muted">Vendor bills outstanding by due date bucket</p>
            </div>
            @if (store.apAging().length > 0) {
              <button type="button" (click)="exportApAging()" [class]="csvBtnCls" title="Download CSV">CSV</button>
            }
          </header>
          @if (store.apAging().length === 0) {
            <p class="px-4 py-6 text-[12px] text-ink-muted text-center">No outstanding bills.</p>
          } @else {
            <ul class="divide-y divide-border">
              @for (b of store.apAging(); track b.bucket) {
                <li>
                  <button type="button" (click)="goAp(b.sort_order >= 1 ? 'overdue' : 'open')"
                          class="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-muted transition-colors text-left">
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[12px] font-medium" [class]="apBucketCls(b)">{{ b.bucket }}</span>
                        <span class="text-[11px] font-mono text-ink-soft">{{ b.bill_count }} bill{{ b.bill_count === 1 ? '' : 's' }} →</span>
                      </div>
                      <div class="h-2 bg-surface-muted rounded">
                        <div class="h-2 rounded transition-all" [class]="apBarCls(b)"
                             [style.width.%]="pct(b.outstanding_cents, totalApAging())"></div>
                      </div>
                    </div>
                    <span class="text-[12px] font-mono whitespace-nowrap min-w-[100px] text-right" [class]="apBucketCls(b)">{{ formatINR(b.outstanding_cents) }}</span>
                  </button>
                </li>
              }
              <li class="px-4 py-2.5 bg-surface-muted flex items-center justify-between">
                <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Total outstanding</span>
                <span class="text-[14px] font-mono font-semibold text-ink">{{ formatINR(totalApAging()) }}</span>
              </li>
            </ul>
          }
        </section>

        <!-- Inventory expiry risk -->
        <section class="col-span-12 lg:col-span-6 bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <h2 class="text-[13px] font-medium text-ink">Expiry risk</h2>
              <p class="text-[10px] text-ink-muted">Inventory batches with expiry &le; 90 days</p>
            </div>
            @if (store.expiry().length > 0) {
              <button type="button" (click)="exportExpiry()" [class]="csvBtnCls" title="Download CSV">CSV</button>
            }
          </header>
          @if (store.expiry().length === 0) {
            <p class="px-4 py-6 text-[12px] text-ink-muted text-center">No batches at risk in the next 90 days.</p>
          } @else {
            <ul class="divide-y divide-border">
              @for (b of store.expiry(); track b.bucket) {
                <li>
                  <button type="button" (click)="goExpiry()" class="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-muted transition-colors text-left">
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[12px] font-medium" [class]="expiryBucketCls(b)">{{ b.bucket }}</span>
                        <span class="text-[11px] font-mono text-ink-soft">{{ b.batch_count }} batch{{ b.batch_count === 1 ? '' : 'es' }} · {{ formatNum(b.qty_at_risk) }} units →</span>
                      </div>
                      <div class="h-2 bg-surface-muted rounded">
                        <div class="h-2 rounded transition-all" [class]="expiryBarCls(b)"
                             [style.width.%]="pct(b.cost_at_risk_cents, totalExpiry())"></div>
                      </div>
                    </div>
                    <span class="text-[12px] font-mono whitespace-nowrap min-w-[100px] text-right" [class]="expiryBucketCls(b)">{{ formatINR(b.cost_at_risk_cents) }}</span>
                  </button>
                </li>
              }
              <li class="px-4 py-2.5 bg-surface-muted flex items-center justify-between">
                <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">At-risk inventory value</span>
                <span class="text-[14px] font-mono font-semibold text-ink">{{ formatINR(totalExpiry()) }}</span>
              </li>
            </ul>
          }
        </section>

        <!-- Procurement spend -->
        <section class="col-span-12 lg:col-span-6 bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <h2 class="text-[13px] font-medium text-ink">Procurement spend</h2>
              <p class="text-[10px] text-ink-muted">By vendor category · {{ windowLabel() }}</p>
            </div>
            @if (store.procurement().length > 0) {
              <button type="button" (click)="exportProcurement()" [class]="csvBtnCls" title="Download CSV">CSV</button>
            }
          </header>
          @if (store.procurement().length === 0) {
            <p class="px-4 py-6 text-[12px] text-ink-muted text-center">No procurement activity in this window.</p>
          } @else {
            <ul class="divide-y divide-border">
              @for (r of store.procurement(); track r.category) {
                <li>
                  <button type="button" (click)="goPurchase()" class="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-muted transition-colors text-left">
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[12px] text-ink font-medium">{{ categoryLabel(r.category) }}</span>
                        <span class="text-[11px] font-mono text-ink-soft">{{ r.po_count }} PO{{ r.po_count === 1 ? '' : 's' }} →</span>
                      </div>
                      <div class="h-2 bg-surface-muted rounded">
                        <div class="h-2 rounded bg-primary-600 transition-all" [style.width.%]="pct(r.total_cents, totalProcurement())"></div>
                      </div>
                    </div>
                    <span class="text-[12px] font-mono text-ink whitespace-nowrap min-w-[100px] text-right">{{ formatINR(r.total_cents) }}</span>
                  </button>
                </li>
              }
              <li class="px-4 py-2.5 bg-surface-muted flex items-center justify-between">
                <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Total spend</span>
                <span class="text-[14px] font-mono font-semibold text-ink">{{ formatINR(totalProcurement()) }}</span>
              </li>
            </ul>
          }
        </section>

        <!-- Revenue by service category -->
        <section class="col-span-12 lg:col-span-6 bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <h2 class="text-[13px] font-medium text-ink">Revenue mix</h2>
              <p class="text-[10px] text-ink-muted">By service category · {{ windowLabel() }}</p>
            </div>
            @if (store.revenue().length > 0) {
              <button type="button" (click)="exportRevenue()" [class]="csvBtnCls" title="Download CSV">CSV</button>
            }
          </header>
          @if (store.revenue().length === 0) {
            <p class="px-4 py-6 text-[12px] text-ink-muted text-center">No revenue activity in this window.</p>
          } @else {
            <ul class="divide-y divide-border">
              @for (r of store.revenue(); track r.category) {
                <li>
                  <button type="button" (click)="goRevenue()" class="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-muted transition-colors text-left">
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[12px] text-ink font-medium">{{ categoryLabel(r.category) }}</span>
                        <span class="text-[11px] font-mono text-ink-soft">{{ r.invoice_count }} inv · {{ r.line_count }} lines →</span>
                      </div>
                      <div class="h-2 bg-surface-muted rounded">
                        <div class="h-2 rounded bg-good-fg transition-all" [style.width.%]="pct(r.revenue_cents, totalRevenue())"></div>
                      </div>
                    </div>
                    <span class="text-[12px] font-mono text-ink whitespace-nowrap min-w-[100px] text-right">{{ formatINR(r.revenue_cents) }}</span>
                  </button>
                </li>
              }
              <li class="px-4 py-2.5 bg-surface-muted flex items-center justify-between">
                <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Total revenue</span>
                <span class="text-[14px] font-mono font-semibold text-ink">{{ formatINR(totalRevenue()) }}</span>
              </li>
            </ul>
          }
        </section>
      </div>

      <!-- Vendor scorecard -->
      <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <header class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div>
            <h2 class="text-[13px] font-medium text-ink">Vendor scorecard</h2>
            <p class="text-[10px] text-ink-muted">Spend · 3-way match rate · on-time GRN · {{ windowLabel() }}</p>
          </div>
          @if (store.vendors().length > 0) {
            <button type="button" (click)="exportVendors()" [class]="csvBtnCls" title="Download CSV">CSV</button>
          }
        </header>
        @if (store.vendors().length === 0) {
          <p class="px-4 py-6 text-[12px] text-ink-muted text-center">No vendor activity in this window.</p>
        } @else {
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-surface-muted">
                <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">POs</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Spend</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Match rate</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">On-time GRN</th>
              </tr>
            </thead>
            <tbody>
              @for (v of store.vendors(); track v.vendor_id) {
                <tr (click)="goVendors()" class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors cursor-pointer">
                  <td class="px-4 py-2.5">
                    <p class="text-[13px] font-medium text-ink truncate">{{ v.vendor_name }}</p>
                    <p class="text-[10px] font-mono text-ink-muted">{{ v.vendor_code }}</p>
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink-soft">{{ v.po_count }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ formatINR(v.total_spend_cents) }}</td>
                  <td class="px-4 py-2.5 text-right">
                    @if (v.bill_count > 0) {
                      <span class="text-[12px] font-mono" [class]="ratePctCls(matchRate(v))">{{ matchRate(v) }}%</span>
                      <p class="text-[10px] text-ink-muted">{{ v.matched_bill_count }}/{{ v.bill_count }} bills</p>
                    } @else {
                      <span class="text-[11px] text-ink-muted">—</span>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-right">
                    @if (v.total_grn_count > 0) {
                      <span class="text-[12px] font-mono" [class]="ratePctCls(onTimeRate(v))">{{ onTimeRate(v) }}%</span>
                      <p class="text-[10px] text-ink-muted">{{ v.on_time_grn_count }}/{{ v.total_grn_count }} GRNs</p>
                    } @else {
                      <span class="text-[11px] text-ink-muted">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
    }
  `,
})
export class ReportsPage implements OnInit {
  protected readonly store = inject(ReportsStore);
  private router = inject(Router);

  protected readonly windowOptions = WINDOW_OPTIONS;
  protected readonly categoryLabel = categoryLabel;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly kpiCardCls =
    'col-span-6 md:col-span-3 lg:col-span-2 bg-surface-card border border-border rounded-[10px] p-[14px_16px] text-left hover:border-primary-600 hover:shadow-card transition-colors cursor-pointer';
  protected readonly csvBtnCls =
    'h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border text-ink-muted text-[10px] font-medium hover:bg-surface-subtle hover:text-ink';

  protected readonly bedOccupancyPct = computed(() => {
    const k = this.store.kpis();
    if (!k || k.beds_total === 0) return 0;
    return Math.round((k.beds_occupied / k.beds_total) * 100);
  });

  ngOnInit() { void this.store.load(); }

  protected onWindowChange(w: WindowDays) { this.store.setWindow(w); }

  protected windowLabel(): string {
    return WINDOW_OPTIONS.find((o) => o.value === this.store.window())?.label ?? '';
  }

  // ── Totals
  protected totalApAging(): number {
    return this.store.apAging().reduce((s, b) => s + b.outstanding_cents, 0);
  }
  protected totalExpiry(): number {
    return this.store.expiry().reduce((s, b) => s + b.cost_at_risk_cents, 0);
  }
  protected totalProcurement(): number {
    return this.store.procurement().reduce((s, r) => s + r.total_cents, 0);
  }
  protected totalRevenue(): number {
    return this.store.revenue().reduce((s, r) => s + r.revenue_cents, 0);
  }

  // ── Bar / chip styling
  protected pct(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((value / total) * 100));
  }

  protected apBucketCls(b: ApAgingBucket): string {
    if (b.sort_order === 0) return 'text-ink';
    if (b.sort_order === 1) return 'text-warn-fg';
    return 'text-danger-fg';
  }
  protected apBarCls(b: ApAgingBucket): string {
    if (b.sort_order === 0) return 'bg-info-fg';
    if (b.sort_order === 1) return 'bg-warn-fg';
    return 'bg-danger-fg';
  }
  protected expiryBucketCls(b: ExpiryRiskBucket): string {
    if (b.sort_order === 0) return 'text-danger-fg';
    if (b.sort_order === 1) return 'text-warn-fg';
    return 'text-ink-soft';
  }
  protected expiryBarCls(b: ExpiryRiskBucket): string {
    if (b.sort_order === 0) return 'bg-danger-fg';
    if (b.sort_order === 1) return 'bg-warn-fg';
    return 'bg-info-fg';
  }

  protected ratePctCls(rate: number): string {
    if (rate >= 90) return 'text-good-fg';
    if (rate >= 70) return 'text-warn-fg';
    return 'text-danger-fg';
  }

  // ── Derived rates
  protected matchRate(v: VendorScorecardRow): number {
    if (v.bill_count === 0) return 0;
    return Math.round((v.matched_bill_count / v.bill_count) * 100);
  }
  protected onTimeRate(v: VendorScorecardRow): number {
    if (v.total_grn_count === 0) return 0;
    return Math.round((v.on_time_grn_count / v.total_grn_count) * 100);
  }

  // ── Formatters
  protected formatNum(n: number): string {
    return new Intl.NumberFormat('en-IN').format(n);
  }
  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  // For template typing
  protected readonly _refRow!: ProcurementSpendRow;
  protected readonly _refRevenue!: RevenueRow;

  // ── CSV exports ─────────────────────────────────────────────
  private get stamp(): string { return format(new Date(), 'yyyyMMdd-HHmm'); }
  private rupeesCell(cents: number): string { return (cents / 100).toFixed(2); }

  protected exportApAging() {
    downloadCsv(`ap-aging-${this.stamp}`,
      ['Bucket', 'Bills', 'Outstanding (₹)'],
      this.store.apAging().map((b) => [b.bucket, b.bill_count, this.rupeesCell(b.outstanding_cents)]),
    );
  }
  protected exportExpiry() {
    downloadCsv(`expiry-risk-${this.stamp}`,
      ['Bucket', 'Batches', 'Qty at risk', 'Cost at risk (₹)'],
      this.store.expiry().map((b) => [b.bucket, b.batch_count, b.qty_at_risk, this.rupeesCell(b.cost_at_risk_cents)]),
    );
  }
  protected exportProcurement() {
    downloadCsv(`procurement-spend-${this.store.window()}d-${this.stamp}`,
      ['Category', 'POs', 'Spend (₹)'],
      this.store.procurement().map((r) => [categoryLabel(r.category), r.po_count, this.rupeesCell(r.total_cents)]),
    );
  }
  protected exportRevenue() {
    downloadCsv(`revenue-mix-${this.store.window()}d-${this.stamp}`,
      ['Category', 'Invoices', 'Lines', 'Revenue (₹)'],
      this.store.revenue().map((r) => [categoryLabel(r.category), r.invoice_count, r.line_count, this.rupeesCell(r.revenue_cents)]),
    );
  }
  protected exportVendors() {
    downloadCsv(`vendor-scorecard-${this.store.window()}d-${this.stamp}`,
      ['Vendor', 'Code', 'POs', 'Spend (₹)', 'Bills', 'Matched bills', 'Match %', 'On-time GRNs', 'Total GRNs', 'On-time %'],
      this.store.vendors().map((v) => [
        v.vendor_name, v.vendor_code, v.po_count, this.rupeesCell(v.total_spend_cents),
        v.bill_count, v.matched_bill_count, this.matchRate(v),
        v.on_time_grn_count, v.total_grn_count, this.onTimeRate(v),
      ]),
    );
  }

  // ── Drill-downs ─────────────────────────────────────────────
  protected goAp(filter: 'overdue' | 'open')                { this.router.navigate(['/ap'], { queryParams: { filter } }); }
  protected goExpiry()                                       { this.router.navigate(['/inventory']); }
  protected goPurchase()                                     { this.router.navigate(['/purchase']); }
  protected goRevenue()                                      { this.router.navigate(['/billing']); }
  protected goVendors()                                      { this.router.navigate(['/vendors']); }
  protected goAppointments()                                 { this.router.navigate(['/appointments']); }
  protected goBeds()                                         { this.router.navigate(['/ipd-beds']); }
  protected goLab()                                          { this.router.navigate(['/lab']); }
  protected goPatients()                                     { this.router.navigate(['/patients']); }
}
