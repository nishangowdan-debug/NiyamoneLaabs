import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsPackService, type LetterTemplate, type LetterTemplateVersion, type Signatory } from '../data/settings-pack.service';
import { LetterRenderService } from '../services/letter-render.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { format, parseISO } from 'date-fns';

const BLANK: LetterTemplate = {
  code: '', name: '', category: 'consent', body_html: '', header_html: '', footer_html: '',
  variables: [], default_signatory_role: 'doctor', is_active: true, branch_id: null,
};

@Component({
  selector: 'app-letter-templates-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
      <div>
        <a routerLink="/settings" class="text-[12px] text-ink-muted hover:text-ink">← Settings</a>
        <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">Letter templates</h1>
        <p class="text-[12px] text-ink-muted mt-0.5">Consent · referral · certificate · notice. Edits auto-archive previous version.</p>
      </div>
      <button type="button" (click)="startNew()"
              class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New template
      </button>
    </header>

    @if (!editing()) {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead class="bg-surface-muted">
            <tr>
              <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Name</th>
              <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Code</th>
              <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Category</th>
              <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Version</th>
              <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Active</th>
              <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of templates(); track t.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted">
                <td class="px-3 py-2 text-[13px] text-ink font-medium">{{ t.name }}</td>
                <td class="px-3 py-2 font-mono text-[12px] text-ink-soft">{{ t.code }}</td>
                <td class="px-3 py-2 text-[11px]">
                  <span class="px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">{{ t.category }}</span>
                </td>
                <td class="px-3 py-2 text-right font-mono text-[12px] text-ink-soft">v{{ t.current_version || 1 }}</td>
                <td class="px-3 py-2 text-[11px]">
                  @if (t.is_active) { <span class="text-good-fg">● Active</span> }
                  @else { <span class="text-ink-muted">○ Inactive</span> }
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button (click)="startEdit(t)"      class="h-7 px-2 text-[11px] text-primary-700 hover:underline">Edit</button>
                  <button (click)="openHistory(t)"    class="h-7 px-2 text-[11px] text-ink-soft hover:underline">History</button>
                  <button (click)="quickPreview(t)"   class="h-7 px-2 text-[11px] text-good-fg hover:underline">Preview PDF</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="px-3 py-8 text-center text-[12px] text-ink-muted">No templates yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Editor pane (replaces the list) -->
    @if (editing(); as e) {
      <div class="bg-surface-card border border-border rounded-[10px] p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="font-display text-[18px] font-medium text-ink">{{ e.id ? 'Edit template' : 'New template' }}</p>
            <p class="text-[11px] text-ink-muted">{{ e.id ? 'v' + (e.current_version || 1) + ' → next save creates v' + ((e.current_version || 1) + 1) : 'new draft' }}</p>
          </div>
          <div class="flex gap-2">
            <button (click)="editing.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Back to list</button>
            <button (click)="previewEditing()" [disabled]="busy()"
                    class="h-9 px-4 rounded-md border border-good-border text-[12px] text-good-fg hover:bg-good-bg">Preview PDF</button>
            <button (click)="save(e)" [disabled]="busy() || !e.name.trim() || !e.code.trim()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-4">
          <div class="col-span-7 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Name *</span>
                <input [(ngModel)]="e.name" type="text" class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Code *</span>
                <input [(ngModel)]="e.code" type="text" [disabled]="!!e.id"
                       class="w-full h-9 px-2.5 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600 disabled:bg-surface-muted disabled:text-ink-muted"
                       placeholder="patient_consent_xyz" />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Category</span>
                <select [(ngModel)]="e.category" class="w-full h-9 px-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                  <option value="consent">Consent</option>
                  <option value="referral">Referral</option>
                  <option value="certificate">Certificate</option>
                  <option value="notice">Notice</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Default signatory role</span>
                <select [ngModel]="e.default_signatory_role ?? ''" (ngModelChange)="e.default_signatory_role = $event || null"
                        class="w-full h-9 px-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                  <option value="">— none —</option>
                  <option value="doctor">Doctor</option>
                  <option value="pathologist">Pathologist</option>
                  <option value="lab_tech">Lab tech</option>
                  <option value="branch_admin">Branch admin</option>
                </select>
              </label>
            </div>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Body HTML</span>
              <textarea [(ngModel)]="e.body_html" rows="14"
                        class="w-full px-2.5 py-2 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600"
                        [placeholder]="bodyPlaceholder"></textarea>
            </label>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Variables (comma-separated)</span>
              <input [ngModel]="(e.variables || []).join(', ')" (ngModelChange)="setVariables(e, $event)"
                     type="text" class="w-full h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600"
                     placeholder="patient_name, uhid, branch_name" />
            </label>
            <label class="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" [(ngModel)]="e.is_active" class="size-4" /> Active
            </label>
          </div>

          <!-- Right pane: variable list + signatory picker -->
          <aside class="col-span-5 bg-surface-muted/30 rounded-md p-3 border border-border space-y-3">
            <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">Detected variables</p>
            <div class="flex flex-wrap gap-1.5">
              @for (v of e.variables || []; track v) {
                <span class="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[11px] font-mono">{{ '{{' + v + '}}' }}</span>
              } @empty {
                <span class="text-[11px] text-ink-muted">No variables declared.</span>
              }
            </div>

            <hr class="border-border" />
            <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">Preview signatory</p>
            <select [(ngModel)]="previewSigId"
                    class="w-full h-9 px-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="">— none —</option>
              @for (s of signatories(); track s.id) {
                <option [value]="s.id">{{ s.full_name }} · {{ s.signature_role }}</option>
              }
            </select>

            <hr class="border-border" />
            <p class="text-[11px] text-ink-muted">
              <strong>Tip:</strong> The body uses simple HTML — &lt;p&gt;, &lt;strong&gt;, &lt;ul&gt;&lt;li&gt;.
              Wrap variables with double braces, e.g. <code>{{ '{{patient_name}}' }}</code>.
              Use the <em>Preview PDF</em> button to see the rendered output with sample values.
            </p>
          </aside>
        </div>
      </div>
    }

    <!-- Version history modal -->
    @if (historyFor(); as h) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="historyFor.set(null)">
        <div class="w-full max-w-[640px] max-h-[80vh] overflow-y-auto bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[17px] font-medium text-ink mb-2">Version history — {{ h.name }}</h2>
          <p class="text-[11px] text-ink-muted mb-4">Most recent at the top. Click a version to restore it as the next save.</p>
          @if (versions().length === 0) {
            <p class="text-[13px] text-ink-muted">No archived versions yet — first save will leave v1 as current.</p>
          }
          <ul class="divide-y divide-border">
            @for (v of versions(); track v.id) {
              <li class="py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-ink">v{{ v.version_no }}</p>
                  <p class="text-[11px] text-ink-muted">archived {{ shortDateTime(v.archived_at) }}</p>
                </div>
                <button (click)="restoreVersion(h, v)"
                        class="h-7 px-2.5 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle">
                  Restore
                </button>
              </li>
            }
          </ul>
          <div class="mt-5 text-right">
            <button (click)="historyFor.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class LetterTemplatesPage implements OnInit {
  private svc = inject(SettingsPackService);
  private renderer = inject(LetterRenderService);
  private toast = inject(ToastService);

  protected readonly templates    = signal<LetterTemplate[]>([]);
  protected readonly editing      = signal<LetterTemplate | null>(null);
  protected readonly historyFor   = signal<LetterTemplate | null>(null);
  protected readonly versions     = signal<LetterTemplateVersion[]>([]);
  protected readonly signatories  = signal<Signatory[]>([]);
  protected readonly busy         = signal(false);
  protected previewSigId = '';
  /** String constant kept off the template so Angular doesn't try to
   *  parse the {{var}} markers as bindings. */
  protected readonly bodyPlaceholder = 'Use {{variable_name}} for substitutions. Allowed tags: p, strong, ul, li.';

  async ngOnInit() {
    await this.reload();
    this.signatories.set(await this.svc.listSignatories().catch(() => []));
  }

  private async reload() {
    try { this.templates.set(await this.svc.listLetterTemplates()); }
    catch (e: any) { this.toast.error('Load failed', e?.message ?? ''); }
  }

  protected startNew()  { this.editing.set({ ...BLANK, variables: [] }); }
  protected startEdit(t: LetterTemplate) { this.editing.set({ ...t, variables: [...(t.variables ?? [])] }); }

  protected setVariables(e: LetterTemplate, raw: string) {
    e.variables = raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  protected async save(e: LetterTemplate) {
    this.busy.set(true);
    try {
      const saved = await this.svc.upsertLetterTemplate(e);
      this.toast.success('Saved', `${saved.name} (v${saved.current_version})`);
      this.editing.set(null);
      await this.reload();
    } catch (err: any) {
      this.toast.error('Save failed', err?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected async openHistory(t: LetterTemplate) {
    this.historyFor.set(t);
    try { this.versions.set(await this.svc.listTemplateVersions(t.id!)); }
    catch (e: any) { this.toast.error('Load failed', e?.message ?? ''); }
  }

  protected async restoreVersion(t: LetterTemplate, v: LetterTemplateVersion) {
    if (!confirm(`Restore v${v.version_no}? Current content will be archived as v${(t.current_version || 1) + 1}.`)) return;
    try {
      const restored = await this.svc.upsertLetterTemplate({
        ...t,
        body_html:   v.body_html,
        header_html: v.header_html,
        footer_html: v.footer_html,
        variables:   v.variables,
      });
      this.toast.success('Restored', `Now at v${restored.current_version}`);
      this.historyFor.set(null);
      await this.reload();
    } catch (e: any) {
      this.toast.error('Restore failed', e?.message ?? '');
    }
  }

  protected async quickPreview(t: LetterTemplate) {
    await this.previewWith(t);
  }

  protected async previewEditing() {
    const e = this.editing();
    if (e) await this.previewWith(e);
  }

  private async previewWith(t: LetterTemplate) {
    // Build a vars map that fills every declared variable with a placeholder
    const vars: Record<string, string> = {};
    for (const v of t.variables ?? []) vars[v] = `[${v}]`;
    // Sensible defaults for common fields
    vars['patient_name']  = vars['patient_name']  ?? 'Jane Doe';
    vars['uhid']          = vars['uhid']          ?? 'NIY-DEMO-001';
    vars['branch_name']   = vars['branch_name']   ?? 'Sree Diagnostics';
    vars['procedure_date'] = vars['procedure_date'] ?? new Date().toLocaleDateString('en-IN');

    const sig = this.signatories().find(s => s.id === this.previewSigId);
    const { blob, fileName } = await this.renderer.render(t, vars, {
      signatoryName: sig?.full_name,
      signatoryRole: sig?.signature_role ?? undefined,
      signatureDataUrl: sig?.signature_data_url ?? null,
    });
    this.renderer.download(blob, fileName);
  }

  protected shortDateTime(iso: string): string {
    try { return format(parseISO(iso), 'd MMM yyyy, HH:mm'); } catch { return iso; }
  }
}
