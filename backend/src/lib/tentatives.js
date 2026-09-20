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

/** Cinq essais, puis la porte se ferme — de plus en plus longtemps. */
export const ESSAIS_AVANT_BLOCAGE = 5;
export const PALIERS_MINUTES = [15, 60, 24 * 60];

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
