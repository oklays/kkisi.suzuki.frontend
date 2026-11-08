/**
 * Zero-dependency KKISI Financial Document Standard PDF 1.4 layout engine.
 * Renders vector mastheads, KPI summary strips, two-column key-value grids, provenance callouts,
 * and multi-page financial tables with repeating headers and `Halaman X dari Y` footers.
 */

export type PdfBadgeTone = 'info' | 'warning' | 'neutral';

export type PdfKpiItem = {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
};

export type PdfKvItem = {
  label: string;
  value: string;
  mono?: boolean;
};

export type PdfTableColumn = {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
};

export type PdfSection =
  | { kind: 'kpi-strip'; items: readonly PdfKpiItem[] }
  | { kind: 'kv-grid'; title?: string; items: readonly PdfKvItem[] }
  | { kind: 'callout'; tone: PdfBadgeTone; title: string; lines: readonly string[] }
  | {
      kind: 'table';
      title?: string;
      subtitle?: string;
      columns: readonly PdfTableColumn[];
      rows: readonly (readonly string[])[];
      footerRow?: readonly string[];
    };

export type KosipaPdfDocumentSpec = {
  orientation?: 'portrait' | 'landscape';
  title: string;
  subtitle?: string;
  docMeta: readonly { label: string; value: string }[];
  badge?: { label: string; tone: PdfBadgeTone };
  sections: readonly PdfSection[];
  footerNote?: string;
};

type Rgb = readonly [number, number, number];
type FontId = 'F1' | 'F2' | 'F3' | 'F4'; // F1=Helvetica, F2=Helvetica-Bold, F3=Courier, F4=Courier-Bold

export const KOSIPA_PDF_COLORS = {
  suzukiBlue: [0, 0.2, 0.6] as Rgb,
  suzukiBlueSoft: [0.91, 0.941, 1] as Rgb,
  suzukiBlueBorder: [0.863, 0.902, 0.98] as Rgb,
  suzukiRed: [0.886, 0.039, 0.09] as Rgb,
  ink: [0.063, 0.094, 0.157] as Rgb,
  body: [0.243, 0.275, 0.322] as Rgb,
  muted: [0.451, 0.482, 0.529] as Rgb,
  zebra: [0.969, 0.973, 0.98] as Rgb,
  divider: [0.933, 0.941, 0.953] as Rgb,
  border: [0.851, 0.867, 0.89] as Rgb,
  white: [1, 1, 1] as Rgb,
  warningFill: [1, 0.969, 0.902] as Rgb,
  warningBorder: [0.957, 0.847, 0.663] as Rgb,
  warningText: [0.522, 0.271, 0.035] as Rgb,
} as const;

const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const fmtRgb = (c: Rgb): string => `${fmtNum(c[0])} ${fmtNum(c[1])} ${fmtNum(c[2])}`;

/** Normalises Unicode punctuation to WinAnsi-safe ASCII and escapes PDF string literals. */
function sanitizePdfText(input: string): string {
  return String(input ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, '\xB7')
    .replace(/\u03A3/g, 'Total')
    .replace(/\u2260/g, '!=')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function pdfLiteral(text: string): string {
  const s = sanitizePdfText(text);
  let out = '(';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + s[i];
    else if (code > 0x7e) out += '\\' + code.toString(8).padStart(3, '0');
    else out += s[i];
  }
  return out + ')';
}

function charWidthRatio(ch: string, font: FontId): number {
  if (font === 'F3' || font === 'F4') return 0.6;
  const bold = font === 'F2';
  if ('ilI.,:;!|'.includes(ch)) return bold ? 0.3 : 0.26;
  if ('ftrj()[]/\\-'.includes(ch)) return bold ? 0.36 : 0.32;
  if ('mwMW@%&'.includes(ch)) return bold ? 0.88 : 0.82;
  if (ch >= 'A' && ch <= 'Z') return bold ? 0.68 : 0.64;
  if (ch >= '0' && ch <= '9') return 0.56;
  if (ch === ' ') return 0.28;
  return bold ? 0.56 : 0.52;
}

export function measurePdfText(text: string, font: FontId, size: number): number {
  const s = sanitizePdfText(text);
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidthRatio(s[i], font) * size;
  return w;
}

export function fitPdfText(text: string, font: FontId, size: number, maxWidth: number): string {
  const s = sanitizePdfText(text);
  if (measurePdfText(s, font, size) <= maxWidth) return s;
  const ell = '...';
  const ellW = measurePdfText(ell, font, size);
  if (maxWidth <= ellW) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (measurePdfText(out + s[i], font, size) + ellW > maxWidth) break;
    out += s[i];
  }
  return out.trimEnd() + ell;
}

export function wrapPdfText(text: string, font: FontId, size: number, maxWidth: number): string[] {
  const words = sanitizePdfText(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || measurePdfText(next, font, size) <= maxWidth) {
      cur = next;
    } else {
      lines.push(cur);
      cur = measurePdfText(word, font, size) <= maxWidth ? word : fitPdfText(word, font, size, maxWidth);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

class PageCanvas {
  readonly ops: string[] = [];

  rectFill(x: number, y: number, w: number, h: number, fill: Rgb): void {
    this.ops.push(`${fmtRgb(fill)} rg ${fmtNum(x)} ${fmtNum(y)} ${fmtNum(w)} ${fmtNum(h)} re f`);
  }

  rectStroke(x: number, y: number, w: number, h: number, stroke: Rgb, lineWidth = 0.75): void {
    this.ops.push(`${fmtNum(lineWidth)} w ${fmtRgb(stroke)} RG ${fmtNum(x)} ${fmtNum(y)} ${fmtNum(w)} ${fmtNum(h)} re S`);
  }

  rectFillStroke(x: number, y: number, w: number, h: number, fill: Rgb, stroke: Rgb, lineWidth = 0.75): void {
    this.ops.push(`${fmtNum(lineWidth)} w ${fmtRgb(fill)} rg ${fmtRgb(stroke)} RG ${fmtNum(x)} ${fmtNum(y)} ${fmtNum(w)} ${fmtNum(h)} re B`);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb, lineWidth = 0.75): void {
    this.ops.push(`${fmtNum(lineWidth)} w ${fmtRgb(stroke)} RG ${fmtNum(x1)} ${fmtNum(y1)} m ${fmtNum(x2)} ${fmtNum(y2)} l S`);
  }

  text(str: string, x: number, y: number, font: FontId, size: number, color: Rgb, align: 'left' | 'right' | 'center' = 'left'): void {
    const clean = sanitizePdfText(str);
    if (!clean) return;
    let drawX = x;
    if (align !== 'left') {
      const w = measurePdfText(clean, font, size);
      drawX = align === 'right' ? x - w : x - w / 2;
    }
    this.ops.push(`${fmtRgb(color)} rg BT /${font} ${fmtNum(size)} Tf ${fmtNum(drawX)} ${fmtNum(y)} Td ${pdfLiteral(clean)} Tj ET`);
  }
}

export function renderKosipaPdfDocument(spec: KosipaPdfDocumentSpec): Uint8Array {
  const isLandscape = spec.orientation === 'landscape';
  const pageW = isLandscape ? 841.89 : 595.28;
  const pageH = isLandscape ? 595.28 : 841.89;
  const margin = 36;
  const contentW = pageW - margin * 2;
  const bottomLimit = 54;

  const pages: PageCanvas[] = [];
  let page = new PageCanvas();
  pages.push(page);
  let y = pageH - margin;

  const drawMasthead = (p: PageCanvas, continuation: boolean): number => {
    const top = pageH - margin;
    // Left brand bar (Suzuki Blue + Suzuki Red rule)
    p.rectFill(margin, top - 34, 4, 34, KOSIPA_PDF_COLORS.suzukiBlue);
    p.rectFill(margin + 6, top - 34, 2, 34, KOSIPA_PDF_COLORS.suzukiRed);

    p.text('KOPERASI KARYAWAN PT SUZUKI INDOMOBIL', margin + 14, top - 11, 'F2', 11, KOSIPA_PDF_COLORS.suzukiBlue);
    p.text('UNIT USAHA SIMPAN PINJAM (KOSIPA) · TAMBUN II', margin + 14, top - 23, 'F1', 8, KOSIPA_PDF_COLORS.muted);

    // Right metadata block
    let metaY = top - 10;
    for (const m of spec.docMeta.slice(0, 4)) {
      const lineText = `${m.label}: ${m.value}`;
      p.text(fitPdfText(lineText, 'F3', 8, 220), pageW - margin, metaY, 'F3', 8, KOSIPA_PDF_COLORS.body, 'right');
      metaY -= 11;
    }

    const titleY = top - 52;
    const titleStr = continuation ? `${spec.title} (Lanjutan)` : spec.title;
    p.text(fitPdfText(titleStr, 'F2', 13, contentW - 140), margin, titleY, 'F2', 13, KOSIPA_PDF_COLORS.ink);

    if (spec.badge) {
      const badgeLabel = sanitizePdfText(spec.badge.label);
      const bw = Math.min(180, measurePdfText(badgeLabel, 'F2', 7.5) + 16);
      const bx = pageW - margin - bw;
      const by = titleY - 4;
      const fill = spec.badge.tone === 'warning' ? KOSIPA_PDF_COLORS.warningFill : spec.badge.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlueSoft : KOSIPA_PDF_COLORS.zebra;
      const border = spec.badge.tone === 'warning' ? KOSIPA_PDF_COLORS.warningBorder : spec.badge.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlueBorder : KOSIPA_PDF_COLORS.border;
      const fg = spec.badge.tone === 'warning' ? KOSIPA_PDF_COLORS.warningText : spec.badge.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlue : KOSIPA_PDF_COLORS.body;
      p.rectFillStroke(bx, by, bw, 16, fill, border, 0.75);
      p.text(fitPdfText(badgeLabel, 'F2', 7.5, bw - 8), bx + bw / 2, by + 5, 'F2', 7.5, fg, 'center');
    }

    let nextY = titleY - 12;
    if (spec.subtitle && !continuation) {
      p.text(fitPdfText(spec.subtitle, 'F1', 8.5, contentW), margin, nextY, 'F1', 8.5, KOSIPA_PDF_COLORS.body);
      nextY -= 10;
    }

    p.line(margin, nextY, pageW - margin, nextY, KOSIPA_PDF_COLORS.suzukiBlue, 1.2);
    p.line(margin, nextY - 2.5, margin + 84, nextY - 2.5, KOSIPA_PDF_COLORS.suzukiRed, 1.8);
    return nextY - 14;
  };

  const ensureSpace = (neededHeight: number): void => {
    if (y - neededHeight < bottomLimit) {
      page = new PageCanvas();
      pages.push(page);
      y = drawMasthead(page, true);
    }
  };

  y = drawMasthead(page, false);

  for (const section of spec.sections) {
    if (section.kind === 'kpi-strip') {
      const count = Math.max(1, Math.min(4, section.items.length));
      const gap = 8;
      const cardW = (contentW - gap * (count - 1)) / count;
      const cardH = 48;
      ensureSpace(cardH + 10);
      const topY = y;
      const boxY = topY - cardH;
      section.items.slice(0, count).forEach((item, idx) => {
        const cx = margin + idx * (cardW + gap);
        const fill = item.highlight ? KOSIPA_PDF_COLORS.suzukiBlueSoft : KOSIPA_PDF_COLORS.zebra;
        const border = item.highlight ? KOSIPA_PDF_COLORS.suzukiBlueBorder : KOSIPA_PDF_COLORS.border;
        page.rectFillStroke(cx, boxY, cardW, cardH, fill, border, 0.75);
        page.text(fitPdfText(item.label.toUpperCase(), 'F2', 7, cardW - 16), cx + 8, topY - 12, 'F2', 7, KOSIPA_PDF_COLORS.muted);
        page.text(fitPdfText(item.value, 'F2', 11, cardW - 16), cx + 8, topY - 27, 'F2', 11, item.highlight ? KOSIPA_PDF_COLORS.suzukiBlue : KOSIPA_PDF_COLORS.ink);
        if (item.subtext) {
          page.text(fitPdfText(item.subtext, 'F1', 7.5, cardW - 16), cx + 8, topY - 40, 'F1', 7.5, KOSIPA_PDF_COLORS.body);
        }
      });
      y = boxY - 12;
    } else if (section.kind === 'kv-grid') {
      const pairs = section.items;
      const rowsCount = Math.ceil(pairs.length / 2);
      const rowH = 16;
      const titleH = section.title ? 18 : 0;
      const boxH = rowsCount * rowH + 10;
      ensureSpace(titleH + boxH + 10);
      if (section.title) {
        page.text(fitPdfText(section.title, 'F2', 9.5, contentW), margin, y - 10, 'F2', 9.5, KOSIPA_PDF_COLORS.suzukiBlue);
        y -= 16;
      }
      const boxY = y - boxH;
      page.rectFillStroke(margin, boxY, contentW, boxH, KOSIPA_PDF_COLORS.white, KOSIPA_PDF_COLORS.border, 0.75);
      const colW = (contentW - 24) / 2;
      for (let r = 0; r < rowsCount; r++) {
        const ry = y - 13 - r * rowH;
        for (let c = 0; c < 2; c++) {
          const item = pairs[r * 2 + c];
          if (!item) continue;
          const cx = margin + 10 + c * (colW + 8);
          const labelW = Math.min(105, colW * 0.44);
          page.text(fitPdfText(item.label, 'F1', 8, labelW), cx, ry, 'F1', 8, KOSIPA_PDF_COLORS.muted);
          page.text(fitPdfText(`: ${item.value}`, item.mono ? 'F3' : 'F2', 8.2, colW - labelW - 4), cx + labelW, ry, item.mono ? 'F3' : 'F2', 8.2, KOSIPA_PDF_COLORS.ink);
        }
      }
      y = boxY - 12;
    } else if (section.kind === 'callout') {
      const wrapped: string[] = [];
      for (const line of section.lines) {
        wrapped.push(...wrapPdfText(line, 'F1', 8, contentW - 24));
      }
      const boxH = 20 + wrapped.length * 11;
      ensureSpace(boxH + 10);
      const boxY = y - boxH;
      const fill = section.tone === 'warning' ? KOSIPA_PDF_COLORS.warningFill : section.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlueSoft : KOSIPA_PDF_COLORS.zebra;
      const border = section.tone === 'warning' ? KOSIPA_PDF_COLORS.warningBorder : section.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlueBorder : KOSIPA_PDF_COLORS.border;
      const fg = section.tone === 'warning' ? KOSIPA_PDF_COLORS.warningText : section.tone === 'info' ? KOSIPA_PDF_COLORS.suzukiBlue : KOSIPA_PDF_COLORS.ink;
      page.rectFillStroke(margin, boxY, contentW, boxH, fill, border, 0.75);
      page.rectFill(margin, boxY, 3.5, boxH, fg);
      page.text(fitPdfText(section.title, 'F2', 8.5, contentW - 24), margin + 10, y - 12, 'F2', 8.5, fg);
      wrapped.forEach((ln, i) => {
        page.text(ln, margin + 10, y - 24 - i * 11, 'F1', 8, KOSIPA_PDF_COLORS.body);
      });
      y = boxY - 12;
    } else if (section.kind === 'table') {
      const totalSpecW = section.columns.reduce((acc, c) => acc + c.width, 0) || 1;
      const colWidths = section.columns.map((c) => (c.width / totalSpecW) * contentW);
      const headerH = 20;
      const rowH = 16;

      const drawTableHeader = (continuation: boolean) => {
        if (section.title) {
          const ttl = continuation ? `${section.title} (Lanjutan)` : section.title;
          page.text(fitPdfText(ttl, 'F2', 9.5, contentW), margin, y - 10, 'F2', 9.5, KOSIPA_PDF_COLORS.suzukiBlue);
          y -= 14;
        }
        if (section.subtitle && !continuation) {
          page.text(fitPdfText(section.subtitle, 'F1', 8, contentW), margin, y - 8, 'F1', 8, KOSIPA_PDF_COLORS.muted);
          y -= 12;
        }
        const hy = y - headerH;
        page.rectFill(margin, hy, contentW, headerH, KOSIPA_PDF_COLORS.suzukiBlue);
        let cx = margin;
        section.columns.forEach((col, i) => {
          const w = colWidths[i];
          const align = col.align ?? 'left';
          const tx = align === 'right' ? cx + w - 6 : align === 'center' ? cx + w / 2 : cx + 6;
          page.text(fitPdfText(col.header, 'F2', 8, w - 12), tx, hy + 6, 'F2', 8, KOSIPA_PDF_COLORS.white, align);
          cx += w;
        });
        y = hy;
      };

      ensureSpace((section.title ? 28 : 0) + headerH + rowH + 10);
      drawTableHeader(false);

      section.rows.forEach((row, rIdx) => {
        if (y - rowH < bottomLimit) {
          page = new PageCanvas();
          pages.push(page);
          y = drawMasthead(page, true);
          drawTableHeader(true);
        }
        const ry = y - rowH;
        if (rIdx % 2 === 1) {
          page.rectFill(margin, ry, contentW, rowH, KOSIPA_PDF_COLORS.zebra);
        }
        page.line(margin, ry, margin + contentW, ry, KOSIPA_PDF_COLORS.divider, 0.5);
        let cx = margin;
        section.columns.forEach((col, cIdx) => {
          const w = colWidths[cIdx];
          const align = col.align ?? 'left';
          const font: FontId = col.mono ? 'F3' : 'F1';
          const tx = align === 'right' ? cx + w - 6 : align === 'center' ? cx + w / 2 : cx + 6;
          const cellVal = row[cIdx] ?? '';
          page.text(fitPdfText(cellVal, font, 8, w - 12), tx, ry + 4.5, font, 8, KOSIPA_PDF_COLORS.ink, align);
          cx += w;
        });
        y = ry;
      });

      if (section.footerRow) {
        if (y - (rowH + 2) < bottomLimit) {
          page = new PageCanvas();
          pages.push(page);
          y = drawMasthead(page, true);
          drawTableHeader(true);
        }
        const fy = y - (rowH + 2);
        page.rectFillStroke(margin, fy, contentW, rowH + 2, KOSIPA_PDF_COLORS.suzukiBlueSoft, KOSIPA_PDF_COLORS.suzukiBlueBorder, 0.75);
        let cx = margin;
        section.columns.forEach((col, cIdx) => {
          const w = colWidths[cIdx];
          const align = col.align ?? 'left';
          const tx = align === 'right' ? cx + w - 6 : align === 'center' ? cx + w / 2 : cx + 6;
          const cellVal = section.footerRow?.[cIdx] ?? '';
          page.text(fitPdfText(cellVal, 'F2', 8.2, w - 12), tx, fy + 5, 'F2', 8.2, KOSIPA_PDF_COLORS.suzukiBlue, align);
          cx += w;
        });
        y = fy;
      }
      y -= 12;
    }
  }

  // Draw footers on every page with total page count
  const totalPages = pages.length;
  const footerNote = spec.footerNote ?? 'Dokumen resmi baca-saja KOSIPA KKISI TB2. Nilai sesuai rekaman sistem.';
  pages.forEach((p, idx) => {
    p.line(margin, 38, pageW - margin, 38, KOSIPA_PDF_COLORS.border, 0.75);
    p.text(fitPdfText(footerNote, 'F1', 7.5, contentW - 110), margin, 26, 'F1', 7.5, KOSIPA_PDF_COLORS.muted);
    p.text(`Halaman ${idx + 1} dari ${totalPages}`, pageW - margin, 26, 'F2', 7.5, KOSIPA_PDF_COLORS.body, 'right');
  });

  // Assemble PDF 1.4 object table
  // Object 1: Catalog, Object 2: Pages, Objects 3..6: Standard Fonts F1..F4
  const pageObjIds = pages.map((_, i) => 7 + i * 2);
  const objs: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj',
  ];

  pages.forEach((p, i) => {
    const pageId = 7 + i * 2;
    const contentId = pageId + 1;
    const stream = p.ops.join('\n');
    const len = Buffer.byteLength(stream, 'latin1');
    objs.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmtNum(pageW)} ${fmtNum(pageH)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`,
      `${contentId} 0 obj\n<< /Length ${len} >>\nstream\n${stream}\nendstream\nendobj`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += o + '\n';
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
