import { Router } from 'express';
import db from '../db/index.js';
import { piedDocument, enteteLogoActif } from './parametres.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /api/config — retourne toutes les clés (admin seulement)
r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  const rows = db.prepare('SELECT cle, valeur, description FROM lucie_config ORDER BY cle').all();
  const result = {};
  for (const row of rows) result[row.cle] = { valeur: row.valeur, description: row.description };
  res.json(result);
});

// GET /api/config/contrat_template_defaut — AVANT /:cle pour éviter interception
r.get('/contrat_template_defaut', authRequired, roleRequired('admin'), async (req, res) => {
  const { genererTemplate } = await import('../services/contrat_preview.js');
  res.json({ valeur: genererTemplate() });
});

// GET /api/config/contrat_template — AVANT /:cle, retourne le défaut si absent en DB
r.get('/contrat_template', authRequired, async (req, res) => {
  const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'contrat_template'").get();
  if (row) return res.json({ valeur: row.valeur });
  const { genererTemplate } = await import('../services/contrat_preview.js');
  res.json({ valeur: genererTemplate() });
});


// ── Routes attestation (avant /:cle) ────────────────────────────────────────
r.get('/attestation_sections_defaut', authRequired, roleRequired('admin'), (req, res) => {
  res.json({ valeur: JSON.stringify([
    { code: '914300S34D3', section: 'BACHELIER EN OPTOMETRIE',         diplome: 'BACHELIER EN OPTOMETRIE',         periodes: 2550, ects: 180 },
    { code: '914300S33D3', section: 'BACHELIER EN SOINS INFIRMIERS',   diplome: 'BACHELIER EN SOINS INFIRMIERS',   periodes: 2880, ects: 180 },
    { code: '914300S35D3', section: 'BACHELIER EN PSYCHOMOTRICITE',    diplome: 'BACHELIER EN PSYCHOMOTRICITE',    periodes: 2550, ects: 180 },
    { code: '914300S36D3', section: 'BACHELIER TECHNOLOGUE EN IMAGERIE MÉDICALE',  diplome: 'BACHELIER TECHNOLOGUE EN IMAGERIE MÉDICALE', periodes: 2760, ects: 180 },
  ]) });
});

r.get('/attestation_sections', authRequired, (req, res) => {
  const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'attestation_sections'").get();
  if (row) return res.json({ valeur: row.valeur });
  res.json({ valeur: JSON.stringify([
    { code: '914300S34D3', section: 'BACHELIER EN OPTOMETRIE',         diplome: 'BACHELIER EN OPTOMETRIE',         periodes: 2550, ects: 180 },
    { code: '914300S33D3', section: 'BACHELIER EN SOINS INFIRMIERS',   diplome: 'BACHELIER EN SOINS INFIRMIERS',   periodes: 2880, ects: 180 },
    { code: '914300S35D3', section: 'BACHELIER EN PSYCHOMOTRICITE',    diplome: 'BACHELIER EN PSYCHOMOTRICITE',    periodes: 2550, ects: 180 },
    { code: '914300S36D3', section: 'BACHELIER TECHNOLOGUE EN IMAGERIE MÉDICALE',  diplome: 'BACHELIER TECHNOLOGUE EN IMAGERIE MÉDICALE', periodes: 2760, ects: 180 },
  ]) });
});

r.get('/attestation_etab_defaut', authRequired, roleRequired('admin'), (req, res) => {
  res.json({ valeur: JSON.stringify({
    nom:        'INSTITUT ILYA PRIGOGINE',
    adresse:    'Campus Erasme, Bât. P, route de Lennik 808 - 1070 Anderlecht',
    matricule:  '2.132.070',
    fase:       '292',
    ville:      'Bruxelles',
    tel:        '+ 32 (0)2 560 29 59',
    site:       'www.institut-prigogine.be',
    directeur:  'SOHET Charles',
  }) });
});

r.get('/attestation_etab', authRequired, (req, res) => {
  // Enrichir avec les vraies données de la table etablissement
  let etabDB = {};
  try { etabDB = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {}; } catch {}
  const pied = piedDocument();

  const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'attestation_etab'").get();
  let saved = {};
  if (row) { try { saved = JSON.parse(row.valeur); } catch {} }

  const merged = {
    nom:        saved.nom       || etabDB.etab_nom || 'INSTITUT ILYA PRIGOGINE',
    adresse:    saved.adresse   || etabDB.adresse  || 'Campus Erasme, Bât. P, route de Lennik 808 - 1070 Bruxelles',
    matricule:  saved.matricule || etabDB.num_ecot || '2.132.070',
    fase:       saved.fase      || etabDB.num_fase || '292',
    ville:      saved.ville     || (etabDB.adresse ? 'Bruxelles' : 'Bruxelles'),
    tel:        saved.tel       || etabDB.gest_tel || '+ 32 (0)2 560 29 59',
    site:       saved.site      || etabDB.site_web || 'www.institut-prigogine.be',
    directeur:  saved.directeur || etabDB.gest_nom || 'SOHET Charles',
    pied_page:  pied,
  };
  res.json({ valeur: JSON.stringify(merged) });
});

// GET /api/config/:cle — lecture (routes spécifiques ci-dessus ont priorité)
r.get('/:cle', authRequired, (req, res) => {
  const DEFAULTS = {
    contrat_template: null, // sera chargé depuis contrat_preview.js si absent
    entretien_intro: `Bonjour et merci d'être venu·e. Je suis Jérôme Vanden Eynde, directeur de l'Institut Ilya Prigogine.\n\nL'Institut Ilya Prigogine est un établissement d'enseignement de promotion sociale situé à Bruxelles. Nous proposons des formations de niveau secondaire et supérieur à destination d'un public adulte — des personnes en reconversion, en reprise d'études, ou en perfectionnement professionnel. Nos sections couvrent les soins infirmiers, la santé, le paramédical et plusieurs autres filières.\n\nL'entretien que nous allons mener durera environ 30 minutes. Il n'y a pas de bonne ou de mauvaise réponse — ce qui m'intéresse, c'est votre façon de penser et de réfléchir.\n\nNous commencerons par une présentation de votre parcours en environ une minute. Avez-vous des questions avant de commencer ?`,
    entretien_conclusion: `Nous arrivons à la fin de notre entretien. Merci pour le temps que vous nous avez consacré et pour la qualité de vos réponses.\n\nVoici la suite de la procédure : nous allons examiner l'ensemble des candidatures reçues et délibérer en équipe de direction. Nous vous recontacterons dans un délai de deux à trois semaines.\n\nSi vous êtes retenu·e, nous vous proposerons un contrat et vous inviterons à une rencontre avec votre futur responsable pédagogique. Si votre candidature n'est pas retenue cette fois-ci, nous conservons votre dossier pour de futures opportunités.\n\nAvez-vous des questions sur la suite ou sur notre établissement ?`,
  };
  const row = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(req.params.cle);
  if (!row) {
    if (DEFAULTS[req.params.cle]) return res.json({ valeur: DEFAULTS[req.params.cle] });
    return res.status(404).json({ error: 'Clé introuvable' });
  }
  res.json({ valeur: row.valeur });
});

// PUT /api/config/:cle — mise à jour (admin seulement)
r.put('/:cle', authRequired, roleRequired('admin'), (req, res) => {
  const { valeur } = req.body;
  if (valeur == null) return res.status(400).json({ error: 'valeur requise' });
  db.prepare('INSERT OR REPLACE INTO lucie_config (cle, valeur, description) VALUES (?, ?, COALESCE((SELECT description FROM lucie_config WHERE cle = ?), ?))')
    .run(req.params.cle, valeur, req.params.cle, '');
  res.json({ ok: true });
});

export default r;
