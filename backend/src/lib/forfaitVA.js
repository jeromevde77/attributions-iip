/**
 * LE FORFAIT D'ANALYSE DES DEMANDES DE VALORISATION (Charles, 28 octobre 2026 :
 * « si demande de VA, prévoir un forfait financier par UE — cela prend bien deux
 * heures de travail d'analyse »).
 *
 * LA RÈGLE (réglages de Configuration → Coût des périodes) :
 *   - VA et VAE : `va.forfait_ue` (30 €) par UE demandée, dû DÈS LA DEMANDE, quelle
 *     que soit la décision — c'est l'examen du dossier qui est payé ;
 *   - admission : `va.forfait_admission` (50 €) d'office, par demande ;
 *   - si l'étudiant est inscrit à au moins une UE de l'année :
 *       frais d'inscription (FI) inférieurs au forfait VA/VAE → il paie le forfait
 *       (on ajoute la différence) ; FI supérieurs → on ajoute `va.supplement_ue`
 *       (15 €) par UE demandée ;
 *   - non inscrit : le forfait entier.
 *   La comparaison se fait AU TOTAL des demandes de l'année (lecture retenue ; à
 *   confirmer par Charles).
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

/** Le forfait dû. `fi` : les frais d'inscription de l'année (hors forfait) ; `inscrit` : au moins une UE. */
export function forfaitVA(etudId, annee, { fi = 0, inscrit = false } = {}) {
  const d = demandesVA(etudId, annee);
  const parUE = nombre('va.forfait_ue', 30), supp = nombre('va.supplement_ue', 15), adm = nombre('va.forfait_admission', 50);
  const ues = d.filter(x => x.nature !== 'admission' && !x.exoneree);
  const admissions = d.filter(x => x.nature === 'admission' && !x.exoneree);
  const F = ues.length * parUE;
  let du_ue = 0, regle = null;
  if (ues.length) {
    if (!inscrit) { du_ue = F; regle = `${ues.length} UE × ${parUE} € (pas encore inscrit : le forfait entier)`; }
    else if (fi < F) { du_ue = F - fi; regle = `frais d’inscription (${fi} €) inférieurs au forfait (${F} €) : l’étudiant paie le forfait, soit ${arrondi(F - fi)} € de plus`; }
    else { du_ue = ues.length * supp; regle = `frais d’inscription (${fi} €) supérieurs au forfait (${F} €) : ${ues.length} UE × ${supp} €`; }
  }
  const du_adm = admissions.length * adm;
  return { demandes: d, par_ue: parUE, supplement_ue: supp, forfait_admission: adm, n_ue: ues.length, n_admission: admissions.length,
    forfait_brut: F, fi: arrondi(fi), inscrit, du_ue: arrondi(du_ue), du_admission: arrondi(du_adm), du: arrondi(du_ue + du_adm), regle };
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
