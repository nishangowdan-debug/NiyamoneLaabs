import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BranchStore, Branch } from '../../../core/branches/branch.store';

@Component({
  selector: 'app-branch-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!ready()) {
      <span class="inline-flex items-center gap-2 h-8 px-2.5 border border-border rounded-md bg-surface-card text-[12px] font-medium opacity-60">
        <span class="size-1.5 rounded-full bg-ink-muted"></span>
        <small class="text-ink-muted font-normal">Branch</small>
        <span>…</span>
      </span>
    } @else if (!store.canSwitch()) {
      <!-- Single-branch users: static pill -->
      <span class="inline-flex items-center gap-2 h-8 px-2.5 border border-border rounded-md bg-surface-card text-[12px] font-medium" [title]="store.activeBranchName()">
        <span class="size-1.5 rounded-full bg-good-fg"></span>
        <small class="text-ink-muted font-normal">Branch</small>
        <span class="truncate max-w-[120px]">{{ shortName() }}</span>
      </span>
    } @else {
      <!-- Multi-branch users: interactive dropdown -->
      <div class="relative">
        <button type="button"
                (click)="toggle()"
                [class.ring-2]="open()"
                [class.ring-primary-200]="open()"
                class="inline-flex items-center gap-2 h-8 px-2.5 border border-border rounded-md bg-surface-card text-[12px] font-medium hover:bg-surface-subtle transition-colors">
          <span class="size-1.5 rounded-full"
                [class.bg-good-fg]="store.activeBranchId() !== null"
                [class.bg-primary-600]="store.activeBranchId() === null"></span>
          <small class="text-ink-muted font-normal">Branch</small>
          <span class="truncate max-w-[140px]">{{ shortName() }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               [class.rotate-180]="open()" class="transition-transform"><path d="m6 9 6 6 6-6"/></svg>
        </button>

        @if (open()) {
          <div class="absolute right-0 mt-2 w-[280px] bg-surface-card border border-border rounded-md shadow-[0_8px_32px_-8px_rgba(15,27,45,0.18)] ring-1 ring-black/[0.04] z-[60] overflow-hidden">
            <div class="px-3 py-2 border-b border-border bg-surface-muted/40">
              <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Switch hospital</p>
            </div>
            <ul class="max-h-[420px] overflow-y-auto">
              @if (store.canSeeAll()) {
                <li>
                  <button type="button" (click)="select(null)"
                          class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-subtle text-left transition-colors"
                          [class.bg-primary-50]="store.activeBranchId() === null">
                    <span class="size-8 rounded-md grid place-items-center bg-primary-600 text-white text-[14px] shrink-0">🌐</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-semibold text-ink truncate">All hospitals</p>
                      <p class="text-[11px] text-ink-muted">Network-wide rollup</p>
                    </div>
                    @if (store.activeBranchId() === null) {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0E4F8C" stroke-width="2.5" class="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                    }
                  </button>
                </li>
                <li class="border-t border-border"></li>
              }
              @for (b of store.branches(); track b.id) {
                <li>
                  <button type="button" (click)="select(b.id)"
                          class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-subtle text-left transition-colors"
                          [class.bg-primary-50]="store.activeBranchId() === b.id">
                    <span class="size-8 rounded-md grid place-items-center bg-primary-100 text-primary-800 text-[11px] font-bold shrink-0">{{ avatarCode(b.code) }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[13px] font-semibold text-ink truncate">{{ b.name }}</p>
                      <p class="text-[11px] text-ink-muted truncate">{{ city(b) }}</p>
                    </div>
                    @if (store.activeBranchId() === b.id) {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0E4F8C" stroke-width="2.5" class="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                    }
                  </button>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    }
  `,
})
export class BranchSwitcher {
  protected readonly store = inject(BranchStore);
  private readonly host = inject(ElementRef);

  protected readonly open = signal(false);
  protected readonly ready = computed(() => this.store.ready());

  /** Short label for the pill — strips the brand prefix for compactness. */
  protected readonly shortName = computed(() => {
    const full = this.store.activeBranchName();
    return full
      .replace(/^Sree Diagnostics\s+Lab\s*[—-]\s*/i, '')
      .replace(/^Sree\s+Diagnostics\s*[—-]\s*/i, '')
      .replace(/^Sree Diagnostics\s+Diagnostic\s+Centre\s*[—-]\s*/i, '');
  });

  /** Extract clean 2-3 letter initials from a branch code for the avatar tile.
   *  Strips dashes/digits and prefers the leading alphabetic segment so codes
   *  like "DEL-HQ" render as "DEL" instead of "-HQ", and "NIY01" as "NIY". */
  protected avatarCode(code: string): string {
    const cleaned = (code || '').toUpperCase();
    const head = cleaned.split(/[^A-Z]+/).find((s) => s.length > 0) ?? cleaned;
    return head.slice(0, 3) || cleaned.slice(0, 3);
  }

  protected toggle(): void { this.open.update((v) => !v); }

  protected async select(id: string | null): Promise<void> {
    this.store.setActive(id);
    this.open.set(false);
  }

  protected city(b: Branch): string {
    const a = b.address as { city?: string; state?: string } | null;
    if (!a) return b.code;
    const parts = [a.city, a.state].filter(Boolean);
    return parts.length ? parts.join(', ') : b.code;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent) {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }
  @HostListener('document:keydown.escape')
  onEscape() { this.open.set(false); }
}
