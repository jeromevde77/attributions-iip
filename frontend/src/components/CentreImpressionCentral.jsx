import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nomPropre } from '../lib/nom.js';
import {
  IconPrinter, IconUsers, IconSchool, IconChartBar, IconCalendarStats,
  IconBooks, IconAlertTriangle, IconChevronRight, IconChevronDown, IconSearch,
  IconDownload, IconSend, IconFilePlus,
} from '@tabler/icons-react';
import PreviewModal from './PreviewModal.jsx';
import SaisieAnnexe from './SaisieAnnexe.jsx';
/* La séance de valorisation est chargée à la demande : Éditions s'ouvre
   souvent pour un rapport, et cet écran porte le rendu du procès-verbal. */
const SeanceValorisation = lazy(() => import('./SeanceValorisation.jsx'));
import EnvoiMailModal from './EnvoiMailModal.jsx';
import { useEnvoiMail } from '../lib/envoiMail.js';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, GroupeFenetre, PieceFenetre } from './ui.jsx';

/**
 * LE CENTRE D'IMPRESSION — un seul endroit d'où tout sort.
 *
 * Dix-huit écrans produisaient des documents, chacun avec sa mécanique et ses
 * options : on ne savait plus où sortir quoi, et la même pièce s'obtenait
 * différemment selon le chemin pris. Les boutons restent où ils sont — on les
 * cherche là où on travaille — mais ils mènent ici.
 *
 * L'onglet Étudiants croise DEUX AXES. Le PÉRIMÈTRE — une section, des unités,
 * des cours pris dans des unités différentes — construit la liste ; la
 * SÉLECTION la restreint à ceux qu'on coche. On peut donc aussi bien sortir
 * toute une section que trois dossiers.
 *
 * UN COURS NE DÉSIGNE QUE DES PERSONNES : les pièces de délibération sont des
 * pièces d'unité, et le restent.
 */

const Listes = lazy(() => import('../pages/Listes.jsx'));

/* LES DOMAINES D'ÉDITIONS SONT LES AXES DE LUCIE, ET RIEN D'AUTRE.
   On rangeait ici en « Étudiants · Personnel · Pilotage · Organisation ·
   Référentiels » pendant que l'application a « Étudiants · Personnel ·
   Organisation · Gestion » : on apprenait un rangement pour travailler et un
   autre pour imprimer, et quand on cherchait la dotation on essayait les deux.
   « Pilotage » devient GESTION — même territoire, celui de ce qu'on engage.
   « Référentiels » rentre dans ORGANISATION : une unité, un cours, une grille,
   un acquis sont les objets de cet axe, pas un métier séparé.
   Le générateur n'est pas un axe : ses listes se rangent dans les axes. */
/* « CONSTRUIRE UNE LISTE » A DISPARU, ET C'EST LE BUT.
   L'onglet proposait les seize listes prédéfinies, qui reparaissaient ensuite
   dans Étudiants, Personnel, Organisation et Gestion : deux chemins pour une
   même pièce, et l'on ne savait plus lequel faisait foi. Leur donner un axe
   (2.12.27) n'a pas suffi tant que le second chemin restait ouvert. Chaque
   liste vit maintenant dans SON axe, sous la bascule « Listes » — et c'est là
   qu'on choisit ses colonnes, puisque c'est le même écran. Une place par
   pièce. */
const ONGLETS = [
  { cle: 'etudiants', label: 'Étudiants', icon: IconSchool },
  { cle: 'personnel', label: 'Personnel', icon: IconUsers },
  { cle: 'organisation', label: 'Organisation', icon: IconBooks },
  { cle: 'gestion', label: 'Gestion', icon: IconChartBar },
];

const PIECES = [
  { cle: 'reussite', label: 'Attestations de réussite', nominatif: true },
  { cle: 'ajournement', label: 'Motivations d’ajournement', nominatif: true },
  { cle: 'refus', label: 'Motivations de refus', nominatif: true },
  { cle: 'pv', label: 'Procès-verbal de délibération', nominatif: false },
  { cle: 'conseil', label: 'Composition du Conseil', nominatif: false },
  { cle: 'grille', label: 'Grille de délibération', nominatif: false },
];

/* ══ LA VALORISATION DES ACQUIS, DEPUIS ÉDITIONS ══════════════════════════
 *
 * Les pièces de valorisation ne se sortaient QUE depuis la fiche d'un
 * étudiant — onglet VA, bouton Documents. C'est-à-dire du cas par cas, sur une
 * pièce qui concerne l'unité entière : pour un conseil de dix-sept dossiers, il
 * fallait ouvrir une fiche au hasard pour atteindre le procès-verbal de tous
 * les autres.
 *
 * Et ce n'était pas un oubli de déclaration : `lib/documents.js` déclare bien
 * `valorisation_ue`, et `/api/impression/catalogue` le sert. AUCUN ÉCRAN NE
 * LISAIT CE CATALOGUE — c'est le chantier 4 de la stratégie documents, jamais
 * construit. Une pièce déclarée dans un catalogue que personne ne lit n'existe
 * pas ; c'est la leçon du PV d'annexe 4 avant 2.11.7, et de `POST /etudiants`
 * avant l'écran d'inscription.
 *
 * ON NE RECONSTRUIT PAS L'ÉCRAN DE SÉANCE. `SeanceValorisation` porte déjà la
 * date, la présidence, les présences, le quorum, la barrière des manques et la
 * production du PV avec ses attestations. Ce qui manquait n'était pas un
 * écran : c'était UNE PORTE. Éditions en devient une — on choisit l'unité, et
 * la séance s'ouvre.
 */
function OngletValorisation() {
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [arbre, setArbre] = useState(null);
  const [section, setSection] = useState('');
  const [dossiers, setDossiers] = useState(null);
  const [ouverte, setOuverte] = useState(null);   // { ue_num, ue_nom }
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => setAnnees([annee]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    fetch(`/api/perimetre/arborescence?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(setArbre).catch(e => setErreur(e.message));
  }, [annee]);

  /* LES UNITÉS PROPOSÉES SONT CELLES QUI ONT DES DEMANDES — PAS TOUT LE
     RÉFÉRENTIEL. Trois cents unités dont six portent une valorisation, c'est
     une liste dans laquelle on ne trouve pas : le registre dit lesquelles, et
     avec combien de dossiers. */
  useEffect(() => {
    setDossiers(null);
    fetch(`/api/etudiants/valorisations/registre?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setDossiers(Array.isArray(l) ? l : []))
      .catch(() => setDossiers([]));
  }, [annee]);

  const nomUE = useMemo(() => {
    const m = new Map();
    for (const u of (arbre?.unites || [])) m.set(u.ue_num, u);
    return m;
  }, [arbre]);

  const unites = useMemo(() => {
    const m = new Map();
    for (const d of (dossiers || [])) {
      const sec = d.section || nomUE.get(d.ue_num)?.section || null;
      if (section && sec !== section) continue;
      const k = d.ue_num;
      if (!m.has(k)) {
        m.set(k, { ue_num: k, ue_nom: d.ue_nom || nomUE.get(k)?.ue_nom || '',
                   section: sec, n: 0, refus: 0, partielles: 0, avalider: 0 });
      }
      const e = m.get(k);
      e.n += 1;
      if (d.decision === 'refusee') e.refus += 1;
      else if (d.type === 'partielle') e.partielles += 1;
      if (!d.valide_le) e.avalider += 1;
    }
    return [...m.values()].sort((a, b) => a.ue_num - b.ue_num);
  }, [dossiers, section, nomUE]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={annee} onChange={e => setAnnee(e.target.value)}
          className="controle text-[13px]">
          {(annees.length ? annees : [annee]).map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="controle text-[13px]">
          <option value="">Toutes les sections</option>
          {(arbre?.sections || []).map(sx => <option key={sx} value={sx}>{sx}</option>)}
        </select>
        <span className="text-[12px] text-slate-500">
          {unites.length} unité(s) portant des demandes
        </span>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[13px]">
          {erreur}
        </div>
      )}

      {/* LA PIÈCE EST D'UNITÉ, ET L'ÉCRAN LE DIT AVANT LE CLIC.
          Le procès-verbal porte TOUS les étudiants valorisés dans l'unité
          cette année-là : le compte est sur la ligne, pour qu'on sache ce
          qu'on s'apprête à produire. */}
      {dossiers && !unites.length && (
        <p className="text-[13px] text-slate-400">
          Aucune demande de valorisation enregistrée pour cette année
          {section ? ` en ${section}` : ''}. Les pièces se produisent depuis
          l'unité qui a convoqué le conseil des études.
        </p>
      )}

      <div className="space-y-1.5">
        {unites.map(u => (
          <div key={u.ue_num} className="carte px-3 py-2 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold text-iip-blue">
                {u.ue_num === 0 ? 'Admission de section' : `UE ${u.ue_num}`}
              </span>
              <span className="text-[13px] text-slate-600 ml-2">{u.ue_nom}</span>
              <span className="block text-[11px] text-slate-500">
                {u.section || 'section à déduire'} · {u.n} dossier(s)
                {u.partielles ? ` · ${u.partielles} partielle(s)` : ''}
                {u.refus ? ` · ${u.refus} refus` : ''}
                {/* CE QUI EMPÊCHERA LA PIÈCE DE SORTIR SE VOIT ICI, PAS AU
                    MOMENT D'IMPRIMER — le découvrir devant quelqu'un qui
                    attend son attestation est la mauvaise façon de l'apprendre. */}
                {u.avalider
                  ? <span className="text-[#B45309]"> · {u.avalider} non validé(s)</span>
                  : null}
              </span>
            </span>
            <button className="bouton-sortir controle px-3 text-[12px] flex-none"
              onClick={() => setOuverte(u)}>
              PV et attestations
            </button>
          </div>
        ))}
      </div>

      {ouverte && (
        <Suspense fallback={null}>
          <SeanceValorisation ueNum={ouverte.ue_num} ueNom={ouverte.ue_nom}
            annee={annee} onClose={() => setOuverte(null)} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * LES RAPPORTS D'UN DOMAINE.
 *
 * Le catalogue vient du serveur : ajouter un rapport n'y ajoute pas d'écran.
 * On voit d'abord ce qu'on emporte — cinquante lignes d'aperçu — avant de
 * télécharger : un tableur qu'on découvre après coup se refait deux fois.
 */
/** Le générateur, servi dans une fenêtre — filtré sur un axe, ou complet. */
function CadreListes({ domaine = null }) {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-slate-400">Chargement…</div>}>
      <Listes integre domaine={domaine} />
    </Suspense>
  );
}

function OngletRapports({ domaine }) {
  /* L'ANNÉE SE CHOISIT ICI. Le centre reprenait l'année de travail sans
     jamais la montrer : pour sortir la charge de l'an dernier — ce que
     demandent la dotation, le COPIL et l'AEQES —, il fallait changer l'année
     de toute l'application, faire la pièce, puis penser à la remettre. */
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [session, setSession] = useState(1);
  // UN RAPPORT DE CURSUS NE SE DEMANDE PAS COMME UN RAPPORT D'ÉTABLISSEMENT.
  // Vide, le rapport porte sur toute la maison — c'est ce que veulent le
  // Conseil et la dotation ; choisie, il ne parle que d'une section — c'est ce
  // que veut une coordination. Le même modèle sert les deux.
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  /* LA PORTÉE — le niveau de détail, et ce qu'on a choisi à ce niveau. Un
     logiciel de gestion sert à montrer LES données qu'on choisit : on descend
     de l'établissement à la section, de la section à l'unité, de l'unité au
     cours, au lieu d'avoir une entrée de menu par échelle. */
  /* PLUSIEURS UNITÉS, ET LE TRONC COMMUN. On demandait « l'ETP de l'UE 286 »,
     puis celui de l'UE 290, et l'on additionnait deux pièces à la main — deux
     personnes ne trouvaient pas le même total. `ue_nums` porte la sélection ;
     `ue_num` reste pour descendre jusqu'au cours, qui n'a de sens que dans UNE
     unité. `tc` restreint aux unités du tronc commun, ou les exclut. */
  const [portee, setPortee] = useState({
    niveau: 'etablissement', ue_num: '', ue_nums: [], code_cours: '', tc: '' });
  const [ouvreUes, setOuvreUes] = useState(false);
  /* L'EFFECTIF SE COMPTE, OU SE POSE. Lucie connaît les inscrits et c'est le
     défaut ; mais une pièce de COPIL se prépare souvent AVANT les
     inscriptions — on projette la rentrée, on simule l'ouverture d'une
     section. Laissé vide, le champ ne change rien. */
  const [etudiants, setEtudiants] = useState('');
  const [ues, setUes] = useState([]);
  const [coursUe, setCoursUe] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [document0, setDocument0] = useState(null);

  // IMPRIMER, ET PAS SEULEMENT TÉLÉCHARGER. Un tableur se rouvre et s'édite ;
  // il ne se dépose pas dans un dossier, ne s'annexe pas à un courrier et ne
  // se présente pas au Conseil. Pour tout ce qui doit être MONTRÉ plutôt que
  // retravaillé, la pièce manquait — et donc, en pratique, la fonction.
  /*
   * IMPRIMER PASSE PAR LE PDF DU SERVEUR QUAND LE SERVEUR SAIT LE FAIRE.
   *
   * L'impression depuis le navigateur ne répète PAS l'en-tête et le pied d'un
   * document long : Safari ne redessine pas les en-têtes de tableau autour
   * d'une cellule qui déborde de la page. Un rapport de cinq pages sortait
   * donc avec l'identité de l'école en page 1 et le pied en page 5 — les
   * pages du milieu, détachées d'une pile, ne prouvaient plus rien.
   *
   * Le PDF du serveur, lui, dispose d'un vrai gabarit de page : le pied et la
   * numérotation sont posés par le moteur, sur CHAQUE feuille. C'est la règle
   * de la maison, écrite depuis longtemps et jamais appliquée ici : PDF
   * serveur si le serveur peut, impression navigateur sinon.
   *
   * La pièce n'est pas recalculée : on envoie CELLE QUI EST À L'ÉCRAN.
   */
  async function imprimer() {
    if (!apercu?.html) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/impression/pdf', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          html: apercu.html,
          nom: (apercu.nom || choisi?.id || 'document').replace(/\.html$/, ''),
          pagination: 'si-plusieurs',
          /* LE GABARIT DU SERVEUR PREND LA MAIN SUR LE PIED DU DOCUMENT.
             Je l'avais désactivé pour éviter un doublon — mais le rendu sait
             déjà masquer le pied du flux quand il pose le sien. Sans gabarit,
             le pied restait accroché à la fin du contenu : sur une page à
             moitié remplie, il flottait au milieu de la feuille au lieu d'en
             occuper le bas. Le gabarit, lui, vit dans la MARGE de page : il
             est au bas de chaque feuille, quoi qu'il arrive, et la
             numérotation s'y intègre. */
          pied: true,
        }),
      });
      if (rep.ok) {
        const url = URL.createObjectURL(await rep.blob());
        const w = window.open(url, '_blank');
        if (!w) {
          const a = document.createElement('a');
          a.href = url; a.download = `${(apercu.nom || 'document').replace(/\.html$/, '')}.pdf`;
          document.body.appendChild(a); a.click(); a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      // Serveur sans moteur PDF : on retombe sur l'impression navigateur,
      // le même repli que partout ailleurs.
      setDocument0(apercu);
    } catch {
      setDocument0(apercu);
    } finally { setEnCours(false); }
  }

  useEffect(() => {
    fetch('/api/rapports/catalogue', { headers: authHeaders() })
      .then(r => r.json()).then(j => setCatalogue(j.rapports || []))
      .catch(e => setErreur(e.message));
    fetch(`/api/reunions/perimetre?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { setSections(j.sections || []); setUes(j.ues || []); })
      .catch(() => { /* sans la liste, le filtre reste sur « toutes » */ });
  }, [annee]);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => setAnnees([annee]));
    // eslint-disable-next-line
  }, []);

  // Les cours d'une unité ne se chargent qu'au moment où l'on descend jusque-là.
  useEffect(() => {
    if (portee.niveau !== 'cours' || !portee.ue_num) { setCoursUe([]); return; }  // eslint-disable-line
    fetch(`/api/ref/cours?annee=${encodeURIComponent(annee)}&ue_num=${encodeURIComponent(portee.ue_num)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(l => setCoursUe(Array.isArray(l) ? l : []))
      .catch(() => setCoursUe([]));
  }, [portee.niveau, portee.ue_num, annee]);

  const liste = useMemo(
    () => (catalogue || []).filter(r => r.domaine === domaine), [catalogue, domaine]);

  // LES UNITÉS PROPOSÉES — une seule liste, filtrée une seule fois : la
  // section choisie, puis le tronc commun. Deux endroits qui filtrent
  // séparément finissent par ne plus proposer la même chose.
  const uesOffertes = useMemo(() => (ues || []).filter(u => {
    if (section && u.section !== section) return false;
    const est = String(u.ue_tc || '').trim().toLowerCase() === 'x';
    if (portee.tc === 'tc') return est;
    if (portee.tc === 'hors') return !est;
    return true;
  }), [ues, section, portee.tc]);

  /* LE TRONC COMMUN N'EXISTE PAS PARTOUT — ET LE MENU LE PROPOSAIT QUAND MÊME.
   *
   * « Tronc commun compris / seul / hors » s'affichait sur TIM, qui n'en a
   * pas : trois choix dont deux rendent une liste vide, et le troisième ne
   * change rien. Un filtre qui ne filtre rien n'est pas neutre — il fait
   * douter (« ai-je oublié de cocher quelque chose ? ») et il occupe la place
   * de ceux qui décident vraiment. C'est la même règle que les rubriques « à
   * venir » retirées des rails : on ne montre pas une porte qui ne mène nulle
   * part.
   *
   * Il ne paraît donc que si la section choisie porte RÉELLEMENT des unités de
   * tronc commun — Optométrie aujourd'hui. Le jour où une autre section en
   * aura, il paraîtra tout seul : la condition se lit des données, elle n'est
   * pas une liste de sections écrite en dur, qui mentirait dès le premier
   * changement de programme. */
  const aTroncCommun = useMemo(() => (ues || []).some(u =>
    (!section || u.section === section)
    && String(u.ue_tc || '').trim().toLowerCase() === 'x'), [ues, section]);

  /* ET UN FILTRE QUI DISPARAÎT NE DOIT PAS CONTINUER D'AGIR EN COULISSE.
     On choisit « tronc commun seul » en optométrie, on bascule sur TIM : le
     menu s'efface, mais `portee.tc` garderait sa valeur et la liste sortirait
     vide sans que rien ne l'explique. */
  useEffect(() => {
    if (!aTroncCommun && portee.tc) setPortee(p => ({ ...p, tc: '' }));
  }, [aTroncCommun, portee.tc]);

  // Une unité décochée par un changement de filtre ne doit pas rester dans la
  // sélection : la pièce porterait sur autre chose que ce qui est affiché.
  useEffect(() => {
    setPortee(p0 => {
      const offerts = new Set(uesOffertes.map(u => String(u.ue_num)));
      const gardes = (p0.ue_nums || []).filter(n => offerts.has(String(n)));
      if (gardes.length === (p0.ue_nums || []).length) return p0;
      return { ...p0, ue_nums: gardes,
        ue_num: offerts.has(String(p0.ue_num)) ? p0.ue_num : '' };
    });
  }, [uesOffertes]);
  useEffect(() => { setChoisi(null); setApercu(null); }, [domaine]);

  const corps = (r) => JSON.stringify({
    annee,
    ...(r.params.includes('session') ? { session } : {}),
    ...(r.params.includes('section') && section ? { section } : {}),
    ...(r.params.includes('portee')
      ? { portee: { ...portee, section: section || null } } : {}),
    ...(r.params.includes('etudiants') && etudiants ? { etudiants: Number(etudiants) } : {}),
  });

  /*
   * CE QU'ON VOIT EST CE QUI SORT.
   *
   * L'aperçu montrait un tableau de cinquante lignes : des colonnes grises,
   * sans en-tête d'établissement, sans tuiles, sans graphique — c'est-à-dire
   * tout sauf la pièce. On choisissait « ETP pour TIM » et l'on découvrait un
   * listing ; le document, lui, n'apparaissait qu'après avoir cliqué sur
   * Imprimer, et il ne lui ressemblait pas. Deux rendus pour une même pièce,
   * donc deux occasions de se tromper.
   *
   * L'aperçu EST le document : la page réelle, dans son enveloppe, à l'échelle.
   * Imprimer n'ajoute plus rien — c'est la même page qui part.
   */
  async function voir(r) {
    setChoisi(r); setApercu(null); setErreur(null); setEnCours(true);
    try {
      const rep = await fetch(`/api/rapports/${r.id}/document`, {
        method: 'POST', headers: authHeaders(), body: corps(r),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setApercu(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  // Changer de section ou de session refait la pièce : un aperçu qui ne suit
  // pas ses paramètres ment sur ce qui s'imprimera.
  useEffect(() => { if (choisi) voir(choisi); // eslint-disable-next-line
  }, [section, session, annee, portee, etudiants]);

  async function telecharger() {
    if (!choisi) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/rapports/${choisi.id}/xlsx`, {
        method: 'POST', headers: authHeaders(), body: corps(choisi),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Le tableur n’a pas pu être produit.');
        return;
      }
      const url = URL.createObjectURL(await rep.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${choisi.id}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[340px] border-r border-slate-200 overflow-auto p-2 space-y-1">
        {/* UNE LISTE SE PARCOURT, UNE FICHE SE LIT.
            Chaque entrée portait son libellé ET une phrase entière d'aide, en
            11 px, dans une colonne de 340 px : trois à quatre lignes de gris
            par pièce, et le nom — la seule chose qu'on cherche — noyé dans son
            propre commentaire. L'aide descend dans le panneau de droite, où
            l'on en a besoin : au moment de régler l'année et la section, pas
            au moment de parcourir.
            Et la ligne dit enfin CE QUI VA SORTIR — une pièce mise en page ou
            un tableau — et SUR QUOI elle porte. Les deux étaient calculés,
            envoyés à l'écran, et affichés nulle part : on choisissait, et on
            découvrait ensuite. */}
        {liste.map(r => {
          const portee = r.portees?.length
            ? { etablissement: "tout l'établissement", section: 'par section',
                ue: 'par unité', cours: 'par cours' }[r.portees[0]] || r.portees[0]
            : null;
          return (
            <button key={r.id} onClick={() => voir(r)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[13px]
                flex items-center gap-2
                ${choisi?.id === r.id ? 'border-iip-blue bg-iip-blue/5'
                  : 'border-transparent hover:bg-slate-50'}`}>
              <span className="flex-1 min-w-0 truncate">{r.libelle}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0
                ${r.piece ? 'bg-[#00AACC]/12 text-[#046B80]' : 'bg-slate-100 text-slate-500'}`}>
                {r.piece ? 'pièce' : 'tableau'}
              </span>
              {portee && (
                <span className="text-[10px] text-slate-400 flex-shrink-0 hidden lg:inline">
                  {portee}
                </span>
              )}
            </button>
          );
        })}
        {catalogue && !liste.length && (
          <p className="p-4 text-[13px] text-slate-400">
            Aucun rapport dans ce domaine pour l’instant.
          </p>
        )}
        {!catalogue && <p className="p-4 text-[12px] text-slate-400">Chargement…</p>}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="px-2 py-1 text-[12px] border border-slate-300 rounded"
            title="Année sur laquelle porte la pièce">
            {(annees.length ? annees : [annee]).map(a =>
              <option key={a} value={a}>{a}</option>)}
          </select>

          {choisi?.portees?.length > 1 && (
            <>
              <select value={portee.niveau}
                onChange={e => setPortee(p => ({ ...p, niveau: e.target.value }))}
                className="px-2 py-1 text-[12px] border border-slate-300 rounded"
                title="Jusqu'où descendre">
                {choisi.portees.map(n => (
                  <option key={n} value={n}>{{
                    etablissement: "Tout l'établissement", section: 'Une section',
                    ue: 'Une unité', cours: 'Un cours',
                  }[n] || n}</option>
                ))}
              </select>
              {portee.niveau !== 'etablissement' && (
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded">
                  <option value="">Toutes les sections</option>
                  {sections.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
                </select>
              )}
              {portee.niveau !== 'etablissement' && aTroncCommun && (
                <select value={portee.tc}
                  onChange={e => setPortee(p => ({ ...p, tc: e.target.value }))}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded"
                  title="Restreindre au tronc commun, ou l'exclure">
                  <option value="">Tronc commun compris</option>
                  <option value="tc">Tronc commun seul</option>
                  <option value="hors">Hors tronc commun</option>
                </select>
              )}
              {/* UNE UNITÉ SE CHOISIT, PLUSIEURS SE COCHENT. Une liste
                  déroulante ne sait dire qu'une chose à la fois ; on sortait
                  donc une pièce par unité et on additionnait à la main. */}
              {portee.niveau === 'ue' && (
                <div className="relative">
                  <button onClick={() => setOuvreUes(o => !o)}
                    className="px-2 py-1 text-[12px] border border-slate-300 rounded
                               bg-white max-w-[18rem] truncate text-left">
                    {portee.ue_nums.length === 0 ? '— choisir des unités —'
                      : portee.ue_nums.length === 1 ? `UE ${portee.ue_nums[0]}`
                      : `${portee.ue_nums.length} unités`}
                  </button>
                  {ouvreUes && (
                    <div className="absolute z-30 mt-1 w-[24rem] max-h-72 overflow-auto
                                    bg-white border border-slate-300 rounded-carte shadow-flottant p-2">
                      <div className="flex gap-2 pb-2 mb-1 border-b border-slate-200">
                        <button className="text-[11px] text-iip-blue underline"
                          onClick={() => setPortee(p => ({ ...p,
                            ue_nums: uesOffertes.map(u => String(u.ue_num)) }))}>
                          Tout cocher ({uesOffertes.length})
                        </button>
                        <button className="text-[11px] text-slate-500 underline"
                          onClick={() => setPortee(p => ({ ...p, ue_nums: [] }))}>
                          Tout décocher
                        </button>
                      </div>
                      {uesOffertes.length === 0 && (
                        <div className="text-[12px] text-slate-400 px-1 py-2">
                          Aucune unité ne répond à ces filtres.
                        </div>
                      )}
                      {uesOffertes.map(u => {
                        const k = String(u.ue_num);
                        const coche = portee.ue_nums.includes(k);
                        return (
                          <label key={k} className="flex items-start gap-2 py-0.5 text-[12px]
                                                    cursor-pointer hover:bg-slate-50 rounded px-1">
                            <input type="checkbox" checked={coche} className="mt-0.5"
                              onChange={() => setPortee(p => ({ ...p,
                                ue_nums: coche ? p.ue_nums.filter(x => x !== k)
                                               : [...p.ue_nums, k] }))} />
                            <span>
                              <b>UE {u.ue_num}</b> {u.ue_nom}
                              {String(u.ue_tc || '').toLowerCase() === 'x' && (
                                <span className="ml-1.5 text-[10px] px-1 rounded border
                                                 border-iip-turquoise text-iip-blue font-bold">TC</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* UN COURS VIT DANS UNE SEULE UNITÉ : là, on choisit. */}
              {portee.niveau === 'cours' && (
                <select value={portee.ue_num}
                  onChange={e => setPortee(p => ({ ...p,
                    ue_num: e.target.value, ue_nums: e.target.value ? [e.target.value] : [],
                    code_cours: '' }))}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded max-w-[16rem]">
                  <option value="">— choisir une unité —</option>
                  {uesOffertes.map(u => (
                    <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>
                  ))}
                </select>
              )}
              {portee.niveau === 'cours' && !!coursUe.length && (
                <select value={portee.code_cours}
                  onChange={e => setPortee(p => ({ ...p, code_cours: e.target.value }))}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded max-w-[16rem]">
                  <option value="">Tous les cours de l'unité</option>
                  {coursUe.map(c => (
                    <option key={c.cours_code} value={c.cours_code}>
                      {c.cours_code} — {c.cours_nom}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {choisi?.params?.includes('section') && (
            <select value={section}
              onChange={e => { setSection(e.target.value); setApercu(null); }}
              className="px-2 py-1 text-[12px] border border-slate-300 rounded">
              <option value="">Toutes les sections</option>
              {sections.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
            </select>
          )}
          {choisi?.params?.includes('etudiants') && (
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
              Étudiants
              <input type="number" min="0" value={etudiants} placeholder="inscrits"
                onChange={e => setEtudiants(e.target.value)}
                title="Laissez vide pour compter les inscrits encodés dans Lucie ; posez un nombre pour simuler."
                className="w-20 px-2 py-1 text-[12px] border border-slate-300 rounded" />
            </label>
          )}
          {choisi?.params?.includes('session') && (
            <select value={session}
              onChange={e => { setSession(Number(e.target.value)); setApercu(null); }}
              className="px-2 py-1 text-[12px] border border-slate-300 rounded">
              <option value={1}>1re session</option>
              <option value={2}>2e session</option>
            </select>
          )}
          <span className="flex-1" />
          {apercu && (
            <span className="text-[12px] text-slate-500">
              {apercu.nb} ligne(s){apercu.tronque ? ' · 50 premières affichées' : ''}
            </span>
          )}
          {/* IMPRIMER D'ABORD, comme dans le rail : c'est le geste le plus
              fréquent, et il porte la couleur qui le fait trouver. */}
          <button onClick={imprimer} disabled={!choisi || enCours}
            className="controle controle-fort">
            <IconPrinter size={14} /> Imprimer
          </button>
          {/* Une pièce mise en page ne sort pas en tableur : elle n'a pas de
              lignes à retrier, elle a une forme. */}
          {!choisi?.piece && (
            <button onClick={telecharger} disabled={!choisi || enCours}
              className="controle">
              <IconDownload size={14} /> Tableur
            </button>
          )}
        </div>

        {erreur && (
          <div className="m-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[13px]
                          flex items-start gap-2">
            <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
          </div>
        )}

        {/* L'AIDE SE LIT ICI, au moment où l'on règle l'année et la section —
            pas dans la liste, où elle noyait le nom des pièces. */}
        {choisi?.aide && (
          <div className="px-3 py-2 border-b border-slate-200 bg-[#FCFCFD]">
            <div className="text-[13px] font-medium">{choisi.libelle}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">{choisi.aide}</div>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 bg-slate-100 p-3">
          {!choisi && (
            <p className="p-6 text-[13px] text-slate-400">
              Choisissez une pièce à gauche.
            </p>
          )}
          {choisi && !apercu && !erreur && (
            <p className="p-6 text-[13px] text-slate-400">
              {enCours ? 'Composition de la pièce…' : '—'}
            </p>
          )}
          {apercu?.html && (
            /* La page telle qu'elle sortira. Le cadre est isolé : les styles
               du document ne débordent pas sur l'application, et ceux de
               l'application ne viennent pas l'embellir — ce qu'on voit est
               donc bien ce qui s'imprime. */
            /* `aria-label` ET NON `title` : le navigateur affiche tout `title`
               en infobulle NATIVE — police du système, position au curseur,
               rien de tout cela ne nous appartient, et elle venait se poser en
               travers de l'aperçu qu'on essayait de lire. `aria-label` nomme
               le cadre pour un lecteur d'écran, ce qui est le seul besoin
               réel, et n'affiche rien. */
            <iframe aria-label="Aperçu de la pièce" srcDoc={apercu.html}
              className="w-full bg-white rounded-carte shadow-pose border border-slate-200"
              style={{ height: 'calc(100vh - 14rem)', minHeight: '32rem' }} />
          )}
        </div>
      </div>

      {document0 && (
        <PreviewModal html={document0.html} titre={document0.titre}
          sousTitre={document0.nb ? `${document0.nb} ligne(s)` : null}
          nomFichier={document0.nom}
          typeDoc="rapport"
          astuceImpression="Le format est déjà posé : imprimez tel quel."
          onClose={() => setDocument0(null)} />
      )}
    </div>
  );
}


/**
 * LES PIÈCES PAR MEMBRE DU PERSONNEL — l'EA12 d'abord (Charles, 27 septembre
 * 2026 : « EA12 et annexe 2 vont dans Éditions, EA12 pour Personnel »). On
 * choisit la personne ; ses EA12 de l'année s'ouvrent, ou un nouveau se crée,
 * dans l'éditeur qui produit le Word officiel.
 */
/* Un carré, une icône ; l'avion pour tout ce qui sort une pièce. */
function Avion({ titre, onClick, disabled = false, occupe = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || occupe} title={titre} aria-label={titre}
      className="bouton bouton-sortir bouton-icone flex-none">
      {occupe ? <span className="text-[12px]">…</span> : <IconSend size={17} stroke={1.8} />}
    </button>
  );
}

function OngletPersonnel({ onClose, membreInitial = null, outilsMembre = null }) {
  const navigate = useNavigate();
  const annee = getAnnee();
  const [profs, setProfs] = useState(null);
  const [q, setQ] = useState('');
  const [choisi, setChoisi] = useState(null);
  const [ea12, setEa12] = useState(null);
  const [erreur, setErreur] = useState(null);
  /* EN SÉRIE (Charles, 27 septembre 2026 : « cocher plusieurs MDP et sortir
     les documents en série »). Deux cochés ou plus : le panneau de droite
     devient celui de la série. */
  const [coches, setCoches] = useState(() => new Set());
  const basculer = id => setCoches(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useEffect(() => {
    api.professeurs(false, annee).then(l => {
      const liste = Array.isArray(l) ? l : [];
      setProfs(liste);
      // Ouvert depuis la fiche d'un membre : il est déjà choisi.
      if (membreInitial) { const m = liste.find(x => x.id === Number(membreInitial)); if (m) setChoisi(m); }
    }).catch(() => setProfs([]));
  }, [annee, membreInitial]);
  useEffect(() => {
    if (!choisi) { setEa12(null); return; }
    setEa12(null); setErreur(null);
    fetch(`/api/ea12?professeur_id=${choisi.id}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error || `Erreur ${r.status}`); return j; })
      .then(l => setEa12(Array.isArray(l) ? l : []))
      .catch(e => { setEa12([]); setErreur(e.message); });
  }, [choisi, annee]);
  /* LES ANNEXES DE LA CIRCULAIRE 9760 : les modèles Word de la FWB, remplis de
     ce que Lucie sait (établissement, identité, et pour six d'entre elles le
     contenu propre). Le reste se complète dans Word. */
  const [annexes, setAnnexes] = useState([]);
  const [mois, setMois] = useState(() => new Date().getMonth() + 1);
  const [enCours, setEnCours] = useState(null);
  const [aCompleter, setACompleter] = useState(null);   // l'annexe ouverte dans la saisie
  /* LA FICHE : UN SEUL AVION. Si le membre porte des attributions IIP ET
     HELB, Lucie demande laquelle ; sinon elle sort la seule qui existe. */
  const [choixFiche, setChoixFiche] = useState(false);
  useEffect(() => { setChoixFiche(false); }, [choisi]);
  const imprimerFiche = async () => {
    setErreur(null); setEnCours('fiche');
    try {
      const r = await fetch(`/api/ref/professeurs/${choisi.id}/fiche-attributions?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `Erreur ${r.status}`);
      const types = new Set((j.attributions || []).map(a => a.contrat_mdp || 'IIP'));
      if (types.has('IIP') && types.has('HELB')) setChoixFiche(true);
      else outilsMembre.fiche(choisi.id, types.has('HELB') ? 'HELB' : 'IIP');
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  useEffect(() => {
    fetch('/api/formulaires', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => setAnnexes(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);
  const telecharger = async a => {
    setEnCours(a.cle); setErreur(null);
    try {
      const q = new URLSearchParams({ professeur_id: choisi.id, annee, ...(a.mois ? { mois } : {}) });
      const r = await fetch(`/api/formulaires/${a.cle}?${q}`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const nomF = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || `${a.cle}.docx`);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a'); lien.href = url; lien.download = nomF; lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const PREREMPLIES = ['A1ter', 'A4', 'A6', 'A14', 'A15', 'A27'];
  /* LE CONTRAT D'EXPERT ACCOMPAGNE TOUJOURS L'EA12 (Charles, 27 septembre
     2026) : un par niveau — supérieur, secondaire —, la période n'y étant pas
     rétribuée au même taux. Il paraît dès que la personne porte des
     prestations d'expert cette année. */
  const [statut, setStatut] = useState(null);   // { statut, cc: {periodes}, expert: {periodes, niveaux} }
  const [contrat, setContrat] = useState(null);
  useEffect(() => {
    setStatut(null);
    if (!choisi) return;
    fetch(`/api/contrats/statut/${choisi.id}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setStatut).catch(() => setStatut(null));
  }, [choisi, annee]);
  const expert = statut?.expert?.niveaux || [];
  const destinataire = choisi ? { type: 'professeur', id: choisi.id, nom: choisi.nom_prenom || '' } : null;
  /* LE CONTRAT CLASSIQUE : ses lignes CC seulement — le serveur écarte les
     lignes d'expert, qui ont leur contrat. */
  const ouvrirContratCC = async () => {
    setErreur(null);
    try {
      const r = await fetch('/api/contrats/apercu', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ prof_id: choisi.id, annee, date_contrat: new Date().toISOString().slice(0, 10), representant: 'Charles Sohet, Directeur' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setContrat({ html: j.html, titre: 'Contrat de travail — chargé de cours', nom: j.nom, typeDoc: 'contrat' });
    } catch (e) { setErreur(e.message); }
  };
  const ouvrirContrat = async niveau => {
    setErreur(null);
    try {
      const r = await fetch('/api/contrats/expert/apercu', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ prof_id: choisi.id, annee, niveau, date_contrat: new Date().toISOString().slice(0, 10) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setContrat({ html: j.html, titre: `Contrat d'expert — ${niveau === 'secondaire' ? 'secondaire' : 'supérieur'}`, nom: j.nom, typeDoc: 'contrat_expert' });
    } catch (e) { setErreur(e.message); }
  };
  const nom = p => nomPropre(p.nom_prenom || `${p.nom || ''} ${p.prenom || ''}`);
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const liste = (profs || []).filter(p => !q || norm(nom(p)).includes(norm(q))).slice(0, 60);
  const ouvrir = id => { onClose?.(); navigate(`/ea12/${id}`); };
  const creer = async () => {
    try {
      const { id } = await api.ea12Create({ professeur_id: choisi.id, annee_scolaire: annee, variante: 'bis', donnees: {} });
      ouvrir(id);
    } catch (e) { setErreur(e.message); }
  };
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] items-start">
      <div className="space-y-2">
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom du membre"
            className="controle controle-icone w-full border border-slate-300 rounded-champ bg-white text-[13px]" />
        </div>
        <div className="border border-slate-200 rounded-carte max-h-[50vh] overflow-y-auto">
          {profs === null ? <p className="p-3 text-[12px] text-slate-400">Chargement…</p>
            : !liste.length ? <p className="p-3 text-[12px] text-slate-400">Personne ne correspond.</p>
            : liste.map(p => {
              const actif = coches.size < 2 && choisi?.id === p.id;
              return (
              <div key={p.id} className={`flex items-center border-b border-slate-100 last:border-0 ${actif ? 'bg-iip-blue text-white' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" checked={coches.has(p.id)} onChange={() => basculer(p.id)}
                  aria-label={`Cocher ${nom(p)}`} className="ml-2.5 flex-none" />
                <button type="button" onClick={() => setChoisi(p)} className="flex-1 min-w-0 text-left px-2 py-1.5 text-[13px]">
                  {nom(p)}{p.statut ? <span className={`ml-1.5 text-[11px] ${actif ? 'text-white/70' : 'text-slate-400'}`}>{p.statut}</span> : null}
                </button>
              </div>
            ); })}
        </div>
        <div className="flex items-center justify-between text-[12px] text-slate-500">
          <span>{coches.size ? `${coches.size} coché${coches.size > 1 ? 's' : ''}` : 'Cochez pour produire en série'}</span>
          <span className="flex gap-3">
            {!!liste.length && <button type="button" className="underline hover:text-iip-blue"
              onClick={() => setCoches(c => new Set([...c, ...liste.map(p => p.id)]))}>Cocher la liste</button>}
            {!!coches.size && <button type="button" className="underline hover:text-iip-blue" onClick={() => setCoches(new Set())}>Décocher</button>}
          </span>
        </div>
      </div>
      <div>
        {coches.size >= 2 ? (
          <SeriePersonnel ids={[...coches]} profs={profs || []} annee={annee} annexes={annexes} nom={nom} outilsMembre={outilsMembre} />
        ) : !choisi ? (
          <p className="text-[13px] text-slate-400 italic py-6">Choisissez un membre du personnel.</p>
        ) : (
          <div className="space-y-3">
            {/* SUR LA LIGNE DES FAMILLES (Charles, 27 septembre 2026) : le nom
                remonte à hauteur de « Pièces par membre · Rapports · Listes » ;
                il y avait là une bande vide, et le nom descendait d'autant. */}
            <div className="text-[15px] font-semibold text-iip-blue md:-mt-[3.35rem] md:h-[2.6rem] md:mb-[0.75rem] flex items-center">{nom(choisi)}</div>
            {/* LE STATUT D'ABORD (Charles, 27 septembre 2026) : il dit quelles pièces
                reviennent à ce membre. Les périodes d'expert ne vont que sur l'EA12
                et le contrat d'expert ; le reste, sur le contrat et l'EA12 classiques. */}
            {statut && (
              <div data-etat={statut.statut === 'aucun' ? 'neutre' : 'disponible'} className="bloc-etat px-3 py-2 text-[13px]">
                {statut.statut === 'mixte' && <><b>Ce membre du personnel a deux statuts : expert et chargé de cours.</b> <span className="text-slate-500">{statut.cc.periodes} périodes CC · {statut.expert.periodes} périodes d'expert en {annee}</span></>}
                {statut.statut === 'expert' && <><b>Ce membre du personnel est expert.</b> <span className="text-slate-500">{statut.expert.periodes} périodes en {annee}</span></>}
                {statut.statut === 'cc' && <><b>Ce membre du personnel est chargé de cours.</b> <span className="text-slate-500">{statut.cc.periodes} périodes en {annee}</span></>}
                {statut.statut === 'aucun' && <><b>Aucune attribution en {annee}.</b> <span className="text-slate-500">Rien à contractualiser pour cette année.</span></>}
              </div>
            )}
            {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[12px]">{erreur}</div>}

            {/* LA FICHE D'ATTRIBUTIONS VAUT POUR TOUT MEMBRE (Charles, 27 septembre
                2026) — chargé de cours comme expert : c'est le relevé de ce qui
                lui est confié, avant tout contrat. */}
            {outilsMembre?.fiche && statut && statut.statut !== 'aucun' && (
              <div data-etat="neutre" className="bloc-etat px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span><span className="font-semibold">Fiche d'attributions</span> <span className="text-slate-400 text-[12px]">· ce qui lui est confié en {annee}</span></span>
                  <Avion titre="Imprimer ou envoyer la fiche d'attributions" onClick={imprimerFiche} occupe={enCours === 'fiche'} />
                </div>
                {choixFiche && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap text-[13px]">
                    <span>Ce membre du personnel a deux types de fiches. Laquelle souhaitez-vous imprimer ?</span>
                    <span className="flex gap-1.5">
                      {[['IIP', 'IIP'], ['HELB', 'HELB'], ['Les deux (globale)', null]].map(([l, f]) => (
                        <button key={l} type="button" onClick={() => { setChoixFiche(false); outilsMembre.fiche(choisi.id, f); }} className="bouton bouton-compact">{l}</button>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {statut && (statut.statut === 'cc' || statut.statut === 'mixte') && (
              <div data-etat="neutre" className="bloc-etat px-3 py-2.5 space-y-2">
                <div className="text-[13px] font-semibold">Chargé de cours</div>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  <li className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <span>Contrat de travail <span className="text-slate-400 text-[12px]">· ses périodes CC, sans les périodes d'expert</span></span>
                    <Avion titre="Imprimer ou envoyer le contrat" onClick={ouvrirContratCC} />
                  </li>
                  <li className="py-1.5 text-[13px] space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span>EA12 — Doc12 supérieur <span className="text-slate-400 text-[12px]">· le Word officiel, rempli par Lucie</span></span>
                      <button type="button" onClick={creer} title="Nouvel EA12" aria-label="Nouvel EA12" className="bouton bouton-icone flex-none"><IconFilePlus size={17} stroke={1.8} /></button>
                    </div>
                    {ea12 === null ? <p className="text-[12px] text-slate-400">Chargement…</p>
                      : !ea12.length ? <p className="text-[12px] text-slate-400">Aucun EA12 pour {annee}.</p>
                      : ea12.map(e => (
                        <div key={e.id} className="flex items-center justify-between gap-3 pl-3 text-[12px] text-slate-600">
                          <span>Document n° {e.num_doc ?? '—'} · modifié le {String(e.modifie_le || e.cree_le || '').slice(0, 10).split('-').reverse().join('/')}{e.statut_doc === 'genere' ? ' · déjà produit' : ''}</span>
                          <Avion titre="Ouvrir, compléter et produire cet EA12" onClick={() => ouvrir(e.id)} />
                        </div>
                      ))}
                  </li>
                </ul>
              </div>
            )}

            {!!expert.length && (
              <div data-etat="neutre" className="bloc-etat px-3 py-2.5 space-y-2">
                <div className="text-[13px] font-semibold">Expert</div>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {expert.map(n => (
                    <li key={n.niveau} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span>Contrat d'emploi d'un expert — {n.niveau === 'secondaire' ? 'secondaire' : 'supérieur'}
                        <span className="text-slate-400 text-[12px]"> · {n.periodes} périodes, {n.unites} unité{n.unites > 1 ? 's' : ''} · {String(n.taux).replace('.', ',')} €/période</span></span>
                      <Avion titre="Imprimer ou envoyer le contrat d'expert" onClick={() => ouvrirContrat(n.niveau)} />
                    </li>
                  ))}
                  {annexes.filter(a => a.cle === 'A1ter' || a.cle === 'A27').map(a => (
                    <li key={a.cle} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span>{a.titre}{a.mois && <span className="text-slate-400 text-[12px]"> · mois de {['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][mois - 1]}</span>}</span>
                      {a.saisie
                        ? <Avion titre="Compléter dans Lucie, puis produire en Word ou PDF" onClick={() => setACompleter(a)} />
                        : <Avion titre="Produire le Word officiel" onClick={() => telecharger(a)} occupe={enCours === a.cle} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!annexes.length && (
              <div data-etat="neutre" className="bloc-etat px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[13px] font-semibold">Autres annexes de la circulaire 9760</div>
                    <div className="text-[12px] text-slate-500">Le modèle Word officiel, établissement et identité remplis.</div>
                  </div>
                  <label className="text-[12px] text-slate-600 inline-flex items-center gap-1.5">Mois des relevés
                    <select value={mois} onChange={e => setMois(Number(e.target.value))} className="controle border border-slate-300 rounded-champ bg-white text-[12px]">
                      {['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'].map((m, i) =>
                        <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </label>
                </div>
                <ul className="grid gap-x-4 sm:grid-cols-2 border-t border-slate-100">
                  {annexes.filter(a => !a.ea12 && a.cle !== 'A1ter' && a.cle !== 'A27').map(a => (
                    <li key={a.cle} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 text-[13px]">
                      <span className="min-w-0 truncate" title={a.titre}>
                        {a.titre}
                        {PREREMPLIES.includes(a.cle) && <span className="ml-1.5 text-[10px] text-slate-400">pré-rempli</span>}
                      </span>
                      {a.saisie
                        ? <Avion titre="Compléter dans Lucie, puis produire en Word ou PDF" onClick={() => setACompleter(a)} />
                        : <Avion titre="Produire le Word officiel" onClick={() => telecharger(a)} occupe={enCours === a.cle} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {aCompleter && choisi && <SaisieAnnexe annexe={aCompleter} membre={{ id: choisi.id, nom: nom(choisi) }} annee={annee}
        moisInitial={mois} onFermer={() => setACompleter(null)} />}
      {contrat && <PreviewModal html={contrat.html} titre={contrat.titre} nomFichier={contrat.nom}
        destinataire={destinataire} typeDoc={contrat.typeDoc} sujetMail={`${contrat.titre} — Institut Ilya Prigogine`}
        onClose={() => setContrat(null)} />}
    </div>
  );
}

/* LA SÉRIE : les mêmes pièces, pour chaque membre coché, remplies de SES
   données. Les contrats partent dans un seul document — chacun sur sa page,
   et chacun seulement si le statut du membre l'appelle ; les Word (EA12,
   annexes) dans une archive, un dossier par personne. */
function SeriePersonnel({ ids, profs, annee, annexes, nom, outilsMembre = null }) {
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const [types, setTypes] = useState({ cc: true, expert: true });
  const [cles, setCles] = useState(() => new Set(['A1bis']));
  const [mois, setMois] = useState(() => new Date().getMonth() + 1);
  const [enCours, setEnCours] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [avis, setAvis] = useState(null);
  const [contrat, setContrat] = useState(null);
  const [choixFiches, setChoixFiches] = useState(false);
  const bascule = k => setCles(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const noms = ids.map(id => profs.find(p => p.id === id)).filter(Boolean).map(nom);
  const pieces = [{ cle: 'A1bis', titre: 'EA12 — Doc12 supérieur (A1 bis)' },
    ...annexes.filter(a => !a.ea12).map(a => ({ cle: a.cle, titre: a.titre, mois: a.mois }))];
  const besoinMois = pieces.some(a => a.mois && cles.has(a.cle));
  const contrats = async () => {
    setEnCours('contrats'); setErreur(null); setAvis(null);
    try {
      const r = await fetch('/api/contrats/lot', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ professeurs: ids, annee, types: Object.keys(types).filter(k => types[k]),
          date_contrat: new Date().toISOString().slice(0, 10) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      if (j.ignores?.length) setAvis(`Sans contrat à produire : ${j.ignores.join(', ')}.`);
      setContrat({ html: j.html, nom: j.nom, titre: `Contrats — ${j.nombre} pièce${j.nombre > 1 ? 's' : ''}` });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const archive = async () => {
    setEnCours('zip'); setErreur(null); setAvis(null);
    try {
      const r = await fetch('/api/formulaires/lot', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ professeurs: ids, cles: [...cles], annee, mois }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error([j.error, ...(j.erreurs || [])].filter(Boolean).join(' — ') || `Erreur ${r.status}`); }
      const e = r.headers.get('X-Lucie-Erreurs');
      if (e) setAvis(`Non produit : ${decodeURIComponent(e)}`);
      const url = URL.createObjectURL(await r.blob());
      const lien = document.createElement('a'); lien.href = url; lien.download = `Pieces_personnel_${annee}.zip`; lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  return (
    <div className="space-y-3">
      <div className="text-[15px] font-semibold text-iip-blue md:-mt-[3.35rem] md:h-[2.6rem] md:mb-[0.75rem] flex items-center">En série — {ids.length} membres</div>
      <div data-etat="disponible" className="bloc-etat px-3 py-2 text-[13px]">
        <b>Chaque pièce est remplie des données de chaque membre.</b>{' '}
        <span className="text-slate-500">{noms.slice(0, 6).join(', ')}{noms.length > 6 ? ` et ${noms.length - 6} autres` : ''}.</span>
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[12px]">{erreur}</div>}
      {avis && <div data-etat="surveiller" className="bloc-etat px-3 py-2 text-[12px]">{avis}</div>}

      {outilsMembre?.fichesLot && (
        <div data-etat="neutre" className="bloc-etat px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <div>
              <div className="font-semibold">Fiches d'attributions</div>
              <div className="text-[12px] text-slate-500">Une fiche par membre, chacune sur sa page.</div>
            </div>
            <Avion titre="Imprimer ou envoyer les fiches d'attributions" onClick={() => setChoixFiches(c => !c)} />
          </div>
          {choixFiches && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap text-[13px]">
              <span>Quelles fiches imprimer ? Un membre sans attribution du type choisi n'a pas de fiche.</span>
              <span className="flex gap-1.5">
                {[['IIP', 'IIP'], ['HELB', 'HELB'], ['Globales', 'GLOBAL']].map(([l, t]) => (
                  <button key={l} type="button" onClick={() => { setChoixFiches(false); outilsMembre.fichesLot(ids, t); }} className="bouton bouton-compact">{l}</button>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      <div data-etat="neutre" className="bloc-etat px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Contrats de travail</div>
            <div className="text-[12px] text-slate-500">Selon le statut de chacun : classique sur ses périodes CC, d'expert par niveau. Un seul document, une pièce par page.</div>
          </div>
          <Avion titre="Imprimer ou envoyer les contrats" onClick={contrats} disabled={!!enCours || (!types.cc && !types.expert)} occupe={enCours === 'contrats'} />
        </div>
        <div className="flex gap-4 text-[13px] border-t border-slate-100 pt-1.5">
          {[['cc', 'Chargé de cours'], ['expert', 'Expert']].map(([k, l]) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={types[k]} onChange={() => setTypes(t => ({ ...t, [k]: !t[k] }))} />{l}
            </label>
          ))}
        </div>
      </div>

      <div data-etat="neutre" className="bloc-etat px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13px] font-semibold">EA12 et annexes de la circulaire 9760</div>
            <div className="text-[12px] text-slate-500">Le Word officiel, rempli pour chacun ; une archive, un dossier par personne.</div>
          </div>
          <span className="flex items-center gap-2">
            {besoinMois && (
              <select value={mois} onChange={e => setMois(Number(e.target.value))} aria-label="Mois des relevés"
                className="controle border border-slate-300 rounded-champ bg-white text-[12px]">
                {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            )}
            <Avion titre={`Produire les ${cles.size} pièce${cles.size > 1 ? 's' : ''} cochée${cles.size > 1 ? 's' : ''} (archive Word)`} onClick={archive} disabled={!!enCours || !cles.size} occupe={enCours === 'zip'} />
          </span>
        </div>
        <ul className="grid gap-x-4 sm:grid-cols-2 border-t border-slate-100">
          {pieces.map(a => (
            <li key={a.cle} className="py-1 border-b border-slate-100 text-[13px]">
              <label className="flex items-center gap-2 min-w-0" title={a.titre}>
                <input type="checkbox" checked={cles.has(a.cle)} onChange={() => bascule(a.cle)} className="flex-none" />
                <span className="truncate">{a.titre}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {contrat && <PreviewModal html={contrat.html} titre={contrat.titre} nomFichier={contrat.nom}
        typeDoc="contrat" onClose={() => setContrat(null)} />}
    </div>
  );
}

function OngletEtudiants({ perimetre = null }) {
  /* L'ANNÉE SE CHOISIT ICI AUSSI. L'onglet des rapports la montre depuis
     longtemps ; celui des étudiants reprenait l'année de travail sans jamais
     la dire. Pour retirer une attestation de l'an dernier, il fallait changer
     l'année de toute l'application, produire la pièce, puis penser à la
     remettre — et la fenêtre couvre justement le sélecteur de la barre. */
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => setAnnees([annee]));
    // eslint-disable-next-line
  }, []);
  const [arbre, setArbre] = useState(null);
  // LE CONTEXTE SUIT LE BOUTON. Ouvrir le centre depuis la délibération d'une
  // unité sans que cette unité soit déjà choisie ferait recommencer un travail
  // qu'on venait de faire : on arrive là où l'on était.
  const [session, setSession] = useState(perimetre?.session === 2 ? 2 : 1);
  const [sections, setSections] = useState(() => new Set(perimetre?.sections || []));
  const [ues, setUes] = useState(() => new Set(perimetre?.ue_nums || []));
  const [cours, setCours] = useState(() => new Set(perimetre?.cours_codes || []));
  const [deplie, setDeplie] = useState(() => new Set());
  // LES SECTIONS SE REPLIENT (Charles, 27 septembre 2026 : « pour gagner en
  // place ») : on ouvre celle où l'on travaille.
  const [secOuvertes, setSecOuvertes] = useState(() => new Set());
  const [recherche, setRecherche] = useState('');
  const [liste, setListe] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  /* RIEN N'EST COCHÉ AU DÉPART — NULLE PART.
     Trois pièces l'étaient d'office : on ouvrait l'écran pour en sortir une, et
     l'on en produisait trois sans l'avoir demandé. Une case pré-cochée sur un
     écran qui IMPRIME et ENVOIE n'est pas une commodité, c'est un envoi de
     travers en attente — et un courriel parti ne se rattrape pas.
     Le choix se fait, il ne se subit pas : on coche ce qu'on veut. */
  const [choix, setChoix] = useState({});
  const [separer, setSeparer] = useState(
    () => localStorage.getItem('impression.separer') === '1');
  // L'envoi ne se montre que s'il est allumé ET permis. La route refuse de
  // toute façon : un bouton caché n'est pas une protection, c'est une
  // politesse envers qui n'a rien à faire là.
  const etatEnvoi = useEnvoiMail();
  const [envoi, setEnvoi] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch(`/api/perimetre/arborescence?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(setArbre).catch(e => setErreur(e.message));
  }, [annee]);

  const bascule = (set, valeur) => {
    const n = new Set(set);
    n.has(valeur) ? n.delete(valeur) : n.add(valeur);
    return n;
  };

  const charger = useCallback(async () => {
    setErreur(null);
    if (!sections.size && !ues.size && !cours.size) { setListe(null); return; }
    try {
      const rep = await fetch('/api/perimetre/etudiants', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session,
          sections: [...sections], ue_nums: [...ues], cours_codes: [...cours],
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setListe(j);
      // Tous cochés par défaut DANS LE PÉRIMÈTRE choisi : la sélection sert à
      // restreindre, non à tout reconstruire. Rien n'est coché tant qu'aucun
      // périmètre n'est posé.
      setCoches(new Set(j.etudiants.filter(e => e.decide).map(e => e.id)));
    } catch (e) { setErreur(e.message); }
  }, [annee, session, sections, ues, cours]);
  useEffect(() => { charger(); }, [charger]);

  const etudiants = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = liste?.etudiants || [];
    return q ? l.filter(e => `${e.nom} ${e.prenom}`.toLowerCase().includes(q)) : l;
  }, [liste, recherche]);

  async function produire() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/documents-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session, separer,
          // La feuille de délibération ouvre le centre SUR UNE ORGANISATION :
          // ses pièces — PV, grille, notifications — ne portent alors qu'elle.
          org: perimetre?.org ?? undefined,
          ue_nums: (liste?.unites || []).map(u => u.ue_num),
          etudiants: [...coches],
          ...choix,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s), mais : ${j.manques.slice(0, 4).join(' · ')}`
          + (j.manques.length > 4 ? ' …' : ''));
      }
      const tout = j.separes
        ? [...(j.collectif ? [j.collectif] : []), ...j.documents]
        : [{ nom: (j.nom || 'documents').replace(/\.html$/, ''), html: j.html }];
      for (const d of tout) {
        const rp = await fetch('/api/impression/pdf', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ html: d.html, nom: d.nom, pagination: 'si-plusieurs' }),
        });
        if (!rp.ok) { setErreur(`${d.etudiant || d.nom} : PDF non produit.`); return; }
        const url = URL.createObjectURL(await rp.blob());
        const a = document.createElement('a');
        a.href = url; a.download = `${d.nom}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        await new Promise(r => setTimeout(r, 350));
      }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * ENVOYER : UNE PIÈCE, UNE PERSONNE, UN COURRIEL.
   *
   * La séparation par étudiant est FORCÉE, quoi que dise la case : on
   * n'adresse pas à quelqu'un un document qui porte vingt noms. Les pièces
   * collectives — procès-verbal, composition, grille — restent groupées et
   * partent à la composition du Conseil, à la boîte des examens et à la
   * direction adjointe, chacun recevant la sienne.
   *
   * Le destinataire ne se choisit pas : il découle de la pièce.
   */
  async function envoyer() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/documents-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session, separer: true,
          org: perimetre?.org ?? undefined,
          ue_nums: (liste?.unites || []).map(u => u.ue_num),
          etudiants: [...coches],
          ...choix,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }

      const pieces = (j.documents || []).map(d => ({
        html: d.html, nom_fichier: d.nom,
        destinataire: { type: 'etudiant', id: d.etudiant_id, nom: d.etudiant },
      }));

      if (j.collectif) {
        // Une pièce du Conseil se rattache à UNE unité : sans elle, on ne sait
        // pas quelle composition interroger. Quand le périmètre en porte
        // plusieurs, on ne devine pas — on le dit.
        const unites = (liste?.unites || []).map(u => u.ue_num);
        if (unites.length !== 1) {
          setErreur("Les pièces du Conseil ne s'envoient que pour une unité à la "
            + `fois (${unites.length} dans ce périmètre) : restreignez le périmètre, `
            + 'ou décochez-les.');
          return;
        }
        const rd = await fetch('/api/envois/destinataires?regle=conseil'
          + `&ue=${unites[0]}&annee=${encodeURIComponent(annee)}`,
          { headers: authHeaders() });
        for (const m of (rd.ok ? await rd.json() : [])) {
          pieces.push({
            html: j.collectif.html, nom_fichier: j.collectif.nom,
            destinataire: { type: m.type, id: m.id, nom: m.nom, email: m.email || '' },
          });
        }
      }

      if (!pieces.length) { setErreur('Aucune pièce à envoyer.'); return; }
      setEnvoi(pieces);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const rien = !sections.size && !ues.size && !cours.size;

  return (
    <div className="flex min-h-0 flex-1">
      {/* LE PÉRIMÈTRE */}
      <div className="w-[340px] border-r border-slate-200 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200">
          <div className="text-[13px] font-semibold text-iip-blue mb-1.5">Périmètre</div>
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            title="L'année sur laquelle portent les pièces"
            className="controle w-full mb-2 text-[13px]">
            {(annees.length ? annees : [annee]).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div className="segments w-full">
            {[[1, '1re session'], [2, '2e session']].map(([v, lib]) => (
              <button key={v} onClick={() => setSession(v)}
                className={`flex-1 px-2 py-1 text-[12px] ${session === v
                  ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                {lib}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {(arbre?.sections || []).map(sec => (
            <div key={sec}>
              {(() => {
                const us = (arbre?.unites || []).filter(u => u.section === sec);
                const nCoches = us.filter(u => ues.has(u.ue_num)).length;
                const ouverte = secOuvertes.has(sec);
                return (
                  <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-slate-50">
                    <button type="button" onClick={() => setSecOuvertes(o => bascule(o, sec))}
                      aria-label={ouverte ? `Replier ${sec}` : `Déplier ${sec}`} className="text-slate-400 hover:text-slate-700">
                      {ouverte ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </button>
                    <input type="checkbox" checked={sections.has(sec)}
                      onChange={() => setSections(s => bascule(s, sec))}
                      aria-label={`Toute la section ${sec}`} className="w-4 h-4 accent-iip-blue" />
                    <button type="button" onClick={() => setSecOuvertes(o => bascule(o, sec))}
                      className="flex-1 min-w-0 text-left text-[13px] font-medium text-slate-800">
                      {sec} <span className="text-[11px] font-normal text-slate-400">· {us.length} unité{us.length > 1 ? 's' : ''}{nCoches ? ` · ${nCoches} cochée${nCoches > 1 ? 's' : ''}` : ''}</span>
                    </button>
                  </div>
                );
              })()}
              {secOuvertes.has(sec) && <div className="pl-4">
                {(arbre?.unites || []).filter(u => u.section === sec).map(u => (
                  <div key={u.ue_num}>
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                      <input type="checkbox" checked={ues.has(u.ue_num)}
                        disabled={sections.has(sec)}
                        onChange={() => setUes(s => bascule(s, u.ue_num))}
                        className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                      <button onClick={() => setDeplie(d => bascule(d, u.ue_num))}
                        className="text-slate-400 hover:text-slate-700">
                        {deplie.has(u.ue_num)
                          ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                      </button>
                      <span className="text-[12px] text-slate-700 truncate">
                        <b>{u.ue_num}</b> {u.ue_nom}
                      </span>
                    </div>
                    {deplie.has(u.ue_num) && (
                      <div className="pl-8">
                        {u.cours.map(c => (
                          <label key={c.cours_code}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 cursor-pointer">
                            <input type="checkbox" checked={cours.has(c.cours_code)}
                              disabled={sections.has(sec) || ues.has(u.ue_num)}
                              onChange={() => setCours(s => bascule(s, c.cours_code))}
                              className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                            <span className="text-[12px] text-slate-500 truncate">
                              {c.cours_code} {c.cours_nom}
                            </span>
                          </label>
                        ))}
                        {!u.cours.length && (
                          <div className="text-[11px] text-slate-400 px-1.5">aucun cours</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>}
            </div>
          ))}
          {!arbre && <div className="text-[12px] text-slate-400 p-2">Chargement…</div>}
        </div>

        <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
          Un cours sert à désigner des personnes : les pièces restent celles de
          leur unité.
        </div>
      </div>

      {/* LES PERSONNES ET LES PIÈCES */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Un nom…"
              className="pl-7 pr-2 py-1 text-[12px] border border-slate-300 rounded-lg w-48" />
          </div>
          <button onClick={() => setCoches(new Set(etudiants.filter(e => e.decide).map(e => e.id)))}
            className="text-[12px] text-iip-blue underline">tout cocher</button>
          <button onClick={() => setCoches(new Set())}
            className="text-[12px] text-slate-500 underline">tout décocher</button>
          <span className="flex-1" />
          <span className="text-[12px] text-slate-500">
            {coches.size} / {etudiants.length} étudiant(s)
            {liste?.unites?.length ? ` · ${liste.unites.length} unité(s)` : ''}
          </span>
        </div>

        {/* CE QU'ON PRODUIT SE DÉCIDE AVANT DE CHOISIR QUI.
            Le choix des pièces et le bouton vivaient SOUS la liste : avec
            seize étudiants on les voyait, avec deux cents il fallait
            parcourir tout l'écran pour les atteindre, et le bouton
            disparaissait à mesure que le travail grossissait. Ils passent
            au-dessus : la liste peut alors s'allonger autant qu'elle veut. */}
        <div className="border-b border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {PIECES.map(p => (
              <label key={p.cle}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                  cursor-pointer text-[12px] ${choix[p.cle]
                    ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={!!choix[p.cle]}
                  onChange={() => setChoix(c => ({ ...c, [p.cle]: !c[p.cle] }))}
                  className="w-3.5 h-3.5 accent-iip-blue" />
                {p.label}
                {!p.nominatif && <span className="text-[10px] text-slate-400">collectif</span>}
              </label>
            ))}
          </div>

          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[13px]
                            flex items-start gap-2">
              <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={separer}
                onChange={e => {
                  setSeparer(e.target.checked);
                  localStorage.setItem('impression.separer', e.target.checked ? '1' : '0');
                }}
                className="w-4 h-4 accent-iip-blue" />
              Un document par étudiant
            </label>
            <span className="flex-1" />
            <button onClick={produire} disabled={enCours || !coches.size}
              className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
              <IconPrinter size={14} />
              {enCours ? 'Production…' : `Produire pour ${coches.size} étudiant(s)`}
            </button>
            {etatEnvoi?.actif && etatEnvoi?.peut_envoyer && (
              <button onClick={envoyer} disabled={enCours || !coches.size}
                title="Envoyer par courriel — un document par personne, jamais de copie collective"
                className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                           font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
                <IconSend size={14} /> Envoyer
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          {rien && (
            <p className="p-6 text-[13px] text-slate-400">
              Choisissez un périmètre à gauche : une section, des unités, ou des
              cours.
            </p>
          )}
          {!rien && !etudiants.length && (
            <p className="p-6 text-[13px] text-slate-400">
              Aucun étudiant dans ce périmètre.
            </p>
          )}
          {etudiants.map(e => (
            <label key={e.id}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100
                          cursor-pointer ${e.decide ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={coches.has(e.id)} disabled={!e.decide}
                onChange={() => setCoches(s => bascule(s, e.id))}
                className="w-4 h-4 accent-iip-blue" />
              <span className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">{nomPropre(e.nom, e.prenom)}</span>
                <span className="block text-[11px] text-slate-500">
                  {e.decide
                    ? `${e.reussites} réussite(s) · ${e.echecs} échec(s) sur ${e.unites.length} unité(s)`
                    : 'aucune décision pour cette session'}
                </span>
              </span>
            </label>
          ))}
        </div>

      </div>

      {envoi && (
        <EnvoiMailModal
          pieces={envoi}
          typeDoc="deliberation_lot"
          sujet={`Documents de délibération — ${annee}`}
          onClose={() => setEnvoi(null)} />
      )}
    </div>
  );
}

/**
 * LES PIÈCES PROPRES À L'ÉCRAN D'OÙ L'ON VIENT.
 *
 * Certaines éditions ne sont pas des rapports du catalogue : elles ont leur
 * propre fenêtre, bâtie pour elles. Elles occupaient chacune une icône du
 * rail — « Rapport de la liste », « Rapport PAE » —, ce qui revenait à
 * afficher un sommaire au mur plutôt que dans le livre. Elles se déclarent
 * ici, en tête du centre : une pièce de plus ne coûte plus une icône.
 */
function PiecesDeLEcran({ pieces, onChoisir }) {
  if (!pieces || !pieces.length) return null;
  return (
    <GroupeFenetre titre="Pièces de cet écran">
      {pieces.map(p => (
        <PieceFenetre key={p.cle} icone={p.icon} titre={p.label} sous={p.description}
          onClick={() => onChoisir(p)} />
      ))}
    </GroupeFenetre>
  );
}

export default function CentreImpressionCentral({ ongletInitial = 'etudiants',
                                                  perimetre = null, pieces = null,
                                                  membreInitial = null, outilsMembre = null,
                                                  onClose }) {
  const [onglet, setOnglet] = useState(ongletInitial);
  // Dans un axe qui porte deux familles : les pièces par personne, ou les
  // rapports du catalogue. On entre par les pièces, qui sont le quotidien.
  /* La famille par défaut : les pièces dans Étudiants — c'est son métier —,
     les rapports partout ailleurs. Elle se remet à sa valeur d'origine quand
     on change d'axe : « Listes » laissé actif en passant de Personnel à
     Gestion ouvrait une colonne vide, et l'on croyait l'axe vide. */
  const [famille, setFamille] = useState('pieces');
  // Personnel s'ouvre aussi sur ses pièces : contrats, fiches, EA12, annexes.
  useEffect(() => { setFamille(onglet === 'etudiants' || onglet === 'personnel' ? 'pieces' : 'rapports'); }, [onglet]);

  return (
    /* L'AVION, ET LE SOUS-TITRE AVEC LUI.
       La porte du rail portait l'avion et la fenêtre l'imprimante : on cliquait
       sur un envoi pour tomber sur une impression. Depuis que ce centre envoie
       aussi par courriel, « tout ce que Lucie imprime » n'était plus vrai — et
       un sous-titre qui ment coûte plus cher qu'une icône qui dépareille. */
    <Fenetre icone={IconSend} titre="Éditions"
      sous="Tout ce que Lucie produit — à imprimer ou à envoyer."
      large="pleine" onFermer={onClose}>

      <PiecesDeLEcran pieces={pieces}
        onChoisir={p => { onClose?.(); p.onClick?.(); }} />

      {/* Les domaines : ce qu'on sort ici porte sur les étudiants, le
          personnel, l'établissement… Le domaine ouvert est le seul en marine. */}
      <div className="flex gap-1 flex-wrap mb-4 pb-3 border-b border-slate-200">
        {ONGLETS.map(o => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`px-3 py-1.5 rounded-champ text-[13px] inline-flex items-center gap-1.5
              transition-colors duration-150 ease-ios
              ${onglet === o.cle
                ? 'bg-iip-blue text-white font-semibold'
                : 'text-slate-500 hover:bg-slate-100'}`}>
            <o.icon size={14} /> {o.label}
          </button>
        ))}
      </div>

      {/* UN AXE PEUT PORTER DEUX FAMILLES, ET L'ÉCRAN DOIT LES MONTRER TOUTES.
          Étudiants a son écran propre — un périmètre, des pièces NOMINATIVES
          qu'on produit par personne — et il ne rendait QUE cela. En y rangeant
          les rapports qui comptent des étudiants (résultats de délibération,
          effectifs par section), je les avais rendus INJOIGNABLES : rangés dans
          un axe dont l'onglet n'affiche pas le catalogue.
          Ranger sans vérifier que la pièce arrive quelque part, c'est déplacer
          un dossier dans un tiroir qui n'existe pas. L'axe porte donc une
          bascule quand il a les deux familles. */}
      {onglet === 'etudiants' ? (
        <>
          <div className="px-1 pb-3">
            <span className="seg-fam">
              <button onClick={() => setFamille('pieces')}
                className={famille === 'pieces' ? 'on' : ''}>
                Pièces par étudiant
              </button>
              {/* LA VALORISATION EST UNE FAMILLE À PART, ET NON UNE PIÈCE
                  « PAR ÉTUDIANT ». Le procès-verbal d'annexe 4 porte TOUS les
                  étudiants valorisés dans l'unité : le ranger avec les pièces
                  nominatives, dont l'écran demande d'abord « quels étudiants »,
                  aurait fait poser la mauvaise question. Ici on choisit
                  l'UNITÉ, parce que c'est elle qui convoque le conseil. */}
              <button onClick={() => setFamille('valorisation')}
                className={famille === 'valorisation' ? 'on' : ''}>
                Valorisation des acquis
              </button>
              <button onClick={() => setFamille('rapports')}
                className={famille === 'rapports' ? 'on' : ''}>
                Rapports
              </button>
              <button onClick={() => setFamille('listes')}
                className={famille === 'listes' ? 'on' : ''}>
                Listes
              </button>
            </span>
          </div>
          {famille === 'pieces' ? <OngletEtudiants perimetre={perimetre} />
            : famille === 'valorisation' ? <OngletValorisation />
            : famille === 'listes' ? <CadreListes domaine="etudiants" />
            : <OngletRapports domaine="etudiants" />}
        </>
      ) : (
        /* CHAQUE AXE PORTE SES DEUX FAMILLES, ET LE GÉNÉRATEUR N'EST PLUS UN
           SECOND CATALOGUE. « Construire une liste » proposait les seize listes
           prédéfinies, ET les mêmes reparaissaient dans Personnel, Organisation,
           Gestion : deux chemins pour une même pièce, et plus moyen de dire
           lequel fait foi. La liste vit maintenant dans SON axe — c'est ce que
           disait la proposition validée — et l'onglet en tête redevient ce
           qu'il est, l'OUTIL où l'on choisit ses colonnes. */
        <>
          <div className="px-1 pb-3">
            <span className="seg-fam">
              {onglet === 'personnel' && (
                <button onClick={() => setFamille('pieces')}
                  className={famille === 'pieces' ? 'on' : ''}>
                  Pièces par membre
                </button>
              )}
              <button onClick={() => setFamille('rapports')}
                className={famille === 'listes' || (onglet === 'personnel' && famille === 'pieces') ? '' : 'on'}>
                Rapports
              </button>
              <button onClick={() => setFamille('listes')}
                className={famille === 'listes' ? 'on' : ''}>
                Listes
              </button>
            </span>
          </div>
          {onglet === 'personnel' && famille === 'pieces' ? <OngletPersonnel onClose={onClose} membreInitial={membreInitial} outilsMembre={outilsMembre} />
            : famille === 'listes'
            ? <CadreListes domaine={onglet} />
            : <OngletRapports domaine={onglet} />}
        </>
      )}
    </Fenetre>
  );
}
