import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-outlet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]"
      aria-live="polite"
      aria-atomic="true"
    >
      @for (t of toasts.toasts(); track t.id) {
        <div
          [class]="cls(t.tone)"
          class="rounded-md border-l-4 shadow-raised bg-surface-card pl-3 pr-2 py-2.5 flex items-start gap-2"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-ink truncate">{{ t.title }}</p>
            @if (t.message) {
              <p class="text-xs text-ink-soft mt-0.5">{{ t.message }}</p>
            }
          </div>
          <button
            type="button"
            class="text-ink-muted hover:text-ink rounded p-1 -mr-1"
            (click)="toasts.dismiss(t.id)"
            aria-label="Dismiss"
          >×</button>
        </div>
      }
    </div>
  `,
})
export class ToastOutletComponent {
  protected readonly toasts = inject(ToastService);

  protected cls(tone: 'good' | 'info' | 'warn' | 'danger') {
    return {
      good:   'border-good-fg',
      info:   'border-info-fg',
      warn:   'border-warn-fg',
      danger: 'border-danger-fg',
    }[tone];
  }
}
