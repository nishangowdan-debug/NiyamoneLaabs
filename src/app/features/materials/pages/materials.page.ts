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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { MaterialsService } from '../data/materials.service';
import { MaterialsStore } from '../data/materials.store';
import {
  CONDITION_LABEL,
  GrnDetail,
  GrnDraftLine,
  GrnFilter,
  GrnRow,
  QC_TONE,
  ReceivablePo,
  STATUS_TONE,
} from '../data/materials.types';
import type { GrnCondition, GrnQcStatus } from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-materials-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Material inward</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          Goods receipts · QC · batch capture ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
          </span>
        </p>
      </div>
      @if (canWrite()) {
        <button type="button" (click)="openReceive()" [disabled]="store.totals().receivableCount === 0"
                class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Receive against PO
        </button>
      }
    </header>

    <!-- ── 4 KPI cards ──────────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Today</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().today }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">GRNs received today</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Pending QC</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().pendingQc > 0">{{ store.totals().pendingQc }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Awaiting inspection</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Failed QC</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-danger-fg]="store.totals().failedQc > 0">{{ store.totals().failedQc }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Returned / disputed</p>
      </article>
      <article class="col-span-12 md:col-span-6 lg:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Receivable POs</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().receivableCount }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Sent / partial</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl" placeholder="Search by GRN #, PO #, or vendor…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">{{ f.label }}</button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.totals().total.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load goods receipts">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── GRN table ─────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">GRN #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">PO #</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Received</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">QC</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.grns().length === 0) {
            <tr><td colspan="7" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading goods receipts…</td></tr>
          } @else {
            @for (g of store.visible(); track g.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  [class.opacity-60]="g.status === 'rejected'">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ g.grn_number }}</td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ g.po?.po_number ?? '—' }}</td>
                <td class="px-4 py-2.5">
                  @if (g.po?.vendor; as v) {
                    <p class="text-[13px] font-medium text-ink truncate">{{ v.name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted truncate">{{ v.code }}</p>
                  } @else {
                    <p class="text-[12px] text-ink-muted">—</p>
                  }
                </td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ formatDateTime(g.received_at) }}</td>
                <td class="px-4 py-2.5"><span [class]="qcChipCls(g.qc_status)">{{ QC_TONE[g.qc_status].label }}</span></td>
                <td class="px-4 py-2.5"><span [class]="statusChipCls(g.status)">{{ STATUS_TONE[g.status].label }}</span></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <button type="button" (click)="openDetail(g)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                    View
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No goods receipts match your filters.</p>
                  @if (canWrite() && store.totals().receivableCount > 0) {
                    <button type="button" (click)="openReceive()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Receive against an open PO →
                    </button>
                  } @else if (canWrite()) {
                    <p class="text-[12px] text-ink-muted mt-1">No POs ready to receive — send a PO from the Purchase module first.</p>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Receive modal ─────────────────────────────────────── -->
    @if (receiveOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeReceive()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[860px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Receive against PO</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Pick a sent PO → enter received qty / batch / expiry per line → run QC.</p>

          <!-- PO picker -->
          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Purchase order *</span>
              <select [(ngModel)]="selectedPoId" name="po" (ngModelChange)="onPoPicked()"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">— pick a PO —</option>
                @for (p of store.receivablePos(); track p.id) {
                  <option [value]="p.id">{{ p.po_number }} · {{ p.vendor?.name ?? 'Unknown' }} · {{ p.items.length }} open line{{ p.items.length === 1 ? '' : 's' }}</option>
                }
              </select>
            </label>
          </div>

          <!-- Lines -->
          @if (selectedPo(); as po) {
            <div class="mt-5 border border-border rounded-md overflow-hidden">
              <header class="flex items-center justify-between bg-surface-muted px-3 py-2 border-b border-border">
                <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Lines to receive</p>
                <p class="text-[11px] font-mono text-ink-muted">PO {{ po.po_number }}</p>
              </header>
              <ul class="divide-y divide-border">
                @for (line of draftLines(); track line.id; let idx = $index) {
                  <li class="px-3 py-3">
                    <div class="grid grid-cols-12 gap-2 items-start">
                      <div class="col-span-12 md:col-span-4">
                        <p class="text-[12px] text-ink truncate">{{ line.description }}</p>
                        <p class="text-[10px] text-ink-muted">
                          {{ line.uom }} · open <span class="font-mono">{{ line.qty_open }}</span>
                          @if (!line.inventory_item_id) {
                            <span class="text-warn-fg"> · not linked to inventory item — will skip stock posting</span>
                          }
                        </p>
                      </div>

                      <input type="number" [(ngModel)]="line.qty_received" [name]="'qty-' + idx"
                             min="0" [max]="line.qty_open" step="1"
                             class="col-span-3 md:col-span-1 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Qty" />

                      <input type="text" [(ngModel)]="line.batch_number" [name]="'batch-' + idx"
                             class="col-span-5 md:col-span-2 h-9 px-2 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Batch #" />

                      <input type="date" [(ngModel)]="line.expiry_date" [name]="'exp-' + idx"
                             class="col-span-4 md:col-span-2 h-9 px-2 text-[11px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             title="Expiry date" />

                      <select [(ngModel)]="line.condition" [name]="'cond-' + idx"
                              class="col-span-4 md:col-span-2 h-9 px-2 pr-6 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                              [style.background-image]="chevronUrl" style="background-position: right 6px center;">
                        @for (c of conditionOptions; track c.value) {
                          <option [value]="c.value">{{ c.label }}</option>
                        }
                      </select>

                      <input type="number" [ngModel]="line.unit_cost_cents / 100" (ngModelChange)="line.unit_cost_cents = Math.round($event * 100)"
                             [name]="'cost-' + idx" min="0" step="0.01"
                             class="col-span-4 md:col-span-1 h-9 px-2 text-[11px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                             placeholder="Cost ₹" />
                    </div>
                  </li>
                }
              </ul>
            </div>

            <!-- QC + notes -->
            <div class="grid grid-cols-12 gap-3 mt-5">
              <label class="col-span-12 md:col-span-4 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">QC status</span>
                <select [(ngModel)]="qcStatus" name="qc"
                        class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                        [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                  <option value="pending">Pending QC</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label class="col-span-12 md:col-span-8 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">QC notes</span>
                <input type="text" [(ngModel)]="qcNotes" name="qcnotes"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>

              <label class="col-span-12 block">
                <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">GRN notes</span>
                <input type="text" [(ngModel)]="grnNotes" name="grnnotes"
                       class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>
          } @else {
            <p class="text-[12px] text-ink-muted text-center py-8">Pick a PO to load its open lines.</p>
          }

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeReceive()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmReceive()" [disabled]="!canSubmitReceive() || busy() === 'form'"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() === 'form' ? 'Posting…' : 'Post GRN' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Detail modal ──────────────────────────────────────── -->
    @if (detail(); as d) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeDetail()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[760px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-[18px] font-medium text-ink">{{ d.grn_number }}</h2>
              <p class="text-[12px] text-ink-muted mt-0.5">
                Received {{ formatDateTime(d.received_at) }}
                @if (d.received_by) { · by {{ d.received_by.full_name }} }
              </p>
              @if (d.po; as p) {
                <p class="text-[13px] text-ink mt-1">
                  PO <span class="font-mono">{{ p.po_number }}</span>
                  @if (p.vendor; as v) { · {{ v.name }} <span class="font-mono text-ink-muted text-[11px]">· {{ v.code }}</span> }
                </p>
              }
            </div>
            <div class="flex flex-col items-end gap-1">
              <span [class]="statusChipCls(d.status)">{{ STATUS_TONE[d.status].label }}</span>
              <span [class]="qcChipCls(d.qc_status)">{{ QC_TONE[d.qc_status].label }}</span>
            </div>
          </header>

          <!-- Items -->
          <ul class="mt-4 border border-border rounded-md overflow-hidden">
            <li class="px-3 py-1.5 bg-surface-muted text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold grid grid-cols-12 gap-2">
              <span class="col-span-4">Item</span>
              <span class="col-span-2">Batch</span>
              <span class="col-span-2">Expiry</span>
              <span class="col-span-1 text-right">Qty</span>
              <span class="col-span-1 text-right">Cost</span>
              <span class="col-span-2">Condition</span>
            </li>
            @for (it of d.items; track it.id) {
              <li class="px-3 py-2 grid grid-cols-12 gap-2 border-t border-border text-[12px]">
                <div class="col-span-4">
                  <p class="text-ink truncate">{{ it.description }}</p>
                  <p class="text-[10px] text-ink-muted">{{ it.uom }}</p>
                </div>
                <span class="col-span-2 font-mono text-ink-soft truncate">{{ it.batch_number ?? '—' }}</span>
                <span class="col-span-2 font-mono text-ink-soft text-[11px]">{{ it.expiry_date ? formatDate(it.expiry_date) : '—' }}</span>
                <span class="col-span-1 text-right font-mono text-ink">{{ it.qty_received }}</span>
                <span class="col-span-1 text-right font-mono text-ink-soft">{{ formatINR(it.unit_cost_cents) }}</span>
                <span class="col-span-2 capitalize text-ink-soft">{{ CONDITION_LABEL[it.condition] }}</span>
              </li>
            }
          </ul>

          @if (d.qc_notes || d.notes) {
            <dl class="mt-4 grid grid-cols-12 gap-x-4 gap-y-1.5 text-[12px]">
              @if (d.qc_notes) {
                <dt class="col-span-3 text-ink-muted">QC notes</dt>
                <dd class="col-span-9 text-ink-soft italic">{{ d.qc_notes }}</dd>
              }
              @if (d.notes) {
                <dt class="col-span-3 text-ink-muted">Notes</dt>
                <dd class="col-span-9 text-ink-soft italic">{{ d.notes }}</dd>
              }
            </dl>
          }

          <div class="mt-5 text-right">
            <button type="button" (click)="closeDetail()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Close
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialsPage implements OnInit, OnDestroy {
  protected readonly store = inject(MaterialsStore);
  private svc = inject(MaterialsService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('materials.write'));
  protected readonly busy = signal<string | null>(null);

  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly QC_TONE = QC_TONE;
  protected readonly CONDITION_LABEL = CONDITION_LABEL;
  protected readonly Math = Math;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filterPills: { value: GrnFilter; label: string }[] = [
    { value: 'all',        label: 'All' },
    { value: 'today',      label: 'Today' },
    { value: 'pending_qc', label: 'Pending QC' },
    { value: 'passed',     label: 'Passed' },
    { value: 'failed',     label: 'Failed' },
  ];

  protected readonly conditionOptions: { value: GrnCondition; label: string }[] = [
    { value: 'good',     label: 'Good' },
    { value: 'damaged',  label: 'Damaged' },
    { value: 'short',    label: 'Short' },
    { value: 'expired',  label: 'Expired' },
  ];

  protected readonly receiveOpen = signal(false);
  protected readonly draftLines = signal<GrnDraftLine[]>([]);
  protected selectedPoId = '';
  protected qcStatus: GrnQcStatus = 'pending';
  protected qcNotes = '';
  protected grnNotes = '';

  protected readonly selectedPo = computed<ReceivablePo | null>(() => {
    const id = this.selectedPoId;
    if (!id) return null;
    return this.store.receivablePos().find((p) => p.id === id) ?? null;
  });

  protected readonly detail = signal<GrnDetail | null>(null);

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected onFilter(v: GrnFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: GrnFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected qcChipCls(s: GrnRow['qc_status']): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${QC_TONE[s].chip}`;
  }

  protected statusChipCls(s: GrnRow['status']): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  }
  protected formatDateTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy · HH:mm'); } catch { return iso; }
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  // ── Receive flow ──────────────────────────────────
  protected openReceive() {
    this.selectedPoId = '';
    this.draftLines.set([]);
    this.qcStatus = 'pending';
    this.qcNotes = '';
    this.grnNotes = '';
    this.receiveOpen.set(true);
  }

  protected closeReceive() { this.receiveOpen.set(false); }

  protected onPoPicked() {
    const po = this.selectedPo();
    if (!po) {
      this.draftLines.set([]);
      return;
    }
    this.draftLines.set(
      po.items.map<GrnDraftLine>((it) => ({
        id: crypto.randomUUID(),
        po_item_id: it.id,
        inventory_item_id: it.inventory_item_id,
        description: it.description,
        uom: it.uom,
        qty_open: it.qty_open,
        qty_received: it.qty_open,
        batch_number: '',
        mfg_date: '',
        expiry_date: '',
        unit_cost_cents: it.unit_price_cents,
        condition: 'good',
        notes: '',
      })),
    );
  }

  protected canSubmitReceive(): boolean {
    if (!this.selectedPoId) return false;
    const lines = this.draftLines();
    if (lines.length === 0) return false;
    // At least one line must have qty > 0; every receiving line must have qty within open and (if condition='good' + linked) a batch
    let anyQty = false;
    for (const l of lines) {
      if (l.qty_received < 0 || l.qty_received > l.qty_open) return false;
      if (l.qty_received > 0) {
        anyQty = true;
        if (l.condition === 'good' && l.inventory_item_id && !l.batch_number.trim()) return false;
      }
    }
    return anyQty;
  }

  protected async confirmReceive() {
    if (!this.canSubmitReceive()) return;
    const linesWithQty = this.draftLines().filter((l) => l.qty_received > 0);
    this.busy.set('form');
    try {
      const grn = await this.svc.receive({
        poId: this.selectedPoId,
        items: linesWithQty,
        qcStatus: this.qcStatus,
        qcNotes: this.qcNotes,
        notes: this.grnNotes,
      });
      this.toast.success('GRN posted', grn.grn_number);
      this.receiveOpen.set(false);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not post GRN', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Detail ────────────────────────────────────────
  protected async openDetail(g: GrnRow) {
    try {
      this.detail.set(await this.svc.getDetail(g.id));
    } catch (e) {
      this.toast.error('Could not load GRN', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected closeDetail() { this.detail.set(null); }
}
