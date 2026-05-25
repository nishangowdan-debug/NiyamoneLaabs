import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LabService } from '../data/lab.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ConsentService } from '../../consent/data/consent.service';
import { ConsentCaptureComponent } from '../../consent/components/consent-capture.component';

interface LabPackage {
  id: string;
  code: string;
  name: string;
  category: string | null;
  price_cents: number;
  is_radiology: boolean;
}

interface CartTest {
  id: string;
  code: string;
  name: string;
  category: string | null;
  is_radiology: boolean;
  source: 'individual' | 'package';
  package_code?: string;
}

@Component({
  selector: 'app-investigation-order-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ConsentCaptureComponent],
  template: `
<div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center pt-[5vh] pb-4 overflow-auto" (document:keydown.escape)="onBackdropClick($event)">
  <div class="bg-surface-card rounded-[14px] shadow-card w-full max-w-[940px] mx-4 flex flex-col max-h-[88vh]" (click)="$event.stopPropagation()">

    <!-- Header -->
    <header class="px-5 py-4 border-b border-border flex items-center justify-between">
      <div>
        <h2 class="font-display text-[18px] font-medium text-ink leading-tight">🧪 Order Investigations</h2>
        <p class="text-[11.5px] text-ink-muted mt-0.5">
          {{ patientName || 'Patient' }} · <span class="font-mono uppercase">{{ source }}</span>
          @if (source === 'ipd') { <span class="ml-1 px-1.5 py-px rounded text-[9.5px] font-bold uppercase bg-warn-bg text-warn-fg">credit · auto-bill</span> }
          @else { <span class="ml-1 px-1.5 py-px rounded text-[9.5px] font-bold uppercase bg-info-bg text-info-fg">cashier collects payment</span> }
        </p>
      </div>
      <button (click)="close()" class="size-8 rounded-md hover:bg-surface-subtle text-ink-muted" aria-label="Close">✕</button>
    </header>

    <!-- Body: 2-column (left = picker, right = cart) -->
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 overflow-hidden">

      <!-- LEFT: Packages + Test search -->
      <section class="lg:col-span-7 flex flex-col gap-3 overflow-hidden">

        <!-- Packages -->
        <article class="bg-surface-subtle rounded-[10px] p-3 border border-border">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Clinical packages</p>
          @if (packages().length === 0) {
            <p class="text-[11px] text-ink-faint">No packages defined yet.</p>
          } @else {
            <div class="grid grid-cols-2 gap-1.5 max-h-[170px] overflow-y-auto pr-1">
              @for (pkg of packages(); track pkg.id) {
                <button (click)="addPackage(pkg)"
                        [disabled]="isPackageAdded(pkg.code)"
                        class="text-left px-2.5 py-1.5 rounded-md border border-border hover:bg-surface-card disabled:opacity-50 disabled:bg-good-bg disabled:border-good-border">
                  <p class="text-[12px] font-semibold text-ink truncate">{{ pkg.name }}</p>
                  <p class="text-[10px] text-ink-muted">
                    @if (pkg.category) { {{ pkg.category }} · }
                    <span class="font-mono">₹{{ (pkg.price_cents / 100).toFixed(0) }}</span>
                    @if (isPackageAdded(pkg.code)) { · ✓ added }
                  </p>
                </button>
              }
            </div>
          }
        </article>

        <!-- Individual tests search -->
        <article class="flex-1 flex flex-col bg-surface-subtle rounded-[10px] border border-border overflow-hidden min-h-0">
          <header class="px-3 py-2 border-b border-border">
            <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Individual tests</p>
            <input [(ngModel)]="testSearch" (ngModelChange)="onSearch($event)"
                   placeholder="Search by code or name (e.g. CBC, glucose, X-ray)…"
                   class="w-full h-9 px-2.5 text-[12.5px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
          </header>
          <ul class="flex-1 overflow-y-auto divide-y divide-border min-h-0">
            @for (t of filteredTests(); track t.id) {
              <li class="px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface-card cursor-pointer" (click)="addTest(t)">
                <div class="min-w-0">
                  <p class="text-[12.5px] font-semibold text-ink truncate">{{ t.name }}</p>
                  <p class="text-[10px] text-ink-muted">
                    <span class="font-mono">{{ t.code }}</span>
                    @if (t.category) { · {{ t.category }} }
                    @if (t.is_radiology) { · <span class="text-warn-fg">🩻 imaging</span> }
                  </p>
                </div>
                <span class="text-[11px] font-mono text-ink-soft shrink-0">{{ formatPrice(t.price_cents) }}</span>
              </li>
            } @empty {
              <li class="px-4 py-8 text-center text-[12px] text-ink-muted">
                @if (loadingTests()) { Loading catalogue… }
                @else if (testSearch.trim().length === 0) { Type to search the test catalogue. }
                @else { No tests match "{{ testSearch }}". }
              </li>
            }
          </ul>
        </article>
      </section>

      <!-- RIGHT: Cart + meta -->
      <section class="lg:col-span-5 flex flex-col gap-3 overflow-hidden">
        <article class="flex-1 flex flex-col bg-surface-subtle rounded-[10px] border border-border overflow-hidden min-h-0">
          <header class="px-3 py-2 border-b border-border flex items-center justify-between">
            <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Cart · {{ cart().length }} test(s)</p>
            @if (cart().length > 0) {
              <button (click)="clearCart()" class="text-[10.5px] text-danger-fg hover:underline">Clear</button>
            }
          </header>
          <ul class="flex-1 overflow-y-auto divide-y divide-border min-h-0">
            @for (c of cart(); track c.id) {
              <li class="px-3 py-2 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-[12px] font-medium text-ink truncate">{{ c.name }}</p>
                  <p class="text-[10px] text-ink-muted">
                    <span class="font-mono">{{ c.code }}</span>
                    @if (c.source === 'package') { · <span class="text-primary-700">via {{ c.package_code }}</span> }
                  </p>
                </div>
                <button (click)="removeFromCart(c)" class="text-ink-muted hover:text-danger-fg text-[12px]" aria-label="Remove">✕</button>
              </li>
            } @empty {
              <li class="px-4 py-8 text-center text-[12px] text-ink-muted">Pick a package or search a test to add.</li>
            }
          </ul>
        </article>

        <article class="bg-surface-subtle rounded-[10px] border border-border p-3 space-y-2.5">
          <label class="block">
            <span class="block text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Priority</span>
            <select [(ngModel)]="priority"
                    class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT (immediate)</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Clinical notes <span class="text-ink-faint normal-case">(optional)</span></span>
            <textarea [(ngModel)]="notes" rows="2"
                      placeholder="Suspected diagnosis, indication, fasting status…"
                      class="w-full px-2.5 py-1.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 resize-y"></textarea>
          </label>
          @if (estimatedPrice() > 0) {
            <p class="text-[11px] text-ink-muted pt-1 border-t border-border">
              Estimated price: <span class="font-mono font-semibold text-ink">₹{{ (estimatedPrice() / 100).toFixed(2) }}</span>
              @if (source === 'ipd') { · <span class="text-warn-fg">added to admission ledger</span> }
            </p>
          }
        </article>
      </section>
    </div>

    <!-- Footer -->
    @if (formError()) {
      <p class="px-5 py-2 text-[12px] text-danger-fg bg-danger-bg/40 border-t border-danger-border">{{ formError() }}</p>
    }
    <footer class="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
      <button (click)="close()" [disabled]="busy()"
              class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
        Cancel
      </button>
      <button (click)="placeOrder()" [disabled]="!canPlace() || busy()"
              class="h-10 px-5 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
              style="background:#0E4F8C;">
        {{ busy() ? 'Placing…' : (source === 'ipd' ? 'Place order (auto-bill)' : 'Place order') }}
      </button>
    </footer>
  </div>
</div>

<!-- Phase A trigger #3: HIV-test consent gate -->
@if (hivConsentGate()) {
  <app-consent-capture
    [patientId]="patientId"
    [patientName]="patientName"
    [admissionId]="admissionId"
    [encounterId]="encounterId"
    prefillFormCode="HIV-TEST"
    (closed)="hivConsentGate.set(false)"
    (saved)="onHivConsentSaved($event)" />
}
  `,
})
export class InvestigationOrderPanelComponent implements OnInit {
  private svc   = inject(LabService);
  private toast = inject(ToastService);

  @Input({ required: true }) patientId!: string;
  @Input() patientName: string | null = null;
  @Input({ required: true }) source!: 'opd' | 'ipd';
  @Input() admissionId: string | null = null;
  @Input() encounterId: string | null = null;
  @Output() closed  = new EventEmitter<void>();
  @Output() placed  = new EventEmitter<{ orderId: string }>();

  protected readonly packages    = signal<LabPackage[]>([]);
  // LabTest plus runtime-only fields added by the Phase 1 migration (price_cents, is_radiology)
  protected readonly tests       = signal<any[]>([]);
  protected readonly loadingTests = signal(false);
  protected readonly cart        = signal<CartTest[]>([]);
  protected readonly busy        = signal(false);
  protected readonly formError   = signal<string | null>(null);

  protected testSearch = '';
  protected priority: 'routine' | 'urgent' | 'stat' = 'routine';
  protected notes = '';

  protected readonly filteredTests = computed(() => {
    const term = this.testSearch.trim().toLowerCase();
    const all = this.tests();
    if (!term) return all.slice(0, 50);
    return all.filter(t =>
      t.code.toLowerCase().includes(term) ||
      t.name.toLowerCase().includes(term) ||
      (t.category ?? '').toLowerCase().includes(term),
    ).slice(0, 80);
  });

  protected readonly estimatedPrice = computed(() => {
    const pkgs = this.packages();
    const cart = this.cart();
    let total = 0;
    const billedPkgs = new Set<string>();
    for (const c of cart) {
      if (c.source === 'package' && c.package_code && !billedPkgs.has(c.package_code)) {
        const p = pkgs.find(x => x.code === c.package_code);
        if (p) total += p.price_cents;
        billedPkgs.add(c.package_code);
      } else if (c.source === 'individual') {
        const t = this.tests().find(x => x.id === c.id) as any;
        total += (t?.price_cents ?? 0);
      }
    }
    return total;
  });

  async ngOnInit() {
    this.loadingTests.set(true);
    try {
      const [pkgs, ts] = await Promise.all([
        this.svc.listPackages(),
        this.svc.listTestCatalogue(),
      ]);
      this.packages.set(pkgs);
      this.tests.set(ts as any[]);
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to load catalogue.');
    } finally {
      this.loadingTests.set(false);
    }
  }

  protected onSearch(_v: string) { /* ngModel handles state, computed handles filter */ }

  protected addPackage(pkg: LabPackage) {
    if (this.isPackageAdded(pkg.code)) return;
    // Server resolves package → tests at place time, but we want to *show* the breakdown in cart.
    // Cheap UX: add a single placeholder line per package; server will expand.
    const placeholder: CartTest = {
      id: 'pkg::' + pkg.code,
      code: pkg.code,
      name: pkg.name,
      category: pkg.category,
      is_radiology: pkg.is_radiology,
      source: 'package',
      package_code: pkg.code,
    };
    this.cart.set([...this.cart(), placeholder]);
  }

  protected isPackageAdded(code: string): boolean {
    return this.cart().some(c => c.source === 'package' && c.package_code === code);
  }

  protected addTest(t: any) {
    if (this.cart().some(c => c.id === t.id && c.source === 'individual')) return;
    this.cart.set([...this.cart(), {
      id: t.id, code: t.code, name: t.name, category: t.category,
      is_radiology: t.is_radiology ?? false,
      source: 'individual',
    }]);
  }

  protected removeFromCart(c: CartTest) {
    this.cart.set(this.cart().filter(x => !(x.id === c.id && x.source === c.source)));
  }
  protected clearCart()  { this.cart.set([]); }
  protected canPlace(): boolean {
    return this.cart().length > 0
      && (this.source === 'opd' || (this.source === 'ipd' && !!this.admissionId));
  }

  protected formatPrice(c: number | null | undefined): string {
    if (c == null) return '';
    return '₹' + (c / 100).toFixed(0);
  }

  protected async placeOrder() {
    if (!this.canPlace()) return;

    // Phase A trigger #3: HIV-test consent gate. If the cart contains an HIV
    // test code, require an active HIV-TEST consent before placing the order.
    const cart = this.cart();
    const codes = cart.map(c => c.code.toUpperCase());
    const hasHiv = codes.some(c => c === 'HIV' || c.startsWith('HIV-') || c.includes('HIV'));
    if (hasHiv) {
      try {
        const ok = await this.consentSvc.hasActive(this.patientId, 'HIV-TEST', this.admissionId);
        if (!ok) {
          this.hivConsentGate.set(true);
          return;     // Do not proceed — modal handles the rest.
        }
      } catch { /* if the check fails, fall through and let DB enforce later */ }
    }

    await this.doPlace();
  }

  /** Actual order-placement; called either directly or after the HIV consent gate clears. */
  private async doPlace(): Promise<void> {
    this.busy.set(true);
    this.formError.set(null);
    try {
      const cart = this.cart();
      const testCodes    = cart.filter(c => c.source === 'individual').map(c => c.code);
      const packageCodes = cart.filter(c => c.source === 'package').map(c => c.package_code!).filter(Boolean);

      const order = await this.svc.placeInvestigation({
        patientId:    this.patientId,
        testCodes,
        packageCodes,
        priority:     this.priority,
        source:       this.source,
        admissionId:  this.admissionId,
        encounterId:  this.encounterId,
        notes:        this.notes.trim() || undefined,
      });

      this.toast.success('Order placed', `${cart.length} item(s) queued for the lab.`);
      this.placed.emit({ orderId: order.id });
      this.close();
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to place order.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Phase A: HIV consent gate state. */
  protected readonly hivConsentGate = signal(false);
  private readonly consentSvc = inject(ConsentService);

  protected onHivConsentSaved(_e: { consentId: string }): void {
    this.hivConsentGate.set(false);
    this.toast.success('HIV testing consent captured', 'Placing order…');
    void this.doPlace();
  }

  protected close() { this.closed.emit(); }
  protected onBackdropClick(_e: Event) { if (!this.busy()) this.close(); }
}
