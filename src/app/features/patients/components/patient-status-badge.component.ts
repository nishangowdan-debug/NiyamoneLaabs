import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PatientStatus } from '../../../core/supabase/supabase.types';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';

@Component({
  selector: 'app-patient-status-badge',
  standalone: true,
  imports: [BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-badge [tone]="tone()">{{ label() }}</app-badge>
  `,
})
export class PatientStatusBadgeComponent {
  readonly status = input.required<PatientStatus>();

  protected readonly tone = computed(() => {
    switch (this.status()) {
      case 'active': return 'good' as const;
      case 'inactive': return 'neutral' as const;
      case 'pending_payment': return 'warn' as const;
    }
  });

  protected readonly label = computed(() => {
    switch (this.status()) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'pending_payment': return 'Pending payment';
    }
  });
}
