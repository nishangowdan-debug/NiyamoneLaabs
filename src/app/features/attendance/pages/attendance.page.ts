import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AttendanceService } from '../data/attendance.service';
import { STATUS_TONE, type AttendanceStatus, type RosterRow } from '../data/attendance.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface AttendanceExportRow {
  staff_code: string;
  full_name: string;
  role: string;
  status: string;
  in_at: string;
  out_at: string;
  hours: number | string;
  notes: string;
}

@Component({
  selector: 'app-attendance-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent, ExportMenuComponent],
  template: `
<div class="flex flex-col gap-4">

  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Attendance</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ formattedDate() }} · {{ counts().present }} present · {{ counts().late }} late ·
        {{ counts().leave }} on leave · {{ counts().absent }} absent
      </p>
    </div>
    <div class="flex items-center gap-2">
      <input type="date" [value]="date()" (change)="onDateChange($any($event.target).value)"
             class="h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <app-export-menu [disabled]="visibleRoster().length === 0" (pick)="onExport($event)"/>
    </div>
  </header>

  <!-- ── My check-in card (only if user has a staff record) ── -->
  @if (myStaff(); as me) {
    <article class="rounded-[12px] p-5 text-white shadow-card"
             style="background:linear-gradient(120deg, #0C2A52 0%, #0E4F8C 60%, #00C3FF 130%);">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p class="text-[12px] uppercase tracking-[0.06em] text-white/75">Hello {{ me.full_name }}</p>
          <p class="font-display text-[22px] font-medium leading-tight mt-0.5">
            @if (myAttendance()?.in_at) {
              ✓ Checked in at {{ formatTime(myAttendance()!.in_at!) }}
              @if (myAttendance()?.out_at) {
                · checked out at {{ formatTime(myAttendance()!.out_at!) }} ({{ myAttendance()?.hours ?? 0 }}h)
              }
            } @else {
              You haven't checked in yet today.
            }
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (!myAttendance()?.in_at) {
            <button (click)="checkInSelf()" [disabled]="busy()"
                    class="h-10 px-4 rounded-md bg-white text-primary-700 hover:bg-cyan-50 text-[13px] font-semibold shadow disabled:opacity-50">
              ▶ Check in
            </button>
          } @else if (!myAttendance()?.out_at) {
            <button (click)="checkOutSelf()" [disabled]="busy()"
                    class="h-10 px-4 rounded-md bg-white text-danger-fg hover:bg-cyan-50 text-[13px] font-semibold shadow disabled:opacity-50">
              ◼ Check out
            </button>
          } @else {
            <span class="h-10 px-4 inline-flex items-center rounded-md bg-white/15 text-white text-[13px] font-medium">All done for today ✓</span>
          }
        </div>
      </div>
    </article>
  }

  <!-- ── KPI strip ─────────────────────────────────────────── -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    @for (k of kpis(); track k.label) {
      <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">{{ k.label }}</p>
        <p class="font-display text-[24px] font-medium leading-none mt-1.5" [class]="k.tone">{{ k.value }}</p>
      </article>
    }
  </div>

  @if (error()) { <app-alert tone="danger" title="Could not load roster">{{ error() }}</app-alert> }

  <!-- ── Filter chips ──────────────────────────────────────── -->
  <div class="flex items-center gap-1.5 flex-wrap">
    @for (f of filterOptions; track f) {
      <button (click)="filter.set(f)" [class]="filterCls(f)" class="capitalize">
        {{ f === 'all' ? 'All' : (f === 'driver' ? 'Drivers' : f) }}
        <span class="ml-1 font-mono text-[10px] opacity-70">{{ filterCount(f) }}</span>
      </button>
    }
  </div>

  <!-- ── Roster ────────────────────────────────────────────── -->
  <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    @if (loading() && roster().length === 0) {
      <div class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (visibleRoster().length === 0) {
      <div class="px-4 py-12 text-center text-[13px] text-ink-soft">No staff in this view.</div>
    } @else {
      <table class="w-full">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Staff</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Role</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">In / Out</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Hours</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Status</th>
            @if (canManage()) { <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Actions</th> }
          </tr>
        </thead>
        <tbody>
          @for (r of visibleRoster(); track r.staff_id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted/40">
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2.5">
                  <div class="size-7 rounded-full bg-primary-100 text-primary-800 grid place-items-center font-display font-semibold text-[11px] shrink-0">
                    {{ initials(r.full_name) }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium text-ink truncate">{{ r.full_name }}</p>
                    <p class="text-[11px] font-mono text-ink-muted">{{ r.staff_code }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ r.role_slug.replace('_', ' ') }}</td>
              <td class="px-4 py-2.5 text-[12px] font-mono text-ink-soft whitespace-nowrap">
                {{ r.attendance?.in_at ? formatTime(r.attendance!.in_at!) : '—' }}
                @if (r.attendance?.out_at) { → {{ formatTime(r.attendance!.out_at!) }} }
              </td>
              <td class="px-4 py-2.5 text-[12px] font-mono text-ink-soft">{{ r.attendance?.hours ?? '—' }}</td>
              <td class="px-4 py-2.5">
                <span [class]="statusChipCls(r)">{{ statusLabel(r) }}</span>
              </td>
              @if (canManage()) {
                <td class="px-4 py-2.5 text-right">
                  <select (change)="onStatusChange(r, $any($event.target).value)" [value]="r.attendance?.status ?? 'absent'"
                          class="h-7 px-2 text-[11px] bg-surface-card border border-border rounded-md text-ink-soft focus:outline-none focus:border-primary-600">
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half day</option>
                    <option value="leave">Leave</option>
                    <option value="absent">Absent</option>
                    <option value="off">Off</option>
                  </select>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  </article>
</div>
  `,
})
export class AttendancePage implements OnInit {
  private svc = inject(AttendanceService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected readonly date    = signal(format(new Date(), 'yyyy-MM-dd'));
  protected readonly roster  = signal<RosterRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly busy    = signal(false);
  protected readonly myStaff = signal<{ id: string; full_name: string; role_slug: string } | null>(null);
  protected readonly filter  = signal<'all'|'present'|'late'|'absent'|'driver'|'doctor'|'nurse'>('all');

  protected readonly filterOptions = ['all','present','late','absent','driver','doctor','nurse'] as const;

  protected readonly canManage = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.has('staff.write')
  );

  protected readonly myAttendance = computed(() => {
    const me = this.myStaff();
    if (!me) return null;
    const r = this.roster().find(x => x.staff_id === me.id);
    return r?.attendance ?? null;
  });

  protected readonly counts = computed(() => {
    const r = this.roster();
    return {
      total:   r.length,
      present: r.filter(x => x.attendance?.status === 'present').length,
      late:    r.filter(x => x.attendance?.status === 'late').length,
      half_day:r.filter(x => x.attendance?.status === 'half_day').length,
      leave:   r.filter(x => x.attendance?.status === 'leave').length,
      absent:  r.filter(x => !x.attendance || x.attendance.status === 'absent').length,
    };
  });

  protected readonly kpis = computed(() => {
    const c = this.counts();
    return [
      { label: 'Total staff', value: c.total,    tone: 'text-ink' },
      { label: 'Present',     value: c.present,  tone: 'text-good-fg' },
      { label: 'Late',        value: c.late,     tone: c.late ? 'text-warn-fg' : 'text-ink' },
      { label: 'Half day',    value: c.half_day, tone: 'text-ink' },
      { label: 'On leave',    value: c.leave,    tone: 'text-info-fg' },
      { label: 'Absent',      value: c.absent,   tone: c.absent ? 'text-danger-fg' : 'text-ink' },
    ];
  });

  protected readonly visibleRoster = computed(() => {
    const f = this.filter();
    const all = this.roster();
    if (f === 'all') return all;
    if (f === 'present' || f === 'late' || f === 'absent') {
      return all.filter(r => {
        const s = r.attendance?.status ?? 'absent';
        return s === f;
      });
    }
    return all.filter(r => r.role_slug === f);
  });

  protected readonly formattedDate = computed(() => {
    try { return format(parseISO(this.date()), 'EEEE, d MMMM yyyy'); } catch { return this.date(); }
  });

  async ngOnInit() {
    this.svc.myStaff().then(s => this.myStaff.set(s));
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.roster.set(await this.svc.rosterForDate(this.date()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load');
    } finally {
      this.loading.set(false);
    }
  }

  protected onDateChange(d: string) { this.date.set(d); void this.reload(); }

  protected initials(name: string): string {
    return (name || '?').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  }
  protected formatTime(iso: string): string {
    try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
  }
  protected statusLabel(r: RosterRow): string {
    const s = r.attendance?.status ?? 'absent';
    return STATUS_TONE[s].label;
  }
  protected statusChipCls(r: RosterRow): string {
    const s = r.attendance?.status ?? 'absent';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${STATUS_TONE[s].chip}`;
  }
  protected filterCount(f: string): number {
    if (f === 'all') return this.roster().length;
    const c = this.counts();
    if (f === 'present') return c.present;
    if (f === 'late')    return c.late;
    if (f === 'absent')  return c.absent;
    return this.roster().filter(r => r.role_slug === f).length;
  }
  protected filterCls(f: string): string {
    const active = this.filter() === f;
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }

  protected async checkInSelf() {
    this.busy.set(true);
    try { await this.svc.checkIn(); this.toast.success('Checked in'); await this.reload(); }
    catch (e) { this.toast.error('Could not check in', e instanceof Error ? e.message : 'Try again'); }
    finally { this.busy.set(false); }
  }
  protected async checkOutSelf() {
    this.busy.set(true);
    try { await this.svc.checkOut(); this.toast.success('Checked out'); await this.reload(); }
    catch (e) { this.toast.error('Could not check out', e instanceof Error ? e.message : 'Try again'); }
    finally { this.busy.set(false); }
  }
  protected async onStatusChange(r: RosterRow, status: string) {
    if (!['present','late','half_day','leave','absent','off'].includes(status)) return;
    try {
      await this.svc.setStatus(r.staff_id, this.date(), status as AttendanceStatus);
      this.toast.success('Updated', `${r.full_name} → ${status}`);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again');
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const rows = this.visibleRoster();
    if (rows.length === 0) return;

    const exportRows: AttendanceExportRow[] = rows.map(r => ({
      staff_code: r.staff_code,
      full_name:  r.full_name,
      role:       r.role_slug,
      status:     r.attendance?.status ?? 'absent',
      in_at:      r.attendance?.in_at  ?? '',
      out_at:     r.attendance?.out_at ?? '',
      hours:      r.attendance?.hours ?? '',
      notes:      r.attendance?.notes ?? '',
    }));

    const columns: ExportColumn<AttendanceExportRow>[] = [
      { key: 'staff_code', header: 'Staff Code', width: 14, align: 'left' },
      { key: 'full_name',  header: 'Name',       width: 26, align: 'left' },
      { key: 'role',       header: 'Role',       width: 14, align: 'left' },
      { key: 'status',     header: 'Status',     width: 12, align: 'left' },
      { key: 'in_at',      header: 'Check-in',   width: 18, align: 'center', format: 'datetime' },
      { key: 'out_at',     header: 'Check-out',  width: 18, align: 'center', format: 'datetime' },
      { key: 'hours',      header: 'Hours',      width: 8,  align: 'right', format: 'number' },
      { key: 'notes',      header: 'Notes',      width: 28, align: 'left' },
    ];

    const c = this.counts();
    const report: ExportableReport<AttendanceExportRow> = {
      filename: `Attendance_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${this.date()}`,
      title: 'Attendance Roster',
      subtitle: `${this.formattedDate()} · ${rows.length} of ${this.roster().length} staff`,
      meta: {
        periodLabel: this.date(),
        filters: [
          { label: 'Present', value: String(c.present) },
          { label: 'Late',    value: String(c.late) },
          { label: 'Leave',   value: String(c.leave) },
          { label: 'Absent',  value: String(c.absent) },
        ],
      },
      columns,
      rows: exportRows,
      footer: 'Sree Diagnostics · Attendance Roster',
    };

    await this.exportSvc.export(fmt, report);
  }
}
