// ─────────────────────────────────────────────────────────────────────────────
// LES SPÉCIMENS DE LA GALERIE — des dossiers factices, pour voir une pièce que
// la base ne permet pas encore de produire (Charles, 9 octobre 2026 : « il
// suffit d'utiliser des données factices »).
//
// Une pièce qui nomme quelqu'un refuse de sortir tant que son dossier est
// incomplet — c'est voulu, et c'est ce qui protège la pièce réelle. Mais la
// galerie sert à VOIR la mise en page : elle montrait « il manque la décision
// du Conseil » à la place de la décision. Le spécimen compose la pièce avec
// LA MÊME FONCTION que la route réelle, sur un dossier complet inventé.
//
// UN SPÉCIMEN NE PEUT PAS PASSER POUR UNE PIÈCE. L'étudiant s'appelle
// « SPÉCIMEN Camille », l'unité 999 n'existe pas, et rien ne s'écrit ni ne
// s'archive : la route n'est qu'une lecture.
// ─────────────────────────────────────────────────────────────────────────────

import { composerPiece as composerPieceAR } from './piecesAmenagement.js';
import { composerPieceProcedure } from './piecesProcedures.js';
import { composerPieceCep } from './piecesCep.js';
import { congesDe, periodesDe } from './cep.js';

const ETUDIANT = {
  id: 0, nom: 'SPÉCIMEN', prenom: 'Camille', titre: 'Mme', id_ecampus: '00-00000',
  date_naissance: '1994-03-17', lieu_naissance: 'Bruxelles',
  adresse: 'Rue de l’Exemple 1', cp: '1070', localite: 'Anderlecht',
};
const UE = { ue_num: 999, ue_nom: "Unité d'enseignement d'exemple" };
const SECTION = 'Section d’exemple';

const decale = (jours) => {
  const d = new Date(); d.setDate(d.getDate() + jours); return d.toISOString().slice(0, 10);
};

// ── Aménagements raisonnables ──────────────────────────────────────────────
function dossierAR(annee) {
  const mesures = [
    { nature: 'materiel', libelle: 'Temps supplémentaire aux évaluations (un tiers)', precisions: 'Écrits et oraux', accorde: 1 },
    { nature: 'materiel', libelle: 'Local calme et isolé pour les évaluations', precisions: null, accorde: 1 },
    { nature: 'pedagogique', libelle: 'Supports de cours transmis à l’avance', precisions: 'Au moins 48 h avant la séance', accorde: 1 },
    { nature: 'pedagogique', libelle: 'Dispense de la présentation orale en groupe', precisions: null, accorde: 0,
      motif_refus: "La présentation orale évalue un acquis d'apprentissage de l'unité : la supprimer modifierait la nature de l'épreuve." },
  ];
  return {
    id: 0, etudiant_id: 0, etudiant: ETUDIANT, annee_scolaire: annee,
    statut: 'partiel', sens: 'partiel',
    date_demande: decale(-30), personne_reference: 'Mme EXEMPLE Dominique, référente',
    piece_type: 'rapport_specialiste', piece_date: decale(-45), piece_auteur: 'Dr EXEMPLE', piece_reference: 'Rapport n° 0000',
    besoins: 'Fatigabilité importante et difficultés de concentration lors d’épreuves longues.',
    soins_specifiques: null, annexes_nb: 1, annexes_desc: 'Rapport du spécialiste',
    rapport_annexes_nb: 0, rapport_annexes_desc: null,
    transmis_cde_le: decale(-25), cde_recu_le: decale(-25), cde_date: decale(-20),
    cde_motivation: "Le Conseil des études constate, sur la base du rapport du spécialiste, des besoins spécifiques "
      + "durables. Les mesures accordées compensent ces besoins sans modifier les acquis d'apprentissage évalués.",
    delai_mise_oeuvre: 'Dès la prochaine évaluation', conditions_particulieres: null,
    notifie_le: decale(-18), notifie_par: 'courriel',
    signe_etudiant_le: decale(-30), signe_reference_le: decale(-30),
    mesures, accordees: mesures.filter(m => m.accorde), refusees: mesures.filter(m => !m.accorde),
    ues: [UE], section: 'EX', section_libelle: SECTION,
  };
}

// ── Procédures (recours et discipline) ─────────────────────────────────────
function dossierProcedure(type, annee) {
  const commun = {
    id: 0, etudiant: ETUDIANT, annee_scolaire: annee, section: SECTION, ...UE, session: 1,
    publie_le: decale(-12), recidive: [], acquis: [{ aa_code: 'AA999.2' }],
    membres: [
      { role: 'president', nom: 'EXEMPLE Alex', present: 1 },
      { role: 'membre', nom: 'EXEMPLE Sam', present: 1 },
      { role: 'membre', nom: 'EXEMPLE Noa', present: 1 },
      { role: 'redacteur', nom: 'EXEMPLE Lou', present: 1 },
    ],
  };
  if (type === 'recours') {
    return { ...commun, type: 'recours', nature: null, traces: { recevabilite: { le: decale(-9) } },
      etapes: {
        plainte: { mode: 'recommande', recue_le: decale(-10),
          griefs: "La pondération appliquée à l'épreuve ne correspond pas à celle annoncée dans le descriptif de l'unité." },
        recevabilite: { recevable: false, motif: 'La plainte est parvenue à la Direction après le délai de quatre jours calendrier.' },
        cde: { date: decale(-7) },
        decision: { issue: 'rejete', motivation: "Le Conseil constate que la pondération appliquée est celle du descriptif "
          + "communiqué en début d'unité : aucune irrégularité n'est établie." },
      } };
  }
  return { ...commun, type: 'disciplinaire', nature: 'fraude',
    etapes: {
      faits: { date: decale(-20), moment: 'epreuve', type_fraude: 'objets',
        description: "Un téléphone portable allumé a été trouvé sur la table de l'étudiante pendant l'épreuve écrite." },
      convocation: { audition_le: decale(-12), heure: '14:00', lieu: 'Bureau de la Direction, bâtiment P',
        sanction_envisagee: 'annulation_points', envoyee_le: decale(-18) },
      audition: { tenue_le: decale(-12), etudiant_present: 1, assiste_par: null, conteste: 0,
        declarations: "L'étudiante reconnaît avoir oublié d'éteindre son téléphone ; elle déclare ne pas l'avoir consulté.",
        pv: 'signe' },
      avis: { rendu_le: decale(-10), avis: 'Le Conseil des études propose l’annulation des points de l’évaluation.' },
      decision: { sanction: 'annulation_points', academique: 'ajourne',
        motivation: "La présence d'un objet non autorisé pendant l'épreuve constitue une fraude au sens de l'article 72. "
          + "Les faits sont reconnus ; leur gravité, limitée, justifie l'annulation des points de l'évaluation." },
      notification: { envoyee_le: decale(-8) },
    } };
}

// ── Congé-éducation payé ───────────────────────────────────────────────────
function dossierCep(annee) {
  const a1 = Number(String(annee).slice(0, 4));
  // Vingt lundis de 18 h à 21 h 20 (200 minutes), à compter de la mi-septembre.
  const seances = [];
  const d = new Date(Date.UTC(a1, 8, 15));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 20; i++) {
    seances.push({ date: d.toISOString().slice(0, 10), heure_debut: '18:00', heure_fin: '21:20', min: 200,
      statut: i === 4 ? 'justifie' : 'present' });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  const bilan = liste => {
    const b = { theorique: 0, donnees: 0, presence: 0, justifiees: 0, injustifiees: 0, dispense: 0, tardive: 0, non_encodees: [] };
    for (const s of liste) {
      b.theorique += s.min; b.donnees += s.min;
      if (s.statut === 'present') b.presence += s.min; else b.justifiees += s.min;
    }
    return b;
  };
  const periodes = periodesDe(seances).map(p => ({ ...p, commencee: true, terminee: true,
    ...bilan(seances.filter(s => s.date >= p.du && s.date <= p.au)) }));
  const total = bilan(seances);
  const unite = { ...UE, ue_niveau: 'SUP', code_fwb: '999999U34D1', inscription: seances[0].date, dispense_complete: false,
    debut: seances[0].date, fin: seances.at(-1).date,
    a: total.theorique, b: 0, c: total.theorique, d: 0,
    horaire: { lundi: { de: '18:00', a: '21:20' } },
    detail: [{ du: seances[0].date, au: seances.at(-1).date, jour: 1, de: '18:00', a: '21:20' }],
    periodes, nb_seances: seances.length };
  return { etudiant: ETUDIANT, cep: { region: 'bruxelles' }, annee, section: 'EX', section_libelle: SECTION,
           unites: [unite], conges: congesDe(annee) };
}

/** Les pièces qui ont un spécimen. */
export const SPECIMENS = new Set([
  'amenagement_formulaire', 'amenagement_decision', 'amenagement_notification', 'amenagement_mesures',
  'procedure_accuse_reception', 'procedure_irrecevabilite', 'procedure_decision_recours',
  'procedure_convocation', 'procedure_pv_audition', 'procedure_decision_disciplinaire',
  'cep_inscription', 'cep_assiduite',
]);

/** Compose le spécimen d'une pièce de la galerie : { html, nom } ou { erreur }. */
export function composerSpecimen(id, annee) {
  let out = null;
  if (id.startsWith('amenagement_')) out = composerPieceAR(id.slice('amenagement_'.length), dossierAR(annee));
  else if (id.startsWith('procedure_')) {
    const piece = id.slice('procedure_'.length);
    const type = ['accuse_reception', 'irrecevabilite', 'decision_recours'].includes(piece) ? 'recours' : 'disciplinaire';
    out = composerPieceProcedure(piece, dossierProcedure(type, annee));
  } else if (id.startsWith('cep_')) out = composerPieceCep(id.slice('cep_'.length), dossierCep(annee));
  if (!out) return { code: 404, erreur: 'Aucun spécimen pour cette pièce.' };
  if (out.code) return out;
  return { html: out.html, nom: `SPECIMEN_${out.nom}` };
}
