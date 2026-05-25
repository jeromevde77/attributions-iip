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

// ── Banques pour la fiche signalétique ──────────────────────────────────────
const NATIONALITES = ['Belge', 'Belge', 'Belge', 'Belge', 'Française', 'Italienne',
  'Espagnole', 'Néerlandaise', 'Portugaise', 'Marocaine', 'Roumaine'];

const PAYS_NAISSANCE = [['Belgique', 0.8], ['France', 0.06], ['Italie', 0.03],
  ['Espagne', 0.02], ['Maroc', 0.03], ['Portugal', 0.02], ['Roumanie', 0.02],
  ['République démocratique du Congo', 0.02]];

const VILLES_BE = ['Bruxelles', 'Liège', 'Charleroi', 'Namur', 'Mons', 'Nivelles',
  'Wavre', 'Tournai', 'Verviers', 'Anderlecht', 'Uccle', 'Ixelles', 'Etterbeek',
  'La Louvière', 'Ottignies', 'Braine-l\'Alleud', 'Waterloo'];

const ORGANISMES_TITRE = [
  'Université libre de Bruxelles (ULB)',
  'Université catholique de Louvain (UCLouvain)',
  'Université de Liège (ULiège)',
  'Université de Mons (UMONS)',
  'Haute École Libre de Bruxelles - Ilya Prigogine (HELB)',
  'Haute École Léonard de Vinci',
  'Haute École Bruxelles-Brabant (HE2B)',
  'Institut Ilya Prigogine - Promotion sociale',
  'Communauté française de Belgique',
  'Jury de la Fédération Wallonie-Bruxelles',
];

const ETATS_CIVILS_POIDS = [
  ['celibataire', 0.28], ['marie', 0.38], ['cohab_legal', 0.14],
  ['divorce', 0.12], ['veuf', 0.04], ['cohabitant', 0.03],
  ['separe_fait', 0.01],
];

function pickPondere(paires) {
  const r = Math.random();
  let cumul = 0;
  for (const [val, poids] of paires) {
    cumul += poids;
    if (r <= cumul) return val;
  }
  return paires[0][0];
}

// NISS belge fictif : AA.MM.JJ-SSS.CC (basé sur date de naissance + ordre + sexe)
function genNiss(naissanceIso, sexe) {
  const [a, m, j] = naissanceIso.split('-');
  const aa = a.slice(2);
  // numéro d'ordre : impair pour homme, pair pour femme
  let ordre = randInt(1, 498) * 2;
  if (sexe === 'M') ordre += 1;
  const ordreStr = String(ordre).padStart(3, '0');
  // clé de contrôle : 97 - (nombre formé mod 97)
  const base = Number(`${aa}${m}${j}${ordreStr}`);
  const cle = 97 - (base % 97);
  return `${aa}.${m}.${j}-${ordreStr}.${String(cle).padStart(2, '0')}`;
}

// IBAN belge fictif (structure plausible BEkk BBBC CCCC CCXX)
function genIban() {
  const banque = String(randInt(1, 999)).padStart(3, '0');
  const compte = String(randInt(0, 9999999)).padStart(7, '0');
  const nat = Number(`${banque}${compte}`) % 97 || 97;
  const corps = `${banque}${compte}${String(nat).padStart(2, '0')}`;
  // clé IBAN simplifiée (plausible, non garantie valide)
  const cleIban = String(randInt(10, 98)).padStart(2, '0');
  return `BE${cleIban} ${corps.slice(0,4)} ${corps.slice(4,8)} ${corps.slice(8,12)}`;
}

function genTel() {
  const prefixe = pick(['0470', '0471', '0472', '0473', '0474', '0475', '0476', '0477', '0478', '0479', '0490', '0491', '0492']);
  return `${prefixe} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`;
}

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
      statut_ea12 = ?, anciennete_25_26_po = ?,
      sexe = ?, niss = ?, nationalite = ?, lieu_naissance_ville = ?,
      lieu_naissance_pays = ?, iban = ?, bic = ?, compte_titulaire = ?, tel_gsm = ?,
      etat_civil = ?, handicap = ?,
      conjoint_nom = ?, conjoint_prenom = ?, conjoint_handicap = ?,
      conjoint_alloc_foyer = ?, conjoint_revenus = ?,
      ce883_actif = ?, ce883_date_debut = ?, ce883_caisse = ?, ce883_num_inscription = ?
    WHERE id = ?
  `);

  // Préparer les insertions titres + charges (on vide d'abord)
  const delTitres = db.prepare('DELETE FROM titre_capacite WHERE professeur_id = ?');
  const insTitre = db.prepare(
    'INSERT INTO titre_capacite (professeur_id, date_obtention, intitule, delivre_par, ordre) VALUES (?,?,?,?,?)'
  );
  const delCharges = db.prepare('DELETE FROM personne_charge WHERE professeur_id = ?');
  const insCharge = db.prepare(
    'INSERT INTO personne_charge (professeur_id, categorie, date_naissance, handicap, ordre) VALUES (?,?,?,?,?)'
  );

  const stats = { total: 0, capaes: 0, cap: 0, aess: 0, sans: 0, titres: 0, charges: 0 };

  const tx = db.transaction(() => {
    for (const prof of profs) {
      const { nom, prenom } = genNomUnique();
      const sexe = pick(['F', 'F', 'M', 'M']); // ~50/50
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
      const anciennete = randInt(0, Math.max(1, Math.min(age - 23, 35))) * 360; // report PO en jours

      // ── Fiche signalétique ──
      const niss = genNiss(naissance, sexe);
      const nationalite = pick(NATIONALITES);
      const paysNaissance = pickPondere(PAYS_NAISSANCE);
      const villeNaissance = paysNaissance === 'Belgique' ? pick(VILLES_BE) : '';
      const iban = genIban();
      const tel = genTel();
      const etatCivil = pickPondere(ETATS_CIVILS_POIDS);
      const handicap = Math.random() < 0.04 ? 'oui' : 'non';

      // Conjoint (si marié ou cohabitant légal)
      let conjNom = '', conjPrenom = '', conjHandicap = 'non', conjAlloc = 'non', conjRevenus = 'pro';
      if (['marie', 'cohab_legal'].includes(etatCivil)) {
        conjNom = pick(NOMS);
        conjPrenom = pick(sexe === 'M' ? PRENOMS_F : PRENOMS_M); // conjoint de sexe opposé (simplification)
        conjHandicap = Math.random() < 0.03 ? 'oui' : 'non';
        conjAlloc = Math.random() < 0.15 ? 'oui' : 'non';
        conjRevenus = pickPondere([['pro', 0.7], ['pension', 0.12], ['faibles', 0.1], ['aucun', 0.08]]);
      }

      update.run(nom, prenom, mailPro, mailPrive, naissance, matricule,
        rue, cp, commune, t1, t2, titrePeda, capaes, statutEa12, anciennete,
        sexe, niss, nationalite, villeNaissance, paysNaissance, iban, '', '', tel,
        etatCivil, handicap,
        conjNom, conjPrenom, conjHandicap, conjAlloc, conjRevenus,
        'non', '', '', '',
        prof.id);

      // ── Titres datés (à partir de t1/t2 + organisme + date plausible) ──
      delTitres.run(prof.id);
      const titresListe = [t1, t2].filter(Boolean);
      titresListe.forEach((intitule, i) => {
        // date d'obtention : entre 22 et ~30 ans après la naissance
        const anneeNaiss = Number(naissance.slice(0, 4));
        const anneeObtention = anneeNaiss + randInt(22, 28) + i * 2;
        const dateObt = `${anneeObtention}-${String(randInt(6,9)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;
        insTitre.run(prof.id, dateObt, intitule, pick(ORGANISMES_TITRE), i);
        stats.titres++;
      });
      // Titre pédagogique comme titre supplémentaire si présent
      if (titrePeda) {
        const anneeNaiss = Number(naissance.slice(0, 4));
        const dateObt = `${anneeNaiss + randInt(26, 35)}-${String(randInt(6,9)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;
        insTitre.run(prof.id, dateObt, titrePeda, 'Fédération Wallonie-Bruxelles', titresListe.length);
        stats.titres++;
      }

      // ── Personnes à charge ──
      delCharges.run(prof.id);
      let ordreCharge = 0;
      if (['marie', 'cohab_legal', 'divorce', 'cohabitant'].includes(etatCivil) && age > 28) {
        const nbEnfants = pickPondere([[0, 0.3], [1, 0.25], [2, 0.3], [3, 0.12], [4, 0.03]]);
        for (let k = 0; k < Number(nbEnfants); k++) {
          const ageEnfant = randInt(1, Math.min(age - 22, 26));
          const anneeEnf = new Date().getFullYear() - ageEnfant;
          const dn = `${anneeEnf}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;
          insCharge.run(prof.id, 'enfant', dn, Math.random() < 0.02 ? 'oui' : 'non', ordreCharge++);
          stats.charges++;
        }
      }
      // Parfois un ascendant de +65 ans à charge
      if (Math.random() < 0.05) {
        const anneeAsc = new Date().getFullYear() - randInt(66, 88);
        const dn = `${anneeAsc}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;
        insCharge.run(prof.id, 'autre_65', dn, Math.random() < 0.1 ? 'oui' : 'non', ordreCharge++);
        stats.charges++;
      }

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
