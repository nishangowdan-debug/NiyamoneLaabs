import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface LeaveExportRow {
  staff_name: string;
  role: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  medical_cert: string;
  status: string;
  created_at: string;
}

interface SwapExportRow {
  requester: string;
  requester_shift: string;
  responder: string;
  responder_shift: string;
  swap_date: string;
  reason: string;
  status: string;
  created_at: string;
}

type LeaveStatus = 'pending' | 'approved' | 'rejected';
type LeaveType = 'sick' | 'earned' | 'casual' | 'conference' | 'maternity' | 'unpaid';

interface LeaveRequest {
  id: string;
  staff_id: string;
  staff_name: string;
  role_slug: string;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  medical_cert: boolean;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ShiftSwap {
  id: string;
  requester_name: string;
  requester_shift: string;
  responder_name: string;
  responder_shift: string;
  swap_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  sick: 'Sick Leave',
  earned: 'Earned Leave',
  casual: 'Casual Leave',
  conference: 'Conference',
  maternity: 'Maternity',
  unpaid: 'Unpaid Leave',
};

@Component({
  selector: 'app-leave-management-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ──────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <a routerLink="/attendance" class="text-[12px] text-primary-600 hover:underline font-medium">&larr; Attendance</a>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">
          Leave & Shift Swaps
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Manage leave requests and shift swap approvals.</p>
      </div>
      <app-export-menu
        [disabled]="(activeTab() === 'leave' ? filteredLeaves().length : swaps().length) === 0"
        (pick)="onExport($event)"/>
    </header>

    <!-- ── Tabs ───────────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-5 bg-surface-muted rounded-lg p-1 w-fit">
      <button type="button" (click)="activeTab.set('leave')"
              [class]="activeTab() === 'leave' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        Leave Requests
        <span class="ml-1.5 text-[10px] font-mono opacity-70">{{ pendingLeaveCount() }}</span>
      </button>
      <button type="button" (click)="activeTab.set('swaps')"
              [class]="activeTab() === 'swaps' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        Shift Swaps
        <span class="ml-1.5 text-[10px] font-mono opacity-70">{{ pendingSwapCount() }}</span>
      </button>
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- ── Leave Requests Table ───────────────────────────── -->
    @if (activeTab() === 'leave') {
      <!-- Filter -->
      <div class="flex items-center gap-2 mb-4">
        <button type="button" (click)="leaveFilter.set('pending')"
                [class]="leaveFilterCls('pending')">Pending ({{ pendingLeaveCount() }})</button>
        <button type="button" (click)="leaveFilter.set('all')"
                [class]="leaveFilterCls('all')">All</button>
        <button type="button" (click)="leaveFilter.set('approved')"
                [class]="leaveFilterCls('approved')">Approved</button>
        <button type="button" (click)="leaveFilter.set('rejected')"
                [class]="leaveFilterCls('rejected')">Rejected</button>
      </div>

      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Staff</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Type</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">From</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">To</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Days</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Reason</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Status</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading...</td></tr>
            } @else {
              @for (req of filteredLeaves(); track req.id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                  <td class="px-4 py-2.5">
                    <p class="text-[13px] font-medium text-ink">{{ req.staff_name }}</p>
                    <p class="text-[10px] text-ink-muted capitalize">{{ req.role_slug.replace('_', ' ') }}</p>
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="inline-flex items-center h-[20px] px-2 rounded-full bg-surface-muted text-[10px] font-medium text-ink-soft">
                      {{ leaveTypeLabel(req.leave_type) }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ formatDate(req.from_date) }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ formatDate(req.to_date) }}</td>
                  <td class="px-4 py-2.5 text-[12px] font-mono text-ink text-right">{{ req.days }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft max-w-[180px] truncate">{{ req.reason }}</td>
                  <td class="px-4 py-2.5">
                    <span [class]="leaveStatusCls(req.status)">{{ req.status }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right">
                    @if (req.status === 'pending' && canApprove()) {
                      <div class="inline-flex items-center gap-1">
                        <button (click)="approveLeave(req.id)" [disabled]="busy() === req.id"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-good-fg text-white hover:bg-good-fg/90 disabled:opacity-50">Approve</button>
                        <button (click)="rejectLeave(req.id)" [disabled]="busy() === req.id"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium text-danger-fg hover:bg-danger-bg disabled:opacity-50">Reject</button>
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="px-4 py-12 text-center text-[13px] text-ink-muted">No leave requests found.</td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    }

    <!-- ── Shift Swaps Table ──────────────────────────────── -->
    @if (activeTab() === 'swaps') {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Requester</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Their shift</th>
              <th class="text-center px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">&harr;</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Swap with</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Their shift</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Date</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Reason</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Status</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (swap of swaps(); track swap.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5 text-[13px] text-ink font-medium">{{ swap.requester_name }}</td>
                <td class="px-4 py-2.5"><span class="inline-flex items-center h-5 px-2 rounded bg-info-bg text-info-fg text-[10px] font-medium">{{ swap.requester_shift }}</span></td>
                <td class="px-4 py-2.5 text-center text-ink-muted">&harr;</td>
                <td class="px-4 py-2.5 text-[13px] text-ink font-medium">{{ swap.responder_name }}</td>
                <td class="px-4 py-2.5"><span class="inline-flex items-center h-5 px-2 rounded bg-warn-bg text-warn-fg text-[10px] font-medium">{{ swap.responder_shift }}</span></td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft">{{ formatDate(swap.swap_date) }}</td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft max-w-[140px] truncate">{{ swap.reason }}</td>
                <td class="px-4 py-2.5">
                  <span [class]="leaveStatusCls(swap.status)">{{ swap.status }}</span>
                </td>
                <td class="px-4 py-2.5 text-right">
                  @if (swap.status === 'pending' && canApprove()) {
                    <div class="inline-flex items-center gap-1">
                      <button (click)="approveSwap(swap.id)" [disabled]="busy() === swap.id"
                              class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-good-fg text-white hover:bg-good-fg/90 disabled:opacity-50">Approve</button>
                      <button (click)="rejectSwap(swap.id)" [disabled]="busy() === swap.id"
                              class="h-7 px-2.5 rounded-md text-[11px] font-medium text-danger-fg hover:bg-danger-bg disabled:opacity-50">Reject</button>
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="px-4 py-12 text-center text-[13px] text-ink-muted">No shift swap requests.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LeaveManagementPage implements OnInit {
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);
  private auth = inject(AuthStore);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly activeTab = signal<'leave' | 'swaps'>('leave');
  protected readonly leaveFilter = signal<'all' | LeaveStatus>('pending');
  protected readonly leaves = signal<LeaveRequest[]>([]);
  protected readonly swaps = signal<ShiftSwap[]>([]);
  protected readonly busy = signal<string | null>(null);

  protected readonly canApprove = computed(() =>
    this.auth.hasRole('super_admin', 'branch_admin', 'hr', 'doctor')
  );

  protected readonly pendingLeaveCount = computed(() =>
    this.leaves().filter(l => l.status === 'pending').length
  );

  protected readonly pendingSwapCount = computed(() =>
    this.swaps().filter(s => s.status === 'pending').length
  );

  protected readonly filteredLeaves = computed(() => {
    const f = this.leaveFilter();
    if (f === 'all') return this.leaves();
    return this.leaves().filter(l => l.status === f);
  });

  ngOnInit() {
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const [{ data: lData, error: lErr }, { data: sData, error: sErr }] = await Promise.all([
        (this.supabase.client as any).from('leave_requests').select('*').order('created_at', { ascending: false }).limit(100),
        (this.supabase.client as any).from('shift_swaps').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (lErr) throw lErr;
      if (sErr) throw sErr;
      this.leaves.set((lData ?? []) as LeaveRequest[]);
      this.swaps.set((sData ?? []) as ShiftSwap[]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async approveLeave(id: string) {
    this.busy.set(id);
    try {
      await (this.supabase.client as any).from('leave_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
      this.toast.success('Leave approved');
      await this.load();
    } catch { this.toast.error('Failed', 'Try again'); }
    finally { this.busy.set(null); }
  }

  protected async rejectLeave(id: string) {
    this.busy.set(id);
    try {
      await (this.supabase.client as any).from('leave_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id);
      this.toast.success('Leave rejected');
      await this.load();
    } catch { this.toast.error('Failed', 'Try again'); }
    finally { this.busy.set(null); }
  }

  protected async approveSwap(id: string) {
    this.busy.set(id);
    try {
      await (this.supabase.client as any).from('shift_swaps').update({ status: 'approved' }).eq('id', id);
      this.toast.success('Swap approved');
      await this.load();
    } catch { this.toast.error('Failed', 'Try again'); }
    finally { this.busy.set(null); }
  }

  protected async rejectSwap(id: string) {
    this.busy.set(id);
    try {
      await (this.supabase.client as any).from('shift_swaps').update({ status: 'rejected' }).eq('id', id);
      this.toast.success('Swap rejected');
      await this.load();
    } catch { this.toast.error('Failed', 'Try again'); }
    finally { this.busy.set(null); }
  }

  protected leaveTypeLabel(t: LeaveType): string {
    return LEAVE_TYPE_LABEL[t] ?? t;
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '\u2014'; }
  }

  protected leaveStatusCls(status: string): string {
    const base = 'inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium capitalize';
    if (status === 'approved') return `${base} bg-good-bg text-good-fg`;
    if (status === 'rejected') return `${base} bg-danger-bg text-danger-fg`;
    return `${base} bg-warn-bg text-warn-fg`;
  }

  protected leaveFilterCls(filter: string): string {
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return this.leaveFilter() === filter
      ? `${base} bg-primary-100 text-primary-800`
      : `${base} text-ink-muted hover:text-ink hover:bg-surface-subtle`;
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    if (this.activeTab() === 'leave') {
      const rows = this.filteredLeaves();
      if (rows.length === 0) return;

      const exportRows: LeaveExportRow[] = rows.map(r => ({
        staff_name:   r.staff_name,
        role:         r.role_slug.replace(/_/g, ' '),
        leave_type:   this.leaveTypeLabel(r.leave_type),
        from_date:    r.from_date,
        to_date:      r.to_date,
        days:         r.days,
        reason:       r.reason,
        medical_cert: r.medical_cert ? 'Yes' : 'No',
        status:       r.status,
        created_at:   r.created_at,
      }));

      const columns: ExportColumn<LeaveExportRow>[] = [
        { key: 'staff_name',   header: 'Staff',       width: 22, align: 'left' },
        { key: 'role',         header: 'Role',        width: 12, align: 'left' },
        { key: 'leave_type',   header: 'Type',        width: 16, align: 'left' },
        { key: 'from_date',    header: 'From',        width: 12, align: 'center', format: 'date' },
        { key: 'to_date',      header: 'To',          width: 12, align: 'center', format: 'date' },
        { key: 'days',         header: 'Days',        width: 6,  align: 'right',  format: 'number' },
        { key: 'reason',       header: 'Reason',      width: 24, align: 'left' },
        { key: 'medical_cert', header: 'Med. cert.',  width: 10, align: 'center' },
        { key: 'status',       header: 'Status',      width: 10, align: 'left' },
        { key: 'created_at',   header: 'Submitted',   width: 18, align: 'center', format: 'datetime' },
      ];

      const report: ExportableReport<LeaveExportRow> = {
        filename: `LeaveRequests_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
        title: 'Leave Requests',
        subtitle: `${rows.length} request${rows.length === 1 ? '' : 's'} · filter: ${this.leaveFilter()}`,
        meta: { filters: [{ label: 'Filter', value: this.leaveFilter() }] },
        columns,
        rows: exportRows,
        footer: 'Sree Diagnostics · Leave Register',
      };

      await this.exportSvc.export(fmt, report);
      return;
    }

    // Shift swaps
    const rows = this.swaps();
    if (rows.length === 0) return;

    const exportRows: SwapExportRow[] = rows.map(s => ({
      requester:        s.requester_name,
      requester_shift:  s.requester_shift,
      responder:        s.responder_name,
      responder_shift:  s.responder_shift,
      swap_date:        s.swap_date,
      reason:           s.reason,
      status:           s.status,
      created_at:       s.created_at,
    }));

    const columns: ExportColumn<SwapExportRow>[] = [
      { key: 'requester',       header: 'Requester',       width: 22, align: 'left' },
      { key: 'requester_shift', header: 'Requester shift', width: 18, align: 'left' },
      { key: 'responder',       header: 'Responder',       width: 22, align: 'left' },
      { key: 'responder_shift', header: 'Responder shift', width: 18, align: 'left' },
      { key: 'swap_date',       header: 'Swap date',       width: 12, align: 'center', format: 'date' },
      { key: 'reason',          header: 'Reason',          width: 24, align: 'left' },
      { key: 'status',          header: 'Status',          width: 10, align: 'left' },
      { key: 'created_at',      header: 'Submitted',       width: 18, align: 'center', format: 'datetime' },
    ];

    const report: ExportableReport<SwapExportRow> = {
      filename: `ShiftSwaps_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Shift Swap Requests',
      subtitle: `${rows.length} request${rows.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      footer: 'Sree Diagnostics · Shift Swap Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
