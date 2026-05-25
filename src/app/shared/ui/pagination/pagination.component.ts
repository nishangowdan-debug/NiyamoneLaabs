import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="flex items-center justify-between gap-3 text-xs text-ink-soft">
      <div>
        Showing <span class="font-medium text-ink">{{ from() }}</span>–<span class="font-medium text-ink">{{ to() }}</span>
        of <span class="font-medium text-ink">{{ total() }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="h-8 px-3 rounded-md border border-border text-ink hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
          [disabled]="page() <= 0"
          (click)="goto.emit(page() - 1)"
        >Previous</button>
        <span class="h-8 px-3 grid place-items-center text-ink-muted">
          {{ page() + 1 }} / {{ totalPages() }}
        </span>
        <button
          type="button"
          class="h-8 px-3 rounded-md border border-border text-ink hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed"
          [disabled]="page() + 1 >= totalPages()"
          (click)="goto.emit(page() + 1)"
        >Next</button>
      </div>
    </nav>
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly goto = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly from = computed(() =>
    this.total() === 0 ? 0 : this.page() * this.pageSize() + 1,
  );
  protected readonly to = computed(() =>
    Math.min(this.total(), (this.page() + 1) * this.pageSize()),
  );
}
