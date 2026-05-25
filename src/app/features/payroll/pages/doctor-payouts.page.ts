import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Stethoscope, Calculator, Banknote, FileText, BarChart3 } from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PayrollService, type DoctorPayout, type DoctorCommissionRule, type DoctorPayoutItem, type LabTestCommissionRow, type DoctorReferralRow } from '../data/payroll.service';
import { DoctorPayslipService } from '../services/doctor-payslip.service';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface DocPayoutExportRow {
  doctor_name: string;
  period_start: string;
  period_end: string;
  visits_count: number;
  total_amount_cents: number;
  tds_cents: number;
  net_cents: number;
  status: string;
}

@Component({
  selector: 'app-doctor-payouts-page',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-3 border-b border-border flex-wrap gap-3">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1] inline-flex items-center gap-2">
        <i-lucide [name]="iconDoc" [size]="26" [strokeWidth]="1.75" class="text-primary-600"></i-lucide>
        <span>Doctor Payouts</span>
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">Compute per-doctor fees from visits · approve · pay</p>
    </div>
    <app-export-menu [disabled]="payouts().length === 0" (pick)="onExport($event)"/>
  </header>

  <!-- ── Compute new payout (write-only) ── -->
  @if (canWrite()) {
  <section class="bg-surface-card border border-border rounded-[12px] p-5">
    <p class="text-[13px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
      <i-lucide [name]="iconCalc" [size]="16" class="text-primary-600"></i-lucide>
      Compute payout
    </p>
    <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Doctor</span>
        <select [(ngModel)]="form.doctorId"
                class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
          <option value="">— select —</option>
          @for (d of doctors(); track d.id) { <option [value]="d.id">{{ d.full_name }}</option> }
        </select>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Period start</span>
        <input type="date" [(ngModel)]="form.start"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">Period end</span>
        <input type="date" [(ngModel)]="form.end"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <label>
        <span class="block text-[11px] text-ink-muted mb-1">TDS %</span>
        <input type="number" min="0" max="40" step="0.5" [(ngModel)]="form.tdsPct"
               class="w-full h-9 px-3 text-[13px] rounded-md border border-border bg-surface-card"/>
      </label>
      <div class="flex items-end">
        <button type="button" (click)="compute()" [disabled]="busy() || !form.doctorId"
                class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
          Compute
        </button>
      </div>
    </div>
  </section>
  }

  <!-- ── Payouts list ── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border">
      <p class="text-[13px] font-semibold text-ink">Payouts</p>
    </header>
    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Doctor</th>
          <th class="text-left px-4 py-2 font-semibold">Period</th>
          <th class="text-right px-4 py-2 font-semibold">Visits</th>
          <th class="text-right px-4 py-2 font-semibold">Gross</th>
          <th class="text-right px-4 py-2 font-semibold">TDS</th>
          <th class="text-right px-4 py-2 font-semibold">Net</th>
          <th class="text-left px-4 py-2 font-semibold">Status</th>
          <th class="px-4 py-2 w-[150px]"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (p of payouts(); track p.id) {
          <tr>
            <td class="px-4 py-2">{{ p.doctor_name }}</td>
            <td class="px-4 py-2">{{ p.period_start }} → {{ p.period_end }}</td>
            <td class="px-4 py-2 text-right">{{ p.visits_count }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(p.total_amount_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(p.tds_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono font-semibold">{{ svc.formatINR(p.net_cents) }}</td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-warn-bg]="p.status==='draft'"   [class.text-warn-fg]="p.status==='draft'"
                    [class.bg-good-bg]="p.status==='approved'"[class.text-good-fg]="p.status==='approved'"
                    [class.bg-primary-100]="p.status==='paid'"[class.text-primary-700]="p.status==='paid'">
                {{ p.status }}
              </span>
            </td>
            <td class="px-4 py-2 text-right">
              <div class="inline-flex items-center gap-1.5">
                <button type="button" (click)="viewBreakdown(p)"
                        title="See every test contributing to this payout"
                        class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                  Breakdown
                </button>
                <button type="button" (click)="payslip(p)"
                        title="Generate Indian-format payslip (Save as PDF)"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold border border-border text-ink-soft hover:bg-surface-subtle inline-flex items-center gap-1.5">
                  <i-lucide [name]="iconSlip" [size]="14"></i-lucide><span>Payslip</span>
                </button>
                @if ((p.status === 'draft' || p.status === 'approved') && canWrite()) {
                  <button type="button" (click)="pay(p)" [disabled]="busy() || p.net_cents <= 0"
                          class="h-8 px-3 rounded-md text-[12px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                    <i-lucide [name]="iconBank" [size]="14"></i-lucide><span>Pay</span>
                  </button>
                }
              </div>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="8" class="text-center py-8 text-ink-muted">No payouts yet. Compute one above.</td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Doctor referral activity (live, period-toggleable) ─────── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
      <div>
        <p class="text-[13px] font-semibold text-ink inline-flex items-center gap-2">
          <i-lucide [name]="iconChart" [size]="16" class="text-primary-600"></i-lucide>
          Doctor referrals
        </p>
        <p class="text-[11px] text-ink-muted mt-0.5">
          Live count of patients referred + commission earned · {{ refPeriodLabel() }}
        </p>
      </div>
      <div class="inline-flex border border-border rounded-md overflow-hidden">
        @for (p of refPeriods; track p.id) {
          <button type="button" (click)="setRefPeriod(p.id)"
                  [class.bg-primary-600]="refPeriod() === p.id"
                  [class.text-white]="refPeriod() === p.id"
                  [class.text-ink-soft]="refPeriod() !== p.id"
                  class="px-3 h-8 text-[12px] font-medium hover:bg-surface-subtle">
            {{ p.label }}
          </button>
        }
      </div>
    </header>

    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Doctor</th>
          <th class="text-right px-4 py-2 font-semibold">Patients referred</th>
          <th class="text-right px-4 py-2 font-semibold">Tests</th>
          <th class="text-right px-4 py-2 font-semibold">Gross billed</th>
          <th class="text-right px-4 py-2 font-semibold">Commission earned</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (r of referrals(); track r.doctor_id) {
          <tr>
            <td class="px-4 py-2">{{ r.doctor_name }}</td>
            <td class="px-4 py-2 text-right">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-mono font-semibold text-[12px]">
                {{ r.patients_count }} 👥
              </span>
            </td>
            <td class="px-4 py-2 text-right font-mono">{{ r.tests_count }}</td>
            <td class="px-4 py-2 text-right font-mono">{{ svc.formatINR(r.gross_cents) }}</td>
            <td class="px-4 py-2 text-right font-mono font-semibold text-good-fg">{{ svc.formatINR(r.commission_cents) }}</td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="text-center py-8 text-ink-muted">
            No referrals in this {{ refPeriod() }}.
          </td></tr>
        }
      </tbody>
    </table>
  </section>

  <!-- ── Commission rules editor ─────────────────────────────────── -->
  <section class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-5 py-3 border-b border-border flex items-center justify-between">
      <div>
        <p class="text-[13px] font-semibold text-ink">Commission rules</p>
        <p class="text-[11px] text-ink-muted mt-0.5">
          Most-specific rule wins · test &gt; category &gt; default. Doctors with no rule earn ₹0.
        </p>
      </div>
      @if (canWrite()) {
        <div class="flex items-center gap-2">
          <button type="button" (click)="openCatalogEditor()"
                  title="Open the full lab catalog and set per-test commission for a doctor"
                  class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
            📋 Per-test bulk editor
          </button>
          <button type="button" (click)="toggleRuleForm()"
                  class="h-8 px-3 rounded-md text-[12px] font-medium border border-primary-200 text-primary-700 hover:bg-primary-50">
            {{ showRuleForm() ? 'Cancel' : '+ New rule' }}
          </button>
        </div>
      }
    </header>

    @if (showRuleForm()) {
      <div class="p-4 border-b border-border bg-surface-muted/40 grid grid-cols-2 md:grid-cols-6 gap-2">
        <label class="md:col-span-2">
          <span class="block text-[10px] uppercase text-ink-muted mb-1">Doctor</span>
          <select [(ngModel)]="ruleForm.doctor_staff_id"
                  class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
            <option value="">— select —</option>
            @for (d of doctors(); track d.id) { <option [value]="d.id">{{ d.full_name }}</option> }
          </select>
        </label>
        <label>
          <span class="block text-[10px] uppercase text-ink-muted mb-1">Scope</span>
          <select [(ngModel)]="ruleForm.scope"
                  class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
            <option value="default">Default (all tests)</option>
            <option value="category">By category</option>
            <option value="test">By test code</option>
          </select>
        </label>
        @if (ruleForm.scope === 'category') {
          <label>
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Category</span>
            <select [(ngModel)]="ruleForm.category"
                    class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
              <option value="">— pick a category —</option>
              @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </label>
        } @else if (ruleForm.scope === 'test') {
          <label>
            <span class="block text-[10px] uppercase text-ink-muted mb-1">Test</span>
            <select [(ngModel)]="ruleForm.lab_test_code"
                    class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card font-mono">
              <option value="">— pick a test —</option>
              @for (t of allTests(); track t.code) {
                <option [value]="t.code">{{ t.code }} · {{ t.name }}</option>
              }
            </select>
          </label>
        } @else {
          <div></div>
        }
        <label>
          <span class="block text-[10px] uppercase text-ink-muted mb-1">Commission %</span>
          <input type="number" min="0" max="100" step="0.5" [(ngModel)]="ruleForm.commission_pct"
                 class="w-full h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card font-mono"/>
        </label>
        <div class="flex items-end">
          <button type="button" (click)="saveRule()" [disabled]="!ruleForm.doctor_staff_id || ruleForm.commission_pct == null"
                  class="h-9 px-3 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    }

    <table class="w-full text-[13px]">
      <thead class="bg-surface-muted text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th class="text-left px-4 py-2 font-semibold">Doctor</th>
          <th class="text-left px-4 py-2 font-semibold">Scope</th>
          <th class="text-left px-4 py-2 font-semibold">Target</th>
          <th class="text-right px-4 py-2 font-semibold">Commission</th>
          <th class="text-left px-4 py-2 font-semibold">From</th>
          @if (canWrite()) { <th class="text-center px-4 py-2 font-semibold w-[80px]">Actions</th> }
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        @for (r of rules(); track r.id) {
          <tr>
            <td class="px-4 py-2">{{ r.doctor_name }}</td>
            <td class="px-4 py-2">
              <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-primary-50]="r.scope==='test'"     [class.text-primary-700]="r.scope==='test'"
                    [class.bg-warn-bg]="r.scope==='category'"    [class.text-warn-fg]="r.scope==='category'"
                    [class.bg-surface-subtle]="r.scope==='default'" [class.text-ink-soft]="r.scope==='default'">
                {{ r.scope }}
              </span>
            </td>
            <td class="px-4 py-2 font-mono">
              {{ r.scope === 'test' ? r.lab_test_code
                : r.scope === 'category' ? r.category
                : 'All tests' }}
            </td>
            <td class="px-4 py-2 text-right font-mono">
              {{ r.commission_pct ?? '—' }}%
              @if (r.commission_flat_cents) {
                <span class="text-[10px] text-ink-muted ml-1">or ₹{{ r.commission_flat_cents / 100 }}</span>
              }
            </td>
            <td class="px-4 py-2 text-[12px] text-ink-soft">{{ r.effective_from }}</td>
            @if (canWrite()) {
              <td class="px-4 py-2 text-center">
                <button type="button" (click)="deleteRule(r)"
                        class="h-7 px-2 rounded-md border border-danger-fg/40 text-danger-fg text-[11px] hover:bg-danger-bg/30">
                  Remove
                </button>
              </td>
            }
          </tr>
        } @empty {
          <tr><td [attr.colspan]="canWrite() ? 6 : 5" class="text-center py-8 text-ink-muted">
            No commission rules. Add a default rule per doctor to start.
          </td></tr>
        }
      </tbody>
    </table>
  </section>
</div>

<!-- ── Per-payout breakdown drawer ─────────────────────────────────── -->
@if (breakdownFor(); as p) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
       (document:keydown.escape)="breakdownFor.set(null)">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[820px] bg-surface-card border border-border rounded-[10px] shadow-pop max-h-[90vh] overflow-hidden flex flex-col">
      <header class="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="font-display text-[16px] font-medium text-ink">Commission breakdown</h2>
          <p class="text-[11px] text-ink-muted">
            {{ p.doctor_name }} · {{ p.period_start }} → {{ p.period_end }}
            · {{ items().length }} lines · Gross {{ svc.formatINR(p.total_amount_cents) }}
          </p>
        </div>
        <button type="button" (click)="breakdownFor.set(null)" aria-label="Close"
                class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle">✕</button>
      </header>
      <div class="overflow-auto">
        <table class="w-full text-[12.5px]">
          <thead class="bg-surface-muted text-[10px] uppercase tracking-wider text-ink-muted sticky top-0">
            <tr>
              <th class="text-left px-3 py-2 font-semibold">Date</th>
              <th class="text-left px-3 py-2 font-semibold">Patient</th>
              <th class="text-left px-3 py-2 font-semibold">Test</th>
              <th class="text-right px-3 py-2 font-semibold">Price</th>
              <th class="text-right px-3 py-2 font-semibold">%</th>
              <th class="text-right px-3 py-2 font-semibold">Commission</th>
              <th class="text-center px-3 py-2 font-semibold">Rule</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            @for (l of items(); track l.id) {
              <tr>
                <td class="px-3 py-1.5 text-ink-soft">{{ l.service_date }}</td>
                <td class="px-3 py-1.5">
                  <div class="text-ink">{{ l.patient_name }}</div>
                  <div class="text-[10px] font-mono text-ink-muted">{{ l.patient_uhid }}</div>
                </td>
                <td class="px-3 py-1.5">
                  <div class="font-mono text-[11px] text-primary-700">{{ l.lab_test_code }}</div>
                  <div class="text-[11px]">{{ l.test_name }}</div>
                </td>
                <td class="px-3 py-1.5 text-right font-mono">{{ svc.formatINR(l.test_price_cents) }}</td>
                <td class="px-3 py-1.5 text-right font-mono">{{ l.commission_pct ?? '—' }}%</td>
                <td class="px-3 py-1.5 text-right font-mono font-semibold">{{ svc.formatINR(l.commission_cents) }}</td>
                <td class="px-3 py-1.5 text-center text-[10px] text-ink-muted">{{ l.rule_scope ?? '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="text-center py-8 text-ink-muted">
                No lab orders linked to this doctor in the period.
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  </div>
}

<!-- ── Per-test bulk editor (full catalog per doctor) ───────────────── -->
@if (catalogEditorOpen()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
       (document:keydown.escape)="catalogEditorOpen.set(false)">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[980px] bg-surface-card border border-border rounded-[10px] shadow-pop max-h-[92vh] overflow-hidden flex flex-col">
      <header class="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="font-display text-[16px] font-medium text-ink">Per-test commission rates</h2>
          <p class="text-[11px] text-ink-muted mt-0.5">
            Empty cells fall back to the doctor's default % rule.
            Leave blank and Save to remove a test override.
          </p>
        </div>
        <button type="button" (click)="catalogEditorOpen.set(false)" aria-label="Close"
                class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle">✕</button>
      </header>

      <div class="px-5 py-3 border-b border-border bg-surface-muted/40 flex flex-wrap items-end gap-3">
        <label>
          <span class="block text-[10px] uppercase text-ink-muted mb-1">Doctor</span>
          <select [ngModel]="catalogDoctorId()" (ngModelChange)="onCatalogDoctorChange($event)"
                  class="w-[260px] h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card">
            <option value="">— pick a doctor —</option>
            @for (d of doctors(); track d.id) { <option [value]="d.id">{{ d.full_name }}</option> }
          </select>
        </label>
        <label>
          <span class="block text-[10px] uppercase text-ink-muted mb-1">Apply % to all empty rows</span>
          <div class="flex gap-2">
            <input type="number" min="0" max="100" step="0.5" [(ngModel)]="bulkFillPct"
                   class="w-[100px] h-9 px-2 text-[13px] rounded-md border border-border bg-surface-card font-mono"/>
            <button type="button" (click)="applyBulkFill()" [disabled]="!catalogDoctorId() || bulkFillPct == null"
                    class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Fill empty
            </button>
          </div>
        </label>
        <div class="flex-1"></div>
        <button type="button" (click)="catalogEditorOpen.set(false)"
                class="h-9 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
          Cancel
        </button>
        <button type="button" (click)="saveCatalogRates()" [disabled]="!catalogDoctorId() || savingCatalog()"
                class="h-9 px-4 rounded-md text-[13px] font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
          {{ savingCatalog() ? 'Saving…' : 'Save all changes' }}
        </button>
      </div>

      <div class="overflow-auto">
        @if (!catalogDoctorId()) {
          <div class="text-center py-16 text-ink-muted text-[13px]">Pick a doctor above to load the catalog.</div>
        } @else if (catalogRows().length === 0) {
          <div class="text-center py-16 text-ink-muted text-[13px]">No active lab tests in the catalog.</div>
        } @else {
          <table class="w-full text-[12.5px]">
            <thead class="bg-surface-muted text-[10px] uppercase tracking-wider text-ink-muted sticky top-0">
              <tr>
                <th class="text-left px-3 py-2 font-semibold">Test</th>
                <th class="text-left px-3 py-2 font-semibold">Category</th>
                <th class="text-right px-3 py-2 font-semibold">Catalog price</th>
                <th class="text-right px-3 py-2 font-semibold w-[120px]">Commission %</th>
                <th class="text-right px-3 py-2 font-semibold w-[120px]">Earns</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              @for (row of catalogRows(); track row.code) {
                <tr [class.bg-primary-50]="row.commission_pct != null">
                  <td class="px-3 py-1.5">
                    <div class="font-mono text-[11px] text-primary-700">{{ row.code }}</div>
                    <div class="text-[11px]">{{ row.name }}</div>
                  </td>
                  <td class="px-3 py-1.5 text-[11px] text-ink-soft">{{ row.category }}</td>
                  <td class="px-3 py-1.5 text-right font-mono">{{ svc.formatINR(row.price_cents) }}</td>
                  <td class="px-3 py-1.5">
                    <input type="number" min="0" max="100" step="0.5"
                           [ngModel]="row.commission_pct"
                           (ngModelChange)="updateCatalogPct(row.code, $event)"
                           placeholder="—"
                           class="w-full h-7 px-1.5 text-[12px] rounded border border-border bg-surface-card font-mono text-right"/>
                  </td>
                  <td class="px-3 py-1.5 text-right font-mono text-good-fg">
                    {{ earningsLabel(row) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  </div>
}
  `,
})
export class DoctorPayoutsPage implements OnInit {
  protected svc = inject(PayrollService);
  private auth   = inject(AuthStore);
  private branch = inject(BranchStore);
  private toast  = inject(ToastService);
  private exportSvc = inject(ExportService);
  private payslipSvc = inject(DoctorPayslipService);

  protected readonly iconDoc   = Stethoscope;
  protected readonly iconCalc  = Calculator;
  protected readonly iconBank  = Banknote;
  protected readonly iconSlip  = FileText;
  protected readonly iconChart = BarChart3;

  protected readonly busy     = signal(false);
  protected readonly payouts  = signal<(DoctorPayout & { doctor_name: string | null })[]>([]);
  protected readonly doctors  = signal<{ id: string; full_name: string }[]>([]);
  protected readonly canWrite = computed(() => this.auth.has('ap.write'));

  protected form = {
    doctorId: '',
    start: this.firstOfMonth(),
    end:   new Date().toISOString().slice(0, 10),
    tdsPct: 10,
  };

  // ── Commission rules state ──────────────────────────────────────────
  protected readonly rules         = signal<(DoctorCommissionRule & { doctor_name: string | null })[]>([]);
  protected readonly showRuleForm  = signal(false);
  protected ruleForm: {
    doctor_staff_id: string;
    scope: 'default' | 'category' | 'test';
    category: string;
    lab_test_code: string;
    commission_pct: number | null;
  } = { doctor_staff_id: '', scope: 'default', category: '', lab_test_code: '', commission_pct: 10 };

  // ── Per-payout breakdown drawer ────────────────────────────────────
  protected readonly breakdownFor = signal<(DoctorPayout & { doctor_name?: string | null }) | null>(null);
  protected readonly items        = signal<DoctorPayoutItem[]>([]);

  // ── Doctor referrals (live, period-toggleable) ─────────────────────
  protected readonly refPeriods = [
    { id: 'day'   as const, label: 'Day' },
    { id: 'week'  as const, label: 'Week' },
    { id: 'month' as const, label: 'Month' },
  ];
  protected readonly refPeriod   = signal<'day' | 'week' | 'month'>('month');
  protected readonly referrals   = signal<DoctorReferralRow[]>([]);
  protected readonly refPeriodLabel = computed(() => {
    const { from, to } = this.computeRefRange(this.refPeriod());
    return `${from} → ${to}`;
  });

  protected setRefPeriod(p: 'day' | 'week' | 'month'): void {
    this.refPeriod.set(p);
    void this.loadReferrals();
  }

  /** Compute the date range for the chosen period (today-anchored). */
  private computeRefRange(p: 'day' | 'week' | 'month'): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    let fromDate = new Date(now);
    if (p === 'day') {
      // single day
    } else if (p === 'week') {
      fromDate.setDate(now.getDate() - 6);
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { from: fromDate.toISOString().slice(0, 10), to };
  }

  private async loadReferrals(): Promise<void> {
    const { from, to } = this.computeRefRange(this.refPeriod());
    try {
      this.referrals.set(await this.svc.referralsSummary(this.branch.activeBranchId(), from, to));
    } catch (e) {
      this.toast.error('Could not load referrals', String((e as Error).message));
      this.referrals.set([]);
    }
  }

  // ── Catalog dropdowns + per-test bulk editor ───────────────────────
  protected readonly categories          = signal<string[]>([]);
  protected readonly allTests            = signal<{ code: string; name: string; category: string }[]>([]);
  protected readonly catalogEditorOpen   = signal(false);
  protected readonly catalogDoctorId     = signal<string>('');
  protected readonly catalogRows         = signal<LabTestCommissionRow[]>([]);
  protected readonly savingCatalog       = signal(false);
  protected bulkFillPct: number | null = 10;
  // Expose Math so templates can call Math.round / Math.isFinite.
  protected readonly Math = Math;

  protected openCatalogEditor(): void {
    this.catalogEditorOpen.set(true);
    this.catalogDoctorId.set('');
    this.catalogRows.set([]);
  }

  protected async onCatalogDoctorChange(doctorId: string): Promise<void> {
    this.catalogDoctorId.set(doctorId);
    if (!doctorId) { this.catalogRows.set([]); return; }
    try {
      const rows = await this.svc.listLabTestsWithCommission(doctorId, this.branch.activeBranchId());
      this.catalogRows.set(rows);
    } catch (e) {
      this.toast.error('Could not load catalog', String((e as Error).message));
      this.catalogRows.set([]);
    }
  }

  /** Mutate a single row's commission % from the inline input. */
  protected updateCatalogPct(code: string, pct: number | null): void {
    this.catalogRows.update((rows) => rows.map((r) =>
      r.code === code ? { ...r, commission_pct: pct == null || Number.isNaN(pct as number) ? null : pct } : r,
    ));
  }

  /** Pre-fill every blank row with bulkFillPct. */
  protected applyBulkFill(): void {
    const pct = this.bulkFillPct;
    if (pct == null) return;
    this.catalogRows.update((rows) => rows.map((r) =>
      r.commission_pct == null ? { ...r, commission_pct: pct } : r,
    ));
  }

  /** Show the "Earns" cell text — handles the null case without template `Math.isFinite` calls. */
  protected earningsLabel(row: LabTestCommissionRow): string {
    const pct = row.commission_pct;
    if (pct == null || !Number.isFinite(pct)) return '—';
    const cents = Math.round((row.price_cents ?? 0) * pct / 100);
    return this.svc.formatINR(cents);
  }

  protected async saveCatalogRates(): Promise<void> {
    const doctorId = this.catalogDoctorId();
    if (!doctorId) return;
    this.savingCatalog.set(true);
    try {
      const rows = this.catalogRows().map((r) => ({
        code: r.code,
        pct: r.commission_pct,
        rule_id: r.rule_id,
      }));
      const result = await this.svc.bulkUpsertTestRules(doctorId, this.branch.activeBranchId(), rows);
      this.toast.success('Commission rates saved',
        `${result.saved} written · ${result.deleted} removed`);
      // Re-fetch so newly-created rules pick up their fresh rule_id.
      const fresh = await this.svc.listLabTestsWithCommission(doctorId, this.branch.activeBranchId());
      this.catalogRows.set(fresh);
      this.rules.set(await this.svc.listCommissionRules(this.branch.activeBranchId()));
    } catch (e) {
      this.toast.error('Could not save', String((e as Error).message));
    } finally {
      this.savingCatalog.set(false);
    }
  }

  protected toggleRuleForm(): void {
    const next = !this.showRuleForm();
    this.showRuleForm.set(next);
    if (!next) {
      this.ruleForm = { doctor_staff_id: '', scope: 'default', category: '', lab_test_code: '', commission_pct: 10 };
    }
  }

  protected async saveRule(): Promise<void> {
    const f = this.ruleForm;
    if (!f.doctor_staff_id || f.commission_pct == null) return;
    this.busy.set(true);
    try {
      await this.svc.upsertCommissionRule({
        doctor_staff_id: f.doctor_staff_id,
        // Commission rules are doctor-scoped, not branch-scoped — keep
        // branch_id NULL so we don't recreate the per-branch duplication.
        branch_id: null,
        scope: f.scope,
        category:      f.scope === 'category' ? (f.category.trim() || null) : null,
        lab_test_code: f.scope === 'test'     ? (f.lab_test_code.trim() || null) : null,
        commission_pct: f.commission_pct,
        effective_from: new Date().toISOString().slice(0, 10),
        is_active: true,
      } as any);
      this.toast.success('Commission rule saved');
      this.showRuleForm.set(false);
      this.rules.set(await this.svc.listCommissionRules(this.branch.activeBranchId()));
    } catch (e) {
      this.toast.error('Could not save rule', String((e as Error).message));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteRule(r: DoctorCommissionRule & { doctor_name: string | null }): Promise<void> {
    if (!confirm(`Remove ${r.scope} rule for ${r.doctor_name}?`)) return;
    try {
      await this.svc.deleteCommissionRule(r.id);
      this.toast.warn('Rule removed');
      this.rules.set(await this.svc.listCommissionRules(this.branch.activeBranchId()));
    } catch (e) {
      this.toast.error('Could not remove', String((e as Error).message));
    }
  }

  protected async viewBreakdown(p: DoctorPayout & { doctor_name?: string | null }): Promise<void> {
    this.breakdownFor.set(p);
    try {
      this.items.set(await this.svc.listPayoutItems(p.id));
    } catch (e) {
      this.toast.error('Could not load breakdown', String((e as Error).message));
      this.items.set([]);
    }
  }

  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

  async ngOnInit() {
    const bid = this.branch.activeBranchId();
    const [pays, staff, rules, cats, tests] = await Promise.all([
      this.svc.listDoctorPayouts(bid),
      this.svc.listStaff(),
      this.svc.listCommissionRules(bid),
      this.svc.listLabTestCategories(),
      // Use the full test list to populate the rule-form "Test" dropdown.
      this.svc.listLabTestsWithCommission('00000000-0000-0000-0000-000000000000', bid)
        .then((rows) => rows.map((r) => ({ code: r.code, name: r.name, category: r.category }))),
    ]);
    this.payouts.set(pays);
    this.doctors.set(staff.filter(s => s.role_slug === 'doctor'));
    this.rules.set(rules);
    this.categories.set(cats);
    this.allTests.set(tests);
    void this.loadReferrals();
  }

  protected async compute() {
    const bid = this.branch.activeBranchId(); if (!bid) { this.toast.error('Pick branch'); return; }
    this.busy.set(true);
    try {
      await this.svc.computeDoctorPayout(bid, this.form.doctorId, this.form.start, this.form.end, this.form.tdsPct);
      this.toast.success('Payout computed');
      this.payouts.set(await this.svc.listDoctorPayouts(bid));
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async payslip(p: DoctorPayout & { doctor_name?: string | null }) {
    try {
      await this.payslipSvc.openPayslip(p);
    } catch (e) {
      this.toast.error('Could not generate payslip', String((e as Error).message));
    }
  }

  protected async pay(p: DoctorPayout) {
    if (!confirm(`Pay ₹${(p.net_cents/100).toLocaleString('en-IN')} from bank?`)) return;
    this.busy.set(true);
    try {
      await this.svc.payDoctorPayout(p.id);
      this.toast.success('Payout posted');
      this.payouts.set(await this.svc.listDoctorPayouts(this.branch.activeBranchId()));
    } catch (e) { this.toast.error('Failed', String((e as Error).message)); }
    finally { this.busy.set(false); }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.payouts();
    if (list.length === 0) return;

    const exportRows: DocPayoutExportRow[] = list.map(p => ({
      doctor_name:        p.doctor_name ?? '',
      period_start:       p.period_start,
      period_end:         p.period_end,
      visits_count:       p.visits_count,
      total_amount_cents: p.total_amount_cents,
      tds_cents:          p.tds_cents,
      net_cents:          p.net_cents,
      status:             p.status,
    }));

    const columns: ExportColumn<DocPayoutExportRow>[] = [
      { key: 'doctor_name',        header: 'Doctor',     width: 26, align: 'left' },
      { key: 'period_start',       header: 'From',       width: 12, align: 'center', format: 'date' },
      { key: 'period_end',         header: 'To',         width: 12, align: 'center', format: 'date' },
      { key: 'visits_count',       header: 'Visits',     width: 8,  align: 'right', format: 'integer' },
      { key: 'total_amount_cents', header: 'Gross (₹)',  width: 16, align: 'right', format: 'inr_cents' },
      { key: 'tds_cents',          header: 'TDS (₹)',    width: 12, align: 'right', format: 'inr_cents' },
      { key: 'net_cents',          header: 'Net (₹)',    width: 16, align: 'right', format: 'inr_cents' },
      { key: 'status',             header: 'Status',     width: 10, align: 'left' },
    ];

    const tot = list.reduce((s, p) => ({
      gross: s.gross + p.total_amount_cents,
      tds:   s.tds   + p.tds_cents,
      net:   s.net   + p.net_cents,
      visits: s.visits + p.visits_count,
    }), { gross: 0, tds: 0, net: 0, visits: 0 });

    const report: ExportableReport<DocPayoutExportRow> = {
      filename: `DoctorPayouts_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Doctor Payouts',
      subtitle: `${list.length} payout${list.length === 1 ? '' : 's'}`,
      columns,
      rows: exportRows,
      grandTotals: {
        doctor_name:        'TOTAL',
        visits_count:       tot.visits,
        total_amount_cents: tot.gross,
        tds_cents:          tot.tds,
        net_cents:          tot.net,
      },
      footer: 'Sree Diagnostics · Doctor Payouts Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
