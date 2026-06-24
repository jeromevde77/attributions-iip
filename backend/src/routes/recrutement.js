/**
 * recrutement.js — Module recrutement (v3)
 * Documents multiples par candidat (CV, lettre, diplômes, annexes).
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import multer from 'multer';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

// Types de documents acceptés
export const TYPES_DOC = {
  cv:           'CV',
  lettre:       'Lettre de motivation',
  diplome:      'Diplôme / Certificat',
  annexe:       'Annexe',
};

const MIMETYPES_ACCEPTES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const uploadStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = join(DATA_DIR, 'recrutement', 'docs', String(req.params.id || 'tmp'));
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = (file.originalname || 'doc').replace(/[^\w.\-]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, MIMETYPES_ACCEPTES.includes(file.mimetype) || true); // accepte tout, vérifie côté DB
  }
});

// Accès recrutement : admins + utilisateurs avec acces_recrutement = 1
function recrutementAcces(req, res, next) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Non authentifié' });
  if (u.role === 'admin') return next();
  const row = db.prepare('SELECT acces_recrutement FROM utilisateur WHERE id = ?').get(u.id);
  if (row?.acces_recrutement) return next();
  return res.status(403).json({ error: 'Accès non autorisé' });
}

const r = Router();
r.use(authRequired);
r.use(recrutementAcces);

// ═══════════════════════════════════════════════════════════════════════════════
// POSTES À POURVOIR
// ═══════════════════════════════════════════════════════════════════════════════
r.get('/postes', (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const aDesignerIds = db.prepare(
    "SELECT id FROM professeur WHERE UPPER(nom) LIKE '%SIGN%'"
  ).all().map(p => p.id);

  const placeholders = aDesignerIds.length
    ? `OR v.professeur_id IN (${aDesignerIds.map(() => '?').join(',')})`
    : '';

  const postes = db.prepare(`
    SELECT
      v.section, v.ue_num, v.ue_nom, v.contrat_mdp,
      v.code_cours, v.nom_cours, v.type_cours, v.bloc,
      u.ue_quad, u.ue_per_cours, u.ue_aut, u.ects, u.ue_niv,
      COUNT(*) AS nb_groupes,
      (SELECT COUNT(*) FROM recrutement_candidature rc
       WHERE rc.annee_scolaire = v.annee_scolaire
         AND rc.ue_num = v.ue_num
         AND rc.code_cours = v.code_cours
         AND rc.section = v.section) AS nb_candidats
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ?
      AND (v.professeur_id IS NULL ${placeholders})
      AND (v.type_cours IS NULL OR v.type_cours != 'Z')
    GROUP BY v.section, v.ue_num, v.code_cours, v.contrat_mdp
    ORDER BY v.section, v.ue_num, v.code_cours
  `).all(annee, ...aDesignerIds);

  res.json(postes);
});

r.get('/postes/:ue_num/:code_cours/:section', (req, res) => {
  const { annee } = req.query;
  const { ue_num, code_cours, section } = req.params;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const ue = db.prepare(`
    SELECT u.*, c.cours_nom, c.ct_pp, c.cours_per
    FROM ue u
    LEFT JOIN cours c ON c.ue_num = u.ue_num AND c.annee_scolaire = u.annee_scolaire
                      AND c.cours_code = ?
    WHERE u.ue_num = ? AND u.annee_scolaire = ?
  `).get(code_cours, ue_num, annee);

  const aa = db.prepare(
    'SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num'
  ).all(ue_num);

  const candidats = db.prepare(`
    SELECT rc.*, c.nom, c.prenom, c.email, c.telephone, c.cv_url, c.notes
    FROM recrutement_candidature rc
    JOIN recrutement_candidat c ON c.id = rc.candidat_id
    WHERE rc.annee_scolaire = ? AND rc.ue_num = ? AND rc.code_cours = ? AND rc.section = ?
    ORDER BY rc.cree_le DESC
  `).all(annee, ue_num, code_cours, section);

  // Documents pour chaque candidat
  const candidatsAvecDocs = candidats.map(c => ({
    ...c,
    reponses_json: c.reponses_json ? (() => { try { return JSON.parse(c.reponses_json); } catch { return {}; } })() : {},
    documents: db.prepare(
      'SELECT id, type, nom_original, taille, cree_le FROM recrutement_document WHERE candidat_id = ? ORDER BY cree_le DESC'
    ).all(c.candidat_id),
  }));

  res.json({ ue, aa, candidats: candidatsAvecDocs, ue_num, code_cours, section, annee });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATS
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATS — liste globale + fiche individuelle
// ═══════════════════════════════════════════════════════════════════════════════

r.get('/candidats', (req, res) => {
  const candidats = db.prepare('SELECT * FROM recrutement_candidat ORDER BY nom, prenom').all();
  res.json(candidats.map(c => ({
    ...c,
    entretien_reponses: c.entretien_reponses ? (() => { try { return JSON.parse(c.entretien_reponses); } catch { return {}; } })() : {},
    documents: db.prepare(
      'SELECT id, type, nom_original, taille, cree_le FROM recrutement_document WHERE candidat_id = ? ORDER BY cree_le DESC'
    ).all(c.id),
    candidatures: db.prepare(`
      SELECT rc.id, rc.annee_scolaire, rc.ue_num, rc.code_cours, rc.section, rc.statut,
             rc.note_globale, rc.commentaire,
             u.ue_nom, cr.cours_nom
      FROM recrutement_candidature rc
      LEFT JOIN ue u ON u.ue_num = rc.ue_num AND u.annee_scolaire = rc.annee_scolaire
      LEFT JOIN cours cr ON cr.cours_code = rc.code_cours AND cr.annee_scolaire = rc.annee_scolaire
      WHERE rc.candidat_id = ?
      ORDER BY rc.cree_le DESC
    `).all(c.id),
  })));
});

r.get('/fonctions', (req, res) => {
  res.json(db.prepare('SELECT * FROM recrutement_fonction ORDER BY ordre, libelle').all());
});
r.post('/fonctions', (req, res) => {
  const { libelle } = req.body;
  if (!libelle?.trim()) return res.status(400).json({ error: 'Libellé requis' });
  try {
    const info = db.prepare('INSERT INTO recrutement_fonction (libelle, ordre) VALUES (?, (SELECT COALESCE(MAX(ordre),0)+1 FROM recrutement_fonction))').run(libelle.trim());
    res.json({ id: info.lastInsertRowid, libelle: libelle.trim() });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Cette fonction existe déjà' });
    throw e;
  }
});
r.delete('/fonctions/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_fonction WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.patch('/candidats/:id', (req, res) => {
  const { nom, prenom, email, telephone, cv_url, notes, fonction,
          niveau_etude, titre_peda, diplome, diplome_autre,
          entretien_reponses, entretien_note, entretien_commentaire } = req.body;
  const c = db.prepare('SELECT id FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidat introuvable' });
  db.prepare(`UPDATE recrutement_candidat SET
    nom = COALESCE(?, nom), prenom = ?, email = ?, telephone = ?,
    cv_url = ?, notes = ?, fonction = ?,
    niveau_etude = ?, titre_peda = ?, diplome = ?, diplome_autre = ?,
    entretien_reponses = COALESCE(?, entretien_reponses),
    entretien_note = COALESCE(?, entretien_note),
    entretien_commentaire = COALESCE(?, entretien_commentaire)
    WHERE id = ?`).run(
      nom ?? null, prenom ?? null, email ?? null, telephone ?? null,
      cv_url ?? null, notes ?? null, fonction ?? null,
      niveau_etude ?? null, titre_peda ?? null, diplome ?? null, diplome_autre ?? null,
      entretien_reponses != null ? JSON.stringify(entretien_reponses) : null,
      entretien_note ?? null, entretien_commentaire ?? null,
      c.id);
  res.json({ ok: true });
});

r.delete('/candidats/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_candidat WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.post('/candidats', (req, res) => {
  const { nom, prenom, email, telephone, cv_url, notes, annee, ue_num, code_cours, section } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const tx = db.transaction(() => {
    let cand = email
      ? db.prepare('SELECT id FROM recrutement_candidat WHERE email = ?').get(email)
      : null;
    if (!cand) {
      const info = db.prepare(
        'INSERT INTO recrutement_candidat (nom, prenom, email, telephone, cv_url, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(nom, prenom || null, email || null, telephone || null, cv_url || null, notes || null);
      cand = { id: info.lastInsertRowid };
    } else {
      db.prepare('UPDATE recrutement_candidat SET nom=COALESCE(?,nom), prenom=COALESCE(?,prenom), telephone=COALESCE(?,telephone), notes=COALESCE(?,notes) WHERE id=?')
        .run(nom || null, prenom || null, telephone || null, notes || null, cand.id);
    }
    if (annee && ue_num && code_cours && section) {
      try {
        db.prepare(`INSERT INTO recrutement_candidature
          (candidat_id, annee_scolaire, ue_num, code_cours, section, statut)
          VALUES (?, ?, ?, ?, ?, 'a_voir')`
        ).run(cand.id, annee, ue_num, code_cours, section);
      } catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; }
    }
    return cand.id;
  });

  res.json({ id: tx() });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS (multiples par candidat, par type)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /candidats/:id/documents?type=cv|lettre|diplome|annexe
r.post('/candidats/:id/documents', upload.single('fichier'), (req, res) => {
  const c = db.prepare('SELECT id FROM recrutement_candidat WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidat introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  const type = req.query.type && TYPES_DOC[req.query.type] ? req.query.type : 'annexe';
  const info = db.prepare(
    'INSERT INTO recrutement_document (candidat_id, type, nom_original, chemin, taille) VALUES (?, ?, ?, ?, ?)'
  ).run(c.id, type, req.file.originalname, req.file.path, req.file.size);

  res.json({ id: info.lastInsertRowid, type, nom_original: req.file.originalname });
});

// GET /documents/:id — télécharger un document
r.get('/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM recrutement_document WHERE id = ?').get(req.params.id);
  if (!doc || !existsSync(doc.chemin)) return res.status(404).json({ error: 'Document introuvable' });
  res.download(doc.chemin, doc.nom_original);
});

// DELETE /documents/:id
r.delete('/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT chemin FROM recrutement_document WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (existsSync(doc.chemin)) { try { unlinkSync(doc.chemin); } catch {} }
  db.prepare('DELETE FROM recrutement_document WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATURES
// ═══════════════════════════════════════════════════════════════════════════════
r.patch('/candidatures/:id', (req, res) => {
  const { statut, commentaire, note_globale, reponses_json } = req.body;
  db.prepare(`UPDATE recrutement_candidature SET
    statut = COALESCE(?, statut),
    commentaire = ?,
    note_globale = ?,
    reponses_json = COALESCE(?, reponses_json),
    modifie_le = datetime('now')
    WHERE id = ?`
  ).run(statut || null, commentaire ?? null, note_globale ?? null,
        reponses_json != null ? JSON.stringify(reponses_json) : null,
        req.params.id);
  res.json({ ok: true });
});

r.delete('/candidatures/:id', (req, res) => {
  db.prepare('DELETE FROM recrutement_candidature WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATTRIBUTION D'UN CANDIDAT → CRÉE LE PROFESSEUR + L'ATTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════════
r.post('/candidatures/:id/attribuer', async (req, res) => {
  const cand = db.prepare(`
    SELECT rc.*, c.nom, c.prenom, c.email, c.telephone, c.fonction
    FROM recrutement_candidature rc
    JOIN recrutement_candidat c ON c.id = rc.candidat_id
    WHERE rc.id = ?
  `).get(req.params.id);
  if (!cand) return res.status(404).json({ error: 'Candidature introuvable' });

  // Récupérer les infos du cours (charge horaire)
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(cand.ue_num, cand.annee_scolaire);

  const tx = db.transaction(() => {
    // 1. Créer ou retrouver le professeur
    let prof = db.prepare('SELECT id FROM professeur WHERE nom = ? AND prenom = ?')
      .get(cand.nom?.toUpperCase() || cand.nom, cand.prenom);

    if (!prof) {
      const info = db.prepare(`
        INSERT INTO professeur (nom, prenom, adresse_mail, mail_prive, statut)
        VALUES (?, ?, ?, ?, 'MDP')
      `).run(
        (cand.nom || '').toUpperCase(),
        cand.prenom || '',
        cand.email ? cand.email.toLowerCase() : null,
        cand.email ? cand.email.toLowerCase() : null
      );
      prof = { id: info.lastInsertRowid };
    }

    // 2. Créer l'attribution (remplace le À DÉSIGNER)
    const aDesignerIds = db.prepare("SELECT id FROM professeur WHERE UPPER(nom) LIKE '%SIGN%'").all().map(p => p.id);
    const periodes = ue ? (ue.ue_per_cours || 0) : 0;
    const autonomie = ue ? (ue.ue_aut || 0) : 0;

    // Chercher une attribution À désigner pour ce cours/section et la mettre à jour
    let attrMaj = false;
    if (aDesignerIds.length) {
      const placeholders = aDesignerIds.map(() => '?').join(',');
      const attrExist = db.prepare(`
        SELECT id FROM attribution
        WHERE section = ? AND ue_num = ? AND code_cours = ? AND annee_scolaire = ?
          AND professeur_id IN (${placeholders})
        LIMIT 1
      `).get(cand.section, cand.ue_num, cand.code_cours, cand.annee_scolaire, ...aDesignerIds);

      if (attrExist) {
        db.prepare('UPDATE attribution SET professeur_id = ? WHERE id = ?')
          .run(prof.id, attrExist.id);
        attrMaj = true;
      }
    }

    // Si pas d'attribution existante, en créer une
    if (!attrMaj) {
      const maxOrg = db.prepare(
        'SELECT MAX(num_organisation) AS m FROM attribution WHERE section = ? AND ue_num = ? AND annee_scolaire = ?'
      ).get(cand.section, cand.ue_num, cand.annee_scolaire);
      db.prepare(`
        INSERT INTO attribution
          (section, ue_num, annee_scolaire, professeur_id, periodes_attribuees,
           autonomie_attribuee, num_organisation, organisation, contrat_mdp,
           etablissement_referent, code_cours)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'x', ?, 'IIP', ?)
      `).run(
        cand.section, cand.ue_num, cand.annee_scolaire, prof.id,
        periodes, autonomie, (maxOrg?.m || 0) + 1,
        cand.contrat_mdp || 'IIP', cand.code_cours
      );
    }

    // 3. Passer la candidature en "retenu"
    db.prepare("UPDATE recrutement_candidature SET statut = 'retenu', modifie_le = datetime('now') WHERE id = ?")
      .run(cand.id);

    return prof.id;
  });

  let profId;
  try { profId = tx(); } catch(e) {
    console.error('[attribuer]', e.message);
    return res.status(500).json({ error: e.message });
  }

  const nomComplet = [cand.prenom, cand.nom].filter(Boolean).join(' ');
  const coursNom   = ue?.ue_nom || `UE ${cand.ue_num}`;

  // 4. Créer la notification en base
  const notifTitre = `Nouveau membre du personnel attribué : ${nomComplet}`;
  const notifCorps = `
    <strong>${nomComplet}</strong> a été attribué au cours <strong>${coursNom}</strong>
    (${cand.section} · ${cand.annee_scolaire}).<br>
    Sa fiche membre du personnel a été créée automatiquement dans Lucie.
    Merci de compléter les informations manquantes (adresse, statut, etc.).
  `;
  db.prepare(`
    INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('recrutement_attribue', notifTitre, notifCorps, '/professeurs', 'admin', req.user?.email || null);
  // Notif pour la coordination de section
  db.prepare(`
    INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('recrutement_attribue', notifTitre, notifCorps, `/attributions`, 'coordination', req.user?.email || null);

  // 5. Envoyer l'e-mail aux admins et RH (acces_recrutement)
  const destinataires = db.prepare(`
    SELECT email FROM utilisateur
    WHERE actif = 1 AND email IS NOT NULL
      AND (role = 'admin' OR acces_recrutement = 1)
  `).all().map(u => u.email);

  if (destinataires.length) {
    const html = templateNotif({
      titre: notifTitre,
      corps: notifCorps,
      lien: '/professeurs',
      lienTexte: 'Voir la fiche dans Personnel',
    });
    await envoyerEmail({ to: destinataires, subject: `[Lucie] ${notifTitre}`, html });
  }

  res.json({ ok: true, professeur_id: profId, nom: nomComplet });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
r.get('/notifications', (req, res) => {
  const u = req.user;
  const notifs = db.prepare(`
    SELECT * FROM lucie_notification
    WHERE cible_role IS NULL
       OR cible_role = ?
       OR (cible_user_id IS NOT NULL AND cible_user_id = ?)
    ORDER BY cree_le DESC LIMIT 50
  `).all(u.role, u.id);

  res.json(notifs.map(n => ({
    ...n,
    lue: (() => {
      try { return JSON.parse(n.lue_par || '[]').includes(u.id); } catch { return false; }
    })(),
  })));
});

r.post('/notifications/:id/lue', (req, res) => {
  const n = db.prepare('SELECT id, lue_par FROM lucie_notification WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification introuvable' });
  try {
    const lus = JSON.parse(n.lue_par || '[]');
    if (!lus.includes(req.user.id)) {
      lus.push(req.user.id);
      db.prepare('UPDATE lucie_notification SET lue_par = ? WHERE id = ?').run(JSON.stringify(lus), n.id);
    }
  } catch {}
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRILLE D'ENTRETIEN ÉDITABLE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/recrutement/grille — retourne tous les axes et leurs questions
r.get('/grille', (req, res) => {
  const axes = db.prepare('SELECT * FROM recrutement_grille_axe ORDER BY ordre, id').all();
  const questions = db.prepare('SELECT * FROM recrutement_grille_question ORDER BY axe_id, ordre, id').all();
  res.json(axes.map(a => ({
    ...a,
    questions: questions.filter(q => q.axe_id === a.id),
  })));
});

// PUT /api/recrutement/grille — remplace toute la grille (envoi du tableau complet)
r.put('/grille', (req, res) => {
  const axes = req.body;
  if (!Array.isArray(axes)) return res.status(400).json({ error: 'Format invalide' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recrutement_grille_axe').run(); // CASCADE supprime les questions
    const insAxe = db.prepare('INSERT INTO recrutement_grille_axe (libelle, couleur, ordre) VALUES (?, ?, ?)');
    const insQ   = db.prepare('INSERT INTO recrutement_grille_question (axe_id, libelle, ordre) VALUES (?, ?, ?)');
    axes.forEach((axe, ai) => {
      const { lastInsertRowid: axeId } = insAxe.run(axe.libelle || 'Axe', axe.couleur || '#1B2B4B', ai);
      (axe.questions || []).forEach((q, qi) => {
        if (q.libelle?.trim()) insQ.run(axeId, q.libelle.trim(), qi);
      });
    });
  });
  tx();
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTE IA
// ═══════════════════════════════════════════════════════════════════════════════
r.get('/contexte', (req, res) => {
  const { annee, ue_num, section } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const ue = ue_num ? db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee) : null;
  const cours = ue_num ? db.prepare('SELECT cours_nom, ct_pp, cours_per FROM cours WHERE ue_num = ? AND annee_scolaire = ?').all(ue_num, annee) : [];
  const aa = ue_num ? db.prepare('SELECT aa_code, description FROM aa WHERE ue_num = ? ORDER BY aa_num').all(ue_num) : [];
  res.json({ ue, cours, aa, section, annee });
});

export default r;
