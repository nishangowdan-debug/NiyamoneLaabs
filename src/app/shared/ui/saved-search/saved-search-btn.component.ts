import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SavedSearch, SavedSearchService } from './saved-search.service';
import { ToastService } from '../toast/toast.service';

@Component({
  selector: 'app-saved-search-btn',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="relative">
      <button type="button" (click)="toggle()"
              class="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
        <!-- bookmark icon -->
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
        Saved views
        <!-- chevron -->
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      @if (open()) {
        <!-- click-outside backdrop -->
        <div class="fixed inset-0 z-10" (click)="close()"></div>

        <!-- dropdown panel -->
        <div class="absolute right-0 top-full mt-1 z-20 w-[248px] bg-surface-card border border-border rounded-[10px] shadow-pop overflow-hidden">

          <!-- Save current view -->
          <div class="px-3 py-2.5 border-b border-border">
            <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">Save current view</p>
            <div class="flex gap-1.5">
              <input type="text" [(ngModel)]="newName" (keydown.enter)="save()" placeholder="View name…"
                     class="flex-1 h-7 px-2 text-[12px] rounded-md border border-border bg-surface-muted text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[2px] focus:ring-primary-100" />
              <button type="button" (click)="save()" [disabled]="!newName.trim() || saving()"
                      class="h-7 px-2.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[11px] font-medium disabled:opacity-40">
                {{ saving() ? '…' : 'Save' }}
              </button>
            </div>
          </div>

          <!-- Saved views list -->
          @if (views().length > 0) {
            <div class="max-h-[200px] overflow-y-auto py-1">
              @for (v of views(); track v.id) {
                <div class="flex items-center gap-1 px-3 py-1.5 hover:bg-surface-muted group">
                  <button type="button" (click)="load(v)"
                          class="flex-1 text-left text-[12px] text-ink truncate">
                    {{ v.name }}
                  </button>
                  <button type="button" (click)="remove(v.id)"
                          class="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger-fg p-0.5 transition-opacity">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              }
            </div>
          } @else if (loaded()) {
            <p class="px-3 py-3 text-[11px] text-ink-muted text-center">No saved views yet.</p>
          }

        </div>
      }
    </div>
  `,
})
export class SavedSearchBtnComponent implements OnInit, OnChanges {
  @Input({ required: true }) module!: string;
  @Input() currentFilters: Record<string, unknown> = {};
  @Output() filtersLoaded = new EventEmitter<Record<string, unknown>>();

  private svc = inject(SavedSearchService);
  private toast = inject(ToastService);

  protected readonly open = signal(false);
  protected readonly views = signal<SavedSearch[]>([]);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected newName = '';

  async ngOnInit() {
    await this.fetchViews();
  }

  ngOnChanges() {
    // currentFilters updated externally — no action needed here
  }

  protected toggle() {
    this.open.update((v) => !v);
  }

  protected close() {
    this.open.set(false);
  }

  protected load(v: SavedSearch) {
    this.filtersLoaded.emit(v.filters);
    this.close();
  }

  protected async save() {
    const name = this.newName.trim();
    if (!name) return;
    this.saving.set(true);
    try {
      const saved = await this.svc.save(this.module, name, this.currentFilters);
      this.views.update((list) => [...list, saved]);
      this.newName = '';
      this.toast.success(`View "${name}" saved`);
    } catch (e) {
      this.toast.error('Could not save view', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(id: string) {
    try {
      await this.svc.delete(id);
      this.views.update((list) => list.filter((v) => v.id !== id));
    } catch (e) {
      this.toast.error('Could not delete view', e instanceof Error ? e.message : 'Try again.');
    }
  }

  private async fetchViews() {
    try {
      this.views.set(await this.svc.list(this.module));
    } catch {
      // Non-critical — saved_searches table may not exist yet
    } finally {
      this.loaded.set(true);
    }
  }
}
