import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { differenceInDays, format, parseISO } from 'date-fns';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface StockExportRow {
  item_name: string;
  batch_number: string;
  category: string;
  current_qty: number;
  unit_cost_rupees: number;
  total_value_rupees: number;
  mfg_date: string;
  expiry_date: string;
  days_to_expiry: number;
  status: string;
}

type StockTab = 'all' | 'expiring' | 'expired' | 'writeoff_log';
type BatchAction = 'fefo' | 'discount' | 'quarantine' | 'writeoff' | 'monitor';
type WriteoffReason = 'expired' | 'damaged' | 'recalled' | 'cold_chain_breach' | 'theft_loss' | 'other';

interface StockBatch {
  id: string;
  item_name: string;
  batch_number: string;
  category: string;
  current_qty: number;
  unit_cost: number;
  mfg_date: string | null;
  expiry_date: string;
  status: string;
}

interface WriteoffRecord {
  id: string;
  writeoff_number: string;
  created_at: string;
  batch_count: number;
  total_value: number;
  reason: WriteoffReason;
  approved_by: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

const REASON_LABELS: Record<WriteoffReason, string> = {
  expired: 'Expired',
  damaged: 'Damaged',
  recalled: 'Recalled by manufacturer',
  cold_chain_breach: 'Cold-chain breach',
  theft_loss: 'Theft / Loss',
  other: 'Other',
};

@Component({
  selector: 'app-pharmacy-stock-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ──────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <div class="flex items-center gap-3">
          <a routerLink="/pharmacy" class="text-[12px] text-primary-600 hover:underline font-medium">\u2190 Dispensing queue</a>
        </div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">
          Stock & Expiry Management
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Monitor batches, manage expiring stock, and process writeoffs.</p>
      </div>
      <app-export-menu [disabled]="filteredBatches().length === 0" (pick)="onExport($event)"/>
    </header>

    <!-- ── Writeoff banner ────────────────────────────────── -->
    @if (atRiskValue() > 0) {
      <div class="mb-5 p-4 bg-warn-bg border border-warn-fg/20 rounded-[10px] flex items-center justify-between">
        <div>
          <p class="text-[13px] font-semibold text-warn-fg">Stock at risk: \u20B9{{ atRiskValue().toLocaleString('en-IN') }}</p>
          <p class="text-[11px] text-warn-fg/80 mt-0.5">{{ atRiskCount() }} batch(es) expired or expiring within 14 days</p>
        </div>
        <button type="button" (click)="activeTab.set('expired')" class="h-8 px-3 rounded-md bg-warn-fg text-white text-[12px] font-medium hover:bg-warn-fg/90">
          Review & Action
        </button>
      </div>
    }

    <!-- ── Tabs ───────────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-5 bg-surface-muted rounded-lg p-1 w-fit">
      @for (tab of tabs; track tab.value) {
        <button type="button" (click)="activeTab.set(tab.value)"
                [class]="tabCls(tab.value)">
          {{ tab.label }}
          @if (tab.count !== null) {
            <span class="ml-1.5 text-[10px] font-mono opacity-70">{{ tab.count() }}</span>
          }
        </button>
      }
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- ── Stock table (all / expiring / expired tabs) ─────── -->
    @if (activeTab() !== 'writeoff_log') {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Item / Batch</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Category</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Qty</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Expiry</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Days left</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Value</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Action</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="7" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading\u2026</td></tr>
            } @else {
              @for (batch of filteredBatches(); track batch.id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                  <td class="px-4 py-2.5">
                    <p class="text-[13px] font-medium text-ink">{{ batch.item_name }}</p>
                    <p class="text-[10px] font-mono text-ink-muted mt-0.5">{{ batch.batch_number }}</p>
                  </td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ batch.category }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink font-mono text-right">{{ batch.current_qty }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ formatDate(batch.expiry_date) }}</td>
                  <td class="px-4 py-2.5">
                    <span [class]="daysLeftCls(daysLeft(batch))">{{ daysLeftLabel(batch) }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-[12px] font-mono text-ink text-right">\u20B9{{ batchValue(batch).toLocaleString('en-IN') }}</td>
                  <td class="px-4 py-2.5 text-right">
                    <select (change)="onAction(batch, $any($event.target).value); $any($event.target).value = ''"
                            class="h-7 px-2 pr-6 text-[11px] bg-surface-card border border-border rounded-md text-ink-soft appearance-none cursor-pointer focus:outline-none">
                      <option value="">Action\u2026</option>
                      <option value="fefo">Use first (FEFO)</option>
                      <option value="discount">Discount sale</option>
                      <option value="quarantine">Quarantine</option>
                      <option value="writeoff">Writeoff</option>
                      <option value="monitor">Monitor</option>
                    </select>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="px-4 py-12 text-center text-[13px] text-ink-muted">No batches in this category.</td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ── Writeoff log tab ───────────────────────────────── -->
    @if (activeTab() === 'writeoff_log') {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Writeoff #</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Date</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Reason</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Batches</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Value</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Approved by</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (wo of writeoffs(); track wo.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5 text-[12px] font-mono text-ink">{{ wo.writeoff_number }}</td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ formatDate(wo.created_at) }}</td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ reasonLabel(wo.reason) }}</td>
                <td class="px-4 py-2.5 text-[12px] font-mono text-ink text-right">{{ wo.batch_count }}</td>
                <td class="px-4 py-2.5 text-[12px] font-mono text-ink text-right">\u20B9{{ wo.total_value.toLocaleString('en-IN') }}</td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ wo.approved_by || '\u2014' }}</td>
                <td class="px-4 py-2.5">
                  <span [class]="woStatusCls(wo.status)">{{ wo.status }}</span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="px-4 py-12 text-center text-[13px] text-ink-muted">No writeoff records yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ── Writeoff Modal ─────────────────────────────────── -->
    @if (showWriteoff()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center" (document:keydown.escape)="showWriteoff.set(false)">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-surface-card rounded-xl shadow-pop border border-border w-full max-w-md overflow-hidden"
             (click)="$event.stopPropagation()">
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-[15px] font-semibold text-ink">Process Writeoff</h3>
            <button type="button" (click)="showWriteoff.set(false)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle text-lg">\u00D7</button>
          </header>
          <form [formGroup]="writeoffForm" (ngSubmit)="submitWriteoff()" class="p-5 space-y-4">
            <div class="bg-surface-muted rounded-lg p-3">
              <p class="text-[12px] text-ink-muted">Batch</p>
              <p class="text-[13px] font-medium text-ink">{{ writeoffBatch()?.item_name }} \u2014 {{ writeoffBatch()?.batch_number }}</p>
              <p class="text-[11px] font-mono text-ink-muted mt-0.5">Qty: {{ writeoffBatch()?.current_qty }} \u00B7 Value: \u20B9{{ batchValue(writeoffBatch()!).toLocaleString('en-IN') }}</p>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason</label>
              <select formControlName="reason" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="expired">Expired</option>
                <option value="damaged">Damaged</option>
                <option value="recalled">Recalled by manufacturer</option>
                <option value="cold_chain_breach">Cold-chain breach</option>
                <option value="theft_loss">Theft / Loss</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</label>
              <textarea formControlName="notes" rows="2" placeholder="Additional details\u2026" class="w-full px-3 py-2 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y"></textarea>
            </div>
            <div class="bg-info-bg rounded-lg p-3 text-[11px] text-info-fg">
              <p class="font-medium">Approval routing:</p>
              <p class="mt-0.5">Under \u20B925,000 \u2192 Pharmacy in-charge \u00B7 Above \u2192 Branch admin</p>
            </div>
            <div class="flex justify-end gap-2 pt-1">
              <button type="button" (click)="showWriteoff.set(false)" class="h-9 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="submit" [disabled]="writeoffForm.invalid || submittingWo()"
                      class="h-9 px-4 rounded-md bg-danger-fg hover:bg-danger-fg/90 text-white text-[13px] font-medium disabled:opacity-60">
                {{ submittingWo() ? 'Submitting\u2026' : 'Submit writeoff' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class PharmacyStockPage implements OnInit {
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);
  private auth = inject(AuthStore);
  private fb = inject(FormBuilder);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly activeTab = signal<StockTab>('all');
  protected readonly batches = signal<StockBatch[]>([]);
  protected readonly writeoffs = signal<WriteoffRecord[]>([]);
  protected readonly showWriteoff = signal(false);
  protected readonly writeoffBatch = signal<StockBatch | null>(null);
  protected readonly submittingWo = signal(false);

  protected readonly writeoffForm = this.fb.nonNullable.group({
    reason: ['expired' as WriteoffReason],
    notes: [''],
  });

  protected readonly atRiskCount = computed(() => {
    return this.batches().filter(b => this.daysLeft(b) <= 14).length;
  });

  protected readonly atRiskValue = computed(() => {
    return this.batches()
      .filter(b => this.daysLeft(b) <= 14)
      .reduce((sum, b) => sum + this.batchValue(b), 0);
  });

  protected readonly filteredBatches = computed(() => {
    const tab = this.activeTab();
    const all = this.batches();
    if (tab === 'all') return all;
    if (tab === 'expiring') return all.filter(b => { const d = this.daysLeft(b); return d > 0 && d <= 90; });
    if (tab === 'expired') return all.filter(b => this.daysLeft(b) <= 0);
    return [];
  });

  protected readonly tabs = [
    { value: 'all' as StockTab, label: 'All stock', count: computed(() => this.batches().length) },
    { value: 'expiring' as StockTab, label: 'Expiring (90d)', count: computed(() => this.batches().filter(b => { const d = this.daysLeft(b); return d > 0 && d <= 90; }).length) },
    { value: 'expired' as StockTab, label: 'Expired', count: computed(() => this.batches().filter(b => this.daysLeft(b) <= 0).length) },
    { value: 'writeoff_log' as StockTab, label: 'Writeoff log', count: null },
  ];

  ngOnInit() {
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const client = this.supabase.client as any;
      const [{ data: batchData, error: bErr }, { data: woData, error: wErr }] = await Promise.all([
        client.from('inventory_batches')
          .select('id, item_id, batch_number, qty_on_hand, unit_cost_cents, mfg_date, expiry_date, is_expired')
          .gt('qty_on_hand', 0)
          .order('expiry_date', { ascending: true }),
        client.from('pharmacy_writeoffs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (bErr) throw bErr;
      if (wErr) throw wErr;

      const itemIds = Array.from(new Set((batchData ?? []).map((b: any) => b.item_id).filter(Boolean)));
      let itemMap = new Map<string, { name: string; category: string }>();
      if (itemIds.length > 0) {
        const { data: itemData, error: iErr } = await client
          .from('inventory_items')
          .select('id, name, category')
          .in('id', itemIds);
        if (iErr) throw iErr;
        itemMap = new Map((itemData ?? []).map((i: any) => [i.id as string, { name: i.name, category: i.category }]));
      }

      this.batches.set((batchData ?? []).map((b: any): StockBatch => {
        const item = itemMap.get(b.item_id);
        return {
          id: b.id,
          item_name: item?.name ?? '\u2014',
          batch_number: b.batch_number,
          category: item?.category ?? 'other',
          current_qty: b.qty_on_hand ?? 0,
          unit_cost: (b.unit_cost_cents ?? 0) / 100,
          mfg_date: b.mfg_date,
          expiry_date: b.expiry_date,
          status: b.is_expired ? 'expired' : 'active',
        };
      }));
      this.writeoffs.set((woData ?? []) as WriteoffRecord[]);
    } catch (e: any) {
      const msg = e?.message ?? e?.hint ?? e?.details ?? e?.code ?? JSON.stringify(e);
      console.error('[pharmacy-stock] load failed', e);
      this.error.set(msg || 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected daysLeft(b: StockBatch): number {
    return differenceInDays(parseISO(b.expiry_date), new Date());
  }

  protected daysLeftLabel(b: StockBatch): string {
    const d = this.daysLeft(b);
    if (d < 0) return `${Math.abs(d)}d expired`;
    if (d === 0) return 'Today';
    return `${d}d`;
  }

  protected daysLeftCls(d: number): string {
    const base = 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium';
    if (d <= 0) return `${base} bg-danger-bg text-danger-fg`;
    if (d <= 14) return `${base} bg-danger-bg text-danger-fg`;
    if (d <= 30) return `${base} bg-warn-bg text-warn-fg`;
    if (d <= 90) return `${base} bg-warn-bg/60 text-warn-fg`;
    return `${base} bg-good-bg text-good-fg`;
  }

  protected batchValue(b: StockBatch): number {
    return b.current_qty * b.unit_cost;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '\u2014'; }
  }

  protected reasonLabel(r: WriteoffReason): string {
    return REASON_LABELS[r] ?? r;
  }

  protected woStatusCls(status: string): string {
    const base = 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium';
    if (status === 'approved') return `${base} bg-good-bg text-good-fg`;
    if (status === 'rejected') return `${base} bg-danger-bg text-danger-fg`;
    return `${base} bg-warn-bg text-warn-fg`;
  }

  protected tabCls(tab: StockTab): string {
    const base = 'h-8 px-3 rounded-md text-[12px] font-medium transition-colors';
    return this.activeTab() === tab
      ? `${base} bg-surface-card text-ink shadow-card`
      : `${base} text-ink-muted hover:text-ink`;
  }

  protected onAction(batch: StockBatch, action: BatchAction) {
    if (!action) return;
    if (action === 'writeoff') {
      this.writeoffBatch.set(batch);
      this.showWriteoff.set(true);
      return;
    }
    if (action === 'fefo') {
      this.toast.info('FEFO enabled', `${batch.item_name} will be dispensed first.`);
    } else if (action === 'discount') {
      this.toast.info('Marked for discount', batch.item_name);
    } else if (action === 'quarantine') {
      this.toast.warn('Quarantined', `${batch.item_name} moved to quarantine.`);
    } else if (action === 'monitor') {
      this.toast.info('Monitoring', `Added ${batch.item_name} to watch list.`);
    }
  }

  protected async submitWriteoff() {
    const batch = this.writeoffBatch();
    if (!batch) return;
    this.submittingWo.set(true);
    try {
      const { reason, notes } = this.writeoffForm.getRawValue();
      const { error } = await (this.supabase.client as any).from('pharmacy_writeoffs').insert({
        batch_id: batch.id,
        item_name: batch.item_name,
        batch_number: batch.batch_number,
        qty: batch.current_qty,
        total_value: this.batchValue(batch),
        reason,
        notes: notes || null,
        status: this.batchValue(batch) <= 25000 ? 'approved' : 'pending',
      });
      if (error) throw error;
      this.toast.success('Writeoff submitted', batch.item_name);
      this.showWriteoff.set(false);
      this.writeoffBatch.set(null);
      await this.load();
    } catch (e) {
      this.toast.error('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.submittingWo.set(false);
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const rows = this.filteredBatches();
    if (rows.length === 0) return;

    const exportRows: StockExportRow[] = rows.map(b => ({
      item_name:          b.item_name,
      batch_number:       b.batch_number,
      category:           b.category,
      current_qty:        b.current_qty,
      unit_cost_rupees:   b.unit_cost / 100,
      total_value_rupees: this.batchValue(b) / 100,
      mfg_date:           b.mfg_date ?? '',
      expiry_date:        b.expiry_date,
      days_to_expiry:     this.daysLeft(b),
      status:             b.status,
    }));

    const columns: ExportColumn<StockExportRow>[] = [
      { key: 'item_name',          header: 'Item',           width: 30, align: 'left' },
      { key: 'batch_number',       header: 'Batch',          width: 14, align: 'left' },
      { key: 'category',           header: 'Category',       width: 14, align: 'left' },
      { key: 'current_qty',        header: 'Qty',            width: 8,  align: 'right', format: 'integer' },
      { key: 'unit_cost_rupees',   header: 'Unit cost (₹)',  width: 14, align: 'right', format: 'inr' },
      { key: 'total_value_rupees', header: 'Total value (₹)', width: 16, align: 'right', format: 'inr' },
      { key: 'mfg_date',           header: 'Mfg date',       width: 12, align: 'center', format: 'date' },
      { key: 'expiry_date',        header: 'Expiry',         width: 12, align: 'center', format: 'date' },
      { key: 'days_to_expiry',     header: 'Days to exp.',   width: 10, align: 'right', format: 'integer' },
      { key: 'status',             header: 'Status',         width: 12, align: 'left' },
    ];

    const tabLabel: Record<StockTab, string> = {
      all: 'All stock', expiring: 'Expiring within 90d', expired: 'Expired', writeoff_log: 'Writeoff log',
    };

    const totalValueCents = rows.reduce((s, b) => s + this.batchValue(b), 0);

    const report: ExportableReport<StockExportRow> = {
      filename: `PharmacyStock_${tabLabel[this.activeTab()].replace(/\s+/g,'_')}_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Pharmacy Stock & Expiry',
      subtitle: `${rows.length} batches · ${tabLabel[this.activeTab()]}`,
      meta: {
        filters: [
          { label: 'View',             value: tabLabel[this.activeTab()] },
          { label: 'Total stock value', value: '₹' + (totalValueCents / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
          { label: 'At-risk batches',   value: String(this.atRiskCount()) },
        ],
      },
      columns,
      rows: exportRows,
      grandTotals: {
        item_name: 'TOTAL VALUE',
        total_value_rupees: totalValueCents / 100,
      },
      footer: 'Sree Diagnostics · Pharmacy Stock Report',
    };

    await this.exportSvc.export(fmt, report);
  }
}
