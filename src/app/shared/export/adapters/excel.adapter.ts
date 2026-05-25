import type { ExportableReport, ExportColumn, ExportResult } from '../export.types';
import { rawValue, safeFilename } from '../format';

/**
 * Excel (.xlsx) export. Loads ExcelJS only on demand so the main bundle stays lean.
 *
 * Features:
 *   - Branded header (title, branch, period, generated-at)
 *   - Freeze panes on header row
 *   - Currency cells formatted with `#,##,##0.00` (Indian grouping) for true Excel numbers
 *   - Section headings + totals rows
 *   - Column widths driven by ExportColumn.width
 */
export async function exportExcel<T extends object>(report: ExportableReport<T>): Promise<ExportResult> {
  // Dynamic import — ExcelJS is ~280KB gzipped, never loaded until a user clicks Export Excel.
  const ExcelJSModule: any = await import('exceljs');
  const ExcelJS: any = ExcelJSModule.default ?? ExcelJSModule;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sree Diagnostics';
  wb.created = new Date();

  const ws = wb.addWorksheet(report.title.slice(0, 30), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const colCount = report.columns.length;

  // ── Branded header block (rows 1–4ish, merged across all columns) ───────
  let cursor = 1;
  ws.mergeCells(cursor, 1, cursor, colCount);
  const titleCell = ws.getCell(cursor, 1);
  titleCell.value = report.title;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF0F1B2D' } };
  titleCell.alignment = { vertical: 'middle' };
  ws.getRow(cursor).height = 22;
  cursor++;

  if (report.subtitle) {
    ws.mergeCells(cursor, 1, cursor, colCount);
    const c = ws.getCell(cursor, 1);
    c.value = report.subtitle;
    c.font = { size: 10, color: { argb: 'FF65758C' } };
    cursor++;
  }
  if (report.meta?.branchLabel) {
    ws.mergeCells(cursor, 1, cursor, colCount);
    const c = ws.getCell(cursor, 1);
    c.value = 'Branch: ' + report.meta.branchLabel;
    c.font = { size: 10, color: { argb: 'FF65758C' } };
    cursor++;
  }
  if (report.meta?.periodLabel) {
    ws.mergeCells(cursor, 1, cursor, colCount);
    const c = ws.getCell(cursor, 1);
    c.value = 'Period: ' + report.meta.periodLabel;
    c.font = { size: 10, color: { argb: 'FF65758C' } };
    cursor++;
  }
  {
    const at = report.meta?.generatedAt ?? new Date().toISOString();
    const by = report.meta?.generatedBy ? ' by ' + report.meta.generatedBy : '';
    ws.mergeCells(cursor, 1, cursor, colCount);
    const c = ws.getCell(cursor, 1);
    c.value = 'Generated: ' + at + by;
    c.font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
    cursor++;
  }
  cursor++; // blank spacer row

  // ── Column headers ─────────────────────────────────────────────────────
  const headerRowIdx = cursor;
  const headerRow = ws.getRow(headerRowIdx);
  report.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E4F8C' } };
    cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF0E4F8C' } } };
  });
  headerRow.height = 18;
  cursor++;

  // Column widths
  report.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 18;
  });

  const writeRow = (row: T, opts: { bold?: boolean; topBorder?: boolean } = {}) => {
    const r = ws.getRow(cursor);
    report.columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.value = coerceExcelValue(rawValue(row, col), col);
      cell.numFmt = excelNumFmt(col);
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? defaultAlign(col) };
      if (opts.bold) cell.font = { bold: true };
      if (opts.topBorder) cell.border = { top: { style: 'thin', color: { argb: 'FFD0D7E2' } } };
    });
    cursor++;
  };

  const writeTotals = (totals: Partial<Record<string, string | number>>) => {
    const r = ws.getRow(cursor);
    report.columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      const v = totals[col.key];
      cell.value = v !== undefined ? coerceExcelValue(v, col) : '';
      cell.numFmt = excelNumFmt(col);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FF0E4F8C' } } };
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? defaultAlign(col) };
    });
    cursor++;
  };

  if (report.sections?.length) {
    for (const s of report.sections) {
      if (s.heading) {
        ws.mergeCells(cursor, 1, cursor, colCount);
        const c = ws.getCell(cursor, 1);
        c.value = s.heading;
        c.font = { bold: true, size: 11, color: { argb: 'FF0F1B2D' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F0FA' } };
        c.alignment = { vertical: 'middle' };
        ws.getRow(cursor).height = 16;
        cursor++;
      }
      for (const row of s.rows) writeRow(row);
      if (s.totals) writeTotals(s.totals);
      cursor++; // blank spacer
    }
  } else if (report.rows?.length) {
    for (const row of report.rows) writeRow(row);
  }

  if (report.grandTotals) writeTotals(report.grandTotals);

  // Freeze panes on header row
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, safeFilename(report.filename) + '.xlsx');
  return { ok: true, bytes: blob.size };
}

function defaultAlign<T extends object>(col: ExportColumn<T>): 'left' | 'right' | 'center' {
  switch (col.format) {
    case 'inr': case 'inr_cents': case 'number': case 'integer': case 'percent': return 'right';
    case 'date': case 'datetime': return 'center';
    default: return 'left';
  }
}

function excelNumFmt<T extends object>(col: ExportColumn<T>): string {
  // Indian-grouped number format: 12,34,567.89
  switch (col.format) {
    case 'inr':       return '"₹"#,##,##0.00;[Red]"-₹"#,##,##0.00';
    case 'inr_cents': return '"₹"#,##,##0.00;[Red]"-₹"#,##,##0.00';
    case 'number':    return '#,##,##0.00';
    case 'integer':   return '#,##,##0';
    case 'percent':   return '0.0%';
    case 'date':      return 'yyyy-mm-dd';
    case 'datetime':  return 'dd-mmm-yyyy hh:mm';
    default:          return '@';
  }
}

function coerceExcelValue<T extends object>(value: unknown, col: ExportColumn<T>): string | number | Date | null {
  if (value === null || value === undefined || value === '') return null;
  switch (col.format) {
    case 'inr':
    case 'number':
    case 'integer':
      return Number(value);
    case 'inr_cents':
      return Number(value) / 100;
    case 'percent': {
      const n = Number(value);
      return n > 0 && n <= 1 ? n : n / 100;   // Excel expects 0–1 for the % format
    }
    case 'date':
    case 'datetime': {
      const d = new Date(value as string);
      return isNaN(d.getTime()) ? String(value) : d;
    }
    default:
      return String(value);
  }
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
