import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InsuranceAuthService } from '../data/insurance-auth.service';
import {
  AUTH_STATUS_LABELS, PAYER_TYPE_LABELS, REQUEST_TYPE_LABELS,
  type AuthRequestType, type AuthStatus, type InsuranceAuthorization,
  type InsurancePayer, type PayerType, type SponsorRelation,
} from '../data/insurance-auth.types';

type Tab = 'dashboard' | 'authorizations' | 'payers';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Insurance Pre-Authorization</h1>
      <p class="text-[12px] text-ink-soft">Cashless workflow · TPA / insurer / Govt schemes · settlement tracking</p>
    </div>
    <button (click)="showNew.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ New Authorization</button>
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

  <!-- DASHBOARD -->
  @if (tab() === 'dashboard') {
    <div class="grid md:grid-cols-4 gap-3">
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Pending Submission</p>
        <p class="text-3xl font-bold mt-1" [class.text-warn-fg]="countByStatus('draft') > 0">{{ countByStatus('draft') }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Awaiting Response</p>
        <p class="text-3xl font-bold mt-1">{{ countByStatus('submitted') + countByStatus('queried') }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Approved (active)</p>
        <p class="text-3xl font-bold mt-1 text-good-fg">{{ countByStatus('approved') + countByStatus('partial_approved') }}</p>
      </div>
      <div class="rounded-md border border-border bg-surface-card p-4">
        <p class="text-[10px] uppercase text-ink-soft">Approved Amount (₹)</p>
        <p class="text-2xl font-bold mt-1">{{ formatRupees(activeApprovedAmount()) }}</p>
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <div class="rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">By Status</h3>
        @for (row of statusBreakdown(); track row.status) {
          <div class="flex items-center gap-2 text-[12px] py-0.5">
            <span class="w-32">{{ statusLabel(row.status) }}</span>
            <div class="flex-1 bg-surface-subtle rounded h-3 relative">
              <div class="absolute left-0 top-0 h-3 bg-brand rounded"
                   [style.width.%]="(row.count / maxStatusCount()) * 100"></div>
            </div>
            <span class="w-10 text-right font-bold">{{ row.count }}</span>
          </div>
        }
      </div>

      <div class="rounded-md border border-border bg-surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Recent Settlements</h3>
        @if (recentSettlements().length === 0) {
          <p class="text-[12px] text-ink-soft">No settlements yet.</p>
        } @else {
          <table class="min-w-full text-[11px]">
            <thead class="text-ink-soft text-left">
              <tr><th class="px-2 py-1">Auth</th><th class="px-2 py-1">Bill</th>
                  <th class="px-2 py-1">Settled</th><th class="px-2 py-1">When</th></tr>
            </thead>
            <tbody>
              @for (a of recentSettlements(); track a.id) {
                <tr class="border-t border-border">
                  <td class="px-2 py-1 font-mono">{{ a.auth_no }}</td>
                  <td class="px-2 py-1">{{ formatRupees(a.final_bill_amount_cents ?? 0) }}</td>
                  <td class="px-2 py-1 text-good-fg font-bold">{{ formatRupees(a.settled_amount_cents ?? 0) }}</td>
                  <td class="px-2 py-1">{{ a.settled_at ? (a.settled_at | date:'shortDate') : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  }

  <!-- AUTHORIZATIONS -->
  @if (tab() === 'authorizations') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <select [(ngModel)]="statusFilter"
                class="rounded-md border border-border bg-surface px-2 py-1 text-[12px]">
          <option [ngValue]="null">All statuses</option>
          @for (s of allStatuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
        </select>
        <select [(ngModel)]="payerFilter"
                class="rounded-md border border-border bg-surface px-2 py-1 text-[12px]">
          <option [ngValue]="null">All payers</option>
          @for (p of payers(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
      </div>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Auth No</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Payer</th><th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">Diagnosis</th><th class="px-3 py-2 text-right">Estimated</th>
              <th class="px-3 py-2 text-right">Approved</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (a of filtered(); track a.id) {
            <tr class="border-t border-border"
                [class.bg-warn-fg]="a.status === 'queried'"
                [class.bg-danger-fg]="a.status === 'rejected' || a.status === 'denied_settlement'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ a.auth_no }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ payerName(a.payer_id) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ requestTypeLabel(a.request_type) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ truncate(a.provisional_diagnosis, 40) }}</td>
              <td class="px-3 py-2 text-right">{{ formatRupees(a.estimated_cost_cents) }}</td>
              <td class="px-3 py-2 text-right" [class.text-good-fg]="a.approved_amount_cents !== null">
                {{ a.approved_amount_cents !== null ? formatRupees(a.approved_amount_cents) : '—' }}
              </td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="a.status === 'approved' || a.status === 'settled'"
                      [class.bg-warn-fg]="a.status === 'queried' || a.status === 'partial_approved'"
                      [class.bg-danger-fg]="a.status === 'rejected' || a.status === 'denied_settlement'"
                      [class.bg-surface-subtle]="a.status === 'draft' || a.status === 'submitted' || a.status === 'cancelled'"
                      [class.text-white]="['approved','settled','queried','partial_approved','rejected','denied_settlement'].includes(a.status)">
                  {{ statusLabel(a.status) }}
                </span>
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="open(a)" class="text-[11px] text-brand hover:underline">Open</button>
              </td>
            </tr>
          }
          @if (filtered().length === 0) {
            <tr><td colspan="9" class="px-3 py-3 text-center text-ink-soft">No authorizations.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- PAYERS -->
  @if (tab() === 'payers') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 class="text-sm font-semibold">Payers ({{ payers().length }})</h2>
        <button (click)="openNewPayer()" class="px-3 py-1 text-[12px] rounded-md bg-brand text-white">+ New</button>
      </div>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Type</th><th class="px-3 py-2">Phone</th>
              <th class="px-3 py-2">Portal</th><th class="px-3 py-2">Active</th></tr>
        </thead>
        <tbody>
          @for (p of payers(); track p.id) {
            <tr class="border-t border-border" [class.opacity-50]="!p.is_active">
              <td class="px-3 py-2 font-mono">{{ p.code }}</td>
              <td class="px-3 py-2 font-semibold">{{ p.name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ payerTypeLabel(p.payer_type) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ p.contact_phone || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">
                @if (p.portal_url) {
                  <a [href]="p.portal_url" target="_blank" class="text-brand hover:underline">link</a>
                } @else { — }
              </td>
              <td class="px-3 py-2">
                <input type="checkbox" [checked]="p.is_active" (change)="togglePayerActive(p, $event)" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>

<!-- New auth dialog -->
@if (showNew()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="showNew.set(false)">
    <div class="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 class="text-base font-semibold">New Authorization Request</h3>
        <button (click)="showNew.set(false)">✕</button>
      </div>
      <div class="p-4 grid md:grid-cols-2 gap-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="nPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
          <input [(ngModel)]="nAdmissionId" placeholder="UUID (optional)"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Payer *</span>
          <select [(ngModel)]="nPayerId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (p of payers(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Request Type</span>
          <select [(ngModel)]="nRequestType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="initial">Initial</option>
            <option value="enhancement">Enhancement</option>
            <option value="extension">Extension</option>
            <option value="revision">Revision</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Policy No *</span>
          <input [(ngModel)]="nPolicyNo"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Member ID</span>
          <input [(ngModel)]="nMemberId"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Sponsor relation</span>
          <select [(ngModel)]="nSponsorRelation"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="self">Self</option><option value="spouse">Spouse</option>
            <option value="parent">Parent</option><option value="child">Child</option>
            <option value="sibling">Sibling</option><option value="employer">Employer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Employer (if corporate)</span>
          <input [(ngModel)]="nEmployer"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Provisional diagnosis *</span>
          <textarea rows="2" [(ngModel)]="nDiagnosis"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Treatment plan</span>
          <textarea rows="2" [(ngModel)]="nTreatment"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Estimated cost (₹) *</span>
          <input type="number" [(ngModel)]="nEstimateRupees"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Estimated LoS (days)</span>
          <input type="number" min="0" [(ngModel)]="nEstimateLos"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (nError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ nError() }}</p> }
      </div>
      <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button (click)="showNew.set(false)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="createAuth()"
                [disabled]="!nCanSubmit() || nBusy()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nBusy() ? 'Creating…' : 'Create draft' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Detail dialog -->
@if (selected(); as a) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="closeDetail()">
    <div class="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">{{ a.auth_no }} · {{ statusLabel(a.status) }}</h3>
          <p class="text-[11px] text-ink-soft">{{ payerName(a.payer_id) }} · Policy {{ a.insurance_policy_no }}</p>
        </div>
        <button (click)="closeDetail()">✕</button>
      </div>

      <div class="p-4 space-y-3 text-sm">
        <div class="grid md:grid-cols-2 gap-2 text-[12px]">
          <div class="rounded-md border border-border p-2">
            <p class="text-[10px] uppercase text-ink-soft">Estimated cost</p>
            <p class="font-bold">{{ formatRupees(a.estimated_cost_cents) }}</p>
            <p class="text-[10px] text-ink-soft">LoS: {{ a.estimated_los_days ?? '—' }}d</p>
          </div>
          <div class="rounded-md border border-border p-2">
            <p class="text-[10px] uppercase text-ink-soft">Approved</p>
            <p class="font-bold" [class.text-good-fg]="a.approved_amount_cents !== null">
              {{ a.approved_amount_cents !== null ? formatRupees(a.approved_amount_cents) : '—' }}
            </p>
            @if (a.approval_valid_until) {
              <p class="text-[10px] text-ink-soft">Valid until {{ a.approval_valid_until | date:'short' }}</p>
            }
          </div>
        </div>

        <div class="rounded-md border border-border p-2 text-[12px]">
          <p class="text-[10px] uppercase text-ink-soft">Provisional diagnosis</p>
          <p class="whitespace-pre-wrap">{{ a.provisional_diagnosis }}</p>
        </div>
        @if (a.treatment_plan) {
          <div class="rounded-md border border-border p-2 text-[12px]">
            <p class="text-[10px] uppercase text-ink-soft">Treatment plan</p>
            <p class="whitespace-pre-wrap">{{ a.treatment_plan }}</p>
          </div>
        }
        @if (a.query_text) {
          <div class="rounded-md border border-warn-fg/40 bg-warn-fg/10 p-2 text-[12px] text-warn-fg">
            <p class="text-[10px] uppercase font-bold">Query from payer</p>
            <p>{{ a.query_text }}</p>
          </div>
        }
        @if (a.rejection_reason) {
          <div class="rounded-md border border-danger-fg/40 bg-danger-fg/10 p-2 text-[12px] text-danger-fg">
            <p class="text-[10px] uppercase font-bold">Rejection reason</p>
            <p>{{ a.rejection_reason }}</p>
          </div>
        }

        @if (a.tpa_reference_no || a.insurer_reference_no) {
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            @if (a.tpa_reference_no) {
              <div class="rounded-md border border-border p-1.5">
                <p class="text-[9px] text-ink-soft uppercase">TPA Ref</p>
                <p class="font-mono">{{ a.tpa_reference_no }}</p>
              </div>
            }
            @if (a.insurer_reference_no) {
              <div class="rounded-md border border-border p-1.5">
                <p class="text-[9px] text-ink-soft uppercase">Insurer Ref</p>
                <p class="font-mono">{{ a.insurer_reference_no }}</p>
              </div>
            }
          </div>
        }

        @if (a.settled_at) {
          <div class="rounded-md border border-good-fg/40 bg-good-fg/10 p-3 text-[12px]">
            <p class="text-[10px] uppercase font-bold text-good-fg">Settled</p>
            <div class="grid grid-cols-2 gap-2 mt-1">
              <p>Final bill: <strong>{{ formatRupees(a.final_bill_amount_cents ?? 0) }}</strong></p>
              <p>Settled: <strong class="text-good-fg">{{ formatRupees(a.settled_amount_cents ?? 0) }}</strong></p>
              @if (a.copay_amount_cents) { <p>Co-pay: {{ formatRupees(a.copay_amount_cents) }}</p> }
              @if (a.patient_payable_cents) { <p>Patient payable: {{ formatRupees(a.patient_payable_cents) }}</p> }
              @if (a.settlement_utr) { <p class="col-span-2 font-mono text-[11px]">UTR: {{ a.settlement_utr }}</p> }
            </div>
          </div>
        }
      </div>

      <div class="px-4 py-3 border-t border-border flex flex-wrap justify-end gap-2">
        @if (a.status === 'draft' || a.status === 'queried') {
          <button (click)="submit(a)" class="px-3 py-1.5 text-sm rounded-md bg-brand text-white">Submit</button>
        }
        @if (a.status === 'submitted' || a.status === 'queried' || a.status === 'partial_approved') {
          <button (click)="recordApproval(a)" class="px-3 py-1.5 text-sm rounded-md border border-good-fg text-good-fg">Record Approval</button>
          <button (click)="recordQuery(a)" class="px-3 py-1.5 text-sm rounded-md border border-warn-fg text-warn-fg">Record Query</button>
          <button (click)="recordRejection(a)" class="px-3 py-1.5 text-sm rounded-md border border-danger-fg text-danger-fg">Record Rejection</button>
        }
        @if (a.status === 'approved' || a.status === 'partial_approved') {
          <button (click)="recordSettlement(a)" class="px-3 py-1.5 text-sm rounded-md bg-brand text-white">Record Settlement</button>
        }
        @if (!['settled','denied_settlement','cancelled'].includes(a.status)) {
          <button (click)="cancelAuth(a)" class="px-3 py-1.5 text-sm rounded-md border border-border text-danger-fg">Cancel</button>
        }
      </div>
    </div>
  </div>
}
  `,
})
export class InsuranceAuthPage implements OnInit {
  private svc = inject(InsuranceAuthService);

  protected tab = signal<Tab>('dashboard');
  protected auths = signal<InsuranceAuthorization[]>([]);
  protected payers = signal<InsurancePayer[]>([]);
  protected statusFilter: AuthStatus | null = null;
  protected payerFilter: string | null = null;

  protected showNew = signal(false);
  protected nPatientId = '';
  protected nAdmissionId = '';
  protected nPayerId: string | null = null;
  protected nRequestType: AuthRequestType = 'initial';
  protected nPolicyNo = '';
  protected nMemberId = '';
  protected nSponsorRelation: SponsorRelation = 'self';
  protected nEmployer = '';
  protected nDiagnosis = '';
  protected nTreatment = '';
  protected nEstimateRupees: number | null = null;
  protected nEstimateLos: number | null = null;
  protected nBusy = signal(false);
  protected nError = signal<string | null>(null);

  protected selected = signal<InsuranceAuthorization | null>(null);

  protected allStatuses: AuthStatus[] = ['draft','submitted','queried','approved','partial_approved','rejected','cancelled','settled','denied_settlement'];

  protected statusLabel = (s: AuthStatus) => AUTH_STATUS_LABELS[s];
  protected payerTypeLabel = (t: PayerType) => PAYER_TYPE_LABELS[t];
  protected requestTypeLabel = (t: AuthRequestType) => REQUEST_TYPE_LABELS[t];
  protected payerName = (id: string) => this.payers().find(p => p.id === id)?.name ?? id.slice(0,8);

  protected formatRupees(cents: number): string {
    return '₹' + (cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  protected truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n) + '…'; }

  protected filtered = computed(() => {
    return this.auths().filter(a =>
      (!this.statusFilter || a.status === this.statusFilter) &&
      (!this.payerFilter || a.payer_id === this.payerFilter),
    );
  });

  protected countByStatus(s: AuthStatus): number {
    return this.auths().filter(a => a.status === s).length;
  }

  protected statusBreakdown = computed(() =>
    this.allStatuses.map(s => ({ status: s, count: this.countByStatus(s) }))
      .filter(r => r.count > 0).sort((a, b) => b.count - a.count),
  );
  protected maxStatusCount = computed(() =>
    Math.max(1, ...this.statusBreakdown().map(r => r.count)),
  );

  protected activeApprovedAmount = computed(() =>
    this.auths()
      .filter(a => (a.status === 'approved' || a.status === 'partial_approved'))
      .reduce((s, a) => s + (a.approved_amount_cents ?? 0), 0),
  );

  protected recentSettlements = computed(() =>
    this.auths().filter(a => a.status === 'settled')
      .sort((x, y) => +new Date(y.settled_at || 0) - +new Date(x.settled_at || 0))
      .slice(0, 8),
  );

  protected tabs = [
    { id: 'dashboard'      as Tab, label: 'Dashboard',     count: () => this.countByStatus('submitted') + this.countByStatus('queried') },
    { id: 'authorizations' as Tab, label: 'Authorizations', count: () => this.auths().length },
    { id: 'payers'         as Tab, label: 'Payers',        count: () => this.payers().length },
  ];

  protected nCanSubmit = () =>
    !!this.nPatientId.trim() && !!this.nPayerId && !!this.nPolicyNo.trim()
    && !!this.nDiagnosis.trim() && this.nEstimateRupees !== null && this.nEstimateRupees > 0;

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [auths, payers] = await Promise.all([this.svc.list({}), this.svc.listPayers(false)]);
      this.auths.set(auths);
      this.payers.set(payers);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async createAuth() {
    if (!this.nCanSubmit() || this.nBusy()) return;
    this.nBusy.set(true); this.nError.set(null);
    try {
      await this.svc.create({
        patientId: this.nPatientId.trim(),
        payerId: this.nPayerId!,
        insurancePolicyNo: this.nPolicyNo.trim(),
        provisionalDiagnosis: this.nDiagnosis.trim(),
        estimatedCostCents: Math.round(this.nEstimateRupees! * 100),
        admissionId: this.nAdmissionId.trim() || null,
        memberId: this.nMemberId.trim() || null,
        sponsorRelation: this.nSponsorRelation,
        employerName: this.nEmployer.trim() || null,
        treatmentPlan: this.nTreatment.trim() || null,
        estimatedLosDays: this.nEstimateLos,
        requestType: this.nRequestType,
      });
      this.showNew.set(false);
      this.nPatientId = ''; this.nAdmissionId = ''; this.nPolicyNo = '';
      this.nMemberId = ''; this.nDiagnosis = ''; this.nTreatment = '';
      this.nEstimateRupees = null; this.nEstimateLos = null; this.nEmployer = '';
      await this.refresh();
    } catch (e: any) { this.nError.set(e?.message ?? 'Failed'); }
    finally { this.nBusy.set(false); }
  }

  protected open(a: InsuranceAuthorization) { this.selected.set(a); }
  protected closeDetail() { this.selected.set(null); }

  protected async submit(a: InsuranceAuthorization) {
    const tpaRef = prompt('TPA reference no (optional)?') ?? '';
    try { await this.svc.submit(a.id, tpaRef.trim() || undefined); await this.refresh(); this.selected.set(null); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async recordApproval(a: InsuranceAuthorization) {
    const amount = prompt('Approved amount (₹)?');
    if (!amount) return;
    const validUntil = prompt('Valid until (YYYY-MM-DD)?') ?? '';
    const partial = confirm('Is this a partial approval? (OK = partial, Cancel = full)');
    try {
      await this.svc.recordResponse({
        id: a.id,
        status: partial ? 'partial_approved' : 'approved',
        approvedAmountCents: Math.round(Number(amount) * 100),
        approvalValidUntil: validUntil ? new Date(validUntil).toISOString() : null,
      });
      await this.refresh(); this.selected.set(null);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async recordQuery(a: InsuranceAuthorization) {
    const q = prompt('Query text from payer?');
    if (!q) return;
    try { await this.svc.recordResponse({ id: a.id, status: 'queried', queryText: q }); await this.refresh(); this.selected.set(null); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async recordRejection(a: InsuranceAuthorization) {
    const r = prompt('Rejection reason?');
    if (!r) return;
    try { await this.svc.recordResponse({ id: a.id, status: 'rejected', rejectionReason: r }); await this.refresh(); this.selected.set(null); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async recordSettlement(a: InsuranceAuthorization) {
    const finalBill = prompt('Final bill amount (₹)?');  if (!finalBill) return;
    const settled = prompt('Settled amount from payer (₹)?'); if (!settled) return;
    const utr = prompt('Settlement UTR / reference?') ?? '';
    const copay = prompt('Co-pay amount (₹, default 0)?') ?? '0';
    const payable = prompt('Patient payable (₹, default 0)?') ?? '0';
    try {
      await this.svc.recordSettlement({
        id: a.id,
        finalBillCents: Math.round(Number(finalBill) * 100),
        settledAmountCents: Math.round(Number(settled) * 100),
        settlementUtr: utr.trim() || null,
        copayCents: Math.round(Number(copay) * 100),
        patientPayableCents: Math.round(Number(payable) * 100),
      });
      await this.refresh(); this.selected.set(null);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async cancelAuth(a: InsuranceAuthorization) {
    const reason = prompt('Cancellation reason?');
    if (!reason) return;
    try { await this.svc.cancel(a.id, reason); await this.refresh(); this.selected.set(null); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  // Payers
  protected openNewPayer() {
    const code = prompt('Code (short)?'); if (!code) return;
    const name = prompt('Name?'); if (!name) return;
    const type = prompt('Type (tpa/insurer/govt_scheme/corporate)?', 'tpa') ?? 'tpa';
    const phone = prompt('Phone?') ?? '';
    this.svc.createPayer({
      code: code.trim(), name: name.trim(),
      payer_type: type as PayerType,
      contact_phone: phone.trim() || null,
      is_active: true,
    }).then(() => this.refresh()).catch(e => alert(e?.message ?? 'Failed'));
  }

  protected togglePayerActive(p: InsurancePayer, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.svc.updatePayer(p.id, { is_active: checked }).then(() => this.refresh()).catch(e => alert(e?.message ?? 'Failed'));
  }
}
