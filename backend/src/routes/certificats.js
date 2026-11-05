/* LES CERTIFICATS MÉDICAUX — la porte du secrétariat (3.5.125). Le métier : `lib/certificatMedical.js`.
 * Lire : direction, secrétariat, coordination (étudiants de ses sections). Encoder : direction, secrétariat.
 * Décider d'un certificat remis hors délai : la direction. */
import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { deposer, decider, liste, cheminFichier, migrerCertificats, dateLimite, DELAI_JOURS_OUVRABLES } from '../lib/certificatMedical.js';
import db from '../db/index.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const ECRIT = [...DIRECTION, 'secretariat', 'editeur'];
const LIT = [...ECRIT, 'coordination'];
const qui = req => req.user?.nom || req.user?.nom_complet || req.user?.email || null;
const garde = roles => (req, res, next) => (roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Accès refusé.' }));
const televersement = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Le type réel d'un fichier, lu dans ses premiers octets : PDF, JPEG, PNG — rien d'autre. */
function typeReel(b) {
  if (!b || b.length < 4) return null;
  if (b.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') return 'image/png';
  return null;
}

r.get('/', authRequired, garde(LIT), (req, res) => {
  migrerCertificats();
  const sec = req.user.role === 'coordination' ? (getUserSections(req.user) || null) : null;
  res.json({ delai: DELAI_JOURS_OUVRABLES, certificats: liste({ annee: req.query.annee || null, sections: sec }),
    peut_encoder: ECRIT.includes(req.user.role), peut_decider: DIRECTION.includes(req.user.role) });
});

/** La date limite pour un début d'absence donné (l'écran l'annonce avant d'enregistrer). */
r.get('/limite', authRequired, garde(LIT), (req, res) => {
  const du = String(req.query.du || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(du)) return res.status(400).json({ error: 'du requis' });
  res.json({ du, limite: dateLimite(du), delai: DELAI_JOURS_OUVRABLES });
});

r.post('/', authRequired, garde(ECRIT), televersement.single('fichier'), (req, res) => {
  let fichier = null;
  if (req.file) {
    const mime = typeReel(req.file.buffer);
    if (!mime) return res.status(400).json({ error: 'Le certificat doit être un PDF ou une photo (JPEG, PNG).' });
    fichier = { nom: req.file.originalname, mime, buffer: req.file.buffer };
  }
  const x = deposer({ etudiantId: Number(req.body?.etudiant_id), du: req.body?.du, au: req.body?.au, recuLe: req.body?.recu_le,
    fichier, deposePar: 'secretariat', par: qui(req), remarque: String(req.body?.remarque || '').trim() || null,
    annee: req.body?.annee || anneeDeTravail(req) });
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

r.put('/:id/decision', authRequired, garde(DIRECTION), (req, res) => {
  const x = decider(req.params.id, req.body?.decision, req.body?.motif, qui(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

r.get('/:id/fichier', authRequired, garde(LIT), (req, res) => {
  migrerCertificats();
  const cm = db.prepare('SELECT * FROM certificat_medical WHERE id = ?').get(Number(req.params.id));
  if (!cm) return res.status(404).json({ error: 'Certificat introuvable.' });
  if (req.user.role === 'coordination') {
    const sec = getUserSections(req.user);
    const s = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(cm.etudiant_id)?.s;
    if (sec && s && !sec.includes(s)) return res.status(404).json({ error: 'Certificat introuvable.' });
  }
  const f = cheminFichier(cm.id);
  if (!cm.nom_fichier || !fs.existsSync(f)) return res.status(404).json({ error: 'Aucun fichier pour ce certificat.' });
  res.setHeader('Content-Type', cm.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="certificat-${cm.id}${cm.mime === 'application/pdf' ? '.pdf' : cm.mime === 'image/png' ? '.png' : '.jpg'}"`);
  fs.createReadStream(f).pipe(res);
});

export default r;
