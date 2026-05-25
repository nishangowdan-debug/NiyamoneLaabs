import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { BranchStore } from '../../core/branches/branch.store';
import type { ExportableReport, ExportFormat, ExportResult } from './export.types';

/**
 * Single facade for all report exports. Inject into any page; pass an
 * `ExportableReport`; choose a format. Adapters are dynamically imported so
 * heavy libs (ExcelJS, jsPDF) never enter the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private auth = inject(AuthStore);
  private branch = inject(BranchStore);

  /** Convenience: build the meta block from current auth + branch context. */
  contextMeta(): { branchLabel: string; generatedAt: string; generatedBy: string | undefined } {
    return {
      branchLabel: this.branch.activeBranchName(),
      generatedAt: new Date().toISOString(),
      generatedBy: this.auth.user()?.email ?? undefined,
    };
  }

  async export<T extends object>(format: ExportFormat, report: ExportableReport<T>): Promise<ExportResult> {
    // Auto-fill meta context if the page didn't supply it.
    const enriched: ExportableReport<T> = {
      ...report,
      meta: { ...this.contextMeta(), ...(report.meta ?? {}) },
    };
    try {
      switch (format) {
        case 'csv': {
          const { exportCsv } = await import('./adapters/csv.adapter');
          return exportCsv(enriched);
        }
        case 'excel': {
          const { exportExcel } = await import('./adapters/excel.adapter');
          return await exportExcel(enriched);
        }
        case 'pdf': {
          const { exportPdf } = await import('./adapters/pdf.adapter');
          return await exportPdf(enriched);
        }
      }
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
    }
  }

  csv<T extends object>(report: ExportableReport<T>) { return this.export('csv', report); }
  excel<T extends object>(report: ExportableReport<T>) { return this.export('excel', report); }
  pdf<T extends object>(report: ExportableReport<T>) { return this.export('pdf', report); }
}
