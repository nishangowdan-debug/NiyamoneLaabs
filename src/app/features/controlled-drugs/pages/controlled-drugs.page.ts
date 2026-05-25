import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ControlledDrugsService } from '../data/controlled-drugs.service';
import {
  CONTROLLED_CLASS_LABELS, CS_ENTRY_LABELS,
  type ControlledClass, type ControlledInventoryRow, type CSEntryType,
  type ReconciliationRow, type RegisterEntry,
} from '../data/controlled-drugs.types';
import { CsRegisterPdfService } from '../services/cs-register-pdf.service';

type Tab = 'catalog' | 'register' | 'movement' | 'reconcile';
type MovementKind = 'receipt' | 'dispense' | 'wastage' | 'return';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Controlled Drugs Register</h1>
    <p class="text-[12px] text-ink-soft">NDPS Act &amp; Drugs &amp; Cosmetics Rules · register entries are immutable</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}
      </button>
    }
  </nav>

  <!-- ── CATALOG ── -->
  @if (tab() === 'catalog') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">Controlled-flagged Items ({{ inventory().length }})</h2>
        <div class="flex items-center gap-2">
          <input [(ngModel)]="markSearch"
                 (input)="onMarkSearch()"
                 placeholder="Search inventory items to mark as controlled…"
                 class="w-72 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
        </div>
      </div>

      @if (markSearch) {
        <div class="px-4 py-2 border-b border-border bg-surface-subtle">
          <p class="text-[11px] text-ink-soft mb-1">Search results — click to set schedule</p>
          @for (it of markSearchResults(); track it.id) {
            <div class="flex items-center justify-between text-[12px] py-1">
              <div>{{ it.name }}
                <span class="text-[10px] text-ink-soft">· current: {{ classLabel(it.controlled_class) }}</span>
              </div>
              <select [ngModel]="it.controlled_class"
                      (ngModelChange)="onClassChange(it.id, $event)"
                      class="rounded border border-border bg-surface px-2 py-1 text-[11px]">
                @for (c of classOptions; track c) {
                  <option [value]="c">{{ classLabel(c) }}</option>
                }
              </select>
            </div>
          }
        </div>
      }

      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Drug</th><th class="px-3 py-2">Schedule</th>
              <th class="px-3 py-2">Batch</th><th class="px-3 py-2">Expiry</th>
              <th class="px-3 py-2 text-right">Balance</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (r of inventory(); track r.item_id + (r.batch_id || '')) {
            <tr class="border-t border-border" [class.bg-warn-fg]="(r.qty_on_hand || 0) <= 0" [class.bg-opacity-5]="true">
              <td class="px-3 py-2">
                <div>{{ r.name }}</div>
                <div class="text-[10px] text-ink-soft">{{ r.generic_name }} {{ r.strengths?.join(', ') }}</div>
              </td>
              <td class="px-3 py-2">{{ classLabel(r.controlled_class) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ r.batch_id ? r.batch_id.slice(0,8) : '—' }}</td>
              <td class="px-3 py-2">{{ r.expiry_date || '—' }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ r.qty_on_hand?.toFixed(3) }}</td>
              <td class="px-3 py-2 text-right">
                @if (r.batch_id) {
                  <button (click)="goRegister(r)" class="text-[11px] text-brand hover:underline">Register</button>
                  <span class="mx-1">·</span>
                  <button (click)="goMovement(r, 'dispense')" class="text-[11px] text-brand hover:underline">Dispense</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- ── REGISTER ── -->
  @if (tab() === 'register') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Item</span>
          <select [ngModel]="selectedItemId()" (ngModelChange)="onItemSelect($event)"
                  class="mt-1 w-72 rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick a controlled item —</option>
            @for (i of controlledItems(); track i.id) {
              <option [ngValue]="i.id">{{ i.name }} ({{ classLabel(i.controlled_class) }})</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Batch</span>
          <select [ngModel]="selectedBatchId()" (ngModelChange)="selectedBatchId.set($event)"
                  class="mt-1 w-56 rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— select batch —</option>
            @for (b of batches(); track b.id) {
              <option [ngValue]="b.id">
                {{ b.id.slice(0,8) }} · exp {{ b.expiry_date || '—' }}
              </option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">From</span>
          <input type="date" [(ngModel)]="fromDate"
                 class="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">To</span>
          <input type="date" [(ngModel)]="toDate"
                 class="mt-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <button (click)="loadRegister()" [disabled]="!selectedItemId() || !selectedBatchId()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">Load</button>
        <button (click)="printRegister()" [disabled]="register().length === 0"
                class="px-3 py-1.5 text-sm rounded-md border border-border disabled:opacity-50">Print PDF</button>
      </div>

      @if (currentBalance() !== null) {
        <p class="text-[12px]">Current balance: <span class="font-bold">{{ currentBalance()?.toFixed(3) }}</span></p>
      }

      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-2 py-1">When</th><th class="px-2 py-1">Type</th>
              <th class="px-2 py-1 text-right">In</th><th class="px-2 py-1 text-right">Out</th>
              <th class="px-2 py-1 text-right">Balance</th><th class="px-2 py-1">Patient</th>
              <th class="px-2 py-1">Witness</th><th class="px-2 py-1">Reason / Notes</th></tr>
        </thead>
        <tbody>
          @for (e of register(); track e.id) {
            <tr class="border-t border-border">
              <td class="px-2 py-1">{{ e.entry_at | date:'short' }}</td>
              <td class="px-2 py-1">{{ entryLabel(e.entry_type) }}</td>
              <td class="px-2 py-1 text-right">{{ e.qty_change > 0 ? e.qty_change.toFixed(3) : '' }}</td>
              <td class="px-2 py-1 text-right">{{ e.qty_change < 0 ? (-e.qty_change).toFixed(3) : '' }}</td>
              <td class="px-2 py-1 text-right font-semibold">{{ e.balance_after.toFixed(3) }}</td>
              <td class="px-2 py-1 font-mono text-[10px]">{{ e.patient_id ? e.patient_id.slice(0,8) : '' }}</td>
              <td class="px-2 py-1">{{ e.witness_name }}</td>
              <td class="px-2 py-1 text-[11px]">{{ e.reason }}{{ e.notes ? ' · ' + e.notes : '' }}</td>
            </tr>
          }
          @if (register().length === 0 && registerLoaded()) {
            <tr><td colspan="8" class="px-2 py-3 text-center text-ink-soft text-[12px]">No entries.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- ── MOVEMENT (Receipt / Dispense / Wastage / Return) ── -->
  @if (tab() === 'movement') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-[12px] font-semibold uppercase text-ink-soft">Action:</span>
        @for (k of movementKinds; track k) {
          <button (click)="movementKind.set(k)"
                  [class.bg-brand]="movementKind() === k"
                  [class.text-white]="movementKind() === k"
                  class="px-3 py-1 text-[12px] rounded-md border border-border">
            {{ k | titlecase }}
          </button>
        }
      </div>

      <div class="grid md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Item</span>
          <select [ngModel]="selectedItemId()" (ngModelChange)="onItemSelect($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick controlled item —</option>
            @for (i of controlledItems(); track i.id) {
              <option [ngValue]="i.id">{{ i.name }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Batch</span>
          <select [ngModel]="selectedBatchId()" (ngModelChange)="selectedBatchId.set($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick batch —</option>
            @for (b of batches(); track b.id) {
              <option [ngValue]="b.id">{{ b.id.slice(0,8) }} · exp {{ b.expiry_date || '—' }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Quantity *</span>
          <input type="number" min="0.001" step="0.001" [(ngModel)]="mvQty"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        @if (movementKind() === 'dispense' || movementKind() === 'return') {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
            <input [(ngModel)]="mvPatientId"
                   placeholder="UUID"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
          </label>
        }

        @if (movementKind() === 'wastage') {
          <label class="md:col-span-2 block">
            <span class="text-[10px] uppercase text-ink-soft">Reason for wastage *</span>
            <input [(ngModel)]="mvReason" placeholder="Spillage / breakage / expired / partial dose"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        }

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Witness Name *</span>
          <input [(ngModel)]="mvWitnessName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Notes</span>
          <input [(ngModel)]="mvNotes"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
      </div>

      @if (mvError()) { <p class="text-[12px] text-danger-fg">{{ mvError() }}</p> }
      @if (mvSuccess()) { <p class="text-[12px] text-good-fg">{{ mvSuccess() }}</p> }

      <div class="flex justify-end">
        <button (click)="submitMovement()" [disabled]="mvBusy() || !mvCanSubmit()"
                class="px-4 py-2 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ mvBusy() ? 'Recording…' : 'Record ' + (movementKind() | titlecase) }}
        </button>
      </div>
    </div>
  }

  <!-- ── RECONCILIATION ── -->
  @if (tab() === 'reconcile') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <h2 class="text-sm font-semibold">Physical Stock Reconciliation</h2>

      <div class="grid md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Item</span>
          <select [ngModel]="selectedItemId()" (ngModelChange)="onItemSelect($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick item —</option>
            @for (i of controlledItems(); track i.id) {
              <option [ngValue]="i.id">{{ i.name }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Batch</span>
          <select [ngModel]="selectedBatchId()" (ngModelChange)="onBatchSelect($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick batch —</option>
            @for (b of batches(); track b.id) {
              <option [ngValue]="b.id">{{ b.id.slice(0,8) }} · exp {{ b.expiry_date || '—' }}</option>
            }
          </select>
        </label>

        @if (currentBalance() !== null) {
          <div class="md:col-span-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-[12px]">
            System balance: <span class="font-bold">{{ currentBalance()?.toFixed(3) }}</span>
          </div>
        }

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Actual Physical Count *</span>
          <input type="number" step="0.001" [(ngModel)]="reconActual"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Witness Name *</span>
          <input [(ngModel)]="reconWitness"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Reason / Notes</span>
          <input [(ngModel)]="reconReason"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
      </div>

      @if (reconResult()) {
        <div class="rounded-md border border-border bg-surface-subtle px-3 py-2 text-[12px]">
          Variance: <span [class.text-danger-fg]="reconResult()!.variance !== 0"
                           [class.text-good-fg]="reconResult()!.variance === 0"
                           class="font-bold">{{ reconResult()!.variance.toFixed(3) }}</span>
          (expected {{ reconResult()!.expected_qty.toFixed(3) }} → actual {{ reconResult()!.actual_qty.toFixed(3) }})
        </div>
      }
      @if (reconError()) { <p class="text-[12px] text-danger-fg">{{ reconError() }}</p> }

      <div class="flex justify-end">
        <button (click)="submitReconciliation()" [disabled]="reconBusy() || !reconCanSubmit()"
                class="px-4 py-2 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ reconBusy() ? 'Saving…' : 'Record Reconciliation' }}
        </button>
      </div>

      <h3 class="text-[12px] font-semibold uppercase text-ink-soft mt-4">Recent Reconciliations</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-2 py-1">When</th><th class="px-2 py-1 text-right">Expected</th>
              <th class="px-2 py-1 text-right">Actual</th><th class="px-2 py-1 text-right">Variance</th>
              <th class="px-2 py-1">Reason</th></tr>
        </thead>
        <tbody>
          @for (r of reconciliations(); track r.id) {
            <tr class="border-t border-border">
              <td class="px-2 py-1">{{ r.performed_at | date:'short' }}</td>
              <td class="px-2 py-1 text-right">{{ r.expected_qty.toFixed(3) }}</td>
              <td class="px-2 py-1 text-right">{{ r.actual_qty.toFixed(3) }}</td>
              <td class="px-2 py-1 text-right" [class.text-danger-fg]="r.variance !== 0"
                  [class.text-good-fg]="r.variance === 0">
                {{ r.variance.toFixed(3) }}
              </td>
              <td class="px-2 py-1">{{ r.reason }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class ControlledDrugsPage implements OnInit {
  private cs = inject(ControlledDrugsService);
  private pdf = inject(CsRegisterPdfService);

  protected tab = signal<Tab>('catalog');
  protected tabs = [
    { id: 'catalog'   as Tab, label: 'Catalog' },
    { id: 'register'  as Tab, label: 'Register' },
    { id: 'movement'  as Tab, label: 'Movement' },
    { id: 'reconcile' as Tab, label: 'Reconciliation' },
  ];

  // Catalog
  protected inventory = signal<ControlledInventoryRow[]>([]);
  protected markSearch = '';
  protected markSearchResults = signal<{ id: string; name: string; controlled_class: ControlledClass; sku: string | null }[]>([]);
  private allItemsCache: { id: string; sku: string | null; name: string; controlled_class: ControlledClass }[] = [];
  protected classOptions: ControlledClass[] = ['none','schedule_h','schedule_h1','schedule_x','ndps_narcotic','ndps_psychotropic'];

  // Filters / selection
  protected selectedItemId = signal<string | null>(null);
  protected selectedBatchId = signal<string | null>(null);
  protected batches = signal<{ id: string; expiry_date: string | null; qty_on_hand: number }[]>([]);
  protected currentBalance = signal<number | null>(null);
  protected controlledItems = computed(() =>
    [...new Map(this.inventory().map(r => [r.item_id, r])).values()]
      .map(r => ({ id: r.item_id, name: r.name, controlled_class: r.controlled_class })),
  );

  // Register
  protected register = signal<RegisterEntry[]>([]);
  protected registerLoaded = signal(false);
  protected fromDate = this.toDateInput(new Date(Date.now() - 30 * 86_400_000));
  protected toDate   = this.toDateInput(new Date());

  // Movement
  protected movementKinds: MovementKind[] = ['receipt','dispense','wastage','return'];
  protected movementKind = signal<MovementKind>('dispense');
  protected mvQty: number | null = null;
  protected mvPatientId = '';
  protected mvWitnessName = '';
  protected mvReason = '';
  protected mvNotes = '';
  protected mvBusy = signal(false);
  protected mvError = signal<string | null>(null);
  protected mvSuccess = signal<string | null>(null);
  protected mvCanSubmit = computed(() => {
    if (!this.selectedItemId() || !this.selectedBatchId() || !this.mvQty || this.mvQty <= 0) return false;
    if (!this.mvWitnessName.trim()) return false;
    if (this.movementKind() === 'dispense' && !this.mvPatientId.trim()) return false;
    if (this.movementKind() === 'wastage' && !this.mvReason.trim()) return false;
    return true;
  });

  // Reconciliation
  protected reconciliations = signal<ReconciliationRow[]>([]);
  protected reconActual: number | null = null;
  protected reconWitness = '';
  protected reconReason = '';
  protected reconBusy = signal(false);
  protected reconError = signal<string | null>(null);
  protected reconResult = signal<{ expected_qty: number; actual_qty: number; variance: number } | null>(null);
  protected reconCanSubmit = computed(() =>
    !!this.selectedItemId() && !!this.selectedBatchId() &&
    this.reconActual !== null && this.reconActual >= 0 &&
    !!this.reconWitness.trim(),
  );

  ngOnInit() { this.refreshCatalog(); }

  protected setTab(t: Tab) { this.tab.set(t); }
  protected classLabel = (c: ControlledClass) => CONTROLLED_CLASS_LABELS[c];
  protected entryLabel = (e: CSEntryType) => CS_ENTRY_LABELS[e];

  private toDateInput(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ── Catalog ────────────────────────────────────────────────
  private async refreshCatalog() {
    try {
      const inv = await this.cs.listInventory();
      this.inventory.set(inv);
    } catch (e: any) { alert(e?.message ?? 'Failed to load catalog'); }
  }

  protected async onMarkSearch() {
    const q = this.markSearch.trim().toLowerCase();
    if (!q) { this.markSearchResults.set([]); return; }
    if (this.allItemsCache.length === 0) {
      try { this.allItemsCache = await this.cs.listAllItems(); }
      catch (e: any) { alert(e?.message ?? 'Failed to load items'); return; }
    }
    this.markSearchResults.set(
      this.allItemsCache
        .filter(it => it.name.toLowerCase().includes(q) || (it.sku ?? '').toLowerCase().includes(q))
        .slice(0, 20),
    );
  }

  protected async onClassChange(itemId: string, cls: ControlledClass) {
    try {
      await this.cs.setControlledClass(itemId, cls);
      // Refresh both: catalog view + cache
      await this.refreshCatalog();
      const item = this.allItemsCache.find(i => i.id === itemId);
      if (item) item.controlled_class = cls;
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async goRegister(r: ControlledInventoryRow) {
    this.tab.set('register');
    this.selectedItemId.set(r.item_id);
    await this.loadBatches();
    this.selectedBatchId.set(r.batch_id);
    await this.loadRegister();
  }

  protected goMovement(r: ControlledInventoryRow, kind: MovementKind) {
    this.tab.set('movement');
    this.movementKind.set(kind);
    this.selectedItemId.set(r.item_id);
    this.selectedBatchId.set(r.batch_id);
    void this.loadBatches();
    void this.refreshBalance();
  }

  // ── Selection ──────────────────────────────────────────────
  protected async onItemSelect(itemId: string | null) {
    this.selectedItemId.set(itemId);
    this.selectedBatchId.set(null);
    this.batches.set([]);
    this.currentBalance.set(null);
    if (itemId) await this.loadBatches();
  }
  protected async onBatchSelect(batchId: string | null) {
    this.selectedBatchId.set(batchId);
    if (this.selectedItemId() && batchId) {
      await this.refreshBalance();
      if (this.tab() === 'reconcile') {
        this.reconciliations.set(await this.cs.listReconciliations(this.selectedItemId()!, batchId));
      }
    }
  }
  private async loadBatches() {
    if (!this.selectedItemId()) return;
    try { this.batches.set(await this.cs.listBatches(this.selectedItemId()!)); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  private async refreshBalance() {
    const i = this.selectedItemId(); const b = this.selectedBatchId();
    if (!i || !b) return;
    try { this.currentBalance.set(await this.cs.getBalance(i, b)); }
    catch { this.currentBalance.set(null); }
  }

  // ── Register ──────────────────────────────────────────────
  protected async loadRegister() {
    const item = this.selectedItemId(); const batch = this.selectedBatchId();
    if (!item || !batch) return;
    try {
      const fromIso = new Date(this.fromDate + 'T00:00:00').toISOString();
      const toIso   = new Date(this.toDate   + 'T23:59:59').toISOString();
      const rows = await this.cs.listRegister({ itemId: item, batchId: batch, fromIso, toIso });
      this.register.set(rows);
      this.registerLoaded.set(true);
      await this.refreshBalance();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async printRegister() {
    const item = this.selectedItemId(); const batch = this.selectedBatchId();
    if (!item || !batch) return;
    const fromIso = new Date(this.fromDate + 'T00:00:00').toISOString();
    const toIso   = new Date(this.toDate   + 'T23:59:59').toISOString();
    await this.pdf.print({ itemId: item, batchId: batch, fromIso, toIso, entries: this.register() });
  }

  // ── Movement ──────────────────────────────────────────────
  protected async submitMovement() {
    if (!this.mvCanSubmit() || this.mvBusy()) return;
    this.mvBusy.set(true); this.mvError.set(null); this.mvSuccess.set(null);
    const item = this.selectedItemId()!; const batch = this.selectedBatchId()!;
    try {
      const kind = this.movementKind();
      const witness = this.mvWitnessName.trim();
      const qty = this.mvQty!;
      const notes = this.mvNotes.trim() || null;
      if (kind === 'receipt') {
        await this.cs.recordReceipt({ itemId: item, batchId: batch, qty, witnessName: witness, notes });
      } else if (kind === 'dispense') {
        await this.cs.recordDispense({
          itemId: item, batchId: batch, qty,
          patientId: this.mvPatientId.trim(),
          witnessName: witness, notes,
        });
      } else if (kind === 'wastage') {
        await this.cs.recordWastage({
          itemId: item, batchId: batch, qty,
          reason: this.mvReason.trim(),
          witnessName: witness, notes,
        });
      } else if (kind === 'return') {
        await this.cs.recordReturn({
          itemId: item, batchId: batch, qty,
          patientId: this.mvPatientId.trim() || null,
          witnessName: witness, notes,
        });
      }
      this.mvSuccess.set(`${kind.toUpperCase()} recorded.`);
      this.mvQty = null; this.mvNotes = ''; this.mvReason = ''; this.mvPatientId = '';
      await this.refreshBalance();
      await this.refreshCatalog();
      setTimeout(() => this.mvSuccess.set(null), 4000);
    } catch (e: any) {
      this.mvError.set(e?.message ?? 'Failed');
    } finally {
      this.mvBusy.set(false);
    }
  }

  // ── Reconciliation ─────────────────────────────────────────
  protected async submitReconciliation() {
    if (!this.reconCanSubmit() || this.reconBusy()) return;
    this.reconBusy.set(true); this.reconError.set(null);
    try {
      const r = await this.cs.reconcile({
        itemId: this.selectedItemId()!, batchId: this.selectedBatchId()!,
        actualQty: this.reconActual!,
        witnessName: this.reconWitness.trim(),
        reason: this.reconReason.trim() || null,
      });
      this.reconResult.set({
        expected_qty: Number(r.expected_qty),
        actual_qty: Number(r.actual_qty),
        variance: Number(r.variance),
      });
      this.reconActual = null; this.reconWitness = ''; this.reconReason = '';
      await this.refreshBalance();
      await this.refreshCatalog();
      this.reconciliations.set(
        await this.cs.listReconciliations(this.selectedItemId()!, this.selectedBatchId()!),
      );
    } catch (e: any) {
      this.reconError.set(e?.message ?? 'Failed');
    } finally {
      this.reconBusy.set(false);
    }
  }
}
