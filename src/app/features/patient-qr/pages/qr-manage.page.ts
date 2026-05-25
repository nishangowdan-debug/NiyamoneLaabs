import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-qr-manage-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          Patient QR Service
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Generate QR posters for patient self-service requests.</p>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-6">
      <!-- QR Poster Preview -->
      <div class="col-span-12 md:col-span-5">
        <article class="bg-surface-card border border-border rounded-[10px] p-6 text-center">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-4">QR Poster Preview</p>

          <!-- QR poster mockup -->
          <div class="mx-auto w-[280px] border-2 border-border rounded-xl p-6 bg-white">
            <div class="flex items-center justify-center gap-2 mb-4">
              <div class="w-7 h-7 rounded-md bg-primary-600 grid place-items-center text-white font-display italic text-sm">n</div>
              <span class="font-display text-[15px] font-medium">Sree Diagnostics</span>
            </div>

            <!-- QR Code placeholder -->
            <div class="mx-auto w-[180px] h-[180px] bg-surface-muted border border-border rounded-lg grid place-items-center mb-4">
              <div class="text-center">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-ink-muted mx-auto">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
                  <rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/>
                </svg>
                <p class="text-[10px] text-ink-muted mt-1">QR Code</p>
              </div>
            </div>

            <p class="text-[13px] font-medium text-ink mb-1">Need Something?</p>
            <p class="text-[11px] text-ink-muted leading-relaxed">
              Scan this QR code with your phone camera to request housekeeping, maintenance, food, or any service.
            </p>
            <div class="mt-3 pt-3 border-t border-border">
              <p class="text-[10px] text-ink-muted">No app download required</p>
            </div>
          </div>

          <div class="flex gap-2 mt-5 justify-center">
            <button type="button" (click)="printPoster()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
              Print Poster (A4)
            </button>
            <button type="button"
                    class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
              Download PNG
            </button>
          </div>
        </article>
      </div>

      <!-- Settings & Analytics -->
      <div class="col-span-12 md:col-span-7 space-y-5">
        <article class="bg-surface-card border border-border rounded-[10px] p-5">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-3">Configuration</p>
          <div class="space-y-3">
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Service URL</label>
              <div class="flex gap-2">
                <input readonly [value]="serviceUrl" class="flex-1 h-9 px-3 text-[12px] font-mono bg-surface-muted border border-border rounded-md text-ink-soft" />
                <button type="button" (click)="copyUrl()" class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Copy</button>
              </div>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Poster heading</label>
              <input [(ngModel)]="posterHeading" class="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>
          </div>
        </article>

        <article class="bg-surface-card border border-border rounded-[10px] p-5">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-3">Analytics</p>
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-surface-muted rounded-lg p-3 text-center">
              <p class="font-display text-[22px] font-medium text-ink">{{ scansToday() }}</p>
              <p class="text-[10px] text-ink-muted uppercase mt-1">Scans today</p>
            </div>
            <div class="bg-surface-muted rounded-lg p-3 text-center">
              <p class="font-display text-[22px] font-medium text-ink">{{ ticketsViaQr() }}</p>
              <p class="text-[10px] text-ink-muted uppercase mt-1">Tickets via QR</p>
            </div>
            <div class="bg-surface-muted rounded-lg p-3 text-center">
              <p class="font-display text-[22px] font-medium text-ink">{{ avgResponse() }}m</p>
              <p class="text-[10px] text-ink-muted uppercase mt-1">Avg response</p>
            </div>
          </div>
        </article>

        <article class="bg-surface-card border border-border rounded-[10px] p-5">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">How it works</p>
          <ol class="space-y-2 text-[12px] text-ink-soft list-decimal list-inside">
            <li>Print and place QR posters in patient rooms, common areas, and corridors</li>
            <li>Patients scan the QR code with their phone camera (no app needed)</li>
            <li>They fill a simple form: room number, category, and description</li>
            <li>A ticket is automatically created in the Concierge module</li>
            <li>Staff are notified and the ticket follows standard SLA tracking</li>
          </ol>
        </article>
      </div>
    </div>
  `,
})
export class QrManagePage {
  protected readonly serviceUrl = `${window.location.origin}/patient-qr/request`;
  protected posterHeading = 'Need Something?';
  protected readonly scansToday = signal(0);
  protected readonly ticketsViaQr = signal(0);
  protected readonly avgResponse = signal(0);

  protected printPoster() {
    window.print();
  }

  protected copyUrl() {
    navigator.clipboard.writeText(this.serviceUrl);
  }
}
