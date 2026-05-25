import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  template: `
    <input
      [type]="type()"
      [placeholder]="placeholder()"
      [autocomplete]="autocomplete()"
      [attr.inputmode]="inputmode()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      [class]="cls()"
      [value]="value()"
      (input)="onInput($any($event.target).value)"
      (blur)="onTouched()"
    />
  `,
})
export class InputComponent implements ControlValueAccessor {
  readonly type = input<'text' | 'email' | 'tel' | 'password' | 'number'>('text');
  readonly placeholder = input<string>('');
  readonly autocomplete = input<string>('off');
  readonly inputmode = input<'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search' | 'url'>('text');
  readonly invalid = input(false);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  protected readonly cls = computed(() =>
    [
      'block w-full h-9 px-3 text-sm bg-surface-card text-ink',
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
