/* Banc d'essai de la présence par QR code. Base temporaire, fonctions réelles.
   node test/presenceQr.mjs  — rend un code de sortie non nul au premier faux. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-qr-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'secret-de-test-pour-le-banc-presence-qr';
delete process.env.PRESENCE_QR_SECRET;

const M = await import('../src/db/index.js');
const db = M.default;
M.runSchema();
// Ce que les migrations ailleurs ajoutent et dont le banc a besoin.
const colonnes = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
db.exec(`CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL,
  date TEXT NOT NULL, heure_debut TEXT, heure_fin TEXT, minutes INTEGER, cours_code TEXT, ue_num INTEGER, matiere TEXT,
  professeur_id INTEGER, annule INTEGER NOT NULL DEFAULT 0, sous_groupe TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT, prenom TEXT, actif INTEGER DEFAULT 1, id_ecampus TEXT);
  CREATE TABLE IF NOT EXISTS etudiant_inscription (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL, resultat TEXT, date_inscription TEXT)`);
if (!colonnes('etudiant').includes('email_ecole')) db.exec('ALTER TABLE etudiant ADD COLUMN email_ecole TEXT');
db.exec('CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)');

const { migrerCep } = await import('../src/lib/cep.js');
migrerCep(db);
const Q = await import('../src/lib/presenceQr.js');
Q.migrerPresenceQr(db);

let ok = 0, ko = 0;
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log('  ok   ' + nom); }
  else { ko++; console.log('  FAUX ' + nom + (detail ? '  → ' + JSON.stringify(detail) : '')); }
};

// ── Le décor : une UE, un cours, une séance le 28/10/2026 à 10:00 (Bruxelles) ──
const A = '2026-2027';
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section) VALUES (333, ?, 'UE essai', 'AESI')").run(A);
db.prepare("INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ue_num, section) VALUES ('333.1', ?, 'Soins essai', 333, 'AESI')").run(A);
const etu = (nom, mail, inscrit) => {
  const id = db.prepare('INSERT INTO etudiant (nom, prenom, actif, email_ecole) VALUES (?, ?, 1, ?)').run(nom, 'X', mail).lastInsertRowid;
  if (inscrit) db.prepare('INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num) VALUES (?, ?, 333)').run(id, A);
  return id;
};
const ALPHA = etu('ALPHA', 'alpha@institut-prigogine.be', true);
const BETA = etu('BETA', 'Beta@HELB-Prigogine.be', true);      // casse et domaine HELB
const GAMMA = etu('GAMMA', 'gamma@institut-prigogine.be', false); // pas inscrit
const seance = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, date, heure_debut, heure_fin, cours_code, ue_num)
  VALUES (?, '2026-10-28', '10:00', '12:00', '333.1', 333)`).run(A).lastInsertRowid;
const annulee = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, date, heure_debut, heure_fin, cours_code, ue_num, annule)
  VALUES (?, '2026-10-28', '10:00', '12:00', '333.1', 333, 1)`).run(A).lastInsertRowid;

// 28/10/2026 : heure d'hiver, Bruxelles = UTC+1. 09:05Z = 10:05 à Bruxelles.
const H = s => new Date(`2026-10-28T${s}Z`);
const sec = d => Math.floor(d.getTime() / 1000);
const dans = H('09:05:00');
const codes = [];
const envoyer = async m => { codes.push({ to: m.to, code: /(\d{6})/.exec(m.subject)?.[1] }); return { ok: true }; };

console.log('\nJetons');
{
  const j = Q.jetonQr(seance, sec(dans));
  const x = Q.scanner(j, null, dans);
  t('QR valable, appareil inconnu → appairage demandé', x.ok && x.appairage && x.ticket, x);
  t('QR expiré (31 s) refusé', Q.scanner(Q.jetonQr(seance, sec(dans) - 31), null, dans).erreur === 'qr_expire');
  t('QR à 29 s accepté', Q.scanner(Q.jetonQr(seance, sec(dans) - 29), null, dans).ok);
  const p = j.split('.');
  t('signature falsifiée refusée', Q.scanner(`${p[0]}.${p[1]}.${p[2]}.${p[3].slice(0, -2)}xx`, null, dans).erreur === 'qr_invalide');
  t('séance changée sous la signature refusée', Q.scanner(`${p[0]}.${annulee}.${p[2]}.${p[3]}`, null, dans).erreur === 'qr_invalide');
  t('jeton tronqué refusé', Q.scanner('q.1.2', null, dans).erreur === 'qr_invalide');
  t('un ticket ne vaut pas QR', Q.scanner(x.ticket, null, dans).erreur === 'qr_invalide');
  t('séance annulée refusée', Q.scanner(Q.jetonQr(annulee, sec(dans)), null, dans).erreur === 'seance_annulee');
}

console.log('\nFenêtre (−10 / +20 min)');
{
  const avant = H('08:45:00'), limite = H('09:20:00'), apres = H('09:21:00');
  t('09:45 Bruxelles : trop tôt', Q.scanner(Q.jetonQr(seance, sec(avant)), null, avant).erreur === 'hors_fenetre');
  t('10:20 Bruxelles : encore ouvert', Q.scanner(Q.jetonQr(seance, sec(limite)), null, limite).ok);
  const x = Q.scanner(Q.jetonQr(seance, sec(apres)), null, apres);
  t('10:21 Bruxelles : fermé, message avec les heures', x.erreur === 'hors_fenetre' && /09:50 et 10:20/.test(x.message), x);
}

console.log('\nAdresse et inscription');
{
  const { ticket } = Q.scanner(Q.jetonQr(seance, sec(dans)), null, dans);
  t('adresse hors domaine refusée', (await Q.demanderCode({ ticket, email: 'alpha@gmail.com', envoyer, maintenant: dans })).erreur === 'domaine');
  t('adresse inconnue refusée', (await Q.demanderCode({ ticket, email: 'personne@institut-prigogine.be', envoyer, maintenant: dans })).erreur === 'adresse_inconnue');
  t('étudiant non inscrit refusé, sans code envoyé', (await Q.demanderCode({ ticket, email: 'gamma@institut-prigogine.be', envoyer, maintenant: dans })).erreur === 'non_inscrit' && codes.length === 0);
  t('un QR ne vaut pas ticket', (await Q.demanderCode({ ticket: Q.jetonQr(seance, sec(dans)), email: 'alpha@institut-prigogine.be', envoyer, maintenant: dans })).erreur === 'format');
  const tard = new Date(dans.getTime() + 16 * 60e3);
  t('ticket expiré (16 min) refusé', (await Q.demanderCode({ ticket, email: 'alpha@institut-prigogine.be', envoyer, maintenant: tard })).erreur === 'ticket_expire');
}

console.log('\nCode par courriel');
let appareilAlpha;
{
  const { ticket } = Q.scanner(Q.jetonQr(seance, sec(dans)), null, dans);
  const d = await Q.demanderCode({ ticket, email: 'ALPHA@institut-prigogine.be ', envoyer, maintenant: dans });
  t('code envoyé à l’adresse du dossier', d.ok && codes.at(-1)?.to === 'alpha@institut-prigogine.be', d);
  const bon = codes.at(-1).code;
  const faux = bon === '000000' ? '111111' : '000000';
  const e1 = Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: faux, maintenant: dans });
  t('code erroné refusé, essais restants annoncés', e1.erreur === 'code_errone' && /4 essai/.test(e1.message), e1);
  for (let i = 0; i < 4; i++) Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: faux, maintenant: dans });
  t('5 essais : le code est bloqué, même juste', Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: bon, maintenant: dans }).erreur === 'code_bloque');

  await Q.demanderCode({ ticket, email: 'alpha@institut-prigogine.be', envoyer, maintenant: dans });
  const c2 = codes.at(-1).code;
  const plusTard = new Date(dans.getTime() + 11 * 60e3);
  t('code expiré (11 min) refusé', Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: c2, maintenant: plusTard }).erreur === 'code_expire');

  await Q.demanderCode({ ticket, email: 'alpha@institut-prigogine.be', envoyer, maintenant: dans });
  const ancien = c2, c3 = codes.at(-1).code;
  if (ancien !== c3) t('un nouveau code remplace l’ancien', Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: ancien, maintenant: dans }).erreur === 'code_errone');
  const v = Q.validerCode({ ticket, email: 'alpha@institut-prigogine.be', code: c3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1', maintenant: dans });
  t('code juste : appareil appairé, présence enregistrée', v.ok && v.enregistre && v.appareil, v);
  appareilAlpha = v.appareil;
  const p = db.prepare('SELECT statut, source FROM presence WHERE seance_id = ? AND etudiant_id = ?').get(seance, ALPHA);
  t('présence « present », source « qr »', p?.statut === 'present' && p?.source === 'qr', p);
  const a = db.prepare('SELECT * FROM presence_appareil WHERE etudiant_id = ?').get(ALPHA);
  t('la base garde l’empreinte, pas le jeton', a && a.jeton_hash !== appareilAlpha && a.jeton_hash.length === 64);
  t('navigateur simplifié', a?.appareil === 'iPhone · Safari', a?.appareil);
  t('valable jusqu’au 15/09/2027', String(a?.expire_le).startsWith('2027-09-15'), a?.expire_le);
}

console.log('\nScans suivants');
{
  const x = Q.scanner(Q.jetonQr(seance, sec(dans)), appareilAlpha, dans);
  t('double scan : « déjà enregistrée », sans erreur', x.ok && x.deja, x);
  t('une seule ligne au journal des présences', db.prepare('SELECT COUNT(*) n FROM presence_journal WHERE seance_id = ? AND etudiant_id = ?').get(seance, ALPHA).n === 1);
  t('appareil inventé : on redemande l’adresse', Q.scanner(Q.jetonQr(seance, sec(dans)), 'x'.repeat(43), dans).appairage);
}

console.log('\nUn appareil, un étudiant');
{
  const { ticket } = Q.scanner(Q.jetonQr(seance, sec(dans)), null, dans);
  const x = await Q.demanderCode({ ticket, email: 'beta@helb-prigogine.be', appareilBrut: appareilAlpha, envoyer, maintenant: dans });
  t('l’appareil d’ALPHA ne peut pas servir à BETA', x.erreur === 'appareil_autre', x);
  t('refus inscrit au journal', db.prepare("SELECT COUNT(*) n FROM presence_qr_journal WHERE type = 'appairage_refuse' AND etudiant_id = ?").get(BETA).n === 1);
  const d = await Q.demanderCode({ ticket, email: 'beta@helb-prigogine.be', envoyer, maintenant: dans });
  t('BETA (adresse HELB, casse différente) reçoit son code', d.ok, d);
}

console.log('\nAppairages');
{
  const { ticket } = Q.scanner(Q.jetonQr(seance, sec(dans)), null, dans);
  const x = await Q.demanderCode({ ticket, email: 'alpha@institut-prigogine.be', envoyer, maintenant: dans });
  t('second appairage dans la semaine : secrétariat', x.erreur === 'limite_appairage', x);
  // Huit jours plus tard, une autre séance du même cours.
  const s2 = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, date, heure_debut, cours_code, ue_num)
    VALUES (?, '2026-11-05', '10:00', '333.1', 333)`).run(A).lastInsertRowid;
  const j8 = new Date('2026-11-05T09:02:00Z');
  const t8 = Q.scanner(Q.jetonQr(s2, sec(j8)), null, j8).ticket;
  t('8 jours plus tard : nouveau code permis', (await Q.demanderCode({ ticket: t8, email: 'alpha@institut-prigogine.be', envoyer, maintenant: j8 })).ok);
  const v = Q.validerCode({ ticket: t8, email: 'alpha@institut-prigogine.be', code: codes.at(-1).code, maintenant: j8 });
  t('nouvel appareil appairé', v.ok && v.appareil && v.appareil !== appareilAlpha, v);
  t('l’ancien appareil est désactivé', Q.appareilDe(appareilAlpha, j8) === null);
  t('désactivation au journal', db.prepare("SELECT COUNT(*) n FROM presence_qr_journal WHERE type = 'desactivation' AND etudiant_id = ?").get(ALPHA).n === 1);
  const r = Q.revoquerAppareil(db.prepare('SELECT id FROM presence_appareil WHERE etudiant_id = ? AND revoque_le IS NULL').get(ALPHA).id, 'Secrétariat', '');
  t('une révocation sans motif est refusée', r.erreur === 'motif');
}

console.log('\nCompteur et séances à compléter');
{
  const s = Q.lireSeance(seance);
  const c = Q.compteurSeance(s);
  t('compteur : 1 présent sur 2 attendus', c.presents === 1 && c.attendus === 2, c);
  db.prepare("INSERT INTO presence_qr_seance (seance_id, ouvert_par_id) VALUES (?, 99)").run(seance);
  t('fenêtre ouverte : rien à compléter', Q.seancesACompleter(99, dans).length === 0);
  const l = Q.seancesACompleter(99, H('09:30:00'));
  t('fenêtre fermée : BETA à compléter', l.length === 1 && l[0].manquants.length === 1 && l[0].manquants[0].id === BETA, l);
}

console.log('\nSuivi du secrétariat (lot 4)');
{
  t('réglage hors bornes refusé', Q.ecrireReglagesPresenceQr({ rotation_s: 3 }).erreur === 'borne');
  t('validité plus courte que la rotation refusée', Q.ecrireReglagesPresenceQr({ rotation_s: 60, validite_s: 30 }).erreur === 'validite');
  t('domaine non valable refusé', Q.ecrireReglagesPresenceQr({ domaines: 'institut-prigogine.be, pas un domaine' }).erreur === 'domaines');
  const w = Q.ecrireReglagesPresenceQr({ rotation_s: 20, domaines: '@Institut-Prigogine.be helb-prigogine.be' });
  t('réglages écrits et relus', w.ok && Q.reglagesPresenceQr().rotation_s === 20 && Q.reglagesPresenceQr().domaines.join() === 'institut-prigogine.be,helb-prigogine.be', w);
  Q.ecrireReglagesPresenceQr({ rotation_s: 15, validite_s: 30 });
  const j8 = new Date('2026-11-05T09:02:00Z');
  const liste = Q.suiviAppareils({ tous: true }, j8).filter(a => a.etudiant_id === ALPHA);
  t('suivi : ALPHA a un téléphone actif et un désactivé', liste.filter(a => a.etat === 'actif').length === 1 && liste.some(a => a.etat === 'desactive'), liste.map(a => a.etat));
  t('suivi : recherche par nom', Q.suiviAppareils({ q: 'alpha', tous: true }, j8).every(a => a.etudiant_id === ALPHA));
  const actif = liste.find(a => a.etat === 'actif');
  t('désactiver sans motif : refusé', Q.revoquerAppareil(actif.id, 'Secrétariat', '').erreur === 'motif');
  t('désactiver avec motif', Q.revoquerAppareil(actif.id, 'Secrétariat', 'téléphone perdu').ok);
  const s2 = db.prepare("SELECT id FROM horaire_seance WHERE date = '2026-11-05'").get().id;
  const tk = () => Q.scanner(Q.jetonQr(s2, sec(j8)), null, j8).ticket;
  t('téléphone perdu le jour même : limite de la semaine', (await Q.demanderCode({ ticket: tk(), email: 'alpha@institut-prigogine.be', envoyer, maintenant: j8 })).erreur === 'limite_appairage');
  t('autoriser sans motif : refusé', Q.autoriserAppareil(ALPHA, 'Secrétariat', ' ').erreur === 'motif');
  t('autorisation du secrétariat', Q.autoriserAppareil(ALPHA, 'Secrétariat', 'nouveau téléphone, ancien perdu').ok);
  { const y = await Q.demanderCode({ ticket: tk(), email: 'alpha@institut-prigogine.be', envoyer, maintenant: j8 }); t('après l’autorisation : un code de plus permis', y.ok, y); }
  const v2 = Q.validerCode({ ticket: tk(), email: 'alpha@institut-prigogine.be', code: codes.at(-1).code, maintenant: j8 });
  t('le nouveau téléphone est lié', v2.ok && v2.appareil, v2);
  t('l’autorisation est consommée : pas un troisième', (await Q.demanderCode({ ticket: tk(), email: 'alpha@institut-prigogine.be', envoyer, maintenant: j8 })).erreur === 'limite_appairage');
  const jl = Q.journalSuivi({ etudiant_id: ALPHA });
  t('journal : révocation et autorisation nommées, avec leur auteur', jl.some(x => x.type === 'revocation' && x.par === 'Secrétariat') && jl.some(x => x.type === 'autorisation' && x.libelle.startsWith('Nouveau téléphone')));
}

console.log('\nMode essai');
{
  const env = process.env.NODE_ENV;
  const loin = H('15:00:00');                 // 16:00 à Bruxelles : fenêtre fermée
  t('hors développement : la fenêtre s’applique', Q.scanner(Q.jetonQr(seance, sec(loin)), null, loin).erreur === 'hors_fenetre');
  process.env.NODE_ENV = 'production';
  t('production : pas de mode essai', !Q.modeEssai() && Q.scanner(Q.jetonQr(seance, sec(loin)), null, loin).erreur === 'hors_fenetre');
  t('production : pas de QR un autre jour', Q.qrDeLaSeance(Q.lireSeance(seance), null, new Date('2026-11-02T10:00:00Z')).erreur === 'pas_aujourdhui');
  process.env.NODE_ENV = 'development';
  t('développement : la fenêtre est ignorée', Q.scanner(Q.jetonQr(seance, sec(loin)), null, loin).ok);
  const autreJour = new Date('2026-11-02T10:00:00Z');
  const x = Q.qrDeLaSeance(Q.lireSeance(seance), null, autreJour);
  t('développement : QR un autre jour, marqué « essai »', x.ok && x.essai, x);
  t('développement : le jeton reste vérifié', Q.scanner(Q.jetonQr(seance, sec(loin) - 60), null, loin).erreur === 'qr_expire');
  process.env.NODE_ENV = env;
}

console.log('\nLe retard (P*)');
{
  const s = { date: '2026-10-28', heure_debut: '10:00' };
  t('réglage 0 : jamais en retard d’office', !Q.enRetard(s, H('09:19:00')));
  Q.ecrireReglagesPresenceQr({ retard_apres_min: 10 });
  t('10:05 avec 10 min : à l’heure', !Q.enRetard(s, H('09:05:00')));
  t('10:11 avec 10 min : en retard', Q.enRetard(s, H('09:11:00')));
  t('retard borné (241 refusé)', Q.ecrireReglagesPresenceQr({ retard_apres_min: 241 }).erreur === 'borne');
  Q.ecrireReglagesPresenceQr({ retard_apres_min: 0 });
  const { ecrirePresences } = await import('../src/lib/cep.js');
  ecrirePresences([{ seance_id: seance, etudiant_id: BETA, statut: 'present', retard: true }], 'banc');
  t('présent en retard : statut présent, marque posée', db.prepare('SELECT statut, retard FROM presence WHERE seance_id = ? AND etudiant_id = ?').get(seance, BETA)?.retard === 1);
  ecrirePresences([{ seance_id: seance, etudiant_id: BETA, statut: 'present', retard: false }], 'banc');
  t('retirer le retard s’écrit (journal)', db.prepare('SELECT COUNT(*) n FROM presence_journal WHERE seance_id = ? AND etudiant_id = ?').get(seance, BETA).n === 2);
  ecrirePresences([{ seance_id: seance, etudiant_id: BETA, statut: 'absent', retard: true }], 'banc');
  t('un absent n’est jamais « en retard »', db.prepare('SELECT retard FROM presence WHERE seance_id = ? AND etudiant_id = ?').get(seance, BETA)?.retard === 0);
  db.prepare('DELETE FROM presence WHERE etudiant_id = ?').run(BETA);
}

console.log('\nSans secret');
{
  const avant = process.env.JWT_SECRET, env = process.env.NODE_ENV;
  process.env.JWT_SECRET = 'change-me-in-prod'; process.env.NODE_ENV = 'production';
  t('production avec la clé par défaut : refus', Q.scanner('q.1.2.x', null, dans).erreur === 'secret');
  let leve = false; try { Q.jetonQr(seance); } catch { leve = true; }
  t('production avec la clé par défaut : aucun QR signé', leve);
  process.env.JWT_SECRET = avant; process.env.NODE_ENV = env;
}

console.log(`\n${ok} ok, ${ko} faux`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
