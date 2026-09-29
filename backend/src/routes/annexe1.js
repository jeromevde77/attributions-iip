/**
 * annexe1.js — Formulaire standard pour l'obtention d'un visa ou d'un titre de
 * séjour en tant qu'étudiant (ressortissant d'un pays tiers).
 *
 * Annexe 1 de l'arrêté ministériel du 28 mars 2022, visée à l'article 99 de
 * l'arrêté royal du 8 octobre 1981 — la sœur de l'annexe 2 (routes/annexe2.js),
 * dont elle reprend la règle : forme imposée, aucune valeur devinée. Ce que
 * Lucie ne sait pas reste en pointillés ; ce qui est une appréciation (les
 * raisons d'un programme sous 54 crédits, les conditions d'admission) reste à
 * la main de la direction.
 *
 * L'INTITULÉ DU GRADE ET LE TOTAL DE CRÉDITS viennent de la fiche de section
 * (Configuration → Attestation → Sections & diplômes), la même que lit le
 * diplôme : deux intitulés pour un même titre finiraient par diverger.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { identiteEtablissement } from './config.js';
import { sectionRattachement } from './etudiants.js';
import { donneesSectionDiplome } from './diplomes.js';
import { frDate, bilanCredits } from './annexe2.js';

const r = express.Router();
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = iso => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : frDate(iso); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* LES SIX SITUATIONS DU MODÈLE — une seule se coche. */
export const SITUATIONS = {
  definitive: 'A obtenu une inscription définitive',
  echange: "Est accepté(e) comme étudiant d'échange",
  preparatoire_inscrit: 'Est inscrit(e) à une année préparatoire',
  admis: 'Est admis(e) aux études (inscription non encore définitive)',
  preparatoire_admis: 'Est admis(e) à une année préparatoire',
  examen: "Est inscrit(e) à un examen ou une épreuve d'admission",
};

function formation(etudId, annee) {
  let section = null;
  try { section = sectionRattachement(etudId, annee).section || null; } catch { /* */ }
  const ds = section ? donneesSectionDiplome(section) : {};
  return {
    section,
    grade: ds.grade_academique || ds.intitule_section || null,
    total_ects: Number(ds.total_ects) || null,
  };
}

r.get('/donnees/:etudiantId', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'année requise' });
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(req.params.etudiantId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  const f = formation(e.id, annee);
  const credits = bilanCredits(e.id, annee);
  const inscrit = db.prepare('SELECT COUNT(*) n FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
    .get(e.id, annee).n > 0;
  const manques = [];
  if (!e.nationalite) manques.push('la nationalité');
  if (!e.date_naissance) manques.push('la date de naissance');
  if (!f.grade) manques.push("l'intitulé du grade (Configuration → Attestation → Sections & diplômes)");
  if (!f.total_ects) manques.push('le nombre total de crédits de la formation (même fiche)');
  if (credits.sansEcts) manques.push(`les ECTS de ${credits.sansEcts} unité(s) — le programme annuel est sous-évalué`);
  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom, date_naissance: frDate(e.date_naissance), nationalite: e.nationalite || null },
    annee, formation: f, credits_annee: credits.inscritsAnnee,
    situation_proposee: inscrit ? 'definitive' : 'admis',
    situations: SITUATIONS, manques,
  });
});

r.post('/document', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(b.etudiant_id);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  const annee = String(b.annee || '');
  if (!/^\d{4}-\d{4}$/.test(annee)) return res.status(400).json({ error: 'année requise' });
  const situation = SITUATIONS[b.situation] ? b.situation : 'definitive';
  const ident = identiteEtablissement();
  const f = formation(e.id, annee);
  const credits = bilanCredits(e.id, annee);

  const vide = '<span class="manque">…………………</span>';
  const champ = v => (v != null && v !== '' ? `<b>${esc(v)}</b>` : vide);
  const date = v => (v ? `<b>${esc(frDate(v))}</b>` : '……/……/20……');
  const bx = on => `<span class="bx">${on ? '☒' : '☐'}</span>`;
  const coche = k => bx(situation === k);
  const def = situation === 'definitive';
  const admis = situation === 'admis' || situation === 'preparatoire_admis';
  const mobilite = b.mobilite === true || b.mobilite === 'oui';

  const corps = `
<div class="a1">
  <p class="ref">Annexe 1 de l’arrêté ministériel du 28 mars 2022 déterminant les formulaires standard visés aux
    articles 99, 103 et 104/3 de l'arrêté royal du 8 octobre 1981 sur l'accès au territoire, le séjour,
    l'établissement et l'éloignement des étrangers.</p>
  <p class="titre">MODÈLE DE FORMULAIRE STANDARD</p>
  <p class="visa">pour l’obtention d’un visa ou d’un titre de séjour en tant qu’étudiant(e) (ressortissant
    d’un pays tiers), visé à l’article 99 de l’arrêté royal du 8 octobre 1981 sur l'accès au territoire, le
    séjour, l'établissement et l'éloignement des étrangers</p>
  <p class="logo">Logo de l'établissement d'enseignement supérieur (facultatif) :
    <img src="${LOGO_IIP_JPEG}" alt="" /></p>

  <p>Je soussigné <sup>(1)</sup> : ${champ(`${(ident.directeur || 'SOHET Charles')}, Directeur`)}</p>
  <p>En ma qualité de représentant de <sup>(2)</sup> : ${champ(ident.nom || 'Institut Ilya Prigogine')}</p>
  <p>Confirme que l'étudiant nommé ci-dessous :</p>
  <p class="ident">Nom : ${champ((e.nom || '').toUpperCase())}</p>
  <p class="ident">Prénom : ${champ(e.prenom)}</p>
  <p class="ident">Date de naissance : ${champ(frDate(e.date_naissance))}</p>
  <p class="ident">Nationalité : ${champ(e.nationalite)}</p>

  <p class="case">${coche('definitive')} A obtenu une inscription définitive pour suivre des études supérieures à temps
    plein en qualité d’étudiant(e) régulièrement inscrit(e) durant l’année académique ${esc(annee)}</p>
  <p class="case">${coche('echange')} Est accepté(e) au sein de l’établissement d’enseignement supérieur
    susmentionné comme étudiant d’échange du ${situation === 'echange' ? date(b.echange_du) : '……/……/20……'}
    au ${situation === 'echange' ? date(b.echange_au) : '……/……/20……'}</p>
  <p class="case">${coche('preparatoire_inscrit')} Est inscrit(e) à une année préparatoire durant l’année
    académique ${esc(annee)}</p>
  <p class="case">${coche('admis')} Est admis(e) aux études en vue de suivre des études supérieures à temps plein
    durant l’année académique ${esc(annee)} avec comme date ultime d’inscription le
    ${situation === 'admis' ? date(b.date_ultime) : '…… /…… /20……'} <sup>(3)</sup></p>
  <p class="case">${coche('preparatoire_admis')} Est admis(e) à une année préparatoire durant l’année académique
    ${esc(annee)} avec comme date ultime d’inscription le
    ${situation === 'preparatoire_admis' ? date(b.date_ultime) : '…… /…… /20……'} <sup>(3)</sup></p>
  <p class="case">${coche('examen')} Est inscrit(e) à un examen ou une épreuve d’admission pour suivre des études
    supérieures à temps plein durant l’année académique ${esc(annee)}</p>

  <p>Intitulé du grade académique correspondant au programme d’études <sup>(4)</sup> : ${champ(b.grade || f.grade)}</p>
  <p>Le programme d’études comprend un nombre total de ${champ(b.total_ects || f.total_ects)} crédits ECTS
    <sup>(5)</sup>, pour l’ensemble de la formation, sous réserve d’ajouts d’enseignements complémentaires qui
    pourront être imposés à l'étudiant, ou de dispense(s) qu’il aurait obtenue(s) (avec un minimum de 54 crédits
    par année académique).</p>
  <p>Cette année académique, l'étudiant effectuera une mobilité, dans le cadre d’un programme de l’Union ou un
    programme multilatéral comportant des mesures de mobilité ou d’une convention entre deux établissements
    d’enseignement supérieur ou plus, dans un ou des établissements d’enseignement supérieur situé(s) dans un
    autre État membre de l’Union européenne en vue d’acquérir un certain nombre de crédits ou un diplôme
    conjoint (unique ou multiple) : ${bx(mobilite)} OUI &nbsp; ${bx(!mobilite)} NON</p>
  <p>Si OUI : la durée de la mobilité est a priori de ${mobilite ? champ(b.mobilite_mois) : '……'} mois.</p>

  <p><i>Si, et seulement si, l'étudiant a obtenu une inscription définitive, remplissez les champs suivants (si déjà
    connu) :</i></p>
  <ul>
    <li>Le programme annuel de l'étudiant correspond à un nombre total de
      ${def ? champ(b.credits_annee ?? credits.inscritsAnnee) : '……'} crédits pour l’année académique ${esc(annee)}</li>
    <li>Si le programme annuel de l'étudiant inclut moins de 54 crédits, veuillez en préciser les raisons (par exemple
      année diplômante, motif pédagogique, doctorant, année de spécialisation, international scholar, maladie etc.) :
      ${def ? champ(b.raisons) : '……'}</li>
  </ul>
  <p><i>Si, et seulement si, l'étudiant est admis aux études, mais n’a pas encore obtenu d’inscription
    définitive, remplissez les champs suivants :</i></p>
  <ul>
    <li>Si l’inscription définitive de l'étudiant est dépendante de conditions d’admission spécifiques,
      détaillez-les ci-après <sup>(6)</sup> : ${admis ? champ(b.conditions) : '……'}</li>
  </ul>

  <p>Fait à ${esc(b.lieu || ident.ville || 'Anderlecht')}, le ${esc(dateLongue(b.date_document || new Date().toISOString().slice(0, 10)))}.</p>
  <p>Signature du représentant de l'établissement précité :</p>
  <div class="signature"><div class="paraphe"></div><div class="sceau"></div></div>
  <p class="signataire">Directeur<br><b>${esc(ident.directeur || 'SOHET Charles')}</b></p>

  <div class="notes">
    <p>(1) Nom, prénom et fonction du représentant de l’établissement d’enseignement supérieur</p>
    <p>(2) Nom de l’établissement d’enseignement supérieur</p>
    <p>(3) Sauf dérogation (pour la FWB : cf. art. 101, alinéa 1er du décret du 7 novembre 2013 définissant le paysage
      de l'enseignement supérieur et l'organisation académique des études (= décret « paysage »))</p>
    <p>(4) Indiquer l’intitulé du grade académique correspondant au programme d’études, tel que repris dans la
      législation d’application (graduat, brevet d’enseignement supérieur, bachelier, bachelier de spécialisation,
      master, master de spécialisation, post-graduat, etc.)</p>
    <p>(5) Il s’agit du nombre « standard » de crédits que comprend la formation (par exemple : 60, 120 ou 180)</p>
    <p>(6) Les conditions particulières visées ici sont propres à l’admission de l’étudiant et conditionneront la
      régularisation de son inscription (par exemple l’équivalence du diplôme secondaire délivrée par la FWB). Les
      conditions d’inscription à proprement parler (telles que le paiement du minerval) ne doivent pas être reprises
      dans cet espace.</p>
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps, titre: '',
    // Comme l'annexe 2 : le modèle officiel n'a ni en-tête ni pied de page.
    avecPied: false, entete: false, logo: false, margeHaut: 16, margeCote: 18,
    styles: `
:root{--paraphe:url("${SIGNATURE_SOHET}");--sceau:url("${SCEAU_IIP}")}
.a1{font-size:10pt;line-height:1.35;color:#000;font-family:Calibri,Arial,sans-serif}
.a1 p{margin:0 0 2.2mm;text-align:justify}
.a1 .ref{font-size:8.5pt;margin-bottom:4mm}
.a1 .titre{font-weight:700;text-align:center;margin-bottom:1mm}
.a1 .visa{text-align:center;font-size:9.5pt;margin-bottom:3mm}
.a1 .logo img{height:12mm;vertical-align:middle;margin-left:3mm}
.a1 .ident{margin:0 0 1mm 8mm}
.a1 .case{margin-left:4mm;text-indent:-5mm;padding-left:5mm}
.a1 .bx{font-size:13pt;line-height:1;vertical-align:-1.5pt;margin-right:1.2mm}
.a1 ul{margin:0 0 2.2mm 5mm;padding-left:4mm}
.a1 li{margin-bottom:1mm}
.a1 sup{font-size:7pt}
.a1 .manque{letter-spacing:.5pt}
.a1 .signature{margin-top:2mm;display:flex;align-items:flex-end;gap:12mm}
.a1 .signature .paraphe{width:46mm;height:17mm;background-image:var(--paraphe);background-repeat:no-repeat;
  background-position:left bottom;background-size:contain}
.a1 .signature .sceau{width:22mm;height:22mm;background-image:var(--sceau);background-repeat:no-repeat;
  background-position:left bottom;background-size:contain}
.a1 .signataire{margin-top:1mm}
.a1 .notes{margin-top:4mm;border-top:0.4pt solid #000;padding-top:1.5mm}
.a1 .notes p{font-size:7.5pt;margin:0 0 0.8mm;line-height:1.25}`,
  });
  res.json({ html, manques: [] });
});

export default r;
