import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsPackService, type LetterTemplate, type TcClause, type Signatory } from '../../data/settings-pack.service';
import { LetterRenderService } from '../../services/letter-render.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';

const PLACEHOLDER_GROUPS = [
  {
    label: 'Letter-specific',
    keys: ['patient_name','uhid','first_name','full_name','procedure_date','procedure_list','test_date','test_list','collection_date','collection_time','address','contact_mobile','referring_doctor_name','age','gender','results_summary','interpretation','original_referral_date','followup_date','trend_summary','fitness_status','purpose','validity_period','exam_date','test_name','critical_value','reference_range','result_datetime','notified_doctor','notification_datetime','notification_channel','ack_by','invoice_number','invoice_date','amount_due','today_date','upi_id','signatory_name','signatory_role'],
  },
  {
    label: 'Global',
    keys: ['company.name','company.legal_name','company.address','company.address_short','company.phone','company.email','company.website','company.cin','company.gstin','today','today_long','branch_name','branch_city','support_phone'],
  },
] as const;

@Component({
  selector: 'app-letter-templates-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-12 gap-4">
      <!-- ── Left: template list + placeholder palette ─────────── -->
      <aside class="col-span-12 md:col-span-3 bg-surface-card border border-border rounded-[10px] p-3 space-y-3">
        <div>
          <div class="flex items-center justify-between mb-2">
            <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Templates</p>
            <button (click)="startNew()" class="text-[16px] leading-none text-primary-600 hover:text-primary-700" title="New template">+</button>
          </div>
          <ul class="space-y-1">
            @for (t of templates(); track t.id) {
              <li>
                <button (click)="pick(t)"
                        [class.bg-danger-bg]="picked()?.id === t.id"
                        [class.text-danger-fg]="picked()?.id === t.id"
                        class="w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] hover:bg-surface-muted transition flex items-center justify-between gap-2">
                  <span class="truncate">{{ t.name }}</span>
                  <span class="text-[10px] text-ink-muted font-mono shrink-0">v{{ t.current_version || 1 }}</span>
                </button>
              </li>
            } @empty {
              <li class="px-2 py-2 text-[12px] text-ink-muted">No templates.</li>
            }
          </ul>
        </div>

        <hr class="border-border" />

        <div>
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Placeholders</p>
          <p class="text-[10.5px] text-ink-muted mb-2">Click to insert</p>
          @for (group of placeholderGroups; track group.label) {
            <div class="mb-3">
              <p class="text-[11px] text-ink-soft font-medium mb-1">{{ group.label }}</p>
              <div class="flex flex-wrap gap-1">
                @for (k of group.keys; track k) {
                  <button (click)="insertPlaceholder(k)"
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
        @if (!picked()) {
          <div class="grid place-items-center h-[400px] text-ink-muted">
            <div class="text-center">
              <p class="text-[14px]">Select a template on the left to edit</p>
              <button (click)="startNew()" class="mt-3 h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">+ New template</button>
            </div>
          </div>
        } @else {
          @if (editing(); as e) {
            <div class="flex items-start justify-between gap-3 mb-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-display text-[20px] font-medium text-ink truncate">{{ e.name || '(unnamed)' }}</p>
                  <span class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-surface-subtle text-ink-soft">{{ e.category }}</span>
                  <span class="text-[10px] text-ink-muted font-mono">· v{{ e.current_version || 1 }}</span>
                </div>
                <input [(ngModel)]="e.description" type="text" placeholder="Short description"
                       class="mt-1 w-full max-w-[480px] h-7 px-0 text-[12.5px] text-ink-muted bg-transparent border-0 border-b border-transparent focus:border-border focus:outline-none" />
              </div>
              <div class="flex gap-2 shrink-0">
                <button (click)="cancelEdit()" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Cancel changes</button>
                <button (click)="preview()" class="h-9 px-4 rounded-md border border-good-border text-[12px] text-good-fg hover:bg-good-bg">Preview PDF</button>
                <button (click)="save()" [disabled]="busy() || !e.name.trim() || !e.code.trim()"
                        class="h-9 px-4 rounded-md bg-danger-fg hover:bg-danger-fg/90 text-white text-[12px] font-medium disabled:opacity-50">
                  {{ busy() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>

            <div class="space-y-4">
              <!-- Code + Category + Default signatory -->
              <div class="grid grid-cols-3 gap-3">
                <label class="block">
                  <span class="block text-[11px] text-ink-muted font-medium mb-1">Code *</span>
                  <input [(ngModel)]="e.code" [disabled]="!!e.id" type="text"
                         class="w-full h-9 px-2.5 text-[12px] font-mono border border-border rounded-md disabled:bg-surface-muted disabled:text-ink-muted focus:outline-none focus:border-primary-600" />
                </label>
                <label class="block">
                  <span class="block text-[11px] text-ink-muted font-medium mb-1">Category</span>
                  <select [(ngModel)]="e.category"
                          class="w-full h-9 px-2 text-[12.5px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                    <option value="consent">Consent</option>
                    <option value="referral">Referral</option>
                    <option value="certificate">Certificate</option>
                    <option value="notice">Notice</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label class="block">
                  <span class="block text-[11px] text-ink-muted font-medium mb-1">Default signatory</span>
                  <select [ngModel]="e.default_signatory_role ?? ''" (ngModelChange)="e.default_signatory_role = $event || null"
                          class="w-full h-9 px-2 text-[12.5px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                    <option value="">— none —</option>
                    <option value="doctor">Doctor</option>
                    <option value="pathologist">Pathologist</option>
                    <option value="lab_tech">Lab tech</option>
                    <option value="branch_admin">Branch admin</option>
                  </select>
                </label>
              </div>

              <!-- Subject -->
              <label class="block">
                <span class="block text-[12px] text-ink font-medium mb-1">Subject line (optional)</span>
                <input #subj [ngModel]="e.subject_line ?? ''" (ngModelChange)="e.subject_line = $event"
                       (focus)="focused.set('subject')"
                       type="text" placeholder="Subject: …"
                       class="w-full h-10 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>

              <!-- Salutation -->
              <label class="block">
                <span class="block text-[12px] text-ink font-medium mb-1">Salutation</span>
                <input [ngModel]="e.salutation ?? ''" (ngModelChange)="e.salutation = $event"
                       (focus)="focused.set('salutation')"
                       type="text" placeholder="Dear {{ '{{first_name}}' }},"
                       class="w-full h-10 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>

              <!-- Intro -->
              <label class="block">
                <span class="block text-[12px] text-ink font-medium mb-1">Intro paragraph</span>
                <textarea [ngModel]="e.intro_paragraph ?? ''" (ngModelChange)="e.intro_paragraph = $event"
                          (focus)="focused.set('intro')"
                          rows="3"
                          class="w-full px-3 py-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600"></textarea>
              </label>

              <!-- T&C clauses -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[12px] text-ink font-medium">T&amp;C clauses</span>
                  <button (click)="addClause()" class="text-[11px] text-primary-600 hover:underline">+ Add clause</button>
                </div>
                @for (c of (e.tc_clauses ?? []); track $index; let i = $index) {
                  <div class="border border-border rounded-md mb-2 overflow-hidden">
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-muted">
                      <input [(ngModel)]="c.title" type="text" placeholder="Clause title"
                             class="flex-1 h-7 px-2 text-[12.5px] font-medium bg-transparent border-0 focus:outline-none" />
                      <button (click)="removeClause(i)" class="text-[11px] text-danger-fg hover:underline">remove</button>
                    </div>
                    <textarea [(ngModel)]="c.body" (focus)="focused.set('clause:' + i)"
                              rows="3"
                              class="w-full px-3 py-2 text-[13px] border-0 focus:outline-none focus:bg-surface-subtle/40"></textarea>
                  </div>
                } @empty {
                  <p class="text-[12px] text-ink-muted">No clauses yet — add one to break the body into titled sections.</p>
                }
              </div>

              <!-- Closing -->
              <label class="block">
                <span class="block text-[12px] text-ink font-medium mb-1">Closing paragraph</span>
                <textarea [ngModel]="e.closing_paragraph ?? ''" (ngModelChange)="e.closing_paragraph = $event"
                          (focus)="focused.set('closing')"
                          rows="3"
                          class="w-full px-3 py-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600"></textarea>
              </label>

              <!-- Variables (declared) -->
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-1">Declared variables (comma-separated) — autodetected if left empty</span>
                <input [ngModel]="(e.variables || []).join(', ')" (ngModelChange)="setVariables(e, $event)"
                       type="text" class="w-full h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>

              <div class="flex items-center justify-between">
                <label class="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" [(ngModel)]="e.is_active" class="size-4 accent-danger-fg" /> Active
                </label>
                <button (click)="openHistory(e)" class="text-[11px] text-ink-muted hover:text-ink underline">version history</button>
              </div>
            </div>
          }
        }
      </section>
    </div>

    <!-- Version history modal -->
    @if (historyOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="historyOpen.set(false)">
        <div class="w-full max-w-[640px] max-h-[80vh] overflow-y-auto bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[17px] font-medium text-ink mb-2">Version history — {{ historyTpl()?.name }}</h2>
          <p class="text-[11px] text-ink-muted mb-4">Restore brings an old version back as the next save.</p>
          <ul class="divide-y divide-border">
            @for (v of versions(); track v.id) {
              <li class="py-3 flex items-center justify-between">
                <div>
                  <p class="text-[13px] font-medium">v{{ v.version_no }}</p>
                  <p class="text-[11px] text-ink-muted">archived {{ v.archived_at }}</p>
                </div>
                <button (click)="restore(v)" class="h-7 px-2.5 rounded-md border border-border text-[11px]">Restore</button>
              </li>
            } @empty {
              <li class="py-3 text-[12px] text-ink-muted">No archived versions yet.</li>
            }
          </ul>
          <div class="mt-4 text-right">
            <button (click)="historyOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px]">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class LetterTemplatesTab implements OnInit {
  private svc = inject(SettingsPackService);
  private renderer = inject(LetterRenderService);
  private toast = inject(ToastService);

  protected readonly placeholderGroups = PLACEHOLDER_GROUPS;
  protected readonly templates = signal<LetterTemplate[]>([]);
  protected readonly picked   = signal<LetterTemplate | null>(null);
  protected readonly editing  = signal<LetterTemplate | null>(null);
  protected readonly busy     = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly historyTpl  = signal<LetterTemplate | null>(null);
  protected readonly versions    = signal<any[]>([]);
  protected readonly signatories = signal<Signatory[]>([]);
  /** Tracks which field currently has focus — placeholder clicks insert at the cursor of this field. */
  protected readonly focused = signal<'subject' | 'salutation' | 'intro' | 'closing' | string>('intro');

  async ngOnInit() {
    await this.reload();
    this.signatories.set(await this.svc.listSignatories().catch(() => []));
  }

  private async reload() {
    try {
      const list = await this.svc.listLetterTemplates();
      this.templates.set(list);
      if (this.picked() == null && list.length > 0) this.pick(list[0]);
    } catch (e: any) { this.toast.error('Load failed', e?.message ?? ''); }
  }

  protected pick(t: LetterTemplate) {
    this.picked.set(t);
    this.editing.set(this.deepClone(t));
  }

  protected startNew() {
    const blank: LetterTemplate = {
      code: '', name: 'New template', category: 'consent',
      description: '', body_html: '', variables: [], is_active: true,
      subject_line: '', salutation: '', intro_paragraph: '',
      tc_clauses: [], closing_paragraph: '',
    };
    this.picked.set(blank);
    this.editing.set(blank);
  }

  protected cancelEdit() {
    const p = this.picked();
    if (p?.id) this.editing.set(this.deepClone(p));
    else { this.picked.set(null); this.editing.set(null); }
  }

  protected addClause() {
    const e = this.editing();
    if (!e) return;
    e.tc_clauses = [...(e.tc_clauses ?? []), { title: 'New clause', body: '' }];
    this.editing.set({ ...e });
  }

  protected removeClause(i: number) {
    const e = this.editing();
    if (!e?.tc_clauses) return;
    e.tc_clauses.splice(i, 1);
    this.editing.set({ ...e, tc_clauses: [...e.tc_clauses] });
  }

  protected setVariables(e: LetterTemplate, raw: string) {
    e.variables = raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  protected insertPlaceholder(key: string) {
    const e = this.editing();
    if (!e) return;
    const token = `{{${key}}}`;
    const target = this.focused();
    const append = (s: string | null | undefined) => (s ?? '') + (s && !s.endsWith(' ') ? ' ' : '') + token;
    if (target === 'subject')    e.subject_line     = append(e.subject_line);
    else if (target === 'salutation') e.salutation  = append(e.salutation);
    else if (target === 'closing')    e.closing_paragraph = append(e.closing_paragraph);
    else if (target.startsWith('clause:')) {
      const idx = Number(target.split(':')[1]);
      const c = e.tc_clauses?.[idx];
      if (c) c.body = append(c.body);
    } else {
      e.intro_paragraph = append(e.intro_paragraph);
    }
    this.editing.set({ ...e });
  }

  protected async save() {
    const e = this.editing();
    if (!e) return;
    this.busy.set(true);
    try {
      // Compose legacy body_html from structured fields so the renderer fallback works.
      const composed = this.composeBody(e);
      const saved = await this.svc.upsertLetterTemplate({
        ...e,
        body_html: composed,
        tc_clauses: e.tc_clauses ?? [],
        variables: (e.variables ?? []).length > 0 ? e.variables : this.detectVariables(composed),
      });
      this.toast.success('Saved', `${saved.name} (v${saved.current_version})`);
      await this.reload();
      const fresh = this.templates().find(t => t.id === saved.id);
      if (fresh) this.pick(fresh);
    } catch (err: any) {
      this.toast.error('Save failed', err?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected async preview() {
    const e = this.editing();
    if (!e) return;
    const composedTpl: LetterTemplate = { ...e, body_html: this.composeBody(e) };
    const vars = this.demoVars(composedTpl);
    const { blob, fileName } = await this.renderer.render(composedTpl, vars, {});
    this.renderer.download(blob, fileName);
  }

  protected async openHistory(e: LetterTemplate) {
    if (!e.id) { this.toast.info('No history yet', 'Save the template first.'); return; }
    this.historyTpl.set(e);
    this.historyOpen.set(true);
    try { this.versions.set(await this.svc.listTemplateVersions(e.id)); }
    catch (err: any) { this.toast.error('Load failed', err?.message ?? ''); }
  }

  protected async restore(v: any) {
    const tpl = this.historyTpl();
    if (!tpl) return;
    if (!confirm(`Restore v${v.version_no}? Current content will be archived.`)) return;
    try {
      const restored = await this.svc.upsertLetterTemplate({
        ...tpl,
        body_html:        v.body_html,
        subject_line:     v.subject_line,
        salutation:       v.salutation,
        intro_paragraph:  v.intro_paragraph,
        tc_clauses:       v.tc_clauses ?? [],
        closing_paragraph: v.closing_paragraph,
        variables:        v.variables,
      });
      this.toast.success('Restored', `Now at v${restored.current_version}`);
      this.historyOpen.set(false);
      await this.reload();
    } catch (err: any) { this.toast.error('Restore failed', err?.message ?? ''); }
  }

  private composeBody(e: LetterTemplate): string {
    const parts: string[] = [];
    if (e.subject_line)     parts.push(`<p><strong>${e.subject_line}</strong></p>`);
    if (e.salutation)       parts.push(`<p>${e.salutation}</p>`);
    if (e.intro_paragraph)  parts.push(`<p>${e.intro_paragraph}</p>`);
    for (const c of (e.tc_clauses ?? [])) {
      if (c.title) parts.push(`<p><strong>${c.title}</strong></p>`);
      if (c.body)  parts.push(`<p>${c.body}</p>`);
    }
    if (e.closing_paragraph) parts.push(`<p>${e.closing_paragraph}</p>`);
    return parts.join('\n');
  }

  private detectVariables(body: string): string[] {
    const set = new Set<string>();
    const re = /\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) set.add(m[1]);
    return Array.from(set);
  }

  private demoVars(t: LetterTemplate): Record<string, string> {
    const vars: Record<string, string> = {};
    const declared = (t.variables?.length ? t.variables : this.detectVariables(t.body_html));
    for (const v of declared) vars[v] = `[${v}]`;
    // Friendly defaults for the most common ones
    Object.assign(vars, {
      patient_name: 'Jane Doe', uhid: 'NIY-DEMO-001', first_name: 'Jane',
      branch_name: 'Sree Diagnostics', branch_city: 'Bengaluru',
      procedure_date: new Date().toLocaleDateString('en-IN'),
      today: new Date().toLocaleDateString('en-IN'),
    });
    return vars;
  }

  private deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
}
