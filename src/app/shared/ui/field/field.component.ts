import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="block">
      @if (label()) {
        <span class="block text-xs font-medium text-ink-soft mb-1.5">
          {{ label() }}
          @if (required()) { <span class="text-danger-fg">*</span> }
        </span>
      }
      <ng-content />
      @if (hint() && !error()) {
        <span class="mt-1 block text-xs text-ink-muted">{{ hint() }}</span>
      }
      @if (error()) {
        <span class="mt-1 block text-xs text-danger-fg" role="alert">{{ error() }}</span>
      }
    </label>
  `,
})
export class FieldComponent {
  readonly label = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string>('');
  readonly required = input(false);
}
