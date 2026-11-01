/* Banc d'essai du temps de travail du secrétariat (lib/tempsTravail.js).
   node test/tempsTravail.mjs — code de sortie non nul au premier faux.
   Une base vide, le calendrier 2026-2027 (deux semaines à Toussaint, Noël, Carnaval, Pâques), puis : 39 semaines,
   1 404 h pour un temps plein en 5 jours et en 4 × 9 h ; l'annualisé avec des semaines fortes compensées ; la pause, les
   9 h, les 45 h ; le relevé, ses écarts, le solde ; l'ordre et les mains des signatures ; le verrou du mois signé. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-tt-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'banc-tt';
const { default: db } = await import('../src/db/index.js');
db.function('lucie_auteur', () => 'banc'); db.function('lucie_auteur_id', () => null); db.function('lucie_geste', () => null);
db.exec(`
  CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT);
  CREATE TABLE IF NOT EXISTS annee_calendrier (annee_scolaire TEXT, type TEXT, date_debut TEXT, date_fin TEXT, label TEXT);
`);
try { db.exec('CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom_complet TEXT, role TEXT, actif INTEGER)'); } catch { /* existe */ }
const sem = (d, f, l) => db.prepare("INSERT INTO annee_calendrier VALUES ('2026-2027','vacances',?,?,?)").run(d, f, l);
sem('2026-10-19', '2026-10-23', 'Toussaint'); sem('2026-10-26', '2026-10-30', 'Toussaint');
sem('2026-12-21', '2026-12-25', 'Noël'); sem('2026-12-28', '2027-01-01', 'Noël');
sem('2027-02-15', '2027-02-19', 'Carnaval'); sem('2027-02-22', '2027-02-26', 'Carnaval');
sem('2027-04-26', '2027-04-30', 'Pâques'); sem('2027-05-03', '2027-05-07', 'Pâques');
for (const [id, r] of [[1, 'secretariat'], [2, 'secretariat'], [3, 'directeur_adjoint'], [4, 'directeur']])
  db.prepare('INSERT OR IGNORE INTO utilisateur (id, email, nom_complet, role, actif) VALUES (?,?,?,?,1)').run(id, `u${id}@x.be`, `Personne ${id}`, r);

const T = await import('../src/lib/tempsTravail.js');
T.migrerTempsTravail();
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d !== '' ? '  → ' + JSON.stringify(d) : '')); } };
const A = '2026-2027';

console.log('\nLe calendrier');
t('52 semaines', T.semainesDeLAnnee(A).length === 52);
t('8 semaines de congés scolaires', T.semainesDeConge(A).size === 8, T.semainesDeConge(A).size);

console.log('\nTemps plein, 5 jours');
let g = T.genererAnnee(1, A, { formule: '5j', fraction: 1, ete: '2027-07-05' });
t('39 semaines de travail', g.bilan.semaines_travail === 39, g.bilan.semaines_travail);
t('1 404 h dues et prévues', g.bilan.cible_annee === 1404 * 60 && g.bilan.total_annee === 1404 * 60, g.bilan);
t('aucune erreur', !g.bilan.erreurs.length && !g.bilan.semaines_en_defaut, g.bilan.erreurs);
t('7 h 12 par jour, pause de 30 min', T.dureeJour(g.modele[0]) === 432 && g.modele[0].pause_debut === '12:00', g.modele[0]);
t('l’été hors fenêtre est refusé', T.genererAnnee(1, A, { formule: '5j', ete: '2027-07-19' }).bilan.erreurs.some(e => /cinq semaines/.test(e)));
t('sans été : signalé', T.genererAnnee(1, A, { formule: '5j' }).bilan.erreurs.some(e => /pas encore choisies/.test(e)));
g = T.genererAnnee(1, A, { formule: '5j', fraction: 1, ete: '2027-07-05' }, { ecrire: true, par: 'banc' });
t('écrit : 52 semaines en base', T.anneeDe(1, A).length === 52);

console.log('\n4 × 9 h, mi-temps');
g = T.genererAnnee(2, A, { formule: '4j', fraction: 1, ete: '2027-07-12', jourLibre: 2 });
t('4 jours de 9 h, mercredi libre', g.modele.filter(Boolean).length === 4 && !g.modele[2] && T.dureeJour(g.modele[0]) === 540);
t('1 404 h', g.bilan.total_annee === 1404 * 60 && !g.bilan.semaines_en_defaut, g.bilan);
g = T.genererAnnee(2, A, { formule: '5j', fraction: 0.5, ete: '2027-07-12' });
t('mi-temps : 702 h, journées sans pause obligatoire', g.bilan.total_annee === 702 * 60 && !g.bilan.semaines_en_defaut && !g.modele[0].pause_debut, g.bilan);

console.log('\nAnnualisé');
const lundis = T.semainesDeLAnnee(A);
g = T.genererAnnee(2, A, { formule: 'annualise', ete: '2027-07-12', fortes: { [lundis[0]]: 40 * 60, [lundis[1]]: 40 * 60 } });
t('sans horaire variable au règlement : refusé', g.bilan.semaines_en_defaut > 0);
T.ecrireReglage(A, { rt_variable: true });
g = T.genererAnnee(2, A, { formule: 'annualise', ete: '2027-07-12', fortes: { [lundis[0]]: 40 * 60, [lundis[1]]: 40 * 60 } });
t('deux semaines de 40 h compensées : 1 404 h', g.bilan.total_annee === 1404 * 60, g.bilan);
t('semaines dans les bornes', !g.bilan.semaines_en_defaut, g.semaines.filter(s => s.controles.length).map(s => s.controles));
g = T.genererAnnee(2, A, { formule: 'annualise', ete: '2027-07-12', fortes: { [lundis[0]]: 46 * 60 } });
t('une semaine de 46 h : refusée', g.semaines[0].controles.some(c => /45 h/.test(c)), g.semaines[0].controles);

console.log('\nLes règles du jour');
t('7 h sans pause : refusé', T.controleJour({ debut: '08:00', fin: '15:00' }).some(c => /pause/.test(c)));
t('9 h en 5 jours : refusé', T.controleJour({ debut: '08:00', fin: '17:30', pause_debut: '12:00', pause_fin: '12:30' }).some(c => /par jour/.test(c)));
t('9 h en 4 jours : permis', !T.controleJour({ debut: '08:00', fin: '17:30', pause_debut: '12:00', pause_fin: '12:30' }, { long: true }).length);
t('pause en fin de journée (7 h d’affilée) : refusé', T.controleJour({ debut: '08:00', fin: '15:30', pause_debut: '15:00', pause_fin: '15:30' }).some(c => /affilée/.test(c)));

console.log('\nLe relevé et le solde');
let rel = T.releve(1, A, '2026-11');
t('novembre : jours prévus', rel.prevu > 0);
t('férié du 11 novembre compté', rel.jours.find(j => j.jour === '2026-11-11').etat === 'ferie' && rel.jours.find(j => j.jour === '2026-11-11').reel === 432);
T.ecrireEcart(1, '2026-11-03', { type: 'reel', debut: '08:30', fin: '16:42', pause_debut: '12:00', pause_fin: '12:30' }, 'banc');
T.ecrireEcart(1, '2026-11-04', { type: 'absence', motif: 'recuperation' }, 'banc');
rel = T.releve(1, A, '2026-11');
t('une demi-heure en plus puis une récupération : solde de −6 h 42', rel.solde === 30 - 432, rel.solde);
T.ecrireEcart(1, '2026-11-09', { type: 'reel', debut: '08:00', fin: '17:30', pause_debut: '12:00', pause_fin: '12:30' }, 'banc');
t('9 h un jour en formule 5 jours : signalé au relevé', T.releve(1, A, '2026-11').jours.find(j => j.jour === '2026-11-09').controles.length > 0);
t('et la personne ne peut pas signer', /enfreint/.test((() => { try { T.signer(1, 'releve', '2026-11', 'personne', { id: 1, role: 'secretariat' }, 'P1', A); return ''; } catch (e) { return e.message; } })()));
T.ecrireEcart(1, '2026-11-09', { type: 'aucun' }, 'banc');
T.ecrireEcart(1, '2026-11-05', { type: 'absence', motif: 'maladie' }, 'banc');
t('maladie : comptée comme prestée', T.releve(1, A, '2026-11').jours.find(j => j.jour === '2026-11-05').reel === 432);

console.log('\nLes signatures');
const p1 = { id: 1, role: 'secretariat' }, adj = { id: 3, role: 'directeur_adjoint' }, dir_ = { id: 4, role: 'directeur' };
const essai = f => { try { f(); return null; } catch (e) { return e.message; } };
t('la direction ne signe pas avant la personne', /attendue/.test(essai(() => T.signer(1, 'releve', '2026-11', 'direction', dir_, 'D', A)) || ''));
t('une autre personne ne signe pas à sa place', /Seule/.test(essai(() => T.signer(1, 'releve', '2026-11', 'personne', { id: 2, role: 'secretariat' }, 'X', A)) || ''));
t('la personne signe', essai(() => T.signer(1, 'releve', '2026-11', 'personne', p1, 'P1', A)) === null);
t('l’adjoint contrôle', essai(() => T.signer(1, 'releve', '2026-11', 'adjoint', adj, 'Nicolas', A)) === null);
t('la direction donne son accord', essai(() => T.signer(1, 'releve', '2026-11', 'direction', dir_, 'Charles', A)) === null);
t('mois signé : verrouillé', /signé/.test(essai(() => T.ecrireEcart(1, '2026-11-06', { type: 'absence', motif: 'maladie' }, 'banc')) || ''));
t('une signature ne s’efface pas', /efface/.test(essai(() => db.prepare('DELETE FROM tt_signature').run()) || ''));
t('fiche de congés : l’adjoint d’abord', essai(() => T.signer(1, 'conges', A, 'adjoint', adj, 'Nicolas', A)) === null);
t('fiche de congés : 5 périodes', T.ficheConges(1, A).periodes.length === 5, T.ficheConges(1, A).periodes);

console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
