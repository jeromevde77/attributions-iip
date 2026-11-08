/* Banc de la bascule des professeurs (3.5.212). node test/bascule.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-bascule-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const db = (await import('../src/db/index.js')).default;
try { db.exec('CREATE TABLE IF NOT EXISTS lucie_config (cle TEXT PRIMARY KEY, valeur TEXT)'); } catch { /* */ }
const { estBascule, ecrireBascule, refusBascule } = await import('../src/lib/bascule.js');
let ok = 0, ko = 0;
const t = (nom, c) => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom); } };
const prof = { role: 'professeur' };
t('sans date : rien ne change', !estBascule(prof));
ecrireBascule('2099-01-01', 'Dir');
t('date future : il entre encore', !estBascule(prof));
ecrireBascule('2020-01-01', 'Dir');
t('date passée : le professeur est renvoyé', estBascule(prof));
t('la coordination garde Lucie', !estBascule({ role: 'coordination' }));
t('la direction garde Lucie', !estBascule({ role: 'directeur' }));
t('le relais de l’espace passe', !estBascule({ role: 'professeur', relais: true }));
t('l’aperçu de la direction passe', !estBascule({ role: 'professeur', preview: true }));
t('le refus donne l’adresse de l’espace', refusBascule().bascule && /^https:/.test(refusBascule().url));
ecrireBascule(null, 'Dir');
t('date retirée : il rentre', !estBascule(prof));
let e = null; try { ecrireBascule('01/02/2027', 'Dir'); } catch (x) { e = x; }
t('une date mal écrite : refusée', e?.status === 400);
console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
