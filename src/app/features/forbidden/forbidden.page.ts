import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';

@Component({
  selector: 'app-forbidden-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardComponent, ButtonComponent],
  template: `
    <div class="max-w-[520px] mx-auto mt-12">
      <app-card padding="lg">
        <div class="text-2xs uppercase tracking-wider text-danger-fg font-medium">403</div>
        <h1 class="font-display text-2xl text-ink leading-tight mt-1">Access denied</h1>
        <p class="text-sm text-ink-soft mt-2">
          You don't have permission to view this page. If you believe this is an error,
          contact your branch administrator.
        </p>
        <div class="mt-6">
          <a routerLink="/dashboard">
            <app-button variant="secondary">Back to dashboard</app-button>
          </a>
        </div>
      </app-card>
    </div>
  `,
})
export class ForbiddenPage {}
