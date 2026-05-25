/**
 * fake-data.js — Génération de données fictives réalistes pour les professeurs.
 * Utilisé UNIQUEMENT en environnement de développement pour anonymiser la base
 * (RGPD-safe) tout en conservant les attributions.
 *
 * Travaille sur les profs par leur ID — donc réutilisable même si la base
 * est déjà anonymisée (régénération à volonté).
 */

// ── Banques de noms (belgo-français) ────────────────────────────────────────
const NOMS = ['MARTIN','BERNARD','DUBOIS','THOMAS','ROBERT','RICHARD','PETIT','DURAND',
  'LEROY','MOREAU','SIMON','LAURENT','LEFEBVRE','MICHEL','GARCIA','DAVID','BERTRAND',
  'ROUX','VINCENT','FOURNIER','MOREL','GIRARD','ANDRE','LEFEVRE','MERCIER','DUPONT',
  'LAMBERT','BONNET','FRANCOIS','MARTINEZ','LEGRAND','GARNIER','FAURE','ROUSSEAU',
  'BLANC','GUERIN','MULLER','HENRY','ROUSSEL','NICOLAS','PERRIN','MORIN','MATHIEU',
  'CLEMENT','GAUTHIER','DUMONT','LOPEZ','FONTAINE','CHEVALIER','ROBIN','MASSON',
  'SANCHEZ','GERARD','NGUYEN','BOYER','DENIS','LEMAIRE','DUVAL','JOLY','GAUTIER',
  'ROGER','ROCHE','ROY','NOEL','MEYER','LUCAS','MEUNIER','JEAN','PEREZ','MARCHAND',
  'DUFOUR','BLANCHARD','MARIE','BARBIER','BRUN','DUMAS','BRUNET','SCHMITT','LEROUX',
  'COLIN','FERNANDEZ','PERRET','SALMON','MAES','CLAEYS','PEETERS','JANSSENS','WILLEMS',
  'MERTENS','GOOSSENS','WOUTERS','DE SMET','HERMANS','VERMEULEN','DECKERS','DUMOULIN',
  'LELOUP','HALLET','GILLET','RENARD','COLLIN','LECLERCQ','HUBERT','LAMBOT','PIRARD',
  'DELVAUX','LIEGEOIS','THIRY','HENRARD','GILLES','LECOMTE','EVRARD','PONCELET'];

const PRENOMS_M = ['Jean','Pierre','Michel','André','Philippe','Alain','Bernard','Marcel',
  'Daniel','Robert','Jacques','Claude','Guillaume','François','Patrick','Nicolas',
  'Frédéric','Laurent','David','Stéphane','Olivier','Thierry','Christophe','Sébastien',
  'Vincent','Julien','Maxime','Antoine','Thomas','Alexandre','Benoît','Damien','Xavier',
  'Gauthier','Raphaël','Quentin','Simon','Arnaud','Geoffrey','Loïc','Yves','Marc'];

const PRENOMS_F = ['Marie','Nathalie','Isabelle','Sylvie','Catherine','Françoise','Martine',
  'Christine','Monique','Nicole','Anne','Sophie','Valérie','Céline','Sandrine','Stéphanie',
  'Caroline','Aurélie','Julie','Émilie','Camille','Laura','Manon','Charlotte','Pauline',
  'Élodie','Audrey','Virginie','Delphine','Hélène','Florence','Corinne','Véronique',
  'Patricia','Brigitte','Chantal','Murielle','Fabienne','Carine','Dominique','Bénédicte'];

// ── Communes belges (Bruxelles + Brabant wallon) ────────────────────────────
const COMMUNES = [
  ['1070','Anderlecht'],['1000','Bruxelles'],['1190','Forest'],['1180','Uccle'],
  ['1060','Saint-Gilles'],['1050','Ixelles'],['1200','Woluwe-Saint-Lambert'],
  ['1030','Schaerbeek'],['1080','Molenbeek-Saint-Jean'],['1410','Waterloo'],
  ['1300','Wavre'],['1340','Ottignies-Louvain-la-Neuve'],['1480','Tubize'],
  ['1420',"Braine-l'Alleud"],['1083','Ganshoren'],['1700','Dilbeek'],
  ['1640','Rhode-Saint-Genèse'],['1502','Lembeek'],['1640','Rhode-Saint-Genèse']];

const RUES = ['Rue de la Station','Avenue des Tilleuls','Chaussée de Bruxelles','Rue du Moulin',
  'Avenue de la Liberté','Rue des Écoles','Clos des Pommiers',"Rue de l'Église",
  'Avenue des Cerisiers','Rue Haute','Drève des Bouleaux','Rue du Bois','Avenue Albert',
  'Rue Neuve','Chemin des Champs','Rue de la Forge'];

// ── Titres par discipline (titre1 = principal, titre2 = secondaire) ─────────
const TITRES = {
  'TIM': [['Master en sciences biomédicales','Bachelier en technologie médicale – imagerie médicale'],
          ['Master en radiobiologie',"Agrégé de l'enseignement secondaire supérieur en sciences"],
          ['Master en sciences de la santé publique','Bachelier en soins infirmiers'],
          ['Docteur en médecine','Master en physique médicale'],
          ['Master en biologie clinique','Bachelier technologue en imagerie médicale']],
  'Psychomotricité': [['Master en psychomotricité','Bachelier en psychomotricité'],
          ['Master en psychologie clinique','Bachelier en kinésithérapie'],
          ["Master en sciences de l'éducation",'Bachelier en psychomotricité'],
          ['Master en neuropsychologie','Bachelier en ergothérapie'],
          ['Docteur en sciences psychologiques','Master en psychomotricité']],
  'Optométrie': [['Master en sciences optiques','Bachelier en optométrie'],
          ['Master en optique et optométrie','Bachelier en optique-optométrie'],
          ['Docteur en sciences','Master en optométrie clinique'],
          ['Master en médecine','Bachelier en soins optométriques'],
          ['Master en biophysique','Bachelier en optométrie']],
  'Optique': [["Brevet d'enseignement supérieur en optique",'Certificat de qualification en optique-lunetterie'],
          ['Bachelier en optométrie','CESS – option sciences'],
          ['Master en optique','Brevet technique en optique']],
  'FID-Guidance': [['Master en psychologie','Bachelier en éducation spécialisée'],
          ["Master en sciences de l'éducation","Agrégé de l'enseignement secondaire inférieur"],
          ['Master en logopédie','Bachelier en guidance'],
          ['Master en orthopédagogie','Bachelier en psychologie']],
  'FID-Péda': [["Master en sciences de l'éducation","Agrégé de l'enseignement secondaire supérieur"],
          ['Master en pédagogie','Bachelier en éducation'],
          ['Master en didactique',"Agrégé de l'enseignement secondaire inférieur"]],
  'ATNUP': [['Master en gestion des ressources humaines',"Bachelier en gestion d'entreprise"],
          ['Master en droit social',"Agrégé de l'enseignement secondaire supérieur en droit"],
          ['Master en sciences du travail','Bachelier en secrétariat de direction'],
          ['Master en management','Bachelier en comptabilité']],
  'SAR': [['Master en soins infirmiers','Bachelier en soins infirmiers'],
          ['Master en santé communautaire','Bachelier en sage-femme'],
          ['Docteur en médecine','Master en sciences infirmières']],
  'ME': [['Master en ingénierie industrielle','Bachelier en électromécanique'],
          ['Master en électronique','Bachelier en automatisation'],
          ['Ingénieur civil électricien','Master en génie électrique']],
  'RESTART': [["Master en sciences de l'éducation",'Bachelier en travail social'],
          ['Master en insertion socioprofessionnelle','Bachelier en éducation']],
  'Soins_plaies': [['Master en sciences infirmières','Bachelier en soins infirmiers, spéc. plaies'],
          ['Master en dermatologie','Bachelier en soins infirmiers']],
  'A': [['Master en sciences de la motricité','Bachelier en kinésithérapie']],
};
const TITRES_DEFAUT = [['Master en sciences','Bachelier en éducation'],
  ['Master en didactique',"Agrégé de l'enseignement secondaire supérieur"]];

// ── Helpers ──────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          .replace(/[^a-z0-9]/g, '');
}

function genNaissance() {
  const age = randInt(25, 65);
  const annee = new Date().getFullYear() - age;
  const mois = String(randInt(1, 12)).padStart(2, '0');
  const jour = String(randInt(1, 28)).padStart(2, '0');
  return { iso: `${annee}-${mois}-${jour}`, age };
}

function genMatricule() {
  let m = '';
  for (let i = 0; i < 11; i++) m += randInt(0, 9);
  return m;
}

function genMailPrive(prenom, nom) {
  const fournisseur = pick(['gmail.com','outlook.be','hotmail.com','skynet.be','proximus.be']);
  const p = normalize(prenom), n = normalize(nom);
  const style = randInt(0, 2);
  if (style === 0) return `${p}.${n}@${fournisseur}`;
  if (style === 1) return `${p}${n}@${fournisseur}`;
  return `${n}.${p}@${fournisseur}`;
}

function genTitrePedagogique() {
  const r = Math.random();
  if (r < 0.45) return 'CAPAES';
  if (r < 0.60) return 'CAP';
  if (r < 0.72) return 'AESS';
  return '';
}

function genTitres(sections) {
  let pair = null;
  for (const s of sections) {
    if (TITRES[s]) { pair = pick(TITRES[s]); break; }
  }
  if (!pair) pair = pick(TITRES_DEFAUT);
  const [t1, t2] = pair;
  const r = Math.random();
  if (r < 0.20) return [t1, ''];        // diplôme principal seul
  if (r < 0.35) return [t2, ''];        // profil "bachelier seul"
  return [t1, t2];                       // les deux
}

/**
 * Régénère les données fictives de TOUS les professeurs en base.
 * @param {Database} db - instance better-sqlite3
 * @returns {object} statistiques
 */
export function regenerateFakeProfs(db) {
  // Récupérer les profs avec leur section principale (depuis les attributions)
  const profs = db.prepare('SELECT id, statut FROM professeur').all();

  // Map prof.id -> sections (depuis la table attribution si dispo)
  let sectionsByProf = {};
  try {
    const rows = db.prepare(`
      SELECT DISTINCT a.professeur_id AS pid, a.section_code AS sec
      FROM attribution a WHERE a.professeur_id IS NOT NULL
    `).all();
    for (const row of rows) {
      if (!sectionsByProf[row.pid]) sectionsByProf[row.pid] = [];
      if (row.sec) sectionsByProf[row.pid].push(row.sec);
    }
  } catch (e) { /* table/colonne absente : sections vides */ }

  const nomsUtilises = new Set();
  function genNomUnique() {
    for (let i = 0; i < 200; i++) {
      const nom = pick(NOMS);
      const genre = Math.random() < 0.5 ? 'M' : 'F';
      const prenom = pick(genre === 'M' ? PRENOMS_M : PRENOMS_F);
      const cle = `${nom} ${prenom}`;
      if (!nomsUtilises.has(cle)) { nomsUtilises.add(cle); return { nom, prenom }; }
    }
    return { nom: pick(NOMS), prenom: pick(PRENOMS_M) };
  }

  const update = db.prepare(`
    UPDATE professeur SET
      nom = ?, prenom = ?, adresse_mail = ?, mail_prive = ?,
      date_naissance = ?, matricule = ?, adresse_rue = ?, code_postal = ?,
      commune = ?, titre1 = ?, titre2 = ?, titre3 = ?, capaes = ?,
      statut_ea12 = ?, anciennete_25_26_po = ?
    WHERE id = ?
  `);

  const stats = { total: 0, capaes: 0, cap: 0, aess: 0, sans: 0 };

  const tx = db.transaction(() => {
    for (const prof of profs) {
      const { nom, prenom } = genNomUnique();
      const { iso: naissance, age } = genNaissance();
      const matricule = genMatricule();
      const mailPro = `${normalize(prenom)}.${normalize(nom)}@lucie-dev.be`;
      const mailPrive = genMailPrive(prenom, nom);
      const rue = `${pick(RUES)} ${randInt(1, 250)}`;
      const [cp, commune] = pick(COMMUNES);
      const sections = sectionsByProf[prof.id] || [];
      const [t1, t2] = genTitres(sections);
      const titrePeda = genTitrePedagogique();
      const capaes = titrePeda === 'CAPAES' ? 'x' : '';
      const statutEa12 = prof.statut === 'EXP'
        ? pick(['T','TPr','TPr','D'])
        : pick(['T','T','St']);
      const anciennete = randInt(0, Math.max(1, Math.min(age - 23, 35)));

      update.run(nom, prenom, mailPro, mailPrive, naissance, matricule,
        rue, cp, commune, t1, t2, titrePeda, capaes, statutEa12, anciennete, prof.id);

      stats.total++;
      if (titrePeda === 'CAPAES') stats.capaes++;
      else if (titrePeda === 'CAP') stats.cap++;
      else if (titrePeda === 'AESS') stats.aess++;
      else stats.sans++;
    }
  });
  tx();

  return stats;
}
