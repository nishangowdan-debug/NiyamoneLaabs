import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { BranchStore } from '../../../core/branches/branch.store';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { HomeCollectionService } from '../data/home-collection.service';
import {
  HomeCollectionRow,
  HomeCollectionStatus,
  Phlebotomist,
  STATUS_LABEL,
  STATUS_TONE,
} from '../data/home-collection.types';

@Component({
  selector: 'app-home-collection-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Home collection requests</h1>
        <p class="text-[13px] text-ink-muted mt-1">{{ rows().length }} request{{ rows().length === 1 ? '' : 's' }} · filter by status</p>
      </div>
      <a routerLink="/home-collection/new"
         class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New request
      </a>
    </header>

    <div class="flex items-center gap-2 mb-4 flex-wrap">
      @for (s of statusOptions; track s) {
        <button type="button" (click)="setStatus(s)" [class]="filterBtnCls(s)">
          {{ s === 'all' ? 'All' : labelFor(s) }}
        </button>
      }
    </div>

    @if (migrationMissing()) {
      <div class="mb-4"><app-alert tone="warn" title="Home Collection schema not installed">
        Run <code class="font-mono">db/migrations/20260515_lab_settings.sql</code> in Supabase SQL Editor to create the
        <code class="font-mono">home_collection_requests</code>, <code class="font-mono">home_collection_items</code>,
        <code class="font-mono">phlebotomists</code> and <code class="font-mono">lab_test_prices</code> tables.
      </app-alert></div>
    } @else if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load">{{ error() }}</app-alert></div>
    }

    <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">UHID</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Patient</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border whitespace-nowrap">Scheduled</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border whitespace-nowrap">Pincode</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border whitespace-nowrap">Phlebotomist</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border whitespace-nowrap">Total</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Status</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted">
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft">{{ r.patient?.uhid || '—' }}</td>
              <td class="px-4 py-2.5 text-[13px] text-ink">{{ r.patient?.first_name }} {{ r.patient?.last_name }} <span class="text-ink-muted text-[11px]">· {{ r.contact_mobile }}</span></td>
              <td class="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{{ r.scheduled_at | date:'dd MMM, h:mm a' }}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft">{{ r.address?.pincode }}</td>
              <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ asPhleb(r)?.full_name || '—' }}</td>
              <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">₹{{ r.total_inr | number:'1.2-2' }}</td>
              <td class="px-4 py-2.5"><span [class]="statusChipCls(r.status)">{{ labelFor(r.status) }}</span></td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                @if (r.status === 'requested' && canAssign()) {
                  <button type="button" (click)="openAssign(r)" class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 text-white hover:bg-primary-500">Assign</button>
                }
                @if (r.status === 'assigned') {
                  <button type="button" (click)="moveTo(r, 'en_route')" class="h-7 px-2.5 rounded-md text-[11px] border border-border hover:bg-surface-subtle">Mark en-route</button>
                }
                @if (r.status === 'en_route') {
                  <button type="button" (click)="openCollect(r)" class="h-7 px-2.5 rounded-md text-[11px] bg-good-fg text-white hover:opacity-90">Collected</button>
                }
                @if (r.status === 'collected') {
                  <button type="button" (click)="moveTo(r, 'received')" class="h-7 px-2.5 rounded-md text-[11px] border border-border hover:bg-surface-subtle">Receive at lab</button>
                }
                @if (canCancel(r.status)) {
                  <button type="button" (click)="cancel(r)" class="h-7 px-2.5 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg ml-1">Cancel</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="px-4 py-12 text-center text-[12px] text-ink-muted">No requests in this filter.</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (assignTarget()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="assignTarget.set(null)">
        <div class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5">
          <h2 class="font-display text-[18px] font-medium text-ink">Assign phlebotomist</h2>
          <p class="text-[12px] text-ink-muted mt-1">{{ assignTarget()?.patient?.first_name }} · pincode {{ assignTarget()?.address?.pincode }}</p>

          <label class="block mt-4">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Phlebotomist</span>
            <select [(ngModel)]="assignPhlebId" name="ap"
                    class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
              <option value="">— select —</option>
              @for (p of phlebotomists(); track p.id) {
                <option [value]="p.id">{{ p.staff?.full_name }} @if (p.vehicle_no) { · {{ p.vehicle_no }} }</option>
              }
            </select>
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="assignTarget.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmAssign()" [disabled]="!assignPhlebId" class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">Assign</button>
          </div>
        </div>
      </div>
    }

    @if (collectTarget()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="collectTarget.set(null)">
        <div class="w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5">
          <h2 class="font-display text-[18px] font-medium text-ink">Mark collected &amp; record payment</h2>
          <p class="text-[12px] text-ink-muted mt-1">Total: ₹{{ collectTarget()?.total_inr | number:'1.2-2' }}</p>

          <div class="grid grid-cols-2 gap-2 mt-4">
            <button type="button" (click)="payMethod.set('cash')" [class]="payBtnCls('cash')">Cash</button>
            <button type="button" (click)="payMethod.set('upi')"  [class]="payBtnCls('upi')">UPI</button>
          </div>
          @if (payMethod() === 'upi') {
            <label class="block mt-3">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">UPI txn ref</span>
              <input type="text" [(ngModel)]="payRef" name="pr"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          }
          <label class="block mt-3">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Amount collected (₹)</span>
            <input type="number" [(ngModel)]="payAmount" name="pa" min="0" step="1"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="collectTarget.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmCollect()" class="h-9 px-4 rounded-md bg-good-fg hover:opacity-90 text-white text-[12px] font-medium shadow-card">Save</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HomeCollectionListPage implements OnInit {
  private svc = inject(HomeCollectionService);
  private branchStore = inject(BranchStore);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);

  protected readonly rows = signal<HomeCollectionRow[]>([]);
  protected readonly phlebotomists = signal<Phlebotomist[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly migrationMissing = signal(false);
  protected readonly statusFilter = signal<HomeCollectionStatus | 'all'>('all');

  protected readonly statusOptions: Array<HomeCollectionStatus | 'all'> = [
    'all', 'requested', 'assigned', 'en_route', 'collected', 'received', 'cancelled',
  ];

  protected readonly canAssign = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.hasRole('lab_tech'),
  );

  protected readonly assignTarget = signal<HomeCollectionRow | null>(null);
  protected assignPhlebId = '';

  protected readonly collectTarget = signal<HomeCollectionRow | null>(null);
  protected readonly payMethod = signal<'cash' | 'upi'>('cash');
  protected payRef = '';
  protected payAmount = 0;

  constructor() {
    effect(() => {
      this.branchStore.activeBranchId();
      this.statusFilter();
      void this.reload();
    });
  }

  ngOnInit() { void this.reload(); }

  protected async reload() {
    const branchId = this.branchStore.activeBranchId();
    this.error.set(null);
    this.migrationMissing.set(false);
    try {
      const [rs, ps] = await Promise.all([
        this.svc.list(branchId, this.statusFilter()),
        this.svc.listPhlebotomists(branchId),
      ]);
      this.rows.set(rs);
      this.phlebotomists.set(ps);
    } catch (e: any) {
      const code = String(e?.code ?? '').toUpperCase();
      const msg = String(e?.message ?? e ?? '').toLowerCase();
      const missing = code === 'PGRST205' || code === '42P01'
        || /relation .* does not exist|could not find the table|schema cache|404/i.test(msg);
      if (missing) {
        this.migrationMissing.set(true);
      } else {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    }
  }

  protected setStatus(s: HomeCollectionStatus | 'all') { this.statusFilter.set(s); }
  protected labelFor(s: HomeCollectionStatus | 'all'): string { return s === 'all' ? 'All' : STATUS_LABEL[s]; }

  protected asPhleb(r: HomeCollectionRow): { full_name: string; vehicle_no: string | null } | null {
    return (r.phlebotomist as any) ?? null;
  }

  protected canCancel(s: HomeCollectionStatus): boolean {
    return s !== 'cancelled' && s !== 'received';
  }

  protected statusChipCls(s: HomeCollectionStatus): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s]}`;
  }

  protected filterBtnCls(s: HomeCollectionStatus | 'all'): string {
    const active = this.statusFilter() === s;
    const base = 'h-7 px-3 rounded-full text-[11px] font-medium';
    return active
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-muted text-ink-soft hover:bg-surface-subtle`;
  }

  protected payBtnCls(method: 'cash' | 'upi'): string {
    const active = this.payMethod() === method;
    const base = 'h-10 rounded-md text-[13px] font-medium border';
    return active
      ? `${base} bg-primary-50 border-primary-600 text-primary-700`
      : `${base} border-border text-ink-soft hover:bg-surface-subtle`;
  }

  protected openAssign(r: HomeCollectionRow) {
    this.assignTarget.set(r);
    this.assignPhlebId = '';
  }

  protected async confirmAssign() {
    const target = this.assignTarget();
    if (!target || !this.assignPhlebId) return;
    try {
      await this.svc.assign(target.id, this.assignPhlebId);
      this.toast.success('Assigned');
      this.assignTarget.set(null);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not assign', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected openCollect(r: HomeCollectionRow) {
    this.collectTarget.set(r);
    this.payMethod.set('cash');
    this.payRef = '';
    this.payAmount = Number(r.total_inr);
  }

  protected async confirmCollect() {
    const target = this.collectTarget();
    if (!target) return;
    try {
      await this.svc.recordPayment(target.id, this.payMethod(), this.payAmount, this.payRef || null);
      await this.svc.transition(target.id, 'collected');
      this.toast.success('Marked collected', `Paid ₹${this.payAmount} via ${this.payMethod()}`);
      this.collectTarget.set(null);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected async moveTo(r: HomeCollectionRow, next: HomeCollectionStatus) {
    try {
      await this.svc.transition(r.id, next);
      this.toast.success(`Marked ${STATUS_LABEL[next].toLowerCase()}`);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected async cancel(r: HomeCollectionRow) {
    const reason = prompt('Cancel reason?');
    if (!reason) return;
    try {
      await this.svc.cancel(r.id, reason);
      this.toast.warn('Cancelled');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not cancel', e instanceof Error ? e.message : 'Try again.');
    }
  }
}
