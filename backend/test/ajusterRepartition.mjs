/* Banc de « Ajuster au détail » (Charles, 24 novembre 2026). node test/ajusterRepartition.mjs
   Le repère de l'horaire (minutes par année civile, séances annulées exclues) et l'écriture ajustée
   (total conservé sinon 400, remarque posée sans écraser une remarque manuelle, chiffres gardés quand les dates tranchent). */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-ajust-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const { default: db, runSchema } = await import('../src/db/index.js');
runSchema();
const { migrerHoraire } = await import('../src/routes/horaire.js');
const { default: route, migrerRepartition, remarqueAjustee } = await import('../src/routes/repartitionPeriodes.js');
migrerHoraire(db); migrerRepartition(db);
db.exec(`CREATE TABLE IF NOT EXISTS organisation_ue (id INTEGER PRIMARY KEY AUTOINCREMENT, ue_num INTEGER NOT NULL, section TEXT NOT NULL,
  annee_scolaire TEXT NOT NULL, num_organisation INTEGER NOT NULL DEFAULT 1, date_debut TEXT, date_fin TEXT,
  UNIQUE(ue_num, section, annee_scolaire, num_organisation))`);
for (const s of ['ALTER TABLE attribution ADD COLUMN en_conge INTEGER DEFAULT 0', 'ALTER TABLE ue ADD COLUMN pot_code TEXT',
  'ALTER TABLE utilisateur ADD COLUMN perimetre_toutes INTEGER',
  'CREATE TABLE IF NOT EXISTS utilisateur_section (utilisateur_id INTEGER, section_code TEXT)']) { try { db.exec(s); } catch { /* déjà là */ } }
try { db.exec("INSERT INTO section (code) VALUES ('AESI')"); } catch { /* */ }
try { db.exec("INSERT INTO annee_scolaire (code, active) VALUES ('2026-2027', 1)"); } catch { /* */ }
const A = '2026-2027';
db.prepare("INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_aut) VALUES (333, ?, 'UE 333', 'AESI', 10), (334, ?, 'UE 334', 'AESI', 0)").run(A, A);
const cours = db.prepare('INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ct_pp, section, ue_num, cours_per) VALUES (?,?,?,?,?,?,?)');
cours.run('333.1', A, 'Cours 1', 'CT', 'AESI', 333, 40);
cours.run('333.2', A, 'Cours 2', 'CT', 'AESI', 333, 20);
cours.run('334.1', A, 'Cours 334', 'CT', 'AESI', 334, 30);
// UE 333 : à cheval sur deux années civiles ; UE 334 : entièrement en 2026.
db.prepare("INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation, date_debut, date_fin) VALUES (333,'AESI',?,1,'2026-09-14','2027-03-31')").run(A);
db.prepare("INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation, date_debut, date_fin) VALUES (334,'AESI',?,1,'2026-09-14','2026-12-18')").run(A);
db.prepare("INSERT INTO professeur (id, nom, prenom) VALUES (1, 'Dupont', 'Anne')").run();
const att = db.prepare(`INSERT INTO attribution (section, contrat_mdp, annee_scolaire, ue_num, num_organisation, code_cours, type_cours, code,
  professeur_id, periodes_attribuees, autonomie_attribuee, en_conge, valide) VALUES ('AESI','IIP',?,?,1,?,'CT','A',1,?,?,0,1)`);
att.run(A, 333, '333.1', 40, 6);
att.run(A, 333, '333.2', 20, 4);
att.run(A, 334, '334.1', 30, 0);
const sea = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, date, heure_debut, heure_fin, minutes, cours_code, ue_num, annule)
  VALUES (?,?,?,?,?,?,?,?)`);
// 333.1 : 3 séances de 100 min en 2026, 1 en 2027, 1 annulée en 2027.
sea.run(A, '2026-09-21', '18:00', '19:40', 100, '333.1', 333, 0);
sea.run(A, '2026-10-05', '18:00', '19:40', 100, '333.1', 333, 0);
sea.run(A, '2026-11-09', '18:00', '19:40', null, '333.1', 333, 0);   // minutes calculées des heures
sea.run(A, '2027-01-11', '18:00', '19:40', 100, '333.1', 333, 0);
sea.run(A, '2027-02-01', '18:00', '19:40', 100, '333.1', 333, 1);    // annulée : hors compte
// 333.2 : tout en 2027.
sea.run(A, '2027-02-08', '18:00', '20:00', 120, '333.2', 333, 0);
db.prepare(`INSERT INTO utilisateur (id, email, nom_complet, role, actif, password_hash) VALUES
  (20, 'charles.sohet@x', 'Charles Sohet', 'directeur', 1, 'x'), (30, 'coo@x', 'Coordination AESI', 'coordination', 1, 'x')`).run();

let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); } };

const { default: express } = await import('express');
const { signToken } = await import('../src/middleware/auth.js');
const app = express(); app.use(express.json()); app.use('/api/repartition', route);
const srv = app.listen(0); const port = srv.address().port;
const tok = uid => signToken(db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(uid));
const lire = async () => (await fetch(`http://127.0.0.1:${port}/api/repartition?annee=${A}`, { headers: { Authorization: `Bearer ${tok(20)}` } })).json();
const ajuster = async (uid, b) => { const r = await fetch(`http://127.0.0.1:${port}/api/repartition/ajuster`, { method: 'POST',
  headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { s: r.status, j: await r.json().catch(() => null) }; };
const ligne = (d, ue, code, nature = 'cours') => d.ues.find(u => u.ue_num === ue).lignes.find(l => (l.cours_code || null) === code && l.nature === nature);

console.log('\nLe repère de l’horaire');
let d = await lire();
const h1 = ligne(d, 333, '333.1').horaire;
t('333.1 : 300 min en 2026, 100 en 2027 (annulée exclue, minutes tirées des heures)', h1 && h1.c1_min === 300 && h1.c2_min === 100 && h1.part_c1 === 0.75, h1);
t('333.2 : tout en 2027', ligne(d, 333, '333.2').horaire?.part_c1 === 0, ligne(d, 333, '333.2').horaire);
const ha = ligne(d, 333, null, 'autonomie').horaire;
t('autonomie : repère de toute l’UE', ha && ha.c1_min === 300 && ha.c2_min === 220 && ha.tous_cours === true, ha);
t('une seule organisation : pas « toute l’UE »', h1.toute_ue === false);
t('sans séance : null', ligne(d, 334, '334.1').horaire === null);
t('le repère ne change pas la proposition (dates 333 ≈ 54 %, clé 40-60)', ligne(d, 333, '333.1').reel_c1 === 16 && ligne(d, 333, '333.1').reel_c2 === 24, ligne(d, 333, '333.1'));
db.prepare("INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation, date_debut, date_fin) VALUES (333,'AESI',?,2,'2027-02-01','2027-06-30')").run(A);
d = await lire();
t('deux organisations : le repère de l’UE entière, et il le dit', ligne(d, 333, '333.1').horaire?.toute_ue === true);
db.prepare('DELETE FROM organisation_ue WHERE num_organisation = 2').run();

console.log('\nL’écriture ajustée');
const avant = JSON.stringify(db.prepare('SELECT * FROM repartition_periodes').all());
let r = await ajuster(20, { annee: A, ue_num: 333, num_organisation: 1, lignes: [{ cours_code: '333.1', nature: 'cours', reel_c1: 30, reel_c2: 11 }] });
t('total changé (41 au lieu de 40) : 400', r.s === 400 && /rester à 40/.test(r.j?.error || ''), r);
r = await ajuster(20, { annee: A, ue_num: 333, lignes: [{ cours_code: '333.1', nature: 'cours', reel_c1: 30.5, reel_c2: 9.5 }] });
t('demi-période : 400', r.s === 400, r);
r = await ajuster(20, { annee: A, ue_num: 333, lignes: [{ cours_code: '333.1', nature: 'cours', reel_c1: 30, reel_c2: 10, prevu_c1: 30, prevu_c2: 11 }] });
t('prévu changé : 400', r.s === 400 && /prévu/.test(r.j?.error || ''), r);
t('rien n’est écrit sur un refus', JSON.stringify(db.prepare('SELECT * FROM repartition_periodes').all()) === avant);
r = await ajuster(30, { annee: A, ue_num: 333, lignes: [{ cours_code: '333.1', nature: 'cours', reel_c1: 30, reel_c2: 10 }] });
t('une coordination n’écrit pas (mêmes droits que l’enregistrement)', r.s === 403, r);

// Une remarque écrite à la main sur 333.2
db.prepare(`INSERT INTO repartition_periodes (annee_scolaire, ue_num, num_organisation, cours_code, nature, prevu_c1, prevu_c2, reel_c1, reel_c2, remarque)
  VALUES (?, 333, 1, '333.2', 'cours', 8, 12, 8, 12, 'Épreuve surveillée en janvier')`).run(A);
r = await ajuster(20, { annee: A, ue_num: 333, num_organisation: 1, lignes: [
  { cours_code: '333.1', nature: 'cours', reel_c1: 30, reel_c2: 10, prevu_c1: 30, prevu_c2: 10 },
  { cours_code: '333.2', nature: 'cours', reel_c1: 2, reel_c2: 18 },
  { cours_code: null, nature: 'autonomie', reel_c1: 7, reel_c2: 3, prevu_c1: 7, prevu_c2: 3 }] });
t('écriture : 3 lignes', r.s === 200 && r.j.enregistrees === 3, r);
const row = c => db.prepare("SELECT * FROM repartition_periodes WHERE ue_num = 333 AND COALESCE(cours_code,'') = ?").all(c);
const r1 = row('333.1')[0], r2 = row('333.2')[0];
t('les chiffres sont écrits', r1.reel_c1 === 30 && r1.reel_c2 === 10 && r1.prevu_c1 === 30 && r2.reel_c1 === 2 && r2.reel_c2 === 18);
t('le prévu non fourni reste tel quel', r2.prevu_c1 === 8 && r2.prevu_c2 === 12, r2);
t('la remarque nomme qui et quand', /^Ajusté au détail par SOHET Charles le \d{2}\/\d{2}\/\d{4}$/.test(r1.remarque), r1.remarque);
t('une remarque manuelle n’est pas écrasée', /^Épreuve surveillée en janvier · Ajusté au détail par SOHET Charles le /.test(r2.remarque), r2.remarque);
t('autonomie : une seule ligne (code NULL)', row('').length === 1 && row('')[0].reel_c1 === 7, row(''));
r = await ajuster(20, { annee: A, ue_num: 333, lignes: [{ cours_code: '333.2', nature: 'cours', reel_c1: 3, reel_c2: 17 }] });
const r2b = row('333.2')[0];
t('un second ajustement remplace la mention, sans l’empiler', r.s === 200 && (r2b.remarque.match(/Ajusté au détail/g) || []).length === 1
  && r2b.remarque.startsWith('Épreuve surveillée en janvier · '), r2b.remarque);
d = await lire();
t('le GET relit les chiffres ajustés et le total suit', ligne(d, 333, '333.1').reel_c1 === 30 && ligne(d, 333, '333.2').reel_c1 === 3);

console.log('\nLes dates tranchent, l’ajustement garde ses chiffres');
// UE 334 tout en 2026 : une saisie sans remarque suit les dates ; ajustée, elle garde ses chiffres.
d = await lire();
t('334 proposé tout en 2026', ligne(d, 334, '334.1').reel_c1 === 30 && ligne(d, 334, '334.1').reel_c2 === 0, ligne(d, 334, '334.1'));
r = await ajuster(20, { annee: A, ue_num: 334, lignes: [{ cours_code: '334.1', nature: 'cours', reel_c1: 26, reel_c2: 4, prevu_c1: 26, prevu_c2: 4 }] });
d = await lire();
const l334 = ligne(d, 334, '334.1');
t('ajustée, la saisie garde 26 / 4 malgré les dates', r.s === 200 && l334.reel_c1 === 26 && l334.reel_c2 === 4 && !l334.recalcule_dates, l334);
db.prepare("UPDATE repartition_periodes SET remarque = NULL WHERE ue_num = 334").run();
d = await lire();
t('sans remarque, la même saisie suivrait les dates (règle de 3.5.676)', ligne(d, 334, '334.1').reel_c1 === 30);

console.log('\nLa mention');
t('remarqueAjustee : vide → mention seule', /^Ajusté au détail par X le 24\/11\/2026$/.test(remarqueAjustee('', 'X', new Date('2026-11-24T10:00:00Z'))));

srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
