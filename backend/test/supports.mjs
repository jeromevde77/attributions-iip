/* Banc des supports de cours (3.5.211). node test/supports.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-supports-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
const { migrerSupports, typeDe, deposerSupport, supportsDuCours, retirerSupport, supportsActifs, contenuDe, supportParId } = await import('../src/lib/supportsCours.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
try { db.exec('CREATE TABLE IF NOT EXISTS cours (cours_code TEXT, annee_scolaire TEXT, cours_nom TEXT)'); } catch { /* */ }
migrerSupports(db);
const pdf = Buffer.from('%PDF-1.4\n...'), zip = Buffer.from([0x50, 0x4B, 0x03, 0x04, 1, 2]);
t('PDF reconnu', typeDe(pdf, 'a.pdf') === 'application/pdf');
t('pptx reconnu à son nom', /presentation/.test(typeDe(zip, 'cours.pptx')));
t('un zip quelconque : refusé', typeDe(zip, 'x.zip') === null);
t('un exécutable déguisé : refusé', typeDe(Buffer.from('MZ....'), 'cours.pdf') === null);
const ctx = { coursCode: '67.1', ueNum: 67, annee: '2026-2027', user: { id: 10 }, nomAuteur: 'Anne' };
const x = deposerSupport(ctx, { titre: 'Chapitre 1', nom: 'chap1.pdf', contenu: 'data:application/pdf;base64,' + pdf.toString('base64') });
t('dépôt d’un PDF', x.ok, x);
t('le fichier est écrit', contenuDe(supportParId(x.id))?.equals(pdf));
t('trop gros : refusé', deposerSupport(ctx, { nom: 'g.pdf', contenu: Buffer.concat([pdf, Buffer.alloc(16 * 1024 * 1024)]).toString('base64') }).erreur);
t('type refusé', deposerSupport(ctx, { nom: 'x.txt', contenu: Buffer.from('bonjour').toString('base64') }).erreur);
t('listé pour le cours', supportsDuCours('67.1', '2026-2027').length === 1 && supportsActifs('2026-2027').length === 1);
retirerSupport(x.id, 'Anne');
t('retiré : hors liste et hors portail', !supportsDuCours('67.1', '2026-2027').length && !supportsActifs('2026-2027').length);
t('retiré : reste lisible avec les retirés', supportsDuCours('67.1', '2026-2027', { retires: true })[0].retire_par === 'Anne');
console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
