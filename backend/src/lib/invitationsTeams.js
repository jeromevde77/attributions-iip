/** (CS)
 * LES INVITATIONS TEAMS DES DÉLIBÉRATIONS ET DES EXAMENS (3.5.667, Charles, 24 novembre 2026 : « le système d'agenda
 * fonctionne ; les délibérations et examens sont encodés ; est-il possible de générer une invitation Microsoft Teams sur
 * cette base, envoyée à tous les profs qui doivent y être ? » ; tranché : une VRAIE réunion Teams, créée par Microsoft Graph).
 *
 * La date vient d'où elle vit — `deliberation_seance` (délibération), `epreuve_session1` / `deliberation_session2` (examen,
 * date unique), `epreuve_passage` (un passage d'examen) — : rien n'est recopié, l'invitation la lit au moment d'inviter.
 *
 * QUI DOIT Y ÊTRE : pour une délibération, les professeurs attribués à l'UE l'année de la séance (de SON organisation quand
 * elle en a une), hors congé — la règle des rappels de la délibération (lib/rappelsDeliberation.js) ; pour un examen, les
 * professeurs attribués au cours (toute l'unité quand l'épreuve est d'unité). Adresse : `professeur.adresse_mail`, sinon le
 * compte relié (`utilisateur.email`). Un professeur sans adresse est NOMMÉ, jamais oublié en silence.
 *
 * L'événement naît dans le calendrier de la boîte ORGANISATRICE (`lucie_config` « teams », réglée par la direction), par
 * l'application Entra qui envoie déjà les courriels (`jetonGraphApplication`, services/mailer.js) — permission d'application
 * Calendars.ReadWrite (scripts/vps/TEAMS.md). Une date déjà invitée se MET À JOUR (même réunion, même lien) ; une date
 * disparue de Lucie se propose à l'annulation. Simulation d'abord : elle n'appelle jamais Graph.
 */
import db from '../db/index.js';
import { jetonGraphApplication, configGraph } from '../services/mailer.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
// Le nom Windows du fuseau de Bruxelles : celui que Graph accepte partout (calendriers Exchange).
const FUSEAU = 'Romance Standard Time';
const essai = (f, d) => { try { return f(); } catch { return d; } };
const err = (m, status = 400) => Object.assign(new Error(m), { status });

let pret = false;
export function migrerTeams() {
  if (pret) return;
  db.exec(`CREATE TABLE IF NOT EXISTS teams_invitation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,                 -- deliberation | examen
    cle TEXT NOT NULL UNIQUE,           -- deliberation:<id> · examen:<année>|<session>|<ue>|<cours> · passage:<id>
    annee_scolaire TEXT,
    event_id TEXT,                      -- l'identifiant de l'événement dans le calendrier de l'organisateur
    organisateur TEXT,
    join_url TEXT,
    sujet TEXT, debut TEXT, fin TEXT,
    invites TEXT,                       -- JSON : [{ id, nom, prenom, email }]
    cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
    maj_par TEXT, maj_le TEXT,
    annule_le TEXT, annule_par TEXT
  )`);
  pret = true;
}

// ── Le réglage ──
const DEFAUT = { organisateur: '', duree_deliberation_min: 120, duree_examen_min: 120 };
export function lireReglage() {
  const r = essai(() => JSON.parse(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'teams'`).get()?.valeur || 'null'), null) || {};
  const borne = (v, d) => { const n = Math.round(Number(v)); return n >= 15 && n <= 600 ? n : d; };
  return { organisateur: String(r.organisateur || '').trim(),
    duree_deliberation_min: borne(r.duree_deliberation_min, DEFAUT.duree_deliberation_min),
    duree_examen_min: borne(r.duree_examen_min, DEFAUT.duree_examen_min) };
}
export function ecrireReglage(patch = {}) {
  const a = lireReglage();
  const org = patch.organisateur === undefined ? a.organisateur : String(patch.organisateur || '').trim();
  if (org && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(org)) throw err("L'organisateur est une adresse de boîte Microsoft 365 (nom@domaine).");
  const n = { organisateur: org,
    duree_deliberation_min: patch.duree_deliberation_min ?? a.duree_deliberation_min,
    duree_examen_min: patch.duree_examen_min ?? a.duree_examen_min };
  db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('teams', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(JSON.stringify(n));
  return lireReglage();
}

/** Ce qui manque pour inviter (l'écran grise le bouton et dit pourquoi). */
export function pretAInviter() {
  const r = lireReglage();
  if (!configGraph()) return { pret: false, raison: "L'application Microsoft 365 n'est pas réglée (Configuration → Courriels → Expéditeur)." };
  if (!r.organisateur) return { pret: false, raison: "La boîte organisatrice des réunions Teams n'est pas réglée (Configuration → Courriels → Invitations Teams)." };
  return { pret: true };
}

// ── L'événement de Lucie ──
const nomUE = (n, annee) => essai(() => db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ? AND ue_nom IS NOT NULL ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(n, annee)?.ue_nom, '') || '';
const hhmm = h => { const m = String(h || '').match(/^(\d{1,2})[:h.](\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
const jour = d => String(d || '').slice(0, 10);
const jourFr = d => jour(d).split('-').reverse().join('/');

/** Début et fin à l'heure de Bruxelles (sans conversion : Graph reçoit l'heure locale et le fuseau). */
function bornes(date, heure, minutes) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = heure.split(':').map(Number);
  const a = new Date(Date.UTC(y, mo - 1, d, h, mi)), b = new Date(a.getTime() + minutes * 60000);
  const f = x => x.toISOString().slice(0, 19);
  return { debut: f(a), fin: f(b) };
}

/**
 * Retrouver l'événement de Lucie : { cle, type, annee, ue_num, session, org, cours_code, date, heure, lieu, sujet }.
 * `q` : { type: 'deliberation', id } · { type: 'examen', annee, session, ue_num, cours_code } · { type: 'examen', passage_id }.
 */
export function evenementDe(q = {}) {
  if (q.type === 'deliberation') {
    const s = essai(() => db.prepare(`SELECT id, ue_num, annee_scolaire annee, COALESCE(session, 1) session, COALESCE(num_organisation, 0) org,
        date_seance, heure_seance FROM deliberation_seance WHERE id = ?`).get(Number(q.id)), null);
    if (!s) return null;
    const nom = nomUE(s.ue_num, s.annee);
    return { cle: `deliberation:${s.id}`, type: 'deliberation', annee: s.annee, ue_num: s.ue_num, session: s.session, org: s.org,
      cours_code: '', date: jour(s.date_seance), heure: hhmm(s.heure_seance), lieu: '', ue_nom: nom,
      sujet: `Délibération — UE ${s.ue_num}${nom ? ` ${nom}` : ''} · session ${s.session}${s.org ? ` · org ${s.org}` : ''}` };
  }
  if (q.type === 'examen' && q.passage_id) {
    const p = essai(() => db.prepare('SELECT * FROM epreuve_passage WHERE id = ?').get(Number(q.passage_id)), null);
    if (!p) return null;
    const nom = nomUE(p.ue_num, p.annee_scolaire);
    return { cle: `passage:${p.id}`, type: 'examen', annee: p.annee_scolaire, ue_num: p.ue_num, session: p.session, org: 0,
      cours_code: p.cours_code || '', date: jour(p.date), heure: hhmm(p.heure), lieu: [p.local, p.adresse].filter(Boolean).join(' — '), ue_nom: nom,
      sujet: `Examen — ${p.cours_code || `UE ${p.ue_num}`}${nom ? ` (${nom})` : ''} · session ${p.session}${p.partie ? ` · ${p.partie}` : ''}` };
  }
  if (q.type === 'examen') {
    const n = Number(q.session) === 2 ? 2 : 1, t = n === 2 ? 'deliberation_session2' : 'epreuve_session1', k = `s${n}`;
    const cours = String(q.cours_code || '');
    const e = essai(() => db.prepare(`SELECT ue_num, annee_scolaire annee, cours_code, ${k}_date d, ${k}_heure h, ${k}_local l, ${k}_adresse a
        FROM ${t} WHERE annee_scolaire = ? AND ue_num = ? AND cours_code = ?`).get(String(q.annee), Number(q.ue_num), cours), null);
    if (!e) return null;
    const nom = nomUE(e.ue_num, e.annee);
    return { cle: `examen:${e.annee}|${n}|${e.ue_num}|${cours}`, type: 'examen', annee: e.annee, ue_num: e.ue_num, session: n, org: 0,
      cours_code: cours, date: jour(e.d), heure: hhmm(e.h), lieu: [e.l, e.a].filter(Boolean).join(' — '), ue_nom: nom,
      sujet: `Examen — ${cours || `UE ${e.ue_num}`}${nom ? ` (${nom})` : ''} · session ${n}` };
  }
  return null;
}

/** Retrouver l'événement à partir de sa clé (pour savoir s'il existe encore). */
export function evenementDeCle(cle) {
  const [type, reste] = String(cle).split(/:(.*)/s);
  if (type === 'deliberation') return evenementDe({ type, id: reste });
  if (type === 'passage') return evenementDe({ type: 'examen', passage_id: reste });
  if (type === 'examen') { const [annee, session, ue_num, cours_code] = reste.split('|'); return evenementDe({ type, annee, session, ue_num, cours_code }); }
  return null;
}

/**
 * QUI DOIT Y ÊTRE. Les professeurs attribués (hors congé) : à l'UE — de l'organisation de la séance quand elle en a une —
 * pour une délibération ; au cours pour un examen (à toute l'UE pour une épreuve d'unité).
 */
export function invitesDe(ev) {
  const lignes = essai(() => db.prepare(`SELECT DISTINCT p.id, p.nom, p.prenom, NULLIF(TRIM(p.adresse_mail), '') adresse,
      (SELECT u.email FROM utilisateur u WHERE u.professeur_id = p.id AND COALESCE(u.actif, 1) = 1 AND u.email LIKE '%@%' ORDER BY u.id LIMIT 1) compte
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.ue_num = ? AND COALESCE(a.en_conge, 0) = 0
      AND (? = 0 OR COALESCE(a.num_organisation, 1) = ?)
      AND (? = '' OR a.code_cours = ?)
    ORDER BY p.nom, p.prenom`).all(ev.annee, ev.ue_num, ev.org || 0, ev.org || 0,
    ev.type === 'examen' ? ev.cours_code : '', ev.type === 'examen' ? ev.cours_code : ''), []);
  const invites = [], sans_adresse = [], vus = new Set();
  for (const l of lignes) {
    if (vus.has(l.id)) continue; vus.add(l.id);
    const email = (l.adresse && l.adresse.includes('@') ? l.adresse : l.compte) || null;
    (email ? invites : sans_adresse).push({ id: l.id, nom: l.nom, prenom: l.prenom, ...(email ? { email: email.trim().toLowerCase() } : {}) });
  }
  return { invites, sans_adresse };
}

const lireInvitation = cle => { migrerTeams(); return db.prepare('SELECT * FROM teams_invitation WHERE cle = ?').get(cle) || null; };
const enClair = r => (r ? { ...r, invites: essai(() => JSON.parse(r.invites || '[]'), []) } : null);

// ── Graph ──
/** Le refus de Graph, en clair. */
export function erreurGraph(status, j) {
  const m = j?.error?.message || '';
  if (status === 403 || /Access is denied|Authorization_RequestDenied|ErrorAccessDenied/i.test(m)) {
    return err("Microsoft refuse : la permission d'application « Calendars.ReadWrite » manque sur l'application Lucie dans Microsoft Entra "
      + "(avec le consentement administrateur), ou une stratégie d'accès Exchange n'autorise pas cette boîte organisatrice. Voir scripts/vps/TEAMS.md.", 502);
  }
  if (status === 401) return err("Microsoft refuse le jeton de l'application (secret expiré ?). Vérifiez Configuration → Courriels → Expéditeur.", 502);
  if (status === 404 || /ErrorItemNotFound|MailboxNotEnabled|ResourceNotFound|ErrorInvalidUser/i.test(m)) {
    return err(`Microsoft ne trouve pas la boîte organisatrice ou l'événement (${m || status}).`, 502);
  }
  return err(`Microsoft Graph a répondu ${status}${m ? ` : ${m}` : ''}.`, 502);
}

async function appelGraph(methode, chemin, corps) {
  const jeton = await jetonGraphApplication();
  const rep = await fetch(`${GRAPH}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Prefer: `outlook.timezone="${FUSEAU}"` },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (rep.status === 202 || rep.status === 204) return {};
  const j = await rep.json().catch(() => ({}));
  if (!rep.ok) throw erreurGraph(rep.status, j);
  return j;
}

function corpsEvenement(ev, invites, reglage) {
  const minutes = ev.type === 'deliberation' ? reglage.duree_deliberation_min : reglage.duree_examen_min;
  const { debut, fin } = bornes(ev.date, ev.heure, minutes);
  const texte = [
    `<p>${ev.type === 'deliberation' ? 'Délibération du Conseil des études' : 'Examen'} — UE ${ev.ue_num}${ev.ue_nom ? ` ${ev.ue_nom}` : ''}`
      + `${ev.cours_code && ev.type === 'examen' ? `, cours ${ev.cours_code}` : ''}, session ${ev.session}${ev.org ? `, organisation ${ev.org}` : ''}.</p>`,
    `<p>Le ${jourFr(ev.date)} à ${ev.heure}${ev.lieu ? ` — ${ev.lieu}` : ''}.</p>`,
    '<p>Invitation créée par Lucie, d’après l’agenda de l’Institut Ilya Prigogine. La date fait foi dans Lucie : '
      + 'si elle change, l’invitation est mise à jour.</p>',
  ].join('');
  return { debut, fin, corps: {
    subject: ev.sujet,
    body: { contentType: 'HTML', content: texte },
    start: { dateTime: debut, timeZone: FUSEAU },
    end: { dateTime: fin, timeZone: FUSEAU },
    ...(ev.lieu ? { location: { displayName: ev.lieu } } : {}),
    attendees: invites.map(p => ({ emailAddress: { address: p.email, name: `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() }, type: 'required' })),
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: false,
  } };
}

/**
 * INVITER. Simulation (par défaut) : l'événement, les invités, ceux sans adresse, l'invitation déjà faite — sans appeler
 * Graph. Écriture : crée la réunion, ou met à jour celle qui existe (heure, sujet, invités ajoutés ; personne n'est retiré).
 */
export async function inviter(q = {}, { simulation = true, par = null } = {}) {
  migrerTeams();
  const ev = evenementDe(q);
  if (!ev) throw err('Date introuvable dans Lucie (séance ou épreuve).', 404);
  const deja = enClair(lireInvitation(ev.cle));
  const { invites, sans_adresse } = invitesDe(ev);
  const manque = [];
  if (!ev.date) manque.push('la date');
  if (!ev.heure) manque.push("l'heure");
  if (!invites.length) manque.push('au moins un professeur avec une adresse');
  // Mise à jour : ceux déjà invités restent (un retrait silencieux ferait disparaître la réunion de leur agenda sans un mot).
  const tous = [...invites];
  if (deja && !deja.annule_le) for (const p of deja.invites) if (!tous.some(x => x.email === p.email)) tous.push({ ...p, garde: true });
  const ajoutes = deja && !deja.annule_le ? invites.filter(p => !deja.invites.some(x => x.email === p.email)) : invites;
  const reponse = { evenement: ev, invites: tous, ajoutes, sans_adresse, deja, manque, ...pretAInviter() };
  if (simulation) return reponse;
  if (manque.length) throw err(`Impossible d'inviter : il manque ${manque.join(', ')}.`, 409);
  if (!reponse.pret) throw err(reponse.raison, 409);

  const reglage = lireReglage();
  const { debut, fin, corps } = corpsEvenement(ev, tous, reglage);
  const boite = encodeURIComponent(deja?.organisateur && !deja.annule_le ? deja.organisateur : reglage.organisateur);
  let j, mise_a_jour = false;
  if (deja?.event_id && !deja.annule_le) {
    const { isOnlineMeeting, onlineMeetingProvider, ...modif } = corps;   // la réunion Teams existe : on ne la recrée pas
    j = await appelGraph('PATCH', `/users/${boite}/events/${encodeURIComponent(deja.event_id)}`, modif);
    mise_a_jour = true;
  } else {
    j = await appelGraph('POST', `/users/${boite}/events`, corps);
  }
  const joinUrl = j?.onlineMeeting?.joinUrl || deja?.join_url || null;
  const invJson = JSON.stringify(tous.map(({ id, nom, prenom, email }) => ({ id, nom, prenom, email })));
  if (mise_a_jour) {
    db.prepare(`UPDATE teams_invitation SET sujet = ?, debut = ?, fin = ?, invites = ?, join_url = ?, maj_par = ?, maj_le = datetime('now') WHERE cle = ?`)
      .run(ev.sujet, debut, fin, invJson, joinUrl, par, ev.cle);
  } else {
    db.prepare(`INSERT INTO teams_invitation (type, cle, annee_scolaire, event_id, organisateur, join_url, sujet, debut, fin, invites, cree_par, maj_par, maj_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
        ON CONFLICT(cle) DO UPDATE SET event_id = excluded.event_id, organisateur = excluded.organisateur, join_url = excluded.join_url,
          sujet = excluded.sujet, debut = excluded.debut, fin = excluded.fin, invites = excluded.invites,
          cree_par = excluded.cree_par, cree_le = datetime('now'), maj_par = excluded.maj_par, maj_le = excluded.maj_le, annule_le = NULL, annule_par = NULL`)
      .run(ev.type, ev.cle, ev.annee, j.id || null, reglage.organisateur, joinUrl, ev.sujet, debut, fin, invJson, par, par);
  }
  return { ...reponse, envoye: true, mise_a_jour, invitation: enClair(lireInvitation(ev.cle)) };
}

/** ANNULER une réunion (une date disparue de Lucie, ou sur demande) : Graph prévient les invités. */
export async function annuler(cle, { par = null, motif = '' } = {}) {
  migrerTeams();
  const r = lireInvitation(cle);
  if (!r || r.annule_le) throw err('Aucune invitation active pour cette date.', 404);
  if (r.event_id) {
    await appelGraph('POST', `/users/${encodeURIComponent(r.organisateur || lireReglage().organisateur)}/events/${encodeURIComponent(r.event_id)}/cancel`,
      { comment: String(motif || '').trim() || 'Cette date a été retirée de l’agenda de l’Institut Ilya Prigogine.' });
  }
  db.prepare(`UPDATE teams_invitation SET annule_le = datetime('now'), annule_par = ? WHERE cle = ?`).run(par, cle);
  return enClair(lireInvitation(cle));
}

/**
 * CE QUI A DÉJÀ ÉTÉ INVITÉ pour une année : chaque invitation, et `a_revoir` quand la date de Lucie a disparu (à annuler)
 * ou a changé depuis (à mettre à jour).
 */
export function etat(annee) {
  migrerTeams();
  const rows = db.prepare('SELECT * FROM teams_invitation WHERE annee_scolaire = ? ORDER BY debut').all(String(annee)).map(enClair);
  const reglage = lireReglage();
  return rows.map(r => {
    if (r.annule_le) return { ...r, statut: 'annulee' };
    const ev = evenementDeCle(r.cle);
    if (!ev || !ev.date || !ev.heure) return { ...r, statut: 'disparue' };     // proposer d'annuler
    const { debut } = bornes(ev.date, ev.heure, ev.type === 'deliberation' ? reglage.duree_deliberation_min : reglage.duree_examen_min);
    return { ...r, statut: debut !== r.debut ? 'changee' : 'a_jour' };
  });
}

/** TESTER LA PERMISSION (pour Jérôme) : crée un événement d'une minute sans invité dans la boîte organisatrice, puis l'efface. */
export async function tester() {
  const p = pretAInviter();
  if (!p.pret) throw err(p.raison, 409);
  const boite = encodeURIComponent(lireReglage().organisateur);
  const demain = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const j = await appelGraph('POST', `/users/${boite}/events`, {
    subject: 'Lucie — essai de la permission Teams (à ignorer)',
    body: { contentType: 'HTML', content: '<p>Événement d’essai créé puis effacé aussitôt par Lucie.</p>' },
    start: { dateTime: `${demain}T07:00:00`, timeZone: FUSEAU }, end: { dateTime: `${demain}T07:01:00`, timeZone: FUSEAU },
    isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness',
  });
  let efface = false;
  if (j.id) { await appelGraph('DELETE', `/users/${boite}/events/${encodeURIComponent(j.id)}`); efface = true; }
  return { ok: true, teams: !!j?.onlineMeeting?.joinUrl, efface };
}
