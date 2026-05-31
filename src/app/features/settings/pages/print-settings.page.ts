import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode-svg';
import { environment } from '../../../../environments/environment';

import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  HospitalSettingsService,
  DEFAULT_FOOTER_LAYOUT,
  type HospitalSettings,
  type SealAsset,
  type Accreditation,
  type FooterLayout,
} from '../../pharmacy/services/hospital-settings.service';
import {
  renderFooterHTML,
  FOOTER_CSS,
  type FooterDocumentKind,
  type FooterSignatureInput,
} from '../../../shared/print/footer-renderer';

type Tab = 'logos' | 'seals' | 'text' | 'layout';

interface StaffPickerRow {
  id: string;
  full_name: string;
  signature_data_url: string | null;
  signature_url: string | null;
  signature_role: string | null;
}

@Component({
  selector: 'app-print-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Print Settings</h1>
    <p class="text-[12px] text-ink-muted mt-1">
      Footer branding shown on invoices, lab reports and payslips —
      customer logo, ISO / NABL seals, accreditations, terms and signatures.
    </p>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    @if (loading()) { <p>Loading…</p> }
    @else if (lastSaved()) { <p>Saved {{ lastSaved() }}</p> }
  </div>
</header>

@if (settings(); as s) {
<div class="grid grid-cols-1 xl:grid-cols-12 gap-3">

  <!-- ── Left: tab nav ───────────────────────────────────────── -->
  <aside class="xl:col-span-2">
    <ul class="bg-surface-card border border-border rounded-[12px] overflow-hidden divide-y divide-border">
      @for (t of tabs; track t.key) {
        <li>
          <button (click)="activeTab.set(t.key)" [class]="tabBtnCls(activeTab() === t.key)">
            <span class="text-[14px]">{{ t.icon }}</span>
            <span>{{ t.label }}</span>
          </button>
        </li>
      }
    </ul>
    <div class="mt-3 bg-surface-card border border-border rounded-[12px] p-3">
      <button (click)="save()" [disabled]="saving()"
              class="w-full h-9 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-[12px] font-semibold disabled:opacity-60">
        {{ saving() ? 'Saving…' : 'Save changes' }}
      </button>
      <button (click)="resetSection()"
              class="w-full mt-2 h-8 rounded-md border border-border text-[11.5px] text-ink-muted hover:bg-surface-subtle">
        Reset current section
      </button>
    </div>
  </aside>

  <!-- ── Middle: editors ─────────────────────────────────────── -->
  <section class="xl:col-span-6">

    <!-- ── LOGOS ── -->
    @if (activeTab() === 'logos') {
      <article class="bg-surface-card border border-border rounded-[12px]">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[13px] font-semibold text-ink">Customer / co-branding logo</h2>
          <p class="text-[10.5px] text-ink-muted mt-0.5">
            Second logo shown in the footer beside the seal strip — for franchise or partner branding.
            The main lab logo (top of every document) is set on the Settings → Lab Identity tab.
          </p>
        </header>
        <div class="p-4 grid grid-cols-12 gap-3">
          <div class="col-span-12 lg:col-span-4 flex flex-col items-start gap-2">
            @if (s.customer_logo_url) {
              <img [src]="s.customer_logo_url" alt="customer logo"
                   class="h-20 w-40 object-contain rounded border border-border bg-surface-muted" />
            } @else {
              <div class="h-20 w-40 rounded border border-dashed border-border bg-surface-muted flex items-center justify-center text-[10px] text-ink-muted">
                No co-branding logo
              </div>
            }
          </div>
          <div class="col-span-12 lg:col-span-8 space-y-2">
            <label class="block text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">URL</label>
            <input class="input w-full" [ngModel]="s.customer_logo_url" (ngModelChange)="patch({ customer_logo_url: $event })"
                   placeholder="https://… or upload below" />
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                   (change)="uploadCustomerLogo($event)" [disabled]="uploading()" />
            <p class="text-[10px] text-ink-muted">PNG · JPG · SVG · WebP — max 1 MB. Uploads go to <code>footer-assets</code> bucket.</p>
            @if (s.customer_logo_url) {
              <button class="text-[11px] text-danger-fg" (click)="patch({ customer_logo_url: null })">Remove</button>
            }
          </div>
        </div>
      </article>
    }

    <!-- ── SEALS ── -->
    @if (activeTab() === 'seals') {
      <article class="bg-surface-card border border-border rounded-[12px]">
        <header class="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 class="text-[13px] font-semibold text-ink">Footer seals (ISO, NABL, QA…)</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">
              Certification logos printed in the footer band. Add validity dates to get an expiry warning here in the app.
            </p>
          </div>
          <div class="flex gap-1">
            <button class="px-2 h-7 text-[11px] rounded border border-border" (click)="addSealPreset('iso')">+ ISO 9001</button>
            <button class="px-2 h-7 text-[11px] rounded border border-border" (click)="addSealPreset('nabl')">+ NABL</button>
            <button class="px-2 h-7 text-[11px] rounded border border-border" (click)="addSealPreset('qa')">+ QA</button>
            <button class="px-2 h-7 text-[11px] rounded border border-border" (click)="addSealPreset('custom')">+ Custom</button>
          </div>
        </header>
        <div class="p-4 space-y-3">
          @for (seal of (s.footer_seal_urls ?? []); track $index) {
            <div class="grid grid-cols-12 gap-2 items-center border border-border rounded-md p-2">
              <div class="col-span-2 flex justify-center">
                @if (seal.url) {
                  <img [src]="seal.url" alt="" class="h-12 w-16 object-contain rounded border border-border bg-surface-muted" />
                } @else {
                  <div class="h-12 w-16 rounded border border-dashed border-border bg-surface-muted"></div>
                }
              </div>
              <div class="col-span-10 grid grid-cols-12 gap-2">
                <input class="input col-span-5" placeholder="Name (e.g. ISO 9001:2015)" [ngModel]="seal.name" (ngModelChange)="updateSeal($index, { name: $event })" />
                <select class="input col-span-2" [ngModel]="seal.category" (ngModelChange)="updateSeal($index, { category: $event })">
                  <option value="iso">ISO</option>
                  <option value="nabl">NABL</option>
                  <option value="qa">QA</option>
                  <option value="custom">Custom</option>
                </select>
                <input class="input col-span-3" type="date" [ngModel]="seal.valid_until" (ngModelChange)="updateSeal($index, { valid_until: $event })" />
                <div class="col-span-2 flex items-center justify-end gap-2">
                  <label class="text-[10px] text-primary-700 cursor-pointer">
                    Upload
                    <input type="file" accept="image/*" class="hidden" (change)="uploadSeal($event, $index)" />
                  </label>
                  <button class="text-danger-fg text-[18px]" (click)="removeSeal($index)">×</button>
                </div>
                <input class="input col-span-12" placeholder="URL" [ngModel]="seal.url" (ngModelChange)="updateSeal($index, { url: $event })" />
                @if (isExpired(seal)) {
                  <div class="col-span-12 text-[10.5px] text-danger-fg">⚠ This certification expired on {{ seal.valid_until }}.</div>
                }
              </div>
            </div>
          }
          @if (!(s.footer_seal_urls ?? []).length) {
            <p class="text-[12px] text-ink-muted text-center py-6">No seals yet — use the buttons above to add one.</p>
          }
        </div>

        <header class="px-4 py-3 border-y border-border bg-surface-muted">
          <h2 class="text-[13px] font-semibold text-ink">Accreditation registrations</h2>
          <p class="text-[10.5px] text-ink-muted mt-0.5">Text-only labels printed in the footer-right column.</p>
        </header>
        <div class="p-4 space-y-2">
          @for (a of (s.accreditations ?? []); track $index) {
            <div class="flex gap-2 items-center">
              <input class="input flex-1" placeholder="Label (ISO 9001:2015)" [ngModel]="a.label" (ngModelChange)="updateAccr($index, { label: $event })" />
              <input class="input flex-1" placeholder="Number (QA-53036/0425)" [ngModel]="a.number" (ngModelChange)="updateAccr($index, { number: $event })" />
              <button class="text-danger-fg text-[18px]" (click)="removeAccr($index)">×</button>
            </div>
          }
          <button class="px-3 h-8 rounded border border-border text-[12px]" (click)="addAccr()">+ Add accreditation</button>
        </div>
      </article>
    }

    <!-- ── FOOTER TEXT ── -->
    @if (activeTab() === 'text') {
      <article class="bg-surface-card border border-border rounded-[12px]">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[13px] font-semibold text-ink">Footer notes &amp; terms</h2>
          <p class="text-[10.5px] text-ink-muted mt-0.5">
            Free-form note and terms shown below the seal band. Use per-document overrides only when different from the default.
          </p>
        </header>
        <div class="p-4 space-y-4">
          <div>
            <h3 class="text-[12px] font-semibold text-ink-soft mb-1">Default (used when a per-document field is blank)</h3>
            <label class="block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Note (thank-you / message)</span>
              <textarea rows="2" class="input mt-1 w-full" [ngModel]="s.receipt_footer_note" (ngModelChange)="patch({ receipt_footer_note: $event })"></textarea>
            </label>
            <label class="block mt-2">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Terms &amp; conditions</span>
              <textarea rows="3" class="input mt-1 w-full" [ngModel]="s.receipt_terms_and_conditions" (ngModelChange)="patch({ receipt_terms_and_conditions: $event })"></textarea>
            </label>
          </div>

          @for (kind of perDocFields; track kind.key) {
            <details class="border border-border rounded-md">
              <summary class="px-3 py-2 text-[12px] font-semibold cursor-pointer">{{ kind.label }} overrides</summary>
              <div class="p-3 space-y-2 border-t border-border">
                <label class="block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Note</span>
                  <textarea rows="2" class="input mt-1 w-full" [ngModel]="getField(kind.noteField)" (ngModelChange)="patchKey(kind.noteField, $event)"></textarea>
                </label>
                <label class="block">
                  <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Terms</span>
                  <textarea rows="2" class="input mt-1 w-full" [ngModel]="getField(kind.termsField)" (ngModelChange)="patchKey(kind.termsField, $event)"></textarea>
                </label>
              </div>
            </details>
          }
        </div>
      </article>
    }

    <!-- ── LAYOUT & SIGNATURES ── -->
    @if (activeTab() === 'layout') {
      <article class="bg-surface-card border border-border rounded-[12px]">
        <header class="px-4 py-3 border-b border-border">
          <h2 class="text-[13px] font-semibold text-ink">Layout</h2>
        </header>
        <div class="p-4 grid grid-cols-12 gap-3">
          <label class="col-span-12 md:col-span-6 block">
            <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Columns</span>
            <select class="input mt-1 w-full" [ngModel]="layout().columns" (ngModelChange)="patchLayout({ columns: $any(+$event) })">
              <option [ngValue]="1">1 column (stacked, centred)</option>
              <option [ngValue]="2">2 columns (note · accreditations)</option>
              <option [ngValue]="3">3 columns (note · seals · accreditations)</option>
            </select>
          </label>
          <label class="col-span-12 md:col-span-6 block">
            <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Alignment</span>
            <select class="input mt-1 w-full" [ngModel]="layout().alignment" (ngModelChange)="patchLayout({ alignment: $event })">
              <option value="center">Centre</option>
              <option value="left">Left</option>
            </select>
          </label>

          <label class="col-span-6 md:col-span-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" [ngModel]="layout().show_thankyou" (ngModelChange)="patchLayout({ show_thankyou: $event })" />
            Thank-you line
          </label>
          <label class="col-span-6 md:col-span-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" [ngModel]="layout().show_generated_at" (ngModelChange)="patchLayout({ show_generated_at: $event })" />
            Generated-at stamp
          </label>
          <label class="col-span-6 md:col-span-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" [ngModel]="layout().show_qr" (ngModelChange)="patchLayout({ show_qr: $event })" />
            QR code
          </label>
          <label class="col-span-6 md:col-span-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" [ngModel]="layout().show_signatures" (ngModelChange)="patchLayout({ show_signatures: $event })" />
            Signatures
          </label>
        </div>

        <header class="px-4 py-3 border-y border-border bg-surface-muted">
          <h2 class="text-[13px] font-semibold text-ink">Footer signatures</h2>
          <p class="text-[10.5px] text-ink-muted mt-0.5">
            Pick which staff signatures appear in the footer (in order). Signatures themselves are uploaded under
            Lab Report Settings → Signatures.
          </p>
        </header>
        <div class="p-4 space-y-2">
          @for (st of staff(); track st.id) {
            <label class="flex items-center gap-3 text-[12.5px]">
              <input type="checkbox"
                     [checked]="(s.footer_signature_staff_ids ?? []).includes(st.id)"
                     (change)="toggleSignatureStaff(st.id, $any($event.target).checked)" />
              @if (st.signature_data_url || st.signature_url) {
                <img [src]="st.signature_url || st.signature_data_url" alt="" class="h-8 w-20 object-contain rounded border border-border bg-surface-muted" />
              } @else {
                <div class="h-8 w-20 rounded border border-dashed border-border bg-surface-muted text-[10px] text-ink-muted flex items-center justify-center">no sig</div>
              }
              <div class="flex-1">
                <div class="font-medium">{{ st.full_name }}</div>
                <div class="text-[10.5px] text-ink-muted">{{ st.signature_role || '—' }}</div>
              </div>
            </label>
          }
          @if (!staff().length) {
            <p class="text-[12px] text-ink-muted text-center py-4">No staff with signatures yet.</p>
          }
        </div>
      </article>
    }
  </section>

  <!-- ── Right: live preview ────────────────────────────────── -->
  <aside class="xl:col-span-4">
    <div class="bg-surface-card border border-border rounded-[12px] sticky top-3">
      <header class="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 class="text-[13px] font-semibold text-ink">Live preview</h2>
        <div class="flex gap-1">
          @for (doc of previewDocs; track doc.key) {
            <button (click)="previewDoc.set(doc.key)" [class]="previewTabCls(previewDoc() === doc.key)">{{ doc.label }}</button>
          }
        </div>
      </header>
      <div class="p-3">
        <div #previewBox [innerHTML]="previewHtml()"
             class="bg-white border border-border rounded-md p-3 max-h-[70vh] overflow-auto"></div>
        <p class="text-[10px] text-ink-muted mt-2">
          Preview reflects unsaved edits. Click <strong>Save changes</strong> to persist; printed PDFs will match.
        </p>
      </div>
    </div>
  </aside>
</div>
} @else {
  <div class="bg-surface-card border border-border rounded-[12px] p-12 text-center text-ink-muted text-[12px]">
    Loading print settings…
  </div>
}
  `,
})
export class PrintSettingsPage implements OnInit {
  private auth        = inject(AuthStore);
  private supabase    = inject(SupabaseService);
  private toast       = inject(ToastService);
  private settingsSvc = inject(HospitalSettingsService);

  protected readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'logos',  label: 'Logos',     icon: '🏷' },
    { key: 'seals',  label: 'Seals',     icon: '🏅' },
    { key: 'text',   label: 'Text',      icon: '📝' },
    { key: 'layout', label: 'Layout',    icon: '🧩' },
  ];

  protected readonly previewDocs: { key: FooterDocumentKind; label: string }[] = [
    { key: 'invoice',    label: 'Invoice' },
    { key: 'lab_report', label: 'Lab report' },
    { key: 'payslip',    label: 'Payslip' },
  ];

  protected readonly perDocFields = [
    { key: 'invoice',    label: 'Invoice',    noteField: 'invoice_footer_note',  termsField: 'invoice_footer_terms' },
    { key: 'lab_report', label: 'Lab report', noteField: 'report_footer_note',   termsField: 'report_footer_terms' },
    { key: 'payslip',    label: 'Payslip',    noteField: 'payslip_footer_note',  termsField: 'payslip_footer_terms' },
  ];

  protected loading   = signal(false);
  protected saving    = signal(false);
  protected uploading = signal(false);
  protected lastSaved = signal<string | null>(null);
  protected settings  = signal<HospitalSettings | null>(null);
  protected staff     = signal<StaffPickerRow[]>([]);
  protected activeTab = signal<Tab>('logos');
  protected previewDoc = signal<FooterDocumentKind>('invoice');

  protected layout = computed<FooterLayout>(() =>
    this.settings()?.footer_layout ?? DEFAULT_FOOTER_LAYOUT,
  );

  protected previewHtml = computed(() => {
    const s = this.settings();
    if (!s) return '';
    const sigs = this.resolvePreviewSignatures();
    // When the QR layout flag is on, embed a sample QR pointing at the
    // public verification URL so the user sees exactly what will print.
    const showQr = !!s.footer_layout?.show_qr;
    let qrUrl: string | null = null;
    if (showQr) {
      const base = (environment as any).publicBaseUrl
        || (typeof window !== 'undefined' ? window.location.origin : '');
      if (base) {
        const sample = this.previewDoc() === 'invoice'
          ? `${base.replace(/\/$/, '')}/v/inv/INV-SAMPLE-12345`
          : `${base.replace(/\/$/, '')}/v/report/00000000-0000-0000-0000-000000000000`;
        const svg = new QRCode({ content: sample, padding: 1, width: 96, height: 96, ecl: 'M' }).svg();
        qrUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }
    }
    const body = renderFooterHTML(s as any, { document: this.previewDoc(), signatures: sigs, qrUrl });
    // Wrap in a minimal scaffold so the shared CSS applies inside [innerHTML].
    return `<style>${FOOTER_CSS}</style><div style="font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">${body}</div>`;
  });

  @ViewChild('previewBox') previewBox?: ElementRef<HTMLDivElement>;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  // ── Loading / saving ───────────────────────────────────────────────
  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const branchId = (this.auth.claims().branch_id as string) || '';
      const s = await this.settingsSvc.loadSettings(branchId);
      this.settings.set({
        ...s,
        footer_layout: s.footer_layout ?? DEFAULT_FOOTER_LAYOUT,
        footer_seal_urls: s.footer_seal_urls ?? [],
        accreditations: s.accreditations ?? [],
        footer_signature_staff_ids: s.footer_signature_staff_ids ?? [],
      });
      await this.loadStaff(branchId);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStaff(branchId: string): Promise<void> {
    const client = this.supabase.client as any;
    const { data } = await client
      .from('staff')
      .select('id, full_name, signature_data_url, signature_url, signature_role')
      .eq('primary_branch_id', branchId)
      .or('signature_data_url.not.is.null,signature_url.not.is.null')
      .order('full_name');
    this.staff.set((data ?? []) as StaffPickerRow[]);
  }

  async save(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    this.saving.set(true);
    try {
      await this.settingsSvc.saveSettings(s);
      this.lastSaved.set(new Date().toLocaleTimeString());
      this.toast.success('Print settings saved', 'Footer will use the new branding on the next print.');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? 'Could not save print settings');
    } finally {
      this.saving.set(false);
    }
  }

  resetSection(): void {
    const s = this.settings();
    if (!s) return;
    switch (this.activeTab()) {
      case 'logos':
        this.patch({ customer_logo_url: null });
        break;
      case 'seals':
        this.patch({ footer_seal_urls: [], accreditations: [] });
        break;
      case 'text':
        this.patch({
          receipt_footer_note: null,
          receipt_terms_and_conditions: null,
          invoice_footer_note: null,
          invoice_footer_terms: null,
          report_footer_note: null,
          report_footer_terms: null,
          payslip_footer_note: null,
          payslip_footer_terms: null,
        });
        break;
      case 'layout':
        this.patch({ footer_layout: { ...DEFAULT_FOOTER_LAYOUT }, footer_signature_staff_ids: [] });
        break;
    }
  }

  // ── Patch helpers ──────────────────────────────────────────────────
  patch(partial: Partial<HospitalSettings>): void {
    const s = this.settings();
    if (!s) return;
    this.settings.set({ ...s, ...partial });
  }

  patchKey(key: string, value: any): void {
    this.patch({ [key]: value } as any);
  }

  getField(key: string): any {
    return (this.settings() as any)?.[key];
  }

  patchLayout(partial: Partial<FooterLayout>): void {
    this.patch({ footer_layout: { ...this.layout(), ...partial } });
  }

  // ── Seals ──────────────────────────────────────────────────────────
  addSealPreset(category: 'iso' | 'nabl' | 'qa' | 'custom'): void {
    const presets: Record<typeof category, Partial<SealAsset>> = {
      iso:    { name: 'ISO 9001:2015', category: 'iso' },
      nabl:   { name: 'NABL Accredited', category: 'nabl' },
      qa:     { name: 'Quality Approved', category: 'qa' },
      custom: { name: '', category: 'custom' },
    };
    const list = [...(this.settings()?.footer_seal_urls ?? []), { name: '', url: '', ...presets[category] }];
    this.patch({ footer_seal_urls: list });
  }

  updateSeal(index: number, partial: Partial<SealAsset>): void {
    const list = [...(this.settings()?.footer_seal_urls ?? [])];
    list[index] = { ...list[index], ...partial };
    this.patch({ footer_seal_urls: list });
  }

  removeSeal(index: number): void {
    const list = [...(this.settings()?.footer_seal_urls ?? [])];
    list.splice(index, 1);
    this.patch({ footer_seal_urls: list });
  }

  async uploadSeal(ev: Event, index: number): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      this.toast.error('Too large', 'Seal must be under 500 KB');
      return;
    }
    this.uploading.set(true);
    try {
      const branchId = this.settings()?.branch_id ?? '';
      const url = await this.uploadToBucket(file, `${branchId}/seals/${Date.now()}.${this.extOf(file)}`);
      this.updateSeal(index, { url });
    } catch (e: any) {
      this.toast.error('Upload failed', e?.message ?? 'Could not upload seal');
    } finally {
      this.uploading.set(false);
    }
  }

  isExpired(seal: SealAsset): boolean {
    if (!seal?.valid_until) return false;
    const d = new Date(seal.valid_until);
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  }

  // ── Accreditations ─────────────────────────────────────────────────
  addAccr(): void {
    const list = [...(this.settings()?.accreditations ?? []), { label: '', number: '' } as Accreditation];
    this.patch({ accreditations: list });
  }

  updateAccr(index: number, partial: Partial<Accreditation>): void {
    const list = [...(this.settings()?.accreditations ?? [])];
    list[index] = { ...list[index], ...partial };
    this.patch({ accreditations: list });
  }

  removeAccr(index: number): void {
    const list = [...(this.settings()?.accreditations ?? [])];
    list.splice(index, 1);
    this.patch({ accreditations: list });
  }

  // ── Customer logo ──────────────────────────────────────────────────
  async uploadCustomerLogo(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      this.toast.error('Too large', 'Logo must be under 1 MB');
      return;
    }
    this.uploading.set(true);
    try {
      const branchId = this.settings()?.branch_id ?? '';
      const url = await this.uploadToBucket(file, `${branchId}/customer-logo.${this.extOf(file)}`);
      this.patch({ customer_logo_url: url });
    } catch (e: any) {
      this.toast.error('Upload failed', e?.message ?? 'Could not upload logo');
    } finally {
      this.uploading.set(false);
    }
  }

  // ── Signatures ─────────────────────────────────────────────────────
  toggleSignatureStaff(id: string, on: boolean): void {
    const cur = new Set(this.settings()?.footer_signature_staff_ids ?? []);
    if (on) cur.add(id); else cur.delete(id);
    this.patch({ footer_signature_staff_ids: Array.from(cur) });
  }

  // ── Storage upload ─────────────────────────────────────────────────
  private async uploadToBucket(file: File, path: string): Promise<string> {
    const client = this.supabase.client as any;
    const { error } = await client.storage
      .from('footer-assets')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = client.storage.from('footer-assets').getPublicUrl(path);
    // Cache-bust so re-uploads render immediately.
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  private extOf(file: File): string {
    return file.name.split('.').pop()?.toLowerCase() || 'png';
  }

  private resolvePreviewSignatures(): FooterSignatureInput[] {
    const layout = this.layout();
    if (!layout.show_signatures) return [];
    const ids = new Set(this.settings()?.footer_signature_staff_ids ?? []);
    return this.staff()
      .filter((st) => ids.has(st.id))
      .map((st) => ({
        staff_id: st.id,
        full_name: st.full_name,
        signature_role: st.signature_role,
        signature_url: st.signature_url,
        signature_data_url: st.signature_data_url,
      }));
  }

  // ── UI helpers ─────────────────────────────────────────────────────
  protected tabBtnCls(active: boolean): string {
    const base = 'w-full px-3 py-2 flex items-center gap-2 text-[12.5px] text-left';
    return active
      ? `${base} bg-primary-50 text-primary-800 font-semibold`
      : `${base} hover:bg-surface-subtle text-ink`;
  }

  protected previewTabCls(active: boolean): string {
    const base = 'px-2 h-7 text-[11px] rounded border';
    return active
      ? `${base} border-primary-600 bg-primary-50 text-primary-800 font-semibold`
      : `${base} border-border text-ink-muted`;
  }
}
