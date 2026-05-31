import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsPackService, type MetaLeadConfig } from '../../data/settings-pack.service';
import { BranchStore } from '../../../../core/branches/branch.store';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import { format, parseISO } from 'date-fns';

/** Polished Integrations tab — matches the reference's numbered-steps layout. */
@Component({
  selector: 'app-integrations-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="bg-surface-card border border-border rounded-[10px] p-6">
      <div class="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <h2 class="font-display text-[20px] font-medium text-ink">Meta Lead Ads</h2>
          @if (cfg.active) {
            <span class="px-2 py-0.5 rounded-full bg-good-bg text-good-fg text-[11px] font-medium uppercase tracking-wider">active</span>
          } @else {
            <span class="px-2 py-0.5 rounded-full bg-warn-bg text-warn-fg text-[11px] font-medium uppercase tracking-wider">disabled</span>
          }
        </div>
        <div class="text-right">
          <p class="text-[10px] uppercase tracking-wider text-ink-muted">Last 7 days</p>
          <p class="font-display text-[26px] text-ink leading-tight">{{ recentTotal() }}</p>
          <p class="text-[10px] text-ink-muted">today: {{ todayTotal() }}</p>
        </div>
      </div>
      <p class="text-[13px] text-ink-soft mb-5">
        Receive Facebook + Instagram Lead Ads directly into the CRM. Secrets live in the Edge Function environment;
        non-secret config lives here.
      </p>

      <!-- Step 1 — webhook URL -->
      <div class="mb-4">
        <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">Step 1 · Webhook URL</p>
        <div class="flex items-stretch gap-2">
          <input type="text" readonly [value]="webhookUrl"
                 class="flex-1 h-10 px-3 text-[12px] font-mono bg-surface-muted border border-border rounded-md text-ink" />
          <button (click)="copy(webhookUrl, 'Webhook URL')"
                  class="h-10 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Copy</button>
        </div>
        <p class="text-[11px] text-ink-muted mt-1">Paste this in Meta App Dashboard → Webhooks → Page → Callback URL.</p>
      </div>

      <!-- Step 2 — verify token -->
      <div class="mb-4">
        <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">Step 2 · Verify token</p>
        <div class="flex items-stretch gap-2">
          <input type="text" [(ngModel)]="cfg.verify_token"
                 class="flex-1 h-10 px-3 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600"
                 placeholder="wa-meta-verify-…" />
          <button (click)="rotate()"
                  class="h-10 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Rotate</button>
          <button (click)="copy(cfg.verify_token, 'Verify token')"
                  class="h-10 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Copy</button>
        </div>
        <p class="text-[11px] text-ink-muted mt-1">Paste the same value in Meta's "Verify token" field. Click Save below after changing.</p>
      </div>

      <!-- Step 3 — secrets instructions -->
      <div class="mb-4 rounded-[10px] border border-warn-fg/40 bg-warn-bg/40 px-4 py-3">
        <p class="text-[12px] font-semibold text-warn-fg mb-2">Step 3 · Edge Function secrets (only once, in Supabase Dashboard)</p>
        <p class="text-[12px] text-ink-soft mb-1.5"><span class="font-mono">Dashboard → Edge Functions → meta-lead-webhook → Secrets → add:</span></p>
        <ul class="text-[12px] text-ink-soft list-none space-y-1 ml-2">
          <li>• <span class="font-mono font-bold">META_APP_SECRET</span> = your Meta App secret (Dashboard → Settings → Basic)</li>
          <li>• <span class="font-mono font-bold">META_PAGE_ACCESS_TOKEN</span> = Page access token with leads_retrieval scope</li>
        </ul>
      </div>

      <!-- Default assignee / branch + active toggle -->
      <div class="grid grid-cols-2 gap-3 mb-3">
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Default assignee branch</span>
          <select [ngModel]="cfg.auto_assign_branch_id ?? ''" (ngModelChange)="cfg.auto_assign_branch_id = $event || null"
                  class="w-full h-10 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
            <option value="">— route per form id —</option>
            @for (b of branches(); track b.id) {
              <option [value]="b.id">{{ b.name }} · {{ b.code }}</option>
            }
          </select>
        </label>
        <label class="inline-flex items-center gap-2 mt-7 text-[13px] text-ink font-medium">
          <input type="checkbox" [(ngModel)]="cfg.active" class="size-4 accent-danger-fg" />
          Enabled (toggle off to drop incoming webhooks without writing leads)
        </label>
      </div>

      <!-- Step 4 — field map -->
      <div class="mb-3">
        <div class="flex items-center justify-between mb-2">
          <p class="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">Step 4 · Field map (Meta form field → leads column)</p>
          <button (click)="addMap()" class="h-7 px-3 rounded-md border border-border text-[11px] text-ink-soft hover:bg-surface-subtle">+ Add mapping</button>
        </div>
        <div class="grid grid-cols-12 gap-2 mb-1.5 text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
          <span class="col-span-5">Meta field name</span>
          <span class="col-span-1"></span>
          <span class="col-span-5">Leads column</span>
        </div>
        @for (k of mapKeys(); track k) {
          <div class="grid grid-cols-12 gap-2 items-center mb-2">
            <input type="text" [value]="k" disabled
                   class="col-span-5 h-9 px-2.5 text-[12px] font-mono bg-surface-muted border border-border rounded-md text-ink-muted" />
            <span class="col-span-1 text-center text-ink-muted">→</span>
            <select [ngModel]="cfg.field_map[k] ?? ''" (ngModelChange)="cfg.field_map[k] = $event"
                    class="col-span-5 h-9 px-2 text-[12.5px] border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="">— ignore —</option>
              <option value="full_name">full_name</option>
              <option value="email">email</option>
              <option value="phone">phone</option>
              <option value="notes">notes</option>
              <option value="payload">payload (jsonb)</option>
            </select>
            <button (click)="removeMap(k)" class="col-span-1 text-[14px] text-danger-fg hover:underline">✕</button>
          </div>
        }
        <div class="flex items-center gap-2 mt-1">
          <input [(ngModel)]="newKey" type="text" placeholder="new meta field name"
                 class="flex-1 h-9 px-2.5 text-[12px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
          <button (click)="addMap()" [disabled]="!newKey.trim()"
                  class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50">Add</button>
        </div>
      </div>

      <div class="mt-5 flex justify-end">
        <button (click)="save()" [disabled]="busy()"
                class="h-10 px-5 rounded-md bg-danger-fg hover:bg-danger-fg/90 text-white text-[13px] font-medium disabled:opacity-50">
          {{ busy() ? 'Saving…' : 'Save config' }}
        </button>
      </div>
    </section>

    <!-- Recent leads -->
    <section class="mt-5 bg-surface-card border border-border rounded-[10px] p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-display text-[16px] font-medium text-ink">Recent leads</h3>
        <span class="text-[11px] text-ink-muted">{{ leads().length }} total</span>
      </div>
      @if (leads().length === 0) {
        <p class="text-[12px] text-ink-muted">No leads yet. Once the edge function receives a valid webhook, rows will appear here.</p>
      } @else {
        <ul class="divide-y divide-border max-h-[300px] overflow-y-auto -mx-5 px-5">
          @for (l of leads(); track l.id) {
            <li class="py-2 text-[12px]">
              <p class="font-medium text-ink">{{ l.full_name || '(no name)' }}</p>
              <p class="text-[11px] text-ink-muted">{{ l.phone || '—' }} · {{ l.email || '—' }} · <span class="font-mono">{{ l.source }}</span> · {{ l.status }}</p>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class IntegrationsTab implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);
  protected branchStore = inject(BranchStore);

  protected cfg: MetaLeadConfig = { verify_token: '', field_map: {}, auto_assign_branch_id: null, active: false };
  protected readonly busy = signal(false);
  protected readonly leads = signal<any[]>([]);
  protected readonly summary = signal<any[]>([]);
  protected readonly branches = this.branchStore.branches;
  protected newKey = '';

  protected readonly webhookUrl = this.derive();

  async ngOnInit() {
    const [c, s, l] = await Promise.all([
      this.svc.getMetaConfig().catch(() => null),
      this.svc.metaLeadSummary().catch(() => []),
      this.svc.listLeads(100).catch(() => []),
    ]);
    if (c) this.cfg = JSON.parse(JSON.stringify(c));
    this.summary.set(s);
    this.leads.set(l);
    if (this.branches().length === 0) void this.branchStore.load();
  }

  protected mapKeys(): string[] { return Object.keys(this.cfg.field_map ?? {}); }

  protected addMap() {
    const k = (this.newKey || 'field_' + (Object.keys(this.cfg.field_map).length + 1)).trim();
    if (!k) return;
    this.cfg.field_map = { ...this.cfg.field_map, [k]: '' };
    this.newKey = '';
  }

  protected removeMap(k: string) {
    const { [k]: _x, ...rest } = this.cfg.field_map;
    this.cfg.field_map = rest;
  }

  protected rotate() {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    this.cfg.verify_token = 'wa-meta-verify-' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  protected async copy(v: string, label: string) {
    try { await navigator.clipboard.writeText(v); this.toast.success('Copied', label); }
    catch { this.toast.error('Copy failed'); }
  }

  protected async save() {
    this.busy.set(true);
    try { await this.svc.setMetaConfig(this.cfg); this.toast.success('Saved', 'Meta config updated.'); }
    catch (e: any) { this.toast.error('Save failed', e?.message ?? ''); }
    finally { this.busy.set(false); }
  }

  protected recentTotal(): number {
    return (this.summary() ?? []).reduce((s: number, r: any) => s + (r.received ?? 0), 0);
  }
  protected todayTotal(): number {
    const today = new Date().toISOString().slice(0, 10);
    return (this.summary() ?? []).find((r: any) => (r.day ?? '').toString().startsWith(today))?.received ?? 0;
  }

  private derive(): string {
    const base = (environment as any).supabaseUrl?.replace(/\/$/, '') ?? '';
    return base ? `${base}/functions/v1/meta-lead-webhook` : '/functions/v1/meta-lead-webhook';
  }
}
