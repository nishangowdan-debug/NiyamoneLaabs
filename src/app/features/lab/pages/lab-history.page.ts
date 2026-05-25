import {
  ChangeDetectionStrategy, Component, OnInit, OnDestroy,
  computed, inject, signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { LabReportPdfService } from '../services/lab-report-pdf.service';
import { LabReportSreeService } from '../services/lab-report-sree.service';
import { HospitalSettingsService } from '../../pharmacy/services/hospital-settings.service';
import { PrintOptionsDialogComponent } from '../components/print-options-dialog.component';
import type { PrintOptions } from '../data/lab-print.types';
import type { LabReportTemplate } from '../../pharmacy/services/hospital-settings.service';

interface HistoryRow {
  id: string;
  state: string;
  source: 'opd' | 'ipd';
  priority: string;
  ordered_at: string;
  collected_at: string | null;
  reported_at: string | null;
  delivered_at: string | null;
  sample_id: string | null;
  patient: {
    id: string;
    uhid: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
    mobile: string | null;
  } | null;
  doctor: { full_name: string } | null;
  results: { id: string; status: string; flag: string | null;
             test: { code: string; name: string; category: string | null;
                     instrument: { code: string; name: string } | null } }[];
}

const REPORTABLE_STATES = ['verified', 'report_ready', 'delivered'];

@Component({
  selector: 'app-lab-history-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, PrintOptionsDialogComponent],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">🧬 Lab &amp; Radiology</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/lab" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #wb="routerLinkActive"
         [class]="tabCls(wb.isActive)">📋 Workflow</a>
      <a routerLink="/lab/history" routerLinkActive #hi="routerLinkActive"
         [class]="tabCls(hi.isActive)">📚 Reports History</a>
      <a routerLink="/lab/reference" routerLinkActive #ra="routerLinkActive"
         [class]="tabCls(ra.isActive)">↗ Outsource</a>
      <a routerLink="/lab/qc" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive)">🔬 QC &amp; Audit</a>
    </nav>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    <p>Total reports: <strong>{{ filtered().length }}</strong> / {{ rows().length }}</p>
  </div>
</header>

<div class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
  <header class="px-4 py-3 border-b border-border">
    <p class="text-[12px] uppercase text-ink-muted tracking-[0.06em] font-medium">Search &amp; filter</p>
    <div class="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
      <input [formControl]="searchCtrl" type="text"
             placeholder="Patient name, UHID, mobile, test code or order id"
             class="md:col-span-2 h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <input type="date" [(ngModel)]="startDate"
             class="h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
      <input type="date" [(ngModel)]="endDate"
             class="h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5 items-center">
      @for (s of stateFilters; track s.key) {
        <button type="button" (click)="toggleState(s.key)" [class]="chipCls(activeStates().has(s.key))">
          {{ s.icon }} {{ s.label }}
        </button>
      }
      <label class="ml-2 inline-flex items-center gap-1 text-[12px] text-ink-soft">
        <input type="checkbox" [(ngModel)]="onlyIp" class="size-3.5 rounded">
        IP only
      </label>
      <button type="button" (click)="resetFilters()"
              class="ml-auto h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle">
        Reset
      </button>
      <button type="button" (click)="reload()"
              class="h-7 px-3 rounded-md text-[11px] font-semibold text-white shadow-card"
              style="background:#0E4F8C;">
        🔄 Refresh
      </button>
    </div>
  </header>

  @if (loading()) {
    <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading lab reports…</div>
  } @else if (filtered().length === 0) {
    <div class="px-6 py-12 text-center">
      <p class="text-[13px] text-ink-muted">No lab reports match the current filters.</p>
      <p class="text-[11px] text-ink-faint mt-1">Reports appear here once an order reaches Verified, Report ready, or Delivered.</p>
    </div>
  } @else {
    <div class="overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted">
          <tr>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Patient</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Tests</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-28">Source</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-28">Status</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-44">Reported / Ordered</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold w-44">Action</th>
          </tr>
        </thead>
        <tbody>
          @for (o of filtered(); track o.id) {
            <tr class="border-t border-border hover:bg-surface-subtle/40">
              <td class="px-4 py-2.5 align-top">
                <p class="font-medium text-ink truncate">{{ patientName(o) }}</p>
                <p class="text-[11px] font-mono text-ink-muted">
                  {{ o.patient?.uhid }}
                  @if (o.patient?.mobile) { · {{ o.patient?.mobile }} }
                </p>
                @if (o.doctor?.full_name) {
                  <p class="text-[10.5px] text-ink-muted">Dr. {{ o.doctor?.full_name }}</p>
                }
              </td>
              <td class="px-4 py-2.5 align-top">
                <div class="flex flex-wrap gap-1">
                  @for (r of o.results.slice(0, 5); track r.id) {
                    <span class="text-[10px] font-mono px-1.5 h-[18px] rounded-full bg-surface-subtle text-ink-soft inline-flex items-center"
                          [attr.title]="r.test.name + (r.test.instrument?.code ? ' · runs on ' + r.test.instrument?.code : '')"
                          [class.bg-danger-bg]="r.flag === 'critical_low' || r.flag === 'critical_high'"
                          [class.text-danger-fg]="r.flag === 'critical_low' || r.flag === 'critical_high'">
                      {{ r.test.code }}
                      @if (r.test.instrument?.code) {
                        <span class="ml-1 text-[9px] text-ink-faint">· {{ r.test.instrument?.code }}</span>
                      }
                    </span>
                  }
                  @if (o.results.length > 5) {
                    <span class="text-[10px] text-ink-faint">+{{ o.results.length - 5 }}</span>
                  }
                </div>
                <p class="text-[10.5px] text-ink-muted mt-1">{{ o.results.length }} test(s)</p>
              </td>
              <td class="px-4 py-2.5 align-top">
                <span [class]="sourceChip(o.source)">{{ o.source === 'ipd' ? 'IP' : 'OPD' }}</span>
                @if (o.priority !== 'routine') {
                  <span class="ml-1 px-1.5 py-px rounded text-[9px] font-bold uppercase"
                        [class.bg-warn-bg]="o.priority === 'urgent'" [class.text-warn-fg]="o.priority === 'urgent'"
                        [class.bg-danger-bg]="o.priority === 'stat'" [class.text-danger-fg]="o.priority === 'stat'">
                    {{ o.priority }}
                  </span>
                }
              </td>
              <td class="px-4 py-2.5 align-top">
                <span [class]="stateChip(o.state)">{{ stateLabel(o.state) }}</span>
              </td>
              <td class="px-4 py-2.5 align-top text-[11.5px]">
                @if (o.reported_at) {
                  <p class="text-ink">📄 {{ shortDate(o.reported_at) }}</p>
                } @else {
                  <p class="text-ink-faint">— not reported</p>
                }
                <p class="text-[10.5px] text-ink-muted">Ordered {{ shortDate(o.ordered_at) }}</p>
              </td>
              <td class="px-4 py-2.5 text-right align-top">
                <button type="button" (click)="openReport(o)" [disabled]="busy() === o.id"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card disabled:opacity-50"
                        style="background:#0E4F8C;">
                  {{ busy() === o.id ? '…' : '📄 View / print' }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>

@if (printDialogFor()) {
  <app-print-options-dialog
    [initialTemplate]="defaultTemplate()"
    (submit)="onPrintSubmit($event)"
    (cancel)="onPrintCancel()" />
}
  `,
})
export class LabHistoryPage implements OnInit, OnDestroy {
  private supabase    = inject(SupabaseService);
  private toast       = inject(ToastService);
  private auth        = inject(AuthStore);
  private pdfSvc      = inject(LabReportPdfService);
  private sreeSvc     = inject(LabReportSreeService);
  private settingsSvc = inject(HospitalSettingsService);

  protected readonly printDialogFor = signal<HistoryRow | null>(null);
  protected readonly defaultTemplate = signal<LabReportTemplate>('standard');

  protected readonly rows    = signal<HistoryRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy    = signal<string | null>(null);

  protected readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected startDate = '';
  protected endDate   = '';
  protected onlyIp    = false;

  protected readonly stateFilters = [
    { key: 'verified',     label: 'Verified',     icon: '✅' },
    { key: 'report_ready', label: 'Report ready', icon: '📄' },
    { key: 'delivered',    label: 'Delivered',    icon: '📬' },
  ] as const;
  protected readonly activeStates = signal<Set<string>>(new Set(REPORTABLE_STATES));

  protected readonly filtered = computed(() => {
    const term  = this.searchTerm().trim().toLowerCase();
    const start = this.startDate ? new Date(this.startDate + 'T00:00:00').getTime() : null;
    const end   = this.endDate   ? new Date(this.endDate   + 'T23:59:59').getTime() : null;
    const states = this.activeStates();
    const onlyIp = this.onlyIp;

    return this.rows().filter(o => {
      if (!states.has(o.state)) return false;
      if (onlyIp && o.source !== 'ipd') return false;

      const ts = new Date(o.reported_at || o.ordered_at).getTime();
      if (start !== null && ts < start) return false;
      if (end   !== null && ts > end)   return false;

      if (term) {
        const haystack = [
          o.patient?.uhid, o.patient?.full_name, o.patient?.first_name, o.patient?.last_name,
          o.patient?.mobile, o.id, o.sample_id, o.doctor?.full_name,
          ...o.results.map(r => r.test.code),
          ...o.results.map(r => r.test.name),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  });

  private channel: any = null;

  constructor() {
    // Wire FormControl → signal here (constructor has an injection context).
    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(v => this.searchTerm.set(v ?? ''));
  }

  async ngOnInit() {
    await this.reload();

    this.channel = this.supabase.client
      .channel('lab-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_orders' },  () => this.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_results' }, () => this.reload())
      .subscribe();
  }

  ngOnDestroy() {
    if (this.channel) this.supabase.client.removeChannel(this.channel);
  }

  protected async reload() {
    this.loading.set(true);
    try {
      const { data, error } = await (this.supabase.client as any)
        .from('lab_orders')
        .select(`
          id, source, state, priority, ordered_at, collected_at, reported_at, delivered_at, sample_id,
          patient:patient_id(id, uhid, full_name, first_name, last_name, mobile),
          doctor:ordering_doctor_staff_id(full_name),
          results:lab_results(id, status, flag,
            test:lab_test_id(code, name, category,
              instrument:instrument_id(code, name)))
        `)
        .in('state', REPORTABLE_STATES)
        .order('reported_at', { ascending: false, nullsFirst: false })
        .order('ordered_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      this.rows.set((data ?? []) as HistoryRow[]);
    } catch (e: any) {
      this.toast.error('Load failed', e?.message ?? 'Could not fetch lab reports.');
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleState(key: string) {
    const next = new Set(this.activeStates());
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) REPORTABLE_STATES.forEach(s => next.add(s));
    this.activeStates.set(next);
  }

  protected resetFilters() {
    this.searchCtrl.setValue('');
    this.startDate = '';
    this.endDate   = '';
    this.onlyIp    = false;
    this.activeStates.set(new Set(REPORTABLE_STATES));
  }

  protected async openReport(o: HistoryRow) {
    if (this.busy()) return;
    const branchId = (this.auth.claims().branch_id as string) || '';
    const s = await this.settingsSvc.loadSettings(branchId);
    // Default to Sree template — the branded one is the canonical look.
    this.defaultTemplate.set((s.lab_report_template ?? 'sree') as LabReportTemplate);
    this.printDialogFor.set(o);
  }

  protected onPrintCancel() {
    this.printDialogFor.set(null);
  }

  protected async onPrintSubmit(ev: { options: PrintOptions; template: LabReportTemplate; saveAsDefault: boolean }) {
    const order = this.printDialogFor();
    if (!order) return;
    this.printDialogFor.set(null);
    this.busy.set(order.id);
    try {
      if (ev.saveAsDefault) {
        const branchId = (this.auth.claims().branch_id as string) || '';
        const s = await this.settingsSvc.loadSettings(branchId);
        await this.settingsSvc.saveSettings({
          ...s,
          lab_report_template: ev.template,
          lab_report_print_mode: {
            headerMode: ev.options.headerMode,
            footerMode: ev.options.footerMode,
            includeInstructions: ev.options.includeInstructions,
            includeInfographics: ev.options.includeInfographics,
            letterheadTopMm: ev.options.letterheadTopMm,
            letterheadBottomMm: ev.options.letterheadBottomMm,
          },
        });
      }
      if (ev.template === 'sree') {
        await this.sreeSvc.openReport(order.id, ev.options);
      } else {
        await this.pdfSvc.openReport(order.id, { autoPrint: ev.options.autoPrint });
      }
    } catch (e: any) {
      this.toast.error('Report failed', e?.message ?? 'Could not open report.');
    } finally {
      this.busy.set(null);
    }
  }

  protected patientName(o: HistoryRow): string {
    return o.patient?.full_name
        || `${o.patient?.first_name ?? ''} ${o.patient?.last_name ?? ''}`.trim()
        || '—';
  }

  protected shortDate(iso: string | null): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-IN',
        { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  protected stateLabel(s: string): string {
    if (s === 'verified')     return 'Verified';
    if (s === 'report_ready') return 'Report ready';
    if (s === 'delivered')    return 'Delivered';
    return s;
  }
  protected stateChip(s: string): string {
    const tone = s === 'delivered'    ? 'bg-good-bg text-good-fg'
              : s === 'report_ready' ? 'bg-info-bg text-info-fg'
              : 'bg-warn-bg text-warn-fg';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-semibold ${tone}`;
  }
  protected sourceChip(src: string): string {
    const tone = src === 'ipd' ? 'bg-warn-bg text-warn-fg' : 'bg-info-bg text-info-fg';
    return `inline-flex items-center h-[18px] px-1.5 rounded-full text-[10px] font-bold uppercase ${tone}`;
  }

  protected chipCls(active: boolean): string {
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }

  protected tabCls(active: boolean): string {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
}
