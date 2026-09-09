// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES MOTS D'UN PDF, AVEC LEUR PLACE
//
// Extraire « le texte » d'un PDF ne suffit pas quand le PDF est un tableau :
// les colonnes se perdent et deux cellules voisines se retrouvent collées.
// Ce qu'il faut, c'est chaque mot AVEC SON ABSCISSE — c'est la géométrie qui
// dit à quelle colonne il appartient, pas l'espacement.
//
// pdfjs rend les positions dans un repère dont l'origine est en bas à gauche :
// on remet l'ordonnée à l'endroit pour que « plus haut » veuille dire « plus
// petit », comme on lit.
// ─────────────────────────────────────────────────────────────────────────────

export async function motsDuPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Un emploi du temps n'a ni police exotique ni formulaire : on coupe tout
    // ce qui ferait chercher des ressources au démarrage.
    useSystemFonts: true, isEvalSupported: false, disableFontFace: true,
  }).promise;

  const mots = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vue = page.getViewport({ scale: 1 });
    const contenu = await page.getTextContent();
    for (const it of contenu.items) {
      const t = String(it.str || '').trim();
      if (!t) continue;
      // transform = [a, b, c, d, e, f] : e et f portent la position.
      const x = it.transform[4];
      const y = vue.height - it.transform[5];
      // Un item pdfjs peut porter plusieurs mots séparés par des espaces : on
      // les répartit au prorata de la largeur, ce qui suffit très largement
      // pour décider d'une colonne.
      const parts = t.split(/\s+/).filter(Boolean);
      if (parts.length === 1) { mots.push({ x, y, page: p, text: t }); continue; }
      const largeur = it.width || 0;
      let pris = 0;
      const total = parts.reduce((n, w) => n + w.length, 0) || 1;
      for (const w of parts) {
        mots.push({ x: x + (largeur * pris) / total, y, page: p, text: w });
        pris += w.length + 1;
      }
    }
    page.cleanup();
  }
  try { await doc.cleanup(); } catch { /* rien à libérer */ }
  return mots;
}
