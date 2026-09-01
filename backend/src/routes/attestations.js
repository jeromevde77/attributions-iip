// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Attestations de réussite d'unité d'enseignement
//
// Une attestation PAR UNITÉ RÉUSSIE, conformément aux articles 52, 53 et 58
// alinéa 1er du décret du 16 avril 1991. Ce n'est pas le diplôme ni le
// certificat de section : c'est la pièce qui atteste qu'un étudiant a suivi
// avec fruit une unité déterminée.
//
// Le modèle impose des mentions dont l'absence rendrait l'attestation
// irrégulière : le numéro de code approuvé par le Gouvernement, le nombre
// d'ECTS, le total des périodes et leur répartition par activité, la liste des
// acquis d'apprentissage, et le pourcentage obtenu. Ce module refuse de
// produire une pièce incomplète en silence : il signale ce qui manque.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { piedDocument } from './parametres.js';

const r = Router();

export function migrerAttestations(dbx) {
  try {
    // Le lieu de naissance figure sur l'attestation et manquait à la fiche.
    const cols = dbx.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('lieu_naissance')) {
      dbx.exec('ALTER TABLE etudiant ADD COLUMN lieu_naissance TEXT');
      console.log('[migration] etudiant.lieu_naissance ajoutée');
    }
    // Le domaine d'études, propre à l'UE, apparaît sous son intitulé.
    const colsUe = dbx.prepare('PRAGMA table_info(ue)').all().map(c => c.name);
    if (!colsUe.includes('domaine')) {
      dbx.exec('ALTER TABLE ue ADD COLUMN domaine TEXT');
      console.log('[migration] ue.domaine ajoutée');
    }
    if (!colsUe.includes('type_enseignement')) {
      dbx.exec("ALTER TABLE ue ADD COLUMN type_enseignement TEXT");
    }

    // Le domaine et le type d'enseignement relèvent d'abord de la SECTION :
    // « Sciences de la santé publique » vaut pour toutes ses unités. Les porter
    // uniquement sur l'UE obligerait à les ressaisir dix-neuf fois.
    const colsSection = dbx.prepare('PRAGMA table_info(section)').all().map(c => c.name);
    if (!colsSection.includes('domaine')) {
      dbx.exec('ALTER TABLE section ADD COLUMN domaine TEXT');
      console.log('[migration] section.domaine ajoutée');
    }
    if (!colsSection.includes('type_enseignement')) {
      dbx.exec('ALTER TABLE section ADD COLUMN type_enseignement TEXT');
    }
  } catch (e) { console.error('[migration] attestations :', e.message); }
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const frDate = d => {
  if (!d) return '………';
  const [a, m, j] = String(d).slice(0, 10).split('-');
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${Number(j)}${Number(j) === 1 ? 'er' : ''} ${mois[Number(m) - 1] || ''} ${a}`;
};

/** Les UE réussies par un étudiant pour une année, avec ce qu'exige le modèle. */
function unitesReussies(etudId, annee) {
  const insc = db.prepare(`
    SELECT i.ue_num, i.points, i.annee_scolaire
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND i.resultat = 'reussi'
    ORDER BY i.ue_num
  `).all(etudId, annee);

  return insc.map(i => {
    // Le référentiel de l'année de l'inscription, à défaut le plus récent.
    const ue = db.prepare(`
      SELECT * FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
    `).get(i.ue_num, i.annee_scolaire) || {};

    // Domaine et type d'enseignement : ceux de l'UE s'ils sont renseignés,
    // sinon ceux de sa section.
    const sec = ue.section
      ? db.prepare('SELECT domaine, type_enseignement FROM section WHERE code = ?').get(ue.section)
      : null;

    const cours = db.prepare(`
      SELECT cours_nom, cours_per FROM cours
      WHERE ue_num = ? AND cours_code IS NOT NULL
      ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC, cours_code
    `).all(i.ue_num, i.annee_scolaire);

    // Un même cours peut figurer sous plusieurs millésimes : on n'en garde qu'un.
    const vus = new Set();
    const activites = cours.filter(c => !vus.has(c.cours_nom) && vus.add(c.cours_nom));

    // Les acquis d'apprentissage, que le modèle exige d'énumérer.
    let acquis = [];
    try {
      acquis = db.prepare(
        'SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code'
      ).all(i.ue_num);
    } catch { /* table absente ou colonnes différentes : on le signalera */ }

    const totalPeriodes = ue.ue_per_etudiants
      || activites.reduce((s, c) => s + (Number(c.cours_per) || 0), 0);

    // Ce qui manque rendrait l'attestation irrégulière : on l'annonce.
    const manques = [];
    if (!ue.ue_code_fwb) manques.push("le numéro de code approuvé par le Gouvernement");
    if (!ue.ects) manques.push("le nombre d'ECTS");
    if (!(ue.domaine || sec?.domaine)) manques.push("le domaine d'études");
    if (!totalPeriodes) manques.push("le total des périodes");
    if (!activites.length) manques.push("la répartition par activité d'enseignement");
    if (i.points == null) manques.push("le pourcentage obtenu");

    return {
      ue_num: i.ue_num,
      ue_nom: ue.ue_nom || `UE ${i.ue_num}`,
      code_fwb: ue.ue_code_fwb || null,
      ects: ue.ects || null,
      domaine: ue.domaine || sec?.domaine || null,
      type_enseignement: ue.type_enseignement || sec?.type_enseignement
        || 'Enseignement supérieur de type court',
      section: ue.section || null,
      periodes: totalPeriodes || null,
      activites,
      acquis,
      // Le modèle demande un pourcentage ; les résultats sont sur 20.
      pourcentage: i.points != null ? Math.round(Number(i.points) * 5) : null,
      points: i.points,
      manques,
    };
  });
}

/**
 * Enveloppe commune des attestations : mêmes styles, que le document porte une
 * pièce ou cinquante. Elle sert aussi aux pièces séparées d'une archive, pour
 * que chacune reste imprimable seule.
 */
function envelopper(corps, titre = 'Attestations de réussite') {
  // Les images sont posées UNE fois par document, en variables CSS. Répétées
  // par page, un lot de cinq cents attestations pèserait plus de 300 Mo.
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)}</title>
<style>
:root{--sceau:url("${SCEAU_IIP}");--paraphe:url("${SIGNATURE_SOHET}")}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Une attestation tient sur UNE page : les corps sont resserrés et les
     interlignes calculés pour qu'une unité à six acquis et quatre activités
     ne déborde pas. */
  @page { size: A4 portrait; margin: 12mm 15mm 22mm 15mm; }
  @media print { body { padding-bottom: 18mm; } }

  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 9pt;
         color: #1B2B4B; margin: 0; line-height: 1.35; }

  .attestation { break-inside: avoid; }
  .saut { break-after: page; page-break-after: always; height: 0; }

  /* Bandeau marine et filet doré, comme les autres documents de la maison. */
  /* Mention encadrée de deux filets dorés, plutôt qu'en réserve sur marine :
     c'est la présentation des attestations de réussite. */
  .entete { text-align: center; padding: 3.5mm 6mm;
    border-top: 0.9mm solid #C9A84C; border-bottom: 0.9mm solid #C9A84C; }
  .entete .cf { font-size: 8pt; letter-spacing: .7pt; color: #1B2B4B; font-weight: 600; }
  .entete .epa { font-size: 10.5pt; font-weight: 700; letter-spacing: .5pt;
    color: #1B2B4B; margin-top: 1mm; }
  .entete .annee { font-size: 8.5pt; margin-top: 1.2mm; color: #475569; }

  .etab { display: flex; justify-content: space-between; gap: 6mm;
          padding: 3mm 0 2.5mm; border-bottom: 0.4pt solid #cbd5e1; font-size: 8pt;
          color: #475569; }
  .etab .nom { font-weight: 600; color: #1B2B4B; font-size: 9pt; }
  .etab .ident { text-align: right; white-space: nowrap; }

  h1 { font-size: 10.5pt; text-align: center; margin: 5mm 0 1mm; font-weight: 600;
       letter-spacing: .3pt; color: #1B2B4B; }
  h2 { font-size: 12pt; text-align: center; margin: 0 0 1.5mm; font-weight: 700;
       color: #1B2B4B; }
  .filet { width: 40mm; height: 0.8mm; background: #C9A84C; margin: 0 auto 4mm; }

  /* Caractéristiques de l'unité, en deux colonnes pour gagner de la hauteur. */
  .carac { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm;
           background: #f8fafc; border: 0.4pt solid #e2e8f0; border-radius: 1.5mm;
           padding: 2.5mm 3.5mm; font-size: 8.5pt; margin-bottom: 4mm; }
  .carac .large { grid-column: 1 / -1; }
  .carac b { color: #1B2B4B; }

  .corps { text-align: justify; margin: 2.5mm 0; font-size: 9pt; }
  .indente { margin-left: 8mm; }

  /* La personne, en évidence sans excès. */
  .etudiant { background: #eff6ff; border-left: 1mm solid #1B2B4B;
              padding: 2.5mm 3.5mm; margin: 3mm 0; font-size: 9.5pt; }
  .etudiant .nom { font-weight: 700; font-size: 10.5pt; }
  .etudiant .naissance { font-size: 8.5pt; color: #475569; margin-top: 0.8mm; }

  .activites { margin: 1.5mm 0 3mm 8mm; font-size: 8.5pt; }
  ul.acquis { margin: 1.5mm 0 3mm 8mm; padding-left: 4mm; font-size: 8.5pt; }
  ul.acquis li { margin: 0.5mm 0; }

  .resultat { text-align: center; background: #f8fafc; border: 0.4pt solid #e2e8f0;
              border-radius: 1.5mm; padding: 2.5mm; margin: 3mm 0; font-size: 9pt; }
  .resultat .pct { font-size: 13pt; font-weight: 700; color: #1B2B4B; }

  .manque { color: #b45309; font-style: italic; }

  .cloture{display:grid;grid-template-columns:auto 1fr auto;
    grid-template-rows:auto auto;column-gap:14mm;align-items:end;
    margin-top:14mm;page-break-inside:avoid}
  .cloture .lieu{grid-column:2;grid-row:2;font-size:8.5pt;color:#334;
    text-align:center;padding-bottom:1mm}
  /* Les deux images occupent la même ligne et la même hauteur, calées sur
     leur bas : c'est ce qui les met au même niveau quelles que soient
     leurs proportions. */
  .cloture .sceau,
  .cloture .paraphe{grid-row:1;height:22mm;background-repeat:no-repeat;
    background-position:center bottom;background-size:contain}
  .cloture .sceau{grid-column:1;width:22mm;opacity:.92;
    background-image:var(--sceau)}
  .cloture .paraphe{grid-column:3;width:46mm;
    background-image:var(--paraphe)}
  .cloture .legende{grid-column:3;grid-row:2;text-align:center;
    border-top:.4pt solid #94a3b8;padding-top:1mm;width:46mm}
  .cloture .qualite{font-size:8.5pt;color:#334}
  .cloture .nom{font-size:9.5pt;font-weight:700;color:#1B2B4B;letter-spacing:.3px}
  .signatures { width: 100%; border-collapse: collapse; margin-top: 5mm; font-size: 8pt; }
  table.signatures td { border: 0.4pt solid #94a3b8; padding: 1.5mm 2.5mm;
                        vertical-align: top; width: 33.33%; }
  table.signatures tr.hauteur td { height: 16mm; }
  table.signatures .role { color: #475569; font-size: 7.5pt; }

  .pied-lucie { position: fixed; bottom: 0; left: 0; right: 0; height: 16mm;
                padding-top: 1.5mm; border-top: 0.4pt solid #C9A84C; text-align: center; }
  .pied-lucie .txt { font-size: 5.5pt; color: #94a3b8; line-height: 1.3; }

  @media screen {
    html { background: #e5e5e5; }
    body { max-width: 210mm; margin: 16px auto; padding: 12mm 15mm; background: #fff;
           box-shadow: 0 2px 14px rgba(0,0,0,.18); }
    .pied-lucie { position: static; height: auto; margin-top: 8mm; }
  }
</style></head><body>
${corps}
<div class="pied-lucie"><div class="txt">${piedDocument()}</div></div>
</body></html>`;
}

r.get('/etudiant/:id', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json({ etudiant: e, annee, unites: unitesReussies(e.id, annee) });
});

// ── Document ────────────────────────────────────────────────────────────────
function pageAttestation(e, u, annee, etab) {
  // Le titre s'écrit tantôt « Mme », tantôt « Madame » : chercher la seule
  // abréviation produisait une attestation au masculin pour une étudiante.
  const genre = /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test((e.titre || '').trim())
    ? 'F' : 'H';
  const accord = genre === 'F' ? 'elle maîtrise' : 'il maîtrise';

  const activites = u.activites.length
    ? u.activites.map(c => `${esc(c.cours_nom)} (${c.cours_per} périodes)`).join(' ;<br>')
    : '<i style="color:#b45309">répartition par activité à compléter</i>';

  const acquis = u.acquis.length
    ? `<ul class="acquis">${u.acquis.map(a => `<li>${esc(a.description || a.aa_code)}</li>`).join('')}</ul>`
    : '<p class="manque">Les acquis d\'apprentissage de cette unité ne sont pas encodés.</p>';

  return `
<div class="attestation">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT POUR ADULTES</div>
    <div class="annee">Année académique ${esc(annee.replace('-', '/'))}</div>
  </div>

  <div class="etab">
    <div>
      <div class="nom">${esc(etab.etab_nom || 'Institut Ilya Prigogine')}</div>
      <div>${esc(etab.adresse || '')}</div>
    </div>
    <div class="ident">
      Matricule ${esc(etab.num_matricule || '2.132.070')}<br>
      FASE ${esc(etab.num_fase || '292')}
    </div>
  </div>

  <h1>ATTESTATION DE RÉUSSITE D'UNITÉ D'ENSEIGNEMENT</h1>
  <h2>${esc((u.ue_nom || '').toUpperCase())}</h2>
  <div class="filet"></div>

  <div class="carac">
    <div>${esc(u.type_enseignement)}</div>
    <div>${u.domaine ? 'Domaine : ' + esc(u.domaine)
                     : '<span class="manque">Domaine à compléter</span>'}</div>
    <div class="large">Code approuvé par le Gouvernement :
      ${u.code_fwb ? `<b>${esc(u.code_fwb)}</b>`
                   : '<span class="manque">à compléter au référentiel</span>'}</div>
    <div>${u.ects ? `<b>${u.ects}</b> E.C.T.S.`
                  : '<span class="manque">ECTS à compléter</span>'}</div>
    <div>${u.periodes ? `<b>${u.periodes}</b> périodes`
                      : '<span class="manque">périodes à compléter</span>'}</div>
  </div>

  <p class="corps">
    Conformément aux articles 52, 53 et 58 alinéa 1<sup>er</sup> du décret du 16 avril 1991
    organisant l'enseignement de promotion sociale, le Conseil des études, chargé de procéder
    à l'évaluation de l'unité d'enseignement susvisée, atteste que
  </p>

  <div class="etudiant">
    <div class="nom">${esc((e.nom || '').toUpperCase())} ${esc(e.prenom || '')}</div>
    <div class="naissance">
      Né${genre === 'F' ? 'e' : ''} à ${esc(e.lieu_naissance) || '………'},
      le ${frDate(e.date_naissance)}
    </div>
  </div>

  <p class="corps indente">
    a suivi avec fruit, dans l'établissement précité, l'unité d'enseignement susvisée,
    comportant au total <b>${u.periodes || '………'}</b> périodes d'activités d'enseignement
    réparties comme suit :
  </p>
  <div class="activites">${activites}</div>

  <p class="corps">Attendu qu'${accord} tous les acquis d'apprentissage de l'unité
    d'enseignement, soit :</p>
  ${acquis}

  <div class="resultat">
    Le Conseil des études lui délivre la présente attestation, pour laquelle
    ${genre === 'F' ? 'elle obtient' : 'il obtient'}
    <span class="pct">${u.pourcentage != null ? u.pourcentage + ' %' : '………'}</span>
    du total des points.
  </div>

  <!-- Sceau et signature. Le tableau à trois cases (conseil des études,
       sceau, direction) est remplacé par les pièces réelles. -->
  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(etab.localite || 'Anderlecht')},
      le ${frDate(new Date().toISOString())}</div>
    <div class="legende">
      <div class="qualite">Pour le Conseil des études,<br>le Directeur</div>
      <div class="nom">${esc(etab.directeur_nom || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;
}

r.get('/etudiant/:id/document', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  let unites = unitesReussies(e.id, annee);
  const filtre = (req.query.ue || '').split(',').filter(Boolean).map(Number);
  if (filtre.length) unites = unites.filter(u => filtre.includes(u.ue_num));
  if (!unites.length) {
    return res.status(404).json({ error: `Aucune unité réussie en ${annee} pour cet étudiant.` });
  }

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};

  // Une attestation par unité, chacune sur sa propre page : ce sont des pièces
  // distinctes, remises séparément.
  const pages = unites.map(u => pageAttestation(e, u, annee, etab))
    .join('<div class="saut"></div>');

  const html = envelopper(pages, `Attestations — ${e.nom} ${e.prenom}`);

  res.json({
    html,
    nom: `attestations_${(e.nom || '').replace(/\W/g, '_')}_${annee}.html`,
    unites: unites.length,
    manques: unites.filter(u => u.manques.length)
      .map(u => ({ ue_num: u.ue_num, manques: u.manques })),
  });
});

// ── Sélection pour une génération groupée ───────────────────────────────────
// On croise librement années, sections, unités et étudiants. Chaque couple
// « étudiant × unité réussie » donne une attestation : ce sont des pièces
// distinctes, et c'est à cette maille que la sélection se raisonne.
r.get('/candidats', authRequired, (req, res) => {
  const annees = (req.query.annees || '').split(',').filter(Boolean);
  const sections = (req.query.sections || '').split(',').filter(Boolean);
  const ues = (req.query.ues || '').split(',').filter(Boolean).map(Number);
  const etudiants = (req.query.etudiants || '').split(',').filter(Boolean).map(Number);

  if (!annees.length) return res.status(400).json({ error: 'au moins une année requise' });

  const perim = getUserSections(req.user);

  const clauses = [`i.resultat = 'reussi'`,
                   `i.annee_scolaire IN (${annees.map(() => '?').join(',')})`];
  const params = [...annees];

  if (ues.length) {
    clauses.push(`i.ue_num IN (${ues.map(() => '?').join(',')})`);
    params.push(...ues);
  }
  if (etudiants.length) {
    clauses.push(`i.etudiant_id IN (${etudiants.map(() => '?').join(',')})`);
    params.push(...etudiants);
  }

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.annee_scolaire, i.points,
           e.nom, e.prenom, e.id_ecampus,
           -- SQLite n'admet pas de référence à l'alias externe « i » dans le
           -- ORDER BY d'une sous-requête : on prend simplement le millésime le
           -- plus récent, l'intitulé et la section d'une unité ne variant pas
           -- d'une année à l'autre.
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT section FROM ue u WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY e.nom, e.prenom, i.annee_scolaire, i.ue_num
  `).all(...params);

  // Le filtre par section s'applique après coup : la section vient d'une
  // sous-requête, elle n'est pas disponible dans la clause WHERE.
  const retenues = lignes.filter(l => {
    if (perim && l.section && !perim.includes(l.section)) return false;
    if (sections.length && !sections.includes(l.section)) return false;
    return true;
  });

  res.json({
    candidats: retenues,
    total: retenues.length,
    etudiants: new Set(retenues.map(l => l.etudiant_id)).size,
  });
});

// ── Génération groupée ──────────────────────────────────────────────────────
r.post('/lot', authRequired, (req, res) => {
  const { paires, separes } = req.body || {};
  if (!Array.isArray(paires) || !paires.length) {
    return res.status(400).json({ error: 'aucune attestation demandée' });
  }
  // En un seul document, les images du sceau et de la signature ne sont posées
  // qu'une fois. En pièces séparées, CHACUNE les porte pour rester imprimable
  // seule — d'où un plafond plus bas : cinq cents pièces feraient 300 Mo dans
  // le navigateur.
  const plafond = separes ? 120 : 500;
  if (paires.length > plafond) {
    return res.status(400).json({
      error: `${paires.length} attestations demandées, maximum ${plafond} `
           + (separes
              ? `en pièces séparées : chacune porte le sceau et la signature, et `
              + `le navigateur ne suivrait pas. Restreignez la sélection, ou `
              + `choisissez le document unique qui accepte 500 attestations.`
              : `: restreignez la sélection, par section ou par année.`),
    });
  }

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const cacheEtud = {};
  const cacheUnites = {};

  const documents = [];
  const manquants = [];

  for (const p of paires) {
    const etudId = Number(p.etudiant_id);
    const e = cacheEtud[etudId]
      || (cacheEtud[etudId] = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId));
    if (!e) continue;

    const cle = `${etudId}|${p.annee_scolaire}`;
    const unites = cacheUnites[cle]
      || (cacheUnites[cle] = unitesReussies(etudId, p.annee_scolaire));
    const u = unites.find(x => x.ue_num === Number(p.ue_num));
    if (!u) continue;

    if (u.manques.length) manquants.push({ etudiant: `${e.nom} ${e.prenom}`, ue_num: u.ue_num, manques: u.manques });

    // Nom de fichier demandé : nom_prénom, numéro d'UE, année académique.
    const propre = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    documents.push({
      nom_fichier: `${propre(e.nom)}_${propre(e.prenom)}_UE${u.ue_num}_${p.annee_scolaire}.html`,
      etudiant: `${e.nom} ${e.prenom}`,
      ue_num: u.ue_num,
      annee: p.annee_scolaire,
      corps: pageAttestation(e, u, p.annee_scolaire, etab),
    });
  }

  if (!documents.length) {
    return res.status(404).json({ error: 'Aucune attestation n\'a pu être produite.' });
  }

  res.json({
    documents: separes ? documents : undefined,
    // En un seul document, les attestations s'enchaînent, chacune sur sa page.
    html: separes ? undefined : envelopper(
      documents.map(d => d.corps).join('<div class="saut"></div>')),
    // Chaque pièce séparée porte la même enveloppe, pour rester imprimable seule.
    enveloppe: separes ? envelopper('__CORPS__') : undefined,
    total: documents.length,
    manquants: manquants.slice(0, 40),
    nb_manquants: manquants.length,
  });
});

export default r;
