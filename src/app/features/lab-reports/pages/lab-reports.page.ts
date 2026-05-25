import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportFormat } from '../../../shared/export/export.types';
import {
  LabReportCatalogService,
  type LabReportDefinition,
  type LabReportStage,
} from '../data/lab-report-catalog.service';

interface ToastMsg { tone: 'good' | 'info' | 'danger'; text: string }

@Component({
  selector: 'app-lab-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, AlertComponent],
  template: `
    <header class="pb-4 mb-5 border-b border-border">
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Lab reports</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        Pick a report, set the date window, choose a format. Operational reports for {{ branchLabel() }}.
      </p>
    </header>

    <section class="bg-surface-card border border-border rounded-[12px] p-5 max-w-3xl">

      <!-- Report selector -->
      <label class="block mb-4">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">
          Report
        </span>
        <select [(ngModel)]="selectedId" name="report"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          @for (stage of stages; track stage) {
            <optgroup [label]="stage">
              @for (r of reportsByStage(stage); track r.id) {
                <option [value]="r.id">{{ r.title }}</option>
              }
            </optgroup>
          }
        </select>
        @if (selected(); as def) {
          <span class="block text-[11px] text-ink-muted mt-1.5">
            {{ def.description }} <span class="text-ink-faint">·</span>
            <span class="font-medium text-ink-soft">{{ def.columns.length }} columns</span>
            @if (!def.requiresDateRange) { <span class="text-ink-faint"> · snapshot, date range ignored</span> }
          </span>
        }
      </label>

      <!-- Date range -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">From</span>
          <input type="date" [(ngModel)]="fromDate" name="from"
                 [disabled]="!requiresRange()"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink disabled:opacity-50 focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">To</span>
          <input type="date" [(ngModel)]="toDate" name="to"
                 [disabled]="!requiresRange()"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink disabled:opacity-50 focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
      </div>

      <!-- Quick range presets -->
      <div class="flex flex-wrap gap-1.5 mb-4">
        @for (p of presets; track p.value) {
          <button type="button" (click)="applyPreset(p.value)"
                  [disabled]="!requiresRange()"
                  class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            {{ p.label }}
          </button>
        }
      </div>

      <!-- Format -->
      <label class="block mb-5">
        <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">
          Export format
        </span>
        <select [(ngModel)]="format" name="format"
                class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          <option value="pdf">PDF</option>
          <option value="csv">CSV</option>
          <option value="excel">Excel (.xlsx)</option>
        </select>
      </label>

      <!-- Export -->
      <button type="button" (click)="run()"
              [disabled]="busy() || !selectedId"
              class="w-full h-11 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[14px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
        @if (busy()) {
          <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          Exporting…
        } @else {
          ↓ Export {{ formatLabel() }}
        }
      </button>

      @if (toast(); as t) {
        <div class="mt-4">
          <app-alert [tone]="t.tone"
                     [title]="t.tone === 'danger' ? 'Export failed' : (t.tone === 'good' ? 'Exported' : 'Notice')">
            {{ t.text }}
          </app-alert>
        </div>
      }
    </section>
  `,
})
export class LabReportsPage implements OnInit {
  private catalog = inject(LabReportCatalogService);
  private exportSvc = inject(ExportService);
  private branchStore = inject(BranchStore);

  protected readonly stages: LabReportStage[] = [
    'Registration', 'Sample collection', 'Home collection',
    'Processing', 'Critical alerts', 'Outsource', 'Reporting',
    'Billing', 'Master data',
  ];

  protected readonly presets = [
    { label: 'Today',     value: 'today' as const },
    { label: '7 days',    value: '7d'    as const },
    { label: 'This month',value: 'mtd'   as const },
    { label: '90 days',   value: '90d'   as const },
  ];

  protected selectedId = '';
  protected format: ExportFormat = 'pdf';
  protected fromDate = '';
  protected toDate = '';

  protected readonly busy = signal(false);
  protected readonly toast = signal<ToastMsg | null>(null);

  protected readonly branchLabel = computed(() => this.branchStore.activeBranchName());
  protected readonly selected = computed<LabReportDefinition | undefined>(() =>
    this.catalog.byId(this.selectedId),
  );
  protected readonly requiresRange = computed(() => this.selected()?.requiresDateRange ?? true);
  protected readonly formatLabel = computed(() => {
    switch (this.format) {
      case 'pdf':   return 'PDF';
      case 'csv':   return 'CSV';
      case 'excel': return 'Excel';
    }
  });

  ngOnInit(): void {
    // Default to the first report (Lab Order Register) and a 7-day window.
    this.selectedId = this.catalog.list()[0]?.id ?? '';
    this.applyPreset('7d');
  }

  protected reportsByStage(stage: LabReportStage): LabReportDefinition[] {
    return this.catalog.list().filter((r) => r.stage === stage);
  }

  protected applyPreset(p: 'today' | '7d' | 'mtd' | '90d'): void {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    let start = new Date(now);
    if (p === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (p === '7d') {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (p === 'mtd') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (p === '90d') {
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
    }
    this.fromDate = start.toISOString().slice(0, 10);
    this.toDate = end.toISOString().slice(0, 10);
  }

  protected async run(): Promise<void> {
    const def = this.selected();
    if (!def) {
      this.toast.set({ tone: 'danger', text: 'Pick a report first.' });
      return;
    }
    if (def.requiresDateRange && (!this.fromDate || !this.toDate)) {
      this.toast.set({ tone: 'danger', text: 'Pick a date range first.' });
      return;
    }

    this.busy.set(true);
    this.toast.set(null);

    try {
      const fromIso = new Date(this.fromDate + 'T00:00:00').toISOString();
      const toIso = new Date(this.toDate + 'T23:59:59.999').toISOString();
      const rows = await this.catalog.run(def.id, {
        branchId: this.branchStore.activeBranchId(),
        from: fromIso,
        to: toIso,
      });

      const branchSlug = (this.branchLabel() || 'all').replace(/\s+/g, '-').toLowerCase();
      const filename = def.requiresDateRange
        ? `${def.id}_${branchSlug}_${this.fromDate}_to_${this.toDate}`
        : `${def.id}_${branchSlug}_${new Date().toISOString().slice(0, 10)}`;
      const subtitle = def.requiresDateRange
        ? `${this.fromDate} → ${this.toDate}`
        : 'Snapshot at ' + new Date().toLocaleString('en-IN');

      const result = await this.exportSvc.export(this.format, {
        filename,
        title: def.title,
        subtitle,
        columns: def.columns as any,
        rows: rows as any,
        meta: {
          periodLabel: def.requiresDateRange ? `${this.fromDate} → ${this.toDate}` : 'Snapshot',
        },
      });

      if (result.ok) {
        this.toast.set({
          tone: 'good',
          text: `${def.title} — ${rows.length} rows exported as ${this.formatLabel()}.`,
        });
      } else {
        this.toast.set({ tone: 'danger', text: result.error ?? 'Export failed.' });
      }
    } catch (e: any) {
      this.toast.set({ tone: 'danger', text: e?.message ?? String(e) });
    } finally {
      this.busy.set(false);
    }
  }
}
