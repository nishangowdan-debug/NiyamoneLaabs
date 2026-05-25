import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { PatientsStore } from '../data/patients.store';
import { PatientsService } from '../data/patients.service';
import { ageFromDob, formatINR } from '../utils/age-from-dob';
import type { Patient, PatientFilters } from '../data/patients.types';
import { formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { SavedSearchBtnComponent } from '../../../shared/ui/saved-search/saved-search-btn.component';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { normaliseMobile } from '../../../shared/validators/india-mobile.validator';

interface PatientExportRow {
  uhid: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  age: string;
  mobile: string;
  email: string;
  status: string;
  created_at: string;
}

const AVATAR_PALETTE = [
  { bg: 'bg-primary-100', fg: 'text-primary-800' },
  { bg: 'bg-info-bg', fg: 'text-info-fg' },
  { bg: 'bg-warn-bg', fg: 'text-warn-fg' },
  { bg: 'bg-danger-bg', fg: 'text-danger-fg' },
  { bg: 'bg-good-bg', fg: 'text-good-fg' },
] as const;

function hashIndex(input: string, len: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}

@Component({
  selector: 'app-patients-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, SavedSearchBtnComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Patients</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          {{ store.total().toLocaleString('en-IN') }} records · {{ branchStore.activeBranchName() || 'All hospitals' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <app-export-menu [disabled]="store.total() === 0 || exporting()" (pick)="onExport($event)"/>
        @if (canWrite()) {
          <input #importInput type="file" accept=".csv,text/csv"
                 class="hidden" (change)="onImportFile($event)" />
          <button type="button" (click)="importInput.click()" [disabled]="importing()"
                  title="Bulk-load patients from a CSV file"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            @if (importing()) {
              <span class="inline-block w-3 h-3 border-2 border-ink-muted border-t-transparent rounded-full animate-spin"></span>
              Importing…
            } @else {
              ↑ Import CSV
            }
          </button>
          <button type="button" (click)="downloadSampleCsv()"
                  title="Download a sample CSV with all supported columns"
                  class="h-8 px-2.5 inline-flex items-center rounded-md text-[11px] font-medium text-primary-700 hover:bg-primary-50">
            sample
          </button>
        }
        @if (canWrite()) {
          <a routerLink="register"
             class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Register patient
          </a>
        }
      </div>
    </header>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          type="search"
          [formControl]="searchCtrl"
          placeholder="Search by UHID, name, mobile, or ABHA ID..."
          class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
        />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <select disabled class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink-soft cursor-not-allowed appearance-none bg-no-repeat" [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option>All departments</option>
      </select>
      <select disabled class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink-soft cursor-not-allowed appearance-none bg-no-repeat" [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option>All doctors</option>
      </select>
      <select [value]="store.filters().status" (change)="onStatusChange($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option value="all">Any status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="pending_payment">Pending payment</option>
      </select>

      <app-saved-search-btn
        module="patients"
        [currentFilters]="currentFiltersForSave()"
        (filtersLoaded)="onFiltersLoaded($event)"
      />

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        Showing {{ rangeText() }} of {{ store.total().toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load patients">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Panel + Table ─────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border w-10">
              <input type="checkbox" class="size-3.5" style="accent-color: var(--color-primary-600);" />
            </th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">UHID</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Patient</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Last visit</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Department</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Visits</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Balance</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Tags</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.patients().length === 0) {
            @for (i of skeletonRows; track i) {
              <tr class="border-b border-border last:border-b-0">
                <td class="px-4 py-3"><span class="block w-3.5 h-3.5 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-20 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-44 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-16 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-20 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-8 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-12 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-16 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"></td>
              </tr>
            }
          } @else {
            <!-- Backstop: if any row arrived without a uhid (race / partial response), skip it. -->
            @for (p of store.patients(); track p.id) {
              @if (p && p.id && p.uhid) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5"><input type="checkbox" class="size-3.5" style="accent-color: var(--color-primary-600);" /></td>
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ p.uhid }}</td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2.5">
                    <div [class]="avatarCls(p)">{{ initials(p) }}</div>
                    <div class="min-w-0">
                      <a [routerLink]="['/patients', p.id]" class="block text-[13px] font-medium text-ink hover:text-primary-700 truncate max-w-[260px]">
                        {{ p.full_name || (p.first_name + ' ' + p.last_name) }}
                      </a>
                      <small class="block font-mono text-[11px] text-ink-muted mt-0.5">
                        {{ ageGender(p.date_of_birth, p.gender) }} · {{ formatMobile(p.mobile) }}
                      </small>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2.5 text-[13px] whitespace-nowrap">
                  {{ lastVisitLabel(p.updated_at) }}
                  <small class="block text-[11px] text-ink-muted">—</small>
                </td>
                <td class="px-4 py-2.5 text-[13px] text-ink-muted">—</td>
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft">—</td>
                <td class="px-4 py-2.5 font-mono text-[12px]" [class.text-danger-fg]="p.balance_cents > 0" [class.font-medium]="p.balance_cents > 0" [class.text-ink-muted]="p.balance_cents === 0">
                  {{ p.balance_cents > 0 ? formatINR(p.balance_cents) : '₹0' }}
                </td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-1 flex-wrap">
                    @if (p.status === 'pending_payment') {
                      <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-warn-bg text-warn-fg text-[10px] font-medium">
                        <span class="size-[5px] rounded-full bg-current"></span>
                        Pending payment
                      </span>
                    } @else if (p.status === 'inactive') {
                      <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-surface-subtle text-ink-muted text-[10px] font-medium">Inactive</span>
                    }
                    @for (tag of p.tags.slice(0, 2); track tag) {
                      <span class="inline-flex items-center h-[22px] px-2 rounded-full bg-surface-subtle text-ink-soft text-[10px] font-medium">{{ tag }}</span>
                    }
                  </div>
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  <a [routerLink]="['/patients', p.id]" class="h-[26px] px-2.5 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                    Open chart
                  </a>
                </td>
              </tr>
              }
            } @empty {
              <tr>
                <td colspan="9" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No patients match your filters.</p>
                  @if (canWrite()) {
                    <a routerLink="register" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Register the first patient →
                    </a>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Pagination ────────────────────────────────────────── -->
    @if (store.total() > 0) {
      <nav class="mt-4 flex items-center justify-between text-[12px] text-ink-muted">
        <div class="font-mono">{{ rangeText() }} of {{ store.total().toLocaleString('en-IN') }}</div>
        <div class="flex items-center gap-1">
          <button type="button"
                  class="h-8 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
                  [disabled]="store.filters().page <= 0"
                  (click)="store.goToPage(store.filters().page - 1)"
          >← Previous</button>
          <span class="h-8 px-3 grid place-items-center text-ink-muted font-mono">
            {{ store.filters().page + 1 }} / {{ totalPages() }}
          </span>
          <button type="button"
                  class="h-8 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
                  [disabled]="store.filters().page + 1 >= totalPages()"
                  (click)="store.goToPage(store.filters().page + 1)"
          >Next →</button>
        </div>
      </nav>
    }
  `,
})
export class PatientsListPage implements OnInit, OnDestroy {
  protected readonly store = inject(PatientsStore);
  private svc = inject(PatientsService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private exportSvc = inject(ExportService);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);

  /** Push the active branch into patient filters; effect also drives initial load. */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    untracked(() => this.store.setFilters({ branchId: id }));
  });

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('patients.write'));
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  // Inline chevron SVG for native selects
  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly totalPages = computed(() => {
    const f = this.store.filters();
    return Math.max(1, Math.ceil(this.store.total() / f.pageSize));
  });

  protected readonly rangeText = computed(() => {
    const f = this.store.filters();
    const total = this.store.total();
    if (total === 0) return '0';
    const from = f.page * f.pageSize + 1;
    const to = Math.min(total, (f.page + 1) * f.pageSize);
    return `${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')}`;
  });

  protected readonly currentFiltersForSave = computed(() => ({
    search: this.store.filters().search,
    status: this.store.filters().status,
  }));

  protected onFiltersLoaded(filters: Record<string, unknown>): void {
    const search = (filters['search'] as string) ?? '';
    const status = (filters['status'] as PatientFilters['status']) ?? 'all';
    this.searchCtrl.setValue(search);
    this.store.setFilters({ search, status, page: 0 });
  }

  private unsubscribe: (() => void) | null = null;

  ngOnInit(): void {
    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setFilters({ search: term ?? '' }));
    // Always trigger the first load. The branch-sync effect only fires load() on
    // *change* — when the user is super_admin viewing "All hospitals", branchId
    // stays null from default → null from store, so no change, so no fetch.
    void this.store.load();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  protected onStatusChange(value: string) {
    this.store.setFilters({ status: value as 'all' | 'active' | 'inactive' | 'pending_payment' });
  }

  protected initials(p: Patient): string {
    const a = (p.first_name ?? '').trim();
    const b = (p.last_name ?? '').trim();
    return ((a[0] ?? '') + (b[0] ?? '')).toUpperCase() || '–';
  }

  protected avatarCls(p: Patient): string {
    const palette = AVATAR_PALETTE[hashIndex(p.id, AVATAR_PALETTE.length)]!;
    return [
      'shrink-0 grid place-items-center size-7 rounded-full font-display font-semibold text-[11px]',
      palette.bg, palette.fg,
    ].join(' ');
  }

  protected ageGender(dob: string, gender: string) {
    const age = ageFromDob(dob);
    const g = gender ? gender.charAt(0).toUpperCase() : '';
    if (age === null && !g) return '—';
    if (age === null) return g;
    return `${age}${g}`;
  }

  protected formatMobile(mobile: string) {
    if (!mobile) return '';
    const digits = mobile.replace(/\D/g, '');
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    return mobile;
  }

  protected formatINR = formatINR;

  protected lastVisitLabel(iso: string): string {
    try {
      const d = parseISO(iso);
      if (isToday(d)) return 'Today';
      if (isYesterday(d)) return 'Yesterday';
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return '—';
    }
  }

  protected async onExport(format: ExportFormat): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      // Pull ALL rows matching current filters (not just the visible page).
      const filters = { ...this.store.filters(), page: 0, pageSize: 5000 };
      const { rows } = await this.svc.list(filters);

      const exportRows: PatientExportRow[] = rows.map(p => ({
        uhid: p.uhid ?? '',
        full_name: p.full_name ?? (`${p.first_name ?? ''} ${p.last_name ?? ''}`).trim(),
        gender: p.gender ?? '',
        date_of_birth: p.date_of_birth ?? '',
        age: ageFromDob(p.date_of_birth ?? '')?.toString() ?? '',
        mobile: p.mobile ?? '',
        email: (p as any).email ?? '',
        status: p.status ?? '',
        created_at: p.created_at ?? '',
      }));

      const columns: ExportColumn<PatientExportRow>[] = [
        { key: 'uhid',          header: 'UHID',     width: 14, align: 'left' },
        { key: 'full_name',     header: 'Name',     width: 28, align: 'left' },
        { key: 'gender',        header: 'Gender',   width: 8,  align: 'center' },
        { key: 'date_of_birth', header: 'DOB',      width: 12, align: 'center', format: 'date' },
        { key: 'age',           header: 'Age',      width: 6,  align: 'right' },
        { key: 'mobile',        header: 'Mobile',   width: 14, align: 'left' },
        { key: 'email',         header: 'Email',    width: 26, align: 'left' },
        { key: 'status',        header: 'Status',   width: 14, align: 'left' },
        { key: 'created_at',    header: 'Registered', width: 18, align: 'center', format: 'datetime' },
      ];

      const f = this.store.filters();
      const filterLines: { label: string; value: string }[] = [
        { label: 'Total matching', value: String(rows.length) },
      ];
      if (f.search) filterLines.push({ label: 'Search', value: f.search });
      if (f.status && f.status !== 'all') filterLines.push({ label: 'Status', value: f.status });

      const report: ExportableReport<PatientExportRow> = {
        filename: `Patients_${this.branchStore.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
        title: 'Patients',
        subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
        meta: { filters: filterLines },
        columns,
        rows: exportRows,
        footer: 'Sree Diagnostics · Patient Register',
      };

      await this.exportSvc.export(format, report);
    } finally {
      this.exporting.set(false);
    }
  }

  // ── CSV import ───────────────────────────────────────────────────────
  /** Columns the importer recognises. Order matches the sample download. */
  private readonly IMPORT_COLUMNS = [
    'first_name', 'last_name', 'salutation', 'gender',
    'date_of_birth', 'age', 'mobile', 'email',
    'blood_group', 'marital_status', 'aadhaar_last4', 'abha',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
    'referred_by', 'notes',
    'address_line1', 'address_line2', 'address_city', 'address_state', 'address_pincode',
  ] as const;

  /** Build + download a sample CSV showing headers and two example rows. */
  protected downloadSampleCsv(): void {
    const headers = this.IMPORT_COLUMNS.join(',');
    const examples: (string | number)[][] = [
      [
        'Saraswati', 'Annamalai', 'Mrs', 'female',
        '1985-04-12', '', '9876543210', 'saraswati@example.com',
        'O+', 'married', '1234', '',
        'Ramesh Annamalai', '9876501122', 'Spouse',
        'walk_in', 'Routine checkup',
        '12 MG Road', '', 'Vijayawada', 'Andhra Pradesh', '520007',
      ],
      [
        'Swami', 'C', 'Mr', 'male',
        '', '40', '7760010642', '',
        'A+', 'single', '', '',
        '', '', '',
        '', '',
        '', '', '', '', '',
      ],
    ];
    const escape = (v: unknown): string => {
      const s = (v ?? '').toString();
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers,
      ...examples.map((row) => row.map(escape).join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patients_import_sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** File-input change handler — reads, parses, validates, inserts. */
  protected async onImportFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so the user can pick the same file again after a failed import.
    input.value = '';
    if (!file) return;

    const branchId = this.branchStore.activeBranchId();
    if (!branchId) {
      this.toast.error('Pick a branch first', 'CSV import writes patients under a specific branch — use the top-bar switcher.');
      return;
    }

    this.importing.set(true);
    try {
      const text = await file.text();
      const parsed = this.parseCsv(text);
      if (parsed.rows.length === 0) {
        this.toast.warn('Empty CSV', 'No data rows found below the header.');
        return;
      }

      const errors: string[] = [];
      let created = 0;
      let skipped = 0;

      for (let i = 0; i < parsed.rows.length; i++) {
        const lineNo = i + 2; // header is line 1
        const row = parsed.rows[i];
        try {
          const payload = this.rowToPatientPayload(row);
          await this.svc.create({
            patient: payload.patient,
            branchId,
            createdByStaffId: this.auth.staffId(),
            address: payload.address ?? undefined,
          });
          created++;
        } catch (e: any) {
          skipped++;
          const msg = this.errorMessage(e);
          errors.push(`Line ${lineNo}: ${msg}`);
          if (errors.length >= 5) {
            // Cap detailed error lines; the rest are summarised in the toast.
            break;
          }
        }
      }

      if (created > 0) {
        this.toast.success(`Imported ${created} patient${created === 1 ? '' : 's'}`,
          skipped > 0 ? `${skipped} row${skipped === 1 ? '' : 's'} skipped — see console for full details.` : 'All rows imported successfully.');
        void this.store.load();
      } else {
        this.toast.error('Import failed', errors[0] ?? 'No rows could be imported.');
      }

      if (errors.length > 0) {
        // Keep the full reasons available to whoever's debugging.
        console.warn('[patients-import] row errors', errors);
      }
    } catch (e: any) {
      this.toast.error('Could not read CSV', this.errorMessage(e));
    } finally {
      this.importing.set(false);
    }
  }

  /** Minimal RFC-4180-ish CSV parser (handles quoted cells + escaped quotes). */
  private parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const stripped = text.replace(/^\uFEFF/, '');
    const cells: string[][] = [];
    let cur = '';
    let row: string[] = [];
    let inQuotes = false;
    for (let i = 0; i < stripped.length; i++) {
      const c = stripped[i];
      if (inQuotes) {
        if (c === '"') {
          if (stripped[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\r') { /* skip — \n handles row break */ }
        else if (c === '\n') { row.push(cur); cells.push(row); row = []; cur = ''; }
        else cur += c;
      }
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); cells.push(row); }

    if (cells.length === 0) return { headers: [], rows: [] };
    const headers = cells[0].map((h) => h.trim().toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let r = 1; r < cells.length; r++) {
      const raw = cells[r];
      // Skip blank lines.
      if (raw.every((c) => c.trim() === '')) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = (raw[idx] ?? '').trim(); });
      rows.push(obj);
    }
    return { headers, rows };
  }

  /** Convert one CSV row into a `create()` payload. Throws on validation
   *  errors so the loop in onImportFile can collect them per-line. */
  private rowToPatientPayload(row: Record<string, string>) {
    const first = row['first_name'];
    const last = row['last_name'];
    if (!first) throw new Error('first_name is required');
    if (!last) throw new Error('last_name is required');

    const mobileRaw = row['mobile'];
    if (!mobileRaw) throw new Error('mobile is required');
    const mobileDigits = mobileRaw.replace(/\D/g, '').replace(/^91/, '');
    if (mobileDigits.length !== 10) throw new Error(`mobile "${mobileRaw}" is not a valid 10-digit number`);
    const mobile = normaliseMobile(mobileDigits);

    let dob = row['date_of_birth'];
    const age = row['age'];
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw new Error(`date_of_birth "${dob}" must be YYYY-MM-DD`);
    }
    if (!dob && age) {
      const n = Number(age);
      if (!Number.isFinite(n) || n < 0 || n > 130) throw new Error(`age "${age}" out of range`);
      dob = `${new Date().getFullYear() - Math.floor(n)}-07-01`;
    }
    if (!dob) throw new Error('either date_of_birth or age is required');

    const gender = (row['gender'] || 'other').toLowerCase();
    if (!['male', 'female', 'other'].includes(gender)) {
      throw new Error(`gender "${gender}" must be male / female / other`);
    }

    const patient: any = {
      first_name: first,
      last_name: last,
      mobile,
      date_of_birth: dob,
      gender,
      salutation: row['salutation'] || null,
      email: row['email'] || null,
      blood_group: row['blood_group'] || null,
      marital_status: row['marital_status'] || null,
      aadhaar_last4: row['aadhaar_last4'] || null,
      abha: row['abha'] || null,
      emergency_contact_name: row['emergency_contact_name'] || null,
      emergency_contact_phone: row['emergency_contact_phone']
        ? normaliseMobile(row['emergency_contact_phone'].replace(/\D/g, '').replace(/^91/, ''))
        : null,
      emergency_contact_relation: row['emergency_contact_relation'] || null,
      referred_by: row['referred_by'] || null,
      notes: row['notes'] || null,
    };

    const addressLine1 = row['address_line1'];
    // patient_addresses requires non-null city/state; pass through empty
    // strings when the CSV row leaves them blank.
    const address = addressLine1
      ? {
          line1: addressLine1,
          line2: row['address_line2'] || null,
          city: row['address_city'] || '',
          state: row['address_state'] || '',
          pincode: row['address_pincode'] || null,
        }
      : null;

    return { patient, address };
  }

  /** Same shape-tolerant error extractor used elsewhere. */
  private errorMessage(e: unknown): string {
    if (e == null) return 'Unknown error';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const o = e as any;
    const parts = [o?.message, o?.details, o?.hint, o?.code]
      .filter((s) => typeof s === 'string' && s.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
    try { return JSON.stringify(e); } catch { return String(e); }
  }
}
