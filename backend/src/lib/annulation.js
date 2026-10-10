// ─────────────────────────────────────────────────────────────────────────────
// Lucie — REVENIR EN ARRIÈRE : l'« Annuler » général (3.1.270)
//
// Charles, 10 octobre 2026 : « il faut un bouton annuler GÉNÉRAL ; il faut pouvoir
// revenir en arrière au moins sur 10 changements — les profs font souvent des
// erreurs ». Tranché le même jour :
//   · chacun annule SES gestes ; la direction peut annuler celui d'un autre, avec motif ;
//   · les actes officiels ne s'annulent jamais par ce bouton — ils ont leur procédure
//     (séance close, décision validée ou notifiée, présences, journaux en ajout seul,
//     courriels envoyés, textes publiés) ;
//   · on remonte sur les 10 derniers gestes de chaque personne.
//
// LE MÉCANISME. Un GESTE = une requête qui écrit (POST, PUT, PATCH, DELETE) : un clic.
// Des déclencheurs SQLite, posés au démarrage sur toutes les tables, recopient
// dans `annulation_trace` la ligne d'avant et la ligne d'après, quel que soit
// l'écran ou la route : une règle qui n'est juste que si chaque route y pense est
// une règle fausse. Le numéro du geste vient de `lucie_geste()`, que la requête en
// cours fournit (contexteRequete) ; hors requête (migrations, tâches), rien ne se
// trace.
//
// ANNULER rejoue les traces à l'envers, dans une transaction, et REFUSE si la ligne
// a changé depuis (quelqu'un d'autre est passé derrière) : écraser le travail d'un
// collègue pour réparer le sien serait une seconde erreur. L'annulation est
// elle-même un geste, tracé, qui ne s'annule pas.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

export const PROFONDEUR = 10;
const TROP = 20000;                                  // au-delà : un import, qui se défait par sa procédure

/* Ce qui ne se trace pas : la mécanique elle-même, les journaux techniques, les
   archives binaires, l'authentification. */
const NON_TRACEES = new Set(['annulation_trace', 'annulation_geste', 'journal_modification', 'modification_log',
  'mfa_journal', 'mfa_recuperation', 'connexion_blocage', 'mot_de_passe_jeton', 'migration_faite', 'lucie_changelog',
  'sauvegarde', 'labo_sauvegarde', 'reglage_historique', 'rappel_envoye', 'lucie_notification', 'document_archive',
  'attribution_snapshot', 'envoi_copie']);

/* LES ACTES OFFICIELS : un geste qui en touche un ne s'annule pas par le bouton. */
const OFFICIELS = {
  valorisation_journal: 'le journal de la valorisation (en ajout seul)',
  convention_journal: 'le journal des conventions (en ajout seul)',
  presence: 'des présences prises', presence_journal: 'des présences prises',
  proc_etape: 'une étape de recours ou de procédure disciplinaire',
  decision_motivation: 'la motivation d’une décision délibérée',
  deliberation_reouverture: 'la réouverture d’une séance',
  corpus_version: 'un texte publié', corpus_lecture: 'une prise de connaissance',
  envoi_mail: 'un courriel envoyé', communication_destinataire: 'une communication envoyée',
  offre_envoi: 'un envoi', rapport_mensuel_envoi: 'un rapport envoyé',
  geste_journal: 'un journal en ajout seul', note_doublon_journal: 'un journal en ajout seul',
  pae_derogation: 'une dérogation au PAE (registre en ajout seul)', journal_personnel: 'le journal du personnel',
};
/* Et des lignes qui deviennent officielles par leur état. */
const officielSelonLigne = (tbl, l) => {
  if (!l) return null;
  if (tbl === 'deliberation_seance' && Number(l.cloturee)) return 'une séance de délibération close';
  if (tbl === 'etudiant_valorisation' && (l.valide_le || l.notifie_le)) return 'une valorisation validée ou notifiée';
  return null;
};

/* Les noms des tables, en mots, pour dire le geste. */
const NOMS = {
  etudiant: 'fiches d’étudiants', etudiant_inscription: 'inscriptions aux UE', etudiant_note_detail: 'notes',
  etudiant_cours_groupe: 'groupes d’étudiants', attribution: 'attributions', groupe: 'groupes', cours: 'cours', ue: 'UE',
  organisation_ue: 'organisations d’UE', grille_cours: 'verres (cours)', grille_activite: 'verres (activités)',
  horaire_seance: 'séances d’horaire', plan_creneau: 'créneaux du plan', planning_contrainte: 'contraintes du planning',
  planning_base: 'base du planning', note_proposee: 'notes proposées', etudiant_valorisation: 'valorisations',
  etudiant_pae: 'PAE', professeur: 'fiches d’enseignants', tache: 'tâches', tache_personne: 'responsables de tâches',
  reunion: 'réunions', echeance: 'échéances', lucie_config: 'réglages', ue_niveau_section: 'schéma de capitalisation',
  ue_prerequis: 'prérequis', deliberation_ajustement: 'ajustements de délibération', deliberation_resultat: 'résultats délibérés',
  amenagement_dossier: 'aménagements', amenagement_mesure: 'mesures d’aménagement', etudiant_sle: 'fiches SLE',
  groupe_commun_brique: 'briques', groupe_commun_reglage: 'groupes communs', aa_ponderation: 'pondérations des acquis',
  cours_ponderation: 'pondérations des cours', suggestion: 'propositions d’amélioration', reponse_type: 'réponses types',
};
const OPS = { i: ['ajouté', 'ajoutés'], u: ['modifié', 'modifiés'], d: ['supprimé', 'supprimés'] };

export function migrerAnnulation(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS annulation_trace (
      id INTEGER PRIMARY KEY AUTOINCREMENT, geste_id INTEGER NOT NULL,
      tbl TEXT NOT NULL, op TEXT NOT NULL, rid INTEGER NOT NULL, avant TEXT, apres TEXT);
    CREATE INDEX IF NOT EXISTS idx_annul_trace_geste ON annulation_trace(geste_id);
    CREATE INDEX IF NOT EXISTS idx_annul_trace_ligne ON annulation_trace(tbl, rid);
    CREATE TABLE IF NOT EXISTS annulation_geste (
      id INTEGER PRIMARY KEY, le TEXT NOT NULL DEFAULT (datetime('now')),
      par TEXT, par_id INTEGER, methode TEXT, chemin TEXT, resume TEXT, nb INTEGER,
      type TEXT NOT NULL DEFAULT 'geste',            -- geste | annulation
      annulable INTEGER NOT NULL DEFAULT 1, pourquoi_pas TEXT,
      annule_le TEXT, annule_par TEXT, annule_motif TEXT, annule_par_geste INTEGER);
    CREATE INDEX IF NOT EXISTS idx_annul_geste_par ON annulation_geste(par_id, id);
  `);
}

/* LES DÉCLENCHEURS. Posés APRÈS toutes les migrations (fin du démarrage) : une table
   recréée par une migration perd les siens. Une ligne en JSON, par paquets de 60
   colonnes (une fonction SQLite ne prend que 127 arguments). Une mise à jour qui ne
   change rien ne laisse pas de trace. */
export function poserDeclencheurs(dbx = db) {
  migrerAnnulation(dbx);
  const tables = dbx.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all();
  let n = 0;
  for (const t of tables) {
    const T = t.name;
    const supprimer = () => { for (const s of ['i', 'u', 'd']) dbx.exec(`DROP TRIGGER IF EXISTS "lucie_annul_${T}_${s}"`); };
    if (NON_TRACEES.has(T) || /WITHOUT\s+ROWID/i.test(t.sql || '') || !/^[A-Za-z0-9_]+$/.test(T)) { supprimer(); continue; }
    const cols = dbx.prepare(`SELECT name, type FROM pragma_table_info('${T}')`).all();
    if (!cols.length || cols.some(c => /BLOB/i.test(c.type || '')) || cols.some(c => !/^[A-Za-z0-9_]+$/.test(c.name))) { supprimer(); continue; }
    const json = alias => {
      const paquets = [];
      for (let i = 0; i < cols.length; i += 60) paquets.push(`json_object(${cols.slice(i, i + 60).map(c => `'${c.name}', ${alias}."${c.name}"`).join(', ')})`);
      return paquets.length === 1 ? paquets[0] : `json_array(${paquets.join(', ')})`;
    };
    supprimer();
    dbx.exec(`CREATE TRIGGER "lucie_annul_${T}_i" AFTER INSERT ON "${T}" WHEN lucie_geste() IS NOT NULL BEGIN
        INSERT INTO annulation_trace (geste_id, tbl, op, rid, apres) VALUES (lucie_geste(), '${T}', 'i', NEW.rowid, ${json('NEW')}); END;
      CREATE TRIGGER "lucie_annul_${T}_u" AFTER UPDATE ON "${T}" WHEN lucie_geste() IS NOT NULL AND ${json('OLD')} IS NOT ${json('NEW')} BEGIN
        INSERT INTO annulation_trace (geste_id, tbl, op, rid, avant, apres) VALUES (lucie_geste(), '${T}', 'u', NEW.rowid, ${json('OLD')}, ${json('NEW')}); END;
      CREATE TRIGGER "lucie_annul_${T}_d" AFTER DELETE ON "${T}" WHEN lucie_geste() IS NOT NULL BEGIN
        INSERT INTO annulation_trace (geste_id, tbl, op, rid, avant) VALUES (lucie_geste(), '${T}', 'd', OLD.rowid, ${json('OLD')}); END;`);
    n++;
  }
  return n;
}

const lireLigne = s => {
  if (s == null) return null;
  const v = JSON.parse(s);
  return Array.isArray(v) ? Object.assign({}, ...v) : v;
};
const memeValeur = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const pareil = (ligne, attendu) => Object.keys(attendu).every(k => memeValeur(ligne[k], attendu[k]));

/** Ce que dit un geste, à partir de ses traces. */
function resumer(traces) {
  const par = new Map();
  for (const t of traces) {
    const k = `${t.tbl}|${t.op}`;
    par.set(k, (par.get(k) || 0) + 1);
  }
  return [...par].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, n]) => { const [tbl, op] = k.split('|'); return `${NOMS[tbl] || tbl.replace(/_/g, ' ')} : ${n} ${OPS[op][n > 1 ? 1 : 0]}`; })
    .join(' · ') + (par.size > 4 ? ' · …' : '');
}

function pourquoiPas(traces) {
  for (const t of traces) {
    if (OFFICIELS[t.tbl]) return `Il touche ${OFFICIELS[t.tbl]} : cela se reprend par sa procédure.`;
    const o = officielSelonLigne(t.tbl, lireLigne(t.avant)) || officielSelonLigne(t.tbl, lireLigne(t.apres));
    if (o) return `Il touche ${o} : cela se reprend par sa procédure.`;
  }
  return null;
}

/** À la fin d'une requête qui a écrit : on enregistre le geste, puis on ne garde que les 10 derniers. */
export function cloreGeste(req, res) {
  const id = req._geste;
  if (!id) return;
  try {
    const nb = db.prepare('SELECT COUNT(*) n FROM annulation_trace WHERE geste_id = ?').get(id).n;
    if (!nb) return;
    const u = req.user || {};
    const annulation = /^\/api\/annulation\//.test(req.originalUrl || '');
    let annulable = 1, motif = null, resume;
    if (nb > TROP) {
      annulable = 0; motif = `Geste trop volumineux (${nb} lignes) : un import se défait par sa propre procédure.`;
      resume = `${nb} lignes écrites`;
      db.prepare('DELETE FROM annulation_trace WHERE geste_id = ?').run(id);
    } else {
      const traces = db.prepare('SELECT tbl, op, avant, apres FROM annulation_trace WHERE geste_id = ?').all(id);
      resume = resumer(traces);
      motif = annulation ? 'C’est une annulation.' : pourquoiPas(traces);
      if (motif) annulable = 0;
    }
    db.prepare(`INSERT OR IGNORE INTO annulation_geste (id, par, par_id, methode, chemin, resume, nb, type, annulable, pourquoi_pas)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, u.nom || u.email || null, u.id ?? null, req.method,
      String(req.originalUrl || '').split('?')[0].slice(0, 200), resume, nb, annulation ? 'annulation' : 'geste', annulable, motif);
    // Les 10 derniers gestes de la personne, pas un de plus : les traces des autres partent.
    if (u.id != null) {
      const vieux = db.prepare(`SELECT id FROM annulation_geste WHERE par_id = ? AND type = 'geste' ORDER BY id DESC LIMIT -1 OFFSET ?`).all(u.id, PROFONDEUR).map(x => x.id);
      if (vieux.length) db.transaction(() => {
        for (const v of vieux) { db.prepare('DELETE FROM annulation_trace WHERE geste_id = ?').run(v); db.prepare('DELETE FROM annulation_geste WHERE id = ?').run(v); }
      })();
    }
    // Les annulations ne gardent que leur ligne (qui, quand) : leurs traces ne servent plus.
    if (annulation) db.prepare('DELETE FROM annulation_trace WHERE geste_id = ?').run(id);
  } catch (e) { console.error('[annulation] clôture du geste :', e.message); }
}

/** Les gestes qu'on peut lire : les siens, ou ceux de l'équipe pour la direction. */
export function gestes({ parId = null, equipe = false }) {
  const l = equipe
    ? db.prepare(`SELECT * FROM annulation_geste WHERE type = 'geste' ORDER BY id DESC LIMIT 60`).all()
    : db.prepare(`SELECT * FROM annulation_geste WHERE type = 'geste' AND par_id = ? ORDER BY id DESC LIMIT ?`).all(parId, PROFONDEUR);
  return l;
}

/** Annuler un geste. Lance une erreur (avec .statut) si ce n'est pas possible ; rien n'est alors écrit. */
export function annulerGeste(id, { user, direction = false, motif = '' }) {
  const g = db.prepare('SELECT * FROM annulation_geste WHERE id = ?').get(id);
  const refus = (statut, m) => Object.assign(new Error(m), { statut });
  if (!g) throw refus(404, 'Ce geste n’est plus gardé : seuls les 10 derniers gestes de chacun s’annulent.');
  if (g.annule_le) throw refus(409, `Déjà annulé le ${g.annule_le} par ${g.annule_par || '—'}.`);
  if (!g.annulable) throw refus(409, g.pourquoi_pas || 'Ce geste ne s’annule pas.');
  const sien = g.par_id != null && g.par_id === user?.id;
  if (!sien && !direction) throw refus(403, 'On n’annule que ses propres gestes ; la direction peut annuler celui d’un autre, avec motif.');
  if (!sien && !String(motif || '').trim()) throw refus(400, 'Annuler le geste de quelqu’un d’autre demande un motif écrit.');
  const traces = db.prepare('SELECT * FROM annulation_trace WHERE geste_id = ? ORDER BY id DESC').all(id);
  if (!traces.length) throw refus(409, 'Ce geste n’a plus de trace à rejouer.');
  const qui = (tbl, rid) => db.prepare(`SELECT g.par, g.le FROM annulation_trace t JOIN annulation_geste g ON g.id = t.geste_id
      WHERE t.tbl = ? AND t.rid = ? AND t.geste_id > ? ORDER BY t.id DESC LIMIT 1`).get(tbl, rid, id);
  const conflit = (t, quoi) => {
    const q = qui(t.tbl, t.rid);
    return refus(409, `Impossible d’annuler : ${NOMS[t.tbl] || t.tbl} — ${quoi}${q ? ` depuis, par ${q.par || 'quelqu’un'} le ${q.le}` : ' depuis'}. Rien n’a été changé.`);
  };
  db.transaction(() => {
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const t of traces) {
      const cols = db.prepare(`SELECT name FROM pragma_table_info('${t.tbl}')`).all().map(c => c.name);
      if (!cols.length) throw refus(409, `La table ${t.tbl} n’existe plus.`);
      const cur = db.prepare(`SELECT * FROM "${t.tbl}" WHERE rowid = ?`).get(t.rid);
      const avant = lireLigne(t.avant), apres = lireLigne(t.apres);
      if (t.op === 'i') {
        if (!cur) continue;                                        // déjà retiré : rien à défaire
        if (!pareil(cur, apres)) throw conflit(t, 'la ligne ajoutée a été modifiée');
        db.prepare(`DELETE FROM "${t.tbl}" WHERE rowid = ?`).run(t.rid);
      } else if (t.op === 'u') {
        if (!cur) throw conflit(t, 'la ligne a été supprimée');
        if (!pareil(cur, apres)) throw conflit(t, 'la ligne a été modifiée');
        const k = Object.keys(avant).filter(c => cols.includes(c));
        db.prepare(`UPDATE "${t.tbl}" SET ${k.map(c => `"${c}" = ?`).join(', ')} WHERE rowid = ?`).run(...k.map(c => avant[c]), t.rid);
      } else {
        if (cur) throw conflit(t, 'une autre ligne a pris sa place');
        const k = Object.keys(avant).filter(c => cols.includes(c));
        db.prepare(`INSERT INTO "${t.tbl}" (rowid, ${k.map(c => `"${c}"`).join(', ')}) VALUES (?, ${k.map(() => '?').join(', ')})`).run(t.rid, ...k.map(c => avant[c]));
      }
    }
    db.prepare(`UPDATE annulation_geste SET annule_le = datetime('now'), annule_par = ?, annule_motif = ? WHERE id = ?`)
      .run(user?.nom || user?.email || null, sien ? null : String(motif).trim(), id);
  })();
  return { ok: true, resume: g.resume };
}
