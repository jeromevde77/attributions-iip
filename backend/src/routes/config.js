import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /api/config — retourne toutes les clés (admin seulement)
r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  const rows = db.prepare('SELECT cle, valeur, description FROM lucie_config ORDER BY cle').all();
  const result = {};
  for (const row of rows) result[row.cle] = { valeur: row.valeur, description: row.description };
  res.json(result);
});

// GET /api/config/:cle — lecture publique (pour charger l'intro dans l'entretien)
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

// GET /api/config/contrat_template_defaut — retourne le template HTML par défaut
r.get('/contrat_template_defaut', authRequired, roleRequired('admin'), async (req, res) => {
  const { genererTemplate } = await import('../services/contrat_preview.js');
  res.json({ valeur: genererTemplate() });
});

export default r;
