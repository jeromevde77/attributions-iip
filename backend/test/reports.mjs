/* Banc d'essai des reports de notes. Base temporaire, routes réelles. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-rep-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'change-me-in-prod';

const M = await import('../src/db/index.js');
const db = M.default;
M.runSchema();
const A = await import('../src/routes/acquis.js');
A.migrerAA(db); A.migrerSessions(db);

let ok = 0, ko = 0;
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log('  ok   ' + nom); }
  else { ko++; console.log('  FAUX ' + nom + (detail ? '  → ' + detail : '')); }
};

// ── Décor : une UE 900, deux cours, deux acquis chacun ─────────────────────
// etudiant_inscription naît dans server.js : le banc la pose lui-même, avec
// les seules colonnes que la règle de report interroge.
db.exec(`
  CREATE TABLE IF NOT EXISTS etudiant_inscription (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER NOT NULL, ue_num INTEGER NOT NULL,
    annee_scolaire TEXT NOT NULL, resultat TEXT,
    UNIQUE(etudiant_id, ue_num, annee_scolaire)
  );
  CREATE TABLE IF NOT EXISTS etudiant_note_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER NOT NULL, annee_scolaire TEXT NOT NULL,
    ue_num INTEGER NOT NULL, type TEXT NOT NULL, code TEXT NOT NULL,
    cours_code TEXT, points REAL, non_evalue INTEGER NOT NULL DEFAULT 0,
    va INTEGER NOT NULL DEFAULT 0, commentaire TEXT,
    UNIQUE(etudiant_id, annee_scolaire, ue_num, type, code)
  );
`);
db.exec(`
  INSERT OR IGNORE INTO ue (ue_num, ue_nom, annee_scolaire, section, ue_niv)
    VALUES (900, 'UE de test', '2025-2026', 'TIM', 'BA1');
  INSERT OR IGNORE INTO cours (ue_num, cours_code, cours_nom, annee_scolaire, cours_per)
    VALUES (900, 'C1', 'Cours un', '2025-2026', 40),
           (900, 'C2', 'Cours deux', '2025-2026', 40);
  INSERT OR IGNORE INTO aa (ue_num, aa_code, aa_num, cours_code, description)
    VALUES (900, 'AA900.1', 1, 'C1', 'Premier acquis'),
           (900, 'AA900.2', 2, 'C1', 'Deuxième acquis'),
           (900, 'AA900.3', 3, 'C2', 'Troisième acquis'),
           (900, 'AA900.4', 4, 'C2', 'Quatrième acquis');
`);
for (const [cc, aa] of [['C1','AA900.1'],['C1','AA900.2'],['C2','AA900.3'],['C2','AA900.4']]) {
  db.prepare(`INSERT OR REPLACE INTO aa_ponderation (ue_num, cours_code, aa_code, poids)
              VALUES (?,?,?,50)`).run(900, cc, aa);
}
db.prepare(`INSERT OR REPLACE INTO cours_ponderation (ue_num, cours_code, poids)
            VALUES (?,?,50)`).run(900, 'C1');
db.prepare(`INSERT OR REPLACE INTO cours_ponderation (ue_num, cours_code, poids)
            VALUES (?,?,50)`).run(900, 'C2');

const poser = (etud, notes, { resultat = 'ajourne', an = '2025-2026' } = {}) => {
  db.prepare(`INSERT OR REPLACE INTO etudiant_inscription
    (etudiant_id, ue_num, annee_scolaire, resultat) VALUES (?,?,?,?)`)
    .run(etud, 900, an, resultat);
  for (const [cc, aa, pts] of notes) {
    db.prepare(`INSERT INTO etudiant_note_detail
      (etudiant_id, ue_num, annee_scolaire, type, code, cours_code, points, non_evalue)
      VALUES (?,?,?,'aa',?,?,?,0)`).run(etud, 900, an, 's2|' + aa, cc, pts);
  }
};

const R = { ...A.reglesDeliberation(), base_s2: 'cours_aa', seuil_aa: 10, arrondi: 'entier' };

console.log('\n— Le grain et la règle de non-compensation —');

// 1. Un cours dont les deux acquis passent → le cours se reporte.
poser(1, [['C1','AA900.1',14],['C1','AA900.2',12],['C2','AA900.3',8],['C2','AA900.4',6]]);
let e = A.reportsEligibles(1, 900, '2026-2027', R);
t('le cours dont tous les acquis passent est proposé',
  e.cours.length === 1 && e.cours[0].cours_code === 'C1', JSON.stringify(e.cours));
t('le cours en échec n’est pas proposé', !e.cours.some(c => c.cours_code === 'C2'));
t('les acquis du cours réussi sont proposés séparément',
  e.aa.filter(a => a.cours_code === 'C1').length === 2);

// 2. LE CAS QUI COMPTE : moyenne de cours au-dessus du seuil, un acquis dessous.
//    16 et 6 → moyenne 11, mais 6 n’est pas acquis. Le cours ne se reporte pas.
poser(2, [['C1','AA900.1',16],['C1','AA900.2',6],['C2','AA900.3',4],['C2','AA900.4',4]]);
e = A.reportsEligibles(2, 900, '2026-2027', R);
t('un acquis en défaut interdit le report du cours, même si la moyenne passe',
  e.cours.length === 0, JSON.stringify(e.cours));
t('l’acquis réussi reste proposé, lui',
  e.aa.length === 1 && e.aa[0].aa_code === 'AA900.1', JSON.stringify(e.aa));

// 3. L’arrondi de la maison décide : 9,6 passe en « entier », pas en « centieme ».
poser(3, [['C1','AA900.1',9.6],['C1','AA900.2',11],['C2','AA900.3',4],['C2','AA900.4',4]]);
t('9,6 passe quand la maison arrondit à l’unité',
  A.reportsEligibles(3, 900, '2026-2027', { ...R, arrondi: 'entier' }).cours.length === 1);
t('9,6 ne passe pas quand la maison garde le centième',
  A.reportsEligibles(3, 900, '2026-2027', { ...R, arrondi: 'centieme' }).cours.length === 0);

// 4. Le seuil de la maison, s’il est plus exigeant.
t('un seuil à 12 écarte un acquis à 11',
  A.reportsEligibles(1, 900, '2026-2027', { ...R, seuil_aa: 12 })
    .aa.every(a => a.note >= 12));

// 5. Le grain suit la base de seconde session.
t('base « aa » : aucun cours proposé',
  A.reportsEligibles(1, 900, '2026-2027', { ...R, base_s2: 'aa' }).cours.length === 0);
t('base « cours » : aucun acquis proposé',
  A.reportsEligibles(1, 900, '2026-2027', { ...R, base_s2: 'cours' }).aa.length === 0);

console.log('\n— Ce qui ne doit rien proposer —');

// 6. UE réussie : rien à représenter, donc rien à dispenser.
poser(4, [['C1','AA900.1',18],['C1','AA900.2',18],['C2','AA900.3',18],['C2','AA900.4',18]],
      { resultat: 'reussi' });
e = A.reportsEligibles(4, 900, '2026-2027', R);
t('une unité réussie ne propose aucun report', e.cours.length === 0 && e.aa.length === 0);

// 7. Un acquis non évalué ne vaut pas zéro, mais il ne passe pas non plus.
db.prepare(`INSERT OR REPLACE INTO etudiant_inscription
  (etudiant_id, ue_num, annee_scolaire, resultat) VALUES (?,?,?,?)`)
  .run(5, 900, '2025-2026', 'ajourne');
db.prepare(`INSERT INTO etudiant_note_detail
  (etudiant_id, ue_num, annee_scolaire, type, code, cours_code, points, non_evalue)
  VALUES (?,?,?,'aa',?,?,?,1)`).run(5, 900, '2025-2026', 's2|AA900.1', 'C1', null);
db.prepare(`INSERT INTO etudiant_note_detail
  (etudiant_id, ue_num, annee_scolaire, type, code, cours_code, points, non_evalue)
  VALUES (?,?,?,'aa',?,?,?,0)`).run(5, 900, '2025-2026', 's2|AA900.2', 'C1', 15);
e = A.reportsEligibles(5, 900, '2026-2027', R);
t('un acquis non évalué empêche le report du cours', e.cours.length === 0);
t('mais l’acquis évalué et réussi reste proposé',
  e.aa.length === 1 && e.aa[0].aa_code === 'AA900.2');

// 8. Aucune note du tout.
t('un étudiant sans note ne propose rien',
  A.reportsEligibles(999, 900, '2026-2027', R).cours.length === 0);

console.log('\n— La note reportée —');
e = A.reportsEligibles(1, 900, '2026-2027', R);
t('le report du cours porte les notes réelles des acquis, pas un 10 forfaitaire',
  JSON.stringify(e.cours[0].aas.map(a => a.note).sort()) === JSON.stringify([12, 14]),
  JSON.stringify(e.cours[0].aas));

console.log(`\n${ok} vérifications passées, ${ko} en défaut.`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
