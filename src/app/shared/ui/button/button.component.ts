import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
  secondary: 'bg-surface-card border border-border hover:bg-surface-subtle text-ink',
  ghost: 'bg-transparent hover:bg-surface-subtle text-ink',
  danger: 'bg-danger-fg hover:bg-danger-strong text-white',
};

@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="cls()"
    >
      @if (loading()) {
        <span
          class="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        ></span>
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<Variant>('primary');
  readonly size = input<Size>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);

  readonly cls = computed(() =>
    [
      'inline-flex items-center justify-center gap-2 font-medium rounded-md',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
      SIZE[this.size()],
      VARIANT[this.variant()],
      this.fullWidth() ? 'w-full' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
