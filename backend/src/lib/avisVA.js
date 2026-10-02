/**
 * L'AVIS DES CHARGÉS DE COURS SUR UNE VALORISATION — dans LEUR espace.
 *
 * Charles, 2 octobre 2026 : « il faut que la demande soit visible pour lui dans
 * son espace, qu'il puisse consulter les documents et rendre un avis motivé
 * (obligatoire) ». Décisions prises le même jour :
 *   — QUI : les chargés de cours ATTRIBUÉS aux cours visés par la demande
 *     (toute l'UE quand la demande ne vise pas de cours) ;
 *   — COMBIEN : au moins un avis, mais TOUS peuvent en rendre — un par
 *     personne, chacun le sien ;
 *   — QUOI : les pièces déposées dans le cadre de la VA ;
 *   — PRÉVENU : par courriel, quand le dossier est déclaré recevable.
 *
 * LE DOSSIER GARDE UN AVIS, LE CIRCUIT N'EN CONNAÎT QU'UN. `avis_sens`,
 * `avis_texte`, `avis_par`, `avis_le` sur `etudiant_valorisation` restent ce
 * que lisent le circuit, la séance du conseil et les pièces. Ils se RECALCULENT
 * à partir des avis rendus : le sens le plus prudent l'emporte (défavorable,
 * puis partiel, puis favorable) — une réserve d'un seul chargé de cours ne se
 * dilue pas dans l'accord des autres —, et les textes se suivent, chacun signé.
 */
import db from '../db/index.js';
import { envoyerEmail, mailerConfigure, templateNotif } from '../services/mailer.js';
import { journaliser, rafraichirEtat } from './valorisation.js';

db.exec(`CREATE TABLE IF NOT EXISTS valorisation_avis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  valorisation_id INTEGER NOT NULL,
  professeur_id INTEGER,
  auteur TEXT,
  sens TEXT NOT NULL CHECK (sens IN ('favorable','partiel','defavorable')),
  texte TEXT NOT NULL,
  saisi_par TEXT,
  rendu_le TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_valorisation_avis_prof
  ON valorisation_avis(valorisation_id, professeur_id) WHERE professeur_id IS NOT NULL`);
db.exec(`CREATE TABLE IF NOT EXISTS valorisation_avis_appel (
  valorisation_id INTEGER NOT NULL,
  professeur_id INTEGER NOT NULL,
  appele_le TEXT NOT NULL DEFAULT (datetime('now')),
  mail_le TEXT,
  PRIMARY KEY (valorisation_id, professeur_id)
)`);

/* LE COURRIEL AUX CHARGÉS DE COURS EST ÉTEINT PAR DÉFAUT (Charles, 2 octobre
   2026 : « pas activé tant que tout le monde n'est pas formé et n'a pas son
   accès »). L'appel se fait quand même — la demande paraît dans Mes cours — ;
   seul le courriel attend. Il s'allume dans Configuration → Procédures
   (« 1 »). Un appel fait pendant que le courriel était éteint n'est pas
   renvoyé à l'allumage : on ne déverse pas d'un coup l'arriéré. */
try {
  db.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe)
    VALUES ('va_avis_courriel', '0', 'Valorisation — prévenir par courriel les chargés de cours appelés à rendre un avis (1 = oui, 0 = non)', 'procedures')`).run();
} catch { /* table absente sur une base très ancienne */ }
const courrielAllume = () => {
  try { return String(db.prepare("SELECT valeur FROM parametre WHERE cle = 'va_avis_courriel'").get()?.valeur || '0').trim() === '1'; }
  catch { return false; }
};

const RANG_SENS = { defavorable: 3, partiel: 2, favorable: 1 };
export const LIB_SENS = { favorable: 'favorable', partiel: 'partiel', defavorable: 'défavorable' };

/** Les chargés de cours que la demande regarde : attribués aux cours visés. */
export function chargesVises(v) {
  if (!v || !v.ue_num) return [];
  let an = v.annee_scolaire;
  const n = db.prepare(`SELECT COUNT(*) n FROM attribution WHERE ue_num = ? AND annee_scolaire = ?
      AND professeur_id IS NOT NULL`).get(v.ue_num, an).n;
  if (!n) an = db.prepare(`SELECT MAX(annee_scolaire) a FROM attribution WHERE ue_num = ?
      AND annee_scolaire <= ? AND professeur_id IS NOT NULL`).get(v.ue_num, v.annee_scolaire)?.a || an;
  const vises = v.cible === 'cours'
    ? new Set(String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean)) : new Set();
  const lignes = db.prepare(`SELECT a.professeur_id pid, a.code_cours, p.nom, p.prenom, p.adresse_mail
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
     WHERE a.ue_num = ? AND a.annee_scolaire = ?`).all(v.ue_num, an);
  const garder = vises.size && lignes.some(l => vises.has(l.code_cours))
    ? lignes.filter(l => vises.has(l.code_cours)) : lignes;
  const m = new Map();
  for (const l of garder) {
    if (!m.has(l.pid)) m.set(l.pid, { professeur_id: l.pid, nom: `${(l.nom || '').toUpperCase()} ${l.prenom || ''}`.trim(),
      email: l.adresse_mail || null, cours: new Set() });
    if (l.code_cours) m.get(l.pid).cours.add(l.code_cours);
  }
  return [...m.values()].map(x => ({ ...x, cours: [...x.cours].sort() }));
}

/** Le chargé de cours peut-il voir ce dossier ? Appelé, ou attribué aux cours visés. */
export function profConcerne(v, pid) {
  if (!v || !pid) return false;
  if (db.prepare('SELECT 1 FROM valorisation_avis_appel WHERE valorisation_id = ? AND professeur_id = ?').get(v.id, pid)) return true;
  return chargesVises(v).some(c => c.professeur_id === pid);
}

/** Recalcule l'avis du dossier depuis les avis rendus. Sans avis rendu ici, n'y touche pas. */
export function recalculerAvis(vid) {
  const avis = db.prepare('SELECT * FROM valorisation_avis WHERE valorisation_id = ? ORDER BY rendu_le, id').all(vid);
  if (!avis.length) return;
  const sens = avis.reduce((s, a) => (RANG_SENS[a.sens] > RANG_SENS[s] ? a.sens : s), avis[0].sens);
  const texte = avis.length === 1 ? avis[0].texte
    : avis.map(a => `${a.auteur || '—'} (${LIB_SENS[a.sens]}) : ${a.texte}`).join('\n');
  const par = [...new Set(avis.map(a => a.auteur).filter(Boolean))].join(', ');
  const le = avis.map(a => a.rendu_le).sort().pop();
  db.prepare(`UPDATE etudiant_valorisation SET avis_sens = ?, avis_texte = ?, avis_par = ?, avis_le = ? WHERE id = ?`)
    .run(sens, texte, par || null, le, vid);
  rafraichirEtat(vid);
}

/**
 * L'avis saisi par la coordination AVANT qu'un chargé de cours n'en rende un
 * ici ne disparaît pas : il entre dans la liste comme un avis parmi d'autres,
 * au nom de qui l'a rendu.
 */
function reprendreAvisExistant(v) {
  const deja = db.prepare('SELECT COUNT(*) n FROM valorisation_avis WHERE valorisation_id = ?').get(v.id).n;
  if (deja || !v.avis_le || !v.avis_sens || !v.avis_texte) return;
  db.prepare(`INSERT INTO valorisation_avis (valorisation_id, professeur_id, auteur, sens, texte, saisi_par, rendu_le)
    VALUES (?, NULL, ?, ?, ?, 'coordination', ?)`).run(v.id, v.avis_par || null, v.avis_sens, v.avis_texte, v.avis_le);
}

/** Un chargé de cours rend (ou corrige) SON avis. CELUI QUI CLIQUE EST CELUI QUI SIGNE. */
export function rendreAvis(req, v, pid, sens, texte) {
  const prof = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(pid);
  const auteur = prof ? `${(prof.nom || '').toUpperCase()} ${prof.prenom || ''}`.trim() : (req.user?.nom || null);
  reprendreAvisExistant(v);
  const ex = db.prepare('SELECT id FROM valorisation_avis WHERE valorisation_id = ? AND professeur_id = ?').get(v.id, pid);
  if (ex) {
    db.prepare(`UPDATE valorisation_avis SET sens = ?, texte = ?, auteur = ?, saisi_par = ?, rendu_le = datetime('now') WHERE id = ?`)
      .run(sens, texte, auteur, req.user?.nom || req.user?.email || null, ex.id);
  } else {
    db.prepare(`INSERT INTO valorisation_avis (valorisation_id, professeur_id, auteur, sens, texte, saisi_par)
      VALUES (?, ?, ?, ?, ?, ?)`).run(v.id, pid, auteur, sens, texte, req.user?.nom || req.user?.email || null);
  }
  journaliser(v.id, 'avis', req, `${auteur} — ${sens} — ${texte.slice(0, 180)}`);
  recalculerAvis(v.id);
}

/** La coordination saisit un avis au nom de quelqu'un, quand des avis existent déjà ici. */
export function avisCoordination(v, auteur, sens, texte, saisiPar) {
  const n = db.prepare('SELECT COUNT(*) n FROM valorisation_avis WHERE valorisation_id = ?').get(v.id).n;
  if (!n) return false;
  const ex = db.prepare(`SELECT id FROM valorisation_avis WHERE valorisation_id = ? AND professeur_id IS NULL
      AND COALESCE(auteur, '') = COALESCE(?, '')`).get(v.id, auteur || null);
  if (ex) db.prepare(`UPDATE valorisation_avis SET sens = ?, texte = ?, saisi_par = ?, rendu_le = datetime('now') WHERE id = ?`)
    .run(sens, texte, saisiPar, ex.id);
  else db.prepare(`INSERT INTO valorisation_avis (valorisation_id, professeur_id, auteur, sens, texte, saisi_par)
      VALUES (?, NULL, ?, ?, ?, ?)`).run(v.id, auteur || null, sens, texte, saisiPar);
  recalculerAvis(v.id);
  return true;
}

/**
 * LE DOSSIER EST RECEVABLE : on appelle les chargés de cours, et on les
 * prévient. Un appel ne se répète pas — un second « recevable » ne renvoie pas
 * le courriel à ceux qui l'ont déjà reçu.
 */
export async function appelerCharges(vid) {
  const v = db.prepare(`SELECT v.*, e.nom AS e_nom, e.prenom AS e_prenom,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = v.ue_num AND u.ue_nom IS NOT NULL ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
      FROM etudiant_valorisation v JOIN etudiant e ON e.id = v.etudiant_id WHERE v.id = ?`).get(vid);
  if (!v || v.recevable !== 1 || !v.ue_num) return { appeles: 0, mails: 0 };
  let appeles = 0, mails = 0;
  for (const c of chargesVises(v)) {
    const r = db.prepare('INSERT OR IGNORE INTO valorisation_avis_appel (valorisation_id, professeur_id) VALUES (?, ?)').run(vid, c.professeur_id);
    if (r.changes) appeles += 1;
    if (!courrielAllume()) continue;
    const ap = db.prepare('SELECT mail_le FROM valorisation_avis_appel WHERE valorisation_id = ? AND professeur_id = ?').get(vid, c.professeur_id);
    if (ap?.mail_le || !c.email || !mailerConfigure()) continue;
    try {
      const base = process.env.LUCIE_URL || 'https://www.lucie-iip.be';
      await envoyerEmail({
        to: c.email,
        subject: `Avis demandé — valorisation UE ${v.ue_num}`,
        html: templateNotif({
          titre: 'Une demande de valorisation attend votre avis',
          corps: `<p>${(v.e_nom || '').toUpperCase()} ${v.e_prenom || ''} demande la valorisation de l'UE ${v.ue_num}${v.ue_nom ? ` — ${v.ue_nom}` : ''}${c.cours.length ? ` (cours ${c.cours.join(', ')})` : ''}.</p>
            <p>Les pièces du dossier sont dans Lucie, <b>Mes cours → Avis de valorisation</b>. L'avis est écrit et motivé ; il est attendu dans les 10 jours ouvrables.</p>`,
          lien: `${base}/mes-cours?onglet=valorisation`, lienTexte: 'Ouvrir la demande',
        }),
      });
      db.prepare(`UPDATE valorisation_avis_appel SET mail_le = datetime('now') WHERE valorisation_id = ? AND professeur_id = ?`).run(vid, c.professeur_id);
      mails += 1;
    } catch (e) { console.error('[avisVA] courriel', vid, c.professeur_id, e.message); }
  }
  return { appeles, mails };
}
