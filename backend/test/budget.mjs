/* Banc d'essai du budget des sections (docs/contexte/guide-budget-sections.md).
   node test/budget.mjs — code de sortie non nul au premier faux.
   Une base vide, les tables minimales, puis : les enveloppes du guide (126.437 €), la bascule
   fonctionnement / investissement à 499,99 / 500,00 € HT, et le périmètre d'une coordination
   éprouvé par les ROUTES (jeton, garde de section), pas seulement par les fonctions. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-budget-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'banc-budget';
const { default: db } = await import('../src/db/index.js');
db.function('lucie_auteur', () => 'banc'); db.function('lucie_auteur_id', () => null); db.function('lucie_geste', () => null);
db.exec(`
  CREATE TABLE section (code TEXT PRIMARY KEY, libelle TEXT);
  CREATE TABLE etudiant (id INTEGER PRIMARY KEY, section_rattachement TEXT, sortie_statut TEXT);
  CREATE TABLE etudiant_inscription (etudiant_id INTEGER, annee_scolaire TEXT, ue_num INTEGER);
  CREATE TABLE ue (ue_num INTEGER, annee_scolaire TEXT, section TEXT, hors_cursus INTEGER);
  CREATE TABLE ue_section (ue_num INTEGER, annee_scolaire TEXT, section_code TEXT);
  CREATE TABLE role_plafond (role TEXT, module TEXT, niveau TEXT, maj_le TEXT, PRIMARY KEY (role, module));
  CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, perimetre_toutes INTEGER);
  CREATE TABLE utilisateur_section (utilisateur_id INTEGER, section_code TEXT);
`);
for (const s of ['TIM', 'Optométrie', 'Psychomotricité', 'AeSI', 'Optique', 'ATNUP', 'Soins_plaies', 'Orthoptie', 'SAR'])
  db.prepare('INSERT INTO section (code, libelle) VALUES (?,?)').run(s, s);
db.prepare("INSERT INTO role_plafond VALUES ('coordination','budget','validation',NULL)").run();
db.prepare('INSERT INTO utilisateur (id, perimetre_toutes) VALUES (1, 0), (2, 0)').run();
db.prepare("INSERT INTO utilisateur_section VALUES (2, 'TIM')").run();

const { migrerBudget, default: routes } = await import('../src/routes/budget.js');
migrerBudget(db);
const { syntheseBudget, nature, enveloppe } = await import('../src/lib/budgetSections.js');

let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d !== '' ? '  → ' + JSON.stringify(d) : '')); } };

console.log('\nLes enveloppes du guide (A.4), budget 2027');
const x = syntheseBudget(2027);
const GUIDE = { TIM: 47240, 'Optométrie': 21942, 'Psychomotricité': 19550, AeSI: 15416, Optique: 11971, ATNUP: 6368, Soins_plaies: 3950 };
for (const [s, v] of Object.entries(GUIDE)) {
  const e = x.sections.find(y => y.section === s)?.enveloppe_brute;
  t(`${s} : ${v} €`, e === v, e);
}
const sousTotal = x.sections.filter(y => GUIDE[y.section] != null).reduce((s, y) => s + y.enveloppe_brute, 0);
t('sous-total des sept sections du guide : 126.437 €', sousTotal === 126437, sousTotal);
t('une section que le guide ne cite pas (SAR) : régime standard, socle 2.000 € et pondération 1', (() => {
  const s = x.sections.find(y => y.section === 'SAR'); return s && s.socle === 2000 && s.ponderation === 1; })(), x.sections.find(y => y.section === 'SAR'));
t("l'orthoptie n'a pas d'enveloppe, mais sa quote-part (1/3 du budget HE)", !x.sections.some(y => y.section === 'Orthoptie') && x.totaux.orthoptie === 8800, x.totaux.orthoptie);
t('la contribution à produits constants (A.5) : ≈ 186.500 € avec les seules sections du guide',
  Math.abs(259375 - (126437 + 8800 - 62420) - 186558) < 1);
t('la formule : socle + montant × pondération × effectif, arrondie à l’euro', enveloppe({ socle: 2000, ponderation: 1.3, effectif: 118 }, 130) === 21942);
console.log('\nLe coussin de la direction : 10 % jusqu’à 15.000 €, 20 % jusqu’à 30.000 €, 30 % au-delà');
const DISPO = { TIM: 37568, 'Optométrie': 19054, 'Psychomotricité': 17140, AeSI: 13833, Optique: 10774, ATNUP: 5731, Soins_plaies: 3555 };
for (const [s, v] of Object.entries(DISPO)) {
  const y = x.sections.find(z => z.section === s);
  t(`${s} : disponible ${v} €`, y.enveloppe === v && y.enveloppe_brute - y.coussin === v, y);
}
t('pas d’effet de seuil : 15.000 € → 13.500 € ; 15.001 € → 13.500,80 € (arrondi 13.501 €)', (await import('../src/lib/budgetSections.js')).coussin(15001, x.parametres) === 1500);
t('le coussin des sept sections : 18.782 €', x.sections.filter(y => GUIDE[y.section] != null).reduce((s, y) => s + y.coussin, 0) === 18782);
t("la réserve d'investissement de l'Optométrie : 10.000 €", x.sections.find(y => y.section === 'Optométrie').reserve_invest === 10000);

console.log('\nFonctionnement ou investissement (A.6) : le prix UNITAIRE HT contre le seuil');
t('499,99 € HT → fonctionnement', nature(499.99, 500) === 'fonctionnement');
t('500,00 € HT → investissement', nature(500, 500) === 'investissement');
t('10 × 100 € HT (1.000 € au total) → fonctionnement : c’est le prix unitaire qui compte', nature(100, 500) === 'fonctionnement');
t('le seuil se règle : 499,99 € avec un seuil à 400 € → investissement', nature(499.99, 400) === 'investissement');

console.log('\nLe périmètre d’une coordination — par les routes');
const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const app = express(); app.use(express.json()); app.use('/api/budget', routes);
const srv = app.listen(0); const port = srv.address().port;
const jeton = u => jwt.sign(u, 'banc-budget');
const DIR = jeton({ id: 1, role: 'directeur', email: 'dir@banc' });
const COO = jeton({ id: 2, role: 'coordination', email: 'coo@banc' });
const appel = async (methode, chemin, j, corps) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/budget${chemin}`, { method: methode,
    headers: { Authorization: `Bearer ${j}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const lTim = await appel('POST', '/ligne', COO, { annee_civile: 2027, section: 'TIM', details: 'Marqueurs', prix_unitaire: 2, quantite: 50 });
t('la coordination écrit dans SA section (TIM), sans demande', lTim.s === 200 && lTim.j.id > 0, lTim);
const lOpt = await appel('POST', '/ligne', COO, { annee_civile: 2027, section: 'Optométrie', details: 'Lampe', prix_unitaire: 900, quantite: 1 });
t('… et pas dans une autre (Optométrie : 403)', lOpt.s === 403, lOpt.s);
const lDir = await appel('POST', '/ligne', DIR, { annee_civile: 2027, section: 'Optométrie', details: 'Chaise d’examen', prix_unitaire: 2500, quantite: 4, priorite: 'indispensable' });
t('la direction écrit partout', lDir.s === 200, lDir);
t('elle ne modifie pas une ligne d’une autre section (404/403)', [403, 404].includes((await appel('PUT', `/ligne/${lDir.j.id}`, COO, { details: 'x', section: 'Optométrie' })).s));
const lu = await appel('GET', '/sections?annee=2027', COO);
t('le tableau d’une coordination ne montre que sa section', lu.s === 200 && lu.j.sections.length === 1 && lu.j.sections[0].section === 'TIM', lu.j.sections?.map(s => s.section));
t('… sans les totaux de l’école ni la contribution', lu.j.totaux === null && lu.j.parametres.resultat_n1 === undefined);
t('… ni son enveloppe brute, ni le coussin, ni le barème : seulement le disponible (37.568 €)',
  lu.j.sections[0].enveloppe === 37568 && lu.j.sections[0].enveloppe_brute === undefined && lu.j.sections[0].coussin === undefined
  && lu.j.parametres.coussin_taux1 === undefined, lu.j.sections[0]);
t('… ni les investissements des autres sections', !lu.j.investissements.some(i => i.section !== 'TIM'));
t('elle ne lit pas le budget d’une autre section (403)', (await appel('GET', '/?annee=2027&section=Optométrie', COO)).s === 403);
t('elle ne règle pas les paramètres (403)', (await appel('PUT', '/parametres', COO, { annee: 2027, parametres: { montant_etudiant: 999 } })).s === 403);
t('elle n’arbitre pas (403)', (await appel('PUT', `/ligne/${lTim.j.id}/arbitrer`, COO, { statut: 'arbitre' })).s === 403);
const modCoo = await appel('PUT', `/ligne/${lTim.j.id}`, COO, { details: 'Marqueurs', section: 'TIM', prix_unitaire: 2, quantite: 60, statut: 'arbitre' });
t('elle modifie sa ligne, mais pas son statut (l’arbitrage est à la direction)',
  modCoo.s === 200 && db.prepare('SELECT statut, quantite FROM budget_ligne WHERE id = ?').get(lTim.j.id).statut === 'prevu');
const inv = await appel('POST', '/inventaire', COO, { section: 'TIM', type_bien: 'Ordinateur', quantite: 3, annee_achat: 2020, etat: 'remplacer' });
t('elle tient l’inventaire de sa section', inv.s === 200);
t('… pas celui d’une autre (403)', (await appel('POST', '/inventaire', COO, { section: 'Optique', type_bien: 'Lampe à fente' })).s === 403);
t('l’inventaire lu par la coordination ne montre que sa section',
  (await appel('POST', '/inventaire', DIR, { section: 'Optique', type_bien: 'Frontofocomètre' })).s === 200
  && (await appel('GET', '/inventaire', COO)).j.biens.every(b => b.section === 'TIM'));

console.log('\nL’arbitrage des investissements (A.7)');
const arb = await appel('GET', '/sections?annee=2027', DIR);
const i0 = arb.j.investissements.find(i => i.id === lDir.j.id);
t('la chaise d’examen à 2.500 € HT est un investissement, à arbitrer', i0 && i0.statut === 'prevu' && i0.total_ht === 10000, i0);
t('amortie sur 5 ans (mobilier et matériel) : 2.000 € par an', i0.amortissement_annuel === 2000, i0);
t('un refus sans motif est refusé', (await appel('PUT', `/ligne/${lDir.j.id}/arbitrer`, DIR, { statut: 'refuse' })).s === 400);
t('la direction retient l’investissement', (await appel('PUT', `/ligne/${lDir.j.id}/arbitrer`, DIR, { statut: 'arbitre' })).s === 200);
const apres = (await appel('GET', '/sections?annee=2027', DIR)).j;
t('l’amortissement accordé entre dans l’impact sur la contribution', apres.totaux.contribution.amortissements_accordes === 2000, apres.totaux.contribution);
t('l’investissement ne mange pas l’enveloppe de fonctionnement de la section',
  apres.sections.find(s => s.section === 'Optométrie').encode_fonctionnement === 0);

srv.close();
console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
