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
  selector: 'app-textarea',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaComponent),
      multi: true,
    },
  ],
  template: `
    <textarea
      [placeholder]="placeholder()"
      [rows]="rows()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      [class]="cls()"
      [value]="value()"
      (input)="onInput($any($event.target).value)"
      (blur)="onTouched()"
    ></textarea>
  `,
})
export class TextareaComponent implements ControlValueAccessor {
  readonly placeholder = input<string>('');
  readonly rows = input<number>(3);
  readonly invalid = input(false);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  protected readonly cls = computed(() =>
    [
      'block w-full px-3 py-2 text-sm bg-surface-card text-ink',
      'border rounded-md placeholder:text-ink-muted',
      'focus:outline-none focus:ring-2 focus:border-primary-500',
      'disabled:opacity-60 disabled:cursor-not-allowed resize-y transition-colors',
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
