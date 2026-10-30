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

/** Le forfait dû. `fiParUE` : Map ue_num → frais d'inscription de l'unité (unités inscrites seulement). */
export function forfaitVA(etudId, annee, { fiParUE = new Map() } = {}) {
  const d = demandesVA(etudId, annee);
  const parUE = nombre('va.forfait_ue', 30), supp = nombre('va.supplement_ue', 15), adm = nombre('va.forfait_admission', 50);
  const e2 = n => arrondi(n).toFixed(2).replace('.', ',');
  for (const x of d) {
    if (x.exoneree) { x.du = 0; x.calcul = `dispensée : ${x.exo_motif}`; continue; }
    if (x.nature === 'admission') { x.du = adm; x.calcul = `admission : ${e2(adm)} €`; continue; }
    const fi = fiParUE.get(Number(x.ue_num));
    if (fi == null) { x.du = parUE; x.calcul = `pas inscrit à l’UE : forfait de ${e2(parUE)} €`; }
    else if (fi < parUE) { x.du = arrondi(parUE - fi); x.fi = arrondi(fi); x.calcul = `frais de l’UE ${e2(fi)} € < ${e2(parUE)} € : portés au forfait, ${e2(parUE - fi)} € de plus`; }
    else { x.du = supp; x.fi = arrondi(fi); x.calcul = `frais de l’UE ${e2(fi)} € ≥ ${e2(parUE)} € : ${e2(supp)} €`; }
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
