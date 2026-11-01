// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LE TEMPS DE TRAVAIL DU SECRÉTARIAT (3.5.039)
//
// Charles, 1er novembre 2026, courriel à Nicolas (direction adjointe) : « fixer l'organisation annuelle du
// secrétariat… souplesse dans l'organisation des semaines, mais pas sur le nombre d'heures : rien de plus, rien de
// moins sur l'année » ; puis : « il faut prévoir un générateur annuel qui respecte le décret et calcule le temps de
// travail ». Tranché le même jour (choix recommandés) : l'horaire PRÉVU fait foi, la personne n'encode que les ÉCARTS ;
// le relevé se signe personne → direction adjointe → direction ; chacun lit son relevé et le planning de l'équipe
// (présences et congés, pas les heures des autres) ; la direction DÉSIGNE les comptes concernés.
//
// LES RÈGLES (circulaire 9760 point 1.3.8 ; loi du 16 mars 1971, art. 20bis et 38quater ; loi du 14 décembre 2000) :
//   · 36 h de travail effectif par semaine pour un temps plein (heures de 60 min), au prorata d'un temps partiel ;
//   · une pause d'au moins 15 min dès que la journée dépasse 6 h, jamais plus de 6 h d'affilée ; la pause ne compte pas ;
//   · 8 h par jour au plus ; 9 h dans une semaine de 4 jours, ou en horaire variable inscrit au règlement de travail ;
//   · 11 h de repos entre deux journées ;
//   · semaines flexibles (art. 20bis) : moyenne de 36 h sur l'année, 9 h/jour et 45 h/semaine au plus, 2 h d'écart par
//     jour et 5 h par semaine au plus par rapport à l'horaire prévu, relevé signé chaque mois, solde nul en fin de période ;
//   · congés : les congés scolaires fixés par l'école (Planification → calendrier, « vacances ») et cinq semaines
//     consécutives d'été dans une fenêtre réglable (5 juillet – 15 août). 52 − 13 = 39 semaines, 1 404 h pour un temps plein.
//     Un jour férié pendant une semaine de travail ne se récupère pas : ses heures prévues comptent comme prestées.
// Les heures se comptent en MINUTES, entières ; les jours à Bruxelles (dates civiles, sans heure).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import db from '../db/index.js';
import { congesDe } from './cep.js';
import { joursFeries } from '../routes/horaire.js';

export const REGLES = {
  hebdo: 36 * 60, pauseMin: 15, seuilPause: 6 * 60, continuMax: 6 * 60,
  jourMax: 8 * 60, jourMaxLong: 9 * 60, repos: 11 * 60, semaineMaxFlex: 45 * 60,
  ecartJour: 2 * 60, ecartSemaine: 5 * 60, semainesEte: 5,
  // 13 SEMAINES DE CONGÉ AU TOTAL (Charles, 1er novembre 2026) : 39 semaines de travail, 36 × 39 = 1 404 h par temps plein.
  // L'été est le complément : 13 − les semaines de congé scolaire réellement prises.
  congesAnnuels: 13,
};
export const FORMULES = {
  '5j': '36 h sur 5 jours, sans flexibilité',
  '4j': '36 h sur 4 jours de 9 h',
  annualise: 'Horaire annualisé (semaines de 45 h au plus, récupération prévue)',
};
export const ABSENCES = {
  maladie: { libelle: 'Maladie (certificat)', compte: true },
  circonstance: { libelle: 'Congé de circonstance', compte: true },
  mission: { libelle: 'Mission, formation', compte: true },
  recuperation: { libelle: 'Récupération (heures prises sur le solde)', compte: false },
  sans_solde: { libelle: 'Absence non rémunérée', compte: false },
};
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ── Dates (civiles, sans fuseau) ──
const d2s = d => d.toISOString().slice(0, 10);
const s2d = s => new Date(`${s}T00:00:00Z`);
export const plusJours = (s, n) => d2s(new Date(s2d(s).getTime() + n * 86400000));
const lundiDe = s => { const d = s2d(s); const w = (d.getUTCDay() + 6) % 7; return plusJours(s, -w); };
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const hm = m => { const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export function migrerTempsTravail(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS tt_personne (
      utilisateur_id INTEGER PRIMARY KEY, fraction REAL NOT NULL DEFAULT 1, formule TEXT NOT NULL DEFAULT '5j',
      actif INTEGER NOT NULL DEFAULT 1, maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tt_semaine (
      utilisateur_id INTEGER NOT NULL, annee TEXT NOT NULL, lundi TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'travail',          -- travail | conge | ete
      jours_json TEXT NOT NULL DEFAULT '[]',            -- 7 cases : null ou { debut, fin, pause_debut, pause_fin }
      genere_le TEXT, genere_par TEXT, PRIMARY KEY (utilisateur_id, lundi));
    CREATE INDEX IF NOT EXISTS idx_tt_semaine ON tt_semaine(annee, utilisateur_id);
    CREATE TABLE IF NOT EXISTS tt_ecart (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utilisateur_id INTEGER NOT NULL, jour TEXT NOT NULL,
      type TEXT NOT NULL,                               -- reel | absence
      debut TEXT, fin TEXT, pause_debut TEXT, pause_fin TEXT, motif TEXT, note TEXT,
      saisi_par TEXT, saisi_le TEXT DEFAULT (datetime('now')), UNIQUE (utilisateur_id, jour));
    CREATE TABLE IF NOT EXISTS tt_signature (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utilisateur_id INTEGER NOT NULL,
      objet TEXT NOT NULL, periode TEXT NOT NULL,        -- releve + « 2026-11 » | conges + « 2026-2027 »
      etape TEXT NOT NULL,                              -- personne | adjoint | direction
      par_id INTEGER, par_nom TEXT, le TEXT DEFAULT (datetime('now')), empreinte TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tt_conge (
      id INTEGER PRIMARY KEY AUTOINCREMENT, annee TEXT NOT NULL, du TEXT NOT NULL, au TEXT NOT NULL, libelle TEXT,
      fixe_par TEXT, fixe_le TEXT DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_tt_conge ON tt_conge(annee);
    CREATE TRIGGER IF NOT EXISTS tt_signature_sans_retouche BEFORE UPDATE ON tt_signature
      BEGIN SELECT RAISE(ABORT, 'Une signature ne se modifie pas.'); END;
    CREATE TRIGGER IF NOT EXISTS tt_signature_sans_effacement BEFORE DELETE ON tt_signature
      BEGIN SELECT RAISE(ABORT, 'Une signature ne s''efface pas.'); END;
  `);
}

/** Le réglage de l'école : fenêtre d'été, règlement de travail à jour (horaire variable permis). */
export function reglage(annee) {
  let r = {};
  try { r = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'temps_travail'").get()?.valeur || '{}'); } catch { /* vide */ }
  const a2 = Number(String(annee).split('-')[1]) || new Date().getFullYear();
  return {
    rt_variable: !!r.rt_variable,
    ete_du: r[`ete_du_${annee}`] || `${a2}-07-05`,
    ete_au: r[`ete_au_${annee}`] || `${a2}-08-15`,
    presents_min: Number(r.presents_min) || 2,
  };
}
export function ecrireReglage(annee, v) {
  let r = {};
  try { r = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'temps_travail'").get()?.valeur || '{}'); } catch { /* vide */ }
  if ('rt_variable' in v) r.rt_variable = !!v.rt_variable;
  if (v.ete_du) r[`ete_du_${annee}`] = v.ete_du;
  if (v.ete_au) r[`ete_au_${annee}`] = v.ete_au;
  if (v.presents_min) r.presents_min = Math.max(1, Math.min(10, Number(v.presents_min)));
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('temps_travail', ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(JSON.stringify(r));
  return reglage(annee);
}

/** Les 52 semaines de l'année scolaire : du lundi de la semaine du 1er septembre. */
export function semainesDeLAnnee(annee) {
  const a1 = Number(String(annee).split('-')[0]);
  const l0 = lundiDe(`${a1}-09-01`);
  return Array.from({ length: 52 }, (_, i) => plusJours(l0, 7 * i));
}

/** Les fériés de l'année (Map date → libellé). */
export function feriesDe(annee) {
  const [a1, a2] = String(annee).split('-').map(Number);
  return new Map([...joursFeries(a1), ...joursFeries(a2)]);
}

/* LES CONGÉS DU PERSONNEL ADMINISTRATIF SE FIXENT ICI (3.5.055, Charles : « tu ne me permets pas de générer le calendrier
 * de l'année et de fixer les vacances ? »). La direction fixe, année par année, les périodes de congé (Toussaint, Noël,
 * Carnaval, Pâques…) ; tant qu'elle n'en a fixé aucune, le module lit le calendrier de l'école (« vacances » de la
 * Planification). Les cinq semaines d'été se choisissent par personne, au générateur. */
export function congesFixes(annee) {
  try { return db.prepare('SELECT id, du, au, libelle, fixe_par, fixe_le FROM tt_conge WHERE annee = ? ORDER BY du').all(annee); } catch { return []; }
}
export function periodesDeConge(annee) {
  const fixes = congesFixes(annee);
  if (fixes.length) return { source: 'module', periodes: fixes.map(c => ({ du: c.du, au: c.au, label: c.libelle || 'Congé' })) };
  return { source: 'ecole', periodes: congesDe(annee).vacances };
}
export function fixerConges(annee, periodes, par) {
  const l = (periodes || []).map(p => ({ du: String(p.du || ''), au: String(p.au || ''), libelle: String(p.libelle || '').trim() || 'Congé' }));
  for (const p of l) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.du) || !/^\d{4}-\d{2}-\d{2}$/.test(p.au)) throw Object.assign(new Error(`« ${p.libelle} » : dates à écrire.`), { status: 400 });
    if (p.au < p.du) throw Object.assign(new Error(`« ${p.libelle} » : la fin précède le début.`), { status: 400 });
  }
  const tri = [...l].sort((a, b) => a.du.localeCompare(b.du));
  for (let i = 1; i < tri.length; i++) if (tri[i].du <= tri[i - 1].au) throw Object.assign(new Error(`« ${tri[i - 1].libelle} » et « ${tri[i].libelle} » se chevauchent.`), { status: 400 });
  db.transaction(() => {
    db.prepare('DELETE FROM tt_conge WHERE annee = ?').run(annee);
    const ins = db.prepare('INSERT INTO tt_conge (annee, du, au, libelle, fixe_par) VALUES (?,?,?,?,?)');
    for (const p of tri) ins.run(annee, p.du, p.au, p.libelle, par);
  })();
  return congesFixes(annee);
}

/** Les semaines de congé : celles dont les cinq jours ouvrables tombent dans une période de congé. */
export function semainesDeConge(annee) {
  const { periodes: vacances } = periodesDeConge(annee);
  const out = new Map();
  for (const l of semainesDeLAnnee(annee)) {
    const v = vacances.find(p => p.du <= l && p.au >= plusJours(l, 4));
    if (v) out.set(l, v.label);
  }
  return out;
}

// ── Une journée ──
export function dureeJour(j) {
  if (!j) return 0;
  const a = min(j.debut), b = min(j.fin);
  if (a == null || b == null || b <= a) return 0;
  const p1 = min(j.pause_debut), p2 = min(j.pause_fin);
  const pause = p1 != null && p2 != null && p2 > p1 ? p2 - p1 : 0;
  return b - a - pause;
}
function pauseDe(j) { const p1 = min(j?.pause_debut), p2 = min(j?.pause_fin); return p1 != null && p2 != null && p2 > p1 ? p2 - p1 : 0; }

/** Contrôle d'une journée. `long` : 9 h permises (4 jours, ou horaire variable au règlement). */
export function controleJour(j, { long = false } = {}) {
  const out = [];
  if (!j) return out;
  const a = min(j.debut), b = min(j.fin);
  if (a == null || b == null) return ['Heures de début et de fin à écrire (HH:MM).'];
  if (b <= a) return ['La fin précède le début.'];
  const p1 = min(j.pause_debut), p2 = min(j.pause_fin), pause = pauseDe(j), d = dureeJour(j);
  if ((p1 != null || p2 != null) && (p1 == null || p2 == null || p2 <= p1 || p1 < a || p2 > b)) out.push('La pause doit tomber dans la journée, avec un début et une fin.');
  if (d > REGLES.seuilPause && pause < REGLES.pauseMin) out.push(`Plus de 6 h de travail : une pause d'au moins ${REGLES.pauseMin} min est obligatoire (loi du 16 mars 1971, art. 38quater).`);
  const seg = pause ? Math.max(p1 - a, b - p2) : d;
  if (seg > REGLES.continuMax) out.push('Jamais plus de 6 h de travail d’affilée : la pause doit couper la journée.');
  const plafond = long ? REGLES.jourMaxLong : REGLES.jourMax;
  if (d > plafond) out.push(`${hm(d)} de travail : ${hm(plafond)} par jour au plus${long ? '' : ' (9 h seulement en semaine de 4 jours ou en horaire variable inscrit au règlement de travail)'}.`);
  return out;
}

/** Le modèle d'une semaine selon la formule (fraction de temps plein, jour libre en 4 jours). */
export function modeleSemaine(formule, fraction = 1, jourLibre = 4) {
  const jour = (deb, minutes) => {
    // pause de 30 min à 12 h 00 dès que la journée dépasse 6 h ; sinon pas de pause
    const a = min(deb); const avecPause = minutes > REGLES.seuilPause;
    const fin = a + minutes + (avecPause ? 30 : 0);
    const f = x => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    return { debut: deb, fin: f(fin), ...(avecPause ? { pause_debut: '12:00', pause_fin: '12:30' } : {}) };
  };
  const total = Math.round(REGLES.hebdo * fraction);
  if (formule === '4j') {
    const parJour = Math.round(total / 4);
    return Array.from({ length: 7 }, (_, i) => (i < 5 && i !== jourLibre ? jour('08:00', parJour) : null));
  }
  const parJour = Math.round(total / 5);
  return Array.from({ length: 7 }, (_, i) => (i < 5 ? jour('08:30', parJour) : null));
}

const totalSemaine = jours => (jours || []).reduce((s, j) => s + dureeJour(j), 0);

/** Contrôle d'une semaine de travail, au regard de la formule et du modèle (écarts de l'art. 20bis). */
export function controleSemaine(jours, { formule, fraction = 1, modele = null, rtVariable = false }) {
  const out = [];
  const long = formule === '4j' || (formule === 'annualise' && rtVariable);
  jours.forEach((j, i) => { for (const e of controleJour(j, { long })) out.push(`${JOURS[i]} : ${e}`); });
  for (let i = 0; i < 6; i++) {
    const a = jours[i], b = jours[i + 1];
    if (a && b && min(a.fin) != null && min(b.debut) != null && (24 * 60 - min(a.fin) + min(b.debut)) < REGLES.repos)
      out.push(`${JOURS[i]} → ${JOURS[i + 1]} : moins de 11 h de repos entre deux journées.`);
  }
  const t = totalSemaine(jours), cible = Math.round(REGLES.hebdo * fraction);
  if (formule === 'annualise') {
    if (!rtVariable) out.push('Horaire annualisé : il ne s’applique qu’une fois l’horaire variable inscrit au règlement de travail (Réglages).');
    if (t > REGLES.semaineMaxFlex) out.push(`${hm(t)} : 45 h par semaine au plus.`);
    if (Math.abs(t - cible) > REGLES.ecartSemaine) out.push(`${hm(t)} : au plus 5 h d’écart avec les ${hm(cible)} prévues.`);
    if (modele) jours.forEach((j, i) => {
      if (Math.abs(dureeJour(j) - dureeJour(modele[i])) > REGLES.ecartJour) out.push(`${JOURS[i]} : au plus 2 h d’écart avec l’horaire prévu (${hm(dureeJour(modele[i]))}).`);
    });
  } else if (t !== cible) out.push(`${hm(t)} prévues : la semaine doit compter exactement ${hm(cible)}.`);
  return out;
}

const personne = uid => db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);

/**
 * LE GÉNÉRATEUR ANNUEL. Rend l'année proposée — 52 semaines, leur statut, leurs heures — et ses contrôles ; n'écrit
 * que si `ecrire`. Options : formule, fraction, ete (lundi de la 1re semaine d'été), jourLibre (4 jours : 0 lundi … 4
 * vendredi), modele (7 cases) ; en annualisé, `fortes` = { lundi: minutes } (les semaines chargées), compensées à
 * parts égales sur les autres semaines de travail, dans les bornes de l'art. 20bis.
 */
export function genererAnnee(uid, annee, opts = {}, { ecrire = false, par = null } = {}) {
  const p = personne(uid) || {};
  const formule = opts.formule || p.formule || '5j';
  const fraction = Number(opts.fraction ?? p.fraction ?? 1);
  if (!FORMULES[formule]) throw Object.assign(new Error('Formule inconnue.'), { status: 400 });
  if (!(fraction > 0 && fraction <= 1)) throw Object.assign(new Error('La fraction de temps plein est entre 0 et 1.'), { status: 400 });
  const R = reglage(annee);
  const modele = Array.isArray(opts.modele) && opts.modele.length === 7 ? opts.modele : modeleSemaine(formule, fraction, Number(opts.jourLibre ?? 4));
  const semaines = semainesDeLAnnee(annee), conges = semainesDeConge(annee), feries = feriesDe(annee);
  const erreurs = [], avertissements = [];
  /* LES 13 SEMAINES (3.5.056, Charles : « je fixe les congés, c'est-à-dire 5 semaines en été et les semaines à Toussaint,
     Carnaval, Noël et Pâques ; tu as donc 1 404, pas 1 584 »). La direction fixe TOUTES les semaines de congé, été compris,
     dans la face « Congés » ; le dû est TOUJOURS 36 h × 39 semaines par temps plein. Une semaine fixée en juillet-août est
     une semaine d'été. L'ÉCHANGE : une semaine de congé scolaire travaillée (Carnaval) ajoute une semaine à l'été, accolée à
     lui. Si aucun été n'est fixé (calendrier de l'école seul), on le place au générateur (`ete`). */
  const [, a2] = String(annee).split('-').map(Number);
  const estEte = l => l >= `${a2}-06-15` && l <= `${a2}-08-31`;
  const travaillees = new Set((opts.travaillees || []).map(lundiDe));
  for (const l of travaillees) if (!conges.has(l) || estEte(l)) erreurs.push(`La semaine du ${l} n’est pas une semaine de congé scolaire : rien à échanger.`);
  const scolaires = [...conges.keys()].filter(l => !estEte(l));
  const eteFixe = [...conges.keys()].filter(estEte).sort();
  const prises = scolaires.filter(l => !travaillees.has(l)).length;
  const nEte = REGLES.congesAnnuels - prises;
  if (nEte < 1) erreurs.push(`Les congés scolaires (${prises} semaines) dépassent les 13 semaines de congé de l’année.`);
  const eteSemaines = new Set();
  let ete = opts.ete ? lundiDe(opts.ete) : null;
  if (!ete && eteFixe.length) ete = eteFixe[0];
  if (ete) {
    let debut = ete;
    // L'été fixé s'allonge d'abord après lui ; s'il sortirait de la fenêtre, il commence plus tôt.
    if (!opts.ete && plusJours(debut, 7 * nEte - 1) > R.ete_au) debut = plusJours(lundiDe(R.ete_au), -7 * (nEte - 1));
    const fin = plusJours(debut, 7 * nEte - 1);
    if (debut < R.ete_du || fin > R.ete_au) erreurs.push(`Les ${nEte} semaines d’été (${debut} → ${fin}) doivent tenir entre le ${R.ete_du} et le ${R.ete_au}.`);
    for (let i = 0; i < nEte; i++) eteSemaines.add(plusJours(debut, 7 * i));
    ete = debut;
  } else erreurs.push(`L’été n’est pas fixé : ajoutez-le dans la face « Congés » (${nEte} semaines).`);
  const nbConge = scolaires.length;
  if (eteFixe.length && eteFixe.length + scolaires.length !== REGLES.congesAnnuels)
    avertissements.push(`Les congés fixés comptent ${eteFixe.length + scolaires.length} semaines au lieu de 13 : l’été est ramené à ${nEte} semaine(s) pour que l’année compte 39 semaines de travail.`);
  const rows = semaines.map(l => {
    const ec = eteSemaines.has(l), sc = conges.has(l) && !estEte(l) && !travaillees.has(l);
    const statut = sc ? 'conge' : ec ? 'ete' : 'travail';
    return { lundi: l, statut, echange: travaillees.has(l) ? conges.get(l) : null,
      libelle: statut === 'conge' ? conges.get(l) : statut === 'ete' ? 'Vacances d’été' : (travaillees.has(l) ? `${conges.get(l)} — travaillée, récupérée en été` : null),
      jours: statut === 'travail' ? modele.map(j => (j ? { ...j } : null)) : Array(7).fill(null) };
  });
  const travail = rows.filter(r => r.statut === 'travail');
  const cibleSemaine = Math.round(REGLES.hebdo * fraction);
  // Le dû ne dépend pas du calendrier : 36 h × 39 semaines par temps plein, toujours.
  const cibleAnnee = cibleSemaine * (52 - REGLES.congesAnnuels);
  // Annualisé : les semaines fortes, compensées sur les autres.
  if (formule === 'annualise' && opts.fortes && Object.keys(opts.fortes).length) {
    let surplus = 0;
    for (const r of travail) {
      const v = opts.fortes[r.lundi];
      if (v == null) continue;
      const t = Math.round(Number(v));
      r.jours = etirer(modele, t); surplus += t - cibleSemaine; r.forte = true;
    }
    const autres = travail.filter(r => !r.forte);
    if (autres.length) {
      const base = Math.floor(surplus / autres.length); let reste = surplus - base * autres.length;
      for (const r of autres) { const k = reste > 0 ? 1 : 0; reste -= k; r.jours = etirer(modele, cibleSemaine - base - k); }
    }
  }
  for (const r of rows) {
    r.minutes = totalSemaine(r.jours);
    r.feries = r.jours.map((j, i) => (j && feries.has(plusJours(r.lundi, i)) ? feries.get(plusJours(r.lundi, i)) : null)).filter(Boolean);
    r.controles = r.statut === 'travail' ? controleSemaine(r.jours, { formule, fraction, modele, rtVariable: R.rt_variable }) : [];
  }
  const totalAnnee = rows.reduce((s, r) => s + r.minutes, 0);
  if (totalAnnee !== cibleAnnee) erreurs.push(`L’année compte ${hm(totalAnnee)} pour ${hm(cibleAnnee)} dues : rien de plus, rien de moins.`);
  const bilan = { formule, fraction, ete, semaines_travail: travail.length, semaines_conge: prises, semaines_ete: eteSemaines.size, echanges: [...travaillees],
    cible_annee: cibleAnnee, total_annee: totalAnnee, erreurs, avertissements, semaines_en_defaut: rows.filter(r => r.controles.length).length };
  if (ecrire) {
    if (erreurs.length || bilan.semaines_en_defaut) throw Object.assign(new Error('L’année ne respecte pas les règles : rien n’est écrit.'), { status: 409, bilan });
    const ins = db.prepare(`INSERT INTO tt_semaine (utilisateur_id, annee, lundi, statut, jours_json, genere_le, genere_par)
      VALUES (?,?,?,?,?,datetime('now'),?) ON CONFLICT(utilisateur_id, lundi) DO UPDATE SET annee = excluded.annee,
      statut = excluded.statut, jours_json = excluded.jours_json, genere_le = excluded.genere_le, genere_par = excluded.genere_par`);
    db.transaction(() => {
      db.prepare(`INSERT INTO tt_personne (utilisateur_id, fraction, formule, maj_par) VALUES (?,?,?,?)
        ON CONFLICT(utilisateur_id) DO UPDATE SET fraction = excluded.fraction, formule = excluded.formule, maj_par = excluded.maj_par, maj_le = datetime('now')`)
        .run(uid, fraction, formule, par);
      for (const r of rows) ins.run(uid, annee, r.lundi, r.statut, JSON.stringify(r.jours), par);
    })();
  }
  return { bilan, semaines: rows, modele };
}

/** Allonge ou raccourcit une semaine-modèle jusqu'à `cible` minutes, en répartissant sur ses jours (fins décalées). */
function etirer(modele, cible) {
  const jours = modele.map(j => (j ? { ...j } : null));
  const idx = jours.map((j, i) => (j ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return jours;
  let delta = cible - totalSemaine(jours);
  const part = Math.trunc(delta / idx.length); let reste = delta - part * idx.length;
  const f = x => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  for (const i of idx) {
    const k = part + (reste > 0 ? 1 : reste < 0 ? -1 : 0); if (reste > 0) reste--; else if (reste < 0) reste++;
    jours[i].fin = f(min(jours[i].fin) + k);
  }
  return jours;
}

/** L'année enregistrée d'une personne. */
export function anneeDe(uid, annee) {
  return db.prepare('SELECT lundi, statut, jours_json, genere_le, genere_par FROM tt_semaine WHERE utilisateur_id = ? AND annee = ? ORDER BY lundi')
    .all(uid, annee).map(r => ({ lundi: r.lundi, statut: r.statut, jours: JSON.parse(r.jours_json || '[]'), minutes: totalSemaine(JSON.parse(r.jours_json || '[]')), genere_le: r.genere_le, genere_par: r.genere_par }));
}

/** Corriger UNE semaine de l'année enregistrée (annualisé surtout) : mêmes contrôles ; l'année doit rester juste. */
export function modifierSemaine(uid, annee, lundi, jours, par) {
  const p = personne(uid); if (!p) throw Object.assign(new Error('Personne non désignée.'), { status: 404 });
  const R = reglage(annee);
  const ex = db.prepare('SELECT statut FROM tt_semaine WHERE utilisateur_id = ? AND lundi = ?').get(uid, lundi);
  if (!ex) throw Object.assign(new Error('Semaine inconnue : générez d’abord l’année.'), { status: 404 });
  if (ex.statut !== 'travail') throw Object.assign(new Error('Une semaine de congé ne porte pas d’heures.'), { status: 409 });
  if (verrouille(uid, lundi)) throw Object.assign(new Error('Ce mois est signé par la direction : il ne change plus.'), { status: 409 });
  const c = controleSemaine(jours, { formule: p.formule, fraction: p.fraction, modele: modeleSemaine(p.formule, p.fraction), rtVariable: R.rt_variable });
  if (c.length) throw Object.assign(new Error(c.join(' ')), { status: 409 });
  db.prepare("UPDATE tt_semaine SET jours_json = ?, genere_par = ?, genere_le = datetime('now') WHERE utilisateur_id = ? AND lundi = ?")
    .run(JSON.stringify(jours), par, uid, lundi);
  const total = anneeDe(uid, annee).reduce((s, r) => s + r.minutes, 0);
  const cible = Math.round(REGLES.hebdo * p.fraction) * (52 - REGLES.congesAnnuels);
  return { total, cible, ecart: total - cible };
}

// ── Le réel : l'horaire prévu fait foi, on n'encode que les écarts ──
export function verrouille(uid, jour) {
  return !!db.prepare("SELECT 1 FROM tt_signature WHERE utilisateur_id = ? AND objet = 'releve' AND periode = ? AND etape = 'direction'")
    .get(uid, String(jour).slice(0, 7));
}

/** Le relevé d'un mois : chaque jour, le prévu, le réel, l'écart ; le solde depuis le début de l'année. */
export function releve(uid, annee, mois) {
  const sem = new Map(anneeDe(uid, annee).map(r => [r.lundi, r]));
  const feries = feriesDe(annee);
  const pers = personne(uid) || {};
  const long = pers.formule === '4j' || (pers.formule === 'annualise' && reglage(annee).rt_variable);
  const ecarts = new Map(db.prepare('SELECT * FROM tt_ecart WHERE utilisateur_id = ? AND jour LIKE ?').all(uid, `${mois}-%`).map(e => [e.jour, e]));
  const jours = [];
  const [y, m] = mois.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let prevu = 0, reel = 0;
  for (let d = 1; d <= n; d++) {
    const jour = `${mois}-${String(d).padStart(2, '0')}`;
    const l = lundiDe(jour), i = (s2d(jour).getUTCDay() + 6) % 7;
    const s = sem.get(l);
    const plan = s?.statut === 'travail' ? s.jours[i] : null;
    const p = dureeJour(plan);
    const e = ecarts.get(jour);
    let r = p, etat = s ? (s.statut === 'travail' ? (plan ? 'prevu' : 'libre') : s.statut) : 'hors';
    if (feries.has(jour) && plan) { etat = 'ferie'; }
    if (e?.type === 'reel') { r = dureeJour(e); etat = 'reel'; }
    if (e?.type === 'absence') { r = ABSENCES[e.motif]?.compte ? p : 0; etat = 'absence'; }
    prevu += p; reel += r;
    jours.push({ jour, jour_semaine: JOURS[i], etat, ferie: feries.get(jour) || null, prevu: p, reel: r, ecart: r - p, plan,
      saisie: e ? { type: e.type, debut: e.debut, fin: e.fin, pause_debut: e.pause_debut, pause_fin: e.pause_fin, motif: e.motif, note: e.note, par: e.saisi_par } : null,
      controles: e?.type === 'reel' ? controleJour(e, { long }) : [] });
  }
  // Solde cumulé depuis le début de l'année jusqu'à la fin de ce mois.
  const debutAnnee = semainesDeLAnnee(annee)[0];
  let solde = 0;
  for (const e of db.prepare('SELECT * FROM tt_ecart WHERE utilisateur_id = ? AND jour >= ? AND jour <= ?').all(uid, debutAnnee, `${mois}-31`)) {
    const l = lundiDe(e.jour), i = (s2d(e.jour).getUTCDay() + 6) % 7;
    const s = sem.get(l); const p = s?.statut === 'travail' ? dureeJour(s.jours[i]) : 0;
    const r = e.type === 'reel' ? dureeJour(e) : (ABSENCES[e.motif]?.compte ? p : 0);
    solde += r - p;
  }
  const contenu = { uid, mois, jours: jours.map(j => [j.jour, j.prevu, j.reel]) };
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(contenu)).digest('hex');
  const signatures = db.prepare("SELECT etape, par_nom, le, empreinte FROM tt_signature WHERE utilisateur_id = ? AND objet = 'releve' AND periode = ? ORDER BY id")
    .all(uid, mois).map(s => ({ ...s, valable: s.empreinte === empreinte }));
  return { mois, jours, prevu, reel, ecart: reel - prevu, solde, empreinte, signatures, verrouille: verrouille(uid, `${mois}-01`) };
}

export function ecrireEcart(uid, jour, v, par) {
  if (verrouille(uid, jour)) throw Object.assign(new Error('Ce mois est signé par la direction : il ne change plus.'), { status: 409 });
  if (v == null || v.type === 'aucun') { db.prepare('DELETE FROM tt_ecart WHERE utilisateur_id = ? AND jour = ?').run(uid, jour); return; }
  if (v.type === 'reel') {
    const c = controleJour(v, { long: true });
    if (c.some(x => /précède|écrire|tomber/.test(x))) throw Object.assign(new Error(c.join(' ')), { status: 400 });
  } else if (v.type === 'absence') {
    if (!ABSENCES[v.motif]) throw Object.assign(new Error('Motif d’absence inconnu.'), { status: 400 });
  } else throw Object.assign(new Error('Type inconnu.'), { status: 400 });
  db.prepare(`INSERT INTO tt_ecart (utilisateur_id, jour, type, debut, fin, pause_debut, pause_fin, motif, note, saisi_par)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(utilisateur_id, jour) DO UPDATE SET type = excluded.type, debut = excluded.debut,
    fin = excluded.fin, pause_debut = excluded.pause_debut, pause_fin = excluded.pause_fin, motif = excluded.motif,
    note = excluded.note, saisi_par = excluded.saisi_par, saisi_le = datetime('now')`)
    .run(uid, jour, v.type, v.debut || null, v.fin || null, v.pause_debut || null, v.pause_fin || null, v.motif || null, v.note || null, par);
}

/** La fiche de congés de l'année : périodes (scolaires, été) et absences non comptées ; son empreinte. */
export function ficheConges(uid, annee) {
  const sem = anneeDe(uid, annee);
  const periodes = [];
  for (const s of sem) {
    if (s.statut === 'travail') continue;
    const der = periodes[periodes.length - 1];
    if (der && der.statut === s.statut && plusJours(der.au, 3) >= s.lundi) der.au = plusJours(s.lundi, 4);
    else periodes.push({ statut: s.statut, du: s.lundi, au: plusJours(s.lundi, 4) });
  }
  const conges = semainesDeConge(annee);
  for (const p of periodes) p.libelle = p.statut === 'ete' ? 'Vacances d’été' : (conges.get(p.du) || 'Congé scolaire');
  const contenu = { uid, annee, periodes: periodes.map(p => [p.statut, p.du, p.au]) };
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(contenu)).digest('hex');
  const signatures = db.prepare("SELECT etape, par_nom, le, empreinte FROM tt_signature WHERE utilisateur_id = ? AND objet = 'conges' AND periode = ? ORDER BY id")
    .all(uid, annee).map(s => ({ ...s, valable: s.empreinte === empreinte }));
  return { annee, periodes, semaines_conge: sem.filter(s => s.statut !== 'travail').length, empreinte, signatures };
}

const ORDRE = { releve: ['personne', 'adjoint', 'direction'], conges: ['adjoint', 'direction'] };
/** Signer : l'étape suivante seulement, par la bonne main, sur le contenu tel qu'il est. */
export function signer(uid, objet, periode, etape, user, nomUser, annee) {
  const ordre = ORDRE[objet]; if (!ordre?.includes(etape)) throw Object.assign(new Error('Étape inconnue.'), { status: 400 });
  const doc = objet === 'releve' ? releve(uid, annee, periode) : ficheConges(uid, periode);
  const valables = doc.signatures.filter(s => s.valable).map(s => s.etape);
  const attendue = ordre.find(e => !valables.includes(e));
  if (!attendue) throw Object.assign(new Error('Déjà signé à toutes les étapes.'), { status: 409 });
  if (attendue !== etape) throw Object.assign(new Error(`L’étape attendue est : ${attendue}.`), { status: 409 });
  const role = user.role;
  if (etape === 'personne' && user.id !== uid) throw Object.assign(new Error('Seule la personne signe son propre relevé.'), { status: 403 });
  if (etape === 'adjoint' && !['directeur_adjoint', 'admin', 'directeur'].includes(role)) throw Object.assign(new Error('Réservé à la direction adjointe.'), { status: 403 });
  if (etape === 'direction' && !['directeur', 'admin'].includes(role)) throw Object.assign(new Error('Réservé à la direction.'), { status: 403 });
  if (etape !== 'personne' && user.id === uid) throw Object.assign(new Error('On ne contrôle pas son propre relevé.'), { status: 403 });
  if (objet === 'releve' && etape === 'personne' && doc.jours.some(j => j.controles.length))
    throw Object.assign(new Error('Un jour du mois enfreint une règle : corrigez-le avant de signer.'), { status: 409 });
  db.prepare('INSERT INTO tt_signature (utilisateur_id, objet, periode, etape, par_id, par_nom, empreinte) VALUES (?,?,?,?,?,?,?)')
    .run(uid, objet, periode, etape, user.id, nomUser, doc.empreinte);
}

/** Le planning de l'équipe pour un mois : qui est prévu, qui est absent, et les jours qui ne tiennent pas. */
export function planningEquipe(annee, mois) {
  const R = reglage(annee);
  const gens = db.prepare(`SELECT p.utilisateur_id AS id, u.nom_complet AS nom, u.email FROM tt_personne p
    JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  const feries = feriesDe(annee);
  const [y, m] = mois.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const parPersonne = gens.map(g => ({ ...g, rel: releve(g.id, annee, mois) }));
  const jours = [];
  for (let d = 1; d <= n; d++) {
    const jour = `${mois}-${String(d).padStart(2, '0')}`, i = (s2d(jour).getUTCDay() + 6) % 7;
    if (i > 4) continue;
    const presents = parPersonne.filter(g => { const j = g.rel.jours[d - 1]; return j.reel > 0 && j.etat !== 'absence'; }).map(g => g.id);
    jours.push({ jour, jour_semaine: JOURS[i], ferie: feries.get(jour) || null, presents: presents.length,
      alerte: feries.has(jour) ? null : presents.length === 0 ? 'Secrétariat fermé' : presents.length < R.presents_min ? `Moins de ${R.presents_min} présents` : null });
  }
  return {
    jours, presents_min: R.presents_min,
    personnes: parPersonne.map(g => ({ id: g.id, nom: g.nom, email: g.email,
      jours: g.rel.jours.filter(j => (s2d(j.jour).getUTCDay() + 6) % 7 < 5).map(j => ({ jour: j.jour, etat: j.etat, present: j.reel > 0 && j.etat !== 'absence', plan: j.plan ? `${j.plan.debut}–${j.plan.fin}` : null })) })),
  };
}

export { JOURS };

/* L'ANNÉE DE L'ÉQUIPE, SEMAINE PAR SEMAINE (3.5.040, Charles : « la gestion de l'emploi du temps des administratifs doit
 * couvrir toute l'année ; une version en semaines, avec le temps de travail de chacun par semaine, et annuel »). Pour
 * chaque personne désignée et chaque semaine : le statut, le prévu, le presté (prévu corrigé des écarts encodés) ; puis
 * les totaux de l'année face au dû. `heures` faux : les statuts seuls (ce que voit une personne désignée des autres). */
export function anneeEquipe(annee, { heures = true } = {}) {
  const semaines = semainesDeLAnnee(annee);
  const gens = db.prepare(`SELECT p.utilisateur_id AS id, p.fraction, p.formule, u.nom_complet AS nom, u.email FROM tt_personne p
    JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  const fin = plusJours(semaines[51], 6);
  const personnes = gens.map(g => {
    const sem = new Map(anneeDe(g.id, annee).map(s => [s.lundi, s]));
    const ecarts = db.prepare('SELECT * FROM tt_ecart WHERE utilisateur_id = ? AND jour >= ? AND jour <= ?').all(g.id, semaines[0], fin);
    const delta = new Map();
    for (const e of ecarts) {
      const l = lundiDe(e.jour), i = (s2d(e.jour).getUTCDay() + 6) % 7, s = sem.get(l);
      const p = s?.statut === 'travail' ? dureeJour(s.jours[i]) : 0;
      const r = e.type === 'reel' ? dureeJour(e) : (ABSENCES[e.motif]?.compte ? p : 0);
      delta.set(l, (delta.get(l) || 0) + r - p);
    }
    const lignes = semaines.map(l => {
      const s = sem.get(l);
      const prevu = s?.minutes || 0, reel = prevu + (delta.get(l) || 0);
      return heures ? { lundi: l, statut: s?.statut || null, prevu, reel } : { lundi: l, statut: s?.statut || null };
    });
    const travail = lignes.filter(x => x.statut === 'travail').length;
    const du = Math.round(REGLES.hebdo * g.fraction) * (52 - REGLES.congesAnnuels);
    const out = { id: g.id, nom: g.nom, email: g.email, formule: g.formule, fraction: g.fraction, genere: sem.size > 0, semaines: lignes };
    if (heures) Object.assign(out, { du, prevu: lignes.reduce((t, x) => t + x.prevu, 0), reel: lignes.reduce((t, x) => t + x.reel, 0) });
    return out;
  });
  // Les présents par semaine (jours ouvrables où chacun est prévu) : le roulement de l'été se lit ici.
  const presents = semaines.map(l => personnes.filter(p => p.semaines.find(x => x.lundi === l)?.statut === 'travail').length);
  return { semaines, personnes, presents, presents_min: reglage(annee).presents_min };
}

/** Une semaine de l'équipe, jour par jour : l'horaire prévu, le réel encodé, le total de chacun. */
export function semaineEquipe(annee, lundi, { heures = true } = {}) {
  lundi = lundiDe(lundi);
  const gens = db.prepare(`SELECT p.utilisateur_id AS id, u.nom_complet AS nom, u.email FROM tt_personne p
    JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  const feries = feriesDe(annee);
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(lundi, i));
  return {
    lundi, jours: jours.map(j => ({ jour: j, ferie: feries.get(j) || null })),
    personnes: gens.map(g => {
      const s = db.prepare('SELECT statut, jours_json FROM tt_semaine WHERE utilisateur_id = ? AND lundi = ?').get(g.id, lundi);
      const plan = s ? JSON.parse(s.jours_json || '[]') : [];
      const ec = new Map(db.prepare('SELECT * FROM tt_ecart WHERE utilisateur_id = ? AND jour >= ? AND jour <= ?').all(g.id, lundi, jours[6]).map(e => [e.jour, e]));
      let tp = 0, tr = 0;
      const cases = jours.map((j, i) => {
        const p = s?.statut === 'travail' ? plan[i] : null, e = ec.get(j);
        const dp = dureeJour(p), dr = e?.type === 'reel' ? dureeJour(e) : e?.type === 'absence' ? (ABSENCES[e.motif]?.compte ? dp : 0) : dp;
        tp += dp; tr += dr;
        const c = { statut: s?.statut || null, present: dr > 0 && e?.type !== 'absence',
          absence: e?.type === 'absence' ? (ABSENCES[e.motif]?.libelle || e.motif) : null, ferie: feries.get(j) || null };
        if (heures) Object.assign(c, { plan: p ? `${p.debut}–${p.fin}` : null, reel: e?.type === 'reel' ? `${e.debut}–${e.fin}` : null, prevu: dp, preste: dr });
        return c;
      });
      return { id: g.id, nom: g.nom, email: g.email, statut: s?.statut || null, jours: cases, ...(heures ? { prevu: tp, preste: tr } : {}) };
    }),
  };
}
