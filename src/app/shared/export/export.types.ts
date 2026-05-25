/**
 * Universal export contract. A page builds one of these objects, hands it to
 * `ExportService.csv/.excel/.pdf`, and gets a download. No format-specific
 * code lives in feature pages.
 */

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export type ColumnAlign = 'left' | 'right' | 'center';

export type ColumnFormat =
  | 'text'
  | 'number'         // plain number
  | 'integer'        // 0 decimals
  | 'inr'            // Indian Rupee with lakh/crore grouping
  | 'inr_cents'      // value is in cents; divide by 100, format INR
  | 'percent'        // 0–1 → "12.3%" / 0–100 stays as %
  | 'date'           // YYYY-MM-DD
  | 'datetime';      // ISO timestamp → "11 May 2026, 14:32"

export interface ExportColumn<T = Record<string, any>> {
  /** Property name on the row (dot-paths NOT supported — flatten upstream). */
  key: keyof T & string;
  header: string;
  /** Approximate character width — used by Excel/PDF for column sizing. */
  width?: number;
  align?: ColumnAlign;
  format?: ColumnFormat;
  /** Optional cell-level transform, runs before format. Use for derived values. */
  transform?: (row: T) => string | number | null | undefined;
}

export interface ExportSection<T = Record<string, any>> {
  /** Section heading, rendered in Excel/PDF; omitted in CSV (rows still flattened). */
  heading?: string;
  rows: T[];
  /** Optional totals row appended at the bottom of the section. */
  totals?: Partial<Record<keyof T & string, string | number>>;
}

/**
 * A complete report. Pages build this and pass it to ExportService.
 */
export interface ExportableReport<T = Record<string, any>> {
  filename: string;             // 'P&L_HQ_2026-05-11' — no extension
  title: string;                // 'Profit & Loss'
  subtitle?: string;            // 'HQ · MTD · 2026-05-01 → 2026-05-11'
  /** Header row above the table — appears in Excel/PDF. */
  meta?: ExportMeta;
  columns: ExportColumn<T>[];
  /** Either a flat rows[] OR sections[] for grouped reports (P&L, Trial Balance). */
  rows?: T[];
  sections?: ExportSection<T>[];
  /** Grand-total row (after all sections). */
  grandTotals?: Partial<Record<keyof T & string, string | number>>;
  /** Footer text for PDFs — disclaimers, generated-by, signatures line. */
  footer?: string;
}

export interface ExportMeta {
  branchLabel?: string;       // 'Sree Diagnostics — Delhi NCR'
  periodLabel?: string;       // '2026-05-01 → 2026-05-11'
  generatedAt?: string;       // ISO timestamp; defaults to now
  generatedBy?: string;       // user display (email/name)
  filters?: Array<{ label: string; value: string }>;
}

/** Result of an export call. */
export interface ExportResult {
  ok: boolean;
  bytes?: number;
  error?: string;
}
