// ─────────────────────────────────────────────────────────────────────────────
// LE BUDGET DES SECTIONS (Charles, 1er novembre 2026 ; cahier des charges :
// docs/contexte/guide-budget-sections.md, parties A, B et C).
//
// Chaque section reçoit une ENVELOPPE de fonctionnement :
//     socle fixe + montant par étudiant × pondération × nombre d'étudiants
// (guide A.4). Les investissements — un prix unitaire d'au moins 500 € HT (A.6) —
// sont arbitrés au niveau de l'école, hors enveloppe (A.7). La nature d'une ligne
// (fonctionnement / investissement) se CALCULE du prix unitaire HT et du seuil de
// l'année : elle ne se saisit jamais.
//
// Tout est paramétré par ANNÉE CIVILE (l'exercice de l'ASBL) et modifiable par la
// direction ; les valeurs de départ sont celles du guide (A.1, A.4, A.6).
// Les sections que le guide ne cite pas entrent au régime standard (socle et
// pondération 1,0 — Charles, 1er novembre 2026). L'orthoptie n'a pas d'enveloppe :
// l'IIP supporte un tiers du budget de fonctionnement communiqué par la HE (A.3).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { inscrits } from './populationEcole.js';

/* Valeurs de départ du guide (A.4) : les pondérations par section. */
export const PONDERATION_GUIDE = { 'Optométrie': 1.3, 'Optique': 1.3, 'AeSI': 1.2, 'ATNUP': 1.2, 'Soins_plaies': 0.5 };
/* Effectifs du guide (inscrits au 01/11/2026), repris comme valeurs de départ du budget 2027. */
const EFFECTIFS_GUIDE_2027 = { TIM: 348, 'Optométrie': 118, 'Psychomotricité': 135, AeSI: 86, Optique: 59, ATNUP: 28, Soins_plaies: 30 };
/* Le budget 2026 de l'IIP (A.1) : charges et produits par section, l'« année précédente » du budget 2027. */
const N1_GUIDE_2027 = {
  'Optométrie': [2250, 81000], 'Psychomotricité': [750, 73500], Orthoptie: [5140, 30000], TIM: [54280, 196500],
};
export const SECTION_ORTHOPTIE = 'Orthoptie';
/* LA RÉSERVE D'INVESTISSEMENT (Charles, 1er novembre 2026 : « il y a lieu de prévoir 10.000 € d'investissements pour des
   chaises et du matériel assez chers en optométrie »). Un montant réservé par section, hors enveloppe, que la direction
   règle ; les lignes d'investissement encodées s'y comparent. */
const RESERVE_GUIDE_2027 = { 'Optométrie': 10000 };

/* LES CATÉGORIES DE LA PARTIE B.2 — en table, la direction les règle. `amortissement` : la durée
   qu'un investissement de la catégorie suivrait (informatique 3 ans, le reste 5 ans, A.6). */
const CATEGORIES_GUIDE = [
  ['Fonctionnement pédagogique', ['Petit matériel de cours', 'Consommables de laboratoire et de pratique professionnelle',
    'Impressions et reprographie', 'Matériel de simulation ou de démonstration', 'Petit outillage et entretien du matériel spécifique'], 'mobilier'],
  ['Équipements spécifiques', ['Appareils de mesure, instruments, mannequins, matériel clinique', 'Remplacement planifié du matériel vieillissant'], 'mobilier'],
  ['Matériel informatique et audiovisuel', ['Postes de travail', 'Périphériques', 'Équipement des salles', 'Matériel mobile',
    'Impression (imprimante, toners, maintenance)', 'Stockage', 'Câblage et accessoires', 'Accessibilité'], 'informatique'],
  ['Mobilier et bureaux', ['Bureaux', 'Sièges ergonomiques', 'Rangements (armoires fermant à clé)', 'Mobilier de salles',
    'Espaces communs', 'Signalétique de la section'], 'mobilier'],
  ['Logiciels, documentation et abonnements', ['Licences de logiciels spécialisés', 'Ouvrages, revues et plateformes'], 'informatique'],
  ['Activités pédagogiques hors les murs', ['Sorties et visites', 'Intervenants extérieurs', 'Salons, congrès, journées professionnelles', 'Stages'], 'mobilier'],
  ['Vie étudiante et événements', ['Accueil de rentrée', 'Proclamation et remise des diplômes', 'Promotion de la section'], 'mobilier'],
  ['Membres du personnel', ['Convivialité', 'Cadeaux', 'Collations des réunions et jurys', 'Remerciements aux jurys et partenaires'], 'mobilier'],
  ['Formation et déplacements', ['Formations continues et colloques', 'Adhésions professionnelles', 'Déplacements (stages, inter-écoles)'], 'mobilier'],
  ['Qualité et projets', ['Projets pédagogiques innovants', 'Actions du plan qualité', 'Projets internationaux'], 'mobilier'],
  ['Imprévus', ['Réserve pour réparations et dépenses non anticipées'], 'mobilier'],
];

export const PRIORITES = { indispensable: 'Indispensable', souhaitable: 'Souhaitable', si_possible: 'Si possible' };
export const ETATS_INVENTAIRE = { bon: 'Bon', surveiller: 'À surveiller', remplacer: 'À remplacer' };

export function migrerBudgetSections(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS budget_parametre (
      annee_civile      INTEGER PRIMARY KEY,
      montant_etudiant  REAL NOT NULL DEFAULT 130,
      seuil_invest      REAL NOT NULL DEFAULT 500,
      amort_info        INTEGER NOT NULL DEFAULT 3,
      amort_mobilier    INTEGER NOT NULL DEFAULT 5,
      date_effectifs    TEXT,
      orthoptie_budget_he REAL,
      orthoptie_part    REAL NOT NULL DEFAULT 0.333333,
      resultat_n1       REAL,
      maj_par           TEXT,
      maj_le            TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS budget_section_param (
      annee_civile   INTEGER NOT NULL,
      section        TEXT NOT NULL,
      socle          REAL NOT NULL DEFAULT 2000,
      ponderation    REAL NOT NULL DEFAULT 1,
      effectif       INTEGER,
      effectif_compte_le TEXT,
      charges_n1     REAL,
      produits_n1    REAL,
      hors_budget    INTEGER NOT NULL DEFAULT 0,
      reserve_invest REAL NOT NULL DEFAULT 0,
      maj_par        TEXT,
      maj_le         TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (annee_civile, section)
    );
    CREATE TABLE IF NOT EXISTS budget_categorie (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      groupe         TEXT NOT NULL,
      libelle        TEXT NOT NULL,
      amortissement  TEXT NOT NULL DEFAULT 'mobilier' CHECK (amortissement IN ('informatique','mobilier')),
      compte_defaut  TEXT,
      ordre          INTEGER NOT NULL DEFAULT 0,
      actif          INTEGER NOT NULL DEFAULT 1,
      UNIQUE (groupe, libelle)
    );
    CREATE TABLE IF NOT EXISTS budget_inventaire (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      section        TEXT NOT NULL,
      type_bien      TEXT NOT NULL,
      description    TEXT,
      quantite       INTEGER NOT NULL DEFAULT 1,
      annee_achat    INTEGER,
      etat           TEXT NOT NULL DEFAULT 'bon' CHECK (etat IN ('bon','surveiller','remplacer')),
      cree_par       TEXT,
      maj_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_budget_inventaire ON budget_inventaire(section);
  `);
  /* LE COUSSIN DE LA DIRECTION (Charles, 1er novembre 2026) : une part de chaque enveloppe est retenue, par tranches comme
     l'impôt — 10 % jusqu'à 15.000 €, 20 % de 15.000 à 30.000 €, 30 % au-delà —, et la coordination ne voit que le disponible. */
  const colsP = dbx.prepare('PRAGMA table_info(budget_parametre)').all().map(c => c.name);
  for (const [c, def] of [['coussin_seuil1', 'REAL NOT NULL DEFAULT 15000'], ['coussin_seuil2', 'REAL NOT NULL DEFAULT 30000'],
    ['coussin_taux1', 'REAL NOT NULL DEFAULT 0.10'], ['coussin_taux2', 'REAL NOT NULL DEFAULT 0.20'], ['coussin_taux3', 'REAL NOT NULL DEFAULT 0.30']]) {
    if (!colsP.includes(c)) dbx.exec(`ALTER TABLE budget_parametre ADD COLUMN ${c} ${def}`);
  }
  if (!dbx.prepare('PRAGMA table_info(budget_section_param)').all().some(c => c.name === 'reserve_invest')) {
    dbx.exec('ALTER TABLE budget_section_param ADD COLUMN reserve_invest REAL NOT NULL DEFAULT 0');
  }
  // Les champs de la ligne (C.2) : catégorie, priorité, mois, justification, devis, tronc commun.
  const cols = dbx.prepare('PRAGMA table_info(budget_ligne)').all().map(c => c.name);
  for (const [c, def] of [['categorie_id', 'INTEGER'], ['priorite', "TEXT NOT NULL DEFAULT 'souhaitable'"], ['mois', 'INTEGER'],
    ['justification', 'TEXT'], ['devis', 'TEXT'], ['tronc_commun', 'INTEGER NOT NULL DEFAULT 0'],
    ['arbitre_par', 'TEXT'], ['arbitre_le', 'TEXT'], ['motif_arbitrage', 'TEXT']]) {
    if (!cols.includes(c)) dbx.exec(`ALTER TABLE budget_ligne ADD COLUMN ${c} ${def}`);
  }
  // Les catégories du guide, une fois.
  dbx.exec(`CREATE TABLE IF NOT EXISTS migration_faite (cle TEXT PRIMARY KEY, le TEXT DEFAULT (datetime('now')))`);
  if (!dbx.prepare("SELECT 1 FROM migration_faite WHERE cle = 'budget_2026_11_01_categories'").get()) {
    const ins = dbx.prepare('INSERT OR IGNORE INTO budget_categorie (groupe, libelle, amortissement, ordre) VALUES (?,?,?,?)');
    dbx.transaction(() => {
      let o = 0;
      for (const [g, libs, a] of CATEGORIES_GUIDE) for (const l of libs) ins.run(g, l, a, ++o);
      dbx.prepare("INSERT INTO migration_faite (cle) VALUES ('budget_2026_11_01_categories')").run();
    })();
  }
  /* LA COORDINATION ÉCRIT, LA DIRECTION ARBITRE (Charles, 1er novembre 2026) : le plafond « validation »
     du 27 septembre passe à « écrit » — toujours borné à ses sections par getUserSections. Une fois. */
  if (!dbx.prepare("SELECT 1 FROM migration_faite WHERE cle = 'plafonds_2026_11_01_budget_coordination'").get()) {
    try {
      // Marquée faite SEULEMENT si la ligne existait : sur une base neuve, les plafonds naissent après cette migration.
      dbx.transaction(() => {
        const x = dbx.prepare("UPDATE role_plafond SET niveau = 'ecrit', maj_le = datetime('now') WHERE role = 'coordination' AND module = 'budget'").run();
        if (x.changes) dbx.prepare("INSERT INTO migration_faite (cle) VALUES ('plafonds_2026_11_01_budget_coordination')").run();
      })();
    } catch { /* role_plafond pas encore créée : au démarrage suivant */ }
  }
}

/* Les sections d'enseignement (hors Orthoptie, qui passe par sa quote-part). */
function sectionsEnseignement() {
  return db.prepare('SELECT code FROM section ORDER BY code').all().map(s => s.code).filter(c => c !== SECTION_ORTHOPTIE);
}

/** L'année académique qui contient une date (01/11/2026 → 2026-2027). */
export function anneeAcademiqueDe(dateIso) {
  const [y, m] = String(dateIso).split('-').map(Number);
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Les inscrits par section dans Lucie, pour l'année académique de la date de référence. */
export function effectifsLucie(dateIso) {
  const n = {};
  for (const l of inscrits(anneeAcademiqueDe(dateIso))) if (l.section) (n[l.section] ||= new Set()).add(l.id);
  return Object.fromEntries(Object.entries(n).map(([s, ids]) => [s, ids.size]));
}

/* LES PARAMÈTRES D'UNE ANNÉE, créés au premier accès : ceux de l'année précédente s'il y en a, sinon
   les valeurs du guide. Les effectifs de 2027 sont ceux du guide ; ceux d'une autre année se comptent
   dans Lucie à la date de référence (01/11 de l'année précédente), puis restent FIGÉS. */
export function assurerAnnee(annee, par = null) {
  annee = Number(annee);
  if (db.prepare('SELECT 1 FROM budget_parametre WHERE annee_civile = ?').get(annee)) {
    // Une section nouvelle entre au régime standard.
    const connues = new Set(db.prepare('SELECT section FROM budget_section_param WHERE annee_civile = ?').all(annee).map(x => x.section));
    const manquantes = sectionsEnseignement().filter(s => !connues.has(s));
    if (manquantes.length) {
      const p = db.prepare('SELECT date_effectifs FROM budget_parametre WHERE annee_civile = ?').get(annee);
      const eff = effectifsLucie(p.date_effectifs || `${annee - 1}-11-01`);
      const ins = db.prepare('INSERT OR IGNORE INTO budget_section_param (annee_civile, section, socle, ponderation, effectif, effectif_compte_le) VALUES (?,?,?,?,?,datetime(\'now\'))');
      for (const s of manquantes) ins.run(annee, s, 2000, PONDERATION_GUIDE[s] ?? 1, eff[s] || 0);
    }
    return;
  }
  const prec = db.prepare('SELECT * FROM budget_parametre WHERE annee_civile = ?').get(annee - 1);
  const dateRef = `${annee - 1}-11-01`;
  const guide2027 = annee === 2027;
  db.transaction(() => {
    db.prepare(`INSERT INTO budget_parametre (annee_civile, montant_etudiant, seuil_invest, amort_info, amort_mobilier, date_effectifs,
        orthoptie_budget_he, orthoptie_part, resultat_n1, maj_par) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(annee, prec?.montant_etudiant ?? 130, prec?.seuil_invest ?? 500, prec?.amort_info ?? 3, prec?.amort_mobilier ?? 5, dateRef,
        // A.4 : « ≈ 8.800 € » pour un tiers — un budget HE estimé à 26.400 €, à confirmer (A.9).
        prec?.orthoptie_budget_he ?? (guide2027 ? 26400 : null), prec?.orthoptie_part ?? 1 / 3,
        guide2027 ? 259375 : null, par);
    const precSec = new Map(db.prepare('SELECT * FROM budget_section_param WHERE annee_civile = ?').all(annee - 1).map(x => [x.section, x]));
    const eff = guide2027 ? null : effectifsLucie(dateRef);
    const ins = db.prepare(`INSERT INTO budget_section_param (annee_civile, section, socle, ponderation, effectif, effectif_compte_le,
        charges_n1, produits_n1, hors_budget, reserve_invest, maj_par) VALUES (?,?,?,?,?,datetime('now'),?,?,?,?,?)`);
    for (const s of [...sectionsEnseignement(), SECTION_ORTHOPTIE]) {
      const p = precSec.get(s);
      const n1 = guide2027 ? N1_GUIDE_2027[s] : null;
      const effectif = s === SECTION_ORTHOPTIE ? null
        : guide2027 ? (EFFECTIFS_GUIDE_2027[s] ?? effectifsLucie(dateRef)[s] ?? 0) : (eff[s] || 0);
      ins.run(annee, s, p?.socle ?? 2000, p?.ponderation ?? PONDERATION_GUIDE[s] ?? 1, effectif,
        n1 ? n1[0] : chargesDeLAnnee(annee - 1, s), n1 ? n1[1] : null, s === SECTION_ORTHOPTIE ? 1 : (p?.hors_budget ?? 0),
        guide2027 ? (RESERVE_GUIDE_2027[s] || 0) : 0, par);
    }
  })();
}

/** Ce qu'une section a encodé pour une année (hors refus), en HT : le « N-1 » d'une année déjà budgétée dans Lucie. */
function chargesDeLAnnee(annee, section) {
  const r = db.prepare("SELECT SUM(prix_unitaire * quantite) t FROM budget_ligne WHERE annee_civile = ? AND section = ? AND statut <> 'refuse'").get(annee, section);
  return r?.t ? Math.round(r.t * 100) / 100 : null;
}

/** L'enveloppe d'une section (A.4), arrondie à l'euro. */
export function enveloppe({ socle, ponderation, effectif }, montantEtudiant) {
  return Math.round(Number(socle || 0) + Number(montantEtudiant || 0) * Number(ponderation || 0) * Number(effectif || 0));
}

/** Le coussin retenu sur une enveloppe : chaque taux ne s'applique qu'à la part de l'enveloppe comprise dans sa tranche. */
export function coussin(env, P) {
  const s1 = Number(P.coussin_seuil1 ?? 15000), s2 = Math.max(s1, Number(P.coussin_seuil2 ?? 30000));
  const t1 = Number(P.coussin_taux1 ?? 0.1), t2 = Number(P.coussin_taux2 ?? 0.2), t3 = Number(P.coussin_taux3 ?? 0.3);
  const e = Math.max(0, Number(env || 0));
  return Math.round(Math.min(e, s1) * t1 + Math.max(0, Math.min(e, s2) - s1) * t2 + Math.max(0, e - s2) * t3);
}

/** La nature d'une ligne : investissement dès que le prix UNITAIRE HT atteint le seuil (A.6). */
export function nature(prixUnitaireHT, seuil) {
  return Math.round(Number(prixUnitaireHT || 0) * 100) >= Math.round(Number(seuil ?? 500) * 100) ? 'investissement' : 'fonctionnement';
}

const r2 = n => Math.round(Number(n || 0) * 100) / 100;

/**
 * LE TABLEAU DES SECTIONS (C.4) : enveloppe, encodé, écart, € par étudiant, N-1, catégories ; les
 * investissements à arbitrer ; l'impact sur la contribution à l'ASBL (A.5). `sections` : null = toutes.
 */
export function syntheseBudget(annee, sections = null) {
  annee = Number(annee);
  assurerAnnee(annee);
  const P = db.prepare('SELECT * FROM budget_parametre WHERE annee_civile = ?').get(annee);
  const params = db.prepare('SELECT * FROM budget_section_param WHERE annee_civile = ? ORDER BY section').all(annee);
  const cats = new Map(db.prepare('SELECT * FROM budget_categorie').all().map(c => [c.id, c]));
  const lignes = db.prepare('SELECT * FROM budget_ligne WHERE annee_civile = ?').all(annee)
    .map(l => ({ ...l, total_ht: r2(l.prix_unitaire * l.quantite), nature: nature(l.prix_unitaire, P.seuil_invest) }));
  const depenses = db.prepare('SELECT section, SUM(montant_htva) t FROM budget_depense WHERE annee_civile = ? GROUP BY section').all(annee);
  const engage = new Map(depenses.map(d => [d.section, r2(d.t)]));
  const voit = s => !sections || sections.includes(s);

  const lignesSection = params.filter(p => !p.hors_budget).map(p => {
    const brut = enveloppe(p, P.montant_etudiant);
    const retenu = coussin(brut, P);
    const env = brut - retenu;         // LE DISPONIBLE : ce que la section répartit
    const ls = lignes.filter(l => l.section === p.section && l.statut !== 'refuse');
    const fonct = r2(ls.filter(l => l.nature === 'fonctionnement').reduce((s, l) => s + l.total_ht, 0));
    const invest = r2(ls.filter(l => l.nature === 'investissement').reduce((s, l) => s + l.total_ht, 0));
    const parCat = {};
    for (const l of ls.filter(l => l.nature === 'fonctionnement')) {
      const g = cats.get(l.categorie_id)?.groupe || 'Sans catégorie';
      parCat[g] = r2((parCat[g] || 0) + l.total_ht);
    }
    return {
      section: p.section, socle: p.socle, ponderation: p.ponderation, effectif: p.effectif,
      enveloppe_brute: brut, coussin: retenu, enveloppe: env,
      reserve_invest: Number(p.reserve_invest || 0),
      encode_fonctionnement: fonct, investissements: invest, solde: r2(env - fonct), ecart: r2(fonct - env),
      par_etudiant: p.effectif ? r2(fonct / p.effectif) : null, charges_n1: p.charges_n1, produits_n1: p.produits_n1,
      engage: engage.get(p.section) || 0, taux_execution: env ? Math.round((engage.get(p.section) || 0) / env * 1000) / 10 : null,
      par_categorie: Object.entries(parCat).map(([groupe, montant]) => ({ groupe, montant })).sort((a, b) => b.montant - a.montant),
    };
  });

  // Les charges budgétées restent les enveloppes BRUTES : le coussin est tenu par la direction, pas rendu à l'ASBL.
  const total = r2(lignesSection.reduce((s, x) => s + x.enveloppe_brute, 0));
  const coussins = r2(lignesSection.reduce((s, x) => s + x.coussin, 0));
  const orthoptie = P.orthoptie_budget_he != null ? Math.round(Number(P.orthoptie_budget_he) * Number(P.orthoptie_part)) : null;
  const totalFonctionnement = total + (orthoptie || 0);
  const chargesN1 = r2(params.reduce((s, p) => s + Number(p.charges_n1 || 0), 0));
  // A.7 : les investissements à arbitrer, par priorité puis montant ; l'amortissement annuel (A.6).
  const ordrePrio = { indispensable: 0, souhaitable: 1, si_possible: 2 };
  const investissements = lignes.filter(l => l.nature === 'investissement' && voit(l.section)).map(l => {
    const cat = cats.get(l.categorie_id);
    const duree = cat?.amortissement === 'informatique' ? P.amort_info : P.amort_mobilier;
    return { id: l.id, section: l.section, details: l.details, categorie: cat ? `${cat.groupe} — ${cat.libelle}` : null,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire, total_ht: l.total_ht, priorite: l.priorite, mois: l.mois,
      justification: l.justification, tronc_commun: !!l.tronc_commun, statut: l.statut, duree_amortissement: duree,
      amortissement_annuel: duree ? r2(l.total_ht / duree) : null, arbitre_par: l.arbitre_par, arbitre_le: l.arbitre_le,
      motif_arbitrage: l.motif_arbitrage };
  }).sort((a, b) => (ordrePrio[a.priorite] ?? 9) - (ordrePrio[b.priorite] ?? 9) || b.total_ht - a.total_ht);
  const amortAccordes = r2(investissements.filter(i => i.statut === 'arbitre').reduce((s, i) => s + (i.amortissement_annuel || 0), 0));
  // La réserve d'investissement pèse par son amortissement (mobilier et matériel, A.6) tant qu'aucune ligne ne la remplace.
  const reserves = r2(lignesSection.reduce((s, x) => s + x.reserve_invest, 0));
  const amortReserves = P.amort_mobilier ? r2(reserves / P.amort_mobilier) : 0;

  return {
    annee, parametres: P,
    sections: lignesSection.filter(x => voit(x.section)),
    totaux: sections ? null : {
      enveloppes: total, coussin: coussins, disponible: r2(total - coussins), orthoptie, fonctionnement: totalFonctionnement,
      encode: r2(lignesSection.reduce((s, x) => s + x.encode_fonctionnement, 0)),
      // A.5 : à produits constants, la contribution baisse de ce que les charges des sections augmentent.
      contribution: P.resultat_n1 != null ? {
        charges_n1: chargesN1, resultat_n1: P.resultat_n1,
        charges_avec_enveloppes: totalFonctionnement,
        contribution: Math.round(Number(P.resultat_n1) - (totalFonctionnement - chargesN1)),
        amortissements_accordes: amortAccordes, reserves_invest: reserves, amortissement_reserves: amortReserves,
        contribution_avec_investissements: Math.round(Number(P.resultat_n1) - (totalFonctionnement - chargesN1) - Math.max(amortAccordes, amortReserves)),
      } : null,
    },
    investissements,
  };
}
