/* Banc des pièces d'examen (3.5.226). node test/examens.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-exam-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
for (const s of [
  `CREATE TABLE IF NOT EXISTS epreuve_session1 (ue_num INTEGER, annee_scolaire TEXT, cours_code TEXT, s1_date TEXT, s1_heure TEXT, s1_local TEXT, s1_adresse TEXT, s1_visite_date TEXT, s1_visite_heure TEXT, s1_visite_local TEXT, PRIMARY KEY (ue_num, annee_scolaire, cours_code))`,
  `CREATE TABLE IF NOT EXISTS ue (ue_num INTEGER, annee_scolaire TEXT, ue_nom TEXT, section TEXT, ue_niv TEXT)`,
  `CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT, ue_num INTEGER)`,
  `CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)`,
  `CREATE TABLE IF NOT EXISTS attribution (id INTEGER PRIMARY KEY, annee_scolaire TEXT, ue_num INTEGER, code_cours TEXT, professeur_id INTEGER)`,
  `CREATE TABLE IF NOT EXISTS etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, id_ecampus TEXT)`,
  `CREATE TABLE IF NOT EXISTS etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER, statut TEXT)`,
  `CREATE TABLE IF NOT EXISTS amenagement_dossier (id INTEGER PRIMARY KEY, etudiant_id INTEGER, annee_scolaire TEXT, statut TEXT)`,
  `CREATE TABLE IF NOT EXISTS amenagement_mesure (id INTEGER PRIMARY KEY, dossier_id INTEGER, libelle TEXT, precisions TEXT, ue_num INTEGER, accorde INTEGER)`,
  `CREATE TABLE IF NOT EXISTS aa (aa_code TEXT PRIMARY KEY, description TEXT)`,
  `CREATE TABLE IF NOT EXISTS aa_ponderation (id INTEGER PRIMARY KEY, annee_scolaire TEXT, ue_num INTEGER, cours_code TEXT, aa_code TEXT, poids REAL)`,
]) db.exec(s);
const A = '2026-2027';
db.prepare("INSERT INTO epreuve_session1 VALUES (256, ?, '256.2', '2026-10-23', '17:45', 'P.2.04', NULL, NULL, NULL, NULL)").run(A);
db.prepare("INSERT INTO ue VALUES (256, ?, 'Imagerie avancée', 'TIM', 'BA3')").run(A);
db.prepare("INSERT INTO cours VALUES ('256.2', ?, 'Scanner', 256)").run(A);
db.prepare("INSERT INTO professeur VALUES (1, 'Martin', 'Paul')").run();
db.prepare("INSERT INTO attribution VALUES (1, ?, 256, '256.2', 1)").run(A);
db.prepare("INSERT INTO etudiant VALUES (1,'Dupont','Anne','M001'),(2,'Bernard','Léa','M002')").run();
db.prepare("INSERT INTO etudiant_inscription VALUES (1,?,256,NULL),(2,?,256,NULL)").run(A, A);
db.prepare("INSERT INTO amenagement_dossier VALUES (7, 1, ?, 'accepte')").run(A);
db.prepare("INSERT INTO amenagement_mesure VALUES (1, 7, 'Tiers-temps', 'local à part', NULL, 1),(2, 7, 'Refusée', NULL, NULL, 0)").run();
db.prepare("INSERT INTO aa VALUES ('AA256.1','Réaliser un examen scanner')").run();
db.prepare("INSERT INTO aa_ponderation VALUES (1, ?, 256, '256.2', 'AA256.1', 5)").run(A);
const X = await import('../src/lib/examens.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); } };
let l = X.epreuves({ annee: A, session: 1 });
t('une épreuve, deux étudiants, triés', l.length === 1 && l[0].etudiants.map(x => x.nom).join() === 'BERNARD Léa,DUPONT Anne', l[0]?.etudiants);
t('durée de 2 h par défaut, fin calculée', l[0].duree_min === 120 && l[0].heure_fin === '19:45', l[0]);
t('aménagement : la seule mesure accordée', l[0].ar.length === 1 && l[0].ar[0].ar.length === 1 && l[0].ar[0].ar[0].libelle === 'Tiers-temps');
X.ecrireDetail({ annee: A, session: 1, ue_num: 256, cours_code: '256.2', surveillants: 'DURAND Jean', duree_min: 90, type: 'oral' }, 'Sec');
l = X.epreuves({ annee: A, session: 1 });
t('le détail se garde', l[0].surveillants === 'DURAND Jean' && l[0].duree_min === 90 && l[0].type === 'oral' && l[0].heure_fin === '19:15');
X.ecrireDetail({ annee: A, session: 1, ue_num: 256, cours_code: '256.2', materiel: 'Calculatrice' }, 'Sec');
t('écrire un champ ne vide pas les autres', X.epreuves({ annee: A, session: 1 })[0].surveillants === 'DURAND Jean');
const h = X.composer(l, ['enveloppe']);
t('enveloppe : fiche, AR, registre, plan, incident', ['Fiche de l’épreuve', 'Aménagements raisonnables', 'Registre de présences', 'Plan d’installation', 'Procès-verbal d’incident'].every(x => h.includes(x)));
t('la fiche compte les questionnaires (2 + 3)', h.includes('<b>5</b> exemplaires'));
t('le registre nomme le surveillant', h.includes('DURAND Jean'));
t('la mesure refusée ne sort pas', !h.includes('Refusée'));
const g = X.composer(l, ['garde']);
t('pages de garde nominatives, avec les acquis', (g.match(/Examen — 1re session/g) || []).length === 2 && g.includes('AA256.1') && g.includes('M002'));
t('archivage : deux étiquettes', (X.composer(l, ['archivage']).match(/class="etiquette"/g) || []).length === 2);
t('sélection par clé', X.epreuves({ annee: A, session: 1, cles: ['1|999|x'] }).length === 0 && X.epreuves({ annee: A, session: 1, cles: ['1|256|256.2'] }).length === 1);
t('périmètre : section hors champ', X.epreuves({ annee: A, session: 1, sections: ['OPTO'] }).length === 0);
// ── Le délai du questionnaire et les rappels (3.5.227) ──
t('délai : un mois avant', X.delaiQuestionnaire('2026-10-23') === '2026-09-23');
t('délai : janvier → 1er décembre', X.delaiQuestionnaire('2027-01-12') === '2026-12-01');
t('délai : juin → 15 avril', X.delaiQuestionnaire('2027-06-10') === '2027-04-15');
t('délai : mai tardif → 15 avril', X.delaiQuestionnaire('2027-05-28') === '2027-04-15');
db.exec(`CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, role TEXT, professeur_id INTEGER, actif INTEGER DEFAULT 1, perimetre_toutes INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS utilisateur_section (utilisateur_id INTEGER, section_code TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS rappel_envoye (id INTEGER PRIMARY KEY, cible_type TEXT, cible_id INTEGER, jalon TEXT, user_id INTEGER, canal TEXT, envoye_le TEXT)`);
db.exec('DROP TABLE IF EXISTS deliberation_seance');
db.exec(`CREATE TABLE IF NOT EXISTS deliberation_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, ue_num INTEGER, session INTEGER, num_organisation INTEGER, date_seance TEXT, visite_date TEXT, visite_heure TEXT, visite_local TEXT)`);
db.prepare("INSERT INTO utilisateur (id,email,role,professeur_id) VALUES (10,'paul@x','professeur',1),(20,'coo@x','coordination',NULL)").run();
db.prepare("INSERT INTO utilisateur_section VALUES (20,'TIM')").run();
db.prepare("INSERT INTO lucie_config VALUES ('rappels', '{\"actif\":true}')").run();
X.ecrireDetail({ annee: A, session: 1, ue_num: 256, cours_code: '256.2', questionnaire_recu_le: null }, 'Sec');
const R = await import('../src/lib/rappelsExamens.js');
const file = () => db.prepare('SELECT utilisateur_id u, cle, titre, urgent FROM rappel_courriel ORDER BY id').all();
R.genererRappelsExamens(A, { jour: '2026-09-16' });
t('J-7 du délai : le professeur', file().length === 1 && file()[0].u === 10 && file()[0].cle === 'examens_questionnaires', file());
R.genererRappelsExamens(A, { jour: '2026-09-16' });
t('pas deux fois', file().length === 1);
R.genererRappelsExamens(A, { jour: '2026-09-24' });
t('délai dépassé : la coordination de la section', file().some(x => x.u === 20 && x.cle === 'examens_questionnaires_coordination' && x.urgent), file());
X.ecrireDetail({ annee: A, session: 1, ue_num: 256, cours_code: '256.2', questionnaire_recu_le: '2026-09-20' }, 'Sec');
const avant = file().length;
R.genererRappelsExamens(A, { jour: '2026-09-23' });
t('questionnaire reçu : plus de rappel', file().length === avant);
db.prepare("UPDATE epreuve_session1 SET s1_visite_date = '2026-11-05', s1_visite_heure = '18:00'").run();
R.genererRappelsExamens(A, { jour: '2026-11-04' });
t('veille de la visite des copies', file().some(x => x.cle === 'examens_visite' && /Demain/.test(x.titre)));
R.genererRappelsExamens(A, { jour: '2026-11-06' });
t('lendemain : archivage', file().some(x => x.cle === 'examens_archivage'));
// ── La page de garde de l'enseignant (3.5.234) ──
const pg = X.garde({ ...l[0], aa_choisis: [{ aa_code: 'AA256.1', description: 'Réaliser un examen scanner', questions: 'Q1, Q3', points: 25 }], etudiants: [], pages: 6 });
t('page vierge : une seule page, questions, points et total', (pg.match(/Examen — 1re session/g) || []).length === 1 && pg.includes('Q1, Q3') && pg.includes('…… / 25') && pg.includes('6</b> page(s)'), pg.slice(0, 200));
t('elle porte l’établissement', /class="etab"/.test(pg));
// ── La grille de l'examen (3.5.240) ──
const gr = X.nettoyerGrille([{ num: 'Q1', libelle: 'Décrire', aa_code: 'AA256.1', points: '6.5' }, { libelle: 'Hors acquis', aa_code: 'AA999', points: 3 },
  { num: 'Q3', aa_code: 'AA256.1', points: 7.3 }, {}], new Set(['AA256.1']));
t('grille nettoyée : vide écartée, acquis inconnu retiré, demi-points', gr.length === 3 && gr[1].aa_code === '' && gr[1].num === 'Q2' && gr[2].points === 7.5, gr);
X.ecrireGrille(l[0], gr.filter(q => q.aa_code), 'test');
t('la grille se garde et se relit', X.lireGrille(l[0]).length === 2);
const pg2 = X.garde({ ...l[0], etudiants: [] });
t('la page de garde lit la grille : questions, sommes par acquis, total', pg2.includes('Grille de correction') && pg2.includes('Décrire') && pg2.includes('Q1, Q3') && pg2.includes('…… / 14') && pg2.includes('× 1,429'), pg2.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
