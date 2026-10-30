/* Banc d'essai du carnet de cotes : le calcul (fonction pure) et la lecture des cases.
   node test/carnet.mjs — code de sortie non nul au premier faux. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-carnet-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const { lireValeur, propositions } = await import('../src/lib/carnet.js');
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };

console.log('\nLire une case');
t('« 12,5 » sur 20', lireValeur('12,5', 20).points === 12.5);
t('« 7.25 » sur 10', lireValeur('7.25', 10).points === 7.25);
t('« pp » → mention PP', lireValeur('pp', 20).mention === 'PP');
t('vide → rien', lireValeur('  ', 20).points === null && lireValeur('', 20).mention === null);
t('au-delà du maximum : refusé', !!lireValeur('21', 20).erreur);
t('trois décimales : refusé', !!lireValeur('12,125', 20).erreur);
t('texte : refusé', !!lireValeur('abs', 20).erreur);

console.log('\nLa proposition par acquis');
const N = (o) => new Map(Object.entries(o).map(([e, m]) => [Number(e), new Map(Object.entries(m).map(([k, v]) => [Number(k), v]))]));
const evaluations = [
  { id: 1, sur: 20, poids: 1, session: 1, aa: [{ aa_code: 'AA1', poids: 1 }] },
  { id: 2, sur: 10, poids: 2, session: 1, aa: [{ aa_code: 'AA1', poids: 1 }, { aa_code: 'AA2', poids: 1 }] },
  { id: 3, sur: 20, poids: 1, session: 1, aa: [] },                       // carnet seul
  { id: 4, sur: 20, poids: 1, session: 2, aa: [{ aa_code: 'AA1', poids: 1 }] },
];
const notes = N({ 1: { 7: { points: 12 }, 8: { mention: 'CM' } }, 2: { 7: { points: 5 }, 8: { points: 9 } }, 3: { 7: { points: 20 } }, 4: { 7: { points: 15 } } });
const p = propositions({ evaluations, notes, acquis: ['AA1', 'AA2'], etudiants: [7, 8, 9], session: 1 });
// AA1 de 7 : (12×1 + 10×2) / 3 = 10,67 → 11
t('pondérée par le poids de l’évaluation', p.get(7).aa.AA1.note === 11 && p.get(7).aa.AA1.sur20 === 10.7, p.get(7).aa.AA1);
t('AA2 : la seule évaluation qui le porte', p.get(7).aa.AA2.note === 10);
t('une mention sort du dénominateur (ne vaut pas zéro)', p.get(8).aa.AA1.note === 18, p.get(8).aa.AA1);
t('sans note : pas de proposition', !p.get(9).aa.AA1);
t('l’évaluation « carnet seul » ne touche pas les acquis', p.get(7).aa.AA1.nb === 2);
t('mais compte dans la moyenne du carnet', p.get(7).moyenne === Math.round(((12 + 10 * 2 + 20) / 4) * 10) / 10, p.get(7).moyenne);
const p2 = propositions({ evaluations, notes, acquis: ['AA1', 'AA2'], etudiants: [7], session: 2 });
t('la seconde session ne lit que ses évaluations', p2.get(7).aa.AA1.note === 15 && !p2.get(7).aa.AA2);
const pc = propositions({ evaluations: [{ id: 1, sur: 20, poids: 1, session: 1, aa: [] }], notes, acquis: [], etudiants: [7], session: 1 });
t('cours sans acquis : la note du cours', pc.get(7).aa[''].note === 12);
const arr = propositions({ evaluations: [{ id: 5, sur: 20, poids: 1, session: 1, aa: [] }], notes: N({ 5: { 1: { points: 9.5 } } }), acquis: [], etudiants: [1] });
t('9,5 s’arrondit à 10 (règle de la maison)', arr.get(1).aa[''].note === 10);

console.log(`\n${ok} ok, ${ko} faux`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
