// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Frais de scolarité (RDE, titre V, art. 16 à 20)
//
// À distinguer du droit d'inscription, qui revient à la Fédération : les frais
// administratifs sont fixés par l'établissement et lui restent acquis.
//
//   frais administratifs = 150 € fixes + 0,25 € par période de cours du PAE
//   acompte              = droit d'inscription + les 150 € fixes
//   solde                = 0,25 € × périodes, dû avant le 1er octobre ou, au
//                          plus tard, avant le premier dixième de la première
//                          UE du programme
//
// L'acompte n'est pas un supplément : il s'impute sur le total (art. 16 §3).
// Toute modification du PAE en cours d'année entraîne recalcul (art. 16 §4).
//
// Comme ces frais ne regardent pas l'administration de la Fédération, ils font
// l'objet d'un document distinct de la fiche d'inscription.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { piedBalisage, piedStyles, reglesDePage } from '../lib/document.js';
import db from '../db/index.js';
import { piedDocument, getParam } from './parametres.js';
import { sectionRattachement } from './etudiants.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { calculerDI, calculerDIS } from './droitInscription.js';
import { premierDixiemeUE } from '../lib/datesReelles.js';
import { forfaitVA, migrerForfaitVA, exonererForfait } from '../lib/forfaitVA.js';
import { logoCourant, etablissementDeSection } from '../lib/identite.js';
import { etablissementCourant } from '../lib/contexteRequete.js';
import multer from 'multer';
import { communicationStructuree, lireExtrait, chercherCommunication, lireCommunication, chargeEpc, qrSvg } from '../lib/banque.js';

const r = Router();

const BAREME_DEFAUT = {
  frais_fixes: 150,
  par_periode: 0.25,
  duplicata_carte: 15,
  duplicata_document: 2,
  copie_epreuve_page: 0.25,
};

export function migrerFraisScolarite(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS frais_bareme (
      annee_scolaire      TEXT PRIMARY KEY,
      frais_fixes         REAL NOT NULL DEFAULT 150,
      par_periode         REAL NOT NULL DEFAULT 0.25,
      duplicata_carte     REAL NOT NULL DEFAULT 15,
      duplicata_document  REAL NOT NULL DEFAULT 2,
      copie_epreuve_page  REAL NOT NULL DEFAULT 0.25,
      base_legale         TEXT,
      maj_le              TEXT DEFAULT (datetime('now'))
    );

    -- Versements de l'étudiant, pour suivre ce qui reste dû
    CREATE TABLE IF NOT EXISTS frais_paiement (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      date_paiement  TEXT,
      montant        REAL NOT NULL,
      nature         TEXT,          -- acompte | solde | duplicata | autre
      moyen          TEXT,
      remarque       TEXT,
      encode_par     TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_frais_paiement
      ON frais_paiement(etudiant_id, annee_scolaire);
    `);
    console.log('[migration] frais de scolarité : barème et paiements');
    /* UN VERSEMENT NE S'EFFACE PAS, IL S'ANNULE (3.1.437) : c'est de l'argent. La route
       supprimait la ligne sans trace ; elle garde désormais qui, quand et pourquoi. */
    for (const c of ['annule_le TEXT', 'annule_par TEXT', 'annule_motif TEXT']) {
      try { db.exec(`ALTER TABLE frais_paiement ADD COLUMN ${c}`); } catch { /* déjà là */ }
    }
    /* UN VIREMENT NE S'IMPORTE QU'UNE FOIS (3.1.444) : la référence de la banque, unique. */
    try { db.exec('ALTER TABLE frais_paiement ADD COLUMN banque_ref TEXT'); } catch { /* déjà là */ }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_frais_paiement_banque ON frais_paiement(banque_ref) WHERE banque_ref IS NOT NULL');
  } catch (e) { console.error('[migration] frais scolarité :', e.message); }
}

export function bareme(annee) {
  const row = db.prepare('SELECT * FROM frais_bareme WHERE annee_scolaire = ?').get(annee);
  return row || { annee_scolaire: annee, ...BAREME_DEFAUT, defaut: true };
}

const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Frais dus par un étudiant pour une année, et ce qui reste à payer.
 * Les périodes retenues sont celles du droit d'inscription : mêmes UE, mêmes
 * dispenses, pour que les deux documents ne se contredisent pas.
 */
/* LES SECTIONS SANS FRAIS D'INSCRIPTION COMPLÉMENTAIRES (Charles, 7 octobre
   2026 : « en AeSI, il n'y a pas de frais complémentaires — section interdite
   à cela »). Un réglage, pas une règle en dur : Configuration → Coût des
   périodes. Le droit d'inscription, lui, reste dû. */
export function semerSectionsSansFrais(dbx = db) {
  try { migrerForfaitVA(dbx); } catch (e) { console.error('[migration] forfait VA :', e.message); }
  dbx.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`)
    .run('frais.sections_sans_frais', 'AeSI', "Sections sans frais d'inscription complémentaires (codes séparés par des virgules)", null, 'couts');
}
export function sectionsSansFrais() {
  return new Set(String(getParam('frais.sections_sans_frais', 'AeSI') || '').split(',').map(s => s.trim()).filter(Boolean));
}

export function calculerFrais(etudId, annee) {
  const b = bareme(annee);
  const di = calculerDI(etudId, annee);
  if (!di) return null;
  const dis = calculerDIS(etudId, annee);

  // Périodes du PAE, hors UE dispensées — le RDE parle des périodes « prévues
  // au PAE », et une UE valorisée n'est pas suivie.
  // LES FRAIS SUR LES PÉRIODES DE L'ÉTUDIANT (Charles, 7 octobre 2026) — le
  // droit d'inscription, lui, sur les périodes professeur du dossier.
  const periodes = di.detail.filter(d => !d.dispensee)
    .reduce((s, d) => s + Number(d.periodes_etudiant ?? d.periodes ?? 0), 0);

  let sec = null; try { sec = sectionRattachement(etudId, annee).section || null; } catch { /* */ }
  /* DROITS PERÇUS PAR UN TIERS : AUCUN FRAIS POUR L'ÉTABLISSEMENT (Charles, 8 octobre
     2026 : « pour Orthoptie, PAS de frais — c'est la HELB qui gagne »). */
  const sansFrais = !!di.tiers || (!!sec && sectionsSansFrais().has(sec));
  const fixes = sansFrais ? 0 : b.frais_fixes;
  const fraisVariables = sansFrais ? 0 : arrondi(periodes * b.par_periode);
  const fraisAdmin = arrondi(fixes + fraisVariables);
  const droit = di.exonere ? 0 : arrondi(di.montant_arrondi);
  const droitSpecifique = dis?.soumis ? arrondi(dis.montant_du) : 0;

  const total = arrondi(droit + droitSpecifique + fraisAdmin);
  const acompte = arrondi(droit + droitSpecifique + fixes);
  const solde = arrondi(total - acompte);          // = 0,25 € × périodes

  const tousPaiements = db.prepare(`
    SELECT * FROM frais_paiement WHERE etudiant_id = ? AND annee_scolaire = ?
    ORDER BY date_paiement, id
  `).all(etudId, annee);
  const paiements = tousPaiements.filter(p => !p.annule_le);
  const paiementsAnnules = tousPaiements.filter(p => p.annule_le);
  const verse = arrondi(paiements.reduce((s, p) => s + Number(p.montant || 0), 0));

  // Échéance du solde : le 1er octobre, ou le premier dixième de la première
  // UE si celui-ci tombe plus tôt (art. 17 §2).
  const a1 = Number(String(annee).slice(0, 4));
  const premierOctobre = `${a1}-10-01`;
  // Le premier dixième de CHAQUE UE (horaire réel, séance la plus proche ; à défaut
  // les dates de son organisation — `premierDixiemeUE`), et le plus tôt d'entre eux.
  // On prenait le plus petit début et la plus petite fin de deux UE différentes.
  let echeanceSolde = premierOctobre;
  for (const x of di.detail) {
    const dx = premierDixiemeUE(x.ue_num, annee, { numOrganisation: x.num_organisation ?? null })?.date;
    if (dx && dx < echeanceSolde) echeanceSolde = dx;
  }

  /* LE FORFAIT D'ANALYSE DES DEMANDES DE VALORISATION (lib/forfaitVA.js) : comparé aux
     frais d'inscription ci-dessus, puis ajouté au total. */
  // Les frais d'inscription de CHAQUE unité (Charles : « UE par UE ») — hors partie fixe.
  const fiParUE = new Map(di.detail.map(d => [Number(d.ue_num), arrondi(
    (di.exonere ? 0 : (d.dispensee ? (d.periodes_brutes || 0) * (d.tarif || 0) : (d.total || 0)))
    + (sansFrais ? 0 : (d.periodes_etudiant_brutes ?? d.periodes_etudiant ?? 0) * b.par_periode))]));
  const va = forfaitVA(etudId, annee, { fiParUE });
  const totalAvecVA = arrondi(total + va.du);
  return {
    annee, bareme: b,
    forfait_va: va,
    total_hors_va: total,
    periodes,
    droit_inscription: droit,
    droit_specifique: droitSpecifique,
    frais_fixes: arrondi(fixes),
    sans_frais: sansFrais, section: sec,
    frais_variables: fraisVariables,
    frais_administratifs: fraisAdmin,
    total: totalAvecVA,
    acompte,
    solde: arrondi(totalAvecVA - acompte),   // le forfait VA se paie avec le solde, il ne disparaît pas
    echeance_solde: echeanceSolde,
    paiements,
    paiements_annules: paiementsAnnules,
    verse,
    restant: arrondi(totalAvecVA - verse),
    acompte_verse: verse >= acompte,
    exonere_di: di.exonere,
    tiers: di.tiers,   // droits perçus par un tiers : hors recettes de l'établissement
    detail_ue: di.detail,
    virement: virementDe(etudId, annee, sec, arrondi(verse < acompte ? acompte - verse : totalAvecVA - verse)),
  };
}

/* COMMENT PAYER (3.1.444) : le compte de l'établissement de la section, et la communication
   structurée de l'étudiant pour l'année — c'est elle qui rattache le virement sans deviner. */
export function virementDe(etudId, annee, section, aPayer = 0) {
  let e = {};
  try {
    const id = section ? etablissementDeSection(section) : 1;
    e = db.prepare('SELECT iban, etab_nom, nom_court FROM etablissement WHERE id = ?').get(id)
      || db.prepare('SELECT iban, etab_nom, nom_court FROM etablissement ORDER BY id LIMIT 1').get() || {};
  } catch { /* colonne iban absente sur une vieille base */ }
  const communication = communicationStructuree(etudId, annee);
  const montant = aPayer > 0 ? aPayer : null;
  const beneficiaire = e.etab_nom || e.nom_court || null;
  return { iban: e.iban || null, beneficiaire, communication, montant,
    epc: chargeEpc({ iban: e.iban, beneficiaire, montant, communication }) };
}

// ── Consultation ────────────────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const f = calculerFrais(Number(req.params.id), annee);
  if (!f) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json(f);
});

// ── Paiements ───────────────────────────────────────────────────────────────
r.post('/paiement', authRequired, roleRequired('admin', 'editeur', 'secretariat'), (req, res) => {
  const { etudiant_id, annee_scolaire, montant, nature, date_paiement, moyen, remarque } = req.body || {};
  if (!etudiant_id || !annee_scolaire || montant == null) {
    return res.status(400).json({ error: 'etudiant_id, annee_scolaire et montant requis' });
  }
  const m = Number(String(montant).replace(',', '.'));
  // Un remboursement s'encode en négatif ; zéro ou un texte ne sont pas des versements.
  if (!Number.isFinite(m) || m === 0) return res.status(400).json({ error: 'Montant attendu : un nombre différent de zéro.' });
  if (m < 0 && nature !== 'remboursement') return res.status(400).json({ error: 'Un montant négatif ne s’encode que comme remboursement.' });
  const info = db.prepare(`
    INSERT INTO frais_paiement
      (etudiant_id, annee_scolaire, date_paiement, montant, nature, moyen, remarque, encode_par)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(Number(etudiant_id), annee_scolaire,
         date_paiement || new Date().toISOString().slice(0, 10),
         m, nature || 'acompte', moyen || null, remarque || null,
         req.user?.nom || req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.delete('/paiement/:id', authRequired, roleRequired('admin', 'editeur', 'secretariat'), (req, res) => {
  const motif = String(req.body?.motif || req.query?.motif || '').trim();
  if (motif.length < 3) return res.status(400).json({ error: 'Annuler un versement se motive.', motif_requis: true });
  const info = db.prepare(`UPDATE frais_paiement SET annule_le = datetime('now'), annule_par = ?, annule_motif = ?
    WHERE id = ? AND annule_le IS NULL`).run(req.user?.nom || req.user?.email || null, motif, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Versement introuvable ou déjà annulé.' });
  res.json({ ok: true, annule: true });
});

/* DISPENSER UNE DEMANDE DU FORFAIT VA : un motif écrit, au nom de la personne connectée.
   motif null : la dispense est retirée. */
r.put('/va-exoneration/:valorisationId', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const x = exonererForfait(req.params.valorisationId, req.body?.motif === null ? null : req.body?.motif,
    req.user?.nom_complet || req.user?.email || null);
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

// ── Barème ──────────────────────────────────────────────────────────────────
r.get('/bareme', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  res.json(bareme(annee));
});

r.put('/bareme', authRequired, roleRequired('admin'), (req, res) => {
  const { annee_scolaire, frais_fixes, par_periode,
          duplicata_carte, duplicata_document, copie_epreuve_page } = req.body || {};
  if (!annee_scolaire) return res.status(400).json({ error: 'annee_scolaire requise' });
  db.prepare(`
    INSERT INTO frais_bareme (annee_scolaire, frais_fixes, par_periode,
      duplicata_carte, duplicata_document, copie_epreuve_page, base_legale, maj_le)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire) DO UPDATE SET
      frais_fixes = excluded.frais_fixes, par_periode = excluded.par_periode,
      duplicata_carte = excluded.duplicata_carte,
      duplicata_document = excluded.duplicata_document,
      copie_epreuve_page = excluded.copie_epreuve_page, maj_le = datetime('now')
  `).run(annee_scolaire, Number(frais_fixes ?? 150), Number(par_periode ?? 0.25),
         Number(duplicata_carte ?? 15), Number(duplicata_document ?? 2),
         Number(copie_epreuve_page ?? 0.25), 'RDE, titre V, art. 16 à 20');
  res.json({ ok: true, bareme: bareme(annee_scolaire) });
});

// ── Note de frais, document distinct de la fiche d'inscription ─────────────
r.get('/etudiant/:id/document', authRequired, async (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const etudId = Number(req.params.id);

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  const f = calculerFrais(etudId, annee);
  const qr = f?.virement?.epc ? await qrSvg(f.virement.epc, 110) : '';
  const etab = db.prepare('SELECT * FROM etablissement WHERE id = ?').get(etablissementCourant()) || db.prepare('SELECT * FROM etablissement ORDER BY id LIMIT 1').get() || {};

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const fr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';

  const lignesUe = f.detail_ue.map(d => `
    <tr${d.dispensee ? ' class="dispensee"' : ''}>
      <td>${d.ue_num}</td>
      <td>${esc(d.ue_nom || '')}</td>
      <td style="text-align:right">${d.dispensee ? '—' : (d.periodes_etudiant ?? d.periodes)}</td>
      <td style="text-align:right">${d.dispensee ? 'dispensée' : f.sans_frais ? '—' : eur((d.periodes_etudiant ?? d.periodes) * f.bareme.par_periode)}</td>
    </tr>`).join('');

  const lignesPaiement = f.paiements.map(p => `
    <tr><td>${fr(p.date_paiement)}</td><td>${esc(p.nature || '')}</td>
        <td>${esc(p.moyen || '')}</td>
        <td style="text-align:right">${eur(p.montant)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Frais de scolarité — ${esc(e.nom)} ${esc(e.prenom)}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1B2B4B; margin: 24px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; color: #1B2B4B;
       border-bottom: 2px solid #C9A84C; padding-bottom: 3px; }
  .meta { color: #64748b; font-size: 11.5px; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; }
  th { background: #f1f5f9; text-align: left; font-size: 10.5px;
       text-transform: uppercase; letter-spacing: .3px; }
  tr.dispensee td { color: #94a3b8; font-style: italic; }
  tr.tot td { background: #f8fafc; font-weight: 600; }
  .encadre { border: 2px solid #1B2B4B; border-radius: 6px; padding: 10px 12px; margin-top: 12px; }
  .grand { font-size: 20px; font-weight: 700; }
  .note { font-size: 10.5px; color: #64748b; margin-top: 4px; }
  .sig { margin-top: 30px; display: flex; gap: 60px; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10.5px; color: #64748b; }

  /* La marge basse réserve la hauteur du pied : sans elle, le texte passerait
     dessous en fin de page. */
  ${reglesDePage({ haut: 14, cote: 14 })}

  /* Pied de page commun, ancré en bas de CHAQUE page — dernière comprise.
     Un pied placé dans le flux, ou en table-footer-group, flotte au milieu
     d'une dernière page à moitié vide. */
  ${piedStyles()}
</style></head><body>

<h1>${esc(etab.etab_nom || 'Institut Ilya Prigogine')} — Frais de scolarité</h1>
<div class="meta">Année académique ${esc(annee)}</div>
<div class="meta">
  ${esc(e.titre || '')} <b>${esc(e.nom)} ${esc(e.prenom)}</b>
  ${e.id_ecampus ? ' · ' + esc(e.id_ecampus) : ''}
</div>

<h2>Programme retenu</h2>
<table>
  <thead><tr><th>UE</th><th>Intitulé</th><th style="text-align:right">Périodes</th>
    <th style="text-align:right">Part variable</th></tr></thead>
  <tbody>
    ${lignesUe || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Aucune UE au programme</td></tr>'}
    <tr class="tot"><td colspan="2" style="text-align:right">Total des périodes</td>
      <td style="text-align:right">${f.periodes}</td>
      <td style="text-align:right">${eur(f.frais_variables)}</td></tr>
  </tbody>
</table>

<h2>Décompte</h2>
<table>
  <tbody>
    <tr><td>Droit d'inscription (Fédération Wallonie-Bruxelles)</td>
        <td style="text-align:right">${f.exonere_di ? '0,00 € — exonéré' : eur(f.droit_inscription)}</td></tr>
    ${f.droit_specifique ? `<tr><td>Droit d'inscription spécifique</td>
        <td style="text-align:right">${eur(f.droit_specifique)}</td></tr>` : ''}
    <tr><td>Frais administratifs — partie fixe</td>
        <td style="text-align:right">${eur(f.frais_fixes)}</td></tr>
    <tr><td>Frais administratifs — ${f.sans_frais ? `aucun : la section ${esc(f.section || '')} n'en perçoit pas` : `${f.periodes} période(s) à ${String(f.bareme.par_periode).replace('.', ',')} €`}</td>
        <td style="text-align:right">${eur(f.frais_variables)}</td></tr>
    ${f.forfait_va?.du ? `<tr><td>Analyse des demandes de valorisation — ${f.forfait_va.demandes.filter(x => !x.exoneree).map(x => esc(`${x.nature === 'admission' ? 'admission' : `UE ${x.ue_num}`} (${x.calcul})`)).join(' ; ')}</td>
        <td style="text-align:right">${eur(f.forfait_va.du)}</td></tr>` : ''}
    <tr class="tot"><td style="text-align:right">TOTAL DÛ</td>
        <td style="text-align:right">${eur(f.total)}</td></tr>
  </tbody>
</table>

<div class="encadre">
  <div>Acompte à verser pour valider l'inscription</div>
  <div class="grand">${eur(f.acompte)}</div>
  <div class="note">
    Droit d'inscription et partie fixe des frais administratifs. <b>Cet acompte n'est pas un
    supplément</b> : il s'impute intégralement sur le total ci-dessus.
  </div>
  <div style="margin-top:8px">Solde : <b>${eur(f.solde)}</b>, à verser pour le ${fr(f.echeance_solde)} au plus tard.</div>
</div>

${f.virement?.communication ? `<div class="encadre" style="border-width:1px;display:flex;gap:14px;align-items:center;page-break-inside:avoid">
  ${qr ? `<div style="flex:none">${qr}</div>` : ''}
  <div>
  <div><b>Pour payer par virement</b></div>
  ${f.virement.iban ? `<div style="margin-top:4px">Compte : <b>${esc(f.virement.iban)}</b>${f.virement.beneficiaire ? ` — ${esc(f.virement.beneficiaire)}` : ''}</div>` : ''}
  ${f.virement.montant ? `<div style="margin-top:4px">Montant : <b>${eur(f.virement.montant)}</b>${f.acompte_verse ? '' : ' (acompte)'}</div>` : ''}
  <div style="margin-top:4px">Communication : <b style="font-size:14px;letter-spacing:.5px">${esc(f.virement.communication)}</b></div>
  <div class="note">${qr ? 'Scannez le code avec l’application de votre banque : compte, montant et communication se remplissent seuls. ' : ''}Sinon, recopiez exactement cette communication : c'est elle qui rattache votre virement à votre dossier.</div>
  </div>
</div>` : ''}

${f.paiements.length ? `
<h2>Versements enregistrés</h2>
<table>
  <thead><tr><th>Date</th><th>Nature</th><th>Moyen</th><th style="text-align:right">Montant</th></tr></thead>
  <tbody>${lignesPaiement}
    <tr class="tot"><td colspan="3" style="text-align:right">Total versé</td>
      <td style="text-align:right">${eur(f.verse)}</td></tr>
    <tr class="tot"><td colspan="3" style="text-align:right">Restant dû</td>
      <td style="text-align:right">${eur(f.restant)}</td></tr>
  </tbody>
</table>` : ''}

<h2>Ce que couvrent ces frais</h2>
<p style="font-size:11px;line-height:1.5">
  L'organisation des cours, des stages et des examens, les photocopies et syllabus, les
  fournitures des cours pratiques, l'accès à la bibliothèque et les assurances.
  <br><i>Ne sont pas compris</i> : l'achat de livres et de matériel personnel, les frais de
  déplacement vers les lieux de cours ou de stage, les dépenses liées aux activités
  extra-muros et l'achat du kit de base en optique-optométrie.
</p>
<p style="font-size:10.5px;color:#64748b">
  Toute modification du programme en cours d'année entraîne le recalcul de la part variable.
  Les conditions de remboursement en cas de désinscription figurent à l'article 19 du règlement
  des études.
</p>

<div class="sig">
  <div>Signature de l'étudiant</div>
  <div>Pour l'établissement</div>
</div>

<div style="margin-top:16px;font-size:10px;color:#94a3b8">
  Règlement des études, titre V, articles 16 à 20 · document établi le
  ${new Date().toLocaleDateString('fr-BE')}
</div>

${piedBalisage(logoCourant())}
</body></html>`;

  res.json({ html, titre: `Frais de scolarité — ${e.nom} ${e.prenom}` });
});

// ── Extraits de compte (3.1.444) ────────────────────────────────────────────
/* RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT : /banque/lire ne fait que lire l'extrait
   et proposer, ligne par ligne, l'étudiant que le virement paie ; /banque/verser n'enregistre
   que les lignes confirmées à l'écran, au nom de la personne connectée. */
const extrait = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

function etudiantDe(id) {
  return db.prepare('SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE id = ?').get(id) || null;
}
/* À DÉFAUT DE COMMUNICATION, LE NOM DU DONNEUR D'ORDRE — mais seulement s'il ne désigne
   qu'UN étudiant inscrit cette année-là, et la ligne reste « à vérifier ». */
function parNom(nom, annee) {
  const n = sansAccents(nom);
  if (n.length < 5) return [];
  const mots = new Set(n.split(' '));
  return db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant e
      JOIN etudiant_inscription i ON i.etudiant_id = e.id AND i.annee_scolaire = ?`).all(annee)
    .filter(e => { const a = sansAccents(e.nom).split(' '), b = sansAccents(e.prenom).split(' ');
      return a.length && b.length && [...a, ...b].every(m => m && mots.has(m)); });
}

r.post('/banque/lire', authRequired, roleRequired('admin', 'editeur', 'secretariat'), extrait.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Déposez l’extrait de compte (CODA ou CAMT.053).' });
  const anneeDefaut = String(req.body?.annee || '');
  let texte = req.file.buffer.toString('utf8');
  if (texte.includes('�')) texte = req.file.buffer.toString('latin1');
  const { format, mouvements } = lireExtrait(texte);
  if (!format) return res.status(400).json({ error: 'Ce fichier n’est ni un extrait CODA ni un CAMT.053. Téléchargez-le depuis la banque en ligne, au format CODA ou XML (CAMT.053).' });
  const deja = db.prepare('SELECT etudiant_id, annule_le FROM frais_paiement WHERE banque_ref = ?');
  const cache = new Map();
  const frais = (id, an) => { const k = `${id}|${an}`; if (!cache.has(k)) { try { cache.set(k, calculerFrais(id, an)); } catch { cache.set(k, null); } } return cache.get(k); };
  const lignes = mouvements.map(m => {
    const l = { ...m, etat: null, etudiant: null, annee: null, motif: null };
    if (m.montant <= 0) return { ...l, etat: 'ignore', motif: 'Débit du compte : ce n’est pas un versement d’étudiant.' };
    const d = deja.get(m.ref);
    if (d) return { ...l, etat: 'deja', etudiant: etudiantDe(d.etudiant_id), motif: d.annule_le ? 'Déjà importé, puis annulé.' : 'Déjà importé.' };
    const c = (m.structuree && lireCommunication(m.communication)) || chercherCommunication(m.communication);
    if (c) {
      const e = etudiantDe(c.etudiant_id);
      if (!e) return { ...l, etat: 'inconnu', motif: `La communication ${c.communication} ne correspond à aucun dossier.` };
      const f = frais(e.id, c.annee);
      const reste = f ? f.restant : null;
      return { ...l, etudiant: e, annee: c.annee, communication: c.communication, reste,
        etat: reste != null && m.montant > reste + 0.009 ? 'douteux' : 'reconnu',
        motif: reste != null && m.montant > reste + 0.009 ? `Le montant dépasse ce qui reste dû (${reste.toFixed(2).replace('.', ',')} €).` : null };
    }
    if (anneeDefaut) {
      const p = parNom(m.nom, anneeDefaut);
      if (p.length === 1) {
        const f = frais(p[0].id, anneeDefaut);
        return { ...l, etat: 'douteux', etudiant: p[0], annee: anneeDefaut, reste: f ? f.restant : null,
          motif: 'Sans communication structurée : rapproché d’après le nom du donneur d’ordre, à vérifier.' };
      }
    }
    return { ...l, etat: 'inconnu', motif: 'Aucune communication structurée, et le nom ne désigne pas un seul étudiant.' };
  });
  const compte = (e) => lignes.filter(x => x.etat === e).length;
  res.json({ format, fichier: req.file.originalname, lignes,
    resume: { total: lignes.length, reconnu: compte('reconnu'), douteux: compte('douteux'), inconnu: compte('inconnu'), deja: compte('deja'), ignore: compte('ignore') } });
});

r.post('/banque/verser', authRequired, roleRequired('admin', 'editeur', 'secretariat'), (req, res) => {
  const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes : [];
  if (!lignes.length) return res.status(400).json({ error: 'Aucune ligne à verser.' });
  const qui = req.user?.nom || req.user?.email || null;
  for (const l of lignes) {
    if (!l.ref || !String(l.ref).match(/^(coda|camt):/)) return res.status(400).json({ error: 'Ligne sans référence bancaire.' });
    if (!(Number(l.montant) > 0)) return res.status(400).json({ error: 'Seuls les crédits se versent.' });
    if (!l.etudiant_id || !etudiantDe(Number(l.etudiant_id))) return res.status(400).json({ error: `Étudiant inconnu pour la ligne ${l.ref}.` });
    if (!/^\d{4}-\d{4}$/.test(String(l.annee || ''))) return res.status(400).json({ error: 'Année attendue au format 2026-2027.' });
  }
  const existe = db.prepare('SELECT 1 FROM frais_paiement WHERE banque_ref = ?');
  const ins = db.prepare(`INSERT INTO frais_paiement (etudiant_id, annee_scolaire, date_paiement, montant, nature, moyen, remarque, encode_par, banque_ref)
    VALUES (?,?,?,?,?, 'virement', ?, ?, ?)`);
  let verses = 0, sautes = 0;
  db.transaction(() => {
    for (const l of lignes) {
      if (existe.get(l.ref)) { sautes++; continue; }
      let nature = 'solde';
      try { const f = calculerFrais(Number(l.etudiant_id), l.annee); if (f && !f.acompte_verse) nature = 'acompte'; } catch { /* */ }
      const remarque = ['Extrait bancaire', l.nom, l.communication].filter(Boolean).join(' — ').slice(0, 300);
      ins.run(Number(l.etudiant_id), l.annee, l.date || new Date().toISOString().slice(0, 10), Math.round(Number(l.montant) * 100) / 100,
        nature, remarque, qui, l.ref);
      verses++;
    }
  })();
  res.json({ ok: true, verses, sautes });
});

export default r;
