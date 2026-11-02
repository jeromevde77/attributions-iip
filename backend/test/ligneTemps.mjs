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
console.log('\nL’agenda de l’école');
const G = await import('../src/lib/agendaEcole.js');
const { joursFeries } = await import('../src/routes/horaire.js');
G.migrerAgenda();
db.exec(`CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, section TEXT, date TEXT, annule INTEGER DEFAULT 0)`);
for (const d of ['2027-03-01', '2027-03-02', '2027-03-08']) db.prepare("INSERT INTO horaire_seance (annee_scolaire, section, date) VALUES ('2026-2027','TIM',?)").run(d);
db.prepare("INSERT INTO horaire_seance (annee_scolaire, section, date, annule) VALUES ('2026-2027','AESI','2027-03-01',1)").run();
const deux = l => [0, 7].map(k => T.plusJours(l, k));
G.peindreFermeture(A, deux('2026-12-21'), 'totale', 'Noël', 'banc');
G.peindreFermeture(A, ['2027-07-12', '2027-07-19', '2027-07-26', '2027-08-02', '2027-08-09'], 'totale', 'Été', 'banc');
for (const [l, n] of [['2026-10-19', 'Toussaint'], ['2027-02-15', 'Carnaval'], ['2027-04-26', 'Pâques']]) G.peindreFermeture(A, deux(l), 'partielle', n, 'banc');
let ag = G.agenda(A, { user: { id: 4, role: 'directeur' }, presentsMin: 2 });
t('52 semaines, 7 fermetures totales, 6 partielles', ag.fermetures.filter(f => f?.fermeture === 'totale').length === 7 && ag.fermetures.filter(f => f?.fermeture === 'partielle').length === 6);
const k = ag.semaines.indexOf('2027-03-01');
t('TIM active la semaine de ses séances, AESI non (séance annulée)', ag.sections.find(x => x.section === 'TIM').semaines[k].actif && !ag.sections.find(x => x.section === 'AESI')?.semaines[k].actif);
t('besoin : 2 présents quand une section est active, 0 quand l’école est fermée', ag.besoin[k].presents_requis === 2 && ag.besoin[ag.semaines.indexOf('2026-12-21')].presents_requis === 0);
G.forcerSection(A, 'AESI', ['2027-03-01'], 'active', { id: 4, role: 'directeur' }, 'banc');
t('une section se force', G.agenda(A, {}).sections.find(x => x.section === 'AESI').semaines[k].actif);
refus = ''; try { G.forcerSection(A, 'AESI', ['2027-03-01'], 'inactive', { id: 1, role: 'secretariat' }, 'banc'); } catch (e) { refus = e.message; }
t('le secrétariat ne force pas une section', /périmètre/.test(refus), refus);
G.poserJourFerme(A, '2027-02-09', 'Mardi gras', 'Direction');
t('un jour fermé s’ajoute aux fériés', /Mardi gras/.test(joursFeries(2027).get('2027-02-09') || ''));
db.prepare("INSERT INTO tt_personne (utilisateur_id, fraction, formule) VALUES (3, 1, '5j')").run();
const g3 = T.genererAnnee(3, A, { formule: '5j', fraction: 1 }, { ecrire: true, par: 'banc' });
t('l’année suit l’agenda : 13 congés, 39 semaines, 1 404 h', g3.bilan.source === 'agenda' && g3.bilan.semaines_travail === 39 && g3.bilan.total_annee === 1404 * 60 && !g3.bilan.erreurs.length, g3.bilan);
const rj = T.releve(3, A, '2027-02').jours.find(j => j.jour === '2027-02-09');
t('le mardi gras compte comme presté, avec sa trace', rj.etat === 'ferie' && rj.prevu === 432 && rj.fermeture_ecole?.par === 'Direction', rj);
p = L.assistant(3, A, { prendre: ['2027-03-01'], travailler: ['2027-02-15'] });
t('échanger Carnaval contre une semaine de mars : 1 404 h gardées', !p.erreurs.length && p.apres === p.du, p.erreurs);
t('le besoin est signalé (TIM active, 0 autre présent)', p.avertissements.some(a => /requis/.test(a)), p.avertissements);
p = L.assistant(3, A, { prendre: ['2027-03-01'], travailler: ['2026-12-21'] });
t('une semaine de fermeture totale ne se travaille pas', p.erreurs.some(e => /fermée/.test(e)), p.erreurs);
p = L.assistant(3, A, { prendre: ['2027-03-01'] });
t('autant de semaines prises que rendues', p.erreurs.some(e => /Treize/.test(e)), p.erreurs);
mod = L.proposer(3, A, { prendre: ['2027-03-08'], travailler: ['2027-02-22'] }, U[4], 'Personne 4');
const s3 = T.anneeDe(3, A);
t('accepté : mars en congé, Carnaval au travail', mod.statut === 'acceptee' && s3.find(x => x.lundi === '2027-03-08').statut === 'conge' && s3.find(x => x.lundi === '2027-02-22').statut === 'travail', mod.statut);
t('le journal de l’agenda garde les gestes', G.journalAgenda(A).length >= 8);

console.log('\nLes séries et les rôles');
const sid = L.ecrireSerie(A, { titre: 'Collège', type: 'reunion', regle: 'semaine', jour: 0, du: '2026-09-01', au: '2027-06-30', pour: ['direction'] }, 'banc');
let el = L.moments(A, { user: { id: 4, role: 'directeur' } }).filter(m => m.serie_id === sid);
t('Collège chaque lundi, sauf Noël et l’été (fermés)', el.length > 30 && el.every(m => new Date(m.du + 'T00:00:00Z').getUTCDay() === 1) && !el.some(m => m.du === '2026-12-21' || m.du === '2026-12-28'), el.length);
t('ni le 2 novembre ni un férié', !el.some(m => m.du === '2027-03-29'));
t('la série « pour la direction » ne se montre pas au secrétariat', !L.moments(A, { user: { id: 1, role: 'secretariat' } }).some(m => m.serie_id === sid));
L.exceptionSerie(sid, '2026-11-09', '2026-11-10', 'banc'); L.exceptionSerie(sid, '2026-11-16', null, 'banc');
el = L.moments(A, {}).filter(m => m.serie_id === sid);
t('une date se déplace, une autre s’annule', el.some(m => m.du === '2026-11-10' && m.deplace === '2026-11-09') && !el.some(m => m.du === '2026-11-16'));
const s2 = L.ecrireSerie(A, { titre: 'Coordination', type: 'reunion', regle: 'quinzaine', jour: 3, du: '2026-09-10', au: '2026-10-31', pour: 'coordination,direction' }, 'banc');
el = L.moments(A, { user: { id: 9, role: 'coordination' } }).filter(m => m.serie_id === s2).map(m => m.du);
t('Coordination un jeudi sur deux, vue par la coordination', el.join() === '2026-09-10,2026-09-24,2026-10-08,2026-10-22', el);
const s4 = L.ecrireSerie(A, { titre: 'Conseil', type: 'conseil', regle: 'mois', jour: 1, rang: 2, du: '2026-09-01', au: '2026-12-31' }, 'banc');
t('le 2e mardi du mois', L.moments(A, {}).filter(m => m.serie_id === s4).map(m => m.du).join() === '2026-09-08,2026-10-13,2026-11-10,2026-12-08');
const idm = L.ecrireMoment(A, { type: 'echeance', titre: 'Remise DOC2', du: '2026-09-04', domaine: 'administratif', pour: ['secretariat'] }, 'banc');
const m1 = L.moments(A, { user: { id: 1, role: 'secretariat' } }).find(m => m.id === idm);
t('une échéance porte son domaine, sa nature et ses rôles', m1 && m1.nature === 'echeance' && m1.domaine === 'administratif' && m1.pour === 'secretariat', m1);
t('un enseignant ne la voit pas', !L.moments(A, { user: { id: 7, role: 'professeur' } }).some(m => m.id === idm));

console.log('\nLes stages');
db.exec(`CREATE TABLE IF NOT EXISTS stage (id INTEGER PRIMARY KEY, etudiant_id INTEGER, annee_scolaire TEXT, section TEXT, date_debut TEXT, date_fin TEXT, statut TEXT DEFAULT 'prevu')`);
for (let k = 0; k < 6; k++) db.prepare("INSERT INTO stage (etudiant_id, annee_scolaire, section, date_debut, date_fin) VALUES (?, '2026-2027', 'TIM', '2027-03-15', '2027-04-09')").run(k + 1);
const sts = G.stagesParSemaine(A);
const sm = x => sts.find(y => y.lundi === x);
t('6 étudiants en stage la semaine du 22/03', sm('2027-03-22').etudiants === 6 && sm('2027-03-15').debuts === 6, sm('2027-03-22'));
t('la préparation se lit les deux semaines d’avant', sm('2027-03-01').prepares === 6 && sm('2027-03-08').prepares === 6 && sm('2027-02-22').prepares === 0);
const chs = L.chaleur(A).find(c => c.lundi === '2027-03-08');
t('la préparation des stages entre dans la période', chs.raisons.some(r => /stages à préparer/.test(r)), chs.raisons);

console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
