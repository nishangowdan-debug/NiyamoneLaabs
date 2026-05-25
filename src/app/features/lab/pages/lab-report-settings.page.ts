import {
  ChangeDetectionStrategy, Component, OnInit,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  HospitalSettingsService,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_PRINT_MODE,
  type HospitalSettings,
  type InstructionSection,
  type SealAsset,
  type Accreditation,
  type LabReportPrintMode,
} from '../../pharmacy/services/hospital-settings.service';

type Tab = 'branding' | 'instructions' | 'accreditations' | 'print' | 'signatures';

interface StaffSignatureRow {
  id: string;
  full_name: string;
  role_slug: string;
  signature_data_url: string | null;
  signature_role: string | null;
}

@Component({
  selector: 'app-lab-report-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Lab Report Settings</h1>
    <p class="text-[12px] text-ink-muted mt-1">
      Configure header, footer, instructions and signatures used by the lab report printout.
    </p>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    @if (loading()) { <p>Loading…</p> }
    @else if (lastSaved()) { <p>Saved {{ lastSaved() }}</p> }
  </div>
</header>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
  <aside class="lg:col-span-3">
    <ul class="bg-surface-card border border-border rounded-[12px] overflow-hidden divide-y divide-border">
      @for (t of tabs; track t.key) {
        <li>
          <button (click)="activeTab.set(t.key)"
                  [class]="subTabCls(activeTab() === t.key)">
            <span class="text-[14px]">{{ t.icon }}</span>
            <span>{{ t.label }}</span>
          </button>
        </li>
      }
    </ul>
  </aside>

  <section class="lg:col-span-9">
    @if (loading()) {
      <div class="bg-surface-card border border-border rounded-[12px] p-12 text-center text-ink-muted text-[12px]">
        Loading settings…
      </div>
    } @else if (settings(); as s) {

      <!-- ─── BRANDING ─── -->
      @if (activeTab() === 'branding') {
        <article class="bg-surface-card border border-border rounded-[12px]">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Header branding</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Logo, tagline and accreditation seals shown at the top of every printed report.</p>
          </header>
          <div class="p-4 grid grid-cols-12 gap-3">

            <label class="col-span-12 lg:col-span-8 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Lab logo URL</span>
              <input class="mt-1 input" [ngModel]="s.logo_url" (ngModelChange)="s.logo_url = $event"
                     placeholder="https://…/logo.svg">
            </label>
            <div class="col-span-12 lg:col-span-4 flex flex-col items-start gap-1">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Upload</span>
              <input type="file" accept="image/*" (change)="uploadAsset($event, 'logo_url')" />
            </div>

            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Header tagline</span>
              <input class="mt-1 input" [ngModel]="s.hospital_tagline" (ngModelChange)="s.hospital_tagline = $event"
                     placeholder="Advanced Health Analytics. Simplified for You.">
            </label>

            <div class="col-span-12">
              <div class="flex items-center justify-between">
                <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Header seals (e.g. CLSI)</span>
                <button class="text-[11px] text-good-fg font-semibold" (click)="addSeal('header')">+ Add</button>
              </div>
              <div class="mt-2 space-y-2">
                @for (seal of s.header_seal_urls ?? []; track $index) {
                  <div class="flex gap-2 items-center">
                    <input class="input flex-1" placeholder="Name (CLSI)" [(ngModel)]="seal.name">
                    <input class="input flex-[2]" placeholder="URL" [(ngModel)]="seal.url">
                    <input type="file" accept="image/*" (change)="uploadSeal($event, 'header', $index)" />
                    <button class="text-danger-fg text-[18px]" (click)="removeSeal('header', $index)">×</button>
                  </div>
                }
              </div>
            </div>

            <div class="col-span-12">
              <div class="flex items-center justify-between">
                <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Footer seals (ISO, QA, NABL…)</span>
                <button class="text-[11px] text-good-fg font-semibold" (click)="addSeal('footer')">+ Add</button>
              </div>
              <div class="mt-2 space-y-2">
                @for (seal of s.footer_seal_urls ?? []; track $index) {
                  <div class="flex gap-2 items-center">
                    <input class="input flex-1" placeholder="Name (ISO 9001:2015)" [(ngModel)]="seal.name">
                    <input class="input flex-[2]" placeholder="URL" [(ngModel)]="seal.url">
                    <input type="file" accept="image/*" (change)="uploadSeal($event, 'footer', $index)" />
                    <button class="text-danger-fg text-[18px]" (click)="removeSeal('footer', $index)">×</button>
                  </div>
                }
              </div>
            </div>

            <label class="col-span-12 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Watermark (e.g. DRAFT, DUPLICATE)</span>
              <input class="mt-1 input" [ngModel]="s.watermark_text" (ngModelChange)="s.watermark_text = $event"
                     placeholder="Leave blank for none">
            </label>
          </div>
        </article>
      }

      <!-- ─── INSTRUCTIONS ─── -->
      @if (activeTab() === 'instructions') {
        <article class="bg-surface-card border border-border rounded-[12px]">
          <header class="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 class="text-[13px] font-semibold text-ink">General health instructions</h2>
              <p class="text-[10.5px] text-ink-muted mt-0.5">Printed on the patient instructions page of the report. These are the branch-wide defaults; tests and catalogs can override.</p>
            </div>
            <button class="text-[11px] text-good-fg font-semibold" (click)="loadDefaultInstructions()">Reset to default</button>
          </header>
          <div class="p-4 space-y-3">
            @for (sec of s.general_instructions ?? []; track $index) {
              <div class="border border-border rounded-md p-3 space-y-2">
                <div class="flex justify-between items-center">
                  <input class="input flex-1 font-semibold" [(ngModel)]="sec.title" placeholder="Section title">
                  <button class="ml-2 text-danger-fg text-[18px]" (click)="removeInstruction($index)">×</button>
                </div>
                @for (b of sec.bullets; track $index; let bi = $index) {
                  <div class="flex gap-2">
                    <input class="input flex-1" [ngModel]="b"
                           (ngModelChange)="updateBullet($index, bi, $event)" placeholder="Bullet">
                    <button class="text-danger-fg" (click)="removeBullet($index, bi)">×</button>
                  </div>
                }
                <button class="text-[11px] text-good-fg" (click)="addBullet($index)">+ Add bullet</button>
              </div>
            }
            <button class="px-3 py-1.5 rounded-md border border-border text-ink" (click)="addInstruction()">
              + Add section
            </button>
          </div>
          <footer class="px-4 py-3 border-t border-border">
            <label class="block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Report disclaimer</span>
              <textarea rows="2" class="input mt-1" [ngModel]="s.report_disclaimer"
                        (ngModelChange)="s.report_disclaimer = $event"></textarea>
            </label>
            <label class="block mt-2">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Terms overleaf</span>
              <textarea rows="2" class="input mt-1" [ngModel]="s.terms_overleaf"
                        (ngModelChange)="s.terms_overleaf = $event"></textarea>
            </label>
            <label class="flex items-center gap-2 mt-2 text-[12px]">
              <input type="checkbox" [ngModel]="s.show_medico_legal_note"
                     (ngModelChange)="s.show_medico_legal_note = $event" />
              Print "NOT FOR MEDICO-LEGAL PURPOSE" notice
            </label>
          </footer>
        </article>
      }

      <!-- ─── ACCREDITATIONS ─── -->
      @if (activeTab() === 'accreditations') {
        <article class="bg-surface-card border border-border rounded-[12px]">
          <header class="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 class="text-[13px] font-semibold text-ink">Accreditations</h2>
            <button class="text-[11px] text-good-fg font-semibold" (click)="addAccreditation()">+ Add</button>
          </header>
          <div class="p-4 space-y-2">
            @for (a of s.accreditations ?? []; track $index) {
              <div class="flex gap-2 items-center">
                <input class="input flex-1" placeholder="Label (ISO 9001:2015)" [(ngModel)]="a.label">
                <input class="input flex-1" placeholder="Number (QA-53036/0425)" [(ngModel)]="a.number">
                <button class="text-danger-fg text-[18px]" (click)="removeAccreditation($index)">×</button>
              </div>
            }
          </div>
        </article>
      }

      <!-- ─── PRINT DEFAULTS ─── -->
      @if (activeTab() === 'print') {
        <article class="bg-surface-card border border-border rounded-[12px]">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Default print settings</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Used when staff click "Print" without choosing options.</p>
          </header>
          <div class="p-4 grid grid-cols-12 gap-3">
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Template</span>
              <select class="input mt-1" [ngModel]="s.lab_report_template"
                      (ngModelChange)="s.lab_report_template = $event">
                <option value="standard">Standard</option>
                <option value="niyamone">Sree Diagnostics — branded</option>
              </select>
            </label>
            <div class="col-span-12 lg:col-span-6 flex flex-col gap-1">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Header / footer</span>
              <label class="flex items-center gap-2 text-[12px]">
                <input type="checkbox" [(ngModel)]="printIncludeHeader" /> Include header
              </label>
              <label class="flex items-center gap-2 text-[12px]">
                <input type="checkbox" [(ngModel)]="printIncludeFooter" /> Include footer
              </label>
              <label class="flex items-center gap-2 text-[12px]">
                <input type="checkbox" [(ngModel)]="printMode.includeInstructions" /> Include instructions page
              </label>
              <label class="flex items-center gap-2 text-[12px]">
                <input type="checkbox" [(ngModel)]="printMode.includeInfographics" /> Include test infographics
              </label>
            </div>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Letterhead top whitespace (mm)</span>
              <input type="number" class="input mt-1" min="0" max="80" [(ngModel)]="printMode.letterheadTopMm">
            </label>
            <label class="col-span-12 lg:col-span-6 block">
              <span class="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Letterhead bottom whitespace (mm)</span>
              <input type="number" class="input mt-1" min="0" max="80" [(ngModel)]="printMode.letterheadBottomMm">
            </label>
          </div>
        </article>
      }

      <!-- ─── SIGNATURES ─── -->
      @if (activeTab() === 'signatures') {
        <article class="bg-surface-card border border-border rounded-[12px]">
          <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[13px] font-semibold text-ink">Staff signatures</h2>
            <p class="text-[10.5px] text-ink-muted mt-0.5">Upload digital signatures for lab technicians and pathologists. Stored as base64 data URLs and embedded in printed reports.</p>
          </header>
          <div class="p-4 space-y-3">
            @for (st of staff(); track st.id) {
              <div class="border border-border rounded-md p-3 grid grid-cols-12 gap-2 items-center">
                <div class="col-span-12 lg:col-span-4">
                  <div class="text-[13px] font-semibold text-ink">{{ st.full_name }}</div>
                  <div class="text-[10.5px] text-ink-muted">{{ st.role_slug }}</div>
                </div>
                <div class="col-span-12 lg:col-span-3">
                  <select class="input" [ngModel]="st.signature_role"
                          (ngModelChange)="updateStaffSignatureRole(st, $event)">
                    <option [ngValue]="null">— role —</option>
                    <option value="technician">Technician</option>
                    <option value="pathologist">Pathologist</option>
                    <option value="radiologist">Radiologist</option>
                    <option value="doctor">Doctor</option>
                  </select>
                </div>
                <div class="col-span-12 lg:col-span-3">
                  @if (st.signature_data_url) {
                    <img [src]="st.signature_data_url" alt="signature" style="max-height:40px;max-width:140px;background:#fff;border:1px solid #ddd;padding:2px;" />
                  } @else {
                    <span class="text-[11px] text-ink-muted">No signature uploaded</span>
                  }
                </div>
                <div class="col-span-12 lg:col-span-2 flex gap-2">
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml"
                         (change)="uploadStaffSignature($event, st)" class="text-[11px]" />
                  @if (st.signature_data_url) {
                    <button class="text-danger-fg text-[11px]" (click)="clearStaffSignature(st)">Clear</button>
                  }
                </div>
              </div>
            }
            @if (!staff().length) {
              <p class="text-center text-ink-muted text-[12px] py-4">No staff in this branch.</p>
            }
          </div>
        </article>
      }

      <!-- ACTION BAR -->
      <div class="mt-3 flex items-center justify-end gap-2">
        <button class="px-4 py-2 rounded-md border border-border text-ink"
                (click)="reload()">Discard</button>
        <button class="px-4 py-2 rounded-md bg-good-fg text-white font-semibold"
                [disabled]="saving()"
                (click)="save()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
      </div>
    }
  </section>
</div>
  `,
})
export class LabReportSettingsPage implements OnInit {
  private auth = inject(AuthStore);
  private supabase = inject(SupabaseService);
  private settingsSvc = inject(HospitalSettingsService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);
  lastSaved = signal<string | null>(null);
  activeTab = signal<Tab>('branding');
  settings = signal<HospitalSettings | null>(null);
  staff = signal<StaffSignatureRow[]>([]);
  printMode: LabReportPrintMode = { ...DEFAULT_PRINT_MODE };

  tabs = [
    { key: 'branding'        as Tab, icon: '🎨', label: 'Branding & seals' },
    { key: 'instructions'    as Tab, icon: '📝', label: 'Patient instructions' },
    { key: 'accreditations'  as Tab, icon: '🏅', label: 'Accreditations' },
    { key: 'print'           as Tab, icon: '🖨️', label: 'Print defaults' },
    { key: 'signatures'      as Tab, icon: '✍️', label: 'Staff signatures' },
  ];

  get printIncludeHeader(): boolean { return this.printMode.headerMode === 'with-header'; }
  set printIncludeHeader(v: boolean) { this.printMode.headerMode = v ? 'with-header' : 'no-header'; }
  get printIncludeFooter(): boolean { return this.printMode.footerMode === 'with-footer'; }
  set printIncludeFooter(v: boolean) { this.printMode.footerMode = v ? 'with-footer' : 'no-footer'; }

  ngOnInit(): void {
    void this.reload();
  }

  subTabCls(active: boolean): string {
    const base = 'w-full px-3 py-2 flex items-center gap-2 text-[12.5px] text-left';
    return active
      ? `${base} bg-primary-50 text-primary-800 font-semibold`
      : `${base} hover:bg-surface-subtle text-ink`;
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const branchId = (this.auth.claims().branch_id as string) || '';
      const s = await this.settingsSvc.loadSettings(branchId);
      this.settings.set({ ...s });
      this.printMode = { ...DEFAULT_PRINT_MODE, ...(s.lab_report_print_mode ?? {}) };
      await this.loadStaff(branchId);
    } finally {
      this.loading.set(false);
    }
  }

  async loadStaff(branchId: string): Promise<void> {
    const client = this.supabase.client as any;
    let { data, error } = await client
      .from('staff')
      .select('id, full_name, role_slug, signature_data_url, signature_role')
      .eq('primary_branch_id', branchId)
      .order('full_name');
    if (error && /signature_role/.test(error.message ?? '')) {
      ({ data } = await client
        .from('staff')
        .select('id, full_name, role_slug, signature_data_url')
        .eq('primary_branch_id', branchId)
        .order('full_name'));
    }
    this.staff.set((data ?? []) as StaffSignatureRow[]);
  }

  async save(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    this.saving.set(true);
    try {
      const updated: HospitalSettings = {
        ...s,
        lab_report_print_mode: this.printMode,
      };
      await this.settingsSvc.saveSettings(updated);
      this.lastSaved.set(new Date().toLocaleTimeString());
      this.toast.success('Settings saved', 'Lab report configuration updated');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? 'Could not save settings');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Instructions editors ─────────────────────────────────────────
  loadDefaultInstructions(): void {
    const s = this.settings();
    if (!s) return;
    this.settings.set({
      ...s,
      general_instructions: JSON.parse(JSON.stringify(DEFAULT_INSTRUCTIONS)),
    });
  }
  addInstruction(): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.general_instructions ?? []), { title: 'New section', bullets: [''] }];
    this.settings.set({ ...s, general_instructions: list });
  }
  removeInstruction(i: number): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.general_instructions ?? [])];
    list.splice(i, 1);
    this.settings.set({ ...s, general_instructions: list });
  }
  addBullet(i: number): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.general_instructions ?? [])];
    list[i] = { ...list[i], bullets: [...(list[i].bullets ?? []), ''] };
    this.settings.set({ ...s, general_instructions: list });
  }
  removeBullet(i: number, bi: number): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.general_instructions ?? [])];
    const b = [...(list[i].bullets ?? [])];
    b.splice(bi, 1);
    list[i] = { ...list[i], bullets: b };
    this.settings.set({ ...s, general_instructions: list });
  }
  updateBullet(i: number, bi: number, value: string): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.general_instructions ?? [])];
    const b = [...(list[i].bullets ?? [])];
    b[bi] = value;
    list[i] = { ...list[i], bullets: b };
    this.settings.set({ ...s, general_instructions: list });
  }

  // ── Seals ─────────────────────────────────────────────────────────
  addSeal(slot: 'header' | 'footer'): void {
    const s = this.settings(); if (!s) return;
    const key = slot === 'header' ? 'header_seal_urls' : 'footer_seal_urls';
    const list = [...(s[key] as SealAsset[] | undefined ?? []), { name: '', url: '' }];
    this.settings.set({ ...s, [key]: list } as HospitalSettings);
  }
  removeSeal(slot: 'header' | 'footer', i: number): void {
    const s = this.settings(); if (!s) return;
    const key = slot === 'header' ? 'header_seal_urls' : 'footer_seal_urls';
    const list = [...(s[key] as SealAsset[] | undefined ?? [])];
    list.splice(i, 1);
    this.settings.set({ ...s, [key]: list } as HospitalSettings);
  }

  async uploadAsset(ev: Event, field: 'logo_url'): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const dataUrl = await this.fileToDataUrl(file);
    const s = this.settings(); if (!s) return;
    this.settings.set({ ...s, [field]: dataUrl } as HospitalSettings);
  }

  async uploadSeal(ev: Event, slot: 'header' | 'footer', i: number): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const dataUrl = await this.fileToDataUrl(file);
    const s = this.settings(); if (!s) return;
    const key = slot === 'header' ? 'header_seal_urls' : 'footer_seal_urls';
    const list = [...(s[key] as SealAsset[] | undefined ?? [])];
    list[i] = { ...list[i], url: dataUrl };
    this.settings.set({ ...s, [key]: list } as HospitalSettings);
  }

  // ── Accreditations ────────────────────────────────────────────────
  addAccreditation(): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.accreditations ?? []), { label: '', number: '' }] as Accreditation[];
    this.settings.set({ ...s, accreditations: list });
  }
  removeAccreditation(i: number): void {
    const s = this.settings(); if (!s) return;
    const list = [...(s.accreditations ?? [])];
    list.splice(i, 1);
    this.settings.set({ ...s, accreditations: list });
  }

  // ── Staff signatures ──────────────────────────────────────────────
  async uploadStaffSignature(ev: Event, st: StaffSignatureRow): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      this.toast.error('Too large', 'Signature must be under 500 KB');
      return;
    }
    const dataUrl = await this.fileToDataUrl(file);
    await this.persistStaffSignature(st.id, { signature_data_url: dataUrl, signature_uploaded_at: new Date().toISOString() });
    this.staff.set(this.staff().map(s => s.id === st.id ? { ...s, signature_data_url: dataUrl } : s));
    this.toast.success('Signature saved', st.full_name);
  }
  async clearStaffSignature(st: StaffSignatureRow): Promise<void> {
    if (!confirm(`Remove signature for ${st.full_name}?`)) return;
    await this.persistStaffSignature(st.id, { signature_data_url: null });
    this.staff.set(this.staff().map(s => s.id === st.id ? { ...s, signature_data_url: null } : s));
  }
  async updateStaffSignatureRole(st: StaffSignatureRow, role: string | null): Promise<void> {
    await this.persistStaffSignature(st.id, { signature_role: role });
    this.staff.set(this.staff().map(s => s.id === st.id ? { ...s, signature_role: role } : s));
  }
  private async persistStaffSignature(id: string, patch: Record<string, any>): Promise<void> {
    const { error } = await (this.supabase.client as any).from('staff').update(patch).eq('id', id);
    if (error) this.toast.error('Save failed', error.message);
  }

  // ── File helper ──────────────────────────────────────────────────
  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ''));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }
}
