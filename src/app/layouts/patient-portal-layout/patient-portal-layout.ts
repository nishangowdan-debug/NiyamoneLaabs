import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ToastOutletComponent } from '../../shared/ui/toast/toast-outlet.component';

const NAV_ITEMS = [
  { path: '/patient-portal/dashboard',     label: 'Dashboard'      },
  { path: '/patient-portal/appointments',  label: 'Appointments'   },
  { path: '/patient-portal/prescriptions', label: 'Prescriptions'  },
  { path: '/patient-portal/lab-results',   label: 'Lab results'    },
  { path: '/patient-portal/invoices',      label: 'Invoices'       },
] as const;

@Component({
  selector: 'app-patient-portal-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutletComponent],
  template: `
    <div class="min-h-dvh bg-surface-page flex flex-col">

      <!-- ── Topbar ─────────────────────────────────────────────── -->
      <header class="sticky top-0 z-30 h-14 bg-surface-card border-b border-border flex items-center px-4 sm:px-6 gap-3 flex-shrink-0">
        <div class="flex-1 min-w-0">
          <span class="font-display text-[15px] font-semibold text-ink tracking-[-0.01em]">Patient Portal</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-[12px] text-ink-muted hidden sm:block truncate max-w-[200px]">{{ auth.claims().email }}</span>
          <button type="button" (click)="signOut()" [disabled]="signingOut()"
                  class="h-8 px-3 rounded-md text-[12px] font-medium border border-border text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            {{ signingOut() ? 'Signing out…' : 'Sign out' }}
          </button>
        </div>
      </header>

      <!-- ── Horizontal nav ──────────────────────────────────────── -->
      <nav class="bg-surface-card border-b border-border flex-shrink-0 overflow-x-auto">
        <div class="flex items-center px-4 sm:px-6 min-w-max">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path"
               routerLinkActive="border-primary-600 text-primary-600"
               class="px-4 py-3 text-[13px] font-medium border-b-2 border-transparent text-ink-muted hover:text-ink-soft -mb-px whitespace-nowrap transition-colors">
              {{ item.label }}
            </a>
          }
        </div>
      </nav>

      <!-- ── Content ─────────────────────────────────────────────── -->
      <main class="flex-1 px-4 sm:px-6 py-6 max-w-[1100px] w-full mx-auto">
        <router-outlet />
      </main>

    </div>
    <app-toast-outlet />
  `,
})
export class PatientPortalLayout {
  protected readonly auth = inject(AuthStore);
  private readonly supabase = inject(SupabaseService);
  protected readonly signingOut = signal(false);
  protected readonly navItems = NAV_ITEMS;

  protected async signOut() {
    this.signingOut.set(true);
    await this.supabase.client.auth.signOut();
  }
}
