// ─────────────────────────────────────────────────────────────────────────────
// LES PRESTATIONS MENSUELLES DES EXPERTS (3.5.241, Charles, 8 novembre 2026 — relevé des documents MDP ; circulaire de rentrée
// IIP 2026-2027 : « pour les experts, la fiche de prestations est à envoyer à service.rh@institut-prigogine.be au plus tard le
// 5e jour ouvrable avant la fin du mois en cours ; les prestations ne sont payées par la FWB qu'une fois les heures validées » ;
// circulaire 9760, 1.7.2 : l'annexe 27 mensuelle).
//
// La boucle : l'expert DÉCLARE son mois depuis son espace (Lucie propose les dates et les périodes lues de l'horaire, cours par
// cours ; il corrige ce qui n'a pas eu lieu) → le secrétariat est prévenu, VALIDE ou RENVOIE avec un mot → validée, la déclaration
// devient la saisie de l'A27 du mois (annexe_saisie), et l'A27 sort remplie, signée et cachetée (Éditions → Personnel → A27).
// Une déclaration validée ne se modifie plus ; une renvoyée se corrige et se redéclare. Rappels : trois jours ouvrables avant le
// délai, puis le jour du délai, tant que le mois n'est pas déclaré (interrupteur « experts_prestations », Configuration).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { attributions, proposition, manques } from '../routes/formulaires.js';
import { joursFeries } from '../routes/horaire.js';
import { mettreEnFile } from './rappels.js';

try {
  db.exec(`CREATE TABLE IF NOT EXISTS prestation_expert (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    professeur_id INTEGER NOT NULL,
    annee_scolaire TEXT NOT NULL,
    mois          INTEGER NOT NULL,                  -- 1 à 12
    ues           TEXT NOT NULL DEFAULT '[]',        -- JSON : les UE et leurs cours, dates et périodes (forme de l'A27)
    remarque      TEXT,
    statut        TEXT NOT NULL DEFAULT 'declaree',  -- declaree | validee | renvoyee
    declare_le    TEXT, declare_par TEXT,
    decide_le     TEXT, decide_par TEXT, mot TEXT,
    UNIQUE (professeur_id, annee_scolaire, mois))`);
} catch (e) { console.error('[migration] prestation_expert :', e.message); }

const lire = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
export const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** L'année civile d'un mois de l'année académique : septembre à décembre, la première ; janvier à août, la seconde. */
export const anneeCivile = (annee, mois) => Number(String(annee).slice(0, 4)) + (Number(mois) >= 9 ? 0 : 1);

/** Le délai : le 5e jour ouvrable avant la fin du mois (le dernier jour ouvrable compte pour le premier). Ouvrable : lundi à
    vendredi, hors fériés et jours de fermeture de l'école. */
export function delaiDuMois(annee, mois) {
  const an = anneeCivile(annee, mois);
  const fer = joursFeries(an);
  const ouvrables = [];
  for (let d = 1; d <= 31; d++) {
    const x = new Date(Date.UTC(an, mois - 1, d, 12));
    if (x.getUTCMonth() !== mois - 1) break;
    const iso = x.toISOString().slice(0, 10), wd = x.getUTCDay();
    if (wd !== 0 && wd !== 6 && !fer.has(iso)) ouvrables.push(iso);
  }
  return ouvrables[Math.max(0, ouvrables.length - 5)] || null;
}
/** Le jour ouvrable n jours avant une date (même mois ou non). */
function ouvrableAvant(date, n) {
  let x = new Date(`${date}T12:00:00Z`), k = 0;
  const fer = new Map([...joursFeries(x.getUTCFullYear()), ...joursFeries(x.getUTCFullYear() - 1)]);
  while (k < n) { x.setUTCDate(x.getUTCDate() - 1); const iso = x.toISOString().slice(0, 10); const wd = x.getUTCDay(); if (wd !== 0 && wd !== 6 && !fer.has(iso)) k++; }
  return x.toISOString().slice(0, 10);
}

/** Un membre est expert cette année s'il a au moins une attribution d'expert (statut EXP de la ligne, sinon de la fiche). */
export const estExpert = (profId, annee) => { try { return attributions(profId, annee, { expert: true }).length > 0; } catch { return false; } };

/** Les experts de l'année : fiche, compte relié. */
export function expertsDeLAnnee(annee) {
  let ids = [];
  try {
    ids = db.prepare(`SELECT DISTINCT v.professeur_id AS id FROM v_attribution_complete v WHERE v.annee_scolaire = ?
      AND UPPER(COALESCE((SELECT a.statut_exception FROM attribution a WHERE a.id = v.id), (SELECT p.statut FROM professeur p WHERE p.id = v.professeur_id), '')) = 'EXP'`)
      .all(annee).map(x => x.id);
  } catch { ids = []; }
  const fiche = db.prepare('SELECT id, nom, prenom FROM professeur WHERE id = ?');
  const compte = db.prepare("SELECT id, email FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 ORDER BY id LIMIT 1");
  return ids.map(id => { const f = fiche.get(id) || {}; const c = (() => { try { return compte.get(id); } catch { return null; } })();
    return { id, nom: `${String(f.nom || '').toUpperCase()} ${f.prenom || ''}`.trim(), compte: c?.id || null, email: c?.email || null }; })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function declarationDe(profId, annee, mois) {
  const r = db.prepare('SELECT * FROM prestation_expert WHERE professeur_id = ? AND annee_scolaire = ? AND mois = ?').get(profId, annee, Number(mois));
  return r ? { ...r, ues: lire(r.ues, []) } : null;
}

/** Le mois de l'expert : ce que Lucie propose (l'horaire), ce qu'il a déclaré, le délai. */
export function moisDeLExpert(profId, annee, mois) {
  const p = proposition('A27', profId, annee, mois) || { ues: [] };
  const d = declarationDe(profId, annee, mois);
  return { annee, mois: Number(mois), libelle: `${MOIS[mois]} ${anneeCivile(annee, mois)}`, delai: delaiDuMois(annee, mois),
    proposition: p.ues || [], declaration: d, ues: d ? d.ues : (p.ues || []) };
}

/** Nettoie les UE déclarées : on ne garde que la forme de l'A27 (dates et périodes de chaque cours). */
function nettoyer(ues, propose) {
  const base = new Map(propose.flatMap(u => (u.cours || []).map(c => [`${u.intitule || ''}|${c.denomination}`, { u, c }])));
  return (Array.isArray(ues) ? ues : []).map(u => ({ ...u, cours: (u.cours || []).map(c => {
    const k = `${u.intitule || ''}|${c.denomination}`;
    if (!base.has(k)) return null;
    const per = Math.max(0, Math.round(Number(c.periodes) || 0));   // vide = 0 (pas de prestation ce mois-ci)
    const { depuis_horaire, ...cb } = base.get(k).c; return { ...cb, dates: String(c.dates || '').slice(0, 200), periodes: per };
  }).filter(Boolean) })).filter(u => u.cours.length);
}

export function declarer(profId, annee, mois, { ues, remarque }, par) {
  if (!estExpert(profId, annee)) throw Object.assign(new Error("Vous n'avez pas de prestation d'expert cette année."), { status: 403 });
  const m = Number(mois);
  if (!(m >= 1 && m <= 12)) throw Object.assign(new Error('Mois invalide.'), { status: 400 });
  const avant = declarationDe(profId, annee, m);
  if (avant?.statut === 'validee') throw Object.assign(new Error('Ce mois est déjà validé par le secrétariat : il ne se modifie plus.'), { status: 409 });
  const propose = proposition('A27', profId, annee, m)?.ues || [];
  const net = nettoyer(ues, propose);
  const trous = net.flatMap(u => u.cours).filter(c => Number(c.periodes) > 0 && !String(c.dates || '').trim());
  if (!net.length) throw Object.assign(new Error('Aucune prestation à déclarer.'), { status: 400 });
  if (trous.length) throw Object.assign(new Error(`Indiquez les dates des périodes déclarées pour : ${trous.map(c => c.denomination).join(', ')}.`), { status: 400 });
  db.prepare(`INSERT INTO prestation_expert (professeur_id, annee_scolaire, mois, ues, remarque, statut, declare_le, declare_par)
      VALUES (?,?,?,?,?, 'declaree', datetime('now'), ?)
    ON CONFLICT (professeur_id, annee_scolaire, mois) DO UPDATE SET ues = excluded.ues, remarque = excluded.remarque, statut = 'declaree',
      declare_le = excluded.declare_le, declare_par = excluded.declare_par, decide_le = NULL, decide_par = NULL, mot = NULL`)
    .run(profId, annee, m, JSON.stringify(net), String(remarque || '').trim().slice(0, 1000) || null, par || null);
  const f = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(profId) || {};
  const n = `${String(f.nom || '').toUpperCase()} ${f.prenom || ''}`.trim();
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('prestation_expert', ?, ?, '/professeurs?vue=prestations', 'secretariat', ?)`)
      .run(`Prestations d'expert — ${n}, ${MOIS[m]}`, `${net.flatMap(u => u.cours).reduce((t, c) => t + (Number(c.periodes) || 0), 0)} période(s) déclarée(s).${avant ? ' (déclaration corrigée)' : ''}`, n);
  } catch { /* fil absent */ }
  return declarationDe(profId, annee, m);
}

/** Valider : la déclaration devient la saisie de l'A27 du mois. Renvoyer : avec un mot, l'expert corrige et redéclare. */
export function decider(id, { valider, mot }, par) {
  const r = db.prepare('SELECT * FROM prestation_expert WHERE id = ?').get(Number(id));
  if (!r) throw Object.assign(new Error('Déclaration introuvable.'), { status: 404 });
  if (r.statut === 'validee' && valider) throw Object.assign(new Error('Déjà validée.'), { status: 409 });
  if (!valider && !String(mot || '').trim()) throw Object.assign(new Error('Dites à l’expert ce qui est à corriger.'), { status: 400 });
  if (valider) {
    const propose = proposition('A27', r.professeur_id, r.annee_scolaire, r.mois) || {};
    const avant = db.prepare(`SELECT donnees_json FROM annexe_saisie WHERE cle = 'A27' AND professeur_id = ? AND annee_scolaire = ? AND mois = ?`)
      .get(r.professeur_id, r.annee_scolaire, r.mois);
    const valeurs = { ...propose, ...lire(avant?.donnees_json, {}), ues: lire(r.ues, []) };
    db.prepare(`INSERT INTO annexe_saisie (cle, professeur_id, annee_scolaire, mois, donnees_json, modifie_par, modifie_le)
        VALUES ('A27', ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (cle, professeur_id, annee_scolaire, mois) DO UPDATE SET donnees_json = excluded.donnees_json, modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le`)
      .run(r.professeur_id, r.annee_scolaire, r.mois, JSON.stringify(valeurs), par || null);
    db.prepare(`UPDATE prestation_expert SET statut = 'validee', decide_le = datetime('now'), decide_par = ?, mot = ? WHERE id = ?`).run(par || null, String(mot || '').trim() || null, r.id);
    return { ok: true, statut: 'validee', manques: manques('A27', valeurs) };
  }
  db.prepare(`UPDATE prestation_expert SET statut = 'renvoyee', decide_le = datetime('now'), decide_par = ?, mot = ? WHERE id = ?`).run(par || null, String(mot).trim(), r.id);
  try {
    const u = db.prepare('SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 LIMIT 1').get(r.professeur_id);
    if (u) db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par) VALUES ('prestation_expert', ?, ?, '/espace?face=prestations', ?, ?)`)
      .run(`Vos prestations de ${MOIS[r.mois]} sont à corriger`, String(mot).trim(), u.id, par || null);
  } catch { /* */ }
  return { ok: true, statut: 'renvoyee' };
}

/** Le tableau du secrétariat : chaque expert et son mois. */
export function tableauDuMois(annee, mois) {
  return expertsDeLAnnee(annee).map(x => {
    const d = declarationDe(x.id, annee, mois);
    const per = d ? d.ues.flatMap(u => u.cours || []).reduce((t, c) => t + (Number(c.periodes) || 0), 0) : null;
    return { ...x, declaration: d ? { id: d.id, statut: d.statut, declare_le: d.declare_le, decide_le: d.decide_le, decide_par: d.decide_par, mot: d.mot, remarque: d.remarque, ues: d.ues, periodes: per } : null };
  });
}

/* LES RAPPELS : trois jours ouvrables avant le délai (le matin), puis le jour du délai (aussitôt), à l'expert dont le mois n'est
   ni déclaré ni validé. Une fois par expert, par mois et par jalon (rappel_envoye). */
export function genererRappelsExperts(annee, { jour = null } = {}) {
  const auj = jour || new Date().toISOString().slice(0, 10);
  const mois = Number(auj.slice(5, 7));
  const delai = delaiDuMois(annee, mois);
  if (!delai) return { rappels: 0 };
  const jalon = auj === delai ? 'J' : auj === ouvrableAvant(delai, 3) ? 'J-3' : null;
  if (!jalon) return { rappels: 0 };
  let n = 0;
  for (const x of expertsDeLAnnee(annee)) {
    if (!x.compte) continue;
    const d = declarationDe(x.id, annee, mois);
    if (d && d.statut !== 'renvoyee') continue;
    const cible = x.id * 100 + mois;
    const deja = db.prepare(`SELECT 1 FROM rappel_envoye WHERE cible_type = 'prestation_expert' AND cible_id = ? AND jalon = ? AND canal = 'email' AND IFNULL(user_id, 0) = ?`)
      .get(cible, `${annee}|${jalon}`, x.compte);
    if (deja) continue;
    const fr = String(delai).split('-').reverse().join('/');
    if (!mettreEnFile({ utilisateurId: x.compte, cle: 'experts_prestations', urgent: jalon === 'J',
      titre: jalon === 'J' ? `Aujourd'hui : vos prestations de ${MOIS[mois]} à déclarer` : `Vos prestations de ${MOIS[mois]} : à déclarer pour le ${fr}`,
      detail: `Espace enseignant → Mes prestations : Lucie propose les dates et les périodes de l'horaire, vous corrigez ce qui n'a pas eu lieu et vous déclarez. Les prestations ne sont payées qu'une fois validées.`,
      lien: '/espace' })) continue;
    db.prepare(`INSERT OR IGNORE INTO rappel_envoye (cible_type, cible_id, jalon, user_id, canal) VALUES ('prestation_expert', ?, ?, ?, 'email')`).run(cible, `${annee}|${jalon}`, x.compte);
    n++;
  }
  return { rappels: n };
}
