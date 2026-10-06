// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Besoins en personnel et offres d'emploi
//
// Ordre imposé : pas de besoin → pas d'offre → pas de candidature.
//   · le BESOIN est calculé (attributions « à désigner »), jamais saisi ;
//   · l'OFFRE est créée depuis un besoin, une par cours ;
//   · la PUBLICATION ouvre seule le recrutement.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { documentOffre, sujetOffre, joursOuvrablesApres } from '../services/offreDocument.js';
import { envoyerEmail } from '../services/mailer.js';
import { identiteEtablissement } from './config.js';

/* CE QU'UN APPEL À CANDIDATURE DOIT PORTER (Charles, 5 octobre 2026 — modèle
   « Modèle_appel_IIP.docx ») : la fonction, la charge totale, le cours tel
   qu'au dossier pédagogique, le contenu synthétique, le profil, les titres et
   la prise de fonction. Une offre qui en manque un ne se publie pas : le
   serveur nomme ce qui manque. */
export const FONCTIONS_OFFRE = { CC: 'Chargé(e) de cours', EXP: 'Expert(e)' };
function manquesOffre(o) {
  const m = [];
  if (!FONCTIONS_OFFRE[o.fonction]) m.push('la fonction (chargé de cours ou expert)');
  if (!(Number(o.total_periodes) > 0)) m.push('la charge totale en périodes');
  if (!String(o.cours_nom || '').trim()) m.push('le cours à conférer');
  if (!String(o.description || '').trim()) m.push('le contenu synthétique');
  if (!String(o.profil || '').trim()) m.push('le profil du/de la candidat·e');
  if (!(o.titres || []).length) m.push('les titres (à rattacher au cours dans le référentiel, ou à ajouter)');
  if (!o.prise_de_fonction) m.push('la date de prise de fonction');
  return m;
}

/* LE CONTENU SYNTHÉTIQUE SE REPREND DU DOSSIER PÉDAGOGIQUE (Charles, 6 octobre
   2026 : « ce sont les AA du cours, suivis des points du programme »). Les
   acquis du cours : ceux que la pondération de l'année lui rattache, sinon
   ceux rattachés au cours dans le référentiel, sinon — cours unique de
   l'unité — tous ceux de l'unité. Le programme : la section « Programme » de
   la description d'unité (ue_det, écrite par l'import du dossier), coupée au
   titre du cours quand l'unité en a plusieurs. Ce qui manque est DIT, jamais
   inventé : la proposition reste modifiable. */
const normTitre = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function contenuSynthetique(codeCours, annee) {
  const cours = db.prepare(`SELECT cours_code, cours_nom, ue_num, annee_scolaire FROM cours
     WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(codeCours, annee || '');
  if (!cours) return { texte: '', manque: ['le cours est inconnu du référentiel'] };
  const an = cours.annee_scolaire;
  const freres = db.prepare('SELECT cours_code, cours_nom FROM cours WHERE ue_num = ? AND annee_scolaire = ?')
    .all(cours.ue_num, an);

  let acquis = db.prepare(`SELECT a.aa_code, a.aa_num, a.description FROM aa_ponderation p
      JOIN aa a ON a.aa_code = p.aa_code
     WHERE p.cours_code = ? AND p.annee_scolaire = ? ORDER BY a.aa_num`).all(codeCours, an);
  if (!acquis.length) acquis = db.prepare('SELECT aa_code, aa_num, description FROM aa WHERE cours_code = ? ORDER BY aa_num').all(codeCours);
  // Aucun acquis rattaché au cours : ceux de l'unité — tels quels pour un
  // cours unique, signalés « de l'unité » sinon, à réduire à la main.
  let acquisDeLUnite = false;
  if (!acquis.length) {
    acquis = db.prepare('SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num').all(cours.ue_num);
    acquisDeLUnite = freres.length > 1 && acquis.length > 0;
  }
  acquis = acquis.filter(a => String(a.description || '').trim());

  const det = db.prepare(`SELECT ue_det FROM ue WHERE ue_num = ? AND ue_det LIKE '%## Programme%'
     ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(cours.ue_num, an)?.ue_det || '';
  let programme = '';
  let portee = null;
  const m = /## Programme\n([\s\S]*?)(?=\n## |$)/.exec(det);
  if (m) {
    const lignes = m[1].split('\n').map(l => l.trim()).filter(Boolean);
    if (freres.length <= 1) { programme = lignes.join('\n'); portee = 'cours'; }
    else {
      const titres = new Map(freres.map(f => [normTitre(f.cours_nom), f.cours_code]));
      const debut = lignes.findIndex(l => normTitre(l) === normTitre(cours.cours_nom));
      if (debut >= 0) {
        const fin = lignes.findIndex((l, i) => i > debut && titres.has(normTitre(l)));
        programme = lignes.slice(debut + 1, fin < 0 ? undefined : fin).join('\n');
        portee = 'cours';
      } else { programme = lignes.join('\n'); portee = 'unite'; }
    }
  }

  const blocs = [];
  if (acquis.length) {
    blocs.push(`${acquisDeLUnite ? "Acquis d'apprentissage de l'unité" : "Acquis d'apprentissage"} :\n${acquis.map(a => `- ${a.description.trim()}`).join('\n')}`);
  }
  if (programme) {
    blocs.push(`${portee === 'unite' ? "Programme de l'unité" : 'Programme'} :\n${programme}`);
  }
  const manque = [];
  if (!acquis.length) manque.push("aucun acquis d'apprentissage n'est enregistré pour cette unité");
  if (acquisDeLUnite) manque.push("les acquis ne sont pas rattachés au cours : ce sont ceux de toute l'unité, à réduire");
  if (!programme) manque.push("le programme du dossier pédagogique n'est pas importé pour cette unité");
  if (portee === 'unite') manque.push("le programme n'a pas pu être découpé au titre du cours : c'est celui de toute l'unité, à réduire");
  return { texte: blocs.join('\n\n'), manque, acquis: acquis.length, portee };
}

// Traçabilité des envois d'offres : la publication est un acte administratif,
// son envoi aussi.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS offre_envoi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poste_id INTEGER NOT NULL,
    destinataires TEXT NOT NULL,
    envoye_le TEXT DEFAULT (datetime('now')),
    envoye_par TEXT
  )`);
} catch (e) { console.error('[migration] offre_envoi :', e.message); }

const r = Router();
const peutEcrire = roleRequired('admin', 'editeur');

/** Identifiants des fiches « à désigner » (marqueur explicite + filet de sécurité). */
function idsADesigner() {
  return db.prepare(`
    SELECT id FROM professeur
     WHERE est_a_designer = 1
        OR UPPER(nom) LIKE '%SIGN%'
        OR UPPER(prenom) LIKE '%SIGN%'
        OR UPPER(COALESCE(nom,'') || ' ' || COALESCE(prenom,'')) LIKE '%DESIGN%'
  `).all().map(p => p.id);
}

// ═══ BESOINS ════════════════════════════════════════════════════════════════

/**
 * GET /api/besoins?annee=2026-2027&section=TIM&ue_num=246
 *
 * Un besoin = les attributions non pourvues d'un même cours, regroupées par
 * année / section / UE / cours / quadrimestre. Rien n'est stocké : réattribuer
 * un cours à un professeur fait disparaître le besoin de lui-même.
 */
r.get('/', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const aDesigner = idsADesigner();
  if (!aDesigner.length) {
    return res.json({ annee, total: 0, total_periodes: 0, besoins: [],
      message: "Aucune fiche « à désigner » n'est définie dans la base." });
  }

  const where = ['a.annee_scolaire = ?', `a.professeur_id IN (${aDesigner.map(() => '?').join(',')})`];
  const params = [annee, ...aDesigner];
  if (section) { where.push('a.section = ?'); params.push(section); }
  if (ue_num)  { where.push('a.ue_num = ?');  params.push(Number(ue_num)); }

  // Cloisonnement par sections des rôles restreints
  const sections = getUserSections(req.user);
  if (Array.isArray(sections)) {
    if (!sections.length) return res.json({ annee, total: 0, total_periodes: 0, besoins: [] });
    where.push(`a.section IN (${sections.map(() => '?').join(',')})`);
    params.push(...sections);
  }

  const besoins = db.prepare(`
    SELECT a.section, a.ue_num, a.code_cours, a.quadrimestre_attribue AS quadrimestre,
           a.type_cours,
           u.ue_nom, c.cours_nom,
           COUNT(*)                                                   AS nb_groupes,
           ROUND(SUM(COALESCE(a.total_attribue_professeur, 0)), 2)    AS total_periodes,
           ROUND(AVG(COALESCE(a.total_attribue_professeur, 0)), 2)    AS periodes_par_groupe,
           GROUP_CONCAT(DISTINCT a.code)                              AS groupes,
           (SELECT COUNT(*) FROM recrutement_poste p
             WHERE p.annee_scolaire = a.annee_scolaire
               AND p.code_cours = a.code_cours
               AND p.section    = a.section
               AND p.statut NOT IN ('close', 'annule'))               AS offres_existantes
      FROM attribution a
      LEFT JOIN ue    u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
     WHERE ${where.join(' AND ')}
     GROUP BY a.section, a.ue_num, a.code_cours, a.quadrimestre_attribue
     ORDER BY a.section, a.ue_num, a.code_cours
  `).all(...params);

  res.json({
    annee,
    total: besoins.length,
    total_periodes: Math.round(besoins.reduce((s, b) => s + (b.total_periodes || 0), 0) * 100) / 100,
    sans_offre: besoins.filter(b => !b.offres_existantes).length,
    besoins,
  });
});

/** Contenu synthétique proposé pour un cours : ses acquis, puis son programme. */
r.get('/contenu-cours/:coursCode', authRequired, (req, res) => {
  res.json(contenuSynthetique(req.params.coursCode, req.query.annee));
});

/** Titres du référentiel visés par un cours, pour préremplir une offre. */
r.get('/titres-cours/:coursCode', authRequired, (req, res) => {
  const lignes = db.prepare(`
    SELECT ct.id, ct.portee, t.id AS titre_id, t.code, t.libelle, t.niveau, t.categorie
      FROM cours_titre ct JOIN titre t ON t.id = ct.titre_id
     WHERE ct.cours_code = ? AND t.actif = 1
     ORDER BY CASE ct.portee WHEN 'requis' THEN 1 WHEN 'suffisant' THEN 2 ELSE 3 END, t.libelle
  `).all(req.params.coursCode);
  res.json({ cours_code: req.params.coursCode, titres: lignes });
});

// ═══ OFFRES ═════════════════════════════════════════════════════════════════

/**
 * POST /api/besoins/offre
 * Crée l'offre à partir d'un besoin. Les acquis d'apprentissage rattachés au
 * cours et les titres visés sont repris automatiquement.
 */
r.post('/offre', authRequired, peutEcrire, (req, res) => {
  const { annee, section, ue_num, code_cours, quadrimestre, type_cours,
          periodes_cours, nb_groupes, total_periodes, nb_postes,
          intitule, description, profil, competences, horaire_indicatif,
          titres_extra, date_limite, fonction, prise_de_fonction } = req.body;

  if (!annee || !code_cours) {
    return res.status(400).json({ error: 'annee et code_cours requis' });
  }

  const cours = db.prepare(
    'SELECT cours_nom FROM cours WHERE cours_code = ? AND annee_scolaire = ?'
  ).get(code_cours, annee);
  const ue = ue_num ? db.prepare(
    'SELECT ue_nom FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1'
  ).get(Number(ue_num), annee) : null;

  const titreOffre = intitule
    || `${cours?.cours_nom || code_cours}${section ? ' — ' + section : ''}`;

  const info = db.prepare(`
    INSERT INTO recrutement_poste
      (intitule, section, ue_num, code_cours, quadrimestre, type_cours,
       periodes_cours, nb_groupes, total_periodes, nb_postes,
       description, profil, competences, horaire_indicatif,
       titres_extra, date_limite, statut, annee_scolaire, cree_par,
       fonction, prise_de_fonction, cours_nom)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'brouillon', ?, ?, ?, ?, ?)
  `).run(
    titreOffre, section || null, ue_num ? String(ue_num) : null, code_cours,
    quadrimestre || null, type_cours || null,
    periodes_cours ?? null, nb_groupes ?? null, total_periodes ?? null,
    nb_postes ?? (nb_groupes || 1),
    description || contenuSynthetique(code_cours, annee).texte || null, profil || null, competences || null,
    horaire_indicatif || null,
    titres_extra ? JSON.stringify(titres_extra) : null,
    date_limite || null, annee,
    req.user.nom || req.user.email || `#${req.user.id}`,
    FONCTIONS_OFFRE[fonction] ? fonction : null, prise_de_fonction || null,
    // Le cours TEL QU'AU DOSSIER PÉDAGOGIQUE : son intitulé du référentiel.
    cours?.cours_nom || null
  );

  res.json(detailOffre(Number(info.lastInsertRowid)));
});

/** Détail d'une offre, avec ses acquis d'apprentissage et ses titres. */
function detailOffre(id) {
  const offre = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(id);
  if (!offre) return null;

  // Acquis d'apprentissage rattachés au cours (rattachement fait dans la fiche UE)
  let acquis = offre.code_cours ? db.prepare(`
    SELECT a.aa_code, a.aa_num, a.description FROM aa_ponderation p JOIN aa a ON a.aa_code = p.aa_code
     WHERE p.cours_code = ? AND p.annee_scolaire = ? ORDER BY a.aa_num
  `).all(offre.code_cours, offre.annee_scolaire || '') : [];
  if (!acquis.length && offre.code_cours) {
    acquis = db.prepare('SELECT aa_code, aa_num, description FROM aa WHERE cours_code = ? ORDER BY aa_num').all(offre.code_cours);
  }

  // Titres visés : ceux du référentiel + ceux cochés en plus sur l'offre
  const duReferentiel = offre.code_cours ? db.prepare(`
    SELECT t.id, t.code, t.libelle, t.niveau, ct.portee
      FROM cours_titre ct JOIN titre t ON t.id = ct.titre_id
     WHERE ct.cours_code = ? AND t.actif = 1
     ORDER BY CASE ct.portee WHEN 'requis' THEN 1 WHEN 'suffisant' THEN 2 ELSE 3 END, t.libelle
  `).all(offre.code_cours) : [];

  let extra = [];
  try {
    const ids = JSON.parse(offre.titres_extra || '[]');
    if (ids.length) {
      extra = db.prepare(
        `SELECT id, code, libelle, niveau, 'ajoute' AS portee FROM titre WHERE id IN (${ids.map(() => '?').join(',')})`
      ).all(...ids);
    }
  } catch { /* JSON invalide : on ignore */ }

  const d = { ...offre, acquis, titres: [...duReferentiel, ...extra] };
  // Le cours à conférer : celui du référentiel quand l'offre ne le porte pas encore.
  if (!d.cours_nom && d.code_cours) {
    d.cours_nom = db.prepare('SELECT cours_nom FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1')
      .get(d.code_cours, d.annee_scolaire || '')?.cours_nom || null;
  }
  d.manques = manquesOffre(d);
  return d;
}

r.get('/offre/:id', authRequired, (req, res) => {
  const o = detailOffre(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'offre introuvable' });
  res.json(o);
});

r.get('/offres', authRequired, (req, res) => {
  const { annee, statut } = req.query;
  const where = [], params = [];
  if (annee)  { where.push('annee_scolaire = ?'); params.push(annee); }
  if (statut) { where.push('statut = ?');         params.push(statut); }
  const sql = `SELECT * FROM recrutement_poste
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY cree_le DESC`;
  res.json(db.prepare(sql).all(...params));
});

r.patch('/offre/:id', authRequired, peutEcrire, (req, res) => {
  const permis = ['intitule', 'description', 'profil', 'competences',
                  'horaire_indicatif', 'periodes_cours', 'nb_groupes',
                  'total_periodes', 'nb_postes', 'date_limite', 'quadrimestre',
                  'canal_publication', 'statut', 'fonction', 'prise_de_fonction', 'cours_nom'];
  if (req.body.fonction !== undefined && req.body.fonction !== null && !FONCTIONS_OFFRE[req.body.fonction]) {
    return res.status(400).json({ error: 'fonction attendue : CC ou EXP' });
  }
  const champs = [], vals = [];
  for (const k of permis) {
    if (req.body[k] !== undefined) { champs.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (req.body.titres_extra !== undefined) {
    champs.push('titres_extra = ?');
    vals.push(JSON.stringify(req.body.titres_extra || []));
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });
  vals.push(Number(req.params.id));
  db.prepare(`UPDATE recrutement_poste SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(detailOffre(Number(req.params.id)));
});

/**
 * POST /api/besoins/offre/:id/publier
 * Verrou de la chaîne : tant qu'une offre n'est pas publiée, aucune candidature
 * ne devrait s'y rattacher.
 */
r.post('/offre/:id/publier', authRequired, peutEcrire, (req, res) => {
  const id = Number(req.params.id);
  const offre = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(id);
  if (!offre) return res.status(404).json({ error: 'offre introuvable' });
  if (offre.statut === 'publiee') {
    return res.status(409).json({ error: 'offre déjà publiée' });
  }
  if (!offre.code_cours) {
    return res.status(400).json({ error: 'une offre doit viser un cours' });
  }
  const manques = manquesOffre(detailOffre(id));
  if (manques.length) {
    return res.status(409).json({ error: `L'appel à candidature ne peut pas être publié : il manque ${manques.join(', ')}.`, manques });
  }

  // La date limite ne se saisit pas : six jours ouvrables après la parution.
  const parution = req.body.date_publication || new Date().toISOString().slice(0, 10);
  db.prepare(`
    UPDATE recrutement_poste
       SET statut = 'publiee', date_publication = ?, canal_publication = ?, publie_par = ?, date_limite = ?
     WHERE id = ?
  `).run(
    parution,
    req.body.canal_publication || 'Prigoginews',
    req.user.nom || req.user.email || `#${req.user.id}`,
    joursOuvrablesApres(parution, 6),
    id
  );
  res.json(detailOffre(id));
});

// ═══ RÉFÉRENTIEL DES TITRES (légal → administrateur) ════════════════════════

// ── Document d'offre mis en page (aperçu, impression, corps du mail) ────────
function documentPour(id) {
  const o = detailOffre(id);          // assembleur existant : offre + acquis + titres
  if (!o) return null;
  let ident = {};
  try { ident = identiteEtablissement() || {}; } catch { /* */ }
  let rh = null;
  try { rh = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'rh_email'").get()?.valeur || null; } catch { /* */ }
  const sec = o.section ? db.prepare('SELECT libelle FROM section WHERE code = ?').get(o.section) : null;
  const etab = {
    nom: ident.nom || 'Institut Ilya Prigogine',
    directeur: ident.directeur || 'SOHET Charles',
    // L'adresse des candidatures : en configuration (lucie_config.rh_email), jamais en dur.
    mail: rh || 'service.rh@institut-prigogine.be',
    cursus: sec?.libelle || o.section || null,
  };
  const titres = (o.titres || []).map(t =>
    `${t.libelle}${t.portee === 'requis' ? ' (titre requis)' : t.portee === 'suffisant' ? ' (titre suffisant)' : ''}`);
  const acquis = (o.acquis || []).map(a => a.description);
  return { o, html: documentOffre(o, titres, acquis, etab), sujet: sujetOffre(o, etab) };
}

r.get('/offre/:id/document', authRequired, (req, res) => {
  const doc = documentPour(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'offre introuvable' });
  res.json({ html: doc.html, sujet: doc.sujet });
});

// ── Envoi de l'offre par e-mail ─────────────────────────────────────────────
r.post('/offre/:id/envoyer', authRequired, peutEcrire, async (req, res) => {
  const doc = documentPour(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'offre introuvable' });

  const brut = String(req.body.destinataires || '');
  const destinataires = brut.split(/[,;\s]+/).filter(d => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d));
  if (!destinataires.length) {
    return res.status(400).json({ error: 'aucune adresse e-mail valide' });
  }

  // CE QUI S'EST PASSÉ SE LIT DANS LE RÉSULTAT, IL NE SE DEVINE PAS.
  //
  // `modeDev` valait `!process.env.SMTP_HOST` : or la configuration SMTP vit en
  // BASE (`lucie_config.smtp_config`, écran Configuration → Courriels), et le
  // mode Graph n'a pas d'hôte du tout. Sur le VPS, où le relais est enregistré
  // en base, cette ligne déclarait « mode dev » et avertissait qu'aucun
  // courriel n'était parti — alors qu'il partait. `envoyerEmail` sait ce qu'il
  // a fait et le dit : il rend { ok, simule }.
  let envoi;
  try {
    envoi = await envoyerEmail({ to: destinataires, subject: doc.sujet, html: doc.html });
  } catch (e) {
    return res.status(502).json({ error: `envoi impossible : ${e.message}` });
  }
  if (envoi && envoi.ok === false) {
    return res.status(502).json({ error: `envoi impossible : ${envoi.erreur || 'cause inconnue'}` });
  }
  const modeDev = !!envoi?.simule;

  db.prepare('INSERT INTO offre_envoi (poste_id, destinataires, envoye_par) VALUES (?,?,?)')
    .run(Number(req.params.id), destinataires.join(', '),
         req.user.nom || req.user.email || `#${req.user.id}`);

  res.json({ ok: true, destinataires, mode: modeDev ? 'dev' : 'smtp',
             avertissement: modeDev
               ? 'SMTP non configuré sur ce serveur : l\'envoi est journalisé en console, aucun e-mail réel n\'est parti.'
               : null });
});

r.get('/offre/:id/envois', authRequired, (req, res) => {
  res.json(db.prepare(
    'SELECT * FROM offre_envoi WHERE poste_id = ? ORDER BY envoye_le DESC'
  ).all(Number(req.params.id)));
});

r.get('/titres', authRequired, (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM cours_titre ct WHERE ct.titre_id = t.id) AS nb_cours
      FROM titre t WHERE t.actif = 1 ORDER BY t.categorie, t.libelle
  `).all());
});

r.post('/titres', authRequired, roleRequired('admin'), (req, res) => {
  const { code, libelle, niveau, categorie } = req.body;
  if (!code || !libelle) return res.status(400).json({ error: 'code et libelle requis' });
  try {
    const i = db.prepare(
      'INSERT INTO titre (code, libelle, niveau, categorie) VALUES (?,?,?,?)'
    ).run(code, libelle, niveau || null, categorie || null);
    res.json(db.prepare('SELECT * FROM titre WHERE id = ?').get(Number(i.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'ce code existe déjà' });
    res.status(500).json({ error: e.message });
  }
});

/** Rattacher / détacher un titre d'un cours (référentiel légal → admin). */
r.post('/titres-cours', authRequired, roleRequired('admin'), (req, res) => {
  const { cours_code, titre_id, portee } = req.body;
  if (!cours_code || !titre_id) return res.status(400).json({ error: 'cours_code et titre_id requis' });
  if (portee && !['requis', 'suffisant', 'penurie'].includes(portee)) {
    return res.status(400).json({ error: 'portée invalide' });
  }
  try {
    db.prepare(`
      INSERT INTO cours_titre (cours_code, titre_id, portee) VALUES (?,?,?)
      ON CONFLICT(cours_code, titre_id) DO UPDATE SET portee = excluded.portee
    `).run(cours_code, Number(titre_id), portee || 'requis');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/titres-cours/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM cours_titre WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;
