/**
 * annexe2.js — Attestation du progrès des études (Office des Étrangers).
 *
 * Formulaire standard de l'annexe 2 de l'arrêté ministériel du 28 mars 2022,
 * visé à l'article 103, §1er, alinéa 1er, 5° de l'arrêté royal du 8 octobre
 * 1981 sur l'accès au territoire, le séjour, l'établissement et l'éloignement
 * des étrangers.
 *
 * Il s'agit d'une pièce à destination d'une administration fédérale : sa forme
 * est imposée et son contenu engage l'établissement. Les valeurs que Lucie ne
 * connaît pas sont donc SIGNALÉES et laissées à compléter, jamais devinées.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { identiteEtablissement } from './config.js';

const r = express.Router();

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Migration : la nationalité est exigée par le formulaire et n'existait pas. */
(function migrer() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('nationalite')) {
      db.exec('ALTER TABLE etudiant ADD COLUMN nationalite TEXT');
      console.log('[migration] etudiant.nationalite ajoutée');
    }
    if (!cols.includes('lieu_naissance')) {
      db.exec('ALTER TABLE etudiant ADD COLUMN lieu_naissance TEXT');
    }
    // Le séjour limité aux études conditionne l'annexe 2 et le droit
    // d'inscription : c'est une donnée administrative, pas une remarque.
    if (!cols.includes('sejour_limite_etudes')) {
      db.exec('ALTER TABLE etudiant ADD COLUMN sejour_limite_etudes INTEGER DEFAULT 0');
      console.log('[migration] etudiant.sejour_limite_etudes ajoutée');
    }
  } catch (e) { console.error('[annexe2] migration', e.message); }
})();

const frDate = iso => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1)
    .padStart(2, '0')}-${d.getFullYear()}`;
};

/**
 * Le bilan de crédits d'un étudiant pour une année, et sur toute sa formation.
 *
 * Le formulaire distingue trois nombres que l'on confond aisément : les crédits
 * INSCRITS de l'année, ceux ACQUIS pendant l'année, et le cumul acquis À CE JOUR
 * dans la formation — celui-ci porte sur toutes les années, pas seulement la
 * dernière.
 */
function bilanCredits(etudiantId, annee) {
  const lignes = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat,
           (SELECT u.ects FROM ue u WHERE u.ue_num = i.ue_num AND u.ects IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ects
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ?
  `).all(etudiantId);

  const acquis = res => res === 'reussi' || res === 'valorise' || res === 'capitalise';

  let inscritsAnnee = 0, acquisAnnee = 0, acquisTotal = 0, valorises = 0;
  let sansEcts = 0;

  for (const l of lignes) {
    const e = Number(l.ects) || 0;
    if (!l.ects) sansEcts++;
    if (l.annee_scolaire === annee) {
      inscritsAnnee += e;
      if (acquis(l.resultat)) acquisAnnee += e;
    }
    if (acquis(l.resultat)) acquisTotal += e;
    if (l.resultat === 'valorise') valorises += e;
  }

  return { inscritsAnnee, acquisAnnee, acquisTotal, valorises, sansEcts,
           nbUE: lignes.length };
}

/** La section suivie l'année considérée, et le total de crédits du cursus. */
function formationDe(etudiantId, annee) {
  const s = db.prepare(`
    SELECT (SELECT u.section FROM ue u
             WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
  `).all(etudiantId, annee).map(x => x.section).filter(Boolean);

  const section = s.sort((a, b) =>
    s.filter(x => x === b).length - s.filter(x => x === a).length)[0] || null;

  const sec = section
    ? db.prepare('SELECT * FROM section WHERE code = ?').get(section)
    : null;

  // Le total de crédits de la formation se déduit du référentiel de la section.
  const total = section ? db.prepare(`
    SELECT SUM(ects) AS t FROM (
      SELECT DISTINCT ue_num, ects FROM ue WHERE section = ? AND ects IS NOT NULL
    )`).get(section)?.t : null;

  return { section, libelle: sec?.libelle || section, totalCredits: total || null };
}

// ── Données de l'attestation ────────────────────────────────────────────────
r.get('/donnees/:etudiantId', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'année requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(req.params.etudiantId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const credits = bilanCredits(e.id, annee);
  const formation = formationDe(e.id, annee);

  // Ce que Lucie ne sait pas, elle le dit. Cette pièce part à l'Office des
  // Étrangers : une valeur inventée s'y retournerait contre l'étudiant.
  const manques = [];
  if (!e.nationalite) manques.push('la nationalité');
  if (!e.date_naissance) manques.push('la date de naissance');
  if (!formation.totalCredits) manques.push('le nombre total de crédits de la formation');
  if (credits.sansEcts) {
    manques.push(`les ECTS de ${credits.sansEcts} unité(s) — le décompte est incomplet`);
  }

  res.json({
    etudiant: {
      id: e.id, nom: e.nom, prenom: e.prenom,
      date_naissance: frDate(e.date_naissance),
      nationalite: e.nationalite || null,
    },
    annee, formation, credits, manques,
  });
});

// ── Le document ─────────────────────────────────────────────────────────────
r.post('/document', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { etudiant_id, annee, motif, avis, date_document } = req.body || {};
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudiant_id);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const ident = identiteEtablissement();
  const credits = bilanCredits(e.id, annee);
  const formation = formationDe(e.id, annee);

  const a1 = annee.split('-')[0], a2 = annee.split('-')[1];
  // Un champ vide se signale à l'écran plutôt que de passer inaperçu.
  const champ = v => v != null && v !== ''
    ? `<b>${esc(v)}</b>`
    : '<span class="manque">…………………</span>';

  // FORMULAIRE RÉGLEMENTAIRE : reproduit à l'identique du modèle officiel.
  // L'administration exige la forme stricte — ni bandeau, ni tableaux, ni
  // habillage. Le document Word de référence n'a d'ailleurs ni en-tête ni pied
  // de page : nous n'en ajoutons pas.
  const corps = `
<div class="a2">
  <p class="ref">Annexe 2 de l\u2019arrêté ministériel du 28 mars 2022 déterminant les
    formulaires standard visés aux articles 99, 103 et 104/3 de l\u2019arrêté royal du
    8 octobre 1981 sur l\u2019accès au territoire, le séjour, l\u2019établissement et
    l\u2019éloignement des étrangers.</p>

  <p class="titre">MODÈLE DE FORMULAIRE STANDARD – ATTESTATION DU PROGRÈS DES ÉTUDES
    AU TERME DE L\u2019ANNÉE ACADÉMIQUE ${esc(a1)} – ${esc(a2)}</p>

  <p class="visa">visée à l\u2019article 103, 1er, alinéa 1er, 5°, de l\u2019arrêté royal du
    8 octobre 1981 sur l\u2019accès au territoire, le séjour, l\u2019établissement et
    l\u2019éloignement des étrangers.</p>

  <p>Je soussigné(e) ${champ((ident.directeur || 'CHARLES SOHET').toUpperCase())}</p>

  <p>En ma qualité de représentant(e) de : ${champ(ident.nom || 'Institut Ilya Prigogine')}</p>

  <p>Confirme que l\u2019étudiant(e) nommé(e) ci-dessous</p>

  <p class="ident">Nom : ${champ((e.nom || '').toUpperCase())}</p>
  <p class="ident">Prénom : ${champ(e.prenom)}</p>
  <p class="ident">Date de naissance : ${champ(frDate(e.date_naissance))}</p>
  <p class="ident">Nationalité : ${champ(e.nationalite)}</p>

  <p>était inscrit(e) pour ${champ(credits.inscritsAnnee || null)} crédits pour la
    formation ${champ(formation.libelle)} pour l\u2019année académique
    ${esc(a1)}-${esc(a2)}. Cette formation comprend
    ${champ(formation.totalCredits)} crédits au total et ayant obtenu ou valorisé des
    crédits antérieurement, l\u2019étudiant(e) obtient une dispense pour
    ${credits.valorises || 0} crédits de la formation.</p>

  <p>Il/elle a obtenu ${credits.acquisAnnee} crédits durant l\u2019année académique
    ${esc(a1)}-${esc(a2)} et le nombre de crédits qu\u2019il/elle a obtenus à ce jour au
    total dans sa formation est donc de ${credits.acquisTotal} crédits.</p>

  <p>L\u2019étudiant(e) n\u2019a pas dû obtenir de crédits pour les raisons suivantes :
    ${champ(motif)}</p>

  <p>Le relevé de notes doit être joint au présent formulaire afin d\u2019informer
    l\u2019Office des Étrangers le plus complètement possible.</p>

  <p>Avis facultatif concernant le déroulement des études de l\u2019étudiant(e) :
    ${champ(avis || 'Néant')}</p>

  <p>Fait à ${esc(ident.ville || 'Anderlecht')}, le
    ${frDate(date_document || new Date().toISOString())}</p>

  <p>Signature du représentant ou de la représentante de l\u2019établissement précité :</p>

  <div class="signature">
    <div class="paraphe"></div>
    <div class="sceau"></div>
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps,
    titre: '',
    // Le modèle officiel n'a NI en-tête NI pied de page : nous n'en ajoutons
    // pas. L'administration attend la forme stricte, pas notre habillage.
    avecPied: false,
    margeHaut: 20, margeCote: 20,
    styles: `
:root{--paraphe:url("${SIGNATURE_SOHET}");--sceau:url("${SCEAU_IIP}")}

/* Formulaire réglementaire : mise en forme sobre, au plus près du Word. */
.a2{font-size:11pt;line-height:1.45;color:#000;font-family:Calibri,Arial,sans-serif}
.a2 p{margin:0 0 3.5mm;text-align:justify}
.a2 .ref{font-size:9pt;margin-bottom:6mm}
.a2 .titre{font-weight:700;text-align:center;margin-bottom:2mm}
.a2 .visa{font-size:10pt;margin-bottom:6mm}
.a2 .ident{margin-bottom:1.5mm}

/* Une valeur absente reste en pointillés : ce document engage
   l'établissement devant une administration fédérale. */
.a2 .manque{color:#000;letter-spacing:.5pt}

.a2 .signature{margin-top:4mm;display:flex;align-items:flex-end;gap:14mm}
.a2 .signature .paraphe{width:52mm;height:19mm;background-image:var(--paraphe);
  background-repeat:no-repeat;background-position:left bottom;background-size:contain}
.a2 .signature .sceau{width:26mm;height:26mm;background-image:var(--sceau);
  background-repeat:no-repeat;background-position:left bottom;background-size:contain}`,
  });

  res.json({ html, credits, manques: [] });
});

export default r;
