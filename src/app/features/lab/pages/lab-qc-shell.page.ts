import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { LabService } from '../data/lab.service';
import { LabQcPage } from '../../lab-qc/pages/lab-qc.page';

@Component({
  selector: 'app-lab-qc-shell-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LabQcPage],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">🧬 Lab &amp; Radiology</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/lab" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #wb="routerLinkActive"
         [class]="tabCls(wb.isActive, navLocked())"
         [attr.aria-disabled]="navLocked() ? 'true' : null"
         (click)="onLockedNavClick($event)">📋 Workflow</a>
      <a routerLink="/lab/history" routerLinkActive #hi="routerLinkActive"
         [class]="tabCls(hi.isActive, navLocked())"
         [attr.aria-disabled]="navLocked() ? 'true' : null"
         (click)="onLockedNavClick($event)">📚 Reports History</a>
      <a routerLink="/lab/reference" routerLinkActive #ra="routerLinkActive"
         [class]="tabCls(ra.isActive, navLocked())"
         [attr.aria-disabled]="navLocked() ? 'true' : null"
         (click)="onLockedNavClick($event)">↗ Outsource</a>
      <a routerLink="/lab/qc" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive, false)">🔬 QC &amp; Audit</a>
    </nav>
  </div>
  <div class="text-right text-[11px] text-ink-muted">
    @if (gateActive()) {
      <p class="text-danger-fg font-semibold">🔒 Shift QC required</p>
      <p>{{ overdueCodes().length }} analyzer(s) overdue</p>
    } @else if (sessionOpened()) {
      <p class="text-good-fg font-semibold">✓ Shift opened</p>
    }
  </div>
</header>

@if (gateActive()) {
  <article class="mb-4 rounded-[10px] border border-danger-fg/40 bg-danger-bg/30 overflow-hidden"
           role="alertdialog" aria-live="assertive">
    <header class="px-4 py-3 bg-danger-fg/10 border-b border-danger-fg/40">
      <p class="text-[13px] font-semibold text-danger-fg uppercase tracking-[0.06em]">
        🔒 Shift QC required
      </p>
      <p class="text-[12px] text-danger-fg/90 mt-1">
        Workflow and Reports History are locked until you log a passing QC run for every overdue analyzer below.
      </p>
    </header>
    <ul class="divide-y divide-danger-fg/20">
      @for (code of overdueCodes(); track code) {
        <li class="px-4 py-2 text-[12px] flex items-center gap-2">
          <span class="size-2 rounded-full bg-danger-fg animate-pulse shrink-0"></span>
          <span class="font-mono font-semibold">{{ code }}</span>
          <span class="text-danger-fg/80">— last passing QC run is older than 8 hours</span>
        </li>
      }
    </ul>
    <footer class="px-4 py-3 border-t border-danger-fg/40 flex items-center justify-between gap-3 flex-wrap">
      <p class="text-[11.5px] text-ink-soft">
        Use the <strong>QC Runs</strong> tab below to record a passing run for each analyzer, then click the button to unlock.
      </p>
      <button type="button" (click)="tryClearGate()" [disabled]="clearing()"
              class="h-9 px-4 rounded-md text-[12.5px] font-semibold text-white shadow-card disabled:opacity-50"
              style="background:#A4302B;">
        {{ clearing() ? 'Re-checking…' : '✓ I have run QC — unlock shift' }}
      </button>
    </footer>
  </article>
} @else if (justCleared()) {
  <article class="mb-4 rounded-[10px] border border-good-fg/40 bg-good-bg/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
    <p class="text-[12.5px] text-good-fg font-semibold">
      ✓ Shift opened — Workflow and Reports History are now unlocked.
    </p>
    <a routerLink="/lab" class="h-8 px-3 rounded-md text-[12px] font-semibold text-white shadow-card"
       style="background:#0E4F8C;">Continue to Workflow →</a>
  </article>
}

<app-lab-qc-page />
  `,
})
export class LabQcShellPage implements OnInit {
  private auth   = inject(AuthStore);
  private svc    = inject(LabService);
  private toast  = inject(ToastService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly overdueCodes  = signal<string[]>([]);
  protected readonly gateActive    = signal(false);
  protected readonly sessionOpened = signal(false);
  protected readonly justCleared   = signal(false);
  protected readonly clearing      = signal(false);

  protected readonly navLocked = computed(() =>
    this.gateActive() && this.auth.hasRole('lab_tech'));

  async ngOnInit() {
    // Pre-go-live: shift-QC gate is disabled. Workflow / History are never locked
    // by this screen and the lab_tech "shift opening" interstitial is suppressed.
    // Re-enable by restoring the original openOrGetShiftSession flow at go-live.
    this.gateActive.set(false);
    this.sessionOpened.set(false);
    this.overdueCodes.set([]);
  }

  protected async tryClearGate() {
    this.clearing.set(true);
    try {
      await this.svc.clearShiftQc();
      this.gateActive.set(false);
      this.sessionOpened.set(true);
      this.justCleared.set(true);
      this.toast.success('Shift QC cleared', 'Workflow unlocked');
    } catch (e: any) {
      this.toast.error('Still overdue', e?.message ?? 'At least one analyzer still needs a passing QC run.');
    } finally {
      this.clearing.set(false);
    }
  }

  protected onLockedNavClick(ev: MouseEvent) {
    if (this.navLocked()) {
      ev.preventDefault();
      this.toast.warn('Locked', 'Run shift QC first to unlock Workflow and History.');
    }
  }

  protected tabCls(active: boolean, locked: boolean): string {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    if (locked) return `${base} text-ink-faint cursor-not-allowed opacity-60`;
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }
}
