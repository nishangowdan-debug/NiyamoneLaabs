import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { BranchStore } from '../../../core/branches/branch.store';
import { AuthStore } from '../../../core/auth/auth.store';
import { RegistersService } from '../data/registers.service';
import { RegistersStore } from '../data/registers.store';
import type { RegisterDefinition, RegisterEntry } from '../data/registers.types';
import { AssetManagerDialogComponent } from '../components/asset-manager-dialog.component';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

@Component({
  selector: 'app-register-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent, AssetManagerDialogComponent, ExportMenuComponent],
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between gap-3 pb-4 border-b border-border">
    <div>
      <div class="text-[11px] uppercase tracking-[0.08em] text-ink-faint mb-1">
        <a routerLink="/registers" class="hover:underline">Registers</a>
      </div>
      <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
        {{ definition()?.label ?? code() }}
      </h1>
      @if (definition()?.description) {
        <p class="text-[13px] text-ink-muted mt-1">{{ definition()?.description }}</p>
      }
    </div>
    <div class="flex items-center gap-2">
      @if (definition()?.uses_meter_asset && canManageAssets()) {
        <button type="button" (click)="openAssetManager()"
                class="h-9 px-3 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle inline-flex items-center gap-1.5"
                title="Add, edit or retire meters/tanks for this register">
          ⚙ Manage assets
        </button>
      }
      <app-export-menu [disabled]="entries().length === 0" (pick)="onExport($event)"/>
      <a [routerLink]="['/registers', code(), 'new']"
         class="h-9 px-3 rounded-md bg-primary-600 text-white text-[13px] font-medium hover:bg-primary-700 inline-flex items-center gap-1.5">
        + New entry
      </a>
    </div>
  </header>

  <app-asset-manager-dialog
    [open]="assetManagerOpen()"
    [definition]="definition() ?? null"
    (closed)="assetManagerOpen.set(false)"
    (changed)="reloadEntries()"/>

  @if (error()) { <app-alert tone="danger">{{ error() }}</app-alert> }

  <div class="rounded-lg border border-border overflow-hidden bg-surface-card">
    <table class="w-full text-[13px]">
      <thead class="bg-bg-muted text-ink-muted">
        <tr>
          <th class="text-left px-3 py-2 font-medium">When</th>
          <th class="text-left px-3 py-2 font-medium">Summary</th>
          @if (definition()?.uses_meter_asset) {
            <th class="text-right px-3 py-2 font-medium">Reading</th>
            <th class="text-right px-3 py-2 font-medium">Consumption</th>
          }
          @if (definition()?.requires_ref_no) {
            <th class="text-left px-3 py-2 font-medium">Ref</th>
          }
          <th class="text-left px-3 py-2 font-medium">Recorded by</th>
          <th class="text-left px-3 py-2 font-medium">Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (e of entries(); track e.id) {
          <tr class="border-t border-border" [class.opacity-50]="e.voided">
            <td class="px-3 py-2 whitespace-nowrap text-ink">{{ formatTs(e.entry_at) }}</td>
            <td class="px-3 py-2 text-ink-muted">{{ summarise(e) }}</td>
            @if (definition()?.uses_meter_asset) {
              <td class="px-3 py-2 text-right font-mono text-ink">{{ readingOf(e) }}</td>
              <td class="px-3 py-2 text-right font-mono text-ink">{{ consumptionOf(e) }}</td>
            }
            @if (definition()?.requires_ref_no) {
              <td class="px-3 py-2 text-ink-muted">{{ e.ref_number ?? '—' }}</td>
            }
            <td class="px-3 py-2 text-ink-muted">{{ shortId(e.recorded_by) }}</td>
            <td class="px-3 py-2">
              @if (e.voided) {
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-danger-bg text-danger-fg">voided</span>
              } @else if (e.verified_at) {
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-good-bg text-good-fg">verified</span>
              } @else {
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-warn-bg text-warn-fg">pending</span>
              }
            </td>
            <td class="px-3 py-2 text-right">
              <a [routerLink]="['/registers', code(), e.id]"
                 class="text-[12px] text-primary-700 hover:underline">Open</a>
            </td>
          </tr>
        } @empty {
          <tr><td [attr.colspan]="colspan()" class="px-3 py-6 text-center text-ink-muted text-[13px]">No entries yet</td></tr>
        }
      </tbody>
    </table>
  </div>
</div>
  `,
})
export class RegisterListPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private regSvc = inject(RegistersService);
  protected store = inject(RegistersStore);
  protected branch = inject(BranchStore);
  private auth = inject(AuthStore);
  private exportSvc = inject(ExportService);

  protected readonly code = signal<string>('');
  protected readonly entries = signal<RegisterEntry[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly assetManagerOpen = signal(false);

  protected readonly canManageAssets = computed(() =>
    this.auth.hasRole('super_admin', 'branch_admin'),
  );

  protected readonly definition = computed<RegisterDefinition | undefined>(() =>
    this.store.byCode(this.code()),
  );

  protected readonly colspan = computed(() => {
    const def = this.definition();
    let n = 5; // when, summary, recorded, status, action
    if (def?.uses_meter_asset) n += 2;
    if (def?.requires_ref_no)  n += 1;
    return n;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((pm) => {
      this.code.set(pm.get('code') ?? '');
      this.error.set(null);
      this.entries.set([]);
    });

    effect(async () => {
      const branchId = this.branch.activeBranchId();
      const code = this.code();
      if (!code) return;
      try {
        await this.store.load();
        const list = await this.regSvc.listEntries(code, { branchId: branchId ?? undefined });
        this.entries.set(list);
      } catch (e: any) {
        this.error.set(e?.message ?? 'Failed to load entries');
      }
    });
  }

  protected openAssetManager(): void {
    if (!this.branch.activeBranchId()) {
      this.error.set('Pick a specific branch first — assets are per-branch.');
      return;
    }
    this.assetManagerOpen.set(true);
  }

  protected async reloadEntries(): Promise<void> {
    const branchId = this.branch.activeBranchId();
    const code = this.code();
    if (!code) return;
    try {
      const list = await this.regSvc.listEntries(code, { branchId: branchId ?? undefined });
      this.entries.set(list);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to reload entries');
    }
  }

  protected formatTs(iso: string): string {
    try { return format(parseISO(iso), 'dd MMM, HH:mm'); }
    catch { return iso; }
  }
  protected shortId(id: string | null): string {
    return id ? id.slice(0, 8) : '—';
  }
  protected readingOf(e: RegisterEntry): string {
    const v = (e.payload as any)?.['reading'];
    return v != null ? String(v) : '—';
  }
  protected consumptionOf(e: RegisterEntry): string {
    const v = e.computed?.consumption;
    return v != null ? Number(v).toFixed(2) : '—';
  }
  protected async onExport(fmt: ExportFormat): Promise<void> {
    const def = this.definition();
    const rows = this.entries();
    if (!def || rows.length === 0) return;

    // Build dynamic columns: fixed leading columns + a column per def.field.
    const baseColumns: ExportColumn<any>[] = [
      { key: 'entry_at',    header: 'Recorded at', width: 18, align: 'center', format: 'datetime' },
      { key: 'shift',       header: 'Shift',       width: 8,  align: 'center' },
      { key: 'status',      header: 'Status',      width: 10, align: 'left' },
      { key: 'ref_number',  header: 'Reference',   width: 18, align: 'left' },
    ];
    const dynamicColumns: ExportColumn<any>[] = def.fields
      .filter(f => f.type !== 'textarea')
      .map(f => ({
        key: 'field_' + f.key,
        header: `${f.label}${f.unit ? ' (' + f.unit + ')' : ''}`,
        width: 16,
        align: (f.type === 'number' || f.type === 'meter_reading') ? 'right' : 'left',
        format: (f.type === 'number' || f.type === 'meter_reading') ? 'number' : undefined,
      } as ExportColumn<any>));
    const trailingColumns: ExportColumn<any>[] = [
      ...(def.uses_meter_asset ? [{ key: 'consumption', header: 'Consumption', width: 14, align: 'right' as const, format: 'number' as const }] : []),
      { key: 'recorded_by', header: 'Recorded by', width: 14, align: 'left' as const },
      { key: 'remarks',     header: 'Remarks',     width: 28, align: 'left' as const },
    ];

    const columns = [...baseColumns, ...dynamicColumns, ...trailingColumns];

    const exportRows = rows.map((e) => {
      const row: Record<string, unknown> = {
        entry_at:    e.entry_at,
        shift:       e.shift ?? '',
        status:      e.voided ? 'voided' : (e.verified_at ? 'verified' : 'pending'),
        ref_number:  e.ref_number ?? '',
        consumption: e.computed?.consumption ?? '',
        recorded_by: e.recorded_by ? e.recorded_by.slice(0, 8) : '',
        remarks:     (e.payload as any)?.remarks ?? '',
      };
      for (const f of def.fields) {
        if (f.type === 'textarea') continue;
        row['field_' + f.key] = (e.payload as any)?.[f.key] ?? '';
      }
      return row;
    });

    const report: ExportableReport<any> = {
      filename: `${def.code}_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: def.label,
      subtitle: def.description ?? `${rows.length} entries`,
      meta: { filters: [{ label: 'Entries', value: String(rows.length) }] },
      columns,
      rows: exportRows,
      footer: `Sree Diagnostics · Register · ${def.code}`,
    };

    await this.exportSvc.export(fmt, report);
  }

  protected summarise(e: RegisterEntry): string {
    const def = this.definition();
    if (!def) return '';
    const parts: string[] = [];
    for (const f of def.fields) {
      if (f.type === 'meter_reading') continue;
      if (f.type === 'textarea') continue;
      const v = (e.payload as any)?.[f.key];
      if (v == null || v === '') continue;
      parts.push(`${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}`);
      if (parts.length >= 3) break;
    }
    return parts.join(' · ');
  }
}
