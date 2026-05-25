import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { PharmacyService } from '../data/pharmacy.service';
import { PharmacyPrintService } from '../services/pharmacy-print.service';
import { HospitalSettingsService, type HospitalSettings } from '../services/hospital-settings.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import type { CatalogItem, PosCartItem } from '../data/pharmacy.types';

interface PatientHit {
  id: string;
  uhid: string;
  full_name: string;
  mobile: string;
  date_of_birth?: string;
  gender?: string;
}

@Component({
  selector: 'app-pharmacy-pos-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Pharmacy</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/pharmacy" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive)">📋 Queue</a>
      <a routerLink="/pharmacy/pos" routerLinkActive #pa="routerLinkActive"
         [class]="tabCls(pa.isActive)">🧾 POS / Walk-in</a>
      <a routerLink="/pharmacy/stock" routerLinkActive #sa="routerLinkActive"
         [class]="tabCls(sa.isActive)">📦 Stock</a>
      <a routerLink="/pharmacy/history" routerLinkActive #ha="routerLinkActive"
         [class]="tabCls(ha.isActive)">🧾 History</a>
      <a routerLink="/pharmacy/settings" routerLinkActive #se="routerLinkActive"
         [class]="tabCls(se.isActive)">⚙️ Settings</a>
    </nav>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    <p>Active bill: <strong>{{ cartItemCount() }}</strong> item(s)</p>
    <p class="font-mono text-ink">{{ formatINR(grandTotal()) }}</p>
  </div>
</header>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
  <!-- LEFT — drug search + catalog hits -->
  <section class="lg:col-span-5 bg-surface-card border border-border rounded-[12px] overflow-hidden">
    <header class="px-4 py-3 border-b border-border">
      <p class="text-[12px] uppercase text-ink-muted tracking-[0.06em] font-medium">Search drug</p>
      <input [formControl]="searchCtrl" type="text" autofocus
             placeholder="generic, brand, or SKU — e.g. paracetamol, dolo, MED-001"
             class="mt-1.5 w-full h-11 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <p class="mt-1 text-[10px] text-ink-faint">Type at least 1 character. Click an item to add it to the bill.</p>
    </header>
    @if (searching()) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Searching…</div>
    } @else if (catalogHits().length === 0 && searchCtrl.value.length > 0) {
      <div class="px-6 py-10 text-center">
        <p class="text-[12px] text-ink-muted">No matches for "<strong>{{ searchCtrl.value }}</strong>" in catalog.</p>
        <button (click)="prefillManualFromSearch()" class="mt-3 h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">
          + Add as manual line
        </button>
        <p class="text-[10px] text-ink-faint mt-2">Manual lines bill normally. Stock goes negative until a GRN catches up.</p>
      </div>
    } @else if (catalogHits().length === 0) {
      <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Start typing to search the catalog.</div>
    } @else {
      <ul class="divide-y divide-border max-h-[480px] overflow-y-auto">
        @for (it of catalogHits(); track it.id) {
          <li class="px-4 py-2.5 hover:bg-surface-muted cursor-pointer" (click)="addToCart(it)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[13px] font-semibold text-ink">{{ it.generic_name || it.name }}</p>
                <p class="text-[11px] text-ink-muted truncate">
                  @if (it.brand_names?.length) { {{ it.brand_names!.join(', ') }} · }
                  {{ (it.forms ?? []).join('/') }}
                  @if (it.strengths?.length) { · {{ it.strengths!.join(', ') }} }
                </p>
                <p class="text-[10px] text-ink-faint mt-0.5">
                  <span class="font-mono">{{ it.sku }}</span>
                  @if (it.therapeutic_class) { · {{ it.therapeutic_class }} }
                  @if (it.primary_use) { · <em>{{ it.primary_use }}</em> }
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="font-mono text-[13px] font-semibold text-primary-700">{{ formatINR(it.default_unit_price_cents) }}</p>
                <p class="text-[10px] text-ink-muted">GST {{ it.gst_rate }}%</p>
              </div>
            </div>
          </li>
        }
      </ul>
    }
  </section>

  <!-- RIGHT — cart + patient + bill -->
  <section class="lg:col-span-7 flex flex-col gap-3">

    <!-- Patient -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <header class="px-4 py-3 border-b border-border">
        <p class="text-[12px] uppercase text-ink-muted tracking-[0.06em] font-medium">Patient</p>
      </header>
      <div class="p-3">
        @if (patient(); as p) {
          <div class="flex items-start justify-between gap-3 px-3 py-2 rounded-md bg-good-bg">
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink">{{ p.full_name }}</p>
              <p class="text-[11px] font-mono text-ink-muted">{{ p.uhid }} · {{ p.mobile }}</p>
            </div>
            <button (click)="clearPatient()" class="text-[11px] text-ink-muted hover:text-danger-fg">Change</button>
          </div>
        } @else {
          <input [formControl]="patientCtrl" type="text"
                 placeholder="Search patient by name / UHID / mobile (≥ 2 chars)"
                 class="w-full h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          @if (patientHits().length) {
            <ul class="mt-1.5 max-h-[160px] overflow-y-auto border border-border rounded-md divide-y divide-border">
              @for (p of patientHits(); track p.id) {
                <li class="px-3 py-2 hover:bg-surface-muted cursor-pointer" (click)="selectPatient(p)">
                  <p class="text-[12px] font-semibold text-ink">{{ p.full_name }}</p>
                  <p class="text-[10px] font-mono text-ink-muted">{{ p.uhid }} · {{ p.mobile }}</p>
                </li>
              }
            </ul>
          }
          <label class="mt-3 flex items-center gap-2 text-[11px] text-ink-soft">
            <input type="checkbox" [(ngModel)]="walkInMode" class="size-3.5 rounded">
            Walk-in (no UHID lookup)
          </label>
          @if (walkInMode) {
            <div class="mt-2 grid grid-cols-2 gap-2">
              <input [(ngModel)]="walkInName" placeholder="Customer name"
                     class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              <input [(ngModel)]="walkInMobile" placeholder="Mobile"
                     class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            </div>
            <p class="mt-1 text-[10px] text-ink-faint">Will create a one-time patient profile if needed.</p>
          }
        }

        <div class="mt-3">
          <div class="flex items-center justify-between mb-1">
            <span class="block text-[10px] uppercase text-ink-muted tracking-[0.06em] font-medium">Doctor (optional)</span>
            <label class="flex items-center gap-1.5 text-[10px] text-ink-soft cursor-pointer">
              <input type="checkbox" [(ngModel)]="manualDoctor" class="size-3 rounded">
              Type manually
            </label>
          </div>
          @if (manualDoctor) {
            <input [(ngModel)]="manualDoctorName" placeholder="e.g. Dr. Karthik Murthy (external)"
                   class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <p class="text-[10px] text-ink-faint mt-1">Will be printed on the receipt; not linked to a staff record.</p>
          } @else {
            <select [(ngModel)]="doctorId" class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="">— None —</option>
              @for (d of doctors(); track d.id) { <option [value]="d.id">{{ d.full_name }}</option> }
            </select>
          }
        </div>
      </div>
    </article>

    <!-- Cart -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden flex-1">
      <header class="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <p class="text-[12px] uppercase text-ink-muted tracking-[0.06em] font-medium">Cart · {{ cartItemCount() }} item(s)</p>
        <div class="flex items-center gap-3">
          <button (click)="toggleManual()" class="text-[11px] text-primary-700 hover:underline">
            {{ manualOpen() ? '× Close' : '+ Manual line' }}
          </button>
          @if (cart().length) {
            <button (click)="clearCart()" class="text-[11px] text-danger-fg hover:underline">Clear</button>
          }
        </div>
      </header>

      @if (manualOpen()) {
        <div class="px-4 py-3 border-b border-border bg-warn-bg/40 grid grid-cols-12 gap-2">
          <div class="col-span-12">
            <p class="text-[10px] uppercase tracking-[0.06em] text-warn-fg font-semibold">Manual line · off-catalog</p>
            <p class="text-[10px] text-ink-faint mt-0.5">Use when GRN is pending. Allowed; stock will go negative until reconciled.</p>
          </div>
          <input [(ngModel)]="manual_drug" placeholder="Drug name (e.g. Augmentin Duo)" class="col-span-12 h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          <input [(ngModel)]="manual_strength" placeholder="Strength" class="col-span-6 h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          <input [(ngModel)]="manual_form"     placeholder="Form (Tab/Inj/…)" class="col-span-6 h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          <label class="col-span-4 block">
            <span class="block text-[10px] text-ink-muted mb-0.5">Qty</span>
            <input type="number" min="1" [(ngModel)]="manual_qty" class="w-full h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          </label>
          <label class="col-span-4 block">
            <span class="block text-[10px] text-ink-muted mb-0.5">Price (₹)</span>
            <input type="number" min="0" step="0.01" [(ngModel)]="manual_price" class="w-full h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          </label>
          <label class="col-span-4 block">
            <span class="block text-[10px] text-ink-muted mb-0.5">GST %</span>
            <select [(ngModel)]="manual_gst" class="w-full h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option [ngValue]="0">0</option>
              <option [ngValue]="5">5</option>
              <option [ngValue]="12">12</option>
              <option [ngValue]="18">18</option>
              <option [ngValue]="28">28</option>
            </select>
          </label>
          @if (manualErr()) { <p class="col-span-12 text-[11px] text-danger-fg">{{ manualErr() }}</p> }
          <div class="col-span-12 flex justify-end">
            <button (click)="addManualLine()" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card" style="background:#0E4F8C;">
              + Add to cart
            </button>
          </div>
        </div>
      }
      @if (!cart().length) {
        <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Add drugs from the search to start a bill.</div>
      } @else {
        <ul class="divide-y divide-border max-h-[260px] overflow-y-auto">
          @for (c of cart(); track c.catalog_id; let i = $index) {
            <li class="px-3 pr-12 py-2.5">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-[12px] font-semibold text-ink truncate">
                    {{ c.drug_name }}
                    @if (c.is_manual) {
                      <span class="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-px rounded bg-warn-bg text-warn-fg">manual</span>
                    }
                  </p>
                  <p class="text-[10px] text-ink-muted truncate">
                    @if (c.strength) { {{ c.strength }} · }
                    @if (c.form) { {{ c.form }} · }
                    GST {{ c.gst_rate }}%
                  </p>
                </div>
                <button (click)="removeAt(i)" class="text-ink-muted hover:text-danger-fg text-[12px]" aria-label="Remove">✕</button>
              </div>
              <div class="mt-1.5 flex items-center gap-2">
                <button (click)="bump(i, -1)" class="size-6 rounded border border-border text-[12px] hover:bg-surface-muted">−</button>
                <input type="number" min="1" [ngModel]="c.qty" (ngModelChange)="setQty(i, $event)"
                       class="w-14 h-7 px-2 text-[12px] text-center border border-border rounded-md focus:outline-none focus:border-primary-600">
                <button (click)="bump(i, +1)" class="size-6 rounded border border-border text-[12px] hover:bg-surface-muted">+</button>
                <span class="text-[10px] text-ink-muted">×</span>
                <input type="number" min="0" step="0.01" [ngModel]="c.unit_price_cents / 100"
                       (ngModelChange)="setPrice(i, $event)"
                       class="w-20 h-7 px-2 text-[12px] text-right border border-border rounded-md focus:outline-none focus:border-primary-600">
                <span class="ml-auto font-mono text-[12px] font-semibold text-ink">{{ formatINR(c.line_total_cents) }}</span>
              </div>
            </li>
          }
        </ul>
      }
    </article>

    <!-- Totals + Bill -->
    <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
      <div class="px-4 py-3 pr-12 border-b border-border space-y-1.5 text-[12px]">
        <div class="flex justify-between"><span class="text-ink-muted">Subtotal</span><span class="font-mono">{{ formatINR(subtotal()) }}</span></div>
        <div class="flex justify-between"><span class="text-ink-muted">GST</span><span class="font-mono">{{ formatINR(gstTotal()) }}</span></div>
        @if (discount > 0) {
          <div class="flex justify-between text-good-fg"><span>Discount</span><span class="font-mono">−{{ formatINR(discount * 100) }}</span></div>
        }
        <div class="flex justify-between pt-2 border-t border-border text-[14px]">
          <span class="font-semibold text-ink">Grand total</span>
          <span class="font-mono font-bold text-primary-700">{{ formatINR(grandTotal()) }}</span>
        </div>
      </div>
      <div class="px-4 py-3 grid grid-cols-2 gap-2 border-b border-border">
        <label class="block">
          <span class="block text-[10px] uppercase text-ink-muted tracking-[0.06em] font-medium mb-1">Discount (₹)</span>
          <input type="number" min="0" [(ngModel)]="discount"
                 class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
        </label>
        <label class="block">
          <span class="block text-[10px] uppercase text-ink-muted tracking-[0.06em] font-medium mb-1">Payment</span>
          <select [(ngModel)]="paymentMethod" class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="net_banking">Net banking</option>
          </select>
        </label>
      </div>
      @if (formError()) { <p class="px-4 pt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }
      <div class="px-4 py-3 flex items-center justify-end gap-2">
        <button (click)="clearCart()" [disabled]="busy()"
                class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
          Cancel
        </button>
        <button (click)="bill()" [disabled]="!canBill() || busy()"
                class="h-10 px-5 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
                style="background:#0E4F8C;">
          {{ busy() ? 'Billing…' : '🖨 Bill & print' }}
        </button>
      </div>
    </article>
  </section>
</div>
  `,
})
export class PharmacyPosPage implements OnInit {
  private svc      = inject(PharmacyService);
  private printSvc = inject(PharmacyPrintService);
  private toast    = inject(ToastService);
  private auth     = inject(AuthStore);
  private destroyRef = inject(DestroyRef);
  private settingsSvc = inject(HospitalSettingsService);
  private pdfSvc = inject(InvoicePdfService);

  protected readonly hospitalSettings = signal<HospitalSettings | null>(null);

  protected readonly searchCtrl  = new FormControl('', { nonNullable: true });
  protected readonly patientCtrl = new FormControl('', { nonNullable: true });
  protected readonly catalogHits = signal<CatalogItem[]>([]);
  protected readonly searching   = signal(false);

  protected readonly patientHits = signal<PatientHit[]>([]);
  protected readonly patient     = signal<PatientHit | null>(null);
  protected walkInMode = true;
  protected walkInName = '';
  protected walkInMobile = '';
  protected doctorId = '';
  protected manualDoctor = true;
  protected manualDoctorName = '';
  protected readonly doctors = signal<{ id: string; full_name: string }[]>([]);

  protected readonly cart      = signal<PosCartItem[]>([]);
  protected discount = 0;
  protected paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking' = 'cash';

  protected readonly busy      = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly cartItemCount = computed(() => this.cart().reduce((a, c) => a + c.qty, 0));
  protected readonly subtotal = computed(() => this.cart().reduce((a, c) => a + c.line_total_cents, 0));
  protected readonly gstTotal = computed(() =>
    this.cart().reduce((a, c) => a + Math.round(c.line_total_cents * c.gst_rate / (100 + c.gst_rate)), 0)
  );
  protected readonly grandTotal = computed(() => Math.max(0, this.subtotal() - this.discount * 100));

  protected readonly canWrite = computed(() => this.auth.has('pharmacy.write'));

  protected canBill(): boolean {
    if (!this.canWrite()) return false;
    if (!this.cart().length) return false;
    if (this.walkInMode) return !!this.walkInName.trim();
    return !!this.patient();
  }

  async ngOnInit() {
    // Load hospital settings
    const branchId = (this.auth.claims().branch_id as string | undefined) ?? null;
    if (branchId) {
      const settings = await this.settingsSvc.loadSettings(branchId);
      this.hospitalSettings.set(settings);
    }

    void this.svc.listDoctors().then(d => this.doctors.set(d));

    this.searchCtrl.valueChanges
      .pipe(debounceTime(180), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (term) => {
        const t = (term ?? '').trim();
        if (!t) { this.catalogHits.set([]); return; }
        this.searching.set(true);
        try {
          this.catalogHits.set(await this.svc.searchCatalog(t, 12));
        } finally { this.searching.set(false); }
      });

    this.patientCtrl.valueChanges
      .pipe(debounceTime(220), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (term) => {
        const t = (term ?? '').trim();
        if (t.length < 2) { this.patientHits.set([]); return; }
        this.patientHits.set(await this.svc.searchPatients(t, 8));
      });
  }

  // ── catalog → cart ───────────────────────────────────────────────
  protected addToCart(it: CatalogItem): void {
    const cart = this.cart();
    const existing = cart.findIndex(c => c.catalog_id === it.id);
    if (existing >= 0) { this.bump(existing, +1); return; }

    const display = it.generic_name || it.name;
    const brand = (it.brand_names ?? [])[0] ? ` (${(it.brand_names ?? [])[0]})` : '';
    const strength = (it.strengths ?? [])[0] ?? null;
    const form = (it.forms ?? [])[0] ?? null;
    const next: PosCartItem = {
      catalog_id: it.id,
      sku: it.sku,
      drug_name: display + brand,
      generic_name: it.generic_name,
      strength, form,
      qty: 1,
      unit_price_cents: it.default_unit_price_cents,
      gst_rate: it.gst_rate,
      line_total_cents: it.default_unit_price_cents,
      is_manual: false,
    };
    this.cart.set([...cart, next]);
  }

  // ── manual line ─────────────────────────────────────────────────
  protected manual_drug = '';
  protected manual_strength = '';
  protected manual_form = '';
  protected manual_qty: number | null = 1;
  protected manual_price: number | null = null;
  protected manual_gst: number = 12;
  protected readonly manualOpen = signal(false);
  protected readonly manualErr  = signal<string | null>(null);

  protected toggleManual() {
    this.manualOpen.update(v => !v);
    this.manualErr.set(null);
  }

  protected prefillManualFromSearch() {
    this.manual_drug = this.searchCtrl.value.trim();
    this.manualOpen.set(true);
    this.manualErr.set(null);
  }

  protected addManualLine() {
    this.manualErr.set(null);
    const name = this.manual_drug.trim();
    const qty = Math.floor(this.manual_qty ?? 0);
    const priceRupees = this.manual_price ?? 0;
    if (!name) { this.manualErr.set('Drug name required'); return; }
    if (qty <= 0) { this.manualErr.set('Qty must be > 0'); return; }
    if (priceRupees < 0) { this.manualErr.set('Price cannot be negative'); return; }

    const cents = Math.round(priceRupees * 100);
    const item: PosCartItem = {
      catalog_id: null, sku: null,
      drug_name: name,
      generic_name: name,
      strength: this.manual_strength.trim() || null,
      form: this.manual_form.trim() || null,
      qty,
      unit_price_cents: cents,
      gst_rate: this.manual_gst,
      line_total_cents: qty * cents,
      is_manual: true,
    };
    this.cart.set([...this.cart(), item]);
    this.manual_drug = ''; this.manual_strength = ''; this.manual_form = '';
    this.manual_qty = 1; this.manual_price = null; this.manual_gst = 12;
    this.manualOpen.set(false);
  }

  protected bump(i: number, delta: number) {
    const cart = [...this.cart()];
    const c = cart[i]; if (!c) return;
    const qty = Math.max(1, c.qty + delta);
    cart[i] = { ...c, qty, line_total_cents: qty * c.unit_price_cents };
    this.cart.set(cart);
  }
  protected setQty(i: number, qty: number) {
    const n = Math.max(1, Math.floor(qty || 1));
    const cart = [...this.cart()];
    const c = cart[i]; if (!c) return;
    cart[i] = { ...c, qty: n, line_total_cents: n * c.unit_price_cents };
    this.cart.set(cart);
  }
  protected setPrice(i: number, rupees: number) {
    const cents = Math.max(0, Math.round((rupees ?? 0) * 100));
    const cart = [...this.cart()];
    const c = cart[i]; if (!c) return;
    cart[i] = { ...c, unit_price_cents: cents, line_total_cents: c.qty * cents };
    this.cart.set(cart);
  }
  protected removeAt(i: number) {
    const next = this.cart().slice(); next.splice(i, 1); this.cart.set(next);
  }
  protected clearCart() {
    this.cart.set([]); this.discount = 0; this.formError.set(null);
  }

  // ── patient ──────────────────────────────────────────────────────
  protected selectPatient(p: PatientHit) { this.patient.set(p); this.patientHits.set([]); this.patientCtrl.setValue(''); }
  protected clearPatient()                { this.patient.set(null); }

  // ── bill & print ─────────────────────────────────────────────────
  protected async bill() {
    if (!this.canBill()) return;
    this.busy.set(true);
    this.formError.set(null);

    console.log('🔵 [BILLING START] Initializing billing process...');

    try {
      // Step 1: Get or create patient
      let patientId = this.patient()?.id ?? null;
      console.log('📋 [PATIENT] PatientId from selector:', patientId);

      if (!patientId && this.walkInMode) {
        console.log('👤 [WALK-IN] Creating walk-in patient:', this.walkInName);
        patientId = await this.createWalkIn();
        console.log('✅ [WALK-IN] Walk-in patient created:', patientId);
      }
      if (!patientId) throw new Error('No patient selected');

      // Step 2: Prepare items
      const items = this.cart().map(c => ({
        drug_name: c.drug_name,
        strength: c.strength,
        qty: c.qty,
        unit_price_cents: c.unit_price_cents,
      }));
      console.log('💊 [ITEMS] Preparing cart items:', items.length, 'items');
      console.log('📦 [ITEMS] Items detail:', items);

      // Step 3: Prepare billing data
      const docName = this.manualDoctor ? this.manualDoctorName.trim() : '';
      const docPrefix = docName ? `Dr. ${docName} · ` : '';
      const billingNotes = `${docPrefix}POS · ${this.paymentMethod}` + (this.discount > 0 ? ` · disc ₹${this.discount}` : '');

      console.log('🏥 [BILLING] Doctor:', docName || 'None');
      console.log('💳 [BILLING] Payment Method:', this.paymentMethod);
      console.log('💰 [BILLING] Discount:', this.discount ? `₹${this.discount}` : 'None');
      console.log('📝 [BILLING] Notes:', billingNotes);

      // Step 4: CAPTURE PATIENT DATA BEFORE CLEARING IT
      const patientDataBeforeClear = this.patient();
      console.log('💾 [BILLING] Capturing patient data before clearing:', patientDataBeforeClear?.full_name);

      // Step 5: Call API to save to database
      console.log('🌐 [API] Calling opDispense API to save to database...');
      const res = await this.svc.opDispense({
        patientId,
        doctorStaffId: !this.manualDoctor && this.doctorId ? this.doctorId : null,
        items,
        notes: billingNotes,
      });

      console.log('✅ [API SUCCESS] Invoice saved to database!');
      console.log('📄 [API RESPONSE] Invoice Number:', res.invoice_number);
      console.log('📄 [API RESPONSE] Invoice ID:', res.invoice_id);
      console.log('💵 [API RESPONSE] Total Amount:', this.formatINR(res.total_cents));
      console.log('📊 [API RESPONSE] Full response:', res);

      // Step 6: Generate PDF WITH captured patient data
      console.log('🖨️  [PDF] Generating PDF invoice with captured patient data...');
      this.generateInvoicePDF(res.invoice_number, patientId, patientDataBeforeClear);
      console.log('✅ [PDF] PDF generation completed');

      // Step 7: Show success
      this.toast.success('Billed', `${res.invoice_number} · ${this.formatINR(res.total_cents)}`);
      console.log('🎉 [SUCCESS] Billing completed successfully!');

      // Step 8: Clear cart and patient AFTER PDF generation
      this.clearCart();
      this.clearPatient();
      this.walkInMode = false;
      this.walkInName = '';
      this.walkInMobile = '';
      this.doctorId = '';
      this.manualDoctor = false;
      this.manualDoctorName = '';

      console.log('🧹 [CLEANUP] Cart and patient data cleared');
    } catch (e) {
      console.error('❌ [ERROR] Billing failed:', e);
      console.error('❌ [ERROR] Error details:', (e as any)?.message || e);
      this.formError.set(this.errMsg(e));
      this.toast.error('Billing Failed', this.errMsg(e));
    } finally {
      this.busy.set(false);
      console.log('🔴 [BILLING END] Billing process finished');
    }
  }

  private async createWalkIn(): Promise<string> {
    const name = this.walkInName.trim();
    const mobile = (this.walkInMobile || '').trim();
    const supabase = (this.svc as any).supabase.client;

    // Find by mobile first (so a repeat walk-in reuses the same UHID).
    if (mobile) {
      const { data } = await supabase
        .from('patients').select('id, uhid, full_name, mobile, date_of_birth, gender')
        .eq('mobile', mobile)
        .is('archived_at', null).limit(1).maybeSingle();
      if (data?.id) {
        this.patient.set(data as PatientHit);
        console.log('👤 [WALK-IN] Found existing patient by mobile:', data.full_name);
        return data.id as string;
      }
    }

    const branchId = (this.auth.claims().branch_id as string | undefined) ?? null;
    if (!branchId) throw new Error('No active branch — cannot create walk-in patient.');

    const parts = name.split(/\s+/);
    const first = parts[0] || 'Walk-in';
    const last  = parts.length > 1 ? parts.slice(1).join(' ') : 'Patient';

    // patients table requires: branch_id, first_name, last_name, date_of_birth, gender, mobile.
    // For walk-ins we don't know DOB or gender — use 'unknown' and a placeholder DOB.
    const placeholderDob = '1900-01-01';
    const safeMobile = mobile || `WALKIN-${Date.now().toString().slice(-7)}`;

    const { data, error } = await supabase
      .from('patients')
      .insert({
        branch_id: branchId,
        first_name: first,
        last_name: last,
        mobile: safeMobile,
        date_of_birth: placeholderDob,
        gender: 'other',
      })
      .select('id, uhid, full_name, mobile, date_of_birth, gender').single();
    if (error) throw error;

    // Set the created patient in the signal so it's available for PDF generation
    this.patient.set(data as PatientHit);
    console.log('✅ [WALK-IN] Walk-in patient created and set in signal:', data.full_name);
    return data.id as string;
  }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
  protected formatINR(c: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((c ?? 0) / 100);
  }

  protected openSettings(): void {
    const name = prompt('Enter Pharmacy Name:', this.hospitalSettings()?.pharmacy_name || 'NIYAMONE PHARMACY');
    if (!name) return;

    const settings: HospitalSettings = {
      hospital_name: this.hospitalSettings()?.hospital_name || 'NIYAMONE HOSPITAL',
      hospital_phone: this.hospitalSettings()?.hospital_phone || '',
      hospital_email: this.hospitalSettings()?.hospital_email || '',
      hospital_website: this.hospitalSettings()?.hospital_website || '',
      pharmacy_name: name,
      pharmacy_license: this.hospitalSettings()?.pharmacy_license || '',
      branch_id: (this.auth.claims().branch_id as string) || '',
    };

    void this.settingsSvc.saveSettings(settings).then(() => {
      this.hospitalSettings.set(settings);
      this.toast.success('Settings saved', `Pharmacy: ${name}`);
    });
  }

  private generateInvoicePDF(invoiceNumber: string, patientId: string, patientData?: PatientHit | null): void {
    console.log('🖨️  [PDF START] Generating PDF for invoice:', invoiceNumber);
    console.log('📍 [PDF] PatientId:', patientId);

    // Use passed patient data or fall back to current state
    const patient = patientData || this.patient();
    let settings = this.hospitalSettings();

    console.log('👤 [PDF] Patient data:', patient ? patient.full_name : 'NULL');
    console.log('⚙️  [PDF] Settings:', settings ? settings.hospital_name : 'NULL (using defaults)');

    if (!patient) {
      console.error('❌ [PDF ERROR] No patient data available!');
      console.error('❌ [PDF ERROR] PatientId was:', patientId);
      this.toast.error('PDF Error', 'Patient data not found');
      return;
    }

    console.log('👤 [PDF] Patient Data:', {
      name: patient.full_name,
      uhid: patient.uhid,
      mobile: patient.mobile,
      dob: patient.date_of_birth,
      gender: patient.gender,
    });

    // Use default settings if not loaded
    if (!settings) {
      console.log('⚙️  [PDF] Hospital settings not loaded, using defaults');
      settings = {
        hospital_name: 'Sree Diagnostics',
        hospital_address: 'Vijayawada, Andhra Pradesh',
        hospital_phone: '8008331234',
        hospital_email: 'info@sreediagnostics.in',
        hospital_website: 'www.sreediagnostics.in',
        pharmacy_name: 'Sree Diagnostics',
        gst_number: 'GST11211233',
        branch_id: (this.auth.claims().branch_id as string) || '',
      };
    } else {
      console.log('⚙️  [PDF] Using loaded hospital settings:', settings.hospital_name);
    }

    // Calculate age from DOB
    let patientAge = '';
    if (patient.date_of_birth) {
      const dob = new Date(patient.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const month = today.getMonth() - dob.getMonth();
      if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) age--;
      patientAge = `${age} yrs`;
      if (patient.gender && patient.gender !== 'unknown') {
        patientAge += ` / ${this.getGenderLabel(patient.gender)}`;
      }
      console.log('🎂 [PDF] Patient Age Calculated:', patientAge);
    }

    // Calculate GST amounts
    const subtotal = this.subtotal();
    const discount = this.discount * 100;
    const netAmount = subtotal - discount;

    // Calculate GST - assuming average rate from cart items
    const avgGstRate = this.calculateAvgGstRate();
    const gstAmount = Math.round(netAmount * avgGstRate / (100 + avgGstRate));
    const cgst = Math.round(gstAmount / 2);
    const sgst = Math.round(gstAmount / 2);
    const igst = 0; // For domestic, SGST + CGST is used, not IGST

    console.log('💰 [PDF] Billing Summary:', {
      subtotal_rupees: (subtotal / 100).toFixed(2),
      discount_rupees: (discount / 100).toFixed(2),
      cgst_rupees: (cgst / 100).toFixed(2),
      sgst_rupees: (sgst / 100).toFixed(2),
      total_rupees: (this.grandTotal() / 100).toFixed(2),
      items_count: this.cart().length,
      payment_method: this.paymentMethod,
    });

    const invoiceData = {
      invoice_number: invoiceNumber,
      invoice_date: new Date().toLocaleDateString('en-IN'),
      invoice_type: 'OP' as const,
      patient_name: patient.full_name,
      patient_uhid: patient.uhid,
      patient_mobile: patient.mobile,
      patient_age: patientAge,
      doctor_name: this.manualDoctor ? this.manualDoctorName : '',
      items: this.cart(),
      subtotal_cents: subtotal,
      discount_cents: discount,
      cgst_cents: cgst,
      sgst_cents: sgst,
      igst_cents: igst,
      total_cents: this.grandTotal(),
      payment_method: this.paymentMethod,
      notes: '',
      settings,
    };

    console.log('📦 [PDF] Invoice Data Prepared:', invoiceData);
    console.log('🌐 [PDF] Calling PDF service to generate and open print window...');

    this.pdfSvc.generatePDF(invoiceData, true);

    console.log('✅ [PDF] PDF service called successfully');
    this.toast.success('PDF Generated', 'Print window opening...');
  }

  private getGenderLabel(gender: string): string {
    const labels: Record<string, string> = {
      'male': 'M',
      'female': 'F',
      'other': 'Other',
      'unknown': 'Other',
    };
    return labels[gender.toLowerCase()] || 'Other';
  }

  private calculateAvgGstRate(): number {
    const items = this.cart();
    if (items.length === 0) return 5;
    const total = items.reduce((sum, item) => sum + item.gst_rate, 0);
    return Math.round(total / items.length);
  }

  private errMsg(e: unknown): string {
    if (!e) return 'Try again.';
    if (typeof e === 'string') return e;
    const o = e as Record<string, any>;
    return o['message'] || o['error_description'] || o['details'] || o['hint'] || 'Try again.';
  }
}
