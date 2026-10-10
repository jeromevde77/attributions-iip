import { choisir } from '../lib/dialogue.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import {
  IconX, IconSearch, IconAlertTriangle, IconChevronLeft, IconChevronRight,
  IconArrowUp, IconRepeat, IconList, IconFileText, IconMessage, IconBrush, IconGift,
  IconRotate, IconBan, IconTable, IconLock,
} from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';

/* QUI N'A PAS LE DROIT NE VOIT PAS LE BOUTON (Charles, 4 octobre 2026 : « pas
   droit mais elle peut quand même cliquer… ne va pas ça » ; « si pas accès, pas
   icône — pour tout le monde »). Décider, ajourner, octroyer une faveur, clore :
   la porte serveur est roleRequired('admin','directeur','directeur_adjoint',
   'editeur'), où le secrétariat passe aussi. Les autres LISENT la feuille. */
const PEUT_DELIBERER = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
const lectureSeule = () => !PEUT_DELIBERER.includes(getUser()?.role);
import { Fenetre } from './ui.jsx';
import TableauBordEtudiant from './TableauBordEtudiant.jsx';
import RepartitionOrganisation from './RepartitionOrganisation.jsx';
import { MOTIFS_ECHEC, composerMotif, decomposerMotif, texteDuMotif } from './motifsEchec.js';
// Le centre commun, ouvert sur l'unité et la session qu'on vient de délibérer.
import CentreImpressionCentral from './CentreImpressionCentral.jsx';
import { proposition } from '../lib/defautsSeance.js';

/**
 * La FEUILLE DE DÉLIBÉRATION — un étudiant à la fois.
 *
 * On délibère un étudiant, pas une colonne : « Délibérer » ouvre donc
 * directement la fiche du premier inscrit, et l'on passe au suivant d'une
 * flèche. La vue en tableau reste accessible d'un bouton, pour comparer.
 *
 * TROIS NIVEAUX, dans l'ordre de lecture du Conseil :
 *   1. l'ACQUIS au global — consolidé sur tous les cours qui l'évaluent ;
 *   2. la note de chaque COURS ;
 *   3. la note de l'UNITÉ.
 * Rien n'est recalculé ici : le serveur seul délibère, l'écran montre.
 *
 * La fiche est une MATRICE : une colonne par cours, une ligne par acquis. La
 * somme d'une ligne dit ce que l'acquis vaut pour l'unité, la somme d'une
 * colonne ce que vaut le cours, et leur croisement la note de l'unité.
 */

const fmt = n => n == null ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');

/**
 * CE DONT IL FAUT RENDRE COMPTE : l'acquis en échec, l'acquis ajourné, et les
 * acquis d'un COURS ajourné — ajourner un cours est une décision défavorable,
 * et elle se motive comme une autre, même quand la note prise ailleurs sauvait
 * l'acquis.
 */
function aJustifier(acquis = [], cours = [], decision = null) {
  const enCause = new Set(acquis.filter(a => a.na || a.echec).map(a => a.aa_code));
  // Un cours ajourné fait entrer ses acquis — tous, ou ceux seuls que le Conseil a
  // rouverts (9 octobre 2026) : un acquis réussi qu'on ne représente pas ne se justifie pas.
  // Un cours tombé parce qu'un de ses ACQUIS a été ajourné n'emporte que cet acquis.
  for (const c of cours) if (c.na) for (const code of (c.aas_a_representer
    || (c.ajourne_directement ? c.aas : (c.aas_ajournes?.length ? c.aas_ajournes : c.aas)) || [])) enCause.add(code);
  // Sur un REFUS, l'unité entière est renvoyée : tout acquis non maîtrisé
  // entre dans la motivation, quel que soit le cours qui le portait.
  if (decision === 'refuse') {
    for (const a of acquis) {
      if (!a.faveur && (a.na || (a.note != null && a.note < 10))) enCause.add(a.aa_code);
    }
  }
  return acquis.filter(a => enCause.has(a.aa_code));
}

/* UN CONTENU, PAS UNE FENÊTRE (Charles, 29 septembre 2026). `enPage` : la
   feuille remplace la liste des unités dans l'écran de délibération, au lieu
   de s'ouvrir par-dessus ; la page défile, et la bande de décision reste
   collée au bas. Sans lui (saisie rapide), elle reste une fenêtre. */
export default function FeuilleDeliberation({ ueNum, annee, onClose, enPage = false }) {
  // La correction administrative d'une séance close, distincte de sa
  // réouverture : on répare une mention, on ne rejuge personne.
  const [correction, setCorrection] = useState(false);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  // Ce que la clôture a trouvé de non rédigé, et ce qu'elle allait clôturer.
  const [proposees, setProposees] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [tableau, setTableau] = useState(false);   // la vue d'ensemble
  const [lot, setLot] = useState(false);           // l'ajournement en paquet
  const [bord, setBord] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // La séance : les présences en ouverture, la visite des copies en clôture.
  const [seance, setSeance] = useState(null);
  // L'ORDRE DE REVUE, FIGÉ. Il se calcule une fois, à l'ouverture de la revue.
  const [ordre, setOrdre] = useState(null);   // [etudiant_id] du meilleur au moins bon
  // La décision que le Conseil retient, quand elle s'écarte de celle que le
  // calcul propose. Le calcul propose ; le Conseil décide.
  const [decisions, setDecisions] = useState({});   // etudiant_id → resultat
  const [etape, setEtape] = useState('presences');   // presences | auto | fiche | cloture
  const [documents, setDocuments] = useState(false); // le centre d'impression
  const [auto, setAuto] = useState(null);           // les réussites de plein droit
  const [reprise, setReprise] = useState(null);     // la délibération venue du classeur
  const [choixSession, setChoixSession] = useState(null); // null = celle que déduit le serveur

  // LA SESSION DÉLIBÉRÉE. Le serveur la déduit — première tant qu'elle n'est
  // pas décidée pour tout le monde, seconde dès qu'elle laisse des ajournés —
  // et l'écran s'y range. Toute écriture la porte : sans elle, un ajournement
  // de septembre écraserait celui de juin.
  //
  // Mais la déduction ne doit pas ENFERMER : on revient sur la première
  // session pour corriger une décision de juin, et il faut pouvoir le faire.
  // Le choix explicite l'emporte alors sur la déduction.
  const session = choixSession ?? data?.session ?? 1;

  // LA DÉLIBÉRATION SE TIENT PAR ORGANISATION quand l'unité en a plusieurs :
  // null = toute l'unité, N = l'organisation N, 0 = les non répartis.
  const [org, setOrg] = useState(null);
  const [repartir, setRepartir] = useState(false);   // la fenêtre de répartition
  /* SCINDER PAR GROUPE, si on le souhaite — un filtre d'affichage : la séance,
     la clôture et le PV restent par organisation. */
  const [groupe, setGroupe] = useState(null);        // null = tous

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}?annee=${encodeURIComponent(annee)}`
        + (choixSession ? `&session=${choixSession}` : '')
        + (org != null ? `&org=${org}` : ''),
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
      // Les étudiants sont RENDUS, et pas seulement rangés dans l'état : celui
      // qui vient d'enregistrer les réussites d'office doit savoir qui reste, et
      // l'état de React n'est pas encore à jour à cet instant-là.
      return j.etudiants;
    } catch (e) { setErreur(e.message); return null; }
  }
  async function chargerSeance() {
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}/seance?annee=${encodeURIComponent(annee)}`
        + `&session=${session}&org=${org ?? 0}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setSeance(j);
    } catch { /* la séance est un cadre, pas un bloquant */ }
  }
  // La séance suit la session : présences, date et visite des copies lui
  // appartiennent, et celles de juin ne valent pas pour septembre.
  useEffect(() => { charger(); chargerSeance(); setIdx(0);
    /* eslint-disable-next-line */ }, [ueNum, annee, choixSession, org]);
  // Changer de groupe repart d'une revue neuve : l'ordre figé de l'ancien
  // groupe ne vaut pas pour le nouveau.
  useEffect(() => { setOrdre(null); setIdx(0); /* eslint-disable-next-line */ }, [groupe]);
  // LA SESSION N'EST CONNUE QU'APRÈS LE CHARGEMENT : c'est le serveur qui la
  // déduit. Interroger la reprise en même temps que le reste, c'était
  // l'interroger toujours pour la première session — et taire la bannière sur
  // une unité déjà passée en septembre.
  useEffect(() => { if (data) chargerReprise();
    /* eslint-disable-next-line */ }, [ueNum, annee, session, !!data]);

  /**
   * LA DÉLIBÉRATION QUE LE CLASSEUR PORTE DÉJÀ.
   *
   * On regarde, sans rien changer, si l'unité arrive d'Excel avec ses
   * décisions. Si oui, l'écran le dit — c'est la seule façon que Jérôme ait
   * de savoir qu'il n'a pas à repasser trois cents fiches en revue.
   */
  async function chargerReprise() {
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}/reprise-import`
        + `?annee=${encodeURIComponent(annee)}&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setReprise(j);
    } catch { /* l'aperçu n'est pas un bloquant */ }
  }

  async function appliquerReprise(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/reprise-import`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.detail || j.error); return null; }
      if (!simulation) { await charger(); await chargerReprise(); setEtape('cloture'); }
      return j;
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  /**
   * LES ÉTUDIANTS, DU MEILLEUR AU MOINS BON.
   *
   * L'ordre alphabétique fait délibérer au hasard : on accorde à l'un ce qu'on
   * refusera au suivant, sans l'avoir voulu. En descendant les notes, le
   * Conseil voit ce qu'il vient de décider juste au-dessus, et se tient à sa
   * ligne. Les cas sans note passent en dernier — ils demandent autre chose.
   */
  /**
   * L'ORDRE EST FIGÉ À L'OUVERTURE DE LA REVUE, ET NE BOUGE PLUS.
   *
   * Trier à chaque rendu paraissait naturel — et rendait l'écran inutilisable :
   * ajourner un étudiant le faisait passer NA, donc dernier ; accorder une
   * faveur le ramenait à 10, donc plus bas. La liste se réordonnait sous le
   * curseur et l'on se retrouvait, au même rang, devant QUELQU'UN D'AUTRE. On
   * croyait voir sa décision passer au vert : on voyait l'étudiant suivant.
   *
   * L'ordre du mérite se calcule donc une fois, sur les notes telles qu'elles
   * sont avant délibération, et la revue le suit jusqu'au bout.
   */
  const rang = (e) => e.ue?.na ? -1 : (e.ue?.note ?? -1);

  const liste = useMemo(() => {
    if (!data) return [];
    const q = recherche.trim().toLowerCase();
    const parGroupe = groupe
      ? data.etudiants.filter(e => (e.groupes || []).includes(groupe))
      : data.etudiants;
    const base = q
      ? parGroupe.filter(e =>
          `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q))
      : parGroupe;
    if (ordre) {
      // L'ordre définit AUSSI le périmètre de la revue : ceux qui ont été
      // délibérés d'office n'y sont plus. Les repasser en revue ne leur
      // ajoutait rien et coûtait un clic par étudiant.
      const pos = Object.fromEntries(ordre.map((id, i) => [id, i]));
      // UNE RECHERCHE RETROUVE TOUT LE MONDE, même ceux déjà décidés et sortis de
      // la file : c'est ainsi qu'on revient sur une décision.
      return base.filter(e => q || pos[e.id] !== undefined)
        .sort((a, b) => (pos[a.id] ?? 1e6) - (pos[b.id] ?? 1e6));
    }
    return [...base].sort((a, b) => {
      const d = rang(b) - rang(a);
      return d || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
    });
  }, [data, recherche, ordre, groupe]);

  /** Figer l'ordre au moment où la revue commence. */
  function figerOrdre(source) {
    /* LA FILE NE REPREND QUE CE QUI RESTE À DÉCIDER (Charles, 9 octobre 2026 :
       « j'ai fait les deux étapes et il me reste 75 »). Les réussites de plein
       droit et les décisions prises en lot ne repassent pas en revue. */
    const depart = (source || data?.etudiants || []).filter(e => !e.resultat);
    const filtre = groupe ? depart.filter(e => (e.groupes || []).includes(groupe)) : depart;
    /* LES CAS SEMBLABLES ENSEMBLE (Charles, 9 octobre 2026). Après les réussites
       de plein droit et les PP, la file s'ouvre sur les FAVEURS ENVISAGEABLES —
       la même question posée plusieurs fois de suite, du point qui manque aux
       deux points —, puis le reste, du meilleur au moins bon. */
    const groupeDe = e => e.ue?.faveur_eligible ? 0 : 1;
    const l = [...filtre].sort((a, b) => {
      const g = groupeDe(a) - groupeDe(b);
      if (g) return g;
      if (!groupeDe(a)) { const c = (a.ue?.faveur_cout ?? 9) - (b.ue?.faveur_cout ?? 9); if (c) return c; }
      const d = rang(b) - rang(a);
      return d || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
    });
    setOrdre(l.map(e => e.id));
  }

  // L'ORDRE SE FIGE DÈS QU'ON ENTRE DANS LA REVUE, par quelque chemin qu'on y
  // arrive. Il ne l'était qu'au bouton « Passer » et après la délibération
  // d'office : entré autrement, l'ordre restait libre, et poser un ajournement
  // — « Refus général », par exemple — recalculait le rang de l'étudiant, qui
  // descendait dans la liste. Au même index, on se retrouvait DEVANT QUELQU'UN
  // D'AUTRE, avec l'impression d'avoir été poussé au suivant.
  useEffect(() => {
    if (etape === 'fiche' && !ordre && data?.etudiants?.length) figerOrdre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, ordre, data]);

  const etud = liste[Math.min(idx, Math.max(liste.length - 1, 0))] || null;

  /**
   * CE QUI EMPÊCHE DE PASSER AU SUIVANT, calculé ici pour être DIT AU BON
   * ENDROIT. Le refus était posé dans la fonction d'enregistrement et son
   * message s'affichait tout en haut du panneau : sur une fiche à quatre
   * blocs, on cliquait « Suivant » en bas et il ne se passait rien de
   * visible. Le bouton porte désormais lui-même la raison.
   */
  const decisionRetenue = etud ? (decisions[etud.id] || etud.ue?.decision_proposee || null) : null;
  const aMotiver = etud && decisionRetenue !== 'reussi'
    ? aJustifier(etud.acquis, etud.cours, decisionRetenue).filter(a => !a.motif)
    : [];

  /**
   * Poser ou retirer le MÊME ajustement sur plusieurs codes d'un coup.
   *
   * Une unité ratée l'est rarement à moitié : quand le Conseil ajourne, il
   * ajourne souvent tout. Le faire tuile par tuile sur six cours, c'est six
   * allers-retours pendant lesquels la fiche se reconstruit à mesure.
   */
  async function ajusterLot(portee, codes, action) {
    if (!etud || !codes.length) return;
    const mode = portee === 'cours' && action === 'ajourne' ? await porteeAjournement(codes) : 'tous';
    if (!mode) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/ajustement/lot', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, session,
          portee, codes, action, mode,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d,
        etudiants: d.etudiants.map(x => x.id === etud.id ? { ...x, ...j } : x) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }


  /* À L'AJOURNEMENT D'UN COURS, LA QUESTION (Charles, 9 octobre 2026) : « l'étudiant
     doit-il représenter tous les AA du cours en échec, ou seulement les AA en
     échec ? ». Posée seulement quand elle a un sens — le cours porte à la fois
     des acquis réussis et des acquis en échec. Rend 'tous', 'echec', ou null. */
  async function porteeAjournement(coursCodes) {
    const evals = (etud?.acquis || []).flatMap(a => (a.evaluations || [])
      .filter(v => coursCodes.includes(v.cours_code)).map(v => ({ ...v, aa: a.aa_code })));
    const ko = v => ['PP', 'NP', 'CM'].includes(v.mention) || v.note == null || Number(v.note) < 10;
    const enEchec = [...new Set(evals.filter(ko).map(v => v.aa))];
    const reussis = [...new Set(evals.filter(v => !ko(v)).map(v => v.aa))].filter(a => !enEchec.includes(a));
    if (!enEchec.length || !reussis.length) return 'tous';
    return choisir({
      titre: coursCodes.length > 1 ? 'Ajourner ces cours' : `Ajourner le cours ${coursCodes[0]}`,
      message: `L'étudiant doit-il représenter tous les acquis du cours, ou seulement ceux en échec ?\n\n`
        + `En échec : ${enEchec.join(', ')}\nRéussis : ${reussis.join(', ')}\n\n`
        + `Chaque acquis à représenter devra être justifié. Il tombe dans ce cours et au global, pas dans les autres cours qui l'évaluent.`,
      choix: [
        { valeur: 'echec', libelle: 'Seulement ceux en échec' },
        { valeur: 'tous', libelle: 'Tous les acquis du cours' },
      ],
    });
  }

  /** Poser ou retirer un ajustement. Le serveur renvoie l'étudiant recalculé. */
  async function ajuster(portee, code, action) {
    if (!etud) return;
    const mode = portee === 'cours' && action === 'ajourne' ? await porteeAjournement([code]) : 'tous';
    if (!mode) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/ajustement', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, session,
          portee, code, action, mode,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d,
        etudiants: d.etudiants.map(x => x.id === etud.id ? { ...x, ...j } : x) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /** La justification d'un acquis non acquis, enregistrée puis relue. */
  /**
   * Poser des justifications. Un acquis, ou plusieurs d'un coup — le pinceau
   * en écrit une vingtaine en un geste, et une requête vaut mieux que vingt.
   */
  async function poserMotif(motifs) {
    if (!etud) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/motivation', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, motifs,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d, etudiants: d.etudiants.map(x => x.id !== etud.id ? x
        : { ...x, acquis: x.acquis.map(a => a.aa_code in motifs
            ? { ...a, motif: motifs[a.aa_code] } : a) }) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * LA DÉCISION SE PREND ICI, et elle s'enregistre en passant au suivant.
   *
   * Elle n'a pas à être ressaisie dans un second écran : le calcul l'a déjà
   * dite — réussi, ajourné, refusé — et le Conseil l'a déjà prise en posant
   * ses ajustements. Ce qu'il reste à faire, c'est l'écrire.
   *
   * MAIS on ne quitte pas un échec sans motivation : une décision défavorable
   * non motivée est attaquable, et l'annexe 8 ou 9 ne pourrait pas être
   * produite. C'est le seul barrage de cet écran, et il est délibéré.
   */
  async function enregistrerPuisAvancer(pas) {
    if (!etud) return;
    const ue = etud.ue || {};
    // CE QUI RESTE À JUSTIFIER SE RECALCULE ICI, sur les acquis tels qu'ils
    // sont à l'écran. La liste venue du serveur date de l'ouverture de la
    // fiche : écrire une justification ne la rafraîchissait pas, et l'écran
    // réclamait encore ce qu'on venait d'écrire.
    const decision = decisions[etud.id] || ue.decision_proposee;
    // SANS ACQUIS RATTACHÉS, RIEN À MOTIVER — DONC RIEN NE PASSE : une décision
    // défavorable se motive acquis par acquis ; le serveur le refuse aussi.
    if ((decision === 'ajourne' || decision === 'refuse') && data?.sans_structure) {
      setErreur("Unité non paramétrée : un ajournement ou un refus se motive acquis par acquis, "
        + "et ses acquis ne sont pas rattachés à ses cours. Paramétrez l'unité (liens cours ↔ acquis) "
        + "avant de délibérer.");
      return;
    }
    if (aMotiver.length) {
      setErreur(`Justification requise avant de passer au suivant : `
        + `${aMotiver.map(a => a.aa_code).join(', ')}. Elle se pose sous la `
        + `matrice, dans « À justifier ».`);
      // On y emmène : le message seul se perdait en haut de l'écran.
      document.getElementById('a-justifier')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setEnCours(true); setErreur(null);
    try {
      if (decision) {
        const rep = await fetch('/api/acquis/decision', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({
            etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, session,
            resultat: decision, points: ue.note,
          }),
        });
        if (!rep.ok) {
          const j = await rep.json().catch(() => ({}));
          setErreur(j.error || "La décision n'a pas pu être enregistrée.");
          return;
        }
        setData(d => ({ ...d, etudiants: d.etudiants.map(x => x.id === etud.id
          ? { ...x, resultat: decision, points: ue.note } : x) }));
      }
      // Dernier étudiant : la séance se clôt, et la visite des copies se fixe.
      if (pas > 0 && idx >= liste.length - 1) setEtape('cloture');
      else setIdx(i => Math.max(0, Math.min(liste.length - 1, i + pas)));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * LA DÉLIBÉRATION AUTOMATIQUE, proposée d'emblée. Ceux qui réussissent de
   * plein droit — tous les acquis et tous les cours au seuil — n'appellent
   * aucune appréciation : les enregistrer d'un coup laisse au Conseil le temps
   * des cas qui le méritent.
   */
  async function chargerAuto() {
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}/plein-droit?annee=${encodeURIComponent(annee)}`
        + `&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setAuto(j);
      setEtape('auto');
    } catch (e) { setErreur(e.message); setEtape('fiche'); }
  }

  async function appliquerAuto() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/plein-droit`, {
        // La session compte : une réussite de plein droit s'inscrit dans la
        // séance qui la prononce, comme toute autre décision.
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, session }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      const frais = await charger();
      // LA REVUE NE PORTE PLUS QUE SUR CE QUI RESTE À APPRÉCIER. Ceux qui
      // viennent d'être délibérés d'office sont décidés : les repasser en revue
      // ne leur ajoute rien et coûte un clic par étudiant.
      // Si le rechargement a échoué, on ne conclut RIEN : sauter à la clôture
      // sur une liste vide ferait croire qu'il n'y a plus personne à délibérer.
      if (!frais) { setEtape('fiche'); return; }
      const restants = frais.filter(e => !e.ue?.de_plein_droit);
      figerOrdre(restants);
      setIdx(0);
      // Tout le monde réussissait de plein droit : il n'y a plus rien à
      // délibérer, on va droit à la clôture. Sinon, les PP, NP et CM passent
      // d'abord, en lot (9 octobre 2026).
      setEtape(!restants.length ? 'cloture' : restants.some(aMentionADecider) ? 'mentions' : 'fiche');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * Annuler la délibération DE CET ÉTUDIANT : sa décision et ses ajustements
   * s'effacent, ses notes restent. C'est le geste qu'on cherche quand on s'est
   * trompé sur un dossier, sans vouloir défaire toute la séance.
   */
  async function annulerEtudiant() {
    if (!etud) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}?annee=${encodeURIComponent(annee)}`
        + `&etudiant_id=${etud.id}`,
        { method: 'DELETE', headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setDecisions(m => { const n = { ...m }; delete n[etud.id]; return n; });
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * Ajourner un paquet d'étudiants, avec une justification commune.
   * Le serveur choisit, pour CHACUN, les acquis réellement en défaut : deux
   * étudiants n'échouent pas aux mêmes.
   */
  async function ajournerLot(ids, motif, simulation, coursParEtudiant, parEtudiant = null, mode = 'tous') {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/ajourner-lot`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, etudiants: ids, motif, simulation,
                               cours_par_etudiant: coursParEtudiant || undefined,
                               decision_par_etudiant: parEtudiant?.decisions || undefined,
                               motif_par_etudiant: parEtudiant?.motifs || undefined,
                               motif_par_mention: parEtudiant?.parMention || undefined, mode }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.detail || j.error); return null; }
      if (!simulation) await charger();
      return j;
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  async function rouvrirSeance(motif) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/rouvrir`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, org: org ?? 0, motif }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.detail || j.error); return; }
      await chargerSeance();
      setEtape('fiche');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function enregistrerSeance(champs) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/seance`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, session, org: org ?? 0, ...champs }),
      });
      const j = await rep.json();
      if (!rep.ok) {
        // LES MOTIVATIONS RESTÉES TELLES QUE PROPOSÉES ne sont pas un refus :
        // c'est la question qu'on ne pose qu'une fois, ici. On garde sous la
        // main ce qu'on allait clôturer, pour n'avoir pas à tout ressaisir si
        // la réponse est oui.
        if (j.motivations_proposees) {
          setProposees({ liste: j.motivations_proposees, champs, detail: j.detail });
          return false;
        }
        setErreur(j.detail ? `${j.error} ${j.detail}` : j.error);
        await chargerSeance();   // le quorum renvoyé se voit à l'écran
        return false;
      }
      await chargerSeance();
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnCours(false); }
  }

  if (!data && enPage) {
    return <div className="py-10 text-center text-sm text-slate-500">{erreur || 'Chargement…'}</div>;
  }
  if (!data) {
    return (
      <Fenetre titre="Délibération" large="petite" onFermer={onClose}>
        <div className="text-sm text-slate-500">{erreur || 'Chargement…'}</div>
      </Fenetre>
    );
  }

  const filtres = (<>
            {/* PLUSIEURS ORGANISATIONS, PLUSIEURS DÉLIBÉRATIONS. Les onglets
                restreignent la feuille à une organisation ; la répartition
                elle-même est le geste de la coordination, juste à côté. */}
            {(data.organisations?.length > 1) && (() => {
              const nb = Object.fromEntries((data.par_organisation || []).map(x => [x.num, x.nb]));
              // UN SEUL CONTRÔLE (29 septembre 2026 : « trop de différences de
              // hauteurs, de formes ») : les organisations sont les faces d'un
              // même choix, à la hauteur des autres contrôles.
              const face = (val, label) => (
                <button key={String(val)} type="button" onClick={() => setOrg(val)}
                  className={org === val ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>
                  {label}
                </button>
              );
              return (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <div className="segments">
                    {face(null, `Toute l'unité`)}
                    {data.organisations.map(o => face(o, `Organisation ${o} (${nb[o] || 0})`))}
                    {(nb[0] || 0) > 0 && face(0, `Non répartis (${nb[0]})`)}
                  </div>
                  <button type="button" onClick={() => setRepartir(true)} className="bouton controle">Répartir…</button>
                </div>
              );
            })()}
            {/* SCINDER PAR GROUPE — facultatif. Les groupes viennent de la
                répartition étudiants × cours ; le filtre ne touche ni la
                séance, ni la clôture, ni le PV. */}
            {(data.groupes?.length > 0) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-slate-500">Groupe</span>
                <div className="segments">
                  {[null, ...data.groupes].map(g => (
                    <button key={String(g)} type="button" onClick={() => setGroupe(g)}
                      className={groupe === g ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>
                      {g === null ? 'Tous'
                        : `${g} (${data.etudiants.filter(e => (e.groupes || []).includes(g)).length})`}
                    </button>
                  ))}
                </div>
              </div>
            )}
  </>);

  /* QUATRE VUES DE LA MÊME UNITÉ, UN SEUL SÉLECTEUR (Charles, 3 octobre 2026 :
     « bouton marche pas… utile encore ? »). « Fiche / Tableau » basculait un
     drapeau que l'écran de clôture recouvrait : depuis la clôture, le clic ne
     faisait rien de visible. Fiche · Tableau · En lot · Clôture sont les faces
     d'un même choix, et chacune s'atteint de partout. */
  const vueActive = etape === 'cloture' ? 'cloture' : lot ? 'lot' : tableau ? 'tableau' : 'fiche';
  const allerA = v => {
    setLot(v === 'lot'); setTableau(v === 'tableau');
    setEtape(v === 'cloture' ? 'cloture' : 'fiche');
  };
  const rechercheTexte = recherche;
  const champRecherche = (
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={rechercheTexte}
                onChange={e => { setRecherche(e.target.value); setIdx(0); }}
                placeholder="Filtrer…"
                className="controle controle-icone w-40" />
            </div>
  );
  const vues = (
            <div className="segments" role="tablist" aria-label="Vue de l'unité">
              {[['fiche', 'Fiche', IconFileText, 'Un étudiant à la fois'],
                ['tableau', 'Tableau', IconTable, "Tous les étudiants, toutes les notes d'un coup d'œil"],
                ['lot', 'En lot', IconList, "Ajourner plusieurs étudiants d'un coup, avec une justification commune"],
                ['cloture', 'Clôture', IconLock, 'Visite des copies, dates de seconde session, documents, clôture'],
              ].filter(([v]) => !lectureSeule() || v === 'fiche' || v === 'tableau').map(([v, lib, Ic, aide]) => (
                <button key={v} type="button" title={aide} onClick={() => allerA(v)}
                  className={`inline-flex items-center gap-1.5 ${vueActive === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Ic size={14} /> {lib}
                </button>
              ))}
            </div>
  );
  const retour = enPage ? (
              <button onClick={onClose} className="bouton controle inline-flex items-center gap-1">
                <IconChevronLeft size={14} /> Les unités
              </button>
  ) : null;
  const controles = (
          <div className="flex items-center gap-2 flex-wrap">{champRecherche}{vues}{retour}</div>
  );

  const corps = (
        <div className={enPage ? 'py-1.5 space-y-1.5' : 'space-y-3'}>
          {/* LA RÉOUVERTURE SE PRÉSENTE OÙ ELLE SERT — EN TÊTE.
              Elle n'existait que sur l'écran de clôture, qu'on n'atteint qu'en
              parcourant tous les étudiants jusqu'au dernier. Sur une unité
              close, ce chemin n'a aucun sens : on veut rouvrir, pas refaire la
              revue. Et si la seconde session s'est ouverte entre-temps, la
              feuille s'affiche en session 2 et la séance close de juin devient
              inatteignable. Le bandeau la rend accessible dans tous les cas. */}
          {!!seance?.seance?.cloturee && (
            <BandeauReouverture session={session}
              onReprendre={() => setCorrection(true)} />
          )}

          {correction && (
            <CorrectionAdministrative ueNum={ueNum} annee={annee} session={session}
              org={org ?? 0} seance={seance} onFerme={() => setCorrection(false)}
              onFait={chargerAuto} onRouvrir={rouvrirSeance} enCours={enCours} />
          )}

          {/* LA SECONDE SESSION S'OUVRE À LA CLÔTURE — encore faut-il pouvoir
              y aller. L'écran de clôture ne s'atteignait qu'en parcourant tous
              les étudiants jusqu'au dernier : ayant délibéré, on cherchait la
              session 2 et l'on ne trouvait ni elle, ni le geste qui l'ouvre.
              Le bandeau porte donc le chemin, non seulement la règle. */}
          {!!data?.etat_sessions?.seconde_attend && (
            <div className="px-3 py-2 rounded-carte bg-sky-50 border border-sky-200
                            flex items-start justify-between gap-3">
              <span className="text-second text-sky-900">
                Toutes les décisions de première session sont encodées, et
                {' '}<b>{data.etat_sessions.s1?.ajournes ?? 0}</b> étudiant(s) sont ajournés.
                La seconde session s'ouvrira à la <b>clôture de la séance</b> : jusque-là,
                tout se décide en première session, et les ajournements restent des
                ajournements.
              </span>
              <button onClick={() => { setLot(false); setTableau(false); setEtape('cloture'); }}
                className="flex-none px-3 py-1.5 text-second rounded-lg bg-iip-blue
                           text-white font-semibold">
                Aller à la clôture
              </button>
            </div>
          )}
          {/* CE QUI EST DANS LA COLONNE SUIT LA COLONNE.
              Deux blocs portaient une marge à eux (« mx-5 ») dans un conteneur
              qui donne déjà son retrait à tout le monde : ils rentraient de
              vingt pixels de plus que leurs voisins, et la pile de bandeaux
              faisait un escalier. Le retrait est celui du conteneur, une fois
              pour tous. */}
          {!!data?.etat_sessions?.seconde_possible && (
        <div className="flex items-center gap-2 text-second">
          <span className="text-slate-500">Session délibérée :</span>
          <div className="segments">
            {[1, 2].map(n => (
              <button key={n} onClick={() => setChoixSession(n)}
                className={`px-3 py-1 ${session === n
                  ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                {n === 1 ? '1re' : '2e'}
              </button>
            ))}
          </div>
          <span className="text-slate-500">
            {session === 1
              ? 'Retour sur la première session — la décision de seconde session, si elle existe, reste le résultat final.'
              : 'Seconde session : seuls les ajournés sont présentés ; la décision de septembre devient le résultat final.'}
          </span>
        </div>
      )}

      {data?.session === 2 && !data?.etat_sessions?.seconde_possible && (
        <div className="px-3 py-2 rounded-carte bg-amber-50 border border-amber-200
                        text-second text-amber-900">
          <b>Seconde session.</b> Seuls les étudiants ajournés en première session sont
          présentés. Les cours qui n'étaient pas à représenter gardent leur note de
          première session ; les autres attendent celle de septembre. La décision prise
          ici s'ajoute à celle de juin, qu'elle ne remplace pas — mais c'est elle qui
          devient le résultat final.
        </div>
      )}
      {erreur && (
            <div className="px-3 py-2 rounded-carte bg-red-50 border border-red-200
                            text-sm text-red-800 flex items-center gap-2">
              <IconAlertTriangle size={14} /> {erreur}
            </div>
          )}

          {!!data.sans_structure && (
            /* UNE ALERTE SE VOIT (Charles, 3 octobre 2026) : bloc signalé orange,
               icône, titre — un fond pâle ton sur ton ne se lisait pas. */
            <div data-etat="surveiller" className="bloc-etat px-3 py-2.5 flex items-start gap-2.5">
              <IconAlertTriangle size={18} className="flex-none mt-0.5" style={{ color: 'var(--c-attente)' }} />
              <div className="text-sm">
                <div className="font-semibold">Unité non paramétrée</div>
                <div className="text-slate-700">Ses acquis ne sont pas rattachés à des cours, ou aucun
                  cours n'y est déclaré. Les notes ne peuvent pas se consolider tant que ce lien
                  n'existe pas.</div>
              </div>
            </div>
          )}

          {/* CE QUI A DÉJÀ ÉTÉ DÉLIBÉRÉ AILLEURS SE DIT ICI. Une unité reprise
              du classeur arrive décidée : sans cette bannière, rien ne le
              signale et on repasse trois cents fiches en revue pour rien. */}
          {/* Une ligne, et seulement tant que la séance est ouverte : proposer de
              reprendre des décisions sur une séance close, que le bandeau du
              dessus dit figée, se contredisait (27 septembre 2026). */}
          {reprise && (reprise.concordants + reprise.divergents) > 0
            && !seance?.seance?.cloturee
            && etape !== 'reprise' && etape !== 'cloture' && (
            <div data-etat="disponible" className="bloc-etat px-3 py-1 flex items-center gap-3 text-second">
              <span className="flex-1 min-w-0 truncate"
                title="Vous pouvez reprendre ces décisions d'un coup plutôt que de passer chaque fiche en revue.">
                <b>Délibérée dans le classeur</b> · {reprise.concordants + reprise.divergents} décision(s)
                de session {session} déjà encodée(s){reprise.sans_decision
                  ? ` · ${reprise.sans_decision} sans décision` : ''}
              </span>
              <button onClick={() => setEtape('reprise')} className="bouton bouton-compact flex-none">
                Reprendre l'encodage
              </button>
            </div>
          )}

          {etape === 'reprise' ? (
            <Reprise reprise={reprise} session={session} enCours={enCours}
              onAppliquer={() => appliquerReprise(false)}
              onRetour={() => setEtape('fiche')} />
          ) : etape === 'presences' ? (
            <Presences seance={seance} enCours={enCours}
              ueNum={ueNum} annee={annee}
              onValider={(membres, date_seance, heure_seance, president) => enregistrerSeance({
                membres, date_seance, heure_seance,
                president_role: president?.role || 'titulaire',
                president_nom: president?.nom || null,
                president_titre: president?.titre || null,
              }).then(ok => ok && chargerAuto())} />
          ) : etape === 'auto' ? (
            <PleinDroit auto={auto} enCours={enCours}
              onAppliquer={appliquerAuto}
              onPasser={() => { figerOrdre(); setIdx(0);
                setEtape((data?.etudiants || []).some(aMentionADecider) ? 'mentions' : 'fiche'); }} />
          ) : etape === 'mentions' ? (
            <Mentions liste={(data?.etudiants || []).filter(aMentionADecider)} session={session}
              colonnesCours={data?.colonnes_cours || []} colonnesAcquis={data?.colonnes_acquis || []}
              enCours={enCours} onDecider={ajournerLot}
              onFini={async decides => {
                if (decides?.length) { const frais = await charger(); if (frais) figerOrdre(frais); }
                setIdx(0); setEtape('fiche'); }} />
          ) : etape === 'cloture' ? (
            <Cloture seance={seance?.seance} enCours={enCours} nb={liste.length}
              quorum={seance?.quorum} erreur={erreur}
              onPresences={() => setEtape('presences')}
              ajournes={(data?.etudiants || []).filter(e => e.resultat === 'ajourne').length}
              onRetour={() => setEtape('fiche')} onPV={() => setDocuments(true)}
              coursSession2={seance?.session2 || []}
              onReprendre={() => setCorrection(true)}
              onClore={champs => enregistrerSeance({ ...champs, cloturee: 1 })} />
          ) : !liste.length ? (
            <div className="py-10 text-center text-sm text-slate-400 border-2
                            border-dashed rounded-xl">
              {(data?.etudiants || []).length
                ? <>Tous les étudiants ont une décision. <button type="button" className="underline text-iip-blue"
                    onClick={() => setEtape('cloture')}>Passer à la clôture</button> — ou cherchez un nom pour revenir sur une décision.</>
                : <>Aucun étudiant inscrit à cette unité pour {annee}.</>}
            </div>
          ) : lot ? (
            <VueLot liste={liste} enCours={enCours} onAjourner={ajournerLot} session={session}
              onOuvrir={e => { setIdx(liste.indexOf(e)); setLot(false); }} />
          ) : tableau ? (
            <VueTableau data={data} liste={liste} session={session}
              onOuvrir={e => { setIdx(liste.indexOf(e)); setTableau(false); }} />
          ) : etud ? (
            <>
              <Fiche e={etud} data={data} onAjuster={ajuster} onLot={ajusterLot}
                onMotif={poserMotif} session={session}
                enCours={enCours} onBord={() => setBord(etud)}
                decision={decisions[etud.id] || etud.ue?.decision_proposee || null}
                onDecision={d => setDecisions(m => ({ ...m, [etud.id]: d }))}
                onAnnuler={annulerEtudiant}
                navigation={tuile => (
              <div className="flex items-center justify-between gap-3 py-0.5">
                <button disabled={idx <= 0 || enCours} onClick={() => enregistrerPuisAvancer(-1)}
                  title="Enregistrer la décision et revenir au précédent"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 disabled:opacity-30">
                  <IconChevronLeft size={18} />
                </button>
                <div className="flex-1 min-w-0 px-1 flex items-baseline gap-2 truncate">
                  <span className="text-base font-bold text-iip-blue truncate">{nomPropre(etud.nom, etud.prenom)}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{etud.id_ecampus || '—'} · {idx + 1} / {liste.length}</span>
                  {(() => {
                    // Le paquet où l'on se trouve : les faveurs envisageables passent d'abord.
                    const fav = liste.filter(x => x.ue?.faveur_eligible);
                    const k = fav.findIndex(x => x.id === etud.id);
                    return k >= 0 ? <span className="text-xs font-semibold px-2 rounded-full text-white whitespace-nowrap"
                      style={{ background: 'var(--c-reussi)' }}>faveur envisageable · {k + 1} sur {fav.length}</span> : null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {tuile}
                  {/* La raison du blocage, à côté du bouton qu'on presse. */}
                  {!!aMotiver.length && (
                    <button onClick={() => document.getElementById('a-justifier')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      title="Aller aux justifications"
                      className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-white text-second whitespace-nowrap max-w-[320px]"
                      style={{ background: 'var(--c-refuse)' }}>
                      <b>{aMotiver.length} acquis à justifier</b>
                      <span className="truncate opacity-90">· {aMotiver.map(a => a.aa_code).join(', ')}</span>
                    </button>
                  )}
                  <button disabled={enCours} onClick={() => enregistrerPuisAvancer(1)}
                    title={aMotiver.length
                      ? `À justifier d'abord : ${aMotiver.map(a => a.aa_code).join(', ')}`
                      : idx >= liste.length - 1
                        ? 'Enregistrer et clore la délibération'
                        : 'Enregistrer la décision et passer au suivant'}
                    className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border disabled:opacity-30 ${aMotiver.length
                        ? 'border-slate-300 text-slate-300 cursor-not-allowed'
                        : 'border-iip-blue bg-iip-blue text-white'}`}>
                    <IconChevronRight size={18} />
                  </button>
                </div>
              </div>
                )} />
            </>
          ) : null}
        </div>
  );

  const annexes = (<>
      {bord && (
        <TableauBordEtudiant etudId={bord.id} ueNum={data.ue_num} annee={annee}
          onClose={() => setBord(null)} onDecide={charger} />
      )}

      {repartir && (
        <RepartitionOrganisation ueNum={data.ue_num} ueNom={data.ue_nom} annee={annee}
          onClose={() => setRepartir(false)}
          onSaved={() => { setRepartir(false); charger(); }} />
      )}

      {documents && (
        <CentreImpressionCentral ongletInitial="etudiants"
          perimetre={{ ue_nums: [data.ue_num], session, org: org ?? null }}
          onClose={() => setDocuments(false)} />
      )}

      {proposees && (
        <MotivationsProposees liste={proposees.liste} detail={proposees.detail}
          enCours={enCours}
          onRelire={() => { setProposees(null); setEtape('fiche'); }}
          onConfirmer={async () => {
            const champs = proposees.champs;
            setProposees(null);
            const ok = await enregistrerSeance({
              ...champs, motivations_proposees_acceptees: true });
            if (ok) await charger();
          }} />
      )}
  </>);

  if (enPage) {
    return (
      <div className="w-full flex flex-col">
        {/* L'en-tête ne défile pas : on doit toujours savoir de qui l'on parle. */}
        {/* DEUX RANGÉES ALIGNÉES (« alignement pas ok ») : le titre et ce qui
            le cherche ; puis le périmètre (organisations, groupes) et la vue. */}
        <div className="flex-none px-0 py-1.5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-iip-blue truncate">
              UE {data.ue_num} · {data.ue_nom}
              {data.epreuve_integree && (
                <span className="ml-2 align-middle text-mention font-bold px-2 py-0.5 rounded-champ
                                 bg-violet-100 text-violet-800 border border-violet-200">
                  épreuve intégrée
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {data.section || '—'} · {annee} · {data.etudiants.length} étudiant(s)
            </p>
          </div>
          <div className="flex items-center gap-2">{champRecherche}{retour}</div>
          </div>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">{filtres}</div>
            <div className="mt-1.5">{vues}</div>
          </div>
        </div>
        {corps}
        {annexes}
      </div>
    );
  }

  return (
    <>
      <Fenetre titre={`UE ${data.ue_num} · ${data.ue_nom}`}
        sous={`${data.epreuve_integree ? 'Épreuve intégrée · ' : ''}${data.section || '—'} · ${annee} · ${data.etudiants.length} étudiant(s)`}
        large="ecran" hauteurFixe onFermer={onClose}>
        {/* L'en-tête ne défile pas : on doit toujours savoir de qui l'on parle.
            La barre colle au haut de la zone qui défile. */}
        <div className="sticky -top-4 z-10 bg-white -mt-4 pt-4 pb-2 mb-3 border-b border-slate-100
                        flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">{filtres}</div>
          {controles}
        </div>
        {corps}
      </Fenetre>
      {annexes}
    </>
  );
}

/* ═══ Ce que personne n'a rédigé ═══════════════════════════════════════════
 *
 * Lucie propose un énoncé pour chaque acquis en échec, et cet énoncé part sur
 * l'annexe de l'étudiant si la case reste vide. C'est mieux qu'un blanc — un
 * blanc est indéfendable — mais ce n'est pas le Conseil qui a motivé.
 *
 * LA QUESTION NE SE POSE QU'ICI, ET UNE SEULE FOIS. Une fenêtre à chaque
 * étudiant serait cliquée sans être lue dès le troisième dossier, et une
 * confirmation réflexe ne vaut pas mieux qu'une case vide : c'est même
 * précisément ce qu'un recours attaque. La clôture est le moment où la
 * décision s'arrête ; c'est donc là qu'on demande, en nommant les dossiers,
 * et en montrant les phrases qui vont partir.
 */
function MotivationsProposees({ liste, detail, onRelire, onConfirmer, enCours }) {
  const nbAcquis = liste.reduce((n, e) => n + e.acquis.length, 0);
  return (
    <Fenetre icone={IconAlertTriangle} ton="alerte" large="moyenne" onFermer={onRelire}
      titre={`${liste.length} motivation(s) rédigée(s) par Lucie, non par le Conseil`}
      pied={<>
        <span className="text-xs text-slate-500">
          Ces {nbAcquis} énoncé(s) sont défendables tels quels, mais deux dossiers
          portant la même phrase s'affaiblissent l'un l'autre : une décision
          défavorable se motive au cas d'espèce (RGE art. 79). Confirmées, elles
          seront enregistrées comme <b>acceptées telles que proposées</b> — la
          distinction reste au dossier.
        </span>
        <button onClick={onRelire} disabled={enCours} className="bouton">
          Relire et rédiger
        </button>
        <button onClick={onConfirmer} disabled={enCours} className="bouton bouton-fort">
          Notifier telles quelles et clore
        </button>
      </>}>
      <p className="text-second text-slate-600 mb-3">{detail}</p>
      <div className="space-y-3">
      {liste.map(e => (
        <div key={e.etudiant_id} className="border border-slate-200 rounded-xl p-3">
          <div className="text-sm font-semibold text-iip-blue">
            {nomPropre(e.nom, e.prenom)}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {e.decision === 'refuse' ? 'refusé' : 'ajourné'}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {e.acquis.map(a => (
              <li key={a.aa_code} className="text-second">
                <span className="inline-block px-1 py-px rounded bg-slate-100
                                 border border-slate-300 font-bold text-mention">
                  {a.aa_code}
                </span>{' '}
                <span className="text-slate-500 italic whitespace-pre-line">{a.motif_propose}</span>
                {a.motif_source === 'enseignant' && <span className="ml-1 text-mention text-slate-400">· rédigé par l’enseignant</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      </div>
    </Fenetre>
  );
}

/* ═══ Les présences du Conseil ═════════════════════════════════════════════
 *
 * La composition fonde la validité de la décision : y siègent de droit tous
 * les professeurs qui ont des heures dans l'unité, la coordination de section
 * au titre du suivi pédagogique, et la direction ou son représentant. On ne
 * coche que la présence — la composition, elle, se déduit des attributions.
 */

/**
 * LE QUORUM, COMPTÉ PENDANT QU'ON COCHE.
 *
 * Le serveur le recalcule et refuse la clôture s'il manque — c'est lui qui
 * fait foi. Ici, il s'agit de ne pas laisser le Conseil découvrir à la fin
 * qu'il siégeait à trois. Seules les voix délibératives comptent : la
 * coordination de section, qui ne siège au titre du suivi pédagogique que pour
 * les réunions de suivi, ne fait pas le quorum d'une sanction (RGE art. 22
 * al. 2 et 25 §1) — sauf réglage contraire de l'établissement.
 */
function QuorumBandeau({ membres }) {
  const votants = membres.filter(m => (m.voix || 'deliberative') === 'deliberative');
  const presents = votants.filter(m => m.present).length;
  const requis = Math.ceil((votants.length * 2) / 3);
  const ok = votants.length > 0 && presents >= requis;
  const consultatifs = membres.filter(m => m.voix === 'consultative').length;

  return (
    /* LE QUORUM TIENT SUR UNE LIGNE. Le compte, l'état, la règle : trois
       informations courtes qui prenaient deux lignes et un bandeau haut de
       cinquante pixels, au-dessus d'une liste qu'on veut voir en entier. */
    <div className={`px-3 py-1.5 rounded-carte border flex flex-wrap items-baseline gap-x-3
      ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
      <span className={`text-lg font-bold tabular-nums flex-none
        ${ok ? 'text-emerald-700' : 'text-amber-800'}`}>
        {presents}/{votants.length}
      </span>
      <span className={`text-sm font-semibold flex-none
        ${ok ? 'text-emerald-900' : 'text-amber-900'}`}>
        {ok ? 'Quorum atteint' : `Quorum non atteint — il en faut ${requis}`}
      </span>
      <span className="text-xs text-slate-600 flex-1 min-w-0">
        Deux tiers des voix délibératives (RGE art. 25 §1).
        {consultatifs > 0 && ' Les consultatives ne comptent pas.'}
      </span>
    </div>
  );
}

function Presences({ seance, onValider, enCours, ueNum, annee }) {
  const [membres, setMembres] = useState(null);
  // L'AJOUT N'EST PLUS UN CHAMP LIBRE. « David Faber (externe) » atterrissait
  // en entier dans le nom, la qualité valait « Membre invité » pour tout le
  // monde, et la voix était délibérative d'office — un délégué du Ministre
  // comptait donc au quorum. Le décret énumère les titres : on y puise.
  const [ajout, setAjout] = useState({ nom: '', prenom: '', categorie: '', qualite: '' });
  // La présidence : le titulaire préside, sauf s'il n'a pas siégé.
  const [president, setPresident] = useState({ role: 'titulaire', nom: '', titre: '' });
  const [eligibles, setEligibles] = useState(null);
  // LA DATE ET L'HEURE DE LA SÉANCE. Elles étaient posées en douce à la
  // clôture — celle du jour, que personne ne pouvait corriger. Le Conseil qui
  // délibère un samedi et clôture le lundi voyait donc le lundi au PV.
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');

  useEffect(() => { if (seance && !membres) setMembres(seance.membres); }, [seance, membres]);
  useEffect(() => {
    if (!ueNum || !annee) return;
    fetch(`/api/acquis/deliberation/ue/${ueNum}/presidents?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(j => j && setEligibles(j))
      .catch(() => { /* la séance vaut sans la liste : on retombe sur la saisie */ });
  }, [ueNum, annee]);
  useEffect(() => {
    if (!seance?.seance) return;
    setDate(d => d || seance.seance.date_seance || new Date().toISOString().slice(0, 10));
    setHeure(h => h || seance.seance.heure_seance
      || new Date().toTimeString().slice(0, 5));
  }, [seance]);

  if (!membres) {
    return <div className="py-10 text-center text-sm text-slate-400">Chargement du Conseil…</div>;
  }

  const presents = membres.filter(m => m.present).length;
  // Ouvrir sans président désigné produirait un procès-verbal au nom de
  // quelqu'un qui n'a pas siégé : on bloque, et l'on dit pourquoi.
  const presidenceIncomplete = membres.some(m => m.role === 'direction' && !m.present)
    && (president.role === 'titulaire'
        || (president.role === 'autre' && !president.nom));
  const ton = { professeur: 'text-slate-700', coordination: 'text-sky-800',
                direction: 'text-iip-blue', ajoute: 'text-slate-600' };

  return (
    <div className="space-y-3">
      {/* UNE SEULE LIGNE POUR CE QUI OUVRE LA SÉANCE.
          Deux cartes empilées disaient la même chose à deux endroits : l'une
          nommait le Conseil, l'autre nommait la séance, et il fallait descendre
          de cent pixels pour atteindre deux champs qui se remplissent seuls. Ce
          qui s'explique est à gauche, ce qui se remplit est à droite — et la
          date comme l'heure arrivent déjà posées à maintenant. */}
      <div className="carte bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[260px]">
          <div className="text-sm font-semibold text-iip-blue">Conseil des études</div>
          <p className="text-second text-slate-600">
            Cochez les présents avant d'ouvrir la délibération. La liste se déduit
            des attributions de l'unité. Date et heure figureront au procès-verbal
            et restent modifiables jusqu'à la clôture.
          </p>
        </div>
        {/* LA DATE ET L'HEURE SONT DES VALEURS, PAS DES INVITES : elles
            héritaient du gris de l'étiquette et se lisaient comme des champs
            vides. Elles arrivent posées à aujourd'hui et maintenant. */}
        <label className="flex-none">
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="controle bg-white text-iip-texte tabular-nums" />
        </label>
        <label className="flex-none">
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Heure</span>
          <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
            className="controle bg-white text-iip-texte tabular-nums w-[7rem]" />
        </label>
      </div>

      <QuorumBandeau membres={membres} />

      {/* LES PRÉSENTS SUR DEUX COLONNES. Un Conseil de douze membres faisait
          douze lignes pleine largeur dont la moitié droite restait vide, et
          l'on cochait en descendant sur deux écrans. */}
      <div className="carte grid sm:grid-cols-2 overflow-hidden">
        {membres.map((m, i) => (
          <label key={m.cle}
            className="flex items-center gap-3 px-3 py-1.5 cursor-pointer
                       border-t border-slate-100 hover:bg-slate-50">
            <input type="checkbox" checked={!!m.present}
              onChange={e => setMembres(l => l.map((x, k) =>
                k === i ? { ...x, present: e.target.checked } : x))}
              className="w-4 h-4 accent-iip-blue flex-none" />
            <span className="flex-1 min-w-0">
              <span className={`text-sm font-semibold ${ton[m.role] || 'text-slate-700'}`}>
                {m.nom}
              </span>
              <span className="block text-xs text-slate-500 truncate">{m.qualite}</span>
            </span>
            {m.voix === 'consultative' && (
              <span title="Siège avec voix consultative : ne compte pas au quorum"
                className="text-mention font-semibold px-2 py-0.5 rounded-champ flex-none
                           bg-sky-50 text-sky-800 border border-sky-200">
                consultative
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-champ flex-none
              ${m.present ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {m.present ? 'présent' : 'excusé'}
            </span>
          </label>
        ))}
      </div>

      {/* AJOUTER UN MEMBRE — à son nom, et au titre auquel il siège. */}
      <div className="border border-slate-200 rounded-xl p-2.5 space-y-2">
        <div className="text-second text-slate-500">
          Ajouter un membre. Le titre détermine la voix : seuls le délégué du
          Ministre et la coordination siègent avec voix consultative.
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={ajout.nom} onChange={e => setAjout(a => ({ ...a, nom: e.target.value }))}
            placeholder="Nom" className="w-36 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <input value={ajout.prenom} onChange={e => setAjout(a => ({ ...a, prenom: e.target.value }))}
            placeholder="Prénom" className="w-32 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <select value={ajout.categorie}
            onChange={e => setAjout(a => ({ ...a, categorie: e.target.value }))}
            className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">À quel titre siège-t-il ?</option>
            {(seance?.categories || []).map(c => (
              <option key={c.cle} value={c.cle}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input value={ajout.qualite}
            onChange={e => setAjout(a => ({ ...a, qualite: e.target.value }))}
            placeholder="Précision facultative (fonction, établissement d'origine…)"
            className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <button disabled={!ajout.nom.trim() || !ajout.categorie}
            onClick={() => {
              const cat = (seance?.categories || []).find(c => c.cle === ajout.categorie);
              setMembres(l => [...l, {
                cle: `ajout:${Date.now()}`,
                nom: [ajout.nom.trim(), ajout.prenom.trim()].filter(Boolean).join(' '),
                prenom: ajout.prenom.trim() || null,
                qualite: ajout.qualite.trim() || cat?.label || 'Membre désigné',
                categorie: ajout.categorie,
                voix: cat?.voix || 'deliberative',
                role: 'ajoute', present: true,
              }]);
              setAjout({ nom: '', prenom: '', categorie: '', qualite: '' });
            }}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300
                       text-slate-600 disabled:opacity-40">
            Ajouter
          </button>
        </div>
      </div>

      {/* LA PRÉSIDENCE, quand le titulaire n'a pas siégé.
          Le décret veut que le délégué du membre du personnel directeur
          n'appartienne pas au Conseil de l'unité ni de la section, et que ce
          soit lui qui préside. Un procès-verbal signé du titulaire absent
          serait faux — d'où l'obligation de désigner. */}
      {membres.some(m => m.role === 'direction' && !m.present) && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-2.5 space-y-2 border-l-4 border-l-amber-500">
          <div className="text-sm font-semibold text-amber-900">
            Présidence à désigner
          </div>
          <p className="text-second text-amber-800">
            La direction n'a pas siégé. Le procès-verbal doit porter le nom de
            qui a présidé. Le délégué ne peut appartenir au Conseil de cette
            unité ni de cette section (décret art. 52 · AGCF art. 26) : les
            chargés de cours concernés ne sont pas proposés.
          </p>
          <div className="flex flex-wrap gap-2">
            <select value={president.role}
              onChange={e => setPresident(p => ({ ...p, role: e.target.value }))}
              className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="suppleant">Le suppléant désigné</option>
              <option value="autre">Un membre du personnel</option>
            </select>
            {president.role === 'autre' && (
              <select value={president.nom}
                onChange={e => setPresident(p => ({ ...p, nom: e.target.value }))}
                className="flex-1 min-w-[220px] border border-amber-300 rounded-lg
                           px-2 py-1.5 text-sm bg-white">
                <option value="">Choisir…</option>
                {(eligibles?.eligibles || []).map(p => (
                  <option key={p.id} value={p.nom}>
                    {p.nom}{p.mdp ? ' · MDP' : p.statut ? ` · ${p.statut}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {president.role === 'autre' && (
            <input value={president.titre}
              onChange={e => setPresident(p => ({ ...p, titre: e.target.value }))}
              placeholder="Titre porté au procès-verbal (ex. Directeur adjoint)"
              className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm" />
          )}
          <p className="text-xs text-amber-700">
            Un président désigné signe de sa main : aucun fac-similé n'est
            apposé. Les attestations de réussite restent signées du Directeur.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-second text-slate-500">
          <b className="text-iip-blue">{presents}</b> présent(s) sur {membres.length}
        </span>
        <button disabled={enCours || !presents || !date || presidenceIncomplete}
          title={presidenceIncomplete
            ? 'Désignez qui a présidé : la direction n’a pas siégé.' : undefined}
          onClick={() => onValider(membres, date, heure, president)}
          className="px-4 py-2 text-sm rounded-lg bg-iip-blue text-white font-semibold
                     disabled:opacity-40">
          Ouvrir la délibération
        </button>
      </div>
    </div>
  );
}

/* ═══ Les réussites de plein droit ═════════════════════════════════════════ */

/* ═══ La reprise d'une délibération déjà tenue ═════════════════════════════
 *
 * DISPOSITIF TRANSITOIRE, le temps que les années d'Excel soient reprises.
 * Le classeur porte la décision : le Conseil s'est réuni, il a décidé, et
 * cela a été encodé. Repasser les fiches une à une ne rejouerait pas la
 * délibération — elle a eu lieu —, cela ne ferait que la recopier à la main.
 *
 * Ce que l'écran montre AVANT d'écrire quoi que ce soit : ce qui concorde,
 * ce qui diverge, ce qui manque. La décision importée est reprise TELLE
 * QUELLE, y compris quand Lucie en proposerait une autre : substituer un
 * calcul à une délibération tenue, ce serait la refaire en cachette. Les
 * écarts se lisent, ils ne se corrigent pas tout seuls.
 */
function Reprise({ reprise, session, onAppliquer, onRetour, enCours }) {
  if (!reprise) return <div className="py-10 text-center text-sm text-slate-400">Lecture…</div>;
  const aReprendre = reprise.concordants + reprise.divergents;
  const divergents = (reprise.etudiants || []).filter(l => l.statut === 'divergent');
  const sans = (reprise.etudiants || []).filter(l => l.statut === 'sans_decision');
  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 border-l-4 border-l-sky-500">
        <div className="text-sm font-semibold text-sky-900">
          Reprendre la délibération encodée — session {session}
        </div>
        <p className="text-second text-sky-800">
          Les décisions viennent du classeur : elles sont reprises telles quelles.
          Lucie y ajoute la cote de l'unité qu'elle calcule, et, pour les ajournés
          dont le classeur ne dit pas ce qui est à représenter, les cours en défaut —
          sans quoi la seconde session ne saurait pas quoi ouvrir.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[['à reprendre', aReprendre, 'text-sky-800 bg-sky-50 border-sky-200'],
          ['écarts avec le calcul', reprise.divergents, 'text-amber-900 bg-amber-50 border-amber-200'],
          ['sans décision', reprise.sans_decision, 'text-slate-600 bg-slate-50 border-slate-200'],
        ].map(([lib, n, cls]) => (
          <div key={lib} className={`px-2 py-1.5 rounded-xl border ${cls}`}>
            <div className="text-lg font-bold tabular-nums">{n}</div>
            <div className="text-xs">{lib}</div>
          </div>
        ))}
      </div>

      {!!divergents.length && (
        <div className="border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 bg-amber-50 text-second text-amber-900 font-semibold border-l-4 border-l-amber-500">
            Le classeur et le calcul ne disent pas la même chose — la décision du
            classeur est conservée, ces cas se relisent
          </div>
          <div className="divide-y divide-slate-100 max-h-[26vh] overflow-y-auto">
            {divergents.map(l => (
              <div key={l.etudiant_id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  <b className="text-iip-blue">{l.nom}</b> {l.prenom}
                </span>
                <span className="text-second text-slate-500">
                  classeur <b className="text-slate-800">{l.decision_importee}</b>
                  {' · '}Lucie <b className="text-amber-800">{l.decision_proposee}</b>
                </span>
                <span className="font-bold tabular-nums w-14 text-right">{fmt(l.note)}/20</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!sans.length && (
        <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200
                        text-second text-slate-600">
          {sans.length} étudiant(s) sans décision dans le classeur : ils ne sont pas
          repris et restent à délibérer — {sans.slice(0, 8).map(l => l.nom).join(', ')}
          {sans.length > 8 ? '…' : ''}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button onClick={onRetour}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600">
          Passer — les revoir un à un
        </button>
        <button disabled={enCours || !aReprendre} onClick={onAppliquer}
          className="px-4 py-2 text-sm rounded-lg bg-sky-700 text-white
                     font-semibold disabled:opacity-40">
          Reprendre ces {aReprendre} décisions
        </button>
      </div>
    </div>
  );
}

function PleinDroit({ auto, onAppliquer, onPasser, enCours }) {
  if (!auto) return <div className="py-10 text-center text-sm text-slate-400">Calcul…</div>;
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 border-l-4 border-l-emerald-500">
        <div className="text-sm font-semibold text-emerald-900">
          Réussites de plein droit
        </div>
        <p className="text-second text-emerald-800">
          Tous les acquis et tous les cours au seuil, sans faveur ni ajournement :
          le Conseil n'a rien à y apprécier. Les enregistrer d'un coup lui laisse
          le temps des cas qui le méritent.
        </p>
      </div>

      {!auto.reussites.length ? (
        <div className="py-6 text-center text-sm text-slate-500 border-2
                        border-dashed rounded-xl">
          Aucun étudiant ne réussit de plein droit : chaque cas demande une décision.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100
                        max-h-[46vh] overflow-y-auto">
          {auto.reussites.map(r => (
            <div key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                <b className="text-iip-blue">{r.nom}</b> {r.prenom}
              </span>
              {r.deja_decide && <span className="text-xs text-slate-400">déjà décidé</span>}
              <span className="font-bold tabular-nums text-emerald-700 w-14 text-right">
                {fmt(r.note)}/20
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-second text-slate-500">
          {auto.a_deliberer.length} cas à examiner ensuite
        </span>
        <div className="flex gap-2">
          <button onClick={onPasser}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600">
            Passer — les revoir un à un
          </button>
          <button disabled={enCours || !auto.reussites.length} onClick={onAppliquer}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white
                       font-semibold disabled:opacity-40">
            Enregistrer ces {auto.reussites.length} réussites
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Les PP, NP et CM, pré-délibérés d'abord ═════════════════════════════
 *
 * Charles, 9 octobre 2026 : « si un étudiant n'a pas présenté tous les
 * examens, ou NP, ou CM, il doit aussi être pré-délibéré d'abord. Tu les
 * classes, et on ajourne ou refuse à la chaîne. » Après les réussites de plein
 * droit, ce sont les autres évidences : le Conseil n'a pas de note à peser,
 * seulement une mention à constater. La décision de chacun est celle que le
 * moteur propose déjà (PP : refusé ; NP et CM : ajourné en première session,
 * refusé en seconde), la justification suit la mention et se corrige. On
 * peut décocher quelqu'un : il repassera dans la revue un par un.
 */
const MENTIONS_LOT = ['PP', 'NP', 'CM'];
const LIBELLE_MENTION = { PP: 'Pas présenté', NP: 'Rien produit (NP)', CM: 'Certificat médical' };
/* Une phrase par MENTION, portée sur chaque acquis selon la sienne (Charles,
   9 octobre 2026). « autre » : un acquis en échec sans mention (0, cote basse). */
const MOTIF_MENTION = {
  PP: "Ne s'est pas présenté aux évaluations de l'unité.",
  NP: "S'est présenté à l'évaluation mais n'a pas répondu au questionnaire.",
  CM: "Absent aux évaluations de l'unité pour raison médicale (certificat médical).",
  autre: 'Les réponses sont soit inexistantes, soit très partielles ou incomplètes.',
  cours: "Acquis à représenter avec l'ensemble du cours ajourné.",
};
const LIBELLE_MOTIF = { PP: 'Pas présenté (PP)', NP: 'Rien produit (NP)', CM: 'Certificat médical (CM)',
  autre: 'Autres acquis en échec (sans mention)',
  cours: 'Acquis réussis repassés avec leur cours (« tous les acquis du cours »)' };
/** Les mentions d'un étudiant — sur ses cours, à défaut sur ses acquis. */
function mentionsDe(e) {
  const m = new Set();
  for (const c of e.cours || []) if (MENTIONS_LOT.includes(c.mention)) m.add(c.mention);
  for (const a of e.acquis || []) if (MENTIONS_LOT.includes(a.mention)) m.add(a.mention);
  return MENTIONS_LOT.filter(x => m.has(x));
}
/** À pré-délibérer : une mention, une décision proposée défavorable, rien de décidé. */
function aMentionADecider(e) {
  return !e.resultat && !e.ue?.de_plein_droit && mentionsDe(e).length > 0
    && ['ajourne', 'refuse'].includes(e.ue?.decision_proposee);
}

function Mentions({ liste, session, enCours, onDecider, onFini, colonnesCours = [], colonnesAcquis = [] }) {
  const [ecartes, setEcartes] = useState(() => new Set());
  /* LE TABLEAU SE RETOURNE (Charles, 9 octobre 2026) : au recto les COURS — on
     voit qui est en échec partout ; au verso les ACQUIS de l'unité. Une case dit
     la mention (PP, NP, CM) ou la cote, en rouge sous le seuil. */
  const [face, setFace] = useState('cours');
  const colonnes = face === 'cours'
    ? colonnesCours.map(c => ({ code: c.cours_code, titre: c.cours_nom }))
    : colonnesAcquis.map(a => ({ code: a.aa_code, titre: a.description }));
  const caseDe = (e, code) => face === 'cours'
    ? (e.cours || []).find(c => c.cours_code === code)
    : (e.acquis || []).find(a => a.aa_code === code);
  const pastille = v => {
    if (!v) return <span className="text-slate-300">·</span>;
    const n = v.note_brute ?? v.note_calculee ?? v.note;
    const txt = v.mention || (n == null ? '—' : fmt(n));
    const ko = !!v.mention || v.na || (n != null && n < 10);
    if (n == null && !v.mention) return <span className="text-slate-300">—</span>;
    return ko ? <span className="inline-flex min-w-[30px] justify-center px-1.5 rounded-full text-white text-xs font-semibold"
      style={{ background: v.mention === 'NP' || v.mention === 'CM' ? 'var(--c-attente)' : 'var(--c-refuse)' }}>{txt}</span>
      : <span className="tabular-nums text-slate-700">{txt}</span>;
  };
  const [motifs, setMotifs] = useState(MOTIF_MENTION);
  const [mode, setMode] = useState('tous');       // 'tous' | 'echec'
  const [apercu, setApercu] = useState(null);
  const decisionDe = e => (session >= 2 || e.ue?.decision_proposee === 'refuse') ? 'refuse' : 'ajourne';
  const groupes = MENTIONS_LOT.map(m => ({ m, gens: liste.filter(e => mentionsDe(e)[0] === m) }))
    .filter(g => g.gens.length);
  const retenus = liste.filter(e => !ecartes.has(e.id));
  const nbRefus = retenus.filter(e => decisionDe(e) === 'refuse').length;
  const nbAjourn = retenus.length - nbRefus;
  const corps = () => ({
    decisions: Object.fromEntries(retenus.map(e => [e.id, decisionDe(e)])),
    parMention: motifs,
  });
  // Les mentions effectivement présentes, et « autre » dès qu'un acquis échoue sans mention.
  const presentes = [...MENTIONS_LOT.filter(m => liste.some(e => mentionsDe(e).includes(m))),
    ...(liste.some(e => (e.acquis || []).some(a => !a.mention && !(a.evaluations || []).some(v => v.mention)
      && (a.na || (a.note_calculee ?? a.note) != null && (a.note_calculee ?? a.note) < 10))) ? ['autre'] : []),
    ...(mode === 'tous' ? ['cours'] : [])];
  const bascule = id => setEcartes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const manqueMotif = presentes.some(m => (motifs[m] || '').trim().length < 5);

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 border-l-4" style={{ borderLeftColor: 'var(--c-attente)' }}>
        <div className="text-sm font-semibold text-iip-texte">PP, NP et CM — à décider en lot</div>
        <p className="text-second text-slate-600">
          Ces étudiants n'ont pas présenté une évaluation, n'ont rien produit, ou étaient
          couverts par un certificat médical. La décision proposée est celle du règlement :
          {session >= 2 ? ' en seconde session, tous sont refusés.'
            : ' PP refusé ; NP et CM ajournés — ils représentent en seconde session.'}
          {' '}Décochez ceux que le Conseil veut examiner un par un.
        </p>
      </div>

      <div className="flex items-center gap-2 text-second text-slate-600">
        <span>Voir par :</span>
        <div className="segments">
          {[['cours', 'cours'], ['acquis', "acquis de l'unité"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFace(k)}
              className={face === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
        </div>
      </div>
      <div className="border border-slate-200 rounded-carte overflow-x-auto bg-white">
        <table className="w-full text-second">
          <thead>
            <tr className="tab-entete text-left">
              <th className="px-3 py-1.5 w-8"></th>
              <th className="px-3 py-1.5">Étudiant</th>
              {colonnes.map(c => (
                <th key={c.code} className="px-2 py-1.5 text-center whitespace-nowrap" title={c.titre || ''}>{c.code}</th>))}
              <th className="px-3 py-1.5 text-right">Décision</th>
            </tr>
            <tr className="tab-repere font-semibold">
              <td></td>
              <td className="px-3 py-1">{retenus.length} sur {liste.length} retenu(s)</td>
              {colonnes.map(c => <td key={c.code} />)}
              <td className="px-3 py-1 text-right whitespace-nowrap">
                {nbAjourn > 0 && `${nbAjourn} ajourné(s)`}{nbAjourn > 0 && nbRefus > 0 && ' · '}{nbRefus > 0 && `${nbRefus} refusé(s)`}
              </td>
            </tr>
          </thead>
          {groupes.map(g => (
            <tbody key={g.m}>
              <tr className="tab-repere"><td colSpan={colonnes.length + 3} className="px-3 py-1 text-xs uppercase tracking-wide">
                {LIBELLE_MENTION[g.m]} · {g.gens.length}</td></tr>
              {g.gens.map(e => {
                const pris = !ecartes.has(e.id), dec = decisionDe(e);
                return (
                  <tr key={e.id} className={`border-t border-slate-100 ${pris ? '' : 'text-slate-400'}`}>
                    <td className="px-3 py-1"><input type="checkbox" checked={pris} onChange={() => bascule(e.id)} /></td>
                    <td className="px-3 py-1 whitespace-nowrap"><b className={pris ? 'text-iip-blue' : ''}>{String(e.nom || '').toUpperCase()}</b> {e.prenom}</td>
                    {colonnes.map(c => <td key={c.code} className="px-2 py-1 text-center">{pastille(caseDe(e, c.code))}</td>)}
                    <td className="px-3 py-1 text-right">
                      {pris && <span className="inline-block px-2 rounded-full text-white text-xs font-semibold"
                        style={{ background: dec === 'refuse' ? 'var(--c-refuse)' : 'var(--c-attente)' }}>
                        {dec === 'refuse' ? 'Refusé' : 'Ajourné'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-2">
        <div className="text-second text-slate-600">Justifications — chaque acquis reçoit celle de sa mention (reprise à l'annexe 8 ou 9)</div>
        {presentes.map(m => (
          <label key={m} className="block text-second text-slate-600">
            <span className="font-semibold text-iip-texte">{LIBELLE_MOTIF[m]}</span>
            <textarea rows={1} value={motifs[m] || ''} data-reponses={`deliberation.mention.${m}`}
              onChange={ev => setMotifs(x => ({ ...x, [m]: ev.target.value }))}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        ))}
      </div>

      {/* LA QUESTION DU CONSEIL, POSÉE UNE FOIS POUR LE LOT (Charles, 9 octobre
          2026) : un cours ajourné se représente-t-il entier, ou pour ses seuls
          acquis en échec ? */}
      <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
        <span>Dans un cours ajourné, l'étudiant représente :</span>
        <div className="segments">
          {[['tous', 'tous les acquis du cours'], ['echec', 'seulement les acquis en échec']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>
          ))}
        </div>
      </div>

      {apercu && (
        <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm">
          Simulation : <b>{apercu.ajournes}</b> ajourné(s), <b>{apercu.refuses}</b> refusé(s) ·
          {' '}<b>{apercu.acquis}</b> acquis et <b>{apercu.cours}</b> cours en défaut, justifiés.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-second text-slate-500 min-w-0">
          {manqueMotif ? 'Chaque mention demande sa justification.'
            : !retenus.length ? 'Personne n’est retenu : tous passeront dans la revue.' : ''}
        </span>
        <div className="flex gap-2">
          <button type="button" className="bouton" onClick={onFini}>Passer — les revoir un à un</button>
          <button type="button" className="bouton" disabled={enCours || manqueMotif || !retenus.length}
            onClick={async () => setApercu(await onDecider(retenus.map(e => e.id), '', true, null, corps(), mode))}>
            Simuler</button>
          <button type="button" className="bouton bouton-fort" disabled={enCours || manqueMotif || !retenus.length}
            onClick={async () => { const j = await onDecider(retenus.map(e => e.id), '', false, null, corps(), mode); if (j) onFini(retenus.map(e => e.id)); }}>
            {enCours ? 'Enregistrement…' : `Décider ces ${retenus.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ La clôture ═══════════════════════════════════════════════════════════
 *
 * La visite des copies est un droit de l'étudiant : la séance ne se clôt pas
 * sans avoir dit quand et où. Trois champs, et l'affaire est close.
 */

function Cloture({ seance, onClore, onRetour, onPV, onReprendre, enCours, nb, ajournes,
                   coursSession2, quorum, erreur, onPresences }) {
  // La séance elle-même : dernière occasion de corriger sa date et son heure,
  // car la clôture les fige au procès-verbal.
  const [dateS, setDateS] = useState(seance?.date_seance || '');
  const [heureS, setHeureS] = useState(seance?.heure_seance || '');
  // La publication des résultats fait courir le recours (RDE art. 88 §1).
  const [publieLe, setPublieLe] = useState(seance?.publie_le || new Date().toISOString().slice(0, 10));
  const [date, setDate] = useState(seance?.visite_date || '');
  const [heure, setHeure] = useState(seance?.visite_heure || '');
  const [local, setLocal] = useState(seance?.visite_local || '');
  /* LA VISITE N'A PAS TOUJOURS DE PLAGE. Quand l'Institut renvoie l'étudiant
     vers son enseignant, il n'y a ni jour, ni heure, ni local à annoncer — et
     la notification partait alors avec trois rangées de pointillés, c'est-à-dire
     en annonçant un droit sans dire comment l'exercer. La mention remplace la
     ligne ; le droit, lui, reste annoncé. */
  // Elle se LIT ici, elle ne s'y écrit plus (voir plus bas) — mais elle doit
  // repartir telle quelle dans la charge utile : le serveur écrase cette
  // colonne sans COALESCE, et ne rien envoyer l'effacerait à la clôture.
  const mention = (seance?.visite_mention || '').trim();
  // LA SECONDE SESSION SE TIENT COURS PAR COURS : deux professeurs ne
  // repassent pas leurs épreuves le même jour. Une date unique pour l'unité
  // obligeait le secrétariat à corriger chaque notification à la main.
  const [s2, setS2] = useState(() => (coursSession2 || []).map(c => ({
    cours_code: c.cours_code, cours_nom: c.cours_nom,
    date: c.date || '', heure: c.heure || '', local: c.local || '',
  })));
  const majS2 = (i, champ, v) =>
    setS2(l => l.map((c, k) => k === i ? { ...c, [champ]: v } : c));
  // Le confort qui évite dix saisies quand la date est la même partout.
  const reporterPartout = () => setS2(l => l.length ? l.map(c => ({
    ...c, date: l[0].date, heure: l[0].heure, local: l[0].local })) : l);
  const [close, setClose] = useState(!!seance?.cloturee);
  /* DEUX FORMES DE VISITE, UNE SEULE RÈGLE DE COMPLÉTUDE.
     Le panneau cache les trois champs dès qu'une mention est écrite — mais la
     complétude, elle, continuait de les exiger : la mention rendait donc la
     clôture IMPOSSIBLE, sans rien dire, et sans champ où la débloquer. Ce qui
     est demandé, c'est de dire à l'étudiant comment exercer son droit : une
     plage OU une mention y suffit. */
  const complet = dateS && (mention || (date && heure && local.trim()));

  // LA DATE SE POSE SEULE — et elle ne s'écrase jamais.
  //
  // Le bouton « proposer » existait, mais il fallait y penser, vingt fois par
  // session, pour taper la date du jour. Une séance se tient le jour où on la
  // saisit : c'est le cas ordinaire, il doit être le défaut.
  //
  // DEUX GARDE-FOUS. La proposition ne s'applique qu'à un champ VIDE : rouvrir
  // une séance ne remplace pas sa date initiale par celle du jour — ce serait
  // réécrire l'histoire, et le procès-verbal ne s'en remettrait pas. Et tout
  // reste modifiable : ce qui est posé n'est pas ce qui est arrêté.
  useEffect(() => {
    if (!seance || seance.cloturee) return;
    if (seance.date_seance) return;
    const p = proposition(seance);
    setDateS(d => d || p.date_seance);
    setHeureS(h => h || p.heure_seance);
  }, [seance]);

  // ── LE REMPLISSAGE PAR DÉFAUT ────────────────────────────────────────────
  //
  // Ces valeurs-là sont presque toujours les mêmes : la séance se tient le
  // jour où on la saisit, la visite des copies deux jours ouvrables plus tard,
  // la seconde session dix jours plus tard à huit heures. Les retaper vingt
  // fois par session n'apportait rien. Un bouton les pose, et tout reste
  // modifiable — la clôture ne fige que ce qu'on aura laissé.
  const proposer = () => {
    const p = proposition(seance);
    if (!dateS) setDateS(p.date_seance);
    if (!heureS) setHeureS(p.heure_seance);
    if (!date) setDate(p.visite_date);
    if (!heure) setHeure(p.visite_heure);
    if (!local.trim()) setLocal(p.visite_local);
    setS2(l => l.map(c => ({
      ...c,
      date: c.date || p.session2_date,
      heure: c.heure || p.session2_heure,
      local: c.local || p.session2_local,
    })));
  };
  // Au premier affichage d'une séance encore vierge, la proposition est déjà
  // là : « en un clic » veut d'abord dire « sans clic du tout » quand la
  // séance est celle du jour.
  const pose = useRef(false);
  useEffect(() => {
    if (pose.current || seance?.cloturee) return;
    pose.current = true;
    proposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seance?.cloturee]);

  // La liste des cours de seconde session arrive avec la séance, parfois après
  // le premier rendu : ses lignes neuves reçoivent le défaut à leur tour.
  useEffect(() => {
    if (seance?.cloturee) return;
    const p = proposition(seance);
    setS2(l => {
      const par = new Map(l.map(c => [c.cours_code, c]));
      return (coursSession2 || []).map(c => {
        const a = par.get(c.cours_code) || {};
        return {
          cours_code: c.cours_code, cours_nom: c.cours_nom,
          date: a.date || c.date || p.session2_date,
          heure: a.heure || c.heure || p.session2_heure,
          local: a.local || c.local || p.session2_local,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursSession2, seance?.cloturee]);

  return (
    <div className="grid lg:grid-cols-2 gap-3 items-start py-2">
      {/* TOUTE LA LARGEUR (« trop vertical, il faut utiliser la page ») :
          séance et visite des copies côte à côte, le reste sur deux colonnes. */}
      <div data-etat="reussi" className="bloc-etat lg:col-span-2 px-4 py-3">
        <div className="text-base font-semibold">Délibération terminée</div>
        <p className="text-second text-slate-700">
          Les {nb} étudiant(s) de cette unité ont été délibérés et leurs décisions
          sont enregistrées.
        </p>
      </div>

      {/* LE QUORUM SE CONSTATE À LA CLÔTURE — autant le montrer AVANT de
          cliquer. Et l'appel des présences se fait à l'étape « Présences »,
          qu'on peut n'avoir jamais ouverte : le bouton y mène. */}
      {quorum && !quorum.atteint && (
        <div className="lg:col-span-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                        flex items-start justify-between gap-3">
          <span className="text-second text-amber-900">
            <b>Quorum non constaté</b> — {quorum.presents} présent(s) sur {quorum.membres}
            {' '}à voix délibérative, il en faut {quorum.requis} (RGE art. 25 §1).
            La clôture sera refusée tant que les présences ne sont pas enregistrées.
          </span>
          <button onClick={onPresences}
            className="flex-none px-3 py-1.5 text-second rounded-lg bg-amber-600
                       text-white font-semibold">
            Appel des présences
          </button>
        </div>
      )}

      <div className="carte bg-white p-4 space-y-3 h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-iip-blue">Séance du Conseil</div>
            <p className="text-second text-slate-500">
              La clôture fige cette date et cette heure au procès-verbal : c'est
              le dernier moment pour les corriger.
            </p>
          </div>
          <button onClick={proposer} disabled={enCours}
            title={'Aujourd’hui pour la séance, la visite des copies à deux jours '
                 + 'ouvrables (contacter le professeur), la seconde session à dix '
                 + 'jours à 8h00 (contacter la coordination). Ne remplace aucun '
                 + 'champ déjà rempli.'}
            className="flex-none px-2.5 py-1 text-second rounded-lg border
                       border-iip-blue text-iip-blue font-semibold disabled:opacity-40">
            Valeurs par défaut
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-second text-slate-600">
            Date de délibération
            <input type="date" value={dateS} onChange={e => setDateS(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-second text-slate-600">
            Heure
            <input type="time" value={heureS} onChange={e => setHeureS(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-second text-slate-600 col-span-2">
            Résultats publiés le <span className="text-slate-400">— point de départ des 4 jours de recours (art. 88 §1)</span>
            <input type="date" value={publieLe} onChange={e => setPublieLe(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        </div>
      </div>

      <div className="carte bg-white p-4 space-y-3 h-full">
        <div>
          <div className="text-sm font-semibold text-iip-blue">Visite des copies</div>
          <p className="text-second text-slate-500">
            L'étudiant a le droit de consulter sa copie. La date, l'heure et le
            local figurent sur la notification qui lui est remise.
          </p>
        </div>
        {/* GRISER PLUTÔT QUE CACHER. Les trois champs disparaissaient dès
            qu'une mention existait : l'écran devenait incompréhensible — on ne
            voyait plus ce qui était remplacé, ni pourquoi. Grisés, ils disent
            à la fois qu'ils existent, qu'ils sont sans effet, et ce qui les
            neutralise. */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-second text-slate-600">
            Date
            <input type="date" value={date} disabled={!!mention}
              onChange={e => setDate(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm
                         disabled:bg-slate-100 disabled:text-slate-400" />
          </label>
          <label className="text-second text-slate-600">
            Heure
            <input type="time" value={heure} disabled={!!mention}
              onChange={e => setHeure(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm
                         disabled:bg-slate-100 disabled:text-slate-400" />
          </label>
        </div>
        <label className="text-second text-slate-600 block">
          Local
          <input value={local} disabled={!!mention}
            onChange={e => setLocal(e.target.value)}
            placeholder="Bâtiment P, local 2.14…"
            className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm
                       disabled:bg-slate-100 disabled:text-slate-400" />
        </label>

        {/* LA MENTION NE SE DÉCIDE PAS ICI. Une délibération se clôt avec ce
            qu'on lui a donné ; changer la forme de la communication des
            résultats est une correction administrative — elle se motive, elle
            s'horodate, et elle a son écran. La clôture ne fait que montrer
            l'état, sans jamais l'effacer. */}
        {!!mention && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-second text-slate-700">{mention}</div>
            <div className="text-xs text-slate-500 mt-1">
              Une mention administrative tient lieu de plage de consultation :
              c'est elle qui figurera sur la notification et au procès-verbal.
              Elle se modifie depuis <b>Corriger</b>.
            </div>
          </div>
        )}
      </div>

      {/* La seconde session, cours par cours, portée par l'annexe 8. */}
      {ajournes > 0 && !!s2.length && (
        <div data-etat="surveiller" className="bloc-etat lg:col-span-2 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">Seconde session</div>
              <p className="text-second text-amber-800">
                {ajournes} étudiant(s) ajourné(s). Chaque cours a sa date : elle
                figure en regard du cours sur la notification (annexe 8).
              </p>
            </div>
            {s2.length > 1 && (
              <button onClick={reporterPartout} disabled={enCours || !s2[0].date}
                title="Reporter la date, l'heure et le local du premier cours sur tous les autres"
                className="flex-none px-2.5 py-1 text-second rounded-lg border
                           border-amber-500 text-amber-900 font-semibold disabled:opacity-40">
                Même date pour tous
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {s2.map((c, i) => (
              <div key={c.cours_code} className="flex items-center gap-2">
                <span className="w-32 flex-none min-w-0">
                  <span className="block font-mono text-second font-bold text-slate-700">
                    {c.cours_code}
                  </span>
                  <span className="block text-mention text-slate-500 truncate"
                    title={c.cours_nom || ''}>{c.cours_nom || ''}</span>
                </span>
                <input type="date" value={c.date}
                  onChange={e => majS2(i, 'date', e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-second w-36" />
                <input type="time" value={c.heure}
                  onChange={e => majS2(i, 'heure', e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-second w-24" />
                <input value={c.local} placeholder="local…"
                  onChange={e => majS2(i, 'local', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-second" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lg:col-span-2 flex items-center justify-between gap-2">
        <button onClick={onRetour}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600">
          Revenir aux fiches
        </button>
        <div className="flex items-center gap-2">
          {/* Le procès-verbal ne s'imprime qu'une fois la visite fixée : il en
              porte la date, et un PV incomplet devrait être refait. */}
          <button disabled={enCours || !close} onClick={onPV}
            title={close
              ? 'Procès-verbal, attestations de réussite, notifications d’ajournement et de refus'
              : 'Clôturez d’abord : les pièces portent la date de communication'}
            className="px-3 py-2 text-sm rounded-lg border border-iip-blue
                       text-iip-blue font-semibold disabled:opacity-40
                       flex items-center gap-1.5">
            <IconFileText size={14} /> Générer les documents
          </button>
          <button disabled={enCours || !complet} onClick={() => onClore({
            publie_le: publieLe || null,
              date_seance: dateS, heure_seance: heureS || null,
              visite_date: date, visite_heure: heure, visite_local: local.trim(),
              visite_mention: mention,
              session2_cours: s2,
              // La première date sert de repli pour ce qui n'est pas fixé.
              session2_date: s2[0]?.date || null,
              session2_heure: s2[0]?.heure || null,
              session2_local: s2[0]?.local || null })
              .then(ok => ok && setClose(true))}
            title={complet ? '' : 'La date de délibération est requise, ainsi que '
              + 'la date, l’heure et le local de visite des copies — ou, à leur '
              + 'place, la mention qui dit comment les obtenir'}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold
                       disabled:opacity-40">
            {close ? 'Enregistré' : 'Clore la délibération'}
          </button>
        </div>
      </div>

      {close && (
        <div className="lg:col-span-2 space-y-2">
          <p className="text-second text-emerald-800 text-center">
            Séance close. Les documents peuvent être générés, imprimés, puis signés.
          </p>
          {/* LA RÉOUVERTURE N'EST PLUS ICI. Elle vivait au bas de l'écran de
              clôture, avec son propre choix de motif, pendant que « corriger »
              vivait ailleurs avec le sien : deux chemins, deux motifs, et il
              fallait deviner lequel prendre avant d'avoir vu les champs. Les
              deux se sont rejoints dans « Corriger ou rouvrir… », en tête de
              l'unité close. */}
          <button onClick={onReprendre}
            className="mx-auto block text-second text-amber-900 underline">
            Corriger ou rouvrir cette séance
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══ La fiche d'un étudiant — LA MATRICE ══════════════════════════════════
 *
 * Une colonne par cours, une ligne par acquis. La case dit ce que cet acquis a
 * valu DANS ce cours ; la tuile en bout de ligne, ce qu'il vaut pour l'unité ;
 * la tuile en pied de colonne, ce que vaut le cours. Au croisement des deux
 * sommes, en bas à droite, la note de l'unité.
 *
 * Trois gestes, chacun à sa place :
 *   — l'AJOURNEMENT se pose sur une tuile de somme : cet acquis-là, ou ce
 *     cours-là, est à représenter ;
 *   — la FAVEUR se pose sur la seule note d'unité : c'est l'unité que le
 *     Conseil lève, et le décret fixe le reste ;
 *   — la JUSTIFICATION s'écrit sur l'acquis non acquis, en bout de ligne :
 *     c'est de lui qu'il faut rendre compte, et c'est lui que reprend l'annexe.
 */

/* ═══ LA FICHE — UNE UNITÉ, UN ÉTUDIANT, UN ÉCRAN ═════════════════════════
 *
 * Refondue le 29 septembre 2026 (Charles : « pas à jour niveau design et
 * couleurs ; on doit mieux voir les cours et les AA, c'est trop tableau à
 * tuiles ; le parcours en petit thermomètre vertical ; le tout en un écran,
 * sans scroller »). Trois zones, et rien d'autre :
 *   · à gauche, LE THERMOMÈTRE du parcours : toutes les unités de la section,
 *     par bloc, dans leur état ; l'unité délibérée est cerclée ;
 *   · au centre, LA MATRICE à plat : acquis en lignes, cours en colonnes, la
 *     colonne des acquis (celle qui fait foi) teintée, et LA MOTIVATION DE
 *     L'ÉCHEC SUR LA LIGNE DE L'ACQUIS — elle vivait dans un bloc séparé,
 *     sous la matrice, loin de la note qu'elle justifie ;
 *   · dessous, LA BANDE DE DÉCISION : la note d'unité, puis les choix du
 *     Conseil. Le calcul et les gestes n'ont pas changé : seule la mise en page.
 */
function Fiche({ e, data, onAjuster, onLot, onMotif, enCours, onBord,
  decision, onDecision, onAnnuler, session, navigation = null }) {
  const ue = e.ue || {};
  const acquis = e.acquis || [];
  const cours = e.cours || [];
  const caseDe = (a, coursCode) => (a.evaluations || []).find(v => v.cours_code === coursCode) || null;
  const regarde = e.ue?.regarde || { aa: true, cours: true };
  const decidee = decision === 'ajourne' || decision === 'refuse';
  const seuil = data.seuil;
  const sansAjournement = data.session >= 2;
  const aJust = aJustifier(acquis, cours, decision);
  const aJustCodes = new Set(aJust.map(a => a.aa_code));

  /** Le pinceau : ajouter ces énoncés à tous les autres acquis à justifier. */
  function reporter(cles) {
    if (!cles.length) return;
    const motifs = {};
    for (const a of aJust) {
      const d = decomposerMotif(a.motif || '');
      const union = [...new Set([...d.cles, ...cles])];
      if (union.length !== d.cles.length || !a.motif) motifs[a.aa_code] = composerMotif(union, d.libre);
    }
    if (Object.keys(motifs).length) onMotif(motifs);
  }

  /** Une note dans la matrice : un chiffre, et le seuil se lit au trait. */
  /* LA NOTE SE LIT D'UN COUP D'ŒIL (Charles, 30 septembre 2026) : un rectangle
     plein, texte blanc — VERT au-dessus du seuil, ORANGE au seuil tout juste,
     ROUGE (fraise écrasée) sous le seuil ou non acquis. Les couleurs sont
     celles des réglages : réussi, à surveiller, à corriger. */
  const rect = (fond, texte, titre) => (
    <span title={titre || undefined} style={{ background: fond }}
      className="inline-flex items-center justify-center min-w-[40px] h-[22px] px-1.5 rounded-pastille text-white font-semibold tabular-nums">{texte}</span>
  );
  /* LE NA GARDE SA NOTE (Charles, 9 octobre 2026 : « je ne sais pas dire si
     l'échec est profond »). Ajourné, l'acquis ou le cours n'a plus de cote
     retenue ; on montre à côté ce qu'il valait — 6, ce n'est pas 9. */
  // Avant la décision, LE CHIFFRE d'abord, « NA » en petit ; une fois la décision
  // enregistrée, seulement NA (Charles, 9 octobre 2026).
  const enregistree = !!e.resultat;
  const sousNA = n => (n == null || enregistree) ? 'NA'
    : <>{fmt(n)}<span className="ml-1 text-mention font-normal opacity-90">NA</span></>;
  const note = (v, { na = false } = {}) => {
    if (na) {
      const n = v?.mention ? null : (v?.note_brute ?? v?.note ?? null);
      return rect('var(--c-refuse)', v?.mention ? (enregistree ? 'NA' : <>{v.mention}<span className="ml-1 text-mention font-normal opacity-90">NA</span></>) : sousNA(n),
        n != null ? `Non acquis — à représenter · cote calculée ${fmt(n)}/20` : 'Non acquis — à représenter');
    }
    if (!v) return <span className="text-slate-300">·</span>;
    if (v.mention) return rect(v.mention === 'PP' ? 'var(--c-refuse)' : 'var(--c-attente)', v.mention,
      v.mention === 'NP' ? 'Note de présence' : v.mention === 'PP' ? 'Pas présenté' : '');
    if (v.note == null) return <span className="text-slate-300">·</span>;
    if (v.note < seuil) return rect('var(--c-refuse)', decidee ? sousNA(v.note) : fmt(v.note), decidee ? `Cote calculée : ${fmt(v.note)}/20 — non acquis` : '');
    if (v.note === seuil) return rect('var(--c-attente)', fmt(v.note), 'Au seuil, tout juste');
    return rect('var(--c-reussi)', fmt(v.note));
  };

  const bouton = (actif, titre, onClick) => !sansAjournement && (
    <button disabled={enCours} onClick={onClick} title={titre}
      className={`absolute left-full top-1/2 -translate-y-1/2 ml-1 w-4 h-4 rounded-full inline-flex items-center justify-center border
        ${actif ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-300 text-slate-400 hover:border-amber-500 hover:text-amber-600'}`}>
      <IconRepeat size={9} />
    </button>
  );

  const tuile = (
    <TuileUE compacte ue={ue} seuil={seuil} enCours={enCours}
      onFaveur={() => onAjuster('ue', '*', ue.faveur_ue ? null : 'faveur')} />
  );
  return (
    <div className="grid gap-x-2 gap-y-1.5 grid-cols-[40px_minmax(0,1fr)] items-start">
      {/* EN HAUT, COLLÉ : de qui l'on parle, et la note de son unité. */}
      <div className="col-span-2 sticky top-0 z-20 -mx-1 px-1 pb-1 border-b border-slate-200"
        style={{ background: 'var(--page-fond, #fff)' }}>
        {typeof navigation === 'function' ? navigation(tuile) : navigation}
      </div>
      <Thermometre pc={e.parcours_complet} ueNum={ue.ue_num} onBord={onBord} />

      <div className="space-y-2 min-w-0">
        {!regarde.aa && !regarde.cours && (
          <div className="px-3 py-2 rounded-carte bg-slate-50 border border-slate-200 text-second text-slate-600">
            L'établissement délibère sur la <b>seule note d'unité</b> : acquis et cours restent
            consultables dans les documents, mais ne font pas la décision.
          </div>
        )}

        {(regarde.aa || regarde.cours) && (
          <div id="a-justifier" className="border border-slate-200 rounded-carte overflow-x-auto">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead className="bg-slate-50 normal-case tracking-normal">
                <tr className="align-middle">
                  <th className="text-left px-2.5 py-1 font-semibold text-slate-600 w-[24%]">Acquis</th>
                  {cours.map(c => (
                    <th key={c.cours_code} className="w-[112px] px-1.5 py-1 text-center font-normal align-middle"
                      title={[c.cours_nom, c.professeurs, c.poids_cours_affiche != null ? `${c.poids_cours_affiche} %` : null].filter(Boolean).join(' · ')}>
                      <div className="text-slate-700 truncate"><b className="font-semibold">{c.cours_code}</b>
                        {c.poids_cours_affiche != null && <span className="text-slate-400"> · {c.poids_cours_affiche} %</span>}</div>
                      {c.cours_nom && <div className="text-mention text-slate-500 leading-tight line-clamp-2">{c.cours_nom}</div>}
                      {c.professeurs && <div className="text-mention text-slate-400 italic truncate">{c.professeurs}</div>}
                    </th>
                  ))}
                  <th className="w-[84px] px-2 py-1 text-center font-semibold text-slate-700 bg-iip-blue/10"
                    title="La note consolidée de l'acquis : c'est elle qui fait foi">Acquis</th>
                  {aJust.length > 0 && (
                    <th className="text-left px-2.5 py-1 font-semibold text-slate-600">
                      Motivation de l'échec
                      <span className="font-normal text-slate-400"> · {aJust.filter(a => !a.motif).length
                        ? `${aJust.filter(a => !a.motif).length} à écrire` : 'toutes écrites'}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {regarde.aa && acquis.map(a => {
                  const enCause = aJustCodes.has(a.aa_code);
                  return (
                    <tr key={a.aa_code} className="border-t border-slate-100 bg-white align-middle">
                      <td className="px-2.5 py-1 max-w-0" title={a.description || ''}>
                        <div className="truncate"><b className={`font-semibold ${enCause ? 'text-red-700' : 'text-slate-700'}`}>{a.aa_code}</b>
                          <span className="text-mention text-slate-500"> {a.description || ''}</span></div>
                      </td>
                      {cours.map(c => (
                        <td key={c.cours_code} className="px-1.5 py-1 text-center">
                          {/* LA CASE DIT CE COURS-CI (Charles, 9 octobre 2026). Ajourner un
                              cours fait tomber ses acquis AU GLOBAL — on représente le cours
                              entier —, mais la case de ce même acquis dans un AUTRE cours,
                              réussi, restait peinte en échec. Elle ne tombe qu'avec son cours,
                              ou quand l'acquis lui-même est ajourné — et seulement là où ce
                              cours l'évalue : une case vide reste vide. */}
                          {note(caseDe(a, c.cours_code), { na: !!caseDe(a, c.cours_code) && (!!caseDe(a, c.cours_code).ajourne || !!a.ajourne_directement) })}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center bg-iip-blue/10 whitespace-nowrap">
                        <span className="relative inline-flex align-middle">
                        {a.faveur ? rect('var(--c-faveur)', <><IconGift size={11} className="mr-0.5" />{fmt(seuil)}</>, 'Octroyé par le Conseil')
                          : note(a, { na: a.na })}
                        {bouton(!!a.ajourne_directement, a.ajourne_directement ? "Lever l'ajournement" : 'Ajourner cet acquis — à représenter',
                          () => onAjuster('aa', a.aa_code, a.ajourne_directement ? null : 'ajourne'))}
                        </span>
                      </td>
                      {aJust.length > 0 && (
                        <td className="px-2 py-1">
                          {enCause && (
                            <MotifEnLigne a={a} enCours={enCours} seul={aJust.length < 2}
                              onMotif={(code, texte) => onMotif({ [code]: texte })} onReporter={reporter} />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* EN SECONDE SESSION, LES ACQUIS SEULS (Charles, 4 octobre 2026 :
                    « en 2e session je ne veux QUE les AA »). La note de cours,
                    qui ne pèse pas sur la décision de septembre, ne s'affiche
                    plus, même à titre indicatif. */}
                {!(Number(session) >= 2 && !regarde.cours) && (
                <tr className="border-t border-slate-200 bg-slate-50/60">
                  <td className="px-2.5 py-1.5 font-semibold text-slate-600">
                    Note du cours{!regarde.cours && <span className="font-normal text-slate-400"> · indicative</span>}
                  </td>
                  {cours.map(c => (
                    <td key={c.cours_code} className={`px-1.5 py-1.5 text-center whitespace-nowrap ${!regarde.cours ? 'opacity-60' : ''}`}>
                      <span className="relative inline-flex align-middle">
                      {note(c, { na: c.na })}

                      {bouton(!!c.ajourne_directement, c.ajourne_directement ? "Lever l'ajournement du cours" : 'Ajourner ce cours — à représenter',
                        () => onAjuster('cours', c.cours_code, c.ajourne_directement ? null : 'ajourne'))}
                      </span>
                      {c.aas_a_representer && (
                        <div className="mt-0.5 text-mention leading-tight text-slate-500 whitespace-normal"
                          title="Le Conseil n'a rouvert que ces acquis du cours">
                          seuls {c.aas_a_representer.join(', ')}
                        </div>)}
                    </td>
                  ))}
                  <td className="bg-iip-blue/10" />
                  {aJust.length > 0 && <td className="px-2.5 py-1.5 text-mention text-slate-400">
                    Ce texte est celui de l'annexe 8 (ajournement) ou 9 (refus).</td>}
                </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Ce que la décision emporte, et ce que la faveur coûterait : dans la
            fiche, lu avant de cliquer. */}
        {!lectureSeule() && <DecisionGenerale cours={cours} enCours={enCours} onLot={onLot}
          onDecision={onDecision} decision={decision} />}
        <AideDecision ue={ue} />
        <Decision e={e} ue={ue} acquis={acquis} cours={cours} decision={decision}
          onDecision={onDecision} enCours={enCours} session={session} partie="details" />
      </div>

      {/* EN BAS, COLLÉS : LES SEULS BOUTONS DU CONSEIL (Charles, 29 septembre
          2026 : « juste le bouton ; et le nom en haut »). */}
      {lectureSeule() ? (
        <div className="col-span-2 sticky bottom-0 z-20 -mx-1 px-1 py-2 border-t border-slate-200 text-second text-slate-500"
          style={{ background: 'var(--page-fond, #fff)' }}>
          Lecture seule : les décisions du Conseil s'encodent par le secrétariat et la direction.
        </div>
      ) : (
      <div className="col-span-2 sticky bottom-0 z-20 -mx-1 px-1 py-1.5 border-t border-slate-200"
        style={{ background: 'var(--page-fond, #fff)' }}>
        <Decision e={e} ue={ue} onBord={onBord} acquis={acquis} cours={cours}
          decision={decision} onDecision={onDecision} enCours={enCours}
          onAnnuler={onAnnuler} session={session} partie="boutons"
          onFaveurUE={() => onAjuster('ue', '*', ue.faveur_ue ? null : 'faveur')} />
      </div>
      )}
    </div>
  );
}

/* ═══ Le thermomètre du parcours ══════════════════════════════════════════
 *
 * Une case par unité de la section, rangées par bloc de bas en haut comme on
 * monte dans le cursus : vert réussie, violet faveur, bleu en cours, ocre
 * ajournée, brique refusée, gris à venir. L'unité délibérée est cerclée. Les
 * couleurs sont les réglages d'état (Configuration → Thèmes et couleurs). */
const ETAT_THERMO = { reussi: 'var(--c-reussi)', faveur: 'var(--c-faveur)', en_cours: 'var(--c-disponible)',
  ajourne: 'var(--c-attente)', refuse: 'var(--c-refuse)', a_venir: 'rgb(var(--gris-200))' };
const LIB_THERMO = { reussi: 'réussie', faveur: 'réussie par faveur', en_cours: 'en cours', ajourne: 'ajournée',
  refuse: 'refusée', a_venir: 'à venir' };
function Thermometre({ pc, ueNum, onBord }) {
  const unites = pc?.unites || [];
  if (!unites.length) return <div />;
  const blocs = [...new Set(unites.map(u => u.bloc))];
  return (
    <div className="flex flex-col items-center gap-[3px] pt-0.5 sticky top-0">
      {blocs.map(b => (
        <div key={b} className="flex flex-col items-center gap-[3px]">
          <div className="text-mention text-slate-400 mt-1">{b || '—'}</div>
          {unites.filter(u => u.bloc === b).map(u => (
            <span key={u.ue_num} title={`UE ${u.ue_num}${u.ue_nom ? ` — ${u.ue_nom}` : ''} · ${LIB_THERMO[u.etat]}`}
              className="block w-3.5 rounded-pastille"
              style={{ height: u.ue_num === ueNum ? 18 : 13, background: ETAT_THERMO[u.etat],
                outline: u.ue_num === ueNum ? '2px solid var(--c-texte)' : 'none', outlineOffset: 1 }} />
          ))}
        </div>
      ))}
      {pc.ects > 0 && <div className="text-mention text-slate-500 text-center leading-tight mt-1.5">{pc.ects}<br />ECTS</div>}
      <button type="button" onClick={onBord} title="Parcours complet et motivation"
        className="mt-1 text-mention text-iip-blue underline">voir</button>
    </div>
  );
}

/* LA MOTIVATION SUR LA LIGNE DE L'ACQUIS : les énoncés retenus, la liste pour
   en ajouter, la précision propre, le pinceau — la même mécanique que
   l'ancien bloc « À justifier », resserrée à une cellule. Sa provenance se lit
   à côté : l'enseignant (c'est le motif délibéré), le Conseil, ou Lucie. */
function MotifEnLigne({ a, onMotif, onReporter, seul, enCours }) {
  const depart = decomposerMotif(a.motif || '');
  const [cles, setCles] = useState(depart.cles);
  const [libre, setLibre] = useState(depart.libre);
  const [ecrire, setEcrire] = useState(false);
  useEffect(() => { const d = decomposerMotif(a.motif || ''); setCles(d.cles); setLibre(d.libre); setEcrire(false); }, [a.aa_code, a.motif]);
  const poser = (c, l) => onMotif(a.aa_code, composerMotif(c, l));
  const ajouter = cle => { if (!cle || cles.includes(cle)) return; const c = [...cles, cle]; setCles(c); poser(c, libre); };
  const retirer = cle => { const c = cles.filter(x => x !== cle); setCles(c); poser(c, libre); };

  /* LE CHOIX SE VOIT : REPRENDRE CE QUI EST IMPORTÉ, OU ÉCRIRE (Charles, 29
     septembre 2026). L'import — le justificatif de l'enseignant, posé avec sa
     note dans Mes cours, ou le motif type du référentiel — ou la proposition
     de Lucie se lisent EN ENTIER, avec leur provenance ; deux gestes : le
     reprendre tel quel, ou écrire autre chose. Le motif de l'enseignant est le
     motif délibéré : il n'a pas à être confirmé, seulement remplacé si le
     Conseil en décide autrement. */
  const texte = [...cles.map(texteDuMotif), libre].filter(Boolean).join(' ');
  const PROV = { enseignant: 'importé · enseignant (Mes cours)', conseil: 'écrit par le Conseil',
    defaut_aa: 'importé · motif type du référentiel', calcule: 'proposé par Lucie' };
  const provenance = a.motif ? (PROV[a.motif_source] || 'enregistré') : null;
  const proposition = !a.motif && a.motif_propose ? a.motif_propose : null;

  if (!ecrire && (a.motif || proposition)) {
    return (
      <div className="space-y-0.5">
        <div className={`text-xs leading-snug ${a.motif ? 'text-slate-800' : 'text-slate-500 italic'}`}>
          {a.motif ? texte : proposition}
        </div>
        <div className="flex items-center gap-2 text-mention">
          <span className="text-slate-400">{a.motif ? provenance : 'proposé par Lucie · pas encore retenu'}</span>
          {!a.motif && (
            <button type="button" disabled={enCours} onClick={() => onMotif(a.aa_code, proposition)}
              className="text-iip-blue underline">reprendre</button>
          )}
          <button type="button" disabled={enCours} onClick={() => setEcrire(true)}
            className="text-iip-blue underline">{a.motif ? 'écrire autre chose' : 'écrire'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {!!cles.length && (
        <div className="flex flex-wrap gap-1">
          {cles.map(c => (
            <span key={c} className="inline-flex items-start gap-1 max-w-full bg-iip-blue/10 rounded-pastille px-1.5 py-0.5 text-xs text-slate-700">
              <span className="line-clamp-2" title={texteDuMotif(c) || ''}>{texteDuMotif(c)}</span>
              <button disabled={enCours} onClick={() => retirer(c)} title="Retirer cet énoncé" className="flex-none opacity-50 hover:opacity-100"><IconX size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <select value="" disabled={enCours} onChange={ev => { ajouter(ev.target.value); ev.target.value = ''; }}
          className={`flex-1 min-w-0 border rounded-pastille px-1.5 py-0.5 text-xs bg-white ${cles.length || libre ? 'border-slate-200 text-slate-500' : 'border-red-300 text-red-700'}`}>
          <option value="">{cles.length ? '+ ajouter un énoncé' : '— choisir un énoncé —'}</option>
          {MOTIFS_ECHEC.map(g => (
            <optgroup key={g.groupe} label={g.groupe}>
              {g.motifs.filter(m => !cles.includes(m.cle)).map(m => <option key={m.cle} value={m.cle}>{m.texte}</option>)}
            </optgroup>
          ))}
        </select>
        {!seul && (
          <button disabled={enCours || !cles.length} onClick={() => onReporter(cles)}
            title="Reporter ces énoncés sur tous les acquis à justifier — ils s'ajoutent aux leurs"
            className="flex-none w-6 h-6 rounded-pastille border border-slate-300 text-slate-500 flex items-center justify-center disabled:opacity-30">
            <IconBrush size={12} />
          </button>
        )}
      </div>
      <textarea value={libre} disabled={enCours} rows={1} onChange={ev => setLibre(ev.target.value)} onBlur={() => poser(cles, libre)}
        placeholder="ou écrire la justification…" className="w-full border border-slate-200 rounded-pastille px-1.5 py-0.5 text-xs resize-y" />
      {(a.motif || proposition) && (
        <button type="button" onClick={() => setEcrire(false)} className="text-mention text-slate-400 underline">fermer</button>
      )}
    </div>
  );
}

/* ═══ Le panneau de pilotage ═══════════════════════════════════════════════
 *
 * On délibérait une unité sans voir les autres : il fallait ouvrir une seconde
 * fenêtre pour savoir de qui l'on parlait, et l'on décidait entre-temps. Le
 * parcours de l'année tient ici, en pastilles — vert réussi, rouge refusé,
 * ambre ajourné, violet levé en faveur — avec la moyenne et les crédits.
 *
 * Fond sombre : ce n'est pas la feuille, c'est ce qui l'entoure. L'œil ne doit
 * pas les confondre.
 */

const TON_RES = {
  reussi:  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  refuse:  'bg-red-500/20 text-red-200 border-red-400/40',
  ajourne: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  absent:  'bg-slate-500/20 text-slate-300 border-slate-400/40',
};
const TON_FAVEUR = 'bg-violet-500/25 text-violet-200 border-violet-400/50';

function Pilotage({ e, ue, onBord }) {
  const parcours = e.parcours || [];
  const autres = parcours.filter(u => u.ue_num !== ue.ue_num);

  const acquises = parcours.filter(u => u.resultat === 'reussi');
  const ects = acquises.reduce((s, u) => s + (Number(u.ects) || 0), 0);
  const enFaveur = parcours.filter(u => u.faveur).length;

  return (
    <div className="rounded-xl bg-slate-800 text-slate-200 p-3 space-y-3
                    lg:sticky lg:top-2">
      <div>
        <div className="text-sm font-bold text-white truncate">
          {nomPropre(e.nom, e.prenom)}
        </div>
        <div className="text-xs text-slate-400">{e.id_ecampus || '—'}</div>
      </div>

      {/* Les chiffres de l'année. */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Chiffre libelle="Moyenne"
          valeur={ue.moyenne_annee != null ? fmt(ue.moyenne_annee) : '—'}
          suffixe={ue.moyenne_annee != null ? '/20' : ''}
          ton={ue.moyenne_annee == null ? 'text-slate-400'
            : ue.moyenne_annee >= 12 ? 'text-emerald-300'
            : ue.moyenne_annee >= 10 ? 'text-sky-300' : 'text-amber-300'} />
        <Chiffre libelle="Acquises" valeur={acquises.length}
          suffixe={`/${parcours.length}`} ton="text-white" />
        <Chiffre libelle="Crédits" valeur={ects || '—'}
          ton={ects ? 'text-white' : 'text-slate-400'} />
      </div>

      {/* Les autres unités de l'année, en pastilles. */}
      <div>
        <div className="text-mention font-bold uppercase tracking-wide text-slate-400 mb-1">
          Les autres unités de l'année
        </div>
        {!autres.length ? (
          <div className="text-xs text-slate-500">
            Aucune autre inscription cette année.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {autres.map(u => (
              <span key={u.ue_num}
                title={`${u.ue_nom || `UE ${u.ue_num}`}`
                  + `${u.resultat ? ` — ${LIB_RES[u.resultat]}` : ' — non délibérée'}`
                  + `${u.points != null ? ` (${fmt(u.points)}/20)` : ''}`
                  + `${u.faveur ? ' — levée en faveur' : ''}`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border
                  text-xs font-semibold
                  ${u.faveur ? TON_FAVEUR
                    : TON_RES[u.resultat] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                <span className="tabular-nums">{u.ue_num}</span>
                {u.points != null && (
                  <span className="font-normal opacity-80">{fmt(u.points)}</span>
                )}
                {u.faveur && <span className="opacity-90">★</span>}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-mention text-slate-400">
          <span><span className="text-emerald-300">■</span> réussi</span>
          <span><span className="text-amber-300">■</span> ajourné</span>
          <span><span className="text-red-300">■</span> refusé</span>
          <span><span className="text-violet-300">■</span> faveur</span>
          <span><span className="text-slate-500">■</span> non délibérée</span>
        </div>
      </div>

      {/* CADEAU SUR CADEAU : l'avertissement vit ici, où l'on voit le parcours. */}
      {enFaveur > 0 && (
        <div className="rounded-lg bg-violet-500/15 border border-violet-400/40 px-2 py-1.5
                        text-xs text-violet-100">
          <b>{enFaveur} unité(s) déjà levée(s) en faveur</b> cette année.
          Chaque unité se délibère séparément : sans cette ligne, le Conseil
          accorde sans le savoir une faveur de plus.
        </div>
      )}

      <button onClick={onBord}
        className="w-full px-2.5 py-1.5 text-second rounded-lg bg-white/10 border
                   border-white/20 text-white font-semibold hover:bg-white/15">
        Parcours complet et motivation
      </button>
    </div>
  );
}

function Chiffre({ libelle, valeur, suffixe, ton }) {
  return (
    <div className="rounded-lg bg-slate-900/60 py-1.5">
      <div className={`text-base font-bold leading-none tabular-nums ${ton}`}>
        {valeur}<span className="text-mention font-normal opacity-70">{suffixe}</span>
      </div>
      <div className="text-mention uppercase tracking-wide text-slate-400 mt-0.5">{libelle}</div>
    </div>
  );
}

/**
 * Une tuile de somme : la note, et l'ajournement qui s'y pose.
 *
 * La justification, elle, se pose SOUS la matrice : ici, ajourner faisait
 * passer la tuile en NA et le bouton disparaissait avec l'état d'échec — on ne
 * pouvait plus justifier ce qu'on venait d'ajourner. La tuile n'en garde qu'un
 * témoin : un point bleu quand le motif est écrit, un point rouge sinon.
 */
function TuileSomme({ etat, seuil, onAjourner, onFaveur, motif, enCours,
                      decidee = false, indicatif = false,
                      sansAjournement = false }) {
  const { na, faveur, note, mention } = etat;
  const echec = !na && note != null && note < seuil;
  // DÈS QUE LA DÉCISION EST POSÉE, CE QUI EST SOUS LE SEUIL N'EST PLUS UNE
  // COTE, C'EST UN NON-ACQUIS. Tant qu'on délibère, le chiffre aide — 6 et 9
  // ne se motivent pas pareil. Une fois l'unité ajournée ou refusée, la cote
  // n'a plus de rôle : c'est « NA » qui figurera partout ensuite.
  const enNA = na || (decidee && echec);
  return (
    <div className={`rounded-lg border px-2 py-1 flex items-center gap-1.5
      ${indicatif ? 'opacity-50' : ''}
      ${na ? 'border-slate-300 bg-slate-100 text-slate-600'
        : faveur ? 'border-violet-500 bg-violet-500 text-white'
        : echec ? 'border-red-500 border-2 bg-red-500 text-white'
        : note == null ? 'border-slate-200 bg-white text-slate-300'
        : 'border-emerald-500 bg-emerald-500 text-white'}`}>
      <span className={`text-base font-bold tabular-nums flex-1 text-right
        ${decidee && echec ? 'text-red-700' : ''}`}
        title={mention === 'NP' ? 'Note de présence'
          : mention === 'PP' ? 'Pas présenté'
          : decidee && echec ? `Cote calculée : ${fmt(note)}/20 — non acquis` : ''}>
        {enNA ? 'NA' : (mention || fmt(note))}
      </span>
      <span className="flex flex-col gap-0.5">
        {/* PAS D'AJOURNEMENT EN SECONDE SESSION. Ajourner, c'est renvoyer à la
            session suivante — et après septembre il n'y en a pas. Le règlement
            le dit sans détour : « l'étudiant qui échoue en seconde session est
            refusé » (RGE art. 69 §2). Le bouton proposait donc une décision
            qui n'existe pas, et la double flèche laissait croire à une
            troisième chance. */}
        {!sansAjournement && (
        <button disabled={enCours} onClick={onAjourner}
          title={na ? "Lever l'ajournement" : 'Ajourner — à représenter'}
          className={`w-5 h-5 rounded-full flex items-center justify-center border
            ${na ? 'bg-slate-600 border-slate-700 text-white'
                 : 'bg-white border-slate-300 text-slate-500 hover:border-slate-500'}`}>
          <IconRepeat size={11} />
        </button>
        )}

        {/* LA FAVEUR SE POSE À L'UNITÉ, ET NULLE PART AILLEURS.
            Elle a longtemps été offerte ici, sur l'acquis et sur le cours. La
            maison délibère autrement : c'est l'UNITÉ que le Conseil accorde ou
            refuse, et la faveur est la décision de la donner malgré un acquis
            manquant. Le bouton vit désormais avec les autres décisions, sous la
            fiche. L'ajournement, lui, reste ici : c'est lui qui dit ce qui se
            représente, et cela se pose bien élément par élément. */}
        {false && (echec || faveur) && !na && onFaveur && (
          <button disabled={enCours} onClick={onFaveur}
            title={faveur ? 'Retirer la faveur'
              : `Lever en faveur — vaudra exactement ${seuil}`}
            className={`w-5 h-5 rounded-full flex items-center justify-center border
              ${faveur ? 'bg-violet-400 border-violet-600 text-violet-950'
                       : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <IconArrowUp size={11} />
          </button>
        )}

        {(echec || na) && motif !== undefined && (
          <span title={motif ? 'Justifié' : 'À justifier sous la matrice'}
            className={`w-5 h-5 rounded-full flex items-center justify-center border
              ${motif ? 'bg-iip-blue border-iip-blue text-white'
                      : 'bg-white border-red-400 text-red-600'}`}>
            <IconMessage size={11} />
          </span>
        )}
      </span>
    </div>
  );
}

/** La note de l'unité. La faveur se pose ici comme sur l'acquis et le cours. */
function TuileUE({ ue, seuil, onFaveur, enCours, compacte = false }) {
  const echec = !ue.na && ue.note != null && ue.note < seuil;
  // LA TUILE DE LA MAISON (bloc d'état) : le liseré porte l'état, le texte
  // reste à l'encre. Une unité non acquise est « à surveiller » tant qu'on
  // délibère ; la faveur, violette, garde son cadeau.
  const etat = ue.na ? 'indisponible' : ue.faveur ? 'faveur' : echec ? 'surveiller' : ue.note == null ? 'neutre' : 'reussi';
  if (compacte) {
    // PLEINE, À LA HAUTEUR DU NOM (Charles, 30 septembre 2026) : verte si
    // l'unité est acquise, violette si elle l'est par faveur, rouge sinon.
    const fond = ue.note == null && !ue.na ? null
      : ue.faveur ? 'var(--c-faveur)' : (ue.na || echec) ? 'var(--c-refuse)' : 'var(--c-reussi)';
    return (
      <div className={`h-9 inline-flex items-center gap-2 px-3 rounded-champ whitespace-nowrap ${fond ? 'text-white' : 'border border-slate-300'}`}
        style={fond ? { background: fond } : undefined}>
        {ue.faveur && <IconGift size={14} />}
        <span className="text-base font-bold tabular-nums">{ue.na ? 'NA' : fmt(ue.note)}</span>
        <span className="text-xs opacity-90">/ 20 · note de l'unité</span>
        {ue.cote_etudiant != null && String(ue.cote_etudiant) !== fmt(ue.note) && (
          <span className="text-xs opacity-90">· à l'étudiant <b className="tabular-nums">{ue.cote_etudiant}</b></span>
        )}
      </div>
    );
  }
  return (
    <div data-etat={etat} className="bloc-etat px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xl font-bold tabular-nums flex-1 leading-tight">
          {ue.faveur && <IconGift size={15} className="inline -mt-1 mr-1" style={{ color: 'var(--c-faveur)' }} />}
          {ue.na ? 'NA' : fmt(ue.note)}<span className="text-second font-normal text-slate-500"> / 20</span>
        </span>
        {(echec || ue.faveur) && !ue.na && (
          <button disabled={enCours} onClick={onFaveur}
            title={ue.faveur ? 'Retirer la faveur'
              : "Lever l'unité en faveur — elle vaudra exactement le seuil"}
            className={`w-6 h-6 rounded-full flex items-center justify-center border
              ${ue.faveur ? 'bg-violet-400 border-violet-600 text-violet-950'
                          : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <IconArrowUp size={13} />
          </button>
        )}
      </div>
      <div className="text-xs text-slate-500">
        {ue.faveur ? "note de l'unité · faveur" : echec ? "note de l'unité · non acquise" : "note de l'unité"}
      </div>
      {/* CE QUE L'ÉTUDIANT VERRA, dit ici pour qu'on n'ait pas à le deviner.
          La tuile montre la cote de travail — celle sur laquelle le Conseil
          délibère. Sur les documents de l'étudiant, la circulaire n'admet rien
          sous dix : c'est « NA ». Et une unité levée en faveur y vaut le seuil,
          non la moyenne qui l'avait fait échouer. Les deux chiffres diffèrent
          légitimement ; ne montrer que le premier laissait croire à une erreur
          au moment de relire les pièces. */}
      {ue.cote_etudiant != null && String(ue.cote_etudiant) !== fmt(ue.note) && (
        <div className="text-mention text-right border-t border-current/20 mt-0.5 pt-0.5
                        opacity-80" title="La cote portée sur les documents de l'étudiant">
          à l’étudiant : <b className="tabular-nums">{ue.cote_etudiant}</b>
        </div>
      )}
    </div>
  );
}

/* ═══ Ce qu'il faut justifier ══════════════════════════════════════════════
 *
 * UNE LIGNE PAR ACQUIS, ET UNE SEULE. Un acquis évalué dans deux cours était
 * listé deux fois, et il fallait le justifier deux fois : c'est du même acquis
 * qu'on rend compte, quel que soit le cours qui l'a évalué. Les cours ajournés
 * sont donc rappelés en une ligne, et les acquis listés une fois chacun.
 *
 * PLUSIEURS ÉNONCÉS PAR ACQUIS. Un échec a rarement une seule cause : on
 * ajoute les énoncés les uns aux autres, on les retire d'un clic, et la
 * précision propre à l'étudiant se met à côté.
 *
 * LE PINCEAU. Une même cause vaut souvent pour tous les acquis d'un dossier.
 * Le pinceau REPORTE les énoncés d'une ligne sur toutes les autres — il ajoute
 * aux leurs, il ne les remplace pas : ce qu'on a écrit ailleurs reste.
 */

function AJustifier({ acquis, cours, onMotif, enCours, decision }) {
  const aRepresenter = cours.filter(c => c.na);
  const liste = aJustifier(acquis, cours, decision);
  if (!liste.length) return null;

  const sansMotif = liste.filter(a => !a.motif).length;

  /** Le pinceau : ajouter ces énoncés à tous les autres acquis à justifier. */
  function reporter(cles) {
    if (!cles.length) return;
    const motifs = {};
    for (const a of liste) {
      const d = decomposerMotif(a.motif || '');
      const union = [...new Set([...d.cles, ...cles])];
      // On ne réécrit que ce qui change : inutile de toucher aux lignes qui
      // portent déjà ces énoncés.
      if (union.length !== d.cles.length || !a.motif) {
        motifs[a.aa_code] = composerMotif(union, d.libre);
      }
    }
    if (Object.keys(motifs).length) onMotif(motifs);
  }

  return (
    <div id="a-justifier" className="border border-red-200 rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 bg-red-50 border-b border-red-200 flex items-center
                      justify-between gap-2 flex-wrap">
        <span className="text-second font-semibold text-red-900">
          À justifier — {liste.length} acquis
        </span>
        <span className="text-xs text-red-700">
          {sansMotif ? `${sansMotif} sans motivation` : 'tous motivés'}
        </span>
      </div>

      {/* Les cours à représenter, rappelés en une ligne : c'est l'acquis qu'on
          justifie, pas le cours. */}
      {!!aRepresenter.length && (
        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-second
                        text-slate-700">
          <span className="font-semibold">Cours ajournés, à représenter :</span>{' '}
          {aRepresenter.map(c => (
            <span key={c.cours_code} className="mr-2">
              <span className="font-mono font-bold">{c.cours_code}</span>
              {c.cours_nom ? ` · ${c.cours_nom}` : ''}
              {c.professeurs ? (
                <span className="italic text-iip-blue/70"> ({c.professeurs})</span>
              ) : null}
            </span>
          ))}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {liste.map(a => (
          <LigneMotif key={a.aa_code} a={a} enCours={enCours}
            onMotif={(code, texte) => onMotif({ [code]: texte })}
            onReporter={reporter}
            seul={liste.length < 2} />
        ))}
      </div>

      <p className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        Ce texte est celui que reprendra l'annexe 8 (ajournement) ou 9 (refus).
        Sans lui, la décision est attaquable et l'écran ne passe pas au suivant.
      </p>
    </div>
  );
}

/** Un acquis à justifier : son état à gauche, ses motivations à droite. */
function LigneMotif({ a, onMotif, onReporter, seul, enCours }) {
  const depart = decomposerMotif(a.motif || '');
  const [cles, setCles] = useState(depart.cles);
  const [libre, setLibre] = useState(depart.libre);

  // Le motif enregistré peut changer sous nos pieds — le pinceau d'une autre
  // ligne, l'étudiant suivant. On repart de lui.
  useEffect(() => {
    const d = decomposerMotif(a.motif || '');
    setCles(d.cles); setLibre(d.libre);
  }, [a.aa_code, a.motif]);

  const poser = (c, l) => onMotif(a.aa_code, composerMotif(c, l));
  const ajouter = (cle) => {
    if (!cle || cles.includes(cle)) return;
    const c = [...cles, cle];
    setCles(c); poser(c, libre);
  };
  const retirer = (cle) => {
    const c = cles.filter(x => x !== cle);
    setCles(c); poser(c, libre);
  };

  return (
    <div className={`px-3 py-2 flex items-start gap-3 ${a.motif ? '' : 'bg-red-50/40 border-l-4 border-l-red-500'}`}>
      <div className="w-40 flex-none">
        <div className="font-mono text-second font-bold text-slate-700">{a.aa_code}</div>
        <div className="text-xs text-slate-500 truncate" title={a.description || ''}>
          {a.description || ''}
        </div>
        <span className={`inline-block mt-0.5 text-mention font-bold px-1.5 py-0.5 rounded-champ
          ${a.na ? 'bg-slate-200 text-slate-700' : 'bg-red-500 text-white'}`}>
          {a.na ? 'ajourné · à représenter' : `${fmt(a.note)}/20`}
        </span>
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Les énoncés retenus, chacun retirable. */}
        {!!cles.length && (
          <div className="flex flex-wrap gap-1">
            {cles.map(c => (
              <span key={c} className="inline-flex items-start gap-1 max-w-full
                             bg-iip-blue/10 border border-iip-blue/30 rounded-lg
                             px-1.5 py-0.5 text-xs text-iip-blue">
                <span className="truncate" title={texteDuMotif(c) || ''}>
                  {texteDuMotif(c)}
                </span>
                <button disabled={enCours} onClick={() => retirer(c)}
                  title="Retirer cet énoncé" className="flex-none opacity-60 hover:opacity-100">
                  <IconX size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <select value="" disabled={enCours}
            onChange={ev => { ajouter(ev.target.value); ev.target.value = ''; }}
            className={`flex-1 border rounded-lg px-2 py-1.5 text-second
              ${cles.length ? 'border-slate-300' : 'border-red-400 text-red-700'}`}>
            <option value="">
              {cles.length ? '+ ajouter une justification…' : '— choisir la justification —'}
            </option>
            {MOTIFS_ECHEC.map(g => (
              <optgroup key={g.groupe} label={g.groupe}>
                {g.motifs.filter(m => !cles.includes(m.cle)).map(m => (
                  <option key={m.cle} value={m.cle}>{m.texte}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* LE PINCEAU : reporter ces énoncés sur tous les autres acquis. */}
          {!seul && (
            <button disabled={enCours || !cles.length}
              onClick={() => onReporter(cles)}
              title="Reporter ces justifications sur tous les acquis à justifier — elles s'ajoutent aux leurs, elles ne les remplacent pas"
              className="flex-none w-8 h-8 rounded-lg border border-iip-blue text-iip-blue
                         flex items-center justify-center disabled:opacity-30
                         disabled:border-slate-300 disabled:text-slate-400">
              <IconBrush size={15} />
            </button>
          )}
        </div>

        <input value={libre} disabled={enCours}
          onChange={ev => setLibre(ev.target.value)}
          onBlur={() => poser(cles, libre)}
          placeholder="Précision propre à cet acquis (facultatif)…"
          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-second" />
      </div>
    </div>
  );
}

/* ═══ L'aide à la décision ═════════════════════════════════════════════════
 *
 * CHAQUE UNITÉ SE JUGE POUR ELLE-MÊME : la faveur s'apprécie sur celle-ci —
 * deux points au plus à combler, sur un ou deux cours. La moyenne de l'année
 * n'ouvre ni ne ferme rien ; elle dit seulement si l'échec est un accident de
 * parcours. Et l'on rappelle ce qui a DÉJÀ été accordé ailleurs, sans quoi le
 * Conseil fait cadeau sur cadeau sans le savoir.
 */

function AideDecision({ ue }) {
  // Les faveurs déjà accordées ailleurs sont désormais dites par le panneau de
  // pilotage, à droite, où l'on voit le parcours : les répéter ici ferait deux
  // avertissements pour un.
  if (ue.na || !ue.faveur_cout) return null;
  const b = ue.faveur_bareme || {};
  const ok = ue.faveur_eligible;

  return (
    <div className="space-y-1.5">
      {!!ue.faveur_cout && (
        <div className={`rounded-xl border px-3 py-2 text-second
          ${ok ? 'bg-emerald-500 border-emerald-500 text-white'
               : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              {ok ? 'Faveur envisageable' : 'Faveur hors de la ligne du Conseil'}
            </span>
            <span className="text-second opacity-80">
              il manque <b>{fmt(ue.faveur_cout)}</b> point(s)
            </span>
            {!!(ue.faveur_cours || []).length && (
              <span className="text-second opacity-80">
                · sur {ue.faveur_cours.length} cours ({ue.faveur_cours.join(', ')})
              </span>
            )}
            <span className="text-second opacity-60 ml-auto">
              moyenne de l'année :
              {' '}<b>{ue.moyenne_annee != null ? fmt(ue.moyenne_annee) : '—'}</b>/20
              {ue.moyenne_annee != null && (
                <span className="ml-1">
                  {ue.moyenne_annee >= 12 ? '· accident de parcours ?'
                    : '· difficulté générale'}
                </span>
              )}
            </span>
          </div>

          <div className="mt-1 text-xs opacity-80">
            {(ue.faveur_acquis || []).map(a => (
              <span key={a.aa_code} className="mr-2">
                <span className="font-mono">{a.aa_code}</span> −{fmt(a.manque)}
              </span>
            ))}
          </div>

          <div className="mt-1 text-xs opacity-70">
            {ue.faveur_motif
              ? `Motif : ${ue.faveur_motif}.`
              : `Dans la limite retenue pour l'unité : ${b.points_max} point(s) au plus, `
                + `sur ${b.cours_max} cours au plus.`}
            {' '}La moyenne de l'année n'ouvre ni ne ferme la faveur : elle dit
            seulement si cet échec est isolé. La décision reste au Conseil.
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ La décision, sous la matrice ═════════════════════════════════════════ */

const LIB_RES = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', absent: 'Absent' };

/**
 * LA MENTION DE VISITE PAR DÉFAUT.
 *
 * Proposée en un clic parce qu'elle sera la même partout : ce qui se retape à
 * chaque unité finit par se retaper avec une faute. Elle reste modifiable —
 * c'est un point de départ, pas une formule imposée.
 */
const MENTION_VISITE =
  'Les modalités de visite des copies peuvent être obtenues sur simple demande '
  + 'auprès de l’enseignant, par courriel.';

const DECISIONS = [
  { cle: 'reussi',  libelle: 'Réussi',  ton: 'bg-emerald-600 border-emerald-700' },
  { cle: 'ajourne', libelle: 'Ajourné', ton: 'bg-amber-500 border-amber-600' },
  { cle: 'refuse',  libelle: 'Refusé',  ton: 'bg-red-600 border-red-700' },
  { cle: 'absent',  libelle: 'Absent',  ton: 'bg-slate-500 border-slate-600' },
];

/**
 * La décision — proposée par le calcul, ARRÊTÉE PAR LE CONSEIL.
 *
 * Elle n'était qu'affichée : le calcul disait « ajourné » et il n'y avait plus
 * qu'à s'y ranger. Le Conseil délibère, il ne ratifie pas ; les quatre
 * décisions sont donc offertes, celle du calcul portée d'avance.
 */
/**
 * L'AJOURNEMENT — OU LE REFUS — DE TOUTE L'UNITÉ, D'UN GESTE.
 *
 * Quand le Conseil ajourne, il ajourne le plus souvent tous les cours ; quand
 * il refuse, ils tombent tous. Cliquer six tuiles pour chaque étudiant, c'est
 * long et c'est là qu'on en oublie une.
 *
 * Les deux boutons basculent : tout est déjà ajourné, un second clic relève.
 * Le refus ajourne les cours ET pose la décision, parce que ces deux gestes
 * n'ont pas de sens séparés — mais la décision reste modifiable en dessous, le
 * Conseil n'étant lié par aucun bouton.
 */
function DecisionGenerale({ cours, enCours, onLot, onDecision, decision }) {
  // En seconde session, on n'ajourne que ce qui était à représenter : le reste
  // est acquis depuis juin et n'a pas à retomber.
  const enJeu = cours.some(c => c.represente != null)
    ? cours.filter(c => c.represente) : cours;
  const codes = enJeu.map(c => c.cours_code);
  if (codes.length < 2) return null;
  // C'est l'AJOURNEMENT POSÉ qui compte, non l'échec : un cours sous dix est
  // déjà « non acquis » sans que le Conseil ait rien décidé, et le bouton
  // aurait annoncé « relever » avant qu'on ait ajourné quoi que ce soit.
  const tousAjournes = enJeu.length > 0 && enJeu.every(c => c.ajourne_directement);

  return (
    <div className="flex items-center gap-2 flex-wrap text-second">
      <span className="text-slate-500">Sur l'ensemble des cours :</span>
      <button disabled={enCours} onClick={() => onLot('cours', codes, tousAjournes ? null : 'ajourne')}
        title={tousAjournes
          ? "Relever l'ajournement de tous les cours"
          : "Ajourner les cours de l'unité en une fois"}
        className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5
          ${tousAjournes
    ? 'bg-amber-500 border-amber-500 text-white'
    : 'bg-white border-amber-500 text-iip-texte hover:bg-amber-500 hover:text-white'}`}>
        <IconAlertTriangle size={13} />
        {tousAjournes ? 'Relever l’ajournement général' : 'Ajournement général'}
      </button>
      <button disabled={enCours}
        onClick={() => { onLot('cours', codes, 'ajourne'); onDecision('refuse'); }}
        title="Tous les cours tombent et l'unité est refusée — sans seconde session"
        className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5
          ${decision === 'refuse'
    ? 'bg-red-500 border-red-500 text-white'
    : 'bg-white border-red-500 text-iip-texte hover:bg-red-500 hover:text-white'}`}>
        <IconBan size={13} /> Refus général
      </button>
      {tousAjournes && (
        <span className="text-amber-800">
          Tous les cours sont à représenter — chaque acquis en cause demande sa justification.
        </span>
      )}
    </div>
  );
}

function Decision({ e, ue, onBord, acquis, cours, decision, onDecision, enCours,
                    onAnnuler, session, onFaveurUE, partie = null }) {
  // DEUX PARTIES (29 septembre 2026) : les BOUTONS vivent dans la bande
  // toujours visible au bas de l'écran ; les EXPLICATIONS (ce qu'un refus
  // emporte, ce qui se représente) restent dans la fiche, au-dessus.
  const boutons = partie !== 'details', details = partie !== 'boutons';
  const detail = ue.a_representer_detail || [];
  // Ce qui reste à justifier se lit sur les acquis affichés, non sur la liste
  // que le serveur a calculée à l'ouverture de la fiche.
  const manquants = aJustifier(acquis, cours, decision).filter(a => !a.motif).map(a => a.aa_code);
  const propose = ue.decision_proposee;

  if (details && !boutons) {
    const rien = !ue.faveur && decision !== 'refuse' && !(ue.na && decision !== 'refuse');
    if (rien) return null;
  }
  return (
    <div className={boutons && details ? 'border border-slate-200 rounded-xl overflow-hidden' : ''}>
      {boutons && details && (
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-second
                      font-semibold text-iip-blue flex items-center justify-between gap-2">
        <span>Décision du Conseil des études</span>
        {!ue.na && ue.note != null && (
          <span className="font-normal text-slate-600">
            note de l'unité : <b>{fmt(ue.note)}</b>/20
          </span>
        )}
      </div>
      )}

      <div className={boutons && details ? 'p-3 space-y-2' : 'space-y-1.5'}>
        {boutons && (<>
        <div className="flex items-center gap-2 flex-wrap">
          {/* LA FAVEUR EST UNE DÉCISION DE L'UNITÉ, pas une retouche de note.
              Le Conseil accorde l'unité malgré un acquis manquant : la cote
              monte au seuil, jamais au-delà (RGE art. 77 §1 et 78 §2). Elle vit
              donc avec les autres décisions, et non plus dans chaque case. */}
          {onFaveurUE && (
            <button disabled={enCours} onClick={onFaveurUE}
              title={ue.faveur_ue
                ? 'Retirer la faveur accordée à l’unité'
                : 'Accorder l’unité en faveur — la cote monte au seuil, jamais au-delà'}
              className={`h-9 px-3 inline-flex items-center text-sm font-semibold rounded-lg border transition
                ${ue.faveur_ue
                  ? 'bg-violet-500 border-violet-500 text-white'
                  : 'bg-white border-slate-300 text-iip-texte hover:bg-violet-500 hover:border-violet-500 hover:text-white'}`}>
              {/* UN CADEAU, NON UN PINCEAU — et violet, non orange. La faveur
                  est un octroi : le Conseil donne l'unité. Le pinceau disait
                  « repeindre », ce qui n'est ni le geste ni son sens. Et
                  l'orange servait déjà aux cotes tout justes : deux choses
                  différentes portaient la même couleur au même endroit. */}
              <IconGift size={13} className="inline align-[-2px] mr-1" />
              {ue.faveur_ue ? 'Faveur accordée' : 'Faveur'}
            </button>
          )}
          {/* EN SECONDE SESSION, « AJOURNÉ » N'EXISTE PAS : il n'y a plus rien
              à représenter, et « l'étudiant qui échoue en seconde session est
              refusé » (RGE art. 69 §2). Le bouton disparaît plutôt que de rester
              cliquable — une troisième session ne se propose pas. */}
          {DECISIONS.filter(d => !(session >= 2 && d.cle === 'ajourne')).map(d => {
            const actif = decision === d.cle;
            /* RÉUSSI SUR UNE UNITÉ NON ACQUISE, C'EST UNE FAVEUR (Charles, 30
               septembre 2026) : le Conseil accorde l'unité malgré l'échec — Lucie
               pose la faveur d'office, tracée comme toute faveur, et le bouton
               passe au violet. */
            const nonAcquise = ue.na || (ue.note != null && ue.note < 10) || propose !== 'reussi';
            const enFaveur = d.cle === 'reussi' && actif && ue.faveur_ue;
            return (
              <button key={d.cle} disabled={enCours}
                onClick={() => {
                  if (d.cle === 'reussi' && nonAcquise && !ue.faveur_ue && onFaveurUE) onFaveurUE();
                  onDecision(d.cle);
                }}
                title={d.cle === 'reussi' && nonAcquise && !ue.faveur_ue ? "L'unité n'est pas acquise : la réussir, c'est accorder une faveur — elle sera tracée" : undefined}
                className={`h-9 px-3 inline-flex items-center text-sm font-semibold rounded-lg border
                  ${enFaveur ? 'bg-violet-500 border-violet-500 text-white'
                    : actif ? `${d.ton} text-white`
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                {enFaveur && <IconGift size={13} className="mr-1" />}
                {d.libelle}
                {d.cle === propose && (
                  <span className={`ml-1.5 text-mention font-normal
                    ${actif ? 'opacity-80' : 'text-slate-400'}`}>proposé</span>
                )}
              </button>
            );
          })}

          {/* Reprendre ce dossier à zéro : décision et ajustements effacés,
              notes conservées. */}
          {(e.resultat || ue.faveur || ue.na) && onAnnuler && (
            <button onClick={onAnnuler} disabled={enCours}
              title="Effacer la décision et les ajustements de cet étudiant — ses notes sont conservées"
              className="ml-auto text-second px-2.5 py-1 rounded-lg border border-slate-300
                         text-slate-500 hover:border-red-400 hover:text-red-700
                         flex items-center gap-1">
              <IconRotate size={13} /> Reprendre ce dossier
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-second">
          <span className="text-slate-500">
            {e.resultat
              ? <>Enregistré : <b className="text-slate-700">{LIB_RES[e.resultat]}</b>
                  {e.points != null && ` · ${fmt(e.points)}/20`}</>
              : 'Aucune décision encore enregistrée — elle part en passant au suivant.'}
          </span>

          {decision && decision !== propose && (
            <span className="text-amber-900 bg-amber-50 border border-amber-200
                             rounded-lg px-2 py-0.5">
              Le Conseil s'écarte de la proposition du calcul ({LIB_RES[propose] || '—'}).
            </span>
          )}

          {/* Le rappel « à justifier » vit dans la tuile, à côté de la flèche
              suivante : le répéter ici faisait deux fois la même alerte. */}
          {!!manquants.length && decision !== 'reussi' && partie !== 'boutons' && (
            <span className="text-white bg-red-500 border border-red-500 rounded-lg px-2 py-0.5">
              À justifier avant de passer au suivant : {manquants.join(', ')}
            </span>
          )}

          {!!(ue.mentions || []).length && (
            <span className="text-second text-amber-900 bg-amber-50 border
                             border-amber-300 rounded-lg px-2 py-0.5">
              {ue.mentions.map(m => `${m.cours_code} : ${m.mention}`).join(' · ')}
              {' — '}
              {ue.mentions.some(m => m.mention === 'PP')
                ? "épreuve non présentée : ajournement si l'absence est justifiée, refus sinon"
                : 'présent sans production : la seconde session reste ouverte'}
            </span>
          )}

          {ue.de_plein_droit && e.resultat !== 'reussi' && (
            <span className="text-emerald-800 bg-emerald-50 border border-emerald-200
                             rounded-lg px-2 py-0.5">
              Réussite de plein droit : tous les acquis et tous les cours au seuil.
            </span>
          )}
        </div>

        </>)}
        {details && (<>
        {ue.faveur && (
          <p className="text-second text-amber-900 bg-amber-50 border border-amber-200
                        rounded-lg px-2.5 py-1.5">
            Faveur accordée : l'unité vaut exactement le seuil. Le Conseil ne peut
            attester la réussite sans maîtrise de tous les acquis, ni donner plus de
            10/20 lorsque l'un d'eux ne l'est pas — décret du 16 avril 1991.
          </p>
        )}

        {/* LE REFUS N'OUVRE RIEN. Ajourner, c'est désigner ce que l'étudiant
            représentera en seconde session ; refuser, c'est clore l'unité pour
            cette année — aucune épreuve ne suit. Toute l'unité est sans note,
            et chaque acquis non maîtrisé doit être justifié : c'est ce que
            l'étudiant recevra, et ce sur quoi porterait un recours. */}
        {decision === 'refuse' && (
          <div className="text-second text-red-900 bg-red-50 border border-red-200
                          rounded-lg px-2.5 py-1.5 space-y-1">
            <div className="font-semibold">
              Refus — décision définitive pour cette année
            </div>
            <div className="text-red-800">
              Aucune seconde session ne suit : l'unité n'est pas réussie et rien
              n'est à représenter. Tous ses cours restent sans note.
            </div>
            <div className="pl-2 text-red-800">
              {(cours || []).map(c => (
                <span key={c.cours_code} className="mr-3">
                  <span className="font-mono font-semibold">{c.cours_code}</span>
                  <span className="ml-1 opacity-70">NA</span>
                </span>
              ))}
            </div>
            <div className="text-red-800">
              Chaque acquis non maîtrisé doit être justifié : c'est ce que reprend
              l'annexe 9, avec la base légale et les voies de recours.
            </div>
          </div>
        )}

        {ue.na && decision !== 'refuse' && (
          <div className="text-second text-slate-700 bg-slate-50 border border-slate-200
                          rounded-lg px-2.5 py-1.5 space-y-1">
            <div className="font-semibold">Ajournement — à représenter :</div>
            {detail.length ? detail.map(c => (
              <div key={c.cours_code} className="pl-2">
                <span className="font-mono font-semibold">{c.cours_code}</span>
                {c.cours_nom ? ` · ${c.cours_nom}` : ''}
                {c.professeurs ? (
                  <span className="italic text-iip-blue/70"> ({c.professeurs})</span>
                ) : null}
                {c.aas?.length ? (
                  <span className="text-slate-500"> — acquis {c.aas.join(', ')}</span>
                ) : null}
              </div>
            )) : (
              <div className="pl-2 text-slate-500">
                Acquis ajournés : {(acquis || []).filter(a => a.na)
                  .map(a => a.aa_code).join(', ') || '—'}
              </div>
            )}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}

/* ═══ La vue d'ensemble ════════════════════════════════════════════════════ */

/* LE TABLEAU SE LIT D'UN REGARD, ET LA COULEUR NE DIT QUE LE DÉFAUT (Charles,
   3 octobre 2026 : « super laid, il faut revoir »). Cases pleines, cases
   cerclées de rouge, trois tons d'en-tête : la grille criait partout. Règle
   des couleurs du 29 septembre : une note juste reste à l'encre ; ce qui est
   en défaut est une PASTILLE PLEINE fraise, la faveur une pastille violette ;
   la note d'unité porte la pastille de son état. Trois groupes de colonnes
   nommés au-dessus — acquis (ce qui fait foi), cours (indicatif), unité. */
function VueTableau({ data, liste, onOuvrir, session = 1 }) {
  // En seconde session, les acquis seuls : les colonnes de cours sortent du tableau.
  const sansCours = Number(session) >= 2 && !((liste || [])[0]?.ue?.regarde?.cours ?? true);
  const colonnesCours = sansCours ? [] : (data.colonnes_cours || []);
  const nA = data.colonnes_acquis.length, nC = colonnesCours.length;
  /* LA SYNTHÈSE DES DÉCISIONS (Charles, 9 octobre 2026) : le même tableau, mais
     chaque case dit ce qui est décidé — ↻ ajourné, R refusé, la cote si réussi,
     le cadeau si octroyé —, pour chaque acquis, chaque cours et l'unité. Une
     décision seulement PROPOSÉE (pas encore enregistrée) se dessine en pâle. */
  const [vue, setVue] = useState('notes');
  return (
    <div className="space-y-2">
    <div className="flex items-center gap-2 text-second text-slate-600">
      <span>Afficher :</span>
      <div className="segments">
        {[['notes', 'les notes'], ['decisions', 'la synthèse des décisions']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVue(k)}
            className={vue === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
      </div>
      {vue === 'decisions' && (
        <span className="text-xs text-slate-500 inline-flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1"><IconRepeat size={12} style={{ color: 'var(--c-attente)' }} /> ajourné</span>
          <span><b style={{ color: 'var(--c-refuse)' }}>R</b> refusé</span>
          <span className="inline-flex items-center gap-1"><IconGift size={12} style={{ color: 'var(--c-faveur)' }} /> faveur</span>
          <span>la cote : réussi</span>
          <span className="opacity-60">pâle : proposé, pas encore décidé</span>
        </span>)}
    </div>
    <div className="overflow-auto border border-slate-200 rounded-carte bg-white">
      <table className="text-second border-collapse w-max min-w-full">
        <thead className="sticky top-0 z-10">
          <tr className="tab-entete text-mention uppercase tracking-[.1em] text-slate-500">
            <th rowSpan={2} className="tab-entete sticky left-0 z-20 text-left px-3 py-2 align-bottom
                           border-b border-r border-slate-200 min-w-[200px] normal-case tracking-normal text-second text-iip-blue">Étudiant</th>
            {nA > 0 && <th colSpan={nA} className="tab-entete px-2 pt-1.5 font-semibold border-b border-slate-200">Acquis d'apprentissage</th>}
            {nC > 0 && <th colSpan={nC} className="tab-entete px-2 pt-1.5 font-semibold border-b border-l border-slate-200">Cours · indicatif</th>}
            <th rowSpan={2} className="tab-entete px-2 py-2 align-bottom border-b border-l border-slate-200 w-16 text-xs text-iip-blue normal-case tracking-normal">Unité</th>
          </tr>
          <tr className="tab-entete">
            {data.colonnes_acquis.map(a => (
              <th key={a.aa_code} title={a.description || ''}
                className="tab-entete px-1 py-1.5 border-b border-slate-200 min-w-[52px] text-mention
                           font-semibold text-iip-blue">{a.aa_code}</th>
            ))}
            {colonnesCours.map((c, k) => (
              <th key={c.cours_code}
                title={[c.cours_nom, c.professeurs].filter(Boolean).join(' · ')}
                className={`tab-entete px-1.5 py-1.5 border-b border-slate-200 min-w-[72px] max-w-[110px]
                           text-mention font-semibold text-slate-600 ${k === 0 ? 'border-l' : ''}`}>
                <div>{c.cours_code}</div>
                {c.cours_nom && (
                  <div className="font-normal text-mention text-slate-500 leading-tight truncate">{c.cours_nom}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(vue === 'decisions'
            // La synthèse montre TOUT LE MONDE, décidés compris, par ordre alphabétique.
            ? [...(data.etudiants || [])].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
            : liste).map(e => {
            const parAA = Object.fromEntries((e.acquis || []).map(a => [a.aa_code, a]));
            const parCo = Object.fromEntries((e.cours || []).map(c => [c.cours_code, c]));
            const ue = e.ue || {};
            /* L'UNITÉ DIT LA DÉCISION, PAS LA MOYENNE (Charles, 9 octobre 2026). Une
               moyenne de 15 avec un acquis à 2 n'est pas une réussite : la pastille
               verte se lisait « réussi » au Conseil. Elle prend la couleur de ce que
               le calcul propose — ocre ajourné, brique refusé — et garde le chiffre. */
            const proposee = e.resultat || ue.decision_proposee;
            const teinteUE = ue.faveur ? 'var(--c-faveur)'
              : proposee === 'refuse' ? 'var(--c-refuse)'
              : proposee === 'ajourne' || ue.na ? 'var(--c-attente)'
              : ue.echec ? 'var(--c-refuse)' : ue.note != null ? 'var(--c-reussi)' : null;
            return (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="sticky left-0 bg-white px-3 py-1.5 border-b border-r border-slate-100">
                  <button onClick={() => onOuvrir(e)} className="text-left w-full truncate hover:underline">
                    <span className="font-semibold text-iip-blue">{String(e.nom || '').toUpperCase()}</span>
                    {' '}<span className="text-slate-600">{e.prenom}</span>
                  </button>
                </td>
                {vue === 'decisions' ? <>
                  {data.colonnes_acquis.map(a => <CaseDecision key={a.aa_code} etat={parAA[a.aa_code]} decision={proposee} decide={!!e.resultat} />)}
                  {colonnesCours.map((c, k) => (
                    <CaseDecision key={c.cours_code} etat={parCo[c.cours_code]} decision={proposee} decide={!!e.resultat} premier={k === 0} />))}
                  <CaseDecision etat={{ ...ue, unite: true }} decision={proposee} decide={!!e.resultat} premier unite />
                </> : <>
                {data.colonnes_acquis.map(a => <Case key={a.aa_code} etat={parAA[a.aa_code]} decide={!!e.resultat} />)}
                {colonnesCours.map((c, k) => (
                  <Case key={c.cours_code} etat={parCo[c.cours_code]} cours premier={k === 0} decide={!!e.resultat} />
                ))}
                <td className="border-b border-l border-slate-200 px-2 text-center">
                  {teinteUE
                    ? <span className="inline-flex items-center justify-center min-w-[30px] h-[22px] px-1.5 rounded-full
                                       text-white font-bold text-xs tabular-nums" style={{ background: teinteUE }}>
                        {ue.na ? (ue.note_calculee != null && !e.resultat
                          ? <>{fmt(ue.note_calculee)}<span className="ml-0.5 text-mention font-normal">NA</span></> : 'NA') : fmt(ue.note)}
                      </span>
                    /* SANS NOTE, LA DÉCISION SE LIT QUAND MÊME (Charles, 5 octobre
                       2026 : « pourquoi ces étudiants ne sont pas refusés ? »). Neuf
                       étudiants de l'UE 305, sans aucune note, étaient bien refusés
                       en base ; la colonne ne montrait que la note, donc rien. */
                    : DECISION_TABLEAU[e.resultat]
                      ? <span className="inline-flex items-center justify-center h-[22px] px-2 rounded-full text-white font-bold text-xs"
                          style={{ background: DECISION_TABLEAU[e.resultat].c }} title="Décision du Conseil, sans note d'unité">
                          {DECISION_TABLEAU[e.resultat].l}
                        </span>
                      : <span className="text-slate-300">·</span>}
                </td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

/** Une case de la synthèse : ce qui est décidé pour cet acquis, ce cours ou l'unité. */
function CaseDecision({ etat, decision, decide, premier = false, unite = false }) {
  const bord = `border-b border-slate-100 ${premier ? 'border-l border-l-slate-200' : ''}`;
  if (!etat) return <td className={`${bord} text-center text-slate-300`}>·</td>;
  const pale = decide ? '' : 'opacity-50';
  const pastille = (fond, contenu, titre) => (
    <span title={titre} className={`inline-flex items-center justify-center gap-0.5 min-w-[26px] h-[20px] px-1.5 rounded-full
      text-white font-bold text-xs ${pale}`} style={{ background: fond }}>{contenu}</span>);
  const n = etat.note_calculee ?? etat.note;
  const enEchec = unite
    ? (decision === 'ajourne' || decision === 'refuse')
    : !etat.faveur && (etat.na || etat.echec || ['PP', 'NP', 'CM'].includes(etat.mention) || (n != null && n < 10));
  let contenu;
  if (etat.faveur) contenu = pastille('var(--c-faveur)', <><IconGift size={11} /> 10</>, 'Octroyé par le Conseil');
  else if (enEchec && decision === 'refuse') contenu = pastille('var(--c-refuse)', 'R', 'Refusé');
  else if (enEchec) contenu = pastille('var(--c-attente)', <IconRepeat size={12} />, 'Ajourné — à représenter');
  else if (unite && decision === 'absent') contenu = <span className={`text-xs text-slate-500 ${pale}`}>Abs.</span>;
  else if (n == null) contenu = <span className="text-slate-300">—</span>;
  else contenu = <span className={`tabular-nums text-xs font-semibold ${unite ? '' : 'text-iip-texte'} ${pale}`}
    style={unite ? { color: 'var(--c-reussi)' } : undefined}>{fmt(n)}</span>;
  return <td className={`${bord} ${unite ? 'border-l border-slate-200 px-2' : 'px-1'} py-1 text-center`}>{contenu}</td>;
}

const DECISION_TABLEAU = {
  refuse: { l: 'Refusé', c: 'var(--c-refuse)' },
  ajourne: { l: 'Ajourné', c: 'var(--c-attente)' },
  reussi: { l: 'Réussi', c: 'var(--c-reussi)' },
  absent: { l: 'Absent', c: '#94A3B8' },
};
function Case({ etat, cours, premier, decide = false }) {
  const bord = `border-b border-slate-100 ${premier ? 'border-l border-l-slate-200' : ''}`;
  if (!etat) return <td className={`${bord} text-center text-slate-300`}>·</td>;
  const enDefaut = !etat.faveur && !etat.na && etat.echec;
  const pastille = etat.faveur ? 'var(--c-faveur)' : enDefaut ? 'var(--c-refuse)' : null;
  // Le NA garde la cote qu'il valait, comme dans la fiche.
  const brute = etat.note_brute ?? null;
  const texte = etat.na ? (brute != null && !decide
      ? <>{fmt(brute)}<span className="ml-0.5 text-mention font-normal">NA</span></> : 'NA')
    : etat.note == null ? '—' : fmt(etat.note);
  return (
    <td className={`${bord} px-1 py-1 text-center tabular-nums`}>
      {pastille
        ? <span className="inline-flex items-center justify-center min-w-[26px] h-[20px] px-1 rounded-full
                           text-white font-bold text-xs" style={{ background: pastille }}>{texte}</span>
        : <span className={`text-xs ${etat.na ? 'text-slate-400' : cours ? 'text-slate-600' : 'font-semibold text-iip-texte'}`}>{texte}</span>}
    </td>
  );
}

/* ═══ L'AJOURNEMENT EN PAQUET ══════════════════════════════════════════════
 *
 * Ce que le Conseil fait vraiment après les réussites de plein droit : il
 * regarde la liste de ceux qui restent, y voit un bloc d'évidences — les
 * absents, les zéros —, et les ajourne d'un même mouvement, pour un même
 * motif. La revue un par un garde son sens pour les cas qui se discutent ;
 * elle n'en avait aucun pour ceux-là, et c'est en la subissant qu'on se
 * trompe de ligne.
 *
 * DEUX GARDE-FOUS. La justification est commune, mais les ACQUIS ajournés ne
 * le sont pas : le serveur prend, pour chaque étudiant, ceux qui sont
 * réellement en défaut — deux étudiants n'échouent pas aux mêmes. Et l'on
 * voit le compte avant d'écrire.
 */
function VueLot({ liste, onAjourner, onOuvrir, enCours, session = 1 }) {
  // En seconde session, « ajourné » n'existe pas : le lot refuse.
  const verbe = session >= 2 ? 'Refuser' : 'Ajourner';
  const [choisis, setChoisis] = useState(() => new Set());
  const [motif, setMotif] = useState('');
  const [apercu, setApercu] = useState(null);
  // ON AJOURNE PAR COURS. Le Conseil ne raisonne pas en acquis : il regarde
  // les cours, décide que celui-ci est à repasser et pas celui-là. Il faut
  // donc les VOIR, et pouvoir en écarter un — d'où, par étudiant, la liste
  // de ses cours en défaut, tous retenus par défaut.
  const [ecartes, setEcartes] = useState({});   // { [id]: Set(cours_code) }
  const [mode, setMode] = useState('tous');       // 'tous' | 'echec'

  const enDefaut = e => (e.cours || [])
    .filter(c => !c.faveur && (c.na || ['PP', 'NP', 'CM'].includes(c.mention) || (c.note != null && c.note < 10)));

  const retenus = e => enDefaut(e).map(c => c.cours_code)
    .filter(c => !(ecartes[e.id] || new Set()).has(c));

  const basculeCours = (id, code) => setEcartes(m => {
    const s0 = new Set(m[id] || []);
    s0.has(code) ? s0.delete(code) : s0.add(code);
    return { ...m, [id]: s0 };
  });

  const bascule = id => setChoisis(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Les filtres qui font gagner du temps : ce sont EUX qu'on cherche, pas
  // vingt cases à cocher à la main.
  const zero = e => (e.ue?.note ?? null) === 0 || e.ue?.na;
  const sous = (s) => liste.filter(e => !e.ue?.na && (e.ue?.note ?? 99) < s).map(e => e.id);
  const poser = ids => setChoisis(new Set(ids));

  const ids = [...choisis];
  const parCours = Object.fromEntries(ids.map(id => {
    const e = liste.find(x => x.id === id);
    return [id, e ? retenus(e) : []];
  }));
  const nbCours = Object.values(parCours).reduce((n, l) => n + l.length, 0);
  const pret = ids.length > 0 && motif.trim().length >= 5;

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500">
        <div className="text-sm font-semibold text-amber-900">{verbe} un paquet</div>
        <p className="text-second text-amber-800">
          On ajourne <b>par cours</b> : cochez les étudiants, et décochez au besoin l'un
          de leurs cours. Les acquis suivent leur cours. La justification, elle, est
          commune. Ce qu'une faveur a levé reste levé.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-second">
        <span className="text-slate-500">Sélection rapide :</span>
        <button onClick={() => poser(liste.filter(zero).map(e => e.id))}
          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600">
          À zéro ou non évalués ({liste.filter(zero).length})
        </button>
        <button onClick={() => poser(sous(5))}
          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600">
          Sous 5/20 ({sous(5).length})
        </button>
        <button onClick={() => poser(sous(10))}
          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600">
          Sous 10/20 ({sous(10).length})
        </button>
        <button onClick={() => setChoisis(new Set())}
          className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500">
          Tout décocher
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100
                      max-h-[46vh] overflow-y-auto">
        {liste.map(e => {
          const defauts = enDefaut(e);
          const pris = choisis.has(e.id);
          return (
            <div key={e.id} className={`px-3 py-1.5 ${pris ? 'bg-amber-50/50 border-l-4 border-l-amber-500' : ''}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={pris} onChange={() => bascule(e.id)}
                  className="w-4 h-4 accent-amber-600 flex-none" />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-iip-blue">{e.nom}</span>
                  <span className="text-sm text-slate-600"> {e.prenom}</span>
                </span>
                <span className={`text-second font-bold tabular-nums w-12 text-right
                  ${e.ue?.na ? 'text-slate-500'
                    : (e.ue?.note ?? 0) < 10 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {e.ue?.na ? 'NA' : fmt(e.ue?.note)}
                </span>
                <button onClick={ev => { ev.preventDefault(); onOuvrir(e); }}
                  className="text-xs text-slate-400 hover:text-iip-blue">fiche</button>
              </label>

              {/* LE DÉTAIL, SANS OUVRIR LA FICHE : les cours en défaut, avec
                  leur note. Chacun se décoche — c'est le cours qu'on
                  représente, et les acquis suivent le leur. */}
              {pris && (
                <div className="pl-7 pt-1 pb-0.5 flex flex-wrap gap-1.5">
                  {!defauts.length && (
                    <span className="text-xs text-slate-400">
                      Aucun cours sous le seuil — rien ne sera ajourné pour lui.
                    </span>
                  )}
                  {defauts.map(c => {
                    const off = (ecartes[e.id] || new Set()).has(c.cours_code);
                    return (
                      <button key={c.cours_code}
                        onClick={() => basculeCours(e.id, c.cours_code)}
                        title={[c.cours_nom || c.cours_code, c.professeurs]
                          .filter(Boolean).join(' · ')}
                        className={`px-2 py-0.5 rounded-champ border text-xs font-semibold
                          ${off ? 'border-slate-300 text-slate-400 line-through'
                                : 'border-amber-500 bg-amber-500 text-white'}`}>
                        {c.cours_code} · {c.mention || (c.na ? 'NA' : fmt(c.note))}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* LA QUESTION DU CONSEIL, POSÉE UNE FOIS POUR LE LOT (Charles, 9 octobre
          2026) : un cours ajourné se représente-t-il entier, ou pour ses seuls
          acquis en échec ? */}
      <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
        <span>Dans un cours ajourné, l'étudiant représente :</span>
        <div className="segments">
          {[['tous', 'tous les acquis du cours'], ['echec', 'seulement les acquis en échec']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>
          ))}
        </div>
      </div>

      <label className="block text-second text-slate-600">
        Justification commune — elle sera portée sur chaque acquis ajourné, et
        c'est elle que reprendra l'annexe 8
        <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2}
          placeholder="Ne s'est pas présenté aux évaluations de l'unité."
          className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
      </label>

      {apercu && (
        <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
          <b>{apercu.traites}</b> étudiant(s) · <b>{apercu.acquis}</b> acquis
          et <b>{apercu.cours}</b> cours seront ajournés, avec la même justification.
          <div className="mt-1 text-second text-slate-500">
            {apercu.details.slice(0, 8).map(d =>
              `${d.nom} (${d.acquis} acquis)`).join(' · ')}
            {apercu.details.length > 8 && ` … et ${apercu.details.length - 8} autre(s)`}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-second text-slate-500">
          <b className="text-amber-800">{ids.length}</b> sélectionné(s) ·
          {' '}<b className="text-amber-800">{nbCours}</b> cours à représenter
          {ids.length > 0 && motif.trim().length < 5 && ' — la justification est requise'}
        </span>
        <div className="flex gap-2">
          <button disabled={!pret || enCours}
            onClick={async () => setApercu(await onAjourner(ids, motif.trim(), true, parCours, null, mode))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300
                       text-slate-600 disabled:opacity-40">
            Simuler
          </button>
          <button disabled={!pret || enCours}
            onClick={async () => {
              const j = await onAjourner(ids, motif.trim(), false, parCours, null, mode);
              if (j) { setApercu(null); setChoisis(new Set()); }
            }}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white
                       font-semibold disabled:opacity-40">
            {enCours ? 'Enregistrement…' : `${verbe} ${ids.length || ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Rouvrir une séance close, depuis n'importe où ═══════════════════════ */

/** Un champ de la correction administrative. Défini ICI, et non dans le rendu :
 *  un composant recréé à chaque frappe se démonte, et le curseur part avec. */
function Ligne({ label, type = 'text', valeur, onChange, disabled }) {
  return (
    <label className={`text-second ${disabled ? 'text-slate-400' : 'text-slate-600'}`}>
      {label}
      <input type={type} value={valeur} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-sm
                   disabled:bg-slate-100 disabled:text-slate-400" />
    </label>
  );
}

/**
 * CORRIGER LES MENTIONS ADMINISTRATIVES D'UNE SÉANCE CLOSE.
 *
 * Date, heure, visite des copies, présidence, membres. Rien d'autre : les
 * décisions, les notes et les résultats ne passent pas par ici. La séance
 * reste close, un motif écrit est exigé, et l'avant/après est conservé.
 */
export function CorrectionAdministrative({ ueNum, annee, session, org = 0, seance, onFerme, onFait,
                                    onRouvrir, enCours: rouvertureEnCours }) {
  const s = seance?.seance || {};
  /* DEUX GESTES, UN SEUL ÉCRAN. Corriger et rouvrir répondent à la même
     question — « quelque chose ne va pas dans cette séance close » — et on ne
     sait souvent lequel des deux s'impose qu'une fois les champs sous les yeux.
     Les séparer obligeait à fermer, retrouver le bandeau, rechoisir un motif et
     le retaper : trois minutes à chaque fois, pour un geste d'une seconde.
     Ici, on bascule d'un onglet, et le motif déjà choisi suit. */
  const [mode, setMode] = useState('corriger');
  const [champs, setChamps] = useState({
    date_seance: s.date_seance || '', heure_seance: s.heure_seance || '',
    visite_date: s.visite_date || '', visite_heure: s.visite_heure || '',
    visite_local: s.visite_local || '',
    visite_mention: s.visite_mention || '',
    president_nom: s.president_nom || '', president_titre: s.president_titre || '',
  });
  const [membres, setMembres] = useState(() => (seance?.membres || []).map(m => ({ ...m })));
  // Le motif se CHOISIT, ici comme pour la réouverture : à vingt heures un soir
  // de délibération, un champ libre récolte « erreur », et un an plus tard le
  // dossier ne dit plus rien. La liste change avec le mode, la précision suit.
  const [cle, setCle] = useState('');
  const [precision, setPrecision] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const motifs = mode === 'corriger' ? MOTIFS_CORRECTION : MOTIFS_REOUVERTURE;
  const motif = motifChoisi(cle, precision, motifs);
  const motifOk = motifComplet(cle, precision);
  // Changer d'onglet ne garde que ce qui a un sens dans l'autre liste.
  const changerMode = (m) => {
    setMode(m);
    const liste = m === 'corriger' ? MOTIFS_CORRECTION : MOTIFS_REOUVERTURE;
    setCle(c => (liste.some(x => x.cle === c) ? c : ''));
  };

  async function envoyer() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/seance/administratif`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, session, org: org ?? 0, motif, ...champs, membres }),
      });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.detail || j.error || 'Correction refusée.');
      onFait();
      onFerme();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  // UN COMPOSANT DÉFINI DANS LE RENDU EST UN COMPOSANT NEUF À CHAQUE FRAPPE :
  // React démonte l'ancien, monte le nouveau, et le champ perd le curseur à la
  // première lettre. `Ligne` vivait ici ; elle vit désormais hors du rendu.
  const ligne = (cle, label, type = 'text', off = false) => (
    <Ligne cle={cle} label={label} type={type} disabled={off}
      valeur={champs[cle]}
      onChange={v => setChamps(c => ({ ...c, [cle]: v }))} />
  );

  // LA MENTION EST UN MODE, PAS UN TEXTE À RETAPER. La case dit ce qui change ;
  // le texte reste ajustable en dessous, mais personne n'a à le connaître pour
  // l'employer.
  const surDemande = !!champs.visite_mention.trim();
  const basculer = (coche) => setChamps(c => ({
    ...c, visite_mention: coche ? (c.visite_mention.trim() || MENTION_VISITE) : '',
  }));

  return (
    <Fenetre titre="Reprendre une séance close" large="moyenne" onFermer={onFerme}
      pied={<>
        <span />
        <button onClick={onFerme} className="bouton">
          Annuler
        </button>
        {mode === 'corriger' ? (
          <button onClick={envoyer} disabled={enCours || !motifOk} className="bouton bouton-fort">
            {enCours ? 'Enregistrement…' : 'Corriger'}
          </button>
        ) : (
          <button disabled={rouvertureEnCours || !motifOk}
            onClick={() => { onRouvrir(motif); onFerme(); }}
            className="bouton bouton-fort">
            {rouvertureEnCours ? 'Réouverture…' : 'Rouvrir la séance'}
          </button>
        )}
      </>}>
      <div className="space-y-3">
        <div>
          <div className="flex gap-4 mt-2 border-b border-slate-200">
            {[['corriger', 'Corriger l’administratif'],
              ['rouvrir', 'Rouvrir la séance']].map(([m, lib]) => (
              <button key={m} onClick={() => changerMode(m)}
                className={mode === m ? 'onglet-page-actif' : 'onglet-page'}>
                {lib}
              </button>
            ))}
          </div>
          <p className="text-second text-slate-600 mt-2">
            {mode === 'corriger'
              ? 'La séance reste close. Dates, visite des copies, présidence et '
                + 'présences se corrigent ici ; les décisions, les notes et les '
                + 'résultats ne sont pas touchés.'
              : 'Rien n’est effacé : décisions, notes, présences et dates restent. '
                + 'La séance redevient modifiable, et devra être close à nouveau.'}
            {' '}La reprise est conservée avec son motif, son auteur et son horodatage.
          </p>
        </div>

        {mode === 'corriger' && (<>
        <div className="grid grid-cols-2 gap-2">
          {ligne('date_seance', 'Date de la séance', 'date')}
          {ligne('heure_seance', 'Heure', 'time')}
          {ligne('president_nom', 'Président de la séance (si désigné)')}
          {ligne('president_titre', 'Titre porté au procès-verbal')}
        </div>

        {/* LA VISITE DES COPIES : UNE FORME OU L'AUTRE, ET LA CASE LE DIT.
            C'est ici — et nulle part ailleurs — que la forme se décide : la
            clôture prend la séance telle qu'elle est, la corriger se motive et
            s'horodate. Les trois champs restent visibles mais grisés quand la
            mention s'applique : on voit ce qui est remplacé. */}
        <div className="border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-second font-semibold text-iip-blue">Visite des copies</div>
          <div className="grid grid-cols-2 gap-2">
            {ligne('visite_date', 'Date', 'date', surDemande)}
            {ligne('visite_heure', 'Heure', 'time', surDemande)}
            {ligne('visite_local', 'Local', 'text', surDemande)}
          </div>
          <label className="flex items-start gap-2 text-second text-slate-700">
            <input type="checkbox" checked={surDemande} className="mt-0.5"
              onChange={e => basculer(e.target.checked)} />
            <span>
              Aucune plage organisée — les modalités sont communiquées sur demande
              <span className="block text-xs text-slate-500">
                La mention ci-dessous remplace la date, l'heure et le local sur la
                notification remise à l'étudiant et au procès-verbal.
              </span>
            </span>
          </label>
          {surDemande && (
            <textarea rows={2} value={champs.visite_mention}
              onChange={e => setChamps(c => ({ ...c, visite_mention: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          )}
        </div>

        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {membres.map((m, i) => (
            <div key={m.cle} className="flex items-center gap-2 px-2.5 py-1.5">
              <input type="checkbox" checked={!!m.present}
                onChange={e => setMembres(l => l.map((x, k) =>
                  k === i ? { ...x, present: e.target.checked } : x))}
                className="w-4 h-4 accent-iip-blue flex-none" />
              <span className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{m.nom}</span>
                <span className="block text-xs text-slate-500 truncate">{m.qualite}</span>
              </span>
              {m.voix === 'consultative' && (
                <span className="text-mention px-2 py-0.5 rounded-champ bg-sky-50
                                 text-sky-800 border border-sky-200 flex-none">
                  consultative
                </span>
              )}
              {m.role === 'ajoute' && (
                <button onClick={() => setMembres(l => l.filter((_, k) => k !== i))}
                  className="flex-none text-xs text-red-700 border border-red-200
                             rounded px-1.5 py-0.5">
                  retirer
                </button>
              )}
            </div>
          ))}
        </div>
        </>)}

        <div className="pt-1">
          <div className="text-second font-semibold text-slate-700 mb-1">
            Motif — il figurera au dossier
          </div>
          <ChoixMotif motifs={motifs} valeur={cle} precision={precision}
            onValeur={setCle} onPrecision={setPrecision} />
        </div>

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm border-l-4 border-l-red-500">{erreur}</div>
        )}
      </div>
    </Fenetre>
  );
}

/**
 * POURQUOI ON ROUVRE : ON CHOISIT, ON N'ÉCRIT PAS.
 *
 * Le motif était un champ libre, exigé de cinq caractères. À vingt heures, un
 * soir de délibération, on y tape « erreur » — et un an plus tard, devant un
 * recours, le dossier porte « erreur » là où il faudrait pouvoir dire de quoi
 * il s'agissait. Un motif écrit à la hâte se défend aussi mal qu'un motif
 * absent.
 *
 * Les raisons de rouvrir une séance sont connues et peu nombreuses : elles se
 * choisissent d'un clic, dans les termes du règlement. La précision libre
 * reste possible — elle s'ajoute au motif, elle ne le remplace pas — et n'est
 * obligatoire que pour « autre motif », qui est justement celui qu'on ne peut
 * pas deviner.
 */
export const MOTIFS_REOUVERTURE = [
  { cle: 'encodage',   label: "Erreur d'encodage d'une note" },
  { cle: 'decision',   label: "Correction d'une décision du Conseil" },
  { cle: 'note_tard',  label: 'Note manquante ou parvenue après la séance' },
  { cle: 'piece',      label: 'Pièce justificative reçue après la séance' },
  { cle: 'recours',    label: 'Recours interne accueilli' },
  { cle: 'oubli',      label: 'Étudiant omis de la liste délibérée' },
  { cle: 'pv',         label: 'Erreur matérielle au procès-verbal' },
  { cle: 'procedure',  label: 'Vice de procédure constaté (quorum, présidence)' },
  { cle: 'autre',      label: 'Autre motif' },
];

/** Les raisons de CORRIGER, distinctes de celles de rouvrir : aucune d'elles ne
 *  rejuge un étudiant, et c'est exactement ce qui les rend admissibles sur une
 *  séance close. */
export const MOTIFS_CORRECTION = [
  { cle: 'date',       label: 'Date ou heure de séance mal encodée' },
  { cle: 'visite',     label: 'Modalités de visite des copies à préciser' },
  { cle: 'presidence', label: 'Présidence ou titre à corriger' },
  { cle: 'presence',   label: 'Membre présent omis ou en trop' },
  { cle: 'pv',         label: 'Erreur matérielle au procès-verbal' },
  { cle: 'autre',      label: 'Autre motif' },
];

function ChoixMotif({ valeur, precision, onValeur, onPrecision,
                      motifs = MOTIFS_REOUVERTURE }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {motifs.map(m => (
          <button key={m.cle} onClick={() => onValeur(m.cle)}
            className={`px-2.5 py-1 text-second rounded-champ border transition-colors
              ${valeur === m.cle
                ? 'border-amber-500 bg-amber-500 text-white font-semibold'
                : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <input value={precision} onChange={e => onPrecision(e.target.value)}
        placeholder={valeur === 'autre'
          ? 'Précisez le motif — il figurera au dossier'
          : 'Précision (facultative) : référence de la pièce, nom de l\u2019étudiant…'}
        className="w-full bg-white border border-slate-300 rounded-champ px-2 h-9 text-sm" />
    </div>
  );
}

/** Le motif tel qu'il sera conservé : le libellé réglementaire, puis la précision. */
export function motifChoisi(cle, precision, motifs = MOTIFS_REOUVERTURE) {
  const m = motifs.find(x => x.cle === cle);
  if (!m) return '';
  const p = (precision || '').trim();
  return p ? `${m.label} — ${p}` : m.label;
}

/** Peut-on confirmer ? « Autre motif » exige sa précision, les autres non. */
export function motifComplet(cle, precision) {
  if (!cle) return false;
  return cle !== 'autre' || (precision || '').trim().length >= 5;
}

/* Les noms d'avant restent : d'autres écrans importent ceux-là. */
export const motifReouverture = motifChoisi;
export const motifReouvertureComplet = motifComplet;

export function BandeauReouverture({ session, onReprendre }) {
  /* UNE LIGNE, PAS UN PANNEAU (Charles, 27 septembre 2026 : « beaucoup de
     place perdue, il faut faire plus petit »). L'état se dit en quelques mots,
     le bouton reste à droite, compact. */
  return (
    <div data-etat="neutre" className="bloc-etat px-3 py-1 flex items-center justify-between gap-3 text-second">
      <span className="text-slate-700 min-w-0 truncate">
        <b>Séance close</b> · {session === 2 ? 'seconde' : 'première'} session — décisions figées
      </span>
      {/* UN SEUL BOUTON, PARCE QU'ON NE SAIT PAS ENCORE LEQUEL DES DEUX.
          Corriger et rouvrir répondent à la même question, et laquelle
          s'impose ne se voit qu'une fois les champs sous les yeux. Les deux
          gestes sont deux onglets d'un même écran, et le motif les traverse. */}
      <button onClick={onReprendre} className="bouton bouton-compact flex-none">
        Corriger ou rouvrir…
      </button>
    </div>
  );
}
