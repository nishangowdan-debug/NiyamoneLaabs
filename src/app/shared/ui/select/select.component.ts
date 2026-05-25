import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative">
      <select
        [class]="cls()"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() || null"
        [value]="value()"
        (change)="onChange($any($event.target).value)"
        (blur)="onTouched()"
      >
        @if (placeholder()) {
          <option value="" disabled>{{ placeholder() }}</option>
        }
        @for (opt of options(); track opt.value) {
          <option [value]="opt.value" [disabled]="opt.disabled">{{ opt.label }}</option>
        }
      </select>
      <svg
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-ink-muted"
        viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
      </svg>
    </div>
  `,
})
export class SelectComponent<T extends string = string> implements ControlValueAccessor {
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('');
  readonly invalid = input(false);

  protected readonly value = signal<T | ''>('');
  protected readonly disabled = signal(false);

  protected readonly cls = computed(() =>
    [
      'block w-full h-9 pl-3 pr-8 text-sm appearance-none bg-surface-card text-ink',
      'border rounded-md',
      'focus:outline-none focus:ring-2 focus:border-primary-500',
      'disabled:opacity-60 disabled:cursor-not-allowed transition-colors',
      this.invalid()
        ? 'border-danger-fg focus:ring-danger-fg/30'
        : 'border-border focus:ring-primary-500/30',
    ].join(' '),
  );

  private _onChange: (val: T | '') => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: T | ''): void {
    this.value.set(value ?? ('' as T));
  }
  registerOnChange(fn: (val: T | '') => void): void {
    this._onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onChange(val: string) {
    this.value.set(val as T);
    this._onChange(val as T);
  }
}
