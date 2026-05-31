import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsPackService, type MetaLeadConfig } from '../data/settings-pack.service';
import { BranchStore } from '../../../core/branches/branch.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { environment } from '../../../../environments/environment';
import { format, parseISO } from 'date-fns';

/** Meta lead capture integration page.
 *
 *  Wires the meta_lead_config row in system_settings, lists recent leads,
 *  and shows the webhook URL you point Facebook's "Lead webhook" at.
 *
 *  Note: the actual webhook RECEIVER is a Supabase Edge Function
 *  (meta-lead-webhook) — this page only configures verify_token, field
 *  mapping, default branch, and shows event summary. The edge function
 *  must be deployed separately (see supabase/functions/meta-lead-webhook). */
@Component({
  selector: 'app-integrations-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
      <div>
        <a routerLink="/settings" class="text-[12px] text-ink-muted hover:text-ink">← Settings</a>
        <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">Integrations</h1>
        <p class="text-[12px] text-ink-muted mt-0.5">Inbound leads from external sources. Currently: Meta (Facebook / Instagram Lead Ads).</p>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-4">
      <!-- ── Meta config card ─────────────────────────────────────── -->
      <section class="col-span-12 lg:col-span-7 bg-surface-card border border-border rounded-[10px] p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-display text-[16px] font-medium text-ink">Meta Lead Ads</h2>
          @if (cfg().active) {
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-good-bg text-good-fg text-[11px] font-medium">● Active</span>
          } @else {
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted text-[11px] font-medium">○ Inactive</span>
          }
        </div>

        <p class="text-[12px] text-ink-muted mb-4">
          Configure the webhook URL in Facebook Business → Webhooks → Page → <strong>leadgen</strong> field.
        </p>

        <label class="block mb-3">
          <span class="block text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1">Webhook URL (copy into Facebook)</span>
          <div class="flex items-stretch gap-2">
            <input type="text" readonly [value]="webhookUrl"
                   class="flex-1 h-9 px-2.5 text-[12px] font-mono bg-surface-muted border border-border rounded-md text-ink" />
            <button (click)="copy(webhookUrl, 'Webhook URL')"
                    class="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Copy</button>
          </div>
        </label>

        <label class="block mb-3">
          <span class="block text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1">Verify token</span>
          <div class="flex items-stretch gap-2">
            <input type="text" [(ngModel)]="cfgDraft.verify_token"
                   class="flex-1 h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600"
                   placeholder="A long random string — paste the same into Facebook" />
            <button (click)="generateToken()"
                    class="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Generate</button>
          </div>
        </label>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <label class="block">
            <span class="block text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1">Auto-assign branch</span>
            <select [ngModel]="cfgDraft.auto_assign_branch_id ?? ''" (ngModelChange)="cfgDraft.auto_assign_branch_id = $event || null"
                    class="w-full h-9 px-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="">— route by form id (default) —</option>
              @for (b of branches(); track b.id) {
                <option [value]="b.id">{{ b.name }} · {{ b.code }}</option>
              }
            </select>
          </label>
          <label class="inline-flex items-center gap-2 text-[13px] mt-5">
            <input type="checkbox" [(ngModel)]="cfgDraft.active" class="size-4" /> Webhook active
          </label>
        </div>

        <div class="border-t border-border pt-3 mb-3">
          <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-2">Field map (Meta field → Niyamone column)</p>
          <div class="space-y-2">
            @for (k of fieldMapKeys(); track k) {
              <div class="grid grid-cols-12 gap-2 items-center">
                <span class="col-span-5 text-[12px] font-mono text-ink-soft">{{ k }}</span>
                <span class="col-span-1 text-center text-ink-muted">→</span>
                <input [ngModel]="cfgDraft.field_map[k] ?? ''" (ngModelChange)="cfgDraft.field_map[k] = $event"
                       type="text" class="col-span-5 h-8 px-2 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
                <button (click)="removeMapKey(k)" class="col-span-1 text-[12px] text-danger-fg hover:underline">✕</button>
              </div>
            }
          </div>
          <div class="flex items-center gap-2 mt-2">
            <input [(ngModel)]="newMapKey" type="text" placeholder="meta field"
                   class="h-8 px-2 text-[12px] font-mono border border-border rounded-md flex-1" />
            <button (click)="addMapKey()" [disabled]="!newMapKey.trim()"
                    class="h-8 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">+ Map</button>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button (click)="saveCfg()" [disabled]="busy()"
                  class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Save config' }}
          </button>
        </div>
      </section>

      <!-- ── Event summary + recent leads ─────────────────────────── -->
      <section class="col-span-12 lg:col-span-5 space-y-3">
        <div class="bg-surface-card border border-border rounded-[10px] p-4">
          <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-2">Last 14 days · event log</p>
          <table class="w-full text-[12px]">
            <thead><tr class="text-ink-muted text-[10px]">
              <th class="text-left font-semibold py-1">Day</th>
              <th class="text-right font-semibold py-1">Received</th>
              <th class="text-right font-semibold py-1">Verified</th>
              <th class="text-right font-semibold py-1">Mapped</th>
              <th class="text-right font-semibold py-1 text-danger-fg">Failed</th>
            </tr></thead>
            <tbody>
              @for (s of summary(); track s.day) {
                <tr class="border-t border-border">
                  <td class="py-1 font-mono">{{ shortDate(s.day) }}</td>
                  <td class="text-right font-mono">{{ s.received }}</td>
                  <td class="text-right font-mono text-good-fg">{{ s.verified }}</td>
                  <td class="text-right font-mono">{{ s.mapped }}</td>
                  <td class="text-right font-mono text-danger-fg">{{ s.failed }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="py-3 text-center text-ink-muted">No events yet.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="bg-surface-card border border-border rounded-[10px] p-4">
          <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-2">Recent leads ({{ leads().length }})</p>
          <ul class="divide-y divide-border max-h-[280px] overflow-y-auto -mx-4 px-4">
            @for (l of leads(); track l.id) {
              <li class="py-2 text-[12px]">
                <p class="font-medium text-ink">{{ l.full_name || '(no name)' }}</p>
                <p class="text-[11px] text-ink-muted">{{ l.phone || '—' }} · {{ l.email || '—' }} · <span class="font-mono">{{ l.source }}</span> · {{ l.status }}</p>
              </li>
            } @empty {
              <li class="py-6 text-center text-[12px] text-ink-muted">No leads yet.</li>
            }
          </ul>
        </div>
      </section>
    </div>
  `,
})
export class IntegrationsPage implements OnInit {
  private svc = inject(SettingsPackService);
  private supabase = inject(SupabaseService);
  protected branchStore = inject(BranchStore);
  private toast = inject(ToastService);

  protected readonly cfg     = signal<MetaLeadConfig>({ verify_token: '', field_map: {}, auto_assign_branch_id: null, active: false });
  protected readonly busy    = signal(false);
  protected readonly summary = signal<any[]>([]);
  protected readonly leads   = signal<any[]>([]);
  protected readonly branches = this.branchStore.branches;

  protected cfgDraft: MetaLeadConfig = { verify_token: '', field_map: {}, auto_assign_branch_id: null, active: false };
  protected newMapKey = '';

  /** Webhook URL points at the Supabase edge function for this project. */
  protected readonly webhookUrl = this.deriveWebhookUrl();

  async ngOnInit() {
    const [c, s, l] = await Promise.all([
      this.svc.getMetaConfig().catch(() => null),
      this.svc.metaLeadSummary().catch(() => []),
      this.svc.listLeads(100).catch(() => []),
    ]);
    if (c) {
      this.cfg.set(c);
      this.cfgDraft = JSON.parse(JSON.stringify(c));
    }
    this.summary.set(s);
    this.leads.set(l);
    if (this.branches().length === 0) void this.branchStore.load();
  }

  protected fieldMapKeys(): string[] { return Object.keys(this.cfgDraft.field_map ?? {}); }

  protected addMapKey() {
    const k = this.newMapKey.trim();
    if (!k) return;
    this.cfgDraft.field_map = { ...this.cfgDraft.field_map, [k]: '' };
    this.newMapKey = '';
  }

  protected removeMapKey(k: string) {
    const { [k]: _drop, ...rest } = this.cfgDraft.field_map;
    this.cfgDraft.field_map = rest;
  }

  protected generateToken() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    this.cfgDraft.verify_token = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  protected async copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.success('Copied', label);
    } catch { this.toast.error('Copy failed'); }
  }

  protected async saveCfg() {
    this.busy.set(true);
    try {
      await this.svc.setMetaConfig(this.cfgDraft);
      this.cfg.set(this.cfgDraft);
      this.toast.success('Meta config saved');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected shortDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM'); } catch { return iso; }
  }

  /** Compose the Supabase edge-function URL from environment.supabaseUrl. */
  private deriveWebhookUrl(): string {
    const base = (environment as any).supabaseUrl?.replace(/\/$/, '') ?? '';
    return base ? `${base}/functions/v1/meta-lead-webhook` : '/functions/v1/meta-lead-webhook';
  }
}
