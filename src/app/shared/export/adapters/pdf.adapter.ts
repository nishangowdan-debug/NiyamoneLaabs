import type { ExportableReport, ExportColumn, ExportResult } from '../export.types';
import { formatCell, rawValue, safeFilename } from '../format';

/**
 * PDF export. Loads jsPDF + jspdf-autotable on demand (~140KB gzipped total).
 *
 * Layout:
 *   - A4 portrait by default; landscape when >7 columns
 *   - Branded header (title / branch / period / generated-at)
 *   - Section headings rendered as a styled row
 *   - Totals rows in bold with top border
 *   - Page numbers + footer text
 */
export async function exportPdf<T extends object>(report: ExportableReport<T>): Promise<ExportResult> {
  const { jsPDF }: any = await import('jspdf');
  const autoTableMod: any = await import('jspdf-autotable');
  const autoTable: (...args: any[]) => any = autoTableMod.default ?? autoTableMod;

  const orientation: 'portrait' | 'landscape' = report.columns.length > 7 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Branded header block ────────────────────────────────────────────────
  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor('#0F1B2D');
  doc.text('NIYAMONE HMS', margin, y);

  const generatedAt = report.meta?.generatedAt ?? new Date().toISOString();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#65758C');
  const stamp = 'Generated ' + new Date(generatedAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  doc.text(stamp, pageWidth - margin, y, { align: 'right' });
  y += 14;

  if (report.meta?.branchLabel) {
    doc.setTextColor('#65758C');
    doc.setFontSize(10);
    doc.text(report.meta.branchLabel, margin, y);
    y += 12;
  }

  // Separator line
  doc.setDrawColor('#DCE3EE');
  doc.setLineWidth(0.6);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);
  y += 16;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#0F1B2D');
  doc.text(report.title, margin, y);
  y += 14;

  if (report.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#65758C');
    doc.text(report.subtitle, margin, y);
    y += 12;
  }
  if (report.meta?.periodLabel) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#65758C');
    doc.text('Period: ' + report.meta.periodLabel, margin, y);
    y += 12;
  }
  if (report.meta?.filters?.length) {
    const txt = report.meta.filters.map(f => `${f.label}: ${f.value}`).join('  ·  ');
    doc.setFontSize(9);
    doc.setTextColor('#94A3B8');
    doc.text(txt, margin, y);
    y += 10;
  }
  y += 6;

  // ── Build the autotable body ────────────────────────────────────────────
  const head = [report.columns.map(c => c.header)];
  const body: any[] = [];

  const rowToCells = (row: T) =>
    report.columns.map(c => formatCell(rawValue(row, c), c.format));

  const totalsRow = (totals: Partial<Record<string, string | number>>) =>
    report.columns.map(c => {
      const v = totals[c.key];
      return v === undefined ? '' : formatCell(v, c.format);
    });

  if (report.sections?.length) {
    for (const s of report.sections) {
      if (s.heading) {
        body.push([{
          content: s.heading,
          colSpan: report.columns.length,
          styles: { fontStyle: 'bold', fillColor: [230, 240, 250], textColor: [15, 27, 45], halign: 'left' },
        }]);
      }
      for (const r of s.rows) body.push(rowToCells(r));
      if (s.totals) {
        body.push(totalsRow(s.totals).map(v => ({
          content: v,
          styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
        })));
      }
    }
  } else if (report.rows?.length) {
    for (const r of report.rows) body.push(rowToCells(r));
  }

  if (report.grandTotals) {
    body.push(totalsRow(report.grandTotals).map(v => ({
      content: v,
      styles: { fontStyle: 'bold', fillColor: [14, 79, 140], textColor: [255, 255, 255] },
    })));
  }

  const columnStyles: Record<number, any> = {};
  report.columns.forEach((c, i) => {
    columnStyles[i] = {
      halign: c.align ?? defaultAlign(c),
      cellWidth: c.width ? c.width * 5.5 : 'auto', // ~5.5pt per char
    };
  });

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: margin, right: margin, bottom: margin + 30 },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4, textColor: [15, 27, 45], lineColor: [220, 227, 238], lineWidth: 0.3 },
    headStyles: { fillColor: [14, 79, 140], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles,
    didDrawPage: (data: any) => {
      // Footer + page numbers
      const pn = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor('#94A3B8');
      const footY = pageHeight - 18;
      if (report.footer) doc.text(report.footer, margin, footY);
      doc.text(
        `Page ${data.pageNumber} of ${pn}`,
        pageWidth - margin, footY,
        { align: 'right' },
      );
    },
  });

  const blob: Blob = doc.output('blob');
  triggerDownload(blob, safeFilename(report.filename) + '.pdf');
  return { ok: true, bytes: blob.size };
}

function defaultAlign<T extends object>(col: ExportColumn<T>): 'left' | 'right' | 'center' {
  switch (col.format) {
    case 'inr': case 'inr_cents': case 'number': case 'integer': case 'percent': return 'right';
    case 'date': case 'datetime': return 'center';
    default: return 'left';
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
