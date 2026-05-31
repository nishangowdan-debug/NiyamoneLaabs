import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SettingsPackService } from '../../data/settings-pack.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';

interface HeaderLine {
  text: string;
  size: number;
  weight: 'normal' | 'bold' | 'italic';
  color: string;
  region: 'band' | 'below';
}
interface LetterheadV2 {
  logo_url: string | null;
  logo_width_mm: number;
  logo_position: 'left' | 'center' | 'right';
  show_band: boolean;
  band_color: string;
  band_text_color: string;
  band_height_mm: number;
  band_divider: boolean;
  header_lines: HeaderLine[];
  footer_lines: HeaderLine[];
}

const DEFAULT: LetterheadV2 = {
  logo_url: null, logo_width_mm: 35, logo_position: 'left',
  show_band: true, band_color: '#0B5FAE', band_text_color: '#FFFFFF',
  band_height_mm: 12, band_divider: true,
  header_lines: [
    { text: '{{company.name}}',          size: 13, weight: 'bold',   color: '#FFFFFF', region: 'band'  },
    { text: '{{company.legal_name}}',    size: 8,  weight: 'normal', color: '#000000', region: 'below' },
    { text: '{{company.address}}',       size: 8,  weight: 'normal', color: '#000000', region: 'below' },
    { text: '{{company.phone}} | {{company.email}} | {{company.website}}', size: 8, weight: 'normal', color: '#000000', region: 'below' },
    { text: 'GSTIN: {{company.gstin}}',  size: 8,  weight: 'normal', color: '#000000', region: 'below' },
  ],
  footer_lines: [
    { text: '{{company.name}} | {{company.city}}, {{company.state}}', size: 8, weight: 'normal', color: '#6B7280', region: 'below' },
    { text: 'This letter is system-generated. For queries write to {{company.email}}.', size: 8, weight: 'italic', color: '#9CA3AF', region: 'below' },
  ],
};

@Component({
  selector: 'app-letterhead-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-12 gap-5">
      <!-- ── Left: editor ──────────────────────────────────────── -->
      <div class="col-span-12 lg:col-span-7 space-y-4">

        <!-- Logo card -->
        <section class="bg-surface-card border border-border rounded-[10px] p-5">
          <h3 class="font-display text-[18px] font-medium text-ink mb-3">Logo</h3>
          <div class="flex items-center gap-3 mb-4">
            <div class="size-16 rounded-md border border-dashed border-border bg-surface-muted grid place-items-center overflow-hidden">
              @if (form.logo_url) {
                <img [src]="form.logo_url" class="max-w-full max-h-full object-contain" alt="logo" />
              } @else {
                <span class="text-[10px] text-ink-muted">no logo</span>
              }
            </div>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                   (change)="onFile($event)"
                   class="text-[12px] file:mr-2 file:rounded-md file:border-0 file:bg-ink file:text-white file:h-8 file:px-3 file:font-medium" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="block text-[12px] text-ink-soft mb-1">Width on PDF (mm)</span>
              <input type="number" min="10" max="80" [(ngModel)]="form.logo_width_mm" (ngModelChange)="bump()"
                     class="w-full h-10 px-3 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
            </label>
            <label class="block">
              <span class="block text-[12px] text-ink-soft mb-1">Position</span>
              <select [(ngModel)]="form.logo_position" (ngModelChange)="bump()"
                      class="w-full h-10 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="left">Left of band</option>
                <option value="center">Center of band</option>
                <option value="right">Right of band</option>
              </select>
            </label>
          </div>
        </section>

        <!-- Header band card -->
        <section class="bg-surface-card border border-border rounded-[10px] p-5">
          <h3 class="font-display text-[18px] font-medium text-ink mb-3">Header band</h3>
          <label class="inline-flex items-center gap-2 mb-3">
            <input type="checkbox" [(ngModel)]="form.show_band" (ngModelChange)="bump()" class="size-4 accent-danger-fg" />
            <span class="text-[13px] text-ink font-medium">Show coloured band at top</span>
          </label>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <label class="block">
              <span class="block text-[12px] text-ink-soft mb-1">Band color</span>
              <input type="color" [(ngModel)]="form.band_color" (ngModelChange)="bump()"
                     class="w-full h-10 border border-border rounded-md cursor-pointer" />
            </label>
            <label class="block">
              <span class="block text-[12px] text-ink-soft mb-1">Text color</span>
              <input type="color" [(ngModel)]="form.band_text_color" (ngModelChange)="bump()"
                     class="w-full h-10 border border-border rounded-md cursor-pointer" />
            </label>
            <label class="block">
              <span class="block text-[12px] text-ink-soft mb-1">Height (mm)</span>
              <input type="number" min="6" max="40" [(ngModel)]="form.band_height_mm" (ngModelChange)="bump()"
                     class="w-full h-10 px-3 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
            </label>
          </div>
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" [(ngModel)]="form.band_divider" (ngModelChange)="bump()" class="size-4 accent-danger-fg" />
            <span class="text-[13px] text-ink font-medium">Draw thin divider below header</span>
          </label>
        </section>

        <!-- Header lines card -->
        <section class="bg-surface-card border border-border rounded-[10px] p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-display text-[18px] font-medium text-ink">Header lines</h3>
            <button (click)="addLine('header')" class="h-7 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">+ Add line</button>
          </div>
          <p class="text-[11px] text-ink-muted mb-3">
            Use <code class="font-mono bg-surface-muted px-1 rounded">&#123;&#123;company.name&#125;&#125;</code> etc.
            Available: <span class="font-mono">company.name, company.legal_name, company.address, company.address_short, company.phone, company.email, company.website, company.cin, company.gstin, today</span>
          </p>
          @for (line of form.header_lines; track $index; let i = $index) {
            <div class="grid grid-cols-12 gap-2 items-center mb-2">
              <input [(ngModel)]="line.text" (ngModelChange)="bump()" type="text"
                     class="col-span-6 h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              <input [(ngModel)]="line.size" (ngModelChange)="bump()" type="number" min="6" max="32"
                     class="col-span-1 h-9 px-2 text-[12px] font-mono border border-border rounded-md text-center focus:outline-none focus:border-primary-600" />
              <select [(ngModel)]="line.weight" (ngModelChange)="bump()"
                      class="col-span-2 h-9 px-1.5 text-[12px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="normal">normal</option>
                <option value="bold">bold</option>
                <option value="italic">italic</option>
              </select>
              <input [(ngModel)]="line.color" (ngModelChange)="bump()" type="color"
                     class="col-span-1 h-9 border border-border rounded-md cursor-pointer" />
              <select [(ngModel)]="line.region" (ngModelChange)="bump()"
                      class="col-span-1 h-9 px-1 text-[12px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="band">band</option>
                <option value="below">below</option>
              </select>
              <button (click)="removeLine('header', i)" class="col-span-1 h-9 text-[14px] text-danger-fg hover:underline">✕</button>
            </div>
          }
        </section>

        <!-- Footer lines card -->
        <section class="bg-surface-card border border-border rounded-[10px] p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-display text-[18px] font-medium text-ink">Footer lines</h3>
            <button (click)="addLine('footer')" class="h-7 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">+ Add line</button>
          </div>
          @for (line of form.footer_lines; track $index; let i = $index) {
            <div class="grid grid-cols-12 gap-2 items-center mb-2">
              <input [(ngModel)]="line.text" (ngModelChange)="bump()" type="text"
                     class="col-span-7 h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              <input [(ngModel)]="line.size" (ngModelChange)="bump()" type="number" min="6" max="32"
                     class="col-span-1 h-9 px-2 text-[12px] font-mono border border-border rounded-md text-center focus:outline-none focus:border-primary-600" />
              <select [(ngModel)]="line.weight" (ngModelChange)="bump()"
                      class="col-span-2 h-9 px-1.5 text-[12px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="normal">normal</option>
                <option value="bold">bold</option>
                <option value="italic">italic</option>
              </select>
              <input [(ngModel)]="line.color" (ngModelChange)="bump()" type="color"
                     class="col-span-1 h-9 border border-border rounded-md cursor-pointer" />
              <button (click)="removeLine('footer', i)" class="col-span-1 h-9 text-[14px] text-danger-fg hover:underline">✕</button>
            </div>
          }
        </section>

        <div class="flex justify-end gap-2">
          <button (click)="reset()" class="h-10 px-4 rounded-md border border-border text-[13px] text-ink-soft hover:bg-surface-subtle">Reset to defaults</button>
          <button (click)="save()" [disabled]="busy()"
                  class="h-10 px-5 rounded-md bg-danger-fg hover:bg-danger-fg/90 text-white text-[13px] font-medium disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>

      <!-- ── Right: live preview ───────────────────────────────── -->
      <aside class="col-span-12 lg:col-span-5">
        <p class="text-[11px] text-ink-muted mb-2">Live preview (HTML mock — click <em>Preview PDF</em> for the real thing)</p>
        <div class="border border-border rounded-[10px] overflow-hidden bg-white shadow-card">
          <!-- Band -->
          @if (form.show_band) {
            <div class="px-4 flex items-center"
                 [style.background-color]="form.band_color"
                 [style.color]="form.band_text_color"
                 [style.height.px]="form.band_height_mm * 3">
              @if (form.logo_url && form.logo_position === 'left') {
                <img [src]="form.logo_url" class="object-contain mr-3" [style.height.px]="form.band_height_mm * 2.5" />
              }
              <div class="flex-1" [class.text-center]="form.logo_position === 'center'">
                @for (l of bandLines(); track $index) {
                  <div [style.font-size.px]="l.size * 1.2"
                       [style.color]="form.band_text_color"
                       [style.font-weight]="l.weight === 'bold' ? 'bold' : 'normal'"
                       [style.font-style]="l.weight === 'italic' ? 'italic' : 'normal'">
                    {{ resolve(l.text) }}
                  </div>
                }
              </div>
              @if (form.logo_url && form.logo_position === 'right') {
                <img [src]="form.logo_url" class="object-contain ml-3" [style.height.px]="form.band_height_mm * 2.5" />
              }
            </div>
          }
          <!-- Below-band lines -->
          <div class="p-5">
            @for (l of belowLines(); track $index) {
              <div [style.font-size.px]="l.size * 1.2"
                   [style.color]="l.color"
                   [style.font-weight]="l.weight === 'bold' ? 'bold' : 'normal'"
                   [style.font-style]="l.weight === 'italic' ? 'italic' : 'normal'">
                {{ resolve(l.text) }}
              </div>
            }
            @if (form.band_divider) {
              <hr class="border-border my-3" />
            }
            <!-- Mock body -->
            <p class="text-[12px] text-ink mt-3">{{ today }}</p>
            <p class="text-[12px] text-ink mt-2">Sample Recipient</p>
            <p class="text-[12px] text-ink mt-2"><strong>Subject: Sample Letter</strong></p>
            <p class="text-[12px] text-ink mt-2">Dear Sample,</p>
            <p class="text-[12px] text-ink mt-2">This is a placeholder body to show how the letter looks against your header and footer settings. Replace with your real content from the <em>Letter templates</em> tab.</p>
            <p class="text-[12px] text-ink mt-2">Yours sincerely,</p>
            <p class="text-[12px] text-ink mt-2"><strong>For {{ resolve('{{company.legal_name}}') || resolve('{{company.name}}') }}</strong></p>
            <p class="text-[12px] text-ink mt-2">Authorised Signatory</p>
            <hr class="border-border my-3" />
            <!-- Footer -->
            @for (l of form.footer_lines; track $index) {
              <div [style.font-size.px]="l.size * 1.2"
                   [style.color]="l.color"
                   [style.font-weight]="l.weight === 'bold' ? 'bold' : 'normal'"
                   [style.font-style]="l.weight === 'italic' ? 'italic' : 'normal'">
                {{ resolve(l.text) }}
              </div>
            }
            <p class="text-[10px] text-ink-muted mt-2">Page 1 of 1</p>
          </div>
        </div>
      </aside>
    </div>
  `,
})
export class LetterheadTab implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  protected form: LetterheadV2 = JSON.parse(JSON.stringify(DEFAULT));
  protected readonly busy = signal(false);
  protected readonly tick = signal(0);
  protected company: any = {};
  protected readonly today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  protected readonly bandLines  = computed(() => { this.tick(); return this.form.header_lines.filter(l => l.region === 'band'); });
  protected readonly belowLines = computed(() => { this.tick(); return this.form.header_lines.filter(l => l.region === 'below'); });

  async ngOnInit() {
    const [letterhead, company] = await Promise.all([
      this.svc.getSetting<LetterheadV2>('letterhead_v2').catch(() => null),
      this.svc.getSetting<any>('company_info').catch(() => null),
    ]);
    if (letterhead) this.form = { ...DEFAULT, ...letterhead, header_lines: letterhead.header_lines ?? DEFAULT.header_lines, footer_lines: letterhead.footer_lines ?? DEFAULT.footer_lines };
    this.company = company ?? {};
  }

  protected bump() { this.tick.update(v => v + 1); }

  protected addLine(which: 'header' | 'footer') {
    const arr = which === 'header' ? this.form.header_lines : this.form.footer_lines;
    arr.push({ text: 'New line', size: 9, weight: 'normal', color: '#000000', region: 'below' });
    this.bump();
  }
  protected removeLine(which: 'header' | 'footer', idx: number) {
    if (which === 'header') this.form.header_lines.splice(idx, 1);
    else                    this.form.footer_lines.splice(idx, 1);
    this.bump();
  }

  protected async save() {
    this.busy.set(true);
    try {
      await this.svc.setSetting('letterhead_v2', this.form);
      this.toast.success('Saved', 'Letterhead config updated.');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected reset() {
    if (!confirm('Reset letterhead to defaults? Unsaved changes will be lost.')) return;
    this.form = JSON.parse(JSON.stringify(DEFAULT));
    this.bump();
  }

  protected async onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    // Read as data URL for now — simplest path. For production-grade, upload
    // to the company-assets bucket via storage.from('company-assets').upload().
    const reader = new FileReader();
    reader.onload = () => {
      this.form.logo_url = reader.result as string;
      this.bump();
    };
    reader.readAsDataURL(f);
  }

  /** Substitute {{company.field}} and {{today}} placeholders for the live preview. */
  protected resolve(text: string): string {
    return text
      .replace(/\{\{\s*company\.(\w+)\s*\}\}/g, (_, k) => String(this.company?.[k] ?? `[${k}]`))
      .replace(/\{\{\s*company\.address_short\s*\}\}/g, () => [this.company?.city, this.company?.state].filter(Boolean).join(', '))
      .replace(/\{\{\s*today\s*\}\}/g, this.today);
  }
}
