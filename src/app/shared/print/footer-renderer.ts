// Structural type — both billing/hospital-settings.service and
// pharmacy/hospital-settings.service expose compatible shapes. We avoid
// importing either concrete interface so callers from either feature can
// pass their local HospitalSettings without TS pain.

export interface FooterRendererSealAsset {
  name: string;
  url: string;
  category?: 'iso' | 'nabl' | 'qa' | 'custom';
  valid_until?: string | null;
}

export interface FooterRendererAccreditation {
  label: string;
  number?: string;
}

export interface FooterRendererLayout {
  columns: 1 | 2 | 3;
  alignment: 'left' | 'center';
  show_thankyou: boolean;
  show_generated_at: boolean;
  show_qr: boolean;
  show_signatures: boolean;
}

export const DEFAULT_FOOTER_LAYOUT: FooterRendererLayout = {
  columns: 3,
  alignment: 'center',
  show_thankyou: true,
  show_generated_at: true,
  show_qr: false,
  show_signatures: true,
};

export interface FooterRendererSettings {
  hospital_name?: string;
  updated_at?: string;
  footer_seal_urls?: FooterRendererSealAsset[];
  accreditations?: FooterRendererAccreditation[];
  customer_logo_url?: string | null;
  footer_layout?: FooterRendererLayout;
  receipt_footer_note?: string | null;
  receipt_terms_and_conditions?: string | null;
  invoice_footer_note?: string | null;
  invoice_footer_terms?: string | null;
  payslip_footer_note?: string | null;
  payslip_footer_terms?: string | null;
  report_footer_note?: string | null;
  report_footer_terms?: string | null;
}

// Aliases kept for shorter local naming
type SealAsset = FooterRendererSealAsset;
type FooterLayout = FooterRendererLayout;
type HospitalSettings = FooterRendererSettings;

export type FooterDocumentKind = 'invoice' | 'lab_report' | 'payslip';

export interface FooterSignatureInput {
  staff_id: string;
  full_name: string;
  signature_role?: string | null;
  registration_number?: string | null;
  signature_url?: string | null;
  signature_data_url?: string | null;
}

export interface RenderFooterOpts {
  document: FooterDocumentKind;
  signatures?: FooterSignatureInput[];
  qrUrl?: string | null;
  generatedAtIso?: string;
}

const escape = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const attr = (s: unknown): string => escape(s);

const bustUrl = (url: string | null | undefined, updatedAt?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (!updatedAt) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${encodeURIComponent(updatedAt)}`;
};

const pickNote = (s: HospitalSettings, doc: FooterDocumentKind): string => {
  if (doc === 'invoice') return s.invoice_footer_note || s.receipt_footer_note || '';
  if (doc === 'payslip') return s.payslip_footer_note || s.receipt_footer_note || '';
  return s.report_footer_note || s.receipt_footer_note || '';
};

const pickTerms = (s: HospitalSettings, doc: FooterDocumentKind): string => {
  if (doc === 'invoice') return s.invoice_footer_terms || s.receipt_terms_and_conditions || '';
  if (doc === 'payslip') return s.payslip_footer_terms || s.receipt_terms_and_conditions || '';
  return s.report_footer_terms || s.receipt_terms_and_conditions || '';
};

const defaultTermsFor = (doc: FooterDocumentKind, name: string): string => {
  if (doc === 'invoice') {
    return `This is a computer-generated invoice. Subject to clinical correlation and the conditions of ${escape(name)}.`;
  }
  if (doc === 'payslip') {
    return 'This is a system-generated payslip and does not require a physical signature.';
  }
  return 'Report results are correlated with clinical findings. Not for medico-legal purposes.';
};

const sealImg = (s: SealAsset, updatedAt?: string): string => {
  const validBadge =
    s.valid_until && new Date(s.valid_until) < new Date()
      ? `<span style="font-size:7pt;color:#b91c1c;display:block;">expired</span>`
      : '';
  return `
    <div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
      <img src="${attr(bustUrl(s.url, updatedAt))}" alt="${attr(s.name)}" />
      ${validBadge}
    </div>`;
};

const signatureBlock = (sig: FooterSignatureInput): string => {
  const img = sig.signature_url || sig.signature_data_url || '';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:120px;">
      ${img ? `<img src="${attr(img)}" alt="signature" style="max-height:14mm;max-width:40mm;object-fit:contain;" />` : `<div style="height:14mm;"></div>`}
      <div style="border-top:1px solid #94a3b8;width:100%;text-align:center;padding-top:2px;font-size:9.5px;color:#1f2937;font-weight:600;">
        ${escape(sig.full_name || '')}
      </div>
      ${sig.signature_role ? `<div style="font-size:9px;color:#4b5563;">${escape(sig.signature_role)}</div>` : ''}
      ${sig.registration_number ? `<div style="font-size:8.5px;color:#6b7280;font-family:ui-monospace,Consolas,monospace;">${escape(sig.registration_number)}</div>` : ''}
    </div>`;
};

/**
 * CSS for the shared footer band. Inject once per printed document.
 */
export const FOOTER_CSS = `
  .nl-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #d0d7e2; }
  .nl-footer-signs { display: flex; justify-content: space-around; align-items: flex-end; gap: 12px; padding: 8px 0 10px; }
  .nl-footer-band { display: grid; gap: 8px; align-items: center; }
  .nl-footer-band.cols-1 { grid-template-columns: 1fr; text-align: center; }
  .nl-footer-band.cols-2 { grid-template-columns: 1fr 1fr; }
  .nl-footer-band.cols-3 { grid-template-columns: 1fr auto 1fr; }
  .nl-footer-band.align-center { text-align: center; }
  .nl-footer-msg { font-size: 10px; color: #4b5563; }
  .nl-footer-msg strong { color: #0d5a96; }
  .nl-footer-seals { display: flex; gap: 10px; justify-content: center; align-items: center; flex-wrap: wrap; }
  .nl-footer-seals img { max-height: 16mm; max-width: 22mm; object-fit: contain; }
  .nl-footer-customer-logo { max-height: 14mm; max-width: 40mm; object-fit: contain; }
  .nl-footer-accrs { font-size: 9.5px; color: #4b5563; line-height: 1.45; }
  .nl-footer-accrs strong { color: #0d5a96; }
  .nl-footer-terms { padding: 6px 8px; margin-top: 6px; border-top: 1px dashed #d0d7e2; text-align: center; font-size: 9px; color: #6b7280; font-style: italic; line-height: 1.5; }
  .nl-footer-gen { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 4px; }
  .nl-footer-qr { display:inline-block; }
  .nl-footer-qr img, .nl-footer-qr svg { width: 18mm; height: 18mm; }
  @media print {
    .nl-footer, .nl-footer-band, .nl-footer-terms, .nl-footer-signs { page-break-inside: avoid; }
    .nl-footer * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/**
 * Render the branded footer block for invoices, lab reports and payslips.
 * Returns HTML to be injected at the bottom of the document body.
 *
 * Layout (3-col): [thank-you/msg] [seals + optional customer logo] [accreditations]
 * Followed by an optional signatures strip, terms band and generated-at line.
 */
export function renderFooterHTML(
  settings: HospitalSettings | null | undefined,
  opts: RenderFooterOpts,
): string {
  if (!settings) return '';

  const layout: FooterLayout = settings.footer_layout ?? DEFAULT_FOOTER_LAYOUT;
  const updatedAt = settings.updated_at;
  const hospitalName = settings.hospital_name || 'Sree Diagnostics';

  const seals = (settings.footer_seal_urls ?? []).filter((s) => !!s?.url);
  const accreditations = (settings.accreditations ?? []).filter((a) => !!a?.label);
  const customerLogo = settings.customer_logo_url;

  const note = pickNote(settings, opts.document);
  const terms = pickTerms(settings, opts.document) || defaultTermsFor(opts.document, hospitalName);

  // ── Signatures strip ───────────────────────────────────────────────
  const signaturesHTML =
    layout.show_signatures && (opts.signatures?.length ?? 0)
      ? `<div class="nl-footer-signs">${opts.signatures!.map(signatureBlock).join('')}</div>`
      : '';

  // ── Center column: seals + optional customer logo ─────────────────
  const centerHTML = `
    <div class="nl-footer-seals">
      ${customerLogo ? `<img class="nl-footer-customer-logo" src="${attr(bustUrl(customerLogo, updatedAt))}" alt="${attr(hospitalName)} co-branding" />` : ''}
      ${seals.length ? seals.map((s) => sealImg(s, updatedAt)).join('') : ''}
      ${layout.show_qr && opts.qrUrl ? `<div class="nl-footer-qr"><img src="${attr(opts.qrUrl)}" alt="QR" /></div>` : ''}
    </div>`;

  // ── Left column: thank-you / note ─────────────────────────────────
  const leftHTML = `
    <div class="nl-footer-msg">
      ${layout.show_thankyou ? `<div>Thank you for choosing <strong>${escape(hospitalName)}</strong>.</div>` : ''}
      ${note ? `<div style="margin-top:3px;">${escape(note)}</div>` : ''}
    </div>`;

  // ── Right column: accreditations ──────────────────────────────────
  const rightHTML = `
    <div class="nl-footer-accrs" style="text-align:${layout.alignment === 'left' ? 'left' : 'right'};">
      ${accreditations.length
        ? accreditations
            .map(
              (a) =>
                `<div><strong>${escape(a.label)}</strong>${a.number ? `<br>${escape(a.number)}` : ''}</div>`,
            )
            .join('')
        : ''}
    </div>`;

  // ── Compose grid based on column count ────────────────────────────
  let bandInner = '';
  if (layout.columns === 1) {
    bandInner = `${centerHTML}${leftHTML}${rightHTML}`;
  } else if (layout.columns === 2) {
    bandInner = `${leftHTML}${rightHTML}`;
  } else {
    bandInner = `${leftHTML}${centerHTML}${rightHTML}`;
  }

  const bandClasses = `nl-footer-band cols-${layout.columns}${layout.alignment === 'center' ? ' align-center' : ''}`;

  const generatedAt = opts.generatedAtIso
    ? new Date(opts.generatedAtIso).toLocaleString('en-IN')
    : new Date().toLocaleString('en-IN');

  return `
    <div class="nl-footer">
      ${signaturesHTML}
      <div class="${bandClasses}">${bandInner}</div>
      ${terms ? `<div class="nl-footer-terms">${escape(terms)}</div>` : ''}
      ${layout.show_generated_at ? `<div class="nl-footer-gen">Generated ${escape(generatedAt)}</div>` : ''}
    </div>`;
}
