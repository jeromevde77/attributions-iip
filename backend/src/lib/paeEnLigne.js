/**
 * LE PAE EN LIGNE (3.1.515, Charles, 30 octobre 2026 : « les demandes de VA et le PAE doivent aussi se faire en ligne » ;
 * tranché : l'étudiant choisit — Lucie coche ce qui lui est accessible, il coche ou décoche et envoie, la coordination
 * valide ou corrige, il confirme par code ; AUCUNE EXCEPTION DEMANDÉE EN LIGNE, « sinon ça va être la folie » : ce
 * qu'une règle refuse reste grisé, il en parle à sa coordination ; ouvert pendant une FENÊTRE fixée par la direction).
 *
 * Le moteur ne change pas : ce qui est accessible est ce que dit `composerPAE` (lib/pae.js). La proposition de
 * l'étudiant N'ÉCRIT PAS son programme : elle attend la coordination, qui la reprend par la porte unique
 * (`ecrireProgramme`), la corrige dans la revue, ou la refuse avec un message. Puis l'école confirme le PAE (le geste
 * de toujours) ; l'étudiant, enfin, confirme de son côté par un code reçu à son adresse d'école — trace gardée ici,
 * avec le programme qu'il a confirmé.
 */
import db from '../db/index.js';
import { composerPAE, ecrireProgramme } from '../routes/etudiants.js';
import { tarifPAE } from './fraisEstimes.js';

export function migrerPaeEnLigne(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS pae_proposition (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL, ues TEXT NOT NULL, depose_le TEXT NOT NULL DEFAULT (datetime('now')),
      statut TEXT NOT NULL DEFAULT 'deposee' CHECK (statut IN ('deposee','reprise','corrigee','refusee','remplacee')),
      traite_par TEXT, traite_le TEXT, message TEXT);
    CREATE INDEX IF NOT EXISTS idx_pae_proposition ON pae_proposition(annee_scolaire, statut);
    -- La confirmation de l'étudiant : en ajout seul, avec le programme qu'il a confirmé.
    CREATE TABLE IF NOT EXISTS pae_signature_etudiant (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL, programme TEXT NOT NULL, signe_le TEXT NOT NULL, ip TEXT, recu_le TEXT DEFAULT (datetime('now')),
      ref_portail INTEGER UNIQUE);
    CREATE TRIGGER IF NOT EXISTS pae_signature_sans_effacement BEFORE DELETE ON pae_signature_etudiant
      BEGIN SELECT RAISE(ABORT, 'Une confirmation de l''étudiant ne s''efface pas.'); END;
  `);
}

const jour = () => new Date().toISOString().slice(0, 10);

/** La fenêtre : { du, au, annee } réglés par la direction ; `ouvert` se lit du jour. */
export function reglagePAE() {
  let r = {};
  try { r = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'pae_en_ligne'").get()?.valeur || '{}'); } catch { r = {}; }
  const ouvert = !!(r.du && r.au && r.annee && jour() >= r.du && jour() <= r.au);
  return { du: r.du || null, au: r.au || null, annee: r.annee || null, ouvert };
}
export function reglerPAE({ du, au, annee }) {
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (!d.test(String(du || '')) || !d.test(String(au || '')) || au < du) return { erreur: 'Deux dates, la fin après le début.' };
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) return { erreur: 'L’année du PAE, au format 2027-2028.' };
  db.prepare("INSERT INTO lucie_config (cle, valeur) VALUES ('pae_en_ligne', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
    .run(JSON.stringify({ du, au, annee }));
  return { ok: true, ...reglagePAE() };
}

const programmeDe = (id, annee) => db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY ue_num')
  .all(id, annee).map(x => Number(x.ue_num));

/* CE QUE L'ÉTUDIANT PEUT COCHER : accessible, pas déjà réussi, dans son bloc. Le reste se lit, grisé, avec sa raison. */
function raisonDe(u) {
  if (u.deja_reussie || u.va_complete) return 'déjà acquise';
  if (u.en_attente) return 'en attente d’une délibération';
  if (u.epreuve_integree && !u.accessible) return 'épreuve intégrée : tout le reste d’abord';
  if (u.prereq_manquants?.length) return `prérequis : UE ${u.prereq_manquants.join(', ')}`;
  if (u.hors_bloc) return 'hors de votre bloc';
  if (!u.accessible) return 'pas encore accessible';
  return null;
}

/** L'offre déposée au portail : la fenêtre, les unités (cochables ou non, et pourquoi), le programme, la confirmation. */
export function offrePAE(e, anneeVoulue = null) {
  migrerPaeEnLigne();
  const g = reglagePAE();
  // SANS FENÊTRE, LE PAE DE L'ANNÉE EN COURS SE LIT QUAND MÊME (3.5.008, Charles : « je ne vois pas le PAE ») : les unités
  // inscrites cette année, sans rien à cocher.
  const annee = anneeVoulue || g.annee || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
  if (!annee) return { ouvert: false };
  const programme = programmeDe(e.id, annee);
  const prop = db.prepare(`SELECT ues, depose_le, statut, message, traite_le FROM pae_proposition WHERE etudiant_id = ? AND annee_scolaire = ?
    AND statut <> 'remplacee' ORDER BY id DESC LIMIT 1`).get(e.id, annee);
  const sig = db.prepare('SELECT programme, signe_le FROM pae_signature_etudiant WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY id DESC LIMIT 1').get(e.id, annee);
  const base = { ouvert: g.ouvert && annee === g.annee, du: g.du, au: g.au, annee, programme,
    proposition: prop ? { ues: JSON.parse(prop.ues), depose_le: prop.depose_le, statut: prop.statut, message: prop.message, traite_le: prop.traite_le } : null,
    signature: sig ? { signe_le: sig.signe_le, a_jour: sig.programme === JSON.stringify(programme) } : null };
  let c;
  try { c = composerPAE(e.id, annee); } catch (x) { console.error('[pae en ligne]', e.id, x.message); return { ...base, unites: [], confirme_le: null }; }
  if (c.erreur) return { ...base, unites: [], confirme_le: null };
  const unites = (c.pae || []).map(u => {
    const raison = raisonDe(u);
    return { ue_num: u.ue_num, ue_nom: u.ue_nom, ue_niv: u.ue_niv, ects: u.ects ?? null, cochable: !raison, raison,
      avertissement: (u.avertissements || []).length ? `prérequis conseillé : UE ${u.avertissements.map(a => a.ue_num).join(', ')}` : null,
      propose: !!u.propose, inscrite: programme.includes(Number(u.ue_num)),
      // POSÉE PAR L'ÉCOLE ET HORS DE SA MAIN : elle reste au programme ; l'étudiant ne l'ajoute ni ne la retire.
      verrouillee: !raison ? false : programme.includes(Number(u.ue_num)) };
  });
  // LES FRAIS ESTIMÉS (3.1.526) : le tarif de l'année du PAE, pour chaque unité offerte ; le portail additionne.
  let tarif = null;
  try { tarif = tarifPAE(e.id, annee, [...new Set([...unites.map(u => Number(u.ue_num)), ...programme.map(Number)])]); } catch (x) { console.error('[pae en ligne] tarif :', x.message); }
  return { ...base, unites, sections: c.sections || [], confirme_le: c.pae_confirme_le || null, tarif };
}

/** La proposition de l'étudiant : jugée ici, jamais écrite au programme. Rend null, ou la phrase qu'il lira. */
export function deposerProposition(e, ues) {
  migrerPaeEnLigne();
  const g = reglagePAE();
  if (!g.ouvert) return 'Le PAE en ligne est fermé : adressez-vous à votre coordination.';
  const o = offrePAE(e);
  if (o.confirme_le) return 'Votre PAE est déjà confirmé par l’école : pour le changer, adressez-vous à votre coordination.';
  const voulues = [...new Set((Array.isArray(ues) ? ues : []).map(Number).filter(Boolean))];
  if (!voulues.length) return 'Choisissez au moins une unité.';
  const cochables = new Set(o.unites.filter(u => u.cochable).map(u => Number(u.ue_num)));
  const hors = voulues.filter(u => !cochables.has(u));
  if (hors.length) return `Ces unités ne peuvent pas être choisies en ligne : UE ${hors.join(', ')}. Parlez-en à votre coordination.`;
  db.prepare("UPDATE pae_proposition SET statut = 'remplacee' WHERE etudiant_id = ? AND annee_scolaire = ? AND statut = 'deposee'").run(e.id, g.annee);
  db.prepare('INSERT INTO pae_proposition (etudiant_id, annee_scolaire, ues) VALUES (?,?,?)').run(e.id, g.annee, JSON.stringify(voulues.sort((a, b) => a - b)));
  return null;
}

/** La confirmation de l'étudiant, relevée du portail : seulement sur le programme confirmé par l'école, tel quel. */
export function recevoirSignature(e, s) {
  migrerPaeEnLigne();
  const annee = String(s.annee || '');
  const confirme = db.prepare('SELECT confirme_le FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?').get(e.id, annee)?.confirme_le;
  const programme = JSON.stringify(programmeDe(e.id, annee));
  if (!confirme) return 'Votre PAE n’est pas encore confirmé par l’école.';
  if (String(s.programme || '') !== programme) return 'Votre programme a changé entre-temps : relisez-le, puis confirmez à nouveau.';
  db.prepare(`INSERT OR IGNORE INTO pae_signature_etudiant (etudiant_id, annee_scolaire, programme, signe_le, ip, ref_portail)
    VALUES (?,?,?,?,?,?)`).run(e.id, annee, programme, String(s.signe_le || ''), String(s.ip || '').slice(0, 60), Number(s.id) || null);
  return null;
}

// ── LE CÔTÉ DE LA COORDINATION ────────────────────────────────────────────
/** Les propositions de l'année, dans le périmètre (`sections` null = toutes). */
export function propositions(annee, sections, sectionDe) {
  migrerPaeEnLigne();
  const l = db.prepare(`SELECT p.*, e.nom, e.prenom, e.id_ecampus FROM pae_proposition p JOIN etudiant e ON e.id = p.etudiant_id
    WHERE p.annee_scolaire = ? AND p.statut <> 'remplacee' ORDER BY (p.statut = 'deposee') DESC, p.depose_le DESC`).all(annee);
  const nomUE = db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1');
  return l.map(p => ({ ...p, section: sectionDe(p.etudiant_id) })).filter(p => !sections || sections.includes(p.section)).map(p => {
    const ues = JSON.parse(p.ues);
    const programme = programmeDe(p.etudiant_id, annee);
    const tout = [...new Set([...ues, ...programme])].sort((a, b) => a - b);
    const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(p.etudiant_id);
    const verrou = new Set(p.statut === 'deposee' ? (offrePAE(e, annee).unites || []).filter(u => u.verrouillee).map(u => Number(u.ue_num)) : []);
    return { id: p.id, etudiant_id: p.etudiant_id, nom: p.nom, prenom: p.prenom, matricule: p.id_ecampus, section: p.section,
      depose_le: p.depose_le, statut: p.statut, traite_par: p.traite_par, traite_le: p.traite_le, message: p.message,
      lignes: tout.map(u => ({ ue_num: u, ue_nom: nomUE.get(u, annee)?.ue_nom || '', propose: ues.includes(u), au_programme: programme.includes(u), verrouillee: verrou.has(u) })),
      identique: JSON.stringify(ues) === JSON.stringify(programme) };
  });
}

/** Reprendre la proposition : le programme devient celui qu'a choisi l'étudiant, par la porte unique. */
export function reprendre(id, par) {
  migrerPaeEnLigne();
  const p = db.prepare('SELECT * FROM pae_proposition WHERE id = ?').get(Number(id));
  if (!p) return { erreur: 'Proposition introuvable.', code: 404 };
  if (p.statut !== 'deposee') return { erreur: 'Cette proposition a déjà été traitée.', code: 409 };
  const ues = JSON.parse(p.ues);
  const existantes = programmeDe(p.etudiant_id, p.annee_scolaire);
  // Ce que l'étudiant ne pouvait pas toucher (posé par l'école, hors de sa main) reste au programme.
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(p.etudiant_id);
  const cochables = new Set((offrePAE(e, p.annee_scolaire).unites || []).filter(u => u.cochable).map(u => Number(u.ue_num)));
  const b = ecrireProgramme({ etudId: p.etudiant_id, annee: p.annee_scolaire, ajouter: ues,
    retirer: existantes.filter(u => !ues.includes(u) && cochables.has(u)), origine: 'pae_en_ligne', par });
  if (b.refus.length) return { erreur: `${b.refus.length} unité(s) demandent un motif : corrigez ce PAE dans la revue.`, refus: b.refus, code: 409 };
  db.prepare("UPDATE pae_proposition SET statut = 'reprise', traite_par = ?, traite_le = datetime('now') WHERE id = ?").run(par, p.id);
  return { ok: true, ajoutees: b.ajoutees.length, retirees: b.retirees.length, conservees: b.conservees.length };
}

/** Corrigée dans la revue, ou refusée : un message pour l'étudiant, obligatoire. */
export function traiter(id, statut, message, par) {
  migrerPaeEnLigne();
  if (!['corrigee', 'refusee'].includes(statut)) return { erreur: 'Statut inconnu.', code: 400 };
  if (!String(message || '').trim()) return { erreur: 'Un mot pour l’étudiant est obligatoire : il le lira dans son espace.', code: 400 };
  const r = db.prepare("UPDATE pae_proposition SET statut = ?, message = ?, traite_par = ?, traite_le = datetime('now') WHERE id = ? AND statut = 'deposee'")
    .run(statut, String(message).trim().slice(0, 1000), par, Number(id));
  return r.changes ? { ok: true } : { erreur: 'Cette proposition a déjà été traitée.', code: 409 };
}

/** Pour la fiche : la dernière confirmation de l'étudiant, et si elle porte encore sur le programme. */
export function signatureDe(etudiantId) {
  migrerPaeEnLigne();
  const s = db.prepare('SELECT annee_scolaire, programme, signe_le FROM pae_signature_etudiant WHERE etudiant_id = ? ORDER BY id DESC LIMIT 1').get(Number(etudiantId));
  if (!s) return null;
  return { annee: s.annee_scolaire, signe_le: s.signe_le, a_jour: s.programme === JSON.stringify(programmeDe(Number(etudiantId), s.annee_scolaire)) };
}
