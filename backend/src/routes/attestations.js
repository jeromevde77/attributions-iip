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
import { authRequired } from '../middleware/auth.js';
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
    if (!totalPeriodes) manques.push("le total des périodes");
    if (!activites.length) manques.push("la répartition par activité d'enseignement");
    if (i.points == null) manques.push("le pourcentage obtenu");

    return {
      ue_num: i.ue_num,
      ue_nom: ue.ue_nom || `UE ${i.ue_num}`,
      code_fwb: ue.ue_code_fwb || null,
      ects: ue.ects || null,
      domaine: ue.domaine || null,
      type_enseignement: ue.type_enseignement || 'Enseignement supérieur de type court',
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
    <div><b>COMMUNAUTÉ FRANÇAISE DE BELGIQUE</b></div>
    <div><b>ENSEIGNEMENT DE PROMOTION SOCIALE</b></div>
    <div class="annee"><b>ANNÉE ACADÉMIQUE : ${esc(annee.replace('-', '/'))}</b></div>
  </div>

  <div class="etab">
    <div><b>${esc(etab.etab_nom || 'INSTITUT ILYA PRIGOGINE')}</b></div>
    <div>Adresse : ${esc(etab.adresse || '')}</div>
    <div class="ident">
      Numéro de matricule : ${esc(etab.num_matricule || '2.132.070')}<br>
      Numéro FASE : ${esc(etab.num_fase || '292')}
    </div>
  </div>

  <h1>ATTESTATION DE RÉUSSITE DE L'UNITÉ D'ENSEIGNEMENT</h1>
  <h2>${esc((u.ue_nom || '').toUpperCase())}</h2>

  <div class="carac">
    <div>${esc(u.type_enseignement)}</div>
    ${u.domaine ? `<div>Domaine : ${esc(u.domaine)}</div>`
                : '<div class="manque">Domaine : à compléter au référentiel</div>'}
    <div>Unité d'enseignement approuvée par le Gouvernement sous le numéro de code :
      ${u.code_fwb ? `<b>${esc(u.code_fwb)}</b>`
                   : '<span class="manque">à compléter au référentiel</span>'}</div>
    <div>Cette unité d'enseignement représente
      ${u.ects ? `<b>${u.ects}</b> E.C.T.S.`
               : '<span class="manque">— ECTS à compléter</span>'}</div>
  </div>

  <p class="corps">
    Conformément aux articles 52, 53 et 58 alinéa 1<sup>er</sup> du décret du 16 avril 1991
    organisant l'enseignement de promotion sociale, le Conseil des études, chargé de procéder
    à l'évaluation de l'unité d'enseignement susvisée, atteste que
  </p>

  <div class="etudiant">
    <b>${esc((e.nom || '').toUpperCase())} ${esc(e.prenom || '')} (${genre})</b><br>
    Né${genre === 'F' ? 'e' : ''} à ${esc(e.lieu_naissance) || '………'},
    le ${frDate(e.date_naissance)},
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

  <p class="corps">
    Le Conseil des études lui délivre la présente attestation pour laquelle
    ${genre === 'F' ? 'elle obtient' : 'il obtient'}
    <b>${u.pourcentage != null ? u.pourcentage : '………'}</b> pour cent du total des points.
  </p>

  <table class="signatures">
    <tr>
      <td>Le Conseil des études,</td>
      <td>Sceau de l'établissement</td>
      <td>Fait à ${esc(etab.localite || 'Anderlecht')}, le ${frDate(new Date().toISOString())}</td>
    </tr>
    <tr class="hauteur"><td></td><td></td><td>Le Directeur, ${esc(etab.directeur_nom || 'SOHET Charles')}</td></tr>
  </table>
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

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Attestations — ${esc(e.nom)} ${esc(e.prenom)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 16mm 18mm 26mm 18mm; }
  @media print { body { padding-bottom: 22mm; } }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; color: #000;
         margin: 0; line-height: 1.45; }
  .attestation { break-inside: avoid; }
  .saut { break-after: page; page-break-after: always; height: 0; }
  .entete { text-align: center; font-size: 11pt; margin-bottom: 6mm; }
  .entete .annee { margin-top: 3mm; }
  .etab { margin-bottom: 6mm; font-size: 11pt; }
  .etab .ident { margin-left: 10mm; margin-top: 1.5mm; }
  h1 { font-size: 12.5pt; text-align: center; margin: 6mm 0 2mm; font-weight: bold; }
  h2 { font-size: 13pt; text-align: center; margin: 0 0 4mm; font-weight: bold; }
  .carac { margin-bottom: 5mm; }
  .carac div { margin: 1mm 0; }
  .corps { text-align: justify; margin: 3mm 0; }
  .indente { margin-left: 14mm; }
  .etudiant { margin: 4mm 0; }
  .activites { margin: 2mm 0 4mm 14mm; }
  ul.acquis { margin: 2mm 0 4mm 14mm; padding-left: 5mm; }
  ul.acquis li { margin: 0.8mm 0; }
  .manque { color: #b45309; font-style: italic; }
  table.signatures { width: 100%; border-collapse: collapse; margin-top: 10mm; font-size: 10.5pt; }
  table.signatures td { border: 0.5pt solid #000; padding: 2mm 3mm; vertical-align: top;
                        width: 33.33%; }
  table.signatures tr.hauteur td { height: 22mm; }
  .pied-lucie { position: fixed; bottom: 0; left: 0; right: 0; height: 20mm;
                padding-top: 2mm; border-top: 0.5pt solid #C9A84C; text-align: center; }
  .pied-lucie .txt { font-size: 6pt; color: #888; line-height: 1.35; }
  @media screen {
    html { background: #e5e5e5; }
    body { max-width: 210mm; margin: 16px auto; padding: 18mm; background: #fff;
           box-shadow: 0 2px 14px rgba(0,0,0,.18); }
    .pied-lucie { position: static; height: auto; margin-top: 10mm; }
  }
</style></head><body>
${pages}
<div class="pied-lucie"><div class="txt">${piedDocument()}</div></div>
</body></html>`;

  res.json({
    html,
    nom: `attestations_${(e.nom || '').replace(/\W/g, '_')}_${annee}.html`,
    unites: unites.length,
    manques: unites.filter(u => u.manques.length)
      .map(u => ({ ue_num: u.ue_num, manques: u.manques })),
  });
});

export default r;
