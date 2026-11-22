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
export async function inviter({ ids = [], section = null, ue = null, prof = null, simulation = true, deja = false, message = '', limite = null }, par) {
  migrerInvitation();
  let liste = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean);
  if (!liste.length && section) {
    liste = await etudiantsDeSection(section);
  }
  // Les inscrits d'une UE pour l'année active (3.5.537, Charles : « sélectionner les étudiants de l'UE 250 pour un test »).
  // LES ÉTUDIANTS D'UN PROFESSEUR (3.5.589, Charles : « je ne veux inviter QUE ceux dont Wael est prof » — UE 250) : ses groupes.
  if (!liste.length && prof) liste = etudiantsDuProf(prof, { ue });
  else if (!liste.length && ue) liste = inscritsUE(ue);
  liste = [...new Set(liste)].slice(0, 2000);
  const prets = [], ecartes = [], dejaInvites = [];
  for (const id of liste) {
    const e = db.prepare('SELECT id, nom, prenom, email_ecole, sortie_statut FROM etudiant WHERE id = ?').get(id);
    if (!e) continue;
    const nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
    const v = invitable(e);
    if (!v.ok) { ecartes.push({ id, nom, raison: v.raison }); continue; }
    const d = db.prepare("SELECT le FROM portail_invitation WHERE etudiant_id = ? AND statut <> 'echec' ORDER BY id DESC LIMIT 1").get(id);
    if (d && !deja) { dejaInvites.push({ id, nom, le: d.le }); continue; }
    prets.push({ id, nom, prenom: e.prenom || '', email: e.email_ecole });
  }
  if (simulation) return { simulation: true, a_inviter: prets.map(({ id, nom, email }) => ({ id, nom, email })), ecartes, deja_invites: dejaInvites };

  const url = URL_ESPACE();
  const faits = [], echecs = [];
  // LE QUOTA DU SERVEUR DE COURRIEL (3.5.649) : 200 messages par heure ; une invitation programmée part par tranches (`limite`), la suite
  // à l'heure suivante.
  const aEnvoyer = limite == null ? prets : prets.slice(0, Math.max(0, limite));
  const restants = prets.length - aEnvoyer.length;
  for (const p of aEnvoyer) {
    const html = templateNotif({
      titre: 'Votre espace étudiant est ouvert',
      /* UN MOT DE CELUI QUI INVITE (3.5.537, Charles : « je souhaite qu'ils reçoivent un mail de ma part ») : son texte en tête, signé de son
         nom ; la marche à suivre suit. */
      corps: `<p>Bonjour ${p.prenom},</p>
        ${String(message || '').trim() ? `${String(message).trim().split(/\n{2,}/).map(x => `<p>${x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')}<p style="color:#555">${signataire(par).replace(/</g, '&lt;')}</p><hr style="border:0;border-top:1px solid #ddd">` : ''}
        <p>L’Institut Ilya Prigogine ouvre votre <b>espace étudiant</b> : vos documents, vos résultats, vos démarches et les messages de l’école, au même endroit.</p>
        <p><b>Pour y entrer la première fois :</b></p>
        <ol><li>rendez-vous sur <b>${url.replace(/^https?:\/\//, '')}</b> ;</li>
          <li>indiquez votre adresse d’institut (<b>${p.email}</b>) ;</li>
          <li>ouvrez le lien que vous recevez par courriel (valable 30 minutes) et choisissez votre mot de passe.</li></ol>
        <p>Pour toute question, adressez-vous au secrétariat.</p>`,
      lien: '/', lienTexte: 'Ouvrir mon espace étudiant', base: url });
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
  return { simulation: false, invites: faits, echecs, ecartes, deja_invites: dejaInvites, restants };
}

/** La signature d'un courriel : « Prénom NOM » (le nom d'écran est « NOM Prénom » ; un courriel qui sort garde l'ordre des documents). */
export function signataire(par) {
  const mots = String(par || '').trim().split(/\s+/).filter(Boolean);
  const nom = mots.filter(m => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m));
  const prenom = mots.filter(m => !nom.includes(m));
  return nom.length && prenom.length ? `${prenom.join(' ')} ${nom.join(' ')}` : String(par || '');
}

/* LE MOT D'ACCUEIL PROPOSÉ (3.5.604, Charles : « mettre un mot d'accueil déjà rédigé »). Il se modifie avant l'envoi. */
export const MOT_ACCUEIL = `Chères étudiantes, chers étudiants,

C'est avec plaisir que nous ouvrons aujourd'hui votre espace étudiant. Vous y trouverez, au même endroit, votre programme de l'année, vos résultats, vos documents et les messages de l'école. Vous pourrez aussi y obtenir vous-mêmes certaines attestations, sans passer par le secrétariat.

À votre première visite, une courte visite guidée vous présentera l'espace, puis vous demandera de vérifier votre programme de l'année (PAE) : confirmez-le s'il est juste, ou signalez-le s'il ne l'est pas — votre coordination en sera prévenue.

Cet espace est neuf : si quelque chose ne fonctionne pas ou vous semble peu clair, n'hésitez pas à me l'écrire, depuis l'espace lui-même (Messages → « Écrire à la direction »). Vos remarques nous aideront à l'améliorer.

Bonne découverte !`;

/* L'INVITATION PROGRAMMÉE (3.5.604, Charles, 21 novembre 2026 : « que les accès se fassent à minuit une, lundi, mardi… comme ça je
   prépare le travail »). La cible, le mot et l'heure (Bruxelles) s'enregistrent ; à l'heure dite, l'invitation part comme si on avait
   cliqué « Inviter », au nom de celui qui l'a programmée. Production seulement (la dev, copie de la prod, enverrait tout une seconde fois
   à sa boîte de redirection). Une invitation programmée s'annule tant qu'elle n'est pas partie. */
export function migrerProgrammee() {
  db.exec(`CREATE TABLE IF NOT EXISTS portail_invitation_programmee (id INTEGER PRIMARY KEY AUTOINCREMENT, cible TEXT NOT NULL,
    libelle TEXT, quand TEXT NOT NULL, message TEXT, deja INTEGER DEFAULT 0, par TEXT, cree_le TEXT DEFAULT (datetime('now')),
    statut TEXT NOT NULL DEFAULT 'prevue', fait_le TEXT, resultat TEXT)`);
}
const maintenantBruxelles = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
export function programmer({ cible, libelle, quand, message = '', deja = false }, par) {
  migrerProgrammee();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(quand || ''))) return { erreur: 'Date et heure attendues.' };
  if (quand <= maintenantBruxelles()) return { erreur: 'Ce moment est déjà passé.' };
  const c = cible || {};
  if (!c.section && !c.ue && !c.prof && !(Array.isArray(c.ids) && c.ids.length)) return { erreur: 'Choisissez qui inviter.' };
  const r = db.prepare('INSERT INTO portail_invitation_programmee (cible, libelle, quand, message, deja, par) VALUES (?,?,?,?,?,?)')
    .run(JSON.stringify(c), String(libelle || '').slice(0, 200), quand, String(message || '').slice(0, 3000), deja ? 1 : 0, par);
  return { id: r.lastInsertRowid };
}
export function programmees() {
  migrerProgrammee();
  return db.prepare(`SELECT id, libelle, quand, deja, par, cree_le, statut, fait_le, resultat, substr(message, 1, 80) debut FROM portail_invitation_programmee
    WHERE statut IN ('prevue', 'en_cours') OR fait_le >= datetime('now', '-14 days') ORDER BY quand`).all()
    .map(x => ({ ...x, resultat: x.resultat ? JSON.parse(x.resultat) : null, en_production: process.env.NODE_ENV === 'production' }));
}
export function annulerProgrammee(id, par) {
  migrerProgrammee();
  const r = db.prepare("UPDATE portail_invitation_programmee SET statut = 'annulee', fait_le = datetime('now'), resultat = ? WHERE id = ? AND statut = 'prevue'")
    .run(JSON.stringify({ annule_par: par }), Number(id));
  return r.changes ? { ok: true } : { erreur: 'Déjà partie ou annulée.' };
}
let tourEnCours = false;
/** Les invitations que l'heure permet encore : 150, moins les invitations et les courriels aux étudiants partis dans l'heure. */
function placesInvitations() {
  let n = 0;
  try { n += db.prepare("SELECT COUNT(*) n FROM portail_invitation WHERE le >= datetime('now', '-1 hour')").get().n; } catch { /* */ }
  try { n += db.prepare("SELECT COUNT(*) n FROM message_etudiant_avis WHERE avise_le >= datetime('now', '-1 hour')").get().n; } catch { /* */ }
  try { n += db.prepare("SELECT COUNT(*) n FROM message_etudiant_dest WHERE courriel_le >= datetime('now', '-1 hour')").get().n; } catch { /* */ }
  return Math.max(0, 150 - n);
}
export async function executerProgrammees() {
  if (process.env.NODE_ENV !== 'production' || tourEnCours) return;
  tourEnCours = true;
  try {
    migrerProgrammee();
    const dues = db.prepare("SELECT * FROM portail_invitation_programmee WHERE statut = 'prevue' AND quand <= ? ORDER BY quand").all(maintenantBruxelles());
    for (const p of dues) {
      // Prise une seule fois : seul celui qui passe « prevue » → « en_cours » envoie.
      if (!db.prepare("UPDATE portail_invitation_programmee SET statut = 'en_cours' WHERE id = ? AND statut = 'prevue'").run(p.id).changes) continue;
      try {
        /* PAR TRANCHES, SOUS LE QUOTA (3.5.649) : au plus ce que l'heure permet encore (150 invitations, moins ce qui est parti dans
           l'heure : invitations et courriels aux étudiants) ; s'il en reste, la programmation reste « prévue » et reprend au passage
           suivant — les déjà invités sont alors sautés (deja remis à faux). */
        const places = placesInvitations();
        if (!places) { db.prepare("UPDATE portail_invitation_programmee SET statut = 'prevue' WHERE id = ?").run(p.id); continue; }
        const avant = p.resultat ? (() => { try { return JSON.parse(p.resultat); } catch { return {}; } })() : {};
        const r = await inviter({ ...JSON.parse(p.cible), message: p.message, deja: !!p.deja, simulation: false, limite: places }, p.par);
        const res = { invites: (avant.invites || 0) + (r.invites?.length || 0), echecs: (avant.echecs || 0) + (r.echecs?.length || 0),
          ecartes: r.ecartes?.length || 0, deja_invites: r.deja_invites?.length || 0, restants: r.restants || 0 };
        if (r.restants > 0) {
          db.prepare("UPDATE portail_invitation_programmee SET statut = 'prevue', deja = 0, resultat = ? WHERE id = ?").run(JSON.stringify(res), p.id);
        } else {
          db.prepare("UPDATE portail_invitation_programmee SET statut = 'faite', fait_le = datetime('now'), resultat = ? WHERE id = ?").run(JSON.stringify(res), p.id);
        }
      } catch (e) {
        db.prepare("UPDATE portail_invitation_programmee SET statut = 'echec', fait_le = datetime('now'), resultat = ? WHERE id = ?").run(JSON.stringify({ erreur: e.message }), p.id);
      }
    }
  } finally { tourEnCours = false; }
}

/** Les inscrits d'une UE pour l'année active (ou l'année donnée). */
/** Les étudiants d'un professeur, l'année active : pour chaque ligne d'attribution (cours, activité, groupe), les étudiants de ce
 *  groupe dans la répartition (`etudiant_cours_groupe`) ; un cours sans répartition donne les inscrits de l'UE (de son organisation).
 *  Bornable à une UE. Archivés et sortis écartés. */
export function etudiantsDuProf(profId, { ue = null, annee = null } = {}) {
  const a = annee || db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
  const lignes = db.prepare(`SELECT DISTINCT ue_num, code_cours, code, activite_id, num_organisation FROM attribution
    WHERE professeur_id = ? AND annee_scolaire = ? ${ue ? 'AND ue_num = ?' : ''}`).all(...[Number(profId), a, ...(ue ? [Number(ue)] : [])]);
  const ids = new Set();
  let rep = null; try { rep = db.prepare('SELECT COUNT(*) n FROM etudiant_cours_groupe WHERE annee_scolaire = ? AND cours_code = ?'); } catch { rep = null; }
  for (const l of lignes) {
    const reparti = rep && l.code_cours ? rep.get(a, l.code_cours).n > 0 : false;
    if (reparti && l.code) {
      const avecAct = db.prepare('SELECT COUNT(*) n FROM etudiant_cours_groupe WHERE annee_scolaire = ? AND cours_code = ? AND activite_id = ?').get(a, l.code_cours, l.activite_id || 0).n > 0;
      db.prepare(`SELECT etudiant_id id FROM etudiant_cours_groupe WHERE annee_scolaire = ? AND cours_code = ? AND groupe_code = ? ${avecAct ? 'AND activite_id = ?' : ''}`)
        .all(...[a, l.code_cours, l.code, ...(avecAct ? [l.activite_id || 0] : [])]).forEach(x => ids.add(x.id));
    } else {
      db.prepare(`SELECT etudiant_id id FROM etudiant_inscription WHERE ue_num = ? AND annee_scolaire = ?
        AND (num_organisation IS NULL OR num_organisation = ? OR ? IS NULL)`).all(l.ue_num, a, l.num_organisation, l.num_organisation).forEach(x => ids.add(x.id));
    }
  }
  return [...ids].filter(id => {
    const e = db.prepare('SELECT sortie_statut FROM etudiant WHERE id = ?').get(id);
    return e && !['archive', 'sorti'].includes(e.sortie_statut || '');
  });
}

/* LES ÉTUDIANTS D'UNE SECTION (3.5.603, Charles : « Psychomotricité lundi, opto mardi, le reste mercredi ») : les inscrits de l'année
   active dont la section — posée, ou déduite par Lucie à défaut (`sectionPropre`, la règle de la liste et du périmètre) — est celle-là.
   Ne lire que `section_rattachement` laissait de côté 343 étudiants de 2026-2027 sans section posée. */
export async function etudiantsDeSection(section, annee = null) {
  const { sectionPropre } = await import('../routes/etudiants.js');
  const a = annee || db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
  const ids = db.prepare(`SELECT DISTINCT i.etudiant_id id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND COALESCE(e.actif, 1) = 1`).all(a).map(x => x.id);
  return ids.filter(id => sectionPropre(id) === String(section));
}

export function inscritsUE(ue, annee = null) {
  const a = annee || db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
    || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
  return db.prepare(`SELECT DISTINCT i.etudiant_id id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') NOT IN ('archive', 'sorti')`).all(Number(ue), a).map(x => x.id);
}

/* QUI S'EST CONNECTÉ (3.5.576, Charles : « comment voir facilement qui s'est connecté, et envoyer un mail à ceux qui ne le sont pas ? »).
   Les étudiants d'une section, d'une UE, ou — sans choix — tous ceux déjà invités : dernière invitation, nombre d'invitations,
   première et dernière connexion à l'espace (`portail_connexion`, relevée du portail). La relance passe par `inviter` (deja = true). */
export async function suiviInvitations({ section = null, ue = null } = {}) {
  migrerInvitation();
  let ids;
  if (ue) ids = inscritsUE(Number(ue));
  else if (section) ids = await etudiantsDeSection(section);
  else ids = db.prepare('SELECT DISTINCT etudiant_id id FROM portail_invitation').all().map(x => x.id);
  const lignes = [];
  // LA SECTION LUE COMME PARTOUT (3.5.645, Charles : « on ne voit pas leur section ») : la règle de la fiche, posée ou déduite —
  // section_rattachement seule est vide pour la plupart.
  let sectionPropre = null; try { ({ sectionPropre } = await import('../routes/etudiants.js')); } catch { /* repli sur la colonne */ }
  for (const id of [...new Set(ids)]) {
    const e = db.prepare('SELECT id, nom, prenom, email_ecole, sortie_statut, section_rattachement FROM etudiant WHERE id = ?').get(id);
    if (!e) continue;
    const inv = db.prepare(`SELECT MAX(le) le, COUNT(*) n FROM portail_invitation WHERE etudiant_id = ? AND statut <> 'echec'`).get(id) || {};
    let c = {}; try { c = db.prepare('SELECT MIN(le) premiere, MAX(le) derniere, COUNT(*) n FROM portail_connexion WHERE etudiant_id = ?').get(id) || {}; } catch { c = {}; }
    lignes.push({ id, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), section: (sectionPropre ? (() => { try { return sectionPropre(id); } catch { return null; } })() : null) || e.section_rattachement || null, email: e.email_ecole || null,
      invitable: invitable(e).ok, invite_le: inv.le || null, invitations: inv.n || 0, premiere: c.premiere || null, derniere: c.derniere || null, connexions: c.n || 0 });
  }
  lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { lignes, invites: lignes.filter(l => l.invite_le).length, connectes: lignes.filter(l => l.premiere).length };
}
