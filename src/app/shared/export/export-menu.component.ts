import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import type { ExportFormat } from './export.types';

/**
 * Reusable dropdown button: [⬇ Export ▾] → CSV / Excel / PDF.
 *
 * Usage:
 *   <app-export-menu [disabled]="rows.length === 0" (pick)="onExport($event)"/>
 *
 * The host page handles building the `ExportableReport` and calling
 * `ExportService.export(format, report)` — this component is UI only.
 */
@Component({
  selector: 'app-export-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="relative inline-block">
  <button type="button" (click)="toggle()" [disabled]="disabled"
          class="h-9 px-3 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50 inline-flex items-center gap-1.5"
          [attr.aria-expanded]="open()" aria-haspopup="menu">
    ⬇ {{ label }}
    <span class="text-ink-muted">▾</span>
  </button>
  @if (open()) {
    <!-- Backdrop click-out -->
    <button type="button" (click)="close()" aria-label="Close menu"
            class="fixed inset-0 z-40 cursor-default bg-transparent"></button>

    <div role="menu"
         class="absolute right-0 mt-1.5 z-50 min-w-[180px] rounded-md border border-border bg-surface-card shadow-lg py-1">
      <button type="button" role="menuitem" (click)="select('csv')"
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-subtle flex items-center justify-between gap-3">
        <span class="text-ink">CSV</span>
        <span class="text-[11px] text-ink-muted font-mono">.csv</span>
      </button>
      <button type="button" role="menuitem" (click)="select('excel')"
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-subtle flex items-center justify-between gap-3">
        <span class="text-ink">Excel</span>
        <span class="text-[11px] text-ink-muted font-mono">.xlsx</span>
      </button>
      <button type="button" role="menuitem" (click)="select('pdf')"
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-subtle flex items-center justify-between gap-3">
        <span class="text-ink">PDF</span>
        <span class="text-[11px] text-ink-muted font-mono">.pdf</span>
      </button>
    </div>
  }
</div>
  `,
})
export class ExportMenuComponent {
  @Input() label = 'Export';
  @Input() disabled = false;
  @Output() pick = new EventEmitter<ExportFormat>();

  protected readonly open = signal(false);

  protected toggle(): void {
    if (this.disabled) return;
    this.open.update(v => !v);
  }
  protected close(): void { this.open.set(false); }

  protected select(fmt: ExportFormat): void {
    this.close();
    this.pick.emit(fmt);
  }
}
