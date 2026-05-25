import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { HomeCollectionService } from '../data/home-collection.service';

interface PatientHit { id: string; uhid: string; full_name: string; mobile: string }
interface EligibleTest { id: string; code: string; name: string; price_inr: number; surcharge_inr: number }

@Component({
  selector: 'app-home-collection-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">New home collection</h1>
        <p class="text-[13px] text-ink-muted mt-1">Search patient → pick tests → schedule visit.</p>
      </div>
      <a routerLink="/home-collection" class="text-[12px] text-ink-muted hover:text-ink">← Back to list</a>
    </header>

    @if (migrationMissing()) {
      <div class="mb-4"><app-alert tone="warn" title="Home Collection schema not installed">
        Run <code class="font-mono">db/migrations/20260515_lab_settings.sql</code> in Supabase SQL Editor to create the
        <code class="font-mono">home_collection_requests</code>, <code class="font-mono">home_collection_items</code>,
        <code class="font-mono">phlebotomists</code> and <code class="font-mono">lab_test_prices</code> tables.
        Once it's run, this page will work.
      </app-alert></div>
    } @else if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not save">{{ error() }}</app-alert></div>
    }

    <div class="grid grid-cols-12 gap-5">
      <!-- ── Patient + address ─────────────────────────────── -->
      <section class="col-span-7 bg-surface-card border border-border rounded-[10px] p-5">
        <h2 class="text-[14px] font-medium text-ink mb-3">1 · Patient</h2>

        @if (!selectedPatient()) {
          <div class="relative">
            <label class="block">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Search by UHID, name, or mobile</span>
              <input type="text" autocomplete="off" spellcheck="false"
                     [(ngModel)]="patientQuery" (input)="onSearchPatient()"
                     name="patient_search_no_autocomplete" placeholder="e.g. NIY… or 9876…"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            @if (patientSearching()) {
              <p class="text-[11px] text-ink-muted mt-1.5">Searching…</p>
            }
            @if (patientError()) {
              <div class="mt-2"><app-alert tone="danger" title="Search failed">{{ patientError() }}</app-alert></div>
            }
            @if (patientHits().length > 0) {
              <ul class="absolute left-0 right-0 z-20 mt-1 max-h-[260px] overflow-y-auto bg-surface-card border border-border rounded-md shadow-pop divide-y divide-border">
                @for (p of patientHits(); track p.id) {
                  <li (click)="pickPatient(p)" class="px-3 py-2 hover:bg-primary-50 cursor-pointer">
                    <div class="text-[13px] text-ink font-medium">{{ p.full_name || '— unnamed —' }}</div>
                    <div class="text-[11px] text-ink-muted font-mono">{{ p.uhid }} · {{ p.mobile }}</div>
                  </li>
                }
              </ul>
            } @else if (patientQuery.length >= 2 && !patientSearching() && !patientError()) {
              <p class="text-[11px] text-ink-muted mt-2">No matches in this branch. Check spelling or active branch.</p>
            }
          </div>
        } @else {
          <div class="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-md">
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-ink">{{ selectedPatient()?.full_name }}</div>
              <div class="text-[11px] text-ink-muted font-mono">{{ selectedPatient()?.uhid }} · {{ selectedPatient()?.mobile }}</div>
            </div>
            <button type="button" (click)="clearPatient()" class="h-7 px-2 text-[11px] rounded-md border border-border bg-surface-card text-ink-soft hover:bg-surface-subtle">Change</button>
          </div>
        }

        <h2 class="text-[14px] font-medium text-ink mt-6 mb-3">2 · Pickup address</h2>
        <div class="grid grid-cols-12 gap-3">
          <label class="col-span-12 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Address line 1 *</span>
            <input type="text" [(ngModel)]="addr.line1" name="al1"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
          <label class="col-span-12 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Address line 2</span>
            <input type="text" [(ngModel)]="addr.line2" name="al2"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
          <label class="col-span-6 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">City *</span>
            <input type="text" [(ngModel)]="addr.city" name="ac"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
          <label class="col-span-3 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Pincode *</span>
            <input type="text" [(ngModel)]="addr.pincode" name="ap" maxlength="6"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
          <label class="col-span-3 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Mobile *</span>
            <input type="tel" [(ngModel)]="contactMobile" name="cm"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
        </div>

        <h2 class="text-[14px] font-medium text-ink mt-6 mb-3">3 · Schedule</h2>
        <div class="grid grid-cols-12 gap-3">
          <label class="col-span-6 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Date &amp; time *</span>
            <input type="datetime-local" [(ngModel)]="scheduledAt" name="sa"
                   class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>
          <label class="col-span-12 block">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Notes</span>
            <textarea [(ngModel)]="notes" name="nt" rows="2" placeholder="Special instructions, landmarks…"
                      class="w-full px-2.5 py-2 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
          </label>
        </div>
      </section>

      <!-- ── Tests + summary ──────────────────────────────── -->
      <section class="col-span-5 bg-surface-card border border-border rounded-[10px] p-5">
        <h2 class="text-[14px] font-medium text-ink mb-3">4 · Pick tests</h2>
        <p class="text-[11px] text-ink-muted mb-3">Only home-eligible tests for this branch shown.</p>

        @if (eligibleTests().length === 0) {
          <app-alert tone="info" title="No home-eligible tests configured">
            Go to <a routerLink="/lab-catalog" class="underline">Test catalog</a> and mark tests as "Available for home sample collection".
          </app-alert>
        } @else {
          <input type="search" [(ngModel)]="testQuery" name="tq" placeholder="Search tests…"
                 class="w-full h-8 px-2.5 mb-2 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          <ul class="max-h-[280px] overflow-y-auto border border-border rounded-md divide-y divide-border">
            @for (t of filteredTests(); track t.id) {
              <li class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-muted">
                <label class="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" [checked]="isSelected(t.id)" (change)="toggleTest(t)"
                         class="size-4 mt-0.5" style="accent-color: var(--color-primary-600);" />
                  <div class="min-w-0">
                    <div class="text-[12px] text-ink truncate">{{ t.name }}</div>
                    <div class="text-[10px] font-mono text-ink-muted">{{ t.code }}</div>
                  </div>
                </label>
                <div class="text-right shrink-0">
                  <div class="text-[12px] font-mono text-ink">₹{{ t.price_inr | number:'1.0-0' }}</div>
                </div>
              </li>
            }
          </ul>
        }

        <div class="mt-5 border-t border-border pt-4">
          <div class="flex justify-between text-[12px] text-ink-muted">
            <span>Tests subtotal</span>
            <span class="font-mono">₹{{ subtotal() | number:'1.2-2' }}</span>
          </div>
          <div class="flex justify-between items-center text-[12px] text-ink-muted mt-1.5 gap-2">
            <span class="flex-1">Home collection surcharge
              @if (surchargeOverride() !== null) {
                <button type="button" (click)="resetSurcharge()"
                        class="ml-2 text-[10px] text-primary-700 hover:underline">reset</button>
              }
            </span>
            <span class="font-mono text-ink-muted text-[10px]">₹</span>
            <input type="number" min="0" step="1"
                   [value]="surcharge()"
                   (input)="onSurchargeChange($any($event.target).value)"
                   title="Editable — give a discount or waive the home-collection fee"
                   class="w-20 h-7 px-2 text-[12px] text-right font-mono border border-border rounded-md bg-surface-card focus:outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100" />
          </div>
          @if (surchargeDiscount() > 0) {
            <div class="flex justify-between text-[11px] text-good-fg mt-1">
              <span>Discount applied</span>
              <span class="font-mono">− ₹{{ surchargeDiscount() | number:'1.2-2' }}</span>
            </div>
          }
          <div class="flex justify-between text-[15px] font-medium text-ink mt-2">
            <span>Total</span>
            <span class="font-mono">₹{{ total() | number:'1.2-2' }}</span>
          </div>

          <button type="button" (click)="submit()" [disabled]="!isValid() || busy()"
                  class="w-full mt-4 h-10 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card disabled:opacity-50">
            {{ busy() ? 'Booking…' : 'Confirm request' }}
          </button>
        </div>
      </section>
    </div>
  `,
})
export class HomeCollectionCreatePage implements OnInit {
  private svc = inject(HomeCollectionService);
  private branchStore = inject(BranchStore);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly eligibleTests = signal<EligibleTest[]>([]);
  protected readonly patientHits = signal<PatientHit[]>([]);
  protected readonly patientSearching = signal(false);
  protected readonly patientError = signal<string | null>(null);
  protected readonly selectedPatient = signal<PatientHit | null>(null);
  protected readonly selectedTestIds = signal<Set<string>>(new Set());
  protected readonly error = signal<string | null>(null);
  protected readonly migrationMissing = signal(false);
  protected readonly busy = signal(false);

  private static isMissingTable(err: any): boolean {
    if (!err) return false;
    const code = String(err.code ?? '').toUpperCase();
    if (code === 'PGRST205' || code === '42P01') return true;
    const msg = String(err.message ?? err.details ?? '').toLowerCase();
    return /relation .* does not exist/.test(msg)
        || /could not find the table/.test(msg)
        || /schema cache/.test(msg)
        || msg.includes('404');
  }

  protected patientQuery = '';
  protected testQuery = '';
  protected contactMobile = '';
  protected scheduledAt = this.defaultSchedule();
  protected notes = '';
  protected addr = { line1: '', line2: '', city: '', pincode: '' };

  protected readonly filteredTests = computed(() => {
    const q = this.testQuery.trim().toLowerCase();
    if (!q) return this.eligibleTests();
    return this.eligibleTests().filter((t) =>
      t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  });

  protected readonly selectedTests = computed(() =>
    this.eligibleTests().filter((t) => this.selectedTestIds().has(t.id)),
  );

  protected readonly subtotal = computed(() => this.selectedTests().reduce((s, t) => s + t.price_inr, 0));

  /**
   * Computed home-collection surcharge. Defaults to the active branch's
   * `branches.home_collection_surcharge_inr` (flat fee per order, ₹250 by
   * default — configured in Lab Catalog). Staff can override by typing a
   * different number — stored in `surchargeOverride`. `null` = use default.
   */
  protected readonly surchargeOverride = signal<number | null>(null);
  protected readonly surchargeDefault = computed(() =>
    this.selectedTests().length === 0 ? 0 : this.branchStore.homeCollectionSurcharge(),
  );
  protected readonly surcharge = computed(() =>
    this.surchargeOverride() ?? this.surchargeDefault(),
  );
  /** How much staff knocked off the auto-computed surcharge — surfaced as a
   *  "Discount applied" line in the totals. Negative values mean the override
   *  is higher than default (rare) — clamped to 0 so we never show a negative. */
  protected readonly surchargeDiscount = computed(() =>
    Math.max(0, this.surchargeDefault() - this.surcharge()),
  );
  protected readonly total = computed(() => this.subtotal() + this.surcharge());

  protected onSurchargeChange(raw: string): void {
    const n = parseFloat(raw);
    this.surchargeOverride.set(isNaN(n) || n < 0 ? 0 : n);
  }
  protected resetSurcharge(): void {
    this.surchargeOverride.set(null);
  }

  /**
   * Distribute the (possibly-overridden) total surcharge proportionally across
   * the selected tests so the per-row `surcharge_inr` values stored on the
   * request still sum to the user-edited total. Falls back to even-split when
   * the default surcharges are all zero.
   */
  private distributeSurcharge(): Array<{ lab_test_id: string; price_inr: number; surcharge_inr: number }> {
    const tests = this.selectedTests();
    const targetTotal = this.surcharge();
    const defaultTotal = this.surchargeDefault();

    if (tests.length === 0) return [];

    // No override or no change → keep per-row defaults.
    if (this.surchargeOverride() === null || targetTotal === defaultTotal) {
      return tests.map((t) => ({
        lab_test_id: t.id,
        price_inr: t.price_inr,
        surcharge_inr: t.surcharge_inr,
      }));
    }

    // Scale each row pro-rata. If defaultTotal is 0, distribute evenly.
    let allocated = 0;
    const rows = tests.map((t, idx) => {
      let share: number;
      if (defaultTotal > 0) {
        share = Math.round((t.surcharge_inr / defaultTotal) * targetTotal);
      } else {
        share = Math.round(targetTotal / tests.length);
      }
      allocated += share;
      // Absorb rounding drift on the last row so the sum exactly matches.
      if (idx === tests.length - 1) share += (targetTotal - allocated);
      return {
        lab_test_id: t.id,
        price_inr: t.price_inr,
        surcharge_inr: Math.max(0, share),
      };
    });
    return rows;
  }

  constructor() {
    effect(() => {
      this.branchStore.activeBranchId();
      void this.loadTests();
    });
  }

  ngOnInit() { void this.loadTests(); }

  private async loadTests() {
    const branchId = this.branchStore.activeBranchId();
    if (!branchId) return;
    this.migrationMissing.set(false);
    try {
      const t = await this.svc.listEligibleTests(branchId);
      this.eligibleTests.set(t);
    } catch (e: any) {
      if (HomeCollectionCreatePage.isMissingTable(e)) {
        this.migrationMissing.set(true);
        this.eligibleTests.set([]);
      } else {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    }
  }

  private debounce: any = null;
  protected onSearchPatient() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.runPatientSearch(), 250);
  }

  private async runPatientSearch() {
    const term = this.patientQuery.trim();
    if (term.length < 2) {
      this.patientHits.set([]);
      this.patientError.set(null);
      return;
    }
    const branchId = this.branchStore.activeBranchId();
    this.patientSearching.set(true);
    this.patientError.set(null);
    try {
      const hits = await this.svc.searchPatients(branchId ?? '', term);
      this.patientHits.set(hits);
    } catch (e) {
      this.patientHits.set([]);
      this.patientError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.patientSearching.set(false);
    }
  }

  protected pickPatient(p: PatientHit) {
    this.selectedPatient.set(p);
    this.patientHits.set([]);
    this.contactMobile = p.mobile;
  }

  protected clearPatient() {
    this.selectedPatient.set(null);
    this.patientQuery = '';
  }

  protected isSelected(id: string): boolean { return this.selectedTestIds().has(id); }

  protected toggleTest(t: EligibleTest) {
    const s = new Set(this.selectedTestIds());
    if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
    this.selectedTestIds.set(s);
  }

  protected isValid(): boolean {
    return !!this.selectedPatient()
      && this.selectedTests().length > 0
      && !!this.addr.line1.trim()
      && !!this.addr.city.trim()
      && !!this.addr.pincode.trim()
      && !!this.contactMobile.trim()
      && !!this.scheduledAt;
  }

  protected async submit() {
    const branchId = this.branchStore.activeBranchId();
    const patient = this.selectedPatient();
    if (!branchId || !patient || !this.isValid()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const id = await this.svc.create({
        branch_id: branchId,
        patient_id: patient.id,
        address: {
          line1: this.addr.line1.trim(),
          line2: this.addr.line2.trim() || null,
          city: this.addr.city.trim(),
          pincode: this.addr.pincode.trim(),
        },
        scheduled_at: new Date(this.scheduledAt).toISOString(),
        contact_mobile: this.contactMobile.trim(),
        notes: this.notes.trim() || null,
        tests: this.distributeSurcharge(),
      });
      this.toast.success('Home collection booked', `Request ${id.slice(0, 8)}`);
      void this.router.navigate(['/home-collection']);
    } catch (e: any) {
      if (HomeCollectionCreatePage.isMissingTable(e)) {
        this.migrationMissing.set(true);
      } else {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private defaultSchedule(): string {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  }
}
