import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, type LucideIconData } from 'lucide-angular';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <i-lucide
      [name]="name()"
      [size]="size()"
      [strokeWidth]="strokeWidth()"
      [class]="className()"
    ></i-lucide>
  `,
})
export class IconComponent {
  readonly name = input.required<LucideIconData>();
  readonly size = input<number>(16);
  readonly strokeWidth = input<number>(1.75);
  readonly className = input<string>('');
}
