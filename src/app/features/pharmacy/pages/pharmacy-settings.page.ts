import {
  ChangeDetectionStrategy, Component, OnInit,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  HospitalSettingsService,
  type HospitalSettings,
} from '../services/hospital-settings.service';

type Tab = 'pharmacy' | 'license' | 'tax' | 'bank' | 'catalog';

@Component({
  selector: 'app-pharmacy-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, RouterLinkActive],
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
    @if (loading()) { <p>Loading…</p> }
    @else if (lastSaved()) { <p>Saved {{ lastSaved() }}</p> }
  </div>
</header>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
  <!-- LEFT — sub-tab nav -->
  <aside class="lg:col-span-3">
    <ul class="bg-surface-card border border-border rounded-[12px] overflow-hidden divide-y divide-border">
      @for (t of tabs; track t.key) {
        <li>
          <button (click)="setTab(t.key)"
                  [class]="subTabCls(activeTab() === t.key)">
            <span class="text-[14px]">{{ t.icon }}</span>
            <span>{{ t.label }}</span>
          </button>
        </li>
      }
    </ul>
    <p class="mt-3 px-2 text-[10.5px] text-ink-faint leading-relaxed">
      Drug License, Pharmacist registration, GST and PAN are required by law to legally sell medications in India.
    </p>
  </aside>

  <!-- RIGHT — section forms -->
  <section class="lg:col-span-9">
    @if (loading()) {
      <div class="bg-surface-card border border-border rounded-[12px] p-12 text-center text-ink-muted text-[12px]">Loading settings…</div>
    } @else if (settings(); as s) {

      <!-- BRANCH INFO BANNER (read-only — edit in /settings) -->
      <div class="mb-3 rounded-[10px] border border-primary-100 bg-primary-50 px-4 py-2.5 flex items-center justify-between gap-3">
        <div class="text-[11.5px] text-primary-800 leading-relaxed">
          <strong>Hospital name, address, GSTIN, logo</strong> are managed in the main settings page (single source of truth for all modules).
        </div>
        <a routerLink="/settings"
           class="shrink-0 h-8 px-3 inline-flex items-center rounded-md text-[11.5px] font-semibold text-white shadow-card"
           style="background:#0E4F8C;">Edit in Settings →</a>
      </div>

      <!-- PHARMACY DETAILS -->
      @if (activeTab() === 'pharmacy') {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Pharmacy details</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Printed in the receipt header. Fill these to override hospital values for the in-house pharmacy.</p>
          </header>
          <div class="p-4 grid grid-cols-12 gap-3">
            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pharmacy name *</span>
              <input [(ngModel)]="s.pharmacy_name" class="mt-1 input">
            </label>
            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pharmacy address</span>
              <textarea [(ngModel)]="s.pharmacy_address" rows="2" class="mt-1 input min-h-[60px]"
                placeholder="Leave blank to use the hospital address."></textarea>
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pharmacy phone</span>
              <input [(ngModel)]="s.pharmacy_phone" class="mt-1 input">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pharmacy email</span>
              <input [(ngModel)]="s.pharmacy_email" type="email" class="mt-1 input">
            </label>
          </div>
        </article>
      }

      <!-- DRUG LICENSE & PHARMACIST -->
      @if (activeTab() === 'license') {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border bg-warn-bg/30">
            <h2 class="text-[13px] font-semibold text-ink">Drug license & registered pharmacist</h2>
            <p class="text-[10.5px] text-warn-fg mt-0.5">⚖️ Mandatory under the Drugs and Cosmetics Act, 1940 to retail medicines.</p>
          </header>
          <div class="p-4 space-y-5">
            <div>
              <h3 class="text-[11px] font-bold text-ink uppercase tracking-[0.06em] mb-2">Drug license</h3>
              <div class="grid grid-cols-12 gap-3">
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Retail license no. (Form 20 / 21)</span>
                  <input [(ngModel)]="s.drug_license_retail_number" placeholder="KA-B-XX-12345" class="mt-1 input">
                </label>
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Wholesale license no. (Form 20B / 21B)</span>
                  <input [(ngModel)]="s.drug_license_wholesale_number" class="mt-1 input">
                </label>
                <label class="col-span-12 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Issuing authority</span>
                  <input [(ngModel)]="s.drug_license_issuing_authority"
                         placeholder="e.g. Karnataka State Drugs Control Department" class="mt-1 input">
                </label>
                <label class="col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Issued on</span>
                  <input type="date" [(ngModel)]="s.drug_license_issued_on" class="mt-1 input">
                </label>
                <label class="col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Valid until</span>
                  <input type="date" [(ngModel)]="s.drug_license_valid_until" class="mt-1 input">
                </label>
              </div>
              @if (licenseExpiringSoon()) {
                <p class="mt-2 text-[11px] text-danger-fg">⚠ Drug license expires {{ s.drug_license_valid_until }}. Renew at least 30 days before expiry.</p>
              }
            </div>

            <div class="border-t border-border pt-5">
              <h3 class="text-[11px] font-bold text-ink uppercase tracking-[0.06em] mb-2">Registered pharmacist</h3>
              <p class="text-[10.5px] text-ink-muted mb-2">A registered pharmacist must be physically present at the retail counter during operating hours.</p>
              <div class="grid grid-cols-12 gap-3">
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pharmacist full name</span>
                  <input [(ngModel)]="s.pharmacist_name" class="mt-1 input">
                </label>
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Qualification</span>
                  <input [(ngModel)]="s.pharmacist_qualification" placeholder="B.Pharm / D.Pharm / M.Pharm" class="mt-1 input">
                </label>
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Registration number</span>
                  <input [(ngModel)]="s.pharmacist_registration_number" class="mt-1 input">
                </label>
                <label class="col-span-12 lg:col-span-6 block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">State Pharmacy Council</span>
                  <input [(ngModel)]="s.pharmacist_registration_council"
                         placeholder="e.g. Karnataka State Pharmacy Council" class="mt-1 input">
                </label>
              </div>
            </div>
          </div>
        </article>
      }

      <!-- TAX & LEGAL (pharmacy-specific only — GSTIN & registration_no live on branches) -->
      @if (activeTab() === 'tax') {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Pharmacy tax identifiers</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Pharmacy-specific tax IDs printed on drug receipts. (GSTIN & hospital registration are managed in the main Settings page.)</p>
          </header>
          <div class="p-4 grid grid-cols-12 gap-3">
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">PAN (10 chars)</span>
              <input [(ngModel)]="s.pan_number" maxlength="10" placeholder="ABCDE1234F" class="mt-1 input font-mono">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">FSSAI (14 digits)</span>
              <input [(ngModel)]="s.fssai_number" maxlength="14" placeholder="If you sell supplements / nutraceuticals" class="mt-1 input font-mono">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">CIN</span>
              <input [(ngModel)]="s.cin_number" placeholder="If registered as Pvt. Ltd. / Ltd." class="mt-1 input font-mono">
            </label>
          </div>
        </article>
      }

      <!-- BANK & PAYMENT -->
      @if (activeTab() === 'bank') {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Bank & receipt footer</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Optional. Will appear on invoice footer for bank-transfer / UPI payments.</p>
          </header>
          <div class="p-4 grid grid-cols-12 gap-3">
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Bank name</span>
              <input [(ngModel)]="s.bank_name" class="mt-1 input">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Account number</span>
              <input [(ngModel)]="s.bank_account_number" class="mt-1 input font-mono">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">IFSC</span>
              <input [(ngModel)]="s.bank_ifsc" class="mt-1 input font-mono">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">UPI ID</span>
              <input [(ngModel)]="s.upi_id" placeholder="hospital@bank" class="mt-1 input">
            </label>
            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Receipt footer note</span>
              <textarea [(ngModel)]="s.receipt_footer_note" rows="2" class="mt-1 input min-h-[60px]"></textarea>
            </label>
            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Terms & conditions</span>
              <textarea [(ngModel)]="s.receipt_terms_and_conditions" rows="3" class="mt-1 input min-h-[80px]"
                placeholder="e.g. No exchange or refund on prescription medicines once dispensed."></textarea>
            </label>
          </div>
        </article>
      }

      <!-- DRUG CATALOG -->
      @if (activeTab() === 'catalog') {
        <article class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
          <header class="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 class="text-[13px] font-semibold text-ink">Drug catalog</h2>
              <p class="text-[10.5px] text-ink-muted mt-0.5">Manage the master list of medications available for dispense.</p>
            </div>
            <a routerLink="/pharmacy/catalog"
               class="h-9 px-4 rounded-md text-[12px] font-semibold text-white shadow-card inline-flex items-center"
               style="background:#0E4F8C;">📚 Open full catalog</a>
          </header>
          <div class="p-6 text-center text-[12px] text-ink-muted">
            <p>The full catalog editor is on its own page for performance reasons (search, paging, bulk edit).</p>
            <p class="mt-1">Click the button above to open it.</p>
          </div>
        </article>
      }

      @if (activeTab() !== 'catalog') {
        <!-- Save bar (sticky bottom) -->
        <div class="mt-4 flex items-center justify-end gap-2">
          <button (click)="reload()" [disabled]="saving()"
                  class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            Discard changes
          </button>
          <button (click)="save()" [disabled]="saving() || !s.hospital_name || !s.pharmacy_name"
                  class="h-10 px-5 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50"
                  style="background:#0E4F8C;">
            {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
        @if (saveError()) {
          <p class="mt-2 text-right text-[11.5px] text-danger-fg">{{ saveError() }}</p>
        }
      }

    } @else {
      <div class="bg-surface-card border border-border rounded-[12px] p-12 text-center text-ink-muted text-[12px]">
        Could not load settings. Check your branch context.
      </div>
    }
  </section>
</div>
  `,
  styles: [`
    .input {
      width: 100%; height: 36px; padding: 0 10px;
      font-size: 13px; color: rgb(var(--ink) / 1);
      background-color: rgb(var(--surface-card) / 1);
      border: 1px solid rgb(var(--border) / 1);
      border-radius: 6px;
      outline: none;
    }
    .input:focus { border-color: rgb(var(--primary-600) / 1); box-shadow: 0 0 0 3px rgb(var(--primary-100) / 1); }
    textarea.input { padding: 8px 10px; height: auto; }
  `],
})
export class PharmacySettingsPage implements OnInit {
  private settingsSvc = inject(HospitalSettingsService);
  private auth        = inject(AuthStore);
  private toast       = inject(ToastService);

  protected readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'pharmacy', label: 'Pharmacy details',      icon: '💊' },
    { key: 'license',  label: 'Drug license',          icon: '📜' },
    { key: 'tax',      label: 'Tax & legal',           icon: '🧾' },
    { key: 'bank',     label: 'Bank & footer',         icon: '🏦' },
    { key: 'catalog',  label: 'Drug catalog',          icon: '📚' },
  ];

  protected readonly activeTab  = signal<Tab>('pharmacy');
  protected readonly settings   = signal<HospitalSettings | null>(null);
  protected readonly loading    = signal(true);
  protected readonly saving     = signal(false);
  protected readonly saveError  = signal<string | null>(null);
  protected readonly lastSaved  = signal<string | null>(null);

  async ngOnInit() {
    await this.reload();
  }

  protected setTab(t: Tab) {
    this.activeTab.set(t);
    this.saveError.set(null);
  }

  protected async reload() {
    this.loading.set(true);
    this.saveError.set(null);
    try {
      const branchId = (this.auth.claims().branch_id as string) || '';
      if (!branchId) throw new Error('No active branch.');
      const s = await this.settingsSvc.loadSettings(branchId);
      this.settings.set({ ...s });
    } catch (e: any) {
      this.saveError.set(e?.message ?? 'Failed to load settings.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    const s = this.settings();
    if (!s) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const branchId = (this.auth.claims().branch_id as string) || s.branch_id;
      const saved = await this.settingsSvc.saveSettings({ ...s, branch_id: branchId });
      this.settings.set({ ...saved });
      this.lastSaved.set(new Date().toLocaleTimeString());
      this.toast.success('Settings saved', 'Changes have been persisted.');
    } catch (e: any) {
      this.saveError.set(e?.message ?? 'Save failed. Check that you have admin permissions.');
      this.toast.error('Save failed', this.saveError() ?? '');
    } finally {
      this.saving.set(false);
    }
  }

  protected licenseExpiringSoon(): boolean {
    const d = this.settings()?.drug_license_valid_until;
    if (!d) return false;
    const expiry = new Date(d).getTime();
    const now    = Date.now();
    return expiry < now + 30 * 24 * 60 * 60 * 1000;
  }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-700 text-white shadow-card`
      : `${base} text-ink-soft hover:bg-surface-subtle`;
  }

  protected subTabCls(active: boolean) {
    const base = 'w-full px-4 py-3 flex items-center gap-2.5 text-left text-[13px] transition-colors';
    return active
      ? `${base} bg-primary-50 text-primary-800 font-semibold`
      : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
}
