// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES DOSSIERS DE RECOURS ET DE DISCIPLINE (/api/procedures/dossiers)
//
// Le circuit, les étapes et les délais vivent dans lib/procedures.js ; ce
// fichier en est la porte. Tout dossier est rattaché à un ÉTUDIANT de Lucie et,
// quand il y a lieu, à son inscription (UE, session, organisation) : plus
// aucun nom tapé à la main, plus aucune section devinée.
//
// Les anciennes routes (/api/procedures/pv-recours, /archives…) restent pour
// relire les dossiers d'avant le 3 octobre 2026.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { gesteRequis, gesteAutorise } from '../lib/gestes.js';
import { anneeDeTravail } from '../helpers/annee.js';
import {
  migrerProcedures, lireDossier, verifierEtape, ETAPES, TYPES, NATURES, TYPES_FRAUDE, SANCTIONS,
  est_recourable,
} from '../lib/procedures.js';
import { structureUE } from './acquis.js';
import { composerPieceProcedure, PIECES } from '../lib/piecesProcedures.js';

const r = Router();
const DATA_DIR = process.env.DATA_DIR || '/app/data';
try { migrerProcedures(db); } catch (e) { console.error('[migration] procédures :', e.message); }

const qui = req => req.user?.nom || req.user?.email || null;

/** LA SECTION D'UN DOSSIER : celle de l'UE, sauf hors cursus — alors celle de
 *  l'étudiant (leçon de 2.11.1 : la section d'une UE n'est pas un rattachement). */
function sectionDe(etudiantId, ueNum, annee) {
  if (ueNum) {
    const u = db.prepare(`SELECT section, COALESCE(hors_cursus, 0) AS hc FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(ueNum, annee);
    if (u && !u.hc && u.section) return u.section;
  }
  return db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudiantId)?.section_rattachement || null;
}

/** LE PÉRIMÈTRE SE POSE SUR CHAQUE PORTE (CLAUDE.md) : 404 sur un dossier hors
 *  périmètre — « interdit » confirmerait qu'il existe. */
function dossierPermis(req, res, id) {
  const d = lireDossier(id);
  if (!d) { res.status(404).json({ error: 'Dossier introuvable.' }); return null; }
  const perim = getUserSections(req.user);
  if (perim && !(d.section && perim.includes(d.section))) { res.status(404).json({ error: 'Dossier introuvable.' }); return null; }
  return d;
}

// ── Les listes de la maison (types de fraude, sanctions, étapes) ─────────────
r.get('/referentiel', authRequired, (req, res) => {
  res.json({ types: TYPES, natures: NATURES, types_fraude: TYPES_FRAUDE, sanctions: SANCTIONS,
    etapes: Object.fromEntries(Object.entries(ETAPES).map(([k, v]) => [k, v.map(e => ({ cle: e.cle, label: e.label, art: e.art, decision: !!e.decision, facultatif: !!e.facultatif }))])),
    peut_instruire: gesteAutorise(req, 'procedures.instruire') === 'oui',
    peut_decider: gesteAutorise(req, 'procedures.decider') === 'oui' });
});

// ── Le registre ──────────────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  migrerProcedures(db);
  const annee = req.query.annee || null;
  const perim = getUserSections(req.user);
  // L'année de travail ET la précédente : le recours d'octobre porte sur les
  // décisions de septembre, donc sur l'année d'avant.
  const m = annee ? /^(\d{4})-(\d{4})$/.exec(annee) : null;
  const precedente = m ? `${Number(m[1]) - 1}-${Number(m[2]) - 1}` : null;
  const lignes = db.prepare(`SELECT id FROM proc_dossier
    WHERE (? IS NULL OR annee_scolaire IN (?, ?)) ORDER BY id DESC LIMIT 500`).all(annee, annee, precedente);
  const dossiers = [];
  for (const { id } of lignes) {
    const d = lireDossier(id);
    if (!d) continue;
    if (perim && !(d.section && perim.includes(d.section))) continue;
    const prochaine = (d.echeances || []).find(e => e.etat === 'ouverte' && !e.information) || null;
    dossiers.push({
      id: d.id, type: d.type, nature: d.nature, annee_scolaire: d.annee_scolaire,
      etudiant: { id: d.etudiant.id, nom: d.etudiant.nom, prenom: d.etudiant.prenom, id_ecampus: d.etudiant.id_ecampus },
      section: d.section, ue_num: d.ue_num, ue_nom: d.ue_nom, session: d.session, objet: d.objet,
      courante: d.circuit.courante, courante_label: d.circuit.etapes.find(e => e.cle === d.circuit.courante)?.label || null,
      clos: d.circuit.clos, issue: d.etapes?.decision?.issue || d.etapes?.decision?.sanction
        || (d.etapes?.recevabilite?.recevable === false ? 'irrecevable' : null),
      prochaine, hors_delai: (d.echeances || []).some(e => e.etat === 'hors_delai'),
    });
  }
  res.json({ dossiers });
});

// ── Ce qu'il faut savoir de l'étudiant pour ouvrir un dossier ────────────────
r.get('/contexte/:etudiantId', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const id = Number(req.params.etudiantId);
  const annee = req.query.annee || anneeDeTravail(req);
  const e = db.prepare('SELECT id, nom, prenom, id_ecampus, section_rattachement FROM etudiant WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ error: 'Étudiant introuvable.' });
  // Le nom de l'unité se lit à part : une sous-requête qui trie sur une colonne
  // de la requête principale passait en local et cassait sur le serveur.
  const nomUE = db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1`);
  // L'ANNÉE DE TRAVAIL ET LA PRÉCÉDENTE : en octobre, un recours vise presque
  // toujours un refus de septembre, donc de l'année d'avant.
  const m = /^(\d{4})-(\d{4})$/.exec(annee);
  const precedente = m ? `${Number(m[1]) - 1}-${Number(m[2]) - 1}` : null;
  const annees = [annee, precedente].filter(Boolean);
  const inscriptions = db.prepare(`SELECT ue_num, annee_scolaire, resultat, resultat_s1, resultat_s2,
      points, COALESCE(num_organisation, 0) AS num_organisation
    FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire IN (${annees.map(() => '?').join(',')})
    ORDER BY annee_scolaire DESC, ue_num`).all(id, ...annees)
    .map(i => {
      const session = i.resultat_s2 ? 2 : 1;
      return { ...i, ue_nom: nomUE.get(i.ue_num, i.annee_scolaire)?.ue_nom || null,
               section: sectionDe(id, i.ue_num, i.annee_scolaire), session, recourable: est_recourable(i.resultat) };
    });
  const perim = getUserSections(req.user);
  const visibles = perim ? inscriptions.filter(i => i.section && perim.includes(i.section)) : inscriptions;
  res.json({ etudiant: e, annee, annees, inscriptions: visibles });
});

/** Les cours et acquis d'une UE, et ses chargés de cours de l'année. */
r.get('/ue/:ueNum', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  let cours = [];
  try { cours = structureUE(ueNum, annee); } catch { cours = []; }
  const charges = db.prepare(`SELECT DISTINCT a.professeur_id AS id, p.nom, p.prenom, a.code_cours AS cours_code
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
      AND COALESCE(a.type_cours, '') <> 'Z' ORDER BY p.nom, p.prenom`).all(ueNum, annee);
  const seance = db.prepare(`SELECT president_nom, president_role, publie_le, session, cloturee FROM deliberation_seance
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY session DESC LIMIT 1`).get(ueNum, annee) || null;
  res.json({ ue_num: ueNum, annee, cours, charges, seance });
});

// ── Ouvrir un dossier ────────────────────────────────────────────────────────
r.post('/', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  migrerProcedures(db);
  const b = req.body || {};
  const type = b.type, annee = b.annee_scolaire || anneeDeTravail(req);
  const etudiantId = Number(b.etudiant_id);
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Recours ou procédure disciplinaire ?' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudiantId);
  if (!e) return res.status(400).json({ error: "Choisissez l'étudiant." });
  const nature = type === 'disciplinaire' ? (NATURES.includes(b.nature) ? b.nature : null) : null;
  if (type === 'disciplinaire' && !nature) return res.status(400).json({ error: 'Fraude ou comportement ?' });

  const ueNum = b.ue_num ? Number(b.ue_num) : null;
  let insc = null;
  if (ueNum) {
    insc = db.prepare(`SELECT resultat, resultat_s2, COALESCE(num_organisation, 0) AS org FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudiantId, annee, ueNum);
    if (!insc) return res.status(400).json({ error: "Cet étudiant n'est pas inscrit à cette unité cette année." });
  }
  // UN RECOURS NE VISE QU'UN REFUS (art. 87 §1-2) : ni l'ajournement, ni la VA.
  if (type === 'recours') {
    if (!ueNum) return res.status(400).json({ error: 'Choisissez la décision contestée (une UE refusée).' });
    if (!est_recourable(insc.resultat)) {
      return res.status(409).json({ error: "Seul un refus peut faire l'objet d'un recours (RDE art. 87). "
        + "Un ajournement ou une décision de valorisation se motive, mais ne se conteste pas." });
    }
  }
  if (nature === 'fraude' && !ueNum) return res.status(400).json({ error: "Une fraude porte sur l'épreuve d'une UE : choisissez-la." });

  const section = sectionDe(etudiantId, ueNum, annee);
  const perim = getUserSections(req.user);
  if (perim && !(section && perim.includes(section))) return res.status(403).json({ error: 'Étudiant hors de votre périmètre.' });

  const session = b.session ? Number(b.session) : (insc?.resultat_s2 ? 2 : 1);
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO proc_dossier (type, nature, etudiant_id, annee_scolaire, section, ue_num,
        session, num_organisation, objet, cree_par_id, cree_par_nom) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(type, nature, etudiantId, annee, section, ueNum, ueNum ? session : null, insc?.org ?? null,
           String(b.objet || '').trim() || null, req.user?.id || null, qui(req));
    const did = Number(info.lastInsertRowid);
    const ajAcq = db.prepare('INSERT OR IGNORE INTO proc_acquis (dossier_id, cours_code, aa_code) VALUES (?,?,?)');
    for (const a of (Array.isArray(b.acquis) ? b.acquis : [])) if (a?.aa_code) ajAcq.run(did, a.cours_code || null, a.aa_code);
    // LE CDE RESTREINT SE PROPOSE, IL NE SE TAPE PAS : le président de la
    // séance, puis les chargés de cours de l'UE — à cocher présents.
    if (type === 'recours' && ueNum) {
      const s = db.prepare(`SELECT president_nom FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?
        ORDER BY session DESC LIMIT 1`).get(ueNum, annee);
      const ajM = db.prepare('INSERT INTO proc_membre (dossier_id, role, cle, nom, present) VALUES (?,?,?,?,?)');
      if (s?.president_nom) ajM.run(did, 'president', null, s.president_nom, 1);
      for (const p of db.prepare(`SELECT DISTINCT a.professeur_id AS id, p.nom, p.prenom FROM attribution a
          JOIN professeur p ON p.id = a.professeur_id WHERE a.ue_num = ? AND a.annee_scolaire = ?
          AND a.professeur_id IS NOT NULL AND COALESCE(a.type_cours,'') <> 'Z' ORDER BY p.nom`).all(ueNum, annee)) {
        ajM.run(did, 'membre', `p:${p.id}`, `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim(), 0);
      }
    }
    return did;
  })();
  res.json(lireDossier(id));
});

r.get('/:id', authRequired, (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  res.json({ ...d, peut_instruire: gesteAutorise(req, 'procedures.instruire') === 'oui',
    peut_decider: gesteAutorise(req, 'procedures.decider') === 'oui' });
});

/** Les personnes du dossier (président, membres, rédacteur, rapporteur) :
 *  la liste entière se réécrit — elle est courte. */
r.put('/:id/membres', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  const liste = Array.isArray(req.body?.membres) ? req.body.membres : [];
  const ROLES = ['president', 'membre', 'redacteur', 'rapporteur'];
  db.transaction(() => {
    db.prepare('DELETE FROM proc_membre WHERE dossier_id = ?').run(d.id);
    const aj = db.prepare('INSERT INTO proc_membre (dossier_id, role, cle, nom, present) VALUES (?,?,?,?,?)');
    for (const m of liste) {
      if (!ROLES.includes(m.role) || !String(m.nom || '').trim()) continue;
      aj.run(d.id, m.role, m.cle || null, String(m.nom).trim(), m.present === false || m.present === 0 ? 0 : 1);
    }
  })();
  res.json(lireDossier(d.id));
});

r.put('/:id/acquis', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  if (d.etapes?.decision) return res.status(409).json({ error: 'La décision est posée : les acquis visés ne se changent plus.' });
  const liste = Array.isArray(req.body?.acquis) ? req.body.acquis : [];
  db.transaction(() => {
    db.prepare('DELETE FROM proc_acquis WHERE dossier_id = ?').run(d.id);
    const aj = db.prepare('INSERT OR IGNORE INTO proc_acquis (dossier_id, cours_code, aa_code) VALUES (?,?,?)');
    for (const a of liste) if (a?.aa_code) aj.run(d.id, a.cours_code || null, a.aa_code);
  })();
  res.json(lireDossier(d.id));
});

// ── Poser une étape ──────────────────────────────────────────────────────────
r.post('/:id/etape', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  const etape = String(req.body?.etape || '');
  const v = req.body?.donnees && typeof req.body.donnees === 'object' ? req.body.donnees : {};
  const def = (ETAPES[d.type] || []).find(e => e.cle === etape);
  // DÉCIDER EST LE GESTE DE LA DIRECTION — instruire ne suffit pas.
  if (def?.decision && gesteAutorise(req, 'procedures.decider') !== 'oui') {
    return res.status(403).json({ error: 'Cette étape est une décision : elle revient à la direction.' });
  }
  const manque = verifierEtape(d, etape, v);
  if (manque.length) return res.status(409).json({ error: `Il manque : ${manque.join(' ; ')}.`, manque });

  const effets = [];
  db.transaction(() => {
    db.prepare('INSERT INTO proc_etape (dossier_id, etape, donnees, par_id, par_nom) VALUES (?,?,?,?,?)')
      .run(d.id, etape, JSON.stringify(v), req.user?.id || null, qui(req));

    // UN RECOURS ACCUEILLI ROUVRE LA DÉLIBÉRATION (choix de Charles, 3 octobre
    // 2026) : la séance de l'UE se rouvre, motif écrit, lié au dossier — le
    // CDE re-délibère cet étudiant, et la correction laisse trace.
    if (d.type === 'recours' && etape === 'decision' && v.issue === 'accueilli') {
      const s = db.prepare(`SELECT id, cloturee FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?
        AND session = ? AND num_organisation = ?`).get(d.ue_num, d.annee_scolaire, d.session || 1, d.num_organisation || 0)
        || db.prepare(`SELECT id, cloturee FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?
        AND session = ? ORDER BY num_organisation LIMIT 1`).get(d.ue_num, d.annee_scolaire, d.session || 1);
      if (s?.cloturee) {
        db.exec(`CREATE TABLE IF NOT EXISTS deliberation_reouverture (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ue_num INTEGER NOT NULL, annee_scolaire TEXT NOT NULL,
          session INTEGER NOT NULL DEFAULT 1, motif TEXT, le TEXT DEFAULT CURRENT_TIMESTAMP, par TEXT)`);
        const motif = `Recours interne accueilli — dossier n° ${d.id}, ${String(d.etudiant.nom || '').toUpperCase()} ${d.etudiant.prenom || ''}`;
        db.prepare(`INSERT INTO deliberation_reouverture (ue_num, annee_scolaire, session, motif, par) VALUES (?,?,?,?,?)`)
          .run(d.ue_num, d.annee_scolaire, d.session || 1, motif, req.user?.email || null);
        db.prepare(`UPDATE deliberation_seance SET cloturee = 0, maj_le = datetime('now'), maj_par = ? WHERE id = ?`)
          .run(req.user?.email || null, s.id);
        effets.push(`La séance de l'UE ${d.ue_num} (session ${d.session || 1}) est rouverte : le CDE re-délibère.`);
      } else if (s) {
        effets.push(`La séance de l'UE ${d.ue_num} est déjà ouverte : le CDE peut re-délibérer.`);
      }
    }

    // LA FRAUDE SANCTIONNÉE PORTE SUR LES ACQUIS VISÉS (art. 75 §1) : ils
    // sont ajournés dans la délibération de la session, avec la motivation
    // du dossier. En seconde session, l'ajournement d'un acquis vaut refus.
    if (d.type === 'disciplinaire' && d.nature === 'fraude' && etape === 'decision' && d.ue_num) {
      const ses = d.session || 1;
      const poser = db.prepare(`INSERT INTO deliberation_ajustement
          (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
        VALUES (?,?,?,?, 'aa', ?, 'ajourne', ?)
        ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session, portee, code)
        DO UPDATE SET action = 'ajourne', maj_le = CURRENT_TIMESTAMP, maj_par = excluded.maj_par`);
      const motiver = db.prepare(`INSERT INTO decision_motivation
          (etudiant_id, annee_scolaire, ue_num, aa_code, motif, maj_le, maj_par)
        VALUES (?,?,?,?,?, datetime('now'), ?)
        ON CONFLICT(etudiant_id, annee_scolaire, ue_num, aa_code) DO UPDATE SET
          motif = excluded.motif, maj_le = excluded.maj_le, maj_par = excluded.maj_par`);
      const motif = `Fraude constatée (RDE art. 72-75, dossier n° ${d.id}) : ${String(v.motivation || '').trim()}`;
      try {
        for (const a of d.acquis) {
          poser.run(d.etudiant_id, d.annee_scolaire, d.ue_num, ses, a.aa_code, req.user?.email || null);
          motiver.run(d.etudiant_id, d.annee_scolaire, d.ue_num, a.aa_code, motif, req.user?.email || null);
        }
        effets.push(`${d.acquis.length} acquis ajourné(s) dans la délibération de l'UE ${d.ue_num}, session ${ses}`
          + (v.academique === 'refuse' ? ' — le CDE y prononce le refus.' : '.'));
      } catch (err) {
        effets.push(`La délibération n'a pas pu être mise à jour (${err.message}) : à poser à la main.`);
      }
    }
  })();
  res.json({ ...lireDossier(d.id), effets });
});

// ── Les pièces déposées (plainte, PV de surveillance, preuves) ───────────────
const depot = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = join(DATA_DIR, 'procedures', String(Number(req.params.id) || 0));
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const propre = String(file.originalname || 'piece').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\w.-]+/g, '_').slice(-80);
      cb(null, `${Date.now()}_${propre}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});
r.post('/:id/pieces', authRequired, gesteRequis('procedures.instruire'), (req, res, next) => {
  if (!dossierPermis(req, res, req.params.id)) return;
  next();
}, depot.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  db.prepare('INSERT INTO proc_piece (dossier_id, categorie, nom, chemin, taille, par_nom) VALUES (?,?,?,?,?,?)')
    .run(Number(req.params.id), String(req.body?.categorie || 'autre'), req.file.originalname, req.file.path,
         req.file.size, qui(req));
  res.json(lireDossier(req.params.id));
});
r.get('/:id/pieces/:pid', authRequired, (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  const p = db.prepare('SELECT * FROM proc_piece WHERE id = ? AND dossier_id = ?').get(Number(req.params.pid), d.id);
  if (!p || !existsSync(p.chemin)) return res.status(404).json({ error: 'Pièce introuvable.' });
  res.download(resolve(p.chemin), p.nom);
});

// ── Les pièces officielles (enveloppe des pièces nominatives) ────────────────
r.get('/:id/document/:piece', authRequired, gesteRequis('procedures.instruire'), (req, res) => {
  const d = dossierPermis(req, res, req.params.id);
  if (!d) return;
  const out = composerPieceProcedure(String(req.params.piece), d);
  if (out.code) return res.status(out.code).json({ error: out.erreur, manques: out.manques });
  res.json({ html: out.html, nom: out.nom, titre: PIECES[req.params.piece]?.titre });
});

export default r;
