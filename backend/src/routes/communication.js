// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LA COMMUNICATION (3.1.278)
//
// Charles, 10 octobre 2026 : « d'ici lundi, tous les MDP auront un compte Lucie ;
// je souhaite pouvoir envoyer des notifications sur le tableau de bord de tous, d'une
// partie, d'une section… selon les droits, avec copie par courriel éventuellement.
// L'idée est, à terme, de supprimer les courriels pour les informations. » Et : « il
// faut pouvoir envoyer à des groupes — les profs d'une UE, d'une section » ; « quand
// c'est lu, un petit v vert ».
//
// Les tables existaient depuis la fondation de l'échéancier (`communication`,
// `communication_destinataire`) et n'avaient jamais servi : on les emploie.
//
//   · DESTINATAIRES PAR GROUPES, qui s'additionnent : tout le personnel de l'année,
//     une section, une UE, un rôle, des personnes choisies. Une personne = une fiche du
//     personnel (professeur) et/ou un compte ; on la compte une fois.
//   · ON VOIT QUI RECEVRA AVANT D'ENVOYER (l'aperçu) : un envoi ne se rattrape pas.
//   · LE TABLEAU DE BORD porte le message ; le courriel n'est qu'une copie, facultative.
//   · LU : posé quand la personne l'ouvre (« Marquer comme lu ») ; l'auteur voit un ✓ vert.
//   · RETIRER un message envoyé par erreur : il quitte les tableaux de bord, il reste
//     au registre (qui l'a envoyé, à qui, retiré par qui).
//   · DROITS : direction, direction adjointe, secrétariat, administrateur — à tous ;
//     la coordination — aux personnes de SES sections seulement.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections, professeurDe } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const r = Router();
const ENVOYEURS = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur', 'coordination'];
const ROLES = { professeur: 'Enseignants (comptes)', coordination: 'Coordinations', secretariat: 'Secrétariat',
  directeur_adjoint: 'Direction adjointe', directeur: 'Direction', consultation: 'Consultation' };

try {
  db.exec(`CREATE TABLE IF NOT EXISTS communication (
      id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, corps_html TEXT,
      canal_inapp INTEGER NOT NULL DEFAULT 1, canal_email INTEGER NOT NULL DEFAULT 0, accuse_demande INTEGER NOT NULL DEFAULT 0,
      critere_json TEXT, note_reunion_id INTEGER, annee_scolaire TEXT, statut TEXT NOT NULL DEFAULT 'brouillon',
      cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')), envoye_le TEXT);
    CREATE TABLE IF NOT EXISTS communication_destinataire (
      id INTEGER PRIMARY KEY AUTOINCREMENT, communication_id INTEGER NOT NULL REFERENCES communication(id) ON DELETE CASCADE,
      professeur_id INTEGER, utilisateur_id INTEGER, email_cible TEXT, email_envoye_le TEXT, email_erreur TEXT, lu_le TEXT);`);
  const cols = db.prepare('PRAGMA table_info(communication)').all().map(c => c.name);
  for (const [c, t] of [['cree_par_id', 'INTEGER'], ['retire_le', 'TEXT'], ['retire_par', 'TEXT'], ['resume_cible', 'TEXT']]) {
    if (!cols.includes(c)) db.exec(`ALTER TABLE communication ADD COLUMN ${c} ${t}`);
  }
} catch (e) { console.error('[migration] communication :', e.message); }

const echapper = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/* Le texte s'écrit simplement : des paragraphes. On ne stocke que du texte sûr. */
const enHtml = t => String(t || '').trim().split(/\n{2,}/).map(p => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`).join('');
const nomDe = p => `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();

function peutEnvoyer(user) { return ENVOYEURS.includes(user?.role); }

/** Les sections, UE, rôles et personnes que cet utilisateur peut viser. */
function cibles(user, annee) {
  const perim = getUserSections(user);                 // null = toutes
  const sections = db.prepare(`SELECT DISTINCT code FROM section ORDER BY code`).all().map(s => s.code)
    .filter(s => !perim || perim.includes(s));
  const ues = db.prepare(`SELECT ue_num, MAX(ue_nom) ue_nom, MIN(section) section FROM ue WHERE annee_scolaire = ?
      AND ue_num IN (SELECT DISTINCT ue_num FROM attribution WHERE annee_scolaire = ?) GROUP BY ue_num ORDER BY ue_num`).all(annee, annee)
    .filter(u => !perim || perim.includes(u.section));
  return { sections, ues, roles: perim ? {} : ROLES };
}

/** Les personnes visées par un critère : [{ professeur_id, utilisateur_id, nom, email, compte }]. */
function resoudre(critere, user, annee) {
  const perim = getUserSections(user);
  const c = critere || {};
  const profs = new Set(), comptes = new Set();
  const profsDeSections = secs => {
    if (!secs.length) return [];
    const ph = secs.map(() => '?').join(',');
    return db.prepare(`SELECT DISTINCT a.professeur_id id FROM attribution a
        WHERE a.annee_scolaire = ? AND a.professeur_id IS NOT NULL AND (a.section IN (${ph})
          OR a.ue_num IN (SELECT ue_num FROM ue WHERE annee_scolaire = ? AND section IN (${ph}))
          OR a.ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code IN (${ph})))`)
      .all(annee, ...secs, annee, ...secs, annee, ...secs).map(x => x.id);
  };
  const autorisees = s => (s || []).filter(x => !perim || perim.includes(x));
  if (c.tous) {
    if (perim) { for (const id of profsDeSections(perim)) profs.add(id); }
    else {
      for (const x of db.prepare(`SELECT DISTINCT professeur_id id FROM attribution WHERE annee_scolaire = ? AND professeur_id IS NOT NULL`).all(annee)) profs.add(x.id);
      for (const x of db.prepare(`SELECT id FROM utilisateur WHERE COALESCE(actif, 1) = 1`).all()) comptes.add(x.id);
    }
  }
  const secs = autorisees(c.sections);
  for (const id of profsDeSections(secs)) profs.add(id);
  if (secs.length) for (const x of db.prepare(`SELECT DISTINCT us.utilisateur_id id FROM utilisateur_section us JOIN utilisateur u ON u.id = us.utilisateur_id
      WHERE COALESCE(u.actif, 1) = 1 AND us.section_code IN (${secs.map(() => '?').join(',')})`).all(...secs)) comptes.add(x.id);
  const uesPermises = new Set(cibles(user, annee).ues.map(u => u.ue_num));
  const ues = (c.ues || []).map(Number).filter(n => uesPermises.has(n));
  if (ues.length) for (const x of db.prepare(`SELECT DISTINCT professeur_id id FROM attribution WHERE annee_scolaire = ? AND professeur_id IS NOT NULL
      AND ue_num IN (${ues.map(() => '?').join(',')})`).all(annee, ...ues)) profs.add(x.id);
  if (!perim && (c.roles || []).length) {
    const roles = c.roles.filter(x => ROLES[x]);
    if (roles.length) for (const x of db.prepare(`SELECT id FROM utilisateur WHERE COALESCE(actif, 1) = 1 AND role IN (${roles.map(() => '?').join(',')})`).all(...roles)) comptes.add(x.id);
  }
  for (const id of (c.professeurs || []).map(Number)) if (id) profs.add(id);
  for (const id of (c.utilisateurs || []).map(Number)) if (id) comptes.add(id);
  // Une coordination ne vise, par personnes choisies, que les gens de ses sections.
  if (perim) {
    const siens = new Set(profsDeSections(perim));
    for (const id of [...profs]) if (!siens.has(id)) profs.delete(id);
  }

  // Une personne, une ligne : la fiche du personnel et le compte qui la porte se rejoignent.
  const parProf = new Map();
  if (profs.size) for (const p of db.prepare(`SELECT id, nom, prenom, adresse_mail FROM professeur WHERE id IN (${[...profs].map(() => '?').join(',')})`).all(...profs)) {
    parProf.set(p.id, { professeur_id: p.id, utilisateur_id: null, nom: nomDe(p), email: p.adresse_mail || null });
  }
  const sansFiche = [];
  const lesComptes = db.prepare(`SELECT id, email, nom_complet, professeur_id FROM utilisateur WHERE COALESCE(actif, 1) = 1`).all();
  for (const u of lesComptes) {
    if (u.professeur_id && parProf.has(u.professeur_id)) { parProf.get(u.professeur_id).utilisateur_id = u.id; continue; }
    if (comptes.has(u.id)) {
      if (u.professeur_id) {
        const p = db.prepare('SELECT id, nom, prenom, adresse_mail FROM professeur WHERE id = ?').get(u.professeur_id);
        if (p) { parProf.set(p.id, { professeur_id: p.id, utilisateur_id: u.id, nom: nomDe(p), email: p.adresse_mail || u.email }); continue; }
      }
      sansFiche.push({ professeur_id: null, utilisateur_id: u.id, nom: u.nom_complet || u.email, email: u.email });
    }
  }
  return [...parProf.values(), ...sansFiche]
    .map(d => ({ ...d, compte: !!d.utilisateur_id }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function resumeCritere(c, annee) {
  const l = [];
  if (c.tous) l.push('tout le personnel');
  if ((c.sections || []).length) l.push(`section${c.sections.length > 1 ? 's' : ''} ${c.sections.join(', ')}`);
  if ((c.ues || []).length) l.push(`profs de l'UE ${c.ues.join(', ')}`);
  if ((c.roles || []).length) l.push(c.roles.map(x => ROLES[x] || x).join(', '));
  const n = (c.professeurs || []).length + (c.utilisateurs || []).length;
  if (n) l.push(`${n} personne${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`);
  return `${l.join(' + ') || '—'} (${annee})`;
}

// ── Ce qu'on peut viser ────────────────────────────────────────────────────
r.get('/cibles', authRequired, (req, res) => {
  if (!peutEnvoyer(req.user)) return res.status(403).json({ error: 'Envoi réservé à la direction, au secrétariat et aux coordinations.' });
  const annee = String(req.query.annee || anneeDeTravail(req));
  const c = cibles(req.user, annee);
  const personnes = resoudre({ tous: true }, req.user, annee);
  res.json({ ...c, personnes, annee, toutes_sections: getUserSections(req.user) === null });
});

// ── L'aperçu : qui recevra ─────────────────────────────────────────────────
r.post('/apercu', authRequired, (req, res) => {
  if (!peutEnvoyer(req.user)) return res.status(403).json({ error: 'Envoi réservé.' });
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const d = resoudre(req.body?.critere, req.user, annee);
  res.json({ destinataires: d, nb: d.length, sans_compte: d.filter(x => !x.compte).length, sans_email: d.filter(x => !x.email).length, resume: resumeCritere(req.body?.critere || {}, annee) });
});

// ── Envoyer ────────────────────────────────────────────────────────────────
r.post('/', authRequired, async (req, res) => {
  if (!peutEnvoyer(req.user)) return res.status(403).json({ error: 'Envoi réservé.' });
  const b = req.body || {};
  const titre = String(b.titre || '').trim().slice(0, 200);
  const texte = String(b.texte || '').trim();
  if (!titre || !texte) return res.status(400).json({ error: 'Un titre et un texte, au moins.' });
  const annee = String(b.annee || anneeDeTravail(req));
  const dest = resoudre(b.critere, req.user, annee);
  if (!dest.length) return res.status(400).json({ error: 'Personne ne correspond à ces destinataires.' });
  const parNom = req.user?.nom || req.user?.email || null;
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO communication (titre, corps_html, canal_inapp, canal_email, accuse_demande, critere_json, annee_scolaire,
        statut, cree_par, cree_par_id, envoye_le, resume_cible) VALUES (?,?,1,?,?,?,?, 'envoye', ?, ?, datetime('now'), ?)`)
      .run(titre, enHtml(texte), b.canal_email ? 1 : 0, b.accuse_demande ? 1 : 0, JSON.stringify(b.critere || {}), annee,
        parNom, req.user?.id ?? null, resumeCritere(b.critere || {}, annee));
    const cid = Number(info.lastInsertRowid);
    const ins = db.prepare('INSERT INTO communication_destinataire (communication_id, professeur_id, utilisateur_id, email_cible) VALUES (?,?,?,?)');
    for (const d of dest) ins.run(cid, d.professeur_id, d.utilisateur_id, b.canal_email ? d.email : null);
    return cid;
  })();
  res.json({ ok: true, id, nb: dest.length });

  // La copie par courriel part après la réponse : l'écran n'attend pas cinquante envois.
  if (b.canal_email) {
    const html = templateNotif({ titre, corps: `${enHtml(texte)}<p style="color:#6b7280;font-size:12px">Envoyé par ${echapper(parNom || 'Lucie')} — à retrouver sur votre tableau de bord Lucie.</p>`, lien: '/accueil' });
    for (const d of db.prepare('SELECT id, email_cible FROM communication_destinataire WHERE communication_id = ? AND email_cible IS NOT NULL').all(id)) {
      try {
        await envoyerEmail({ to: d.email_cible, subject: titre, html });
        db.prepare("UPDATE communication_destinataire SET email_envoye_le = datetime('now') WHERE id = ?").run(d.id);
      } catch (e) { db.prepare('UPDATE communication_destinataire SET email_erreur = ? WHERE id = ?').run(String(e.message).slice(0, 300), d.id); }
    }
  }
});

// ── Le registre des envois ─────────────────────────────────────────────────
r.get('/envoyes', authRequired, (req, res) => {
  if (!peutEnvoyer(req.user)) return res.status(403).json({ error: 'Réservé.' });
  const tous = getUserSections(req.user) === null;
  const l = db.prepare(`SELECT c.id, c.titre, c.cree_par, c.envoye_le, c.retire_le, c.retire_par, c.canal_email, c.accuse_demande, c.resume_cible,
      (SELECT COUNT(*) FROM communication_destinataire d WHERE d.communication_id = c.id) nb,
      (SELECT COUNT(*) FROM communication_destinataire d WHERE d.communication_id = c.id AND d.lu_le IS NOT NULL) lus
    FROM communication c WHERE c.statut = 'envoye' ${tous ? '' : 'AND c.cree_par_id = ?'} ORDER BY c.id DESC LIMIT 200`).all(...(tous ? [] : [req.user.id]));
  res.json(l);
});

r.get('/:id', authRequired, (req, res) => {
  if (!peutEnvoyer(req.user)) return res.status(403).json({ error: 'Réservé.' });
  const c = db.prepare('SELECT * FROM communication WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Introuvable.' });
  if (getUserSections(req.user) !== null && c.cree_par_id !== req.user.id) return res.status(404).json({ error: 'Introuvable.' });
  const dest = db.prepare(`SELECT d.*, p.nom, p.prenom, u.nom_complet, u.email FROM communication_destinataire d
      LEFT JOIN professeur p ON p.id = d.professeur_id LEFT JOIN utilisateur u ON u.id = d.utilisateur_id
      WHERE d.communication_id = ?`).all(c.id)
    .map(d => ({ id: d.id, nom: d.nom ? nomDe(d) : (d.nom_complet || d.email), compte: !!d.utilisateur_id, lu_le: d.lu_le,
      email: d.email_cible, email_envoye_le: d.email_envoye_le, email_erreur: d.email_erreur }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  res.json({ ...c, destinataires: dest });
});

/** Retirer un message envoyé par erreur : il quitte les tableaux de bord, il reste au registre. */
r.post('/:id/retirer', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM communication WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Introuvable.' });
  const direction = getUserSections(req.user) === null && peutEnvoyer(req.user);
  if (!direction && c.cree_par_id !== req.user.id) return res.status(403).json({ error: 'On ne retire que ses propres messages.' });
  db.prepare(`UPDATE communication SET retire_le = datetime('now'), retire_par = ? WHERE id = ?`).run(req.user?.nom || req.user?.email || null, c.id);
  res.json({ ok: true });
});

/** Lu par la personne connectée. */
r.post('/:id/lu', authRequired, (req, res) => {
  const moi = professeurDe(req.user);
  db.prepare(`UPDATE communication_destinataire SET lu_le = COALESCE(lu_le, datetime('now'))
    WHERE communication_id = ? AND (utilisateur_id = ? OR (? IS NOT NULL AND professeur_id = ?))`).run(Number(req.params.id), req.user.id, moi, moi);
  res.json({ ok: true });
});

/** Les messages reçus, pour le tableau de bord. */
export function messagesRecus(user) {
  const moi = professeurDe(user);
  return db.prepare(`SELECT c.id, c.titre, c.corps_html, c.cree_par, c.envoye_le, c.accuse_demande, MAX(d.lu_le) lu_le
      FROM communication_destinataire d JOIN communication c ON c.id = d.communication_id
      WHERE c.statut = 'envoye' AND c.retire_le IS NULL AND c.envoye_le >= datetime('now', '-60 days')
        AND (d.utilisateur_id = ? OR (? IS NOT NULL AND d.professeur_id = ?))
      GROUP BY c.id ORDER BY c.id DESC`).all(user.id, moi, moi);
}

export default r;
