import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Wallet, ArrowRightLeft, Banknote } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { CashierService, type CashierShift, type CashHandover } from '../data/cashier.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface HandoverExportRow {
  declared_at: string;
  declared_cents: number;
  received_cents: number | '';
  variance_cents: number | '';
  status: string;
}

interface Denoms { d500: number; d200: number; d100: number; d50: number; d20: number; d10: number; d5: number; d2: number; d1: number; }

@Component({
  selector: 'app-cashier-shift-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconWallet" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Cashier Shift</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Open / close shift, count cash, hand over to accountant</p>
    </div>
    <app-export-menu [disabled]="handovers().length === 0" (pick)="onExport($event)"/>
  </header>

  @if (loading()) { <div class="text-center py-12 text-ink-muted">Loading…</div> }

  @if (!loading() && !shift()) {
    <!-- ── No open shift: open one ── -->
    <section class="bg-surface-card border border-border rounded-[12px] p-5 max-w-[480px]">
      <p class="text-[14px] font-semibold text-ink mb-3">No active shift</p>
      <p class="text-[12px] text-ink-muted mb-4">Open a shift to start receiving payments. Enter the float cash you start with.</p>
      <label class="block text-[12px] font-medium text-ink-soft mb-1">Opening float (₹)</label>
      <input type="number" min="0" step="100" [(ngModel)]="openingFloat"
             class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card mb-4"/>
      <button type="button" (click)="openShift()" [disabled]="busy() || !canWrite()"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
        Open shift
      </button>
    </section>
  }

  @if (shift(); as s) {
    <!-- ── Active shift ── -->
    <section class="bg-surface-card border border-border rounded-[12px] p-5">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p class="text-[13px] font-semibold text-ink">Shift opened {{ s.opened_at | date: 'short' }}</p>
          <p class="text-[11px] text-ink-muted">Float: {{ svc.formatINR(s.opening_float_cents) }}</p>
        </div>
        <button type="button" (click)="refreshExpected()" [disabled]="busy()"
                class="h-8 px-3 rounded-md text-[12px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
          Refresh expected
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <div class="border border-border rounded-md p-3 bg-surface-muted/30">
          <p class="text-[11px] uppercase text-ink-muted">Cash collected</p>
          <p class="text-[18px] font-semibold text-ink">{{ svc.formatINR(expected().cash) }}</p>
        </div>
        <div class="border border-border rounded-md p-3 bg-surface-muted/30">
          <p class="text-[11px] uppercase text-ink-muted">UPI</p>
          <p class="text-[18px] font-semibold text-ink">{{ svc.formatINR(expected().upi) }}</p>
        </div>
        <div class="border border-border rounded-md p-3 bg-surface-muted/30">
          <p class="text-[11px] uppercase text-ink-muted">Card</p>
          <p class="text-[18px] font-semibold text-ink">{{ svc.formatINR(expected().card) }}</p>
        </div>
        <div class="border border-border rounded-md p-3 bg-surface-muted/30">
          <p class="text-[11px] uppercase text-ink-muted">Other</p>
          <p class="text-[18px] font-semibold text-ink">{{ svc.formatINR(expected().other) }}</p>
        </div>
      </div>

      <!-- Denomination count -->
      <p class="text-[12px] font-semibold text-ink mb-2">Cash denomination count</p>
      <div class="grid grid-cols-3 md:grid-cols-9 gap-2 mb-4">
        @for (d of denomList; track d.key) {
          <label class="block">
            <span class="block text-[11px] text-ink-muted">₹{{ d.value }}</span>
            <input type="number" min="0" [ngModel]="denoms()[d.key]" (ngModelChange)="setDenom(d.key, $event)"
                   class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card text-right"/>
          </label>
        }
      </div>
      <p class="text-[12px] text-ink-soft mb-4">
        Counted cash from denominations: <b>{{ svc.formatINR(denomTotal()) }}</b>
      </p>

      <!-- Counted totals -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <label>
          <span class="block text-[11px] text-ink-muted mb-1">Counted cash (₹)</span>
          <input type="number" min="0" [ngModel]="countedCash() / 100" (ngModelChange)="countedCash.set($event * 100)"
                 class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        </label>
        <label>
          <span class="block text-[11px] text-ink-muted mb-1">Counted UPI (₹)</span>
          <input type="number" min="0" [ngModel]="countedUpi() / 100" (ngModelChange)="countedUpi.set($event * 100)"
                 class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        </label>
        <label>
          <span class="block text-[11px] text-ink-muted mb-1">Counted card (₹)</span>
          <input type="number" min="0" [ngModel]="countedCard() / 100" (ngModelChange)="countedCard.set($event * 100)"
                 class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        </label>
        <label>
          <span class="block text-[11px] text-ink-muted mb-1">Counted other (₹)</span>
          <input type="number" min="0" [ngModel]="countedOther() / 100" (ngModelChange)="countedOther.set($event * 100)"
                 class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
        </label>
      </div>

      <p class="text-[12px] mb-4">
        Variance:
        @if (variance() === 0) {
          <span class="font-semibold text-good-fg">₹0 (matched)</span>
        } @else if (variance() > 0) {
          <span class="font-semibold text-warn-fg">+{{ svc.formatINR(variance()) }} (overage)</span>
        } @else {
          <span class="font-semibold text-danger-fg">{{ svc.formatINR(variance()) }} (short)</span>
        }
      </p>

      <div class="flex gap-2 flex-wrap">
        <button type="button" (click)="closeShift()" [disabled]="busy() || !canWrite()"
                class="h-9 px-4 rounded-md text-[13px] font-semibold border border-warn-border text-warn-fg hover:bg-warn-bg/30 disabled:opacity-50">
          Close shift
        </button>
        <button type="button" (click)="openHandover()" [disabled]="busy() || !countedCash() || !canWrite()"
                class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          <i-lucide [name]="iconRight" [size]="16"></i-lucide>
          <span>Hand over cash</span>
        </button>
      </div>
    </section>
  }

  <!-- ── Recent handovers ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border flex items-center gap-2">
      <i-lucide [name]="iconBank" [size]="18" class="text-primary-600"></i-lucide>
      <p class="text-[13px] font-semibold text-ink">Recent handovers</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Declared at</th>
          <th class="text-right px-4 py-2 font-semibold">Declared</th>
          <th class="text-right px-4 py-2 font-semibold">Received</th>
          <th class="text-right px-4 py-2 font-semibold">Variance</th>
          <th class="text-left px-4 py-2 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (h of handovers(); track h.id) {
          <tr>
            <td class="px-4 py-2">{{ h.declared_at | date: 'short' }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(h.declared_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">
              @if (h.received_cents != null) { {{ svc.formatINR(h.received_cents) }} }
            </td>
            <td class="px-4 py-2 text-right font-mono"
                [class.text-danger-fg]="(h.variance_cents ?? 0) < 0"
                [class.text-warn-fg]="(h.variance_cents ?? 0) > 0">
              @if (h.variance_cents != null) { {{ svc.formatINR(h.variance_cents) }} }
            </td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-warn-bg]="h.status === 'pending'"   [class.text-warn-fg]="h.status === 'pending'"
                    [class.bg-good-bg]="h.status === 'received'"  [class.text-good-fg]="h.status === 'received'"
                    [class.bg-danger-fg/10]="h.status === 'disputed'" [class.text-danger-fg]="h.status === 'disputed'">
                {{ h.status }}
              </span>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="text-center py-8 text-ink-muted">No handovers yet.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class CashierShiftPage implements OnInit {
  protected svc = inject(CashierService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);

  protected readonly iconWallet = Wallet;
  protected readonly iconRight  = ArrowRightLeft;
  protected readonly iconBank   = Banknote;

  protected readonly loading   = signal(true);
  protected readonly busy      = signal(false);
  protected readonly shift     = signal<CashierShift | null>(null);
  protected readonly handovers = signal<CashHandover[]>([]);
  protected readonly expected  = signal<{cash:number;upi:number;card:number;other:number}>({cash:0,upi:0,card:0,other:0});
  protected readonly canWrite  = computed(() => this.auth.has('billing.write'));

  protected openingFloat = 0;
  protected readonly countedCash  = signal(0);
  protected readonly countedUpi   = signal(0);
  protected readonly countedCard  = signal(0);
  protected readonly countedOther = signal(0);
  protected readonly denoms       = signal<Denoms>({d500:0,d200:0,d100:0,d50:0,d20:0,d10:0,d5:0,d2:0,d1:0});

  protected readonly denomList = [
    { key: 'd500' as keyof Denoms, value: 500 }, { key: 'd200' as keyof Denoms, value: 200 },
    { key: 'd100' as keyof Denoms, value: 100 }, { key: 'd50'  as keyof Denoms, value: 50 },
    { key: 'd20'  as keyof Denoms, value: 20 },  { key: 'd10'  as keyof Denoms, value: 10 },
    { key: 'd5'   as keyof Denoms, value: 5 },   { key: 'd2'   as keyof Denoms, value: 2 },
    { key: 'd1'   as keyof Denoms, value: 1 },
  ];

  protected readonly denomTotal = computed(() => {
    const d = this.denoms();
    return (d.d500*500 + d.d200*200 + d.d100*100 + d.d50*50 + d.d20*20 + d.d10*10 + d.d5*5 + d.d2*2 + d.d1*1) * 100;
  });

  protected readonly variance = computed(() => {
    const e = this.expected();
    const totalExpected   = e.cash + e.upi + e.card + e.other + (this.shift()?.opening_float_cents ?? 0);
    const totalCounted    = this.countedCash() + this.countedUpi() + this.countedCard() + this.countedOther();
    return totalCounted - totalExpected;
  });

  protected setDenom(key: keyof Denoms, value: number): void {
    const d = { ...this.denoms() }; d[key] = Math.max(0, Math.floor(value || 0));
    this.denoms.set(d);
    this.countedCash.set(this.denomTotal());
  }

  async ngOnInit() {
    await this.refresh();
  }

  private staffId(): string | null {
    return this.auth.staffId();
  }

  protected async refresh() {
    this.loading.set(true);
    try {
      const sid = this.staffId();
      if (!sid) { this.toast.error('No staff record', 'You are not linked to a staff record.'); return; }
      const s = await this.svc.myOpenShift(sid);
      this.shift.set(s);
      if (s) {
        this.expected.set(await this.svc.expected(s.id));
      }
      this.handovers.set(await this.svc.listHandovers(this.branch.activeBranchId(), undefined));
    } finally { this.loading.set(false); }
  }

  protected async refreshExpected() {
    const s = this.shift(); if (!s) return;
    this.expected.set(await this.svc.expected(s.id));
    // Auto-fill counted with expected as a starting point.
    const e = this.expected();
    this.countedUpi.set(e.upi);
    this.countedCard.set(e.card);
    this.countedOther.set(e.other);
  }

  protected async openShift() {
    const sid = this.staffId(); const bid = this.branch.activeBranchId();
    if (!sid || !bid) { this.toast.error('Cannot open shift', 'Branch or staff missing.'); return; }
    this.busy.set(true);
    try {
      await this.svc.openShift(bid, sid, Math.round((this.openingFloat || 0) * 100));
      this.toast.success('Shift opened');
      await this.refresh();
    } catch (e) { this.toast.error('Open failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async closeShift() {
    const s = this.shift(); if (!s) return;
    this.busy.set(true);
    try {
      const d = this.denoms();
      await this.svc.closeShift({
        shiftId: s.id,
        counted_cash:  this.countedCash(), counted_upi:  this.countedUpi(),
        counted_card:  this.countedCard(), counted_other: this.countedOther(),
        d500: d.d500, d200: d.d200, d100: d.d100, d50: d.d50, d20: d.d20, d10: d.d10, d5: d.d5, d2: d.d2, d1: d.d1,
      });
      this.toast.success('Shift closed');
      await this.refresh();
    } catch (e) { this.toast.error('Close failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async openHandover() {
    const s = this.shift(); if (!s) return;
    if (this.countedCash() <= 0) { this.toast.error('Nothing to hand over'); return; }
    this.busy.set(true);
    try {
      await this.svc.declareHandover(s.id, this.countedCash());
      this.toast.success('Handover declared', 'Accountant will receive the cash.');
      this.handovers.set(await this.svc.listHandovers(this.branch.activeBranchId()));
    } catch (e) { this.toast.error('Handover failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.handovers();
    if (list.length === 0) return;

    const exportRows: HandoverExportRow[] = list.map(h => ({
      declared_at:    h.declared_at,
      declared_cents: h.declared_cents,
      received_cents: h.received_cents ?? '',
      variance_cents: h.variance_cents ?? '',
      status:         h.status,
    }));

    const columns: ExportColumn<HandoverExportRow>[] = [
      { key: 'declared_at',    header: 'Declared at',  width: 18, align: 'center', format: 'datetime' },
      { key: 'declared_cents', header: 'Declared (₹)', width: 16, align: 'right', format: 'inr_cents' },
      { key: 'received_cents', header: 'Received (₹)', width: 16, align: 'right', format: 'inr_cents' },
      { key: 'variance_cents', header: 'Variance (₹)', width: 14, align: 'right', format: 'inr_cents' },
      { key: 'status',         header: 'Status',       width: 12, align: 'left' },
    ];

    const totalDecl = list.reduce((s, h) => s + h.declared_cents, 0);
    const totalRecv = list.reduce((s, h) => s + (h.received_cents ?? 0), 0);

    const report: ExportableReport<HandoverExportRow> = {
      filename: `CashierShift_Handovers_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Cashier Shift · Handover Log',
      subtitle: `${list.length} handover${list.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      grandTotals: {
        declared_cents: totalDecl,
        received_cents: totalRecv,
        variance_cents: totalRecv - totalDecl,
      },
      footer: 'Sree Diagnostics · Cashier Handover Log',
    };

    await this.exportSvc.export(fmt, report);
  }
}
