import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Step {
  label: string;
  description?: string;
}

@Component({
  selector: 'app-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex items-start gap-2 mb-8">
      @for (step of steps(); track $index; let i = $index) {
        <li class="flex-1">
          <div class="flex items-center gap-3">
            <div [class]="badgeCls(i)">
              @if (i < current()) {
                <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clip-rule="evenodd"/>
                </svg>
              } @else {
                {{ i + 1 }}
              }
            </div>
            <div class="min-w-0 flex-1">
              <p [class]="labelCls(i)">{{ step.label }}</p>
              @if (step.description) {
                <p class="text-2xs text-ink-muted truncate">{{ step.description }}</p>
              }
            </div>
          </div>
          @if (i < steps().length - 1) {
            <div class="ml-4 mt-2 h-px bg-border"></div>
          }
        </li>
      }
    </ol>
  `,
})
export class StepperComponent {
  readonly steps = input.required<Step[]>();
  readonly current = input<number>(0);

  protected badgeCls(i: number) {
    const base = 'shrink-0 size-7 rounded-full grid place-items-center text-2xs font-semibold ring-1 transition-colors';
    if (i < this.current()) return `${base} bg-primary-600 text-white ring-primary-600`;
    if (i === this.current()) return `${base} bg-surface-card text-primary-700 ring-primary-500`;
    return `${base} bg-surface-card text-ink-muted ring-border`;
  }

  protected labelCls(i: number) {
    if (i === this.current()) return 'text-sm font-medium text-ink truncate';
    if (i < this.current()) return 'text-sm text-ink-soft truncate';
    return 'text-sm text-ink-muted truncate';
  }
}
