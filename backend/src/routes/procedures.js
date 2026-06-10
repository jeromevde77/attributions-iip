/**
* procedures.js — Routes de génération des PV (Recours + Fraude)
* Les templates sont stockés dans document_template avec slug='pv-recours' / 'pv-fraude'.
* Le backend calcule les sections variables ({{pv.xxx}}) et délègue au moteur de templates.
*/
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { getParam, getParamNum } from './parametres.js';

const r = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS_FR  = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];

function dateLongue(s) {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00');
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function addJoursOuv(date, n) {
  const d = new Date(date + 'T12:00:00'); let c = 0;
  while (c < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) c++; }
  return d;
}
function addJoursCal(date, n) {
  const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); return d;
}

function tableComposition(membres, annee) {
  if (!membres || !membres.length) return '';
  return `<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:8px 0">
    <thead><tr style="background:#1F3864;color:white">
      <th style="text-align:left;padding:5px 8px;border:1px solid #ccc">Membre</th>
      <th style="padding:5px 8px;border:1px solid #ccc;text-align:left">Qualité</th>
      <th style="padding:5px 8px;border:1px solid #ccc;text-align:center">Présent</th>
    </tr></thead>
    <tbody>${membres.map((m,i) => `<tr style="background:${i%2===0?'#f9f9f9':'white'}">
      <td style="padding:4px 8px;border:1px solid #ccc;font-weight:bold">${m.nomComplet || m.prenom+' '+m.nom}</td>
      <td style="padding:4px 8px;border:1px solid #ccc">${m.qualite || 'Membre du CDE'}</td>
      <td style="padding:4px 8px;border:1px solid #ccc;text-align:center">✓</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─── Générer un PV depuis un template (slug) + données variables ──────────────
function genererDepuisTemplate(slug, vars) {
  const tpl = db.prepare(`SELECT contenu FROM document_template WHERE slug = ?`).get(slug);
  if (!tpl) return null;

  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  const now  = new Date();

  // Directeur : tiré du personnel d'établissement (fonction = 'Directeur') → fiche professeur.
  // Alimente les champs {{directeur.*}} proposés par l'éditeur, sinon ils seraient effacés.
  let directeurVars = { 'directeur.nom_prenom': '', 'directeur.qualite': 'Directeur', 'directeur.email': '' };
  const dirPe = db.prepare(
    "SELECT professeur_id, fonction FROM personnel_etablissement WHERE fonction = 'Directeur' ORDER BY ordre LIMIT 1"
  ).get();
  if (dirPe) {
    const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(dirPe.professeur_id) || {};
    directeurVars = {
      'directeur.nom_prenom': p.nom ? `${p.nom} ${p.prenom || ''}`.trim() : '',
      'directeur.qualite':    dirPe.fonction || 'Directeur',
      'directeur.email':      p.email || '',
    };
  }

  const allVars = {
    'sys.date':     now.toLocaleDateString('fr-BE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }),
    'sys.annee':    db.prepare(`SELECT code FROM annee_scolaire WHERE active = 1`).get()?.code || '2026-2027',
    'etab.etab_nom': etab.etab_nom || 'Institut Ilya Prigogine',
    ...directeurVars,
    ...vars,
  };

  // Champs présents dans le template mais NON fournis par la procédure : ils seraient
  // effacés silencieusement → on les remonte pour avertir l'utilisateur à la génération.
  const champsUtilises = [...new Set(
    [...tpl.contenu.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1].trim())
  )];
  const connus = new Set(Object.keys(allVars));
  const champsManquants = champsUtilises.filter(c => !connus.has(c));

  let html = tpl.contenu;
  for (const [k, v] of Object.entries(allVars))
    html = html.replaceAll(`{{${k}}}`, String(v ?? ''));
  // Champs non résolus → vide
  html = html.replace(/\{\{[^}]+\}\}/g, '');

  return { html, champsManquants };
}

function wrapHtml(html, titre) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
<style>
  @page{size:A4;margin:14mm}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:0}
  img{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;max-width:100%}
  h2{font-size:14pt;margin-bottom:4px}h3{font-size:11pt;border-bottom:1px solid #ccc;padding-bottom:3px;margin-top:16px}
  p{margin:5px 0;line-height:1.5}table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #ccc;padding:5px 8px;vertical-align:top}
  .page-break{break-after:page;page-break-after:always;height:0;border:0;margin:0}
  /* Aperçu écran : simuler une feuille A4 */
  @media screen {
    html{background:#e5e5e5}
    body{max-width:210mm;min-height:297mm;margin:16px auto;padding:18mm 16mm;
         background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.18);box-sizing:border-box}
  }
</style></head><body>
${html}</body></html>`;
}

// ─── POST /procedures/pv-recours ──────────────────────────────────────────────
r.post('/pv-recours', authRequired, (req, res) => {
  const {
    etudiant, ue_num, ue_nom, membres_presents,
    date_publi, date_recours, date_seance, date_envoi,
    q, verdict, commentaire_cde, annee,
  } = req.body;

  // Paramètres configurables
  const delaiRecours    = getParamNum('procedures.delai_recours_jours', 4);
  const delaiDecision   = getParamNum('procedures.delai_decision_jours', 7);
  const delaiExtCal     = getParamNum('procedures.delai_ext_cal_jours', 7);
  const delaiExtOuv     = getParamNum('procedures.delai_ext_ouv_jours', 3);
  const emailDirection  = getParam('procedures.email_direction', 'direction@institut-prigogine.be');

  const ueRef = [ue_num, ue_nom].filter(Boolean).join(' — ');

  // ── Références d'articles selon l'année scolaire ──────────────────────────
  // 2025-2026 → ROI/RGE 2024 (Art. 65-68) ; autres années → RDE/ROI (Art. 87-91)
  const is2526 = (annee === '2025-2026');
  const ART = is2526 ? {
    recevabilite:   'Art. 67 ROI/RGE',
    porteeRefus:    'Art. 65 ROI/RGE',
    irrecevMotif:   'Art. 67 ROI/RGE',
    irrecevNotif:   'Art. 67 ROI/RGE',
    quorum:         'Art. 14 ROI/RGE',
    visiteCopies:   'Art. 50 ROI/RGE',
    publiResultats: 'Art. 63 ROI/RGE',
    appreciation:   'Art. 67 ROI/RGE',
    recoursExt:     'Art. 68 ROI/RGE',
    plage:          'Art. 65 à 68 ROI/RGE',
    roi:            'ROI/RGE',
  } : {
    recevabilite:   'Art. 88 §1 RDE/ROI',
    porteeRefus:    'Art. 87 §1 RDE/ROI',
    irrecevMotif:   'Art. 88 §3 RDE/ROI',
    irrecevNotif:   'Art. 88 §4 RDE/ROI',
    quorum:         'Art. 89 §1 RDE/ROI',
    visiteCopies:   'Art. 71 RDE/ROI',
    publiResultats: 'Art. 82 RDE/ROI',
    appreciation:   'Art. 91 RDE/ROI',
    recoursExt:     'Art. 90 du RDE/ROI',
    plage:          'Art. 87 à 91 RDE/ROI',
    roi:            'RDE/ROI',
  };

  // ── Sections calculées ────────────────────────────────────────────────────
  const composition = membres_presents?.length
    ? tableComposition(membres_presents)
    : '<p><em>(Composition du CDE non renseignée)</em></p>';

  let typeDecision, corps, voiesRecours;

  if (verdict === 'irrecevable') {
    typeDecision = "D'IRRECEVABILITÉ";
    const motifs = [];
    if (q?.ecrit === 'non')           motifs.push(`La plainte n'est pas rédigée par écrit (${ART.irrecevMotif}).`);
    if (q?.delaiRespect === 'non')    motifs.push(`La plainte n'a pas été introduite dans le délai de ${delaiRecours} jours calendrier (${ART.recevabilite}). La date limite était le ${date_publi ? dateLongue(new Date(date_publi+'T12:00').setDate(new Date(date_publi+'T12:00').getDate()+delaiRecours)) : '—'}.`);
    if (q?.porteRefus === 'non')      motifs.push(`La plainte ne porte pas sur une décision de refus au sens de l'${ART.porteeRefus}.`);
    if (q?.irregulPrecises === 'non') motifs.push(`La plainte ne mentionne pas d'irrégularités précises de procédure ou de droit (${ART.irrecevMotif}).`);
    if (q?.decisionRefus === 'non')   motifs.push(`La décision contestée n'est pas une décision de refus au sens de l'${ART.porteeRefus}.`);
    corps = `<h3>QUANT À LA RECEVABILITÉ</h3>
      <p>Le Conseil des Études déclare la plainte <strong>IRRECEVABLE</strong> pour le${motifs.length > 1 ? 's' : ''} motif${motifs.length > 1 ? 's' : ''} suivant${motifs.length > 1 ? 's' : ''}\u00a0:</p>
      <ol>${motifs.map(m => `<li>${m}</li>`).join('')}</ol>
      <p>Conformément à l'${ART.irrecevNotif} du ${ART.roi}, la présente décision d'irrecevabilité expose les motifs précis et est notifiée à l'étudiant·e.</p>
      <h3>DÉCIDE</h3>
      <p>De déclarer la plainte introduite par <strong>${etudiant}</strong> <strong>IRRECEVABLE</strong> pour les motifs exposés ci-dessus.</p>`;
    voiesRecours = `<p>La présente décision d'irrecevabilité ne peut faire l'objet d'un recours externe, les conditions de recevabilité du recours interne n'étant pas réunies.</p>`;
  } else {
    typeDecision = 'MOTIVÉE';
    const irregs = [
      q?.quorum === 'non'         && `Le quorum du CDE n'était pas atteint lors de la délibération (${ART.quorum}) — vice de procédure grave.`,
      q?.conflitInteret === 'oui' && `Un conflit d'intérêt non déclaré a été relevé parmi les membres du jury.`,
      q?.motivJustif === 'non'    && `La justification de l'échec (AA non atteints) n'a pas été encodée et communiquée (${ART.visiteCopies}).`,
      q?.visiteCopies === 'non'   && `La visite des copies n'a pas été proposée dans les délais (${ART.visiteCopies}).`,
      q?.publiResultats === 'non' && `Les résultats n'ont pas été publiés dans les 2 jours ouvrables (${ART.publiResultats}).`,
    ].filter(Boolean);

    if (irregs.length) {
      corps = `<h3>QUANT À LA RECEVABILITÉ</h3>
        <p>La plainte est déclarée <strong>RECEVABLE</strong> : écrite, dans le délai de 4 jours (${ART.recevabilite}), porte sur un refus, mentionne des irrégularités précises (${ART.irrecevMotif}).</p>
        <h3>QUANT AU FOND</h3>
        <p>Le Conseil des Études constate les irrégularités suivantes\u00a0:</p>
        <ol>${irregs.map(i => `<li>${i}</li>`).join('')}</ol>
        <p>En conséquence, le recours est fondé sur ces points. Le Conseil des Études procède à un réexamen.</p>
        <h3>DÉCIDE</h3>
        <p>D'<strong>ACCUEILLIR</strong> partiellement le recours de <strong>${etudiant}</strong>. Le dossier fait l'objet d'un réexamen par le Conseil des Études dans sa composition complète.</p>`;
    } else {
      corps = `<h3>QUANT À LA RECEVABILITÉ</h3>
        <p>La plainte est déclarée <strong>RECEVABLE</strong> : écrite, dans le délai de 4 jours (${ART.recevabilite}), porte sur un refus, mentionne des irrégularités précises (${ART.irrecevMotif}).</p>
        <h3>QUANT AU FOND</h3>
        <p>Après examen des griefs soulevés, le Conseil des Études constate qu'aucune irrégularité de procédure ou de droit n'est établie. Le CDE apprécie souverainement la valeur des notes et sa décision ne peut être remise en cause sur la seule contestation de l'appréciation pédagogique (${ART.appreciation}).</p>
        <p><em>Sur le quorum\u00a0:</em> Le quorum requis était atteint lors de la délibération.</p>
        <p><em>Sur la motivation\u00a0:</em> Les AA non atteints ont été dûment identifiés et communiqués.</p>
        <p><em>Sur les droits\u00a0:</em> La visite des copies et la consultation des épreuves ont été proposées conformément à l'${ART.visiteCopies}.</p>
        <h3>DÉCIDE</h3>
        <p>De <strong>REJETER</strong> le recours introduit par <strong>${etudiant}</strong>. La décision de refus initiale est <strong>confirmée</strong>.</p>`;
    }

    const limiteExt = date_envoi
      ? addJoursCal(addJoursOuv(date_envoi, delaiExtOuv).toISOString().split('T')[0], delaiExtCal)
      : null;
    const decretRef = is2526 ? '' : ' et au Décret du 27/10/2006';
    voiesRecours = `<p>Conformément à l'${ART.recoursExt}${decretRef}, la présente décision peut faire l'objet d'un <strong>recours externe</strong> auprès de la Direction générale ETLV (rue Adolphe Lavallée 1, 1080 Bruxelles), par pli recommandé, dans un délai de <strong>${delaiExtCal} jours calendrier</strong> à compter du ${delaiExtOuv}e jour ouvrable suivant l'envoi de la présente décision${limiteExt ? ` (date limite\u00a0: <strong>${dateLongue(limiteExt.toISOString().split('T')[0])}</strong>)` : ''}.`;
  }

  // Choix du modèle selon l'année scolaire de la décision :
  // 2025-2026 → pv-recours-25-26 (ROI/RGE 2024) ; sinon → modèle courant.
  const slugRecours = is2526 ? 'pv-recours-25-26' : 'pv-recours';
  let resultat = genererDepuisTemplate(slugRecours, {
    'pv.type_decision':  typeDecision,
    'pv.etudiant':       etudiant || '',
    'pv.ue_ref':         ueRef,
    'pv.date_publi':     date_publi   ? dateLongue(date_publi)   : '',
    'pv.date_recours':   date_recours ? dateLongue(date_recours) : '',
    'pv.date_seance':    date_seance  ? `<p><strong>Date de réunion du CDE\u00a0:</strong> ${dateLongue(date_seance)}</p>` : '',
    'pv.composition':    composition,
    'pv.corps':          corps,
    'pv.commentaire':    commentaire_cde
      ? `<h3>OBSERVATIONS DU CONSEIL DES ÉTUDES</h3><p style="border:1px solid #ccc;padding:10px;background:#fafafa">${commentaire_cde.replace(/\n/g,'<br>')}</p>`
      : '',
    'pv.voies_recours':  voiesRecours,
  });
  // Repli sur le modèle standard si le modèle 25-26 n'existe pas (sécurité)
  if (!resultat && slugRecours !== 'pv-recours') {
    resultat = genererDepuisTemplate('pv-recours', {
      'pv.type_decision':  typeDecision,
      'pv.etudiant':       etudiant || '',
      'pv.ue_ref':         ueRef,
      'pv.date_publi':     date_publi   ? dateLongue(date_publi)   : '',
      'pv.date_recours':   date_recours ? dateLongue(date_recours) : '',
      'pv.date_seance':    date_seance  ? `<p><strong>Date de réunion du CDE\u00a0:</strong> ${dateLongue(date_seance)}</p>` : '',
      'pv.composition':    composition,
      'pv.corps':          corps,
      'pv.commentaire':    commentaire_cde
        ? `<h3>OBSERVATIONS DU CONSEIL DES ÉTUDES</h3><p style="border:1px solid #ccc;padding:10px;background:#fafafa">${commentaire_cde.replace(/\n/g,'<br>')}</p>`
        : '',
      'pv.voies_recours':  voiesRecours,
    });
  }

  if (!resultat) return res.status(404).json({ error: 'Template pv-recours introuvable' });

  // ── Sauvegarder la procédure en archive ────────────────────────────────────
  const verdictCode = verdict === 'irrecevable' ? 'irrecevable'
    : q && (q.quorum === 'non' || q.conflitInteret === 'oui' || q.motivJustif === 'non' || q.visiteCopies === 'non' || q.publiResultats === 'non')
      ? 'accueilli' : 'rejete';

  const ue = db.prepare('SELECT ue_nom, section FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee) || {};
  const proc = db.prepare(`
    INSERT INTO procedure_archive
      (type, statut, etudiant, ue_num, ue_nom, section, annee_scolaire, verdict,
       date_faits, date_seance_cde, payload_json, cree_par)
    VALUES ('recours','en_cours',?,?,?,?,?,?,?,?,?,?)
  `).run(
    etudiant, ue_num, ue_nom || ue.ue_nom || null,
    ue.section || null, annee, verdictCode,
    date_publi || null, date_seance || null,
    JSON.stringify(req.body), req.user?.email || null
  );

  res.json({
    html: wrapHtml(resultat.html, `Décision CDE — ${etudiant}`),
    champs_manquants: resultat.champsManquants,
    procedure_id: proc.lastInsertRowid,
  });
});

// ─── POST /procedures/pv-fraude ───────────────────────────────────────────────
r.post('/pv-fraude', authRequired, (req, res) => {
  const {
    etudiant, ue_num, ue_nom, membres_presents,
    date_examen, date_faits, date_notification, date_audition,
    date_cde, session, recidive, type_fraude, description_faits,
    declarations_etudiant, decision, commentaire_cde, annee,
  } = req.body;

  const delaiRecours   = getParamNum('procedures.delai_recours_jours', 4);
  const emailDirection = getParam('procedures.email_direction', 'direction@institut-prigogine.be');

  const ueRef = [ue_num, ue_nom].filter(Boolean).join(' — ');

  // ── Références d'articles selon l'année scolaire ──────────────────────────
  const is2526F = (annee === '2025-2026');
  const artFraude = is2526F
    ? { sanction1: 'Art. 55 ROI/RGE', sanction2: 'Art. 55 ROI/RGE', notif: 'Art. 54 ROI/RGE', recours: 'Art. 65-68 ROI/RGE', recoursInterne: 'Art. 67 ROI/RGE' }
    : { sanction1: 'Art. 73 §1 RDE/ROI', sanction2: 'Art. 73 §2 RDE/ROI', notif: 'Art. 75 RDE/ROI', recours: 'Art. 87-91 RDE/ROI', recoursInterne: 'Art. 88 §1 RDE/ROI' };

  const composition = membres_presents?.length
    ? tableComposition(membres_presents)
    : '<p><em>(Composition du CDE non renseignée)</em></p>';

  const sanction = decision === 'ajournement'
    ? `L'étudiant·e est <strong>AJOURNÉ·E</strong> pour les acquis d'apprentissage visés par l'épreuve de l'UE ${ue_num} (${artFraude.sanction1}).`
    : `L'étudiant·e est <strong>REFUSÉ·E</strong> pour l'UE ${ue_num} (${artFraude.sanction2} — 2e session ou récidive).`;

  const fondjuridique = (session === '2' || recidive)
    ? `L'étudiant·e se trouve en deuxième session${recidive ? ' et/ou en situation de récidive' : ''}. Conformément à l'${artFraude.sanction2}, le CDE peut prononcer un refus.`
    : `L'étudiant·e se trouve en première session. Conformément à l'${artFraude.sanction1}, la fraude entraîne un ajournement pour les AA visés.`;

  const resultat = genererDepuisTemplate('pv-fraude', {
    'pv.etudiant':       etudiant || '',
    'pv.ue_ref':         ueRef,
    'pv.date_examen':    date_examen    ? dateLongue(date_examen)    : '—',
    'pv.session':        session === '1' ? '1re session' : '2e session',
    'pv.recidive':       recidive ? ' — <strong>RÉCIDIVE</strong>' : '',
    'pv.date_seance':    date_cde ? `<p><strong>Date de réunion du CDE\u00a0:</strong> ${dateLongue(date_cde)}</p>` : '',
    'pv.date_faits':     date_faits     ? dateLongue(date_faits)     : '—',
    'pv.date_notification': date_notification ? dateLongue(date_notification) : '—',
    'pv.vu_audition':    date_audition
      ? `<p>Vu l'audition de l'étudiant·e qui s'est tenue le ${dateLongue(date_audition)}\u00a0;</p>`
      : `<p>Vu que l'étudiant·e n'a pas souhaité être entendu·e dans le délai imparti\u00a0;</p>`,
    'pv.composition':    composition,
    'pv.faits':          `<p style="border:1px solid #ccc;padding:10px;background:#fff8f0"><strong>Type\u00a0:</strong> ${type_fraude || '—'}<br><strong>Description\u00a0:</strong><br>${(description_faits || '').replace(/\n/g,'<br>')}</p>`,
    'pv.procedure_contradictoire': date_audition
      ? `<p>L'étudiant·e a été notifié·e par écrit le ${dateLongue(date_notification)} et a été entendu·e le ${dateLongue(date_audition)}.</p>
         <p><strong>Déclarations\u00a0:</strong></p>
         <p style="border-left:3px solid #ccc;padding-left:10px;font-style:italic">${(declarations_etudiant || 'Aucune déclaration consignée.').replace(/\n/g,'<br>')}</p>`
      : `<p>L'étudiant·e a été dûment convoqué·e (notification du ${dateLongue(date_notification)}) mais ne s'est pas présenté·e à l'audition dans le délai imparti. Le CDE a procédé sur base des pièces disponibles.</p>`,
    'pv.analyse_juridique': `<p>${fondjuridique}</p><p>La décision doit être formellement motivée et notifiée (${artFraude.notif}). L'étudiant·e dispose du droit au recours (${artFraude.recours}).</p>`,
    'pv.decision':       `<p style="font-size:12pt;font-weight:bold;border:2px solid #2e7d32;padding:10px;background:#f0fff0">${sanction}</p>`,
    'pv.commentaire':    commentaire_cde
      ? `<h3>V. OBSERVATIONS</h3><p style="border:1px solid #ccc;padding:10px;background:#fafafa">${commentaire_cde.replace(/\n/g,'<br>')}</p>`
      : '',
    'pv.voies_recours':  `<p>La présente décision peut faire l'objet d'un <strong>recours interne</strong> dans un délai de <strong>${delaiRecours} jours calendrier</strong> suivant la publication des résultats (${artFraude.recoursInterne}), par e-mail à ${emailDirection} ou remise en main propre.</p>`,
  });

  if (!resultat) return res.status(404).json({ error: 'Template pv-fraude introuvable' });

  // ── Sauvegarder la procédure en archive ────────────────────────────────────
  const verdictFraude = decision === 'ajournement' ? 'ajourne' : 'refus';
  const ueF = db.prepare('SELECT ue_nom, section FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee) || {};
  const procF = db.prepare(`
    INSERT INTO procedure_archive
      (type, statut, etudiant, ue_num, ue_nom, section, annee_scolaire, verdict,
       date_faits, date_seance_cde, payload_json, cree_par)
    VALUES ('fraude','en_cours',?,?,?,?,?,?,?,?,?,?)
  `).run(
    etudiant, ue_num, ue_nom || ueF.ue_nom || null,
    ueF.section || null, annee, verdictFraude,
    date_examen || date_faits || null, date_cde || null,
    JSON.stringify(req.body), req.user?.email || null
  );

  res.json({
    html: wrapHtml(resultat.html, `PV Fraude — ${etudiant}`),
    champs_manquants: resultat.champsManquants,
    procedure_id: procF.lastInsertRowid,
  });
});

// ─── GET /procedures/archives ─────────────────────────────────────────────────
// Paramètres : annee, type, statut, section, q (recherche étudiant)
r.get('/archives', authRequired, (req, res) => {
  const { annee, type, statut, section, q } = req.query;
  let sql = 'SELECT * FROM procedure_archive WHERE 1=1';
  const params = [];
  if (annee)   { sql += ' AND annee_scolaire = ?'; params.push(annee); }
  if (type)    { sql += ' AND type = ?';           params.push(type); }
  if (statut)  { sql += ' AND statut = ?';         params.push(statut); }
  if (section) { sql += ' AND section = ?';        params.push(section); }
  if (q)       { sql += ' AND etudiant LIKE ?';    params.push(`%${q}%`); }
  sql += ' ORDER BY cree_le DESC';
  res.json(db.prepare(sql).all(...params));
});

// ─── GET /procedures/archives/:id ─────────────────────────────────────────────
r.get('/archives/:id', authRequired, (req, res) => {
  const proc = db.prepare('SELECT * FROM procedure_archive WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procédure introuvable' });
  // Joindre les documents archivés liés
  proc.documents = db.prepare(
    'SELECT id, nom_fichier, taille, genere_le FROM document_archive WHERE procedure_id = ? ORDER BY genere_le DESC'
  ).all(proc.id);
  res.json(proc);
});

// ─── PATCH /procedures/archives/:id ──────────────────────────────────────────
// Modifier statut ou notes ; la suppression physique nécessite statut='a_supprimer' + confirm
r.patch('/archives/:id', authRequired, (req, res) => {
  const { statut } = req.body;
  const proc = db.prepare('SELECT id FROM procedure_archive WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procédure introuvable' });
  const allowed = ['en_cours', 'clos', 'annule'];
  if (statut && !allowed.includes(statut))
    return res.status(400).json({ error: `Statut invalide. Valeurs acceptées : ${allowed.join(', ')}` });
  if (statut) db.prepare('UPDATE procedure_archive SET statut = ?, modifie_le = datetime(\'now\') WHERE id = ?').run(statut, proc.id);
  res.json({ ok: true });
});

// ─── DELETE /procedures/archives/:id ─────────────────────────────────────────
// Suppression physique définitive — nécessite confirmation explicite (body: { confirme: true })
r.delete('/archives/:id', authRequired, (req, res) => {
  if (!req.body?.confirme) return res.status(400).json({ error: 'Suppression physique : envoyer { confirme: true }' });
  const proc = db.prepare('SELECT id, etudiant, type FROM procedure_archive WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procédure introuvable' });
  db.prepare('DELETE FROM procedure_archive WHERE id = ?').run(proc.id);
  res.json({ ok: true, supprime: `${proc.type} — ${proc.etudiant}` });
});

// ─── POST /procedures/archives/:id/regenerer ─────────────────────────────────
// Re-génère le HTML depuis le payload sauvegardé (sans créer une nouvelle ligne en DB)
r.post('/archives/:id/regenerer', authRequired, (req, res) => {
  const proc = db.prepare('SELECT * FROM procedure_archive WHERE id = ?').get(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procédure introuvable' });
  let payload;
  try { payload = JSON.parse(proc.payload_json); } catch { return res.status(500).json({ error: 'Payload corrompu' }); }
  // Retourner le payload pour que le frontend re-remplisse le formulaire,
  // ou déclencher la re-génération HTML directe selon le paramètre ?mode
  if (req.query.mode === 'html') {
    // Re-génération directe du HTML (la régénération réelle passe par /pv-recours avec l'année)
    const anneeProc = payload?.annee;
    const slug = proc.type === 'recours'
      ? (anneeProc === '2025-2026' ? 'pv-recours-25-26' : 'pv-recours')
      : 'pv-fraude';
    const resultat = genererDepuisTemplate(slug, {});
    // On re-poste vers la même logique — on réutilise le endpoint existant via appel interne
    return res.json({ payload, procedure_id: proc.id });
  }
  // Mode par défaut : retourner le payload pour pré-remplissage du formulaire
  res.json({ payload, procedure_id: proc.id, type: proc.type });
});

export default r;
