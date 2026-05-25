import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, UserCog, Calculator, CircleCheck, Banknote, Stethoscope } from 'lucide-angular';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PayrollService, type PayrollRun, type SalaryPayment, type SalaryStructure } from '../data/payroll.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface PayrollRunExportRow {
  period: string;
  status: string;
  total_gross_cents: number;
  total_deductions_cents: number;
  total_net_cents: number;
}

interface PayrollLineExportRow {
  staff_name: string;
  gross_cents: number;
  pf_emp_cents: number;
  esi_emp_cents: number;
  pt_cents: number;
  tds_cents: number;
  net_cents: number;
  paid_at: string;
}

@Component({
  selector: 'app-payroll-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, DecimalPipe, ExportMenuComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconUser" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Payroll</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Salary structures · monthly run · approve · pay</p>
    </div>
    <app-export-menu [disabled]="runs().length === 0" (pick)="onExport($event)"
                     [label]="selectedRun() ? 'Export selected run' : 'Export runs list'"/>
  </header>

  <!-- ── Doctors-are-paid-differently callout ─────────────────────── -->
  <div class="bg-primary-50 border border-primary-200 rounded-[10px] px-4 py-3 flex items-start gap-3">
    <i-lucide [name]="iconDoc" [size]="18" class="text-primary-700 shrink-0 mt-0.5"></i-lucide>
    <div class="flex-1 text-[12.5px] text-primary-800">
      <strong>Doctors don't take a fixed salary.</strong> They earn commission per referred lab test.
      Configure their rates and run payouts under
      <a routerLink="/payroll/doctors" class="font-semibold underline hover:no-underline">Doctor Payouts</a>.
      This page only covers admin / lab-tech / reception / accountant / HR / pharmacist / nurse salaries.
    </div>
  </div>

  <!-- ── Run controls (write-only) ── -->
  @if (canWrite()) {
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
      <i-lucide [name]="iconCalc" [size]="16" class="text-primary-600"></i-lucide>
      Compute payroll for period
    </p>
    <div class="flex flex-wrap gap-3 items-end">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Year</span>
        <input type="number" [(ngModel)]="year"
               class="w-[100px] h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Month</span>
        <select [(ngModel)]="month"
                class="w-[120px] h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          @for (m of months; track m.n) { <option [value]="m.n">{{ m.n }} · {{ m.label }}</option> }
        </select>
      </label>
      <button type="button" (click)="compute()" [disabled]="busy()"
              class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700">
        Compute / refresh
      </button>
    </div>
  </section>
  }

  <!-- ── Runs list ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Payroll runs</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Period</th>
          <th class="text-right px-4 py-2 font-semibold">Gross</th>
          <th class="text-right px-4 py-2 font-semibold">Deductions</th>
          <th class="text-right px-4 py-2 font-semibold">Net payable</th>
          <th class="text-left px-4 py-2 font-semibold">Status</th>
          <th class="px-4 py-2 w-[260px]"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (r of runs(); track r.id) {
          <tr [class.bg-primary-50]="r.id === selectedRun()" class="cursor-pointer" (click)="selectRun(r.id)">
            <td class="px-4 py-2 font-mono">{{ r.period_year }}-{{ r.period_month | number: '2.0' }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.total_gross_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.total_deductions_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.total_net_cents) }}</td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-warn-bg]="r.status==='draft'"   [class.text-warn-fg]="r.status==='draft'"
                    [class.bg-good-bg]="r.status==='approved'"[class.text-good-fg]="r.status==='approved'"
                    [class.bg-primary-100]="r.status==='paid'"[class.text-primary-700]="r.status==='paid'">
                {{ r.status }}
              </span>
            </td>
            <td class="px-4 py-2 text-right">
              @if (r.status === 'draft' && canWrite()) {
                <button type="button" (click)="$event.stopPropagation(); approve(r)"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold border border-good-fg/40 text-good-fg hover:bg-good-bg/40 inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconCheck" [size]="14"></i-lucide><span>Approve</span>
                </button>
              }
              @if (r.status === 'approved' && canWrite()) {
                <button type="button" (click)="$event.stopPropagation(); pay(r)"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white hover:bg-primary-700 inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconBank" [size]="14"></i-lucide><span>Pay from bank</span>
                </button>
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="text-center py-8 text-ink-muted">No runs yet.</td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Run line items ── -->
  @if (selectedRun() && lines().length) {
    <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-5 py-3 border-b border-border">
        <p class="text-[13px] font-semibold text-ink">Salary lines</p>
      </header>
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
          <tr>
            <th class="text-left px-4 py-2 font-semibold">Staff</th>
            <th class="text-right px-4 py-2 font-semibold">Gross</th>
            <th class="text-right px-4 py-2 font-semibold">PF</th>
            <th class="text-right px-4 py-2 font-semibold">ESI</th>
            <th class="text-right px-4 py-2 font-semibold">PT</th>
            <th class="text-right px-4 py-2 font-semibold">TDS</th>
            <th class="text-right px-4 py-2 font-semibold">Net</th>
            <th class="text-left px-4 py-2 font-semibold">Paid</th>
            <th class="text-center px-4 py-2 font-semibold">Slip</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          @for (l of lines(); track l.id) {
            <tr>
              <td class="px-4 py-2">{{ l.staff_name }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(l.gross_cents) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(l.pf_emp_cents) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(l.esi_emp_cents) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(l.pt_cents) }}</td>
              <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(l.tds_cents) }}</td>
              <td class="px-4 py-2 text-right font-mono font-semibold">{{ svc.formatINR(l.net_cents) }}</td>
              <td class="px-4 py-2 text-[11px] text-ink-muted">{{ l.paid_at ? (l.paid_at | date: 'short') : '—' }}</td>
              <td class="px-4 py-2 text-center">
                <button type="button" (click)="downloadPayslip(l.id)"
                        title="Download payslip PDF"
                        class="h-7 px-2.5 rounded-md border border-primary-600 text-primary-700 text-[11px] font-medium hover:bg-primary-50">
                  ↓ PDF
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  }

  <!-- ── Salary structures ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border flex items-center justify-between">
      <p class="text-[13px] font-semibold text-ink">Salary structures</p>
      @if (canWrite()) {
        <button type="button" (click)="toggleStructForm()"
                class="h-8 px-3 rounded-md text-[12px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
          {{ showStructForm() ? 'Cancel' : '+ Add new' }}
        </button>
      }
    </header>

    @if (showStructForm()) {
      <div class="p-4 border-b border-border bg-surface-muted/40">
        <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">
          {{ editingId() ? 'Editing — ' + (editingStaffName() || 'staff') : 'New salary structure' }}
        </p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Staff (no doctors)</span>
            <select [(ngModel)]="newS.staff_id" [disabled]="!!editingId()"
                    class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card disabled:bg-surface-muted">
              <option value="">— staff —</option>
              @for (s of nonDoctorStaff(); track s.id) { <option [value]="s.id">{{ s.full_name }}</option> }
            </select>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Effective from</span>
            <input type="date" [(ngModel)]="newS.effective_from" [disabled]="!!editingId()"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card disabled:bg-surface-muted"/>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Basic (₹)</span>
            <input type="number" min="0" [(ngModel)]="newS.basic"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">HRA (₹)</span>
            <input type="number" min="0" [(ngModel)]="newS.hra"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Conveyance (₹)</span>
            <input type="number" min="0" [(ngModel)]="newS.conv"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Special (₹)</span>
            <input type="number" min="0" [(ngModel)]="newS.special"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          </label>
          <label class="block">
            <span class="block text-[10px] uppercase text-ink-muted mb-1">TDS %</span>
            <input type="number" min="0" max="40" step="0.5" [(ngModel)]="newS.tds_pct"
                   class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
          </label>
          <div class="flex items-end gap-2">
            <button type="button" (click)="saveStructure()" [disabled]="busy() || !newS.staff_id"
                    class="flex-1 h-9 px-3 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {{ busy() ? 'Saving…' : (editingId() ? 'Update' : 'Save') }}
            </button>
          </div>
        </div>
        <p class="text-[11px] text-ink-muted mt-2">
          Gross = Basic + HRA + Conv + Special.
          PF 12% on basic (capped at ₹15,000) · ESI 0.75% if gross ≤ ₹21,000 · PT ₹200/mo.
        </p>
      </div>
    }

    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Staff</th>
          <th class="text-left px-4 py-2 font-semibold">From</th>
          <th class="text-right px-4 py-2 font-semibold">Basic</th>
          <th class="text-right px-4 py-2 font-semibold">HRA</th>
          <th class="text-right px-4 py-2 font-semibold">Conv</th>
          <th class="text-right px-4 py-2 font-semibold">Special</th>
          <th class="text-right px-4 py-2 font-semibold">Gross</th>
          @if (canWrite()) { <th class="text-center px-4 py-2 font-semibold">Edit</th> }
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (s of nonDoctorStructures(); track s.id) {
          <tr [class.bg-primary-50]="editingId() === s.id">
            <td class="px-4 py-2">{{ s.staff_name }}</td>
            <td class="px-4 py-2">{{ s.effective_from }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.basic_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.hra_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.conveyance_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(s.special_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono font-semibold">
              {{ svc.formatINR(s.basic_cents + s.hra_cents + s.conveyance_cents + s.special_cents) }}
            </td>
            @if (canWrite()) {
              <td class="px-4 py-2 text-center">
                <button type="button" (click)="editStructure(s)"
                        class="h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle">
                  ✎ Edit
                </button>
              </td>
            }
          </tr>
        } @empty {
          <tr><td [attr.colspan]="canWrite() ? 8 : 7" class="text-center py-8 text-ink-muted">No salary structures defined.</td></tr>
        }
      </tbody>
    </table>
  </section>
</div>
  `,
})
export class PayrollPage implements OnInit {
  protected svc = inject(PayrollService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);
  private payslipPdf = inject(PayslipPdfService);

  protected async downloadPayslip(paymentId: string): Promise<void> {
    try {
      await this.payslipPdf.generate(paymentId);
    } catch (e: any) {
      this.toast.error('Could not open payslip', e?.message ?? 'Try again.');
    }
  }

  protected readonly iconUser  = UserCog;
  protected readonly iconCalc  = Calculator;
  protected readonly iconCheck = CircleCheck;
  protected readonly iconBank  = Banknote;
  protected readonly iconDoc   = Stethoscope;

  protected readonly busy           = signal(false);
  protected readonly runs           = signal<PayrollRun[]>([]);
  protected readonly selectedRun    = signal<string | null>(null);
  protected readonly lines          = signal<(SalaryPayment & { staff_name: string | null })[]>([]);
  protected readonly structures     = signal<(SalaryStructure & { staff_name: string | null; staff_role?: string | null })[]>([]);
  /** Doctors are commission-only (see /payroll/doctors). Hide them from the
   *  staff salary table so admins don't accidentally enter Basic/HRA for them. */
  protected readonly nonDoctorStructures = computed(() =>
    this.structures().filter((s) => (s.staff_role ?? '').toLowerCase() !== 'doctor'),
  );
  protected readonly nonDoctorStaff = computed(() =>
    this.staffList().filter((s) => (s.role_slug ?? '').toLowerCase() !== 'doctor'),
  );
  protected readonly staffList      = signal<{ id: string; full_name: string; role_slug: string | null }[]>([]);
  protected readonly showStructForm = signal(false);
  protected readonly canWrite       = computed(() => this.auth.has('ap.write'));

  protected year  = new Date().getFullYear();
  protected month = new Date().getMonth() + 1;
  protected readonly months = [
    { n: 1, label: 'Jan' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' }, { n: 4, label: 'Apr' },
    { n: 5, label: 'May' }, { n: 6, label: 'Jun' }, { n: 7, label: 'Jul' }, { n: 8, label: 'Aug' },
    { n: 9, label: 'Sep' }, { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
  ];

  protected newS = {
    staff_id: '', effective_from: new Date().toISOString().slice(0, 10),
    basic: 0, hra: 0, conv: 0, special: 0, tds_pct: 0,
  };
  /** When set, the form is editing this existing structure id. Locks
   *  staff + effective_from so we don't accidentally create a duplicate. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingStaffName = signal<string | null>(null);

  /** Show / hide the form, resetting the edit state when collapsing. */
  protected toggleStructForm(): void {
    const next = !this.showStructForm();
    this.showStructForm.set(next);
    if (!next) this.resetForm();
  }

  /** Pre-fill the form from an existing row and switch into "Update" mode. */
  protected editStructure(s: SalaryStructure & { staff_name: string | null }): void {
    this.editingId.set(s.id);
    this.editingStaffName.set(s.staff_name);
    this.newS = {
      staff_id: s.staff_id,
      effective_from: s.effective_from,
      basic:   s.basic_cents      / 100,
      hra:     s.hra_cents        / 100,
      conv:    s.conveyance_cents / 100,
      special: s.special_cents    / 100,
      tds_pct: s.tds_pct,
    };
    this.showStructForm.set(true);
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.editingStaffName.set(null);
    this.newS = {
      staff_id: '', effective_from: new Date().toISOString().slice(0, 10),
      basic: 0, hra: 0, conv: 0, special: 0, tds_pct: 0,
    };
  }

  async ngOnInit() {
    const [runs, structs, staff] = await Promise.all([
      this.svc.listRuns(this.branch.activeBranchId()),
      this.svc.listStructures(),
      this.svc.listStaff(),
    ]);
    this.runs.set(runs);
    this.structures.set(structs);
    this.staffList.set(staff);
  }

  protected async compute() {
    const bid = this.branch.activeBranchId(); if (!bid) { this.toast.error('Pick a branch'); return; }
    this.busy.set(true);
    try {
      const id = await this.svc.computeRun(bid, this.year, this.month);
      this.toast.success('Payroll computed');
      this.runs.set(await this.svc.listRuns(bid));
      this.selectRun(id);
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async selectRun(id: string) {
    this.selectedRun.set(id);
    this.lines.set(await this.svc.listRunPayments(id));
  }

  protected async approve(r: PayrollRun) {
    const sid = this.auth.staffId(); if (!sid) { this.toast.error('No staff'); return; }
    this.busy.set(true);
    try {
      await this.svc.approveRun(r.id, sid);
      this.toast.success('Payroll approved · accrual posted');
      this.runs.set(await this.svc.listRuns(this.branch.activeBranchId()));
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async pay(r: PayrollRun) {
    if (!confirm('Post bank payout for this payroll run?')) return;
    this.busy.set(true);
    try {
      await this.svc.payRun(r.id);
      this.toast.success('Payroll paid');
      this.runs.set(await this.svc.listRuns(this.branch.activeBranchId()));
      await this.selectRun(r.id);
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async saveStructure() {
    if (!this.newS.staff_id) return;
    this.busy.set(true);
    try {
      // ctc_cents is treated as the MONTHLY base by the payroll RPC (LOP per-day
      // = ctc / days_in_month). Previous code annualised it by ×12 which made
      // LOP wipe more than a full month's salary — fixed here.
      const monthlyCents =
        Math.round((this.newS.basic + this.newS.hra + this.newS.conv + this.newS.special) * 100);
      await this.svc.upsertStructure({
        id: this.editingId() ?? undefined,
        staff_id: this.newS.staff_id,
        effective_from: this.newS.effective_from,
        basic_cents:      Math.round(this.newS.basic   * 100),
        hra_cents:        Math.round(this.newS.hra     * 100),
        conveyance_cents: Math.round(this.newS.conv    * 100),
        special_cents:    Math.round(this.newS.special * 100),
        tds_pct:          this.newS.tds_pct,
        ctc_cents:        monthlyCents,
      });
      this.toast.success(this.editingId() ? 'Structure updated' : 'Structure saved');
      this.showStructForm.set(false);
      this.resetForm();
      this.structures.set(await this.svc.listStructures());
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    if (this.selectedRun() && this.lines().length > 0) {
      const lines = this.lines();
      const run = this.runs().find(r => r.id === this.selectedRun());
      const period = run ? `${run.period_year}-${String(run.period_month).padStart(2, '0')}` : '';

      const exportRows: PayrollLineExportRow[] = lines.map(l => ({
        staff_name:    l.staff_name ?? '',
        gross_cents:   l.gross_cents,
        pf_emp_cents:  l.pf_emp_cents,
        esi_emp_cents: l.esi_emp_cents,
        pt_cents:      l.pt_cents,
        tds_cents:     l.tds_cents,
        net_cents:     l.net_cents,
        paid_at:       l.paid_at ?? '',
      }));

      const columns: ExportColumn<PayrollLineExportRow>[] = [
        { key: 'staff_name',    header: 'Staff',     width: 28, align: 'left' },
        { key: 'gross_cents',   header: 'Gross (₹)', width: 16, align: 'right', format: 'inr_cents' },
        { key: 'pf_emp_cents',  header: 'PF (₹)',    width: 12, align: 'right', format: 'inr_cents' },
        { key: 'esi_emp_cents', header: 'ESI (₹)',   width: 12, align: 'right', format: 'inr_cents' },
        { key: 'pt_cents',      header: 'PT (₹)',    width: 10, align: 'right', format: 'inr_cents' },
        { key: 'tds_cents',     header: 'TDS (₹)',   width: 12, align: 'right', format: 'inr_cents' },
        { key: 'net_cents',     header: 'Net (₹)',   width: 16, align: 'right', format: 'inr_cents' },
        { key: 'paid_at',       header: 'Paid at',   width: 16, align: 'center', format: 'datetime' },
      ];

      const tot = lines.reduce((s, l) => ({
        gross: s.gross + l.gross_cents,
        pf:    s.pf    + l.pf_emp_cents,
        esi:   s.esi   + l.esi_emp_cents,
        pt:    s.pt    + l.pt_cents,
        tds:   s.tds   + l.tds_cents,
        net:   s.net   + l.net_cents,
      }), { gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, net: 0 });

      const report: ExportableReport<PayrollLineExportRow> = {
        filename: `Payroll_${period}_${this.branch.activeBranchName().replace(/\s+/g, '_')}`,
        title: 'Payroll Run',
        subtitle: `Period ${period} · ${lines.length} salary line${lines.length === 1 ? '' : 's'} · Status: ${run?.status ?? '—'}`,
        meta: { periodLabel: period },
        columns,
        rows: exportRows,
        grandTotals: {
          staff_name:    'TOTAL',
          gross_cents:   tot.gross,
          pf_emp_cents:  tot.pf,
          esi_emp_cents: tot.esi,
          pt_cents:      tot.pt,
          tds_cents:     tot.tds,
          net_cents:     tot.net,
        },
        footer: 'Sree Diagnostics · Payroll Run',
      };

      await this.exportSvc.export(fmt, report);
      return;
    }

    // No run selected → export runs list
    const runs = this.runs();
    if (runs.length === 0) return;

    const exportRows: PayrollRunExportRow[] = runs.map(r => ({
      period:                 `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
      status:                 r.status,
      total_gross_cents:      r.total_gross_cents,
      total_deductions_cents: r.total_deductions_cents,
      total_net_cents:        r.total_net_cents,
    }));

    const columns: ExportColumn<PayrollRunExportRow>[] = [
      { key: 'period',                 header: 'Period',          width: 10, align: 'left' },
      { key: 'status',                 header: 'Status',          width: 12, align: 'left' },
      { key: 'total_gross_cents',      header: 'Gross (₹)',       width: 16, align: 'right', format: 'inr_cents' },
      { key: 'total_deductions_cents', header: 'Deductions (₹)',  width: 18, align: 'right', format: 'inr_cents' },
      { key: 'total_net_cents',        header: 'Net payable (₹)', width: 18, align: 'right', format: 'inr_cents' },
    ];

    const tot = runs.reduce((s, r) => ({
      gross: s.gross + r.total_gross_cents,
      ded:   s.ded   + r.total_deductions_cents,
      net:   s.net   + r.total_net_cents,
    }), { gross: 0, ded: 0, net: 0 });

    const report: ExportableReport<PayrollRunExportRow> = {
      filename: `PayrollRuns_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Payroll Runs',
      subtitle: `${runs.length} run${runs.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      grandTotals: {
        period:                 'TOTAL',
        total_gross_cents:      tot.gross,
        total_deductions_cents: tot.ded,
        total_net_cents:        tot.net,
      },
      footer: 'Sree Diagnostics · Payroll Runs',
    };

    await this.exportSvc.export(fmt, report);
  }
}
