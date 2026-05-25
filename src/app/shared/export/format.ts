import type { ColumnFormat, ExportColumn } from './export.types';

/**
 * Convert a raw cell to its formatted string representation.
 * Returns '' for null/undefined unless the column is `inr_cents`/`number`/etc.
 * where 0 is a legitimate value.
 */
export function formatCell(value: unknown, fmt: ColumnFormat | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  switch (fmt) {
    case 'inr':
      return formatINR(Number(value));
    case 'inr_cents':
      return formatINR(Number(value) / 100);
    case 'number':
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value));
    case 'integer':
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value));
    case 'percent': {
      const n = Number(value);
      // 0–1 → percentage; ≥1 assume already %.
      const pct = n > 0 && n <= 1 ? n * 100 : n;
      return pct.toFixed(1) + '%';
    }
    case 'date':
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    default:
      return String(value);
  }
}

/** Indian Rupee formatter with lakh/crore grouping. */
export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return String(v ?? '');
  return d.toISOString().slice(0, 10);
}

function formatDateTime(v: unknown): string {
  const d = toDate(v);
  if (!d) return String(v ?? '');
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Resolve a row's value for an export column, applying any transform.
 * Returns raw (un-formatted) value — adapters decide how to format.
 */
export function rawValue<T extends object>(row: T, col: ExportColumn<T>): unknown {
  if (col.transform) return col.transform(row);
  return (row as any)[col.key];
}

/** Safe filename — strip slashes, colons, etc., to keep OS happy. */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 120);
}
