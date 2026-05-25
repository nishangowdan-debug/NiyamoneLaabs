import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="cls()">
      @if (title() || subtitle()) {
        <header class="flex items-center justify-between mb-3">
          <div>
            @if (title()) {
              <h3 class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold">{{ title() }}</h3>
            }
            @if (subtitle()) {
              <p class="text-[11px] text-ink-muted mt-0.5">{{ subtitle() }}</p>
            }
          </div>
          <ng-content select="[card-actions]" />
        </header>
      }
      <ng-content />
    </section>
  `,
})
export class CardComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly padding = input<'sm' | 'md' | 'lg' | 'none'>('md');

  readonly cls = computed(() => {
    const p = {
      none: 'p-0',
      sm:   'p-3',
      md:   'p-4',
      lg:   'p-[18px]',
    }[this.padding()];
    return `bg-surface-card border border-border rounded-[10px] ${p}`;
  });
}
