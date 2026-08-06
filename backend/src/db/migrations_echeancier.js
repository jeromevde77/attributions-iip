// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Chantier « Ne rien oublier »
// Migration des tables de l'échéancier (Fondation A), du dossier administratif
// et des absences/entretiens (Zone 1), de la communication (Fondation B) et des
// événements d'établissement (Zone 4).
//
// PRINCIPE : aucune duplication. Tout se raccorde aux tables existantes
// (professeur, titre_capacite, attribution, organisation_ue, ea12,
//  document_archive, dossier_rh, utilisateur, annee_calendrier, lucie_notification).
// ─────────────────────────────────────────────────────────────────────────────

export function migrerEcheancier(db) {

  // ═══ FONDATION A — Échéancier ═══════════════════════════════════════════
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS echeance_type (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      code                TEXT UNIQUE NOT NULL,
      libelle             TEXT NOT NULL,
      description         TEXT,
      zone                TEXT,             -- personnel | documents | ue | etablissement
      categorie           TEXT,             -- paie | statutaire | pedagogique | securite | qualite
      regle_date          TEXT NOT NULL,    -- voir services/echeancier.js pour la grammaire
      responsable_defaut  TEXT,             -- rôle ('admin','secretariat'...) ou email
      rappels_defaut      TEXT DEFAULT '[30,7,1]',   -- JSON : jours avant échéance
      base_legale         TEXT,             -- 'Circ. 9760 IV.1.3', 'D. 16/04/1991 art. 123ter'...
      lien_interne        TEXT,             -- route Lucie à ouvrir (ex: '/ea12')
      filtre_source       TEXT,             -- restreint les sources visées (ex: 'epreuve_integree')
      actif               INTEGER NOT NULL DEFAULT 1,
      cree_le             TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ech_type_zone ON echeance_type(zone, actif);
    `);
    console.log('[migration] Table echeance_type créée');
  } catch (e) { console.error('[migration] echeance_type :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS echeance (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      type_id              INTEGER REFERENCES echeance_type(id) ON DELETE CASCADE,
      annee_scolaire       TEXT NOT NULL,
      date_due             TEXT NOT NULL,          -- YYYY-MM-DD
      libelle_override     TEXT,                   -- si précision (ex: "UE 246.1")
      responsable_user_id  INTEGER REFERENCES utilisateur(id),
      responsable_role     TEXT,                   -- si pas d'utilisateur nommé
      statut               TEXT NOT NULL DEFAULT 'a_faire',
      -- a_faire | fait | en_retard | annule | sans_objet
      fait_par             TEXT,
      fait_le              TEXT,
      commentaire          TEXT,
      -- ── Lien polymorphe vers l'existant (source du déclenchement) ──
      source_type          TEXT,   -- professeur | organisation_ue | ea12 | dossier_rh
                                   -- | absence | evenement | contrat | null (référentiel pur)
      source_id            INTEGER,
      genere_auto          INTEGER NOT NULL DEFAULT 0,
      cree_le              TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ech_annee_date ON echeance(annee_scolaire, date_due);
    CREATE INDEX IF NOT EXISTS idx_ech_statut     ON echeance(statut, date_due);
    CREATE INDEX IF NOT EXISTS idx_ech_source     ON echeance(source_type, source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ech_unique
      ON echeance(type_id, annee_scolaire, IFNULL(source_type,''), IFNULL(source_id,0), date_due);
    `);
    console.log('[migration] Table echeance créée');
  } catch (e) { console.error('[migration] echeance :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS action (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      titre                TEXT NOT NULL,
      description          TEXT,
      responsable_user_id  INTEGER REFERENCES utilisateur(id),
      responsable_libre    TEXT,               -- si personne non utilisatrice de Lucie
      date_due             TEXT,
      statut               TEXT NOT NULL DEFAULT 'a_faire',  -- a_faire | fait | annule
      priorite             TEXT DEFAULT 'normale',           -- basse | normale | haute
      source_type          TEXT,   -- note_reunion | echeance | dossier_rh | entretien | libre
      source_id            INTEGER,
      annee_scolaire       TEXT,
      cree_par             TEXT,
      cree_le              TEXT DEFAULT (datetime('now')),
      fait_le              TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_action_statut ON action(statut, date_due);
    CREATE INDEX IF NOT EXISTS idx_action_source ON action(source_type, source_id);
    `);
    console.log('[migration] Table action créée');
  } catch (e) { console.error('[migration] action :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS rappel_envoye (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cible_type  TEXT NOT NULL,      -- echeance | action
      cible_id    INTEGER NOT NULL,
      jalon       TEXT NOT NULL,      -- 'J-30' | 'J-7' | 'J-1' | 'jour_j' | 'retard'
      user_id     INTEGER,
      canal       TEXT NOT NULL DEFAULT 'inapp',   -- inapp | email
      envoye_le   TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rappel_unique
      ON rappel_envoye(cible_type, cible_id, jalon, IFNULL(user_id,0), canal);
    `);
    console.log('[migration] Table rappel_envoye créée');
  } catch (e) { console.error('[migration] rappel_envoye :', e.message); }

  // ═══ ZONE 1 — Dossier administratif, absences, entretiens ════════════════
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS piece_dossier (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id        INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      code_piece           TEXT NOT NULL,   -- A1|A2|A3|A4|A5|A7|A9|A18|casier|titre|contrat|banque
      statut               TEXT NOT NULL DEFAULT 'manquante',
      -- manquante | a_demander | recue | transmise | non_requise | expiree
      date_reception       TEXT,
      date_transmission    TEXT,
      date_expiration      TEXT,
      -- ── Raccordement à l'existant : pas de doublon de stockage ──
      document_archive_id  INTEGER REFERENCES document_archive(id),
      titre_capacite_id    INTEGER REFERENCES titre_capacite(id),
      notes                TEXT,
      modifie_le           TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_piece_unique ON piece_dossier(professeur_id, code_piece);
    CREATE INDEX IF NOT EXISTS idx_piece_statut ON piece_dossier(statut);
    `);
    console.log('[migration] Table piece_dossier créée');
  } catch (e) { console.error('[migration] piece_dossier :', e.message); }

  // Référentiel des pièces attendues (paramétrable par l'admin)
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS piece_type (
      code            TEXT PRIMARY KEY,
      libelle         TEXT NOT NULL,
      annexe          TEXT,           -- 'A3', 'A4'... (circ. 9760)
      base_legale     TEXT,
      obligatoire     TEXT NOT NULL DEFAULT 'tous',  -- tous | temporaire | definitif | expert | jamais
      delai_jours     INTEGER,        -- délai après l'engagement (null = pas d'échéance auto)
      template_slug   TEXT,           -- 🔗 document_template.slug pour générer la pièce
      duree_validite_mois INTEGER,    -- si la pièce expire (ex: casier)
      ordre           INTEGER DEFAULT 0,
      actif           INTEGER NOT NULL DEFAULT 1
    );
    `);
    console.log('[migration] Table piece_type créée');
  } catch (e) { console.error('[migration] piece_type :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS absence_personnel (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id        INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      type                 TEXT NOT NULL,
      -- maladie_1j | maladie | maternite | accident_travail | accident_hors_service
      -- | anrj | greve | cad | autre
      date_debut           TEXT NOT NULL,
      date_fin             TEXT,
      demi_jour            INTEGER DEFAULT 0,
      code_cad             TEXT,      -- intitulé CAD (circ. 9760)
      code_di              TEXT,      -- code DI (circ. 9760 V.1.3.13)
      motif                TEXT,
      -- ── Obligations déclaratives (circ. 9760 IV.3 / circ. 9626) ──
      cammat_declare       INTEGER NOT NULL DEFAULT 0,
      cammat_le            TEXT,
      certificat_recu      INTEGER NOT NULL DEFAULT 0,
      certificat_le        TEXT,
      controle_demande     INTEGER NOT NULL DEFAULT 0,
      remplacement_requis  INTEGER NOT NULL DEFAULT 0,   -- calculé si > 10 j ouvrables
      remplacant_prof_id   INTEGER REFERENCES professeur(id),
      ea12_id              INTEGER REFERENCES ea12(id),  -- 🔗 EA12 d'interruption/reprise
      annee_scolaire       TEXT,
      notes                TEXT,
      cree_par             TEXT,
      cree_le              TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_abs_prof  ON absence_personnel(professeur_id, date_debut);
    CREATE INDEX IF NOT EXISTS idx_abs_annee ON absence_personnel(annee_scolaire, date_debut);
    `);
    console.log('[migration] Table absence_personnel créée');
  } catch (e) { console.error('[migration] absence_personnel :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS entretien_personnel (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id      INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      type               TEXT NOT NULL,
      -- accueil | suivi | visite_classe | evaluation | recadrage | fin_fonction | autre
      date_prevue        TEXT,
      date_tenue         TEXT,
      mene_par           TEXT,
      lieu               TEXT,
      compte_rendu_html  TEXT,
      confidentiel       INTEGER NOT NULL DEFAULT 0,
      dossier_rh_id      INTEGER REFERENCES dossier_rh(id),   -- 🔗 si lié à un dossier RH
      annee_scolaire     TEXT,
      cree_par           TEXT,
      cree_le            TEXT DEFAULT (datetime('now')),
      modifie_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_entr_prof ON entretien_personnel(professeur_id, date_prevue);
    `);
    console.log('[migration] Table entretien_personnel créée');
  } catch (e) { console.error('[migration] entretien_personnel :', e.message); }

  // ═══ FONDATION B — Communication ════════════════════════════════════════
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS note_reunion (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      type               TEXT NOT NULL,
      -- coordination | section | direction | qualite | conseil_etudes | individuelle | autre
      date_reunion       TEXT NOT NULL,
      titre              TEXT NOT NULL,
      annee_scolaire     TEXT,
      participants_json  TEXT DEFAULT '[]',   -- [{type:'prof'|'user'|'externe', id, nom}]
      sections_json      TEXT DEFAULT '[]',
      ues_json           TEXT DEFAULT '[]',
      contenu_html       TEXT,
      statut             TEXT NOT NULL DEFAULT 'brouillon',   -- brouillon | valide
      confidentiel       INTEGER NOT NULL DEFAULT 0,
      cree_par           TEXT,
      cree_le            TEXT DEFAULT (datetime('now')),
      modifie_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_note_date ON note_reunion(date_reunion DESC);
    CREATE INDEX IF NOT EXISTS idx_note_type ON note_reunion(type, annee_scolaire);
    `);
    console.log('[migration] Table note_reunion créée');
  } catch (e) { console.error('[migration] note_reunion :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS communication (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      titre             TEXT NOT NULL,
      corps_html        TEXT,
      canal_inapp       INTEGER NOT NULL DEFAULT 1,
      canal_email       INTEGER NOT NULL DEFAULT 0,
      accuse_demande    INTEGER NOT NULL DEFAULT 0,
      critere_json      TEXT,        -- ciblage utilisé (traçabilité : section, ue, statut...)
      note_reunion_id   INTEGER REFERENCES note_reunion(id),
      annee_scolaire    TEXT,
      statut            TEXT NOT NULL DEFAULT 'brouillon',  -- brouillon | envoye
      cree_par          TEXT,
      cree_le           TEXT DEFAULT (datetime('now')),
      envoye_le         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_comm_date ON communication(cree_le DESC);
    `);
    console.log('[migration] Table communication créée');
  } catch (e) { console.error('[migration] communication :', e.message); }

  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS communication_destinataire (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      communication_id  INTEGER NOT NULL REFERENCES communication(id) ON DELETE CASCADE,
      professeur_id     INTEGER REFERENCES professeur(id),
      utilisateur_id    INTEGER REFERENCES utilisateur(id),
      email_cible       TEXT,
      email_envoye_le   TEXT,
      email_erreur      TEXT,
      lu_le             TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_commdest_unique
      ON communication_destinataire(communication_id, IFNULL(professeur_id,0), IFNULL(utilisateur_id,0));
    `);
    console.log('[migration] Table communication_destinataire créée');
  } catch (e) { console.error('[migration] communication_destinataire :', e.message); }

  // ═══ ZONE 4 — Événements d'établissement ════════════════════════════════
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS evenement_etablissement (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      type                 TEXT NOT NULL,
      -- jpo | conseil_zone | audit_qualite | concertation | evacuation | ceremonie | autre
      titre                TEXT NOT NULL,
      date_debut           TEXT NOT NULL,
      date_fin             TEXT,
      heure_debut          TEXT,
      heure_fin            TEXT,
      lieu                 TEXT,
      description          TEXT,
      annee_scolaire       TEXT,
      responsable_user_id  INTEGER REFERENCES utilisateur(id),
      cree_par             TEXT,
      cree_le              TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_even_date ON evenement_etablissement(date_debut);
    `);
    console.log('[migration] Table evenement_etablissement créée');
  } catch (e) { console.error('[migration] evenement_etablissement :', e.message); }

  // Colonne ajoutée après la première version de la migration
  try {
    const cols = db.prepare("PRAGMA table_info(echeance_type)").all().map(c => c.name);
    if (!cols.includes('filtre_source')) {
      db.exec("ALTER TABLE echeance_type ADD COLUMN filtre_source TEXT");
      console.log('[migration] echeance_type.filtre_source ajoutée');
    }
  } catch (e) { console.error('[migration] filtre_source :', e.message); }

  // ═══ Colonnes ajoutées à l'existant : traçabilité GEDI ══════════════════
  try {
    const cols = db.prepare("PRAGMA table_info(document_archive)").all().map(c => c.name);
    if (!cols.includes('transmis_gedi_le')) {
      db.exec("ALTER TABLE document_archive ADD COLUMN transmis_gedi_le TEXT");
      console.log('[migration] document_archive.transmis_gedi_le ajoutée');
    }
    if (!cols.includes('transmis_par')) {
      db.exec("ALTER TABLE document_archive ADD COLUMN transmis_par TEXT");
      console.log('[migration] document_archive.transmis_par ajoutée');
    }
  } catch (e) { console.error('[migration] document_archive GEDI :', e.message); }

  // ═══ SEED du référentiel ════════════════════════════════════════════════
  seedEcheanceTypes(db);
  seedPieceTypes(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// Référentiel d'échéances — sources : Circ. 9760 du 07/07/2026,
// Décret 16/04/1991 (EA), RGE secondaire EA (AGCF 02/09/2015),
// Statut du personnel subsidié LS (D. 01/02/1993).
//
// Grammaire de regle_date :
//   fixe:JJ/MM                      → chaque année à cette date
//   mensuel:table                   → dates-limites GEDI (table dédiée par année)
//   mensuel_ouvrables:N             → N premiers jours ouvrables du mois
//   rel:<ancre><+|-><N><unité>      → relatif à un événement
//     ancres  : ue_debut, ue_fin, engagement, publication, absence_debut,
//               contrat_fin, evenement, deliberation
//     unités  : j (calendrier), jo (ouvrables), jc_hc (calendrier hors congés),
//               pc (pourcentage de la durée de l'UE), m (mois), sem (semaines)
//   manuelle                        → créée à la main
// ─────────────────────────────────────────────────────────────────────────────
const ECHEANCE_TYPES = [
  // ── A. Paie / GEDI (Zone 2, secrétariat) ──
  { code:'gedi_mensuel', libelle:"Date-limite GEDI — paiement du mois",
    description:"Réception par l'Administration des documents (EA12 et annexes) pour garantir le paiement des traitements et subventions-traitements en fin de mois. Consigne de la circulaire : ne jamais attendre la date ultime.",
    zone:'documents', categorie:'paie', regle_date:'mensuel:gedi',
    responsable_defaut:'secretariat', rappels_defaut:'[7,3,1]',
    base_legale:'Circ. 9760 IV.1.3', lien_interne:'/ea12' },

  { code:'anrj_mensuel', libelle:"A14 — relevé mensuel ANRJ",
    description:"Relevé individuel des absences non réglementairement justifiées : à clôturer le dernier jour ouvrable du mois, à transmettre dans les 5 premiers jours ouvrables du mois suivant (1 document par MDP concerné).",
    zone:'personnel', categorie:'paie', regle_date:'mensuel_ouvrables:5',
    responsable_defaut:'secretariat', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9760 V.13' },

  // ── B. Dates fixes annuelles (circ. 9760) ──
  { code:'ea12_activites_ete', libelle:"EA12 des activités d'été (période d'occupation)",
    description:"Les activités d'enseignement organisées durant les vacances d'été font l'objet d'un EA12 distinct mentionnant le nombre de périodes prestées et la période d'occupation.",
    zone:'documents', categorie:'paie', regle_date:'fixe:30/09',
    responsable_defaut:'secretariat', base_legale:'Circ. 9760 V.1 / II.3.4',
    lien_interne:'/ea12' },

  { code:'examens_linguistiques', libelle:"Inscriptions aux examens linguistiques",
    description:"Date-limite d'inscription aux examens linguistiques (dérogations linguistiques, annexe A9).",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:14/09',
    responsable_defaut:'admin', base_legale:'Circ. 9760 V.9' },

  { code:'horaires_incomplets', libelle:"Répartition des horaires des charges incomplètes arrêtée",
    description:"Lors de l'organisation des horaires et au plus tard le 01/10, les prestations dans le cadre des charges à prestations incomplètes doivent être réparties.",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:01/10',
    responsable_defaut:'admin', base_legale:'Circ. 9760 (partie IV)' },

  { code:'dppr_demande', libelle:"DPPR prenant cours au 01/08 ou 01/09 : demande à l'Administration",
    description:"Demande de disponibilité pour convenances personnelles précédant la pension de retraite : au plus tard le 1er avril qui précède (15 juin si circonstances exceptionnelles), ou 90 jours avant la prise d'effet dans les autres cas. Attention : limitation de la durée des DPPR à 24 mois annoncée.",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:01/04',
    responsable_defaut:'admin', rappels_defaut:'[60,30,7]',
    base_legale:'Circ. 9760 III.3.6.2' },

  { code:'conge_pre_pension', libelle:"Congé pré-pension (pension au 01/09) : demande via formulaire CAD",
    description:"Le MDP définitif prenant sa pension au 1er septembre peut obtenir un congé pré-pension ; la demande doit parvenir à la Direction de gestion au plus tard le 1er juin précédent.",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:01/06',
    responsable_defaut:'admin', rappels_defaut:'[30,7,1]',
    base_legale:'Circ. 9760 III.3.6.1.2' },

  // ── C. Dates fixes statutaires (libre subventionné) ──
  { code:'classement_temporaires', libelle:"Demandes écrites de classement (groupes d'ancienneté)",
    description:"Les membres du personnel temporaires ou définitifs à temps partiel doivent avoir demandé par écrit leur classement au pouvoir organisateur avant le 15 avril.",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:15/04',
    responsable_defaut:'admin', base_legale:'D. 01/02/1993 art. 34 §1' },

  { code:'candidatures_prioritaires', libelle:"Date-limite des candidatures des prioritaires",
    description:"Les candidats qui souhaitent faire valoir leur priorité doivent poser leur candidature (recommandé ou voie électronique selon les modalités fixées en concertation locale) auprès du président du pouvoir organisateur.",
    zone:'personnel', categorie:'statutaire', regle_date:'fixe:29/05',
    responsable_defaut:'admin', rappels_defaut:'[30,14,3]',
    base_legale:'D. 01/02/1993 art. 34ter §1' },

  // ── D. Relatives à un événement personnel ──
  { code:'dossier_entree_fonction', libelle:"Dossier d'entrée en fonction complet",
    description:"Ensemble des documents d'entrée en fonction à transmettre via GEDI : EA12, fiche signalétique (A3), prestation de serment (A4), services antérieurs (A5), dérogation linguistique (A9) s'il échet, copie des titres, extrait de casier judiciaire modèle 2.",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:engagement+5j',
    responsable_defaut:'secretariat', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9760 IV.2', lien_interne:'/professeurs' },

  { code:'cumul_a18', libelle:"A18 — demande d'autorisation de cumul",
    description:"Les deux pages de l'annexe A18 doivent être transmises à la Direction de gestion au plus tard dans les 30 jours qui suivent l'entrée ou la rentrée en fonction du MDP. L'autorisation est valable pour l'année en cours et renouvelable.",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:engagement+30j',
    responsable_defaut:'secretariat', rappels_defaut:'[15,5,1]',
    base_legale:'Circ. 9760 V.18' },

  { code:'accident_travail_decl', libelle:"Déclaration d'accident du travail",
    description:"Déclaration d'accident du travail à transmettre à la Direction de gestion (annexes A12/A13).",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:evenement+5jo',
    responsable_defaut:'secretariat', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9760 V.12' },

  { code:'accident_hors_service', libelle:"Déclaration d'accident hors service (formulaire A)",
    description:"Document à introduire dans les 30 jours qui suivent l'accident hors service.",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:evenement+30j',
    responsable_defaut:'secretariat', base_legale:'Circ. 9760 V.12.2' },

  { code:'greve_a15', libelle:"A15 — relevé des absences pour grève",
    description:"En cas de participation à un mouvement de grève, l'annexe A15 doit être envoyée au plus tard dans les 5 jours ouvrables.",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:evenement+5jo',
    responsable_defaut:'secretariat', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9760 V.14' },

  { code:'cammat_declaration', libelle:"Déclaration CAMMAT (maladie / maternité / accident du travail)",
    description:"Communication d'Absence Maladie Maternité Accident du Travail, à envoyer via GEDI. Remplace les anciens REC-RIM-RMA et les relevés mensuels de maladie (annexes A35/A36 supprimées).",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:absence_debut+2j',
    responsable_defaut:'secretariat', rappels_defaut:'[1]',
    base_legale:'Circ. 9760 IV.3 / circ. 9626 du 11/12/2025' },

  { code:'remplacement_10j', libelle:"Absence de plus de 10 jours ouvrables : engager le remplacement",
    description:"Au-delà de 10 jours ouvrables d'absence, le remplacement du membre du personnel doit être organisé.",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:absence_debut+10jo',
    responsable_defaut:'admin', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9760 III.2.8' },

  { code:'fin_fonction_docs', libelle:"Fin de fonction : C4, attestation de services rendus, rapport éventuel",
    description:"À la fin de la désignation d'un temporaire : établir le C4, l'attestation de services rendus et le rapport éventuel (l'absence de rapport équivaut à la mention « bon »).",
    zone:'personnel', categorie:'statutaire', regle_date:'rel:contrat_fin+5j',
    responsable_defaut:'secretariat', rappels_defaut:'[15,5,1]',
    base_legale:'Circ. 9760 / statut LS' },

  // ── E. Jalons de vie des UE (Zone 3, générés automatiquement) ──
  { code:'ue_preparation', libelle:"Vérifier attributions, local et horaire avant ouverture",
    description:"Contrôle de complétude de l'organisation de l'UE avant son ouverture : professeur attribué, local réservé, horaire publié.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:ue_debut-15j',
    responsable_defaut:'coordination', rappels_defaut:'[7,1]',
    base_legale:'organisation interne', lien_interne:'/attributions' },

  { code:'ue_ouverture', libelle:"Ouverture de l'UE : registres de présence et liste d'inscrits",
    description:"À l'ouverture : registre des présences prêt, liste des inscrits établie, dossiers des apprenants complets.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:ue_debut+0j',
    responsable_defaut:'secretariat', rappels_defaut:'[3,1]',
    base_legale:'Circ. 9764 (dossier apprenant, registres)' },

  { code:'ue_comptage_dixieme', libelle:"Comptage des étudiants réguliers au 1/10 de l'UE",
    description:"Comptage déterminant pour la dotation de périodes de l'établissement.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:ue_debut+10pc',
    responsable_defaut:'secretariat', rappels_defaut:'[7,1]',
    base_legale:'D. 16/04/1991 (dotation)', lien_interne:'/pilotage' },

  { code:'ue_conseil_etudes', libelle:"Conseil des études de fin d'UE (délibération et PV)",
    description:"Délibération à huis clos, actée dans un procès-verbal mentionnant la date d'affichage et le mode de communication des résultats.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:ue_fin+0j',
    responsable_defaut:'coordination', rappels_defaut:'[7,1]',
    base_legale:'RGE art. 28-29' },

  { code:'ue_publication_resultats', libelle:"Publication des résultats (2 jours ouvrables)",
    description:"Les résultats de la délibération sont publiés dans les deux jours ouvrables au tableau d'affichage ou selon le mode prévu au règlement d'ordre intérieur. Les jours ouvrables sont tous les jours sauf le dimanche et les jours fériés légaux.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:deliberation+2jo',
    responsable_defaut:'secretariat', rappels_defaut:'[1]',
    base_legale:'RGE art. 29' },

  { code:'recours_interne_fenetre', libelle:"Fenêtre de plainte pour recours interne (4e jour calendrier)",
    description:"La plainte écrite doit être adressée par pli recommandé au chef d'établissement (ou réceptionnée contre accusé de réception) au plus tard le 4e jour calendrier qui suit la publication des résultats.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:publication+4j',
    responsable_defaut:'admin', rappels_defaut:'[2,1]',
    base_legale:'D. 16/04/1991 art. 123ter §4', lien_interne:'/procedures' },

  { code:'recours_interne_cloture', libelle:"Clôture de la procédure de recours interne (7 jours calendrier hors congés)",
    description:"La procédure de recours interne ne peut excéder les sept jours calendrier hors congés scolaires qui suivent la publication des résultats, en ce compris l'envoi à l'élève par pli recommandé de la motivation du refus et de la décision motivée prise suite au recours interne.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:publication+7jc_hc',
    responsable_defaut:'admin', rappels_defaut:'[3,1]',
    base_legale:'D. 16/04/1991 art. 123ter §4', lien_interne:'/procedures' },

  { code:'recours_externe_fenetre', libelle:"Fenêtre de recours externe de l'élève",
    description:"L'élève peut introduire un recours externe par pli recommandé à l'Administration dans un délai de sept jours à compter du troisième jour ouvrable qui suit la date d'envoi de la décision relative au recours interne.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:evenement+10j',
    responsable_defaut:'admin', rappels_defaut:'[3]',
    base_legale:'D. 16/04/1991 art. 123ter' },

  { code:'ei_cloture_inscriptions', libelle:"Clôture des inscriptions à l'épreuve intégrée (1 mois avant)",
    description:"Le chef d'établissement peut refuser l'inscription d'un élève qui ne s'est pas inscrit au moins un mois avant le début de l'épreuve intégrée.",
    zone:'ue', categorie:'pedagogique', regle_date:'rel:ue_debut-1m',
    responsable_defaut:'secretariat', rappels_defaut:'[15,5]',
    base_legale:'RGE art. 32', filtre_source:'epreuve_integree' },

  // ── F. Établissement (Zone 4) ──
  { code:'rentree_scolaire', libelle:"Rentrée scolaire / académique",
    description:"Début de l'année scolaire et académique : dernier lundi du mois d'août (2026-2027 : lundi 24 août 2026).",
    zone:'etablissement', categorie:'pedagogique', regle_date:'manuelle',
    responsable_defaut:'admin', rappels_defaut:'[30,14,7]',
    base_legale:'Circ. 9760 II.3.2 / D. 16/04/1991 art. 5bis' },

  { code:'lecture_circ_rentree', libelle:"Lire la circulaire de rentrée EA et mettre à jour le référentiel Lucie",
    description:"À la parution de la circulaire de rentrée annuelle de l'Enseignement pour Adultes : vérifier les nouveautés et actualiser le référentiel d'échéances de Lucie.",
    zone:'etablissement', categorie:'qualite', regle_date:'fixe:15/07',
    responsable_defaut:'admin', rappels_defaut:'[7,1]',
    base_legale:'méthode interne', lien_interne:'/echeancier' },

  { code:'evenement_etab', libelle:"Événement d'établissement",
    description:"Journée portes ouvertes, conseil de zone, audit qualité, concertation, exercice d'évacuation, cérémonie.",
    zone:'etablissement', categorie:'qualite', regle_date:'manuelle',
    responsable_defaut:'admin', base_legale:'organisation interne' },
];

// Pièces attendues au dossier administratif d'un membre du personnel
const PIECE_TYPES = [
  { code:'A1',       libelle:"EA12 — demande de mise en liquidation", annexe:'A1/A1bis/A1ter',
    base_legale:'Circ. 9760 V.1', obligatoire:'tous', delai_jours:5, ordre:10 },
  { code:'A3',       libelle:"Fiche signalétique", annexe:'A3',
    base_legale:'Circ. 9760 V.3', obligatoire:'tous', delai_jours:5, ordre:20 },
  { code:'A4',       libelle:"Prestation de serment", annexe:'A4',
    base_legale:'Circ. 9760 V.4', obligatoire:'tous', delai_jours:15, ordre:30 },
  { code:'A5',       libelle:"Déclaration de services antérieurs", annexe:'A5/A5bis',
    base_legale:'Circ. 9760 V.5', obligatoire:'temporaire', delai_jours:30, ordre:40 },
  { code:'A7',       libelle:"Attestation pour allocation de foyer/résidence", annexe:'A7',
    base_legale:'Circ. 9760 V.7', obligatoire:'jamais', ordre:50 },
  { code:'A8',       libelle:"Déclaration de précompte professionnel", annexe:'A8',
    base_legale:'Circ. 9760 V.8', obligatoire:'tous', delai_jours:30, ordre:60 },
  { code:'A9',       libelle:"Demande de dérogation linguistique", annexe:'A9',
    base_legale:'Circ. 9760 V.9', obligatoire:'jamais', ordre:70 },
  { code:'A2',       libelle:"Déclaration de cumul interne", annexe:'A2',
    base_legale:'Circ. 9760 V.2', obligatoire:'jamais', ordre:80 },
  { code:'A18',      libelle:"Demande d'autorisation de cumul", annexe:'A18',
    base_legale:'Circ. 9760 V.18', obligatoire:'jamais', delai_jours:30, ordre:90 },
  { code:'titre',    libelle:"Copie du titre / diplôme", annexe:null,
    base_legale:'Régime des titres et fonctions', obligatoire:'tous', delai_jours:5, ordre:100 },
  { code:'casier',   libelle:"Extrait de casier judiciaire (modèle 2)", annexe:null,
    base_legale:'Circ. 9577 du 28/08/2025', obligatoire:'tous', delai_jours:5,
    duree_validite_mois:12, ordre:110 },
  { code:'naissance',libelle:"Extrait d'acte de naissance", annexe:null,
    base_legale:'Première entrée en fonction', obligatoire:'tous', delai_jours:30, ordre:120 },
  { code:'menage',   libelle:"Composition de ménage", annexe:null,
    base_legale:'Première entrée en fonction', obligatoire:'tous', delai_jours:30, ordre:130 },
  { code:'banque',   libelle:"Coordonnées bancaires", annexe:null,
    base_legale:"Liquidation du traitement", obligatoire:'tous', delai_jours:5, ordre:140 },
  { code:'contrat',  libelle:"Contrat / acte de désignation signé", annexe:null,
    base_legale:'D. 01/02/1993 art. 31', obligatoire:'tous', delai_jours:5,
    template_slug:'contrat', ordre:150 },
];

function seedEcheanceTypes(db) {
  try {
    const ins = db.prepare(`
      INSERT INTO echeance_type
        (code, libelle, description, zone, categorie, regle_date,
         responsable_defaut, rappels_defaut, base_legale, lien_interne, filtre_source)
      VALUES (@code, @libelle, @description, @zone, @categorie, @regle_date,
              @responsable_defaut, @rappels_defaut, @base_legale, @lien_interne, @filtre_source)
      ON CONFLICT(code) DO NOTHING
    `);
    let n = 0;
    for (const t of ECHEANCE_TYPES) {
      const r = ins.run({
        code: t.code, libelle: t.libelle, description: t.description || null,
        zone: t.zone || null, categorie: t.categorie || null, regle_date: t.regle_date,
        responsable_defaut: t.responsable_defaut || null,
        rappels_defaut: t.rappels_defaut || '[30,7,1]',
        base_legale: t.base_legale || null, lien_interne: t.lien_interne || null,
        filtre_source: t.filtre_source || null,
      });
      if (r.changes) n++;
    }
    const total = db.prepare('SELECT COUNT(*) n FROM echeance_type').get().n;
    console.log(`[migration] echeance_type : ${n} type(s) ajouté(s), ${total} au total`);
  } catch (e) { console.error('[migration] seed echeance_type :', e.message); }
}

function seedPieceTypes(db) {
  try {
    const ins = db.prepare(`
      INSERT INTO piece_type
        (code, libelle, annexe, base_legale, obligatoire, delai_jours,
         template_slug, duree_validite_mois, ordre)
      VALUES (@code, @libelle, @annexe, @base_legale, @obligatoire, @delai_jours,
              @template_slug, @duree_validite_mois, @ordre)
      ON CONFLICT(code) DO NOTHING
    `);
    let n = 0;
    for (const p of PIECE_TYPES) {
      const r = ins.run({
        code: p.code, libelle: p.libelle, annexe: p.annexe || null,
        base_legale: p.base_legale || null, obligatoire: p.obligatoire || 'tous',
        delai_jours: p.delai_jours ?? null, template_slug: p.template_slug || null,
        duree_validite_mois: p.duree_validite_mois ?? null, ordre: p.ordre || 0,
      });
      if (r.changes) n++;
    }
    const total = db.prepare('SELECT COUNT(*) n FROM piece_type').get().n;
    console.log(`[migration] piece_type : ${n} type(s) ajouté(s), ${total} au total`);
  } catch (e) { console.error('[migration] seed piece_type :', e.message); }
}

// Dates-limites GEDI par année scolaire (circ. 9760 IV.1.3).
// À compléter chaque année à la lecture de la nouvelle circulaire de rentrée.
export const DATES_GEDI = {
  '2026-2027': [
    { mois:'2026-09', date:'2026-09-14', libelle:'paiement de septembre 2026' },
    { mois:'2026-10', date:'2026-10-14', libelle:"paiement d'octobre 2026" },
    { mois:'2026-11', date:'2026-11-12', libelle:'paiement de novembre 2026' },
    { mois:'2026-12', date:'2026-12-09', libelle:'paiement de décembre 2026' },
    { mois:'2027-01', date:'2027-01-13', libelle:'paiement de janvier 2027' },
    { mois:'2027-02', date:'2027-02-10', libelle:'paiement de février 2027' },
    { mois:'2027-03', date:'2027-03-12', libelle:'paiement de mars 2027' },
    { mois:'2027-04', date:'2027-04-14', libelle:"paiement d'avril 2027" },
    { mois:'2027-05', date:'2027-05-12', libelle:'paiement de mai 2027' },
    { mois:'2027-06', date:'2027-06-14', libelle:'paiement de juin 2027' },
    { mois:'2027-07', date:'2027-07-13', libelle:'paiement de juillet 2027' },
    { mois:'2027-08', date:'2027-08-13', libelle:"paiement d'août 2027" },
  ],
};

export default migrerEcheancier;
