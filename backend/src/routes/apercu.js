/**
 * L'APERÇU DES DOCUMENTS — voir une pièce sans la produire.
 *
 * On ne pouvait juger une mise en page qu'en délibérant une unité réelle, donc
 * en fin de session, sur des étudiants véritables — c'est-à-dire au pire
 * moment, et sans pouvoir essayer. Les pièces s'ajustaient donc à l'aveugle.
 *
 * DEUX MODES, parce que les générateurs ne se valent pas. Les attestations
 * reçoivent leurs données en paramètre : elles se rendent sur un dossier
 * FICTIF, sans toucher à la base. Le procès-verbal, la composition et les
 * motivations, eux, interrogent la base directement : ils ont besoin d'une
 * unité réelle, et l'aperçu le dit plutôt que d'inventer une séance qui
 * n'existe pas.
 *
 * Rien ici n'écrit. Aucun document d'aperçu ne doit pouvoir être confondu avec
 * une pièce délivrée : le dossier fictif porte un nom qui ne trompe personne.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { identiteEtablissement } from './config.js';
import {
  envelopper, pageAttestation, pageAttestationValorisation,
} from './attestations.js';
import {
  documentPV, pageComposition, documentMotivation,
} from './acquis.js';

const r = Router();

/** Le dossier d'exemple. Un nom qui ne peut pas passer pour un vrai. */
const ETUDIANT_EXEMPLE = {
  id: 0,
  nom: 'SPÉCIMEN', prenom: 'Camille',
  titre: 'Mme',
  date_naissance: '1994-03-17',
  lieu_naissance: 'Bruxelles',
};

function uniteExemple({ superieur = true, stage = false, integree = false } = {}) {
  return {
    ue_num: 999,
    ue_nom: integree ? "Épreuve intégrée de la section : exemple"
      : stage ? 'Stage — activités professionnelles de formation'
        : "Unité d'enseignement d'exemple",
    code_fwb: superieur ? '999999U34D1' : '999999U21D1',
    superieur,
    ects: superieur ? 10 : null,
    domaine: superieur ? "Sciences de la santé publique" : null,
    type_enseignement: superieur ? 'Enseignement supérieur de type court'
      : 'Enseignement secondaire supérieur de qualification',
    section: 'Section d’exemple',
    periodes: 120, periodes_cours: 100, autonomie: 20,
    epreuve_integree: integree,
    est_stage: stage,
    activites: [
      { cours_nom: "Première activité d'enseignement", cours_per: 60 },
      { cours_nom: 'Seconde activité', cours_per: 40 },
    ],
    acquis: [
      { aa_code: 'AA999.1', description: "d'appliquer la méthode enseignée à une situation nouvelle" },
      { aa_code: 'AA999.2', description: 'de justifier ses choix au regard du cadre réglementaire' },
    ],
    pourcentage: 72,
    manques: [],
  };
}

/**
 * LE CATALOGUE. « annexe » dit à quel modèle de la circulaire la pièce
 * correspond — c'est la première question qu'on se pose devant un document, et
 * la réponse ne doit pas se chercher dans le code.
 */
export const CATALOGUE = [
  { id: 'attestation-reussite', libelle: 'Attestation de réussite — unité ordinaire',
    annexe: '10 · 11', mode: 'exemple', niveaux: true },
  { id: 'attestation-stage', libelle: 'Attestation de réussite — stage',
    annexe: '12 · 13', mode: 'exemple', niveaux: true },
  { id: 'attestation-ei', libelle: 'Attestation de réussite — épreuve intégrée',
    annexe: '17 · 18', mode: 'exemple', niveaux: true },
  { id: 'attestation-valorisation', libelle: 'Attestation de réussite — valorisation des acquis',
    annexe: '14 · 15', mode: 'exemple', niveaux: true },
  { id: 'pv', libelle: 'Procès-verbal de délibération d’une unité',
    annexe: '3 · 5', mode: 'unite' },
  { id: 'composition', libelle: 'Composition du Conseil / du jury',
    annexe: '2', mode: 'unite' },
  { id: 'motivation', libelle: 'Motivation d’ajournement ou de refus',
    annexe: '8 · 9', mode: 'unite' },
];

r.get('/catalogue', authRequired, (req, res) => {
  res.json({ documents: CATALOGUE, etudiant_exemple: `${ETUDIANT_EXEMPLE.nom} ${ETUDIANT_EXEMPLE.prenom}` });
});

r.get('/:id', authRequired, (req, res) => {
  const def = CATALOGUE.find(d => d.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'document inconnu' });

  const annee = req.query.annee || anneeDeTravail(req);
  const superieur = req.query.niveau !== 'secondaire';
  const ident = identiteEtablissement();
  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};

  try {
    if (def.mode === 'exemple') {
      const u = uniteExemple({
        superieur,
        stage: def.id === 'attestation-stage',
        integree: def.id === 'attestation-ei',
      });
      const corps = def.id === 'attestation-valorisation'
        ? pageAttestationValorisation(ETUDIANT_EXEMPLE, u, annee, etab,
          { pourcentage: 72, decision_ce_date: null }, null, ident)
        : pageAttestation(ETUDIANT_EXEMPLE, u, annee, etab, null, ident);
      return res.json({
        html: envelopper(corps, `Aperçu — ${def.libelle}`),
        exemple: true, annexe: def.annexe,
      });
    }

    // Mode « unité réelle » : sans unité, on ne fabrique pas de séance.
    const ueNum = Number(req.query.ue_num);
    if (!ueNum) {
      return res.status(400).json({
        error: 'unité requise',
        detail: "Cette pièce lit la délibération en base : elle ne peut pas se "
              + "rendre sur un dossier fictif. Choisissez une unité déjà délibérée.",
      });
    }
    const session = Number(req.query.session) === 2 ? 2 : 1;

    if (def.id === 'pv') {
      const d = documentPV(ueNum, annee, session);
      return res.json({ html: envelopper((d.style || '') + d.corps,
        `Aperçu — PV UE ${ueNum}`), annexe: def.annexe, manques: d.manques || [] });
    }
    if (def.id === 'composition') {
      const c = pageComposition(ueNum, annee, session);
      return res.json({ html: envelopper((c.style || '') + c.corps,
        `Aperçu — composition UE ${ueNum}`), annexe: def.annexe });
    }
    // La motivation vise UN étudiant : on prend le premier en échec, faute de
    // quoi il n'y a rien à motiver et la pièce n'aurait aucun sens.
    const etu = db.prepare(`
      SELECT etudiant_id FROM etudiant_inscription
      WHERE ue_num = ? AND annee_scolaire = ? AND resultat IN ('ajourne', 'refuse')
      ORDER BY etudiant_id LIMIT 1`).get(ueNum, annee);
    if (!etu) {
      return res.status(400).json({
        error: 'aucun ajournement ni refus',
        detail: "Cette unité ne compte ni ajourné ni refusé pour l'année choisie : "
              + "il n'y a pas de motivation à montrer.",
      });
    }
    const m = documentMotivation(etu.etudiant_id, ueNum, annee, session);
    if (m.erreur) return res.status(400).json({ error: m.erreur });
    return res.json({ html: m.html, annexe: def.annexe });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default r;
