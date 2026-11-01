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
import { migrerBudgetSections, assurerAnnee, syntheseBudget, nature, effectifsLucie, PRIORITES, ETATS_INVENTAIRE } from '../lib/budgetSections.js';

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
  /* LE RÉFÉRENTIEL CORRIGÉ, UNE FOIS (Charles, 10 octobre 2026). Le canevas 2026 emploie
     dans sa colonne A huit comptes absents de sa propre liste déroulante : ils entrent au
     référentiel. Et les treize comptes HELB sortent de la liste de choix — INACTIFS, pas
     effacés : une pièce ancienne qui les cite reste lisible. Aucune ligne ne les utilisait. */
  try {
    dbx.exec(`CREATE TABLE IF NOT EXISTS migration_faite (cle TEXT PRIMARY KEY, le TEXT DEFAULT (datetime('now')))`);
    if (!dbx.prepare("SELECT 1 FROM migration_faite WHERE cle = 'budget_2026_10_10_comptes'").get()) {
      const ajout = dbx.prepare(`INSERT INTO budget_compte (reference, libelle, bilan, type, tva_defaut) VALUES (?,?,?,'Cpte général',NULL)
        ON CONFLICT(reference) DO NOTHING`);
      const HUIT = [
        ['612330', 'Contrats photocopieurs et consommables', 'Charge'],
        ['613801', 'Rétribution enseignement - Société (Entreprise personne morale)', 'Charge'],
        ['623001', 'IIP IP transport domicile/travail statutaires', 'Charge'],
        ['626001', 'IIP Traitements FWB statutaires #737001', 'Charge'],
        ['737001', 'IIP Traitements FWB statutaires #626001', 'Produit'],
        ['737101', 'IIP Subventions de fonctionnement', 'Produit'],
        ['737130', "IIP Droits d'inscription", 'Produit'],
        ['737131', "IIP Droits d'inscription primo-arrivant", 'Produit'],
      ];
      dbx.transaction(() => {
        for (const [r0, l, b] of HUIT) ajout.run(r0, l, b);
        dbx.prepare("UPDATE budget_compte SET actif = 0 WHERE libelle LIKE '%HELB%'").run();
        dbx.prepare("INSERT INTO migration_faite (cle) VALUES ('budget_2026_10_10_comptes')").run();
      })();
      console.log('[migration] budget : 8 comptes ajoutés, comptes HELB retirés de la liste');
    }
  } catch (e) { console.error('[migration] budget (comptes) :', e.message); }
  try { migrerBudgetSections(dbx); } catch (e) { console.error('[migration] budget des sections :', e.message); }
}

// La direction règle les paramètres et arbitre ; la coordination encode pour ses sections.
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const estDirection = user => DIRECTION.includes(user?.role);
const qui = req => req.user?.nom_complet || req.user?.email || null;
/* LES CHAMPS DE LA LIGNE (guide C.2), lus une fois pour la création et la modification. */
function champsLigne(l) {
  const prio = PRIORITES[l.priorite] ? l.priorite : 'souhaitable';
  const mois = Number(l.mois) >= 1 && Number(l.mois) <= 12 ? Number(l.mois) : null;
  return { categorie_id: l.categorie_id ? Number(l.categorie_id) : null, priorite: prio, mois,
    justification: String(l.justification || '').trim() || null, devis: String(l.devis || '').trim() || null,
    tronc_commun: l.tronc_commun ? 1 : 0 };
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

  const seuil = db.prepare('SELECT seuil_invest FROM budget_parametre WHERE annee_civile = ?').get(annee)?.seuil_invest ?? 500;
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
      nature: nature(l.prix_unitaire, seuil),
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
    peut_arbitrer: estDirection(req.user), seuil,
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
  /* LA COORDINATION ÉCRIT, LA DIRECTION ARBITRE (Charles, 1er novembre 2026) : la ligne entre « prévue » ;
     seul l'arbitrage (route /arbitrer, direction) la dit retenue ou refusée. */
  const c = champsLigne(l);
  const info = db.prepare(`
    INSERT INTO budget_ligne (annee_civile, section, compte_ref, details, a_charge,
      prix_unitaire, quantite, taux_tva, remarque, statut, cree_par,
      categorie_id, priorite, mois, justification, devis, tronc_commun)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(Number(l.annee_civile), l.section, l.compte_ref || null, l.details,
         l.a_charge || 'IIP', Number(l.prix_unitaire || 0), Number(l.quantite || 1),
         l.taux_tva != null ? Number(l.taux_tva) : 0.21, l.remarque || null,
         estDirection(req.user) && ['prevu', 'arbitre', 'refuse'].includes(l.statut) ? l.statut : 'prevu', req.user?.email || null,
         c.categorie_id, c.priorite, c.mois, c.justification, c.devis, c.tronc_commun);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/ligne/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'), (req, res) => {
  const ligne = db.prepare('SELECT section, statut FROM budget_ligne WHERE id = ?').get(Number(req.params.id));
  if (!ligne) return res.status(404).json({ error: 'ligne introuvable' });
  if (!peutEcrire(req.user, ligne.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const l = req.body;
  // L'arbitrage est à la direction : la coordination ne change pas le statut d'une ligne.
  const statut = estDirection(req.user) && ['prevu', 'arbitre', 'refuse'].includes(l.statut) ? l.statut : ligne.statut;
  const c = champsLigne(l);
  /* LA SECTION SE CORRIGE (3.1.274, Charles, 10 octobre 2026 : « j'ai mis Restart et ce
     n'est pas le cas ; c'est Psychologue, qui n'existe pas — donc Autres »). Une ligne
     rangée dans la mauvaise section change de casier avec ses dépenses ; on doit
     pouvoir écrire dans les deux. */
  const nouvelle = String(l.section || ligne.section).trim();
  if (nouvelle !== ligne.section && !peutEcrire(req.user, nouvelle)) {
    return res.status(403).json({ error: `Section ${nouvelle} hors de votre périmètre` });
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE budget_ligne SET
        section = ?, compte_ref = ?, details = ?, a_charge = ?, prix_unitaire = ?, quantite = ?,
        taux_tva = ?, remarque = ?, statut = ?, categorie_id = ?, priorite = ?, mois = ?, justification = ?,
        devis = ?, tronc_commun = ?, maj_le = datetime('now')
      WHERE id = ?
    `).run(nouvelle, l.compte_ref || null, l.details || '', l.a_charge || 'IIP',
           Number(l.prix_unitaire || 0), Number(l.quantite || 1),
           l.taux_tva != null ? Number(l.taux_tva) : 0.21, l.remarque || null,
           statut, c.categorie_id, c.priorite, c.mois, c.justification, c.devis, c.tronc_commun, Number(req.params.id));
    if (nouvelle !== ligne.section) db.prepare('UPDATE budget_depense SET section = ? WHERE ligne_id = ?').run(nouvelle, Number(req.params.id));
  })();
  res.json({ ok: true, section: nouvelle });
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
      prix_unitaire, quantite, taux_tva, remarque, statut, cree_par,
      categorie_id, priorite, mois, justification, tronc_commun)
    VALUES (?,?,?,?,?,?,?,?,?, 'prevu', ?, ?,?,?,?,?)
  `);
  let n = 0;
  db.transaction(() => {
    for (const l of src) {
      // Reprise d'une ligne : à arbitrer de nouveau, sans son devis (daté) ni son arbitrage.
      ins.run(Number(annee), section, l.compte_ref, l.details, l.a_charge,
              l.prix_unitaire, l.quantite, l.taux_tva, l.remarque,
              req.user?.email || null, l.categorie_id ?? null, l.priorite || 'souhaitable', l.mois ?? null,
              l.justification ?? null, l.tronc_commun ? 1 : 0);
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

// ── LE BUDGET DES SECTIONS (guide, parties A à C) ───────────────────────────
/* Le tableau : la direction voit toutes les sections et les totaux ; une coordination, ses sections. */
r.get('/sections', authRequired, (req, res) => {
  const annee = Number(req.query.annee);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  try {
    const x = syntheseBudget(annee, estDirection(req.user) ? null : (sectionsAutorisees(req.user) || null));
    // LA COORDINATION NE VOIT QUE SON DISPONIBLE (Charles) : ni le brut, ni le coussin, ni le barème, ni le résultat de l'IIP.
    if (!estDirection(req.user)) {
      x.parametres = { annee_civile: x.parametres.annee_civile, seuil_invest: x.parametres.seuil_invest, montant_etudiant: x.parametres.montant_etudiant };
      x.sections = x.sections.map(({ enveloppe_brute, coussin, socle, ponderation, ...reste }) => reste);
      x.totaux = null;
    }
    res.json({ ...x, direction: estDirection(req.user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/categories', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM budget_categorie WHERE actif = 1 ORDER BY ordre, groupe, libelle').all());
});
r.put('/categories', authRequired, roleRequired(...DIRECTION), (req, res) => {
  const l = Array.isArray(req.body?.categories) ? req.body.categories : null;
  if (!l) return res.status(400).json({ error: 'categories requises' });
  const maj = db.prepare('UPDATE budget_categorie SET groupe = ?, libelle = ?, amortissement = ?, compte_defaut = ?, ordre = ?, actif = ? WHERE id = ?');
  const ins = db.prepare('INSERT INTO budget_categorie (groupe, libelle, amortissement, compte_defaut, ordre) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    for (const c of l) {
      const g = String(c.groupe || '').trim(), lib = String(c.libelle || '').trim();
      if (!g || !lib) continue;
      const a = c.amortissement === 'informatique' ? 'informatique' : 'mobilier';
      if (c.id) maj.run(g, lib, a, c.compte_defaut || null, Number(c.ordre) || 0, c.actif === false || c.actif === 0 ? 0 : 1, Number(c.id));
      else ins.run(g, lib, a, c.compte_defaut || null, Number(c.ordre) || 999);
    }
  })();
  res.json({ ok: true });
});

/* LES PARAMÈTRES D'UNE ANNÉE (C.1) — direction seule. */
r.get('/parametres', authRequired, roleRequired(...DIRECTION), (req, res) => {
  const annee = Number(req.query.annee);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  assurerAnnee(annee, qui(req));
  res.json({
    annee, parametres: db.prepare('SELECT * FROM budget_parametre WHERE annee_civile = ?').get(annee),
    sections: db.prepare('SELECT * FROM budget_section_param WHERE annee_civile = ? ORDER BY section').all(annee),
  });
});
r.put('/parametres', authRequired, roleRequired(...DIRECTION), (req, res) => {
  const annee = Number(req.body?.annee);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  assurerAnnee(annee, qui(req));
  const P = req.body?.parametres || {};
  const num = (v, min = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < min ? null : Number(v));
  for (const [k, min] of [['montant_etudiant', 0], ['seuil_invest', 0.01], ['amort_info', 1], ['amort_mobilier', 1],
    ['coussin_seuil1', 0], ['coussin_seuil2', 0], ['coussin_taux1', 0], ['coussin_taux2', 0], ['coussin_taux3', 0]]) {
    if (P[k] !== undefined && num(P[k], min) == null) return res.status(400).json({ error: `Valeur invalide : ${k}.` });
  }
  if (['coussin_taux1', 'coussin_taux2', 'coussin_taux3'].some(k => P[k] !== undefined && Number(P[k]) > 1)) return res.status(400).json({ error: 'Un taux de coussin est une part : entre 0 et 1 (0,10 pour 10 %).' });
  if (P.date_effectifs !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(P.date_effectifs))) return res.status(400).json({ error: 'Date de référence des effectifs : AAAA-MM-JJ.' });
  db.transaction(() => {
    const cur = db.prepare('SELECT * FROM budget_parametre WHERE annee_civile = ?').get(annee);
    const v = k => (P[k] === undefined ? cur[k] : P[k] === '' ? null : P[k]);
    db.prepare(`UPDATE budget_parametre SET montant_etudiant = ?, seuil_invest = ?, amort_info = ?, amort_mobilier = ?, date_effectifs = ?,
        orthoptie_budget_he = ?, orthoptie_part = ?, resultat_n1 = ?, coussin_seuil1 = ?, coussin_seuil2 = ?, coussin_taux1 = ?,
        coussin_taux2 = ?, coussin_taux3 = ?, maj_par = ?, maj_le = datetime('now') WHERE annee_civile = ?`)
      .run(Number(v('montant_etudiant')), Number(v('seuil_invest')), Math.round(Number(v('amort_info'))), Math.round(Number(v('amort_mobilier'))),
        v('date_effectifs'), v('orthoptie_budget_he') == null ? null : Number(v('orthoptie_budget_he')),
        Number(v('orthoptie_part') ?? 1 / 3), v('resultat_n1') == null ? null : Number(v('resultat_n1')),
        Number(v('coussin_seuil1') ?? 15000), Number(v('coussin_seuil2') ?? 30000), Number(v('coussin_taux1') ?? 0.1),
        Number(v('coussin_taux2') ?? 0.2), Number(v('coussin_taux3') ?? 0.3), qui(req), annee);
    const majS = db.prepare(`UPDATE budget_section_param SET socle = ?, ponderation = ?, effectif = ?, charges_n1 = ?, produits_n1 = ?,
        hors_budget = ?, reserve_invest = ?, maj_par = ?, maj_le = datetime('now') WHERE annee_civile = ? AND section = ?`);
    for (const s of Array.isArray(req.body?.sections) ? req.body.sections : []) {
      const c = db.prepare('SELECT * FROM budget_section_param WHERE annee_civile = ? AND section = ?').get(annee, s.section);
      if (!c) continue;
      const w = k => (s[k] === undefined ? c[k] : s[k] === '' ? null : Number(s[k]));
      majS.run(w('socle') ?? 0, w('ponderation') ?? 0, w('effectif') == null ? null : Math.round(w('effectif')), w('charges_n1'), w('produits_n1'),
        s.hors_budget === undefined ? c.hors_budget : (s.hors_budget ? 1 : 0), w('reserve_invest') ?? 0, qui(req), annee, s.section);
    }
  })();
  res.json({ ok: true });
});
/* Recompter les effectifs dans Lucie à la date de référence — simulation d'abord (rien n'est écrit sans `ecrire`). */
r.post('/parametres/effectifs', authRequired, roleRequired(...DIRECTION), (req, res) => {
  const annee = Number(req.body?.annee);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  assurerAnnee(annee, qui(req));
  const P = db.prepare('SELECT date_effectifs FROM budget_parametre WHERE annee_civile = ?').get(annee);
  const eff = effectifsLucie(P.date_effectifs);
  const lignes = db.prepare('SELECT section, effectif FROM budget_section_param WHERE annee_civile = ? AND hors_budget = 0').all(annee)
    .map(x => ({ section: x.section, actuel: x.effectif, lucie: eff[x.section] || 0 }));
  if (!req.body?.ecrire) return res.json({ simulation: true, date: P.date_effectifs, lignes });
  const maj = db.prepare("UPDATE budget_section_param SET effectif = ?, effectif_compte_le = datetime('now'), maj_par = ? WHERE annee_civile = ? AND section = ?");
  db.transaction(() => { for (const l of lignes) maj.run(l.lucie, qui(req), annee, l.section); })();
  res.json({ ok: true, date: P.date_effectifs, lignes });
});

/* L'ARBITRAGE (A.7) : la direction retient ou refuse une ligne ; un refus se motive. */
r.put('/ligne/:id/arbitrer', authRequired, roleRequired(...DIRECTION), (req, res) => {
  const statut = req.body?.statut;
  if (!['prevu', 'arbitre', 'refuse'].includes(statut)) return res.status(400).json({ error: 'statut : prevu, arbitre ou refuse' });
  const motif = String(req.body?.motif || '').trim() || null;
  if (statut === 'refuse' && !motif) return res.status(400).json({ error: 'Un refus se motive.' });
  const x = db.prepare(`UPDATE budget_ligne SET statut = ?, motif_arbitrage = ?, arbitre_par = ?, arbitre_le = datetime('now'), maj_le = datetime('now') WHERE id = ?`)
    .run(statut, statut === 'prevu' ? null : motif, statut === 'prevu' ? null : qui(req), Number(req.params.id));
  if (!x.changes) return res.status(404).json({ error: 'ligne introuvable' });
  res.json({ ok: true });
});

/* L'INVENTAIRE DE L'EXISTANT (C.3) — la coordination pour ses sections, la direction pour toutes. */
r.get('/inventaire', authRequired, (req, res) => {
  const autorisees = sectionsAutorisees(req.user);
  const section = req.query.section || null;
  if (section && autorisees && !autorisees.includes(section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });
  const l = db.prepare(`SELECT * FROM budget_inventaire ${section ? 'WHERE section = ?' : ''} ORDER BY section, type_bien, id`).all(...(section ? [section] : []))
    .filter(x => !autorisees || autorisees.includes(x.section));
  res.json({ biens: l, etats: ETATS_INVENTAIRE, peut_ecrire: section ? peutEcrire(req.user, section) : autorisees === null });
});
function bienValide(b) {
  if (!String(b.section || '').trim() || !String(b.type_bien || '').trim()) return 'Section et type de bien requis.';
  if (!ETATS_INVENTAIRE[b.etat || 'bon']) return 'État : bon, à surveiller ou à remplacer.';
  const an = b.annee_achat ? Number(b.annee_achat) : null;
  if (an != null && (an < 1950 || an > new Date().getFullYear() + 1)) return "Année d'achat invalide.";
  return null;
}
r.post('/inventaire', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'coordination'), (req, res) => {
  const b = req.body || {};
  const err = bienValide(b); if (err) return res.status(400).json({ error: err });
  if (!peutEcrire(req.user, b.section)) return res.status(403).json({ error: 'Section hors de votre périmètre' });
  const info = db.prepare('INSERT INTO budget_inventaire (section, type_bien, description, quantite, annee_achat, etat, cree_par) VALUES (?,?,?,?,?,?,?)')
    .run(b.section, String(b.type_bien).trim(), b.description || null, Math.max(1, Math.round(Number(b.quantite) || 1)),
      b.annee_achat ? Number(b.annee_achat) : null, b.etat || 'bon', qui(req));
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});
r.put('/inventaire/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'coordination'), (req, res) => {
  const cur = db.prepare('SELECT * FROM budget_inventaire WHERE id = ?').get(Number(req.params.id));
  if (!cur || !peutEcrire(req.user, cur.section)) return res.status(404).json({ error: 'bien introuvable' });
  const b = { ...cur, ...req.body, section: cur.section };
  const err = bienValide(b); if (err) return res.status(400).json({ error: err });
  db.prepare("UPDATE budget_inventaire SET type_bien = ?, description = ?, quantite = ?, annee_achat = ?, etat = ?, maj_le = datetime('now') WHERE id = ?")
    .run(String(b.type_bien).trim(), b.description || null, Math.max(1, Math.round(Number(b.quantite) || 1)), b.annee_achat ? Number(b.annee_achat) : null, b.etat, cur.id);
  res.json({ ok: true });
});
r.delete('/inventaire/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'coordination'), (req, res) => {
  const cur = db.prepare('SELECT section FROM budget_inventaire WHERE id = ?').get(Number(req.params.id));
  if (!cur || !peutEcrire(req.user, cur.section)) return res.status(404).json({ error: 'bien introuvable' });
  db.prepare('DELETE FROM budget_inventaire WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;
