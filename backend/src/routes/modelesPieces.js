// ─────────────────────────────────────────────────────────────────────────────
// L'ÉDITEUR DES MODÈLES DE PIÈCES — les routes (voir lib/modelesPieces.js).
//
// Lire un modèle : toute personne qui ouvre la galerie. Le modifier : la
// direction (`documentation.modeles`, réglable dans Configuration → Accès), comme
// le corpus — un texte qui part sur une pièce signée ne s'écrit pas à
// plusieurs mains sans qu'on sache laquelle.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { gesteRequis } from '../lib/gestes.js';
import { MODELES, POLICES, TAILLES, modeleEnVigueur, verifierModele, assainirModele,
         deposerBrouillon, versEditeur } from '../lib/modelesPieces.js';

const r = express.Router();
/* Celui qui écrit est LA PERSONNE CONNECTÉE, lue en base — jamais un nom tapé. */
const auteur = user => {
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(user?.id);
  return u?.nom_complet || user?.nom || u?.email || user?.email || null;
};
const nonModele = (req, res) => {
  if (MODELES[req.params.cle]) return false;
  res.status(404).json({ error: 'Modèle inconnu.' });
  return true;
};

r.get('/', authRequired, (req, res) => {
  res.json(Object.entries(MODELES).map(([cle, m]) => {
    const v = modeleEnVigueur(cle);
    return { cle, libelle: m.libelle, galerie: m.galerie, version: v.version, d_origine: v.d_origine,
             cree_par: v.cree_par, cree_le: v.cree_le };
  }));
});

r.get('/:cle', authRequired, (req, res) => {
  if (nonModele(req, res)) return;
  const { cle } = req.params;
  const m = MODELES[cle];
  const v = modeleEnVigueur(cle);
  const historique = db.prepare(`SELECT version, contenu IS NULL AS origine, police, taille, commentaire, cree_par, cree_le
    FROM modele_piece_version WHERE cle = ? ORDER BY version DESC`).all(cle);
  res.json({
    cle, libelle: m.libelle, champs: m.champs, blocs: m.blocs, obligatoires: m.obligatoires,
    contenu: versEditeur(cle, v.contenu), origine: versEditeur(cle, m.defaut),
    police: v.police, taille: v.taille, version: v.version, d_origine: v.d_origine,
    polices: POLICES, tailles: TAILLES, historique,
  });
});

/** Une version ancienne, pour la reprendre (elle ne s'applique pas d'elle-même). */
r.get('/:cle/versions/:version', authRequired, (req, res) => {
  if (nonModele(req, res)) return;
  const v = db.prepare('SELECT * FROM modele_piece_version WHERE cle = ? AND version = ?')
    .get(req.params.cle, Number(req.params.version));
  if (!v) return res.status(404).json({ error: 'Version introuvable.' });
  res.json({ ...v, contenu: versEditeur(req.params.cle, v.contenu || MODELES[req.params.cle].defaut) });
});

/** Le brouillon de l'aperçu : rien ne s'écrit en base. */
r.post('/:cle/brouillon', authRequired, gesteRequis('documentation.modeles'), (req, res) => {
  if (nonModele(req, res)) return;
  const { contenu, police, taille } = req.body || {};
  res.json({ id: deposerBrouillon(req.params.cle, { contenu, police, taille }, req.user.id),
             manques: verifierModele(req.params.cle, assainirModele(contenu)) });
});

function ecrire(req, res, contenu) {
  const { cle } = req.params;
  const { police = null, taille = null, commentaire = '' } = req.body || {};
  if (police && !POLICES.includes(police)) return res.status(400).json({ error: 'Police inconnue.' });
  if (taille && !TAILLES.includes(taille)) return res.status(400).json({ error: 'Taille inconnue.' });
  if (contenu !== null) {
    const manques = verifierModele(cle, contenu);
    if (manques.length) {
      return res.status(409).json({ manques,
        error: `Le modèle ne peut pas être enregistré : il manque ${manques.join(', ')}.` });
    }
    const actuel = modeleEnVigueur(cle);
    if (contenu === actuel.contenu && police === actuel.police && taille === actuel.taille) {
      return res.status(400).json({ error: 'Rien n’a changé depuis la version en vigueur.' });
    }
  }
  const version = (db.prepare('SELECT MAX(version) AS n FROM modele_piece_version WHERE cle = ?').get(cle)?.n || 0) + 1;
  db.prepare(`INSERT INTO modele_piece_version (cle, version, contenu, police, taille, commentaire, cree_par, cree_par_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(cle, version, contenu, contenu === null ? null : police, contenu === null ? null : taille,
         String(commentaire || '').slice(0, 500) || null, auteur(req.user), req.user.id ?? null);
  res.json({ ok: true, version });
}

r.post('/:cle', authRequired, gesteRequis('documentation.modeles'), (req, res) => {
  if (nonModele(req, res)) return;
  ecrire(req, res, assainirModele(req.body?.contenu));
});

/** Revenir au modèle d'origine : une version de plus, au contenu nul. */
r.post('/:cle/origine', authRequired, gesteRequis('documentation.modeles'), (req, res) => {
  if (nonModele(req, res)) return;
  if (modeleEnVigueur(req.params.cle).d_origine && !modeleEnVigueur(req.params.cle).police) {
    return res.status(400).json({ error: 'Le modèle d’origine est déjà en vigueur.' });
  }
  ecrire(req, res, null);
});

export default r;
