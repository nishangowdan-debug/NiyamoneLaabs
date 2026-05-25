import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Topbar } from './topbar/topbar';
import { Sidebar } from './sidebar/sidebar';
import { ToastOutletComponent } from '../../shared/ui/toast/toast-outlet.component';
import { CommandPaletteComponent } from '../../shared/ui/command-palette/command-palette.component';
import { AmbulanceAlertBanner } from '../../features/ambulance-alert/ambulance-alert-banner';
import { AmbulanceAlertService } from '../../features/ambulance-alert/ambulance-alert.service';
import { SessionTimeoutService } from '../../core/auth/session-timeout.service';

@Component({
  selector: 'app-app-layout',
  standalone: true,
  imports: [RouterOutlet, Topbar, Sidebar, ToastOutletComponent, CommandPaletteComponent, AmbulanceAlertBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh bg-surface-page">
      <app-topbar />
      <app-ambulance-alert-banner />
      <div class="flex">
        <app-sidebar />
        <main class="flex-1 min-w-0 px-6 py-6">
          <router-outlet />
        </main>
      </div>
    </div>
    <app-toast-outlet />
    <app-command-palette />
  `,
})
export class AppLayout implements OnDestroy {
  private alerts = inject(AmbulanceAlertService);

  constructor() {
    inject(SessionTimeoutService).start();
    this.alerts.start();
  }

  ngOnDestroy(): void {
    this.alerts.stop();
  }
}
