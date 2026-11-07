/* Banc de l'absence d'un enseignant (3.5.210) : décider une séance écrit l'horaire ; revenir sur une décision le rétablit.
   node test/absencesProf.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-absprof-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
const { migrerAbsences, decider, registre, texteEtudiant, retirer } = await import('../src/lib/absencesEnseignant.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
for (const s of ['CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT)',
  'CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, email TEXT, role TEXT, professeur_id INTEGER)',
  `CREATE TABLE IF NOT EXISTS horaire_seance (id INTEGER PRIMARY KEY, annee_scolaire TEXT, section TEXT, date TEXT, heure_debut TEXT, heure_fin TEXT, minutes INTEGER,
    cours_code TEXT, ue_num INTEGER, matiere TEXT, professeur_id INTEGER, local_texte TEXT, annule INTEGER DEFAULT 0, commentaire TEXT,
    modifie_lucie INTEGER DEFAULT 0, modifie_par TEXT, modifie_le TEXT)`,
  'CREATE TABLE IF NOT EXISTS lucie_notification (id INTEGER PRIMARY KEY, type TEXT, titre TEXT, corps TEXT, lien TEXT, cible_role TEXT, cible_user_id INTEGER, cree_par TEXT, section TEXT)']) { try { db.exec(s); } catch { /* */ } }
migrerAbsences(db);
db.prepare("INSERT INTO professeur VALUES (1,'Dupont','Anne'),(2,'Martin','Paul')").run();
db.prepare("INSERT INTO utilisateur VALUES (10,'anne@x','professeur',1)").run();
db.prepare(`INSERT INTO horaire_seance (id, annee_scolaire, section, date, heure_debut, heure_fin, minutes, cours_code, ue_num, professeur_id) VALUES
  (100,'2026-2027','TIM','2026-11-10','08:30','12:00',210,'67.1',67,1),(101,'2026-2027','TIM','2026-11-12','13:00','16:30',210,'67.1',67,1)`).run();
const a = db.prepare(`INSERT INTO absence_prof (user_id, professeur_id, du, au, motif) VALUES (10, 1, '2026-11-10', '2026-11-12', 'maladie')`).run().lastInsertRowid;
const ins = db.prepare(`INSERT INTO absence_prof_seance (absence_id, seance_id, date, heure_debut, heure_fin, cours_code, ue_num, section, cours_nom) VALUES (?,?,?,?,?,'67.1',67,'TIM','Anatomie')`);
ins.run(a, 100, '2026-11-10', '08:30', '12:00'); ins.run(a, 101, '2026-11-12', '13:00', '16:30');
const h = id => db.prepare('SELECT * FROM horaire_seance WHERE id = ?').get(id);

t('à traiter au départ', registre({ tout: true })[0].etat === 'a_traiter');
t('remplacée sans remplaçant : refusé', decider(a, 100, { decision: 'remplacee' }, 'Sec').erreur);
t('remplacée par l’absent : refusé', decider(a, 100, { decision: 'remplacee', remplacant_id: 1 }, 'Sec').erreur);
t('remplacée par Paul', decider(a, 100, { decision: 'remplacee', remplacant_id: 2 }, 'Sec').ok && h(100).professeur_id === 2 && h(100).annule === 0 && h(100).modifie_lucie === 1);
t('déplacée sans heures : refusé', decider(a, 101, { decision: 'deplacee', date: '2026-11-19' }, 'Sec').erreur);
t('déplacée au 19', decider(a, 101, { decision: 'deplacee', date: '2026-11-19', heure_debut: '13:00', heure_fin: '16:00' }, 'Sec').ok && h(101).date === '2026-11-19' && h(101).minutes === 180);
t('en cours puis traitée', registre({ tout: true })[0].etat === 'traitee');
t('revenir : annulée rétablit date et professeur', decider(a, 100, { decision: 'annulee' }, 'Sec').ok && h(100).annule === 1 && h(100).professeur_id === 1);
t('revenir : maintenue rétablit la séance déplacée', decider(a, 101, { decision: 'maintenue' }, 'Sec').ok && h(101).date === '2026-11-12' && h(101).annule === 0);
const s0 = db.prepare('SELECT * FROM absence_prof_seance WHERE seance_id = 100').get();
t('texte aux étudiants', /annulée/.test(texteEtudiant(s0)) && /10\/11\/2026/.test(texteEtudiant(s0)), texteEtudiant(s0));
t('section : filtre de la coordination', registre({ sections: ['OPTO'], tout: true }).length === 0 && registre({ sections: ['TIM'], tout: true }).length === 1);
t('retirer après décision : refusé', retirer({ id: 10 }, a).code === 409);
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
