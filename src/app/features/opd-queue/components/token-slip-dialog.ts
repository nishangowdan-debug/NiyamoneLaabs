import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { format, parseISO } from 'date-fns';
import type { TokenSlipData } from '../../appointments/data/appointments.types';

@Component({
  selector: 'app-token-slip-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* Print: only the slip element prints; everything else hidden */
    @media print {
      @page { size: 80mm auto; margin: 4mm; }
      body * { visibility: hidden !important; }
      .token-slip, .token-slip * { visibility: visible !important; }
      .token-slip {
        position: absolute !important;
        left: 0; top: 0; width: 80mm !important;
        box-shadow: none !important; border: none !important;
        padding: 4mm !important; background: white !important;
      }
      .print-hide { display: none !important; }
    }
  `],
  template: `
    <div class="fixed inset-0 z-[80] grid place-items-center bg-black/40 backdrop-blur-sm print-hide" (document:keydown.escape)="close.emit()">
      <div class="relative" (click)="$event.stopPropagation()">

        <!-- ── Slip card (also the printable element) ──────────────── -->
        <div class="token-slip bg-white rounded-[10px] shadow-[0_24px_64px_-16px_rgba(15,27,45,0.40)] w-[340px] p-5 font-mono text-ink"
             style="border: 1px dashed #C0C7D2;">

          <!-- Header / brand strip -->
          <div class="flex items-center justify-between border-b border-dashed border-ink/20 pb-2 mb-3">
            <div class="flex items-center gap-1.5">
              <div class="w-[20px] h-[20px] rounded-md bg-primary-600 text-white grid place-items-center text-[12px] font-display italic">n</div>
              <span class="font-display text-[13px] font-medium tracking-tight">niyamone <span class="italic text-ink-muted font-normal">hms</span></span>
            </div>
            <span class="text-[9px] uppercase tracking-[0.10em] text-ink-muted">{{ data.branch_code || '' }}</span>
          </div>

          <!-- Hospital line -->
          <p class="text-[11px] text-center text-ink-soft mb-3">{{ data.branch_name || 'Hospital' }}</p>

          <!-- Token block -->
          <div class="text-center py-3 border-y-2 border-ink/80 mb-3">
            <p class="text-[10px] uppercase tracking-[0.12em] text-ink-muted">Your token</p>
            <p class="font-display text-[44px] font-medium leading-none mt-1 tracking-tight">
              {{ data.token_number !== null ? '#' + data.token_number : '#–' }}
            </p>
          </div>

          <!-- Details -->
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px]">
            <dt class="text-ink-muted">Doctor</dt>
            <dd class="text-right font-semibold text-ink">{{ data.doctor_name || '—' }}</dd>

            <dt class="text-ink-muted">Queue position</dt>
            <dd class="text-right font-semibold text-ink">#{{ data.queue_position }}</dd>

            <dt class="text-ink-muted">Estimated wait</dt>
            <dd class="text-right font-semibold text-ink">~{{ data.estimated_wait_min }} min</dd>

            <dt class="text-ink-muted">Checked in</dt>
            <dd class="text-right text-ink">{{ checkedInAt() }}</dd>

            <dt class="text-ink-muted">Wristband</dt>
            <dd class="text-right text-ink truncate">{{ data.wristband_uid || '—' }}</dd>
          </dl>

          <!-- Barcode placeholder (visual SVG) -->
          @if (data.wristband_uid) {
            <div class="mt-3 pt-3 border-t border-dashed border-ink/20 text-center">
              <svg viewBox="0 0 200 28" class="mx-auto" style="width: 80%;">
                @for (b of barcodeBars(); track $index) {
                  <rect [attr.x]="b.x" y="0" [attr.width]="b.w" height="22" fill="#0F1B2D"/>
                }
              </svg>
              <p class="text-[9px] tracking-[0.15em] mt-0.5 text-ink-muted">{{ data.wristband_uid }}</p>
            </div>
          }

          <p class="text-[9px] text-center text-ink-muted mt-3 leading-relaxed">
            Please proceed to the triage station with this slip.<br/>
            We'll call your token when the doctor is ready.
          </p>
        </div>

        <!-- ── Action bar (does NOT print) ──────────────────────────── -->
        <div class="print-hide flex items-center gap-2 mt-3 justify-end">
          <button type="button" (click)="close.emit()"
                  class="h-9 px-3 rounded-md border border-border bg-surface-card text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
            Close
          </button>
          <button type="button" (click)="onPrint()"
                  class="h-9 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
            🖨 Print slip
          </button>
        </div>

      </div>
    </div>
  `,
})
export class TokenSlipDialog {
  @Input({ required: true }) data!: TokenSlipData;
  @Output() close = new EventEmitter<void>();

  protected checkedInAt(): string {
    try { return format(parseISO(this.data.checked_in_at), 'd MMM HH:mm'); }
    catch { return ''; }
  }

  /** Deterministic pseudo-barcode bars from the wristband UID hash. Visual only. */
  protected barcodeBars(): { x: number; w: number }[] {
    const uid = this.data.wristband_uid ?? '';
    let seed = 0;
    for (let i = 0; i < uid.length; i++) seed = (seed * 31 + uid.charCodeAt(i)) >>> 0;
    const bars: { x: number; w: number }[] = [];
    let x = 4;
    for (let i = 0; i < 32 && x < 196; i++) {
      const w = 1 + (seed % 4);
      const gap = 1 + ((seed >>> 3) % 3);
      bars.push({ x, w });
      x += w + gap;
      seed = (seed * 1103515245 + 12345) >>> 0;
    }
    return bars;
  }

  protected onPrint(): void {
    setTimeout(() => window.print(), 60);
  }
}
