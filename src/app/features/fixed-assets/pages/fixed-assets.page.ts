import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Briefcase, Plus, Calculator } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { FixedAssetsService, type FixedAsset, type DepreciationRun } from '../data/fixed-assets.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface FaExportRow {
  asset_code: string;
  name: string;
  category: string;
  acquisition_date: string;
  cost_cents: number;
  accumulated_dep_cents: number;
  book_value_cents: number;
  useful_life_months: number;
  method: string;
}

@Component({
  selector: 'app-fixed-assets-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, DecimalPipe, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconBrief" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Fixed Assets &amp; Depreciation</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ assets().length }} active assets · book value: <b>{{ svc.formatINR(totalBookValue()) }}</b>
      </p>
    </div>
    <div class="flex items-center gap-2">
      <app-export-menu [disabled]="assets().length === 0" (pick)="onExport($event)"/>
      @if (canWrite()) {
        <button type="button" (click)="addOpen.set(!addOpen())"
                class="h-9 px-3 rounded-md text-[13px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50 inline-flex items-center gap-1.5">
          <i-lucide [name]="iconPlus" [size]="16"></i-lucide>
          <span>{{ addOpen() ? 'Cancel' : 'Add asset' }}</span>
        </button>
      }
    </div>
  </header>

  @if (addOpen()) {
    <section class="bg-surface-card border border-border rounded-[12px] p-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <input type="text" [(ngModel)]="form.asset_code" placeholder="Code (e.g. ECG-001)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="text" [(ngModel)]="form.name" placeholder="Name"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <select [(ngModel)]="form.category"
                class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="medical_equipment">Medical Equipment</option>
          <option value="furniture">Furniture &amp; Fixtures</option>
          <option value="computers">Computers</option>
          <option value="vehicles">Vehicles</option>
        </select>
        <input type="date" [(ngModel)]="form.acquisition_date"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <input type="number" min="0" [(ngModel)]="form.cost" placeholder="Cost (₹)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="number" min="0" [(ngModel)]="form.salvage" placeholder="Salvage value (₹)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <input type="number" min="1" [(ngModel)]="form.life_months" placeholder="Useful life (months)"
               class="h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        <select [(ngModel)]="form.method"
                class="h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="slm">Straight Line</option>
          <option value="wdv">Written Down Value</option>
        </select>
      </div>
      <button type="button" (click)="addAsset()" [disabled]="busy() || !form.name"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white">
        Save asset
      </button>
    </section>
  }

  <!-- ── Monthly depreciation run (write-only) ── -->
  @if (canWrite()) {
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
      <i-lucide [name]="iconCalc" [size]="16" class="text-primary-600"></i-lucide>
      Monthly depreciation run
    </p>
    <div class="flex flex-wrap gap-3 items-end">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Year</span>
        <input type="number" [(ngModel)]="runYear"
               class="w-[100px] h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Month</span>
        <select [(ngModel)]="runMonth"
                class="w-[120px] h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          @for (m of months; track m.n) { <option [value]="m.n">{{ m.n }} · {{ m.label }}</option> }
        </select>
      </label>
      <button type="button" (click)="run()" [disabled]="busy()"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700">
        Post depreciation
      </button>
    </div>
  </section>
  }

  <!-- ── Runs ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Past runs</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Period</th>
          <th class="text-right px-4 py-2 font-semibold">Assets</th>
          <th class="text-right px-4 py-2 font-semibold">Total depreciation</th>
          <th class="text-left px-4 py-2 font-semibold">Posted</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (r of runs(); track r.id) {
          <tr>
            <td class="px-4 py-2 font-mono">{{ r.period_year }}-{{ r.period_month | number: '2.0' }}</td>
            <td class="px-4 py-2 text-right">{{ r.asset_count }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.total_cents) }}</td>
            <td class="px-4 py-2 text-[11px] text-ink-muted">{{ r.posted_at | date: 'short' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="text-center py-8 text-ink-muted">No runs yet.</td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Asset register ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Asset register</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Code</th>
          <th class="text-left px-4 py-2 font-semibold">Name</th>
          <th class="text-left px-4 py-2 font-semibold">Category</th>
          <th class="text-left px-4 py-2 font-semibold">Acquired</th>
          <th class="text-right px-4 py-2 font-semibold">Cost</th>
          <th class="text-right px-4 py-2 font-semibold">Accum. Dep.</th>
          <th class="text-right px-4 py-2 font-semibold">Book value</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (a of assets(); track a.id) {
          <tr>
            <td class="px-4 py-2 font-mono">{{ a.asset_code }}</td>
            <td class="px-4 py-2">{{ a.name }}</td>
            <td class="px-4 py-2 text-[11px] text-ink-muted">{{ a.category }}</td>
            <td class="px-4 py-2">{{ a.acquisition_date }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(a.cost_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(a.accumulated_dep_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono font-semibold">{{ svc.formatINR(a.cost_cents - a.accumulated_dep_cents) }}</td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="text-center py-8 text-ink-muted">No active assets.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class FixedAssetsPage implements OnInit {
  protected svc = inject(FixedAssetsService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconBrief = Briefcase;
  protected readonly iconPlus  = Plus;
  protected readonly iconCalc  = Calculator;

  protected readonly busy    = signal(false);
  protected readonly assets  = signal<FixedAsset[]>([]);
  protected readonly runs    = signal<DepreciationRun[]>([]);
  protected readonly addOpen = signal(false);
  protected readonly canWrite = computed(() => this.auth.has('ap.write'));

  protected runYear  = new Date().getFullYear();
  protected runMonth = new Date().getMonth() + 1;
  protected readonly months = [
    { n: 1, label: 'Jan' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' }, { n: 4, label: 'Apr' },
    { n: 5, label: 'May' }, { n: 6, label: 'Jun' }, { n: 7, label: 'Jul' }, { n: 8, label: 'Aug' },
    { n: 9, label: 'Sep' }, { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
  ];

  protected form = {
    asset_code: '', name: '', category: 'medical_equipment',
    acquisition_date: new Date().toISOString().slice(0, 10),
    cost: 0, salvage: 0, life_months: 60, method: 'slm' as 'slm' | 'wdv',
  };

  protected readonly totalBookValue = computed(() =>
    this.assets().reduce((s, a) => s + (a.cost_cents - a.accumulated_dep_cents), 0));

  async ngOnInit() {
    const bid = this.branch.activeBranchId();
    const [a, r] = await Promise.all([this.svc.listAssets(bid), this.svc.listRuns(bid)]);
    this.assets.set(a); this.runs.set(r);
  }

  protected async addAsset() {
    const bid = this.branch.activeBranchId(); if (!bid) { this.toast.error('Pick branch'); return; }
    this.busy.set(true);
    try {
      const glCode = ({ medical_equipment: '1210', furniture: '1220', computers: '1230', vehicles: '1240' } as Record<string, string>)[this.form.category] ?? '1210';
      await this.svc.createAsset({
        branch_id: bid,
        asset_code: this.form.asset_code,
        name: this.form.name,
        category: this.form.category,
        gl_asset_code: glCode,
        acquisition_date: this.form.acquisition_date,
        cost_cents: Math.round(this.form.cost * 100),
        salvage_cents: Math.round(this.form.salvage * 100),
        useful_life_months: this.form.life_months,
        method: this.form.method,
        wdv_pct: 15,
        notes: null,
      });
      this.toast.success('Asset added');
      this.addOpen.set(false);
      this.form = { ...this.form, asset_code: '', name: '', cost: 0, salvage: 0 };
      this.assets.set(await this.svc.listAssets(bid));
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async run() {
    const bid = this.branch.activeBranchId(); if (!bid) { this.toast.error('Pick branch'); return; }
    if (!confirm(`Post depreciation for ${this.runYear}-${String(this.runMonth).padStart(2, '0')}?`)) return;
    this.busy.set(true);
    try {
      await this.svc.runDepreciation(bid, this.runYear, this.runMonth, this.auth.staffId());
      this.toast.success('Depreciation posted');
      const [a, r] = await Promise.all([this.svc.listAssets(bid), this.svc.listRuns(bid)]);
      this.assets.set(a); this.runs.set(r);
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.assets();
    if (list.length === 0) return;

    const exportRows: FaExportRow[] = list.map(a => ({
      asset_code:           a.asset_code,
      name:                 a.name,
      category:             a.category,
      acquisition_date:     a.acquisition_date,
      cost_cents:           a.cost_cents,
      accumulated_dep_cents:a.accumulated_dep_cents,
      book_value_cents:     a.cost_cents - a.accumulated_dep_cents,
      useful_life_months:   a.useful_life_months,
      method:               a.method.toUpperCase(),
    }));

    const columns: ExportColumn<FaExportRow>[] = [
      { key: 'asset_code',            header: 'Code',        width: 12, align: 'left' },
      { key: 'name',                  header: 'Asset',       width: 28, align: 'left' },
      { key: 'category',              header: 'Category',    width: 16, align: 'left' },
      { key: 'acquisition_date',      header: 'Acquired',    width: 12, align: 'center', format: 'date' },
      { key: 'cost_cents',            header: 'Cost (₹)',    width: 16, align: 'right', format: 'inr_cents' },
      { key: 'accumulated_dep_cents', header: 'Accum. dep (₹)', width: 18, align: 'right', format: 'inr_cents' },
      { key: 'book_value_cents',      header: 'Book value (₹)', width: 18, align: 'right', format: 'inr_cents' },
      { key: 'useful_life_months',    header: 'Life (mo)',   width: 10, align: 'right', format: 'integer' },
      { key: 'method',                header: 'Method',      width: 8,  align: 'center' },
    ];

    const tot = list.reduce((s, a) => ({
      cost: s.cost + a.cost_cents,
      acc:  s.acc  + a.accumulated_dep_cents,
    }), { cost: 0, acc: 0 });

    const report: ExportableReport<FaExportRow> = {
      filename: `FixedAssets_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Fixed Assets Register',
      subtitle: `${list.length} active asset${list.length === 1 ? '' : 's'}`,
      meta: {
        filters: [
          { label: 'Total book value', value: '₹' + (this.totalBookValue() / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
        ],
      },
      columns,
      rows: exportRows,
      grandTotals: {
        name:                 'TOTAL',
        cost_cents:           tot.cost,
        accumulated_dep_cents:tot.acc,
        book_value_cents:     tot.cost - tot.acc,
      },
      footer: 'Sree Diagnostics · Fixed Assets Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
