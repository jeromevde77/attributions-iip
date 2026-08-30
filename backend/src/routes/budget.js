// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Gestion budgétaire
//
// Le budget se prépare chaque année CIVILE, section par section, sur le canevas
// du pouvoir organisateur : une ligne par prévision, rattachée à un compte
// général, avec prix unitaire hors TVA, quantité et taux de TVA.
//
// Deux apports par rapport au tableur :
//   · le budget est réparti par section, chaque coordination ne voyant et ne
//     modifiant que la sienne ;
//   · les dépenses s'encodent en regard des prévisions, ce qui donne enfin le
//     solde disponible — jusqu'ici tenu en centrale et invisible ici.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { exigeValidation, deposerDemande } from './demandes.js';

const r = Router();

export function migrerBudget(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS budget_compte (
      reference   TEXT PRIMARY KEY,
      libelle     TEXT NOT NULL,
      bilan       TEXT,              -- Charge | Produit
      type        TEXT,              -- Cpte général, Investissement…
      tva_defaut  REAL,
      actif       INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS budget_ligne (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_civile   INTEGER NOT NULL,
      section        TEXT NOT NULL,          -- section ou service (Direction, MDP…)
      compte_ref     TEXT,
      details        TEXT NOT NULL,
      a_charge       TEXT,                   -- « IIP », « IIP / HELB Santé 50% »…
      prix_unitaire  REAL NOT NULL DEFAULT 0,
      quantite       REAL NOT NULL DEFAULT 1,
      taux_tva       REAL NOT NULL DEFAULT 0.21,
      remarque       TEXT,
      statut         TEXT NOT NULL DEFAULT 'prevu',   -- prevu | arbitre | refuse
      cree_par       TEXT,
      maj_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_budget_ligne ON budget_ligne(annee_civile, section);

    CREATE TABLE IF NOT EXISTS budget_depense (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ligne_id       INTEGER REFERENCES budget_ligne(id) ON DELETE CASCADE,
      annee_civile   INTEGER NOT NULL,
      section        TEXT NOT NULL,
      date_depense   TEXT,
      libelle        TEXT NOT NULL,
      montant_htva   REAL NOT NULL DEFAULT 0,
      taux_tva       REAL NOT NULL DEFAULT 0.21,
      piece          TEXT,                   -- n° de facture ou de bon
      encode_par     TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_budget_depense ON budget_depense(annee_civile, section);
    `);
    console.log('[migration] Tables budget créées');
  } catch (e) { console.error('[migration] budget :', e.message); }
}

// Périmètre de l'utilisateur : un coordinateur ne voit que ses sections.
function sectionsAutorisees(user) {
  const s = getUserSections(user);
  return s === null ? null : s;          // null = toutes
}
function peutEcrire(user, section) {
  if (user?.role === 'admin') return true;
  const s = sectionsAutorisees(user);
  return s === null ? true : s.includes(section);
}

const htva = l => Number(l.prix_unitaire || 0) * Number(l.quantite || 0);
const tvac = l => htva(l) * (1 + Number(l.taux_tva || 0));

// ── Référentiel des comptes ─────────────────────────────────────────────────
r.get('/comptes', authRequired, (req, res) => {
  res.json(db.prepare(
    'SELECT * FROM budget_compte WHERE actif = 1 ORDER BY reference'
  ).all());
});

r.put('/comptes', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
  const { comptes } = req.body;
  if (!Array.isArray(comptes)) return res.status(400).json({ error: 'comptes requis' });
  const up = db.prepare(`
    INSERT INTO budget_compte (reference, libelle, bilan, type, tva_defaut)
    VALUES (?,?,?,?,?)
    ON CONFLICT(reference) DO UPDATE SET
      libelle = excluded.libelle, bilan = excluded.bilan,
      type = excluded.type, tva_defaut = excluded.tva_defaut
  `);
  let n = 0;
  db.transaction(() => {
    for (const c of comptes) {
      if (!c.reference) continue;
      up.run(String(c.reference).trim(), c.libelle || '', c.bilan || null,
             c.type || null, c.tva_defaut != null ? Number(c.tva_defaut) : null);
      n++;
    }
  })();
  res.json({ ok: true, comptes: n });
});

// ── Budget d'une section pour une année civile ─────────────────────────────
r.get('/', authRequired, (req, res) => {
  const annee = Number(req.query.annee);
  const section = req.query.section;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const autorisees = sectionsAutorisees(req.user);
  if (section && autorisees && !autorisees.includes(section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  const clauses = ['annee_civile = @annee'];
  const p = { annee };
  if (section) { clauses.push('section = @section'); p.section = section; }
  else if (autorisees) {
    clauses.push(`section IN (${autorisees.map((_, i) => '@s' + i).join(',') || "''"})`);
    autorisees.forEach((s, i) => { p['s' + i] = s; });
  }

  const lignes = db.prepare(`
    SELECT l.*, c.libelle AS compte_libelle, c.bilan
    FROM budget_ligne l
    LEFT JOIN budget_compte c ON c.reference = l.compte_ref
    WHERE ${clauses.join(' AND ')}
    ORDER BY l.section, l.compte_ref, l.id
  `).all(p);

  const depenses = db.prepare(`
    SELECT * FROM budget_depense WHERE ${clauses.join(' AND ')} ORDER BY date_depense, id
  `).all(p);

  const parLigne = {};
  for (const d of depenses) {
    if (d.ligne_id == null) continue;
    parLigne[d.ligne_id] = (parLigne[d.ligne_id] || 0) + Number(d.montant_htva || 0);
  }

  const enrichies = lignes.map(l => {
    const prevu = Math.round(htva(l) * 100) / 100;
    const engage = Math.round((parLigne[l.id] || 0) * 100) / 100;
    return {
      ...l,
      total_htva: prevu,
      total_tvac: Math.round(tvac(l) * 100) / 100,
      valeur_tva: Math.round((tvac(l) - htva(l)) * 100) / 100,
      engage,
      solde: Math.round((prevu - engage) * 100) / 100,
      depasse: engage > prevu,
    };
  });

  // Dépenses sans ligne de prévision : elles existent et doivent se voir.
  const horsPrevision = depenses.filter(d => d.ligne_id == null);

  res.json({
    annee, section: section || null,
    lignes: enrichies,
    depenses,
    hors_prevision: horsPrevision,
    totaux: {
      prevu_htva: Math.round(enrichies.reduce((s, l) => s + l.total_htva, 0) * 100) / 100,
      prevu_tvac: Math.round(enrichies.reduce((s, l) => s + l.total_tvac, 0) * 100) / 100,
      engage: Math.round(depenses.reduce((s, d) => s + Number(d.montant_htva || 0), 0) * 100) / 100,
    },
    peut_ecrire: section ? peutEcrire(req.user, section) : (autorisees === null),
  });
});

// ── Synthèse par section ───────────────────────────────────────────────────
r.get('/synthese', authRequired, (req, res) => {
  const annee = Number(req.query.annee);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const autorisees = sectionsAutorisees(req.user);

  const lignes = db.prepare('SELECT * FROM budget_ligne WHERE annee_civile = ?').all(annee)
    .filter(l => !autorisees || autorisees.includes(l.section));
  const depenses = db.prepare('SELECT * FROM budget_depense WHERE annee_civile = ?').all(annee)
    .filter(d => !autorisees || autorisees.includes(d.section));

  const par = {};
  const casier = s => (par[s] = par[s] || { section: s, prevu: 0, engage: 0, lignes: 0, depenses: 0 });
  for (const l of lignes) { const k = casier(l.section); k.prevu += htva(l); k.lignes++; }
  for (const d of depenses) { const k = casier(d.section); k.engage += Number(d.montant_htva || 0); k.depenses++; }

  res.json({
    annee,
    sections: Object.values(par).map(k => ({
      ...k,
      prevu: Math.round(k.prevu * 100) / 100,
      engage: Math.round(k.engage * 100) / 100,
      solde: Math.round((k.prevu - k.engage) * 100) / 100,
      taux: k.prevu ? Math.round((k.engage / k.prevu) * 100) : null,
    })).sort((a, b) => b.prevu - a.prevu),
  });
});

// ── Lignes de prévision ────────────────────────────────────────────────────
r.post('/ligne', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const l = req.body;
  if (!l.annee_civile || !l.section || !l.details) {
    return res.status(400).json({ error: 'annee_civile, section et details requis' });
  }
  if (!peutEcrire(req.user, l.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  // La coordination encode pour sa section, mais sa saisie passe par la
  // direction : c'est la règle posée pour tous ses écrans.
  if (exigeValidation(req.user)) {
    return res.json(deposerDemande({
      type: 'budget_ligne', operation: 'creer', cible_id: null,
      section: l.section, annee_scolaire: String(l.annee_civile),
      libelle: `Prévision budgétaire — ${l.details}`,
      avant: null,
      apres: {
        annee_civile: Number(l.annee_civile), section: l.section,
        compte_ref: l.compte_ref || null, details: l.details,
        a_charge: l.a_charge || 'IIP', prix_unitaire: Number(l.prix_unitaire || 0),
        quantite: Number(l.quantite || 1),
        taux_tva: l.taux_tva != null ? Number(l.taux_tva) : 0.21,
        remarque: l.remarque || null, statut: 'prevu',
      },
      user: req.user,
    }));
  }

  const info = db.prepare(`
    INSERT INTO budget_ligne (annee_civile, section, compte_ref, details, a_charge,
      prix_unitaire, quantite, taux_tva, remarque, statut, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(Number(l.annee_civile), l.section, l.compte_ref || null, l.details,
         l.a_charge || 'IIP', Number(l.prix_unitaire || 0), Number(l.quantite || 1),
         l.taux_tva != null ? Number(l.taux_tva) : 0.21, l.remarque || null,
         l.statut || 'prevu', req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/ligne/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const ligne = db.prepare('SELECT section FROM budget_ligne WHERE id = ?').get(Number(req.params.id));
  if (!ligne) return res.status(404).json({ error: 'ligne introuvable' });
  if (!peutEcrire(req.user, ligne.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const l = req.body;
  db.prepare(`
    UPDATE budget_ligne SET
      compte_ref = ?, details = ?, a_charge = ?, prix_unitaire = ?, quantite = ?,
      taux_tva = ?, remarque = ?, statut = ?, maj_le = datetime('now')
    WHERE id = ?
  `).run(l.compte_ref || null, l.details || '', l.a_charge || 'IIP',
         Number(l.prix_unitaire || 0), Number(l.quantite || 1),
         l.taux_tva != null ? Number(l.taux_tva) : 0.21, l.remarque || null,
         l.statut || 'prevu', Number(req.params.id));
  res.json({ ok: true });
});

r.delete('/ligne/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const ligne = db.prepare('SELECT section FROM budget_ligne WHERE id = ?').get(Number(req.params.id));
  if (!ligne) return res.status(404).json({ error: 'ligne introuvable' });
  if (!peutEcrire(req.user, ligne.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  db.prepare('DELETE FROM budget_ligne WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Dépenses ───────────────────────────────────────────────────────────────
r.post('/depense', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const d = req.body;
  if (!d.annee_civile || !d.section || !d.libelle) {
    return res.status(400).json({ error: 'annee_civile, section et libelle requis' });
  }
  if (!peutEcrire(req.user, d.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const info = db.prepare(`
    INSERT INTO budget_depense (ligne_id, annee_civile, section, date_depense,
      libelle, montant_htva, taux_tva, piece, encode_par)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(d.ligne_id ? Number(d.ligne_id) : null, Number(d.annee_civile), d.section,
         d.date_depense || new Date().toISOString().slice(0, 10), d.libelle,
         Number(d.montant_htva || 0), d.taux_tva != null ? Number(d.taux_tva) : 0.21,
         d.piece || null, req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.delete('/depense/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const d = db.prepare('SELECT section FROM budget_depense WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'dépense introuvable' });
  if (!peutEcrire(req.user, d.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  db.prepare('DELETE FROM budget_depense WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Import du canevas budgétaire ───────────────────────────────────────────
// Le canevas ne porte pas de colonne « section » : celle-ci se lit dans le
// préfixe du détail — « TIM - Prix pour les étudiants ». Les lignes sans
// préfixe reconnaissable atterrissent dans un fourre-tout à répartir.
r.post('/import', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const { annee, lignes, remplacer } = req.body;
  if (!annee || !Array.isArray(lignes)) {
    return res.status(400).json({ error: 'annee et lignes requises' });
  }

  const autorisees = sectionsAutorisees(req.user);
  const refusees = new Set();

  const ins = db.prepare(`
    INSERT INTO budget_ligne (annee_civile, section, compte_ref, details, a_charge,
      prix_unitaire, quantite, taux_tva, remarque, statut, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?, 'prevu', ?)
  `);

  let n = 0, supprimees = 0;
  db.transaction(() => {
    if (remplacer) {
      const sections = [...new Set(lignes.map(l => l.section).filter(Boolean))]
        .filter(s => !autorisees || autorisees.includes(s));
      for (const s of sections) {
        supprimees += db.prepare(
          'DELETE FROM budget_ligne WHERE annee_civile = ? AND section = ?'
        ).run(Number(annee), s).changes;
      }
    }
    for (const l of lignes) {
      const section = l.section || 'À répartir';
      if (autorisees && !autorisees.includes(section)) { refusees.add(section); continue; }
      ins.run(Number(annee), section, l.compte_ref || null, l.details || '',
              l.a_charge || 'IIP', Number(l.prix_unitaire || 0), Number(l.quantite || 1),
              l.taux_tva != null ? Number(l.taux_tva) : 0.21, l.remarque || null,
              req.user?.email || null);
      n++;
    }
  })();

  res.json({ ok: true, annee, importees: n, supprimees, refusees: [...refusees] });
});

// ── Reprendre le budget de l'année précédente ──────────────────────────────
r.post('/reprendre', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const { annee, annee_source, section } = req.body;
  if (!annee || !annee_source || !section) {
    return res.status(400).json({ error: 'annee, annee_source et section requises' });
  }
  if (!peutEcrire(req.user, section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const src = db.prepare(
    'SELECT * FROM budget_ligne WHERE annee_civile = ? AND section = ?'
  ).all(Number(annee_source), section);

  const ins = db.prepare(`
    INSERT INTO budget_ligne (annee_civile, section, compte_ref, details, a_charge,
      prix_unitaire, quantite, taux_tva, remarque, statut, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?, 'prevu', ?)
  `);
  let n = 0;
  db.transaction(() => {
    for (const l of src) {
      ins.run(Number(annee), section, l.compte_ref, l.details, l.a_charge,
              l.prix_unitaire, l.quantite, l.taux_tva, l.remarque,
              req.user?.email || null);
      n++;
    }
  })();
  res.json({
    ok: true, reprises: n, source_vide: src.length === 0,
    message: src.length === 0
      ? `Aucune prévision n'existe en ${annee_source} pour ${section} : rien à reprendre.`
      : `${n} ligne(s) reprise(s) de ${annee_source}.`,
  });
});

export default r;
