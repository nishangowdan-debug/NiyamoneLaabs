import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  inject,
  signal,
  computed,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  category: 'screen' | 'patient' | 'action';
  route: string;
}

const SCREENS: PaletteItem[] = [
  { id: 's-dashboard', label: 'Dashboard', category: 'screen', route: '/dashboard' },
  { id: 's-lab', label: 'Lab', category: 'screen', route: '/lab' },
  { id: 's-lab-qc', label: 'Lab QC & Compliance', category: 'screen', route: '/lab/qc' },
  { id: 's-billing', label: 'Billing', category: 'screen', route: '/billing' },
];

const ACTIONS: PaletteItem[] = [
  { id: 'a-billing', label: 'Open billing', category: 'action', route: '/billing' },
];

@Component({
  selector: 'app-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]" (click)="close()">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

        <!-- Palette container -->
        <div class="relative w-full max-w-[560px] bg-surface-card rounded-xl shadow-pop border border-border overflow-hidden"
             (click)="$event.stopPropagation()">

          <!-- Search input -->
          <div class="flex items-center gap-3 px-4 h-12 border-b border-border">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-muted shrink-0">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              #searchInput
              type="text"
              [value]="query()"
              (input)="onInput($any($event.target).value)"
              (keydown)="onKeydown($event)"
              placeholder="Search screens, patients, or actions..."
              class="flex-1 h-full bg-transparent text-[14px] text-ink placeholder:text-ink-muted focus:outline-none"
              autocomplete="off"
            />
            <kbd class="text-[10px] text-ink-faint border border-border rounded px-1.5 py-0.5 font-mono bg-surface-muted">ESC</kbd>
          </div>

          <!-- Results -->
          <div class="max-h-[340px] overflow-y-auto py-2">
            @if (results().length === 0 && query().length > 0) {
              <p class="px-4 py-6 text-center text-[13px] text-ink-muted">No results found</p>
            }

            @if (screenResults().length > 0) {
              <div class="px-3 pt-2 pb-1">
                <p class="text-[10px] uppercase tracking-[0.08em] text-ink-faint font-semibold px-1">Screens</p>
              </div>
              @for (item of screenResults(); track item.id; let i = $index) {
                <button
                  type="button"
                  (click)="select(item)"
                  [class]="itemCls(item.id)"
                  (mouseenter)="activeId.set(item.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-muted shrink-0">
                    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>
                  </svg>
                  <span class="text-[13px] text-ink">{{ item.label }}</span>
                </button>
              }
            }

            @if (actionResults().length > 0) {
              <div class="px-3 pt-3 pb-1">
                <p class="text-[10px] uppercase tracking-[0.08em] text-ink-faint font-semibold px-1">Quick Actions</p>
              </div>
              @for (item of actionResults(); track item.id) {
                <button
                  type="button"
                  (click)="select(item)"
                  [class]="itemCls(item.id)"
                  (mouseenter)="activeId.set(item.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-muted shrink-0">
                    <path d="M5 12h14"/><path d="M12 5v14"/>
                  </svg>
                  <span class="text-[13px] text-ink">{{ item.label }}</span>
                </button>
              }
            }

            @if (patientResults().length > 0) {
              <div class="px-3 pt-3 pb-1">
                <p class="text-[10px] uppercase tracking-[0.08em] text-ink-faint font-semibold px-1">Patients</p>
              </div>
              @for (item of patientResults(); track item.id) {
                <button
                  type="button"
                  (click)="select(item)"
                  [class]="itemCls(item.id)"
                  (mouseenter)="activeId.set(item.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-ink-muted shrink-0">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <div class="text-left">
                    <span class="text-[13px] text-ink block">{{ item.label }}</span>
                    @if (item.sublabel) {
                      <span class="text-[11px] text-ink-muted font-mono">{{ item.sublabel }}</span>
                    }
                  </div>
                </button>
              }
            }

            @if (searching()) {
              <p class="px-4 py-3 text-center text-[12px] text-ink-muted">Searching patients...</p>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent implements OnInit {
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeId = signal<string | null>(null);
  protected readonly patientResults = signal<PaletteItem[]>([]);
  protected readonly searching = signal(false);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly screenResults = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return SCREENS.slice(0, 6);
    return SCREENS.filter((s) => s.label.toLowerCase().includes(q));
  });

  protected readonly actionResults = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return ACTIONS;
    return ACTIONS.filter((a) => a.label.toLowerCase().includes(q));
  });

  protected readonly results = computed(() => [
    ...this.screenResults(),
    ...this.actionResults(),
    ...this.patientResults(),
  ]);

  ngOnInit() {}

  @HostListener('document:keydown', ['$event'])
  handleKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === 'Escape' && this.open()) {
      this.close();
    }
  }

  toggle() {
    if (this.open()) {
      this.close();
    } else {
      this.open.set(true);
      this.query.set('');
      this.patientResults.set([]);
      this.activeId.set(null);
      setTimeout(() => this.searchInput()?.nativeElement.focus(), 50);
    }
  }

  close() {
    this.open.set(false);
    this.query.set('');
    this.patientResults.set([]);
  }

  select(item: PaletteItem) {
    this.close();
    this.router.navigateByUrl(item.route);
  }

  onInput(value: string) {
    this.query.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (value.trim().length >= 3) {
      this.searchTimeout = setTimeout(() => void this.searchPatients(value.trim()), 300);
    } else {
      this.patientResults.set([]);
    }
  }

  onKeydown(e: KeyboardEvent) {
    const items = this.results();
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === this.activeId());
      const next = idx < items.length - 1 ? idx + 1 : 0;
      this.activeId.set(items[next].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === this.activeId());
      const prev = idx > 0 ? idx - 1 : items.length - 1;
      this.activeId.set(items[prev].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = items.find((i) => i.id === this.activeId());
      if (active) this.select(active);
      else if (items.length > 0) this.select(items[0]);
    }
  }

  private async searchPatients(q: string) {
    this.searching.set(true);
    try {
      const { data } = await this.supabase.client
        .from('patients')
        .select('id, uhid, first_name, last_name, full_name, mobile')
        .or(`full_name.ilike.%${q}%,uhid.ilike.%${q}%,mobile.ilike.%${q}%`)
        .limit(5);

      this.patientResults.set(
        (data ?? []).map((p: any) => ({
          id: `p-${p.id}`,
          label: p.full_name || `${p.first_name} ${p.last_name}`,
          sublabel: `${p.uhid} · ${p.mobile || ''}`,
          category: 'patient' as const,
          route: `/patients/${p.id}`,
        })),
      );
    } catch {
      this.patientResults.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  protected itemCls(id: string): string {
    const base = 'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors';
    return this.activeId() === id
      ? `${base} bg-primary-100 text-primary-800`
      : `${base} hover:bg-surface-subtle`;
  }
}
