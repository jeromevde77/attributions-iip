-- ============================================================================
-- Schéma Attributions IIP — équivalent SQLite de Attributions.xlsm + BD_UE_COURS.xlsx
-- ============================================================================
-- Toutes les colonnes "calculées" (VLOOKUP, IF, SUMIFS) sont reconstruites
--   - soit par contraintes de clés étrangères + JOIN (les VLOOKUP)
--   - soit par GENERATED columns ou par la couche service (les IF/SUMIFS)
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ----------------------------------------------------------------------------
-- 1. Référentiels (BD_UE_COURS)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ue (
    ue_num          INTEGER PRIMARY KEY,                     -- Ue_num (clé FWB interne)
    ue_nom          TEXT NOT NULL,
    ue_code_fwb     TEXT,                                    -- code FWB officiel
    section         TEXT,                                    -- ex. Psychomotricité, Optique…
    ue_tc           TEXT,                                    -- "x" si Tronc Commun
    ue_det          TEXT,                                    -- détails
    ue_niv          TEXT,                                    -- BA1/BA2/BA3
    ue_per_etudiants INTEGER,                                -- per. étudiants
    ue_per_cours    INTEGER,                                 -- per. cours
    ue_aut          INTEGER,                                 -- autonomie
    ue_tot_prf      INTEGER,                                 -- total prof
    ue_niveau       TEXT,                                    -- SUP / DS
    ue_quad         TEXT,                                    -- Q1, Q2, Q1/Q2
    et_ref          TEXT,                                    -- établissement référent (IIP/HELB)
    ects            INTEGER,
    ue_prerequise   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ue_section ON ue(section);
CREATE INDEX IF NOT EXISTS idx_ue_niveau ON ue(ue_niveau);

CREATE TABLE IF NOT EXISTS cours (
    cours_code      TEXT PRIMARY KEY,                        -- ex. "219.1"
    cours_num       INTEGER,
    cours_nom       TEXT NOT NULL,
    ct_pp           TEXT,                                    -- CT (cours technique) ou PP (pratique pro)
    section         TEXT,
    ue_num          INTEGER REFERENCES ue(ue_num),
    quadrimestre_cours TEXT,
    cours_per       INTEGER,                                 -- périodes du cours
    cours_total     INTEGER,
    ue_autonomie    INTEGER,
    ue_per_total    INTEGER,
    ue_niveau       TEXT,
    enc_cours       TEXT,                                    -- "Encadrement" / "Cours"
    heures          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cours_ue ON cours(ue_num);

CREATE TABLE IF NOT EXISTS aa (
    aa_code         TEXT PRIMARY KEY,                        -- "AA282.1"
    aa_num          INTEGER,                                 -- 1, 2, 3...
    ue_num          INTEGER REFERENCES ue(ue_num),
    cours_code      TEXT REFERENCES cours(cours_code),
    description     TEXT
);

-- ----------------------------------------------------------------------------
-- 2. Référentiels métier (Attributions.xlsm)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS section (
    code            TEXT PRIMARY KEY,                        -- ATNUP, Optique, ME, TIM...
    libelle         TEXT
);

CREATE TABLE IF NOT EXISTS professeur (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL,
    prenom          TEXT NOT NULL,
    nom_prenom      TEXT GENERATED ALWAYS AS (nom || ' ' || prenom) VIRTUAL,
    adresse_mail    TEXT,                                    -- prenom.nom@institut-prigogine.be
    mail_prive      TEXT,
    suivi_peda      TEXT,
    statut          TEXT,                                    -- EXP / CC / MDP
    adresse_rue     TEXT,
    code_postal     TEXT,
    commune         TEXT,
    contrat_cc      TEXT,                                    -- "x" si CC
    capaes          TEXT,
    prestations     TEXT,                                    -- complètes / incomplètes (calculé)
    anciennete_25_26_po INTEGER DEFAULT 0,                   -- ancienneté PO
    UNIQUE(nom, prenom)
);

CREATE INDEX IF NOT EXISTS idx_prof_nomprenom ON professeur(nom, prenom);

CREATE TABLE IF NOT EXISTS local (
    nom             TEXT PRIMARY KEY,                        -- "Nile", "P2 524"...
    type            TEXT,                                    -- Auditoire / Salle / Labo
    places          INTEGER,
    micro           TEXT,
    equipement      TEXT,
    son             TEXT,
    it              TEXT,
    projection      TEXT
);

-- ----------------------------------------------------------------------------
-- 3. Constantes financières (= feuille Données)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parametre_financier (
    cle             TEXT PRIMARY KEY,
    valeur_num      REAL,
    valeur_txt      TEXT,
    description     TEXT
);

-- Valeurs par défaut (issues de la feuille 'Données' R3-R4)
INSERT OR IGNORE INTO parametre_financier (cle, valeur_num, description) VALUES
    ('DI_FWB_DS',       0.29,  'DI FWB pour Degré Supérieur DS'),
    ('DI_FWB_SUP',      0.47,  'DI FWB pour SUP (Supérieur)'),
    ('DI_FIXE_DS',      33,    'DI Fixe DS'),
    ('DI_FIXE_SUP',     33,    'DI Fixe SUP'),
    ('FC',              50,    'Frais coordination'),
    ('BA',              150,   'Coût BA'),
    ('FI_MOBILE_DS',    0.20,  'FI Mobile DS'),
    ('FI_MOBILE_SUP',   0.40,  'FI Mobile SUP'),
    ('COEF_SUP',        1.5,   'Coefficient coût dotation niveau SUP'),
    ('COEF_DS',         1.25,  'Coefficient coût dotation niveau DS'),
    ('CT_PERIODE',      800,   'Périodes annuelles CT (cours technique)'),
    ('PP_PERIODE',      1000,  'Périodes annuelles PP (pratique professionnelle)'),
    ('CONV_PERIODE_HEURE', 0.833333, 'Conversion période → heure (50/60)'),
    ('HELB_MFP',        750,   'Fraction HELB MFP'),
    ('HELB_MA',         480,   'Fraction HELB MA'),
    ('PERIODES_DISPO_25', 13480, 'Périodes disponibles 2025'),
    ('PERIODES_DISPO_26', 13550, 'Périodes disponibles 2026');

-- Listes encadrement (issues de 'Données' R10-R20)
CREATE TABLE IF NOT EXISTS type_encadrement (
    code            TEXT PRIMARY KEY,
    libelle         TEXT NOT NULL
);

INSERT OR IGNORE INTO type_encadrement (code, libelle) VALUES
    ('Cours',  'Cours'),
    ('ES',     'Encadrement de stage'),
    ('EI',     'Encadrement de TFE'),
    ('COSEC',  'Coordination de section'),
    ('COCUR',  'Coordination de cursus'),
    ('COSTA',  'Coordination de stage'),
    ('COTFE',  'Coordination de TFE'),
    ('CREF',   'Référent métier'),
    ('COQUAL', 'Coordinateur qualité'),
    ('COINCL', 'Coordinateur inclusif'),
    ('COPEDA', 'Coordination pédagogique');

-- ----------------------------------------------------------------------------
-- 3bis. Types d'activités au sein d'un cours (Théorie / Exercices / TP / ...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activite_type (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle         TEXT NOT NULL UNIQUE,
    ordre           INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO activite_type (id, libelle, ordre) VALUES
    (1, 'Théorie',                1),
    (2, 'Exercices',              2),
    (3, 'Travaux pratiques (TP)', 3),
    (4, 'Laboratoire',            4),
    (5, 'Stage',                  5),
    (6, 'Séminaire',              6),
    (7, 'TFE',                    7);

-- ----------------------------------------------------------------------------
-- 4. Table CENTRALE : Attributions (les 115 colonnes Excel → ~45 colonnes utiles)
-- ----------------------------------------------------------------------------
-- Tout ce qui était VLOOKUP est remplacé par FK + JOIN.
-- Tout ce qui était IF/calcul reste stocké (cached) ET recalculé par triggers.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attribution (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Contexte (Section / Établissement)
    section         TEXT REFERENCES section(code),
    etablissement_referent TEXT,                             -- IIP, HELB
    contrat_mdp     TEXT,                                    -- IIP, HELB (employeur effectif)
    organisation    TEXT,                                    -- "x" si organisé
    annee_scolaire  TEXT DEFAULT '2025-2026',

    -- UE (les VLOOKUP[5,7,8,...] → JOIN ue)
    ue_num          INTEGER NOT NULL REFERENCES ue(ue_num),
    num_organisation INTEGER DEFAULT 1,                       -- numéro d'organisation (1, 2, 3...)
    quadrimestre_attribue TEXT,                              -- Q1/Q2 attribué (peut différer de UE.ue_quad)

    -- Cours
    code_cours      TEXT REFERENCES cours(cours_code),
    type_cours      TEXT,                                    -- CT / PP
    type_cours_helb TEXT,                                    -- MFP / MA / NULL
    code            TEXT,                                    -- A, A1, A2, B...  (lettre groupe)
    nb_groupes      INTEGER DEFAULT 1,
    split_groupe    TEXT DEFAULT 'N',                        -- N / O (cours splitté)
    num_split       INTEGER,                                 -- numéro du split
    num_groupe      INTEGER,                                 -- numéro groupe
    activite_id     INTEGER REFERENCES activite_type(id),    -- Théorie, Exercices, TP, ...

    -- Affectation
    professeur_id   INTEGER REFERENCES professeur(id),
    cours_ept_ad    TEXT,                                    -- C / EPT / AD
    coordination_encadrement TEXT REFERENCES type_encadrement(code),

    -- Modifications & commentaires
    modification_attribution TEXT,
    commentaire     TEXT,
    commentaire_2   TEXT,
    charge_perdue_84plus REAL,
    periodes_transferees REAL,

    -- Périodes étudiant (info)
    per_etudiant_total_dp INTEGER,

    -- ⭐ LES INPUTS principaux du calcul
    periodes_attribuees REAL NOT NULL DEFAULT 0,             -- Col 38 (Périodes attribuées)
    autonomie_attribuee REAL NOT NULL DEFAULT 0,             -- Col 39 (Autonomie attribuée)

    -- ⭐ LES CALCULS (cachés, recalculés en service ou trigger)
    total_attribue_professeur REAL                           -- = periodes + autonomie
                    GENERATED ALWAYS AS
                    (COALESCE(periodes_attribuees,0) + COALESCE(autonomie_attribuee,0)) VIRTUAL,
    charge_en_heures REAL                                    -- = total * 50/60
                    GENERATED ALWAYS AS
                    (ROUND((COALESCE(periodes_attribuees,0) + COALESCE(autonomie_attribuee,0)) * 50.0 / 60.0)) VIRTUAL,

    -- Audit
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by      INTEGER REFERENCES utilisateur(id),
    updated_by      INTEGER REFERENCES utilisateur(id)
);

CREATE INDEX IF NOT EXISTS idx_attr_section   ON attribution(section);
CREATE INDEX IF NOT EXISTS idx_attr_ue        ON attribution(ue_num);
CREATE INDEX IF NOT EXISTS idx_attr_prof      ON attribution(professeur_id);
CREATE INDEX IF NOT EXISTS idx_attr_contrat   ON attribution(contrat_mdp);
CREATE INDEX IF NOT EXISTS idx_attr_cours     ON attribution(code_cours);

-- ----------------------------------------------------------------------------
-- 5. Planning hebdomadaire (les 43 colonnes Semaine 0 → Semaine 42)
-- ----------------------------------------------------------------------------
-- Au lieu de 43 colonnes répétitives, une table normalisée (1 ligne / semaine).

CREATE TABLE IF NOT EXISTS planning_hebdo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attribution_id  INTEGER NOT NULL REFERENCES attribution(id) ON DELETE CASCADE,
    semaine         INTEGER NOT NULL,                        -- 0 à 42
    heures          REAL DEFAULT 0,
    libelle_semaine TEXT,                                    -- "Semaine 32 - Semaine IRO"
    UNIQUE(attribution_id, semaine)
);

CREATE INDEX IF NOT EXISTS idx_planning_attr ON planning_hebdo(attribution_id);

-- ----------------------------------------------------------------------------
-- 6. UE_inscriptions (feuille UE_inscriptions)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ue_inscription (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ue_num          INTEGER NOT NULL REFERENCES ue(ue_num),
    num_organisation INTEGER DEFAULT 1,
    payroll         TEXT,                                    -- iip / helb
    organisation    TEXT,
    nb_etudiants_iip INTEGER DEFAULT 0,
    nb_etudiants_helb INTEGER DEFAULT 0,
    encadrement     TEXT,                                    -- "x" si encadrement spécifique
    annee_scolaire  TEXT DEFAULT '2025-2026',
    UNIQUE(ue_num, num_organisation, annee_scolaire)
);

CREATE INDEX IF NOT EXISTS idx_ueins_ue ON ue_inscription(ue_num);

-- ----------------------------------------------------------------------------
-- 7. Modifications / audit log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS modification_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attribution_id  INTEGER REFERENCES attribution(id) ON DELETE SET NULL,
    date_modif      DATETIME DEFAULT CURRENT_TIMESTAMP,
    utilisateur_id  INTEGER REFERENCES utilisateur(id),
    action          TEXT,                                    -- create / update / delete
    champ_modifie   TEXT,
    valeur_avant    TEXT,
    valeur_apres    TEXT,
    motif           TEXT
);

-- ----------------------------------------------------------------------------
-- 8. Clés eCampus (référentiel)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cle_ecampus (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    annee           TEXT NOT NULL,                           -- '24-25' / '25-26'
    code_section    TEXT,                                    -- IIPATNUP / IIPOPTI...
    libelle         TEXT,
    profil          TEXT,                                    -- teacher / student
    cle             TEXT
);

-- ----------------------------------------------------------------------------
-- 9. Utilisateurs de l'application (auth)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS utilisateur (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    nom_complet     TEXT,
    role            TEXT NOT NULL DEFAULT 'consultation',    -- admin / editeur / consultation
    actif           INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at   DATETIME
);

-- ----------------------------------------------------------------------------
-- 10. Vues utiles (= équivalents des Tableaux de pilotage Excel)
-- ----------------------------------------------------------------------------

-- Vue détaillée = ce qu'affiche la grille des attributions
DROP VIEW IF EXISTS v_attribution_complete;
CREATE VIEW v_attribution_complete AS
SELECT
    a.id,
    a.section,
    a.etablissement_referent,
    a.contrat_mdp,
    a.organisation,
    a.annee_scolaire,
    a.ue_num,
    u.ue_nom,
    u.ue_code_fwb,
    u.ue_niv         AS bloc,                                -- BA1/BA2/BA3
    u.ue_niveau      AS niveau,                              -- SUP / DS
    u.ue_tc          AS tc,
    u.ue_quad        AS quadri_pour_tous_prevu,
    a.quadrimestre_attribue,
    u.ue_det,
    u.ue_code_fwb    AS codification_unite,
    a.num_organisation,
    a.code_cours,
    c.cours_nom      AS nom_cours,
    a.commentaire,
    a.commentaire_2,
    a.type_cours,
    a.type_cours_helb,
    a.code,
    a.nb_groupes,
    a.split_groupe,
    a.num_split,
    a.num_groupe,
    a.coordination_encadrement,
    a.per_etudiant_total_dp,

    -- Guides (depuis BD_UE_COURS pour aider le coordinateur)
    c.cours_per      AS cours_per_prevu,
    c.ue_autonomie   AS ue_autonomie_prevu,
    a.activite_id,
    at.libelle       AS activite_nom,

    -- Professeur
    a.professeur_id,
    p.nom            AS prof_nom,
    p.prenom         AS prof_prenom,
    p.nom || ' ' || p.prenom  AS professeur,
    p.statut         AS contrat,
    a.cours_ept_ad,
    a.modification_attribution,
    a.charge_perdue_84plus,
    a.periodes_transferees,

    -- Inputs
    a.periodes_attribuees,
    a.autonomie_attribuee,

    -- Calculs de base
    a.total_attribue_professeur,
    a.charge_en_heures,

    -- Charge (CT 800e / PP 1000e × 10)
    CASE WHEN a.type_cours='CT' THEN (a.total_attribue_professeur / 800.0) * 10
         WHEN a.type_cours='PP' THEN (a.total_attribue_professeur / 1000.0) * 10
         ELSE 0 END                                          AS charge,

    -- Charge HELB
    CASE WHEN a.contrat_mdp = 'HELB' THEN
        CASE WHEN a.type_cours_helb = 'MFP' THEN a.charge_en_heures / 750.0 * 10
             WHEN a.type_cours_helb = 'MA'  THEN a.charge_en_heures / 480.0 * 10
             ELSE NULL END
        ELSE NULL END                                        AS charge_helb,

    -- CT et PP (séparation)
    CASE WHEN a.type_cours='CT' THEN a.total_attribue_professeur ELSE 0 END AS ct,
    CASE WHEN a.type_cours='PP' THEN a.total_attribue_professeur ELSE 0 END AS pp,

    -- Total périodes organisées (seulement si organisation='x')
    CASE WHEN a.organisation='x' THEN a.total_attribue_professeur ELSE 0 END AS total_periodes_organisees,

    -- Coût dotation (IIP uniquement)  AY = total ; coef SUP=1.5, DS=1.25
    CASE WHEN a.contrat_mdp = 'IIP' THEN
        CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur * 1.5
             WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur * 1.25
             ELSE 0 END
        ELSE 0 END                                           AS cout_dotation,

    -- Coût HELB (HELB uniquement)
    CASE WHEN a.contrat_mdp = 'HELB' THEN
        CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur * 1.5
             WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur * 1.25
             ELSE 0 END
        ELSE 0 END                                           AS cout_helb,

    -- Coût S-D / J-J (selon quadrimestre attribué, sinon quadri UE)
    -- quad_eff = quadrimestre effectif pour le calcul
    CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1' THEN
            CASE WHEN a.contrat_mdp='IIP' AND u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
                 WHEN a.contrat_mdp='IIP' AND u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
                 ELSE 0 END
         WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
            CASE WHEN a.contrat_mdp='IIP' AND u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.4
                 WHEN a.contrat_mdp='IIP' AND u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.4
                 ELSE 0 END
         ELSE 0 END                                          AS cout_dotation_q1,

    CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q2' THEN
            CASE WHEN a.contrat_mdp='IIP' AND u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
                 WHEN a.contrat_mdp='IIP' AND u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
                 ELSE 0 END
         WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
            CASE WHEN a.contrat_mdp='IIP' AND u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.6
                 WHEN a.contrat_mdp='IIP' AND u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.6
                 ELSE 0 END
         ELSE 0 END                                          AS cout_dotation_q2,

    -- Ancienneté de fonction (CC uniquement)
    CASE WHEN p.statut='CC' THEN
        CASE WHEN a.total_attribue_professeur > 399 THEN 360
             WHEN a.total_attribue_professeur > 39  THEN 180
             ELSE 0 END
        ELSE NULL END                                        AS anciennete_fonction,

    -- Indicateur > 40 périodes
    CASE WHEN a.total_attribue_professeur > 39 THEN 'ok' ELSE '' END AS sup_40,

    a.created_at,
    a.updated_at
FROM attribution a
LEFT JOIN ue            u  ON u.ue_num     = a.ue_num
LEFT JOIN cours         c  ON c.cours_code = a.code_cours
LEFT JOIN professeur    p  ON p.id         = a.professeur_id
LEFT JOIN activite_type at ON at.id        = a.activite_id;

-- Vue Total_per par professeur (= colonne Total_per du Tableau4 Coordonnées_professeurs)
DROP VIEW IF EXISTS v_professeur_total;
CREATE VIEW v_professeur_total AS
SELECT
    p.id,
    p.nom,
    p.prenom,
    p.nom || ' ' || p.prenom AS nom_prenom,
    p.adresse_mail,
    p.statut,
    p.anciennete_25_26_po,
    COALESCE(SUM(CASE WHEN a.contrat_mdp='IIP' THEN a.total_attribue_professeur ELSE 0 END), 0) AS total_per_iip,
    COALESCE(SUM(CASE WHEN a.contrat_mdp='HELB' THEN a.charge_en_heures ELSE 0 END), 0) AS total_hrs_helb,
    -- prestations complètes/incomplètes (seuil 800 périodes)
    CASE WHEN SUM(CASE WHEN a.contrat_mdp='IIP' THEN a.total_attribue_professeur ELSE 0 END) >= 800
         THEN 'complètes' ELSE 'incomplètes' END AS prestations
FROM professeur p
LEFT JOIN attribution a ON a.professeur_id = p.id
GROUP BY p.id;

-- Trigger pour mettre à jour updated_at sur attribution
DROP TRIGGER IF EXISTS trg_attr_updated;
CREATE TRIGGER trg_attr_updated AFTER UPDATE ON attribution
BEGIN
    UPDATE attribution SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ----------------------------------------------------------------------------
-- Vue : conformité du total des périodes par cours
-- ----------------------------------------------------------------------------
-- Pour chaque cours (section + code_cours), calcule :
--   - cours_per : périodes prévues par étudiant (depuis la table cours)
--   - total_attribue : somme des périodes attribuées (sur toutes les attributions)
--   - multiple_attendu : nombre entier le plus proche (total_attribue / cours_per)
--   - conforme : 1 si total_attribue est un multiple exact de cours_per, 0 sinon
DROP VIEW IF EXISTS v_cours_conformite;
CREATE VIEW v_cours_conformite AS
SELECT
    a.section,
    a.code_cours,
    c.cours_nom,
    c.cours_per,
    SUM(COALESCE(a.periodes_attribuees, 0)) AS total_attribue,
    CASE
        WHEN c.cours_per IS NULL OR c.cours_per = 0 THEN NULL
        ELSE ROUND(1.0 * SUM(COALESCE(a.periodes_attribuees, 0)) / c.cours_per, 2)
    END AS multiple_attendu,
    CASE
        WHEN c.cours_per IS NULL OR c.cours_per = 0 THEN 0
        WHEN SUM(COALESCE(a.periodes_attribuees, 0)) = 0 THEN 1
        WHEN SUM(COALESCE(a.periodes_attribuees, 0)) % c.cours_per = 0 THEN 1
        ELSE 0
    END AS conforme
FROM attribution a
LEFT JOIN cours c ON c.cours_code = a.code_cours
WHERE a.code_cours IS NOT NULL
GROUP BY a.section, a.code_cours, c.cours_nom, c.cours_per;
