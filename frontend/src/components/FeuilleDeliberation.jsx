import { useEffect, useMemo, useState } from 'react';
import {
  IconX, IconSearch, IconAlertTriangle, IconChevronLeft, IconChevronRight,
  IconArrowUp, IconRepeat, IconList, IconFileText, IconMessage, IconBrush,
  IconRotate, IconBan,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import TableauBordEtudiant from './TableauBordEtudiant.jsx';
import { MOTIFS_ECHEC, composerMotif, decomposerMotif, texteDuMotif } from './motifsEchec.js';
import CentreDocumentsUE from './CentreDocumentsUE.jsx';

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
  for (const c of cours) if (c.na) for (const code of (c.aas || [])) enCause.add(code);
  // Sur un REFUS, l'unité entière est renvoyée : tout acquis non maîtrisé
  // entre dans la motivation, quel que soit le cours qui le portait.
  if (decision === 'refuse') {
    for (const a of acquis) {
      if (!a.faveur && (a.na || (a.note != null && a.note < 10))) enCause.add(a.aa_code);
    }
  }
  return acquis.filter(a => enCause.has(a.aa_code));
}

export default function FeuilleDeliberation({ ueNum, annee, onClose }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [tableau, setTableau] = useState(false);   // la vue d'ensemble
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

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}?annee=${encodeURIComponent(annee)}`
        + (choixSession ? `&session=${choixSession}` : ''),
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
        + `&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setSeance(j);
    } catch { /* la séance est un cadre, pas un bloquant */ }
  }
  // La séance suit la session : présences, date et visite des copies lui
  // appartiennent, et celles de juin ne valent pas pour septembre.
  useEffect(() => { charger(); chargerSeance(); /* eslint-disable-next-line */ },
    [ueNum, annee, choixSession]);

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
    const base = q
      ? data.etudiants.filter(e =>
          `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q))
      : data.etudiants;
    if (ordre) {
      // L'ordre définit AUSSI le périmètre de la revue : ceux qui ont été
      // délibérés d'office n'y sont plus. Les repasser en revue ne leur
      // ajoutait rien et coûtait un clic par étudiant.
      const pos = Object.fromEntries(ordre.map((id, i) => [id, i]));
      return base.filter(e => pos[e.id] !== undefined)
        .sort((a, b) => pos[a.id] - pos[b.id]);
    }
    return [...base].sort((a, b) => {
      const d = rang(b) - rang(a);
      return d || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
    });
  }, [data, recherche, ordre]);

  /** Figer l'ordre au moment où la revue commence. */
  function figerOrdre(source) {
    const l = [...(source || data?.etudiants || [])].sort((a, b) => {
      const d = rang(b) - rang(a);
      return d || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
    });
    setOrdre(l.map(e => e.id));
  }

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
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/ajustement/lot', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, session,
          portee, codes, action,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d,
        etudiants: d.etudiants.map(x => x.id === etud.id ? { ...x, ...j } : x) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /** Poser ou retirer un ajustement. Le serveur renvoie l'étudiant recalculé. */
  async function ajuster(portee, code, action) {
    if (!etud) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/ajustement', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum, session,
          portee, code, action,
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
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
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
      // délibérer, on va droit à la clôture.
      setEtape(restants.length ? 'fiche' : 'cloture');
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

  async function enregistrerSeance(champs) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/seance`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, session, ...champs }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return false; }
      await chargerSeance();
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnCours(false); }
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 mt-20 text-[13px] text-slate-500">
          {erreur || 'Chargement…'}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] mt-4
                      max-h-[94vh] overflow-hidden flex flex-col">

        {/* L'en-tête ne défile pas : on doit toujours savoir de qui l'on parle. */}
        <div className="flex-none px-4 py-3 border-b border-slate-100
                        flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-iip-blue truncate">
              UE {data.ue_num} · {data.ue_nom}
              {data.epreuve_integree && (
                <span className="ml-2 align-middle text-[10px] font-bold px-2 py-0.5 rounded-full
                                 bg-violet-100 text-violet-800 border border-violet-200">
                  épreuve intégrée
                </span>
              )}
            </h3>
            <p className="text-[11.5px] text-slate-500">
              {data.section || '—'} · {annee} · {data.etudiants.length} étudiant(s)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={recherche}
                onChange={e => { setRecherche(e.target.value); setIdx(0); }}
                placeholder="Filtrer…"
                className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-36" />
            </div>
            <button onClick={() => setTableau(t => !t)}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-slate-300
                         text-slate-600 flex items-center gap-1.5">
              {tableau ? <><IconFileText size={14} /> Fiche</> : <><IconList size={14} /> Tableau</>}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {data?.etat_sessions?.seconde_attend && (
            <div className="mx-5 mt-3 text-[12px] text-slate-500">
              Toutes les décisions de première session sont encodées. La seconde session
              s'ouvrira à la clôture de la séance : jusque-là, tout se décide en première
              session, et les ajournements restent des ajournements.
            </div>
          )}
          {data?.etat_sessions?.seconde_possible && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-[12px]">
          <span className="text-slate-500">Session délibérée :</span>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {[1, 2].map(n => (
              <button key={n} onClick={() => setChoixSession(n)}
                className={`px-3 py-1 ${session === n
                  ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                {n === 1 ? '1re' : '2e'}
              </button>
            ))}
          </div>
          {session === 1 && (
            <span className="text-slate-500">
              Retour sur la première session — la décision de seconde session, si elle existe,
              reste le résultat final.
            </span>
          )}
        </div>
      )}

      {data?.session === 2 && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                        text-[12px] text-amber-900">
          <b>Seconde session.</b> Seuls les étudiants ajournés en première session sont
          présentés. Les cours qui n'étaient pas à représenter gardent leur note de
          première session ; les autres attendent celle de septembre. La décision prise
          ici s'ajoute à celle de juin, qu'elle ne remplace pas — mais c'est elle qui
          devient le résultat final.
        </div>
      )}
      {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-center gap-2">
              <IconAlertTriangle size={14} /> {erreur}
            </div>
          )}

          {data.sans_structure && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12.5px] text-amber-900">
              Cette unité n'est pas paramétrée : ses acquis ne sont pas rattachés à
              des cours, ou aucun cours n'y est déclaré. Les notes ne peuvent pas se
              consolider tant que ce lien n'existe pas.
            </div>
          )}

          {etape === 'presences' ? (
            <Presences seance={seance} enCours={enCours}
              onValider={(membres, date_seance, heure_seance) => enregistrerSeance({
                membres, date_seance, heure_seance,
              }).then(ok => ok && chargerAuto())} />
          ) : etape === 'auto' ? (
            <PleinDroit auto={auto} enCours={enCours}
              onAppliquer={appliquerAuto}
              onPasser={() => { figerOrdre(); setIdx(0); setEtape('fiche'); }} />
          ) : etape === 'cloture' ? (
            <Cloture seance={seance?.seance} enCours={enCours} nb={liste.length}
              ajournes={(data?.etudiants || []).filter(e => e.resultat === 'ajourne').length}
              onRetour={() => setEtape('fiche')} onPV={() => setDocuments(true)}
              coursSession2={seance?.session2 || []}
              onClore={champs => enregistrerSeance({ ...champs, cloturee: 1 })} />
          ) : !liste.length ? (
            <div className="py-10 text-center text-[12.5px] text-slate-400 border-2
                            border-dashed rounded-xl">
              Aucun étudiant inscrit à cette unité pour {annee}.
            </div>
          ) : tableau ? (
            <VueTableau data={data} liste={liste}
              onOuvrir={e => { setIdx(liste.indexOf(e)); setTableau(false); }} />
          ) : etud ? (
            <>
              {/* Le passage d'un étudiant au suivant : c'est le geste du Conseil. */}
              <div className="flex items-center justify-between gap-3 px-3 py-2
                              rounded-xl bg-slate-50 border border-slate-200">
                <button disabled={idx <= 0 || enCours} onClick={() => enregistrerPuisAvancer(-1)}
                  title="Enregistrer la décision et revenir au précédent"
                  className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-30">
                  <IconChevronLeft size={16} />
                </button>
                <div className="text-center min-w-0">
                  <div className="text-[15px] font-bold text-iip-blue truncate">
                    {etud.nom} {etud.prenom}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {etud.id_ecampus || '—'} · {idx + 1} / {liste.length}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* La raison du blocage, à côté du bouton qu'on presse. */}
                  {!!aMotiver.length && (
                    <button onClick={() => document.getElementById('a-justifier')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      className="text-[11px] text-red-800 bg-red-50 border border-red-300
                                 rounded-lg px-2 py-1 text-right max-w-[280px]">
                      <b>{aMotiver.length} acquis à justifier</b> avant de passer :
                      {' '}{aMotiver.map(a => a.aa_code).join(', ')}
                    </button>
                  )}
                  <button disabled={enCours} onClick={() => enregistrerPuisAvancer(1)}
                    title={aMotiver.length
                      ? `À justifier d'abord : ${aMotiver.map(a => a.aa_code).join(', ')}`
                      : idx >= liste.length - 1
                        ? 'Enregistrer et clore la délibération'
                        : 'Enregistrer la décision et passer au suivant'}
                    className={`px-2.5 py-1.5 rounded-lg border font-semibold text-[12px]
                      flex items-center gap-1 disabled:opacity-30 ${aMotiver.length
                        ? 'border-red-300 text-red-400 cursor-not-allowed'
                        : 'border-iip-blue text-iip-blue'}`}>
                    {idx >= liste.length - 1 ? 'Clore' : 'Suivant'}
                    <IconChevronRight size={16} />
                  </button>
                </div>
              </div>

              <Fiche e={etud} data={data} onAjuster={ajuster} onLot={ajusterLot}
                onMotif={poserMotif}
                enCours={enCours} onBord={() => setBord(etud)}
                decision={decisions[etud.id] || etud.ue?.decision_proposee || null}
                onDecision={d => setDecisions(m => ({ ...m, [etud.id]: d }))}
                onAnnuler={annulerEtudiant} />
            </>
          ) : null}
        </div>
      </div>

      {bord && (
        <TableauBordEtudiant etudId={bord.id} ueNum={data.ue_num} annee={annee}
          onClose={() => setBord(null)} onDecide={charger} />
      )}

      {documents && (
        <CentreDocumentsUE ueNum={data.ue_num} ueNom={data.ue_nom} annee={annee}
          onClose={() => setDocuments(false)} />
      )}
    </div>
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
    <div className={`px-3 py-2 rounded-xl border flex items-center gap-3
      ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
      <span className={`text-[19px] font-bold tabular-nums leading-none flex-none
        ${ok ? 'text-emerald-700' : 'text-amber-800'}`}>
        {presents}/{votants.length}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] font-semibold
          ${ok ? 'text-emerald-900' : 'text-amber-900'}`}>
          {ok ? 'Quorum atteint' : `Quorum non atteint — il en faut ${requis}`}
        </span>
        <span className="block text-[11px] text-slate-600">
          Deux tiers des membres à voix délibérative (RGE art. 25 §1).
          {consultatifs > 0 && ' Les voix consultatives figurent au procès-verbal '
            + 'sans compter au quorum.'}
        </span>
      </span>
    </div>
  );
}

function Presences({ seance, onValider, enCours }) {
  const [membres, setMembres] = useState(null);
  const [ajout, setAjout] = useState('');
  // LA DATE ET L'HEURE DE LA SÉANCE. Elles étaient posées en douce à la
  // clôture — celle du jour, que personne ne pouvait corriger. Le Conseil qui
  // délibère un samedi et clôture le lundi voyait donc le lundi au PV.
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');

  useEffect(() => { if (seance && !membres) setMembres(seance.membres); }, [seance, membres]);
  useEffect(() => {
    if (!seance?.seance) return;
    setDate(d => d || seance.seance.date_seance || new Date().toISOString().slice(0, 10));
    setHeure(h => h || seance.seance.heure_seance
      || new Date().toTimeString().slice(0, 5));
  }, [seance]);

  if (!membres) {
    return <div className="py-10 text-center text-[12.5px] text-slate-400">Chargement du Conseil…</div>;
  }

  const presents = membres.filter(m => m.present).length;
  const ton = { professeur: 'text-slate-700', coordination: 'text-sky-800',
                direction: 'text-iip-blue', ajoute: 'text-slate-600' };

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 rounded-xl bg-iip-blue/5 border border-iip-blue/20">
        <div className="text-[13px] font-semibold text-iip-blue">Conseil des études</div>
        <p className="text-[11.5px] text-slate-600">
          Cochez les présents avant d'ouvrir la délibération. La liste se déduit
          des attributions de l'unité ; elle est donc à jour de l'année en cours.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl p-3 space-y-2">
        <div>
          <div className="text-[13px] font-semibold text-iip-blue">Séance</div>
          <p className="text-[11.5px] text-slate-500">
            Date et heure de la délibération, telles qu'elles figureront au
            procès-verbal. Elles restent modifiables jusqu'à la clôture.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11.5px] text-slate-600">
            Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
          <label className="text-[11.5px] text-slate-600">
            Heure
            <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
        </div>
      </div>

      <QuorumBandeau membres={membres} />

      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
        {membres.map((m, i) => (
          <label key={m.cle}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={!!m.present}
              onChange={e => setMembres(l => l.map((x, k) =>
                k === i ? { ...x, present: e.target.checked } : x))}
              className="w-4 h-4 accent-iip-blue flex-none" />
            <span className="flex-1 min-w-0">
              <span className={`text-[12.5px] font-semibold ${ton[m.role] || 'text-slate-700'}`}>
                {m.nom}
              </span>
              <span className="block text-[11px] text-slate-500 truncate">{m.qualite}</span>
            </span>
            {m.voix === 'consultative' && (
              <span title="Siège avec voix consultative : ne compte pas au quorum"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-none
                           bg-sky-50 text-sky-800 border border-sky-200">
                consultative
              </span>
            )}
            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex-none
              ${m.present ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
              {m.present ? 'présent' : 'excusé'}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input value={ajout} onChange={e => setAjout(e.target.value)}
          placeholder="Ajouter un membre (nom, qualité)…"
          className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[12.5px]" />
        <button disabled={!ajout.trim()}
          onClick={() => {
            setMembres(l => [...l, { cle: `ajout:${Date.now()}`, nom: ajout.trim(),
              qualite: 'Membre invité', role: 'ajoute', present: true }]);
            setAjout('');
          }}
          className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                     text-slate-600 disabled:opacity-40">
          Ajouter
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[12px] text-slate-500">
          <b className="text-iip-blue">{presents}</b> présent(s) sur {membres.length}
        </span>
        <button disabled={enCours || !presents || !date}
          onClick={() => onValider(membres, date, heure)}
          className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white font-semibold
                     disabled:opacity-40">
          Ouvrir la délibération
        </button>
      </div>
    </div>
  );
}

/* ═══ Les réussites de plein droit ═════════════════════════════════════════ */

function PleinDroit({ auto, onAppliquer, onPasser, enCours }) {
  if (!auto) return <div className="py-10 text-center text-[12.5px] text-slate-400">Calcul…</div>;
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="text-[13px] font-semibold text-emerald-900">
          Réussites de plein droit
        </div>
        <p className="text-[11.5px] text-emerald-800">
          Tous les acquis et tous les cours au seuil, sans faveur ni ajournement :
          le Conseil n'a rien à y apprécier. Les enregistrer d'un coup lui laisse
          le temps des cas qui le méritent.
        </p>
      </div>

      {!auto.reussites.length ? (
        <div className="py-6 text-center text-[12.5px] text-slate-500 border-2
                        border-dashed rounded-xl">
          Aucun étudiant ne réussit de plein droit : chaque cas demande une décision.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100
                        max-h-[46vh] overflow-y-auto">
          {auto.reussites.map(r => (
            <div key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-[12.5px]">
              <span className="flex-1 truncate">
                <b className="text-iip-blue">{r.nom}</b> {r.prenom}
              </span>
              {r.deja_decide && <span className="text-[10.5px] text-slate-400">déjà décidé</span>}
              <span className="font-bold tabular-nums text-emerald-700 w-14 text-right">
                {fmt(r.note)}/20
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-slate-500">
          {auto.a_deliberer.length} cas à examiner ensuite
        </span>
        <div className="flex gap-2">
          <button onClick={onPasser}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            Passer — les revoir un à un
          </button>
          <button disabled={enCours || !auto.reussites.length} onClick={onAppliquer}
            className="px-4 py-2 text-[13px] rounded-lg bg-emerald-600 text-white
                       font-semibold disabled:opacity-40">
            Enregistrer ces {auto.reussites.length} réussites
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

function Cloture({ seance, onClore, onRetour, onPV, enCours, nb, ajournes, coursSession2 }) {
  // La séance elle-même : dernière occasion de corriger sa date et son heure,
  // car la clôture les fige au procès-verbal.
  const [dateS, setDateS] = useState(seance?.date_seance || '');
  const [heureS, setHeureS] = useState(seance?.heure_seance || '');
  const [date, setDate] = useState(seance?.visite_date || '');
  const [heure, setHeure] = useState(seance?.visite_heure || '');
  const [local, setLocal] = useState(seance?.visite_local || '');
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
  const complet = date && heure && local.trim() && dateS;

  return (
    <div className="space-y-3 max-w-xl mx-auto py-4">
      <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="text-[14px] font-semibold text-emerald-900">Délibération terminée</div>
        <p className="text-[12px] text-emerald-800">
          Les {nb} étudiant(s) de cette unité ont été délibérés et leurs décisions
          sont enregistrées.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-[13px] font-semibold text-iip-blue">Séance du Conseil</div>
          <p className="text-[11.5px] text-slate-500">
            La clôture fige cette date et cette heure au procès-verbal : c'est
            le dernier moment pour les corriger.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11.5px] text-slate-600">
            Date de délibération
            <input type="date" value={dateS} onChange={e => setDateS(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
          <label className="text-[11.5px] text-slate-600">
            Heure
            <input type="time" value={heureS} onChange={e => setHeureS(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-[13px] font-semibold text-iip-blue">Visite des copies</div>
          <p className="text-[11.5px] text-slate-500">
            L'étudiant a le droit de consulter sa copie. La date, l'heure et le
            local figurent sur la notification qui lui est remise.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11.5px] text-slate-600">
            Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
          <label className="text-[11.5px] text-slate-600">
            Heure
            <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
        </div>
        <label className="text-[11.5px] text-slate-600 block">
          Local
          <input value={local} onChange={e => setLocal(e.target.value)}
            placeholder="Bâtiment P, local 2.14…"
            className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
        </label>
      </div>

      {/* La seconde session, cours par cours, portée par l'annexe 8. */}
      {ajournes > 0 && !!s2.length && (
        <div className="border border-amber-300 bg-amber-50/60 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-amber-900">Seconde session</div>
              <p className="text-[11.5px] text-amber-800">
                {ajournes} étudiant(s) ajourné(s). Chaque cours a sa date : elle
                figure en regard du cours sur la notification (annexe 8).
              </p>
            </div>
            {s2.length > 1 && (
              <button onClick={reporterPartout} disabled={enCours || !s2[0].date}
                title="Reporter la date, l'heure et le local du premier cours sur tous les autres"
                className="flex-none px-2.5 py-1 text-[11.5px] rounded-lg border
                           border-amber-500 text-amber-900 font-semibold disabled:opacity-40">
                Même date pour tous
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {s2.map((c, i) => (
              <div key={c.cours_code} className="flex items-center gap-2">
                <span className="w-32 flex-none min-w-0">
                  <span className="block font-mono text-[11.5px] font-bold text-slate-700">
                    {c.cours_code}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate"
                    title={c.cours_nom || ''}>{c.cours_nom || ''}</span>
                </span>
                <input type="date" value={c.date}
                  onChange={e => majS2(i, 'date', e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-[12px] w-36" />
                <input type="time" value={c.heure}
                  onChange={e => majS2(i, 'heure', e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-[12px] w-24" />
                <input value={c.local} placeholder="local…"
                  onChange={e => majS2(i, 'local', e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-[12px]" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={onRetour}
          className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
          Revenir aux fiches
        </button>
        <div className="flex items-center gap-2">
          {/* Le procès-verbal ne s'imprime qu'une fois la visite fixée : il en
              porte la date, et un PV incomplet devrait être refait. */}
          <button disabled={enCours || !close} onClick={onPV}
            title={close
              ? 'Procès-verbal, attestations de réussite, notifications d’ajournement et de refus'
              : 'Clôturez d’abord : les pièces portent la date de communication'}
            className="px-3 py-2 text-[12.5px] rounded-lg border border-iip-blue
                       text-iip-blue font-semibold disabled:opacity-40
                       flex items-center gap-1.5">
            <IconFileText size={14} /> Générer les documents
          </button>
          <button disabled={enCours || !complet} onClick={() => onClore({
              date_seance: dateS, heure_seance: heureS || null,
              visite_date: date, visite_heure: heure, visite_local: local.trim(),
              session2_cours: s2,
              // La première date sert de repli pour ce qui n'est pas fixé.
              session2_date: s2[0]?.date || null,
              session2_heure: s2[0]?.heure || null,
              session2_local: s2[0]?.local || null })
              .then(ok => ok && setClose(true))}
            title={complet ? '' : 'La date de délibération, et la date, l’heure et le local de visite des copies sont requis'}
            className="px-4 py-2 text-[13px] rounded-lg bg-emerald-600 text-white font-semibold
                       disabled:opacity-40">
            {close ? 'Enregistré' : 'Clore la délibération'}
          </button>
        </div>
      </div>

      {close && (
        <p className="text-[11.5px] text-emerald-800 text-center">
          Séance close. Les documents peuvent être générés, imprimés, puis signés.
        </p>
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

function Fiche({ e, data, onAjuster, onLot, onMotif, enCours, onBord,
  decision, onDecision, onAnnuler }) {
  const ue = e.ue || {};
  const acquis = e.acquis || [];
  const cours = e.cours || [];

  // La note d'un acquis DANS un cours : c'est la case de la matrice.
  const caseDe = (a, coursCode) =>
    (a.evaluations || []).find(v => v.cours_code === coursCode) || null;

  // Les colonnes se resserrent : la matrice n'a plus toute la largeur, le
  // panneau de pilotage occupe la droite.
  const largeurCol = cours.length > 3 ? 'min-w-[58px]' : 'min-w-[72px]';

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="space-y-3 min-w-0">
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="border-collapse text-[12px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left px-3 py-2 border-b border-r
                             border-slate-200 min-w-[200px] text-[11px] font-bold
                             uppercase tracking-wide text-slate-500">
                Acquis d'apprentissage
              </th>
              {cours.map(c => (
                <th key={c.cours_code} title={c.cours_nom || ''}
                  className={`px-1 py-2 border-b border-slate-200 ${largeurCol}`}>
                  <div className="font-mono text-[11px] font-bold text-iip-blue">{c.cours_code}</div>
                  <div className="font-normal text-[9px] text-slate-400 truncate">
                    {c.poids_cours_affiche != null ? `${c.poids_cours_affiche} %` : '—'}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5
                             min-w-[104px] text-[10px] font-bold uppercase text-iip-blue">
                Acquis / UE
              </th>
            </tr>
          </thead>

          <tbody>
            {acquis.map(a => (
              <tr key={a.aa_code}>
                <td className="sticky left-0 bg-white z-10 px-3 py-1.5 border-b border-r
                               border-slate-100">
                  <div className="font-mono text-[11px] font-bold text-slate-600">{a.aa_code}</div>
                  <div className="text-[10.5px] text-slate-500 truncate max-w-[190px]"
                    title={a.description || ''}>{a.description || ''}</div>
                </td>

                {cours.map(c => {
                  const v = caseDe(a, c.cours_code);
                  return (
                    <td key={c.cours_code}
                      className="border-b border-slate-100 px-1 py-1 text-center">
                      {!v ? (
                        <span className="text-slate-300 text-[11px]">·</span>
                      ) : (
                        <div title={v.mention === 'NP'
                            ? 'Note de présence — présent, rien qui vaille un point'
                            : v.mention === 'PP' ? "Pas présenté à l'épreuve" : ''}
                          className={`rounded-lg py-1 text-[13px] font-semibold tabular-nums
                          ${c.na || a.na ? 'bg-slate-100 text-slate-400'
                            : v.mention === 'PP' ? 'bg-red-100 text-red-800'
                            : v.mention === 'NP' ? 'bg-amber-100 text-amber-900'
                            : v.note == null ? 'bg-slate-50 text-slate-300'
                            : v.note < data.seuil ? 'bg-red-50 text-red-700'
                            : 'bg-emerald-50 text-emerald-800'}`}>
                          {c.na || a.na ? 'NA' : (v.mention || fmt(v.note))}
                          {v.poids ? (
                            <span className="block text-[8.5px] font-normal opacity-60">
                              poids {v.poids}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Somme de la ligne : ce que l'acquis vaut pour l'unité. */}
                <td className="border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5 px-1.5 py-1">
                  <TuileSomme etat={a} seuil={data.seuil} enCours={enCours}
                    onAjourner={() => onAjuster('aa', a.aa_code,
                      a.ajourne_directement ? null : 'ajourne')}
                    onFaveur={() => onAjuster('aa', a.aa_code,
                      a.faveur_directe ? null : 'faveur')}
                    motif={a.motif} />
                </td>
              </tr>
            ))}

            {/* Somme des colonnes : ce que vaut chaque cours. */}
            <tr className="bg-slate-50">
              <td className="sticky left-0 bg-slate-50 z-10 px-3 py-2 border-t border-r
                             border-slate-200 text-[11px] font-bold uppercase
                             tracking-wide text-slate-500">
                Note du cours
              </td>
              {cours.map(c => (
                <td key={c.cours_code} className="border-t border-slate-200 px-1.5 py-1.5">
                  <TuileSomme etat={c} seuil={data.seuil} enCours={enCours}
                    onAjourner={() => onAjuster('cours', c.cours_code,
                      c.ajourne_directement ? null : 'ajourne')}
                    onFaveur={() => onAjuster('cours', c.cours_code,
                      c.faveur_directe ? null : 'faveur')} />
                </td>
              ))}

              {/* Le croisement des deux sommes : la note de l'unité. */}
              <td className="border-t-2 border-t-iip-blue/40 border-l-2 border-l-iip-blue/40
                             bg-iip-blue/10 px-1.5 py-1.5">
                <TuileUE ue={ue} seuil={data.seuil} enCours={enCours}
                  onFaveur={() => onAjuster('ue', '*', ue.faveur_ue ? null : 'faveur')} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* AJOURNER OU REFUSER TOUT — le geste le plus fréquent du Conseil.
          Une unité ratée l'est rarement à moitié. */}
      <DecisionGenerale cours={cours} enCours={enCours} onLot={onLot}
        onDecision={onDecision} decision={decision} />

      {/* CE QU'IL FAUT JUSTIFIER, sous la matrice et en permanence. Le bouton
          de justification vivait sur la tuile de l'acquis : ajourner le faisait
          passer NA, la tuile changeait d'état et le bouton disparaissait — on
          ne pouvait plus justifier ce qu'on venait d'ajourner. */}
      <AJustifier acquis={acquis} cours={cours} onMotif={onMotif} enCours={enCours}
        decision={decision} />

      {/* Ce que la faveur coûterait — dit avant de décider, jamais après. */}
      <AideDecision ue={ue} />

      {/* Ce que le Conseil décide, et ce qu'il y a à représenter. */}
      <Decision e={e} ue={ue} onBord={onBord} acquis={acquis} cours={cours}
        decision={decision} onDecision={onDecision} enCours={enCours}
        onAnnuler={onAnnuler} />
      </div>

      {/* LE PILOTAGE, à droite : de qui l'on parle, et où il en est. */}
      <Pilotage e={e} ue={ue} onBord={onBord} />
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
        <div className="text-[13px] font-bold text-white truncate">
          {e.nom} {e.prenom}
        </div>
        <div className="text-[10.5px] text-slate-400">{e.id_ecampus || '—'}</div>
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
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
          Les autres unités de l'année
        </div>
        {!autres.length ? (
          <div className="text-[11px] text-slate-500">
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
                  text-[10.5px] font-semibold
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
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9.5px] text-slate-400">
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
                        text-[11px] text-violet-100">
          <b>{enFaveur} unité(s) déjà levée(s) en faveur</b> cette année.
          Chaque unité se délibère séparément : sans cette ligne, le Conseil
          accorde sans le savoir une faveur de plus.
        </div>
      )}

      <button onClick={onBord}
        className="w-full px-2.5 py-1.5 text-[11.5px] rounded-lg bg-white/10 border
                   border-white/20 text-white font-semibold hover:bg-white/15">
        Parcours complet et motivation
      </button>
    </div>
  );
}

function Chiffre({ libelle, valeur, suffixe, ton }) {
  return (
    <div className="rounded-lg bg-slate-900/60 py-1.5">
      <div className={`text-[16px] font-bold leading-none tabular-nums ${ton}`}>
        {valeur}<span className="text-[9px] font-normal opacity-70">{suffixe}</span>
      </div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">{libelle}</div>
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
function TuileSomme({ etat, seuil, onAjourner, onFaveur, motif, enCours }) {
  const { na, faveur, note, mention } = etat;
  const echec = !na && note != null && note < seuil;
  return (
    <div className={`rounded-lg border px-2 py-1 flex items-center gap-1.5
      ${na ? 'border-slate-300 bg-slate-100 text-slate-600'
        : faveur ? 'border-amber-400 bg-amber-50 text-amber-900'
        : echec ? 'border-red-500 border-2 bg-red-50 text-red-800'
        : note == null ? 'border-slate-200 bg-white text-slate-300'
        : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
      <span className="text-[15px] font-bold tabular-nums flex-1 text-right"
        title={mention === 'NP' ? 'Note de présence' : mention === 'PP' ? 'Pas présenté' : ''}>
        {na ? 'NA' : (mention || fmt(note))}
      </span>
      <span className="flex flex-col gap-0.5">
        <button disabled={enCours} onClick={onAjourner}
          title={na ? "Lever l'ajournement" : 'Ajourner — à représenter'}
          className={`w-5 h-5 rounded-full flex items-center justify-center border
            ${na ? 'bg-slate-600 border-slate-700 text-white'
                 : 'bg-white border-slate-300 text-slate-500 hover:border-slate-500'}`}>
          <IconRepeat size={11} />
        </button>

        {/* LEVER EN FAVEUR, ICI AUSSI. La faveur avait été ramenée à la seule
            unité ; c'était une erreur. Le Conseil ne lève pas « une unité » :
            il lève L'ACQUIS qui manque, ou LE COURS. C'est ce geste-là qui se
            motive et se relit, et c'est le seul qui rende compte d'une réussite
            accordée alors qu'un acquis précis n'était pas maîtrisé. */}
        {(echec || faveur) && !na && onFaveur && (
          <button disabled={enCours} onClick={onFaveur}
            title={faveur ? 'Retirer la faveur'
              : `Lever en faveur — vaudra exactement ${seuil}`}
            className={`w-5 h-5 rounded-full flex items-center justify-center border
              ${faveur ? 'bg-amber-400 border-amber-600 text-amber-950'
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
function TuileUE({ ue, seuil, onFaveur, enCours }) {
  const echec = !ue.na && ue.note != null && ue.note < seuil;
  return (
    <div className={`rounded-lg border-2 px-2 py-1
      ${ue.na ? 'border-slate-400 bg-slate-100 text-slate-700'
        : ue.faveur ? 'border-amber-500 bg-amber-100 text-amber-950'
        : echec ? 'border-red-600 bg-red-50 text-red-800'
        : 'border-emerald-500 bg-emerald-50 text-emerald-900'}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[19px] font-bold tabular-nums flex-1 text-right leading-tight">
          {ue.na ? 'NA' : fmt(ue.note)}
        </span>
        {(echec || ue.faveur) && !ue.na && (
          <button disabled={enCours} onClick={onFaveur}
            title={ue.faveur ? 'Retirer la faveur'
              : "Lever l'unité en faveur — elle vaudra exactement le seuil"}
            className={`w-6 h-6 rounded-full flex items-center justify-center border
              ${ue.faveur ? 'bg-amber-400 border-amber-600 text-amber-950'
                          : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <IconArrowUp size={13} />
          </button>
        )}
      </div>
      <div className="text-[8.5px] font-bold uppercase tracking-wide opacity-70 text-right">
        {ue.faveur ? 'faveur' : "note de l'unité"}
      </div>
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
        <span className="text-[12px] font-semibold text-red-900">
          À justifier — {liste.length} acquis
        </span>
        <span className="text-[11px] text-red-700">
          {sansMotif ? `${sansMotif} sans motivation` : 'tous motivés'}
        </span>
      </div>

      {/* Les cours à représenter, rappelés en une ligne : c'est l'acquis qu'on
          justifie, pas le cours. */}
      {!!aRepresenter.length && (
        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11.5px]
                        text-slate-700">
          <span className="font-semibold">Cours ajournés, à représenter :</span>{' '}
          {aRepresenter.map(c => (
            <span key={c.cours_code} className="mr-2">
              <span className="font-mono font-bold">{c.cours_code}</span>
              {c.cours_nom ? ` · ${c.cours_nom}` : ''}
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

      <p className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
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
    <div className={`px-3 py-2 flex items-start gap-3 ${a.motif ? '' : 'bg-red-50/40'}`}>
      <div className="w-40 flex-none">
        <div className="font-mono text-[11.5px] font-bold text-slate-700">{a.aa_code}</div>
        <div className="text-[10.5px] text-slate-500 truncate" title={a.description || ''}>
          {a.description || ''}
        </div>
        <span className={`inline-block mt-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full
          ${a.na ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-800'}`}>
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
                             px-1.5 py-0.5 text-[11px] text-iip-blue">
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
            className={`flex-1 border rounded-lg px-2 py-1.5 text-[12px]
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
          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[11.5px]" />
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
        <div className={`rounded-xl border px-3 py-2 text-[12px]
          ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
               : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              {ok ? 'Faveur envisageable' : 'Faveur hors de la ligne du Conseil'}
            </span>
            <span className="text-[11.5px] opacity-80">
              il manque <b>{fmt(ue.faveur_cout)}</b> point(s)
            </span>
            {!!(ue.faveur_cours || []).length && (
              <span className="text-[11.5px] opacity-80">
                · sur {ue.faveur_cours.length} cours ({ue.faveur_cours.join(', ')})
              </span>
            )}
            <span className="text-[11.5px] opacity-60 ml-auto">
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

          <div className="mt-1 text-[11px] opacity-80">
            {(ue.faveur_acquis || []).map(a => (
              <span key={a.aa_code} className="mr-2">
                <span className="font-mono">{a.aa_code}</span> −{fmt(a.manque)}
              </span>
            ))}
          </div>

          <div className="mt-1 text-[11px] opacity-70">
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
    <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
      <span className="text-slate-500">Sur l'ensemble des cours :</span>
      <button disabled={enCours} onClick={() => onLot('cours', codes, tousAjournes ? null : 'ajourne')}
        title={tousAjournes
          ? "Relever l'ajournement de tous les cours"
          : "Ajourner les cours de l'unité en une fois"}
        className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5
          ${tousAjournes
    ? 'bg-amber-100 border-amber-300 text-amber-900'
    : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'}`}>
        <IconAlertTriangle size={13} />
        {tousAjournes ? 'Relever l’ajournement général' : 'Ajournement général'}
      </button>
      <button disabled={enCours}
        onClick={() => { onLot('cours', codes, 'ajourne'); onDecision('refuse'); }}
        title="Tous les cours tombent et l'unité est refusée — sans seconde session"
        className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5
          ${decision === 'refuse'
    ? 'bg-red-100 border-red-300 text-red-800'
    : 'bg-white border-red-300 text-red-700 hover:bg-red-50'}`}>
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

function Decision({ e, ue, onBord, acquis, cours, decision, onDecision, enCours, onAnnuler }) {
  const detail = ue.a_representer_detail || [];
  // Ce qui reste à justifier se lit sur les acquis affichés, non sur la liste
  // que le serveur a calculée à l'ouverture de la fiche.
  const manquants = aJustifier(acquis, cours, decision).filter(a => !a.motif).map(a => a.aa_code);
  const propose = ue.decision_proposee;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[12px]
                      font-semibold text-iip-blue flex items-center justify-between gap-2">
        <span>Décision du Conseil des études</span>
        {!ue.na && ue.note != null && (
          <span className="font-normal text-slate-600">
            note de l'unité : <b>{fmt(ue.note)}</b>/20
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {DECISIONS.map(d => {
            const actif = decision === d.cle;
            return (
              <button key={d.cle} disabled={enCours}
                onClick={() => onDecision(d.cle)}
                className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg border
                  ${actif ? `${d.ton} text-white`
                          : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                {d.libelle}
                {d.cle === propose && (
                  <span className={`ml-1.5 text-[9.5px] font-normal
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
              className="ml-auto text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-300
                         text-slate-500 hover:border-red-400 hover:text-red-700
                         flex items-center gap-1">
              <IconRotate size={13} /> Reprendre ce dossier
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
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

          {!!manquants.length && decision !== 'reussi' && (
            <span className="text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-0.5">
              À justifier sous la matrice avant de passer au suivant :
              {' '}{manquants.join(', ')}
            </span>
          )}

          {!!(ue.mentions || []).length && (
            <span className="text-[11.5px] text-amber-900 bg-amber-50 border
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

        {ue.faveur && (
          <p className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200
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
          <div className="text-[11.5px] text-red-900 bg-red-50 border border-red-200
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
          <div className="text-[11.5px] text-slate-700 bg-slate-50 border border-slate-200
                          rounded-lg px-2.5 py-1.5 space-y-1">
            <div className="font-semibold">Ajournement — à représenter :</div>
            {detail.length ? detail.map(c => (
              <div key={c.cours_code} className="pl-2">
                <span className="font-mono font-semibold">{c.cours_code}</span>
                {c.cours_nom ? ` · ${c.cours_nom}` : ''}
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
      </div>
    </div>
  );
}

/* ═══ La vue d'ensemble ════════════════════════════════════════════════════ */

function VueTableau({ data, liste, onOuvrir }) {
  return (
    <div className="overflow-auto border border-slate-200 rounded-xl">
      <table className="text-[12px] border-collapse">
        <thead className="sticky top-0 bg-white z-10">
          <tr>
            <th className="sticky left-0 bg-white z-20 text-left px-3 py-2
                           border-b border-r border-slate-200 min-w-[170px]">Étudiant</th>
            {data.colonnes_acquis.map(a => (
              <th key={a.aa_code} title={a.description || ''}
                className="px-1 py-1.5 border-b border-slate-200 w-12 text-[9.5px]
                           font-bold text-iip-blue">{a.aa_code}</th>
            ))}
            {data.colonnes_cours.map(c => (
              <th key={c.cours_code} title={c.cours_nom || ''}
                className="px-1 py-1.5 border-b border-l border-slate-300 w-12
                           bg-slate-50 text-[9.5px] font-bold text-slate-700">
                {c.cours_code}
              </th>
            ))}
            <th className="px-2 py-1.5 border-b border-l-2 border-l-iip-blue/40
                           bg-iip-blue/5 w-14 text-[10px] text-iip-blue">UE</th>
          </tr>
        </thead>
        <tbody>
          {liste.map(e => {
            const parAA = Object.fromEntries((e.acquis || []).map(a => [a.aa_code, a]));
            const parCo = Object.fromEntries((e.cours || []).map(c => [c.cours_code, c]));
            return (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="sticky left-0 bg-white px-3 py-1 border-b border-r border-slate-100">
                  <button onClick={() => onOuvrir(e)} className="text-left w-full">
                    <div className="font-semibold text-iip-blue truncate hover:underline">{e.nom}</div>
                    <div className="text-[10.5px] text-slate-500 truncate">{e.prenom}</div>
                  </button>
                </td>
                {data.colonnes_acquis.map(a => <Case key={a.aa_code} etat={parAA[a.aa_code]} />)}
                {data.colonnes_cours.map(c => (
                  <Case key={c.cours_code} etat={parCo[c.cours_code]} bord />
                ))}
                <td className="border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5
                               px-2 text-center font-bold text-[12px]">
                  <span className={e.ue?.na ? 'text-slate-500'
                    : e.ue?.faveur ? 'text-amber-700'
                    : e.ue?.echec ? 'text-red-700' : 'text-emerald-700'}>
                    {e.ue?.na ? 'NA' : fmt(e.ue?.note)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Case({ etat, bord }) {
  if (!etat) return <td className={`border-b border-slate-100 ${bord ? 'border-l' : ''}`} />;
  return (
    <td className={`border-b border-slate-100 px-1 text-center text-[11px] font-semibold
      ${bord ? 'border-l border-slate-300 bg-slate-50/60' : ''}
      ${etat.na ? 'text-slate-500'
        : etat.faveur ? 'bg-amber-100 text-amber-900'
        : etat.echec ? 'bg-red-50 text-red-700 outline outline-1 outline-red-400'
        : 'text-emerald-700'}`}>
      {etat.na ? 'NA' : fmt(etat.note)}
    </td>
  );
}
