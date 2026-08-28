// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Reconstruction de l'historique des étudiants
//
// Les classeurs de suivi couvrent plusieurs années. Or eCampus RÉATTRIBUE un
// matricule à chaque rentrée : le même étudiant y figure sous 24-00174 puis
// 25-00298. Rapprocher les dossiers par matricule créerait donc un doublon par
// année, et chaque parcours serait éclaté.
//
// La clé stable est le NUMÉRO NATIONAL. On rapproche dans cet ordre :
//   1. numéro national, normalisé (chiffres seuls) ;
//   2. matricule connu — actuel ou mémorisé pour une année antérieure ;
//   3. nom, prénom et date de naissance.
//
// Tous les matricules rencontrés sont mémorisés, de sorte qu'un import ultérieur
// retrouve la bonne personne quel que soit le millésime employé.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerHistorique(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_matricule (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id  INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      id_ecampus   TEXT NOT NULL,
      annee        TEXT,
      source       TEXT,
      cree_le      TEXT DEFAULT (datetime('now')),
      UNIQUE(id_ecampus)
    );
    CREATE INDEX IF NOT EXISTS idx_etud_matricule ON etudiant_matricule(etudiant_id);
    `);

    // Colonne normalisée : le numéro national s'écrit avec espaces et tirets
    const cols = dbx.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('rn_norm')) {
      dbx.exec('ALTER TABLE etudiant ADD COLUMN rn_norm TEXT');
      dbx.exec("UPDATE etudiant SET rn_norm = REPLACE(REPLACE(REPLACE(COALESCE(num_national,''),' ',''),'-',''),'.','') WHERE num_national IS NOT NULL");
      console.log('[migration] etudiant.rn_norm ajoutée et alimentée');
    }
    dbx.exec('CREATE INDEX IF NOT EXISTS idx_etudiant_rn ON etudiant(rn_norm)');

    // Les matricules déjà connus deviennent des alias
    dbx.exec(`
      INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, source)
      SELECT id, id_ecampus, 'existant' FROM etudiant WHERE id_ecampus IS NOT NULL
    `);
    console.log('[migration] etudiant_matricule créée');
  } catch (e) { console.error('[migration] historique :', e.message); }
}

const normRN  = s => String(s || '').replace(/[^0-9]/g, '');
const normTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Les dates du classeur sont en toutes lettres : « 21 décembre 2001 »
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août',
              'septembre','octobre','novembre','décembre'];
function normDate(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /^(\d{1,2})\s+([a-zéèûôA-Z]+)\s+(\d{4})$/.exec(t);
  if (m) {
    const i = MOIS.findIndex(x => normTxt(x) === normTxt(m[2]));
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return t;
}

/**
 * Retrouve un étudiant existant, du plus fiable au moins fiable.
 * Renvoie { id, methode } ou null.
 */
function rapprocher(p) {
  const rn = normRN(p.num_national);
  if (rn) {
    const e = db.prepare('SELECT id FROM etudiant WHERE rn_norm = ? LIMIT 1').get(rn);
    if (e) return { id: e.id, methode: 'numero_national' };
  }
  const mat = String(p.id_ecampus || '').trim();
  if (mat) {
    const a = db.prepare('SELECT etudiant_id AS id FROM etudiant_matricule WHERE id_ecampus = ?').get(mat);
    if (a) return { id: a.id, methode: 'matricule' };
    const e = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?').get(mat);
    if (e) return { id: e.id, methode: 'matricule' };
  }
  const nom = normTxt(p.nom), prenom = normTxt(p.prenom), dn = normDate(p.date_naissance);
  if (nom && prenom && dn) {
    const e = db.prepare(`
      SELECT id FROM etudiant
      WHERE REPLACE(LOWER(nom),' ','') LIKE ? AND REPLACE(LOWER(prenom),' ','') LIKE ?
    `).all(nom.slice(0, 12) + '%', prenom.slice(0, 8) + '%')
      .find(x => {
        const d = db.prepare('SELECT date_naissance FROM etudiant WHERE id = ?').get(x.id);
        return normDate(d?.date_naissance) === dn;
      });
    if (e) return { id: e.id, methode: 'identite' };
  }
  return null;
}

// ── Import par lot : simulation puis exécution ─────────────────────────────
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { fichiers, simulation = true } = req.body;
  if (!Array.isArray(fichiers) || !fichiers.length) {
    return res.status(400).json({ error: 'fichiers requis' });
  }

  const rapport = {
    simulation, fichiers: [],
    total: { rapproches: 0, crees: 0, resultats: 0, sans_correspondance: 0,
             notes_cours: 0, notes_aa: 0 },
    methodes: { numero_national: 0, matricule: 0, identite: 0, cree: 0 },
    doublons_pressentis: [],
  };

  const insEtud = db.prepare(`
    INSERT INTO etudiant (id_ecampus, nom, prenom, titre, email_ecole, email_perso,
      date_naissance, num_national, rn_norm, gsm, adresse, localite, cp)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const majEtud = db.prepare(`
    UPDATE etudiant SET
      num_national = COALESCE(num_national, ?), rn_norm = COALESCE(rn_norm, ?),
      date_naissance = COALESCE(date_naissance, ?),
      email_ecole = COALESCE(email_ecole, ?), email_perso = COALESCE(email_perso, ?),
      adresse = COALESCE(adresse, ?), localite = COALESCE(localite, ?), cp = COALESCE(cp, ?)
    WHERE id = ?
  `);
  const insAlias = db.prepare(`
    INSERT OR IGNORE INTO etudiant_matricule (etudiant_id, id_ecampus, annee, source)
    VALUES (?,?,?,?)
  `);
  const insInsc = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points, date_inscription)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat,
      points = COALESCE(excluded.points, etudiant_inscription.points)
  `);

  // Note d'un cours. Le seuil de 10/20 sert de statut par défaut : la
  // délibération peut en décider autrement, et se corrige ensuite à la main.
  const insCours = db.prepare(`
    INSERT INTO etudiant_resultat_cours
      (etudiant_id, annee_scolaire, ue_num, cours_code, statut, note)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code) DO UPDATE SET
      note = excluded.note, statut = excluded.statut, ue_num = excluded.ue_num
  `);

  // Note d'un acquis. La clé de la table préfixe le code par le cours,
  // un même acquis pouvant être coté dans deux cours distincts.
  const coursDeAA = db.prepare('SELECT cours_code FROM aa WHERE aa_code = ? LIMIT 1');
  const insAA = db.prepare(`
    INSERT INTO etudiant_note_detail
      (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points)
    VALUES (?,?,?, 'aa', ?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points, cours_code = excluded.cours_code
  `);

  const executer = () => {
    for (const f of fichiers) {
      const detail = {
        nom: f.nom, annee: f.annee, section: f.section || null,
        etudiants: (f.coordonnees || []).length,
        rapproches: 0, crees: 0, resultats: 0, sans_correspondance: 0,
        notes_cours: 0, notes_aa: 0, inconnus: [],
      };

      // Résolution des personnes du fichier
      const parMatricule = {};
      for (const p of (f.coordonnees || [])) {
        const mat = String(p.id_ecampus || '').trim();
        if (!mat) continue;
        const trouve = rapprocher(p);
        let id;
        if (trouve) {
          id = trouve.id;
          detail.rapproches++;
          rapport.methodes[trouve.methode]++;
          if (!simulation) {
            majEtud.run(p.num_national || null, normRN(p.num_national) || null,
              p.date_naissance || null, p.email_ecole || null, p.email_perso || null,
              p.adresse || null, p.localite || null, p.cp || null, id);
          }
        } else {
          detail.crees++;
          rapport.methodes.cree++;
          if (!simulation) {
            const info = insEtud.run(mat, p.nom || '', p.prenom || '', p.titre || null,
              p.email_ecole || null, p.email_perso || null, p.date_naissance || null,
              p.num_national || null, normRN(p.num_national) || null,
              p.gsm || null, p.adresse || null, p.localite || null, p.cp || null);
            id = Number(info.lastInsertRowid);
          } else {
            id = -1;   // simulation : aucun identifiant réel
          }
        }
        parMatricule[mat] = id;
        if (!simulation && id > 0) insAlias.run(id, mat, f.annee, 'classeur de suivi');
      }

      // Résultats
      const dateJour = new Date().toISOString().slice(0, 10);
      for (const r0 of (f.resultats || [])) {
        const mat = String(r0.id_ecampus || '').trim();
        let id = parMatricule[mat];
        if (id === undefined) {
          // Matricule absent de l'onglet Coordonnées : dernier recours
          const t = rapprocher({ id_ecampus: mat });
          id = t ? t.id : null;
          if (id) parMatricule[mat] = id;
        }
        if (!id || id < 0) {
          if (simulation && id === -1) { detail.resultats++; continue; }
          detail.sans_correspondance++;
          if (detail.inconnus.length < 12 && !detail.inconnus.includes(mat)) detail.inconnus.push(mat);
          continue;
        }
        if (!simulation) {
          insInsc.run(id, f.annee, Number(r0.ue_num),
            r0.resultat || null, r0.points != null ? Number(r0.points) : null, dateJour);
        }
        detail.resultats++;
      }

      // Notes de cours
      for (const n of (f.notesCours || [])) {
        const id = parMatricule[String(n.id_ecampus || '').trim()];
        if (!id || id < 0) { if (simulation && id === -1) detail.notes_cours++; continue; }
        if (!simulation) {
          insCours.run(id, f.annee, Number(n.ue_num), n.cours_code,
            Number(n.note) >= 10 ? 'reussi' : 'refuse', Number(n.note));
        }
        detail.notes_cours++;
      }

      // Notes d'acquis
      for (const n of (f.notesAA || [])) {
        const id = parMatricule[String(n.id_ecampus || '').trim()];
        if (!id || id < 0) { if (simulation && id === -1) detail.notes_aa++; continue; }
        if (!simulation) {
          const cc = coursDeAA.get(n.aa_code)?.cours_code || null;
          insAA.run(id, f.annee, Number(n.ue_num),
            (cc ? cc + '|' : '') + n.aa_code, cc, Number(n.note));
        }
        detail.notes_aa++;
      }

      rapport.fichiers.push(detail);
      rapport.total.rapproches += detail.rapproches;
      rapport.total.crees += detail.crees;
      rapport.total.resultats += detail.resultats;
      rapport.total.sans_correspondance += detail.sans_correspondance;
      rapport.total.notes_cours += detail.notes_cours;
      rapport.total.notes_aa += detail.notes_aa;
    }
  };

  if (simulation) executer();
  else db.transaction(executer)();

  // Doublons déjà présents en base : même numéro national, deux dossiers
  try {
    rapport.doublons_pressentis = db.prepare(`
      SELECT rn_norm, COUNT(*) AS n, GROUP_CONCAT(id_ecampus) AS matricules,
             MIN(nom) AS nom, MIN(prenom) AS prenom
      FROM etudiant WHERE rn_norm IS NOT NULL AND rn_norm != ''
      GROUP BY rn_norm HAVING n > 1 LIMIT 20
    `).all();
  } catch { /* colonne absente */ }

  res.json(rapport);
});

// ── Fusion de deux dossiers d'un même étudiant ─────────────────────────────
r.post('/fusionner', authRequired, roleRequired('admin'), (req, res) => {
  const { garder, supprimer } = req.body;
  if (!garder || !supprimer || garder === supprimer) {
    return res.status(400).json({ error: 'garder et supprimer requis, et distincts' });
  }
  const g = Number(garder), s = Number(supprimer);

  let inscriptions = 0, notes = 0, valorisations = 0;
  db.transaction(() => {
    // Les inscriptions du dossier supprimé rejoignent celui conservé,
    // sans écraser une année déjà renseignée.
    for (const i of db.prepare('SELECT * FROM etudiant_inscription WHERE etudiant_id = ?').all(s)) {
      const existe = db.prepare(
        'SELECT id FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?'
      ).get(g, i.annee_scolaire, i.ue_num);
      if (existe) {
        db.prepare(`UPDATE etudiant_inscription SET
          resultat = COALESCE(resultat, ?), points = COALESCE(points, ?) WHERE id = ?`)
          .run(i.resultat, i.points, existe.id);
      } else {
        db.prepare(`INSERT INTO etudiant_inscription
          (etudiant_id, annee_scolaire, ue_num, resultat, points, groupe, date_inscription)
          VALUES (?,?,?,?,?,?,?)`)
          .run(g, i.annee_scolaire, i.ue_num, i.resultat, i.points, i.groupe, i.date_inscription);
        inscriptions++;
      }
    }
    for (const t of ['etudiant_note_detail', 'etudiant_valorisation', 'etudiant_piece']) {
      try { db.prepare(`UPDATE OR IGNORE ${t} SET etudiant_id = ? WHERE etudiant_id = ?`).run(g, s); } catch {}
    }
    db.prepare('UPDATE OR IGNORE etudiant_matricule SET etudiant_id = ? WHERE etudiant_id = ?').run(g, s);
    // Compléter les champs vides du dossier conservé
    db.prepare(`
      UPDATE etudiant SET
        num_national   = COALESCE(num_national,   (SELECT num_national   FROM etudiant WHERE id = ?)),
        rn_norm        = COALESCE(rn_norm,        (SELECT rn_norm        FROM etudiant WHERE id = ?)),
        date_naissance = COALESCE(date_naissance, (SELECT date_naissance FROM etudiant WHERE id = ?)),
        adresse        = COALESCE(adresse,        (SELECT adresse        FROM etudiant WHERE id = ?)),
        localite       = COALESCE(localite,       (SELECT localite       FROM etudiant WHERE id = ?))
      WHERE id = ?
    `).run(s, s, s, s, s, g);
    db.prepare('DELETE FROM etudiant WHERE id = ?').run(s);
  })();

  res.json({ ok: true, garde: g, supprime: s, inscriptions });
});

export default r;
