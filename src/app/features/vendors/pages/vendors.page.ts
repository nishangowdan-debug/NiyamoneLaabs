import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { VendorsService } from '../data/vendors.service';
import { VendorsStore } from '../data/vendors.store';
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  METHOD_LABEL,
  TERMS_LABEL,
  VendorAddress,
  VendorFilter,
} from '../data/vendors.types';
import type { Vendor } from '../data/vendors.types';
import type {
  Json,
  VendorCategory,
  VendorPaymentMethod,
  VendorPaymentTerms,
} from '../../../core/supabase/supabase.types';

interface VendorForm {
  code: string;
  name: string;
  category: VendorCategory | '';
  gstn: string;
  pan: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  payment_terms: VendorPaymentTerms;
  default_payment_method: VendorPaymentMethod | '';
  notes: string;
  is_active: boolean;
}

@Component({
  selector: 'app-vendors-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Vendors</h1>
        <p class="text-[13px] text-ink-muted mt-1">
          {{ store.totals().active }} active · {{ store.totals().inactive }} inactive ·
          <span class="inline-flex items-center gap-1.5 text-good-fg">
            <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>realtime
          </span>
        </p>
      </div>
      @if (canWrite()) {
        <button type="button" (click)="openNew()"
                class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New vendor
        </button>
      }
    </header>

    <!-- ── KPI strip ─────────────────────────────────────────── -->
    <div class="grid grid-cols-12 gap-[14px] mb-4">
      <article class="col-span-12 md:col-span-4 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Active vendors</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ store.totals().active }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Onboarded for procurement</p>
      </article>

      <article class="col-span-12 md:col-span-4 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Categories</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2">{{ activeCategoryCount() }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Distinct supply lines</p>
      </article>

      <article class="col-span-12 md:col-span-4 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Inactive</p>
        <p class="font-display text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-2"
           [class.text-warn-fg]="store.totals().inactive > 0">{{ store.totals().inactive }}</p>
        <p class="text-[11px] text-ink-muted mt-1.5">Archived but kept for history</p>
      </article>
    </div>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl"
               placeholder="Search by name, code, GSTN, contact…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <select [value]="store.category()" (change)="onCategory($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        <option value="all">All categories</option>
        @for (c of categoryOptions; track c.value) {
          <option [value]="c.value">{{ c.label }}</option>
        }
      </select>

      <div class="flex items-center gap-1 text-xs">
        @for (f of filterPills; track f.value) {
          <button type="button" (click)="onFilter(f.value)" [class]="filterBtnCls(f.value)">{{ f.label }}</button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ store.visible().length.toLocaleString('en-IN') }} of {{ store.totals().total.toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load vendors">{{ store.error() }}</app-alert>
      </div>
    }

    <!-- ── Vendor table ──────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Code</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Vendor</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Category</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">GSTN</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Terms</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Contact</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.vendors().length === 0) {
            <tr><td colspan="7" class="px-4 py-12 text-center text-[13px] text-ink-muted">Loading vendors…</td></tr>
          } @else {
            @for (v of store.visible(); track v.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                  [class.opacity-60]="!v.is_active">
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ v.code }}</td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2">
                    <p class="text-[13px] font-medium text-ink">{{ v.name }}</p>
                    @if (!v.is_active) {
                      <span class="inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] font-semibold uppercase tracking-[0.04em] bg-surface-subtle text-ink-muted">Inactive</span>
                    }
                  </div>
                  @if (v.address) {
                    <p class="text-[11px] text-ink-muted truncate max-w-[420px]">{{ formatAddress(v.address) }}</p>
                  }
                </td>
                <td class="px-4 py-2.5">
                  <span [class]="categoryChipCls(v.category)">{{ CATEGORY_LABEL[v.category] }}</span>
                </td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ v.gstn || '—' }}</td>
                <td class="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">
                  {{ TERMS_LABEL[v.payment_terms] }}
                  @if (v.default_payment_method) {
                    <small class="block text-[10px] text-ink-muted">{{ METHOD_LABEL[v.default_payment_method] }}</small>
                  }
                </td>
                <td class="px-4 py-2.5">
                  @if (v.contact_name) {
                    <p class="text-[12px] text-ink">{{ v.contact_name }}</p>
                  }
                  @if (v.contact_phone) {
                    <p class="text-[11px] font-mono text-ink-muted">{{ v.contact_phone }}</p>
                  }
                </td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  @if (canWrite()) {
                    <div class="inline-flex items-center gap-1">
                      <button type="button" (click)="openEdit(v)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">
                        Edit
                      </button>
                      <button type="button" (click)="toggleActive(v)" [disabled]="busy() === v.id"
                              [class]="v.is_active
                                ? 'h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-warn-fg hover:bg-warn-bg disabled:opacity-50'
                                : 'h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-good-fg hover:bg-good-bg disabled:opacity-50'">
                        {{ v.is_active ? 'Deactivate' : 'Activate' }}
                      </button>
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No vendors match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openNew()" class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Onboard the first vendor →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Vendor form modal (create / edit) ─────────────────── -->
    @if (formOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeForm()">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[680px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">
            {{ editingId() ? 'Edit vendor' : 'New vendor' }}
          </h2>
          <p class="text-[12px] text-ink-muted mt-0.5">Vendors are scoped to your branch.</p>

          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
              <input type="text" [(ngModel)]="form.code" name="code" placeholder="V-CIPLA"
                     [disabled]="!!editingId()"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 disabled:opacity-60" />
            </label>
            <label class="col-span-6 md:col-span-8 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
              <input type="text" [(ngModel)]="form.name" name="name"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category *</span>
              <select [(ngModel)]="form.category" name="cat"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (c of categoryOptions; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">GSTN</span>
              <input type="text" [(ngModel)]="form.gstn" name="gstn" placeholder="15-digit GSTIN"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">PAN</span>
              <input type="text" [(ngModel)]="form.pan" name="pan" placeholder="10-char PAN"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <p class="col-span-12 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mt-2">Contact</p>

            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name</span>
              <input type="text" [(ngModel)]="form.contact_name" name="cname"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</span>
              <input type="email" [(ngModel)]="form.contact_email" name="cemail"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Phone</span>
              <input type="tel" [(ngModel)]="form.contact_phone" name="cphone"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <p class="col-span-12 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mt-2">Address</p>

            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Line 1</span>
              <input type="text" [(ngModel)]="form.address_line1" name="aline1"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-6 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Line 2</span>
              <input type="text" [(ngModel)]="form.address_line2" name="aline2"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">City</span>
              <input type="text" [(ngModel)]="form.address_city" name="acity"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">State</span>
              <input type="text" [(ngModel)]="form.address_state" name="astate"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">PIN</span>
              <input type="text" [(ngModel)]="form.address_pincode" name="apin"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <p class="col-span-12 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mt-2">Payment</p>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Terms *</span>
              <select [(ngModel)]="form.payment_terms" name="terms"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (t of termsOptions; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Method</span>
              <select [(ngModel)]="form.default_payment_method" name="method"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                <option value="">—</option>
                @for (m of methodOptions; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-12 md:col-span-4 inline-flex items-end gap-2 pb-1">
              <input type="checkbox" [(ngModel)]="form.is_active" name="active"
                     class="size-3.5" style="accent-color: var(--color-primary-600);" />
              <span class="text-[13px] text-ink">Active</span>
            </label>

            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Notes (optional)</span>
              <input type="text" [(ngModel)]="form.notes" name="notes"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="closeForm()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmForm()" [disabled]="!canSubmit() || busy() === 'form'"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() === 'form' ? 'Saving…' : (editingId() ? 'Save changes' : 'Create vendor') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class VendorsPage implements OnInit, OnDestroy {
  protected readonly store = inject(VendorsStore);
  private svc = inject(VendorsService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('vendors.write'));
  protected readonly busy = signal<string | null>(null);

  // Re-export to template
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly TERMS_LABEL = TERMS_LABEL;
  protected readonly METHOD_LABEL = METHOD_LABEL;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly categoryOptions: { value: VendorCategory; label: string }[] = [
    { value: 'pharmacy',    label: 'Pharmacy' },
    { value: 'disposables', label: 'Disposables' },
    { value: 'equipment',   label: 'Equipment' },
    { value: 'consumables', label: 'Consumables' },
    { value: 'reagents',    label: 'Reagents' },
    { value: 'services',    label: 'Services' },
    { value: 'f_and_b',     label: 'F & B' },
    { value: 'stationery',  label: 'Stationery' },
    { value: 'other',       label: 'Other' },
  ];

  protected readonly termsOptions: { value: VendorPaymentTerms; label: string }[] = [
    { value: 'immediate', label: 'Immediate' },
    { value: 'net_15',    label: 'Net 15' },
    { value: 'net_30',    label: 'Net 30' },
    { value: 'net_45',    label: 'Net 45' },
    { value: 'net_60',    label: 'Net 60' },
    { value: 'advance',   label: 'Advance' },
  ];

  protected readonly methodOptions: { value: VendorPaymentMethod; label: string }[] = [
    { value: 'neft',   label: 'NEFT' },
    { value: 'rtgs',   label: 'RTGS' },
    { value: 'imps',   label: 'IMPS' },
    { value: 'upi',    label: 'UPI' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'cash',   label: 'Cash' },
    { value: 'loc',    label: 'Letter of credit' },
  ];

  protected readonly filterPills: { value: VendorFilter; label: string }[] = [
    { value: 'active',   label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'all',      label: 'All' },
  ];

  protected readonly activeCategoryCount = computed(() =>
    Object.keys(this.store.totals().byCategory).length,
  );

  // ── Form modal state
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected form: VendorForm = this.makeBlankForm();

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.store.load();
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());

    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setSearch(term ?? ''));
  }

  ngOnDestroy() {
    this.unsubscribe?.();
  }

  protected onCategory(v: string) { this.store.setCategory(v as 'all' | VendorCategory); }
  protected onFilter(v: VendorFilter) { this.store.setFilter(v); }

  protected filterBtnCls(value: VendorFilter): string {
    const isActive = this.store.filter() === value;
    const base = 'h-8 px-3 rounded-md font-medium transition-colors';
    return isActive
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card text-ink-soft border border-border hover:bg-surface-subtle`;
  }

  protected categoryChipCls(c: VendorCategory): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${CATEGORY_TONE[c]}`;
  }

  protected formatAddress(addr: unknown): string {
    if (!addr || typeof addr !== 'object') return '';
    const a = addr as VendorAddress;
    return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
  }

  // ── Form flow ──────────────────────────────────────
  protected openNew() {
    this.editingId.set(null);
    this.form = this.makeBlankForm();
    this.formOpen.set(true);
  }

  protected openEdit(v: Vendor) {
    this.editingId.set(v.id);
    const a = (v.address ?? {}) as VendorAddress;
    this.form = {
      code: v.code,
      name: v.name,
      category: v.category,
      gstn: v.gstn ?? '',
      pan: v.pan ?? '',
      contact_name: v.contact_name ?? '',
      contact_email: v.contact_email ?? '',
      contact_phone: v.contact_phone ?? '',
      address_line1: a.line1 ?? '',
      address_line2: a.line2 ?? '',
      address_city: a.city ?? '',
      address_state: a.state ?? '',
      address_pincode: a.pincode ?? '',
      payment_terms: v.payment_terms,
      default_payment_method: v.default_payment_method ?? '',
      notes: v.notes ?? '',
      is_active: v.is_active,
    };
    this.formOpen.set(true);
  }

  protected closeForm() { this.formOpen.set(false); }

  protected canSubmit(): boolean {
    return !!this.form.code.trim() && !!this.form.name.trim() && !!this.form.category;
  }

  protected async confirmForm() {
    if (!this.canSubmit()) return;
    const branchId = this.auth.claims().branch_id;
    if (!branchId) {
      this.toast.error('No branch in session', 'Sign out and back in.');
      return;
    }
    this.busy.set('form');
    try {
      const address: VendorAddress = {};
      if (this.form.address_line1)   address.line1   = this.form.address_line1.trim();
      if (this.form.address_line2)   address.line2   = this.form.address_line2.trim();
      if (this.form.address_city)    address.city    = this.form.address_city.trim();
      if (this.form.address_state)   address.state   = this.form.address_state.trim();
      if (this.form.address_pincode) address.pincode = this.form.address_pincode.trim();
      const addressJson = (Object.keys(address).length > 0 ? address : null) as Json | null;

      const payload = {
        code: this.form.code.trim(),
        name: this.form.name.trim(),
        category: this.form.category as VendorCategory,
        gstn: this.form.gstn.trim() || null,
        pan: this.form.pan.trim() || null,
        contact_name: this.form.contact_name.trim() || null,
        contact_email: this.form.contact_email.trim() || null,
        contact_phone: this.form.contact_phone.trim() || null,
        address: addressJson,
        payment_terms: this.form.payment_terms,
        default_payment_method: this.form.default_payment_method || null,
        notes: this.form.notes.trim() || null,
        is_active: this.form.is_active,
      };

      const id = this.editingId();
      if (id) {
        await this.svc.update(id, payload);
        this.toast.success('Vendor updated', payload.name);
      } else {
        await this.svc.create({ ...payload, branch_id: branchId });
        this.toast.success('Vendor created', payload.name);
      }
      this.formOpen.set(false);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async toggleActive(v: Vendor) {
    this.busy.set(v.id);
    try {
      await this.svc.setActive(v.id, !v.is_active);
      this.toast.success(v.is_active ? 'Vendor deactivated' : 'Vendor activated', v.name);
      void this.store.load();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  private makeBlankForm(): VendorForm {
    return {
      code: '',
      name: '',
      category: '',
      gstn: '',
      pan: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      address_line1: '',
      address_line2: '',
      address_city: '',
      address_state: '',
      address_pincode: '',
      payment_terms: 'net_30',
      default_payment_method: '',
      notes: '',
      is_active: true,
    };
  }
}
