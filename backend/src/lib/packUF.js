// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LIRE LE RAPPORT eCampus « PACK UF » (Word)
//
// Le rapport arrive en .docx : un publipostage, une section Word par pack.
// Le NOM du pack (« Pack UF : Bachelier 1 en Psychomotricité ») et les codes
// des unités vivent dans l'EN-TÊTE de page de chaque section ; le corps ne
// porte qu'une suite de tableaux d'une ligne — matricule, nom, croix. Un
// lecteur qui ne regarderait que le corps verrait 364 étudiants sans savoir
// de quel pack ils sont.
//
// On lit donc la structure Word telle qu'elle est : chaque <w:sectPr> ferme
// une section et désigne son en-tête ; les tableaux qui le précèdent lui
// appartiennent.
// ─────────────────────────────────────────────────────────────────────────────

import JSZip from 'jszip';

const decode = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const texte = xml => decode((String(xml).match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
  .map(t => t.replace(/<[^>]+>/g, '')).join(''));
const cellules = xml => (String(xml).match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(c => texte(c).trim());

/** @returns {Promise<{ packs: { libelle, unites: string[], etudiants: { matricule, nom, unites: string[] }[] }[] }>} */
export async function lirePackUF(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw Object.assign(new Error('Ce fichier n’est pas un document Word (.docx).'), { status: 400 });
  const rels = (await zip.file('word/_rels/document.xml.rels')?.async('string')) || '';
  const cible = Object.fromEntries([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)]
    .map(m => [m[1], m[2]]));

  const packs = [];
  const morceaux = doc.split(/(<w:sectPr[\s\S]*?<\/w:sectPr>)/);
  let tables = [];
  for (const m of morceaux) {
    if (!m.startsWith('<w:sectPr')) {
      tables.push(...(m.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []));
      continue;
    }
    const ref = /<w:headerReference w:type="default" r:id="(rId\d+)"/.exec(m)?.[1];
    const fichier = ref && cible[ref] ? `word/${cible[ref]}` : null;
    const entete = fichier ? await zip.file(fichier)?.async('string') : null;
    if (entete && tables.length) {
      // Le titre : le texte de l'en-tête HORS tableau (« Pack UF : … »).
      const horsTableau = entete.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
      const titre = (horsTableau.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
        .map(texte).join(' ').replace(/\s+/g, ' ').trim();
      const libelle = titre.replace(/^Pack\s*UF\s*:\s*/i, '').trim() || titre;
      // Les colonnes : la ligne d'en-tête du tableau de l'en-tête de page.
      const colonnes = cellules((entete.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [''])[0]);
      const unites = colonnes.slice(2).filter(c => c && !/^«.*»$/.test(c));
      const etudiants = [];
      for (const t of tables) {
        const c = cellules(t);
        const matricule = (c[0] || '').trim();
        if (!/\d/.test(matricule)) continue;
        etudiants.push({
          matricule, nom: (c[1] || '').trim(),
          unites: c.slice(2).map((v, i) => (/^x$/i.test(v) ? unites[i] : null)).filter(Boolean),
        });
      }
      if (etudiants.length) packs.push({ libelle, unites, etudiants });
    }
    tables = [];
  }
  if (!packs.length) {
    throw Object.assign(new Error('Aucun pack reconnu : ce document n’a pas la forme du '
      + 'rapport eCampus « Pack UF » (un en-tête « Pack UF : … » par groupe d’étudiants).'), { status: 400 });
  }
  return { packs };
}
