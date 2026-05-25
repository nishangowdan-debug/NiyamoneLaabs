import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ReferenceLabService } from '../data/reference-lab.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  ReferenceLab, ReferenceDispatchRow, ReferenceDispatchStatus,
} from '../data/reference-lab.types';

const STATUS_CHIP: Record<ReferenceDispatchStatus, string> = {
  dispatched: 'bg-amber-50 text-amber-700 border-amber-300',
  in_transit: 'bg-blue-50 text-blue-700 border-blue-300',
  received:   'bg-purple-50 text-purple-700 border-purple-300',
  reported:   'bg-emerald-50 text-emerald-700 border-emerald-300',
  cancelled:  'bg-zinc-100 text-zinc-600 border-zinc-300',
};

@Component({
  selector: 'app-reference-lab-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="pb-4 mb-5 border-b border-border">
      <div class="flex items-end justify-between">
        <div>
          <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Reference Lab</h1>
          <p class="text-[13px] text-ink-muted mt-1">
            {{ open().length }} open · {{ overdue().length }} overdue ·
            {{ dispatches().length }} dispatches · {{ labs().length }} labs configured
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" (click)="manageLabs.set(true)"
                  class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
            Manage labs
          </button>
          <button type="button" (click)="dispatchDialog.set(true)" [disabled]="!labs().length"
                  [title]="labs().length ? 'Send a sample to an external reference lab' : 'Add a reference lab first'"
                  class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
            + New dispatch
          </button>
        </div>
      </div>
      @if (!labs().length) {
        <p class="mt-3 text-[12px] text-warn-fg bg-warn-bg/40 border border-warn-fg/30 rounded-md px-3 py-2">
          No reference labs configured yet. Click <strong>Manage labs</strong> to add one before dispatching samples.
        </p>
      }
    </header>

    @if (routingMissing()) {
      <div class="mb-4 bg-warn-bg/40 border border-warn-fg/30 rounded-[10px] p-3 flex items-start gap-2">
        <span class="text-warn-fg shrink-0 mt-px">⚠</span>
        <div class="text-[12px] text-ink-soft">
          <strong class="text-warn-fg">Routing migration not applied yet.</strong>
          Run <code class="font-mono text-[11px] bg-surface-card px-1 py-px rounded border border-border">db/migrations/20260515_lab_routing.sql</code>
          in Supabase SQL Editor. Until then, every order is treated as <em>inhouse</em> and the Outsource board stays empty.
        </div>
      </div>
    }

    <!-- Pending dispatch (orders billed as outsource, not yet sent) -->
    @if (pending().length > 0) {
      <section class="mb-4 bg-violet-50/40 border border-violet-200 rounded-[10px] p-3">
        <header class="flex items-center justify-between mb-2">
          <h3 class="font-display text-[14px] font-medium text-violet-900">
            Pending dispatch <span class="font-mono text-[11px] text-violet-700 ml-1">{{ pending().length }}</span>
          </h3>
          <p class="text-[11px] text-ink-muted">Billed as outsource — fill courier details and send.</p>
        </header>
        <ul class="divide-y divide-violet-200/60">
          @for (o of pending(); track o.id) {
            <li class="py-2 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[13px] font-medium text-ink truncate">
                  {{ o.patient?.full_name || '—' }}
                  <span class="font-mono text-[10px] text-ink-muted ml-1">UHID {{ o.patient?.uhid || '—' }}</span>
                </div>
                <div class="text-[11px] text-ink-muted">
                  Ordered {{ formatDate(o.ordered_at) }} ·
                  @for (t of o.tests; track t.code; let last = $last) {<span class="font-mono">{{ t.code }}</span><span>{{ last ? '' : ', ' }}</span>}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" (click)="moveToInhouse(o.id)"
                        class="h-8 px-2.5 rounded-md border border-border text-ink-soft text-[11px] hover:bg-surface-subtle">
                  ← Inhouse
                </button>
                <button type="button" (click)="startDispatchFor(o.id)" [disabled]="!labs().length"
                        class="h-8 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                  Dispatch →
                </button>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <!-- Status filter -->
    <div class="flex items-center gap-1.5 flex-wrap mb-4">
      <button type="button" (click)="statusFilter.set(null)" [class]="tabCls(null)">
        All <span class="font-mono text-[11px] ml-1 opacity-70">{{ dispatches().length }}</span>
      </button>
      @for (s of statuses; track s) {
        <button type="button" (click)="statusFilter.set(s)" [class]="tabCls(s)">
          {{ statusLabel(s) }}
          <span class="font-mono text-[11px] ml-1 opacity-70">{{ countFor(s) }}</span>
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-[13px] text-ink-muted py-12 text-center">Loading dispatches…</p>
    } @else if (filtered().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[13px] text-ink-muted">
        No dispatches match this filter.
      </div>
    } @else {
      <div class="overflow-x-auto bg-surface-card border border-border rounded-[10px]">
        <table class="w-full text-[12px]">
          <thead class="text-[10px] uppercase tracking-[0.06em] text-ink-muted bg-surface-subtle">
            <tr>
              <th class="text-left px-3 py-2">Dispatch</th>
              <th class="text-left px-3 py-2">Patient · Sample</th>
              <th class="text-left px-3 py-2">Reference Lab</th>
              <th class="text-left px-3 py-2">Courier / AWB</th>
              <th class="text-left px-3 py-2">Dispatched</th>
              <th class="text-left px-3 py-2">Expected</th>
              <th class="text-left px-3 py-2">Status</th>
              <th class="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (d of filtered(); track d.id) {
              <tr class="border-t border-border hover:bg-surface-subtle/50">
                <td class="px-3 py-2 font-mono">{{ d.dispatch_no }}</td>
                <td class="px-3 py-2">
                  <div class="font-medium">{{ d.lab_order?.patient?.full_name || '—' }}</div>
                  <div class="text-[10px] text-ink-muted font-mono">
                    UHID {{ d.lab_order?.patient?.uhid || '—' }}
                    @if (d.lab_order?.sample_id) { · {{ d.lab_order!.sample_id }} }
                  </div>
                </td>
                <td class="px-3 py-2">{{ d.reference_lab?.name || '—' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  <div>{{ d.courier_name || '—' }}</div>
                  @if (d.awb_number) {
                    <div class="font-mono text-ink-muted">{{ d.awb_number }}</div>
                  }
                </td>
                <td class="px-3 py-2">{{ formatDate(d.dispatched_at) }}</td>
                <td class="px-3 py-2"
                    [class.text-danger-fg]="d.expected_return_at && isOverdue(d)">
                  {{ d.expected_return_at ? formatDate(d.expected_return_at) : '—' }}
                </td>
                <td class="px-3 py-2">
                  <span class="inline-flex items-center px-2 py-0.5 border rounded-full text-[10px] font-semibold uppercase"
                        [class]="statusChip(d.status)">{{ statusLabel(d.status) }}</span>
                </td>
                <td class="px-3 py-2 text-right">
                  <div class="inline-flex gap-1">
                    @if (d.status === 'dispatched') {
                      <button (click)="acknowledge(d)" class="text-[10px] text-primary-700 hover:underline">In transit</button>
                    }
                    @if (d.status === 'in_transit' || d.status === 'dispatched') {
                      <button (click)="receive(d)" class="text-[10px] text-primary-700 hover:underline">Received</button>
                    }
                    @if (d.status === 'received' || d.status === 'in_transit' || d.status === 'dispatched') {
                      <button (click)="openReport(d)" class="text-[10px] text-emerald-700 hover:underline">Report back</button>
                    }
                    @if (d.status !== 'reported' && d.status !== 'cancelled') {
                      <button (click)="cancel(d)" class="text-[10px] text-danger-fg hover:underline">Cancel</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ── Dispatch dialog ─────────────────────────────────── -->
    @if (dispatchDialog()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="dispatchDialog.set(false)">
        <div role="dialog" class="w-full max-w-[520px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">New dispatch</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Send a sample to an external reference lab</p>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Lab order ID *</span>
            <input type="text" [(ngModel)]="dlgOrderId" placeholder="Paste the order UUID (e.g. 8c7d1f2a-…)"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink font-mono"
                   [class.border-danger-fg]="dlgOrderId && !isUuid(dlgOrderId)" />
            @if (dlgOrderId && !isUuid(dlgOrderId)) {
              <p class="text-[11px] text-danger-fg mt-1">Not a valid UUID. Open a lab order from the Lab workbench and copy its ID — or click Cancel and start the dispatch from there.</p>
            } @else {
              <p class="text-[11px] text-ink-muted mt-1">Tip: open the lab order in Lab workbench → "Send to reference lab" — that pre-fills the ID for you.</p>
            }
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reference lab *</span>
            <select [(ngModel)]="dlgLabId"
                    class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink">
              <option value="">— Select lab —</option>
              @for (l of labs(); track l.id) {
                <option [value]="l.id">{{ l.name }} ({{ l.code }})</option>
              }
            </select>
          </label>

          <div class="grid grid-cols-2 gap-3 mt-3">
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Courier</span>
              <input type="text" [(ngModel)]="dlgCourier" class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">AWB / tracking</span>
              <input type="text" [(ngModel)]="dlgAwb" class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink font-mono"/>
            </label>
          </div>
          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Expected return</span>
            <input type="datetime-local" [(ngModel)]="dlgExpected" class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
          </label>
          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
            <textarea [(ngModel)]="dlgNotes" rows="2" class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none"></textarea>
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="dispatchDialog.set(false)" [disabled]="busy()"
                    class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Cancel
            </button>
            <button type="button" (click)="confirmDispatch()" [disabled]="busy() || !canDispatch()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Dispatching…' : 'Dispatch' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Manage labs dialog ────────────────────────────── -->
    @if (manageLabs()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="manageLabs.set(false)">
        <div role="dialog" class="w-full max-w-[640px] max-h-[88vh] overflow-y-auto bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Reference labs</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">External diagnostic providers this branch outsources to.</p>

          <table class="w-full text-[12px] mt-4 border-collapse">
            <thead class="text-[10px] uppercase tracking-[0.06em] text-ink-muted bg-surface-subtle">
              <tr>
                <th class="text-left px-2 py-2">Code</th>
                <th class="text-left px-2 py-2">Name</th>
                <th class="text-left px-2 py-2">Accreditation</th>
                <th class="text-left px-2 py-2">Contact</th>
                <th class="text-left px-2 py-2">TAT (h)</th>
                <th class="text-right px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              @for (l of labs(); track l.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1.5 font-mono">{{ l.code }}</td>
                  <td class="px-2 py-1.5">{{ l.name }}</td>
                  <td class="px-2 py-1.5">{{ l.accreditation || '—' }}</td>
                  <td class="px-2 py-1.5">{{ l.contact_phone || l.contact_email || '—' }}</td>
                  <td class="px-2 py-1.5">{{ l.default_tat_hours ?? '—' }}</td>
                  <td class="px-2 py-1.5 text-right">
                    <button (click)="editLab(l)" class="text-[11px] text-primary-700 hover:underline">Edit</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-2 py-6 text-center text-ink-muted">No labs yet — add one below.</td></tr>
              }
            </tbody>
          </table>

          <hr class="border-border my-4" />

          <h3 class="text-[13px] font-semibold text-ink mb-2">{{ labEditId() ? 'Edit lab' : 'Add lab' }}</h3>
          <div class="grid grid-cols-2 gap-3">
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
              <input type="text" [(ngModel)]="labCode" placeholder="e.g. METRO"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink font-mono uppercase"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
              <input type="text" [(ngModel)]="labName" placeholder="Metropolis Healthcare"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Accreditation</span>
              <input type="text" [(ngModel)]="labAccred" placeholder="NABL / CAP / ISO 15189"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Default TAT (hours)</span>
              <input type="number" [(ngModel)]="labTat" min="1"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Contact name</span>
              <input type="text" [(ngModel)]="labContact"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label>
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Phone</span>
              <input type="tel" [(ngModel)]="labPhone"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label class="col-span-2">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</span>
              <input type="email" [(ngModel)]="labEmail"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink"/>
            </label>
            <label class="col-span-2">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Address</span>
              <textarea [(ngModel)]="labAddress" rows="2"
                        class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none"></textarea>
            </label>
          </div>

          <div class="mt-4 flex justify-between items-center">
            @if (labEditId()) {
              <button type="button" (click)="resetLabForm()" class="text-[11px] text-ink-muted hover:underline">+ New lab</button>
            } @else { <span></span> }
            <div class="flex gap-2">
              <button type="button" (click)="manageLabs.set(false)" [disabled]="busy()"
                      class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                Close
              </button>
              <button type="button" (click)="saveLab()" [disabled]="busy() || !labCode.trim() || !labName.trim()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
                {{ busy() ? 'Saving…' : (labEditId() ? 'Update' : 'Add lab') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ── Report dialog ─────────────────────────────────── -->
    @if (reportFor(); as d) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="reportFor.set(null)">
        <div role="dialog" class="w-full max-w-[520px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">Report back · {{ d.dispatch_no }}</h2>
          <p class="text-[12px] text-ink-muted mt-0.5">{{ d.reference_lab?.name }} → {{ d.lab_order?.patient?.full_name }}</p>
          <label class="block mt-4">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Result summary *</span>
            <textarea [(ngModel)]="rpSummary" rows="5"
                      placeholder="Paste / type the headline result"
                      class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface-card resize-none"></textarea>
          </label>
          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Upload report PDF (optional)
            </span>
            <input type="file" accept="application/pdf,image/png,image/jpeg"
                   (change)="onReportFile($event)" [disabled]="uploadingPdf()"
                   class="w-full text-[12px] text-ink-soft" />
            @if (uploadingPdf()) {
              <p class="text-[11px] text-ink-muted mt-1">Uploading…</p>
            }
            @if (rpPdfUrl) {
              <div class="mt-2 flex items-center gap-2 text-[12px]">
                <a [href]="rpPdfUrl" target="_blank" rel="noopener"
                   class="text-primary-700 hover:underline truncate flex-1 font-mono">{{ rpPdfUrl }}</a>
                <button type="button" (click)="rpPdfUrl = ''" class="text-danger-fg text-[11px]">Clear</button>
              </div>
            }
          </label>
          <label class="block mt-3">
            <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
              Or paste an external PDF URL
            </span>
            <input type="url" [(ngModel)]="rpPdfUrl"
                   placeholder="https://…"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink font-mono"/>
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="reportFor.set(null)" [disabled]="busy()"
                    class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Cancel
            </button>
            <button type="button" (click)="confirmReport()" [disabled]="busy() || !rpSummary.trim()"
                    class="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save report' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReferenceLabPage implements OnInit {
  private svc          = inject(ReferenceLabService);
  private branchStore  = inject(BranchStore);
  private toast        = inject(ToastService);
  private route        = inject(ActivatedRoute);

  protected readonly labs            = signal<ReferenceLab[]>([]);
  protected readonly dispatches      = signal<ReferenceDispatchRow[]>([]);
  protected readonly pending         = signal<Array<{ id: string; ordered_at: string; routing: string; patient: { uhid: string; full_name: string | null } | null; tests: { code: string; name: string }[] }>>([]);
  protected readonly loading         = signal(true);
  protected readonly busy            = signal(false);
  protected readonly routingMissing  = signal(false);

  protected readonly statuses: ReferenceDispatchStatus[] =
    ['dispatched', 'in_transit', 'received', 'reported', 'cancelled'];
  protected readonly statusFilter = signal<ReferenceDispatchStatus | null>(null);

  // Dispatch dialog state
  protected readonly dispatchDialog = signal(false);
  protected dlgOrderId  = '';
  protected dlgLabId    = '';
  protected dlgCourier  = '';
  protected dlgAwb      = '';
  protected dlgExpected = '';
  protected dlgNotes    = '';

  // Report dialog state
  protected readonly reportFor = signal<ReferenceDispatchRow | null>(null);
  protected rpSummary = '';
  protected rpPdfUrl  = '';
  protected readonly uploadingPdf = signal(false);
  private supabase = inject(SupabaseService);

  // Manage-labs dialog state
  protected readonly manageLabs = signal(false);
  protected readonly labEditId  = signal<string | null>(null);
  protected labCode    = '';
  protected labName    = '';
  protected labAccred  = '';
  protected labTat: number | null = null;
  protected labContact = '';
  protected labPhone   = '';
  protected labEmail   = '';
  protected labAddress = '';

  protected readonly filtered = computed(() => {
    const s = this.statusFilter();
    return s ? this.dispatches().filter(d => d.status === s) : this.dispatches();
  });

  protected readonly open = computed(() =>
    this.dispatches().filter(d => d.status !== 'reported' && d.status !== 'cancelled'));

  protected readonly overdue = computed(() => {
    const now = Date.now();
    return this.open().filter(d => d.expected_return_at && new Date(d.expected_return_at).getTime() < now);
  });

  async ngOnInit() {
    await this.refresh();
    // If invoked from the lab workflow board with ?orderId=<id>, pre-fill the
    // dispatch dialog with that order so the user only has to pick a lab.
    const orderId = this.route.snapshot.queryParamMap.get('orderId');
    if (orderId) {
      this.dlgOrderId = orderId;
      this.dispatchDialog.set(true);
    }
  }

  protected async refresh() {
    this.loading.set(true);
    try {
      const branchId = this.branchStore.activeBranchId() ?? undefined;
      const [labs, dispatches, pending, installed] = await Promise.all([
        this.svc.listLabs(branchId ?? null),
        this.svc.listDispatches({ branchId }),
        this.svc.listPendingDispatch(branchId),
        this.svc.routingInstalled(),
      ]);
      this.labs.set(labs);
      this.dispatches.set(dispatches);
      this.pending.set(pending);
      this.routingMissing.set(!installed);
    } catch (e: any) {
      this.toast.error('Could not load', e?.message ?? 'Try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected canDispatch(): boolean {
    return !!this.dlgOrderId.trim() && this.isUuid(this.dlgOrderId.trim()) && !!this.dlgLabId;
  }

  protected isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
  }

  protected async confirmDispatch() {
    if (!this.canDispatch()) return;
    this.busy.set(true);
    try {
      await this.svc.dispatch({
        labOrderId:       this.dlgOrderId.trim(),
        referenceLabId:   this.dlgLabId,
        courierName:      this.dlgCourier.trim() || undefined,
        awbNumber:        this.dlgAwb.trim() || undefined,
        expectedReturnAt: this.dlgExpected ? new Date(this.dlgExpected).toISOString() : null,
        notes:            this.dlgNotes.trim() || undefined,
      });
      this.toast.success('Dispatched', 'Sample sent to reference lab.');
      this.dispatchDialog.set(false);
      this.dlgOrderId = this.dlgLabId = this.dlgCourier = this.dlgAwb = this.dlgExpected = this.dlgNotes = '';
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not dispatch', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async acknowledge(d: ReferenceDispatchRow) {
    try {
      await this.svc.acknowledge(d.id);
      this.toast.success('Updated', 'Marked as in-transit.');
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not update', e?.message ?? 'Try again.');
    }
  }

  protected async receive(d: ReferenceDispatchRow) {
    try {
      await this.svc.markReceived(d.id);
      this.toast.success('Received', 'Reference lab acknowledged sample.');
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not update', e?.message ?? 'Try again.');
    }
  }

  protected openReport(d: ReferenceDispatchRow) {
    this.rpSummary = d.result_summary ?? '';
    this.rpPdfUrl  = d.result_pdf_url ?? '';
    this.reportFor.set(d);
  }

  /** Upload chosen file to the public `reference-reports` bucket and use the
   *  resulting public URL as rpPdfUrl. */
  protected async onReportFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      this.toast.error('File too large', 'PDF must be 25 MB or smaller.');
      return;
    }
    this.uploadingPdf.set(true);
    try {
      const d = this.reportFor();
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      const path = `dispatches/${d?.id ?? 'misc'}/${ts}-${safeName}`;
      const { error: upErr } = await (this.supabase.client as any).storage
        .from('reference-reports')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = (this.supabase.client as any).storage
        .from('reference-reports')
        .getPublicUrl(path);
      this.rpPdfUrl = pub?.publicUrl ?? '';
      this.toast.success('Uploaded', safeName);
    } catch (e: any) {
      this.toast.error('Upload failed', e?.message ?? 'Try again.');
    } finally {
      this.uploadingPdf.set(false);
      (ev.target as HTMLInputElement).value = '';
    }
  }

  protected async confirmReport() {
    const d = this.reportFor();
    if (!d || !this.rpSummary.trim()) return;
    this.busy.set(true);
    try {
      await this.svc.report(d.id, this.rpSummary.trim(), this.rpPdfUrl.trim() || null);
      this.toast.success('Reported', 'Result filed against the order.');
      this.reportFor.set(null);
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not save', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(d: ReferenceDispatchRow) {
    const reason = prompt('Cancel reason?');
    if (!reason) return;
    try {
      await this.svc.cancel(d.id, reason);
      this.toast.success('Cancelled', 'Dispatch released; order can be re-dispatched.');
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not cancel', e?.message ?? 'Try again.');
    }
  }

  // ── Reference-lab master CRUD ──────────────────────────
  protected resetLabForm() {
    this.labEditId.set(null);
    this.labCode = this.labName = this.labAccred = this.labContact = this.labPhone = this.labEmail = this.labAddress = '';
    this.labTat = null;
  }

  protected editLab(l: ReferenceLab) {
    this.labEditId.set(l.id);
    this.labCode    = l.code;
    this.labName    = l.name;
    this.labAccred  = l.accreditation ?? '';
    this.labTat     = l.default_tat_hours;
    this.labContact = l.contact_name ?? '';
    this.labPhone   = l.contact_phone ?? '';
    this.labEmail   = l.contact_email ?? '';
    this.labAddress = l.address ?? '';
  }

  protected async saveLab() {
    if (!this.labCode.trim() || !this.labName.trim()) return;
    this.busy.set(true);
    try {
      const branchId = this.branchStore.activeBranchId();
      const payload: any = {
        branch_id:         branchId,
        code:              this.labCode.trim().toUpperCase(),
        name:              this.labName.trim(),
        accreditation:     this.labAccred.trim() || null,
        default_tat_hours: this.labTat ?? null,
        contact_name:      this.labContact.trim() || null,
        contact_phone:     this.labPhone.trim() || null,
        contact_email:     this.labEmail.trim() || null,
        address:           this.labAddress.trim() || null,
      };
      const editId = this.labEditId();
      if (editId) payload.id = editId;
      await this.svc.upsertLab(payload);
      this.toast.success('Saved', editId ? 'Reference lab updated.' : 'Reference lab added.');
      this.resetLabForm();
      const labs = await this.svc.listLabs(branchId ?? null);
      this.labs.set(labs);
    } catch (e: any) {
      this.toast.error('Could not save', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected statusChip(s: ReferenceDispatchStatus) { return STATUS_CHIP[s]; }
  protected statusLabel(s: ReferenceDispatchStatus) {
    return ({ dispatched: 'Dispatched', in_transit: 'In transit', received: 'Received', reported: 'Reported', cancelled: 'Cancelled' } as const)[s];
  }
  protected countFor(s: ReferenceDispatchStatus) { return this.dispatches().filter(d => d.status === s).length; }
  protected isOverdue(d: ReferenceDispatchRow) {
    return d.expected_return_at && new Date(d.expected_return_at).getTime() < Date.now()
      && d.status !== 'reported' && d.status !== 'cancelled';
  }
  protected formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  /** Open the dispatch dialog with the order ID prefilled. */
  protected startDispatchFor(orderId: string) {
    this.dlgOrderId = orderId;
    this.dlgLabId = this.labs()[0]?.id ?? '';
    this.dlgCourier = '';
    this.dlgAwb = '';
    this.dlgExpected = '';
    this.dlgNotes = '';
    this.dispatchDialog.set(true);
  }
  /** Misrouted? Flip the order back to inhouse so it appears on the Workflow board. */
  protected async moveToInhouse(orderId: string) {
    this.busy.set(true);
    try {
      await this.svc.setOrderRouting(orderId, 'inhouse');
      this.toast.success('Moved to inhouse', 'Order now appears on the Lab workflow board.');
      await this.refresh();
    } catch (e: any) {
      this.toast.error('Could not move', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }
  protected tabCls(s: ReferenceDispatchStatus | null) {
    const active = this.statusFilter() === s;
    const base = 'h-7 px-3 inline-flex items-center rounded-full text-[11px] font-medium border';
    return active
      ? `${base} bg-primary-600 text-white border-primary-600`
      : `${base} bg-surface-card text-ink-soft border-border hover:bg-surface-subtle`;
  }
}
