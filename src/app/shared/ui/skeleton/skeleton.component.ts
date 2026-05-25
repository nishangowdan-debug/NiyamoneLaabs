import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="block animate-pulse bg-surface-subtle rounded-md"
      [style.width]="width()"
      [style.height]="height()"
    ></span>
  `,
})
export class SkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
}
