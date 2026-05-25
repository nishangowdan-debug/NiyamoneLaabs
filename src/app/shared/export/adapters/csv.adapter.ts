import type { ExportableReport, ExportResult } from '../export.types';
import { formatCell, rawValue, safeFilename } from '../format';

/**
 * CSV (RFC 4180-ish) export. UTF-8 BOM so Excel detects encoding correctly.
 * Sections are flattened with a heading row; grand totals appended at the end.
 * No external dependency.
 */
export function exportCsv<T extends object>(report: ExportableReport<T>): ExportResult {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const headerLine = report.columns.map(c => esc(c.header)).join(',');
  const lines: string[] = [];

  // Meta block (commented-style, makes the CSV self-describing without breaking it for Excel)
  if (report.title) lines.push(esc(report.title));
  if (report.subtitle) lines.push(esc(report.subtitle));
  if (report.meta?.branchLabel) lines.push(esc('Branch: ' + report.meta.branchLabel));
  if (report.meta?.periodLabel) lines.push(esc('Period: ' + report.meta.periodLabel));
  if (report.meta?.generatedAt || report.meta?.generatedBy) {
    const at = report.meta?.generatedAt ?? new Date().toISOString();
    const by = report.meta?.generatedBy ? ' by ' + report.meta.generatedBy : '';
    lines.push(esc('Generated: ' + at + by));
  }
  if (lines.length > 0) lines.push(''); // blank line before table

  lines.push(headerLine);

  const renderRows = (rows: T[]) => {
    for (const r of rows) {
      const cells = report.columns.map(c => esc(formatCell(rawValue(r, c), c.format)));
      lines.push(cells.join(','));
    }
  };

  const renderTotals = (totals: Partial<Record<string, string | number>>) => {
    const cells = report.columns.map(c => {
      const t = totals[c.key];
      return t === undefined ? '' : esc(formatCell(t, c.format));
    });
    lines.push(cells.join(','));
  };

  if (report.sections?.length) {
    for (const s of report.sections) {
      if (s.heading) lines.push(esc(s.heading));
      renderRows(s.rows);
      if (s.totals) renderTotals(s.totals);
      lines.push('');
    }
  } else if (report.rows?.length) {
    renderRows(report.rows);
  }

  if (report.grandTotals) renderTotals(report.grandTotals);

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, safeFilename(report.filename) + '.csv');
  return { ok: true, bytes: blob.size };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
