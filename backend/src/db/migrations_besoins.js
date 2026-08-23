// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Besoins et offres d'emploi
//
// Chaîne : attribution « À DÉSIGNER » → besoin (calculé) → offre → publication
//          → candidatures → engagement → parcours administratif.
//
// Deux apports :
//   · un référentiel des titres (régime des titres et fonctions) rattaché aux
//     cours, pour que l'offre liste d'office les titres visés ;
//   · l'enrichissement de `recrutement_poste`, qui devient la fiche d'offre
//     (cours, périodes, groupes, titres, publication) plutôt qu'un simple
//     intitulé libre. Aucune table concurrente n'est créée.
// ─────────────────────────────────────────────────────────────────────────────

export function migrerBesoinsOffres(db) {

  // ═══ Référentiel des titres ═══════════════════════════════════════════════
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS titre (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT UNIQUE NOT NULL,
      libelle    TEXT NOT NULL,
      niveau     TEXT,        -- Master | Bachelier | CESS | Certificat | Autre
      categorie  TEXT,        -- pédagogique | technique | scientifique | autre
      actif      INTEGER NOT NULL DEFAULT 1,
      cree_le    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_titre_actif ON titre(actif, libelle);
    `);
    console.log('[migration] Table titre créée');
  } catch (e) { console.error('[migration] titre :', e.message); }

  // Rattachement titre ↔ cours. La clé est le code de cours (stable d'une année
  // à l'autre) : le régime des titres relève du référentiel légal, pas du
  // paramétrage annuel.
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS cours_titre (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cours_code  TEXT NOT NULL,
      titre_id    INTEGER NOT NULL REFERENCES titre(id) ON DELETE CASCADE,
      portee      TEXT NOT NULL DEFAULT 'requis',   -- requis | suffisant | penurie
      notes       TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cours_titre_unique
      ON cours_titre(cours_code, titre_id);
    CREATE INDEX IF NOT EXISTS idx_cours_titre_cours ON cours_titre(cours_code);
    `);
    console.log('[migration] Table cours_titre créée');
  } catch (e) { console.error('[migration] cours_titre :', e.message); }

  // ═══ recrutement_poste devient la fiche d'offre ═══════════════════════════
  const colonnes = [
    ['code_cours',        'TEXT'],      // cours visé (une offre = un cours)
    ['quadrimestre',      'TEXT'],
    ['periodes_cours',    'REAL'],      // périodes d'UN groupe
    ['nb_groupes',        'INTEGER'],   // nombre de groupes à pourvoir
    ['total_periodes',    'REAL'],      // total à pourvoir (périodes × groupes)
    ['nb_postes',         'INTEGER'],   // nombre de personnes recherchées
    ['type_cours',        'TEXT'],      // CT | PP
    ['titres_extra',      'TEXT'],      // JSON : titres cochés en plus du référentiel
    ['competences',       'TEXT'],
    ['profil',            'TEXT'],
    ['horaire_indicatif', 'TEXT'],
    ['date_publication',  'TEXT'],
    ['canal_publication', 'TEXT'],
    ['date_limite',       'TEXT'],
    ['publie_par',        'TEXT'],
  ];
  try {
    const existantes = db.prepare("PRAGMA table_info(recrutement_poste)").all().map(c => c.name);
    let n = 0;
    for (const [nom, type] of colonnes) {
      if (!existantes.includes(nom)) {
        db.exec(`ALTER TABLE recrutement_poste ADD COLUMN ${nom} ${type}`);
        n++;
      }
    }
    if (n) console.log(`[migration] recrutement_poste : ${n} colonne(s) d'offre ajoutée(s)`);
  } catch (e) { console.error('[migration] colonnes offre :', e.message); }

  // Marqueur explicite « poste à désigner » sur la fiche professeur.
  // La détection actuelle repose sur le nom (LIKE '%SIGN%'), formulée
  // différemment à trois endroits : fragile. Le marqueur devient la source
  // fiable, la recherche par nom restant un filet de sécurité.
  try {
    const cols = db.prepare("PRAGMA table_info(professeur)").all().map(c => c.name);
    if (!cols.includes('est_a_designer')) {
      db.exec('ALTER TABLE professeur ADD COLUMN est_a_designer INTEGER NOT NULL DEFAULT 0');
      console.log('[migration] professeur.est_a_designer ajoutée');
    }
    // Renseigner le marqueur sur les fiches existantes
    const maj = db.prepare(`
      UPDATE professeur SET est_a_designer = 1
       WHERE est_a_designer = 0
         AND (UPPER(nom) LIKE '%SIGN%' OR UPPER(prenom) LIKE '%SIGN%'
              OR UPPER(COALESCE(nom,'') || ' ' || COALESCE(prenom,'')) LIKE '%DESIGN%')
    `).run();
    if (maj.changes) console.log(`[migration] ${maj.changes} fiche(s) « à désigner » marquée(s)`);
  } catch (e) { console.error('[migration] est_a_designer :', e.message); }

  seedTitres(db);
}

// Premier jeu de titres courants à l'IIP. Le référentiel est destiné à être
// complété par la direction ; ces valeurs ne sont qu'une amorce.
const TITRES = [
  { code: 'MASTER_SBM',  libelle: 'Master en sciences biomédicales',           niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_BIO',  libelle: 'Master en biologie',                        niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_CHIM', libelle: 'Master en sciences chimiques',              niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_PHYS', libelle: 'Master en sciences physiques',              niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_MATH', libelle: 'Master en sciences mathématiques',          niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_INFO', libelle: 'Master en sciences informatiques',          niveau: 'Master',     categorie: 'technique' },
  { code: 'MASTER_ING',  libelle: 'Master ingénieur civil',                    niveau: 'Master',     categorie: 'technique' },
  { code: 'MASTER_INGI', libelle: 'Master ingénieur industriel',               niveau: 'Master',     categorie: 'technique' },
  { code: 'DOCTEUR_MED', libelle: 'Docteur en médecine',                       niveau: 'Master',     categorie: 'scientifique' },
  { code: 'MASTER_KINE', libelle: 'Master en kinésithérapie',                  niveau: 'Master',     categorie: 'scientifique' },
  { code: 'BACH_INFIRM', libelle: 'Bachelier en soins infirmiers',             niveau: 'Bachelier',  categorie: 'scientifique' },
  { code: 'BACH_OPT',    libelle: 'Bachelier en optique-optométrie',           niveau: 'Bachelier',  categorie: 'technique' },
  { code: 'BACH_INFO',   libelle: 'Bachelier en informatique de gestion',      niveau: 'Bachelier',  categorie: 'technique' },
  { code: 'BACH_CHIM',   libelle: 'Bachelier en chimie',                       niveau: 'Bachelier',  categorie: 'scientifique' },
  { code: 'BACH_BIO',    libelle: 'Bachelier en biologie médicale',            niveau: 'Bachelier',  categorie: 'scientifique' },
  { code: 'AESI',        libelle: 'Agrégé de l\'enseignement secondaire inférieur (AESI)', niveau: 'Bachelier', categorie: 'pédagogique' },
  { code: 'AESS',        libelle: 'Agrégé de l\'enseignement secondaire supérieur (AESS)', niveau: 'Master',    categorie: 'pédagogique' },
  { code: 'CAP',         libelle: 'Certificat d\'aptitudes pédagogiques (CAP)', niveau: 'Certificat', categorie: 'pédagogique' },
  { code: 'CAPAES',      libelle: 'CAPAES',                                     niveau: 'Certificat', categorie: 'pédagogique' },
  { code: 'CESS',        libelle: 'Certificat d\'enseignement secondaire supérieur (CESS)', niveau: 'CESS', categorie: 'autre' },
];

function seedTitres(db) {
  try {
    const ins = db.prepare(`
      INSERT INTO titre (code, libelle, niveau, categorie)
      VALUES (@code, @libelle, @niveau, @categorie)
      ON CONFLICT(code) DO NOTHING
    `);
    let n = 0;
    for (const t of TITRES) if (ins.run(t).changes) n++;
    const total = db.prepare('SELECT COUNT(*) n FROM titre').get().n;
    console.log(`[migration] titre : ${n} ajouté(s), ${total} au total`);
  } catch (e) { console.error('[migration] seed titre :', e.message); }
}

export default migrerBesoinsOffres;
