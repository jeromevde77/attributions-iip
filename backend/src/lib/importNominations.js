/* L'IMPORT DES NOMINATIONS À TITRE DÉFINITIF (3.5.567, Charles, 18 novembre 2026 : « prépare-moi un import des nominations pour me
   simplifier la vie » — le Word « MDP-définitifs » de la coordination). Une rangée du tableau = une personne : nom et prénom, puis,
   ligne par ligne dans les cases, chaque fonction ou cours (suffixe CT, PP… = la fonction), ses périodes et son niveau.
   On LIT d'abord (simulation) : la fiche retrouvée (`professeurExistant`), ce qui est déjà encodé, les écarts au total du fichier.
   On n'ÉCRIT que les personnes choisies : une personne sans nomination active reçoit les siennes ; une personne qui en a déjà ne
   change que si l'on demande de les remplacer (les anciennes passent inactives, jamais effacées). */
import JSZip from 'jszip';
import db from '../db/index.js';
import { professeurExistant } from './professeurUnique.js';

const FONCTIONS = ['CTPP', 'PPM', 'CG', 'CS', 'CT', 'PP'];
const texte = s => [...String(s).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&apos;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const paragraphes = cellule => [...cellule.matchAll(/<w:p[ >].*?<\/w:p>/gs)].map(p => texte(p[0])).filter(Boolean);
const nombre = s => { const n = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** « VAN GOETHEM Roland » → nom (les mots en capitales du début), prénom (le reste). */
export function separerNom(s) {
  const mots = String(s).trim().split(/\s+/);
  let i = 0;
  while (i < mots.length - 1 && mots[i] === mots[i].toUpperCase() && /\p{L}/u.test(mots[i])) i++;
  return { nom: mots.slice(0, i || 1).join(' '), prenom: mots.slice(i || 1).join(' ') };
}

export async function lireNominationsDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const x = await zip.file('word/document.xml').async('string');
  const personnes = [];
  for (const tr of x.match(/<w:tr[ >].*?<\/w:tr>/gs) || []) {
    const cases = (tr.match(/<w:tc>.*?<\/w:tc>/gs) || []).map(paragraphes);
    if (cases.length < 3 || !cases[0][0] || /^nom/i.test(cases[0][0])) continue;
    const [noms, cours, pers, tot, nivs] = cases;
    const lignes = (cours || []).map((c, i) => {
      const m = c.match(new RegExp(`\\s+(${FONCTIONS.join('|')})$`));
      return { libelle: m ? c.slice(0, m.index).trim() : c, fonction: m ? m[1] : null, periodes: nombre(pers?.[i]), niveau: nivs?.[i] && nivs[i] !== '/' ? nivs[i] : null };
    });
    personnes.push({ ligne: noms.join(' '), ...separerNom(noms.join(' ')), lignes, total: nombre(tot?.[0]) });
  }
  return personnes;
}

/** La simulation : chaque personne, sa fiche, ce qui existe, ce que l'import ferait. */
export function simulerImport(personnes, remplacer = []) {
  return personnes.map(p => {
    const fiche = professeurExistant(p.nom, p.prenom);
    const existantes = fiche ? db.prepare('SELECT id, cours_libre, cours_code, periodes, type_charge FROM nomination_definitive WHERE professeur_id = ? AND actif = 1').all(fiche.id) : [];
    const somme = p.lignes.reduce((t, l) => t + (l.periodes || 0), 0);
    const avis = [];
    if (p.total != null && Math.abs(somme - p.total) > 0.01) avis.push(`le fichier donne un total de ${p.total}, les lignes font ${somme}`);
    if (p.lignes.some(l => l.periodes == null)) avis.push('une ligne sans périodes');
    if (p.lignes.some(l => !l.fonction)) avis.push('fonction non chargée de cours (hors annexe des pertes de charge)');
    const action = !fiche ? 'absent' : !existantes.length ? 'creer' : remplacer.includes(fiche.id) ? 'remplacer' : 'deja';
    return { ...p, professeur_id: fiche?.id || null, fiche: fiche ? `${fiche.nom} ${fiche.prenom}` : null, existantes, somme, avis, action };
  });
}

export function ecrireImport(sim, par) {
  const desact = db.prepare('UPDATE nomination_definitive SET actif = 0 WHERE professeur_id = ? AND actif = 1');
  const ins = db.prepare(`INSERT INTO nomination_definitive (professeur_id, code_fwb, cours_libre, periodes, type_charge, actif, notes) VALUES (?, 'INCONNU', ?, ?, ?, 1, ?)`);
  const def = db.prepare(`UPDATE professeur SET statut_nomination = 'definitif' WHERE id = ?`);
  const note = `Import du ${new Date().toLocaleDateString('fr-BE')} (${par || 'Lucie'})`;
  let n = 0;
  db.transaction(() => {
    for (const p of sim) {
      if (!['creer', 'remplacer'].includes(p.action)) continue;
      if (p.action === 'remplacer') desact.run(p.professeur_id);
      for (const l of p.lignes) { ins.run(p.professeur_id, l.libelle, l.periodes || 0, l.fonction || 'AUTRE', [note, l.niveau ? `niveau ${l.niveau}` : ''].filter(Boolean).join(' · ')); n++; }
      def.run(p.professeur_id);
    }
  })();
  return n;
}
