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
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { SIGNATURE_SOHET } from '../services/assets/signature_sohet.js';

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
  const credits = bilanCredits(e.id, annee);
  const formation = formationDe(e.id, annee);

  const a1 = annee.split('-')[0], a2 = annee.split('-')[1];
  // Un champ vide se signale à l'écran plutôt que de passer inaperçu.
  const champ = v => v != null && v !== ''
    ? `<b>${esc(v)}</b>`
    : '<span class="manque">…………………</span>';

  const corps = `
<div class="a2">
  <!-- Bandeau institutionnel, comme sur l'attestation de réussite : ce
       document part à une administration fédérale, il doit se rattacher à
       l'établissement au premier regard. -->
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">${esc((etab.etab_nom || 'INSTITUT ILYA PRIGOGINE').toUpperCase())}</div>
    <div class="annee">Enseignement supérieur pour adultes${
      etab.code_fase ? ' · N° FASE ' + esc(etab.code_fase) : ''}</div>
  </div>

  <h1>Attestation du progrès des études</h1>
  <div class="sous-titre">au terme de l'année académique ${esc(a1)}–${esc(a2)}</div>

  <div class="visa">
    Formulaire standard visé à l'article 103, §1er, alinéa 1er, 5°, de l'arrêté royal
    du 8 octobre 1981 sur l'accès au territoire, le séjour, l'établissement et
    l'éloignement des étrangers — annexe 2 de l'arrêté ministériel du 28 mars 2022.
  </div>

  <p class="soussigne">
    Je soussigné(e) ${champ((etab.directeur_nom || 'CHARLES SOHET').toUpperCase())},
    en ma qualité de représentant(e) de
    ${champ(etab.etab_nom || 'Institut Ilya Prigogine')},
    confirme que l'étudiant(e) nommé(e) ci-dessous :
  </p>

  <!-- L'identité, en carte : c'est la première chose que l'Office vérifie. -->
  <table class="ident">
    <tr>
      <td class="lib">Nom</td><td class="val">${champ((e.nom || '').toUpperCase())}</td>
      <td class="lib">Date de naissance</td><td class="val">${champ(frDate(e.date_naissance))}</td>
    </tr>
    <tr>
      <td class="lib">Prénom</td><td class="val">${champ(e.prenom)}</td>
      <td class="lib">Nationalité</td><td class="val">${champ(e.nationalite)}</td>
    </tr>
  </table>

  <!-- Les quatre nombres que l'Office examine, sortis du texte où ils se
       noyaient. Les phrases réglementaires les reprennent en dessous. -->
  <table class="credits">
    <tr>
      <th>Inscrits ${esc(a1)}-${esc(a2)}</th>
      <th>Obtenus cette année</th>
      <th>Obtenus au total</th>
      <th>Dispense</th>
      <th>Total de la formation</th>
    </tr>
    <tr>
      <td>${credits.inscritsAnnee || '—'}</td>
      <td>${credits.acquisAnnee}</td>
      <td class="fort">${credits.acquisTotal}</td>
      <td>${credits.valorises || 0}</td>
      <td>${formation.totalCredits || '…'}</td>
    </tr>
  </table>

  <p>était inscrit(e) pour ${champ(credits.inscritsAnnee || null)} crédits pour la
     formation ${champ(formation.libelle)} pour l'année académique
     <b>${esc(a1)}-${esc(a2)}</b>. Cette formation comprend
     ${champ(formation.totalCredits)} crédits au total et ayant obtenu ou valorisé
     des crédits antérieurement, l'étudiant(e) obtient une dispense pour
     <b>${credits.valorises || 0}</b> crédits de la formation.</p>

  <p>Il/elle a obtenu <b>${credits.acquisAnnee}</b> crédits durant l'année académique
     <b>${esc(a1)}-${esc(a2)}</b> et le nombre de crédits qu'il/elle a obtenus à ce jour
     au total dans sa formation est donc de <b>${credits.acquisTotal}</b> crédits.</p>

  <div class="champ-libre">
    <div class="etiq">Raisons pour lesquelles les crédits n'ont pas été obtenus</div>
    <div class="rep">${champ(motif)}</div>
  </div>

  <div class="champ-libre">
    <div class="etiq">Avis facultatif sur le déroulement des études</div>
    <div class="rep">${champ(avis || 'Néant')}</div>
  </div>

  <p class="note">Le relevé de notes doit être joint au présent formulaire afin
     d'informer l'Office des Étrangers le plus complètement possible.</p>

  <div class="cloture">
    <div class="lieu">Fait à <b>${esc(etab.localite || 'Anderlecht')}</b>,<br>
      le <b>${frDate(date_document || new Date().toISOString())}</b></div>
    <div class="sig">
      <div class="lib">Signature du représentant de l'établissement</div>
      <div class="paraphe"></div>
      <div class="nom">${esc(etab.directeur_nom || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps,
    titre: '',
    logo: LOGO_IIP_JPEG,
    // 18 mm ne laissaient qu'un millimètre de marge : le moindre nom un peu
    // long faisait basculer la signature sur une seconde page.
    margeHaut: 12, margeCote: 15,
    styles: `
:root{--paraphe:url("${SIGNATURE_SOHET}")}

.a2{font-size:9.5pt;line-height:1.4;color:#1B2B4B}

/* Bandeau institutionnel, entre deux filets dorés — celui de l'attestation. */
.a2 .entete{text-align:center;padding:3mm 6mm;margin-bottom:5mm;
  border-top:.9mm solid #C9A84C;border-bottom:.9mm solid #C9A84C}
.a2 .entete .cf{font-size:7.5pt;letter-spacing:.7pt;font-weight:600}
.a2 .entete .epa{font-size:11pt;font-weight:700;letter-spacing:.4pt;margin-top:1mm}
.a2 .entete .annee{font-size:8pt;margin-top:1mm;color:#475569}

.a2 h1{font-size:13pt;text-align:center;margin:0;letter-spacing:.2pt}
.a2 .sous-titre{text-align:center;font-size:10pt;color:#334155;margin:.5mm 0 3mm}

/* Le visa réglementaire : présent car obligatoire, discret car ce n'est pas
   ce que l'agent lit. */
.a2 .visa{font-size:7pt;color:#64748b;text-align:center;line-height:1.35;
  margin-bottom:5mm;padding:0 8mm}

.a2 p{margin:2mm 0;text-align:justify}
.a2 .soussigne{margin-bottom:3mm}
.a2 .note{font-size:8pt;color:#64748b;font-style:italic;margin-top:4mm}

/* L'identité en carte bleu pâle : c'est ce que l'Office vérifie d'abord. */
.a2 table.ident{width:100%;border-collapse:collapse;margin:0 0 4mm;
  background:#F1F5F9;border:.4pt solid #cbd5e1}
.a2 table.ident td{border:0;padding:1.6mm 3mm;font-size:9.5pt;vertical-align:baseline}
.a2 table.ident td.lib{color:#64748b;font-size:7.5pt;text-transform:uppercase;
  letter-spacing:.3pt;width:26mm;white-space:nowrap}
.a2 table.ident td.val{font-weight:600}

/* Les chiffres, sortis du texte où ils se noyaient. */
.a2 table.credits{width:100%;border-collapse:collapse;margin:0 0 4mm}
.a2 table.credits th{background:#1B2B4B;color:#fff;font-size:7pt;font-weight:600;
  text-transform:uppercase;letter-spacing:.3pt;padding:1.4mm 2mm;
  text-align:center;border:.4pt solid #1B2B4B}
.a2 table.credits td{text-align:center;font-size:13pt;font-weight:700;
  padding:2mm;border:.4pt solid #cbd5e1;border-top:0}
.a2 table.credits td.fort{color:#C9A84C}

/* Les champs à remplir : encadrés, pour qu'on voie qu'ils attendent une
   réponse plutôt que de les confondre avec le texte. */
.a2 .champ-libre{border:.4pt solid #cbd5e1;border-left:1.2mm solid #C9A84C;
  padding:1.8mm 3mm;margin:2.5mm 0;page-break-inside:avoid}
.a2 .champ-libre .etiq{font-size:7.5pt;color:#64748b;text-transform:uppercase;
  letter-spacing:.3pt;margin-bottom:.8mm}
.a2 .champ-libre .rep{font-size:9.5pt}

/* Une valeur que Lucie ne connaît pas se voit, pour être complétée à la main. */
.a2 .manque{color:#b45309;letter-spacing:.5pt}

/* Lieu à gauche, signature à droite, alignés sur une même ligne de base. */
.a2 .cloture{display:flex;align-items:flex-end;justify-content:space-between;
  gap:10mm;margin-top:8mm;page-break-inside:avoid}
.a2 .cloture .lieu{font-size:9.5pt;padding-bottom:1mm}
.a2 .sig{text-align:center;min-width:52mm}
.a2 .sig .lib{font-size:7.5pt;color:#64748b;margin-bottom:.5mm}
.a2 .sig .paraphe{height:15mm;width:46mm;margin:0 auto;
  background-image:var(--paraphe);background-repeat:no-repeat;
  background-position:center bottom;background-size:contain}
.a2 .sig .nom{font-size:9.5pt;font-weight:700;border-top:.4pt solid #94a3b8;
  width:46mm;margin:0 auto;padding-top:1mm}`,
  });

  res.json({ html, credits, manques: [] });
});

export default r;
