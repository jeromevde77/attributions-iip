/* Banc d'essai des visites de stage et de la fiche de transport (lib/visitesStage.js).
   node test/visitesStage.mjs — code de sortie non nul au premier faux.
   Un stage, son lieu, son professeur : la visite se pose, paraît à la bonne personne, se marque faite avec ses km ;
   la distance se retient ; la règle de départ et le taux font le montant ; la fiche se signe dans l'ordre et verrouille. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-vs-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'banc-vs';
const { default: db } = await import('../src/db/index.js');
db.function('lucie_auteur', () => 'banc'); db.function('lucie_auteur_id', () => null); db.function('lucie_geste', () => null);
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
if (!tables.has('utilisateur')) db.exec('CREATE TABLE utilisateur (id INTEGER PRIMARY KEY, email TEXT, nom_complet TEXT, role TEXT, actif INTEGER, professeur_id INTEGER, perimetre_toutes INTEGER)');
for (const c of ['professeur_id INTEGER', 'perimetre_toutes INTEGER']) { try { db.exec(`ALTER TABLE utilisateur ADD COLUMN ${c}`); } catch { /* là */ } }
if (!tables.has('utilisateur_section')) db.exec('CREATE TABLE utilisateur_section (utilisateur_id INTEGER, section_code TEXT)');
if (!tables.has('etudiant')) db.exec('CREATE TABLE etudiant (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, section_rattachement TEXT)');
try { db.exec('ALTER TABLE etudiant ADD COLUMN section_rattachement TEXT'); } catch { /* là */ }
db.exec('CREATE TABLE IF NOT EXISTS professeur (id INTEGER PRIMARY KEY, nom TEXT, prenom TEXT, adresse_rue TEXT, code_postal TEXT, commune TEXT)');
db.exec("CREATE TABLE IF NOT EXISTS parametre (cle TEXT PRIMARY KEY, valeur TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS etablissement (id INTEGER PRIMARY KEY, adresse TEXT)");
db.prepare("INSERT OR REPLACE INTO etablissement (id, adresse) VALUES (1, 'Route de Lennik 808, 1070 Anderlecht')").run();
const { migrerStages } = await import('../src/routes/stages.js');
migrerStages(db);
db.prepare("INSERT INTO professeur (id, nom, prenom, adresse_rue, code_postal, commune) VALUES (10, 'Dupont', 'Anne', 'Rue des Lilas 3', '1300', 'Wavre'), (11, 'Martin', 'Paul', NULL, NULL, NULL)").run();
for (const [id, r, p] of [[1, 'professeur', 10], [2, 'professeur', 11], [3, 'coordination', null], [4, 'directeur', null], [5, 'secretariat', null], [6, 'coordination', null]])
  db.prepare('INSERT INTO utilisateur (id, email, nom_complet, role, actif, professeur_id) VALUES (?,?,?,?,1,?)').run(id, `u${id}@x.be`, `Personne ${id}`, r, p);
db.prepare("INSERT INTO utilisateur_section VALUES (3, 'TIM'), (6, 'Psychomotricité')").run();
db.prepare("INSERT INTO etudiant (id, nom, prenom, section_rattachement) VALUES (100, 'Lambert', 'Marie', 'TIM')").run();
db.prepare("INSERT INTO stage_lieu (id, nom, adresse, cp, localite) VALUES (7, 'Hôpital Erasme', 'Route de Lennik 808', '1070', 'Anderlecht')").run();
db.prepare("INSERT INTO stage (id, etudiant_id, annee_scolaire, section, lieu_id, professeur_id, statut) VALUES (50, 100, '2026-2027', 'TIM', 7, 10, 'en_cours')").run();

const V = await import('../src/lib/visitesStage.js');
V.migrerVisites();
let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d !== '' ? '  → ' + JSON.stringify(d) : '')); } };
const U = id => db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id);
const prof = U(1), autre = U(2), coord = U(3), dir_ = U(4), sec = U(5), coordAutre = U(6);

console.log('\nLes stages à suivre');
t('le professeur de stage voit son stage', V.stagesASuivre(prof, '2026-2027').length === 1);
t('un autre professeur ne le voit pas', V.stagesASuivre(autre, '2026-2027').length === 0);
t('la coordination de TIM le voit', V.stagesASuivre(coord, '2026-2027').length === 1);
t('la coordination d’une autre section ne le voit pas', V.stagesASuivre(coordAutre, '2026-2027').length === 0);

console.log('\nPoser une visite');
let x = V.ecrireVisite(autre, null, { stage_id: 50, date: '2026-10-05' });
t('un autre professeur ne pose pas de visite sur ce stage', x.code === 404, x);
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2026-10-05', heure_debut: '10:00', heure_fin: '09:00' });
t('fin avant début refusée', x.code === 400, x);
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2026-10-05', heure_debut: '10:00', heure_fin: '11:00', km_ar: 12, statut: 'faite' });
t('visite posée', x.ok, x);
const v1 = x.id;
t('le départ par défaut est l’école (règle « aucun »)', db.prepare('SELECT depart FROM stage_visite WHERE id=?').get(v1).depart === 'ecole');
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2099-01-05', statut: 'faite' });
t('une visite à venir ne se marque pas faite', x.code === 400, x);
t('la distance se retient', V.kmPropose(10, 7, 'ecole') === 12);
t('la visite paraît dans les visites du professeur', V.visitesDuProf(10, '2026-10-01', '2026-10-31').length === 1);
t('pas chez l’autre', V.visites(autre, { du: '2026-10-01', au: '2026-10-31' }).length === 0);

console.log('\nLa fiche de transport');
let f = V.fiche(10, '2026-10');
t('règle « aucun » : pas de montant, mais la fiche se tient', f.regle === 'aucun' && f.lignes[0].montant == null && f.km === 12 && !f.problemes.length, f);
V.ecrireRegle(10, 'domicile', null, 'banc');
f = V.fiche(10, '2026-10');
t('règle domicile, visite depuis l’école : hors règle signalé', !f.lignes[0].conforme && f.problemes.some(p => p.includes('départ')), f.problemes);
t('taux à régler signalé', f.problemes.some(p => p.includes('taux')));
x = V.ecrireVisite(prof, v1, { depart: 'domicile', km_ar: 40 });
V.ecrireTaux('0,4326');
f = V.fiche(10, '2026-10');
t('montant = km × taux', f.lignes[0].montant === Math.round(40 * 0.4326 * 100) / 100 && f.total === f.lignes[0].montant, f.lignes[0]);
t('adresse de départ = domicile de la fiche', f.lignes[0].depart_adresse.includes('Wavre'), f.lignes[0].depart_adresse);
t('aucun problème', !f.problemes.length, f.problemes);

console.log('\nLes signatures');
t('la direction ne signe pas avant la personne', V.signer(dir_, 10, '2026-10', 'direction').code === 409);
t('un autre ne signe pas pour la personne', V.signer(autre, 10, '2026-10', 'personne').code === 403);
t('la personne signe', V.signer(prof, 10, '2026-10', 'personne').ok);
t('le secrétariat n’approuve pas', V.signer(sec, 10, '2026-10', 'direction').code === 403);
t('la direction approuve', V.signer(dir_, 10, '2026-10', 'direction').ok);
t('le mois est verrouillé', V.verrouille(10, '2026-10'));
x = V.ecrireVisite(prof, v1, { km_ar: 50 });
t('une visite d’un mois approuvé ne se modifie plus', x.code === 409, x);
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2026-10-20' });
t('ni ne s’ajoute', x.code === 409, x);
let refus = false; try { db.prepare('DELETE FROM stage_fiche_signature').run(); } catch { refus = true; }
t('une signature ne s’efface pas', refus);

console.log('\nSupprimer');
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2026-11-03' });
t('une visite prévue se supprime', V.supprimerVisite(prof, x.id).ok);
t('une visite faite ne se supprime pas', V.supprimerVisite(prof, v1).code === 409);

console.log('\nLes kilomètres calculés (service de carte simulé)');
let appels = [];
globalThis.fetch = async url => {
  appels.push(String(url));
  if (String(url).includes('nominatim')) return { ok: true, json: async () => [{ lat: '50.8', lon: '4.3' }] };
  if (String(url).includes('osrm')) return { ok: true, json: async () => ({ routes: [{ distance: 19500 }] }) };
  return { ok: false, status: 500, json: async () => ({}) };
};
const D = await import('../src/lib/distanceRoute.js');
const st = V.stageAccessible(prof, 50);
let c = await V.kmCalcules(10, st, 'domicile');
t('domicile → lieu : 19,5 km aller, 39 km A/R', c.km_ar === 39, c);
const n = appels.length;
c = await V.kmCalcules(10, st, 'domicile');
t('le trajet se garde : aucun nouvel appel', c.km_ar === 39 && appels.length === n, appels.length - n);
c = await V.kmCalcules(11, st, 'domicile');
t('domicile absent de la fiche : pas de calcul, la raison est dite', c.km_ar === null && /domicile/.test(c.raison), c);
x = V.ecrireVisite(prof, null, { stage_id: 50, date: '2026-11-01', depart: 'domicile', km_ar: 39, statut: 'faite' });
await V.calculerVisite(x.id);
t('la visite garde sa distance calculée', db.prepare('SELECT km_calcule FROM stage_visite WHERE id=?').get(x.id).km_calcule === 39);
V.ecrireVisite(prof, x.id, { km_ar: 60 });
const f11 = V.fiche(10, '2026-11');
t('60 km déclarés pour 39 calculés : écart signalé', f11.lignes.find(l => l.id === x.id).ecart === true, f11.lignes);
t('écart de 2 km : pas signalé', D.ecartNotable(41, 39) === false);
t('écart signalé sans bloquer la signature', !f11.problemes.some(p => p.includes('écart')), f11.problemes);
globalThis.fetch = async () => { throw new Error('réseau coupé'); };
c = await D.kmAllerRetour('Rue Inconnue 1, 9999 Nulle-part', 'Rue Autre 2, 9998 Ailleurs');
t('réseau coupé : null avec la raison, rien ne casse', c.km_ar === null && !!c.raison, c);
t('une panne ne se garde pas en mémoire', !db.prepare("SELECT 1 FROM geo_adresse WHERE adresse LIKE 'rue inconnue%'").get());

console.log(`\n${ok} ok, ${ko} faux`);
process.exit(ko ? 1 : 0);
