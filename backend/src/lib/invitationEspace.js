/* L'INVITATION À L'ESPACE DE L'ÉTUDIANT (3.5.536, Charles, 17 novembre 2026 : « comment savoir si elle a reçu l'invitation ? » ; « fais
   l'invitation à l'espace étudiant »). Un courriel à l'adresse d'INSTITUT : l'adresse du site, la marche à suivre (son adresse d'institut,
   le lien reçu, son mot de passe), rien de personnel d'autre. Ne s'invite qu'un étudiant qui peut entrer : une adresse d'institut ET au
   moins une fonction de l'espace ouverte pour lui (Mise en service). Chaque invitation s'écrit au registre des envois (`invitation_espace`)
   et dans `portail_invitation` ; la fiche (Suivi) dit « invité le … » et si une connexion a suivi. Simulation d'abord, en lot comme seul. */
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { fonctionsEspace } from './fonctions.js';

const URL_ESPACE = () => (process.env.PORTAIL_URL_PUBLIQUE || 'https://etudiants.lucie-iip.be').replace(/\/$/, '');

export function migrerInvitation() {
  db.exec(`CREATE TABLE IF NOT EXISTS portail_invitation (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    email TEXT, par TEXT, statut TEXT, le TEXT NOT NULL DEFAULT (datetime('now')))`);
}

/** La dernière invitation d'un étudiant et sa première connexion ensuite. */
export function etatInvitation(etudiantId) {
  migrerInvitation();
  const inv = db.prepare(`SELECT le, par, email, statut FROM portail_invitation WHERE etudiant_id = ? ORDER BY id DESC LIMIT 1`).get(Number(etudiantId)) || null;
  let connecte = null;
  try { connecte = db.prepare('SELECT MIN(le) d FROM portail_connexion WHERE etudiant_id = ?').get(Number(etudiantId))?.d || null; } catch { connecte = null; }
  const n = db.prepare('SELECT COUNT(*) n FROM portail_invitation WHERE etudiant_id = ?').get(Number(etudiantId)).n;
  return { derniere: inv, nombre: n, premiere_connexion: connecte };
}

/** Qui peut être invité : { ok, raison }. */
function invitable(e) {
  if (!String(e.email_ecole || '').includes('@')) return { ok: false, raison: 'pas d’adresse d’institut' };
  if (['archive', 'sorti', 'diplome'].includes(String(e.sortie_statut || ''))) return { ok: false, raison: 'archivé ou sorti' };
  if (!fonctionsEspace(e.id).length) return { ok: false, raison: 'aucune fonction de l’espace ouverte pour lui (Mise en service)' };
  return { ok: true };
}

/** Invite (ou simule). `ids` : les étudiants ; `section` : toute une section à la place. `deja` : réinviter aussi ceux déjà invités. */
export async function inviter({ ids = [], section = null, ue = null, simulation = true, deja = false, message = '' }, par) {
  migrerInvitation();
  let liste = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean);
  if (!liste.length && section) {
    liste = db.prepare(`SELECT id FROM etudiant WHERE section_rattachement = ? AND COALESCE(actif, 1) = 1`).all(String(section)).map(x => x.id);
  }
  // Les inscrits d'une UE pour l'année active (3.5.537, Charles : « sélectionner les étudiants de l'UE 250 pour un test »).
  if (!liste.length && ue) liste = inscritsUE(ue);
  liste = [...new Set(liste)].slice(0, 2000);
  const prets = [], ecartes = [], dejaInvites = [];
  for (const id of liste) {
    const e = db.prepare('SELECT id, nom, prenom, email_ecole, sortie_statut FROM etudiant WHERE id = ?').get(id);
    if (!e) continue;
    const nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
    const v = invitable(e);
    if (!v.ok) { ecartes.push({ id, nom, raison: v.raison }); continue; }
    const d = db.prepare('SELECT le FROM portail_invitation WHERE etudiant_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (d && !deja) { dejaInvites.push({ id, nom, le: d.le }); continue; }
    prets.push({ id, nom, prenom: e.prenom || '', email: e.email_ecole });
  }
  if (simulation) return { simulation: true, a_inviter: prets.map(({ id, nom, email }) => ({ id, nom, email })), ecartes, deja_invites: dejaInvites };

  const url = URL_ESPACE();
  const faits = [], echecs = [];
  for (const p of prets) {
    const html = templateNotif({
      titre: 'Votre espace étudiant est ouvert',
      /* UN MOT DE CELUI QUI INVITE (3.5.537, Charles : « je souhaite qu'ils reçoivent un mail de ma part ») : son texte en tête, signé de son
         nom ; la marche à suivre suit. */
      corps: `<p>Bonjour ${p.prenom},</p>
        ${String(message || '').trim() ? `${String(message).trim().split(/\n{2,}/).map(x => `<p>${x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')}<p style="color:#555">${String(par || '').replace(/</g, '&lt;')}</p><hr style="border:0;border-top:1px solid #ddd">` : ''}
        <p>L’Institut Ilya Prigogine ouvre votre <b>espace étudiant</b> : vos documents, vos résultats, vos démarches et les messages de l’école, au même endroit.</p>
        <p><b>Pour y entrer la première fois :</b></p>
        <ol><li>rendez-vous sur <b>${url.replace(/^https?:\/\//, '')}</b> ;</li>
          <li>indiquez votre adresse d’institut (<b>${p.email}</b>) ;</li>
          <li>ouvrez le lien que vous recevez par courriel (valable 30 minutes) et choisissez votre mot de passe.</li></ol>
        <p>L’espace n’est accessible que depuis la Belgique. Pour toute question, adressez-vous au secrétariat.</p>`,
      lien: url, lienTexte: 'Ouvrir mon espace étudiant', base: url });
    const r = await envoyerEmail({ to: p.email, subject: 'Votre espace étudiant — Institut Ilya Prigogine', html }).catch(err => ({ ok: false, erreur: err.message }));
    const statut = r?.ok === false ? 'echec' : (r?.simule ? 'simule' : 'envoye');
    db.prepare('INSERT INTO portail_invitation (etudiant_id, email, par, statut) VALUES (?,?,?,?)').run(p.id, p.email, par, statut);
    try {
      db.prepare(`INSERT INTO envoi_mail (lot, type_doc, destinataire_type, destinataire_id, destinataire_nom, email, sujet, statut, envoye_par, envoye_le, mode)
        VALUES (?, 'invitation_espace', 'etudiant', ?, ?, ?, 'Votre espace étudiant — Institut Ilya Prigogine', ?, ?, datetime('now'), 'courriel')`)
        .run(`invitation-${Date.now().toString(36)}`, p.id, p.nom, p.email, statut, par);
    } catch { /* le registre des envois a sa propre forme : l'invitation reste notée dans portail_invitation */ }
    (statut === 'echec' ? echecs : faits).push({ id: p.id, nom: p.nom, erreur: r?.erreur || null });
  }
  return { simulation: false, invites: faits, echecs, ecartes, deja_invites: dejaInvites };
}

/** Les inscrits d'une UE pour l'année active (ou l'année donnée). */
export function inscritsUE(ue, annee = null) {
  const a = annee || db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
  return db.prepare(`SELECT DISTINCT i.etudiant_id id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') NOT IN ('archive', 'sorti')`).all(Number(ue), a).map(x => x.id);
}
