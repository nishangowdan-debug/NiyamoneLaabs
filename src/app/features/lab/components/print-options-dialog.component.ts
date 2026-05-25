import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  LabReportPrintMode,
  LabReportTemplate,
} from '../../pharmacy/services/hospital-settings.service';
import type { PrintOptions } from '../data/lab-print.types';

@Component({
  selector: 'app-print-options-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
<div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
     (document:keydown.escape)="cancel.emit()">
  <div class="bg-surface-card rounded-[12px] shadow-card w-full max-w-[480px]">
    <header class="px-5 py-4 border-b border-border flex items-center justify-between">
      <h2 class="text-lg font-bold text-ink">Print Lab Report</h2>
      <button type="button" class="text-ink-muted hover:text-ink text-xl leading-none"
              (click)="cancel.emit()">×</button>
    </header>

    <div class="p-5 space-y-4 text-[14px]">
      <div class="border border-border rounded-md p-3 space-y-2">
        <label class="flex items-center gap-2">
          <input type="checkbox" [(ngModel)]="includeHeader" />
          <span class="font-medium">Include header (logo, address, seals)</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" [(ngModel)]="includeFooter" />
          <span class="font-medium">Include footer (signatures, seals, page numbers)</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" [(ngModel)]="includeInstructions" />
          <span>Include patient health instructions (extra page)</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" [(ngModel)]="includeInfographics" />
          <span>Include test infographics (e.g. RBS chart)</span>
        </label>
      </div>

      @if (!includeHeader() || !includeFooter()) {
        <div class="border border-warn-strong/40 bg-warn-bg/40 rounded-md p-3 space-y-2">
          <p class="text-xs text-warn-fg font-semibold uppercase tracking-wide">
            Pre-printed letterhead margins
          </p>
          @if (!includeHeader()) {
            <label class="flex items-center justify-between gap-2 text-sm">
              <span>Top whitespace (mm)</span>
              <input type="number" min="0" max="80" class="w-20 border border-border rounded px-2 py-1 bg-surface text-right"
                     [(ngModel)]="letterheadTopMm" />
            </label>
          }
          @if (!includeFooter()) {
            <label class="flex items-center justify-between gap-2 text-sm">
              <span>Bottom whitespace (mm)</span>
              <input type="number" min="0" max="80" class="w-20 border border-border rounded px-2 py-1 bg-surface text-right"
                     [(ngModel)]="letterheadBottomMm" />
            </label>
          }
        </div>
      }

      <label class="flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" [(ngModel)]="saveAsDefault" />
        <span>Save as default for this branch</span>
      </label>
    </div>

    <footer class="px-5 py-3 border-t border-border flex justify-end gap-2">
      <button type="button" class="px-3 py-1.5 rounded-md text-ink-muted hover:bg-surface-subtle"
              (click)="cancel.emit()">Cancel</button>
      <button type="button" class="px-3 py-1.5 rounded-md border border-border text-ink hover:bg-surface-subtle"
              (click)="emit(false)">Preview</button>
      <button type="button" class="px-4 py-1.5 rounded-md bg-good-fg text-white font-semibold hover:bg-good-strong"
              (click)="emit(true)">Print</button>
    </footer>
  </div>
</div>
  `,
})
export class PrintOptionsDialogComponent implements OnInit {
  @Input() initialMode: LabReportPrintMode | null = null;
  @Input() initialTemplate: LabReportTemplate = 'standard';

  @Output() submit = new EventEmitter<{
    options: PrintOptions;
    template: LabReportTemplate;
    saveAsDefault: boolean;
  }>();
  @Output() cancel = new EventEmitter<void>();

  // Sree is the only template; the dropdown was removed for the demo.
  readonly template: LabReportTemplate = 'sree';
  includeHeader = signal(true);
  includeFooter = signal(true);
  includeInstructions = true;
  includeInfographics = true;
  letterheadTopMm = 38;
  letterheadBottomMm = 30;
  saveAsDefault = false;

  ngOnInit(): void {
    const m = this.initialMode;
    if (m) {
      this.includeHeader.set(m.headerMode === 'with-header');
      this.includeFooter.set(m.footerMode === 'with-footer');
      this.includeInstructions = m.includeInstructions ?? true;
      this.includeInfographics = m.includeInfographics ?? true;
      this.letterheadTopMm = m.letterheadTopMm ?? 38;
      this.letterheadBottomMm = m.letterheadBottomMm ?? 30;
    }
  }

  emit(autoPrint: boolean): void {
    const options: PrintOptions = {
      headerMode: this.includeHeader() ? 'with-header' : 'no-header',
      footerMode: this.includeFooter() ? 'with-footer' : 'no-footer',
      includeInstructions: this.includeInstructions,
      includeInfographics: this.includeInfographics,
      letterheadTopMm: this.letterheadTopMm,
      letterheadBottomMm: this.letterheadBottomMm,
      autoPrint,
    };
    this.submit.emit({ options, template: this.template, saveAsDefault: this.saveAsDefault });
  }
}
