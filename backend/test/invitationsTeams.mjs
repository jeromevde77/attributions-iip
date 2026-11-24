/* Banc des invitations Teams (3.5.666). node test/invitationsTeams.mjs — Graph n'est jamais appelé pour de vrai : fetch simulé. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-teams-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;

// Des tables réduites à ce que lit le module (la base d'essai n'a pas les migrations de server.js).
db.pragma('foreign_keys = OFF');
for (const t of ['attribution', 'professeur', 'utilisateur']) db.exec(`DROP TABLE IF EXISTS ${t}`);
for (const s of [
  'CREATE TABLE professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, adresse_mail TEXT)',
  'CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, email TEXT, professeur_id INTEGER, actif INTEGER DEFAULT 1)',
  'CREATE TABLE attribution (id INTEGER PRIMARY KEY, professeur_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, code_cours TEXT, num_organisation INTEGER, en_conge INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)',
  `CREATE TABLE IF NOT EXISTS deliberation_seance (id INTEGER PRIMARY KEY, ue_num INTEGER, annee_scolaire TEXT, session INTEGER DEFAULT 1,
     num_organisation INTEGER DEFAULT 0, date_seance TEXT, heure_seance TEXT, cloturee INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS epreuve_session1 (ue_num INTEGER, annee_scolaire TEXT, cours_code TEXT, s1_date TEXT, s1_heure TEXT, s1_local TEXT, s1_adresse TEXT,
     PRIMARY KEY (ue_num, annee_scolaire, cours_code))`,
  `CREATE TABLE IF NOT EXISTS deliberation_session2 (ue_num INTEGER, annee_scolaire TEXT, cours_code TEXT, s2_date TEXT, s2_heure TEXT, s2_local TEXT, s2_adresse TEXT,
     PRIMARY KEY (ue_num, annee_scolaire, cours_code))`,
]) db.exec(s);

const A = '2026-2027';
db.prepare(`INSERT INTO professeur (id, nom, prenom, adresse_mail) VALUES
  (1,'Dupont','Anne','anne.dupont@ecole.test'), (2,'Martin','Paul',NULL), (3,'Leroy','Zoé',NULL), (4,'Conge','Ali','ali@ecole.test'), (5,'Autre','Org','org2@ecole.test'), (6,'Ancien','An','ancien@ecole.test')`).run();
db.prepare(`INSERT INTO utilisateur (id, email, professeur_id) VALUES (10,'paul.martin@ecole.test',2)`).run();
db.prepare(`INSERT INTO attribution (professeur_id, annee_scolaire, ue_num, code_cours, num_organisation, en_conge) VALUES
  (1,?,300,'300.1',1,0), (1,?,300,'300.2',1,0), (2,?,300,'300.2',1,0), (3,?,300,'300.1',1,0), (4,?,300,'300.1',1,1), (5,?,300,'300.1',2,0),
  (6,'2025-2026',300,'300.2',1,0)`).run(A, A, A, A, A, A);
db.prepare(`INSERT INTO deliberation_seance (id, ue_num, annee_scolaire, session, num_organisation, date_seance, heure_seance) VALUES
  (1,300,?,1,0,'2027-01-20','17:30'), (2,300,?,1,1,'2027-01-21',NULL)`).run(A, A);
db.prepare(`INSERT INTO epreuve_session1 (ue_num, annee_scolaire, cours_code, s1_date, s1_heure, s1_local) VALUES (300,?,'300.2','2027-01-10','09:00','A12')`).run(A);

let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };

// fetch simulé : il compte les appels, et la simulation ne doit en faire aucun.
const appels = [];
globalThis.fetch = async (url, o = {}) => {
  appels.push({ url: String(url), methode: o.method || 'GET', corps: o.body ? (typeof o.body === 'string' ? JSON.parse(o.body) : String(o.body)) : null });
  if (String(url).includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }), { status: 200 });
  if (o.method === 'POST' && /\/events$/.test(String(url))) return new Response(JSON.stringify({ id: 'EV1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } }), { status: 201 });
  if (o.method === 'PATCH') return new Response(JSON.stringify({ id: 'EV1' }), { status: 200 });
  return new Response('{}', { status: 202 });
};

const T = await import('../src/lib/invitationsTeams.js');
const emails = l => l.map(p => p.email).sort();

const s1 = await T.inviter({ type: 'deliberation', id: 1 });
t('délibération (toute l’unité) : les attribués de l’UE, hors congé', JSON.stringify(emails(s1.invites)) === JSON.stringify(['anne.dupont@ecole.test', 'org2@ecole.test', 'paul.martin@ecole.test']), emails(s1.invites));
t('adresse du compte relié quand la fiche n’en a pas', s1.invites.some(p => p.id === 2 && p.email === 'paul.martin@ecole.test'));
t('sans adresse : nommé, pas invité', s1.sans_adresse.length === 1 && s1.sans_adresse[0].id === 3, s1.sans_adresse);
t('un professeur attribué deux fois n’est invité qu’une fois', s1.invites.filter(p => p.id === 1).length === 1);
t('sujet de la délibération', s1.evenement.sujet.startsWith('Délibération — UE 300') && s1.evenement.sujet.includes('session 1'), s1.evenement.sujet);
t('la simulation n’appelle pas Graph', appels.length === 0, appels);
t('sans application ni organisateur : pas prêt, raison dite', s1.pret === false && !!s1.raison, s1);

const s2 = await T.inviter({ type: 'deliberation', id: 2 });
t('délibération d’une organisation : seulement ses attribués', !s2.invites.some(p => p.id === 5) && s2.invites.some(p => p.id === 1), emails(s2.invites));
t('délibération sans heure : l’heure manque', s2.manque.includes("l'heure"), s2.manque);
t('sujet porte l’organisation', s2.evenement.sujet.includes('org 1'), s2.evenement.sujet);

const e = await T.inviter({ type: 'examen', annee: A, session: 1, ue_num: 300, cours_code: '300.2' });
t('examen : les attribués du cours', JSON.stringify(emails(e.invites)) === JSON.stringify(['anne.dupont@ecole.test', 'paul.martin@ecole.test']), emails(e.invites));
t('examen : le local devient le lieu', e.evenement.lieu === 'A12');
t('année passée ignorée', !e.invites.some(p => p.id === 6));

// L'écriture : application réglée, organisateur posé.
db.prepare(`INSERT INTO lucie_config (cle, valeur) VALUES ('smtp_config', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`)
  .run(JSON.stringify({ mode: 'graph', graph: { tenant: 't', client_id: 'c', client_secret: 's', expediteur: 'lucie@ecole.test' } }));
const M = await import('../src/services/mailer.js');
if (!M.configGraph()) {
  // La clé du réglage du courriel n'est peut-être pas « smtp_config » : on passe par l'écriture officielle.
  M.ecrireConfigSmtp({ mode: 'graph', graph: { tenant: 't', client_id: 'c', client_secret: 's', expediteur: 'lucie@ecole.test' } });
}
T.ecrireReglage({ organisateur: 'deliberations@ecole.test', duree_examen_min: 90 });
const w = await T.inviter({ type: 'examen', annee: A, session: 1, ue_num: 300, cours_code: '300.2' }, { simulation: false, par: 'test' });
const post = appels.find(a => a.methode === 'POST' && /\/events$/.test(a.url));
t('écriture : un événement créé dans la boîte organisatrice', !!post && post.url.includes('/users/deliberations%40ecole.test/events'), post?.url);
t('réunion Teams demandée', post?.corps?.isOnlineMeeting === true && post?.corps?.onlineMeetingProvider === 'teamsForBusiness');
t('heure et durée (90 min)', post?.corps?.start?.dateTime === '2027-01-10T09:00:00' && post?.corps?.end?.dateTime === '2027-01-10T10:30:00', post?.corps);
t('invités obligatoires', post?.corps?.attendees?.length === 2 && post.corps.attendees.every(a => a.type === 'required'));
t('lien Teams gardé', w.invitation?.join_url?.startsWith('https://teams.microsoft.com'), w.invitation);

// Une nouvelle heure et un professeur ajouté : mise à jour, pas une seconde réunion.
db.prepare(`UPDATE epreuve_session1 SET s1_heure = '13:00' WHERE cours_code = '300.2'`).run();
t('état : date changée', T.etat(A).find(r => r.cle.startsWith('examen:'))?.statut === 'changee', T.etat(A));
db.prepare(`INSERT INTO attribution (professeur_id, annee_scolaire, ue_num, code_cours, num_organisation) VALUES (4,?,300,'300.2',1)`).run(A);
const avant = appels.length;
const m = await T.inviter({ type: 'examen', annee: A, session: 1, ue_num: 300, cours_code: '300.2' }, { simulation: false, par: 'test' });
const nouveaux = appels.slice(avant);
t('mise à jour par PATCH, aucune création', m.mise_a_jour && nouveaux.some(a => a.methode === 'PATCH' && a.url.endsWith('/events/EV1')) && !nouveaux.some(a => a.methode === 'POST'), nouveaux);
t('le professeur ajouté est invité', m.ajoutes.length === 1 && m.ajoutes[0].id === 4, m.ajoutes);
t('état : à jour après la mise à jour', T.etat(A).find(r => r.cle.startsWith('examen:'))?.statut === 'a_jour');

// La date disparue : à annuler.
db.prepare(`DELETE FROM epreuve_session1 WHERE cours_code = '300.2'`).run();
t('état : date disparue', T.etat(A).find(r => r.cle.startsWith('examen:'))?.statut === 'disparue');
await T.annuler('examen:2026-2027|1|300|300.2', { par: 'test' });
t('annuler : POST /cancel', appels.some(a => a.url.endsWith('/events/EV1/cancel')));

// Un refus 403 se dit en clair.
globalThis.fetch = async (url) => String(url).includes('login.') ? new Response(JSON.stringify({ access_token: 'j', expires_in: 3600 }), { status: 200 })
  : new Response(JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } }), { status: 403 });
let msg = '';
try { await T.inviter({ type: 'deliberation', id: 1 }, { simulation: false, par: 'test' }); } catch (x) { msg = x.message; }
t('403 : « Calendars.ReadWrite » nommée', msg.includes('Calendars.ReadWrite'), msg);

console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
