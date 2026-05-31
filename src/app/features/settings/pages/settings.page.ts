import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CompanyInfoTab } from './tabs/company-info.tab';
import { LetterheadTab } from './tabs/letterhead.tab';
import { LetterTemplatesTab } from './tabs/letter-templates.tab';
import { IntegrationsTab } from './tabs/integrations.tab';
import { CategoriesTab } from './tabs/categories.tab';
import { GstRatesPage } from './gst-rates.page';
import { HsnCodesPage } from './hsn-codes.page';
import { PrintSettingsPage } from './print-settings.page';

type TabKey = 'company' | 'letterhead' | 'print-branding' | 'letter-templates'
            | 'integrations' | 'gst' | 'hsn' | 'categories' | 'users';

/**
 * Settings hub — single page with 8 horizontal tabs, matching the reference
 * design. Each tab is a standalone component (lazy-instantiated by Angular's
 * @if switch). The legacy 5-tab settings page is preserved at /settings/legacy
 * so existing logo / role / signature / demo workflows stay reachable.
 */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CompanyInfoTab, LetterheadTab, LetterTemplatesTab, IntegrationsTab,
    CategoriesTab, GstRatesPage, HsnCodesPage, PrintSettingsPage,
  ],
  template: `
    <header class="pb-3 mb-4 border-b border-border">
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Settings</h1>
      <p class="text-[13px] text-ink-muted mt-1">All master data and configuration for the platform.</p>
    </header>

    <!-- ── Horizontal tab bar ──────────────────────────────────── -->
    <nav class="flex items-end gap-1 border-b border-border mb-5 overflow-x-auto" role="tablist">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab"
                [class.text-ink]="tab() === t.key"
                [class.font-semibold]="tab() === t.key"
                [class.border-ink]="tab() === t.key"
                [class.text-ink-muted]="tab() !== t.key"
                [class.border-transparent]="tab() !== t.key"
                (click)="tab.set(t.key)"
                class="px-3 py-2.5 text-[13px] border-b-2 -mb-px transition-colors hover:text-ink whitespace-nowrap">
          {{ t.label }}
        </button>
      }
      <div class="ml-auto pb-1">
        <a routerLink="/settings/legacy"
           class="text-[11px] text-ink-muted hover:text-ink underline">Legacy settings →</a>
      </div>
    </nav>

    <!-- ── Active tab ──────────────────────────────────────────── -->
    @switch (tab()) {
      @case ('company')         { <app-company-info-tab /> }
      @case ('letterhead')      { <app-letterhead-tab /> }
      @case ('print-branding')  { <app-print-settings-page /> }
      @case ('letter-templates'){ <app-letter-templates-tab /> }
      @case ('integrations')    { <app-integrations-tab /> }
      @case ('gst')             { <app-gst-rates-page /> }
      @case ('hsn')             { <app-hsn-codes-page /> }
      @case ('categories')      { <app-categories-tab /> }
      @case ('users') {
        <section class="bg-surface-card border border-border rounded-[10px] p-6">
          <h2 class="font-display text-[20px] font-medium text-ink mb-1">Users &amp; roles</h2>
          <p class="text-[13px] text-ink-muted mb-4">User accounts, branch assignment, role permissions, and digital signatures live in their dedicated pages.</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <a routerLink="/staff" class="block p-4 rounded-md border border-border hover:border-primary-300 hover:bg-primary-50/30 transition">
              <p class="text-[14px] font-semibold text-ink">Staff directory</p>
              <p class="text-[12px] text-ink-muted mt-1">Invite, deactivate, view profiles, change branch.</p>
            </a>
            <a routerLink="/settings/legacy" fragment="roles" class="block p-4 rounded-md border border-border hover:border-primary-300 hover:bg-primary-50/30 transition">
              <p class="text-[14px] font-semibold text-ink">Roles &amp; permissions</p>
              <p class="text-[12px] text-ink-muted mt-1">Per-role permission matrix.</p>
            </a>
            <a routerLink="/settings/legacy" fragment="signatures" class="block p-4 rounded-md border border-border hover:border-primary-300 hover:bg-primary-50/30 transition">
              <p class="text-[14px] font-semibold text-ink">Digital signatures</p>
              <p class="text-[12px] text-ink-muted mt-1">Upload pathologist / doctor signatures.</p>
            </a>
          </div>
        </section>
      }
    }
  `,
})
export class SettingsPage implements OnInit {
  private route = inject(ActivatedRoute);

  protected readonly tab = signal<TabKey>('company');

  protected readonly tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'company',          label: 'Company info' },
    { key: 'letterhead',       label: 'Letterhead' },
    { key: 'print-branding',   label: 'Print branding' },
    { key: 'letter-templates', label: 'Letter templates' },
    { key: 'integrations',     label: 'Integrations' },
    { key: 'gst',              label: 'GST rates' },
    { key: 'hsn',              label: 'HSN / SAC' },
    { key: 'categories',       label: 'Categories' },
    { key: 'users',            label: 'Users & roles' },
  ];

  /** Honour ?tab=… deep-links so external bookmarks (and the redirected
   *  /settings/print URL) land on the right tab. */
  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('tab') as TabKey | null;
    if (q && this.tabs.some(t => t.key === q)) this.tab.set(q);
  }
}
