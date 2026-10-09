/**
 * LA FEUILLE D'UN MODÈLE LIBRE (atelier de Lucie, éditeur de texte) — format,
 * marges, en-tête et pied répétés. Une seule fonction pour l'aperçu de
 * l'éditeur et pour les lettres produites en série dans Éditions.
 */
export const FORMATS_PAGE = {
  A4P: { w: '210mm', h: '297mm', print: 'A4 portrait' },
  A4L: { w: '297mm', h: '210mm', print: 'A4 landscape' },
};
const MARGES = { top: 20, right: 20, bottom: 20, left: 20 };

/** docs : [{ html, headerHtml, footerHtml }] — une page (ou plus) par document. */
export function documentModele(docs, { titre = 'Document', format = 'A4P', margins = null } = {}) {
  const m = { ...MARGES, ...(typeof margins === 'string' ? (() => { try { return JSON.parse(margins); } catch { return {}; } })() : (margins || {})) };
  const f = FORMATS_PAGE[format] || FORMATS_PAGE.A4P;
  const liste = Array.isArray(docs) ? docs : [docs];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const corps = liste.map((d, i) => `<section class="lettre"${i ? ' style="break-before:page;page-break-before:always"' : ''}>
    ${d.headerHtml?.trim() ? `<div class="doc-header">${d.headerHtml}</div>` : ''}
    <div class="doc-body">${d.html || ''}</div>
    ${d.footerHtml?.trim() ? `<div class="doc-footer">${d.footerHtml}</div>` : ''}</section>`).join('\n');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<style>
  @page{size:${f.print};margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
  body{font-family:Arial,sans-serif;margin:0;font-size:10.5pt;color:#1B2B4B}
  img{max-width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table{border-collapse:collapse} p{margin:4px 0}
  .doc-footer{margin-top:18px}
  @media screen{html{background:#e5e5e5}
    .lettre{width:${f.w};min-height:${f.h};box-sizing:border-box;margin:16px auto;background:#fff;
      padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;box-shadow:0 2px 14px rgba(0,0,0,.18)}}
</style></head><body>
${corps}
</body></html>`;
}
