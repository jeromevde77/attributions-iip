// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Les tentatives de connexion, et ce qui arrive quand elles s'enchaînent
//
// `/login` n'opposait AUCUN plafond : on pouvait présenter des mots de passe
// jusqu'à en trouver un. Le second facteur, lui, en avait un — si bien que la
// porte la mieux gardée était la seconde, et la première grande ouverte.
//
// LE BLOCAGE S'AGGRAVE, PARCE QU'UN PLAFOND FIXE NE COÛTE RIEN. Quinze minutes
// répétées à l'infini, c'est quatre-vingt-seize fenêtres d'essai par jour :
// une machine patiente s'en accommode très bien. En doublant puis en portant à
// la journée, la troisième série coûte plus que ce que l'attaque rapporte,
// tandis que la personne qui se trompe deux fois de suite ne subit jamais que
// le premier palier.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { getParam } from '../routes/parametres.js';

/*
 * LE RÉGLAGE VIT À L'ÉCRAN, PAS DANS LE CODE.
 *
 * Ces trois valeurs étaient écrites ici : les changer demandait un commit, une
 * construction et un déploiement, et personne d'autre que le développeur ne
 * pouvait en discuter. C'est exactement ce que le catalogue des réglages codés
 * en dur reproche : invisible, donc indiscutable.
 *
 * LE DÉFAUT RESTE LE BLOCAGE. Un réglage absent de la base, une table illisible,
 * une valeur effacée par mégarde : dans tous ces cas la porte se ferme quand
 * même. Un garde-fou dont la panne ouvre la porte n'est pas un garde-fou.
 */
export const ESSAIS_DEFAUT = 5;
export const PALIERS_DEFAUT = [15, 60, 24 * 60];

/** Le plafond est-il en service ? Actif par défaut, et à la moindre incertitude. */
export function blocageActif() {
  return getParam('securite.blocage_actif', '1') !== '0';
}

export function essaisAvantBlocage() {
  const n = parseInt(getParam('securite.blocage_essais', String(ESSAIS_DEFAUT)), 10);
  // Zéro ou un nombre négatif fermerait la porte au premier essai, y compris
  // au titulaire : une valeur absurde retombe sur le défaut plutôt que de
  // produire une panne qu'on mettrait des heures à comprendre.
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : ESSAIS_DEFAUT;
}

/** « 15,60,1440 » → [15, 60, 1440]. Les valeurs illisibles sont ignorées. */
export function paliersMinutes() {
  const brut = String(getParam('securite.blocage_paliers', PALIERS_DEFAUT.join(',')));
  const liste = brut.split(',').map(x => parseInt(String(x).trim(), 10))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= 60 * 24 * 30);
  return liste.length ? liste : PALIERS_DEFAUT;
}

// Conservés pour ce qui les lit encore ; la vérité est dans les fonctions.
export const ESSAIS_AVANT_BLOCAGE = ESSAIS_DEFAUT;
export const PALIERS_MINUTES = PALIERS_DEFAUT;

/**
 * Au bout de vingt-quatre heures sans un seul échec, on repart de zéro.
 *
 * Sans cet oubli, le palier ne redescendrait jamais : quelqu'un qui s'est
 * trompé cinq fois en janvier se verrait bloqué une journée entière pour cinq
 * fautes de frappe en juin. Le compteur mesure un ACHARNEMENT, c'est-à-dire
 * quelque chose de resserré dans le temps.
 */
const OUBLI_HEURES = 24;

export function migrerTentatives(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS connexion_blocage (
      utilisateur_id INTEGER PRIMARY KEY,
      echecs         INTEGER NOT NULL DEFAULT 0,
      palier         INTEGER NOT NULL DEFAULT 0,   -- 0 = jamais bloqué encore
      dernier_echec  TEXT,
      bloque_jusqu   TEXT
    );`);
    // LES TROIS RÉGLAGES, AMORCÉS À LEUR DÉFAUT. `INSERT OR IGNORE` : une
    // valeur déjà posée par la direction ne se fait pas écraser au
    // redémarrage — sinon le réglage tiendrait jusqu'au prochain déploiement.
    const p = dbx.prepare(
      'INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?,?,?,?)');
    p.run('securite.blocage_actif', '1',
      'Bloquer un compte après des mots de passe erronés (0 = jamais)', 'securite');
    p.run('securite.blocage_essais', String(ESSAIS_DEFAUT),
      'Nombre de mots de passe erronés avant blocage', 'securite');
    p.run('securite.blocage_paliers', PALIERS_DEFAUT.join(','),
      'Durées de blocage successives, en minutes (15,60,1440)', 'securite');
    // Rangé ici faute d'une migration « système » : la table `parametre` est
    // commune, et ajouter un fichier pour trois lignes en ferait un de plus à
    // chercher le jour où l'on se demande où vivent les réglages.
    p.run('retention.snapshot_mois', '18',
      'Historique des attributions : mois avant allègement du détail (0 = jamais)', 'systeme');
    console.log('[migration] connexion_blocage : plafond des tentatives de connexion');
  } catch (e) { console.error('[migration] connexion_blocage :', e.message); }
}

function ligne(utilisateurId) {
  return db.prepare('SELECT * FROM connexion_blocage WHERE utilisateur_id = ?').get(utilisateurId);
}

/**
 * Ce compte est-il bloqué en ce moment ?
 * @returns {{ bloque: boolean, minutes: number }} — minutes restantes, arrondies au-dessus.
 */
export function etatBlocage(utilisateurId) {
  // HORS SERVICE : on ne consulte même pas la table. Un blocage posé AVANT que
  // la direction ne désactive le plafond retiendrait sinon quelqu'un dehors
  // pendant vingt-quatre heures, alors que le réglage vient d'être levé —
  // c'est précisément pour cela qu'on le lève.
  if (!blocageActif()) return { bloque: false, minutes: 0 };
  const l = ligne(utilisateurId);
  if (!l?.bloque_jusqu) return { bloque: false, minutes: 0 };
  const reste = db.prepare(
    `SELECT CAST((julianday(?) - julianday('now')) * 24 * 60 AS REAL) AS m`).get(l.bloque_jusqu).m;
  if (!(reste > 0)) return { bloque: false, minutes: 0 };
  return { bloque: true, minutes: Math.max(1, Math.ceil(reste)) };
}

/**
 * Un échec de plus. Rend l'état APRÈS coup, pour que l'appelant dise la vérité
 * du moment plutôt que celle d'avant.
 */
export function noterEchec(utilisateurId) {
  if (!blocageActif()) return { bloque: false, minutes: 0, restants: null };
  const ESSAIS_AVANT_BLOCAGE = essaisAvantBlocage();
  const PALIERS_MINUTES = paliersMinutes();
  const l = ligne(utilisateurId);

  // Loin du dernier échec : la série précédente ne compte plus, ni son palier.
  const ancienne = l?.dernier_echec && db.prepare(
    `SELECT datetime(?) < datetime('now', ?) AS vieux`).get(l.dernier_echec, `-${OUBLI_HEURES} hours`).vieux;

  const echecs = (ancienne || !l) ? 1 : (l.echecs || 0) + 1;
  const palierPrecedent = (ancienne || !l) ? 0 : (l.palier || 0);

  if (echecs < ESSAIS_AVANT_BLOCAGE) {
    db.prepare(`INSERT INTO connexion_blocage (utilisateur_id, echecs, palier, dernier_echec, bloque_jusqu)
                VALUES (?, ?, ?, datetime('now'), NULL)
                ON CONFLICT(utilisateur_id) DO UPDATE SET
                  echecs = excluded.echecs, palier = excluded.palier,
                  dernier_echec = excluded.dernier_echec, bloque_jusqu = NULL`)
      .run(utilisateurId, echecs, palierPrecedent);
    return { bloque: false, minutes: 0, restants: ESSAIS_AVANT_BLOCAGE - echecs };
  }

  // Le plafond est atteint : on ferme, un cran plus longtemps que la fois
  // précédente, et le compteur d'essais repart — c'est le PALIER qui retient
  // ce qui s'est passé.
  const palier = Math.min(palierPrecedent + 1, PALIERS_MINUTES.length);
  const minutes = PALIERS_MINUTES[palier - 1];
  db.prepare(`INSERT INTO connexion_blocage (utilisateur_id, echecs, palier, dernier_echec, bloque_jusqu)
              VALUES (?, 0, ?, datetime('now'), datetime('now', ?))
              ON CONFLICT(utilisateur_id) DO UPDATE SET
                echecs = 0, palier = excluded.palier,
                dernier_echec = excluded.dernier_echec, bloque_jusqu = excluded.bloque_jusqu`)
    .run(utilisateurId, palier, `+${minutes} minutes`);
  return { bloque: true, minutes, restants: 0, palier };
}

/**
 * Connexion réussie : tout s'efface, compteur ET palier.
 *
 * C'est le titulaire qui vient d'entrer — il connaît son mot de passe, et
 * lui faire porter les essais d'un autre reviendrait à le punir d'avoir été
 * visé. Le palier ne protège rien une fois la preuve faite.
 */
export function oublierEchecs(utilisateurId) {
  try { db.prepare('DELETE FROM connexion_blocage WHERE utilisateur_id = ?').run(utilisateurId); }
  catch { /* le blocage n'est pas la condition de la connexion */ }
}

/** Formule le délai en clair : « 15 minutes », « 1 heure », « 24 heures ». */
export function direDelai(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  const h = Math.round(minutes / 60);
  return `${h} heure${h > 1 ? 's' : ''}`;
}
