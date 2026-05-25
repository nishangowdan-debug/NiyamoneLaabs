import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Tone = 'good' | 'info' | 'warn' | 'danger';

const TONE: Record<Tone, string> = {
  good: 'bg-good-bg text-good-strong border-good-fg',
  info: 'bg-info-bg text-info-strong border-info-fg',
  warn: 'bg-warn-bg text-warn-strong border-warn-fg',
  danger: 'bg-danger-bg text-danger-strong border-danger-fg',
};

@Component({
  selector: 'app-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="alert" [class]="cls()">
      @if (title()) {
        <p class="font-medium text-sm mb-0.5">{{ title() }}</p>
      }
      <div class="text-sm"><ng-content /></div>
    </div>
  `,
})
export class AlertComponent {
  readonly tone = input<Tone>('info');
  readonly title = input<string>('');

  readonly cls = computed(() =>
    [
      'border-l-4 rounded-md px-3 py-2.5',
      TONE[this.tone()],
    ].join(' '),
  );
}
