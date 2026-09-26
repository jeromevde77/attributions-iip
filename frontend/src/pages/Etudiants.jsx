import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import { couleurBloc } from '../lib/blocs.js';
import { RailLateral } from '../components/ui.jsx';
import SuiviEtudiant from '../components/SuiviEtudiant.jsx';
import NouvelEtudiant from '../components/NouvelEtudiant.jsx';
import {
  IconAddressBook, IconAlertTriangle, IconArchive, IconDoorExit, IconSchool, IconArrowBackUp, IconAward, IconCertificate, IconStairsUp, IconUserPlus, IconCheck, IconChecklist, IconChevronLeft, IconChevronRight, IconClock, IconFileText, IconFolder, IconPlus, IconPrinter, IconSearch, IconTable, IconTrash, IconUpload, IconUser, IconSend, IconWritingSign, IconWritingSignOff, IconX,
  IconChecks,
} from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import SchemaCapitalisationVue from '../components/SchemaCapitalisation.jsx';
import Amenagements from '../components/Amenagements.jsx';
import Stages from '../components/Stages.jsx';
import IdentiteEtudiant, { ComplementDossiers } from '../components/IdentiteEtudiant.jsx';
// LE CENTRE CENTRAL. Les boutons restent où on les cherche — là où l'on
// travaille — mais mènent désormais au même endroit.
import CentreImpressionCentral from '../components/CentreImpressionCentral.jsx';
import { useEchangesDuRail, Fenetre, Encadre, BulleAide } from '../components/ui.jsx';
import PassageAnnee from '../components/PassageAnnee.jsx';
import ComposerPAE from '../components/ComposerPAE.jsx';
import CentreEchanges from '../components/CentreEchanges.jsx';
import CentreDiplomation from '../components/CentreDiplomation.jsx';
import SeanceValorisation from '../components/SeanceValorisation.jsx';
import ImportSurMesure from '../components/ImportSurMesure.jsx';
import ImportSignaletique from '../components/ImportSignaletique.jsx';
import RattacherPack from '../components/RattacherPack.jsx';
import ImportSuivi from '../components/ImportSuivi.jsx';
import Annexe2 from '../components/Annexe2.jsx';
import MotivationDecision from '../components/MotivationDecision.jsx';
import MenuActions from '../components/MenuActions.jsx';
import ComparaisonClasseur from '../components/ComparaisonClasseur.jsx';
import ImportPAE from '../components/ImportPAE.jsx';
import PurgeResultats from '../components/PurgeResultats.jsx';
import RapportPAE from '../components/RapportPAE.jsx';
import ImportListe from '../components/ImportListe.jsx';
import DroitInscription from '../components/DroitInscription.jsx';
import FraisScolarite from '../components/FraisScolarite.jsx';
import ImportHistorique from '../components/ImportHistorique.jsx';

// Niveau de l'étudiant : BA1/BA2 s'il ne suit qu'une année, « Diplômant »
// s'il ne lui reste que la BA3, « Parcours » s'il en mélange plusieurs.
// Couleurs des années d'études, communes à Lucie (cf. exports Attributions) :
// BA1 orange, BA2 bleu clair, BA3 bleu marine, puis violet et rose au-delà.
const NIV_PALETTE = ['#F97316', '#60A5FA', '#1E3A8A', '#A855F7', '#EC4899'];

function couleurNiveau(niv) {
  const m = /^BA(\d+)$/i.exec(String(niv || '').trim());
  if (!m) return null;
  return NIV_PALETTE[(Number(m[1]) - 1) % NIV_PALETTE.length];
}

// Pastille d'année d'études, sur fond plein pour rester lisible.
function BadgeUeNiveau({ niveau }) {
  const couleur = couleurNiveau(niveau);
  if (!niveau) return <span className="text-[11px] text-slate-300">—</span>;
  if (!couleur) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
        {niveau}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
      style={{ backgroundColor: couleur }}>
      {niveau}
    </span>
  );
}

// En-tête de colonne triable : un clic trie, un second inverse le sens.
function ThTri({ champ, tri, onTri, className = '', children }) {
  const actif = tri.champ === champ;
  return (
    <th onClick={() => onTri(champ)}
      className={`px-4 py-2.5 cursor-pointer select-none hover:bg-slate-100 transition ${className}`}
      title="Trier sur cette colonne">
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[10px] leading-none ${actif ? 'text-iip-turquoise' : 'text-slate-300'}`}>
          {actif ? (tri.sens === 1 ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  );
}

function BadgeNiveau({ niveau, libelle, className = '' }) {
  if (!libelle) return null;
  const cls = niveau === 'MIXTE' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : niveau === 'BA3'          ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-sky-50 text-sky-700 border-sky-200';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls} ${className}`}>
      {libelle}
    </span>
  );
}

/* LA FRISE DU PARCOURS, SUR LA LIGNE DE LA LISTE (Charles, 26 septembre
   2026) : les UE de la section dans l'ordre du cursus, groupées par bloc,
   l'épreuve intégrée au bout. Une lettre par UE (voir /api/etudiants/frises). */
const SENS_PUCE = { r: 'réussie', f: 'réussie par faveur', i: 'inscrite cette année',
  a: 'ajournée, en attente', o: 'atteignable, non prise', n: 'pas encore atteignable' };
function FriseParcours({ ues, codes }) {
  if (!ues?.length || !codes) return null;
  const groupes = [];
  ues.forEach((u, i) => {
    const b = u.ei ? 'EI' : (u.bloc || '—');
    if (!groupes.length || groupes[groupes.length - 1].b !== b) groupes.push({ b, l: [] });
    groupes[groupes.length - 1].l.push({ ...u, c: codes[i] || 'n' });
  });
  return (
    /* SANS BARRES NI CADRE (Charles, 26 septembre 2026) : un ESPACE entre deux
       blocs dit le changement d'année ; le bloc se lit au survol. */
    <div className="flex items-center gap-2.5">
      {groupes.map((g, gi) => (
        <span key={gi} className="flex gap-[2px]" title={g.b === 'EI' ? 'Épreuve intégrée' : g.b}>
          {g.l.map(u => (
            <span key={u.ue_num} data-c={u.c} className={`puce-ue ${u.ei ? 'ei' : ''}`}
              title={`UE ${u.ue_num} — ${u.ue_nom || ''} · ${SENS_PUCE[u.c] || ''}`}>
              {u.ue_num}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

const STATUTS_PIECE = [
  { val: 'manquant', label: 'Manquant', cls: 'bg-red-50 text-red-700 border-red-200' },
  { val: 'recu',     label: 'Reçu',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { val: 'na',       label: 'N/A',      cls: 'bg-slate-100 text-slate-500 border-slate-200' },
];

// ── Schéma de capitalisation de l'étudiant (vue partagée avec Organisation) ──
function SchemaCapitalisation({ etudId, annee }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/etudiants/${etudId}/capitalisation?annee=${annee}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (vivant) setData(j || { nodes: [], edges: [] }); })
      .catch(() => { if (vivant) setData({ nodes: [], edges: [] }); });
    return () => { vivant = false; };
  }, [etudId, annee]);
  if (data && !data.nodes?.length) return null;
  return <SchemaCapitalisationVue data={data} mode="etudiant" />;
}

// ── Grille de parcours : UE × années ─────────────────────────────────────────
const KINDS_CELLULE = [
  // LES ÉTATS DE LUCIE (2.12.211) : bleu inscrite, vert réussie — la VA
  // aussi, avec sa mention —, ocre ajournée, brique refusée. Le violet ne dit
  // que la faveur.
  { val: 'inscrit', label: 'Inscrit',  short: '·',  cls: 'bg-[color-mix(in_srgb,var(--c-disponible)_11%,#fff)] border-[color-mix(in_srgb,var(--c-disponible)_32%,#fff)] text-[#2F6FB0]' },
  { val: 'reussi',  label: 'Réussi',   short: '✓',  cls: 'bg-[color-mix(in_srgb,var(--c-reussi)_11%,#fff)] border-[color-mix(in_srgb,var(--c-reussi)_32%,#fff)] text-[#1B2B4B]' },
  { val: 'va',      label: 'VA',       short: 'VA', cls: 'bg-[color-mix(in_srgb,var(--c-reussi)_11%,#fff)] border-[color-mix(in_srgb,var(--c-reussi)_32%,#fff)] text-[#1B2B4B]' },
  // La circulaire distingue l'AJOURNEMENT, qui ouvre une seconde session sur
  // des acquis précis, du REFUS, qui ne l'ouvre pas. Les confondre sous un même
  // libellé privait le Conseil des études d'une de ses trois décisions.
  { val: 'ajourne', label: 'Ajourné',  short: 'Aj', cls: 'bg-[color-mix(in_srgb,var(--c-attente)_11%,#fff)] border-[color-mix(in_srgb,var(--c-attente)_32%,#fff)] text-[#8A5A12]' },
  { val: 'refuse',  label: 'Refusé',   short: '✕',  cls: 'bg-[color-mix(in_srgb,var(--c-refuse)_11%,#fff)] border-[color-mix(in_srgb,var(--c-refuse)_32%,#fff)] text-[#9D4A38]' },
  { val: 'absent',  label: 'Absent',   short: '–',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
];

/* L'ANNÉE EST UNE DONNÉE, PAS UNE SUPPOSITION. La grille affichait
   « hors programme {annee} » en lisant une variable que personne ne lui
   passait : la ligne entière tombait en erreur dès qu'une unité de la section
   manquait au programme de l'année. */
function GrilleParcours({ etudId, peutEcrire, annee }) {
  const [data, setData] = useState(null);
  const [popover, setPopover] = useState(null); // { annee, ue_num, verrou }
  const [pts, setPts] = useState('');
  const [nbHistorique, setNbHistorique] = useState(0);   // nb d'années antérieures révélées
  const [detail, setDetail] = useState(null);       // composantes + notes de la cellule ouverte
  const [detailOuvert, setDetailOuvert] = useState(false);
  /* GLISSER UNE CASE VERS UNE AUTRE ANNÉE (Charles, 26 septembre 2026 :
     « c'est ici que je voulais faire glisser les notes, et en groupe aussi »).
     Ctrl/⌘-clic compose un groupe ; on glisse n'importe laquelle de ses cases,
     et toutes se décalent du même nombre d'années. Le serveur simule d'abord,
     la fenêtre montre ce qui sera écrit, un motif est exigé. */
  const [choix, setChoix] = useState(() => new Set());     // « annee|ue »
  const [glisse, setGlisse] = useState(null);               // { de, cases: [{annee, ue_num}] }
  const [survol, setSurvol] = useState(null);               // année visée
  const [depl, setDepl] = useState(null);                   // { mouvements, rapport, motif, enCours, erreur }




  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/grille`, { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function chargerDetail() {
    if (!popover) return;
    const rep = await fetch(
      `/api/etudiants/${etudId}/grille/detail?annee=${popover.annee}&ue_num=${popover.ue_num}`,
      { headers: authHeaders() });
    if (rep.ok) { setDetail(await rep.json()); setDetailOuvert(true); }
  }

  async function poserReport(cand) {
    await fetch('/api/acquis/reports', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        etudiant_id: etudId, annee_scolaire: popover.annee, ue_num: popover.ue_num,
        cours_code: cand.cours_code, note: cand.note, annee_origine: cand.annee_origine,
      }),
    });
    await chargerDetail();
  }

  async function retirerReport(coursCode) {
    await fetch(`/api/acquis/reports/${etudId}/${popover.ue_num}/${encodeURIComponent(coursCode)}?annee=${popover.annee}`,
      { method: 'DELETE', headers: authHeaders() });
    await chargerDetail();
  }

  async function ecrireDetail(coursCode, aaCode, points, opts = {}) {
    const rep = await fetch(`/api/etudiants/${etudId}/grille/detail`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        annee: popover.annee, ue_num: popover.ue_num,
        cours_code: coursCode, code: aaCode, points,
        va: opts.va ? 1 : 0, non_evalue: opts.non_evalue ? 1 : 0,
      }),
    });
    if (rep.ok) {
      const j = await rep.json();
      setDetail(d => d && ({
        ...d,
        calcul: j.calcul,
        notes: {
          ...d.notes,
          [coursCode + '|' + aaCode]: {
            points, va: opts.va ? 1 : 0, non_evalue: opts.non_evalue ? 1 : 0,
          },
        },
      }));
      charger();
    }
  }


  async function purgerAnnee() {
    const annees = (data?.annees || []);
    const saisie = window.prompt(
      'Année à purger ?\nAnnées présentes : ' + annees.join(', '),
      annees[annees.length - 1] || '');
    if (!saisie || !/^20\d{2}-20\d{2}$/.test(saisie.trim())) {
      if (saisie !== null) alert('Format attendu : 2025-2026');
      return;
    }
    const an = saisie.trim();
    const tout = window.confirm(
      `Purge de ${an}\n\nOK = supprimer les inscriptions ET les résultats\n` +
      `Annuler = ne vider que les résultats, en gardant les inscriptions`);
    const portee = tout ? 'tout' : 'resultats';
    if (!window.confirm(
      portee === 'tout'
        ? `Confirmer la suppression des inscriptions de ${an} et de tout ce qui s'y rattache ?`
        : `Confirmer l'effacement des résultats de ${an} ? Les inscriptions sont conservées.`)) return;

    const rep = await fetch(`/api/etudiants/${etudId}/annee/${an}?portee=${portee}`,
      { method: 'DELETE', headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }
    alert(`Purge de ${an} — ${j.avant} inscription(s) concernée(s)` +
      (portee === 'tout' ? `\n${j.inscriptions} supprimée(s), ${j.valorisations} valorisation(s)` : '\nrésultats effacés') +
      `\n${j.notes} note(s) d'acquis supprimée(s)`);
    await charger();
  }

  async function ecrire(kind, opts = {}) {
    if (!popover) return;
    const rep = await fetch(`/api/etudiants/${etudId}/grille`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        annee: popover.annee, ue_num: popover.ue_num, kind,
        points: opts.points, derogation: popover.verrou ? 1 : 0,
      }),
    });
    if (!rep.ok) { const j = await rep.json().catch(() => ({})); alert(j.error || 'Erreur'); return; }
    setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false);
    await charger();
  }

  async function simulerDeplacement(mouvements) {
    const rep = await fetch(`/api/etudiants/${etudId}/grille/deplacer`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ mouvements, simulation: true }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || 'Déplacement refusé.'); return; }
    setDepl({ mouvements, rapport: j, motif: '', enCours: false, erreur: null });
  }

  async function confirmerDeplacement() {
    setDepl(d => ({ ...d, enCours: true, erreur: null }));
    const rep = await fetch(`/api/etudiants/${etudId}/grille/deplacer`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ mouvements: depl.mouvements, motif: depl.motif, simulation: false }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { setDepl(d => ({ ...d, enCours: false, erreur: j.error || 'Déplacement refusé.', rapport: j.plan ? j : d.rapport })); return; }
    setDepl(null); setChoix(new Set());
    await charger();
  }

  if (!data) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;
  if (!data.ues.length) return (
    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
      Aucune UE trouvée pour la section de cet étudiant.
    </div>
  );

  const cell = (annee, ueNum) => data.cellules?.[annee]?.[ueNum] || null;
  // Les années antérieures existent toujours ; le bouton « les révèle.
  // Le calcul part TOUJOURS des années réellement présentes en base, jamais
  // d'une liste accumulée — impossible d'en perdre une au clic suivant.
  const anneesBase = [...data.annees].sort();
  // Un parcours se lit d'une année à la suivante : les colonnes doivent être
  // CONTINUES. Une année sans donnée reste affichée, vide — sans quoi la
  // grille saute des années et l'on croit à une interruption d'études.
  // Fenêtre d'années : l'année active est toujours la dernière colonne, et
  // quatre années au moins la précèdent — de quoi lire le parcours et encoder
  // sans manipuler l'affichage. Les années portant des données restent
  // visibles même au-delà de cette fenêtre.
  const ANNEES_AVANT = 4;
  const anneesAffichees = (() => {
    if (!anneesBase.length) return anneesBase;
    const finBase   = Number(anneesBase[anneesBase.length - 1].split('-')[0]);
    const fin = Math.max(finBase, Number((data.anneeActive || '').split('-')[0] || 0));
    const debutDonnees = Number(anneesBase[0].split('-')[0]);
    const debut = Math.min(debutDonnees, fin - ANNEES_AVANT) - (nbHistorique || 0);
    const toutes = [];
    for (let a = debut; a <= fin; a++) toutes.push(a + '-' + (a + 1));
    return toutes;
  })();
  const aDetail = (annee, ueNum) => (data.detail || []).includes(annee + ':' + ueNum);
  const moities = (() => {
    const l = data.ues;
    if (l.length < 8) return [l];
    const blocs = l.map(u => (u.ue_niv || '').toUpperCase());
    let coupe = Math.ceil(l.length / 2), meilleur = Infinity;
    for (let k = 1; k < l.length; k++) {
      if (blocs[k] !== blocs[k - 1] && Math.abs(k - l.length / 2) < meilleur) { meilleur = Math.abs(k - l.length / 2); coupe = k; }
    }
    // Pas de frontière de bloc raisonnable : on coupe au milieu.
    if (meilleur > l.length / 4) coupe = Math.ceil(l.length / 2);
    return [l.slice(0, coupe), l.slice(coupe)];
  })();
  const idxAnnee = a => anneesAffichees.indexOf(a);
  const deplacable = cl => !!cl && cl.kind !== 'va';
  // Les cases qui arriveraient dans la colonne survolée, pour les montrer.
  const arrivees = (() => {
    if (!glisse || !survol) return new Set();
    const d = idxAnnee(survol) - idxAnnee(glisse.de);
    if (!d) return new Set();
    return new Set(glisse.cases.map(c => `${anneesAffichees[idxAnnee(c.annee) + d]}|${c.ue_num}`));
  })();
  function deposer(anneeCible) {
    const g = glisse; setGlisse(null); setSurvol(null);
    if (!g) return;
    const d = idxAnnee(anneeCible) - idxAnnee(g.de);
    if (!d) return;
    const mouvements = g.cases.map(c => ({ ue_num: c.ue_num, de: c.annee, vers: anneesAffichees[idxAnnee(c.annee) + d] }));
    if (mouvements.some(m => !m.vers)) { alert('Une des cases sortirait de la grille : révélez d’abord les années antérieures.'); return; }
    simulerDeplacement(mouvements);
  }

  return (
    <div>
      {/* RÉDUITE (Charles, 26 septembre 2026 : « faut réduire… on ne voit plus le
          schéma »). L'aide passe dans la bulle ; les deux outils deviennent de
          petits boutons dans le titre. */}
      <div className="mb-4">
      <div className="entete-plat">
        <span className="text-[13px] font-semibold text-iip-blue">Notes par année</span>
        <BulleAide titre="La grille des notes">
          Cliquez sur une case pour encoder.
          {peutEcrire && <> Glissez une case vers une autre année pour la déplacer ; Ctrl/⌘-clic en
          sélectionne plusieurs, qui se déplacent ensemble.</>} Une UE dont les prérequis ne sont pas acquis
          porte un cadenas 🔒 : l'encoder demande une dérogation, tracée. « à confirmer » signale une UE
          probablement acquise d'après ses prérequis. Le point ● dit que des notes d'acquis sont encodées ;
          le liseré de gauche, le bloc de l'unité.
        </BulleAide>
        <div className="ml-auto flex gap-1">
          {nbHistorique > 0 && (
            <button onClick={() => setNbHistorique(0)} title="Masquer les années antérieures vides"
              className="px-2 py-0.5 text-[11px] border border-slate-300 rounded-md hover:bg-slate-50">» masquer</button>
          )}
          <button onClick={() => setNbHistorique(n => (n === 0 ? 5 : n + 3))}
            title="Afficher les années antérieures pour encoder l'historique"
            className="px-2 py-0.5 text-[11px] border border-slate-300 rounded-md hover:bg-slate-50">
            « {nbHistorique === 0 ? 'années antérieures' : 'remonter encore'}
          </button>
          <button onClick={purgerAnnee} title="Effacer les résultats ou les inscriptions d'une année"
            className="px-2 py-0.5 text-[11px] border border-[#E3BFB5] text-[#9D4A38] rounded-md hover:bg-[#F7E9E5]">Purger…</button>
        </div>
      </div>

      {/* DEUX COLONNES (Charles, 26 septembre 2026 : « le tiroir est trop haut ;
          en deux colonnes »). Les UE se partagent entre deux tableaux, coupés
          entre deux BLOCS au plus près de la moitié ; chacun porte les mêmes
          années. Une seule colonne sur un écran étroit. */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
      {moities.map((liste, iT) => (
      <div key={iT} className="min-w-0">
      <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              {/* LES ANNÉES SUR LA LIGNE DES BLOCS DU SCHÉMA (« les dates sur la
                  même ligne ») : en-tête sans fond, de la hauteur des intitulés
                  BA1, BA2… posés en tête du schéma. */}
              <tr className="text-[10.5px] font-semibold text-slate-500">
                <th className="px-2 py-1 text-left sticky left-0 bg-white z-10">UE</th>
                {anneesAffichees.map((a, i) => {
                  const derniere = i === anneesAffichees.length - 1;
                  return (
                    <th key={a}
                      title={a}
                      className={`px-1 py-1 text-center w-[52px] ${derniere
                        ? 'sticky right-0 z-20 bg-iip-blue text-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.18)]'
                        : ''}`}>
                      {a.replace(/^20(\d\d)-20(\d\d)$/, '$1-$2')}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {liste.map(u => {
                const verrou = !u.deverrouillee && !u.acquise;
                return (
                  <tr key={u.section + '-' + u.ue_num} className="border-t border-slate-100">
                    {/* Le BLOC se lit au liseré, la colonne « Niv. » disparaît. */}
                    <td className="px-2 py-0.5 sticky left-0 bg-white z-10 whitespace-nowrap max-w-[16rem] overflow-hidden text-ellipsis border-l-[3px]"
                      style={{ borderLeftColor: couleurBloc(u.ue_niv) || '#D8DCE4' }}
                      title={`UE ${u.ue_num} — ${u.ue_nom || ''}${u.ue_niv ? ' · ' + u.ue_niv : ''}`}>
                      <span className="font-semibold text-iip-blue">{u.ue_num}</span>
                      <span className="text-slate-600 ml-1.5 inline-block max-w-[13rem] truncate align-bottom">{u.ue_nom}</span>
                      {verrou && <span className="ml-1.5 text-[11px]"
                        title={'Exige : UE ' + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')}>🔒</span>}
                      {u.suggeree && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200" title="Probablement acquise (inférence prérequis) — à confirmer">à confirmer</span>}
                      {u.hors_referentiel && (
                        <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                          title="Cette unité appartient à une autre section, ou sa section est inconnue">
                          autre section
                        </span>
                      )}
                      {u.hors_millesime && (
                        <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500"
                          title="Unité de la section, absente du programme de l'année en cours">
                          hors programme {annee}
                        </span>
                      )}
                    </td>
                    {anneesAffichees.map((a, iCol) => {
                      const derniere = iCol === anneesAffichees.length - 1;
                      const cl = cell(a, u.ue_num);
                      const kind = cl && KINDS_CELLULE.find(k => k.val === cl.kind);
                      return (
                        <td key={a}
                          onDragOver={glisse ? ev => { ev.preventDefault(); if (survol !== a) setSurvol(a); } : undefined}
                          onDrop={glisse ? ev => { ev.preventDefault(); deposer(a); } : undefined}
                          className={`px-0.5 py-0.5 text-center ${derniere
                            ? 'sticky right-0 z-10 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.10)]'
                            : ''} ${arrivees.has(`${a}|${u.ue_num}`) ? '!bg-[#EAF1FA]' : ''}`}>
                          <button
                            draggable={peutEcrire && deplacable(cl)}
                            onDragStart={ev => {
                              const cle = `${a}|${u.ue_num}`;
                              const cases = choix.has(cle)
                                ? [...choix].map(k => { const [an, ue] = k.split('|'); return { annee: an, ue_num: Number(ue) }; })
                                : [{ annee: a, ue_num: u.ue_num }];
                              ev.dataTransfer.effectAllowed = 'move';
                              ev.dataTransfer.setData('text/plain', cle);
                              setGlisse({ de: a, cases });
                            }}
                            onDragEnd={() => { setGlisse(null); setSurvol(null); }}
                            onClick={ev => {
                              if (!peutEcrire) return;
                              if ((ev.metaKey || ev.ctrlKey || ev.shiftKey) && deplacable(cl)) {
                                const cle = `${a}|${u.ue_num}`;
                                setChoix(c0 => { const c = new Set(c0); c.has(cle) ? c.delete(cle) : c.add(cle); return c; });
                                return;
                              }
                              if (choix.size) setChoix(new Set());
                              if (!verrou || cl) { setPopover({ annee: a, ue_num: u.ue_num, verrou: false }); return; }
                              // Prérequis manquants : sont-ils inscrits (ou mieux) la même année ?
                              const acquisSet = new Set(data.ues.filter(x => x.acquise).map(x => x.ue_num));
                              const nivMap = Object.fromEntries(data.ues.map(x => [x.ue_num, (x.ue_niv || '').toUpperCase()]));
                              const manquants = u.prerequis.filter(p => !acquisSet.has(p));
                              const memeAnnee = manquants.length > 0 && manquants.every(p =>
                                cell(a, p) && nivMap[p] === (u.ue_niv || '').toUpperCase());
                              if (memeAnnee) {
                                // Inscription simultanée normale — sous réserve, pas de dérogation
                                setPopover({ annee: a, ue_num: u.ue_num, verrou: false, sousReserve: manquants });
                              } else if (window.confirm(
                                  'UE verrouillée — exige la réussite de : UE '
                                  + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')
                                  + '.\n\nL\'exigence est transitive : une UE prérequise a elle-même ses prérequis.'
                                  + '\n\nEncoder quand même avec dérogation ?')) {
                                setPopover({ annee: a, ue_num: u.ue_num, verrou: true });
                              }
                            }}
                            className={`w-11 h-[22px] text-[11px] font-semibold tabular-nums rounded-md border px-0.5 transition
                              ${kind ? kind.cls : 'border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50'}
                              ${cl?.derogation ? 'ring-1 ring-amber-400' : ''}
                              ${choix.has(`${a}|${u.ue_num}`) ? 'ring-2 ring-[#2F6FB0] ring-offset-1' : ''}
                              ${peutEcrire && deplacable(cl) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            title={cl?.derogation ? 'Encodée avec dérogation' : ''}>
                            {kind
                              ? (kind.val === 'reussi' ? (cl.points != null ? String(Math.round(cl.points)) : '✓')
                                 : kind.val === 'va' ? (cl.points != null ? 'VA ' + cl.points : 'VA')
                                 : kind.short)
                              : '·'}
                            {aDetail(a, u.ue_num) && <span className="ml-0.5 align-super text-[8px]">●</span>}
                            {(() => {
                              if (!cl || cl.kind !== 'inscrit') return null;
                              const acquisSet = new Set(data.ues.filter(x => x.acquise).map(x => x.ue_num));
                              const nivMap = Object.fromEntries(data.ues.map(x => [x.ue_num, (x.ue_niv || '').toUpperCase()]));
                              const manquants = u.prerequis.filter(p => !acquisSet.has(p));
                              if (manquants.length && manquants.every(p => cell(a, p) && nivMap[p] === (u.ue_niv || '').toUpperCase()))
                                return <span className="ml-0.5 text-[10px]" title={'Sous réserve — réussite UE ' + manquants.join(', ') + ' requise en cours d\'année'}>⏳</span>;
                              return null;
                            })()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      ))}
      </div>
      </div>

      {depl && (() => {
        const rp = depl.rapport || {};
        const bloque = (rp.blocages || []).length > 0;
        const motifOk = depl.motif.trim().length >= 5;
        const raison = bloque ? 'Des cases ne peuvent pas être déplacées : décochez-les ou corrigez d’abord.'
          : !motifOk ? 'Écrivez le motif du déplacement.' : null;
        const n = depl.mouvements.length;
        return (
          <Fenetre titre={`Déplacer ${n} case${n > 1 ? 's' : ''}`} sous={rp.etudiant}
            onFermer={() => setDepl(null)}
            pied={<>
              {raison && <span className="text-[12px] text-slate-500 min-w-0 flex-1">{raison}</span>}
              <button className="bouton" onClick={() => setDepl(null)}>Annuler</button>
              <button className="bouton-fort" disabled={!!raison || depl.enCours} onClick={confirmerDeplacement}>
                {depl.enCours ? 'Déplacement…' : 'Déplacer'}
              </button>
            </>}>
            <div className="space-y-3">
              {bloque && (
                <Encadre etat="corriger" titre="Ce qui bloque">
                  <ul className="list-disc pl-4">
                    {rp.blocages.map((b, i) => <li key={i}>UE {b.ue_num} · {b.de} → {b.vers} : {b.raison}</li>)}
                  </ul>
                </Encadre>
              )}
              {(rp.plan || []).length > 0 && (
                <table className="w-full text-[12px]">
                  <thead><tr className="tab-entete text-left">
                    <th className="px-2 py-1">UE</th><th className="px-2 py-1">De</th><th className="px-2 py-1">Vers</th>
                    <th className="px-2 py-1">Résultat</th><th className="px-2 py-1">Ce qui suit</th>
                  </tr></thead>
                  <tbody>
                    {rp.plan.map(m => {
                      const t = m.traces || {};
                      const suit = [t.notes && `${t.notes} note(s)`, t.cours && `${t.cours} résultat(s) de cours`,
                        t.decisions && `${t.decisions} décision(s)`, t.ajustements && `${t.ajustements} faveur(s)/ajournement(s)`,
                        t.motivations && `${t.motivations} motivation(s)`, t.reports && `${t.reports} report(s)`].filter(Boolean);
                      return (
                        <tr key={m.ue_num} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1 font-semibold text-iip-blue">{m.ue_num}</td>
                          <td className="px-2 py-1">{m.de}</td>
                          <td className="px-2 py-1">{m.vers}{m.remplace && <span className="block text-[11px] text-slate-400">remplace une inscription vide</span>}</td>
                          <td className="px-2 py-1">{m.resultat || 'inscrit'}{m.points != null ? ` · ${m.points}/20` : ''}</td>
                          <td className="px-2 py-1 text-slate-600">
                            {suit.length ? suit.join(' · ') : '—'}
                            {m.seance_close && <span className="block text-[11px] text-[#B45309]">délibération close en {m.de} : décision déjà notifiée</span>}
                            {m.stage_reste > 0 && <span className="block text-[11px] text-slate-400">le stage reste en {m.de}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <label className="block">
                <span className="text-[12px] font-semibold text-iip-blue">Motif du déplacement</span>
                <textarea value={depl.motif} rows={2} autoFocus
                  onChange={ev => { const v = ev.target.value; setDepl(d => ({ ...d, motif: v })); }}
                  placeholder="ex. import de l’historique rangé dans la mauvaise année"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[13px]" />
                <span className="text-[11px] text-slate-400">Il est conservé avec votre nom, l’heure, et chaque case déplacée.</span>
              </label>
              {depl.erreur && <Encadre etat="corriger">{depl.erreur}</Encadre>}
            </div>
          </Fenetre>
        );
      })()}

      {popover && (
        <div className="fixed inset-0 z-[60] bg-[rgba(11,21,45,.32)] backdrop-blur-[3px] flex items-center justify-center p-4"
          onClick={() => { setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false); }}>
          {/* DEUX FENÊTRES EN UNE, ET UNE SEULE LARGEUR POUR LES DEUX.
              Fermée, cette fenêtre ne porte qu'une poignée de boutons : 320 px
              suffisent. Ouverte sur le détail, elle doit montrer une grille —
              cours, acquis, notes des deux sessions — et 320 px la réduisaient
              à une colonne de libellés tronqués. La largeur suit donc ce qu'on
              y fait, et la hauteur aussi : c'est le contenu qui défile, pas la
              fenêtre qui s'étire hors de l'écran. */}
          <div onClick={e => e.stopPropagation()}
            className={`bg-white rounded-fenetre shadow-dessus p-5 flex flex-col
                        ${detailOuvert ? 'w-full max-w-3xl max-h-[88vh]' : 'w-80'}`}>
            <div className="font-semibold text-iip-blue mb-1">
              UE {popover.ue_num} — {popover.annee}
            </div>
            {popover.verrou && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2">
                Dérogation — sera tracée comme telle
              </div>
            )}
            {popover.sousReserve && (
              <div className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 mb-2">
                Inscription sous réserve — l'accès effectif dépend de la réussite de
                l'UE {popover.sousReserve.join(', ')} en cours d'année (cas type : épreuve intégrée).
              </div>
            )}
            <input type="number" min="0" max="20" step="0.1" placeholder="Note /20 (optionnel)"
              value={pts} onChange={e => setPts(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-3" />
            <div className="grid grid-cols-2 gap-1.5">
              {KINDS_CELLULE.map(k => (
                <button key={k.val}
                  onClick={() => ecrire(k.val, { points: pts !== '' ? Number(pts) : undefined })}
                  className={`text-[12px] px-2 py-1.5 rounded-lg border font-medium ${k.cls}`}>
                  {k.label}
                </button>
              ))}
              <button onClick={() => ecrire('effacer_resultat')}
                title="L'inscription demeure ; sa note et ses acquis sont effacés"
                className="text-[12px] px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Effacer le résultat
              </button>
              <button onClick={() => {
                  if (window.confirm("Supprimer l'inscription à cette UE pour cette année ?\nSes notes, valorisations et reports seront également supprimés."))
                    ecrire('effacer');
                }}
                title="Supprime l'inscription et tout ce qui s'y rattache"
                className="text-[12px] px-2 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                Supprimer l'inscription
              </button>
            </div>

            <button onClick={() => detailOuvert ? setDetailOuvert(false) : chargerDetail()}
              className="mt-3 w-full text-[12px] px-2 py-1.5 rounded-lg border border-iip-turquoise/40 text-iip-blue hover:bg-iip-turquoise/5">
              {detailOuvert ? 'Masquer le détail' : 'Notes par cours & AA…'}
            </button>

            {detailOuvert && detail && (
              // La chaîne flex doit être CONTINUE jusqu'à la grille : un seul
              // maillon qui l'oublie, et `flex-1 min-h-0` plus bas ne mesure
              // plus rien — la fenêtre repart en hauteur libre.
              <div className="mt-3 border-t border-slate-100 pt-3 flex flex-col flex-1 min-h-0">
                {/* Note calculée depuis les acquis d'apprentissage */}
                {detail.calcul && (
                  <div className={`rounded-xl px-3 py-2.5 mb-3 border ${
                    detail.calcul.pourcentage == null
                      ? 'bg-slate-50 border-slate-200'
                      : detail.calcul.sur20 >= 10
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-red-50 border-red-200'}`}>
                    {detail.calcul.sur20 == null ? (
                      <div className="text-[12px] text-slate-500">
                        Aucun acquis coté, ou pondérations non encodées pour cette UE.
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Note calculée
                          </div>
                          <div className="text-[19px] font-bold text-iip-blue leading-tight"
                            title={detail.calcul.sur20_exact != null ? `Valeur exacte : ${detail.calcul.sur20_exact}` : ''}>
                            {detail.calcul.sur20} / 20
                            <span className="text-[12px] font-normal text-slate-500 ml-2">
                              {detail.calcul.pourcentage} %
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {detail.calcul.evalues}/{detail.calcul.attendus} acquis cotés
                            {!detail.calcul.complet ? " — calcul partiel" : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => ecrire(
                            detail.calcul.sur20 >= 10 ? 'reussi' : 'ajourne',
                            // La cote est conservée même sous le seuil : elle sert à la
                            // seconde session et à un éventuel recours. Elle n'est
                            // simplement pas communiquée à l'étudiant.
                            { points: detail.calcul.sur20 })}
                          className="flex-none text-[12px] px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">
                          Reporter sur l’UE
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Reports de note proposés : cours validés dans une UE échouée */}
                {(detail.candidats_report || []).length > 0 && (
                  <div className="mb-3 border border-sky-200 bg-sky-50 rounded-xl px-3 py-2.5">
                    <div className="text-[12px] font-semibold text-sky-900 mb-1.5">
                      Report de note possible
                    </div>
                    <div className="space-y-1">
                      {detail.candidats_report.map(cd => (
                        <div key={cd.cours_code} className="flex items-center gap-2">
                          <div className="flex-1 text-[11px] text-sky-900 truncate" title={cd.cours_nom}>
                            <b>{cd.cours_code}</b> {cd.cours_nom}
                            <span className="text-sky-700"> — {cd.note_affichee}/20 en {cd.annee_origine}</span>
                          </div>
                          <button onClick={() => poserReport(cd)}
                            className="flex-none text-[11px] px-2 py-0.5 rounded-lg bg-sky-600 text-white font-semibold">
                            Reporter
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-sky-700 mt-1.5">
                      Cours validés alors que l'UE n'était pas réussie. Le report relève du Conseil des études.
                    </p>
                  </div>
                )}

                {/* LA DÉCISION NE DÉFILE PAS. Elle était le premier élément
                    d'une boîte à défilement de 288 px : il fallait faire rouler
                    la molette pour savoir ce que le Conseil avait décidé, sur
                    l'écran même où l'on corrige la note qui en découle. Elle
                    reste maintenant sous les yeux. */}
                {detail.decision && (detail.decision.s1 || detail.decision.s2
                  || detail.decision.finale || detail.decision.motivation) && (
                    <div className="mb-2 px-3 py-2 rounded-lg bg-slate-50 border
                                    border-slate-200 text-[12px]">
                      <span className="font-semibold text-iip-blue">Décision</span>
                      {detail.decision.s1 && (
                        <span className="ml-2">1<sup>re</sup> session :
                          <b> {LIBELLE_RES[detail.decision.s1] || detail.decision.s1}</b></span>
                      )}
                      {detail.decision.s2 && (
                        <span className="ml-2">· 2<sup>e</sup> session :
                          <b> {LIBELLE_RES[detail.decision.s2] || detail.decision.s2}</b></span>
                      )}
                      {detail.decision.finale && (
                        <span className="ml-2">· retenue :
                          <b> {LIBELLE_RES[detail.decision.finale] || detail.decision.finale}</b>
                          {detail.decision.points != null && ` (${detail.decision.points}/20)`}</span>
                      )}
                      {detail.decision.motivation && (
                        <div className="mt-1 text-slate-600 italic">
                          {detail.decision.motivation}
                        </div>
                      )}
                    </div>
                )}

                {/* LA GRILLE, ELLE, DÉFILE — et elle seule. */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
                  {(detail.structure || []).map(co => (
                    <div key={co.cours_code} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50">
                        <div className="flex-1 text-[12px] text-slate-700 truncate" title={co.cours_nom}>
                          <b className="text-iip-blue">{co.cours_code}</b> {co.cours_nom}
                        </div>
                        <span className="text-[10px] text-slate-400 flex-none"
                          title={`${co.periodes} périodes`}>
                          {co.poids_cours_affiche != null ? co.poids_cours_affiche + ' %' : '— %'}
                        </span>
                        {!co.complet && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-none"
                            title={`Somme des pondérations : ${co.somme_poids} au lieu de 100`}>
                            pondérations {co.somme_poids}
                          </span>
                        )}
                      </div>

                      {(detail.reports || []).some(r0 => r0.cours_code === co.cours_code) ? (
                        (() => {
                          const rn = detail.reports.find(r0 => r0.cours_code === co.cours_code);
                          return (
                            <div className="px-3 py-2 flex items-center gap-2 bg-sky-50/60">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white flex-none">
                                RN
                              </span>
                              <div className="flex-1 text-[12px] text-sky-900">
                                Note reportée : <b>{Math.round(rn.note)}/20</b>
                                {rn.annee_origine ? <span className="text-sky-700"> (validé en {rn.annee_origine})</span> : null}
                              </div>
                              <button onClick={() => retirerReport(co.cours_code)}
                                className="flex-none text-[11px] px-2 py-0.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-white">
                                Retirer
                              </button>
                            </div>
                          );
                        })()
                      ) : !co.aas.length ? (
                        <div className="px-3 py-2 text-[11px] text-slate-400">
                          Aucun acquis d’apprentissage rattaché à ce cours.
                        </div>
                      ) : (
                        <div className="px-2 py-1 space-y-0.5">
                          {co.aas.map(aa => {
                            const cle = co.cours_code + '|' + aa.aa_code;
                            const n = detail.notes[cle] || {};
                            return (
                              <div key={cle} className="flex items-center gap-2 py-0.5">
                                <div className="flex-1 text-[11px] text-slate-600 truncate"
                                  title={aa.description || aa.aa_code}>
                                  <b className="text-slate-500">{aa.aa_code}</b> {aa.description || ''}
                                </div>
                                <span className="text-[10px] text-slate-400 flex-none w-9 text-right"
                                  title="Pondération dans ce cours">
                                  {aa.poids != null ? aa.poids + '%' : '—'}
                                </span>
                                {/* Les deux sessions, quand l'import les a
                                    apportées : on voit ce qui s'est joué en
                                    première et en seconde, pas seulement le
                                    résultat qui fait foi. */}
                                {(detail.sessions?.s1?.[cle] || detail.sessions?.s2?.[cle]) && (
                                  <span className="flex-none text-[10px] w-20 text-right">
                                    <span className="text-slate-500" title="Première session">
                                      S1&nbsp;{detail.sessions.s1?.[cle]?.points ?? '—'}
                                    </span>
                                    <span className="text-slate-300"> · </span>
                                    <span className={detail.sessions.s2?.[cle]?.points != null
                                      ? 'text-iip-blue font-semibold' : 'text-slate-400'}
                                      title="Seconde session">
                                      S2&nbsp;{detail.sessions.s2?.[cle]?.points ?? '—'}
                                    </span>
                                  </span>
                                )}
                                <input type="number" min="0" max="20" step="0.1" placeholder="/20"
                                  defaultValue={n.points ?? ''}
                                  disabled={!!n.non_evalue}
                                  onBlur={e => ecrireDetail(co.cours_code, aa.aa_code,
                                    e.target.value !== '' ? Number(e.target.value) : null,
                                    { va: n.va, non_evalue: n.non_evalue })}
                                  className="w-14 border border-slate-200 rounded-lg px-1.5 py-0.5 text-[11px] text-right disabled:bg-slate-100" />
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 flex-none"
                                  title="Dispensé : cet acquis sort du calcul, sans pénaliser l\u2019étudiant">
                                  <input type="checkbox" checked={!!n.non_evalue}
                                    onChange={e => ecrireDetail(co.cours_code, aa.aa_code,
                                      n.points ?? null, { va: n.va, non_evalue: e.target.checked })} />
                                  disp.
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {!(detail.structure || []).length && (
                    <div className="text-[12px] text-slate-400 text-center py-2">
                      Aucun cours au référentiel pour cette UE.
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 mt-2">
                  Chaque acquis pèse par sa pondération dans son cours et par les périodes de ce
                  cours. Un acquis dispensé sort du calcul sans compter comme un zéro.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPES_VA = [
  { val: 'complete',  label: 'Dispense complète (UE)' },
  { val: 'partielle', label: 'Dispense partielle (AA ou cours)' },
  { val: 'admission', label: 'Admission (capacités préalables)' },
];

function Valorisations({ etudId, annee }) {
  const [valos, setValos] = useState(null);
  // L'unité dont on veut les pièces. Le procès-verbal est une pièce d'UNITÉ :
  // il porte tous les étudiants valorisés dans cette unité, pas seulement
  // celui dont on a la fiche sous les yeux.
  const [documents, setDocuments] = useState(null);
  const [form, setForm] = useState(null);
  // Le seuil de report. Le RDE fixe la réussite à 10/20 (art. 78) et ne
  // mentionne pas de seuil propre au report : celui-ci relève donc d'une règle
  // interne, et reste modifiable au cas par cas.
  const [seuilReport, setSeuilReport] = useState(12);
  const [anterieur, setAnterieur] = useState(null);   // notes des années passées
  /* LA LISTE DES COURS NE VIENT PLUS DU PROGRAMME DE L'ÉTUDIANT.
     Elle était chargée depuis « les cours auxquels il est inscrit » — utile
     tant que l'unité se devinait de ce programme. Depuis que l'unité se
     choisit dans le catalogue de la section, une unité pas encore inscrite
     rendait une liste vide : on cochait « par cours » et il ne restait à
     l'écran que les acquis. Les composantes de l'UNITÉ font désormais foi, et
     les notes déjà obtenues s'y ajoutent quand il y en a. */
  const [composantes, setComposantes] = useState(null);
  // LES UNITÉS QU'ON PEUT VALORISER. Le numéro se tapait à la main : on ne
  // valorise pourtant que ce qui existe chez nous, et ce que l'étudiant aura à
  // son programme. Section d'abord, unités ensuite — celles du PAE en tête.
  const [unites, setUnites] = useState(null);
  // LA NATURE D'UNE PIÈCE, demandée au dépôt : « 23453.docx » ne dit rien, et
  // Lucie ne peut pas deviner ce qu'un fichier contient. Un menu, une seconde,
  // et le nom se construit seul.
  const [natures, setNatures] = useState([]);
  const [nature, setNature] = useState('CI');
  useEffect(() => {
    fetch('/api/etudiants/valorisations/natures', { headers: authHeaders() })
      .then(r => r.json()).then(j => Array.isArray(j) && setNatures(j)).catch(() => {});
  }, []);
  const [sectionVA, setSectionVA] = useState('');

  useEffect(() => {
    if (!form) return;
    const qs = new URLSearchParams({ annee });
    if (sectionVA) qs.set('section', sectionVA);
    fetch(`/api/etudiants/${etudId}/valorisations/unites?${qs}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(j => {
        setUnites(j);
        // La section de l'étudiant est proposée d'emblée : c'est celle qu'on
        // veut neuf fois sur dix, et l'écran ne doit pas la faire chercher.
        if (!sectionVA && j.section_etudiant) setSectionVA(j.section_etudiant);
      })
      .catch(() => setUnites({ sections: [], unites: [] }));
    /* eslint-disable-next-line */
  }, [!!form, sectionVA, etudId, annee]);
  // Directeur, directeur adjoint et administrateur technique ont les mêmes
  // droits ici : comparer à la seule chaîne 'admin' en écartait la direction.
  const [estAdmin] = useState(() => {
    try {
      const jeton = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1] || ''));
      return ['admin', 'directeur', 'directeur_adjoint'].includes(jeton?.role);
    } catch { return false; }
  });

  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/valorisations`, { headers: authHeaders() });
    if (rep.ok) setValos(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function chargerComposantes(ueNum, anneeSource = null) {
    if (!ueNum) { setComposantes(null); setAnterieur(null); return; }
    const rep = await fetch(`/api/etudiants/ue/${ueNum}/composantes?annee=${annee}`,
      { headers: authHeaders() });
    if (rep.ok) {
      const c = await rep.json();
      setComposantes(c);
      // EN DISPENSE COMPLÈTE, TOUS LES ACQUIS SONT ÉQUIVALENTS — c'est ce que
      // « complète » veut dire. Les cocher un à un serait faire ressaisir une
      // conséquence de la décision déjà prise.
      setForm(f => (f && f.type === 'complete'
        ? { ...f, equivalences: Object.fromEntries(
            (c.aas || []).map(a => [a.aa_code, c.texte_equivalence])) }
        : f));
    }

    // Les notes déjà connues de l'étudiant : le report se décidait à l'aveugle,
    // il fallait les retenir de tête et les ressaisir.
    const qs = new URLSearchParams({ annee_cible: annee });
    if (anneeSource) qs.set('annee_source', anneeSource);
    const rep2 = await fetch(`/api/acquis/notes-anterieures/${etudId}/${ueNum}?${qs}`,
      { headers: authHeaders() });
    if (!rep2.ok) { setAnterieur(null); return; }
    const j = await rep2.json();
    setAnterieur(j);

    // Les notes reportables sont proposées d'emblée ; on décoche ce qu'on ne
    // veut pas, plutôt que de tout ressaisir.
    const notes = {}; const sel = [];
    for (const co of j.cours) {
      if (co.note == null || j.deja_reportes.includes(co.cours_code)) continue;
      if (co.note < seuilReport) continue;
      notes[co.cours_code] = String(co.note);
      sel.push(co.cours_code);
    }
    setForm(f2 => f2 && ({ ...f2, notes, cible_detail: sel.join(','),
                           annee_origine: j.annee_source }));
  }

  async function sauver() {
    // CRÉER ET CORRIGER SONT LE MÊME GESTE. Une valorisation encodée ne se
    // rouvrait pas : une faute de frappe imposait de supprimer — ce qui
    // emporte les preuves déposées — puis de tout redéposer. Personne ne le
    // faisait, et la faute restait.
    const modif = !!form.id;
    const rep = await fetch(modif
      ? `/api/etudiants/valorisations/${form.id}`
      : `/api/etudiants/${etudId}/valorisations`, {
      method: modif ? 'PUT' : 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...form, annee_scolaire: form.annee_scolaire || annee,
        equivalences: Object.entries(form.equivalences || {})
          .map(([aa_code, texte]) => ({ aa_code, texte })) }),
    });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }

    // Les notes par cours vont dans etudiant_report_note, table prévue pour
    // cela : la valorisation dit QUELS cours sont dispensés, le report dit
    // AVEC QUELLE NOTE.
    const notes = form.notes || {};
    for (const [cours_code, note] of Object.entries(notes)) {
      if (note === '' || note == null) continue;
      const r = await fetch('/api/acquis/reports', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etudId, annee_scolaire: annee, ue_num: Number(form.ue_num),
          cours_code, note: Number(note),
          annee_origine: form.annee_origine || null,
          decision_ce: form.decision_ce || null,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(`Note du cours ${cours_code} non enregistrée : ${e.error || 'erreur'}`);
        return;
      }
    }
    setForm(null); setComposantes(null); await charger();
  }

  /**
   * LE DÉPÔT D'UNE PREUVE.
   *
   * L'en-tête d'authentification porte « Content-Type: application/json » ; le
   * laisser ici ferait envoyer un formulaire multipart sous une étiquette qui
   * ment, et le serveur ne verrait aucun fichier.
   */
  async function deposer(vid, file) {
    if (!file) return;
    const { 'Content-Type': _ignore, ...entetes } = authHeaders();
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('nature', nature);
    const rep = await fetch(`/api/etudiants/valorisations/${vid}/fichiers`, {
      method: 'POST', headers: entetes, body: fd });
    if (!rep.ok) {
      const e = await rep.json().catch(() => ({}));
      alert(e.error || "La pièce n'a pas pu être déposée.");
      return;
    }
    await charger();
  }

  async function telecharger(f) {
    const { 'Content-Type': _ignore, ...entetes } = authHeaders();
    const rep = await fetch(`/api/etudiants/valorisations/fichiers/${f.id}`,
      { headers: entetes });
    if (!rep.ok) { alert('Pièce introuvable.'); return; }
    const url = URL.createObjectURL(await rep.blob());
    const a = document.createElement('a');
    a.href = url; a.download = f.nom; a.click();
    URL.revokeObjectURL(url);
  }

  async function renommer(f) {
    const nom = prompt('Nom de la pièce :', f.nom);
    if (!nom || nom === f.nom) return;
    await fetch(`/api/etudiants/valorisations/fichiers/${f.id}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ nom }) });
    await charger();
  }

  async function supprimerPiece(fid) {
    if (!confirm('Supprimer cette pièce ?')) return;
    await fetch(`/api/etudiants/valorisations/fichiers/${fid}`,
      { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  /** Rouvrir une valorisation dans le formulaire, telle qu'elle est en base. */
  function rouvrir(v) {
    setForm({
      id: v.id, annee_scolaire: v.annee_scolaire,
      type: v.type, ue_num: String(v.ue_num),
      cible: v.cible || 'cours', cible_detail: v.cible_detail || '',
      pourcentage: v.pourcentage, decision_ce_date: v.decision_ce_date || '',
      commentaire: v.commentaire || '',
      decision: v.decision === 'refusee' ? 'refusee' : 'accordee',
      motif_refus: v.motif_refus || '',
      equivalences: Object.fromEntries(
        (v.equivalences || []).map(e => [e.aa_code, e.texte || ''])),
      notes: {},
    });
    setSectionVA(v.section || '');
  }

  async function supprimer(vid) {
    if (!confirm('Supprimer cette valorisation ?')) return;
    await fetch(`/api/etudiants/valorisations/${vid}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  if (!valos) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-slate-500">
          Valorisation des acquis — AGCF du 13-12-2024 · décisions du Conseil des études
        </p>
        <button onClick={() => setForm({ type: 'complete', ue_num: '', pourcentage: 50, cible: 'cours',
                             cible_detail: '', equivalences: {}, decision: 'accordee' })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg">
          <IconPlus size={14} /> Ajouter une VA
        </button>
      </div>

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3 mb-4">

          {/* ACCORDÉE OU REFUSÉE — C'EST LA PREMIÈRE QUESTION.
              La table ne connaissait que des dispenses accordées : une demande
              refusée n'avait nulle part où s'écrire, donc elle ne s'écrivait
              pas — et une demande dont rien ne garde trace se réintroduit
              l'année suivante, sans qu'on sache qu'elle a déjà été examinée. */}
          <div className="flex items-center gap-4 text-[13px]">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Décision du Conseil
            </span>
            {[['accordee', 'Accordée'], ['refusee', 'Refusée']].map(([val, lab]) => (
              <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={(form.decision || 'accordee') === val}
                  onChange={() => setForm(f => ({ ...f, decision: val }))} />
                {lab}
              </label>
            ))}
            {form.id && (
              <span className="ml-auto text-[11px] text-slate-400">
                Correction d'une valorisation déjà encodée — les preuves déposées sont conservées.
              </span>
            )}
          </div>

          {form.decision === 'refusee' ? (
            <>
              <label className="block text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Unité demandée
                </span>
                <select value={form.ue_num || ''} className="controle w-full"
                  onChange={e => setForm(f => ({ ...f, ue_num: e.target.value }))}>
                  <option value="">—</option>
                  {(unites?.unites || []).map(u => (
                    <option key={u.ue_num} value={u.ue_num}>
                      {u.ue_num} — {u.ue_nom}
                    </option>
                  ))}
                </select>
              </label>
              {/* UN REFUS SE MOTIVE. C'est une décision défavorable, et
                  « refusé » sans motif ne se défend pas devant un recours. */}
              <label className="block text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Motif du refus <span className="text-[#9D4A38]">— obligatoire</span>
                </span>
                <textarea rows={3} value={form.motif_refus || ''}
                  placeholder="Ce que le Conseil a constaté : pièces insuffisantes, acquis non démontrés, formation sans rapport…"
                  className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]"
                  onChange={e => setForm(f => ({ ...f, motif_refus: e.target.value }))} />
              </label>
            </>
          ) : (
          <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs col-span-2"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</span>
              <select value={form.type} onChange={e => setForm(f => {
                const t = e.target.value;
                // Passer en « complète » coche tout : c'est ce que le mot dit.
                // Repasser en partielle laisse la sélection, on y retire.
                return { ...f, type: t,
                  equivalences: t === 'complete' && composantes?.aas
                    ? Object.fromEntries(composantes.aas.map(
                        a => [a.aa_code, composantes.texte_equivalence || '']))
                    : (f.equivalences || {}) };
              })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {TYPES_VA.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
              </select></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Section</span>
              <select value={sectionVA} onChange={e => setSectionVA(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Toutes</option>
                {(unites?.sections || []).map(sx => (
                  <option key={sx.code} value={sx.code}>{sx.libelle || sx.code}</option>
                ))}
              </select></label>
            <label className="text-xs col-span-2"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Unité d'enseignement</span>
              <select value={form.ue_num || ''}
                onChange={e => {
                  const n = e.target.value;
                  setForm(f => ({ ...f, ue_num: n, cible_detail: '', notes: {},
                                  equivalences: {} }));
                  if (n) chargerComposantes(Number(n));
                  else { setComposantes(null); setAnterieur(null); }
                }}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">— choisir une unité —</option>
                {(unites?.unites || []).map(u => (
                  <option key={u.ue_num} value={u.ue_num}>
                    {u.au_pae ? '★ ' : ''}{u.ue_num} — {u.ue_nom}
                  </option>
                ))}
              </select>
              <span className="block text-[10px] text-slate-400 mt-1">
                ★ déjà au programme de l'étudiant en {annee}
              </span></label>
            {form.type !== 'admission' && (
              <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">%</span>
                <input type="number" min="0" max="100" value={form.pourcentage}
                  onChange={e => setForm(f => ({ ...f, pourcentage: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            )}
          </div>

          {form.type === 'partielle' && (
            <div className="space-y-2">
              <div className="flex gap-3">
                {['cours','aa'].map(cb => (
                  <label key={cb} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" checked={form.cible === cb}
                      onChange={() => setForm(f => ({ ...f, cible: cb, cible_detail: '', notes: {} }))} />
                    {cb === 'cours' ? 'Par cours' : "Par acquis d'apprentissage"}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 ml-auto">
                  Seuil de report
                  <input type="number" min="0" max="20" step="0.5" value={seuilReport}
                    onChange={e => setSeuilReport(Number(e.target.value))}
                    className="w-14 border border-slate-300 rounded px-1.5 py-0.5 text-[11px]" />
                  /20
                </label>
              </div>

              {/* LES COMPOSANTES DE L'UNITÉ CHOISIE — PAS LE PROGRAMME DE
                  L'ÉTUDIANT.
                  Cette liste venait des cours AUXQUELS L'ÉTUDIANT EST INSCRIT.
                  Depuis que l'unité se choisit dans le catalogue de la section,
                  une unité qu'il n'a pas encore à son programme ne rendait donc
                  aucun cours : on cochait « par cours » et il ne restait à
                  l'écran que les acquis, plus bas. Or on valorise une unité
                  qu'il AURA — la liste doit venir de l'unité, et les notes
                  déjà obtenues s'y ajoutent quand elles existent. */}
              {!form.ue_num ? (
                <div className="py-4 text-center text-[13px] text-slate-400
                                border-2 border-dashed rounded-xl">
                  Choisissez d'abord l'unité d'enseignement.
                </div>
              ) : !composantes ? (
                <div className="py-4 text-center text-[13px] text-slate-400
                                border-2 border-dashed rounded-xl">
                  Chargement des composantes de l'unité…
                </div>
              ) : (() => {
                const anterieurParCours = Object.fromEntries(
                  (anterieur?.cours || []).map(c => [c.cours_code, c]));
                const dejaReportes = new Set(anterieur?.deja_reportes || []);
                const liste = form.cible === 'cours'
                  ? (composantes.cours || []).map(c => ({
                      code: c.cours_code, libelle: c.cours_nom,
                      note_anterieure: anterieurParCours[c.cours_code]?.note ?? null,
                      annee_anterieure: anterieurParCours[c.cours_code]?.annee_origine || null,
                      deja_reporte: dejaReportes.has(c.cours_code),
                    }))
                  : (composantes.aas || []).map(a => ({
                      code: a.aa_code,
                      libelle: a.description || a.aa_code,
                      // Un acquis ne porte pas de note reportable : le report se
                      // fait par COURS. On ne propose donc rien ici plutôt que
                      // d'afficher un tiret qui laisserait croire à un oubli.
                      note_anterieure: null, annee_anterieure: null, deja_reporte: false,
                    }));

                if (!liste.length) {
                  return (
                    <div className="py-4 text-center text-[13px] text-amber-700
                                    border-2 border-dashed border-amber-300 rounded-xl">
                      Cette unité ne porte aucun {form.cible === 'cours' ? 'cours'
                        : "acquis d'apprentissage"} au référentiel {annee}.
                    </div>
                  );
                }

                return (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                                  text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    UE {form.ue_num} · {liste.length}{' '}
                    {form.cible === 'cours' ? 'cours' : "acquis d'apprentissage"}
                    {anterieur?.annee_source && (
                      <span className="normal-case tracking-normal text-slate-400">
                        {' '}· notes de {anterieur.annee_source}
                      </span>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {liste.map(co => {
                      const code = co.code;
                      const sel = (form.cible_detail || '').split(',').filter(Boolean);
                      const actif = sel.includes(code);
                      const note = form.notes?.[code] ?? '';
                      const sousSeuil = note !== '' && Number(note) < seuilReport;
                      return (
                        <div key={code}
                          className={`px-3 py-1.5 text-[12px]
                                      border-b border-slate-50 last:border-0
                                      ${actif ? 'bg-iip-blue/5' : ''}`}>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={actif}
                            onChange={() => {
                              const next = actif ? sel.filter(x => x !== code) : [...sel, code];
                              setForm(f => {
                                // COCHER UN ACQUIS, C'EST LE RECONNAÎTRE ÉQUIVALENT.
                                // Les deux gestes n'en font qu'un : la motivation
                                // s'ouvre sous la case, pré-remplie.
                                if (f.cible !== 'aa') return { ...f, cible_detail: next.join(',') };
                                const eq = { ...(f.equivalences || {}) };
                                if (actif) delete eq[code];
                                else eq[code] = composantes.texte_equivalence || '';
                                return { ...f, cible_detail: next.join(','), equivalences: eq };
                              });
                            }} />
                          <span className="w-20 flex-none font-mono text-[11px] text-slate-500">
                            {code}
                          </span>
                          <span className="flex-1 min-w-0 truncate" title={co.libelle}>
                            {co.libelle}
                          </span>

                          {/* La note déjà connue : un clic la reprend, plutôt
                              que de la retenir de tête et la ressaisir. */}
                          {co.note_anterieure != null ? (
                            <button type="button"
                              onClick={() => setForm(f => {
                                const x = (f.cible_detail || '').split(',').filter(Boolean);
                                return { ...f,
                                  notes: { ...(f.notes || {}), [code]: String(co.note_anterieure) },
                                  cible_detail: x.includes(code) ? f.cible_detail
                                                                 : [...x, code].join(','),
                                  annee_origine: f.annee_origine || co.annee_anterieure };
                              })}
                              title={co.deja_reporte ? 'Déjà reportée'
                                : `Obtenue en ${co.annee_anterieure} — cliquer pour la reprendre`}
                              className={`text-[11px] flex-none w-24 text-right
                                ${co.deja_reporte ? 'text-slate-300'
                                  : co.note_anterieure >= seuilReport
                                    ? 'text-emerald-700 font-semibold hover:underline'
                                    : 'text-slate-400 hover:underline'}`}>
                              {co.note_anterieure}/20 <span className="text-slate-400">
                                {String(co.annee_anterieure || '').slice(2, 7)}
                              </span>{co.deja_reporte ? ' ✓' : ''}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300 flex-none
                                             w-24 text-right">—</span>
                          )}

                          {/* LE REPORT SE FAIT PAR COURS, jamais par acquis :
                              c'est ce que porte etudiant_report_note. */}
                          {form.cible === 'cours' ? (
                            <input type="number" min="0" max="20" step="0.5" value={note}
                              placeholder="note"
                              onChange={e => {
                                const v = e.target.value;
                                setForm(f => {
                                  const notes = { ...(f.notes || {}) };
                                  if (v === '') delete notes[code]; else notes[code] = v;
                                  // Saisir une note vaut sélection : sans cela on
                                  // encoderait un point sans dispenser le cours.
                                  const x = (f.cible_detail || '').split(',').filter(Boolean);
                                  return { ...f, notes,
                                    cible_detail: v !== '' && !x.includes(code)
                                      ? [...x, code].join(',') : f.cible_detail };
                                });
                              }}
                              className={`w-16 flex-none border rounded px-1.5 py-0.5
                                          text-[12px] text-right ${sousSeuil
                                            ? 'border-amber-400 bg-amber-50'
                                            : 'border-slate-300'}`} />
                          ) : <span className="w-16 flex-none" />}
                        </div>

                        {/* LA MOTIVATION, SOUS L'ACQUIS QU'ELLE MOTIVE. Elle
                            vivait dans un second bloc qui rejouait la même
                            liste : on cochait en bas, le bouton restait gris,
                            et rien ne disait que la case utile était en haut. */}
                        {form.cible === 'aa' && actif && (
                          <textarea rows={2}
                            value={(form.equivalences || {})[code] || ''}
                            onChange={e => setForm(f => ({ ...f,
                              equivalences: { ...(f.equivalences || {}), [code]: e.target.value } }))}
                            className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] border border-slate-300
                                       rounded-lg px-2 py-1 text-[12px]" />
                        )}
                        </div>
                      );
                    })}
                  </div>

                  {Object.keys(form.notes || {}).length > 0 && (
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200
                                    text-[11px] text-slate-600">
                      {Object.keys(form.notes).length} note(s) à reporter
                      {Object.values(form.notes).some(n => Number(n) < seuilReport) && (
                        <span className="text-amber-700 font-semibold">
                          {' '}· dont certaines sous le seuil de {seuilReport}/20
                        </span>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          )}

          {/* ═══ LES ACQUIS RECONNUS ÉQUIVALENTS ═══
              Le Conseil ne dispense pas d'un acquis : il constate qu'il est
              maîtrisé ailleurs. C'est ce constat, écrit acquis par acquis, qui
              tient devant une inspection — d'où une phrase proposée, jamais un
              blanc, et toujours remplaçable. */}
          {form.ue_num && composantes?.aas?.length > 0
            && !(form.type === 'partielle' && form.cible === 'aa') && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                              flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  Acquis d'apprentissage reconnus équivalents
                </span>
                <span className="text-[11px] text-slate-500">
                  {Object.keys(form.equivalences || {}).length} / {composantes.aas.length}
                  {form.type === 'complete' && ' · dispense complète'}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {composantes.aas.map(a => {
                  const coche = (form.equivalences || {})[a.aa_code] !== undefined;
                  return (
                    <div key={a.aa_code} className={`px-3 py-2 ${coche ? 'bg-iip-blue/5' : ''}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={coche} className="mt-0.5"
                          onChange={() => setForm(f => {
                            const eq = { ...(f.equivalences || {}) };
                            if (coche) delete eq[a.aa_code];
                            else eq[a.aa_code] = composantes.texte_equivalence || '';
                            return { ...f, equivalences: eq };
                          })} />
                        <span className="text-[12px] flex-1 min-w-0">
                          <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                            {a.aa_code}
                          </span>
                          {a.description || ''}
                        </span>
                      </label>
                      {coche && (
                        <textarea rows={2}
                          value={(form.equivalences || {})[a.aa_code] || ''}
                          onChange={e => setForm(f => ({ ...f,
                            equivalences: { ...(f.equivalences || {}), [a.aa_code]: e.target.value } }))}
                          className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] border border-slate-300
                                     rounded-lg px-2 py-1 text-[12px]" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Date décision CE</span>
              <input type="date" value={form.decision_ce_date || ''}
                onChange={e => setForm(f => ({ ...f, decision_ce_date: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Commentaire</span>
              <input value={form.commentaire || ''}
                onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
          </div>

          {/* UN BOUTON GRIS QUI NE DIT PAS POURQUOI EST UN BOUTON CASSÉ.
              « Il ne veut pas de ma valorisation » : il en voulait bien, mais
              rien à l'écran ne nommait ce qui manquait. */}
          {(() => {
            const refus = form.decision === 'refusee';
            const manque = !form.ue_num
              ? "Choisissez l'unité d'enseignement."
              : refus
                ? (String(form.motif_refus || '').trim() ? null
                  : 'Un refus se motive : écrivez ce que le Conseil a constaté.')
                : (form.type === 'partielle' && !form.cible_detail)
                  ? `Cochez au moins un ${form.cible === 'cours' ? 'cours'
                      : "acquis d'apprentissage"} à dispenser.`
                  : null;
            return manque && (
              <div className="text-[12px] text-amber-800">{manque}</div>
            );
          })()}

          <div className="flex gap-2">
            <button onClick={sauver}
              disabled={!form.ue_num
                || (form.decision === 'refusee'
                  ? !String(form.motif_refus || '').trim()
                  : form.type === 'partielle' && !form.cible_detail)}
              className="bouton bouton-fort disabled:opacity-40">
              {form.id ? 'Enregistrer la correction' : 'Enregistrer'}
            </button>
            <button onClick={() => { setForm(null); setComposantes(null); }}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          </div>
        </div>
      )}

      {!valos.length ? (
        <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
          Aucune valorisation enregistrée
        </div>
      ) : (
        <div className="space-y-2">
          {valos.map(v => (
            <div key={v.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
              <div>
                <span className="font-medium text-iip-blue">{v.ue_num}</span>
                <span className="text-slate-600 ml-1.5 text-[13px]">{v.ue_nom}</span>
                {v.decision === 'refusee' && (
                  <span className="ml-2 text-[11px] font-semibold text-[#9D4A38]">refusée</span>
                )}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {v.decision === 'refusee' ? 'Demande refusée' : (
                    <>
                      {TYPES_VA.find(t => t.val === v.type)?.label}
                      {v.cible ? ` · ${v.cible === 'cours' ? 'cours' : 'AA'} : ${v.cible_detail}` : ''}
                      {v.pourcentage != null ? ` · ${v.pourcentage} %` : ''}
                    </>
                  )}
                  {v.decision_ce_date ? ` · CE du ${v.decision_ce_date}` : ''}
                </div>
                {v.decision === 'refusee' && v.motif_refus && (
                  <div className="text-[12px] text-slate-600 mt-0.5">{v.motif_refus}</div>
                )}

                {/* LES PREUVES. Une valorisation se décide sur pièces — un
                    diplôme, une attestation, un dossier pédagogique. Elles
                    vivaient dans une armoire ou une boîte courriel : deux ans
                    plus tard, la décision ne s'appuyait plus sur rien. */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(v.fichiers || []).map(f => (
                    <span key={f.id}
                      className="inline-flex items-center gap-1 text-[11px] border
                                 border-slate-200 rounded-lg pl-2 pr-1 py-0.5 bg-white">
                      <button type="button" onClick={() => telecharger(f)}
                        className="hover:underline text-iip-blue max-w-[220px] truncate"
                        title={`${f.nom} · ${Math.round((f.taille || 0) / 1024)} Ko`}>
                        {f.nom}
                      </button>
                      {estAdmin && (
                        <>
                          <button type="button" onClick={() => renommer(f)}
                            className="text-slate-300 hover:text-iip-blue" title="Renommer">
                            <IconWritingSign size={12} />
                          </button>
                          <button type="button" onClick={() => supprimerPiece(f.id)}
                            className="text-slate-300 hover:text-red-500" title="Supprimer la pièce">
                            <IconX size={12} />
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                  <select value={nature} onChange={e => setNature(e.target.value)}
                    title="Nature de la pièce — elle donne son nom au fichier"
                    className="text-[11px] border border-slate-300 rounded-lg px-1.5 py-0.5">
                    {natures.map(n => <option key={n.cle} value={n.cle}>{n.label}</option>)}
                  </select>
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-500
                                    border border-dashed border-slate-300 rounded-lg px-2 py-0.5
                                    cursor-pointer hover:border-iip-blue hover:text-iip-blue">
                    <IconUpload size={12} /> Déposer une preuve
                    <input type="file" className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.tif,.tiff,.doc,.docx,.odt,.xls,.xlsx,.ods,.txt,.eml"
                      onChange={e => { deposer(v.id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-none">
                {/* UNE ICÔNE SE MÉRITE. Celle-ci ouvrait une fenêtre entière et
                    produisait des pièces officielles : au bout d'une ligne, à
                    côté d'une corbeille, personne ne la trouvait. Un libellé. */}
                <button onClick={() => rouvrir(v)} title="Rouvrir et corriger"
                  className="bouton text-[12px] px-2.5 py-1">
                  <IconWritingSign size={14} /> Modifier
                </button>
                <button onClick={() => setDocuments({ ue_num: v.ue_num, ue_nom: v.ue_nom })}
                  title="Procès-verbal de valorisation et attestations — pièce de l'unité"
                  className="bouton bouton-sortir text-[12px] px-2.5 py-1">
                  <IconPrinter size={14} /> Documents
                </button>
                {estAdmin && (
                  <button onClick={() => supprimer(v.id)} className="text-slate-300 hover:text-red-500">
                    <IconTrash size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {documents && (
        <SeanceValorisation ueNum={documents.ue_num} ueNom={documents.ue_nom}
          annee={annee} onClose={() => setDocuments(null)} />
      )}

      <p className="text-[11px] text-slate-400 mt-3">
        Dispense complète : l'UE est acquise, l'apprenant n'est pas comptabilisé comme régulier pour cette UE (art. 4).
        Dispense partielle : dispense d'activités d'enseignement, l'apprenant reste comptabilisé (art. 3).
        Interdite pour les épreuves intégrées.
      </p>
    </div>
  );
}

function DossierApprenant({ etudId }) {
  const [pieces, setPieces] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/pieces`, { headers: authHeaders() });
    if (rep.ok) setPieces(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function setStatut(type, statut) {
    await fetch(`/api/etudiants/${etudId}/pieces/${type}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ statut }),
    });
    await charger();
  }

  if (!pieces) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;
  const recues = pieces.filter(p => p.statut !== 'manquant').length;

  return (
    <div>
      <p className="text-[12px] text-slate-500 mb-3">
        Dossier individuel de l'apprenant — {recues}/{pieces.length} pièces traitées
        <span className="text-slate-400"> · circulaire n° 9764 du 13/07/2026</span>
      </p>
      <div className="space-y-2">
        {pieces.map(p => (
          <div key={p.type} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="text-[13px] text-slate-700">{p.libelle}</div>
            <div className="flex gap-1 flex-none">
              {STATUTS_PIECE.map(s => (
                <button key={s.val} onClick={() => setStatut(p.type, s.val)}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition ${
                    p.statut === s.val ? s.cls + ' font-semibold' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Fiche étudiant + PAE ──────────────────────────────────────────────────────
/**
 * LE PARCOURS D'UN DOSSIER À L'AUTRE.
 *
 * La fiche s'ouvrait sur un étudiant, se fermait, il fallait retrouver sa ligne
 * dans la liste, cliquer la suivante. Pour vérifier trente PAE, c'était trente
 * allers-retours. Deux flèches suffisaient — et le clavier, puisqu'on a les
 * deux mains sur autre chose.
 *
 * ET IL FAUT POUVOIR DIRE DE QUI ON PARLE. « Les inscrits de l'UE 246 en
 * 2024-2025 » est la cohorte qu'on veut suivre : la section, l'année et l'unité
 * se choisissent depuis la fenêtre même, sans la fermer. Changer de cohorte
 * n'emmène pas ailleurs — on reste sur le dossier ouvert s'il en fait encore
 * partie, et sinon on prend le premier de la nouvelle liste.
 */
/* LA NAVIGATION DANS LA RANGÉE D'ONGLETS (2.12.212, Charles : « moche »).
 * Cinq bandes s'empilaient au-dessus du parcours ; la navigation 7 / 934 en
 * était une à elle seule. Elle se loge à gauche des onglets, et les filtres
 * « Parcourir » dans un menu, au bout de la rangée. */
/* LES NOTES DANS UN TIROIR (2.12.217, Charles, 26 septembre 2026 : « ta
 * proposition 4 est excellente », « un tiroir qui s'ouvre de droite à
 * gauche »). Le schéma a toute la largeur ; la grille des notes glisse depuis
 * le bord droit, PAR-DESSUS, et se referme sur une languette. Son état est
 * gardé d'une fiche à l'autre (préférence de ce navigateur seulement). La
 * zone prend la hauteur du tiroir quand il est plus haut que le schéma, pour
 * qu'il ne recouvre pas le programme dessous. */
function TiroirNotes({ children }) {
  const CLE = 'lucie.fiche.notes-ouvertes';
  const [ouvert, setOuvert] = useState(() => { try { return localStorage.getItem(CLE) !== '0'; } catch { return true; } });
  const [hauteur, setHauteur] = useState(0);
  const panneau = useRef(null);
  useEffect(() => { try { localStorage.setItem(CLE, ouvert ? '1' : '0'); } catch { /* navigation privée */ } }, [ouvert]);
  useEffect(() => {
    const el = panneau.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHauteur(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    /* LE TIROIR S'OUVRE SOUS LA BANDE DE TITRE DU SCHÉMA (2.12.218 — « ça passe
       derrière ») : posé à la même hauteur, il coupait le titre en deux. */
    <div className="relative pt-3 overflow-x-clip" style={{ minHeight: ouvert ? hauteur + 56 : undefined }}>
      <div className="pr-9">{children.schema}</div>
      {/* La languette, toujours là : elle ouvre et ferme. */}
      <button type="button" onClick={() => setOuvert(o => !o)}
        title={ouvert ? 'Refermer les notes' : 'Ouvrir les notes par année'}
        className="absolute right-0 top-[3.25rem] z-20 w-7 rounded-l-champ bg-iip-blue text-white text-[11px] font-semibold py-3 flex flex-col items-center gap-1 shadow-pose">
        <span className="[writing-mode:vertical-rl] rotate-180">Notes</span>
        <span aria-hidden="true">{ouvert ? '›' : '‹'}</span>
      </button>
      {/* Le tiroir : il glisse de droite à gauche, jusqu'aux trois cinquièmes. */}
      <div ref={panneau} aria-hidden={!ouvert}
        className={`absolute right-7 top-[3.25rem] z-10 w-[min(92%,1400px)] bg-white border border-slate-200 rounded-l-carte shadow-flottant p-3
          transition-transform duration-300 ease-ios origin-right ${ouvert ? 'translate-x-0' : 'translate-x-[calc(100%+1.75rem)] pointer-events-none'}`}>
        {children.notes}
      </div>
    </div>
  );
}

function NavFiche({ position, onPrec, onSuiv }) {
  const { i = 0, n = 0 } = position || {};
  return (
    <div className="flex items-center gap-1 mr-3 pr-3 border-r border-slate-200">
      <button onClick={onPrec} disabled={i <= 1} title="Dossier précédent (flèche gauche)"
        className="p-1 rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-30">
        <IconChevronLeft size={14} />
      </button>
      <span className="text-[12px] text-slate-600 tabular-nums min-w-[4.5rem] text-center">{n ? `${i} / ${n}` : '—'}</span>
      <button onClick={onSuiv} disabled={!n || i >= n} title="Dossier suivant (flèche droite)"
        className="p-1 rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-30">
        <IconChevronRight size={14} />
      </button>
    </div>
  );
}
function MenuParcourir({ portee, onPortee, sections, ues, annees }) {
  const [ouvert, setOuvert] = useState(false);
  const actifs = [portee.section, portee.annee, portee.ue_num].filter(Boolean).length;
  const champ = 'controle w-full border border-slate-300 rounded-champ bg-white text-[12px]';
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert(o => !o)}
        title="Les dossiers que les flèches parcourent"
        className={`bouton bouton-compact inline-flex items-center gap-1 ${actifs ? 'border-[#1B2B4B] text-iip-blue' : ''}`}>
        Parcourir{actifs ? ` · ${actifs}` : ''} <IconChevronRight size={12} className={`transition ${ouvert ? 'rotate-90' : ''}`} />
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-white border border-slate-200 rounded-carte shadow-flottant p-3 space-y-2"
          onMouseLeave={() => setOuvert(false)}>
          <div className="text-[11px] text-slate-500">Les flèches ‹ › passent d'un dossier à l'autre parmi :</div>
          <select className={champ} value={portee.section}
            onChange={e => onPortee({ ...portee, section: e.target.value, ue_num: '' })}>
            <option value="">Toutes les sections</option>
            {(sections || []).map(x => <option key={x.code} value={x.code}>{x.libelle || x.code}</option>)}
          </select>
          <select className={champ} value={portee.annee} onChange={e => onPortee({ ...portee, annee: e.target.value })}>
            <option value="">Toutes les années</option>
            {(annees || []).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className={champ} value={portee.ue_num} disabled={!ues?.length}
            onChange={e => onPortee({ ...portee, ue_num: e.target.value })}
            title={ues?.length ? '' : 'Choisissez d’abord une section'}>
            <option value="">Toutes les UE</option>
            {(ues || []).map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom || ''}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function FicheEtudiant({ id, annee, onClose, position, onPrec, onSuiv,
                         portee, onPortee, sections, ues, annees, onModifie }) {
  const [annexe2, setAnnexe2] = useState(false);
  const [motivation, setMotivation] = useState(false);
  const [edition, setEdition] = useState(false);   // le centre d'édition, sur cet étudiant
  const [data, setData] = useState(null);
  const [pae, setPae] = useState(null);
  // « grille » n'existe plus depuis la fusion avec le PAE : la fiche s'ouvrait
  // sur un onglet sans contenu, et paraissait vide jusqu'à ce qu'on clique.
  const [onglet, setOnglet] = useState('parcours');
  const [ficheInscription, setFicheInscription] = useState(null);
  const [selection, setSelection] = useState(null);      // Set des ue_num retenues
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [paeConfirme, setPaeConfirme] = useState(false);
  const [sectionForcee, setSectionForcee] = useState('');

  // LES FLÈCHES DU CLAVIER, mais jamais pendant qu'on écrit : dans un champ de
  // saisie, la flèche déplace le curseur et c'est ce qu'on attend d'elle.
  useEffect(() => {
    const dansUnChamp = t => {
      const b = (t?.tagName || '').toLowerCase();
      return b === 'input' || b === 'textarea' || b === 'select' || t?.isContentEditable;
    };
    const au = ev => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || dansUnChamp(ev.target)) return;
      if (ev.key === 'ArrowLeft' && onPrec) { ev.preventDefault(); onPrec(); }
      if (ev.key === 'ArrowRight' && onSuiv) { ev.preventDefault(); onSuiv(); }
    };
    window.addEventListener('keydown', au);
    return () => window.removeEventListener('keydown', au);
  }, [onPrec, onSuiv]);

  async function paeAuto() {
    if (!window.confirm('Inscrire automatiquement cet étudiant à toutes les UE accessibles en ' + annee + ' (y compris les inscriptions sous réserve) ?')) return;
    const rep = await fetch(`/api/etudiants/${id}/pae-auto`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }
    const nbSR = Object.keys(j.sous_reserve || {}).length;
    alert(`${j.creees} inscription(s) créée(s) — ${j.inscrites.length} UE au PAE ${annee}` +
      (nbSR ? `\ndont ${nbSR} sous réserve : UE ${Object.keys(j.sous_reserve).join(', ')}` : ''));
    await chargerPAE(); await charger();
  }

  function basculerUE(u) {
    setSelection(prev => {
      const s = new Set(prev);
      if (s.has(u.ue_num)) { s.delete(u.ue_num); return s; }
      // Ajout d'une UE hors proposition dont les prérequis ne sont pas acquis
      if (!u.propose && !u.accessible && !u.reinscriptible_ce) {
        const chaine = u.prereq_chaine?.length ? u.prereq_chaine : (u.prereq_manquants || []);
        const msg = chaine.length
          ? `Cette UE exige la réussite de : UE ${chaine.join(', ')}.\n\n`
            + `L'exigence est transitive — une UE prérequise a elle-même ses propres prérequis.\n\n`
            + `Ajouter quand même ? La dérogation sera tracée.`
          : 'Ajouter cette UE au PAE ?';
        if (!window.confirm(msg)) return s;
      }
      s.add(u.ue_num);
      return s;
    });
  }

  /**
   * Confirmer le programme : les unités retenues sont inscrites et l'étudiant
   * passe en « inscrit ». Retirer la confirmation ne SUPPRIME PAS les
   * inscriptions — les effacer emporterait des résultats éventuels.
   */
  async function confirmerPAE() {
    setEnregistrement(true);
    try {
      if (paeConfirme) {
        const rep = await fetch(
          `/api/etudiants/${id}/pae/confirmer?annee=${encodeURIComponent(annee)}`,
          { method: 'DELETE', headers: authHeaders() });
        if (!rep.ok) { alert('Le retrait a échoué.'); return; }
        setPaeConfirme(false);
        return;
      }
      const ues = (pae?.pae || []).filter(u => u.inscrit || u.propose).map(u => u.ue_num);
      const rep = await fetch(`/api/etudiants/${id}/pae/confirmer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ues }),
      });
      const j = await rep.json();
      if (!rep.ok) { alert(j.error || 'La confirmation a échoué.'); return; }
      setPaeConfirme(true);
      await chargerPAE();
      onModifie && onModifie();
    } finally { setEnregistrement(false); }
  }

  async function enregistrerPAE() {
    if (!selection) return;
    setEnregistrement(true);
    try {
      const ue_nums = [...selection];
      const derogations = pae.pae
        .filter(u => selection.has(u.ue_num) && !u.propose && !u.accessible && !u.reinscriptible_ce)
        .map(u => u.ue_num);
      const rep = await fetch(`/api/etudiants/${id}/pae-valider`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums, derogations }),
      });
      const j = await rep.json();
      if (!rep.ok) { alert(j.error || 'Erreur'); return; }

      // Les inscriptions portant un résultat ne sont jamais retirées d'office
      if (j.conservees) {
        const forcer = window.confirm(
          `${j.conservees} inscription(s) décochée(s) portent un résultat encodé et ont été conservées.\n\n` +
          `Les supprimer quand même, avec leurs notes ?`);
        if (forcer) {
          const rep2 = await fetch(`/api/etudiants/${id}/pae-valider`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ annee, ue_nums, derogations, forcer: true }),
          });
          const j2 = await rep2.json();
          if (rep2.ok) {
            alert(`PAE enregistré — ${j2.total} UE inscrites\n${j2.retirees} retirée(s)`);
            await chargerPAE(); await charger();
            return;
          }
        }
      }

      alert(`PAE enregistré — ${j.total} UE inscrites` +
        (j.ajoutees ? `\n${j.ajoutees} ajoutée(s)` : '') +
        (j.retirees ? `\n${j.retirees} retirée(s)` : '') +
        (j.conservees ? `\n${j.conservees} conservée(s) car elles portent un résultat` : ''));
      await chargerPAE(); await charger();
    } finally { setEnregistrement(false); }
  }

  async function ouvrirFicheInscription() {
    const rep = await fetch(`/api/etudiants/${id}/fiche-inscription?annee=${annee}`, { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setFicheInscription(j);
    else alert(j.error || 'Erreur');
  }

  // Les frais de scolarité relèvent de l'établissement, non de la Fédération :
  // ils font l'objet d'un document distinct de la fiche d'inscription.
  async function ouvrirFraisScolarite() {
    const rep = await fetch(`/api/frais-scolarite/etudiant/${id}/document?annee=${annee}`,
      { headers: authHeaders() });
    if (!rep.ok) {
      const j = await rep.json().catch(() => ({}));
      alert(j.error || 'Erreur à la génération du document.');
      return;
    }
    const j = await rep.json();
    // Le même aperçu que la fiche d'inscription : setRapport appartient à un
    // autre composant, l'appeler ici ne produisait rien.
    setFicheInscription({ html: j.html, titre: j.titre });
  }

  // Une attestation PAR UNITÉ réussie : ce sont des pièces distinctes, remises
  // séparément, chacune sur sa page.
  /** Le parcours pédagogique : schéma et unités acquises, une page paysage. */
  async function ouvrirParcours() {
    const rep = await fetch(
      `/api/etudiants/${id}/fiche-parcours/document?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Document indisponible.'); return; }
    setFicheInscription({ html: j.html, titre: 'Parcours de formation', nom: j.nom });
  }

  async function ouvrirAttestations() {
    const rep = await fetch(`/api/attestations/etudiant/${id}/document?annee=${annee}`,
      { headers: authHeaders() });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || 'Erreur à la génération.'); return; }
    if (j.manques?.length) {
      alert(
        `${j.unites} attestation(s) produite(s), mais des mentions obligatoires manquent :\n\n`
        + j.manques.map(m => `UE ${m.ue_num} — ${m.manques.join(', ')}`).join('\n')
        + `\n\nCes mentions se complètent dans le référentiel des UE.`);
    }
    setFicheInscription({ html: j.html, titre: `Attestations de réussite — ${annee}`, nom: j.nom });
  }


  const anneePrecedente = useMemo(() => {
    if (!annee) return null;
    const [a1, a2] = annee.split('-').map(Number);
    return `${a1-1}-${a2-1}`;
  }, [annee]);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${id}`, { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  async function chargerPAE() {
    try {
      const rep = await fetch(
        `/api/etudiants/${id}/pae?annee=${annee}&annee_precedente=${anneePrecedente}` +
        (sectionForcee ? `&section=${encodeURIComponent(sectionForcee)}` : ''),
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) {
        setPae(j);
        // L'état vient du serveur : sans cela le bouton repartirait à zéro à
        // chaque rechargement de la fiche.
        setPaeConfirme(!!j.pae_confirme);
        // Une inscription existante n'est reconduite que si elle TIENT :
        // ni déjà acquise, ni bloquée par des prérequis manquants. Sans quoi
        // un programme calculé par erreur se perpétuerait d'année en année.
        setSelection(new Set(j.pae.filter(u =>
          !u.deja_reussie && (u.propose || (u.inscrite && (u.accessible || u.sous_reserve)))
        ).map(u => u.ue_num)));
      }
      else setPae({ erreur: j.error || 'Erreur serveur' });
    } catch(e) { setPae({ erreur: e.message }); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (onglet === 'parcours') chargerPAE(); /* eslint-disable-next-line */ }, [sectionForcee]);



  if (!data) return <div className="p-6 text-slate-400 text-sm">Chargement…</div>;

  // LA FICHE PREND LE CADRE COMMUN. Elle avait son propre bandeau marine, deux
  // fois plus haut que celui des autres fenêtres, et sa propre croix : on
  // changeait de maison en ouvrant un étudiant. Le nom devient le titre, le
  // courriel et le matricule la ligne de contexte — c'est exactement ce que le
  // bandeau commun sait faire.
  return (
    <Fenetre icone={IconUser} titre={nomPropre(data.nom, data.prenom)}
      sous={`${data.email_ecole} · ${data.id_ecampus}`
            + (data.niveau?.libelle ? ' · ' + data.niveau.libelle : '')}
      large="ecran" onFermer={onClose}>
      <div className="-mx-5 -my-4">


        {/* Onglets — et, au bout de la rangée, IMPRIMER OU ENVOYER (Charles, 26
            septembre 2026 : « supprimer Documents et mettre le lien vers le
            centre d'édition », « dans la rangée d'onglets »). Visible quel que
            soit l'onglet : les pièces d'un étudiant ne dépendent pas de la face
            qu'on regarde. */}
        <div className="flex items-center border-b border-slate-200 px-5">
          {(onPrec || onSuiv) && <NavFiche position={position} onPrec={onPrec} onSuiv={onSuiv} />}
          {/* Le PARCOURS réunit ce que la grille et le PAE disaient de deux
              façons : le schéma, l'acquis, et le programme proposé. Les
              VALORISATIONS et le DROIT D'INSCRIPTION se rejoignent aussi —
              l'un détermine l'autre. */}
          {[['parcours', `Parcours (${data.inscriptions?.length || 0})`],
            ['identite', 'Identité'],
            ['va', 'Valorisation'],
            ['finances', 'Finances'],
            ['stages', 'Stages'],
            ['amenagements', 'Aménagements'],
            ['suivi', 'Suivi'],
            ['dossier', 'Dossier']].map(([k, l]) => (
            <button key={k}
            onClick={() => { setOnglet(k); if (k === 'parcours' && !pae) chargerPAE(); }}
              className={`onglet-page ${onglet === k ? 'onglet-page-actif' : ''}`}>
              {l}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 my-1">
          {(onPrec || onSuiv) && portee && (
            <MenuParcourir portee={portee} onPortee={onPortee} sections={sections} ues={ues} annees={annees} />
          )}
          <button type="button" onClick={() => setEdition(true)}
            title="Le centre d'édition, avec les pièces de cet étudiant en tête"
            className="bouton bouton-sortir bouton-compact inline-flex items-center gap-1.5">
            <IconSend size={14} /> Imprimer ou envoyer
          </button>
          </div>
        </div>
        {edition && (
          <CentreImpressionCentral onClose={() => setEdition(false)}
            pieces={[
              { cle: 'attestations', icon: IconFileText, label: 'Attestations de réussite',
                description: "Une par unité d'enseignement réussie", onClick: ouvrirAttestations },
              { cle: 'parcours', icon: IconFileText, label: 'Parcours de formation',
                description: 'Schéma de capitalisation et unités acquises — 1 page', onClick: ouvrirParcours },
              { cle: 'motivation', icon: IconFileText, label: 'Motiver un refus ou un ajournement',
                description: 'Annexes 8 et 9 — une justification par acquis', onClick: () => setMotivation(true) },
              { cle: 'annexe2', icon: IconFileText, label: 'Progrès des études (annexe 2)',
                description: "Office des Étrangers — réclame la nationalité", onClick: () => setAnnexe2(true) },
            ]} />
        )}

        {/* Les ACTIONS du programme, ancrées sous les onglets. Placées dans
            le contenu, elles ne pouvaient pas rester visibles : le défilement
            est porté par la fenêtre entière, non par l'onglet. */}
              {onglet === 'parcours' && pae && !pae.erreur && (
                <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-1.5 flex gap-2 items-center flex-wrap">
                  <button onClick={enregistrerPAE} disabled={enregistrement}
                    className="bouton bouton-fort bouton-compact">
                    <IconCheck size={14} />
                    {enregistrement ? 'Enregistrement…' : 'Enregistrer le PAE'}
                  </button>
                  <button onClick={confirmerPAE} disabled={enregistrement}
                    title={paeConfirme
                      ? 'Retirer la confirmation — les inscriptions sont conservées'
                      : "Confirmer le programme : l'étudiant passe en inscrit"}
                    className="bouton bouton-compact">
                    <IconWritingSign size={14} />
                    {paeConfirme ? 'Programme confirmé' : 'Confirmer le programme'}
                  </button>
                  {/* Le menu « Documents » a rejoint le centre d'édition : bouton
                      « Imprimer ou envoyer », au bout de la rangée d'onglets. */}

                  <span className="text-[12px] text-slate-500 ml-1">
                    {paeConfirme
                      ? "L'étudiant est inscrit aux unités retenues."
                      : "Rien n'est inscrit tant que vous n'avez pas confirmé."}
                  </span>
                </div>
              )}

        <div className="px-5 py-3">
          {/* Inscriptions + résultats */}
          {onglet === 'va' && <Valorisations etudId={id} annee={annee} />}

          {/* LE SUIVI CONFIDENTIEL — la porte est jugée par le serveur, pas
              par l'onglet : à qui n'est ni enseignant de l'étudiant, ni sa
              coordination, ni la direction, l'écran dit que c'est fermé. */}
          {onglet === 'suivi' && <SuiviEtudiant etudId={id} />}

          {/* FINANCES : tout ce qui touche à l'argent au même endroit — droit
              d'inscription, exonérations, frais de scolarité et leurs
              documents. Le mêler à la valorisation était bancal : l'une relève
              du pédagogique, l'autre de l'administratif. */}
          {onglet === 'finances' && (
            <div className="p-5 space-y-5">
              <DroitInscription etudId={id} annee={annee} />

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <h3 className="text-[15px] font-semibold text-iip-blue">
                      Frais de scolarité
                    </h3>
                    <p className="text-[12px] text-slate-500">
                      Document distinct du droit d'inscription : la Fédération
                      n'en connaît pas.
                    </p>
                  </div>
                  <button onClick={ouvrirFraisScolarite}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border
                               border-iip-blue text-iip-blue font-semibold rounded-lg">
                    <IconFileText size={14} /> Produire le document
                  </button>
                </div>

                {/* Le calcul À L'ÉCRAN, et pas seulement dans le document
                    imprimé : le secrétariat doit pouvoir répondre à un
                    étudiant sans générer un PDF. */}
                <FraisScolarite etudId={id} annee={annee} />
              </div>

              <div className="border-t border-slate-200 pt-4">
                <button onClick={ouvrirFicheInscription}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border
                             border-slate-300 text-slate-600 font-semibold rounded-lg">
                  <IconFileText size={14} /> Fiche d'inscription / reçu
                </button>
                <p className="text-[12px] text-slate-500 mt-1">
                  Récapitulatif du programme, des droits et de l'engagement signé.
                </p>
              </div>
            </div>
          )}


          {onglet === 'dossier' && <DossierApprenant etudId={id} />}

          {motivation && (
            <MotivationDecision etudId={id} annee={annee}
              onClose={() => setMotivation(false)} />
          )}

          {annexe2 && (
            <Annexe2 etudId={id} annee={annee} onClose={() => setAnnexe2(false)} />
          )}

          {onglet === 'identite' && (
            <div className="p-5">
              <IdentiteEtudiant etudId={id} onModifie={charger} />
            </div>
          )}

          {onglet === 'stages' && (
            <div className="p-5">
              <Stages etudId={id} annee={annee} />
            </div>
          )}

          {onglet === 'amenagements' && (
            <div className="p-5">
              <Amenagements etudId={id} annee={annee} />
            </div>
          )}

          {onglet === 'parcours' && (
            <div>

              {/* L'ordre de lecture : le SCHÉMA d'abord — la vue d'ensemble du
                  parcours —, puis le programme proposé, et les NOTES en
                  dernier, qui sont le détail. */}
              {/* Pas de marge LATÉRALE : la grille qui suit n'en a pas, et le
                  cadre du schéma s'arrêtait donc avant elle. Les deux blocs
                  doivent avoir exactement la même largeur pour se lire comme
                  un seul écran. */}
              {/* CÔTE À CÔTE SUR UN ÉCRAN LARGE (Charles, 26 septembre 2026) :
                  le schéma à gauche, les notes par année à droite — la vue
                  d'ensemble et le détail d'un seul regard, sans faire défiler.
                  Sur un écran étroit, l'un revient sous l'autre. */}
              <TiroirNotes>
                {{
                  schema: <SchemaCapitalisation etudId={id} annee={annee} />,
                  notes: <GrilleParcours etudId={id} peutEcrire={true} annee={annee} />,
                }}
              </TiroirNotes>

              <div className="border-t border-slate-200 mt-4 pt-4">
              {/* Ce qui suit est une PROPOSITION tant qu'elle n'est pas
                  confirmée : le dire évite de la lire comme un état de fait,
                  maintenant que schéma et programme sont sur la même page. */}
              <div className={`mb-3 px-3 py-2 rounded-lg text-[13px] border ${
                paeConfirme
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <b>{paeConfirme ? 'Programme confirmé' : 'Programme proposé'}</b>
                {' — '}
                {paeConfirme
                  ? "l'étudiant est inscrit aux unités ci-dessous."
                  : "rien n'est inscrit tant que vous n'avez pas confirmé. "
                    + 'Les unités ci-dessous sont celles que Lucie propose au vu '
                    + 'du parcours et des prérequis.'}
              </div>

              {!pae ? (
                <div className="text-center py-8 text-slate-400 text-sm">Chargement du PAE…</div>
              ) : pae.erreur ? (
                <div className="text-center py-8 text-red-600 text-sm border border-red-200 bg-red-50 rounded-xl">{pae.erreur}</div>
              ) : (() => {
                const sel = selection || new Set();
                const retenues = pae.pae.filter(u => sel.has(u.ue_num));
                const acquises = pae.pae.filter(u => !sel.has(u.ue_num) && u.deja_reussie);
                const autres   = pae.pae.filter(u => !sel.has(u.ue_num) && !u.deja_reussie);
                // Inscriptions résiduelles sur des UE déjà acquises : vestiges
                // d'un PAE calculé avant l'encodage des résultats.
                const residuelles = acquises.filter(u => u.inscrite);
                // Inscriptions maintenues alors que la chaîne des prérequis
                // n'est pas satisfaite : elles ne sont pas reconduites.
                const bloquees = pae.pae.filter(u =>
                  u.inscrite && !u.deja_reussie && !u.accessible && !u.sous_reserve);
                const ligneStatut = u =>
                  u.reinscriptible_ce
                    ? <span className="text-[11px] text-amber-700 flex items-center gap-1"><IconAlertTriangle size={12} />
                        {u.va_complete ? 'Dispensée (VA complète)' : 'Réinscription — décision du Conseil des études'}</span>
                    : u.accessible
                      ? <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><IconCheck size={12} /> Accessible</span>
                      : u.sous_reserve || u.propose_sous_reserve
                        ? <span className="text-[11px] text-sky-700 flex items-center gap-1"><IconClock size={12} /> Sous réserve — réussite UE {(u.prereq_manquants || []).join(', ')}</span>
                        : u.avertissements?.length
                          ? <span className="text-[11px] text-amber-700 flex items-center gap-1"
                              title={u.avertissements.map(a => `UE ${a.ue_num}${a.motif ? ' — ' + a.motif : ''}`).join('\n')}>
                              <IconAlertTriangle size={12} />
                              Recommandé après {u.avertissements.map(a => a.ue_num).join(', ')}
                            </span>
                        : u.epreuve_integree
                          ? <span className="text-[11px] text-red-600 flex items-center gap-1"
                              title={'Restent à acquérir : UE ' + (u.epreuve_restantes || []).join(', ')}>
                              <IconAlertTriangle size={12} /> Épreuve intégrée — {(u.epreuve_restantes || []).length} UE des années antérieures non acquise(s)
                            </span>
                          : <span className="text-[11px] text-red-600 flex items-center gap-1"
                              title={u.prereq_chaine?.length ? 'Chaîne complète : UE ' + u.prereq_chaine.join(', ') : ''}>
                              <IconAlertTriangle size={12} /> Exige {(u.prereq_chaine || u.prereq_manquants || []).join(', ')}
                            </span>;

                return (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <div className="font-semibold text-iip-blue">Plan Annuel de l'Étudiant — {pae.annee}</div>
                      <div className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{retenues.length} UE retenue(s) · section {(pae.sections || []).join(', ') || '—'}</span>
                        {pae.niveau?.libelle && (
                          <BadgeNiveau niveau={pae.niveau.niveau} libelle={pae.niveau.libelle} />
                        )}
                        {(pae.sections_scores || []).length > 1 && (
                          <select value={sectionForcee} onChange={e => setSectionForcee(e.target.value)}
                            className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-[12px]">
                            <option value="">Section détectée</option>
                            {pae.sections_scores.map(s => (
                              <option key={s.section} value={s.section}>{s.section} ({s.n} UE)</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {bloquees.length > 0 && (
                    <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-red-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-[12px] text-red-900">
                          <b>{bloquees.length} inscription(s) impossible(s)</b> en {pae.annee} :
                          les prérequis ne sont pas acquis. Elles ne sont pas reconduites ;
                          enregistrer le PAE les retirera.
                          <ul className="mt-1 space-y-0.5 text-[11px] text-red-800">
                            {bloquees.slice(0, 8).map(u => (
                              <li key={u.ue_num}>
                                UE {u.ue_num} — exige {(u.prereq_chaine || u.prereq_manquants || []).join(', ') || '—'}
                              </li>
                            ))}
                            {bloquees.length > 8 && <li>… et {bloquees.length - 8} autre(s)</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {residuelles.length > 0 && (
                    <div className="mb-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-amber-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-[12px] text-amber-900">
                          <b>{residuelles.length} UE déjà réussie(s)</b> portent encore une inscription
                          en {pae.annee} — vestige d'un programme calculé avant l'encodage des résultats.
                          Elles ne sont plus proposées ; enregistrer le PAE les retirera.
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            UE {residuelles.map(u => u.ue_num).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  {!retenues.length ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                      Aucune UE retenue — utilisez « Ajouter une UE » ci-dessous.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b">
                          <th className="py-2 w-8"></th>
                          <th className="py-2 text-left">UE proposée</th>
                          <th className="py-2 text-left w-20">Niv.</th>
                          <th className="py-2 text-left w-64">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retenues.map(u => (
                          <tr key={u.ue_num} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                            <td className="py-2">
                              <input type="checkbox" checked readOnly
                                onClick={() => basculerUE(u)}
                                className="cursor-pointer accent-[#00AACC]" />
                            </td>
                            <td className="py-2">
                              <span className="font-medium text-iip-blue">{u.ue_num}</span>
                              <span className="text-slate-600 ml-1.5 text-[13px]">{u.ue_nom}</span>
                              {u.inscrite && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">déjà inscrite</span>}
                            </td>
                            <td className="py-2">
                              <BadgeUeNiveau niveau={u.ue_niv} />
                            </td>
                            <td className="py-2">{ligneStatut(u)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {acquises.length > 0 && (
                    <details className="mt-4 border border-emerald-200 bg-emerald-50/40 rounded-xl">
                      <summary className="px-3 py-2 text-[13px] font-semibold text-emerald-900 cursor-pointer">
                        {acquises.length} UE déjà acquise(s)
                        <span className="font-normal text-emerald-700"> — hors programme</span>
                      </summary>
                      <div className="px-3 pb-2.5">
                        <p className="text-[11px] text-emerald-800 mb-1.5">
                          Réussies ou valorisées lors d'une année antérieure. Une réinscription
                          reste possible, mais suppose une décision favorable du Conseil des études.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {acquises.map(u => (
                            <button key={u.ue_num} onClick={() => basculerUE(u)}
                              title={`${u.ue_nom || ''} — cliquer pour réinscrire`}
                              className="text-[11px] px-2 py-0.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
                              {u.ue_num}
                              {u.va_complete ? ' · VA' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}

                  <button onClick={() => setCatalogueOuvert(o => !o)}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                    <IconPlus size={14} /> {catalogueOuvert ? 'Masquer les autres UE' : `Ajouter une UE (${autres.length} disponibles)`}
                  </button>

                  {catalogueOuvert && (
                    <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                      <p className="text-[11px] text-slate-500 mb-2">
                        UE organisées en {pae.annee} dans la ou les sections de l'étudiant, hors proposition.
                        Ajouter une UE dont les prérequis ne sont pas acquis demande une confirmation — la dérogation est tracée.
                      </p>
                      {!autres.length ? (
                        <div className="text-[12px] text-slate-400 py-2 text-center">Toutes les UE organisées sont déjà retenues.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {autres.map(u => (
                              <tr key={u.ue_num} className="border-b border-slate-100 last:border-0">
                                <td className="py-1.5 w-8">
                                  <input type="checkbox" checked={false} readOnly
                                    onClick={() => basculerUE(u)}
                                    className="cursor-pointer accent-[#00AACC]" />
                                </td>
                                <td className="py-1.5">
                                  <span className="font-medium text-iip-blue">{u.ue_num}</span>
                                  <span className="text-slate-600 ml-1.5 text-[13px]">{u.ue_nom}</span>
                                </td>
                                <td className="py-1.5 w-16">
                                  <BadgeUeNiveau niveau={u.ue_niv} />
                                </td>
                                <td className="py-1.5 w-64">{ligneStatut(u)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 mt-4 border-t pt-3">
                    Le PAE est établi en accord avec l'étudiant et validé par la direction.
                    « Enregistrer le PAE » inscrit les UE cochées ; décocher retire une inscription
                    uniquement si aucun résultat n'y est encodé.
                  </p>
                </>
                );
              })()}
            </div>
              </div>
          )}
        </div>
      </div>

      {ficheInscription && <PreviewModal html={ficheInscription.html}
        titre={ficheInscription.titre || "Fiche d'inscription / reçu"}
        nomFichier={ficheInscription.nom} astuceImpression="Portrait A4"
        destinataire={{ type: 'etudiant', id,
          nom: `${data?.etudiant?.nom || data?.nom || ''} ${data?.etudiant?.prenom || data?.prenom || ''}`.trim() || undefined }}
        typeDoc="fiche_etudiant"
        sujetMail={`${ficheInscription.titre || "Fiche d'inscription"} — Institut Ilya Prigogine`}
        onClose={() => setFicheInscription(null)} />}
    </Fenetre>
  );
}

// ── Page principale Étudiants ─────────────────────────────────────────────────
/* LE VOCABULAIRE DES DÉCISIONS, EN CLAIR — et à portée de qui le lit.
 * Cette table était écrite APRÈS le « return » du composant : du code jamais
 * atteint, donc une constante jamais initialisée. La fiche d'un étudiant
 * portant une décision tombait sur une erreur au lieu d'afficher « réussi ».
 * Elle vit au niveau du module, comme toute table de libellés. */
const LIBELLE_RES = {
  reussi: 'réussi', echec: 'échec', absent: 'absent',
  ajourne: 'ajourné', refuse: 'refusé', va: 'valorisé',
};

export default function Etudiants() {
  /**
   * Export Excel de la section : signalétique et résultats, réimportables.
   *
   * Cette fonction était définie dans GrilleParcours et appelée depuis
   * Etudiants — deux composants distincts. Le bouton cherchait donc une
   * fonction qui n'existait pas dans sa portée.
   */
  async function exporterSection() {
    if (!section) {
      alert("Choisissez d'abord une section : l'export porte sur elle.");
      return;
    }
    try {
      const rep = await fetch(
        `/api/etudiants/export-section?section=${encodeURIComponent(section)}`,
        { headers: authHeaders() });
      if (!rep.ok) {
        const e = await rep.json().catch(() => ({}));
        alert(e.error || `Export impossible (${rep.status}).`);
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await rep.blob());
      a.download = `Export_${section}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message);
    }
  }

  const annee = getAnnee();
  const [etudiants, setEtudiants] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [section, setSection] = useState('');
  /* LES FILTRES DE LA LISTE — demandés par Charles le 21 septembre 2026 :
     « section, BA1, sans section, sans UE… ». Ils portent sur la liste déjà
     chargée : le serveur rend pour chaque étudiant sa section (posée ou
     déduite), son niveau et son nombre d'UE — il n'y a rien à redemander. */
  const [fNiveau, setFNiveau] = useState('');     // '' | BA1 | BA2 | BA3 | MIXTE | aucun
  const [fUE, setFUE] = useState('');             // '' | sans | avec
  const [fRatt, setFRatt] = useState('');         // '' | posee | deduite | aucune
  // Les nouveaux inscrits : aucune trace avant l'année de travail.
  const [fPrimo, setFPrimo] = useState(false);
  // « Doublons » : ne garder que les étudiants dont le nom+prénom (accents et
  // casse ignorés) existe sur PLUSIEURS fiches — les dossiers coupés en deux.
  const [fDoublons, setFDoublons] = useState(false);
  const [sections, setSections] = useState([]);
  const [selId, setSelId] = useState(null);
  // LA COHORTE QU'ON PARCOURT. La section existait déjà comme filtre de la
  // liste ; l'année et l'unité la complètent, et les trois se choisissent aussi
  // depuis la fiche ouverte. Une seule source de vérité : ce que la barre de la
  // fiche change, la liste derrière le change aussi. Rien ne se contredit.
  // LES DIPLÔMÉS NE SONT PLUS DES ÉTUDIANTS EN COURS DE PARCOURS.
  //
  // Réussir l'épreuve intégrée, c'est être diplômé : elle ne se présente
  // qu'une fois toutes les autres unités acquises. Les garder dans la liste
  // fausse ce qu'on y cherche — les effectifs, les inscriptions à faire, les
  // dossiers à suivre — et personne ne s'en aperçoit, parce qu'une liste trop
  // longue ne se voit pas. On les sort par défaut, sans les perdre.
  const [statut, setStatut] = useState('en_cours');
  const [anneeCohorte, setAnneeCohorte] = useState('');
  const [ueCohorte, setUeCohorte] = useState('');
  const [uesCohorte, setUesCohorte] = useState([]);
  const [anneesCohorte, setAnneesCohorte] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreurListe, setErreurListe] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msgImport, setMsgImport] = useState(null);
  const [rapport, setRapport] = useState(null);
  // La liste imprimable des coordonnées des étudiants cochés.
  const [coordonnees, setCoordonnees] = useState(null);
  const [importPAE, setImportPAE] = useState(false);
  const [purge, setPurge] = useState(false);
  const [nouvel, setNouvel] = useState(false);
  const [rapportPAE, setRapportPAE] = useState(false);
  const [importListe, setImportListe] = useState(false);
  const [importHisto, setImportHisto] = useState(false);
  const [complement, setComplement] = useState(false);
  const [centreImpression, setCentreImpression] = useState(false);
  // Le passage d'année : toute une section, sur ses résultats.
  const [passage, setPassage] = useState(false);
  const [composer, setComposer] = useState(false);
  // Une seule porte pour les huit imports et les exports.
  const [echanges, setEchanges] = useState(false);
  // Les titres de fin de cycle, pour une section entière.
  const [diplomation, setDiplomation] = useState(false);
  const [comparaison, setComparaison] = useState(false);
  const [importSurMesure, setImportSurMesure] = useState(false);
  const [importSignaletique, setImportSignaletique] = useState(false);
  const [rattacherPack, setRattacherPack] = useState(false);
  const [importSuivi, setImportSuivi] = useState(false);
  const [tri, setTri] = useState({ champ: 'nom', sens: 1 });


  function trierPar(champ) {
    setTri(t => t.champ === champ ? { champ, sens: -t.sens } : { champ, sens: 1 });
  }

  async function ouvrirRapport() {
    if (!section) { alert('Choisissez d\'abord une section dans le filtre.'); return; }
    const [a1, a2] = (annee || '').split('-').map(Number);
    const anneeRapport = window.prompt('Année académique du rapport ?', (a1-1) + '-' + (a2-1));
    if (!anneeRapport || !/^20\d{2}-20\d{2}$/.test(anneeRapport.trim())) {
      if (anneeRapport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    const rep = await fetch(`/api/etudiants/rapport?section=${encodeURIComponent(section)}&annee=${anneeRapport.trim()}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setRapport(j);
    else alert(j.error || 'Erreur');
  }

  // La pièce se construit côté serveur : lui seul porte GSM et adresses, la
  // liste de l'écran n'en sait rien — et le périmètre s'y applique.
  async function imprimerCoordonnees() {
    if (!selEtudiants.size) return;
    const rep = await fetch('/api/etudiants/coordonnees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ids: [...selEtudiants] }),
    });
    const j = await rep.json();
    if (rep.ok) setCoordonnees(j);
    else alert(j.error || 'Erreur');
  }

  async function importerResultats(fichier) {
    if (!fichier || !annee) return;
    const [a1, a2] = annee.split('-').map(Number);
    const anneeImport = window.prompt(
      'Année scolaire des résultats de ce classeur ?', (a1-1) + '-' + (a2-1));
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    setImporting(true); setMsgImport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });

      const resultats = [];
      let ongletsLus = 0;
      for (const nom of wb.SheetNames) {
        if (!/^\d+$/.test(nom.trim())) continue;   // seuls les onglets numériques = ue_num
        const ueNum = Number(nom.trim());
        const M = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null });
        if (M.length < 13) continue;

        // Ligne 8 (index 7) : libellés Note.s1 / Décision.s1 / Note.s2 / Décision.s2
        const l8 = M[7] || [];
        const iNs1 = l8.findIndex(v => v === 'Note.s1');
        const iDs1 = l8.findIndex(v => v === 'Décision.s1');
        const iNs2 = l8.findIndex(v => v === 'Note.s2');
        const iDs2 = l8.findIndex(v => v === 'Décision.s2');
        // Ligne 12 (index 11) : Matricule
        const l12 = M[11] || [];
        const iMat = l12.findIndex(v => v === 'Matricule');
        if (iMat < 0 || (iDs2 < 0 && iDs1 < 0)) continue;
        ongletsLus++;

        for (let li = 12; li < M.length; li++) {
          const row = M[li] || [];
          const mat = row[iMat];
          if (!mat) continue;
          const ds2 = iDs2 >= 0 ? row[iDs2] : null;
          const ds1 = iDs1 >= 0 ? row[iDs1] : null;
          const dec = (ds2 || ds1 || '').toString().trim().toUpperCase();
          let noteBrute = iNs2 >= 0 && row[iNs2] != null && !isNaN(Number(row[iNs2]))
            ? Number(row[iNs2])
            : (iNs1 >= 0 && row[iNs1] != null && !isNaN(Number(row[iNs1])) ? Number(row[iNs1]) : null);
          // Les notes du classeur sont sur 20 — l'échelle retenue dans Lucie.
          // Une valeur au-delà de 20 est un pourcentage : on la ramène sur 20.
          const points = noteBrute == null ? null
            : Math.round((noteBrute <= 20 ? noteBrute : noteBrute / 5) * 10) / 10;
          const resultat = dec === 'C' ? 'reussi'
            : dec === 'AJ' ? 'ajourne'
            : dec === 'R' ? 'refuse' : null;
          resultats.push({ id_ecampus: String(mat).trim(), ue_num: ueNum, resultat, points });
        }
      }

      if (!resultats.length) throw new Error('Aucun résultat lisible — vérifiez que le classeur contient des onglets par UE (65, 66…)');

      const rep = await fetch('/api/etudiants/import-resultats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee: anneeImport.trim(), resultats }),
      });
      const j = await rep.json();
      if (rep.ok) {
        setMsgImport({ type: 'ok', texte: `${ongletsLus} UE lues · ${j.maj} résultats importés pour ${anneeImport.trim()}` +
          (j.inconnus?.length ? ` · matricules inconnus : ${j.inconnus.join(', ')}` : '') });
        await charger();
      } else setMsgImport({ type: 'err', texte: j.error || 'Erreur' });
    } catch(e) { setMsgImport({ type: 'err', texte: e.message }); }
    finally { setImporting(false); }
  }

  async function importerExcel(fichier) {
    if (!fichier || !annee) return;
    // Détecter l'année depuis le nom du fichier (ex. "20252026" → 2025-2026),
    // sinon proposer l'année précédant l'année active (le listing est celui de l'année écoulée)
    const m = fichier.name.match(/(20\d{2})[-_]?(20\d{2})/);
    let anneeDetectee;
    if (m) anneeDetectee = m[1] + '-' + m[2];
    else {
      const [a1, a2] = annee.split('-').map(Number);
      anneeDetectee = (a1-1) + '-' + (a2-1);
    }
    const anneeImport = window.prompt(
      'Année scolaire des inscriptions de ce fichier ?', anneeDetectee);
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    setImporting(true); setMsgImport(null);
    try {
      // Lecture côté client avec SheetJS — gère .xls et .xlsx
      const XLSX = await import('xlsx');
      const buffer = await fichier.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // 3e onglet ou celui qui contient 'Inscription'
      const wsName = wb.SheetNames[2] ||
                     wb.SheetNames.find(n => n.includes('Inscription')) ||
                     wb.SheetNames[0];
      if (!wsName) throw new Error('Onglet introuvable dans le fichier');
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) throw new Error('Le fichier semble vide');
      if (!('Id_Etud' in rows[0]) || !('Code_UE' in rows[0])) {
        throw new Error('Colonnes Id_Etud ou Code_UE introuvables — vérifiez que c\'est le bon fichier eCampus');
      }

      // Dédupliquer les étudiants
      const etudiants = [];
      const vus = new Set();
      for (const r of rows) {
        if (vus.has(r.Id_Etud)) continue;
        vus.add(r.Id_Etud);
        etudiants.push({
          id_ecampus: String(r.Id_Etud||'').trim(),
          nom: String(r.NomEtud||'').trim(),
          prenom: String(r['PréEtud']||'').trim(),
          email_ecole: String(r.EmailEcole||'').trim(),
          email_perso: String(r['Email Perso']||'').trim(),
          date_naissance: String(r.StrDatNais||'').trim(),
          num_national: String(r['N°National']||'').trim(),
          gsm: String(r.GSMEtud||'').trim(),
          adresse: String(r['AdrN°Bte']||'').trim(),
          localite: String(r['Localité']||'').trim(),
          cp: String(r.CP||'').trim(),
          titre: String(r.TitreMrMme||'').trim(),
        });
      }

      const inscriptions = rows
        .filter(r => r.Id_Etud && r.Code_UE && !isNaN(Number(r.Code_UE)))
        .map(r => ({ id_ecampus: String(r.Id_Etud).trim(), ue_num: Number(r.Code_UE), groupe: String(r.COG||'').trim() }));

      // Envoyer au backend
      const rep = await fetch('/api/etudiants/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee: anneeImport.trim(), etudiants, inscriptions }),
      });
      const j = await rep.json();
      if (rep.ok) {
        setMsgImport({ type: 'ok', texte: `${j.etudiants} étudiants · ${j.inscriptions_creees} inscriptions importées pour ${j.annee}` });
        await charger();
      } else {
        setMsgImport({ type: 'err', texte: j.error || 'Erreur' });
      }
    } catch(e) { setMsgImport({ type: 'err', texte: e.message }); }
    finally { setImporting(false); }
  }

  async function charger() {
    if (!annee) return;
    setChargement(true);
    try {
      const params = new URLSearchParams();
      /* LA SECTION NE PART PLUS AU SERVEUR. Il filtrait sur la section des
         UNITÉS : choisir « Optique » ramenait les étudiants de TIM inscrits à
         une UE commune rangée sous Optique — et l'écran les affichait sous
         TIM. Le filtre porte désormais sur la section de l'ÉTUDIANT, comme la
         colonne et les volets ; le périmètre, lui, reste posé par le serveur. */
      if (anneeCohorte) params.set('annee', anneeCohorte);
      if (statut) params.set('statut', statut);
      if (ueCohorte) params.set('ue_num', ueCohorte);
      if (recherche) params.set('q', recherche);
      const rep = await fetch(`/api/etudiants?${params}`, { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) {
        setEtudiants(Array.isArray(j) ? j : []);
        setErreurListe(null);
      } else {
        // Une liste vide et un refus se ressemblaient à l'écran : l'erreur
        // était avalée, et l'on cherchait un problème de données là où le
        // serveur échouait.
        setEtudiants([]);
        setErreurListe(j?.error
          || `Le serveur a répondu ${rep.status}. La liste n'a pas pu être chargée.`);
      }
    } catch (e) {
      setEtudiants([]);
      setErreurListe(e.message);
    } finally { setChargement(false); }
  }

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  useEffect(() => { charger(); /* eslint-disable-next-line */ },
    [annee, section, anneeCohorte, ueCohorte, statut]);
  const [frises, setFrises] = useState(null);
  useEffect(() => {
    if (!annee) return;
    let vivant = true;
    fetch(`/api/etudiants/frises?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (vivant) setFrises(j); }).catch(() => {});
    return () => { vivant = false; };
  }, [annee]);

  // Les UE proposées suivent la section et l'année choisies : proposer les
  // quatre-vingts unités de l'établissement ne servirait personne.
  useEffect(() => {
    if (!section) { setUesCohorte([]); return; }
    const p = new URLSearchParams({ section });
    p.set('annee', anneeCohorte || annee || '');
    fetch(`/api/ref/ue?${p}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setUesCohorte(Array.isArray(l) ? l : []))
      .catch(() => setUesCohorte([]));
  }, [section, anneeCohorte, annee]);

  useEffect(() => {
    // /api/ref/annees n'a jamais existé : l'appel échouait en silence et la
    // liste des années restait vide. Les années sont servies par /api/annees.
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setAnneesCohorte(
        (Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean)))
      .catch(() => setAnneesCohorte([]));
  }, []);

  // Le dossier ouvert a disparu de la cohorte : on prend le premier plutôt que
  // de laisser une fenêtre sur un étudiant qui n'y est plus.
  useEffect(() => {
    if (!selId || !etudiants.length) return;
    if (!etudiants.some(x => x.id === selId)) setSelId(etudiants[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etudiants]);

  const filtres = useMemo(() => {
    const q = recherche.toLowerCase();
    let base = (recherche
      ? etudiants.filter(e =>
          e.nom?.toLowerCase().includes(q) || e.prenom?.toLowerCase().includes(q) ||
          e.id_ecampus?.toLowerCase().includes(q))
      : [...etudiants])
      .filter(e => !section || (section === '__aucune__'
        ? !e.section_rattachement : e.section_rattachement === section))
      .filter(e => !fNiveau || (fNiveau === 'aucun' ? !e.niveau : e.niveau === fNiveau))
      .filter(e => !fUE || (fUE === 'sans' ? !Number(e.nb_ue) : Number(e.nb_ue) > 0))
      .filter(e => !fRatt || (fRatt === 'aucune' ? !e.section_rattachement
        : fRatt === 'deduite' ? (e.section_rattachement && e.section_deduite)
          : (e.section_rattachement && !e.section_deduite)))
      .filter(e => !fPrimo || e.primo);
    if (fDoublons) {
      const cleDe = e => `${e.nom || ''}|${e.prenom || ''}`.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9|]/g, '');
      const freq = new Map();
      for (const e of etudiants) {
        const k = cleDe(e);
        if (k.length > 3) freq.set(k, (freq.get(k) || 0) + 1);
      }
      base = base.filter(e => (freq.get(cleDe(e)) || 0) >= 2);
    }

    // Tri par colonne. Les valeurs absentes se rangent toujours en fin de
    // liste, quel que soit le sens : elles n'apprennent rien.
    const cle = {
      nom:     e => `${e.nom || ''} ${e.prenom || ''}`.trim().toLowerCase(),
      email:   e => (e.email_ecole || '').toLowerCase(),
      section: e => (e.section_rattachement || '').toLowerCase(),
      niveau:  e => ({ BA1: 1, BA2: 2, BA3: 3, MIXTE: 4 }[e.niveau] ?? 9),
      nb_ue:   e => Number(e.nb_ue || 0),
    }[tri.champ] || (e => e.nom || '');

    return base.sort((a, b) => {
      const va = cle(a), vb = cle(b);
      const va_vide = va === '' || va == null, vb_vide = vb === '' || vb == null;
      if (va_vide !== vb_vide) return va_vide ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * tri.sens;
      return String(va).localeCompare(String(vb), 'fr') * tri.sens;
    });
  }, [etudiants, recherche, tri, section, fNiveau, fUE, fRatt, fPrimo, fDoublons]);

  // Volets par section, comme dans la répartition des périodes : la liste se
  // parcourt section par section, et un étudiant inscrit dans plusieurs
  // sections apparaît sous chacune.
  const [sectionsDeployees, setSectionsDeployees] = useState({});
  /* PENDANT UNE RECHERCHE, LES VOLETS S'OUVRENT.
     Fermés par défaut, ils cachaient ce qu'on venait de trouver : « loho »
     comptait trois étudiants en 2025-2026 et n'en montrait aucun, tandis qu'en
     2024-2025 le volet Psychomotricité, déplié plus tôt, laissait voir
     M. Lohohola Kalambay — on a cru à un étudiant absent d'une année. Une
     recherche qui trouve puis cache n'est pas une recherche. Le repli fait à
     la main pendant la recherche est respecté, et oublié à la suivante ; sans
     recherche, les volets restent fermés, comme avant. */
  const [repliesRecherche, setRepliesRecherche] = useState({});
  useEffect(() => { setRepliesRecherche({}); }, [recherche]);
  /* UN ÉTUDIANT, UNE SECTION : LA SIENNE — et non celles de ses UE.
     La colonne et les volets lisaient la liste des sections de TOUTES ses
     unités : un étudiant de TIM inscrit à l'UE hors cursus (rangée sous
     Restart) et à une UE commune rangée sous Optique s'affichait
     « RESTART, Optique, TIM » et paraissait dans trois volets. Charles l'a
     lu, le 21 septembre, comme « Optique mis chez tout le monde » — la base
     n'avait rien : aucun étudiant rattaché à Optique. C'est la leçon de
     l'UE 95 (2.11.1), repayée à l'écran : la section d'une UE n'est pas un
     rattachement. Le serveur calculait déjà la bonne réponse
     (`section_rattachement` : posée, sinon déduite sans les unités hors
     cursus) ; l'écran ne s'en servait pas. */
  const parSection = useMemo(() => {
    const par = new Map();
    for (const e of filtres) {
      const s = e.section_rattachement || '(sans section)';
      if (!par.has(s)) par.set(s, []);
      par.get(s).push(e);
    }
    return [...par.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtres]);

  // Le rail marine des autres pages de Lucie, plutôt que des boutons alignés
  // ou des menus déroulants : replié en 64 px, déployé au survol.
  // Sélection GÉNÉRALE des étudiants, non liée à l'impression : le rail pourra
  // en faire d'autres usages. Elle SURVIT aux changements de filtre et de
  // section — sans quoi on la perdrait au premier changement et l'outil
  // deviendrait agaçant.
  const [selEtudiants, setSelEtudiants] = useState(new Set());

  const basculerSelection = useCallback(id => setSelEtudiants(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }), []);

  /* SUPPRIMER LES ÉTUDIANTS COCHÉS. Le serveur répond en deux temps : si un
     dossier porte des données, il rend L'INVENTAIRE (inscriptions, notes,
     décisions…) et l'on confirme en sachant quoi — la direction seule peut
     forcer. Une fiche vide (doublon, erreur de saisie) part sans détour. */
  /* FUSIONNER DEUX FICHES COCHÉES — le moteur est celui de la fusion des
     doublons (tout se déplace, décisions de délibération comprises ; les
     anciens matricules restent cherchables). On propose de conserver la fiche
     au matricule le plus récent ; Annuler inverse le sens. */
  async function fusionnerSelection() {
    const ids = [...selEtudiants];
    if (ids.length !== 2) { alert('Cochez exactement deux fiches à fusionner.'); return; }
    const fiches = ids.map(id => filtres.find(e => e.id === id)
      || etudiants.find(e => e.id === id)).filter(Boolean);
    if (fiches.length !== 2) return;
    const lib = e => `${(e.nom || '').toUpperCase()} ${e.prenom || ''} (${e.id_ecampus || 'sans matricule'})`;
    // Le plus récent d'abord : matricule décroissant, à défaut l'id le plus haut.
    fiches.sort((a, b) => String(b.id_ecampus || '').localeCompare(String(a.id_ecampus || ''))
      || b.id - a.id);
    let [garder, absorber] = fiches;
    if (!window.confirm(`Fusionner ces deux fiches ?\n\n→ CONSERVER : ${lib(garder)}\n→ Y VERSER puis supprimer : ${lib(absorber)}\n\nTout est déplacé : inscriptions, notes, décisions, valorisations, suivi. Les anciens matricules restent cherchables.\n\nAnnuler = inverser le sens.`)) {
      [garder, absorber] = [absorber, garder];
      if (!window.confirm(`Sens inversé.\n\n→ CONSERVER : ${lib(garder)}\n→ Y VERSER puis supprimer : ${lib(absorber)}\n\nConfirmer la fusion ?`)) return;
    }
    const rep = await fetch('/api/doublons-etudiants/fusionner', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ garder: garder.id, absorber: absorber.id }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || `Fusion refusée (${rep.status})`); return; }
    alert(`Fusion faite : ${lib(garder)} porte désormais tout le parcours.`);
    setSelEtudiants(new Set());
    await charger();
  }

  /* LE STATUT D'UN LOT — diplômé, sorti, archivé, ou réintégré (null).
     Rien n'est effacé : le dossier reste entier, seule la liste de travail
     change. Le serveur juge chaque étudiant contre le périmètre de qui agit. */
  async function statuerSelection(statutCible) {
    const ids = [...selEtudiants];
    if (!ids.length) return;
    const LIB = { diplome: 'marquer diplômé(s)', sorti: 'sortir du cursus',
                  archive: 'archiver', null: 'réintégrer dans les étudiants en cours' };
    let motif = null;
    if (statutCible === 'sorti') {
      motif = window.prompt(`Sortir ${ids.length} étudiant(s) du cursus.\n\nMotif (facultatif) : abandon, réorientation…`, '');
      if (motif === null) return;
    } else if (!window.confirm(`${ids.length} étudiant(s) : ${LIB[statutCible]} ?\n\nRien n'est effacé — le geste est réversible.`)) return;
    const rep = await fetch('/api/etudiants/statut', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ids, statut: statutCible, motif }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || `Refusé (${rep.status})`); return; }
    if (j.refuses?.length) alert(`${j.faits} traité(s). ${j.refuses.length} hors de votre périmètre, laissé(s) tels quels.`);
    setSelEtudiants(new Set());
    await charger();
  }

  async function supprimerSelection() {
    const ids = [...selEtudiants];
    if (!ids.length) return;
    if (!window.confirm(`Supprimer ${ids.length} étudiant(s) ?\n\nLes fiches vides seront supprimées directement ; pour celles qui portent des données, un récapitulatif sera demandé une par une.`)) return;
    let faits = 0, refus = [];
    for (const id of ids) {
      let rep = await fetch(`/api/etudiants/${id}`, { method: 'DELETE', headers: authHeaders() });
      let j = await rep.json().catch(() => ({}));
      if (rep.status === 409 && j.confirmation_requise) {
        const inv = j.inventaire || {};
        const detail = Object.entries(inv).filter(([, n]) => n > 0)
          .map(([k, n]) => `  · ${n} ${k}`).join('\n');
        if (!j.force_permis) { refus.push(`${j.etudiant} — dossier non vide (direction requise)`); continue; }
        if (!window.confirm(`${j.etudiant} porte des données qui seraient DÉFINITIVEMENT supprimées :\n${detail}\n\nSupprimer quand même ?`)) continue;
        rep = await fetch(`/api/etudiants/${id}?force=1`, { method: 'DELETE', headers: authHeaders() });
        j = await rep.json().catch(() => ({}));
      }
      if (rep.ok) faits++;
      else refus.push(j.error || `étudiant ${id} : erreur ${rep.status}`);
    }
    if (refus.length) alert(`${faits} supprimé(s).\nNon supprimé(s) :\n- ` + refus.join('\n- '));
    setSelEtudiants(new Set());
    await charger();
  }

  // « Tout cocher » ne porte que sur ce qui est AFFICHÉ : après un filtre, il
  // doit cocher le résultat du filtre, non la base entière.
  // Mémoïsé : cette boucle tournait à chaque rendu, donc à chaque case cochée.
  const tousAffichesCoches = useMemo(
    () => filtres.length > 0 && filtres.every(e => selEtudiants.has(e.id)),
    [filtres, selEtudiants]);
  const cocherAffiches = valeur => setSelEtudiants(s => {
    const n = new Set(s);
    for (const e of filtres) valeur ? n.add(e.id) : n.delete(e.id);
    return n;
  });

  // LES ÉDITIONS DE CET ÉCRAN, DÉCLARÉES POUR LE CENTRE.
  // « Rapport de la liste » et « Rapport PAE » sont deux pièces d'un
  // catalogue, pas deux entrées de menu : elles se présentent en tête du
  // centre d'impression, avec tout le reste de ce qui sort d'ici.
  const EDITIONS = [
    { cle: 'rapport', label: 'Rapport de la liste', icon: IconFileText,
      description: 'Une section, une année antérieure', onClick: ouvrirRapport },
    { cle: 'rapport-pae', label: 'Rapport PAE', icon: IconTable,
      description: "Unités inscrites, par étudiant", onClick: () => setRapportPAE(true) },
  ];

  useEchangesDuRail(useCallback(() => setEchanges(true), []));

  // QUI PEUT SUPPRIMER. La route exige déjà « admin » ou « editeur » côté
  // serveur — un bouton caché n'est pas une protection —, mais proposer à
  // l'écran ce qui sera refusé par le serveur n'aide personne.
  const peutSupprimer = (() => {
    try {
      const j = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1] || ''));
      return ['admin', 'editeur', 'directeur', 'directeur_adjoint'].includes(j?.role);
    } catch { return false; }
  })();

  const RAIL = [
    // LE CENTRE D'IMPRESSION EST DÉJÀ LA BULLE DU HAUT, et il porte désormais
    // les deux rapports : trois icônes pour une seule porte, c'en était deux
    // de trop.
    // LE PASSAGE D'ANNÉE PORTE SUR UNE SECTION ENTIÈRE, non sur une sélection :
    // sa place n'est pas dans la barre qui n'apparaît qu'une fois des étudiants
    // cochés. C'est le geste de fin de septembre, et il se trouve sans qu'on
    // ait rien à préparer.
    // LA FIN DE CYCLE. Composer l'année suivante et délivrer les titres sont
    // les deux gestes de la même semaine : ils vont ensemble.
    // SUPPRIMER A SA PROPRE PORTE, ET ELLE SE NOMME.
    //
    // La fenêtre existait — vider une UE, une session, une sélection — mais
    // elle était rangée sous « Importer / exporter » : personne n'ouvre un
    // menu d'imports pour supprimer, et personne ne l'avait trouvée. Une
    // opération irréversible ne se cache pas dans un tiroir : elle se nomme.
    //
    // Elle ne supprime toujours rien sans avoir montré ce qu'elle va toucher
    // — le compte des résultats, des notes, des reports, des inscriptions —
    // puis sans une confirmation. C'est la seule entrée du rail dont l'icône
    // porte une couleur, et c'est une brique : ici, la couleur est un
    // avertissement, pas une décoration.
    ...(peutSupprimer ? [{ label: 'Supprimer', items: [
      { key: 'purge', label: 'Vider des résultats ou des inscriptions',
        icon: IconTrash, couleur: '#9d4a38', destructif: true,
        onClick: () => setPurge(true) },
    ] }] : []),
    // INSCRIRE QUELQU'UN. La route serveur existait depuis l'origine, sans
    // aucun écran pour l'appeler : tout entrait par l'import eCampus, et
    // l'inscription tardive n'avait nulle part où aller. C'est la première
    // entrée du rail parce que c'est le premier geste de l'année.
    { label: 'Inscrire', items: [
      { key: 'nouvel-etudiant', label: 'Créer un étudiant',
        icon: IconUserPlus, onClick: () => setNouvel(true) },
    ] },
    // LE REGISTRE DES VALORISATIONS A QUITTÉ CE RAIL. Il y figurait en même
    // temps que l'onglet « Valorisation des acquis » de l'axe : deux portes
    // pour la même matière, à trois centimètres l'une de l'autre, et « VA »
    // écrit deux fois dans le même menu. L'onglet fait tout ce que faisait le
    // registre, et il encode en plus.
    { label: 'Fin de cycle', items: [
      { key: 'passage', label: 'Composer les PAE',
        /* PAS DEUX FOIS LE MÊME DESSIN DANS UN RAIL. « Passage de classe »
           portait l'icône de l'axe Étudiants : replié, on visait l'un pour
           l'autre. Un escalier dit ce que fait l'action — on monte d'un an. */
        /* LE MÊME ESCALIER, UN OUTIL PLUS LARGE (21 septembre 2026) : la
           grille de composition, dont le passage d'année n'est plus qu'un
           des gestes. On garde l'icône — c'est celle que Charles cherche. */
        icon: IconStairsUp, onClick: () => setComposer('composer') },
      // « Valider les PAE » n'a plus d'entrée à lui (Charles, 26 septembre
      // 2026 : « il est dans la fenêtre PAE ») : Valider est un des modes de
      // la fenêtre Composer les PAE.
      { key: 'diplomation', label: 'Diplômes et titres', icon: IconAward,
        onClick: () => setDiplomation(true) },
    ] },
    // TOUT CE QUI ENTRE ET TOUT CE QUI SORT, DERRIÈRE UNE PORTE.
    // Le rail alignait huit imports dont quatre parlaient de « classeur » sans
    // dire lequel : on ouvrait au jugé. Le centre les nomme et annonce le
    // fichier attendu — la seule chose qui permette de choisir sans essayer.
    // « Importer / exporter » ne se déclare plus ici : l'axe le pose sous le
    // filet, à la même place que sur Personnel et Organisation. L'écran dit
    // seulement COMMENT l'ouvrir.
  ];

  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={IconChecklist} titre="Étudiants"
        sousTitre={`${filtres.length} étudiant(s)`} sections={RAIL}
        impression="etudiants" pieces={EDITIONS} />
    <div className="gouttiere-rail p-5 space-y-4 max-w-none">
      {/* Le titre et le compte vivaient ICI, alors que le rail les porte déjà
          et que l'onglet le dit une troisième fois. Trois fois « Étudiants »
          sur un même écran, et autant de hauteur perdue avant la première
          ligne du tableau. */}

      {msgImport && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${msgImport.type==='ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{msgImport.texte}</span>
          <button onClick={() => setMsgImport(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}
      {/* UN TITRE, ET LE MÊME QUE PARTOUT. Il avait été retiré parce que le
          rail le portait déjà ; mais Personnel gardait le sien, et huit autres
          écrans chacun le leur. Uniforme veut dire partout ou nulle part — et
          nulle part laisse l'écran sans point d'entrée pour le regard. */}
      <h1 className="titre-ecran">
        Étudiants <span className="compte">· {filtres.length}</span>
      </h1>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Nom, prénom ou identifiant…"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={section} onChange={e => setSection(e.target.value)}
          title="La section de l'étudiant — posée, ou déduite de ses UE"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle}</option>)}
          <option value="__aucune__">Sans section</option>
        </select>
        <select value={fNiveau} onChange={e => setFNiveau(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Tous les niveaux</option>
          <option value="BA1">BA1</option>
          <option value="BA2">BA2</option>
          <option value="BA3">BA3</option>
          <option value="MIXTE">Parcours mixte</option>
          <option value="aucun">Sans niveau</option>
        </select>
        <select value={fUE} onChange={e => setFUE(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Avec ou sans UE</option>
          <option value="sans">Sans aucune UE</option>
          <option value="avec">Avec des UE</option>
        </select>
        <select value={fRatt} onChange={e => setFRatt(e.target.value)}
          title="Posée dans le dossier, ou déduite par Lucie de ses UE"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Section posée ou déduite</option>
          <option value="posee">Section posée</option>
          <option value="deduite">Section déduite seulement</option>
          <option value="aucune">Aucune section</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 self-center"
          title="Aucune inscription ni valorisation avant l'année de travail">
          <input type="checkbox" checked={fPrimo} onChange={e => setFPrimo(e.target.checked)} />
          Primo-arrivés
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 self-center"
          title="Ne montrer que les étudiants dont le nom et le prénom existent sur plusieurs fiches">
          <input type="checkbox" checked={fDoublons} onChange={e => setFDoublons(e.target.checked)} />
          Doublons
        </label>
        {(section || fNiveau || fUE || fRatt || fPrimo || fDoublons) && (
          <button className="text-[12px] text-iip-blue underline self-center"
            onClick={() => { setSection(''); setFNiveau(''); setFUE(''); setFRatt(''); setFPrimo(false); setFDoublons(false); }}>
            Tout effacer
          </button>
        )}
        <div className="segments">
          {[
            { k: 'en_cours', l: 'En cours',
              t: 'Les étudiants dont le parcours n’est pas achevé' },
            { k: 'diplomes', l: 'Diplômés',
              t: 'Épreuve intégrée réussie, ou diplôme déclaré à la main' },
            { k: 'sortis', l: 'Sortis',
              t: 'Ont quitté le cursus : abandon, réorientation, exclusion' },
            { k: 'archives', l: 'Archivés',
              t: 'Rangés à la cave : hors des listes de travail, rien n’est effacé' },
            { k: 'tous', l: 'Tous', t: 'Tout le monde, quel que soit son statut' },
          ].map(x => (
            <button key={x.k} onClick={() => setStatut(x.k)} title={x.t}
              className={`px-3 py-2 text-[13px] ${statut === x.k
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
              {x.l}
            </button>
          ))}
        </div>
      </div>

      {erreurListe && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-[13px]
                        text-red-800 mb-3">
          <b>La liste n'a pas pu être chargée.</b> {erreurListe}
        </div>
      )}

      {/* La sélection doit se voir : sinon on l'oublie, et on s'étonne
          d'imprimer douze pièces au lieu de toute la liste. */}
      {selEtudiants.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 flex-wrap
                        px-4 py-2 rounded-xl bg-iip-turquoise/10 border border-iip-turquoise/30">
          {/* LE COMPTEUR DIT CE QU'ON VOIT, ET CE QU'ON NE VOIT PAS. La sélection
              survit aux filtres — c'est voulu —, mais « 204 sélectionnés » au
              milieu d'une liste filtrée à trente a été lu, à juste titre, comme
              un nombre faux (Charles, 21 septembre). On dit combien sont
              affichés parmi eux, et l'on permet de vider ou de ramener la
              sélection à ce qui est à l'écran : c'est sur la sélection entière
              qu'agissent Imprimer et Composer. */}
          <span className="text-[13px] font-semibold text-iip-blue flex flex-wrap items-center gap-x-2">
            {selEtudiants.size} étudiant(s) sélectionné(s)
            {(() => {
              const visibles = filtres.filter(e => selEtudiants.has(e.id)).length;
              if (visibles === selEtudiants.size) return null;
              return (
                <span className="font-normal text-[12px] text-[#B45309]">
                  dont {visibles} affiché(s) — {selEtudiants.size - visibles} caché(s) par les filtres
                  <button className="underline ml-2 text-iip-blue"
                    onClick={() => setSelEtudiants(new Set(filtres.filter(e => selEtudiants.has(e.id)).map(e => e.id)))}>
                    Ne garder que les affichés
                  </button>
                </span>
              );
            })()}
            <button className="underline font-normal text-[12px] text-slate-500"
              onClick={() => setSelEtudiants(new Set())}>Tout désélectionner</button>
          </span>
          <div className="flex gap-2">
            <button onClick={() => setCentreImpression(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white
                         font-semibold rounded-lg">
              <IconPrinter size={14} /> Imprimer
            </button>
            <button onClick={imprimerCoordonnees}
              title="La liste imprimable des emails, GSM et adresses des étudiants cochés"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                         text-iip-blue font-semibold rounded-lg">
              <IconAddressBook size={14} /> Coordonnées
            </button>
            <button onClick={() => setComposer('selection')}
              title="Ouvrir la composition des PAE avec les étudiants retenus déjà cochés"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                         text-iip-blue font-semibold rounded-lg">
              <IconChecklist size={14} /> Composer les PAE
            </button>
            {['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination']
              .includes(getUser()?.role) && (
              <MenuActions libelle="Statut" Icone={IconArchive} titre="Changer le statut des étudiants cochés"
                items={[
                  { libelle: 'Marquer diplômé', Icone: IconSchool,
                    aide: 'Quand l’épreuve intégrée n’est pas encodée dans Lucie',
                    onClick: () => statuerSelection('diplome') },
                  { libelle: 'Sortir du cursus', Icone: IconDoorExit,
                    aide: 'Abandon, réorientation, exclusion — avec un motif',
                    onClick: () => statuerSelection('sorti') },
                  { libelle: 'Archiver', Icone: IconArchive,
                    aide: 'À la cave : hors des listes de travail, rien n’est effacé',
                    onClick: () => statuerSelection('archive') },
                  { separateur: true },
                  { libelle: 'Réintégrer (en cours)', Icone: IconArrowBackUp,
                    aide: 'Annule le statut posé — l’étudiant revient dans « En cours »',
                    onClick: () => statuerSelection(null) },
                ]} />
            )}
            {selEtudiants.size === 2
              && ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role) && (
              <button onClick={fusionnerSelection}
                title="Réunir deux fiches du même étudiant : tout le parcours passe sur la fiche conservée, l'autre disparaît"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                           text-iip-blue font-semibold rounded-lg">
                <IconUserPlus size={14} /> Fusionner
              </button>
            )}
            {['admin', 'directeur', 'directeur_adjoint', 'secretariat'].includes(getUser()?.role) && (
              <button onClick={supprimerSelection}
                title="Supprimer les étudiants cochés — les dossiers non vides demandent confirmation, avec l'inventaire de ce qui serait emporté"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300
                           text-red-700 font-semibold rounded-lg hover:bg-red-50">
                <IconTrash size={14} /> Supprimer
              </button>
            )}
            <button onClick={() => setSelEtudiants(new Set())}
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-lg">
              Vider
            </button>
          </div>
        </div>
      )}

      {!filtres.length ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
          {chargement ? 'Chargement…' : 'Aucun étudiant — importez les données depuis eCampus.'}
        </div>
      ) : (
        /* LE BLANC EST RÉSERVÉ AUX CHAMPS : la liste prend le ton de la page,
           et le filet sépare. */
        <div className="carte overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="tab-entete">
                <th className="px-3 py-2.5 w-10">
                  <input type="checkbox" checked={tousAffichesCoches}
                    onChange={() => cocherAffiches(!tousAffichesCoches)}
                    title="Cocher les étudiants affichés"
                    onClick={e => e.stopPropagation()} />
                </th>
                <ThTri champ="nom"     tri={tri} onTri={trierPar} className="text-left">Étudiant</ThTri>
                <th className="px-2 py-2.5 text-left w-12 text-[11px] font-semibold" title="Programme validé">PAE</th>
                <ThTri champ="niveau"  tri={tri} onTri={trierPar} className="text-left w-28">Niveau</ThTri>
                <ThTri champ="section" tri={tri} onTri={trierPar} className="text-left w-24">Section</ThTri>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold">Parcours <span className="font-normal text-slate-400">— dans l'ordre du cursus</span></th>
                <th className="px-2 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {parSection.map(([sec, liste]) => {
                // FERMÉS PAR DÉFAUT. Toutes les sections dépliées, c'était
                // huit cents lignes avant d'atteindre celle qu'on cherchait.
                // Replié, l'écran tient sur une vue : on ouvre la section
                // voulue, et on y est.
                const enRecherche = !!recherche.trim();
                /* UNE SEULE SECTION : TOUJOURS OUVERTE — et c'est un défaut
                   qui a coupé une coordination de ses propres étudiants. Le
                   volet n'a pas d'en-tête quand il est seul (il ne sépare
                   rien), donc pas de « + » pour l'ouvrir ; fermé par défaut,
                   il ne s'ouvrait JAMAIS. Loubna Rougui, limitée à
                   Psychomotricité, voyait « Étudiants · 126 » au-dessus d'un
                   tableau vide. Invisible depuis un compte qui voit toutes
                   les sections : il y a alors toujours plusieurs volets. */
                const ouverte = parSection.length === 1 ? true
                  : enRecherche
                    ? repliesRecherche[sec] !== true
                    : sectionsDeployees[sec] === true;
                const basculer = () => (enRecherche
                  ? setRepliesRecherche(d => ({ ...d, [sec]: ouverte }))
                  : setSectionsDeployees(d => ({ ...d, [sec]: !ouverte })));
                return (
                  <Fragment key={sec}>
                    {/* LE REGROUPEMENT EST UN EN-TÊTE, et il en prend le ton :
                        l'un nomme les colonnes, l'autre nomme un paquet de
                        lignes. Un bleuté propre à lui ajoutait une couleur pour
                        ne rien dire de plus. */}
                    {parSection.length > 1 && (
                      <tr className="tab-repere">
                        <td colSpan={7} className="px-4 py-2">
                          <button onClick={basculer}
                            className="flex items-center gap-1.5 text-[13px] font-semibold">
                            <span className="w-3 inline-block opacity-50">{ouverte ? '−' : '+'}</span>
                            {sec}
                            <span className="font-normal text-[11px] text-slate-500">
                              {liste.length} étudiant(s)
                            </span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {ouverte && liste.map(e => (
                <tr key={e.id} onClick={() => setSelId(e.id)}
                  className={`border-b border-slate-100 last:border-0 cursor-pointer
                    ${selEtudiants.has(e.id) ? 'bg-iip-turquoise/5' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-3 py-1" onClick={ev => ev.stopPropagation()}>
                    <input type="checkbox" checked={selEtudiants.has(e.id)}
                      onChange={() => basculerSelection(e.id)} />
                  </td>
                  {/* UNE LIGNE DE 40 PX, COMME LES AUTRES TABLEAUX (Charles, 26
                      septembre 2026) : nom et matricule sur une ligne, sans
                      pastille d'initiales ; l'icône du PAE dans sa colonne ;
                      l'e-mail reste dans la fiche et dans la recherche. */}
                  <td className="px-3 py-1 h-10 whitespace-nowrap">
                    <span className="font-semibold text-iip-blue">{nomPropre(e.nom, '')}</span>
                    <span className="text-slate-700 ml-1">{nomPropre('', e.prenom)}</span>
                    <span className="text-[11px] text-slate-400 ml-1.5 tabular-nums">{e.id_ecampus}</span>
                    {e.primo && <span className="ml-1.5 text-[10px] font-semibold px-1.5 rounded bg-slate-100 text-slate-600"
                      title="Primo-arrivé : aucune trace avant l'année de travail">primo</span>}
                  </td>
                  <td className="px-2 py-1">
                    {e.pae_confirme
                      ? <IconWritingSign size={15} className="text-[#3E7D5E]" title="Programme confirmé — étudiant inscrit" />
                      : <IconWritingSignOff size={15} className="text-slate-300" title="Programme non confirmé" />}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    <BadgeNiveau niveau={e.niveau} libelle={e.niveau_libelle} />
                    {/* Le diplôme se dit là où on lit le niveau : c'est la même
                        question — où en est cette personne. */}
                    {e.sortie_statut === 'archive' && (
                      <span title={`Archivé le ${e.sortie_le || '?'} — hors des listes de travail`}
                        className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide
                                   text-slate-600 bg-slate-100 border border-slate-300
                                   rounded px-1.5 py-px">archivé</span>
                    )}
                    {e.sortie_statut === 'sorti' && (
                      <span title={`Sorti le ${e.sortie_le || '?'}${e.sortie_motif ? ` — ${e.sortie_motif}` : ''}`}
                        className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide
                                   text-amber-800 bg-amber-50 border border-amber-200
                                   rounded px-1.5 py-px">sorti</span>
                    )}
                    {e.diplome && (
                      <span title={e.diplome_declare
                        ? `Diplôme déclaré le ${e.sortie_le || '?'} (épreuve intégrée non encodée)`
                        : `Épreuve intégrée réussie${
                        e.diplome_annee ? ` en ${e.diplome_annee}` : ''}${
                        e.diplome_ue ? ` (UE ${e.diplome_ue})` : ''} — diplôme acquis`}
                        className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide
                                   text-emerald-800 bg-emerald-50 border border-emerald-200
                                   rounded px-1.5 py-px">
                        diplômé{e.diplome_annee ? ` ${e.diplome_annee.slice(-4)}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-[12px] text-slate-500"
                    title={e.sections ? `UE suivies dans : ${e.sections.split(',').join(', ')}` : undefined}>
                    {e.section_rattachement || <span className="text-slate-300">—</span>}
                    {e.section_rattachement && e.section_deduite && (
                      <span className="text-[11px] text-slate-400"> (déduite)</span>
                    )}
                  </td>
                  <td className="px-3 py-1">
                    <FriseParcours ues={frises?.sections?.[frises?.etats?.[e.id]?.s]} codes={frises?.etats?.[e.id]?.c} />
                  </td>
                  <td className="px-2 py-1 text-slate-300"><IconChevronRight size={16} /></td>
                </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nouvel && (
        <NouvelEtudiant onClose={() => setNouvel(false)}
          onCree={id => { setNouvel(false); charger(); setSelId(id); }} />
      )}

      {selId && (
        <FicheEtudiant id={selId} annee={annee} onClose={() => setSelId(null)}
          position={{ i: filtres.findIndex(x => x.id === selId) + 1, n: filtres.length }}
          onPrec={() => {
            const i = filtres.findIndex(x => x.id === selId);
            if (i > 0) setSelId(filtres[i - 1].id);
          }}
          onSuiv={() => {
            const i = filtres.findIndex(x => x.id === selId);
            if (i >= 0 && i < filtres.length - 1) setSelId(filtres[i + 1].id);
          }}
          portee={{ section, annee: anneeCohorte, ue_num: ueCohorte }}
          onPortee={p => {
            // CHANGER DE COHORTE NE DOIT PAS FERMER LE DOSSIER OUVERT. On garde
            // l'étudiant s'il fait encore partie de la nouvelle liste ; la
            // liste se recharge, et l'effet ci-dessous recale au besoin.
            setSection(p.section);
            setAnneeCohorte(p.annee);
            setUeCohorte(p.ue_num);
          }}
          sections={sections} ues={uesCohorte} annees={anneesCohorte}
          onModifie={charger} />
      )}

      {comparaison && <ComparaisonClasseur onClose={() => setComparaison(false)} />}

      {importSuivi && (
        <ImportSuivi annee={annee} onClose={() => setImportSuivi(false)}
          onTermine={charger} />
      )}

      {importSurMesure && (
        <ImportSurMesure onClose={() => setImportSurMesure(false)} onTermine={charger} annee={annee} />
      )}
      {importSignaletique && (
        <ImportSignaletique onClose={() => setImportSignaletique(false)} onTermine={charger} />
      )}
      {rattacherPack && (
        <RattacherPack onClose={() => setRattacherPack(false)} onTermine={charger} />
      )}

      {echanges && (
        <CentreEchanges onClose={() => setEchanges(false)}
          sorties={[
            { cle: 'export-section', titre: 'Export de la section',
              quoi: 'Le tableau des étudiants et de leurs inscriptions, pour Excel.',
              attend: null,
              onClick: () => {
                if (!section) {
                  alert("Choisissez d'abord une section : l'export porte sur elle.");
                  return;
                }
                exporterSection();
              } },
          ]}
          entrees={[
            /* EN TÊTE : c'est l'import d'une rentrée, et il n'avait pas de
               porte — la création était une case cachée de l'importateur sur
               mesure, qui annonce COMPLÉTER. Le nom est celui de Charles. */
            { cle: 'creer-externe', titre: 'Créer des étudiants sur base d’une base de données externe',
              quoi: 'Ouvrir les dossiers d’une nouvelle promotion ; ceux qui existent déjà sont complétés, jamais dédoublés.',
              attend: 'l’export eCampus des étudiants (R_Etudiants_Excel, .xls)',
              onClick: () => setImportSignaletique(true) },
            /* L'ÉTAPE SUIVANTE : une promotion importée sans section se range
               d'après le rapport eCampus « Pack UF ». */
            { cle: 'rattacher-pack', titre: 'Placer les étudiants dans leur section',
              quoi: 'D’après le rapport eCampus « Pack UF » : chaque pack reçoit sa section, seuls les étudiants sans section sont placés.',
              attend: 'le rapport Pack UF (Word, .docx)',
              onClick: () => setRattacherPack(true) },
            { cle: 'liste', titre: 'Liste eCampus',
              quoi: 'Créer ou compléter les dossiers depuis la liste officielle.',
              attend: "l'export eCampus (.xlsx)",
              onClick: () => setImportListe(true) },
            { cle: 'pae', titre: 'Classeur PAE',
              quoi: 'Reprendre les programmes annuels déjà composés ailleurs.',
              attend: 'un classeur PAE (.xlsx)',
              onClick: () => setImportPAE(true) },
            { cle: 'suivi', titre: 'Classeur de suivi',
              quoi: 'Pondérations, notes et décisions des deux sessions d’une année.',
              attend: 'Suivi_etudiants_XXX.xlsm',
              onClick: () => setImportSuivi(true) },
            { cle: 'histo', titre: "Reconstruire l'historique",
              quoi: 'Une année déjà délibérée, reprise depuis un tableau de décisions.',
              attend: 'un tableau plat, une ligne par décision',
              onClick: () => setImportHisto(true) },
            { cle: 'complement', titre: 'Compléter les dossiers',
              quoi: 'Ajouter adresses, dates de naissance et pièces aux dossiers existants.',
              attend: 'un classeur portant les matricules',
              onClick: () => setComplement(true) },
            { cle: 'comparer', titre: 'Comparer un classeur',
              quoi: 'Voir ce qui diffère entre un fichier et la base, sans rien écrire.',
              attend: "n'importe quel classeur d'étudiants",
              onClick: () => setComparaison(true) },
            { cle: 'sur-mesure', titre: 'Importateur sur mesure',
              quoi: 'Un fichier dont la forme n’entre dans aucune des cases ci-dessus.',
              attend: 'un classeur dont vous désignez les colonnes',
              onClick: () => setImportSurMesure(true) },
          ]}
          risques={[
            { cle: 'purge', titre: 'Vider des résultats',
              quoi: 'Effacer les notes et décisions d’une année ou d’une unité.',
              attend: null, onClick: () => setPurge(true) },
          ]} />
      )}

      {diplomation && (
        <CentreDiplomation annee={annee} onClose={() => setDiplomation(false)} />
      )}

      {composer && (
        <ComposerPAE modeInitial={composer === 'valider' ? 'valider' : 'composer'}
          preselection={composer === 'selection' ? [...selEtudiants] : null}
          onClose={() => setComposer(false)} onTermine={charger}
          onPassage={() => { setComposer(false); setPassage(true); }} />
      )}
      {passage && (
        <PassageAnnee annee={annee}
          onClose={() => setPassage(false)} onTermine={charger} />
      )}


      {complement && (
        <div className="fixed inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px] flex items-start justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setComplement(false)}>
          <div className="bg-white rounded-fenetre shadow-dessus w-full max-w-3xl mt-12 p-5
                          max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[15px] font-semibold text-iip-blue">
                Compléter les dossiers
              </span>
              <button onClick={() => setComplement(false)} className="text-slate-400">✕</button>
            </div>
            <ComplementDossiers onTermine={charger} />
          </div>
        </div>
      )}

      {importHisto && (
        <ImportHistorique onClose={() => setImportHisto(false)} onImporte={charger} />
      )}

      {importListe && (
        <ImportListe annee={annee} onClose={() => setImportListe(false)} onImporte={charger} />
      )}

      {rapportPAE && (
        <RapportPAE anneeCourante={annee} onClose={() => setRapportPAE(false)} />
      )}

      {purge && (
        <PurgeResultats anneeCourante={annee} onClose={() => setPurge(false)} onPurge={charger} />
      )}

      {importPAE && (
        <ImportPAE annee={annee} onClose={() => setImportPAE(false)} onImporte={charger} />
      )}

      {rapport && <PreviewModal html={rapport.html} titre="Parcours des étudiants"
        nomFichier={rapport.nom} astuceImpression="Paysage A4 conseillé"
        onClose={() => setRapport(null)} />}

      {coordonnees && <PreviewModal html={coordonnees.html} titre="Coordonnées des étudiants"
        nomFichier={coordonnees.nom} onClose={() => setCoordonnees(null)} />}
    </div>
    </div>
  );

}
