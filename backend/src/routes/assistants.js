// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Assistants de mise en route
//
// Certaines opérations sont rares, longues, et faites d'étapes dépendantes :
// créer une section, ouvrir une année scolaire, accueillir un membre du
// personnel. Oublier une étape ne produit aucune erreur — juste un écran vide
// trois semaines plus tard.
//
// Un assistant N'IMPLÉMENTE RIEN : il orchestre les écrans existants. Chaque
// étape est une CONDITION VÉRIFIÉE EN BASE, pas une case à cocher déclarative.
// L'assistant lit donc l'état réel : rouvert six mois plus tard sur une section
// existante, il sert de diagnostic et montre ce qui manque encore.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { niveauxEffectifs } from './capitalisation.js';

const r = Router();

const un = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch { return null; } };
const compte = (sql, ...p) => Number(un(sql, ...p)?.n || 0);

// ── Définition déclarative des assistants ───────────────────────────────────
// Chaque étape : clé, titre, aide, écran cible, et une fonction de vérification
// qui renvoie { fait, valeur, detail? }. Ajouter un assistant = ajouter une
// entrée ici, le rendu et l'API sont communs.
const ASSISTANTS = {
  annee: {
    titre: 'Ouvrir une année scolaire',
    intro: "La rentrée apporte une circulaire, parfois un décret, et les échéances propres à l'établissement. Ce qui est réglementaire se reconduit ; le reste se reporte et s'ajuste.",
    parametres: ['annee'],
    etapes: [
      {
        cle: 'annee_creee',
        titre: 'Créer l\u2019année scolaire',
        aide: "L'année doit exister et, le moment venu, devenir l'année active.",
        cible: '/configuration?onglet=annees',
        verifier: ({ annee }) => {
          const a = un('SELECT code, active FROM annee_scolaire WHERE code = ?', annee);
          return {
            fait: !!a,
            valeur: a ? (a.active ? 'créée · active' : 'créée') : null,
            detail: a && !a.active ? "L'année existe mais n'est pas encore l'année active." : null,
          };
        },
      },
      {
        cle: 'veille',
        titre: 'Veille réglementaire — décret et circulaire',
        aide: "Nouveau décret ? Nouvelle circulaire de rentrée ? Si rien n'a changé, les échéances légales sont reconduites telles quelles.",
        cible: '/organisation?onglet=rentree',
        verifier: ({ annee }) => {
          const total = compte('SELECT COUNT(*) AS n FROM echeance_type WHERE actif = 1');
          if (!total) return { fait: false, valeur: null, detail: 'Aucun type d\u2019échéance au référentiel.' };
          const revus = compte(
            'SELECT COUNT(*) AS n FROM echeance_type WHERE actif = 1 AND revue_annee = ?', annee);
          return {
            fait: revus === total,
            valeur: `${revus}/${total} confirmé(s)`,
            detail: revus < total ? `${total - revus} type(s) d'échéance à confirmer pour cette année.` : null,
          };
        },
      },
      {
        cle: 'echeances_legales',
        titre: 'Instancier les échéances légales',
        aide: 'Les dates issues des décrets et circulaires sont calculées pour l\u2019année.',
        cible: '/echeancier',
        verifier: ({ annee }) => {
          const n = compte(
            'SELECT COUNT(*) AS n FROM echeance WHERE annee_scolaire = ? AND genere_auto = 1', annee);
          return { fait: n > 0, valeur: n ? `${n} échéance(s)` : null };
        },
      },
      {
        cle: 'evenements',
        titre: 'Reporter les événements de l\u2019établissement',
        aide: 'Portes ouvertes, délibérations, sorties, exercice d\u2019évacuation — repris de l\u2019an dernier, puis ajustés.',
        cible: '/organisation?onglet=rentree',
        verifier: ({ annee }) => {
          const n = compte(
            'SELECT COUNT(*) AS n FROM evenement_etablissement WHERE annee_scolaire = ?', annee);
          return { fait: n > 0, valeur: n ? `${n} événement(s)` : null };
        },
      },
      {
        cle: 'referentiel',
        titre: 'Reprendre le référentiel des UE',
        aide: "Les UE de l'année : reprises de l'an dernier, puis amendées si le dossier pédagogique a évolué.",
        cible: '/configuration?onglet=referentiels',
        verifier: ({ annee }) => {
          const n = compte('SELECT COUNT(DISTINCT ue_num) AS n FROM ue WHERE annee_scolaire = ?', annee);
          return { fait: n > 0, valeur: n ? `${n} UE` : null };
        },
      },
      {
        cle: 'organisations',
        titre: 'Créer les organisations d\u2019UE',
        aide: 'Ce qui est organisé cette année, toutes sections confondues, avec leurs dates.',
        cible: '/organisation?onglet=organisations',
        verifier: ({ annee }) => {
          const n = compte('SELECT COUNT(*) AS n FROM organisation_ue WHERE annee_scolaire = ?', annee);
          const datees = compte(
            'SELECT COUNT(*) AS n FROM organisation_ue WHERE annee_scolaire = ? AND date_debut IS NOT NULL', annee);
          return {
            fait: n > 0, valeur: n ? `${n} organisation(s)` : null,
            detail: n && datees < n ? `${n - datees} sans dates — le comptage au 1/10 en dépend.` : null,
          };
        },
      },
      {
        cle: 'attributions',
        titre: 'Attribuer les charges',
        aide: "L'écran Attributions — il alimente la dotation, les fiches du personnel et les contrats.",
        cible: '/organisation?onglet=attributions',
        verifier: ({ annee }) => {
          const n = compte('SELECT COUNT(*) AS n FROM attribution WHERE annee_scolaire = ?', annee);
          return { fait: n > 0, valeur: n ? `${n} attribution(s)` : null };
        },
      },
    ],
  },

  section: {
    titre: 'Mettre en route une section',
    intro: "Les étapes s'enchaînent : le référentiel d'abord, la structure ensuite, l'organisation de l'année pour finir.",
    parametres: ['section', 'annee'],
    etapes: [
      {
        cle: 'section_creee',
        titre: 'Créer la section',
        aide: 'Code, libellé, niveau et type d\u2019horaire dans le référentiel des sections.',
        cible: '/configuration?onglet=referentiels',
        verifier: ({ section }) => {
          const s = un('SELECT code, libelle FROM section WHERE code = ?', section);
          return { fait: !!s, valeur: s ? (s.libelle || s.code) : null };
        },
      },
      {
        cle: 'ues_importees',
        titre: 'Importer les unités d\u2019enseignement',
        aide: 'Le référentiel des UE de la section : numéro, intitulé, périodes, épreuve intégrée.',
        cible: '/configuration?onglet=referentiels',
        verifier: ({ section, anneeRef }) => {
          const n = compte(
            'SELECT COUNT(DISTINCT ue_num) AS n FROM ue WHERE section = ? AND annee_scolaire = ?',
            section, anneeRef);
          return { fait: n > 0, valeur: n ? `${n} UE` : null };
        },
      },
      {
        cle: 'epreuve_integree',
        titre: 'Désigner l\u2019épreuve intégrée',
        aide: "L'UE qui sanctionne la section — elle ferme le schéma de capitalisation.",
        cible: '/configuration?onglet=referentiels',
        verifier: ({ section, anneeRef }) => {
          const n = compte(
            'SELECT COUNT(*) AS n FROM ue WHERE section = ? AND annee_scolaire = ? AND is_epreuve_integree = 1',
            section, anneeRef);
          return { fait: n > 0, valeur: n ? `${n} UE` : null };
        },
      },
      {
        cle: 'prerequis',
        titre: 'Encoder les prérequis',
        aide: "Les liens entre UE, tels qu'ils figurent au dossier pédagogique. Ils sont pérennes : à faire une seule fois.",
        cible: '/configuration?onglet=prerequis',
        verifier: ({ section }) => {
          const n = compte('SELECT COUNT(*) AS n FROM ue_prerequis WHERE section = ?', section);
          return { fait: n > 0, valeur: n ? `${n} lien(s)` : null };
        },
      },
      {
        cle: 'annees_etudes',
        titre: 'Placer les UE par année d\u2019études',
        aide: 'BA1, BA2, BA3 — par glisser-déposer dans le schéma de capitalisation.',
        cible: '/organisation?onglet=structure',
        verifier: ({ section, annee, anneeRef }) => {
          const ues = db.prepare(
            'SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire = ?'
          ).all(section, anneeRef).map(u => u.ue_num);
          if (!ues.length) return { fait: false, valeur: null };
          const niv = niveauxEffectifs([section], annee);
          const sans = ues.filter(u => !niv[u]);
          return {
            fait: sans.length === 0,
            valeur: `${ues.length - sans.length}/${ues.length} placée(s)`,
            detail: sans.length ? `Sans année d'études : UE ${sans.slice(0, 12).join(', ')}${sans.length > 12 ? '…' : ''}` : null,
          };
        },
      },
      {
        cle: 'organisations',
        titre: 'Créer les organisations d\u2019UE de l\u2019année',
        aide: "Ce que la section organise cette année-ci, avec les dates qui déclenchent les comptages réglementaires.",
        cible: '/organisation?onglet=organisations',
        verifier: ({ section, annee }) => {
          const n = compte(
            'SELECT COUNT(*) AS n FROM organisation_ue WHERE section = ? AND annee_scolaire = ?',
            section, annee);
          const datees = compte(
            'SELECT COUNT(*) AS n FROM organisation_ue WHERE section = ? AND annee_scolaire = ? AND date_debut IS NOT NULL',
            section, annee);
          return {
            fait: n > 0,
            valeur: n ? `${n} organisation(s)` : null,
            detail: n && datees < n ? `${n - datees} sans dates` : null,
          };
        },
      },
      {
        cle: 'attributions',
        titre: 'Attribuer les charges aux professeurs',
        aide: "L'écran Attributions — c'est lui qui alimente la dotation et les fiches du personnel.",
        cible: '/organisation?onglet=attributions',
        verifier: ({ section, annee }) => {
          const n = compte(
            'SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND annee_scolaire = ?',
            section, annee);
          return { fait: n > 0, valeur: n ? `${n} attribution(s)` : null };
        },
      },
    ],
  },
};

// ── Liste des assistants ────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  res.json(Object.entries(ASSISTANTS).map(([cle, a]) => ({
    cle, titre: a.titre, intro: a.intro, parametres: a.parametres,
    nb_etapes: a.etapes.length,
  })));
});

// ── État d'un assistant : chaque étape évaluée sur les données réelles ──────
r.get('/:cle', authRequired, (req, res) => {
  const a = ASSISTANTS[req.params.cle];
  if (!a) return res.status(404).json({ error: 'assistant inconnu' });

  const { section, annee } = req.query;
  for (const p of a.parametres) {
    if (!req.query[p]) return res.status(400).json({ error: `${p} requis` });
  }
  const anneeRef = un('SELECT code FROM annee_scolaire WHERE active = 1')?.code || annee;
  const ctx = { section, annee, anneeRef };

  const etapes = a.etapes.map(e => {
    let v;
    try { v = e.verifier(ctx); } catch (err) { v = { fait: false, erreur: err.message }; }
    return {
      cle: e.cle, titre: e.titre, aide: e.aide, cible: e.cible,
      fait: !!v.fait, valeur: v.valeur ?? null, detail: v.detail ?? null,
      erreur: v.erreur ?? null,
    };
  });

  const faites = etapes.filter(e => e.fait).length;
  // La prochaine action utile : la première étape non faite
  const prochaine = etapes.find(e => !e.fait)?.cle || null;

  res.json({
    cle: req.params.cle, titre: a.titre, intro: a.intro,
    section, annee, etapes, faites, total: etapes.length, prochaine,
    termine: faites === etapes.length,
  });
});

export default r;
