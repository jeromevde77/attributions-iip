/**
 * MON PARCOURS ET MES FRAIS, DANS L'ESPACE DE L'ÉTUDIANT (3.1.517, Charles, 30 octobre 2026 : « toutes les infos de son
 * ou ses inscriptions, le schéma de capitalisation… » ; maquettes du projet du portail, écrans 5 et 8).
 *
 * Rien n'est recalculé ailleurs : le parcours vient du moteur du PAE (`composerPAE` : l'état de chaque unité de ses
 * sections, l'année active), les frais de `calculerFrais` (la note de frais), le QR de paiement de `qrSvg` sur la charge
 * EPC du virement — les mêmes chiffres que la fiche et la note de frais. Lucie dépose, le portail affiche.
 */
import db from '../db/index.js';
import { composerPAE, donneesCapitalisation } from '../routes/etudiants.js';
import { sigleVA } from './valorisation.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { qrSvg } from './banque.js';
import { placer } from './passages.js';
import { aRepresenterParCours } from '../routes/acquis.js';

/** Le parcours de l'année : chaque unité de ses sections, son état, ses crédits ; les crédits acquis. */
export function parcoursPortail(e, annee) {
  let c;
  try { c = composerPAE(e.id, annee); } catch { return null; }
  if (!c || c.erreur) return null;
  const ects = db.prepare('SELECT ects FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1');
  // VA OU VAE, JAMAIS L'UN POUR L'AUTRE (la règle de la fiche, 3.5.006).
  const vaDe = db.prepare(`SELECT porte, base_code FROM etudiant_valorisation WHERE etudiant_id = ? AND ue_num = ? AND type = 'complete'
    ORDER BY id DESC LIMIT 1`);
  const sigle = n => sigleVA(vaDe.get(e.id, n) || {});
  // LES COURS DE CHAQUE UNITÉ (3.5.194, Charles : « il faudrait que les cours apparaissent »).
  const coursDe = db.prepare(`SELECT cours_code AS code, MAX(cours_nom) AS nom, MAX(cours_per) AS per, MAX(ct_pp) AS ct_pp, MIN(cours_num) AS n
    FROM cours WHERE ue_num = ? AND annee_scolaire = ? GROUP BY cours_code ORDER BY n, cours_code`);
  const unites = (c.pae || []).map(u => {
    const acquise = !!(u.deja_reussie || u.va_complete);
    const etat = acquise ? 'acquise' : u.inscrite ? 'programme' : u.en_attente ? 'attente' : u.accessible ? 'accessible' : 'pas_encore';
    return { ue_num: u.ue_num, ue_nom: u.ue_nom, bloc: u.ue_niv || '—', ects: Number(ects.get(u.ue_num, annee)?.ects) || 0, etat,
      va: u.va_complete ? sigle(u.ue_num) : null, epreuve: !!u.epreuve_integree,
      cours: coursDe.all(u.ue_num, annee).map(k => ({ code: k.code, nom: String(k.nom || '').replace(/^\d+(\.\d+)*\.\s*/, ''), per: Number(k.per) || null, autonomie: k.ct_pp === 'Z' })),
      raison: etat === 'pas_encore' ? (u.prereq_manquants?.length ? `prérequis : UE ${u.prereq_manquants.join(', ')}` : u.epreuve_integree ? 'tout le reste d’abord' : null) : null };
  });
  const total = unites.reduce((s, u) => s + u.ects, 0);
  const acquis = unites.filter(u => u.etat === 'acquise').reduce((s, u) => s + u.ects, 0);
  // LE SCHÉMA DE CAPITALISATION (3.5.010, Charles : « sous la forme du schéma, et en dessous où il en est ») : le MÊME
  // dessin que la fiche et la pièce imprimée (donneesCapitalisation + schemaSvg), en SVG sans script.
  let schema = null;
  // LE DESSIN DE LUCIE, PAS UNE COPIE (3.5.026, Charles : « tu respectes le modèle de schéma actuel, avec les flèches qui
  // ne passent pas derrière, comme partout ailleurs ») : on dépose les DONNÉES du schéma de la fiche ; le site des étudiants
  // les dessine avec le même composant (SchemaCapitalisation, lib/schemaCouches.js). Le SVG du serveur ne sert plus ici.
  try { const g = donneesCapitalisation(e.id, annee); if (g.nodes?.length) schema = { nodes: g.nodes, edges: g.edges, groupes: g.groupes, colonnes: g.colonnes }; } catch (x) { console.error('[portail] schéma :', x.message); }
  return { annee, sections: c.sections || [], unites, ects_total: total, ects_acquis: acquis, schema, examens: examensDe(e, annee) };
}

/** SES EXAMENS (3.5.284, Charles : les passages visibles « dans l'espace de l'étudiant ») : pour chaque épreuve datée de ses
 *  unités de l'année — 1re session s'il y est inscrit, 2e s'il représente CE cours —, le passage qui le concerne (date, heure,
 *  local, partie) ; sans passage, la date unique du calendrier. De la veille à la fin de l'année. */
export function examensDe(e, annee) {
  const out = [];
  const depuis = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let ues = [];
  try { ues = db.prepare(`SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND COALESCE(statut, '') NOT IN ('abandon', 'desinscrit')`).all(e.id, annee).map(x => Number(x.ue_num)); } catch { return []; }
  if (!ues.length) return [];
  const nomCours = c => { try { return db.prepare('SELECT MAX(cours_nom) n FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(c, annee)?.n || ''; } catch { return ''; } };
  const nomUE = u => { try { return db.prepare('SELECT MAX(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(u, annee)?.n || ''; } catch { return ''; } };
  const moi = { id: e.id, nom: e.nom, prenom: e.prenom };
  for (const [t, k, session] of [['epreuve_session1', 's1', 1], ['deliberation_session2', 's2', 2]]) {
    let l = [];
    try { l = db.prepare(`SELECT ue_num, cours_code, ${k}_date d, ${k}_heure h, ${k}_local lo FROM ${t} WHERE annee_scolaire = ? AND ue_num IN (${ues.map(() => '?').join(',')}) AND ${k}_date IS NOT NULL AND ${k}_date <> ''`).all(annee, ...ues); } catch { l = []; }
    const ajournes = {};
    for (const ep of l) {
      const cours = String(ep.cours_code || '');
      if (session === 2) {
        if (!ajournes[ep.ue_num]) { try { ajournes[ep.ue_num] = aRepresenterParCours(Number(ep.ue_num), annee, 1) || {}; } catch { ajournes[ep.ue_num] = {}; } }
        const par = ajournes[ep.ue_num];
        const concerne = cours ? (par[cours] || []).some(x => x.id === e.id) : Object.values(par).flat().some(x => x.id === e.id);
        if (!concerne) continue;
      }
      const intitule = cours ? `${cours} ${nomCours(cours)}`.trim() : `UE ${ep.ue_num} ${nomUE(ep.ue_num)}`.trim();
      let pl = { passages: [] };
      try { pl = placer([moi], annee, session, ep.ue_num, cours); } catch { pl = { passages: [] }; }
      if (pl.passages.length) {
        for (const p of pl.passages.filter(x => x.etudiants.length)) out.push({ session, ue_num: Number(ep.ue_num), cours, intitule, partie: p.partie || null, date: p.date, heure: p.heure || null, local: p.local || null });
      } else out.push({ session, ue_num: Number(ep.ue_num), cours, intitule, partie: null, date: String(ep.d).slice(0, 10), heure: ep.h || null, local: ep.lo || null });
    }
  }
  return out.filter(x => x.date >= depuis).sort((a, b) => `${a.date}${a.heure || ''}`.localeCompare(`${b.date}${b.heure || ''}`));
}

/** Les frais de l'année : ce qui est dû, versé, reste ; l'échéance ; comment payer, avec le QR. */
export async function fraisPortail(e, annee) {
  let f;
  try { f = calculerFrais(e.id, annee); } catch { return null; }
  if (!f) return null;
  const lignes = [
    ['Droit d’inscription', f.exonere_di ? 0 : f.droit_inscription, f.exonere_di ? 'exonéré' : null],
    ['Droit spécifique', f.droit_specifique],
    ['Frais administratifs (part fixe)', f.frais_fixes],
    ['Frais administratifs (par période)', f.frais_variables],
    ['Analyse des demandes de valorisation', f.forfait_va?.du || 0],
  ].filter(([, m, n]) => Number(m) > 0 || n).map(([libelle, montant, note]) => ({ libelle, montant: Number(montant) || 0, note: note || null }));
  const v = f.virement || {};
  return {
    annee, sans_frais: !!f.sans_frais, total: f.total, verse: f.verse, restant: f.restant, acompte: f.acompte,
    acompte_verse: !!f.acompte_verse, echeance_solde: f.echeance_solde, lignes,
    paiements: (f.paiements || []).map(p => ({ date: p.date_paiement, montant: p.montant, nature: p.nature, moyen: p.moyen })),
    virement: f.restant > 0 && v.iban ? { iban: v.iban, beneficiaire: v.beneficiaire, communication: v.communication, montant: v.montant,
      qr: v.epc ? await qrSvg(v.epc, 180) : null } : null,
  };
}


/* LA DUE ET LE DOSSIER PÉDAGOGIQUE DE CHAQUE UNITÉ (3.5.194, Charles : « il faudrait en fait la DUE… et le dossier pédagogique de
   chaque UE »). Un dépôt COMMUN au portail (pas un par étudiant) : l'empreinte dit ce qui a changé, seul le changé repart. La DUE
   n'est montrée qu'une fois validée par la direction (tranché) ; le dossier pédagogique, toujours. */
export async function docsDesUnites(annee) {
  let documentDUE = null, dpHtml = null;
  try { documentDUE = (await import('../routes/due.js')).documentDUE; } catch { /* */ }
  try { dpHtml = (await import('./portailEnseignants.js')).dossierPedagogiqueHtml; } catch { /* */ }
  const ues = db.prepare(`SELECT ue_num, MAX(section) AS section FROM ue WHERE annee_scolaire = ? GROUP BY ue_num`).all(annee);
  const valide = db.prepare(`SELECT statut FROM due WHERE ue_num = ? AND annee_scolaire = ?`);
  const out = [];
  for (const u of ues) {
    let due = null, dp = null;
    try { if (documentDUE && valide.get(u.ue_num, annee)?.statut === 'validee') due = documentDUE(u.ue_num, annee); } catch { due = null; }
    try { dp = dpHtml ? dpHtml(u.ue_num, annee, u.section) : null; } catch { dp = null; }
    out.push({ ue_num: u.ue_num, quoi: 'due', html: due || null });
    out.push({ ue_num: u.ue_num, quoi: 'dp', html: dp || null });
  }
  return out;
}
