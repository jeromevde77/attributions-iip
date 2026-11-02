/* Banc d'essai de la ligne du temps du secrétariat (lib/ligneTemps.js) — node test/ligneTemps.mjs.
   Grands moments, chaleur des semaines, assistant de report (jour donné, semaine donnée, semaine chargée), circuit
   proposition → contrôle → accord, et l'année qui garde ses 1 404 h. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-lt-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'banc-lt';
const { default: db } = await import('../src/db/index.js');
db.function('lucie_auteur', () => 'banc'); db.function('lucie_auteur_id', () => null); db.function('lucie_geste', () => null);
db.exec(`
  CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT);
  CREATE TABLE IF NOT EXISTS annee_calendrier (annee_scolaire TEXT, type TEXT, date_debut TEXT, date_fin TEXT, label TEXT);
  CREATE TABLE IF NOT EXISTS evenement_etablissement (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, titre TEXT NOT NULL,
    date_debut TEXT NOT NULL, date_fin TEXT, heure_debut TEXT, heure_fin TEXT, lieu TEXT, description TEXT, annee_scolaire TEXT,
    responsable_user_id INTEGER, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS deliberation_seance (id INTEGER PRIMARY KEY AUTOINCREMENT, ue_num INTEGER, annee_scolaire TEXT, date_seance TEXT);
`);
try { db.exec('CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom_complet TEXT, role TEXT, actif INTEGER)'); } catch { /* existe */ }
const sem = (d, f, l) => db.prepare("INSERT INTO annee_calendrier VALUES ('2026-2027','vacances',?,?,?)").run(d, f, l);
sem('2026-10-19', '2026-10-30', 'Toussaint'); sem('2026-12-21', '2027-01-01', 'Noël');
sem('2027-02-15', '2027-02-26', 'Carnaval'); sem('2027-04-26', '2027-05-07', 'Pâques'); sem('2027-07-05', '2027-08-06', 'Vacances d’été');
for (const [id, r] of [[1, 'secretariat'], [2, 'secretariat'], [3, 'directeur_adjoint'], [4, 'directeur']])
  db.prepare('INSERT OR IGNORE INTO utilisateur (id, email, nom_complet, role, actif) VALUES (?,?,?,?,1)').run(id, `u${id}@x.be`, `Personne ${id}`, r);
for (const d of ['2027-01-25', '2027-01-26', '2027-01-27', '2027-06-21', '2027-06-22']) db.prepare("INSERT INTO deliberation_seance (ue_num, annee_scolaire, date_seance) VALUES (1,'2026-2027',?)").run(d);

const T = await import('../src/lib/tempsTravail.js');
const L = await import('../src/lib/ligneTemps.js');
T.migrerTempsTravail(); L.migrerLigneTemps();
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d !== '' ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); } };
const A = '2026-2027';
const U = { 1: { id: 1, role: 'secretariat' }, 3: { id: 3, role: 'directeur_adjoint' }, 4: { id: 4, role: 'directeur' } };

console.log('\nLes grands moments');
L.ecrireMoment(A, { type: 'inscriptions', titre: 'Inscriptions du second quadrimestre', du: '2027-01-18', au: '2027-01-29' }, 'banc');
L.ecrireMoment(A, { type: 'diplomes', du: '2027-06-25' }, 'banc');
let m = L.moments(A);
t('trois moments (deux posés, une semaine de délibérations… et la seconde)', m.length === 4, m.map(x => x.titre));
t('les délibérations se regroupent par semaine', m.some(x => x.titre === 'Délibérations (3 séances)'), m);
let refus = ''; try { L.ecrireMoment(A, { type: 'deliberations', du: '2027-01-01' }, 'banc'); } catch (e) { refus = e.message; }
t('une délibération ne se pose pas à la main', /délibérations/.test(refus), refus);

console.log('\nLa chaleur');
let c = L.chaleur(A);
t('52 semaines', c.length === 52);
const s = l => c.find(x => x.lundi === l);
t('la semaine des inscriptions et des délibérations est chaude', s('2027-01-25').niveau === 'chaud', s('2027-01-25'));
t('une semaine de congé n’est ni chaude ni creuse', s('2026-12-21').niveau === 'normal');
t('les raisons se disent', s('2027-01-25').raisons.some(r => /Inscriptions/.test(r)), s('2027-01-25').raisons);
L.forcerChaleur(A, '2027-03-03', 'chaud', 'banc');
c = L.chaleur(A);
t('la direction force une semaine (un jour de la semaine suffit)', s('2027-03-01').niveau === 'chaud' && s('2027-03-01').force, s('2027-03-01'));

console.log('\nL’assistant');
db.prepare("INSERT INTO tt_personne (utilisateur_id, fraction, formule) VALUES (1, 1, '5j')").run();
T.genererAnnee(1, A, { formule: '5j', fraction: 1 }, { ecrire: true, par: 'banc' });
refus = ''; try { L.assistant(1, A, { recup: ['2027-01-15'] }); } catch (e) { refus = e.message; }
t('sans horaire variable au règlement : refusé', /règlement de travail/.test(refus), refus);
T.ecrireReglage(A, { rt_variable: true });
let p = L.assistant(1, A, { recup: ['2027-01-15'] });
t('un vendredi donné : 1 404 h gardées', !p.erreurs.length && p.apres === p.du && p.du === 1404 * 60, p.erreurs);
t('aucune semaine en défaut', p.en_defaut === 0, p.changees.filter(x => x.controles.length));
const rep = p.changees.filter(x => x.report);
t('le report va d’abord aux semaines chaudes', rep.length && rep[0].chaleur === 'chaud', rep.map(x => [x.lundi, x.chaleur]));
t('la semaine du jour donné compte 28 h 48', p.changees.find(x => x.lundi === '2027-01-11').apres === 36 * 60 - 432, p.changees.find(x => x.lundi === '2027-01-11'));
t('aucun jour au-delà de 9 h', p.changees.every(x => x.jours.every(j => !j || j.recup || T.dureeJour(j) <= 540)));

const semaine = ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'];
p = L.assistant(1, A, { recup: semaine });
t('une semaine donnée : 36 h reportées, 1 404 h gardées', !p.erreurs.length && p.apres === p.du, p.erreurs);
t('reportée sur au moins 8 semaines (5 h au plus chacune)', p.changees.filter(x => x.report).length >= 8, p.changees.length);
t('aucune semaine au-delà de 41 h', p.changees.every(x => x.apres <= 41 * 60));

p = L.assistant(1, A, { cibles: { '2027-01-25': 41 * 60 } });
t('une semaine chargée à 41 h : 5 h retirées ailleurs', !p.erreurs.length && p.apres === p.du, p.erreurs);
const retire = p.changees.filter(x => x.report);
t('retirées d’abord des semaines les plus calmes', retire.length && retire.every(x => x.chaleur !== 'chaud') && retire[0].score === Math.min(...c.filter(x => !x.conge).map(x => x.score)), retire.map(x => [x.lundi, x.chaleur, x.score]));
p = L.assistant(1, A, { cibles: { '2027-01-25': 48 * 60 } });
t('48 h : ramenée à 41 h (art. 20bis) et dit', p.changees.find(x => x.lundi === '2027-01-25').apres === 41 * 60 && p.erreurs.some(e => /20bis/.test(e)), p.erreurs);
t('un jour passé ne se donne plus', L.assistant(1, A, { recup: ['2026-09-15'] }).erreurs.some(e => /passé/.test(e)));

console.log('\nLe circuit');
let mod = L.proposer(1, A, { recup: ['2027-01-15'] }, U[1], 'Personne 1');
t('la personne propose', mod.statut === 'proposee' && mod.changements.length > 1, mod.statut);
const avant = T.anneeDe(1, A).find(x => x.lundi === '2027-01-11').jours;
t('rien n’est appliqué avant l’accord', !avant[4].recup);
refus = ''; try { L.valider(mod.id, 'direction', U[4], 'Personne 4'); } catch (e) { refus = e.message; }
t('la direction attend le contrôle de l’adjoint', /adjointe contrôle/.test(refus), refus);
refus = ''; try { L.valider(mod.id, 'adjoint', U[1], 'Personne 1'); } catch (e) { refus = e.message; }
t('on ne valide pas sa propre modulation', /propre/.test(refus), refus);
L.valider(mod.id, 'adjoint', U[3], 'Personne 3');
mod = L.valider(mod.id, 'direction', U[4], 'Personne 4');
t('acceptée, appliquée', mod.statut === 'acceptee' && T.anneeDe(1, A).find(x => x.lundi === '2027-01-11').jours[4].recup);
t('l’année compte toujours 1 404 h', T.anneeDe(1, A).reduce((s, x) => s + x.jours.reduce((a, j) => a + (j?.recup ? 0 : T.dureeJour(j)), 0), 0) === 1404 * 60);
t('elle passe en horaire annualisé', db.prepare('SELECT formule FROM tt_personne WHERE utilisateur_id = 1').get().formule === 'annualise');
const rel = T.releve(1, A, '2027-01');
t('le relevé dit « jour donné »', rel.jours.find(j => j.jour === '2027-01-15').etat === 'recup' && rel.jours.find(j => j.jour === '2027-01-15').prevu === 0);

const m2 = L.proposer(1, A, { recup: ['2027-03-12'] }, U[1], 'Personne 1');
const m3 = L.proposer(1, A, { recup: ['2027-03-11'] }, U[1], 'Personne 1');
L.valider(m2.id, 'adjoint', U[3], 'P3'); L.valider(m2.id, 'direction', U[4], 'P4');
L.valider(m3.id, 'adjoint', U[3], 'P3');
refus = ''; try { L.valider(m3.id, 'direction', U[4], 'P4'); } catch (e) { refus = e.message; }
t('une proposition dont la base a bougé est à refaire', /a changé/.test(refus), refus);
refus = ''; try { L.refuser(m3.id, '', U[4], 'P4'); } catch (e) { refus = e.message; }
t('un refus se motive', /motive/.test(refus), refus);
t('refusée avec son motif', L.refuser(m3.id, 'Semaine des inscriptions', U[4], 'P4').statut === 'refusee');
mod = L.proposer(1, A, { recup: ['2027-05-14'] }, U[4], 'Personne 4');
t('la direction applique directement', mod.statut === 'acceptee', mod.statut);

console.log('\nLe temps partiel');
db.prepare("INSERT INTO tt_personne (utilisateur_id, fraction, formule) VALUES (2, 0.8, '5j')").run();
const g8 = T.genererAnnee(2, A, { formule: '5j', fraction: 0.8 });
t('80 % : 1 123 h 12, sans erreur (le reste de la division va aux premiers jours)', !g8.bilan.erreurs.length && g8.bilan.total_annee === Math.round(36 * 60 * 0.8) * 39, g8.bilan.erreurs);

console.log('\nLa ligne');
const lg = L.ligne(A, { voirHeures: false, moi: 1 });
t('soi : ses heures', lg.personnes.find(x => x.id === 1).heures);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
