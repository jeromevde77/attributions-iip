/* LA LISTE DES DISPONIBILITÉS PAR DÉFAUT D'EMPLOI ET DES PERTES PARTIELLES DE CHARGE (3.5.563, Charles, 18 novembre 2026 : « sors-moi
   automatiquement cette annexe à la circulaire » ; tranché : définitif − attribué, par fonction et par niveau ; les attributions hors
   des fonctions nommées sont un rappel à l'activité ; Éditions → Personnel, fenêtre modifiable, Word et PDF).

   LE CALCUL, pour chaque membre du personnel nommé à titre définitif (`nomination_definitive`, actives) :
   · une ligne par FONCTION (CT, PP…) et NIVEAU (SU, SS, SI — le niveau de la section de l'unité nommée) ;
   · définitif = ses périodes nommées ; attribué = ses attributions de l'année, IIP, hors congé, de même fonction et même niveau ;
   · charge perdue = définitif − attribué (jamais sous zéro) ; rien de perdu : pas de ligne ;
   · D (disponibilité par défaut d'emploi) quand plus rien n'est attribué dans cette fonction et ce niveau ; PPC sinon ;
   · rappel à l'activité = ce qui lui est attribué HORS de ses fonctions et niveaux nommés (et le surplus au-delà du définitif) ;
     il compense les pertes dans l'ordre des lignes, converti dans l'unité de la ligne (CT ÷ 800, PP ÷ 1 000 — l'exemple de la direction) ;
   · périodes définitives payées et non prestées = perdu − rappel imputé, jamais sous zéro.
   La fenêtre d'Éditions montre ce calcul, chaque case se corrige ; la saisie se garde par année (`annexe_ppc`). */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import db from '../db/index.js';
import { cocher } from '../services/ea12_fill_officiel.js';
import { cachetCourant, signatureCourante } from './identite.js';
import { insererImageSous } from '../services/formulairesFWB.js';
import { noircirWord } from './casesNoircies.js';

const MODELE = path.join(import.meta.dirname, '..', 'services', 'circulaire-9760', 'Annexe PPC_Disponibilités et pertes partielles de charge.docx');
const DIV = { CT: 800, CG: 800, PP: 1000 };
const div = f => DIV[f] || 800;
const NIV = { SUP: 'SU', DS: 'SS', DI: 'SI' };
export const RESEAUX = ['Communal', 'Wallonie-Bruxelles Enseignement', 'Libre confessionnel', 'Libre non confessionnel', 'Provincial - COCOF'];

export function migrerAnnexePPC() {
  db.exec(`CREATE TABLE IF NOT EXISTS annexe_ppc (annee_scolaire TEXT PRIMARY KEY, donnees TEXT NOT NULL, par TEXT, maj_le TEXT NOT NULL DEFAULT (datetime('now')))`);
}

/** Le niveau (SU, SS, SI) d'une section, d'après son niveau déclaré. */
function niveauDe(section) {
  const n = String(db.prepare('SELECT niveau FROM section WHERE code = ?').get(section)?.niveau || '').toLowerCase();
  if (/secondaire\s*inf|^di$/.test(n)) return 'SI';
  if (/secondaire|^ds$/.test(n)) return 'SS';
  // Le supérieur s'écrit « DS » (Charles, 18 novembre 2026 : « DS, c'est pour l'admin — étrange, je sais ; on suit la circulaire »).
  return 'DS';
}
const sectionDeUE = ue => db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(ue)?.section || null;
const fr = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

function bornesAnnee(annee) {
  // Les bornes de l'année : le calendrier des cours (première et dernière semaine), sinon 1er septembre – 30 juin.
  let d = null, f = null;
  try { const a = db.prepare('SELECT MIN(date_debut) d, MAX(date_fin) f FROM annee_calendrier WHERE annee_scolaire = ?').get(annee) || {}; d = a.d || null; f = a.f || null; } catch { /* */ }
  const y = Number(String(annee).slice(0, 4));
  return { debut: fr(d) || `01/09/${y}`, fin: fr(f) || `30/06/${y + 1}` };
}

/** Le calcul de l'année : les lignes proposées. */
export function calculerPPC(annee) {
  const { debut, fin } = bornesAnnee(annee);
  const noms = db.prepare(`SELECT n.professeur_id pid, n.ue_num, n.periodes, UPPER(COALESCE(n.type_charge, 'CT')) f, p.nom, p.prenom
    FROM nomination_definitive n JOIN professeur p ON p.id = n.professeur_id WHERE COALESCE(n.actif, 1) = 1 AND n.periodes > 0
      AND UPPER(COALESCE(n.type_charge, 'CT')) IN ('CT', 'PP', 'CG', 'CS', 'CTPP', 'PPM')`).all();   // le personnel non chargé de cours n'est pas concerné
  const parProf = new Map();
  for (const n of noms) {
    if (!parProf.has(n.pid)) parProf.set(n.pid, { nom: `${String(n.nom || '').toUpperCase()} ${n.prenom || ''}`.trim(), def: new Map() });
    const niv = niveauDe(sectionDeUE(n.ue_num));
    const k = `${n.f}|${niv}`;
    parProf.get(n.pid).def.set(k, (parProf.get(n.pid).def.get(k) || 0) + Number(n.periodes || 0));
  }
  const lignes = [];
  for (const [pid, P] of [...parProf].sort((a, b) => a[1].nom.localeCompare(b[1].nom, 'fr'))) {
    const att = new Map();
    for (const a of db.prepare(`SELECT section, UPPER(COALESCE(type_cours, 'CT')) f, COALESCE(periodes_attribuees, 0) + COALESCE(autonomie_attribuee, 0) per
      FROM attribution WHERE professeur_id = ? AND annee_scolaire = ? AND COALESCE(contrat_mdp, 'IIP') <> 'HELB' AND COALESCE(en_conge, 0) = 0`).all(pid, annee)) {
      const k = `${a.f === 'PP' ? 'PP' : 'CT'}|${niveauDe(a.section)}`;
      att.set(k, (att.get(k) || 0) + Number(a.per || 0));
    }
    /* LA RÈGLE DE L'IIP (3.5.566, Charles : « toute la charge nommée ») : une ligne par fonction et niveau nommés ; la charge perdue
       est TOUTE la charge nommée ; le rappel à l'activité est ce qui lui est attribué cette année dans cette fonction et ce niveau ;
       ce qui est attribué hors des fonctions nommées s'ajoute au rappel de la première ligne. D quand rien n'est attribué dans la
       fonction, PPC sinon. Payées et non prestées = nommé − rappel, jamais sous zéro. */
    const hors = [...att].filter(([k, a]) => !P.def.has(k) && a > 0.5);
    [...P.def].forEach(([k, d], i) => {
      const [f, n] = k.split('|'), dv = div(f), a = att.get(k) || 0;
      const rap = [a > 0.5 ? `${Math.round(a)}/${dv} ${n} (${f})` : '', ...(i === 0 ? hors.map(([kk, aa]) => { const [ff, nn] = kk.split('|'); return `${Math.round(aa)}/${div(ff)} ${nn} (${ff})`; }) : [])].filter(Boolean);
      const horsEtp = i === 0 ? hors.reduce((t, [kk, aa]) => t + aa / div(kk.split('|')[0]), 0) : 0;
      const prestees = a + horsEtp * dv;
      lignes.push({ professeur_id: pid, nom: P.nom, fonction: `${f}/${n}`, nature: a > 0.5 ? 'PPC' : 'D', perte: `${Math.round(d)}/${dv} ${n}`,
        date_perte: debut, rappel: rap.length ? rap.join('\n') : '/', date_fin_rappel: rap.length ? fin : '/',
        non_prestees: `${Math.max(0, Math.round(d - prestees))}/${dv}`, remarques: '' });
    });
  }
  return { annee, lignes, debut, fin };
}

/** La saisie gardée (ou le calcul), et le calcul à côté. */
export function lirePPC(annee) {
  migrerAnnexePPC();
  const calc = calculerPPC(annee);
  let saisie = null;
  try { const r = db.prepare('SELECT donnees, par, maj_le FROM annexe_ppc WHERE annee_scolaire = ?').get(annee); if (r) saisie = { ...JSON.parse(r.donnees), par: r.par, maj_le: r.maj_le }; } catch { saisie = null; }
  return { annee, calcul: calc.lignes, saisie, reseaux: RESEAUX };
}
export function ecrirePPC(annee, donnees, par) {
  migrerAnnexePPC();
  const propre = {
    lignes: (Array.isArray(donnees?.lignes) ? donnees.lignes : []).slice(0, 200).map(l => Object.fromEntries(['nom', 'fonction', 'nature', 'perte', 'date_perte', 'rappel', 'date_fin_rappel', 'non_prestees', 'remarques'].map(k => [k, String(l?.[k] ?? '').slice(0, 2000)]))),
    reseau: RESEAUX.includes(donnees?.reseau) ? donnees.reseau : null,
    date: String(donnees?.date || '').slice(0, 20), rectificatif: !!donnees?.rectificatif,
  };
  db.prepare(`INSERT INTO annexe_ppc (annee_scolaire, donnees, par) VALUES (?,?,?) ON CONFLICT(annee_scolaire) DO UPDATE SET donnees = excluded.donnees, par = excluded.par, maj_le = datetime('now')`)
    .run(annee, JSON.stringify(propre), par || null);
  return propre;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Le texte d'une case : les sauts de ligne deviennent des retours à la ligne Word. */
const texteRun = v => String(v ?? '').split('\n').map((l, i) => `${i ? '</w:t><w:br/><w:t xml:space="preserve">' : ''}${esc(l)}`).join('');

/** Le Word rempli : une ligne du modèle par ligne de l'annexe, l'année, le réseau, la date, la signature et le cachet. */
export async function documentPPC(annee, donnees) {
  const zip = await JSZip.loadAsync(fs.readFileSync(MODELE));
  let x = await zip.file('word/document.xml').async('string');
  /* DES RANGÉES QUI S'ALLONGENT (3.5.565, Charles : « la mise en page ne va pas ») : le modèle fixe la hauteur de ses rangées
     (« exact ») ; le titre y perdait sa troisième ligne et le cachet sortait de sa case. Au moins cette hauteur, plus si le contenu
     le demande. */
  x = x.replace(/w:hRule="exact"/g, 'w:hRule="atLeast"');
  x = x.replace('{{ANNEE}}', esc(annee));
  // La note (*) du modèle date de 2015-2016 : elle vaut pour l'année de l'annexe.
  x = x.replace(/2015-2016/g, esc(annee));
  const m = x.match(/<w:tr[ >](?:(?!<w:tr[ >]).)*?\{\{C0\}\}.*?<\/w:tr>/s);
  if (!m) throw new Error('modèle de l’annexe illisible (ligne modèle introuvable)');
  const modele = m[0];
  const lignes = (donnees.lignes || []).length ? donnees.lignes : [{}];
  const rangs = lignes.map(l => {
    const v = [l.nom, l.fonction, l.nature, l.perte, l.date_perte, l.rappel, l.date_fin_rappel, l.non_prestees, l.remarques || '/'];
    return modele.replace(/\{\{C(\d)\}\}/g, (_, i) => texteRun(v[Number(i)] ?? ''));
  }).join('');
  x = x.replace(modele, rangs);
  if (donnees.reseau) {
    const cases = [...x.matchAll(/<w:checkBox>/g)];
    const T = s => [...String(s).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(mm => mm[1]).join('').trim();
    for (let i = 0; i < cases.length; i++) { const apres = T(x.slice(cases[i].index, cases[i].index + 1600)); if (apres.startsWith(donnees.reseau)) { x = cocher(x, i); break; } }
  }
  if (donnees.date) x = x.replace('<w:t>Date :</w:t>', `<w:t xml:space="preserve">Date : ${esc(donnees.date)}</w:t>`);
  x = await insererImageSous(zip, x, /^Signature :/, signatureCourante(), 3.6, 'signature');
  x = await insererImageSous(zip, x, /^Signature :/, cachetCourant(), 2.6, 'cachet');
  zip.file('word/document.xml', noircirWord(x));   // 3.5.678
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
