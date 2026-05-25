import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ComplianceService, DocSlot } from '../data/compliance.service';
import {
  CATEGORY_LABEL, STATUS_LABEL,
  type ComplianceCategory, type ComplianceLicence, type ComplianceStatus,
} from '../data/compliance.types';

interface DocSlotConfig { key: DocSlot; field: keyof ComplianceLicence; label: string; hint: string; }
const DOC_SLOTS: DocSlotConfig[] = [
  { key: 'applied_copy',       field: 'applied_copy_path',       label: 'Applied copy',       hint: 'Submitted application form / DD challan' },
  { key: 'acknowledgment',     field: 'acknowledgment_path',     label: 'Acknowledgment',     hint: 'Receipt / dated stamp from authority' },
  { key: 'licence',            field: 'licence_path',            label: 'Licence',            hint: 'Final issued licence document' },
  { key: 'notice_board_photo', field: 'notice_board_photo_path', label: 'Notice-board photo', hint: 'Photo of the licence on display' },
];

@Component({
  selector: 'app-compliance-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent],
  template: `
<div class="flex flex-col gap-4">

  <!-- ── Header ──────────────────────────────────────────────── -->
  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
        Compliance &amp; Regulation
      </h1>
      <p class="text-[13px] text-ink-muted mt-1">
        Branch-level licences, acknowledgments and notice-board postings.
        @if (branchName()) { · <span class="font-medium text-ink-soft">{{ branchName() }}</span> }
      </p>
    </div>
    @if (canManage()) {
      <button (click)="openNew()"
        class="h-9 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New licence
      </button>
    }
  </header>

  <!-- ── KPI strip ───────────────────────────────────────────── -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Total licences</p>
      <p class="font-display text-[26px] font-medium leading-none text-ink mt-1.5">{{ items().length }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active</p>
      <p class="font-display text-[26px] font-medium leading-none mt-1.5"
         [class.text-good-fg]="counts().active > 0"
         [class.text-ink]="counts().active === 0">{{ counts().active }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Expiring &lt; 30 d</p>
      <p class="font-display text-[26px] font-medium leading-none mt-1.5"
         [class.text-warn-fg]="counts().expiring_30 > 0"
         [class.text-ink]="counts().expiring_30 === 0">{{ counts().expiring_30 }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Expired</p>
      <p class="font-display text-[26px] font-medium leading-none mt-1.5"
         [class.text-danger-fg]="counts().expired > 0"
         [class.text-ink]="counts().expired === 0">{{ counts().expired }}</p>
    </article>
    <article class="bg-surface-card border border-border rounded-[10px] px-4 py-3">
      <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Applied</p>
      <p class="font-display text-[26px] font-medium leading-none text-info-fg mt-1.5">{{ counts().applied }}</p>
    </article>
  </div>

  @if (error()) { <app-alert tone="danger" title="Could not load compliance data">{{ error() }}</app-alert> }

  <!-- ── Filter chips ─────────────────────────────────────────── -->
  <div class="flex items-center gap-1.5 flex-wrap">
    @for (f of filterOptions; track f.key) {
      <button (click)="filter.set(f.key)" [class]="filterCls(f.key)">
        {{ f.label }}
        <span class="ml-1 font-mono text-[10px] opacity-70">{{ filterCount(f.key) }}</span>
      </button>
    }
  </div>

  <!-- ── List of licences ─────────────────────────────────────── -->
  @if (loading() && items().length === 0) {
    <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-muted">Loading…</div>
  } @else if (filteredItems().length === 0) {
    <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-soft">
      No licences in this view.
    </div>
  } @else {
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      @for (lic of filteredItems(); track lic.id) {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden hover:shadow-card transition-shadow"
                 [style.border-left]="'4px solid ' + categoryColor(lic.category)">
          <div class="px-4 py-3">
            <div class="flex items-start gap-2">
              <span class="text-[18px] leading-none mt-0.5">{{ categoryIcon(lic.category) }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="text-[14px] font-semibold text-ink leading-tight">{{ lic.name }}</h3>
                  <span [class]="statusChipCls(lic)">{{ statusLabel(lic) }}</span>
                </div>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ categoryLabel(lic.category) }}</p>
                @if (lic.license_number) {
                  <p class="text-[11px] font-mono text-ink-soft mt-0.5">{{ lic.license_number }}</p>
                }
                @if (lic.issuing_authority) {
                  <p class="text-[11px] text-ink-muted mt-0.5">{{ lic.issuing_authority }}</p>
                }
              </div>
            </div>
          </div>

          <!-- Validity strip -->
          @if (lic.valid_until) {
            <div class="px-4 py-2 border-t border-border" [class]="validityBg(lic)">
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-ink-muted">Valid until</span>
                <span class="font-mono font-semibold" [class]="validityText(lic)">
                  {{ fmtDate(lic.valid_until) }}
                  @if (daysLeft(lic) !== null) {
                    · <span>{{ daysLabel(lic) }}</span>
                  }
                </span>
              </div>
            </div>
          }

          <!-- 4 document slots -->
          <div class="px-4 py-3 border-t border-border grid grid-cols-2 gap-2">
            @for (slot of docSlots; track slot.key) {
              <button type="button" (click)="openDoc(lic, slot.key)"
                      class="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border text-left hover:bg-surface-muted transition-colors">
                <div class="size-7 rounded-md grid place-items-center text-[11px] font-bold shrink-0"
                     [class.bg-good-bg]="hasDoc(lic, slot.field)"
                     [class.text-good-fg]="hasDoc(lic, slot.field)"
                     [class.bg-surface-subtle]="!hasDoc(lic, slot.field)"
                     [class.text-ink-muted]="!hasDoc(lic, slot.field)">
                  {{ hasDoc(lic, slot.field) ? '✓' : '—' }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-medium text-ink truncate">{{ slot.label }}</p>
                  <p class="text-[10px] text-ink-muted truncate">{{ hasDoc(lic, slot.field) ? 'Tap to view' : 'Not uploaded' }}</p>
                </div>
              </button>
            }
          </div>

          @if (canManage()) {
            <footer class="px-4 py-2 border-t border-border bg-surface-muted/40 flex justify-end gap-2">
              <button (click)="openEdit(lic)" class="h-7 px-2.5 rounded text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">Edit</button>
              <button (click)="confirmDelete(lic)" class="h-7 px-2.5 rounded text-[11px] font-medium border border-danger-fg/30 text-danger-fg hover:bg-danger-bg">Delete</button>
            </footer>
          }
        </article>
      }
    </div>
  }
</div>

<!-- ── Edit / new modal ─────────────────────────────────────── -->
@if (modal()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[760px] bg-surface-card border border-border rounded-[12px] shadow-pop max-h-[92vh] overflow-y-auto"
         (click)="$event.stopPropagation()">

      <header class="px-5 py-4 border-b border-border">
        <h2 class="font-display text-[18px] font-medium text-ink">
          {{ editId() ? 'Edit licence' : 'New licence' }}
        </h2>
        <p class="text-[12px] text-ink-muted mt-0.5">
          Save the licence details first; document uploads become available afterwards.
        </p>
      </header>

      <div class="p-5 grid grid-cols-12 gap-3">
        <label class="col-span-12 md:col-span-8 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
          <input type="text" [(ngModel)]="f_name" name="name" placeholder="Clinical Establishment Registration"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 md:col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category *</span>
          <select [(ngModel)]="f_category" name="category"
                  class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            @for (c of categoryOptions; track c) {
              <option [value]="c">{{ categoryLabel(c) }}</option>
            }
          </select>
        </label>

        <label class="col-span-12 md:col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Licence number</span>
          <input type="text" [(ngModel)]="f_number" name="number" placeholder="e.g. KARN/CEA/2024/00123"
                 class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 md:col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Issuing authority</span>
          <input type="text" [(ngModel)]="f_authority" name="auth" placeholder="e.g. KSPCB"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-12 md:col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Issued on</span>
          <input type="date" [(ngModel)]="f_issued" name="issued"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 md:col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Valid from</span>
          <input type="date" [(ngModel)]="f_from" name="from"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 md:col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Valid until</span>
          <input type="date" [(ngModel)]="f_until" name="until"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-12 md:col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Status *</span>
          <select [(ngModel)]="f_status" name="status"
                  class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="applied">Applied</option><option value="active">Active</option>
            <option value="renewed">Renewed</option><option value="expired">Expired</option>
            <option value="rejected">Rejected</option><option value="revoked">Revoked</option>
          </select>
        </label>

        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes</span>
          <textarea [(ngModel)]="f_notes" name="notes" rows="2" placeholder="Renewal due, conditions, vendor, etc."
                    class="w-full px-2.5 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink resize-y focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
        </label>

        <!-- Document slots — only visible after the licence has been saved (so we have an ID) -->
        @if (editId()) {
          <div class="col-span-12 mt-2 p-3 rounded-md border border-border bg-surface-muted/40">
            <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Documents</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              @for (slot of docSlots; track slot.key) {
                <div class="flex items-start gap-3 p-3 rounded-md border border-border bg-surface-card">
                  <div class="size-9 rounded-md grid place-items-center text-[12px] font-bold shrink-0"
                       [class.bg-good-bg]="!!getPath(slot.field)"
                       [class.text-good-fg]="!!getPath(slot.field)"
                       [class.bg-surface-subtle]="!getPath(slot.field)"
                       [class.text-ink-muted]="!getPath(slot.field)">
                    {{ getPath(slot.field) ? '✓' : '—' }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-semibold text-ink">{{ slot.label }}</p>
                    <p class="text-[10px] text-ink-muted">{{ slot.hint }}</p>
                    <div class="mt-2 flex items-center gap-2">
                      <input type="file" #fileInput hidden (change)="onFile($event, slot)"
                             [accept]="slot.key === 'notice_board_photo' ? 'image/*' : 'image/*,application/pdf'" />
                      <button type="button" (click)="fileInput.click()" [disabled]="uploading() === slot.key"
                              class="h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50">
                        {{ uploading() === slot.key ? 'Uploading…' : (getPath(slot.field) ? 'Replace' : 'Upload') }}
                      </button>
                      @if (getPath(slot.field)) {
                        <button type="button" (click)="viewDoc(slot.field)"
                                class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-muted">
                          View
                        </button>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        @if (formError()) {
          <p class="col-span-12 text-[12px] text-danger-fg">{{ formError() }}</p>
        }
      </div>

      <footer class="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
        <button (click)="closeModal()"
                class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
          Close
        </button>
        <button (click)="confirm()" [disabled]="!f_name || busy()"
                class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
          {{ busy() ? 'Saving…' : (editId() ? 'Save changes' : 'Create licence') }}
        </button>
      </footer>
    </div>
  </div>
}
  `,
})
export class CompliancePage implements OnInit {
  private svc   = inject(ComplianceService);
  private auth  = inject(AuthStore);
  private toast = inject(ToastService);

  protected readonly items   = signal<ComplianceLicence[]>([]);
  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly busy    = signal(false);
  protected readonly modal   = signal(false);
  protected readonly editId  = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly uploading = signal<DocSlot | null>(null);

  // Track in-progress doc paths for the modal (mirrors the open licence)
  private readonly editing = signal<ComplianceLicence | null>(null);

  protected readonly canManage = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.has('staff.write')
  );

  protected readonly branchName = computed(() => {
    const id = this.auth.claims().branch_id;
    return id ? id.slice(0, 8) : null; // we don't have branches list here; quick fingerprint
  });

  protected readonly docSlots = DOC_SLOTS;
  protected readonly categoryOptions: ComplianceCategory[] = [
    'registration','fire_safety','biomedical_waste','drug_licence',
    'pollution','radiology','blood_bank','accreditation','tax','other',
  ];

  // Filters
  protected filter = signal<'all'|'active'|'expiring_30'|'expired'|'applied'>('all');
  protected readonly filterOptions = [
    { key: 'all'         as const, label: 'All' },
    { key: 'active'      as const, label: 'Active' },
    { key: 'expiring_30' as const, label: 'Expiring < 30d' },
    { key: 'expired'     as const, label: 'Expired' },
    { key: 'applied'     as const, label: 'Applied' },
  ];

  protected readonly counts = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30  = new Date(today); in30.setDate(in30.getDate() + 30);
    let active = 0, applied = 0, expired = 0, expiring30 = 0;
    for (const l of this.items()) {
      const exp = l.valid_until ? new Date(l.valid_until) : null;
      const isExp = (l.status === 'expired') || (exp != null && exp < today);
      if (isExp) expired++;
      else if (l.status === 'applied') applied++;
      else if (l.status === 'active' || l.status === 'renewed') active++;
      if (exp != null && exp >= today && exp <= in30) expiring30++;
    }
    return { active, applied, expired, expiring_30: expiring30 };
  });

  protected readonly filteredItems = computed(() => {
    const f = this.filter();
    const all = this.items();
    if (f === 'all') return all;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30  = new Date(today); in30.setDate(in30.getDate() + 30);
    return all.filter(l => {
      const exp = l.valid_until ? new Date(l.valid_until) : null;
      const isExp = l.status === 'expired' || (exp != null && exp < today);
      if (f === 'active')      return !isExp && (l.status === 'active' || l.status === 'renewed');
      if (f === 'applied')     return l.status === 'applied';
      if (f === 'expired')     return isExp;
      if (f === 'expiring_30') return exp != null && exp >= today && exp <= in30;
      return true;
    });
  });

  // ── Form fields ────────────────────────────────────────────
  protected f_name      = '';
  protected f_number    = '';
  protected f_category: ComplianceCategory = 'registration';
  protected f_authority = '';
  protected f_issued    = '';
  protected f_from      = '';
  protected f_until     = '';
  protected f_status: ComplianceStatus = 'active';
  protected f_notes     = '';

  async ngOnInit() { await this.reload(); }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.svc.list());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load compliance');
    } finally {
      this.loading.set(false);
    }
  }

  protected filterCount(key: string): number {
    const c = this.counts();
    if (key === 'all')         return this.items().length;
    if (key === 'active')      return c.active;
    if (key === 'applied')     return c.applied;
    if (key === 'expired')     return c.expired;
    if (key === 'expiring_30') return c.expiring_30;
    return 0;
  }
  protected filterCls(key: string): string {
    const active = this.filter() === key;
    const base = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white shadow-card`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }

  // ── Display helpers ────────────────────────────────────────
  protected categoryLabel(c: ComplianceCategory): string { return CATEGORY_LABEL[c]?.label ?? c; }
  protected categoryColor(c: ComplianceCategory): string { return CATEGORY_LABEL[c]?.color ?? '#65758C'; }
  protected categoryIcon(c: ComplianceCategory):  string { return CATEGORY_LABEL[c]?.icon  ?? '📄'; }
  protected statusLabel(l: ComplianceLicence):    string {
    return STATUS_LABEL[this.effectiveStatus(l)]?.label ?? l.status;
  }
  protected statusChipCls(l: ComplianceLicence): string {
    const tone = STATUS_LABEL[this.effectiveStatus(l)]?.chip ?? 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium shrink-0 ${tone}`;
  }
  protected effectiveStatus(l: ComplianceLicence): ComplianceStatus {
    const exp = l.valid_until ? new Date(l.valid_until) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (exp != null && exp < today && l.status !== 'expired' && l.status !== 'revoked') return 'expired';
    return l.status;
  }
  protected fmtDate(d: string | null): string {
    if (!d) return '—';
    try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d; }
  }
  protected daysLeft(l: ComplianceLicence): number | null {
    if (!l.valid_until) return null;
    try { return differenceInCalendarDays(parseISO(l.valid_until), new Date()); }
    catch { return null; }
  }
  protected daysLabel(l: ComplianceLicence): string {
    const n = this.daysLeft(l);
    if (n === null) return '';
    if (n < 0)  return `${Math.abs(n)}d overdue`;
    if (n === 0) return 'today';
    if (n === 1) return 'in 1 day';
    return `in ${n} days`;
  }
  protected validityBg(l: ComplianceLicence): string {
    const n = this.daysLeft(l);
    if (n === null) return 'bg-surface-muted/40';
    if (n < 0)  return 'bg-danger-bg';
    if (n <= 30) return 'bg-warn-bg';
    return 'bg-good-bg';
  }
  protected validityText(l: ComplianceLicence): string {
    const n = this.daysLeft(l);
    if (n === null) return 'text-ink';
    if (n < 0)  return 'text-danger-fg';
    if (n <= 30) return 'text-warn-fg';
    return 'text-good-fg';
  }
  protected hasDoc(l: ComplianceLicence, field: keyof ComplianceLicence): boolean {
    return !!(l[field] as string | null);
  }
  protected getPath(field: keyof ComplianceLicence): string | null {
    return (this.editing()?.[field] as string | null) ?? null;
  }

  // ── Modal lifecycle ────────────────────────────────────────
  protected openNew() {
    this.editId.set(null);
    this.editing.set(null);
    this.f_name = ''; this.f_number = '';
    this.f_category = 'registration';
    this.f_authority = '';
    this.f_issued = ''; this.f_from = ''; this.f_until = '';
    this.f_status = 'active';
    this.f_notes = '';
    this.formError.set(null);
    this.modal.set(true);
  }

  protected openEdit(l: ComplianceLicence) {
    this.editId.set(l.id);
    this.editing.set(l);
    this.f_name      = l.name;
    this.f_number    = l.license_number ?? '';
    this.f_category  = l.category;
    this.f_authority = l.issuing_authority ?? '';
    this.f_issued    = l.issued_on ?? '';
    this.f_from      = l.valid_from ?? '';
    this.f_until     = l.valid_until ?? '';
    this.f_status    = l.status;
    this.f_notes     = l.notes ?? '';
    this.formError.set(null);
    this.modal.set(true);
  }

  protected closeModal() { this.modal.set(false); }

  protected async confirm() {
    this.busy.set(true);
    this.formError.set(null);
    try {
      const id = await this.svc.upsert({
        id: this.editId(),
        name: this.f_name,
        license_number: this.f_number || null,
        category: this.f_category,
        issuing_authority: this.f_authority || null,
        issued_on: this.f_issued || null,
        valid_from: this.f_from || null,
        valid_until: this.f_until || null,
        status: this.f_status,
        notes: this.f_notes || null,
      });
      this.toast.success(this.editId() ? 'Licence updated' : 'Licence created');
      this.editId.set(id);
      // Refresh list and pull the saved row into editing() so the file slots become live
      await this.reload();
      const saved = this.items().find(x => x.id === id);
      if (saved) this.editing.set(saved);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmDelete(l: ComplianceLicence) {
    if (!confirm(`Delete "${l.name}"? This cannot be undone.`)) return;
    try {
      await this.svc.remove(l.id);
      this.toast.success('Deleted', l.name);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not delete', e instanceof Error ? e.message : 'Try again.');
    }
  }

  // ── Document upload / view ─────────────────────────────────
  protected async onFile(ev: Event, slot: DocSlotConfig) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const lic = this.editing();
    if (!lic) return;

    this.uploading.set(slot.key);
    try {
      const path = await this.svc.uploadDoc(lic.branch_id, lic.id, slot.key, file);
      // Persist the new path on the licence
      const patch: any = { id: lic.id, name: lic.name, status: lic.status, category: lic.category };
      patch[slot.field] = path;
      await this.svc.upsert({ ...lic, ...patch });

      // Refresh
      await this.reload();
      const fresh = this.items().find(x => x.id === lic.id);
      if (fresh) this.editing.set(fresh);
      this.toast.success('Uploaded', slot.label);
    } catch (e) {
      this.toast.error('Upload failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.uploading.set(null);
      input.value = '';
    }
  }

  protected async openDoc(l: ComplianceLicence, slot: DocSlot) {
    const field = DOC_SLOTS.find(s => s.key === slot)!.field;
    const path = l[field] as string | null;
    if (!path) {
      // Just open edit so they can upload
      this.openEdit(l);
      return;
    }
    const url = await this.svc.signedUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else this.toast.error('Could not open document');
  }

  protected async viewDoc(field: keyof ComplianceLicence) {
    const path = this.getPath(field);
    if (!path) return;
    const url = await this.svc.signedUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  }
}
