import { Injectable } from '@angular/core';

/**
 * High-fidelity PDF download from any HTML node.
 *
 * Renders the node with html2canvas-pro (handles modern CSS color spaces
 * like oklch that vanilla html2canvas chokes on), then paginates the
 * resulting bitmap into an A4 jsPDF document and triggers a download.
 *
 * Use this when the user wants a real .pdf file (WhatsApp / email),
 * not just a print dialog. The browser-print iframe path stays the
 * primary "Print" experience because it produces sharper, vector text;
 * this path trades a little crispness for a guaranteed .pdf download
 * without requiring a server.
 */
@Injectable({ providedIn: 'root' })
export class PdfDownloadService {
  /**
   * Render the given node to a downloadable A4 PDF.
   *
   * @param node       Source DOM node — usually the same HTML used for print.
   *                   Must already be in the document (off-screen is fine).
   * @param filename   Output filename (without extension).
   * @param opts       Optional tuning.
   */
  async downloadFromNode(
    node: HTMLElement,
    filename: string,
    opts: { scale?: number; orientation?: 'portrait' | 'landscape'; marginMm?: number } = {},
  ): Promise<void> {
    const { default: html2canvas } = await import('html2canvas-pro');
    const { default: jsPDF } = await import('jspdf');

    const scale = opts.scale ?? 2;
    const orientation = opts.orientation ?? 'portrait';
    const marginMm = opts.marginMm ?? 0;

    // Capture the DOM as a bitmap. backgroundColor:#fff prevents the
    // transparent body from rendering with whatever's behind the iframe.
    const canvas = await html2canvas(node, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const usableWidthMm = pageWidthMm - marginMm * 2;
    const usableHeightMm = pageHeightMm - marginMm * 2;

    // Convert canvas px → mm at the chosen scale.
    const pxPerMm = canvas.width / usableWidthMm;
    const pageHeightPx = usableHeightMm * pxPerMm;

    let renderedHeightPx = 0;
    let pageIdx = 0;

    while (renderedHeightPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedHeightPx);

      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0, renderedHeightPx, canvas.width, sliceHeightPx,
        0, 0, canvas.width, sliceHeightPx,
      );

      const dataUrl = slice.toDataURL('image/jpeg', 0.92);
      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(
        dataUrl,
        'JPEG',
        marginMm,
        marginMm,
        usableWidthMm,
        sliceHeightPx / pxPerMm,
        undefined,
        'FAST',
      );

      renderedHeightPx += sliceHeightPx;
      pageIdx += 1;
    }

    pdf.save(`${filename}.pdf`);
  }

  /**
   * Render an arbitrary HTML string to a PDF and download it. Mirrors the
   * iframe-print flow but pipes the rendered DOM through html2canvas + jsPDF
   * so the user gets a real .pdf file.
   */
  async downloadFromHtml(
    html: string,
    filename: string,
    opts: { scale?: number; orientation?: 'portrait' | 'landscape'; marginMm?: number } = {},
  ): Promise<void> {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:1px;border:0;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for layout + image loads. We poll readyState then give images a beat.
      await new Promise<void>((resolve) => {
        if (doc.readyState === 'complete') resolve();
        else iframe.addEventListener('load', () => resolve(), { once: true });
      });
      await this.waitForImages(doc);

      const target = doc.body;
      // html2canvas measures the *iframe* document — pass the body as the node.
      await this.downloadFromNode(target, filename, opts);
    } finally {
      setTimeout(() => {
        try { iframe.remove(); } catch {}
      }, 500);
    }
  }

  private async waitForImages(doc: Document): Promise<void> {
    const imgs = Array.from(doc.images || []);
    if (imgs.length === 0) return;
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalHeight !== 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  }
}
