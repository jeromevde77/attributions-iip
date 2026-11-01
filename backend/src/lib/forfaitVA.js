/**
 * LE FORFAIT D'ANALYSE DES DEMANDES DE VALORISATION (Charles, 28 octobre 2026 :
 * « si demande de VA, prévoir un forfait financier par UE — cela prend bien deux
 * heures de travail d'analyse »).
 *
 * LA RÈGLE, UE PAR UE (Charles, 28 octobre 2026 ; réglages de Configuration → Coût des
 * périodes) — chaque demande VA ou VAE se juge contre les frais d'inscription de SON unité :
 *   - unité à laquelle l'étudiant n'est pas inscrit : `va.forfait_ue` (30 €) ;
 *   - inscrit, frais d'inscription de l'unité inférieurs au forfait : ils sont portés au
 *     forfait — on ajoute la différence ;
 *   - inscrit, frais de l'unité égaux ou supérieurs : `va.supplement_ue` (15 €).
 *   L'admission : `va.forfait_admission` (50 €) d'office, par demande.
 * Dû DÈS LA DEMANDE, quelle que soit la décision : c'est l'examen du dossier qui est payé.
 * Frais d'inscription d'une unité = son droit d'inscription (forfait de la circulaire compris
 * si c'est elle qui le porte) + ses frais administratifs variables (périodes étudiant ×
 * tarif) ; la partie fixe (150 €) ne se rattache à aucune unité. Une unité dispensée par la
 * valorisation se compte à ses périodes d'avant la dispense : le forfait ne bouge pas
 * quand le Conseil décide.
 * Une demande se dispense du forfait, une à une, avec un motif (`va_forfait_exoneration`).
 * FI = droit d'inscription + droit spécifique + frais administratifs, hors forfait.
 */
import db from '../db/index.js';
import { getParam } from '../routes/parametres.js';

export function migrerForfaitVA(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS va_forfait_exoneration (
    valorisation_id INTEGER PRIMARY KEY,
    motif TEXT NOT NULL, par TEXT, le TEXT DEFAULT (datetime('now')))`);
  const ins = dbx.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)');
  ins.run('va.forfait_ue', '30', 'Forfait d’analyse d’une demande de VA ou de VAE, par UE (€)', null, 'couts');
  ins.run('va.supplement_ue', '15', 'Supplément par UE demandée quand les frais d’inscription dépassent le forfait VA (€)', null, 'couts');
  ins.run('va.forfait_admission', '50', 'Forfait d’une demande d’admission (€)', null, 'couts');
  dbx.prepare("UPDATE parametre SET label = ? WHERE cle = 'va.forfait_ue'").run('Frais d’instruction d’une demande de VA ou de VAE, par UE (€)');
  dbx.prepare("UPDATE parametre SET label = ? WHERE cle = 'va.supplement_ue'").run('(ne sert plus depuis 3.5.006 : 30 € par UE)');
  /* LA DATE LIMITE DES DEMANDES, UNE PAR ANNÉE (Charles, 31 octobre 2026 : « 14 novembre pour un
     programme annuel, pour toutes les UE de la section » ; « date réglable par année »). Vide = la
     règle du RDE art. 28 (15e jour de l'année, ou avant le premier cours de l'UE). */
  let annees = [];
  try { annees = dbx.prepare("SELECT DISTINCT annee_scolaire a FROM ue WHERE annee_scolaire >= '2026-2027' ORDER BY 1").all().map(r => r.a); } catch { /* */ }
  if (!annees.includes('2026-2027')) annees.unshift('2026-2027');
  /* LES EXEMPLES DE L'ÉPREUVE D'ADMISSION, PAR SECTION (3.5.006 ; Charles : « je propose, l'école corrige ») :
     une proposition pour les sections dont le dossier pédagogique porte les capacités ; l'école les réécrit. */
  const EX = {
    TIM: "En mathématiques — par exemple : une dose prescrite à 2 mg/kg pour un patient de 72 kg ; combien de mL d'une solution à 20 mg/mL faut-il ? Lire un graphique qui montre la décroissance d'un produit dans le temps et dire au bout de combien d'heures il en reste la moitié.\nEn français — par exemple : résumer en une dizaine de lignes un article de vulgarisation sur l'imagerie médicale, puis donner en une quinzaine de lignes votre avis argumenté sur le sujet.",
    AeSI: "En mathématiques — par exemple : un patient boit 3 verres de 150 mL et une bouteille de 0,5 L ; combien a-t-il bu en litres ? Une perfusion de 1 000 mL coule en 8 heures : combien de mL par heure ? Un prix de 80 € augmente de 15 % : quel est le nouveau prix ? Lire une courbe de température et dire à quelle heure elle a été la plus haute.\nEn français — par exemple : lire un article d'une page sur l'hygiène des mains à l'hôpital, en écrire un résumé fidèle des idées essentielles, puis un court commentaire personnel structuré.",
  };
  const insEx = dbx.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)');
  let secs = [];
  try { secs = dbx.prepare('SELECT code FROM section ORDER BY code').all().map(r => r.code); } catch { /* */ }
  for (const sec of new Set([...secs, ...Object.keys(EX)])) insEx.run(`admission.exemples.${sec}`, EX[sec] || '',
    `Épreuve d'admission ${sec} : exemples de ce qui est attendu (montrés aux candidats)`, null, 'procedures');
  for (const a of annees) ins.run(`va.date_limite.${a}`, a === '2026-2027' ? '2026-11-14' : '',
    `Date limite des demandes de VA et de VAE ${a}, pour toutes les UE du PAE (AAAA-MM-JJ ; vide = RDE art. 28)`, null, 'couts');
}

const nombre = (cle, defaut) => { const n = Number(String(getParam(cle, defaut) ?? defaut).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : defaut; };
const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;

/** Les demandes de l'année (VA, VAE, admission), non archivées, avec leur dispense éventuelle. */
export function demandesVA(etudId, annee) {
  let rows = [];
  try {
    rows = db.prepare(`SELECT v.id, v.ue_num, v.type, v.porte, v.date_demande, v.date_reception, v.cree_le,
        (SELECT MIN(u.ue_nom) FROM ue u WHERE u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire) AS ue_nom,
        x.motif AS exo_motif, x.par AS exo_par, x.le AS exo_le
      FROM etudiant_valorisation v LEFT JOIN va_forfait_exoneration x ON x.valorisation_id = v.id
      WHERE v.etudiant_id = ? AND v.annee_scolaire = ? AND v.archive_le IS NULL
      ORDER BY v.ue_num`).all(Number(etudId), annee);
  } catch { return []; }
  // La porte s'écrit « VAE » à l'écran, « vae » au portail : on compare en majuscules.
  return rows.map(r => ({ ...r, nature: r.type === 'admission' || String(r.porte || '').toUpperCase() === 'AD' || !r.ue_num ? 'admission'
    : (String(r.porte || '').toUpperCase() === 'VAE' ? 'VAE' : 'VA'),
    exoneree: !!r.exo_motif }));
}

/** Le prix d'UNE demande VA ou VAE sur une unité, d'après ses frais d'inscription (`fi`, absent si non inscrit).
 *  Servi aussi AVANT la demande : le portail l'annonce à l'étudiant (3.1.514). */
export function prixDUneUE(fi) {
  /* 30 € PAR UE, QU'ELLE SOIT AU PAE OU NON (Charles, 31 octobre 2026 : « 30 € par UE » —
     les frais d'inscription complémentaires pour l'instruction). Le supplément de 15 € et la
     comparaison aux frais de l'unité (3.1.431) ne valent plus ; `fi` reste lu pour l'affichage. */
  const parUE = nombre('va.forfait_ue', 30);
  const e2 = n => arrondi(n).toFixed(2).replace('.', ',');
  return { du: parUE, ...(fi != null ? { fi: arrondi(fi) } : {}), calcul: `frais d’instruction : ${e2(parUE)} € par UE` };
}

/** Le forfait dû. `fiParUE` : Map ue_num → frais d'inscription de l'unité (unités inscrites seulement). */
export function forfaitVA(etudId, annee, { fiParUE = new Map() } = {}) {
  const d = demandesVA(etudId, annee);
  const parUE = nombre('va.forfait_ue', 30), supp = nombre('va.supplement_ue', 15), adm = nombre('va.forfait_admission', 50);
  const e2 = n => arrondi(n).toFixed(2).replace('.', ',');
  for (const x of d) {
    if (x.exoneree) { x.du = 0; x.calcul = `dispensée : ${x.exo_motif}`; continue; }
    if (x.nature === 'admission') { x.du = adm; x.calcul = `admission : ${e2(adm)} €`; continue; }
    Object.assign(x, prixDUneUE(fiParUE.get(Number(x.ue_num))));
  }
  const actives = d.filter(x => !x.exoneree);
  const du_ue = arrondi(actives.filter(x => x.nature !== 'admission').reduce((t, x) => t + x.du, 0));
  const du_adm = arrondi(actives.filter(x => x.nature === 'admission').reduce((t, x) => t + x.du, 0));
  const n_ue = actives.filter(x => x.nature !== 'admission').length;
  const n_admission = actives.length - n_ue;
  const regle = n_ue ? `${n_ue} UE demandée(s), calculées UE par UE` : null;
  return { demandes: d, par_ue: parUE, supplement_ue: supp, forfait_admission: adm, n_ue, n_admission,
    du_ue, du_admission: du_adm, du: arrondi(du_ue + du_adm), regle };
}

export function exonererForfait(valorisationId, motif, par) {
  const v = db.prepare('SELECT id FROM etudiant_valorisation WHERE id = ?').get(Number(valorisationId));
  if (!v) return { erreur: 'Demande introuvable.' };
  if (motif === null) { db.prepare('DELETE FROM va_forfait_exoneration WHERE valorisation_id = ?').run(v.id); return { ok: true, exoneree: false }; }
  if (String(motif || '').trim().length < 3) return { erreur: 'Une dispense de forfait se motive.' };
  db.prepare(`INSERT INTO va_forfait_exoneration (valorisation_id, motif, par) VALUES (?,?,?)
    ON CONFLICT(valorisation_id) DO UPDATE SET motif = excluded.motif, par = excluded.par, le = datetime('now')`).run(v.id, String(motif).trim(), par);
  return { ok: true, exoneree: true };
}
