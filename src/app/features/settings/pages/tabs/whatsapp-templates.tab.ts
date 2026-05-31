import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsPackService, type WaTemplates } from '../../data/settings-pack.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { WhatsAppService } from '../../../../core/whatsapp/whatsapp.service';

/** Default templates — used when system_settings.wa_templates_v1 isn't set
 *  yet AND as the "Reset to default" target for each section. */
const DEFAULT: WaTemplates = {
  report: {
    body:
`Hi {{first_name}},

Hope you're doing well. Your diagnostic reports from {{company_name}} are ready.

Tests: {{test_list}}

📄 Download PDF:
{{pdf_url}}

🔗 View online:
{{viewer_url}}

Thank you for choosing us for your diagnostic needs. Take care and stay healthy.

Best regards,
{{company_name}}`,
  },
  bill: {
    body:
`Hello {{first_name}},

Thank you for choosing {{company_name}}.

Invoice: {{invoice_no}}
Amount: {{amount}}

📄 Download / save your bill:
{{viewer_url}}

We look forward to serving you again.

— {{company_name}}`,
  },
  registration: {
    body:
`Hello {{first_name}},

Thank you for registering at {{company_name}}.
Your UHID is {{uhid}}. Please keep this for future reference.

Best regards,
{{company_name}}`,
  },
  review_request: {
    enabled: false,
    auto_after_report: true,
    url: '',
    body:
`

— — — — — —

Thanks for choosing {{company_name}}! If you're happy with our service, we'd love your honest Google review:
⭐ {{review_url}}

A minute of your time helps us a lot. 🙏`,
  },
};

/** Placeholders the admin can click to insert at the focused field. */
const PLACEHOLDER_GROUPS: ReadonlyArray<{ label: string; keys: ReadonlyArray<string> }> = [
  { label: 'Patient',  keys: ['first_name','full_name','uhid','mobile'] },
  { label: 'Report',   keys: ['test_list','pdf_url','viewer_url'] },
  { label: 'Bill',     keys: ['invoice_no','amount','viewer_url'] },
  { label: 'Branding', keys: ['company_name','review_url'] },
];

type Section = 'report' | 'bill' | 'registration' | 'review_request';

@Component({
  selector: 'app-whatsapp-templates-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-12 gap-4">
      <!-- ── Left: section picker + placeholder palette ────────── -->
      <aside class="col-span-12 md:col-span-3 space-y-3">
        <div class="bg-surface-card border border-border rounded-[10px] p-3">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Templates</p>
          <ul class="space-y-1">
            @for (s of sections; track s.key) {
              <li>
                <button (click)="picked.set(s.key)"
                        [class.bg-danger-bg]="picked() === s.key"
                        [class.text-danger-fg]="picked() === s.key"
                        class="w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] hover:bg-surface-muted transition flex items-center justify-between gap-2">
                  <span>{{ s.label }}</span>
                  <span class="text-[9px] uppercase tracking-wider text-ink-muted">{{ s.hint }}</span>
                </button>
              </li>
            }
          </ul>
        </div>

        <div class="bg-surface-card border border-border rounded-[10px] p-3">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Placeholders</p>
          <p class="text-[10.5px] text-ink-muted mb-2">Click to insert at cursor</p>
          @for (g of placeholderGroups; track g.label) {
            <div class="mb-3">
              <p class="text-[11px] text-ink-soft font-medium mb-1">{{ g.label }}</p>
              <div class="flex flex-wrap gap-1">
                @for (k of g.keys; track k) {
                  <button (click)="insert(k)"
                          class="px-1.5 py-0.5 rounded bg-primary-50 hover:bg-primary-100 text-primary-700 text-[10px] font-mono">
                    {{ k }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </aside>

      <!-- ── Right: editor pane ────────────────────────────────── -->
      <section class="col-span-12 md:col-span-9 bg-surface-card border border-border rounded-[10px] p-5">
        @if (loading()) {
          <p class="text-center text-[12px] text-ink-muted py-8">Loading templates…</p>
        } @else {
          <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <p class="font-display text-[20px] font-medium text-ink">{{ pickedMeta().label }}</p>
              <p class="text-[12px] text-ink-muted">{{ pickedMeta().description }}</p>
            </div>
            <div class="flex gap-2">
              <button (click)="resetSection()" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Reset to default</button>
              <button (click)="save()" [disabled]="busy()"
                      class="h-9 px-4 rounded-md bg-danger-fg hover:bg-danger-fg/90 text-white text-[12px] font-medium disabled:opacity-50">
                {{ busy() ? 'Saving…' : 'Save all templates' }}
              </button>
            </div>
          </div>

          <!-- Review-request-specific extra fields -->
          @if (picked() === 'review_request') {
            <div class="rounded-[10px] border border-warn-fg/40 bg-warn-bg/40 px-4 py-3 mb-4 space-y-3">
              <label class="block">
                <span class="block text-[12px] text-ink font-medium mb-1">Google review URL <span class="text-danger-fg">*</span></span>
                <input [(ngModel)]="form.review_request.url" type="url"
                       class="w-full h-10 px-3 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600"
                       placeholder="https://g.page/r/CaXQklh74nPFEB0/review" />
                <p class="text-[10.5px] text-ink-muted mt-1">Paste your Google Business review link here. Find it in your Google Business Profile → "Get more reviews".</p>
              </label>
              <div class="flex items-center gap-5 flex-wrap">
                <label class="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" [(ngModel)]="form.review_request.enabled" class="size-4 accent-danger-fg" />
                  Review request enabled
                </label>
                <label class="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" [(ngModel)]="form.review_request.auto_after_report"
                         [disabled]="!form.review_request.enabled" class="size-4 accent-danger-fg" />
                  Auto-append after every report send
                </label>
              </div>
              <p class="text-[11px] text-ink-muted">
                When enabled, the block below is appended to the bottom of every outbound report message (same WhatsApp bubble). Toggle off if you'd rather send review requests manually.
              </p>
            </div>
          }

          <label class="block">
            <span class="block text-[12px] text-ink font-medium mb-1">Message body</span>
            <textarea #ta [(ngModel)]="form[picked()].body" rows="16"
                      (focus)="focusEl.set(ta)"
                      class="w-full px-3 py-2 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600 leading-relaxed"></textarea>
            <p class="text-[10.5px] text-ink-muted mt-1">
              {{ form[picked()].body.length }} chars. WhatsApp shows ~600 chars before "Read more".
              Use double newlines (Enter twice) for paragraph spacing.
            </p>
          </label>

          <!-- Live preview -->
          <div class="mt-4">
            <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-2">Preview (with sample values)</p>
            <div class="bg-[#075E54] rounded-[10px] p-2 max-w-[420px]">
              <div class="bg-[#DCF8C6] rounded-[8px] px-3 py-2 text-[13px] text-ink whitespace-pre-wrap font-sans leading-relaxed shadow">{{ preview() }}</div>
            </div>
          </div>
        }
      </section>
    </div>
  `,
})
export class WhatsappTemplatesTab implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);
  private wa = inject(WhatsAppService);

  protected readonly placeholderGroups = PLACEHOLDER_GROUPS;
  protected readonly sections: Array<{ key: Section; label: string; hint: string; description: string }> = [
    { key: 'report',         label: 'Report ready',     hint: 'lab', description: 'Sent from the Lab workflow board when staff click 📱 Send to WhatsApp.' },
    { key: 'bill',           label: 'Invoice / bill',   hint: 'pay', description: 'Sent from the Billing list when staff click the 📱 button next to a paid invoice.' },
    { key: 'registration',   label: 'New patient',      hint: 'reg', description: 'Optional welcome message sent when a new patient is registered. (Send button on patient profile.)' },
    { key: 'review_request', label: 'Google review',    hint: '⭐',   description: 'Sent (or auto-appended after a report) to ask the patient for a 5-star Google review.' },
  ];

  protected readonly picked   = signal<Section>('report');
  protected readonly loading  = signal(true);
  protected readonly busy     = signal(false);
  protected readonly focusEl  = signal<HTMLTextAreaElement | null>(null);
  protected form: WaTemplates = JSON.parse(JSON.stringify(DEFAULT));

  protected pickedMeta() {
    return this.sections.find(s => s.key === this.picked())!;
  }

  /** Live preview with placeholder substitution against demo values. */
  protected preview(): string {
    const body = this.form[this.picked()].body;
    const sample: Record<string, string> = {
      first_name:   'Swami',
      full_name:    'Swami CS',
      uhid:         'NIY000102',
      mobile:       '+91 77600 10642',
      test_list:    'HBC, Complete Blood Count',
      pdf_url:      'https://example.com/report.pdf',
      viewer_url:   'https://example.com/v/report/abc',
      invoice_no:   'INV-20260531-12345',
      amount:       '₹750',
      company_name: 'Sree Diagnostics',
      review_url:   this.form.review_request.url || 'https://g.page/r/.../review',
    };
    return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => sample[k] ?? `{{${k}}}`);
  }

  async ngOnInit() {
    try {
      const saved = await this.svc.getSetting<WaTemplates>('wa_templates_v1');
      if (saved) {
        // Merge so a missing key in saved doesn't crash the editor
        this.form = {
          report:         { ...DEFAULT.report,         ...saved.report },
          bill:           { ...DEFAULT.bill,           ...saved.bill },
          registration:   { ...DEFAULT.registration,   ...saved.registration },
          review_request: { ...DEFAULT.review_request, ...saved.review_request },
        };
      }
    } catch (e: any) {
      this.toast.error('Load failed', e?.message ?? '');
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    if (this.form.review_request.enabled && !this.form.review_request.url.trim()) {
      this.toast.warn('Review URL required', 'Either turn off the review request or paste a Google review URL.');
      return;
    }
    this.busy.set(true);
    try {
      await this.svc.setSetting('wa_templates_v1', this.form);
      this.wa.invalidateTemplatesCache();   // next dispatch reads the new values
      this.toast.success('Saved', 'WhatsApp templates updated. Next dispatch uses the new wording.');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? '');
    } finally {
      this.busy.set(false);
    }
  }

  protected resetSection() {
    if (!confirm(`Reset "${this.pickedMeta().label}" to default? Unsaved edits on this section will be lost (other sections unaffected).`)) return;
    const key = this.picked();
    this.form = { ...this.form, [key]: JSON.parse(JSON.stringify(DEFAULT[key])) } as WaTemplates;
  }

  /** Insert a {{key}} placeholder at the current cursor of the focused textarea. */
  protected insert(key: string) {
    const token = `{{${key}}}`;
    const el = this.focusEl();
    const current = this.form[this.picked()].body;
    if (!el) {
      // No focused field — append at the end
      this.form[this.picked()].body = current + (current.endsWith(' ') ? '' : ' ') + token;
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end   = el.selectionEnd   ?? current.length;
    const updated = current.slice(0, start) + token + current.slice(end);
    this.form[this.picked()].body = updated;
    // Restore caret position right after the inserted token
    queueMicrotask(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }
}
