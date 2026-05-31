import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import {
  LucideAngularModule,
  type LucideIconData,
  LayoutDashboard,
  TestTube,
  Receipt,
  ClipboardCheck,
  Search,
  Settings,
  UserCog,
  FlaskConical,
  Home,
  Truck,
  Users,
  Building2,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Wallet,
  Stethoscope,
  IndianRupee,
} from 'lucide-angular';
import { AuthStore } from '../../../core/auth/auth.store';
import { RoleSlug } from '../../../core/auth/auth.types';
import { BranchStore } from '../../../core/branches/branch.store';

interface NavItem {
  label: string;
  route: string;
  icon: LucideIconData;
  roles?: RoleSlug[];
  badge?: string | number;
  badgeKind?: 'urgent' | 'info';
}

interface NavSection {
  label: string;
  icon: LucideIconData;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="hb-sidebar">
      <!-- ── Section rail ─────────────────────────────────────── -->
      <div class="hb-rail">
        <div class="hb-rail__brand">
          <div class="mark">n</div>
        </div>
        <div class="hb-rail__items">
          @for (section of visibleSections(); track section.label) {
            <button
              type="button"
              class="hb-rail__btn"
              [class.is-open]="section.label === openSection()"
              [attr.aria-label]="section.label"
              [attr.title]="section.label"
              (click)="openSectionPanel(section.label)"
            >
              <i-lucide [name]="section.icon" [size]="22" [strokeWidth]="1.75"></i-lucide>
              <span class="label">{{ section.label }}</span>
            </button>
          }
        </div>
        <div class="hb-rail__avatar">
          <div class="avatar" [attr.title]="userName()">{{ userInitials() }}</div>
        </div>
      </div>

      <!-- ── Item panel ───────────────────────────────────────── -->
      <div class="hb-panel">
        @if (currentSection(); as cs) {
          <div class="hb-panel__header">
            <div class="hb-panel__overline">{{ hospitalName() }}</div>
            <div class="hb-panel__title">{{ cs.label }}</div>
          </div>
          <div class="hb-panel__search">
            <label>
              <i-lucide [name]="searchIcon" [size]="13" [strokeWidth]="1.75"></i-lucide>
              <input
                type="text"
                [placeholder]="'Search ' + cs.label.toLowerCase() + '…'"
                [value]="searchQuery()"
                (input)="onSearch($any($event.target).value)"
              />
            </label>
          </div>
          <div class="hb-panel__list">
            @for (item of filteredItems(); track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive
                #rla="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: false }"
                class="hb-item"
                [class.is-active]="rla.isActive"
              >
                <i-lucide [name]="item.icon" [size]="17" [strokeWidth]="1.75"></i-lucide>
                <span class="hb-item__label">{{ item.label }}</span>
                @if (item.badge != null) {
                  <span
                    class="hb-badge"
                    [class.hb-badge--urgent]="item.badgeKind === 'urgent'"
                    [class.hb-badge--info]="item.badgeKind === 'info'"
                  >{{ item.badge }}</span>
                }
              </a>
            }
            @if (filteredItems().length === 0) {
              <div class="hb-empty">No matches</div>
            }
          </div>
        }
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: block;
      width: 336px;
      flex-shrink: 0;
    }

    .hb-sidebar {
      display: flex;
      align-items: stretch;
      position: sticky;
      top: 3.5rem; /* topbar h-14 */
      height: calc(100dvh - 3.5rem);
      width: 336px;
      background: #fff;
      border-right: 1px solid #E5E7EB;
      font-family: inherit;
      color: #111827;
      overflow: hidden;
      z-index: 30;
    }

    /* ── Section rail ── */
    .hb-rail {
      width: 88px;
      background: linear-gradient(180deg, #0B5FAE 0%, #084A8A 100%);
      display: flex;
      flex-direction: column;
      box-shadow: inset -1px 0 0 rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .hb-rail__brand {
      height: 56px;
      display: grid;
      place-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .hb-rail__brand .mark {
      width: 34px; height: 34px;
      border-radius: 8px;
      background: rgba(255,255,255,0.14);
      display: grid; place-items: center;
      color: #fff;
      font-style: italic;
      font-weight: 700;
      font-size: 16px;
      line-height: 1;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
    }
    .hb-rail__items {
      flex: 1;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
    }
    .hb-rail__btn {
      position: relative;
      background: transparent;
      border: 0;
      cursor: pointer;
      padding: 12px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      border-radius: 8px;
      color: rgba(255,255,255,0.74);
      font-family: inherit;
      transition: background 160ms ease, color 160ms ease;
    }
    .hb-rail__btn:hover { color: #fff; background: rgba(255,255,255,0.06); }
    .hb-rail__btn.is-open {
      color: #fff;
      background: rgba(255,255,255,0.14);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
    }
    .hb-rail__btn.is-open::before {
      content: '';
      position: absolute;
      left: -8px; top: 8px; bottom: 8px;
      width: 3px; background: #fff;
      border-radius: 0 3px 3px 0;
    }
    .hb-rail__btn .label {
      font-weight: 600;
      font-size: 10px;
      line-height: 1;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .hb-rail__avatar {
      padding: 10px;
      display: grid; place-items: center;
      border-top: 1px solid rgba(255,255,255,0.12);
    }
    .hb-rail__avatar .avatar {
      width: 36px; height: 36px;
      border-radius: 999px;
      background: #fff;
      display: grid; place-items: center;
      color: #0B5FAE;
      font-weight: 700;
      font-size: 13px;
      line-height: 1;
    }

    /* ── Panel ── */
    .hb-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .hb-panel__header {
      padding: 12px 16px 10px;
      border-bottom: 1px solid #E5E7EB;
    }
    .hb-panel__overline {
      font-weight: 600;
      font-size: 11px;
      line-height: 1.2;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6B7280;
    }
    .hb-panel__title {
      margin-top: 2px;
      font-weight: 700;
      font-size: 17px;
      line-height: 1.2;
      letter-spacing: -0.01em;
    }
    .hb-panel__search {
      padding: 10px 12px 4px;
    }
    .hb-panel__search label {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 10px;
      background: #F3F4F6;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      color: #6B7280;
      font-size: 12px;
      line-height: 1;
    }
    .hb-panel__search label:focus-within {
      border-color: #1976D2;
      background: #fff;
    }
    .hb-panel__search input {
      flex: 1;
      background: transparent;
      border: 0;
      outline: 0;
      color: #111827;
      font: inherit;
      min-width: 0;
    }
    .hb-panel__search input::placeholder { color: #6B7280; }
    .hb-panel__list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 8px 12px;
    }
    .hb-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      height: 36px;
      padding: 0 10px;
      background: transparent;
      border: 0;
      cursor: pointer;
      border-radius: 6px;
      color: #111827;
      font-weight: 500;
      font-size: 13px;
      line-height: 1;
      text-align: left;
      text-decoration: none;
      font-family: inherit;
    }
    .hb-item:hover { background: #F3F4F6; }
    .hb-item.is-active {
      background: #E8F2FB;
      color: #0B5FAE;
      font-weight: 600;
    }
    .hb-item i-lucide { color: #4B5563; flex-shrink: 0; }
    .hb-item.is-active i-lucide { color: #0B5FAE; }
    .hb-item__label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hb-badge {
      font-weight: 600;
      font-size: 11px;
      line-height: 1;
      padding: 3px 7px;
      border-radius: 999px;
      flex-shrink: 0;
      background: #EEF1F5;
      color: #374151;
    }
    .hb-badge--urgent { background: #FEE2E2; color: #991B1B; }
    .hb-badge--info   { background: #E8F2FB; color: #0B5FAE; }
    .hb-empty {
      padding: 16px 12px;
      color: #6B7280;
      font-size: 12px;
      text-align: center;
    }
  `],
})
export class Sidebar {
  protected readonly auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private readonly router = inject(Router);

  protected readonly searchIcon = Search;

  protected readonly searchQuery = signal('');
  protected readonly openSection = signal<string>('Workspace');

  protected readonly sections: NavSection[] = [
    {
      label: 'Workspace',
      icon: LayoutDashboard,
      items: [
        { label: 'Dashboard',  route: '/dashboard',  icon: LayoutDashboard },
      ],
    },
    {
      label: 'Billing',
      icon: IndianRupee,
      items: [
        { label: 'Patients', route: '/patients', icon: Users,       roles: ['super_admin','branch_admin','doctor','nurse','reception','lab_tech','accountant'] },
        { label: 'Billing',  route: '/billing',  icon: IndianRupee, roles: ['super_admin','branch_admin','doctor','reception','accountant'] },
      ],
    },
    {
      label: 'Lab',
      icon: TestTube,
      items: [
        { label: 'Lab',                  route: '/lab',           icon: TestTube,       roles: ['super_admin','branch_admin','doctor','lab_tech'] },
        { label: 'Test catalog',         route: '/lab-catalog',   icon: FlaskConical,   roles: ['super_admin','branch_admin','lab_tech'] },
        { label: 'Lab QC & Compliance',  route: '/lab/qc',        icon: ClipboardCheck, roles: ['super_admin','branch_admin','doctor','lab_tech'] },
      ],
    },
    // Home collection menu retired. Reception files requests from /billing →
    // "📍 Home sample collection" toggle. Phlebotomists tracked under
    // /lab → 🏠 Home collection. Roster managed under /settings/phlebotomists.
    {
      label: 'Reports',
      icon: BarChart3,
      items: [
        { label: 'Lab reports', route: '/lab-reports', icon: BarChart3, roles: ['super_admin','branch_admin','doctor','lab_tech','accountant'] },
      ],
    },
    {
      // HR section — attendance auto-flips to "present" once a staff member
      // performs ≥3 mutations in the IST day (invoices, payments, lab results,
      // home collection, etc.). LOP days drive payroll deductions automatically.
      label: 'HR & Payroll',
      icon: Wallet,
      items: [
        { label: 'Attendance',     route: '/attendance',       icon: CalendarCheck, roles: ['super_admin','branch_admin','hr','accountant','doctor','lab_tech','reception','nurse','pharmacist'] },
        { label: 'Leave & shifts', route: '/attendance/leave', icon: CalendarClock, roles: ['super_admin','branch_admin','hr','accountant','doctor','lab_tech','reception','nurse','pharmacist'] },
        { label: 'Payroll',        route: '/payroll/salary',   icon: Wallet,        roles: ['super_admin','branch_admin','hr','accountant'] },
        { label: 'Doctor payouts', route: '/payroll/doctors',  icon: Stethoscope,   roles: ['super_admin','branch_admin','hr','accountant'] },
      ],
    },
    {
      label: 'Settings',
      icon: Settings,
      items: [
        // Single Settings entry — points at the tabbed hub which now hosts
        // Company info, Letterhead, Print branding (was /settings/print),
        // Letter templates, Integrations, GST, HSN, Categories. The old
        // "Print settings" sidebar item is gone; /settings/print redirects
        // to /settings?tab=print-branding to keep old bookmarks working.
        { label: 'Settings',        route: '/settings', icon: Building2, roles: ['super_admin','branch_admin'] },
        { label: 'Users',           route: '/staff',    icon: UserCog,   roles: ['super_admin','branch_admin'] },
      ],
    },
  ];

  /** Sections with at least one role-visible item, with items pre-filtered. */
  protected readonly visibleSections = computed<NavSection[]>(() => {
    const role = this.auth.role();
    return this.sections
      .map(s => ({ ...s, items: s.items.filter(i => this.canSee(i, role)) }))
      .filter(s => s.items.length > 0);
  });

  protected readonly currentSection = computed<NavSection | null>(() => {
    const open = this.openSection();
    const sections = this.visibleSections();
    return sections.find(s => s.label === open) ?? sections[0] ?? null;
  });

  protected readonly filteredItems = computed(() => {
    const cs = this.currentSection();
    if (!cs) return [];
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return cs.items;
    return cs.items.filter(i => i.label.toLowerCase().includes(q));
  });

  protected readonly userInitials = computed(() => {
    const email = this.auth.user()?.email ?? '';
    if (!email) return 'U';
    const local = email.split('@')[0] ?? '';
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (local.slice(0, 2) || 'U').toUpperCase();
  });

  protected readonly userName = computed(() => this.auth.user()?.email ?? '');

  protected readonly hospitalName = computed(() => {
    if (this.branchStore.activeBranchId() === null) return 'All hospitals';
    const name = this.branchStore.activeBranchName();
    return name && name !== '—' ? name : 'Sree Diagnostics';
  });

  constructor() {
    // Auto-open the section containing the current URL on init + on every navigation.
    this.syncOpenSection(this.router.url);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => this.syncOpenSection((e as NavigationEnd).urlAfterRedirects));
  }

  protected openSectionPanel(label: string): void {
    if (this.openSection() === label) return;
    this.openSection.set(label);
    this.searchQuery.set('');
  }

  protected onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  private canSee(item: NavItem, role: RoleSlug): boolean {
    if (!item.roles) return true;
    return item.roles.includes(role);
  }

  private syncOpenSection(url: string): void {
    const cleanUrl = url.split('?')[0].split('#')[0];
    for (const s of this.visibleSections()) {
      if (s.items.some(i => cleanUrl === i.route || cleanUrl.startsWith(i.route + '/'))) {
        this.openSection.set(s.label);
        return;
      }
    }
  }
}
