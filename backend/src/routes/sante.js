/* LE SUIVI DE SANTÉ — la porte de Lucie Admin (3.5.283). Le métier : `lib/suiviSante.js`.
 * Lire : direction, secrétariat, coordination (étudiants de ses sections). Encoder, joindre, retirer : direction, secrétariat.
 * Régler la durée de validité : la direction. */
import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { authRequired, getUserSections } from '../middleware/auth.js';
import db from '../db/index.js';
import { etatsDeTous, visitesDe, visiteAuJour, encoder, joindre, retirer, validiteMois, reglerValidite, cheminFormulaire, migrerSante, ORGANISME_DEFAUT } from '../lib/suiviSante.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const ECRIT = [...DIRECTION, 'secretariat', 'editeur'];
const LIT = [...ECRIT, 'coordination'];
const qui = req => req.user?.nom || req.user?.nom_complet || req.user?.email || null;
const garde = roles => (req, res, next) => (roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Accès refusé.' }));
const televersement = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function typeReel(b) {
  if (!b || b.length < 4) return null;
  if (b.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') return 'image/png';
  return null;
}
const fichierDe = req => {
  if (!req.file) return { fichier: null };
  const mime = typeReel(req.file.buffer);
  if (!mime) return { erreur: 'Le formulaire doit être un PDF ou une photo (JPEG, PNG).' };
  return { fichier: { nom: req.file.originalname, mime, buffer: req.file.buffer } };
};
/** La coordination ne lit que les étudiants de ses sections (la section de l'étudiant). */
function permis(req, etudId) {
  if (req.user.role !== 'coordination') return true;
  const sec = getUserSections(req.user);
  if (!sec) return true;
  const s = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(Number(etudId))?.s;
  return !s || sec.includes(s);
}

r.get('/reglage', authRequired, garde(LIT), (req, res) => res.json({ validite_mois: validiteMois(), peut_regler: DIRECTION.includes(req.user.role) }));
r.put('/reglage', authRequired, garde(DIRECTION), (req, res) => {
  const x = reglerValidite(req.body?.validite_mois);
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json({ validite_mois: x.mois });
});

/** Le filtre de la liste des étudiants : l'état de la visite de chacun (aucune entrée = aucune visite). */
r.get('/etats', authRequired, garde(LIT), (req, res) => res.json({ etats: etatsDeTous(), validite_mois: validiteMois() }));

r.get('/etudiant/:id', authRequired, garde(LIT), (req, res) => {
  if (!permis(req, req.params.id)) return res.status(404).json({ error: 'Étudiant introuvable.' });
  res.json({ visites: visitesDe(req.params.id), actuelle: visiteAuJour(req.params.id), validite_mois: validiteMois(),
    organisme_defaut: ORGANISME_DEFAUT, peut_encoder: ECRIT.includes(req.user.role), peut_regler: DIRECTION.includes(req.user.role) });
});

r.post('/etudiant/:id', authRequired, garde(ECRIT), televersement.single('fichier'), (req, res) => {
  const f = fichierDe(req); if (f.erreur) return res.status(400).json({ error: f.erreur });
  const x = encoder({ etudiantId: req.params.id, organisme: req.body?.organisme, dateExamen: req.body?.date_examen,
    remarque: req.body?.remarque, fichier: f.fichier, par: qui(req) });
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

r.post('/:vid/formulaire', authRequired, garde(ECRIT), televersement.single('fichier'), (req, res) => {
  const f = fichierDe(req); if (f.erreur) return res.status(400).json({ error: f.erreur });
  if (!f.fichier) return res.status(400).json({ error: 'Choisissez le fichier du formulaire.' });
  const x = joindre(req.params.vid, f.fichier, qui(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

r.delete('/:vid', authRequired, garde(ECRIT), (req, res) => {
  const x = retirer(req.params.vid, req.body?.motif, qui(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

r.get('/:vid/formulaire', authRequired, garde(LIT), (req, res) => {
  migrerSante();
  const v = db.prepare('SELECT * FROM etudiant_visite_medicale WHERE id = ?').get(Number(req.params.vid));
  if (!v || !permis(req, v.etudiant_id)) return res.status(404).json({ error: 'Visite introuvable.' });
  const f = cheminFormulaire(v.id);
  if (!v.nom_fichier || !fs.existsSync(f)) return res.status(404).json({ error: 'Aucun formulaire pour cette visite.' });
  res.setHeader('Content-Type', v.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="formulaire-sante-${v.id}${v.mime === 'application/pdf' ? '.pdf' : v.mime === 'image/png' ? '.png' : '.jpg'}"`);
  fs.createReadStream(f).pipe(res);
});

export default r;
