import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { passwordStrengthLabel } from '../../validators/strong-password.validator';

@Component({
  selector: 'app-password-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PasswordInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative">
      <input
        [type]="reveal() ? 'text' : 'password'"
        [placeholder]="placeholder()"
        [autocomplete]="autocomplete()"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() || null"
        [class]="cls()"
        [value]="value()"
        (input)="onInput($any($event.target).value)"
        (blur)="onTouched()"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-ink-muted hover:text-ink rounded"
        (click)="reveal.set(!reveal())"
        [attr.aria-label]="reveal() ? 'Hide password' : 'Show password'"
      >
        {{ reveal() ? 'Hide' : 'Show' }}
      </button>
    </div>

    @if (showStrength() && value().length > 0) {
      <div class="mt-2 flex items-center gap-2">
        <div class="flex-1 grid grid-cols-4 gap-1">
          @for (i of [0,1,2,3]; track i) {
            <div
              class="h-1 rounded-full"
              [class.bg-surface-muted]="strength().score <= i"
              [class.bg-danger-fg]="strength().score === i + 1 && i === 0"
              [class.bg-warn-fg]="strength().score === i + 1 && i === 1"
              [class.bg-info-fg]="strength().score === i + 1 && i === 2"
              [class.bg-good-fg]="strength().score >= i + 1 && i === 3"
            ></div>
          }
        </div>
        <span class="text-2xs text-ink-muted w-16 text-right">{{ strength().label }}</span>
      </div>
    }
  `,
})
export class PasswordInputComponent implements ControlValueAccessor {
  readonly placeholder = input<string>('');
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly invalid = input(false);
  readonly showStrength = input(false);

  protected readonly value = signal('');
  protected readonly reveal = signal(false);
  protected readonly disabled = signal(false);
  protected readonly strength = computed(() => passwordStrengthLabel(this.value()));

  protected readonly cls = computed(() =>
    [
      'block w-full h-9 pl-3 pr-16 text-sm bg-surface-card text-ink font-mono',
      'border rounded-md placeholder:text-ink-muted',
      'focus:outline-none focus:ring-2 focus:border-primary-500',
      'disabled:opacity-60 disabled:cursor-not-allowed',
      'transition-colors',
      this.invalid()
        ? 'border-danger-fg focus:ring-danger-fg/30'
        : 'border-border focus:ring-primary-500/30',
    ].join(' '),
  );

  private _onChange: (val: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (val: string) => void): void {
    this._onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onInput(val: string) {
    this.value.set(val);
    this._onChange(val);
  }
}
