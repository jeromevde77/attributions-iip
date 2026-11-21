/* (CS) L'ÉVALUATION DU PERSONNEL (3.5.605, Charles, 21 novembre 2026 — cahier des charges « Module Évaluation du personnel » v1.0 ;
   tranché : construit et mis en production ; une clé PROPRE, posée sur la production seule ; Personnel → Évaluations, et visible dans
   son espace pour le membre du personnel évalué ; code TOTP redemandé, valable 15 minutes).

   LES DROITS SE PORTENT PAR ÉVALUATION, JAMAIS PAR FONCTION : on y entre comme évalué, comme évaluateur, ou comme gestionnaire (la
   direction : admin, directeur — la direction adjointe n'est PAS gestionnaire, elle est la première évaluée). Être direction adjointe
   ne donne accès à rien d'autre que ses propres évaluations.

   L'AVEUGLE MUTUEL EST TENU PAR LE SERVEUR : la grille de l'autre partie ne sort jamais avant que les deux soient soumises ; toute
   tentative est refusée ET journalisée. Le gestionnaire qui n'est pas partie ne lit pas les grilles avant la synthèse non plus.

   LE TEXTE EST CHIFFRÉ AU REPOS (AES-256-GCM, clé EVAL_KEY hors dépôt). Les grilles, le compte rendu, les observations et les
   objectifs sont écrits chiffrés, en entier : la base, ses sauvegardes et la copie de la dev ne laissent rien lire. Sans EVAL_KEY, la
   production REFUSE d'écrire (et de lire) ; la dev prend une clé d'essai — les évaluations réelles recopiées depuis la production y
   restent illisibles, c'est voulu.

   PAS DE NOTE GLOBALE, PAS DE MOYENNE, PAS DE CLASSEMENT : la synthèse ne fait que poser les deux lectures côte à côte. */
import crypto from 'crypto';
import db from '../db/index.js';
import { verifierTotp } from './totp.js';
import { dechiffrer as dechiffrerMfa } from './secret-box.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

export const GESTIONNAIRES = ['admin', 'directeur'];
export const estGestionnaire = u => GESTIONNAIRES.includes(String(u?.role || ''));
export const DUREE_DEVERROU_MIN = 15;

// ── Le chiffrement ───────────────────────────────────────────────────────────
function cle() {
  const brut = (process.env.EVAL_KEY || '').trim();
  if (brut) {
    if (/^[0-9a-fA-F]{64}$/.test(brut)) return Buffer.from(brut, 'hex');
    try { const b = Buffer.from(brut, 'base64'); if (b.length === 32) return b; } catch { /* */ }
    return null;
  }
  if (process.env.NODE_ENV === 'production') return null;
  return crypto.createHash('sha256').update('lucie-evaluation-cle-d-essai-de-la-dev').digest();
}
export const clePresente = () => !!cle();
function chiffrer(obj) {
  const k = cle(); if (!k) throw Object.assign(new Error('Clé de chiffrement des évaluations absente (EVAL_KEY) : rien ne s’écrit.'), { statut: 503 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const corps = Buffer.concat([c.update(JSON.stringify(obj ?? null), 'utf8'), c.final()]);
  return ['e1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), corps.toString('base64url')].join('.');
}
function dechiffrer(paquet, defaut = null) {
  if (!paquet) return defaut;
  const k = cle(); if (!k) throw Object.assign(new Error('Clé de chiffrement des évaluations absente (EVAL_KEY).'), { statut: 503 });
  const [v, iv, tag, corps] = String(paquet).split('.');
  if (v !== 'e1') return defaut;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(corps, 'base64url')), d.final()]).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Contenu illisible avec la clé de ce serveur (copie d’une autre base ?).'), { statut: 409 });
  }
}

// ── Les tables ───────────────────────────────────────────────────────────────
export function migrerEvaluations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_referentiel (id INTEGER PRIMARY KEY AUTOINCREMENT, fonction TEXT NOT NULL, version INTEGER NOT NULL,
      titre TEXT, structure TEXT NOT NULL, en_vigueur_le TEXT DEFAULT (date('now')), cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
      UNIQUE(fonction, version));
    CREATE TABLE IF NOT EXISTS eval_evaluation (id INTEGER PRIMARY KEY AUTOINCREMENT, evalue_user_id INTEGER NOT NULL,
      evaluateur_user_id INTEGER NOT NULL, referentiel_id INTEGER NOT NULL, periode TEXT NOT NULL, remise_le TEXT,
      objectifs TEXT, etat TEXT NOT NULL DEFAULT 'brouillon', cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
      ouverte_le TEXT, synthese_le TEXT, entretien_le TEXT, valide_evaluateur_le TEXT, valide_evalue_le TEXT, archivee_le TEXT,
      reference TEXT, empreinte TEXT, purgee_le TEXT);
    CREATE TABLE IF NOT EXISTS eval_reponse (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER NOT NULL, partie TEXT NOT NULL,
      contenu TEXT, maj_le TEXT, soumise_le TEXT, UNIQUE(evaluation_id, partie));
    CREATE TABLE IF NOT EXISTS eval_compte_rendu (evaluation_id INTEGER PRIMARY KEY, contenu TEXT, observations TEXT,
      desaccord INTEGER DEFAULT 0, maj_le TEXT);
    CREATE TABLE IF NOT EXISTS eval_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nom TEXT, evaluation_id INTEGER,
      action TEXT NOT NULL, detail TEXT, ip TEXT, le TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS eval_deverrou (user_id INTEGER PRIMARY KEY, jusqu_au INTEGER, code_empreinte TEXT, code_expire INTEGER,
      code_essais INTEGER DEFAULT 0);
    CREATE TRIGGER IF NOT EXISTS eval_journal_pas_de_modif BEFORE UPDATE ON eval_journal BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
    CREATE TRIGGER IF NOT EXISTS eval_journal_pas_d_effacement BEFORE DELETE ON eval_journal BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
  `);
  if (!db.prepare("SELECT 1 FROM eval_referentiel WHERE fonction = 'direction_adjointe'").get()) {
    db.prepare('INSERT INTO eval_referentiel (fonction, version, titre, structure, cree_par) VALUES (?,?,?,?,?)')
      .run('direction_adjointe', 1, 'Direction adjointe — formulaire 2026', JSON.stringify(REFERENTIEL_DA), 'Lucie (modèle initial)');
  }
}

/* LES ÉCHELLES, affichées en permanence à côté de la grille. */
export const ECHELLES = {
  niveau: { titre: 'Niveau d’atteinte', valeurs: [
    { v: 1, l: 'Insuffisant', d: 'La mission n’est pas assurée ou l’est rarement ; des manquements ont des conséquences.' },
    { v: 2, l: 'À développer', d: 'La mission est assurée en partie ; un accompagnement ou des rappels sont nécessaires.' },
    { v: 3, l: 'Atteint', d: 'La mission est assurée de manière fiable et autonome, comme le profil de fonction l’attend.' },
    { v: 4, l: 'Dépassé', d: 'La mission est assurée au-delà des attentes ; elle sert de référence ou améliore le fonctionnement.' },
    { v: 'NO', l: 'Non observé', d: 'Pas d’occasion d’observer pendant la période.' }] },
  frequence: { titre: 'Fréquence du comportement', valeurs: [
    { v: 1, l: 'Jamais' }, { v: 2, l: 'Rarement' }, { v: 3, l: 'Parfois' }, { v: 4, l: 'Souvent' }, { v: 5, l: 'Toujours' },
    { v: 'NO', l: 'Non observé' }] },
  maitrise: { titre: 'Maîtrise', valeurs: [
    { v: 1, l: 'Notions' }, { v: 2, l: 'Utilisateur' }, { v: 3, l: 'Autonome' }, { v: 4, l: 'Expert' }, { v: 'NO', l: 'Non observé' }] },
};

/* LE RÉFÉRENTIEL DE LA DIRECTION ADJOINTE — les sections du formulaire 2026. Les missions, comportements et compétences sont à
   reprendre du formulaire PDF dans l'éditeur (Personnel → Évaluations → Référentiels) ; une évaluation garde la version de sa création. */
const REFERENTIEL_DA = { sections: [
  { id: 'annee', titre: 'Votre année en bref', type: 'texte', champs: [
    { id: 'realisations', libelle: 'Les réalisations de l’année' }, { id: 'difficultes', libelle: 'Les difficultés rencontrées' }] },
  { id: 'missions', titre: 'Missions du profil de fonction', type: 'missions', echelle: 'niveau', criteres: [
    { id: 'm1', libelle: '[À reprendre du formulaire] Mission 1' }, { id: 'm2', libelle: '[À reprendre du formulaire] Mission 2' }] },
  { id: 'missions_pratique', titre: 'Missions apparues avec la pratique', type: 'missions', echelle: 'niveau', libres: true, criteres: [] },
  { id: 'objectifs', titre: 'Objectifs fixés pour la période', type: 'objectifs', echelle: 'niveau' },
  { id: 'comportements', titre: 'Compétences comportementales', type: 'comportements', echelle: 'frequence', criteres: [
    { id: 'c1', libelle: '[À reprendre du formulaire] Comportement observable 1' }] },
  { id: 'techniques', titre: 'Compétences techniques', type: 'techniques', echelle: 'maitrise', criteres: [
    { id: 't1', libelle: '[À reprendre du formulaire] Compétence 1' }] },
  { id: 'fin', titre: 'Charge de travail, développement, commentaire libre', type: 'texte', champs: [
    { id: 'charge', libelle: 'La charge de travail' }, { id: 'developpement', libelle: 'Mon développement' },
    { id: 'commentaire', libelle: 'Commentaire libre' }] },
] };

// ── Le journal ───────────────────────────────────────────────────────────────
export function journaliser(req, evaluationId, action, detail = null) {
  try {
    db.prepare('INSERT INTO eval_journal (user_id, nom, evaluation_id, action, detail, ip) VALUES (?,?,?,?,?,?)')
      .run(req?.user?.id || null, req?.user?.nom || null, evaluationId || null, action, detail ? String(detail).slice(0, 500) : null,
        String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim() || null);
  } catch { /* un journal ne fait jamais échouer le geste qui l'écrit — mais la table est créée au démarrage */ }
}

// ── Le déverrouillage (code redemandé, valable 15 minutes glissantes) ────────
export function deverrouille(userId) {
  const r = db.prepare('SELECT jusqu_au FROM eval_deverrou WHERE user_id = ?').get(userId);
  if (!r?.jusqu_au || r.jusqu_au < Date.now()) return false;
  db.prepare('UPDATE eval_deverrou SET jusqu_au = ? WHERE user_id = ?').run(Date.now() + DUREE_DEVERROU_MIN * 60000, userId);
  return true;
}
const poserDeverrou = userId => db.prepare(`INSERT INTO eval_deverrou (user_id, jusqu_au) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET jusqu_au = excluded.jusqu_au, code_empreinte = NULL, code_expire = NULL, code_essais = 0`)
  .run(userId, Date.now() + DUREE_DEVERROU_MIN * 60000);
export function modeDeverrou(userId) {
  const u = db.prepare('SELECT mfa_actif, email FROM utilisateur WHERE id = ?').get(userId);
  return u?.mfa_actif ? { mode: 'totp' } : { mode: 'courriel', email: String(u?.email || '').replace(/^(.).*(@.*)$/, '$1…$2') };
}
/* Sans application d'authentification (la plupart des professeurs), le code part à l'adresse du compte : 6 chiffres, 10 minutes. */
export async function envoyerCodeDeverrou(userId) {
  const u = db.prepare('SELECT email, mfa_actif FROM utilisateur WHERE id = ?').get(userId);
  if (!u?.email) return { erreur: 'Ce compte n’a pas d’adresse.' };
  if (u.mfa_actif) return { erreur: 'Utilisez le code de votre application d’authentification.' };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.prepare(`INSERT INTO eval_deverrou (user_id, code_empreinte, code_expire, code_essais) VALUES (?,?,?,0)
    ON CONFLICT(user_id) DO UPDATE SET code_empreinte = excluded.code_empreinte, code_expire = excluded.code_expire, code_essais = 0`)
    .run(userId, crypto.createHash('sha256').update(code).digest('hex'), Date.now() + 10 * 60000);
  await envoyerEmail({ to: u.email, subject: 'Lucie — votre code pour les évaluations',
    html: templateNotif({ titre: 'Votre code', corps: `<p>Votre code pour ouvrir les évaluations dans Lucie : <b style="font-size:20px;letter-spacing:3px">${code}</b></p><p>Il vaut dix minutes. Si vous ne l’avez pas demandé, ignorez ce message.</p>` }) });
  return { ok: true };
}
export function verifierDeverrou(userId, code) {
  const u = db.prepare('SELECT mfa_actif, totp_secret_chiffre, totp_dernier_pas FROM utilisateur WHERE id = ?').get(userId);
  if (!u) return { erreur: 'Compte introuvable.' };
  if (u.mfa_actif) {
    let secret; try { secret = dechiffrerMfa(u.totp_secret_chiffre); } catch { return { erreur: 'Second facteur illisible.' }; }
    const v = verifierTotp(secret, code, { dernierPas: u.totp_dernier_pas });
    if (!v.ok) return { erreur: v.raison === 'deja_utilise' ? 'Ce code a déjà servi : attendez le suivant.' : 'Code incorrect.' };
    db.prepare('UPDATE utilisateur SET totp_dernier_pas = ? WHERE id = ?').run(v.pas, userId);
    poserDeverrou(userId); return { ok: true };
  }
  const d = db.prepare('SELECT code_empreinte, code_expire, code_essais FROM eval_deverrou WHERE user_id = ?').get(userId);
  if (!d?.code_empreinte || d.code_expire < Date.now()) return { erreur: 'Demandez d’abord un code (il vaut dix minutes).' };
  if (d.code_essais >= 5) return { erreur: 'Trop d’essais : demandez un nouveau code.' };
  if (crypto.createHash('sha256').update(String(code || '').replace(/\s/g, '')).digest('hex') !== d.code_empreinte) {
    db.prepare('UPDATE eval_deverrou SET code_essais = code_essais + 1 WHERE user_id = ?').run(userId);
    return { erreur: 'Code incorrect.' };
  }
  poserDeverrou(userId); return { ok: true };
}

// ── Lire une évaluation, selon qui la demande ────────────────────────────────
const nomCompte = id => {
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(id);
  return u?.nom_complet || u?.email || `#${id}`;
};
export function roleSur(ev, user) {
  if (!ev || !user) return null;
  if (Number(ev.evalue_user_id) === Number(user.id)) return 'evalue';
  if (Number(ev.evaluateur_user_id) === Number(user.id)) return 'evaluateur';
  if (estGestionnaire(user)) return 'gestionnaire';
  return null;
}
export const ligne = id => db.prepare('SELECT * FROM eval_evaluation WHERE id = ?').get(Number(id));
const referentiel = id => {
  const r = db.prepare('SELECT * FROM eval_referentiel WHERE id = ?').get(id);
  return r ? { ...r, structure: JSON.parse(r.structure) } : null;
};
const reponse = (id, partie) => db.prepare('SELECT * FROM eval_reponse WHERE evaluation_id = ? AND partie = ?').get(id, partie);

export const ETATS = { brouillon: 'Brouillon', ouverte: 'Ouverte', attente: 'En attente', synthese: 'Synthèse disponible',
  entretien: 'Entretien réalisé', validee: 'Validée', archivee: 'Archivée' };

/** Ce que l'utilisateur doit faire maintenant sur cette évaluation (une phrase, ou null). */
function actionAttendue(ev, role) {
  const mienne = role === 'evalue' ? 'auto' : role === 'evaluateur' ? 'evaluateur' : null;
  if (['ouverte', 'attente'].includes(ev.etat) && mienne && !reponse(ev.id, mienne)?.soumise_le) return 'Remplir et soumettre ma grille';
  if (ev.etat === 'synthese' && role === 'evaluateur') return 'Mener l’entretien et en noter la date';
  if (ev.etat === 'entretien' && role === 'evaluateur' && !ev.valide_evaluateur_le) return 'Rédiger et valider le compte rendu';
  if (ev.etat === 'entretien' && role === 'evalue' && ev.valide_evaluateur_le && !ev.valide_evalue_le) return 'Lire le compte rendu, ajouter mes observations et valider';
  if (ev.etat === 'brouillon' && role === 'gestionnaire') return 'Compléter puis ouvrir';
  return null;
}

export function mesEvaluations(user) {
  const l = estGestionnaire(user)
    ? db.prepare('SELECT * FROM eval_evaluation ORDER BY cree_le DESC').all()
    : db.prepare('SELECT * FROM eval_evaluation WHERE evalue_user_id = ? OR evaluateur_user_id = ? ORDER BY cree_le DESC').all(user.id, user.id);
  return l.map(ev => {
    const role = roleSur(ev, user);
    const ref = db.prepare('SELECT titre, fonction, version FROM eval_referentiel WHERE id = ?').get(ev.referentiel_id);
    return { id: ev.id, periode: ev.periode, etat: ev.etat, etat_libelle: ETATS[ev.etat], role, remise_le: ev.remise_le,
      evalue: nomCompte(ev.evalue_user_id), evaluateur: nomCompte(ev.evaluateur_user_id), referentiel: ref?.titre,
      soumise_auto: !!reponse(ev.id, 'auto')?.soumise_le, soumise_evaluateur: !!reponse(ev.id, 'evaluateur')?.soumise_le,
      action: actionAttendue(ev, role) };
  });
}

/** L'évaluation telle que CE lecteur peut la voir. */
export function lireEvaluation(ev, user) {
  const role = roleSur(ev, user);
  const ref = referentiel(ev.referentiel_id);
  const parties = {};
  const synthese = ['synthese', 'entretien', 'validee', 'archivee'].includes(ev.etat);
  for (const p of ['auto', 'evaluateur']) {
    const r = reponse(ev.id, p);
    const mienne = (p === 'auto' && role === 'evalue') || (p === 'evaluateur' && role === 'evaluateur');
    parties[p] = { soumise_le: r?.soumise_le || null, maj_le: mienne ? r?.maj_le || null : null,
      // L'AVEUGLE : le contenu de l'autre partie ne sort qu'après la synthèse ; le gestionnaire non partie, pareil.
      contenu: (mienne || synthese) && r?.contenu && !ev.purgee_le ? dechiffrer(r.contenu, {}) : null };
  }
  const cr = db.prepare('SELECT * FROM eval_compte_rendu WHERE evaluation_id = ?').get(ev.id);
  return { id: ev.id, periode: ev.periode, etat: ev.etat, etat_libelle: ETATS[ev.etat], role, remise_le: ev.remise_le,
    evalue: { id: ev.evalue_user_id, nom: nomCompte(ev.evalue_user_id) }, evaluateur: { id: ev.evaluateur_user_id, nom: nomCompte(ev.evaluateur_user_id) },
    referentiel: ref ? { id: ref.id, titre: ref.titre, fonction: ref.fonction, version: ref.version, structure: ref.structure } : null,
    objectifs: ev.purgee_le ? [] : dechiffrer(ev.objectifs, []) || [], echelles: ECHELLES, parties,
    synthese: synthese && !ev.purgee_le ? calculerSynthese(ref?.structure, dechiffrer(ev.objectifs, []) || [], parties.auto.contenu || {}, parties.evaluateur.contenu || {}) : null,
    compte_rendu: synthese && cr && !ev.purgee_le ? { ...(dechiffrer(cr.contenu, {}) || {}), observations: dechiffrer(cr.observations, '') || '',
      desaccord: !!cr.desaccord, maj_le: cr.maj_le } : null,
    dates: { cree_le: ev.cree_le, ouverte_le: ev.ouverte_le, synthese_le: ev.synthese_le, entretien_le: ev.entretien_le,
      valide_evaluateur_le: ev.valide_evaluateur_le, valide_evalue_le: ev.valide_evalue_le, archivee_le: ev.archivee_le, purgee_le: ev.purgee_le },
    reference: ev.reference, action: actionAttendue(ev, role) };
}

// ── La synthèse des écarts ───────────────────────────────────────────────────
/** Critère par critère : les deux lectures, l'écart absolu, un classement. Jamais de moyenne. */
export function calculerSynthese(structure, objectifs, auto, evalr) {
  const lignes = [];
  const val = (c, id) => c?.[id]?.v ?? null;
  const classer = (a, b) => {
    if (a == null || b == null) return { classe: 'incomplet', ecart: null };
    if ((a === 'NO') !== (b === 'NO')) return { classe: 'clarifier', ecart: null };
    if (a === 'NO') return { classe: 'concordant', ecart: 0 };
    const e = Math.abs(Number(a) - Number(b));
    return { classe: e === 0 ? 'concordant' : e === 1 ? 'proche' : 'divergent', ecart: e };
  };
  for (const s of structure?.sections || []) {
    if (s.type === 'texte') {
      for (const ch of s.champs || []) lignes.push({ section: s.titre, id: ch.id, libelle: ch.libelle, texte: true,
        t_auto: auto?.[ch.id]?.t || '', t_eval: evalr?.[ch.id]?.t || '' });
      continue;
    }
    const criteres = s.type === 'objectifs' ? (objectifs || []).map(o => ({ id: `o:${o.id}`, libelle: o.libelle }))
      : (s.criteres || []);
    for (const c of criteres) {
      const a = val(auto, c.id), b = val(evalr, c.id);
      lignes.push({ section: s.titre, echelle: s.echelle, id: c.id, libelle: c.libelle, auto: a, eval: b, ...classer(a, b),
        t_auto: auto?.[c.id]?.t || '', t_eval: evalr?.[c.id]?.t || '',
        ...(s.type === 'objectifs' ? { ind_auto: auto?.[c.id]?.ind || '', ind_eval: evalr?.[c.id]?.ind || '' } : {}),
        ...(s.type === 'techniques' ? { formation_auto: auto?.[c.id]?.f ?? null, formation_eval: evalr?.[c.id]?.f ?? null } : {}) });
    }
    if (s.libres) {
      for (const [qui, c] of [['auto', auto], ['eval', evalr]]) {
        for (const l of c?.[`libres:${s.id}`] || []) {
          lignes.push({ section: s.titre, echelle: s.echelle, id: `libre:${qui}:${l.id}`, libelle: l.libelle, libre: qui,
            auto: qui === 'auto' ? l.v ?? null : null, eval: qui === 'eval' ? l.v ?? null : null, classe: 'une_lecture', ecart: null,
            t_auto: qui === 'auto' ? l.t || '' : '', t_eval: qui === 'eval' ? l.t || '' : '' });
        }
      }
    }
  }
  const compte = k => lignes.filter(l => l.classe === k).length;
  return { lignes, comptes: { concordant: compte('concordant'), proche: compte('proche'), divergent: compte('divergent'),
    clarifier: compte('clarifier'), incomplet: compte('incomplet') },
    priorite: lignes.filter(l => l.classe === 'divergent' || l.classe === 'clarifier')
      .sort((x, y) => (y.ecart ?? 9) - (x.ecart ?? 9)).map(l => l.id) };
}

// ── Les gestes ───────────────────────────────────────────────────────────────
const erreur = (statut, message) => Object.assign(new Error(message), { statut });
function notifier(userId, titre, corps, par) {
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par) VALUES ('evaluation', ?, ?, '/evaluations', ?, ?)`)
      .run(titre, corps, userId, par || null);
  } catch { /* */ }
}

export function creer({ evalue_user_id, evaluateur_user_id, referentiel_id, periode, remise_le, objectifs }, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  const evalue = db.prepare('SELECT id FROM utilisateur WHERE id = ? AND COALESCE(actif,1) = 1').get(Number(evalue_user_id));
  const evaluateur = db.prepare('SELECT id FROM utilisateur WHERE id = ? AND COALESCE(actif,1) = 1').get(Number(evaluateur_user_id || user.id));
  if (!evalue || !evaluateur) throw erreur(400, 'L’évalué et l’évaluateur doivent avoir un compte Lucie actif.');
  if (evalue.id === evaluateur.id) throw erreur(400, 'On ne s’évalue pas soi-même comme évaluateur.');
  const ref = db.prepare('SELECT id FROM eval_referentiel WHERE id = ?').get(Number(referentiel_id));
  if (!ref) throw erreur(400, 'Choisissez un référentiel.');
  if (!String(periode || '').trim()) throw erreur(400, 'Indiquez la période (par exemple « 2026 »).');
  const r = db.prepare(`INSERT INTO eval_evaluation (evalue_user_id, evaluateur_user_id, referentiel_id, periode, remise_le, objectifs, cree_par)
    VALUES (?,?,?,?,?,?,?)`).run(evalue.id, evaluateur.id, ref.id, String(periode).trim().slice(0, 40), remise_le || null,
    chiffrer(nettoyerObjectifs(objectifs)), user.nom || null);
  return { id: r.lastInsertRowid };
}
const nettoyerObjectifs = l => (Array.isArray(l) ? l : []).map((o, i) => ({ id: String(o.id || `ob${i + 1}`).slice(0, 20),
  libelle: String(o.libelle || '').slice(0, 500) })).filter(o => o.libelle.trim()).slice(0, 20);

export function modifierBrouillon(ev, b, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  if (ev.etat !== 'brouillon') throw erreur(409, 'Seul un brouillon se modifie.');
  const evaluateur = b.evaluateur_user_id ? db.prepare('SELECT id FROM utilisateur WHERE id = ? AND COALESCE(actif,1) = 1').get(Number(b.evaluateur_user_id)) : null;
  if (evaluateur && evaluateur.id === ev.evalue_user_id) throw erreur(400, 'L’évaluateur ne peut pas être l’évalué.');
  db.prepare(`UPDATE eval_evaluation SET evaluateur_user_id = COALESCE(?, evaluateur_user_id), periode = COALESCE(?, periode),
    remise_le = ?, objectifs = ?, referentiel_id = COALESCE(?, referentiel_id) WHERE id = ?`)
    .run(evaluateur?.id || null, b.periode ? String(b.periode).slice(0, 40) : null, b.remise_le || null,
      chiffrer(nettoyerObjectifs(b.objectifs)), b.referentiel_id ? Number(b.referentiel_id) : null, ev.id);
}

export function ouvrir(ev, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  if (ev.etat !== 'brouillon') throw erreur(409, 'Déjà ouverte.');
  db.prepare("UPDATE eval_evaluation SET etat = 'ouverte', ouverte_le = datetime('now') WHERE id = ?").run(ev.id);
  for (const uid of [ev.evalue_user_id, ev.evaluateur_user_id]) {
    notifier(uid, `Évaluation ${ev.periode} ouverte`, 'Votre grille est à remplir dans Personnel → Évaluations (ou votre espace).', user.nom);
  }
}

const partieDe = role => role === 'evalue' ? 'auto' : role === 'evaluateur' ? 'evaluateur' : null;

export function enregistrerGrille(ev, user, contenu) {
  const partie = partieDe(roleSur(ev, user));
  if (!partie) throw erreur(403, 'Seuls l’évalué et l’évaluateur remplissent une grille.');
  if (!['ouverte', 'attente'].includes(ev.etat)) throw erreur(409, 'La grille ne se remplit que lorsque l’évaluation est ouverte.');
  const r = reponse(ev.id, partie);
  if (r?.soumise_le) throw erreur(409, 'Votre grille est soumise : elle ne se modifie plus.');
  const propre = JSON.parse(JSON.stringify(contenu || {}));
  if (JSON.stringify(propre).length > 200000) throw erreur(413, 'Grille trop longue.');
  db.prepare(`INSERT INTO eval_reponse (evaluation_id, partie, contenu, maj_le) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(evaluation_id, partie) DO UPDATE SET contenu = excluded.contenu, maj_le = excluded.maj_le`).run(ev.id, partie, chiffrer(propre));
}

export function soumettre(ev, user) {
  const role = roleSur(ev, user);
  const partie = partieDe(role);
  if (!partie) throw erreur(403, 'Seuls l’évalué et l’évaluateur soumettent une grille.');
  if (!['ouverte', 'attente'].includes(ev.etat)) throw erreur(409, 'L’évaluation n’est pas ouverte.');
  const r = reponse(ev.id, partie);
  if (!r?.contenu) throw erreur(409, 'Votre grille est vide.');
  if (r.soumise_le) throw erreur(409, 'Déjà soumise.');
  db.prepare("UPDATE eval_reponse SET soumise_le = datetime('now') WHERE id = ?").run(r.id);
  const autre = reponse(ev.id, partie === 'auto' ? 'evaluateur' : 'auto');
  const autreId = role === 'evalue' ? ev.evaluateur_user_id : ev.evalue_user_id;
  if (autre?.soumise_le) {
    db.prepare("UPDATE eval_evaluation SET etat = 'synthese', synthese_le = datetime('now') WHERE id = ?").run(ev.id);
    notifier(autreId, `Évaluation ${ev.periode} : la synthèse est disponible`, 'Les deux grilles sont soumises : la synthèse des écarts se lit dans Personnel → Évaluations.', user.nom);
    return 'synthese';
  }
  db.prepare("UPDATE eval_evaluation SET etat = 'attente' WHERE id = ?").run(ev.id);
  notifier(autreId, `Évaluation ${ev.periode} : une grille est soumise`, 'L’autre partie a soumis sa grille. Vous pouvez soumettre la vôtre ; vous ne voyez pas la sienne avant.', user.nom);
  return 'attente';
}

export function reouvrirGrille(ev, user, partie, motif) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  if (!['auto', 'evaluateur'].includes(partie)) throw erreur(400, 'Quelle grille ?');
  if (String(motif || '').trim().length < 5) throw erreur(400, 'Un motif écrit est obligatoire.');
  if (!['attente', 'synthese'].includes(ev.etat)) throw erreur(409, 'Une grille ne se rouvre qu’avant l’entretien.');
  db.prepare('UPDATE eval_reponse SET soumise_le = NULL WHERE evaluation_id = ? AND partie = ?').run(ev.id, partie);
  db.prepare("UPDATE eval_evaluation SET etat = 'ouverte', synthese_le = NULL WHERE id = ?").run(ev.id);
  // Repasser en « attente » si l'autre grille reste soumise.
  if (reponse(ev.id, partie === 'auto' ? 'evaluateur' : 'auto')?.soumise_le) db.prepare("UPDATE eval_evaluation SET etat = 'attente' WHERE id = ?").run(ev.id);
}

export function poserEntretien(ev, user, date) {
  if (roleSur(ev, user) !== 'evaluateur') throw erreur(403, 'L’évaluateur note la date de l’entretien.');
  if (!['synthese', 'entretien'].includes(ev.etat) || ev.valide_evaluateur_le) throw erreur(409, 'L’entretien suit la synthèse et précède la validation.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw erreur(400, 'Date attendue.');
  db.prepare("UPDATE eval_evaluation SET etat = 'entretien', entretien_le = ? WHERE id = ?").run(date, ev.id);
}

export function enregistrerCompteRendu(ev, user, b) {
  const role = roleSur(ev, user);
  if (ev.etat !== 'entretien') throw erreur(409, 'Le compte rendu se rédige après l’entretien.');
  const cr = db.prepare('SELECT * FROM eval_compte_rendu WHERE evaluation_id = ?').get(ev.id);
  if (role === 'evaluateur') {
    if (ev.valide_evaluateur_le) throw erreur(409, 'Vous avez validé : le compte rendu est figé.');
    const contenu = { points_forts: String(b.points_forts || '').slice(0, 20000), points_developpement: String(b.points_developpement || '').slice(0, 20000),
      plan: (Array.isArray(b.plan) ? b.plan : []).slice(0, 5).map(a => ({ axe: String(a.axe || '').slice(0, 2000), moyens: String(a.moyens || '').slice(0, 2000), echeance: String(a.echeance || '').slice(0, 40) })) };
    db.prepare(`INSERT INTO eval_compte_rendu (evaluation_id, contenu, maj_le) VALUES (?,?,datetime('now'))
      ON CONFLICT(evaluation_id) DO UPDATE SET contenu = excluded.contenu, maj_le = excluded.maj_le`).run(ev.id, chiffrer(contenu));
    return;
  }
  if (role === 'evalue') {
    if (!ev.valide_evaluateur_le) throw erreur(409, 'Vos observations s’ajoutent une fois le compte rendu validé par l’évaluateur.');
    if (ev.valide_evalue_le) throw erreur(409, 'Vous avez validé : vos observations sont figées.');
    if (!cr) throw erreur(409, 'Pas de compte rendu.');
    db.prepare("UPDATE eval_compte_rendu SET observations = ?, desaccord = ?, maj_le = datetime('now') WHERE evaluation_id = ?")
      .run(chiffrer(String(b.observations || '').slice(0, 20000)), b.desaccord ? 1 : 0, ev.id);
    return;
  }
  throw erreur(403, 'Seuls l’évaluateur et l’évalué écrivent le compte rendu.');
}

export function valider(ev, user) {
  const role = roleSur(ev, user);
  if (ev.etat !== 'entretien') throw erreur(409, 'La validation suit l’entretien.');
  if (role === 'evaluateur') {
    if (ev.valide_evaluateur_le) throw erreur(409, 'Déjà validé.');
    const cr = db.prepare('SELECT contenu FROM eval_compte_rendu WHERE evaluation_id = ?').get(ev.id);
    const c = dechiffrer(cr?.contenu, {}) || {};
    if (!String(c.points_forts || '').trim() || !String(c.points_developpement || '').trim() || !(c.plan || []).some(a => String(a.axe || '').trim())) {
      throw erreur(409, 'Le compte rendu porte des points forts, des points de développement et au moins un axe du plan.');
    }
    db.prepare("UPDATE eval_evaluation SET valide_evaluateur_le = datetime('now') WHERE id = ?").run(ev.id);
    notifier(ev.evalue_user_id, `Évaluation ${ev.periode} : le compte rendu est prêt`, 'Lisez-le, ajoutez vos observations (un désaccord aussi) et validez.', user.nom);
    return;
  }
  if (role === 'evalue') {
    if (!ev.valide_evaluateur_le) throw erreur(409, 'L’évaluateur valide d’abord.');
    if (ev.valide_evalue_le) throw erreur(409, 'Déjà validé.');
    const reference = `EVAL-${String(ev.periode).replace(/[^0-9A-Za-z]/g, '')}-${String(ev.id).padStart(4, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const cr = db.prepare('SELECT contenu, observations FROM eval_compte_rendu WHERE evaluation_id = ?').get(ev.id);
    const empreinte = crypto.createHash('sha256').update(`${cr?.contenu || ''}|${cr?.observations || ''}`).digest('hex');
    db.prepare("UPDATE eval_evaluation SET valide_evalue_le = datetime('now'), etat = 'validee', reference = ?, empreinte = ? WHERE id = ?")
      .run(reference, empreinte, ev.id);
    notifier(ev.evaluateur_user_id, `Évaluation ${ev.periode} validée`, 'Les deux parties ont validé le compte rendu.', user.nom);
    return;
  }
  throw erreur(403, 'Seuls l’évaluateur et l’évalué valident.');
}

export function archiver(ev, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  if (ev.etat !== 'validee') throw erreur(409, 'Seule une évaluation validée s’archive.');
  db.prepare("UPDATE eval_evaluation SET etat = 'archivee', archivee_le = datetime('now') WHERE id = ?").run(ev.id);
}

export function supprimerBrouillon(ev, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  if (ev.etat !== 'brouillon') throw erreur(409, 'Seul un brouillon se supprime.');
  db.prepare('DELETE FROM eval_evaluation WHERE id = ?').run(ev.id);
}

// ── Les référentiels ─────────────────────────────────────────────────────────
export function referentiels() {
  return db.prepare('SELECT id, fonction, version, titre, en_vigueur_le, cree_par, structure FROM eval_referentiel ORDER BY fonction, version DESC').all()
    .map(r => ({ ...r, structure: JSON.parse(r.structure),
      utilise: db.prepare('SELECT COUNT(*) n FROM eval_evaluation WHERE referentiel_id = ?').get(r.id).n }));
}
/** Une nouvelle VERSION (jamais une réécriture : une évaluation garde la version de sa création). */
export function publierReferentiel({ fonction, titre, structure }, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  const f = String(fonction || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
  if (!f) throw erreur(400, 'La fonction est attendue.');
  const sections = Array.isArray(structure?.sections) ? structure.sections : [];
  if (!sections.length) throw erreur(400, 'Au moins une section.');
  const TYPES = ['texte', 'missions', 'objectifs', 'comportements', 'techniques'];
  const ECH = { missions: 'niveau', objectifs: 'niveau', comportements: 'frequence', techniques: 'maitrise' };
  const propre = { sections: sections.map((s, i) => {
    const type = TYPES.includes(s.type) ? s.type : 'texte';
    const id = String(s.id || `s${i + 1}`).replace(/[^a-z0-9_]/gi, '').slice(0, 30) || `s${i + 1}`;
    const items = l => (Array.isArray(l) ? l : []).map((c, j) => ({ id: String(c.id || `${id}_${j + 1}`).replace(/[^a-z0-9_]/gi, '').slice(0, 40) || `${id}_${j + 1}`,
      libelle: String(c.libelle || '').slice(0, 1000) })).filter(c => c.libelle.trim());
    return { id, titre: String(s.titre || '').slice(0, 200), type, ...(type === 'texte' ? { champs: items(s.champs) } : {}),
      ...(['missions', 'comportements', 'techniques'].includes(type) ? { criteres: items(s.criteres) } : {}),
      ...(ECH[type] ? { echelle: ECH[type] } : {}), ...(type === 'missions' && s.libres ? { libres: true } : {}) };
  }) };
  const v = (db.prepare('SELECT MAX(version) v FROM eval_referentiel WHERE fonction = ?').get(f)?.v || 0) + 1;
  const r = db.prepare('INSERT INTO eval_referentiel (fonction, version, titre, structure, cree_par) VALUES (?,?,?,?,?)')
    .run(f, v, String(titre || f).slice(0, 200), JSON.stringify(propre), user.nom || null);
  return { id: r.lastInsertRowid, version: v };
}

// ── La conservation ──────────────────────────────────────────────────────────
/* La durée se règle par la direction (`lucie_config` « eval_conservation_ans » ; vide = pas d'effacement, tant qu'elle n'est pas
   décidée). À l'échéance, le CONTENU d'une évaluation archivée est effacé ; restent la ligne, ses dates, sa référence et le journal. */
export function conservationAns() {
  const v = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'eval_conservation_ans'").get()?.valeur;
  return v ? Number(v) || null : null;
}
export function poserConservation(ans, user) {
  if (!estGestionnaire(user)) throw erreur(403, 'Réservé à la direction.');
  const n = ans === null || ans === '' ? null : Math.max(1, Math.min(50, Number(ans) || 0));
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('eval_conservation_ans', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(n == null ? '' : String(n));
}
export function purgerEchues() {
  const n = conservationAns(); if (!n) return 0;
  const echues = db.prepare(`SELECT id FROM eval_evaluation WHERE etat = 'archivee' AND purgee_le IS NULL AND archivee_le <= datetime('now', ?)`).all(`-${n} years`);
  for (const { id } of echues) {
    db.prepare('DELETE FROM eval_reponse WHERE evaluation_id = ?').run(id);
    db.prepare('DELETE FROM eval_compte_rendu WHERE evaluation_id = ?').run(id);
    db.prepare("UPDATE eval_evaluation SET objectifs = NULL, purgee_le = datetime('now') WHERE id = ?").run(id);
    journaliser({ user: { nom: 'Lucie (conservation)' } }, id, 'purge', `${n} an(s) après l’archivage`);
  }
  return echues.length;
}

export function journalDe(evId) {
  return db.prepare('SELECT nom, action, detail, ip, le FROM eval_journal WHERE evaluation_id = ? ORDER BY id DESC LIMIT 500').all(Number(evId));
}
