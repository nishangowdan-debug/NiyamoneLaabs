import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BloodBankService } from '../data/blood-bank.service';
import {
  BLOOD_GROUP_LABELS, COMPONENT_LABELS, STAGE_LABELS,
  type BBInvoiceLine, type BBStaffOption, type BBWardOption,
  type BloodRequest, type BloodRequestStage, type BloodUnit, type CrossMatch,
  type CrossmatchResult, type TransfusionRecord, type TransfusionReaction, type TransfusionOutcome,
} from '../data/blood-bank.types';
import { currentStage, daysUntil } from '../data/blood-bank.utils';
import { TransfusionPdfService } from '../services/transfusion-pdf.service';
import { IssueSlipPdfService } from '../services/issue-slip-pdf.service';

@Component({
  selector: 'app-blood-request-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="close()">
  <div class="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">{{ request.request_no }} · {{ stateLabel() }}</h3>
        <p class="text-[11px] text-ink-soft">
          {{ groupLabel(request.blood_group) }} · {{ componentLabel(request.component) }}
          · {{ request.units_required }} unit(s) · priority {{ request.priority }}
        </p>
      </div>
      <button class="text-ink-soft hover:text-ink" (click)="close()">✕</button>
    </div>

    <div class="p-4 space-y-4">
      <!-- Indication banner -->
      @if (request.indication) {
        <div class="rounded-md border border-border bg-surface-subtle px-3 py-2 text-[12px]">
          <span class="text-ink-soft">Indication:</span> {{ request.indication }}
        </div>
      }

      <!-- Stage timeline -->
      <section class="rounded-md border border-border p-3">
        <div class="flex items-center gap-1 overflow-x-auto text-[11px]">
          @for (s of stages; track s.id; let last = $last) {
            <div class="flex items-center gap-1 whitespace-nowrap">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold"
                    [class.bg-good-fg]="stageDone(s.id)"
                    [class.text-white]="stageDone(s.id)"
                    [class.bg-brand]="stageCurrent() === s.id && !stageDone(s.id)"
                    [class.text-white]="stageCurrent() === s.id && !stageDone(s.id)"
                    [class.bg-surface-subtle]="!stageDone(s.id) && stageCurrent() !== s.id"
                    [class.text-ink-soft]="!stageDone(s.id) && stageCurrent() !== s.id">
                @if (stageDone(s.id)) { ✓ } @else { {{ $index + 1 }} }
              </span>
              <span [class.font-semibold]="stageCurrent() === s.id"
                    [class.text-ink-soft]="!stageDone(s.id) && stageCurrent() !== s.id">
                {{ s.label }}
              </span>
              @if (stageTimestamp(s.id); as ts) {
                <span class="text-[10px] text-ink-soft">· {{ ts | date:'shortTime' }}</span>
              }
            </div>
            @if (!last) { <span class="text-ink-soft">→</span> }
          }
        </div>
        @if (!isClosed()) {
          <div class="mt-2 flex flex-wrap gap-2">
            @if (!request.acknowledged_at) {
              <button (click)="acknowledge()" class="px-2.5 py-1 text-[11px] rounded-md bg-brand text-white">
                Acknowledge request
              </button>
            }
            @if (!request.sample_received_at) {
              <button (click)="receiveSample()" class="px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-surface-subtle">
                Mark sample received
              </button>
            }

            <!-- ── Request-level state-machine actions (Phase-1 RPCs) ── -->
            @if (request.state === 'requested' && canFinaliseXM()) {
              <button (click)="finaliseCrossmatch()" [disabled]="busy()"
                      class="px-2.5 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                ✓ Confirm cross-match · all units
              </button>
            }
            @if (request.state === 'cross_matched') {
              <div class="flex items-center gap-1.5">
                <input type="text" [(ngModel)]="bulkBoxId" placeholder="Cold-chain box ID"
                       class="h-7 px-2 text-[11px] rounded-md border border-border bg-surface text-ink font-mono w-40"/>
                <button (click)="issueAllUnits()" [disabled]="busy() || !bulkBoxId.trim()"
                        class="px-2.5 py-1 text-[11px] rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50">
                  Issue all units →
                </button>
              </div>
            }
            @if (request.state === 'issued' && !request.dispatched_at) {
              <div class="flex items-center gap-1.5">
                <select [(ngModel)]="bulkRunnerId"
                        class="h-7 px-1.5 text-[11px] rounded-md border border-border bg-surface text-ink">
                  <option value="">— pick runner —</option>
                  @for (s of staffOptions(); track s.id) {
                    <option [value]="s.id">{{ s.full_name }}</option>
                  }
                </select>
                <button (click)="dispatchAll()" [disabled]="busy() || !bulkRunnerId"
                        class="px-2.5 py-1 text-[11px] rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50">
                  Dispatch to ward →
                </button>
              </div>
            }
            @if (request.state === 'issued' && request.dispatched_at && !request.ward_received_at) {
              <button (click)="markWardReceived()" [disabled]="busy()"
                      class="px-2.5 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                ✓ Confirm ward receipt · two-person check
              </button>
            }
          </div>
        }
      </section>

      <!-- Issued / transfused units -->
      <section>
        <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Reserved / Issued / Transfused</h4>
        @if (linkedUnits().length === 0) {
          <p class="text-[12px] text-ink-soft">No units linked yet.</p>
        } @else {
          <table class="min-w-full text-[12px]">
            <thead class="text-ink-soft text-left">
              <tr><th class="px-2 py-1">Unit</th><th class="px-2 py-1">Group</th>
                  <th class="px-2 py-1">State</th><th class="px-2 py-1">Cross-match</th>
                  <th class="px-2 py-1">Expiry</th><th class="px-2 py-1 text-right">Action</th></tr>
            </thead>
            <tbody>
              @for (u of linkedUnits(); track u.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1 font-mono">{{ u.unit_no }}</td>
                  <td class="px-2 py-1">{{ groupLabel(u.blood_group) }}</td>
                  <td class="px-2 py-1">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                          [class.bg-good-fg]="u.state==='transfused'"
                          [class.bg-warn-fg]="u.state==='issued' || u.state==='reserved'"
                          [class.text-white]="u.state==='transfused' || u.state==='issued'">
                      {{ u.state }}
                    </span>
                  </td>
                  <td class="px-2 py-1">{{ xmFor(u.id) || '—' }}</td>
                  <td class="px-2 py-1">{{ u.expires_at | date:'short' }}</td>
                  <td class="px-2 py-1 text-right">
                    @if (u.state === 'reserved') {
                      <button (click)="recordXM(u, 'compatible')" class="text-[11px] text-good-fg hover:underline">XM ✓</button>
                      <span class="mx-1">·</span>
                      <button (click)="recordXM(u, 'incompatible')" class="text-[11px] text-danger-fg hover:underline">XM ✗</button>
                      @if (xmFor(u.id) === 'compatible') {
                        <span class="mx-1">·</span>
                        <button (click)="issue(u)" class="text-[11px] text-brand hover:underline">Issue</button>
                      }
                    }
                    @if (u.state === 'issued' && !request.dispatched_at) {
                      <button (click)="openDispatch(u)" class="text-[11px] text-brand hover:underline">Dispatch</button>
                    }
                    @if (u.state === 'issued' && request.dispatched_at && !request.ward_received_at) {
                      <button (click)="confirmWardReceipt(u)" class="text-[11px] text-good-fg hover:underline">Confirm ward receipt</button>
                      <span class="mx-1">·</span>
                      <button (click)="printIssueSlip(u)" class="text-[11px] text-brand hover:underline">Issue slip</button>
                    }
                    @if (u.state === 'issued' && request.ward_received_at) {
                      <button (click)="openTransfusion(u)" class="text-[11px] text-brand hover:underline">Record transfusion</button>
                      <span class="mx-1">·</span>
                      <button (click)="printIssueSlip(u)" class="text-[11px] text-brand hover:underline">Issue slip</button>
                    }
                    @if (u.state === 'transfused') {
                      <button (click)="printTransfusion(u.id)" class="text-[11px] text-brand hover:underline">Print</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>

      <!-- Available units (matching ABO + component) -->
      @if (!isClosed()) {
        <section>
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">
            Available matching units ({{ availableMatching().length }})
          </h4>
          @if (availableMatching().length === 0) {
            <p class="text-[12px] text-danger-fg">No matching available units. Check inventory.</p>
          } @else {
            <table class="min-w-full text-[12px]">
              <thead class="text-ink-soft text-left">
                <tr><th class="px-2 py-1">Unit</th><th class="px-2 py-1">Comp.</th>
                    <th class="px-2 py-1">Volume</th><th class="px-2 py-1">Expiry</th>
                    <th class="px-2 py-1 text-right">Action</th></tr>
              </thead>
              <tbody>
                @for (u of availableMatching(); track u.id) {
                  <tr class="border-t border-border">
                    <td class="px-2 py-1 font-mono">{{ u.unit_no }}</td>
                    <td class="px-2 py-1">{{ componentLabel(u.component) }}</td>
                    <td class="px-2 py-1">{{ u.volume_ml }} ml</td>
                    <td class="px-2 py-1" [class.text-danger-fg]="daysLeft(u.expires_at) <= 1">
                      {{ u.expires_at | date:'short' }}
                    </td>
                    <td class="px-2 py-1 text-right">
                      <button (click)="reserve(u)" class="text-[11px] text-brand hover:underline">Reserve</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }

      <!-- Dispatch dialog (inline) -->
      @if (dispatchFor()) {
        <section class="rounded-md border border-brand bg-brand/5 p-3 space-y-2">
          <h4 class="text-[12px] font-semibold uppercase text-brand">
            Dispatch unit · {{ dispatchFor()!.unit_no }}
          </h4>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Cold-chain box ID *</span>
              <input [(ngModel)]="dispatchBoxId" placeholder="e.g. BB-CB-04"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono" />
            </label>
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Target ward *</span>
              <select [(ngModel)]="dispatchWardId"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="">— pick —</option>
                @for (w of wards(); track w.id) {
                  <option [value]="w.id">{{ w.code }} · {{ w.name }}</option>
                }
              </select>
            </label>
            <label class="col-span-2">
              <span class="text-[10px] uppercase text-ink-soft">Runner / Porter *</span>
              <select [(ngModel)]="dispatchRunnerId"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="">— pick —</option>
                @for (s of staffOptions(); track s.id) {
                  <option [value]="s.id">{{ s.full_name }}@if (s.role_slug) { · <span>{{ s.role_slug }}</span> }</option>
                }
              </select>
            </label>
          </div>
          @if (dispatchError()) { <p class="text-[12px] text-danger-fg">{{ dispatchError() }}</p> }
          <div class="flex justify-end gap-2">
            <button (click)="dispatchFor.set(null)"
                    class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
            <button (click)="saveDispatch()" [disabled]="dispatchBusy()"
                    class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
              {{ dispatchBusy() ? 'Dispatching…' : 'Dispatch + Print Slip' }}
            </button>
          </div>
        </section>
      }

      <!-- Transfusion vitals dialog (inline) -->
      @if (txDialogFor()) {
        <section class="rounded-md border border-brand bg-brand/5 p-3 space-y-2">
          <h4 class="text-[12px] font-semibold uppercase text-brand">
            Record transfusion · {{ txDialogFor()!.unit_no }}
          </h4>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Started at</span>
              <input type="datetime-local" [(ngModel)]="txStartedAt"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Ended at</span>
              <input type="datetime-local" [(ngModel)]="txEndedAt"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="col-span-2">
              <span class="text-[10px] uppercase text-ink-soft">Pre-vitals (BP / Pulse / Temp)</span>
              <input [(ngModel)]="txVitalsPre" placeholder="120/80, 78, 37.0"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="col-span-2">
              <span class="text-[10px] uppercase text-ink-soft">15-min vitals</span>
              <input [(ngModel)]="txVitals15" placeholder="118/78, 80, 37.1"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="col-span-2">
              <span class="text-[10px] uppercase text-ink-soft">Post-vitals</span>
              <input [(ngModel)]="txVitalsPost" placeholder="122/82, 76, 37.0"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Reaction</span>
              <select [(ngModel)]="txReaction"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="none">None</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </label>
            <label>
              <span class="text-[10px] uppercase text-ink-soft">Outcome</span>
              <select [(ngModel)]="txOutcome"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="completed">Completed</option>
                <option value="aborted">Aborted</option>
                <option value="reaction">Reaction</option>
              </select>
            </label>
            <label class="col-span-2">
              <span class="text-[10px] uppercase text-ink-soft">Reaction notes</span>
              <textarea rows="2" [(ngModel)]="txReactionNotes"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
          </div>
          @if (txError()) { <p class="text-[12px] text-danger-fg">{{ txError() }}</p> }
          <div class="flex justify-end gap-2">
            <button (click)="txDialogFor.set(null)"
                    class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
            <button (click)="saveTransfusion()" [disabled]="txBusy()"
                    class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
              {{ txBusy() ? 'Saving…' : 'Save Transfusion' }}
            </button>
          </div>
        </section>
      }

      <!-- Billing — posted charges for this request -->
      <section class="rounded-md border border-border p-3">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft">
            Billing
            <span class="ml-1 text-[11px] font-normal text-ink-muted">
              (auto-posted on transfusion completion)
            </span>
          </h4>
          @if (charges().length === 0 && !isClosed()) {
            <button (click)="postCharges()" [disabled]="chargesBusy()"
                    class="px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-surface-subtle disabled:opacity-50">
              {{ chargesBusy() ? 'Posting…' : 'Post charges now' }}
            </button>
          }
        </div>
        @if (charges().length === 0) {
          <p class="text-[12px] text-ink-soft">
            No charges posted yet. Charges post automatically on the first transfusion completion.
          </p>
        } @else {
          <table class="min-w-full text-[12px]">
            <thead class="text-ink-soft text-left">
              <tr>
                <th class="px-2 py-1">Item</th>
                <th class="px-2 py-1 text-right">Qty</th>
                <th class="px-2 py-1 text-right">Unit Price</th>
                <th class="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (c of charges(); track c.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1">{{ c.description }}</td>
                  <td class="px-2 py-1 text-right tabular-nums">{{ c.qty }}</td>
                  <td class="px-2 py-1 text-right tabular-nums">{{ rupees(c.unit_price_cents) }}</td>
                  <td class="px-2 py-1 text-right tabular-nums font-semibold">{{ rupees(c.total_cents) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-border">
                <td colspan="3" class="px-2 py-1.5 text-right font-semibold">Subtotal</td>
                <td class="px-2 py-1.5 text-right font-bold tabular-nums">{{ rupees(chargesTotal()) }}</td>
              </tr>
            </tfoot>
          </table>
          <p class="mt-2 text-[10px] text-ink-soft">
            Posted to invoice
            <span class="font-mono">{{ charges()[0].invoice_number ?? '—' }}</span>
            · status
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-surface-subtle">
              {{ charges()[0].invoice_status ?? '—' }}
            </span>
          </p>
        }
      </section>

      @if (errorMsg()) {
        <p class="text-[12px] text-danger-fg">{{ errorMsg() }}</p>
      }
    </div>

    <div class="px-4 py-3 border-t border-border flex justify-between gap-2">
      @if (!isClosed()) {
        <button (click)="cancelRequest()" class="text-[12px] text-danger-fg hover:underline">Cancel request</button>
      } @else { <span></span> }
      <button (click)="close()" class="px-3 py-1.5 text-sm rounded-md border border-border">Close</button>
    </div>
  </div>
</div>
  `,
})
export class BloodRequestDetailComponent implements OnInit {
  private bb = inject(BloodBankService);
  private pdf = inject(TransfusionPdfService);
  private slipPdf = inject(IssueSlipPdfService);

  @Input({ required: true }) request!: BloodRequest;
  @Output() closed = new EventEmitter<void>();

  protected linkedUnits = signal<BloodUnit[]>([]);
  protected availableMatching = signal<BloodUnit[]>([]);
  protected crossmatches = signal<CrossMatch[]>([]);
  protected transfusionsByUnit = signal<Record<string, TransfusionRecord>>({});

  // Billing
  protected charges     = signal<BBInvoiceLine[]>([]);
  protected chargesBusy = signal(false);
  protected chargesTotal = computed(() =>
    this.charges().reduce((s, c) => s + c.total_cents, 0),
  );

  protected errorMsg = signal<string | null>(null);

  // Wards / staff for dispatch picker
  protected wards = signal<BBWardOption[]>([]);
  protected staffOptions = signal<BBStaffOption[]>([]);

  // Dispatch dialog
  protected dispatchFor = signal<BloodUnit | null>(null);
  protected dispatchBoxId = '';
  protected dispatchWardId = '';
  protected dispatchRunnerId = '';
  protected dispatchBusy = signal(false);
  protected dispatchError = signal<string | null>(null);

  // Transfusion dialog
  protected txDialogFor = signal<BloodUnit | null>(null);
  protected txStartedAt = '';
  protected txEndedAt = '';
  protected txVitalsPre = '';
  protected txVitals15 = '';
  protected txVitalsPost = '';
  protected txReaction: TransfusionReaction = 'none';
  protected txOutcome: TransfusionOutcome = 'completed';
  protected txReactionNotes = '';
  protected txBusy = signal(false);
  protected txError = signal<string | null>(null);

  protected stateLabel = computed(() => this.request.state.replace('_', ' ').toUpperCase());
  protected isClosed = computed(() => this.request.state === 'completed' || this.request.state === 'cancelled');

  // Stage timeline
  protected stages: { id: BloodRequestStage; label: string }[] = [
    { id: 'acknowledged',    label: 'Acknowledged' },
    { id: 'sample_received', label: 'Sample' },
    { id: 'cross_matched',   label: 'Cross-matched' },
    { id: 'issued',          label: 'Issued' },
    { id: 'dispatched',      label: 'Dispatched' },
    { id: 'ward_received',   label: 'At Ward' },
  ];

  protected stageCurrent = (): BloodRequestStage => currentStage(this.request);

  protected stageDone(s: BloodRequestStage): boolean {
    const ts = this.stageTimestamp(s);
    return !!ts;
  }

  protected stageTimestamp(s: BloodRequestStage): string | null {
    const r = this.request;
    switch (s) {
      case 'acknowledged':    return r.acknowledged_at;
      case 'sample_received': return r.sample_received_at;
      case 'crossmatching':   return r.crossmatch_started_at;
      case 'cross_matched':   return r.crossmatch_completed_at;
      case 'issued':          return r.issued_at;
      case 'dispatched':      return r.dispatched_at;
      case 'ward_received':   return r.ward_received_at;
      default:                return null;
    }
  }

  ngOnInit() {
    this.refresh();
    this.loadPickers();
  }

  private async loadPickers() {
    try {
      const [w, s] = await Promise.all([this.bb.listWards(), this.bb.listStaff()]);
      this.wards.set(w);
      this.staffOptions.set(s);
    } catch { /* non-fatal */ }
  }

  protected groupLabel = (g: any) => BLOOD_GROUP_LABELS[g as keyof typeof BLOOD_GROUP_LABELS];
  protected componentLabel = (c: any) => COMPONENT_LABELS[c as keyof typeof COMPONENT_LABELS];
  protected daysLeft = (iso: string) => daysUntil(iso);

  protected xmFor(unitId: string): CrossmatchResult | null {
    const xm = this.crossmatches().find(x => x.unit_id === unitId);
    return xm?.result ?? null;
  }

  private async refresh() {
    try {
      const [fresh, allUnits, xms, txs, charges] = await Promise.all([
        this.bb.getRequest(this.request.id),
        this.bb.listUnits({}),
        this.bb.listCrossmatches(this.request.id),
        this.bb.listTransfusions({ requestId: this.request.id }),
        this.bb.listChargesForRequest(this.request.id),
      ]);
      this.charges.set(charges);
      // Mutate in place so @Input reference + computed signals stay aligned.
      Object.assign(this.request, fresh);
      const linked = allUnits.filter(u => u.reserved_for_request_id === this.request.id || xms.some(x => x.unit_id === u.id));
      const matching = allUnits.filter(u =>
        u.state === 'available' &&
        u.blood_group === this.request.blood_group &&
        u.component === this.request.component &&
        new Date(u.expires_at).getTime() > Date.now()
      );
      const txMap: Record<string, TransfusionRecord> = {};
      for (const t of txs) txMap[t.unit_id] = t;
      this.linkedUnits.set(linked);
      this.availableMatching.set(matching);
      this.crossmatches.set(xms);
      this.transfusionsByUnit.set(txMap);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to load detail');
    }
  }

  protected async reserve(u: BloodUnit) {
    try {
      this.errorMsg.set(null);
      await this.bb.reserveUnit(this.request.id, u.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  protected async recordXM(u: BloodUnit, result: CrossmatchResult) {
    try {
      this.errorMsg.set(null);
      await this.bb.recordCrossmatch({ requestId: this.request.id, unitId: u.id, result });
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  // ── Phase-1 bundled state-machine actions (request-level) ─────────
  protected readonly busy      = signal(false);
  protected bulkBoxId          = '';
  protected bulkRunnerId       = '';

  /** All required units have been reserved AND have a compatible XM result. */
  protected canFinaliseXM = computed(() => {
    const reserved = this.linkedUnits().filter(u => u.state === 'reserved');
    if (reserved.length !== this.request.units_required) return false;
    return reserved.every(u => this.xmFor(u.id) === 'compatible');
  });

  protected async finaliseCrossmatch() {
    if (!this.canFinaliseXM()) return;
    const ids = this.linkedUnits().filter(u => u.state === 'reserved').map(u => u.id);
    this.busy.set(true); this.errorMsg.set(null);
    try {
      await this.bb.crossmatchComplete(this.request.id, ids);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed to finalise cross-match'); }
    finally { this.busy.set(false); }
  }

  protected async issueAllUnits() {
    if (!this.bulkBoxId.trim()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      await this.bb.issueUnits(this.request.id, this.bulkBoxId.trim());
      this.bulkBoxId = '';
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed to issue units'); }
    finally { this.busy.set(false); }
  }

  protected async dispatchAll() {
    if (!this.bulkRunnerId) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      await this.bb.requestDispatch({
        requestId:     this.request.id,
        runnerStaffId: this.bulkRunnerId,
        targetWardId:  this.request.target_ward_id ?? null,
      });
      this.bulkRunnerId = '';
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Dispatch failed'); }
    finally { this.busy.set(false); }
  }

  protected async markWardReceived() {
    this.busy.set(true); this.errorMsg.set(null);
    try {
      await this.bb.requestWardReceive(this.request.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
    finally { this.busy.set(false); }
  }

  protected async issue(u: BloodUnit) {
    try {
      this.errorMsg.set(null);
      await this.bb.issueUnit(this.request.id, u.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  // ── Dispatch milestones ──────────────────────────────────────
  protected async acknowledge() {
    try {
      this.errorMsg.set(null);
      await this.bb.acknowledgeRequest(this.request.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  protected async receiveSample() {
    try {
      this.errorMsg.set(null);
      await this.bb.receiveSample(this.request.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  protected openDispatch(u: BloodUnit) {
    this.dispatchBoxId    = '';
    this.dispatchWardId   = this.request.target_ward_id ?? '';
    this.dispatchRunnerId = '';
    this.dispatchError.set(null);
    this.dispatchFor.set(u);
  }

  protected async saveDispatch() {
    const u = this.dispatchFor();
    if (!u) return;
    if (!this.dispatchBoxId.trim() || !this.dispatchWardId || !this.dispatchRunnerId) {
      this.dispatchError.set('Cold-chain box, ward and runner are all required');
      return;
    }
    this.dispatchBusy.set(true);
    this.dispatchError.set(null);
    try {
      await this.bb.dispatchUnit({
        requestId:      this.request.id,
        unitId:         u.id,
        runnerStaffId:  this.dispatchRunnerId,
        coldChainBoxId: this.dispatchBoxId.trim(),
        targetWardId:   this.dispatchWardId,
      });
      await this.refresh();
      this.dispatchFor.set(null);
      // Auto-print the issue slip after a successful dispatch.
      await this.slipPdf.print(this.request, u);
    } catch (e: any) {
      this.dispatchError.set(e?.message ?? 'Dispatch failed');
    } finally {
      this.dispatchBusy.set(false);
    }
  }

  protected async confirmWardReceipt(u: BloodUnit) {
    try {
      this.errorMsg.set(null);
      await this.bb.confirmWardReceipt(this.request.id, u.id);
      await this.refresh();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  protected async printIssueSlip(u: BloodUnit) {
    try { await this.slipPdf.print(this.request, u); }
    catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed to print issue slip'); }
  }

  // ── Billing ─────────────────────────────────────────────────
  protected async postCharges() {
    this.chargesBusy.set(true);
    this.errorMsg.set(null);
    try {
      await this.bb.postCharges(this.request.id);
      await this.refresh();
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to post charges');
    } finally {
      this.chargesBusy.set(false);
    }
  }

  protected rupees(cents: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format((cents ?? 0) / 100);
  }

  protected openTransfusion(u: BloodUnit) {
    this.txStartedAt = this.toLocalInput(new Date());
    this.txEndedAt = '';
    this.txVitalsPre = ''; this.txVitals15 = ''; this.txVitalsPost = '';
    this.txReaction = 'none'; this.txOutcome = 'completed';
    this.txReactionNotes = '';
    this.txError.set(null);
    this.txDialogFor.set(u);
  }

  private toLocalInput(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  protected async saveTransfusion() {
    const u = this.txDialogFor();
    if (!u) return;
    this.txBusy.set(true);
    this.txError.set(null);
    try {
      await this.bb.recordTransfusion({
        requestId: this.request.id,
        unitId: u.id,
        startedAt: new Date(this.txStartedAt).toISOString(),
        endedAt: this.txEndedAt ? new Date(this.txEndedAt).toISOString() : null,
        vitalsPre: this.txVitalsPre ? { raw: this.txVitalsPre } : {},
        vitals15min: this.txVitals15 ? { raw: this.txVitals15 } : null,
        vitalsPost: this.txVitalsPost ? { raw: this.txVitalsPost } : null,
        reaction: this.txReaction,
        reactionNotes: this.txReactionNotes.trim() || null,
        outcome: this.txOutcome,
      });
      this.txDialogFor.set(null);
      await this.refresh();
    } catch (e: any) {
      this.txError.set(e?.message ?? 'Failed to save transfusion');
    } finally {
      this.txBusy.set(false);
    }
  }

  protected async printTransfusion(unitId: string) {
    const tx = this.transfusionsByUnit()[unitId];
    if (!tx) return;
    this.pdf.print(tx);
  }

  protected async cancelRequest() {
    const reason = prompt('Reason for cancellation?');
    if (!reason) return;
    try {
      await this.bb.cancelRequest(this.request.id, reason);
      this.close();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
  }

  protected close() { this.closed.emit(); }
}
