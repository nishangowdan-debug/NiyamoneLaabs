import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Tone = 'good' | 'info' | 'warn' | 'danger' | 'neutral';

const TONE: Record<Tone, string> = {
  good: 'bg-good-bg text-good-fg',
  info: 'bg-info-bg text-info-fg',
  warn: 'bg-warn-bg text-warn-fg',
  danger: 'bg-danger-bg text-danger-fg',
  neutral: 'bg-surface-muted text-ink-muted',
};

@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="cls()"><ng-content /></span>
  `,
})
export class BadgeComponent {
  readonly tone = input<Tone>('neutral');

  readonly cls = computed(() =>
    [
      'inline-flex items-center gap-1 px-2 h-5 rounded-full',
      'text-2xs font-medium',
      TONE[this.tone()],
    ].join(' '),
  );
}
