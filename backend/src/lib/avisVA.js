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

/* LES MOTIFS TYPES DE LA DÉCISION (Charles, 2 octobre 2026 : « la
   justification à choisir dans une liste »). Une phrase de départ, que le
   Conseil complète ; une par ligne, réglable dans Configuration → Procédures
   sans déploiement. Les motifs de FORME (hors délai, dossier incomplet) n'y
   sont pas : ils relèvent de la recevabilité. */
/* Une ligne qui commence par « # » est un TITRE : les motifs se rangent par
   nature d'activité (Charles, 2 octobre 2026 : « une liste plus large, avec
   des titres : cours théoriques, cours pratiques, stages… »). */
const ANCIEN_REFUS = [
  'Les contenus attestés ne correspondent pas aux acquis d’apprentissage du dossier pédagogique.',
  'Le volume attesté est insuffisant au regard des périodes de l’unité.',
  'Les résultats obtenus dans la formation antérieure ne démontrent pas la maîtrise des acquis.',
  'Le niveau de la formation antérieure n’atteint pas celui de l’unité.',
  'L’expérience décrite ne démontre pas la maîtrise des acquis ; le test ne l’a pas établie.',
  'Les preuves ne permettent pas d’établir le niveau requis.',
].join('\n');
const ANCIEN_PARTIEL = [
  'Les preuves couvrent une partie des activités d’enseignement ; les autres restent à suivre.',
  'Une partie des acquis est maîtrisée ; les autres restent à évaluer.',
  'Les heures prestées couvrent une partie des périodes de stage ; l’évaluation du stage reste due.',
  'L’expérience couvre les activités pratiques ; la partie théorique reste à suivre et à évaluer.',
].join('\n');
const MOTIFS_REFUS_DEFAUT = [
  '# Cours théoriques',
  'Les contenus attestés ne couvrent pas les acquis d’apprentissage du cours (dossier pédagogique).',
  'Le volume horaire attesté est insuffisant au regard des périodes du cours.',
  'Le niveau de la formation antérieure n’atteint pas celui du cours.',
  'Les résultats obtenus ne démontrent pas la maîtrise des acquis (note insuffisante ou non communiquée).',
  'La formation antérieure est trop ancienne au regard de l’évolution des contenus.',
  '# Cours pratiques et laboratoires',
  'Les preuves n’attestent pas la pratique des techniques visées par le cours.',
  'Le volume de pratique attesté est insuffisant.',
  'La maîtrise des gestes techniques n’a pas pu être établie : le test n’est pas concluant.',
  'L’environnement de pratique attesté diffère de celui qu’exige le cours.',
  '# Stages et enseignement clinique',
  'Les heures prestées ne couvrent pas les périodes de stage requises.',
  'Le lieu ou la fonction du stage antérieur ne correspond pas au secteur visé.',
  'Aucune évaluation du stage antérieur n’est produite (rapport, grille, attestation du maître de stage).',
  'Les activités professionnelles visées par le stage ne sont pas démontrées.',
  '# Expérience professionnelle (VAE)',
  'L’expérience décrite ne correspond pas aux acquis d’apprentissage de l’unité.',
  'La durée de l’expérience attestée est insuffisante.',
  'L’attestation d’employeur ne précise pas les tâches exercées.',
  'Le test ou l’entretien n’a pas permis d’établir la maîtrise des acquis.',
  '# Titres et formations (VA)',
  'Le titre produit ne couvre pas l’ensemble des acquis de l’unité.',
  'Le programme de la formation antérieure n’est pas produit : l’équivalence ne peut être établie.',
  'Le relevé de notes n’est pas produit : la réussite des cours invoqués n’est pas établie.',
].join('\n');
const MOTIFS_PARTIEL_DEFAUT = [
  '# Cours théoriques',
  'Les cours théoriques sont dispensés ; les cours pratiques restent à suivre.',
  'Une partie des cours théoriques est dispensée ; les autres restent à suivre et à évaluer.',
  'Les acquis théoriques sont maîtrisés ; les acquis restants seront évalués à l’examen.',
  '# Cours pratiques et laboratoires',
  'Les cours pratiques sont dispensés ; la partie théorique reste à suivre et à évaluer.',
  'Dispensé des séances de laboratoire ; doit présenter l’évaluation pratique.',
  '# Stages et enseignement clinique',
  'Dispensé des heures de stage ; doit présenter l’évaluation du stage.',
  'Les heures prestées couvrent une partie des périodes de stage ; le solde reste à effectuer.',
  'Dispensé d’une partie du stage ; le rapport de stage reste dû.',
  '# Expérience professionnelle (VAE)',
  'L’expérience couvre les activités pratiques ; la partie théorique reste à suivre et à évaluer.',
  'L’expérience couvre une partie des acquis ; les autres seront évalués lors d’un test.',
  '# Général',
  'Une partie des acquis est maîtrisée ; les autres restent à évaluer.',
  'Les preuves couvrent une partie des activités d’enseignement ; les autres restent à suivre.',
].join('\n');
try {
  const ins = db.prepare('INSERT OR IGNORE INTO parametre (cle, valeur, label, groupe) VALUES (?, ?, ?, ?)');
  ins.run('va_motifs_refus', MOTIFS_REFUS_DEFAUT, 'Valorisation — motifs types d’un refus (un par ligne ; « # Titre » ouvre un groupe)', 'procedures');
  ins.run('va_motifs_partiel', MOTIFS_PARTIEL_DEFAUT, 'Valorisation — remarques types d’une dispense partielle (une par ligne ; « # Titre » ouvre un groupe)', 'procedures');
  // La première liste, courte et sans titres, cède la place à la liste rangée
  // — seulement si personne ne l'a retouchée.
  const maj = db.prepare('UPDATE parametre SET valeur = ?, label = ? WHERE cle = ? AND valeur = ?');
  maj.run(MOTIFS_REFUS_DEFAUT, 'Valorisation — motifs types d’un refus (un par ligne ; « # Titre » ouvre un groupe)', 'va_motifs_refus', ANCIEN_REFUS);
  maj.run(MOTIFS_PARTIEL_DEFAUT, 'Valorisation — remarques types d’une dispense partielle (une par ligne ; « # Titre » ouvre un groupe)', 'va_motifs_partiel', ANCIEN_PARTIEL);
} catch { /* base ancienne */ }
/** Les motifs, rangés : [{ titre, motifs: [...] }]. */
export function motifsVA() {
  const lire = (cle, defaut) => {
    let v = defaut;
    try { v = db.prepare('SELECT valeur FROM parametre WHERE cle = ?').get(cle)?.valeur || defaut; } catch { /* */ }
    const groupes = [];
    for (const l of String(v).split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      if (l.startsWith('#')) groupes.push({ titre: l.replace(/^#+\s*/, ''), motifs: [] });
      else { if (!groupes.length) groupes.push({ titre: 'Motifs', motifs: [] }); groupes.at(-1).motifs.push(l); }
    }
    return groupes.filter(g => g.motifs.length);
  };
  return { refus: lire('va_motifs_refus', MOTIFS_REFUS_DEFAUT), partiel: lire('va_motifs_partiel', MOTIFS_PARTIEL_DEFAUT) };
}

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
