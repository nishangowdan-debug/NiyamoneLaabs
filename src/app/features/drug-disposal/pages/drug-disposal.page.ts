import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrugDisposalService } from '../data/drug-disposal.service';
import {
  METHOD_LABELS, REASON_LABELS, SEVERITY_LABELS,
  type DisposalMethod, type DisposalReason, type DrugDisposal, type DrugRecall,
  type ExpiringInventoryRow, type RecallSeverity,
} from '../data/drug-disposal.types';

type Tab = 'expiring' | 'quarantine' | 'history' | 'recalls';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Drug Disposal &amp; Recalls</h1>
    <p class="text-[12px] text-ink-soft">Schedule M / NDPS-compliant disposal · BMW Rules 2016 · CDSCO recalls</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- EXPIRING -->
  @if (tab() === 'expiring') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex items-center gap-2">
        <h2 class="text-sm font-semibold">Expiring / Expired Stock</h2>
        <span class="text-[11px] text-ink-soft">click "Quarantine" to flag for disposal</span>
      </div>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Drug</th><th class="px-3 py-2">Schedule</th>
              <th class="px-3 py-2">Batch</th><th class="px-3 py-2">Expiry</th>
              <th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Bucket</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (r of expiring(); track r.batch_id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="r.bucket === 'expired'"
                [class.bg-warn-fg]="r.bucket === 'expiring_30d'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2">
                <div>{{ r.name }}</div>
                <div class="text-[10px] text-ink-soft">{{ r.generic_name }}</div>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ r.controlled_class !== 'none' ? r.controlled_class : '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ r.batch_id.slice(0,8) }}</td>
              <td class="px-3 py-2">
                {{ r.expiry_date }}
                <span class="text-[10px] text-ink-soft">({{ r.days_to_expiry < 0 ? -r.days_to_expiry + 'd ago' : r.days_to_expiry + 'd' }})</span>
              </td>
              <td class="px-3 py-2 text-right">{{ r.qty_on_hand.toFixed(3) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-danger-fg]="r.bucket === 'expired'"
                      [class.bg-warn-fg]="r.bucket === 'expiring_30d'"
                      [class.bg-surface-subtle]="r.bucket === 'expiring_90d'"
                      [class.text-white]="r.bucket === 'expired' || r.bucket === 'expiring_30d'">
                  {{ r.bucket.replace('_', ' ') }}
                </span>
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="openQuarantine(r)" class="text-[11px] text-brand hover:underline">Quarantine</button>
              </td>
            </tr>
          }
          @if (expiring().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No items expiring within 90 days.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- QUARANTINE -->
  @if (tab() === 'quarantine') {
    <div class="rounded-md border border-border bg-surface-card">
      <h2 class="px-4 py-3 border-b border-border text-sm font-semibold">Quarantined — pending disposal</h2>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Disposal No</th><th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Reason</th>
              <th class="px-3 py-2">Quarantined</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (d of quarantined(); track d.id) {
            <tr class="border-t border-border" [class.bg-warn-fg]="d.is_controlled" [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ d.disposal_no }}</td>
              <td class="px-3 py-2">
                {{ itemName(d.item_id) }}
                @if (d.is_controlled) {
                  <span class="text-[10px] px-1 ml-1 rounded bg-warn-fg text-white font-bold">CTRL</span>
                }
              </td>
              <td class="px-3 py-2 text-right">{{ d.qty.toFixed(3) }}</td>
              <td class="px-3 py-2">{{ reasonLabel(d.reason) }}</td>
              <td class="px-3 py-2">{{ d.quarantined_at | date:'short' }}</td>
              <td class="px-3 py-2 text-right">
                <button (click)="openComplete(d)" class="text-[11px] text-brand hover:underline">Complete disposal</button>
                <span class="mx-1">·</span>
                <button (click)="cancel(d)" class="text-[11px] text-danger-fg hover:underline">Cancel</button>
              </td>
            </tr>
          }
          @if (quarantined().length === 0) {
            <tr><td colspan="6" class="px-3 py-3 text-center text-ink-soft">No quarantined items.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- HISTORY -->
  @if (tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card">
      <h2 class="px-4 py-3 border-b border-border text-sm font-semibold">Disposal History</h2>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">No</th><th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Reason</th>
              <th class="px-3 py-2">Method</th><th class="px-3 py-2">Witness</th>
              <th class="px-3 py-2">Drug Inspector</th><th class="px-3 py-2">Disposed</th></tr>
        </thead>
        <tbody>
          @for (d of disposed(); track d.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono">{{ d.disposal_no }}</td>
              <td class="px-3 py-2">{{ itemName(d.item_id) }}</td>
              <td class="px-3 py-2 text-right">{{ d.qty.toFixed(3) }}</td>
              <td class="px-3 py-2">{{ reasonLabel(d.reason) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ d.method ? methodLabel(d.method) : '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ d.witness_name }}</td>
              <td class="px-3 py-2 text-[11px]">
                {{ d.drug_inspector_witnessed ? (d.drug_inspector_name + ' #' + d.drug_inspector_id_no) : '—' }}
              </td>
              <td class="px-3 py-2">{{ d.disposed_at | date:'short' }}</td>
            </tr>
          }
          @if (disposed().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No completed disposals.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- RECALLS -->
  @if (tab() === 'recalls') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Log Recall</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Recall No</span>
          <input [(ngModel)]="newRecallNo"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Severity *</span>
          <select [(ngModel)]="newRecallSeverity"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="mandatory">Mandatory</option>
            <option value="voluntary">Voluntary</option>
            <option value="market_withdrawal">Market withdrawal</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Source *</span>
          <select [(ngModel)]="newRecallSource"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="manufacturer">Manufacturer</option>
            <option value="cdsco">CDSCO</option>
            <option value="whodrug">WHO Drug Alert</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Item / Generic Pattern</span>
          <input [(ngModel)]="newRecallGeneric" placeholder="Paracetamol / Ranitidine"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Batch Pattern</span>
          <input [(ngModel)]="newRecallBatch"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reason *</span>
          <textarea rows="2" [(ngModel)]="newRecallReason"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <button (click)="createRecall()" [disabled]="!newRecallReason.trim()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          Log Recall
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Recall Notices</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-2 py-1">Recall No</th><th class="px-2 py-1">Severity</th>
                <th class="px-2 py-1">Source</th><th class="px-2 py-1">Reason</th>
                <th class="px-2 py-1">Received</th><th class="px-2 py-1">Status</th>
                <th class="px-2 py-1 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (r of recalls(); track r.id) {
              <tr class="border-t border-border" [class.bg-danger-fg]="r.severity === 'mandatory' && !r.recall_completed_at" [class.bg-opacity-5]="true">
                <td class="px-2 py-1 font-mono">{{ r.recall_no || '—' }}</td>
                <td class="px-2 py-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-danger-fg]="r.severity === 'mandatory'"
                        [class.bg-warn-fg]="r.severity === 'voluntary'"
                        [class.bg-surface-subtle]="r.severity === 'market_withdrawal'"
                        [class.text-white]="r.severity !== 'market_withdrawal'">
                    {{ severityLabel(r.severity) }}
                  </span>
                </td>
                <td class="px-2 py-1">{{ r.source }}</td>
                <td class="px-2 py-1 text-[11px]">{{ r.recall_reason }}</td>
                <td class="px-2 py-1">{{ r.notice_received_at | date:'mediumDate' }}</td>
                <td class="px-2 py-1">
                  {{ r.recall_completed_at ? 'Completed' : 'Open' }}
                </td>
                <td class="px-2 py-1 text-right">
                  @if (!r.recall_completed_at) {
                    <button (click)="completeRecall(r)" class="text-[11px] text-brand hover:underline">Mark complete</button>
                  }
                </td>
              </tr>
            }
            @if (recalls().length === 0) {
              <tr><td colspan="7" class="px-2 py-3 text-center text-ink-soft">No recalls logged.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }
</section>

<!-- Quarantine modal -->
@if (qRow()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="qRow.set(null)">
    <div class="w-full max-w-md rounded-lg bg-surface-card border border-border shadow-2xl p-4 space-y-2"
         (click)="$event.stopPropagation()">
      <h3 class="text-base font-semibold">Quarantine — {{ qRow()!.name }}</h3>
      <p class="text-[11px] text-ink-soft">Batch {{ qRow()!.batch_id.slice(0,8) }} · expiry {{ qRow()!.expiry_date }} · available {{ qRow()!.qty_on_hand.toFixed(3) }}</p>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Quantity to quarantine *</span>
        <input type="number" step="0.001" [(ngModel)]="qQty"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Reason *</span>
        <select [(ngModel)]="qReason"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (r of reasonOptions; track r) { <option [value]="r">{{ reasonLabel(r) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Details</span>
        <textarea rows="2" [(ngModel)]="qDetails"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      @if (qError()) { <p class="text-[12px] text-danger-fg">{{ qError() }}</p> }
      <div class="flex justify-end gap-2 pt-1">
        <button (click)="qRow.set(null)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="confirmQuarantine()" [disabled]="qBusy() || !qQty"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ qBusy() ? 'Saving…' : 'Quarantine' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Complete-disposal modal -->
@if (cRow()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cRow.set(null)">
    <div class="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl p-4 space-y-2"
         (click)="$event.stopPropagation()">
      <h3 class="text-base font-semibold">Complete Disposal — {{ cRow()!.disposal_no }}</h3>
      @if (cRow()!.is_controlled) {
        <div class="rounded-md border border-warn-fg/40 bg-warn-fg/10 px-3 py-2 text-[12px] text-warn-fg">
          ⚠ Controlled drug. A wastage entry will also be posted to the controlled-drug register.
          Schedule X / NDPS narcotics require Drug Inspector witness.
        </div>
      }
      <div class="grid grid-cols-2 gap-2">
        <label class="block col-span-2">
          <span class="text-[10px] uppercase text-ink-soft">Method *</span>
          <select [(ngModel)]="cMethod"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (m of methodOptions; track m) { <option [value]="m">{{ methodLabel(m) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Witness Name *</span>
          <input [(ngModel)]="cWitness"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Disposed by</span>
          <input [(ngModel)]="cDisposedBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="col-span-2 flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="cInspectorWitnessed" />
          Drug Inspector witnessed
        </label>
        @if (cInspectorWitnessed) {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Inspector Name *</span>
            <input [(ngModel)]="cInspectorName"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Inspector ID No</span>
            <input [(ngModel)]="cInspectorIdNo"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        }
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Vendor</span>
          <select [(ngModel)]="cVendorId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— none —</option>
            @for (v of vendors(); track v.id) { <option [ngValue]="v.id">{{ v.name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Vendor Cert No</span>
          <input [(ngModel)]="cVendorCert"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block col-span-2">
          <span class="text-[10px] uppercase text-ink-soft">Notes</span>
          <textarea rows="2" [(ngModel)]="cNotes"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
      </div>
      @if (cError()) { <p class="text-[12px] text-danger-fg">{{ cError() }}</p> }
      <div class="flex justify-end gap-2 pt-2">
        <button (click)="cRow.set(null)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="confirmComplete()"
                [disabled]="cBusy() || !cWitness.trim() || (cInspectorWitnessed && !cInspectorName.trim())"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ cBusy() ? 'Saving…' : 'Confirm Disposal' }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class DrugDisposalPage implements OnInit {
  private svc = inject(DrugDisposalService);

  protected tab = signal<Tab>('expiring');
  protected tabs = [
    { id: 'expiring'   as Tab, label: 'Expiring',     count: () => this.expiring().length },
    { id: 'quarantine' as Tab, label: 'Quarantined',  count: () => this.quarantined().length },
    { id: 'history'    as Tab, label: 'Disposed',     count: () => this.disposed().length },
    { id: 'recalls'    as Tab, label: 'Recalls',      count: () => this.openRecallCount() },
  ];

  protected expiring = signal<ExpiringInventoryRow[]>([]);
  protected disposals = signal<DrugDisposal[]>([]);
  protected recalls   = signal<DrugRecall[]>([]);
  protected vendors   = signal<{ id: string; name: string }[]>([]);
  private items: { id: string; sku: string | null; name: string; controlled_class: string | null }[] = [];

  protected quarantined = computed(() => this.disposals().filter(d => d.status === 'quarantined'));
  protected disposed    = computed(() => this.disposals().filter(d => d.status === 'disposed'));
  protected openRecallCount = computed(() => this.recalls().filter(r => !r.recall_completed_at).length);

  // Quarantine modal
  protected qRow = signal<ExpiringInventoryRow | null>(null);
  protected qQty: number | null = null;
  protected qReason: DisposalReason = 'expired';
  protected qDetails = '';
  protected qBusy = signal(false);
  protected qError = signal<string | null>(null);

  // Complete modal
  protected cRow = signal<DrugDisposal | null>(null);
  protected cMethod: DisposalMethod = 'authorized_vendor';
  protected cWitness = '';
  protected cDisposedBy = '';
  protected cInspectorWitnessed = false;
  protected cInspectorName = '';
  protected cInspectorIdNo = '';
  protected cVendorId: string | null = null;
  protected cVendorCert = '';
  protected cNotes = '';
  protected cBusy = signal(false);
  protected cError = signal<string | null>(null);

  // Recall form
  protected newRecallNo = '';
  protected newRecallSeverity: RecallSeverity = 'mandatory';
  protected newRecallSource = 'manufacturer';
  protected newRecallGeneric = '';
  protected newRecallBatch = '';
  protected newRecallReason = '';

  protected reasonOptions: DisposalReason[] = ['expired','damaged','recalled','contaminated','wrong_storage','partial_dose','breakage','other'];
  protected methodOptions: DisposalMethod[] = ['authorized_vendor','incineration','return_to_manufacturer','effluent_treatment','pollution_control_incineration','encapsulation','landfill','other'];

  protected reasonLabel = (r: DisposalReason) => REASON_LABELS[r];
  protected methodLabel = (m: DisposalMethod) => METHOD_LABELS[m];
  protected severityLabel = (s: RecallSeverity) => SEVERITY_LABELS[s];
  protected itemName = (id: string) => this.items.find(i => i.id === id)?.name ?? id.slice(0,8);

  ngOnInit() { this.refreshAll(); }

  protected setTab(t: Tab) { this.tab.set(t); }

  private async refreshAll() {
    try {
      const [exp, disposals, recalls, vendors, items] = await Promise.all([
        this.svc.listExpiringInventory(),
        this.svc.listDisposals({}),
        this.svc.listRecalls({}),
        this.svc.listVendors(),
        this.svc.listInventoryItems(),
      ]);
      this.expiring.set(exp);
      this.disposals.set(disposals);
      this.recalls.set(recalls);
      this.vendors.set(vendors);
      this.items = items;
    } catch (e: any) { alert(e?.message ?? 'Failed to load'); }
  }

  // ── Quarantine flow ───────────────────────────────────────────
  protected openQuarantine(r: ExpiringInventoryRow) {
    this.qRow.set(r);
    this.qQty = r.qty_on_hand;
    this.qReason = r.bucket === 'expired' ? 'expired' : 'expired';
    this.qDetails = '';
    this.qError.set(null);
  }
  protected async confirmQuarantine() {
    const row = this.qRow(); if (!row || !this.qQty) return;
    this.qBusy.set(true); this.qError.set(null);
    try {
      await this.svc.quarantine({
        itemId: row.item_id, batchId: row.batch_id, qty: this.qQty,
        reason: this.qReason, reasonDetails: this.qDetails.trim() || null,
      });
      this.qRow.set(null);
      this.qBusy.set(false);
      await this.refreshAll();
    } catch (e: any) {
      this.qError.set(e?.message ?? 'Failed');
      this.qBusy.set(false);
    }
  }

  // ── Complete flow ─────────────────────────────────────────────
  protected openComplete(d: DrugDisposal) {
    this.cRow.set(d);
    this.cMethod = 'authorized_vendor';
    this.cWitness = ''; this.cDisposedBy = '';
    this.cInspectorWitnessed = false; this.cInspectorName = ''; this.cInspectorIdNo = '';
    this.cVendorId = null; this.cVendorCert = ''; this.cNotes = '';
    this.cError.set(null);
  }
  protected async confirmComplete() {
    const d = this.cRow(); if (!d) return;
    this.cBusy.set(true); this.cError.set(null);
    try {
      await this.svc.complete({
        disposalId: d.id,
        method: this.cMethod,
        witnessName: this.cWitness.trim(),
        drugInspectorWitnessed: this.cInspectorWitnessed,
        drugInspectorName: this.cInspectorWitnessed ? this.cInspectorName.trim() : null,
        drugInspectorIdNo: this.cInspectorWitnessed ? this.cInspectorIdNo.trim() || null : null,
        vendorId: this.cVendorId,
        vendorCertificateNo: this.cVendorCert.trim() || null,
        disposedByName: this.cDisposedBy.trim() || null,
        notes: this.cNotes.trim() || null,
      });
      this.cRow.set(null);
      this.cBusy.set(false);
      await this.refreshAll();
    } catch (e: any) {
      this.cError.set(e?.message ?? 'Failed');
      this.cBusy.set(false);
    }
  }

  protected async cancel(d: DrugDisposal) {
    const reason = prompt('Cancellation reason?');
    if (!reason) return;
    try { await this.svc.cancel(d.id, reason); await this.refreshAll(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // ── Recalls ───────────────────────────────────────────────────
  protected async createRecall() {
    if (!this.newRecallReason.trim()) return;
    try {
      await this.svc.createRecall({
        recallNo: this.newRecallNo.trim() || null,
        severity: this.newRecallSeverity,
        source: this.newRecallSource,
        recallReason: this.newRecallReason.trim(),
        genericPattern: this.newRecallGeneric.trim() || null,
        batchPattern: this.newRecallBatch.trim() || null,
      });
      this.newRecallNo = ''; this.newRecallGeneric = ''; this.newRecallBatch = '';
      this.newRecallReason = '';
      this.recalls.set(await this.svc.listRecalls({}));
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async completeRecall(r: DrugRecall) {
    try { await this.svc.completeRecall(r.id); this.recalls.set(await this.svc.listRecalls({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
