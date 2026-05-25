import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { PharmacyService } from '../data/pharmacy.service';
import { PharmacyStore } from '../data/pharmacy.store';
import { PharmacyPrintService } from '../services/pharmacy-print.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import type { QueueFilter, RxQueueItem, RxQueueRow } from '../data/pharmacy.types';
import { ageFromDob } from '../../patients/utils/age-from-dob';

@Component({
  selector: 'app-pharmacy-queue-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, RouterLinkActive, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
      <div>
        <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Pharmacy</h1>
        <nav class="mt-2 flex gap-1">
          <a routerLink="/pharmacy" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #qa="routerLinkActive"
             [class]="tabCls(qa.isActive)">📋 Queue</a>
          <a routerLink="/pharmacy/pos" routerLinkActive #pa="routerLinkActive"
             [class]="tabCls(pa.isActive)">🧾 POS / Walk-in</a>
          <a routerLink="/pharmacy/stock" routerLinkActive #sa="routerLinkActive"
             [class]="tabCls(sa.isActive)">📦 Stock</a>
          <a routerLink="/pharmacy/history" routerLinkActive #ha="routerLinkActive"
             [class]="tabCls(ha.isActive)">🧾 History</a>
          <a routerLink="/pharmacy/settings" routerLinkActive #se="routerLinkActive"
             [class]="tabCls(se.isActive)">⚙️ Settings</a>
        </nav>
      </div>
      <p class="text-[11px] text-ink-muted">
        Active Rx · <span class="inline-flex items-center gap-1.5 text-good-fg"><span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime</span>
      </p>
    </header>

    <!-- ── Filter pills (counts) ─────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      @for (f of filterCards(); track f.value) {
        <button type="button"
                (click)="setFilter(f.value)"
                [class]="cardCls(f.value)"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] uppercase tracking-[0.06em] font-semibold">{{ f.label }}</span>
          </div>
          <div class="font-display text-[28px] font-medium tracking-[-0.02em] mt-1.5">{{ f.count }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">{{ f.hint }}</div>
        </button>
      }
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load queue">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Prescription cards ────────────────────────────────── -->
    @if (store.loading() && store.all().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-muted">
        Loading queue…
      </div>
    } @else if (store.visible().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center">
        <p class="text-[13px] text-ink-soft">No prescriptions in this view.</p>
        <p class="text-[11px] text-ink-muted mt-1">When a doctor finalises a consultation, the prescription appears here.</p>
      </div>
    } @else {
      <ul class="flex flex-col gap-3">
        @for (rx of store.visible(); track rx.id) {
          <li class="bg-surface-card border border-border rounded-[10px] overflow-hidden">

            <!-- Rx header -->
            <header class="flex items-start gap-3 px-4 py-3 border-b border-border">
              @if (rx.patient; as p) {
                <div class="size-9 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[12px] shrink-0">
                  {{ patientInitials(p) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <a [routerLink]="['/patients', p.id]" class="font-display text-[15px] font-medium text-ink hover:text-primary-700 truncate">
                      {{ p.full_name || (p.first_name + ' ' + p.last_name) }}
                    </a>
                    @if (rx.patientAllergies.length > 0) {
                      @for (a of rx.patientAllergies; track a) {
                        <span class="inline-flex items-center h-[20px] px-2 rounded-full bg-danger-bg text-danger-strong text-[10px] font-medium">⚠ {{ a }}</span>
                      }
                    }
                  </div>
                  <p class="text-[11px] font-mono text-ink-muted mt-0.5">
                    {{ p.uhid }} · {{ ageGenderLabel(p.date_of_birth, p.gender) }} · {{ p.mobile }}
                  </p>
                </div>
              }
              <div class="text-right text-[11px] text-ink-muted shrink-0">
                <p>Dr <span class="text-ink-soft">{{ rx.doctor?.full_name || '—' }}</span></p>
                <p class="font-mono mt-0.5">{{ relativeTime(rx.prescribed_at) }}</p>
                <p class="font-mono mt-0.5">{{ formatTime(rx.prescribed_at) }}</p>
              </div>
            </header>

            <!-- Items -->
            <ul class="divide-y divide-border">
              @for (item of rx.items; track item.id) {
                <li class="px-4 py-3 flex items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-medium text-ink">
                      {{ item.drug_name }}
                      @if (item.strength) { <span class="text-ink-muted font-normal">· {{ item.strength }}</span> }
                      @if (item.form) { <span class="text-ink-muted font-normal">· {{ item.form }}</span> }
                    </p>
                    <p class="text-[11px] font-mono text-ink-muted mt-0.5">
                      {{ item.dosage || '—' }}
                      @if (item.frequency) { · {{ item.frequency }} }
                      @if (item.duration_days) { · {{ item.duration_days }}d }
                      @if (item.route) { · {{ item.route }} }
                    </p>
                    @if (item.instructions) {
                      <p class="text-[11px] text-ink-soft mt-0.5 italic">{{ item.instructions }}</p>
                    }
                  </div>

                  <div class="text-right shrink-0">
                    <div class="text-[11px] font-mono text-ink-soft">
                      <span class="text-ink-muted">qty</span> {{ item.qty ?? '—' }}
                      @if (item.qty != null) {
                        · <span class="text-ink-muted">remain</span>
                        <span class="text-ink"
                              [class.text-good-fg]="item.fullyDispensed"
                              [class.text-warn-fg]="!item.fullyDispensed && item.dispensedQty > 0">
                          {{ item.remainingQty ?? '—' }}
                        </span>
                      }
                    </div>
                    <div class="text-[10px] text-ink-muted mt-0.5">
                      {{ statusLabel(item) }}
                    </div>
                  </div>

                  @if (canDispense() && !item.fullyDispensed) {
                    <div class="flex items-center gap-1 shrink-0">
                      @if (item.qty == null) {
                        <button type="button" (click)="dispenseFull(rx, item, item.qty ?? 1)" [disabled]="busy() === item.id"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50">
                          Dispense
                        </button>
                      } @else {
                        <button type="button" (click)="dispenseFull(rx, item, item.remainingQty ?? 0)" [disabled]="busy() === item.id"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50">
                          Dispense {{ item.remainingQty }}
                        </button>
                        <button type="button" (click)="openPartial(rx, item)" [disabled]="busy() === item.id"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                          Partial…
                        </button>
                      }
                    </div>
                  }
                </li>
              }
            </ul>

            <!-- Footer summary + billing/complete actions -->
            <footer class="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-muted gap-3 flex-wrap">
              <p class="text-[11px] text-ink-muted">
                {{ rx.totals.fully }}/{{ rx.totals.items }} fully dispensed
                @if (rx.totals.partial > 0) { · {{ rx.totals.partial }} partial }
                @if (rx.totals.pending > 0) { · {{ rx.totals.pending }} pending }
                @if (admissionFor(rx); as adm) {
                  · <span class="text-info-fg font-medium">IP · admitted {{ admittedAgo(adm.admitted_at) }}</span>
                }
              </p>
              <div class="flex items-center gap-2 flex-wrap">
                @if (canDispense()) {
                  @if (admissionFor(rx)) {
                    <button type="button" (click)="dispenseIp(rx)" [disabled]="busy() === rx.id"
                            class="h-7 px-3 rounded-md text-[11px] font-medium text-white shadow-card disabled:opacity-50"
                            style="background:#00C3FF;">
                      🛏 Add to IP &amp; print slip
                    </button>
                  } @else {
                    <button type="button" (click)="billOp(rx)" [disabled]="busy() === rx.id || billedRxIds().has(rx.id)"
                            class="h-7 px-3 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white shadow-card disabled:opacity-50"
                            [title]="billedRxIds().has(rx.id) ? 'Already billed this session' : ''">
                      {{ billedRxIds().has(rx.id) ? '✓ Billed' : '💳 Bill OP & print' }}
                    </button>
                  }
                }
                @if (canDispense() && rx.totals.fully === rx.totals.items && rx.totals.items > 0) {
                  <button type="button" (click)="markCompleted(rx)" [disabled]="busy() === rx.id"
                          class="h-7 px-3 rounded-md text-[11px] font-medium bg-good-fg hover:bg-good-strong text-white disabled:opacity-50">
                    Mark Rx completed
                  </button>
                }
              </div>
            </footer>
          </li>
        }
      </ul>
    }

    <!-- ── Partial-dispense modal ────────────────────────────── -->
    @if (partial(); as p) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30" (document:keydown.escape)="closePartial($event)">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[400px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Partial dispense</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">{{ p.item.drug_name }} · remaining {{ p.item.remainingQty }}</p>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Quantity to dispense
            </span>
            <input type="number" min="1" [max]="p.item.remainingQty ?? 999"
                   [(ngModel)]="partialQty" name="qty" #qtyEl
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Notes (optional)
            </span>
            <input type="text" [(ngModel)]="partialNotes" name="notes"
                   placeholder="Out of stock for remainder"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="partial.set(null)"
                    class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Cancel
            </button>
            <button type="button" (click)="confirmPartial()" [disabled]="busy() === p.item.id"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              Confirm dispense
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PharmacyQueuePage implements OnInit, OnDestroy {
  protected readonly store = inject(PharmacyStore);
  private svc = inject(PharmacyService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private printSvc = inject(PharmacyPrintService);

  protected readonly busy = signal<string | null>(null);
  protected readonly partial = signal<{ rx: RxQueueRow; item: RxQueueItem } | null>(null);
  /** Prescriptions billed in this session — prevent 409 double-submit. */
  protected readonly billedRxIds = signal<Set<string>>(new Set());
  protected partialQty = 1;
  protected partialNotes = '';

  /** patient_id → active admission (lazy-populated when an Rx card renders). */
  protected readonly admissions = signal<Record<string, { id: string; admitted_at: string } | null>>({});

  protected readonly canDispense = computed(() => this.auth.has('pharmacy.write'));

  protected readonly filterCards = computed<{ value: QueueFilter; label: string; count: number; hint: string }[]>(() => {
    const c = this.store.counts();
    return [
      { value: 'pending',   label: 'Pending',     count: c.pending,   hint: 'awaiting dispense' },
      { value: 'partial',   label: 'Partial',     count: c.partial,   hint: 'some items dispensed' },
      { value: 'completed', label: 'Ready',       count: c.completed, hint: 'all items fully dispensed' },
      { value: 'all',       label: 'All active',  count: c.all,       hint: 'every active Rx' },
    ];
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected setFilter(f: QueueFilter) {
    this.store.setFilter(f);
  }

  protected cardCls(value: QueueFilter) {
    const isActive = this.store.filter() === value;
    const base = 'text-left bg-surface-card border rounded-[10px] p-[14px_16px] transition-colors';
    return isActive
      ? `${base} border-primary-600 ring-2 ring-primary-100 text-ink`
      : `${base} border-border text-ink-soft hover:border-border-strong`;
  }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }

  protected statusLabel(item: RxQueueItem): string {
    if (item.fullyDispensed) return 'Fully dispensed';
    if (item.dispensedQty > 0) return `${item.dispensedQty} dispensed so far`;
    return 'Awaiting dispense';
  }

  protected patientInitials(p: { first_name: string; last_name: string }) {
    return ((p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')).toUpperCase() || '–';
  }

  protected ageGenderLabel(dob: string, gender: string) {
    const age = ageFromDob(dob);
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (age === null && !g) return '—';
    if (age === null) return g;
    return `${age}${g}`;
  }

  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
  }

  protected relativeTime(iso: string): string {
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }

  protected async dispenseFull(rx: RxQueueRow, item: RxQueueItem, qty: number) {
    if (qty <= 0) return;
    await this.runDispense(rx, item, qty, 'dispensed');
  }

  protected openPartial(rx: RxQueueRow, item: RxQueueItem) {
    this.partialQty = Math.max(1, Math.floor((item.remainingQty ?? 1) / 2));
    this.partialNotes = '';
    this.partial.set({ rx, item });
  }

  protected closePartial(_event: Event) {
    this.partial.set(null);
  }

  protected async confirmPartial() {
    const ctx = this.partial();
    if (!ctx) return;
    const max = ctx.item.remainingQty ?? Infinity;
    const qty = Math.min(Math.max(1, Math.floor(this.partialQty)), max);
    await this.runDispense(ctx.rx, ctx.item, qty, 'partial', this.partialNotes);
    this.partial.set(null);
  }

  private async runDispense(
    rx: RxQueueRow,
    item: RxQueueItem,
    qty: number,
    status: 'dispensed' | 'partial',
    notes?: string,
  ) {
    const branchId = this.auth.claims().branch_id;
    const staffId = this.auth.staffId();
    if (!branchId || !staffId) {
      this.toast.error('No branch / staff context', 'Sign out and back in.');
      return;
    }
    this.busy.set(item.id);
    try {
      await this.svc.dispense({
        branchId,
        pharmacistStaffId: staffId,
        prescriptionId: rx.id,
        itemId: item.id,
        qty,
        status,
        notes,
      });
      this.toast.success(`Dispensed ${qty}`, item.drug_name);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not dispense', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async markCompleted(rx: RxQueueRow) {
    this.busy.set(rx.id);
    try {
      await this.svc.completePrescription(rx.id);
      this.toast.success('Prescription completed', rx.patient?.full_name ?? '');
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not complete', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── OP / IP billing actions ────────────────────────────────────────
  /** Returns the cached active admission for a row's patient. Triggers a lazy fetch the first time. */
  protected admissionFor(rx: RxQueueRow): { id: string; admitted_at: string } | null {
    const pid = rx.patient?.id;
    if (!pid) return null;
    const cache = this.admissions();
    if (pid in cache) return cache[pid];
    // Lazy probe (first paint of this card). Use a microtask so we don't loop the renderer.
    queueMicrotask(async () => {
      try {
        const adm = await this.svc.findActiveAdmission(pid);
        this.admissions.update(m => ({ ...m, [pid]: adm }));
      } catch {
        this.admissions.update(m => ({ ...m, [pid]: null }));
      }
    });
    return null;
  }

  protected admittedAgo(iso: string): string {
    try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
  }

  /** Build dispense items from the Rx, defaulting to remainingQty for each line.
   *  Uses each item's `instructions` field as a free-text price hint of last resort,
   *  but in practice we map prescription items to the inventory_items unit price.   */
  private buildBillItems(rx: RxQueueRow): { drug_name: string; strength: string | null; qty: number; unit_price_cents: number; prescription_item_id: string }[] {
    return rx.items
      .filter(i => (i.remainingQty ?? i.qty ?? 0) > 0)
      .map(i => ({
        drug_name: i.drug_name,
        strength: i.strength,
        qty: i.remainingQty ?? i.qty ?? 1,
        // TODO once an inventory_items lookup is wired, pull the real default_unit_price_cents.
        // For now use a sensible default (₹10/unit) so the bill is non-zero.
        unit_price_cents: 1000,
        prescription_item_id: i.id,
      }));
  }

  protected async billOp(rx: RxQueueRow) {
    if (!rx.patient) return;
    // Guard: already billed this session — prevents 409 duplicate invoice
    if (this.billedRxIds().has(rx.id)) {
      this.toast.error('Already billed', 'This prescription has already been billed. Reload the queue to confirm.');
      return;
    }
    const items = this.buildBillItems(rx);
    if (items.length === 0) {
      this.toast.error('Nothing to bill', 'All items already fully dispensed.');
      return;
    }
    this.busy.set(rx.id);
    try {
      const res = await this.svc.opDispense({
        patientId: rx.patient.id,
        doctorStaffId: rx.doctor?.id ?? null,
        items,
        notes: rx.notes ?? null,
        prescriptionId: rx.id,
      });
      // Mark as billed so the button can't fire again
      this.billedRxIds.update(s => new Set([...s, rx.id]));
      this.toast.success('OP bill generated', `${res.invoice_number} · ${this.formatINR(res.total_cents)}`);
      void this.printSvc.printOpReceipt(res.invoice_id);
      void this.store.load();
    } catch (e: any) {
      // 23505 = unique_violation (Supabase maps this to HTTP 409)
      // Also catches if the RPC itself raises a 'already billed' / conflict message
      const code = e?.code ?? e?.error?.code ?? '';
      const msg  = e?.message ?? e?.error?.message ?? '';
      const isDuplicate =
        code === '23505' ||
        msg.toLowerCase().includes('conflict') ||
        msg.toLowerCase().includes('unique') ||
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('duplicate');
      if (isDuplicate) {
        this.billedRxIds.update(s => new Set([...s, rx.id]));
        this.toast.error('Already billed', 'An invoice for this prescription already exists. Reload the queue.');
      } else {
        this.toast.error('Could not bill', msg || 'Try again.');
      }
    } finally {
      this.busy.set(null);
    }
  }

  protected async dispenseIp(rx: RxQueueRow) {
    const adm = this.admissionFor(rx);
    if (!adm) return;
    const items = this.buildBillItems(rx);
    if (items.length === 0) {
      this.toast.error('Nothing to dispense', 'All items already fully dispensed.');
      return;
    }
    this.busy.set(rx.id);
    try {
      const res = await this.svc.ipDispense({
        admissionId: adm.id,
        items,
        prescriptionId: rx.id,
      });
      this.toast.success(
        'Added to IP account',
        `${res.items_added} item(s) · ${this.formatINR(res.total_cents)} · billed at discharge`,
      );
      void this.printSvc.printIpSlip(adm.id, items.map(it => ({
        drug_name: it.drug_name, strength: it.strength,
        qty: it.qty, unit_price_cents: it.unit_price_cents,
        total_cents: it.qty * it.unit_price_cents,
      })));
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not add to IP', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  private formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
      .format((cents ?? 0) / 100);
  }
}
