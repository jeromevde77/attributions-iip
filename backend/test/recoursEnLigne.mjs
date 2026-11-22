/* Banc du recours en ligne (3.5.658). node test/recoursEnLigne.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-rc-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
for (const s of ['CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, id_ecampus TEXT, titre TEXT, adresse TEXT, cp TEXT, localite TEXT, email_ecole TEXT, section_rattachement TEXT)',
  'CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, num_organisation INTEGER, resultat TEXT)',
  'CREATE TABLE IF NOT EXISTS deliberation_resultat (etudiant_id INTEGER, ue_num INTEGER, annee_scolaire TEXT, session INTEGER, resultat TEXT, points REAL)',
  'CREATE TABLE IF NOT EXISTS deliberation_seance (id INTEGER PRIMARY KEY, ue_num INTEGER, annee_scolaire TEXT, session INTEGER, num_organisation INTEGER, cloturee INTEGER, publie_le TEXT, president_nom TEXT)',
  'CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT, hors_cursus INTEGER)',
  'CREATE TABLE IF NOT EXISTS attribution (id INTEGER PRIMARY KEY, ue_num INTEGER, annee_scolaire TEXT, professeur_id INTEGER, type_cours TEXT, code_cours TEXT)',
  'CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, nom_complet TEXT, email TEXT, role TEXT, actif INTEGER DEFAULT 1)',
  'CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)', 'CREATE TABLE IF NOT EXISTS parametre (cle TEXT PRIMARY KEY, valeur TEXT, label TEXT, groupe TEXT)',
  'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_user_id INTEGER, cible_role TEXT, section TEXT, cree_par TEXT)']) db.exec(s);
const R = await import('../src/lib/recoursEnLigne.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); } };
const A = '2026-2027';
const jour = R.aujourdhui();
const moins = n => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
db.prepare("INSERT INTO utilisateur (id, nom_complet, role) VALUES (1, 'SOHET Charles', 'admin'), (2, 'DA', 'directeur_adjoint'), (3, 'Prof', 'professeur')").run();
db.prepare("INSERT INTO etudiant (id, nom, prenom, section_rattachement) VALUES (1, 'Dupont', 'Anne', 'TIM')").run();
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section) VALUES (300, ?, 'Anatomie', 'TIM'), (301, ?, 'Physique', 'TIM'), (302, ?, 'Chimie', 'TIM'), (303, ?, 'Optique', 'TIM')").run(A, A, A, A);
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (9, 'Martin', 'Luc')").run();
db.prepare("INSERT INTO attribution (ue_num, annee_scolaire, professeur_id, code_cours) VALUES (300, ?, 9, '300.1')").run(A);
db.prepare("INSERT INTO etudiant_inscription VALUES (1, ?, 300, 1, 'refuse'), (1, ?, 301, 1, 'ajourne'), (1, ?, 302, 1, 'refuse'), (1, ?, 303, 2, 'refuse')").run(A, A, A, A);
db.prepare("INSERT INTO deliberation_resultat VALUES (1, 300, ?, 1, 'ajourne', 8), (1, 300, ?, 2, 'refuse', 7), (1, 301, ?, 1, 'ajourne', 8), (1, 302, ?, 2, 'refuse', 6), (1, 303, ?, 2, 'refuse', 6)").run(A, A, A, A, A);
db.prepare("INSERT INTO deliberation_seance (ue_num, annee_scolaire, session, num_organisation, cloturee, publie_le, president_nom) VALUES (300, ?, 2, 0, 1, ?, 'SOHET Charles'), (301, ?, 1, 0, 1, ?, null), (302, ?, 2, 0, 1, ?, null), (303, ?, 2, 1, 1, ?, null)")
  .run(A, moins(1) + ' 10:00:00', A, moins(1), A, moins(20), A, moins(1));
const e = db.prepare('SELECT * FROM etudiant WHERE id = 1').get();
const o = R.offreRecours(e, A);
const de = n => o.refus.find(r => r.ue_num === n);
t('le refus de S2 publié hier : ouvert', de(300)?.ouvert && de(300).session === 2, o.refus);
t('le délai : publication + 4 jours', de(300)?.limite && de(300).limite > de(300).publie_le);
t('l’ajournement : jamais proposé', !de(301));
t('le refus d’il y a 20 jours : délai passé, non ouvert', de(302) && !de(302).ouvert);
t('la séance d’une autre organisation : pas de recours', !de(303));
t('sans griefs : refusé', /irrégularités/.test(R.introduireRecours(e, A, { ue_num: 300, annee: A, session: 2, griefs: ' ' }).erreur || ''));
t('l’ajournement : refusé', /refus publié/.test(R.introduireRecours(e, A, { ue_num: 301, annee: A, session: 1, griefs: 'x' }).erreur || ''));
t('hors délai : refusé', /délai/.test(R.introduireRecours(e, A, { ue_num: 302, annee: A, session: 2, griefs: 'x' }).erreur || ''));
const pdf = Buffer.from('%PDF-1.4 test');
t('une pièce illisible : refusée', /pièce/.test(R.introduireRecours(e, A, { ue_num: 300, annee: A, session: 2, griefs: 'x' }, [{ nom: 'a.txt', buffer: Buffer.from('bonjour') }]).erreur || ''));
const r = R.introduireRecours(e, A, { ue_num: 300, annee: A, session: 2, griefs: 'La correction de l’examen ne suit pas la grille annoncée.' }, [{ nom: 'copie.pdf', buffer: pdf }], new Date().toISOString().replace('T', ' ').slice(0, 19));
t('recours reçu', r.dossier_id && /reçu/.test(r.resultat || ''), r);
const d = db.prepare('SELECT * FROM proc_dossier WHERE id = ?').get(r.dossier_id);
t('le dossier : recours, UE 300, S2, section TIM', d.type === 'recours' && d.ue_num === 300 && d.session === 2 && d.section === 'TIM', d);
const p = JSON.parse(db.prepare("SELECT donnees FROM proc_etape WHERE dossier_id = ? AND etape = 'plainte'").get(d.id).donnees);
t('la plainte : en ligne, datée du jour, griefs', p.mode === 'en_ligne' && p.recue_le === jour && /grille/.test(p.griefs), p);
t('le CDE proposé : président et chargé de cours', db.prepare('SELECT COUNT(*) n FROM proc_membre WHERE dossier_id = ?').get(d.id).n === 2);
const pc = db.prepare('SELECT * FROM proc_piece WHERE dossier_id = ?').get(d.id);
t('la pièce est gardée', pc && fs.existsSync(pc.chemin) && pc.categorie === 'plainte_en_ligne');
const notifs = db.prepare("SELECT * FROM lucie_notification WHERE type = 'recours_en_ligne'").all();
t('direction (2 comptes) et coordination en copie, pas d’autre', notifs.length === 3 && notifs.filter(n => n.cible_user_id).length === 2 && notifs.some(n => n.cible_role === 'coordination' && n.section === 'TIM'), notifs);
t('le lien ouvre le dossier', notifs.every(n => n.lien === `/procedures?dossier=${d.id}`));
t('un second recours : refusé', /déjà introduit/.test(R.introduireRecours(e, A, { ue_num: 300, annee: A, session: 2, griefs: 'x' }).erreur || ''));
const etat = R.offreRecours(e, A).refus.find(x => x.ue_num === 300);
t('l’étudiant voit : reçu, recevabilité en examen, pas de décision', etat.dossier && etat.dossier.recevabilite === 'en_examen' && !etat.dossier.decision && !etat.ouvert, etat);
// La décision n'apparaît qu'une fois envoyée.
const pose = (et, v) => db.prepare('INSERT INTO proc_etape (dossier_id, etape, donnees, par_nom) VALUES (?,?,?,?)').run(d.id, et, JSON.stringify(v), 'test');
pose('recevabilite', { recevable: true }); pose('cde', { date: jour }); pose('decision', { issue: 'rejete', motivation: 'm' });
let s = R.offreRecours(e, A).refus.find(x => x.ue_num === 300).dossier;
t('décidé mais pas envoyé : la décision reste cachée', s.recevabilite === 'recevable' && s.cde_le === jour && s.decision === null, s);
pose('envoi', { envoye_le: jour });
s = R.offreRecours(e, A).refus.find(x => x.ue_num === 300).dossier;
t('envoyé : la décision et le recours externe', s.decision === 'rejete' && s.envoye_le === jour && !!s.externe_jusquau, s);
t('jourBruxelles : 23 h UTC = lendemain l’hiver', R.jourBruxelles('2026-11-23 23:30:00') === '2026-11-24');
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
