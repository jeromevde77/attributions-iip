import { ICONE_AXE } from '../lib/iconesAxes.js';
import { poserSelectionEtudiants } from '../lib/selectionEtudiants.js';
import { useDroits, passeRole, peutGeste, ecritModule } from '../lib/droits.js';
import OngletCep from '../components/OngletCep.jsx';
import OngletSLE from '../components/OngletSLE.jsx';
import { createContext, Fragment, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// LA MÊME FENÊTRE DE SÉANCE QUE L'ÉCRAN VALORISATION (2 octobre 2026) : une porte de plus, une seule réponse.
const DeliberationVA = lazy(() => import('./Valorisations.jsx').then(m => ({ default: m.DeliberationVA })));
import { nomPropre } from '../lib/nom.js';
import { couleurBloc } from '../lib/blocs.js';
import { RailLateral } from '../components/ui.jsx';
import SuiviEtudiant from '../components/SuiviEtudiant.jsx';
import NouvelEtudiant from '../components/NouvelEtudiant.jsx';
import {
  IconAddressBook, IconListSearch, IconAlertTriangle, IconEyeCheck, IconTablePlus, IconArrowForwardUp, IconArchive, IconDoorExit, IconSchool, IconArrowBackUp, IconAward, IconCertificate, IconStairsUp, IconUserPlus, IconCheck, IconChecklist, IconChevronLeft, IconChevronRight, IconClock, IconFileText, IconFolder, IconPlus, IconPrinter, IconSearch, IconTable, IconTrash, IconUpload, IconUser, IconSend, IconWritingSign, IconWritingSignOff, IconX,
  IconChecks, IconLock, IconGift,
} from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import SchemaCapitalisationVue from '../components/SchemaCapitalisation.jsx';
import ParcoursCompact from '../components/ParcoursCompact.jsx';
import ReportsOffice from '../components/ReportsOffice.jsx';
import Amenagements from '../components/Amenagements.jsx';
import Stages from '../components/Stages.jsx';
import IdentiteEtudiant, { ComplementDossiers } from '../components/IdentiteEtudiant.jsx';
// LE CENTRE CENTRAL. Les boutons restent où on les cherche — là où l'on
// travaille — mais mènent désormais au même endroit.
import CentreImpressionCentral from '../components/CentreImpressionCentral.jsx';
import OutilsAFaces from '../components/OutilsAFaces.jsx';
const DoublonsEtudiants = lazy(() => import('../components/DoublonsEtudiants.jsx'));
const DoublesProgrammes = lazy(() => import('../components/DoublesProgrammes.jsx'));
const HorsBloc = lazy(() => import('../components/HorsBloc.jsx'));
const PaeHorsRegle = lazy(() => import('../components/PaeHorsRegle.jsx'));
const DecisionsSansInscription = lazy(() => import('../components/DecisionsSansInscription.jsx'));
const NationalitesNormaliser = lazy(() => import('../components/NationalitesNormaliser.jsx'));
import { useEchangesDuRail, Fenetre, Encadre, BulleAide, BoutonEditions, OuvrirEditions, IconeFaveur } from '../components/ui.jsx';
import PassageAnnee from '../components/PassageAnnee.jsx';
import ComposerPAE from '../components/ComposerPAE.jsx';
import CentreEchanges from '../components/CentreEchanges.jsx';
import SeanceValorisation from '../components/SeanceValorisation.jsx';
import NotificationVA from '../components/NotificationVA.jsx';
import ChampEtudiant from '../components/ChampEtudiant.jsx';
import ImportSurMesure from '../components/ImportSurMesure.jsx';
import ImportSignaletique from '../components/ImportSignaletique.jsx';
import ImportHELB from '../components/ImportHELB.jsx';
import RattacherPack from '../components/RattacherPack.jsx';
import ImportSuivi from '../components/ImportSuivi.jsx';
import Annexe2 from '../components/Annexe2.jsx';
import Annexe1 from '../components/Annexe1.jsx';
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
import ImportTableauPlat from '../components/ImportTableauPlat.jsx';
import ImportLieuxStage from '../components/ImportLieuxStage.jsx';
import ImportReleveStages from '../components/ImportReleveStages.jsx';
import { demander, informer, saisir } from '../lib/dialogue.jsx';

// Niveau de l'étudiant : BA1/BA2 s'il ne suit qu'une année, « Diplômant »
// s'il ne lui reste que la BA3, « Parcours » s'il en mélange plusieurs.
// Couleurs des années d'études, communes à Lucie (cf. exports Attributions) :
// BA1 orange, BA2 bleu clair, BA3 bleu marine, puis violet et rose au-delà.
const NIV_PALETTE = ['var(--c-attente)', 'var(--c-disponible)', 'var(--c-texte)', 'var(--c-faveur)', 'var(--c-helb)'];

function couleurNiveau(niv) {
  const m = /^BA(\d+)$/i.exec(String(niv || '').trim());
  if (!m) return null;
  return NIV_PALETTE[(Number(m[1]) - 1) % NIV_PALETTE.length];
}

// Pastille d'année d'études, sur fond plein pour rester lisible.
function BadgeUeNiveau({ niveau }) {
  const couleur = couleurNiveau(niveau);
  if (!niveau) return <span className="text-xs text-slate-300">—</span>;
  if (!couleur) {
    return (
      <span className="text-mention font-semibold px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
        {niveau}
      </span>
    );
  }
  return (
    <span className="text-mention font-bold px-1.5 py-0.5 rounded text-white"
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
        <span className={`text-mention leading-none ${actif ? 'text[color:var(--c-principal,_#1B2B4B)]' : 'text-slate-300'}`}>
          {actif ? (tri.sens === 1 ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  );
}

function BadgeNiveau({ niveau, libelle, className = '' }) {
  if (!libelle) return null;
  const cls = niveau === 'MIXTE' ? 'bg-amber-500 text-white border-amber-500'
    : niveau === 'BA3'          ? 'bg-violet-500 text-white border-violet-500'
    : 'bg-sky-500 text-white border-sky-500';
  return (
    <span className={`text-mention font-semibold px-1.5 py-0.5 rounded border ${cls} ${className}`}>
      {libelle}
    </span>
  );
}

/* LA FRISE DU PARCOURS, SUR LA LIGNE DE LA LISTE (Charles, 26 septembre
   2026) : les UE de la section dans l'ordre du cursus, groupées par bloc,
   l'épreuve intégrée au bout. Une lettre par UE (voir /api/etudiants/frises). */
/* UNE DÉROGATION AU PAE SE MOTIVE (porte unique, 28 septembre 2026). Le
   serveur nomme chaque unité refusée et la règle qu'elle enfreint ; un motif,
   donné une fois, vaut pour chacune et se trace sur chacune. */
/* Une date de SQLite (« AAAA-MM-JJ HH:MM:SS », en temps universel), lue à l'heure de Bruxelles. */
const quandLocal = t => {
  if (!t) return '';
  const d = new Date(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(t);
  return `${d.toLocaleDateString('fr-BE')} à ${d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`;
};
async function demanderMotifs(refus) {
  const lignes = refus.map(x => `UE ${x.ue_num} — ${x.regles.map(r0 => r0.libelle + (r0.detail ? ` (${r0.detail})` : '')).join(' ; ')}`);
  const m = await saisir(`Ces unités contreviennent aux règles du PAE :\n\n${lignes.join('\n')}\n\n`
    + 'Motif de la dérogation — il sera tracé sur chacune (Annuler pour ne rien écrire) :');
  if (!m?.trim()) return null;
  return Object.fromEntries(refus.map(x => [x.ue_num, m.trim()]));
}

const SENS_PUCE = { r: 'réussie', f: 'réussie par faveur', i: 'inscrite cette année',
  a: 'ajournée, en attente', o: 'atteignable, non prise', n: 'pas encore atteignable' };
function FriseParcours({ ues, codes, ects = null }) {
  if (!ues?.length || !codes) return null;
  const groupes = [];
  ues.forEach((u, i) => {
    const b = u.ei ? 'EI' : (u.bloc || '—');
    if (!groupes.length || groupes[groupes.length - 1].b !== b) groupes.push({ b, l: [] });
    groupes[groupes.length - 1].l.push({ ...u, c: codes[i] || 'n' });
  });
  return (
    /* UNE GÉLULE PAR BLOC (Charles, 27 septembre 2026), celle de la grille
       des attributions — elle remplace le « sans barres ni cadre » du 26 : le
       liseré porte la couleur du bloc, chaque unité sa teinte d'état ; le nom
       du bloc ne s'écrit pas, la couleur le dit et on gagne la place (Charles,
       27 septembre). L'épreuve intégrée a le liseré or, au bout. */
    <div className="flex items-center gap-1.5">
      {groupes.map((g, gi) => (
        <span key={gi} className="gelule" title={g.b === 'EI' ? 'Épreuve intégrée' : g.b}
          style={{ '--b': g.b === 'EI' ? 'var(--c-epreuve)' : (couleurBloc(g.b) || 'rgb(var(--gris-200))') }}>
          {g.l.map(u => (
            <span key={u.ue_num} data-c={u.c}
              title={`UE ${u.ue_num} — ${u.ue_nom || ''} · ${SENS_PUCE[u.c] || ''}`}>
              {u.ue_num}
            </span>
          ))}
        </span>
      ))}
      {ects != null && (
        <span className="text-xs text-slate-500 whitespace-nowrap tabular-nums ml-1"
          title={ects > 60 ? "Au-delà de 60 ECTS : plus qu'une année à temps plein" : 'Crédits des unités inscrites cette année'}>
          {/* Au-delà de 60, une pastille orange (3 octobre 2026). */}
          {ects > 60
            ? <b className="text-white rounded px-1" style={{ background: 'var(--c-attente, #E8890C)' }}>{ects}</b>
            : <b className="text-iip-texte">{ects}</b>} ECTS
        </span>
      )}
    </div>
  );
}

const STATUTS_PIECE = [
  { val: 'manquant', label: 'Manquant', cls: 'bg-red-500 text-white border-red-500' },
  { val: 'recu',     label: 'Reçu',     cls: 'bg-emerald-500 text-white border-emerald-500' },
  { val: 'na',       label: 'N/A',      cls: 'bg-slate-100 text-slate-500 border-slate-200' },
];

// ── Schéma de capitalisation de l'étudiant (vue partagée avec Organisation) ──
/* `programme` : les UE COCHÉES dans le programme de l'année, sous le schéma
   (Charles, 27 septembre 2026 : « les tuiles ne sont pas bleues quand elles
   sont sélectionnées »). La sélection n'existe qu'à l'écran tant que le PAE
   n'est pas confirmé ; le schéma ne lisait que les inscriptions enregistrées,
   et une UE qu'on venait de cocher restait sans couleur. Il suit désormais la
   sélection en direct — c'est elle qui dit ce que sera le programme. */
/**
 * LA REVUE DES PAE (Charles et Marie, 1er octobre 2026 ; maquette validée le
 * même jour). On passe les étudiants de la liste l'un après l'autre, dans
 * l'ordre où la liste les montre : le PAE de l'année COURS PAR COURS — reporté,
 * dispensé, à suivre —, le parcours à droite, et une case « PAE revu » qui
 * garde qui l'a cochée et quand. Les UE sans report sont repliées.
 */
export function RevuePAE({ liste: base, annee: anneeDepart, onClose }) {
  /* TOUT VOIR, FILTRER, ENCODER (Charles, 1er octobre 2026, après le premier
     essai : « pas clair — il faut tout voir ; un filtre par section, par
     année ; voir directement les reports, et surtout pouvoir les encoder »). */
  const [annee, setAnnee] = useState(anneeDepart);
  const [annees, setAnnees] = useState([]);
  const [synthese, setSynthese] = useState(null);
  const [fSection, setFSection] = useState('');
  const [fNiveau, setFNiveau] = useState('');
  const [fCritere, setFCritere] = useState('');    // '' | reports | verifier | nonrevus | sanspae
  const [i, setI] = useState(0);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [erreurSyn, setErreurSyn] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [saisie, setSaisie] = useState(null);      // { ue, code, note, origine }
  const [saisieVA, setSaisieVA] = useState(null);  // { ue, code, nature, origine } — VA reprise sans dossier
  const [saisieUE, setSaisieUE] = useState(null);
  const [editions, setEditions] = useState(false);  // { ue, nature, origine } — VA / VAE de l'UE entière
  const [ajout, setAjout] = useState('');
  const [aller, setAller] = useState(null);       // l'étudiant à rejoindre une fois les filtres tombés
  const [versionSchema, setVersionSchema] = useState(0);
  const [ouverts, setOuverts] = useState(() => new Set());   // les volets d'UE ouverts
  // Le verdict des gestes, réglages compris (3.1.20) — le secrétariat reporte aussi.
  const droitsPAE = useDroits();
  const peutReporter = droitsPAE.peut('etudiants.reports');
  // La porte du PAE (pae-valider → ecrireProgramme).
  const peutModifier = droitsPAE.peut('etudiants.pae_composer');

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(x => x.code).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => {
    setSynthese(null);
    /* LA SYNTHÈSE NE DOIT JAMAIS VIDER LA LISTE EN SILENCE (2 octobre 2026 :
       « Marie ne voit aucun étudiant »). Un échec se DIT, et la liste reste
       entière ; un étudiant sur qui la synthèse ne dit rien reste dedans. */
    fetch('/api/etudiants/revue-pae/synthese', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, ids: base.map(e => e.id).filter(Boolean) }) })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErreurSyn(`La synthèse de la liste a échoué (${r.status}) : ${j.error || 'erreur du serveur'}. Les filtres « avec reports », « à vérifier » et « pas encore validés » ne s'appliquent pas.`); setSynthese({}); return; }
        setSynthese(j);
      }).catch(e => { setErreurSyn(`La synthèse de la liste a échoué : ${e.message}`); setSynthese({}); });
  }, [annee, base]);

  const sections = useMemo(() => [...new Set(base.map(e => e.section).filter(Boolean))].sort(), [base]);
  const liste = useMemo(() => base.filter(e => {
    const sy = synthese?.[e.id];
    if (fSection && e.section !== fSection) return false;
    if (fNiveau && e.niveau !== fNiveau) return false;
    /* UN ÉTUDIANT SANS PAE N'EST PAS « HORS SUJET » (Charles, 5 octobre 2026 :
       « un sérieux bug pour 26-27 »). La revue l'écartait d'office : ouverte sur
       ABARKAN Sara, sans inscription en 2026-2027, elle répondait « aucun
       étudiant ne correspond » au lieu de proposer de composer son programme.
       Il reste dans la liste ; « Sans PAE » les retrouve tous. */
    if (fCritere === 'sanspae' && sy?.pae) return false;
    if (fCritere === 'reports' && !sy?.reports) return false;
    if (fCritere === 'verifier' && !(sy?.deja || sy?.reprendre)) return false;
    if (fCritere === 'nonrevus' && sy?.revu) return false;
    return true;
  }), [base, synthese, fSection, fNiveau, fCritere]);
  useEffect(() => { setI(0); }, [fSection, fNiveau, fCritere, annee]);
  useEffect(() => {
    if (aller == null) return;
    const k = liste.findIndex(y => y.id === aller);
    if (k >= 0) { setI(k); setAller(null); }
  }, [aller, liste]);
  const cur = liste[Math.min(i, Math.max(0, liste.length - 1))];

  const charger = useCallback(async () => {
    if (!cur) { setD(null); return; }
    setD(null); setErreur(null); setSaisie(null);
    try {
      const r = await fetch(`/api/etudiants/${cur.id}/revue-pae?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(j);
    } catch (e) { setErreur(e.message); }
  }, [cur, annee]);
  useEffect(() => { charger(); }, [charger]);
  /* LES VOLETS S'OUVRENT SUR CE QUI DEMANDE UN REGARD (Charles, 2 octobre 2026) :
     un report, une VA partielle, une alerte. Une UE en VA totale reste fermée,
     son badge suffit ; une UE sans rien de particulier aussi. */
  const idCharge = d?.etudiant?.id;
  useEffect(() => {
    if (!d) return;
    setOuverts(new Set(d.ues.filter(u => !u.nature_totale
      && (u.reports > 0 || u.va > 0 || u.deja || u.etat === 'reprendre')).map(u => u.ue_num)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCharge, annee]);
  const basculerVolet = n => setOuverts(o => { const x = new Set(o); x.has(n) ? x.delete(n) : x.add(n); return x; });

  const majSynthese = (id, rv) => setSynthese(sy => (sy ? { ...sy, [id]: { ...(sy[id] || {}),
    reports: rv.chiffres.cours_reportes, revu: !!rv.revu,
    deja: rv.ues.filter(u => u.deja).length, reprendre: rv.ues.filter(u => u.etat === 'reprendre').length } } : sy));

  const marquer = async (revu, puisSuivant = false) => {
    if (!cur) return;
    setEnCours('revu'); setErreur(null);
    try {
      /* VALIDER CONFIRME LE PROGRAMME (Charles, 2 octobre 2026) : un seul geste,
         celui de la revue — l'étudiant est inscrit aux unités du PAE affiché,
         puis la validation est signée. Une dérogation demande son motif ; un
         refus du serveur arrête tout, rien n'est validé à moitié. */
      if (revu && d) {
        const ues = d.ues.map(u => u.ue_num);
        const appel = corps => fetch(`/api/etudiants/${cur.id}/pae/confirmer`, { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ annee, ues, ...corps }) }).then(async x => ({ x, j: await x.json().catch(() => ({})) }));
        let { x, j } = await appel({});
        if (x.status === 409 && j.refus?.length) {
          const motifs = await demanderMotifs(j.refus);
          if (!motifs) return;
          ({ x, j } = await appel({ motifs }));
        }
        if (!x.ok) throw new Error(j.error || 'La confirmation du programme a été refusée.');
      }
      const poser = extra => fetch(`/api/etudiants/${cur.id}/revue-pae/revu`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, revu, ...extra }) });
      let r = await poser({});
      let j = await r.json().catch(() => ({}));
      // Au-delà de 60 ECTS : la validation se fait en connaissance de cause.
      if (r.status === 409 && j.plus60) {
        if (!(await demander(`Programme de ${j.plus60} ECTS, au-delà de 60 (plus qu'une année à temps plein).\n\nValider en connaissance de cause ? La confirmation est enregistrée à votre nom.`))) return;
        r = await poser({ plus60: j.plus60 });
        j = await r.json().catch(() => ({}));
      }
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setSynthese(sy => (sy ? { ...sy, [cur.id]: { ...(sy[cur.id] || {}), revu: !!revu } } : sy));
      if (puisSuivant && i < liste.length - 1 && fCritere !== 'nonrevus') setI(i + 1);
      else if (!puisSuivant || fCritere === 'nonrevus') setD(x => (x ? { ...x, revu: j.revu } : x));
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };

  const reporter = async (ue, code, corps = {}) => {
    setEnCours(`rep-${ue}-${code}`); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/${cur.id}/revue-pae/report`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_num: ue, cours_code: code, ...corps }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setD(j.revue); majSynthese(cur.id, j.revue); setSaisie(null);
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const poserVAUE = async (ue, nature, origine) => {
    setEnCours(`ue-${ue}`); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/${cur.id}/revue-pae/va-ue`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_num: ue, nature, annee_origine: origine }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setD(j.revue); majSynthese(cur.id, j.revue); setSaisieUE(null);
      setOuverts(o => { const x = new Set(o); x.delete(ue); return x; });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const retirer = async (ue, code) => {
    setEnCours(`rep-${ue}-${code}`); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/${cur.id}/revue-pae/report?annee=${encodeURIComponent(annee)}&ue_num=${ue}&cours_code=${encodeURIComponent(code)}`,
        { method: 'DELETE', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setD(j.revue); majSynthese(cur.id, j.revue);
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };

  /* AJOUTER OU RETIRER UNE UE — par la porte unique, comme la fiche : le
     serveur juge chaque ajout et demande un motif pour une dérogation ; une
     inscription qui porte un résultat n'est retirée que sur confirmation. Les
     reports d'office se reposent seuls à l'enregistrement. */
  const modifierProgramme = async (ueNums, libelle) => {
    if (!(await demander(`${libelle} — le PAE ${annee} de ${nomPropre(cur.nom, cur.prenom)} sera enregistré, et sa confirmation retirée s'il était confirmé.`))) return;
    setEnCours('pae'); setErreur(null);
    try {
      const appel = corps => fetch(`/api/etudiants/${cur.id}/pae-valider`, { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums: ueNums, ...corps }) }).then(async r => ({ r, j: await r.json().catch(() => ({})) }));
      let motifs = {};
      let { r, j } = await appel({});
      if (r.status === 409 && j.refus?.length) {
        motifs = await demanderMotifs(j.refus);
        if (!motifs) return;
        ({ r, j } = await appel({ motifs }));
      }
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      if (j.conservees && await demander(`${j.conservees} inscription(s) portent un résultat encodé et ont été conservées. Les retirer quand même, avec leurs notes ?`)) {
        ({ r, j } = await appel({ motifs, forcer: true }));
        if (!r.ok) throw new Error(j.error || 'Refusé.');
      }
      setAjout(''); setVersionSchema(v => v + 1);
      await charger();
      setSynthese(sy => (sy ? { ...sy, [cur.id]: { ...(sy[cur.id] || {}), pae: ueNums.length } } : sy));
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const dansPAE = d ? d.ues.map(u => u.ue_num) : [];
  const retirerUE = n => modifierProgramme(dansPAE.filter(x => x !== n), `Retirer l'UE ${n}`);
  const ajouterUE = n => modifierProgramme([...dansPAE, Number(n)], `Ajouter l'UE ${n}`);
  const clicSchema = n => {
    if (!peutModifier || !d) return;
    if (dansPAE.includes(n)) retirerUE(n);
    else if (d.autres.some(x => x.ue_num === n)) ajouterUE(n);
  };

  const ETAT = { dispensee: ['dispensée — VA', 'bg-emerald-700'], partielle: ['reprise partielle', 'bg-blue-700'],
    reprendre: ['à reprendre', 'bg-amber-700'], programme: ['au programme', 'bg-blue-700'] };
  const ch = d?.chiffres;
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');
  const anterieures = annees.filter(a => a < annee).sort().reverse();
  // UNE VA SANS DOSSIER ne se pose que pour 2025-2026 et avant (Charles, 2 octobre 2026).
  const anneesReprise = anterieures.filter(a => a <= '2025-2026');
  let blocCourant = null;
  const Tuile = ({ v, l, p, etat = 'fort' }) => (
    <div data-etat={etat} className="bloc-etat px-3 py-2">
      <div className="text-lg font-bold leading-tight">{v}</div>
      <div className="text-second">{l}</div>
      {p && <div className="text-xs text-slate-500">{p}</div>}
    </div>
  );
  // LES TROIS BOUTONS À HAUTEUR DU NOM, À DROITE (Charles, 2 octobre 2026) :
  // ils ne descendent plus au pied, et « Suivant » devient « Passer ».
  const etudiantPret = !!(d && cur && d.etudiant?.id === cur.id);
  const navBoutons = (
    <span className="ml-auto flex items-center gap-2">
      <button className="bouton" disabled={i === 0} onClick={() => setI(i - 1)}>◀ Précédent</button>
      <button className="bouton" disabled={i >= liste.length - 1} onClick={() => setI(i + 1)}>Passer ▶</button>
      {/* VERT, ÉCRIT BLANC : c'est le geste de la revue, et il valide. Le fond
          passe en style — `.bouton` porte le sien et l'emporte sur l'utilitaire. */}
      <button className="bouton font-semibold disabled:opacity-40"
        style={{ background: 'var(--c-reussi, #3E7D5E)', borderColor: 'var(--c-reussi, #3E7D5E)', color: '#fff' }}
        disabled={!etudiantPret || !!enCours} onClick={() => marquer(true, true)}>
        {i >= liste.length - 1 ? 'Valider' : 'Valider · étudiant suivant ▶'}</button>
    </span>
  );
  const nRevus = synthese ? liste.filter(e => synthese[e.id]?.revu).length : 0;

  return (
    <Fenetre icone={IconEyeCheck} large="ecran" hauteurFixe onFermer={onClose}
      titre={d ? `Revue des PAE — ${nomPropre(d.etudiant.nom, d.etudiant.prenom)}` : 'Revue des PAE'}
      sous={liste.length ? `${Math.min(i, liste.length - 1) + 1} sur ${liste.length} · ${nRevus} validé(s) · année ${annee}` : `Aucun étudiant ne correspond · année ${annee}`}
      outils={<button type="button" title="Imprimer ou envoyer le PAE de cet étudiant — centre d'édition" aria-label="Éditions"
        disabled={!liste.length} onClick={() => setEditions(true)}
        className="flex-none w-8 h-8 grid place-items-center rounded-champ hover:bg-white/15 disabled:opacity-40">
        <IconSend size={16} /></button>}>
      {/* LES FILTRES : on choisit la liasse avant de la parcourir. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="controle text-sm" value={annee} onChange={e => setAnnee(e.target.value)} title="Année du PAE">
          {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="controle text-sm" value={fSection} onChange={e => setFSection(e.target.value)}>
          <option value="">Toutes les sections</option>
          {sections.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="controle text-sm" value={fNiveau} onChange={e => setFNiveau(e.target.value)}>
          <option value="">Tous les blocs</option>
          <option value="BA1">BA1</option><option value="BA2">BA2</option><option value="BA3">BA3 / diplômant</option>
          <option value="MIXTE">Parcours mixte</option>
        </select>
        <div className="segments">
          {[['', 'Tous'], ['reports', 'Avec reports'], ['verifier', 'À vérifier'], ['nonrevus', 'Pas encore validés'], ['sanspae', 'Sans PAE']].map(([v, l]) => (
            <button key={v || 'tous'} type="button" onClick={() => setFCritere(v)}
              className={`px-2.5 py-1 text-second ${fCritere === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>
          ))}
        </div>
        {/* ALLER DIRECTEMENT À UN ÉTUDIANT DE LA LISTE. */}
        {/* ALLER À UN ÉTUDIANT EN TAPANT (7 octobre 2026) : la liste déroulante de
            plusieurs centaines de noms laisse place au champ qui propose. Un
            étudiant hors des filtres posés les fait tomber, plutôt que d'être
            introuvable. */}
        {/* LA LISTE AUSSI (Charles, 7 octobre 2026 : « le menu déroulant avec les
            noms, en plus de la zone de saisie ») : on parcourt ou on tape. */}
        <select className="controle text-sm max-w-[14rem]" value={cur?.id || ''}
          onChange={e => { const k = liste.findIndex(x => x.id === Number(e.target.value)); if (k >= 0) setI(k); }}
          title="Choisir un étudiant de la liste filtrée">
          {liste.map((x, k) => <option key={x.id} value={x.id}>{k + 1}. {nomPropre(x.nom, x.prenom)}{synthese?.[x.id]?.revu ? ' ✓' : ''}{synthese?.[x.id] && !synthese[x.id].pae ? ' · sans PAE' : ''}</option>)}
        </select>
        <ChampEtudiant className="w-[16rem]" options={base} placeholder="ou taper un nom…"
          detail={x => [synthese?.[x.id]?.revu ? '✓ validé' : '', synthese?.[x.id] && !synthese[x.id].pae ? 'sans PAE' : ''].filter(Boolean).join(' · ')}
          onChoisir={x => {
            const k = liste.findIndex(y => y.id === x.id);
            if (k >= 0) { setI(k); return; }
            setFSection(''); setFNiveau(''); setFCritere(''); setAller(x.id);
          }} />

      </div>
      {erreurSyn && <div data-etat="surveiller" className="bloc-etat px-3 py-2 text-second mb-3">{erreurSyn}</div>}
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-second mb-3">{erreur}</div>}
      {!synthese && <p className="text-sm text-slate-400">Lecture de la liste…</p>}
      {synthese && !liste.length && <p className="text-sm text-slate-500">Aucun étudiant de la liste ne correspond à ces filtres pour {annee}.</p>}
      {synthese && liste.length > 0 && !etudiantPret && (
        <div className="flex items-center gap-3 mb-2 min-h-[44px]">
          <span className="text-sm text-slate-400">{erreur ? '' : 'Chargement…'}</span>{navBoutons}
        </div>
      )}
      {/* L'ÉTUDIANT AFFICHÉ DOIT ÊTRE CELUI DE LA LISTE : validé sous le filtre
          « pas encore validés », il sort de la liste — le dernier validé la
          vidait, et l'écran plantait sur un étudiant qui n'y était plus
          (2 octobre 2026, « undefined … R.id »). */}
      {d && cur && d.etudiant?.id === cur.id && (() => {
        const ch = d.chiffres;
        const e = d.etudiant;
        const blocs = [];
        for (const u of d.ues) {
          const k = u.ei ? 'EI' : (u.niv || '—');
          let g = blocs.find(x => x.k === k);
          if (!g) { g = { k, ues: [] }; blocs.push(g); }
          g.ues.push(u);
        }
        const fmtMoy = ch.moyenne == null ? '—' : ch.moyenne.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        // LE PETIT TRAIN (Charles, 2 octobre 2026) : sur le modèle du badge des
        // attributions — section, niveau, ECTS réussis (bande verte), ECTS en
        // cours, UE en cours et leurs périodes étudiant, moyenne du parcours.
        /* LE TRAIN SE LIT EN DEUX TEMPS (Charles, 2 octobre 2026) : ce qui est EN
           COURS, souligné de bleu — niveau, ECTS, UE et périodes de l'année —,
           puis ce qui est ACQUIS, au bout — ECTS réussis (vert), moyenne. */
        const Wagon = ({ v, l, ligne = null, fort = false, titre }) => (
          <span title={titre} className={`relative px-2.5 py-1 leading-tight ${fort ? 'font-bold text-iip-texte' : ''}`}>
            <span className="block text-sm font-semibold text-iip-texte tabular-nums">{v}</span>
            {l && <span className="block text-mention text-slate-500">{l}</span>}
            {ligne && <span className={`absolute left-1.5 right-1.5 bottom-0 h-[3px] rounded-full ${ligne === 'vert' ? 'bg-emerald-700' : ligne === 'orange' ? '' : 'bg-blue-700'}`}
              style={ligne === 'orange' ? { background: 'var(--c-attente, #E8890C)' } : undefined} />}
          </span>
        );
        const BadgeUE = ({ u }) => {
          if (u.nature_totale) return <span className="text-xs font-semibold text-emerald-800 bg-white border-2 border-emerald-600 rounded px-1.5 py-px">{u.nature_totale}</span>;
          const out = [];
          if (u.reports) out.push(<span key="r" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-emerald-700">{u.reports} report{u.reports > 1 ? 's' : ''}</span>);
          if (u.va) out.push(<span key="v" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-teal-800">{u.nature_partielle || 'VAP'}</span>);
          if (u.deja) out.push(<span key="d" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-amber-700">déjà acquise {String(u.deja).replace(/^20(\d\d)-20(\d\d)$/, '$1-$2')}</span>);
          // Réussie cette année : verte, ou violette avec le cadeau quand c'est une faveur.
          if (u.etat === 'reussie') out.push(<span key="ok" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-emerald-700">réussie</span>);
          if (u.etat === 'faveur') out.push(<span key="fv" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-violet-700 inline-flex items-center gap-1"><IconGift size={11} stroke={2.2} />réussie par faveur</span>);
          if (u.etat === 'reprendre') out.push(<span key="p" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-amber-700">à reprendre</span>);
          if (!out.length) out.push(<span key="a" className="text-xs font-semibold text-white rounded px-1.5 py-px bg-blue-700">au programme</span>);
          return <span className="inline-flex gap-1 flex-wrap">{out}</span>;
        };
        return (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-2 min-h-[44px]">
              {/* Le nom et le matricule dessous : la même hauteur que le train. */}
              <span className="leading-tight">
                <span className="block text-base font-bold text-iip-texte">{nomPropre(e.nom, e.prenom)}</span>
                <span className="block text-xs text-slate-500 tabular-nums">{e.id_ecampus || '—'}</span>
              </span>
              <span className="bloc-etat etat-neutre inline-flex items-stretch divide-x divide-slate-200"
                style={{ borderLeftColor: couleurBloc(e.niveau) || 'rgb(var(--gris-200))' }}>
                <Wagon v={e.section || '—'} l="section" fort />
                <Wagon v={e.niveau_libelle || '—'} l="niveau" ligne="bleu" />
                {/* AU-DELÀ DE 60 ECTS, ORANGE (Charles, 3 octobre 2026) : plus
                    qu'une année à temps plein. Une information, pas un refus. */}
                {Number(ch.ects_pae) > 60
                  ? <Wagon v={ch.ects_pae} l="ECTS en cours · au-delà de 60" ligne="orange"
                      titre="Plus qu'une année à temps plein : vérifier la faisabilité de l'horaire et la charge de travail." />
                  : <Wagon v={ch.ects_pae} l="ECTS en cours" ligne="bleu" />}
                <Wagon v={`${ch.nb_ue} UE`} l={`${ch.periodes_pae} pér. étudiant`} ligne="bleu" />
                <Wagon v={ch.ects_acquis} l="ECTS réussis" ligne="vert" />
                <Wagon v={fmtMoy} l="moyenne du parcours" />
              </span>
              {navBoutons}
            </div>
            {d.revu && (
              <div className="mb-2 px-3 py-2 rounded-lg text-sm bg-emerald-700 text-white">
                <b>Ce PAE a été validé</b> le {quandLocal(d.revu.revu_le)} par {d.revu.revu_par || '—'}{d.revu.ects_confirme ? ` — ${d.revu.ects_confirme} ECTS, au-delà de 60, confirmés en connaissance de cause` : ''}.
                <button type="button" disabled={!!enCours} className="ml-3 underline text-white/80 hover:text-white text-second"
                  onClick={() => marquer(false)}>retirer la validation</button>
              </div>
            )}
            {/* Plus de bandeaux « À vérifier » : le badge du volet le dit déjà
                (« à reprendre », « déjà acquise »), et le filtre trie dessus. */}
            <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] mt-2">
              <div>
                <div className="flex items-center gap-3 text-second mb-1.5">
                  <span className="text-slate-500">{ch.cours_reportes} cours reporté(s) · {ch.cours_va} dispensé(s) par VA · {ch.cours_a_suivre} à suivre ({ch.periodes_a_suivre} pér.)</span>
                  <span className="flex-1" />
                  <button type="button" className="underline text-slate-500" onClick={() => setOuverts(new Set(d.ues.map(u => u.ue_num)))}>tout ouvrir</button>
                  <button type="button" className="underline text-slate-500" onClick={() => setOuverts(new Set())}>tout fermer</button>
                </div>
                {!d.ues.length && <div data-etat="surveiller" className="bloc-etat px-3 py-2 text-sm">Pas encore de PAE pour {annee} : ajoutez ses unités ci-dessous (« Ajouter une UE au PAE »), ou composez les PAE de la section (Inscriptions & PAE → Composer le PAE).</div>}
                {/* LES VOLETS, COMME DANS LES ATTRIBUTIONS : pas de cadres, une
                    ligne par UE, une bande à la couleur du bloc le long du groupe. */}
                {blocs.map(g => (
                  <div key={g.k} className="flex mb-3">
                    <div className="w-[5px] rounded-full flex-none" style={{ background: g.k === 'EI' ? 'var(--c-epreuve, #C9A227)' : (couleurBloc(g.k) || 'rgb(var(--gris-300))') }} />
                    <div className="flex-1 min-w-0 pl-2.5">
                      <div className="intertitre pb-1">
                        {g.k === 'EI' ? 'Épreuve intégrée' : g.k} · {g.ues.length} UE · {g.ues.reduce((t, u) => t + u.ects, 0)} ECTS</div>
                      {g.ues.map(u => {
                        const ouvert = ouverts.has(u.ue_num);
                        return (
                          <div key={u.ue_num} className="border-b border-slate-100">
                            <div className="grid items-center gap-2 py-1 px-0.5 text-sm hover:bg-slate-50 cursor-pointer"
                              style={{ gridTemplateColumns: '14px 56px minmax(0,1fr) auto 56px 50px auto auto' }}
                              onClick={() => basculerVolet(u.ue_num)}>
                              <IconChevronRight size={13} className={`text-slate-400 transition-transform ${ouvert ? 'rotate-90' : ''}`} />
                              <b className="text-iip-texte tabular-nums">UE {u.ue_num}</b>
                              <span className="truncate">{u.ue_nom}</span>
                              <BadgeUE u={u} />
                              <span className="text-xs text-slate-500 text-right">{u.cours.length} cours</span>
                              <span className="text-xs text-slate-500 text-right">{u.ects} ECTS</span>
                              {peutReporter && !u.nature_totale && anneesReprise.length > 0 ? <button type="button" className="text-second underline text-teal-800 whitespace-nowrap"
                                title="Une VA ou VAE de toute l'UE, accordée en 2024-2025 ou 2025-2026 sans dossier : tous ses cours sont dispensés à 10/20"
                                onClick={ev => { ev.stopPropagation(); setSaisieUE({ ue: u.ue_num, nature: 'VA', origine: anneesReprise[0] }); }}>VA / VAE</button> : <span />}
                              {peutModifier ? <button type="button" disabled={!!enCours} className="text-xs underline text-slate-400 hover:text-slate-600"
                                title="Retirer cette UE du PAE de l'année" onClick={ev => { ev.stopPropagation(); retirerUE(u.ue_num); }}>retirer</button> : <span />}
                            </div>
                            {saisieUE?.ue === u.ue_num && (
                              <div className="flex flex-wrap items-center gap-2 pb-2 pl-6 text-second">
                                <span className="text-slate-600">L'UE entière, sans dossier :</span>
                                <select className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white" value={saisieUE.nature} onChange={ev => setSaisieUE({ ...saisieUE, nature: ev.target.value })}>
                                  <option value="VA">VA</option><option value="VAE">VAE</option>
                                </select>
                                <select className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white" value={saisieUE.origine} onChange={ev => setSaisieUE({ ...saisieUE, origine: ev.target.value })}>
                                  {anneesReprise.map(x => <option key={x} value={x}>{x}</option>)}
                                </select>
                                <button type="button" disabled={enCours === `ue-${u.ue_num}`} className="rounded bg-teal-800 text-white h-7 px-2 text-second font-semibold disabled:opacity-40"
                                  onClick={() => poserVAUE(u.ue_num, saisieUE.nature, saisieUE.origine)}>Poser · tous les cours à 10/20</button>
                                <button type="button" className="underline text-slate-500" onClick={() => setSaisieUE(null)}>annuler</button>
                              </div>
                            )}
                            {ouvert && (
                              <div className="grid gap-x-3 gap-y-1 pb-2 pl-6 text-sm items-center" style={{ gridTemplateColumns: '56px minmax(0,1fr) 46px minmax(0,300px)' }}>
                                {u.cours.map(c => {
                                  const occupe = enCours === `rep-${u.ue_num}-${c.code}`;
                                  const saisieIci = saisie && saisie.ue === u.ue_num && saisie.code === c.code;
                                  const vaReprise = c.statut === 'report' && c.nature && c.nature !== 'Report';
                                  const saisieVAIci = saisieVA && saisieVA.ue === u.ue_num && saisieVA.code === c.code;
                                  const teinte = vaReprise || c.statut === 'va' ? 'text-teal-800 font-medium' : c.statut === 'report' ? 'text-emerald-700 font-medium' : '';
                                  return (
                                    <Fragment key={c.code}>
                                      <span className="text-slate-500 tabular-nums">{c.code}</span>
                                      <span className={teinte}>{c.nom}</span>
                                      <span className="text-xs text-slate-500 text-right tabular-nums">{c.per ? `${c.per} p.` : ''}</span>
                                      <span className="text-second flex flex-wrap items-center gap-1.5">
                                        {c.statut === 'report' && <>
                                          <span className={`rounded px-1.5 py-px text-white font-semibold ${vaReprise ? 'bg-teal-800' : 'bg-emerald-700'}`}
                                            title={vaReprise ? `${c.nature} reprise sans dossier${c.par ? ` — posée par ${c.par}` : ''}` : (c.par ? `Posé par ${c.par}` : '')}>
                                            {vaReprise ? (c.nature === 'DISPENSE' ? 'Dispense' : c.nature) : 'Report'} {String(c.annee_origine || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2')}{c.note != null ? ` · ${Math.round(c.note)}/20` : ''}</span>
                                          {peutReporter && <button type="button" disabled={occupe} className="underline text-slate-500" onClick={() => retirer(u.ue_num, c.code)}>retirer</button>}
                                        </>}
                                        {c.statut === 'va' && <span className="rounded px-1.5 py-px bg-white border-2 border-emerald-600 text-emerald-800 font-semibold">{c.nature || 'VAP'}</span>}
                                        {c.statut === 'suivre' && saisieVAIci && <>
                                          <select className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white" value={saisieVA.nature} onChange={ev => setSaisieVA({ ...saisieVA, nature: ev.target.value })}>
                                            {[['VAP', 'VAP'], ['VAEP', 'VAEP'], ['DISPENSE', 'Dispense']].map(([x, l]) => <option key={x} value={x}>{l}</option>)}
                                          </select>
                                          <select className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white" value={saisieVA.origine} onChange={ev => setSaisieVA({ ...saisieVA, origine: ev.target.value })}>
                                            {anneesReprise.map(x => <option key={x} value={x}>{x}</option>)}
                                          </select>
                                          <button type="button" disabled={occupe || !saisieVA.origine} className="rounded bg-teal-800 text-white h-7 px-2 text-second font-semibold disabled:opacity-40"
                                            onClick={() => reporter(u.ue_num, c.code, { nature: saisieVA.nature, annee_origine: saisieVA.origine }).then(() => setSaisieVA(null))}>Poser · 10/20</button>
                                          <button type="button" className="underline text-slate-500" onClick={() => setSaisieVA(null)}>annuler</button>
                                        </>}
                                        {c.statut === 'suivre' && !saisieIci && !saisieVAIci && <>
                                          <span className="font-semibold text-blue-700">à suivre</span>
                                          {c.refuse && <span className="text-slate-400" title={c.refuse.motif || ''}>· report retiré</span>}
                                          {peutReporter && c.eligible && (
                                            <button type="button" disabled={occupe} className="rounded border border-slate-300 bg-white h-7 px-2 text-second font-medium hover:bg-slate-50 disabled:opacity-40"
                                              onClick={() => reporter(u.ue_num, c.code)}>Reporter {c.eligible.note != null ? `${c.eligible.note}/20` : ''} · {String(c.eligible.annee_origine || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2')}</button>
                                          )}
                                          {peutReporter && (
                                            <button type="button" disabled={occupe} className="underline text-slate-500"
                                              onClick={() => setSaisie({ ue: u.ue_num, code: c.code, note: c.eligible?.note ?? '', origine: c.eligible?.annee_origine || anterieures[0] || '' })}>
                                              {c.eligible ? 'autre note' : 'encoder un report'}</button>
                                          )}
                                          {peutReporter && anneesReprise.length > 0 && (
                                            <button type="button" disabled={occupe} className="underline text-teal-800"
                                              title="Une VAP, une VAEP ou une dispense accordée en 2024-2025 ou 2025-2026 et jamais encodée en dossier : le cours est dispensé à 10/20"
                                              onClick={() => { setSaisie(null); setSaisieVA({ ue: u.ue_num, code: c.code, nature: 'VAP', origine: anneesReprise[0] }); }}>VAP / dispense</button>
                                          )}
                                        </>}
                                        {saisieIci && <>
                                          <input className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white w-16" placeholder="/20" value={saisie.note} autoFocus
                                            onChange={ev => setSaisie({ ...saisie, note: ev.target.value })} />
                                          <select className="border border-slate-300 rounded h-7 px-1.5 text-second bg-white" value={saisie.origine} onChange={ev => setSaisie({ ...saisie, origine: ev.target.value })}>
                                            {anterieures.map(x => <option key={x} value={x}>{x}</option>)}
                                          </select>
                                          <button type="button" disabled={occupe} className="bouton bouton-fort"
                                            onClick={() => reporter(u.ue_num, c.code, { note: saisie.note, annee_origine: saisie.origine })}>Reporter</button>
                                          <button type="button" className="underline text-slate-500" onClick={() => setSaisie(null)}>annuler</button>
                                        </>}
                                      </span>
                                    </Fragment>
                                  );
                                })}
                                {!u.cours.length && <span className="col-span-4 text-second text-slate-400">Aucun cours encodé pour cette unité en {annee}.</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {peutModifier && d.autres.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pl-4 mt-1">
                    <span className="text-second font-semibold">Ajouter une UE au PAE</span>
                    <select className="controle text-sm min-w-0 flex-1" value={ajout} onChange={ev => setAjout(ev.target.value)}>
                      <option value="">— choisir dans le cursus —</option>
                      {d.autres.map(x => <option key={x.ue_num} value={x.ue_num}>
                        {x.niv || '—'} · UE {x.ue_num} — {x.ue_nom}{x.statut ? ` (${({ accessible: 'accessible', bloquee: 'bloquée', sous_reserve: 'sous réserve', en_attente: 'en attente' })[x.statut] || x.statut})` : ''}</option>)}
                    </select>
                    <button type="button" className="bouton bouton-fort" disabled={!ajout || !!enCours} onClick={() => ajouterUE(ajout)}>
                      {enCours === 'pae' ? 'Enregistrement…' : 'Ajouter'}</button>
                  </div>
                )}
                {!peutReporter && <p className="text-second text-slate-500 pl-4">Encoder un report est réservé à la direction, à la coordination et à l'administration des études.</p>}
              </div>
              <div className="min-w-0 lg:sticky lg:top-0 lg:border-l lg:border-slate-200 lg:pl-4">
                <div className="text-sm font-semibold mb-1">Parcours{peutModifier ? <span className="font-normal text-xs text-slate-500"> — cliquer une tuile pour l'ajouter au PAE ou l'en retirer</span> : null}</div>
                <ParcoursCompact etudId={cur.id} annee={annee} version={versionSchema}
                  programme={new Set(dansPAE)}
                  dispenses={new Set(d.ues.filter(u => u.reports || u.va).map(u => u.ue_num))}
                  onNoeud={peutModifier ? clicSchema : null} />
              </div>
            </div>
          </>
        );
      })()}
      {editions && (
        /* L'AVION DE LA REVUE OUVRE SUR L'ÉTUDIANT À L'ÉCRAN, le PAE coché
           (Charles, 5 octobre 2026 : « depuis un dossier… en cochant déjà la
           bonne chose liée ») ; « revenir » rend la liasse de la revue. */
        <CentreImpressionCentral ongletInitial="etudiants" onClose={() => setEditions(false)}
          etudiant={cur ? { id: cur.id, nom: cur.nom, prenom: cur.prenom, section_rattachement: cur.section || null } : null}
          anneeEtudiant={annee}
          perimetre={{ annee, pieces: ['pae'], coches: liste.map(x => x.id),
            sections: fSection ? [fSection] : [...new Set(liste.map(x => x.section).filter(Boolean))] }} />
      )}
    </Fenetre>
  );
}

/* LA RANGÉE DES ONGLETS DE LA FICHE ACCUEILLE LES OUTILS DE L'ONGLET OUVERT
   (Charles, 3 octobre 2026 : « gagner de la place, les boutons sur la même
   ligne »). La fiche fournit le nœud ; un onglet y pose ses boutons. */
const OutilsFiche = createContext(null);

function SchemaCapitalisation({ etudId, annee, onNoeud = null, programme = null, onModifie = null }) {
  const [data, setData] = useState(null);
  const [recharge, setRecharge] = useState(0);
  /* RETIRER CE QUI RESTE D'UN CURSUS ARCHIVÉ (28 septembre 2026) : le bandeau
     le demandait sans en donner le moyen. Simulation, confirmation qui nomme,
     puis retrait par la porte unique. */
  const retirerArchive = async section => {
    const appel = simulation => fetch(`/api/etudiants/${etudId}/cursus-archive/retirer`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, section, simulation }) })
      .then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));
    const sim = await appel(true);
    if (!sim.ok) { informer(sim.j.error || 'Refusé.'); return; }
    const { retirees = [], conservees = [] } = sim.j;
    if (!retirees.length) {
      informer(conservees.length ? `Rien à retirer sans perte : UE ${conservees.map(x => `${x.ue_num} (${x.pourquoi})`).join(', ')}.` : 'Rien à retirer.');
      return;
    }
    if (!(await demander(`Retirer ${retirees.length} inscription(s) de ${section} en ${annee} : UE ${retirees.join(', ')} ?`
      + (conservees.length ? `\n\nRestent, parce qu'elles portent un résultat, une note ou un report : UE ${conservees.map(x => x.ue_num).join(', ')}.` : '')
      + '\n\nSi le programme était confirmé, la confirmation sera retirée.'))) return;
    const fait = await appel(false);
    if (!fait.ok) { informer(fait.j.error || 'Refusé.'); return; }
    setRecharge(n => n + 1); onModifie?.();
  };
  useEffect(() => {
    let vivant = true;
    fetch(`/api/etudiants/${etudId}/capitalisation?annee=${annee}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (vivant) setData(j || { nodes: [], edges: [] }); })
      .catch(() => { if (vivant) setData({ nodes: [], edges: [] }); });
    return () => { vivant = false; };
  }, [etudId, annee, recharge]);
  const vue = useMemo(() => (data?.nodes && programme)
    ? { ...data, nodes: data.nodes.map(n => ({ ...n, inscrite: programme.has(n.ue_num) })) }
    : data, [data, programme]);
  /* LES CURSUS ARCHIVÉS SE VOIENT (Charles, 27 septembre 2026) : un changement
     de cursus archive le précédent — il ne se mêle plus au schéma, mais il se
     nomme, avec ses années et ce qui y a été réussi, et s'ouvre à la demande. */
  const [archiveVue, setArchiveVue] = useState(null);   // { section, data }
  const reprendre = async section => {
    if (!(await demander(`Faire de ${section} le cursus en cours de l'étudiant ?\n\n`
      + `Sa section actuelle deviendra un cursus archivé ; ses inscriptions de ${annee} y resteront, `
      + 'et se retireront ensuite avec « Retirer ces inscriptions ».'))) return;
    const r = await fetch(`/api/etudiants/${etudId}/cursus/reprendre`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, section }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { informer(j.error || 'Refusé.'); return; }
    setArchiveVue(null); setRecharge(n => n + 1); onModifie?.();
  };
  const voirArchive = async section => {
    if (archiveVue?.section === section) { setArchiveVue(null); return; }
    const r = await fetch(`/api/etudiants/${etudId}/capitalisation?annee=${annee}&section=${encodeURIComponent(section)}`, { headers: authHeaders() });
    const j = r.ok ? await r.json() : null;
    setArchiveVue(j ? { section, data: j } : null);
  };
  const archives = data?.archives || [];
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');
  /* CHANGER DE SECTION, VERS UNE SECTION JAMAIS SUIVIE (2 octobre 2026 :
     BOKAM, de Psychomotricité vers TIM — « je sais l'archiver ou la faire
     sortir du cursus, mais pas lui donner un nouveau cursus »). « Reprendre ce
     cursus » ne valait que pour une section déjà suivie. Même geste, même
     route : le rattachement déclaré passe à la nouvelle section, l'ancienne
     devient un cursus archivé — ses réussites restent, ses inscriptions de
     l'année se retirent ensuite par « Retirer ces inscriptions ». */
  const [changer, setChanger] = useState(false);
  const [sectionsRef, setSectionsRef] = useState([]);
  const [nouvelle, setNouvelle] = useState('');
  useEffect(() => {
    if (!changer || sectionsRef.length) return;
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setSectionsRef(Array.isArray(l) ? l : [])).catch(() => {});
  }, [changer, sectionsRef.length]);
  const courante = (data?.sections || [])[0] || null;
  const changerSection = async () => {
    if (!nouvelle) return;
    if (!(await demander(`Faire passer l'étudiant en ${nouvelle} ?\n\n`
      + (courante ? `${courante} deviendra un cursus archivé : ses réussites restent au dossier ; ses inscriptions de ${annee} `
        + 'se retirent ensuite avec « Retirer ces inscriptions ». ' : '')
      + `Le PAE ${annee} se compose ensuite dans ${nouvelle}, onglet PAE de la fiche.`))) return;
    const r = await fetch(`/api/etudiants/${etudId}/cursus/reprendre`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, section: nouvelle }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { informer(j.error || 'Refusé.'); return; }
    setChanger(false); setNouvelle(''); setArchiveVue(null); setRecharge(n => n + 1); onModifie?.();
  };
  const ligneChanger = (
    <div className="flex items-center gap-2 flex-wrap text-second">
      {!changer ? (
        <button type="button" className="bouton bouton-compact" onClick={() => setChanger(true)}
          title="Faire passer l'étudiant dans une autre section — l'actuelle est archivée, rien n'est effacé">
          Changer de section…</button>
      ) : (
        <>
          <span>Nouvelle section{courante ? ` (aujourd'hui : ${courante})` : ''} :</span>
          <select className="controle text-sm" value={nouvelle} onChange={e => setNouvelle(e.target.value)}>
            <option value="">— choisir —</option>
            {sectionsRef.filter(x => x.code !== courante).map(x => <option key={x.code} value={x.code}>{x.libelle && x.libelle !== x.code ? `${x.code} — ${x.libelle}` : x.code}</option>)}
          </select>
          <button type="button" className="bouton bouton-fort bouton-compact" disabled={!nouvelle} onClick={changerSection}>Changer</button>
          <button type="button" className="underline text-slate-500" onClick={() => { setChanger(false); setNouvelle(''); }}>annuler</button>
        </>
      )}
    </div>
  );
  const noeudOutils = useContext(OutilsFiche);
  const bandeau = (
    <div className="mb-2 space-y-1">
      {noeudOutils ? createPortal(ligneChanger, noeudOutils) : ligneChanger}
      {archives.map(a => (
        <div key={a.section} data-etat="neutre" className="bloc-etat px-3 py-1.5 text-second flex items-center gap-3 flex-wrap">
          <span className="flex-1 min-w-0">
            <b>Cursus antérieur archivé : {a.section}</b>
            <span className="text-slate-500"> · {a.du === a.au ? court(a.du) : `${court(a.du)} → ${court(a.au)}`} · {a.reussies} unité{a.reussies > 1 ? 's' : ''} réussie{a.reussies > 1 ? 's' : ''}</span>
            {a.encore_cette_annee && <span className="text-iip-texte"> · encore des inscriptions cette année : à retirer, ou à déclarer compatible</span>}
          </span>
          {a.encore_cette_annee && (
            <button type="button" className="bouton bouton-compact" onClick={() => retirerArchive(a.section)}>
              Retirer ces inscriptions
            </button>
          )}
          <button type="button" className="bouton bouton-compact" onClick={() => reprendre(a.section)}
            title={`Faire de ${a.section} le cursus en cours — la section actuelle sera archivée`}>
            Reprendre ce cursus
          </button>
          <button type="button" className="bouton bouton-compact" onClick={() => voirArchive(a.section)}>
            {archiveVue?.section === a.section ? 'Masquer' : 'Afficher'}
          </button>
        </div>
      ))}
      {archiveVue && (
        <div className="opacity-70 border border-dashed border-slate-300 rounded-carte p-2">
          <div className="text-xs text-slate-500 mb-1">Cursus archivé — {archiveVue.section}, en lecture seule</div>
          <SchemaCapitalisationVue data={archiveVue.data} mode="etudiant" />
        </div>
      )}
    </div>
  );
  if (data && !data.nodes?.length) return bandeau || null;
  return <>{bandeau}<SchemaCapitalisationVue data={vue} mode="etudiant" onNoeud={onNoeud} enteteDans={noeudOutils} /></>;
}

// ── Grille de parcours : UE × années ─────────────────────────────────────────
const KINDS_CELLULE = [
  // LES ÉTATS DE LUCIE (2.12.211) : bleu inscrite, vert réussie — la VA
  // aussi, avec sa mention —, ocre ajournée, brique refusée. Le violet ne dit
  // que la faveur.
  { val: 'inscrit', label: 'Inscrit',  short: '·',  cls: 'bg-[color-mix(in_srgb,var(--c-disponible)_11%,#fff)] border-[color-mix(in_srgb,var(--c-disponible)_32%,#fff)] text-iip-texte' },
  { val: 'reussi',  label: 'Réussi',   short: '✓',  cls: 'bg-white border-2 border-[color:var(--c-reussi)] text-[color:var(--c-texte)]' },   // VA : contour vert (7 octobre 2026)
  // LA FAVEUR DU CONSEIL (5 octobre 2026) : l'unité vaut 10, réussie ; violet
  // et cadeau, la seule couleur qui la dise.
  { val: 'faveur',  label: 'Réussi par faveur', short: '10', cls: 'bg-[color-mix(in_srgb,var(--c-faveur)_11%,#fff)] border-[color-mix(in_srgb,var(--c-faveur)_32%,#fff)] text-[color:var(--c-texte)]' },
  { val: 'va',      label: 'VA',       short: 'VA', cls: 'bg-[color-mix(in_srgb,var(--c-reussi)_11%,#fff)] border-[color-mix(in_srgb,var(--c-reussi)_32%,#fff)] text-[color:var(--c-texte)]' },
  // La circulaire distingue l'AJOURNEMENT, qui ouvre une seconde session sur
  // des acquis précis, du REFUS, qui ne l'ouvre pas. Les confondre sous un même
  // libellé privait le Conseil des études d'une de ses trois décisions.
  { val: 'ajourne', label: 'Ajourné',  short: 'Aj', cls: 'bg-[color-mix(in_srgb,var(--c-attente)_11%,#fff)] border-[color-mix(in_srgb,var(--c-attente)_32%,#fff)] text-[color:var(--c-texte)]' },
  { val: 'refuse',  label: 'Refusé',   short: '✕',  cls: 'bg-[color-mix(in_srgb,var(--c-refuse)_11%,#fff)] border-[color-mix(in_srgb,var(--c-refuse)_32%,#fff)] text-iip-texte' },
  { val: 'absent',  label: 'Absent',   short: '–',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
];

/* L'ANNÉE EST UNE DONNÉE, PAS UNE SUPPOSITION. La grille affichait
   « hors programme {annee} » en lisant une variable que personne ne lui
   passait : la ligne entière tombait en erreur dès qu'une unité de la section
   manquait au programme de l'année. */
function GrilleParcours({ etudId, peutEcrire, annee, ueFocus = null }) {
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
    const saisie = await saisir({ message:
      'Année à purger ?\nAnnées présentes : ' + annees.join(', '), valeur: annees[annees.length - 1] || '' });
    if (!saisie || !/^20\d{2}-20\d{2}$/.test(saisie.trim())) {
      if (saisie !== null) informer('Format attendu : 2025-2026');
      return;
    }
    const an = saisie.trim();
    // Deux portées, deux boutons qui les nomment ; la confirmation qui suit
    // protège d'un Échap ou d'un clic à côté.
    const tout = await demander({ titre: `Purge de ${an}`, ton: 'alerte',
      confirmer: 'Inscriptions et résultats', annuler: 'Résultats seulement',
      message: 'Que faut-il supprimer ? Les inscriptions ET les résultats, ou seulement les résultats en gardant les inscriptions.' });
    const portee = tout ? 'tout' : 'resultats';
    if (!(await demander(
      portee === 'tout'
        ? `Confirmer la suppression des inscriptions de ${an} et de tout ce qui s'y rattache ?`
        : `Confirmer l'effacement des résultats de ${an} ? Les inscriptions sont conservées.`))) return;

    const rep = await fetch(`/api/etudiants/${etudId}/annee/${an}?portee=${portee}`,
      { method: 'DELETE', headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { informer(j.error || 'Erreur'); return; }
    informer(`Purge de ${an} — ${j.avant} inscription(s) concernée(s)` +
      (portee === 'tout' ? `\n${j.inscriptions} supprimée(s), ${j.valorisations} valorisation(s)` : '\nrésultats effacés') +
      `\n${j.notes} note(s) d'acquis supprimée(s)`);
    await charger();
  }

  async function ecrire(kind, opts = {}) {
    if (!popover) return;
    // Une dérogation se motive, et le motif se trace (porte unique du PAE).
    let motif = opts.motif;
    if (kind === 'inscrit' && popover.verrou && !motif) {
      motif = await saisir('Motif de la dérogation — il sera tracé au dossier :');
      if (!motif?.trim()) return;
    }
    const rep = await fetch(`/api/etudiants/${etudId}/grille`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        annee: popover.annee, ue_num: popover.ue_num, kind,
        points: opts.points, motif: motif || undefined,
      }),
    });
    if (!rep.ok) {
      const j = await rep.json().catch(() => ({}));
      if (rep.status === 409 && j.motif_requis && !motif) {
        const m = await saisir(`${j.error}\n\nMotif (il sera tracé au dossier) :`);
        if (m?.trim()) return ecrire(kind, { ...opts, motif: m });
        return;
      }
      informer(j.error || 'Erreur'); return;
    }
    setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false);
    await charger();
  }

  async function simulerDeplacement(mouvements) {
    const rep = await fetch(`/api/etudiants/${etudId}/grille/deplacer`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ mouvements, simulation: true }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(j.error || 'Déplacement refusé.'); return; }
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
    if (mouvements.some(m => !m.vers)) { informer('Une des cases sortirait de la grille : révélez d’abord les années antérieures.'); return; }
    simulerDeplacement(mouvements);
  }

  return (
    <div>
      {/* RÉDUITE (Charles, 26 septembre 2026 : « faut réduire… on ne voit plus le
          schéma »). L'aide passe dans la bulle ; les deux outils deviennent de
          petits boutons dans le titre. */}
      <div className="mb-4">
      <div className="entete-plat">
        <span className="text-sm font-semibold text-iip-blue">Notes par année</span>
        <BulleAide titre="La grille des notes">
          Cliquez sur une case pour encoder.
          {peutEcrire && <> Glissez une case vers une autre année pour la déplacer ; Ctrl/⌘-clic en
          sélectionne plusieurs, qui se déplacent ensemble.</>} Une UE dont les prérequis ne sont pas acquis
          porte un cadenas : l'encoder demande une dérogation, tracée. « à confirmer » signale une UE
          probablement acquise d'après ses prérequis. Le point ● dit que des notes d'acquis sont encodées ;
          le liseré de gauche, le bloc de l'unité.
        </BulleAide>
        <div className="ml-auto flex gap-1">
          {nbHistorique > 0 && (
            <button onClick={() => setNbHistorique(0)} title="Masquer les années antérieures vides"
              className="px-2 py-0.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">» masquer</button>
          )}
          <button onClick={() => setNbHistorique(n => (n === 0 ? 5 : n + 3))}
            title="Afficher les années antérieures pour encoder l'historique"
            className="px-2 py-0.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
            « {nbHistorique === 0 ? 'années antérieures' : 'remonter encore'}
          </button>
          <button onClick={purgerAnnee} title="Effacer les résultats ou les inscriptions d'une année"
            className="px-2 py-0.5 text-xs border border-[color:var(--c-attente)] text-iip-texte rounded-md hover:bg-[#F7E9E5]">Purger…</button>
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
          <table className="w-full text-second border-collapse">
            <thead>
              {/* LES ANNÉES SUR LA LIGNE DES BLOCS DU SCHÉMA (« les dates sur la
                  même ligne ») : en-tête sans fond, de la hauteur des intitulés
                  BA1, BA2… posés en tête du schéma. */}
              <tr className="text-mention font-semibold text-slate-500">
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
                  <tr key={u.section + '-' + u.ue_num} data-ue={u.ue_num}
                    className={`border-t border-slate-100 ${ueFocus === u.ue_num ? 'ligne-visee' : ''}`}>
                    {/* Le BLOC se lit au liseré, la colonne « Niv. » disparaît. */}
                    <td className="px-2 py-0.5 sticky left-0 bg-white z-10 whitespace-nowrap max-w-[16rem] overflow-hidden text-ellipsis border-l-[3px]"
                      style={{ borderLeftColor: couleurBloc(u.ue_niv) || 'rgb(var(--gris-200))' }}
                      title={`UE ${u.ue_num} — ${u.ue_nom || ''}${u.ue_niv ? ' · ' + u.ue_niv : ''}`}>
                      <span className="font-semibold text-iip-blue">{u.ue_num}</span>
                      <span className="text-slate-600 ml-1.5 inline-block max-w-[13rem] truncate align-bottom">{u.ue_nom}</span>
                      {verrou && <span className="ml-1.5 text-xs"
                        title={'Exige : UE ' + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')}><IconLock size={13} stroke={1.8} className="inline -mt-0.5 text-slate-400" /></span>}
                      {u.suggeree && <span className="ml-1.5 text-mention px-1 py-0.5 rounded bg-violet-500 text-white border border-violet-500" title="Probablement acquise (inférence prérequis) — à confirmer">à confirmer</span>}
                      {u.hors_referentiel && (
                        <span className="ml-1.5 text-mention px-1 py-0.5 rounded bg-amber-500 text-white border border-amber-500"
                          title="Cette unité appartient à une autre section, ou sa section est inconnue">
                          autre section
                        </span>
                      )}
                      {u.hors_millesime && (
                        <span className="ml-1.5 text-mention px-1 py-0.5 rounded bg-slate-100 text-slate-500"
                          title="Unité de la section, absente du programme de l'année en cours">
                          hors programme {annee}
                        </span>
                      )}
                    </td>
                    {anneesAffichees.map((a, iCol) => {
                      const derniere = iCol === anneesAffichees.length - 1;
                      const cl = cell(a, u.ue_num);
                      const kind = cl && KINDS_CELLULE.find(k => k.val === (cl.faveur ? 'faveur' : cl.kind));
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
                            onClick={async ev => {
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
                              } else if (await demander(
                                  'UE verrouillée — exige la réussite de : UE '
                                  + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')
                                  + '.\n\nL\'exigence est transitive : une UE prérequise a elle-même ses prérequis.'
                                  + '\n\nEncoder quand même avec dérogation ?')) {
                                setPopover({ annee: a, ue_num: u.ue_num, verrou: true });
                              }
                            }}
                            className={`w-11 h-[22px] text-xs font-semibold tabular-nums rounded-md border px-0.5 transition
                              ${kind ? kind.cls : 'border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50'}
                              ${cl?.derogation ? 'ring-1 ring-amber-400' : ''}
                              ${choix.has(`${a}|${u.ue_num}`) ? 'ring-2 ring-[color:var(--c-disponible)] ring-offset-1' : ''}
                              ${peutEcrire && deplacable(cl) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            title={cl?.derogation ? 'Encodée avec dérogation' : ''}>
                            {kind
                              ? (kind.val === 'faveur' ? <span className="inline-flex items-center gap-0.5">10<IconeFaveur size={10} /></span>
                                 : kind.val === 'reussi' ? (cl.points != null ? String(Math.round(cl.points)) : '✓')
                                 : kind.val === 'va' ? (cl.points != null ? 'VA ' + cl.points : 'VA')
                                 : kind.short)
                              : '·'}
                            {aDetail(a, u.ue_num) && <span className="ml-0.5 align-super text-mention">●</span>}
                            {(() => {
                              if (!cl || cl.kind !== 'inscrit') return null;
                              const acquisSet = new Set(data.ues.filter(x => x.acquise).map(x => x.ue_num));
                              const nivMap = Object.fromEntries(data.ues.map(x => [x.ue_num, (x.ue_niv || '').toUpperCase()]));
                              const manquants = u.prerequis.filter(p => !acquisSet.has(p));
                              if (manquants.length && manquants.every(p => cell(a, p) && nivMap[p] === (u.ue_niv || '').toUpperCase()))
                                return <span className="ml-0.5 text-mention" title={'Sous réserve — réussite UE ' + manquants.join(', ') + ' requise en cours d\'année'}>⏳</span>;
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
              {raison && <span className="text-second text-slate-500 min-w-0 flex-1">{raison}</span>}
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
                <table className="w-full text-second">
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
                          <td className="px-2 py-1">{m.vers}{m.remplace && <span className="block text-xs text-slate-400">remplace une inscription vide</span>}</td>
                          <td className="px-2 py-1">{m.resultat || 'inscrit'}{m.points != null ? ` · ${m.points}/20` : ''}</td>
                          <td className="px-2 py-1 text-slate-600">
                            {suit.length ? suit.join(' · ') : '—'}
                            {m.seance_close && <span className="block text-xs text-iip-texte">délibération close en {m.de} : décision déjà notifiée</span>}
                            {m.stage_reste > 0 && <span className="block text-xs text-slate-400">le stage reste en {m.de}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <label className="block">
                <span className="text-second font-semibold text-iip-blue">Motif du déplacement</span>
                <textarea value={depl.motif} rows={2} autoFocus
                  onChange={ev => { const v = ev.target.value; setDepl(d => ({ ...d, motif: v })); }}
                  placeholder="ex. import de l’historique rangé dans la mauvaise année"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-xs text-slate-400">Il est conservé avec votre nom, l’heure, et chaque case déplacée.</span>
              </label>
              {depl.erreur && <Encadre etat="corriger">{depl.erreur}</Encadre>}
            </div>
          </Fenetre>
        );
      })()}

      {popover && (
        <Fenetre titre={`UE ${popover.ue_num} — ${popover.annee}`}
          large={detailOuvert ? 'moyenne' : 'petite'}
          onFermer={() => { setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false); }}>
          {/* DEUX FENÊTRES EN UNE : la largeur suit ce qu'on y fait — petite
              pour la poignée de boutons, moyenne pour la grille du détail. */}
            {popover.verrou && (
              <div className="text-xs text-white bg-amber-500 border border-amber-500 rounded-lg px-2 py-1 mb-2">
                Dérogation — sera tracée comme telle
              </div>
            )}
            {popover.sousReserve && (
              <div className="text-xs text-white bg-sky-500 border border-sky-500 rounded-lg px-2 py-1 mb-2">
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
                  className={`text-second px-2 py-1.5 rounded-lg border font-medium ${k.cls}`}>
                  {k.label}
                </button>
              ))}
              <button onClick={() => ecrire('effacer_resultat')}
                title="L'inscription demeure ; sa note et ses acquis sont effacés"
                className="text-second px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Effacer le résultat
              </button>
              <button onClick={async () => {
                  if (await demander("Supprimer l'inscription à cette UE pour cette année ?\nSes notes, valorisations et reports seront également supprimés."))
                    ecrire('effacer');
                }}
                title="Supprime l'inscription et tout ce qui s'y rattache"
                className="bloc-etat etat-corriger text-second px-2 py-1.5 text-red-600 hover:bg-red-50">
                Supprimer l'inscription
              </button>
            </div>

            <button onClick={() => detailOuvert ? setDetailOuvert(false) : chargerDetail()}
              className="mt-3 w-full text-second px-2 py-1.5 rounded-lg border border-iip-blue/30 text-iip-blue hover:bg-iip-blue/5">
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
                      <div className="text-second text-slate-500">
                        Aucun acquis coté, ou pondérations non encodées pour cette UE.
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="intertitre">
                            Note calculée
                          </div>
                          <div className="text-lg font-bold text-iip-blue leading-tight"
                            title={detail.calcul.sur20_exact != null ? `Valeur exacte : ${detail.calcul.sur20_exact}` : ''}>
                            {detail.calcul.sur20} / 20
                            <span className="text-second font-normal text-slate-500 ml-2">
                              {detail.calcul.pourcentage} %
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
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
                          className="flex-none text-second px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">
                          Reporter sur l’UE
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Reports de note proposés : cours validés dans une UE échouée */}
                {(detail.candidats_report || []).length > 0 && (
                  <div className="bloc-etat etat-disponible mb-3 px-3 py-2.5">
                    <div className="text-second font-semibold text-sky-900 mb-1.5">
                      Report de note possible
                    </div>
                    <div className="space-y-1">
                      {detail.candidats_report.map(cd => (
                        <div key={cd.cours_code} className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-sky-900 truncate" title={cd.cours_nom}>
                            <b>{cd.cours_code}</b> {cd.cours_nom}
                            <span className="text-sky-700"> — {cd.note_affichee}/20 en {cd.annee_origine}</span>
                          </div>
                          <button onClick={() => poserReport(cd)}
                            className="flex-none text-xs px-2 py-0.5 rounded-lg bg-sky-600 text-white font-semibold">
                            Reporter
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-mention text-sky-700 mt-1.5">
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
                                    border-slate-200 text-second">
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
                        <div className="flex-1 text-second text-slate-700 truncate" title={co.cours_nom}>
                          <b className="text-iip-blue">{co.cours_code}</b> {co.cours_nom}
                        </div>
                        <span className="text-mention text-slate-400 flex-none"
                          title={`${co.periodes} périodes`}>
                          {co.poids_cours_affiche != null ? co.poids_cours_affiche + ' %' : '— %'}
                        </span>
                        {!co.complet && (
                          <span className="text-mention px-1.5 py-0.5 rounded bg-amber-500 text-white border border-amber-500 flex-none"
                            title={`Somme des pondérations : ${co.somme_poids} au lieu de 100`}>
                            pondérations {co.somme_poids}
                          </span>
                        )}
                      </div>

                      {(detail.reports || []).some(r0 => r0.cours_code === co.cours_code) ? (
                        (() => {
                          const rn = detail.reports.find(r0 => r0.cours_code === co.cours_code);
                          return (
                            <div className="px-3 py-2 flex items-center gap-2 bg-sky-50/60 border-l-4 border-l-sky-500">
                              <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white flex-none">
                                RN
                              </span>
                              <div className="flex-1 text-second text-sky-900">
                                Note reportée : <b>{Math.round(rn.note)}/20</b>
                                {rn.annee_origine ? <span className="text-sky-700"> (validé en {rn.annee_origine})</span> : null}
                              </div>
                              <button onClick={() => retirerReport(co.cours_code)}
                                className="flex-none text-xs px-2 py-0.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-white">
                                Retirer
                              </button>
                            </div>
                          );
                        })()
                      ) : !co.aas.length ? (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          Aucun acquis d’apprentissage rattaché à ce cours.
                        </div>
                      ) : (
                        <div className="px-2 py-1 space-y-0.5">
                          {co.aas.map(aa => {
                            const cle = co.cours_code + '|' + aa.aa_code;
                            const n = detail.notes[cle] || {};
                            return (
                              <div key={cle} className="flex items-center gap-2 py-0.5">
                                <div className="flex-1 text-xs text-slate-600 truncate"
                                  title={aa.description || aa.aa_code}>
                                  <b className="text-slate-500">{aa.aa_code}</b> {aa.description || ''}
                                </div>
                                <span className="text-mention text-slate-400 flex-none w-9 text-right"
                                  title="Pondération dans ce cours">
                                  {aa.poids != null ? aa.poids + '%' : '—'}
                                </span>
                                {/* Les deux sessions, quand l'import les a
                                    apportées : on voit ce qui s'est joué en
                                    première et en seconde, pas seulement le
                                    résultat qui fait foi. */}
                                {(detail.sessions?.s1?.[cle] || detail.sessions?.s2?.[cle]) && (
                                  <span className="flex-none text-mention w-20 text-right">
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
                                  className="w-14 border border-slate-200 rounded-lg px-1.5 py-0.5 text-xs text-right disabled:bg-slate-100" />
                                <label className="flex items-center gap-1 text-mention text-slate-500 flex-none"
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
                    <div className="text-second text-slate-400 text-center py-2">
                      Aucun cours au référentiel pour cette UE.
                    </div>
                  )}
                </div>

                <p className="text-mention text-slate-400 mt-2">
                  Chaque acquis pèse par sa pondération dans son cours et par les périodes de ce
                  cours. Un acquis dispensé sort du calcul sans compter comme un zéro.
                </p>
              </div>
            )}
        </Fenetre>
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
  const droitsVA = useDroits();
  const peutInstruireVA = droitsVA.peut('valorisation.instruire') && droitsVA.ecrit('etudiants');
  const [seance, setSeance] = useState(false);
  // INTRODUIRE UNE DEMANDE, ici aussi (2 octobre 2026) : l'onglet ne décide
  // plus — il ouvre un dossier vide, qui suit le circuit.
  const [demande, setDemande] = useState(null);   // { ue_num, porte } | null
  const [demandeErr, setDemandeErr] = useState(null);
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
    if (!form && !demande) return;
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
  }, [!!form || !!demande, sectionVA, etudId, annee]);
  // Directeur, directeur adjoint et administrateur technique ont les mêmes
  // droits ici : comparer à la seule chaîne 'admin' en écartait la direction.
  // Renommer, supprimer, déposer une preuve : la route est admin/editeur, où le
  // secrétariat passe aussi (3.1.20).
  const [estAdmin] = useState(() => {
    try {
      return passeRole(['admin', 'editeur']) && ecritModule('etudiants');
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
    if (!rep.ok) { informer(j.error || 'Erreur'); return; }

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
        informer(`Note du cours ${cours_code} non enregistrée : ${e.error || 'erreur'}`);
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
      informer(e.error || "La pièce n'a pas pu être déposée.");
      return;
    }
    await charger();
  }

  async function telecharger(f) {
    const { 'Content-Type': _ignore, ...entetes } = authHeaders();
    const rep = await fetch(`/api/etudiants/valorisations/fichiers/${f.id}`,
      { headers: entetes });
    if (!rep.ok) { informer('Pièce introuvable.'); return; }
    const url = URL.createObjectURL(await rep.blob());
    const a = document.createElement('a');
    a.href = url; a.download = f.nom; a.click();
    URL.revokeObjectURL(url);
  }

  async function renommer(f) {
    const nom = await saisir({ message: 'Nom de la pièce :', valeur: f.nom });
    if (!nom || nom === f.nom) return;
    await fetch(`/api/etudiants/valorisations/fichiers/${f.id}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ nom }) });
    await charger();
  }

  async function supprimerPiece(fid) {
    if (!(await demander('Supprimer cette pièce ?'))) return;
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
    if (!(await demander('Supprimer cette valorisation ?'))) return;
    await fetch(`/api/etudiants/valorisations/${vid}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  if (!valos) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-second text-slate-500">
          Valorisation des acquis — AGCF du 13-12-2024 · décisions du Conseil des études
        </p>
        <span className="ml-auto" />
        {(valos || []).some(v => v.valide_le && v.annee_scolaire === annee) && passeRole(['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat']) && (
          <span className="mr-2"><NotificationVA etudId={etudId} annee={annee} onFait={charger} /></span>)}
        {peutInstruireVA && <>
        <button onClick={() => setSeance(true)}
          className="bouton bouton-fort mr-2 inline-flex items-center gap-1.5"
          title="Instruire, décider et valider toutes les UE de cet étudiant — la même fenêtre que l'écran Valorisation">
          <IconCertificate size={14} /> Délibérer cet étudiant
        </button>
        {/* L'ONGLET NE DÉCIDE PLUS (Charles, 2 octobre 2026) : il montre, il
            introduit une demande, et il ouvre la séance. L'ancien formulaire
            écrivait une décision à côté du circuit. */}
        <button onClick={() => { setDemande({ ue_num: '', porte: 'va' }); setDemandeErr(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg">
          <IconPlus size={14} /> Introduire une demande
        </button>
        </>}
      </div>

      {demande && (
        <div className="border border-slate-200 rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2 text-sm">
          <select value={demande.ue_num} onChange={e => setDemande(x => ({ ...x, ue_num: e.target.value }))}
            className="controle text-sm max-w-[26rem]">
            <option value="">{unites ? '— l’unité demandée —' : 'Chargement…'}</option>
            {(unites?.unites || []).map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>)}
          </select>
          <div className="segments">
            {[['va', 'VA — acquis formels'], ['vae', 'VAE — expérience']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setDemande(x => ({ ...x, porte: v }))}
                className={`px-2.5 py-1 text-second ${demande.porte === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
          <button className="bouton bouton-fort disabled:opacity-40" disabled={!demande.ue_num}
            onClick={async () => {
              setDemandeErr(null);
              const r = await fetch('/api/etudiants/valorisations/matrice', { method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ annee, cellules: [{ etudiant_id: etudId, ue_num: Number(demande.ue_num), porte: demande.porte }] }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok) { setDemandeErr(j.error || 'Refusé.'); return; }
              setDemande(null); await charger();
            }}>Introduire</button>
          <button className="bouton" onClick={() => setDemande(null)}>Annuler</button>
          <span className="text-second text-slate-500 basis-full">La demande s'instruit ensuite dans la séance : dates, recevabilité, avis, décision.</span>
          {demandeErr && <span className="text-second basis-full" style={{ color: 'var(--c-refuse, #9D4A38)' }}>{demandeErr}</span>}
        </div>
      )}

      {seance && (
        <Suspense fallback={null}>
          <DeliberationVA mode="etudiant" annee={annee} etudInitial={etudId}
            onClose={() => { setSeance(false); charger && charger(); }} onChange={() => charger && charger()} />
        </Suspense>
      )}

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3 mb-4">

          {/* ACCORDÉE OU REFUSÉE — C'EST LA PREMIÈRE QUESTION.
              La table ne connaissait que des dispenses accordées : une demande
              refusée n'avait nulle part où s'écrire, donc elle ne s'écrivait
              pas — et une demande dont rien ne garde trace se réintroduit
              l'année suivante, sans qu'on sache qu'elle a déjà été examinée. */}
          <div className="flex items-center gap-4 text-sm">
            <span className="intertitre">
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
              <span className="ml-auto text-xs text-slate-400">
                Correction d'une valorisation déjà encodée — les preuves déposées sont conservées.
              </span>
            )}
          </div>

          {form.decision === 'refusee' ? (
            <>
              <label className="block text-xs">
                <span className="intertitre block mb-1">
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
                <span className="intertitre block mb-1">
                  Motif du refus <span className="text-iip-texte">— obligatoire</span>
                </span>
                <textarea rows={3} value={form.motif_refus || ''}
                  placeholder="Ce que le Conseil a constaté : pièces insuffisantes, acquis non démontrés, formation sans rapport…"
                  className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-sm"
                  onChange={e => setForm(f => ({ ...f, motif_refus: e.target.value }))} />
              </label>
            </>
          ) : (
          <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs col-span-2"><span className="intertitre block mb-1">Type</span>
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
            <label className="text-xs"><span className="intertitre block mb-1">Section</span>
              <select value={sectionVA} onChange={e => setSectionVA(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Toutes</option>
                {(unites?.sections || []).map(sx => (
                  <option key={sx.code} value={sx.code}>{sx.libelle || sx.code}</option>
                ))}
              </select></label>
            <label className="text-xs col-span-2"><span className="intertitre block mb-1">Unité d'enseignement</span>
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
              <span className="block text-mention text-slate-400 mt-1">
                ★ déjà au programme de l'étudiant en {annee}
              </span></label>
            {form.type !== 'admission' && (
              <label className="text-xs"><span className="intertitre block mb-1">%</span>
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
                <label className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
                  Seuil de report
                  <input type="number" min="0" max="20" step="0.5" value={seuilReport}
                    onChange={e => setSeuilReport(Number(e.target.value))}
                    className="w-14 border border-slate-300 rounded px-1.5 py-0.5 text-xs" />
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
                <div className="py-4 text-center text-sm text-slate-400
                                border-2 border-dashed rounded-xl">
                  Choisissez d'abord l'unité d'enseignement.
                </div>
              ) : !composantes ? (
                <div className="py-4 text-center text-sm text-slate-400
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
                    <div className="py-4 text-center text-sm text-amber-700
                                    border-2 border-dashed border-amber-300 rounded-xl">
                      Cette unité ne porte aucun {form.cible === 'cours' ? 'cours'
                        : "acquis d'apprentissage"} au référentiel {annee}.
                    </div>
                  );
                }

                return (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="intertitre px-3 py-1.5 bg-slate-50 border-b border-slate-200">
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
                          className={`px-3 py-1.5 text-second
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
                          <span className="w-20 flex-none font-mono text-xs text-slate-500">
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
                              className={`text-xs flex-none w-24 text-right
                                ${co.deja_reporte ? 'text-slate-300'
                                  : co.note_anterieure >= seuilReport
                                    ? 'text-emerald-700 font-semibold hover:underline'
                                    : 'text-slate-400 hover:underline'}`}>
                              {co.note_anterieure}/20 <span className="text-slate-400">
                                {String(co.annee_anterieure || '').slice(2, 7)}
                              </span>{co.deja_reporte ? ' ✓' : ''}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300 flex-none
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
                                          text-second text-right ${sousSeuil
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
                                       rounded-lg px-2 py-1 text-second" />
                        )}
                        </div>
                      );
                    })}
                  </div>

                  {Object.keys(form.notes || {}).length > 0 && (
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200
                                    text-xs text-slate-600">
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
                <span className="intertitre">
                  Acquis d'apprentissage reconnus équivalents
                </span>
                <span className="text-xs text-slate-500">
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
                        <span className="text-second flex-1 min-w-0">
                          <span className="font-mono text-xs text-slate-500 mr-1.5">
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
                                     rounded-lg px-2 py-1 text-second" />
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
            <label className="text-xs"><span className="intertitre block mb-1">Date décision CE</span>
              <input type="date" value={form.decision_ce_date || ''}
                onChange={e => setForm(f => ({ ...f, decision_ce_date: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="intertitre block mb-1">Commentaire</span>
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
              <div className="text-second text-amber-800">{manque}</div>
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
                <span className="text-slate-600 ml-1.5 text-sm">{v.ue_nom}</span>
                {v.decision === 'refusee' && (
                  <span className="ml-2 text-xs font-semibold text-iip-texte">refusée</span>
                )}
                <div className="text-xs text-slate-400 mt-0.5">
                  {v.decision === 'refusee' ? 'Demande refusée' : (
                    <>
                      {TYPES_VA.find(t => t.val === v.type)?.label}
                      {v.cible ? ` · ${v.cible === 'cours' ? 'cours' : 'AA'} : ${v.cible_detail}` : ''}
                      {v.pourcentage != null && v.decision !== 'refusee' ? ` · ${Number(v.pourcentage) > 20 ? Math.round(v.pourcentage / 5) : v.pourcentage}/20` : ''}
                    </>
                  )}
                  {v.decision_ce_date ? ` · CE du ${v.decision_ce_date}` : ''}
                </div>
                {v.decision === 'refusee' && v.motif_refus && (
                  <div className="text-second text-slate-600 mt-0.5">{v.motif_refus}</div>
                )}

                {/* LES PREUVES. Une valorisation se décide sur pièces — un
                    diplôme, une attestation, un dossier pédagogique. Elles
                    vivaient dans une armoire ou une boîte courriel : deux ans
                    plus tard, la décision ne s'appuyait plus sur rien. */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(v.fichiers || []).map(f => (
                    <span key={f.id}
                      className="inline-flex items-center gap-1 text-xs border
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
                  {estAdmin && <select value={nature} onChange={e => setNature(e.target.value)}
                    title="Nature de la pièce — elle donne son nom au fichier"
                    className="text-xs border border-slate-300 rounded-lg px-1.5 py-0.5">
                    {natures.map(n => <option key={n.cle} value={n.cle}>{n.label}</option>)}
                  </select>}
                  {estAdmin && <label className="inline-flex items-center gap-1 text-xs text-slate-500
                                    border border-dashed border-slate-300 rounded-lg px-2 py-0.5
                                    cursor-pointer hover:border-iip-blue hover:text-iip-blue">
                    <IconUpload size={12} /> Déposer une preuve
                    <input type="file" className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.tif,.tiff,.doc,.docx,.odt,.xls,.xlsx,.ods,.txt,.eml"
                      onChange={e => { deposer(v.id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-none">
                {/* UNE ICÔNE SE MÉRITE. Celle-ci ouvrait une fenêtre entière et
                    produisait des pièces officielles : au bout d'une ligne, à
                    côté d'une corbeille, personne ne la trouvait. Un libellé. */}
                {/* « Modifier » est retiré : une décision se corrige dans la séance,
                    qui garde le circuit et le journal. */}
                <OuvrirEditions taille="petit" ongletInitial="etudiants" familleInitiale="valorisation"
                  perimetre={{ valorisation: { annee: v.annee_scolaire, ue_num: v.ue_num, ue_nom: v.ue_nom } }}
                  titre="Procès-verbal et attestations de l'unité — centre d'édition" />
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

      <p className="text-xs text-slate-400 mt-3">
        Dispense complète : l'UE est acquise, l'apprenant n'est pas comptabilisé comme régulier pour cette UE (art. 4).
        Dispense partielle : dispense d'activités d'enseignement, l'apprenant reste comptabilisé (art. 3).
        Interdite pour les épreuves intégrées.
      </p>
    </div>
  );
}

function DossierApprenant({ etudId }) {
  const [pieces, setPieces] = useState(null);
  const droitsDossier = useDroits();
  const peutPieces = droitsDossier.passe('admin', 'editeur') && droitsDossier.ecrit('etudiants');

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
      <p className="text-second text-slate-500 mb-3">
        Dossier individuel de l'apprenant — {recues}/{pieces.length} pièces traitées
        <span className="text-slate-400"> · circulaire n° 9764 du 13/07/2026</span>
      </p>
      <div className="space-y-2">
        {pieces.map(p => (
          <div key={p.type} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="text-sm text-slate-700">{p.libelle}</div>
            <div className="flex gap-1 flex-none">
              {STATUTS_PIECE.filter(s => peutPieces || p.statut === s.val).map(s => (
                <button key={s.val} disabled={!peutPieces} onClick={() => setStatut(p.type, s.val)}
                  className={`text-xs px-2 py-1 rounded-lg border transition ${
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
/**
 * LE SCHÉMA SE RETOURNE, ET LES NOTES SONT AU DOS (Charles, 26 septembre 2026 :
 * « le tiroir n'est pas une bonne idée ; comme les notes sont sur le schéma,
 * cliquer une tuile fait se retourner le schéma pour faire apparaître les
 * points »). Le tiroir couvrait le schéma qu'on regardait ; une carte
 * retournée dit qu'il s'agit du MÊME objet, vu de l'autre côté. La ligne de
 * l'UE cliquée est mise en évidence au verso, et amenée sous les yeux.
 *
 * Le retournement se fait en deux quarts de tour : la face s'efface sur la
 * tranche, l'autre en sort. Deux faces empilées en 3D prendraient la hauteur
 * de la plus haute — le schéma se retrouverait posé sur un grand vide.
 */
function SchemaRetournable({ recto, verso }) {
  const [face, setFace] = useState('recto');       // recto | verso
  const [angle, setAngle] = useState(0);           // 0 | 90 | -90
  const [anime, setAnime] = useState(true);
  const [ue, setUe] = useState(null);
  const zone = useRef(null);
  const retourner = (vers, ueVisee = null) => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setUe(ueVisee); setFace(vers); return;
    }
    setAnime(true); setAngle(90);
    setTimeout(() => {
      setUe(ueVisee); setFace(vers);
      setAnime(false); setAngle(-90);
      requestAnimationFrame(() => requestAnimationFrame(() => { setAnime(true); setAngle(0); }));
    }, 180);
  };
  useEffect(() => {
    if (face !== 'verso' || ue == null) return;
    const t = setTimeout(() => {
      zone.current?.querySelector(`[data-ue="${ue}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 400);
    return () => clearTimeout(t);
  }, [face, ue]);
  return (
    <div className="pt-3 [perspective:1600px]">
      <div ref={zone} style={{ transform: `rotateY(${angle}deg)`, transition: anime ? 'transform 180ms cubic-bezier(.4,0,.2,1)' : 'none' }}>
        {face === 'recto'
          ? recto(n => retourner('verso', n))
          : (
            <div>
              <div className="entete-plat">
                <span className="flex-1 text-sm font-semibold text-iip-blue">
                  Notes par année
                  {ue != null && <span className="ml-2 font-normal text-slate-500">· UE {ue}</span>}
                </span>
                <button type="button" onClick={() => retourner('recto')}
                  className="bouton bouton-compact inline-flex items-center gap-1">
                  <IconChevronLeft size={13} /> Retourner au schéma
                </button>
              </div>
              {verso(ue)}
            </div>
          )}
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
      <span className="text-second text-slate-600 tabular-nums min-w-[4.5rem] text-center">{n ? `${i} / ${n}` : '—'}</span>
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
  const champ = 'controle w-full border border-slate-300 rounded-champ bg-white text-second';
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert(o => !o)}
        title="Les dossiers que les flèches parcourent"
        className={`bouton bouton-compact inline-flex items-center gap-1 ${actifs ? 'border-[color:var(--c-principal)] text-iip-blue' : ''}`}>
        Parcourir{actifs ? ` · ${actifs}` : ''} <IconChevronRight size={12} className={`transition ${ouvert ? 'rotate-90' : ''}`} />
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-white border border-slate-200 rounded-carte shadow-flottant p-3 space-y-2"
          onMouseLeave={() => setOuvert(false)}>
          <div className="text-xs text-slate-500">Les flèches ‹ › passent d'un dossier à l'autre parmi :</div>
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

export function FicheEtudiant({ id, annee, onClose, position, onPrec, onSuiv,
                         portee, onPortee, sections, ues, annees, onModifie, ongletInitial = 'parcours' }) {
  const [annexe2, setAnnexe2] = useState(false);
  const [annexe1, setAnnexe1] = useState(false);
  const [motivation, setMotivation] = useState(false);
  const [edition, setEdition] = useState(false);   // le centre d'édition, sur cet étudiant
  const [data, setData] = useState(null);
  const [pae, setPae] = useState(null);
  // « grille » n'existe plus depuis la fusion avec le PAE : la fiche s'ouvrait
  // sur un onglet sans contenu, et paraissait vide jusqu'à ce qu'on clique.
  const [onglet, setOnglet] = useState(ongletInitial);
  const [ficheInscription, setFicheInscription] = useState(null);
  const [selection, setSelection] = useState(null);      // Set des ue_num retenues
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [paeConfirme, setPaeConfirme] = useState(false);
  const [paeValide, setPaeValide] = useState(null);   // la validation de la revue des PAE
  const [revueFiche, setRevueFiche] = useState(false);
  const [noeudOutils, setNoeudOutils] = useState(null);
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
    if (!(await demander('Inscrire automatiquement cet étudiant à toutes les UE accessibles en ' + annee + ' (y compris les inscriptions sous réserve) ?'))) return;
    const rep = await fetch(`/api/etudiants/${id}/pae-auto`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { informer(j.error || 'Erreur'); return; }
    const nbSR = Object.keys(j.sous_reserve || {}).length;
    informer(`${j.creees} inscription(s) créée(s) — ${j.inscrites.length} UE au PAE ${annee}` +
      (nbSR ? `\ndont ${nbSR} sous réserve : UE ${Object.keys(j.sous_reserve).join(', ')}` : ''));
    await chargerPAE(); await charger();
  }

  async function basculerUE(u) {
    // Les confirmations s'attendent : elles ne peuvent plus vivre dans la
    // fonction de mise à jour de l'état, qui doit rester synchrone.
    if (selection?.has(u.ue_num)) {
      setSelection(prev => { const s = new Set(prev); s.delete(u.ue_num); return s; });
      return;
    }
    // Ajout d'une UE hors proposition dont les prérequis ne sont pas acquis
    // Une unité d'un bloc que l'étudiant n'a pas encore atteint (27 septembre
    // 2026 : « pas possible, tu donnes accès à une UE de B2 »).
    if (u.hors_bloc && !(await demander(`L'UE ${u.ue_num} est une unité de ${u.ue_niv || 'bloc supérieur'} : `
      + `l'étudiant n'a pas encore acquis la part requise du BA${u.plafond_bloc} (Configuration → Paramètres, « pae_seuil_bloc »).\n\n`
      + `L'ajouter quand même ? Ce choix sera tracé.`))) return;
    if (!u.hors_bloc && !u.propose && !u.accessible && !u.reinscriptible_ce) {
      const chaine = u.prereq_chaine?.length ? u.prereq_chaine : (u.prereq_manquants || []);
      const msg = chaine.length
        ? `Cette UE exige la réussite de : UE ${chaine.join(', ')}.\n\n`
          + `L'exigence est transitive — une UE prérequise a elle-même ses propres prérequis.\n\n`
          + `Ajouter quand même ? La dérogation sera tracée.`
        : 'Ajouter cette UE au PAE ?';
      if (!(await demander(msg))) return;
    }
    setSelection(prev => { const s = new Set(prev); s.add(u.ue_num); return s; });
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
        if (!rep.ok) { informer('Le retrait a échoué.'); return; }
        setPaeConfirme(false);
        return;
      }
      /* ON CONFIRME CE QUE L'ÉCRAN MONTRE. La liste partait de `u.inscrit ||
         u.propose` — le champ s'appelle `inscrite` : c'était donc la
         proposition brute qui s'inscrivait, quoi qu'on ait coché ou décoché.
         La confirmation n'ajoute que ; une inscription décochée doit d'abord
         être retirée en enregistrant le PAE. */
      const ues = [...(selection || [])];
      const decochees = (pae?.pae || []).filter(u => u.inscrite && !(selection || new Set()).has(u.ue_num));
      if (decochees.length) {
        informer(`${decochees.length} inscription(s) décochée(s) (UE ${decochees.map(u => u.ue_num).join(', ')}) : `
          + `enregistrez d'abord le PAE pour les retirer, puis confirmez.`);
        return;
      }
      let rep = await fetch(`/api/etudiants/${id}/pae/confirmer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ues }),
      });
      let j = await rep.json();
      if (rep.status === 409 && j.refus?.length) {
        const motifs = await demanderMotifs(j.refus);
        if (!motifs) return;
        rep = await fetch(`/api/etudiants/${id}/pae/confirmer`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ annee, ues, motifs }),
        });
        j = await rep.json();
      }
      if (!rep.ok) { informer(j.error || 'La confirmation a échoué.'); return; }
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
      // Le serveur juge chaque ajout (porte unique) ; s'il en refuse, on
      // demande un motif — il sera tracé sur chacune des unités nommées.
      let motifs = {};
      let rep = await fetch(`/api/etudiants/${id}/pae-valider`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums }),
      });
      let j = await rep.json();
      if (rep.status === 409 && j.refus?.length) {
        motifs = await demanderMotifs(j.refus);
        if (!motifs) return;
        rep = await fetch(`/api/etudiants/${id}/pae-valider`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ annee, ue_nums, motifs }),
        });
        j = await rep.json();
      }
      if (!rep.ok) { informer(j.error || 'Erreur'); return; }

      // Les inscriptions portant un résultat ne sont jamais retirées d'office
      if (j.conservees) {
        const forcer = await demander(
          `${j.conservees} inscription(s) décochée(s) portent un résultat encodé et ont été conservées.\n\n` +
          `Les supprimer quand même, avec leurs notes ?`);
        if (forcer) {
          const rep2 = await fetch(`/api/etudiants/${id}/pae-valider`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ annee, ue_nums, motifs, forcer: true }),
          });
          const j2 = await rep2.json();
          if (rep2.ok) {
            informer(`PAE enregistré — ${j2.total} UE inscrites\n${j2.retirees} retirée(s)`);
            await chargerPAE(); await charger();
            return;
          }
        }
      }

      informer(`PAE enregistré — ${j.total} UE inscrites` +
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
    else informer(j.error || 'Erreur');
  }

  // Les frais de scolarité relèvent de l'établissement, non de la Fédération :
  // ils font l'objet d'un document distinct de la fiche d'inscription.
  async function ouvrirFraisScolarite() {
    const rep = await fetch(`/api/frais-scolarite/etudiant/${id}/document?annee=${annee}`,
      { headers: authHeaders() });
    if (!rep.ok) {
      const j = await rep.json().catch(() => ({}));
      informer(j.error || 'Erreur à la génération du document.');
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
    if (!rep.ok) { informer(j.error || 'Document indisponible.'); return; }
    setFicheInscription({ html: j.html, titre: 'Parcours de formation', nom: j.nom });
  }

  /* UN PDF PAR ATTESTATION, dans une archive (29 septembre 2026) : chaque
     attestation est une pièce distincte, remise séparément. */
  async function telechargerAttestationsPdf() {
    const rep = await fetch(`/api/attestations/etudiant/${id}/pdfs?annee=toutes`, { headers: authHeaders() });
    if (!rep.ok) { const j = await rep.json().catch(() => ({})); informer(j.error || 'Les PDF n\u2019ont pas pu être produits.'); return; }
    const nom = (rep.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'attestations.zip';
    const url = URL.createObjectURL(await rep.blob());
    const a = document.createElement('a'); a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function ouvrirAttestations(toutes = false) {
    const quand = toutes === true ? 'toutes' : annee;
    const rep = await fetch(`/api/attestations/etudiant/${id}/document?annee=${quand}`,
      { headers: authHeaders() });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(j.error || 'Erreur à la génération.'); return; }
    if (j.manques?.length) {
      informer(
        `${j.unites} attestation(s) produite(s), mais des mentions obligatoires manquent :\n\n`
        + j.manques.map(m => `UE ${m.ue_num}${m.annee && toutes === true ? ` (${m.annee})` : ''} — ${m.manques.join(', ')}`).join('\n')
        + `\n\nCes mentions se complètent dans le référentiel des UE.`);
    }
    setFicheInscription({ html: j.html, nom: j.nom,
      titre: toutes === true ? `Attestations de réussite — toutes les années (${(j.annees || []).join(', ')})` : `Attestations de réussite — ${annee}` });
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
      fetch(`/api/etudiants/${id}/revue-pae/revu?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null)).then(x => setPaeValide(x?.revu || null)).catch(() => setPaeValide(null));
      if (rep.ok) {
        setPae(j);
        // L'état vient du serveur : sans cela le bouton repartirait à zéro à
        // chaque rechargement de la fiche.
        setPaeConfirme(!!j.pae_confirme);
        // Une inscription existante n'est reconduite que si elle TIENT :
        // ni déjà acquise, ni bloquée par des prérequis manquants. Sans quoi
        // un programme calculé par erreur se perpétuerait d'année en année.
        /* UN PAE CONFIRMÉ SE MONTRE TEL QU'IL EST INSCRIT (Charles, 28 septembre
           2026 : « les tuiles ne correspondent pas aux inscriptions »). La
           sélection repartait de la PROPOSITION à chaque ouverture : le schéma
           peignait en bleu ce que Lucie proposerait aujourd'hui, pas ce qui a
           été confirmé. Non confirmé, il reste une proposition — et l'écart
           avec ce qui est enregistré est nommé au-dessus de la liste. */
        const inscritesAn = j.pae.filter(u => u.inscrite).map(u => u.ue_num);
        setSelection(new Set(j.pae_confirme && inscritesAn.length ? inscritesAn : j.pae.filter(u =>
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
      sous={[data.email_ecole || 'sans adresse d’école', data.id_ecampus || (data.matricule_helb ? `HELB ${data.matricule_helb}` : 'sans matricule')].join(' · ')
            + (data.niveau?.libelle ? ' · ' + data.niveau.libelle : '')}
      large="ecran" onFermer={onClose}>
      <div className="-mx-5 -my-4">


        {/* Onglets — et, au bout de la rangée, IMPRIMER OU ENVOYER (Charles, 26
            septembre 2026 : « supprimer Documents et mettre le lien vers le
            centre d'édition », « dans la rangée d'onglets »). Visible quel que
            soit l'onglet : les pièces d'un étudiant ne dépendent pas de la face
            qu'on regarde. */}
        <OutilsFiche.Provider value={noeudOutils}>
        <div className="flex flex-wrap items-center border-b border-slate-200 px-5">
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
            ['cep', 'Congé-éducation'],
            // L'ONGLET SLE N'EXISTE QUE POUR UN ÉTUDIANT EN SÉJOUR LIMITÉ AUX
            // ÉTUDES (5 octobre 2026) : les données des annexes 1 et 2.
            ...(data.sejour_limite_etudes ? [['sle', 'SLE']] : []),
            ['suivi', 'Suivi'],
            ['dossier', 'Dossier']].map(([k, l]) => (
            <button key={k}
            onClick={() => { setOnglet(k); if (k === 'parcours' && !pae) chargerPAE(); }}
              className={`onglet-page ${onglet === k ? 'onglet-page-actif' : ''}`}>
              {l}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 my-1">
          {/* Les outils de l'onglet ouvert (Changer de section…). */}
          <span ref={setNoeudOutils} className="flex items-center gap-2" />
          {/* L'ŒIL : parcourir et valider le PAE de cet étudiant, la même
              fenêtre que la Revue des PAE. */}
          <button type="button" onClick={() => setRevueFiche(true)}
            title="Parcourir et valider le PAE — la revue, sur cet étudiant"
            className="w-8 h-8 flex-none grid place-items-center rounded-champ border border-slate-300 bg-white text-iip-blue hover:bg-slate-50">
            <IconEyeCheck size={20} />
          </button>
          {(onPrec || onSuiv) && portee && (
            <MenuParcourir portee={portee} onPortee={onPortee} sections={sections} ues={ues} annees={annees} />
          )}
          {/* L'AVION, ET RIEN D'AUTRE (2 octobre 2026) : il ouvre le centre
              d'édition sur cet étudiant. */}
          <BoutonEditions onClick={() => setEdition(true)} taille="moyen"
            titre="Imprimer ou envoyer — le centre d'édition, sur cet étudiant" />
          </div>
        </div>
        {revueFiche && (
          <RevuePAE liste={[{ id, nom: data?.nom, prenom: data?.prenom, section: data?.section_rattachement || null, niveau: null }]}
            annee={annee} onClose={() => { setRevueFiche(false); chargerPAE(); charger && charger(); }} />
        )}
        {edition && (
          <CentreImpressionCentral onClose={() => setEdition(false)}
            etudiant={{ id, nom: data?.nom, prenom: data?.prenom, id_ecampus: data?.id_ecampus, section_rattachement: data?.section_rattachement || null }}
            anneeEtudiant={annee} />
        )}

        {/* Les ACTIONS du programme, ancrées sous les onglets. Placées dans
            le contenu, elles ne pouvaient pas rester visibles : le défilement
            est porté par la fenêtre entière, non par l'onglet. */}
              {/* La barre « Ouvrir dans la revue des PAE » est retirée : la ligne
                  d'état du parcours y mène, et la fiche ne compose plus le PAE. */}

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
                    <h3 className="titre-carte">
                      Frais de scolarité
                    </h3>
                    <p className="text-second text-slate-500">
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
                <p className="text-second text-slate-500 mt-1">
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

          {annexe1 && (
            <Annexe1 etudId={id} annee={annee} onClose={() => setAnnexe1(false)} />
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

          {onglet === 'cep' && (
            <div className="p-5">
              <OngletCep etudId={id} annee={annee} />
            </div>
          )}
          {onglet === 'sle' && data.sejour_limite_etudes ? (
            <div className="p-5">
              <OngletSLE etudId={id} annee={annee} />
            </div>
          ) : null}

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
              <SchemaRetournable
                recto={onNoeud => <SchemaCapitalisation etudId={id} annee={annee} onNoeud={onNoeud} programme={selection}
                  onModifie={async () => { await chargerPAE(); await charger(); onModifie && onModifie(); }} />}
                verso={ue => <GrilleParcours etudId={id} peutEcrire={passeRole(['admin', 'editeur']) && ecritModule('etudiants')} annee={annee} ueFocus={ue} />} />

              {/* LA FICHE EST LA VUE DU PARCOURS ET DES NOTES (Charles, 2 octobre
                  2026) : le PAE se travaille dans la revue. Il se résume ici en
                  une ligne, et le programme détaillé se déplie au besoin. */}
              <div className="border-t border-slate-200 mt-4 pt-3 flex flex-wrap items-center gap-2 text-sm">
                <b>PAE {annee}</b>
                {paeValide
                  ? <span className="text-xs font-semibold text-white rounded-full px-2 py-px" style={{ background: 'var(--c-reussi, #3E7D5E)' }}>
                      validé le {quandLocal(paeValide.revu_le)} par {paeValide.revu_par || '—'}</span>
                  : <span className="text-xs font-semibold text-white rounded-full px-2 py-px bg-slate-400">pas encore validé</span>}
                <span className="text-second text-slate-500">{paeConfirme ? 'programme confirmé' : 'programme proposé'}</span>
                <button type="button" className="text-second underline text-iip-blue" onClick={() => setRevueFiche(true)}>ouvrir la revue</button>
              </div>

              {/* LE PROGRAMME NE SE MONTRE PLUS DANS LA FICHE (Charles, 2 octobre
                  2026 : « tout se change dans l'œil ») : il reste monté pour la
                  ligne d'état ci-dessus, et caché. */}
              <div className="hidden">
              {/* Ce qui suit est une PROPOSITION tant qu'elle n'est pas
                  confirmée : le dire évite de la lire comme un état de fait,
                  maintenant que schéma et programme sont sur la même page. */}
              {paeValide && (
                <div className="mb-2 px-3 py-2 rounded-lg text-sm bg-emerald-700 text-white">
                  <b>Ce PAE a été validé</b> le {quandLocal(paeValide.revu_le)} par {paeValide.revu_par || '—'} — revue des PAE.
                </div>
              )}
              <div className={`mb-3 px-3 py-2 rounded-lg text-sm border ${
                paeConfirme
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-amber-500 border-amber-500 text-white'}`}>
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
                <div className="text-center py-8 text-white text-sm border border-red-500 bg-red-500 rounded-xl">{pae.erreur}</div>
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
                    ? <span className="text-xs text-amber-700 flex items-center gap-1"><IconAlertTriangle size={12} />
                        {u.va_complete ? 'Dispensée (VA complète)' : 'Réinscription — décision du Conseil des études'}</span>
                    : u.hors_bloc
                      ? <span className="text-xs text-slate-500 flex items-center gap-1"
                          title="Unité d'un bloc qui ne s'ouvre pas encore : le bloc précédent n'est pas acquis à la part requise des ECTS. Elle ne se propose pas, et l'ajouter demande confirmation">
                          {u.ue_niv || 'Bloc supérieur'} — le BA{u.plafond_bloc} n'est pas encore assez acquis</span>
                    : u.accessible
                      ? <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><IconCheck size={12} /> Accessible</span>
                      : u.sous_reserve || u.propose_sous_reserve
                        ? <span className="text-xs text-sky-700 flex items-center gap-1"><IconClock size={12} /> Sous réserve — réussite UE {(u.prereq_manquants || []).join(', ')}</span>
                        : u.avertissements?.length
                          ? <span className="text-xs text-amber-700 flex items-center gap-1"
                              title={u.avertissements.map(a => `UE ${a.ue_num}${a.motif ? ' — ' + a.motif : ''}`).join('\n')}>
                              <IconAlertTriangle size={12} />
                              Recommandé après {u.avertissements.map(a => a.ue_num).join(', ')}
                            </span>
                        : u.epreuve_integree
                          ? <span className="text-xs text-red-600 flex items-center gap-1"
                              title={'Restent à acquérir : UE ' + (u.epreuve_restantes || []).join(', ')}>
                              <IconAlertTriangle size={12} /> Épreuve intégrée — {(u.epreuve_restantes || []).length} UE des années antérieures non acquise(s)
                            </span>
                          : <span className="text-xs text-red-600 flex items-center gap-1"
                              title={u.prereq_chaine?.length ? 'Chaîne complète : UE ' + u.prereq_chaine.join(', ') : ''}>
                              <IconAlertTriangle size={12} /> Exige {(u.prereq_chaine || u.prereq_manquants || []).join(', ')}
                            </span>;

                return (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <div className="font-semibold text-iip-blue">Plan Annuel de l'Étudiant — {pae.annee}</div>
                      <div className="text-second text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{retenues.length} UE retenue(s) · section {(pae.sections || []).join(', ') || '—'}</span>
                        {pae.niveau?.libelle && (
                          <BadgeNiveau niveau={pae.niveau.niveau} libelle={pae.niveau.libelle} />
                        )}
                        {(pae.sections_scores || []).length > 1 && (
                          <select value={sectionForcee} onChange={e => setSectionForcee(e.target.value)}
                            className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-second">
                            <option value="">Section détectée</option>
                            {pae.sections_scores.map(s => (
                              <option key={s.section} value={s.section}>{s.section} ({s.n} UE)</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    /* L'ÉCART ENTRE L'ÉCRAN ET LA BASE SE NOMME : ce qui est coché
                       sans être inscrit, ce qui est inscrit sans être coché. */
                    const ajouts = retenues.filter(u => !u.inscrite).map(u => u.ue_num);
                    const retraits = pae.pae.filter(u => u.inscrite && !sel.has(u.ue_num)).map(u => u.ue_num);
                    if (!ajouts.length && !retraits.length) return null;
                    return (
                      <div data-etat="surveiller" className="bloc-etat mb-3 px-3 py-2 text-second">
                        <b>Le schéma et la liste montrent le programme {paeConfirme ? 'modifié' : 'proposé'}, pas encore enregistré.</b>
                        {ajouts.length > 0 && <div>Coché, pas encore inscrit : UE {ajouts.join(', ')}</div>}
                        {retraits.length > 0 && <div>Inscrit, décoché : UE {retraits.join(', ')}</div>}
                        <div className="text-slate-500">Inscriptions enregistrées : {pae.pae.filter(u => u.inscrite).map(u => u.ue_num).join(', ') || 'aucune'}.</div>
                      </div>
                    );
                  })()}

                  {bloquees.length > 0 && (
                    <div className="bloc-etat etat-corriger mb-3 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-red-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-second text-red-900">
                          <b>{bloquees.length} inscription(s) impossible(s)</b> en {pae.annee} :
                          les prérequis ne sont pas acquis. {paeConfirme
                            ? 'Le PAE est confirmé avec elles : décochez-les puis enregistrez pour les retirer.'
                            : 'Elles ne sont pas reconduites ; enregistrer le PAE les retirera.'}
                          <ul className="mt-1 space-y-0.5 text-xs text-red-800">
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
                    <div className="bloc-etat etat-surveiller mb-3 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-amber-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-second text-amber-900">
                          <b>{residuelles.length} UE déjà réussie(s)</b> portent encore une inscription
                          en {pae.annee} — vestige d'un programme calculé avant l'encodage des résultats.
                          {paeConfirme ? 'Décochez-les puis enregistrez pour les retirer.'
                            : 'Elles ne sont plus proposées ; enregistrer le PAE les retirera.'}
                          <div className="text-xs text-amber-700 mt-0.5">
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
                        <tr className="intertitre border-b">
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
                                className="cursor-pointer accent-[color:var(--c-accent)]" />
                            </td>
                            <td className="py-2">
                              <span className="font-medium text-iip-blue">{u.ue_num}</span>
                              <span className="text-slate-600 ml-1.5 text-sm">{u.ue_nom}</span>
                              {u.inscrite && <span className="ml-1.5 text-mention px-1 py-0.5 rounded bg-slate-100 text-slate-500">déjà inscrite</span>}
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
                      <summary className="px-3 py-2 text-sm font-semibold text-emerald-900 cursor-pointer">
                        {acquises.length} UE déjà acquise(s)
                        <span className="font-normal text-emerald-700"> — hors programme</span>
                      </summary>
                      <div className="px-3 pb-2.5">
                        <p className="text-xs text-emerald-800 mb-1.5">
                          Réussies ou valorisées lors d'une année antérieure. Une réinscription
                          reste possible, mais suppose une décision favorable du Conseil des études.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {acquises.map(u => (
                            <button key={u.ue_num} onClick={() => basculerUE(u)}
                              title={`${u.ue_nom || ''} — cliquer pour réinscrire`}
                              className="text-xs px-2 py-0.5 rounded-lg border border-emerald-500 bg-white text-iip-texte hover:bg-emerald-500 hover:text-white">
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
                      <p className="text-xs text-slate-500 mb-2">
                        UE organisées en {pae.annee} dans la ou les sections de l'étudiant, hors proposition.
                        Ajouter une UE dont les prérequis ne sont pas acquis demande une confirmation — la dérogation est tracée.
                      </p>
                      {!autres.length ? (
                        <div className="text-second text-slate-400 py-2 text-center">Toutes les UE organisées sont déjà retenues.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {autres.map(u => (
                              <tr key={u.ue_num} className="border-b border-slate-100 last:border-0">
                                <td className="py-1.5 w-8">
                                  <input type="checkbox" checked={false} readOnly
                                    onClick={() => basculerUE(u)}
                                    className="cursor-pointer accent-[color:var(--c-accent)]" />
                                </td>
                                <td className="py-1.5">
                                  <span className="font-medium text-iip-blue">{u.ue_num}</span>
                                  <span className="text-slate-600 ml-1.5 text-sm">{u.ue_nom}</span>
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

                  <p className="text-xs text-slate-400 mt-4 border-t pt-3">
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
        </OutilsFiche.Provider>
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

/* Les renseignements dont un dossier ne devrait pas manquer, dans l'ordre où
   le secrétariat les complète (le serveur rend leurs clés : e.manques). */
const MANQUES = [
  ['nationalite', 'nationalité'], ['nationalite_libre', 'nationalité reconnue (à corriger)'], ['sexe', 'sexe'],
  ['date_naissance', 'date de naissance'], ['lieu_naissance', 'lieu de naissance'], ['num_national', 'n° national'],
  ['titre_acces', "titre d'accès"], ['diplome_max', 'diplôme le plus élevé'], ['adresse', 'adresse complète'],
  ['email_ecole', "e-mail de l'école"], ['email_perso', 'e-mail privé'], ['gsm', 'GSM'],
];
const LIBELLE_MANQUE = Object.fromEntries(MANQUES.map(([k, l]) => [k, l.replace(' reconnue (à corriger)', ' à corriger')]));

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
      informer("Choisissez d'abord une section : l'export porte sur elle.");
      return;
    }
    try {
      const rep = await fetch(
        `/api/etudiants/export-section?section=${encodeURIComponent(section)}`,
        { headers: authHeaders() });
      if (!rep.ok) {
        const e = await rep.json().catch(() => ({}));
        informer(e.error || `Export impossible (${rep.status}).`);
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await rep.blob());
      a.download = `Export_${section}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      informer(e.message);
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
  // '' tous · 'primo' les primo-arrivés · 'anciens' les autres (2 octobre 2026).
  const [fPrimo, setFPrimo] = useState('');
  const [fPlus60, setFPlus60] = useState(false);   // plus de 60 ECTS au programme (3 octobre 2026)
  // CE QUI MANQUE AU DOSSIER (9 octobre 2026) : '' · 'tout' (au moins un champ) · une clé de MANQUES.
  const [fManque, setFManque] = useState('');
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
  // Les contrôles des dossiers, venus de Configuration (lot 4) : la face ouverte.
  const [controles, setControles] = useState(null);
  const [rapportPAE, setRapportPAE] = useState(false);
  const [importListe, setImportListe] = useState(false);
  const [importHisto, setImportHisto] = useState(false);
  const [tableauPlat, setTableauPlat] = useState(false);
  const [lieuxStage, setLieuxStage] = useState(false);
  const [releveStages, setReleveStages] = useState(false);
  const [complement, setComplement] = useState(false);
  const [rapportPAESel, setRapportPAESel] = useState(false);
  const [revuePAE, setRevuePAE] = useState(null);       // liste d'étudiants à passer en revue
  // Le passage d'année : toute une section, sur ses résultats.
  const [passage, setPassage] = useState(false);
  const [reportsOffice, setReportsOffice] = useState(false);
  const [composer, setComposer] = useState(false);
  // Une seule porte pour les huit imports et les exports.
  const [echanges, setEchanges] = useState(false);
  // Les titres de fin de cycle, pour une section entière.
  const [diplomation, setDiplomation] = useState(false);
  const [comparaison, setComparaison] = useState(false);
  const [importSurMesure, setImportSurMesure] = useState(false);
  const [importSignaletique, setImportSignaletique] = useState(false);
  const [importHELB, setImportHELB] = useState(false);
  const [rattacherPack, setRattacherPack] = useState(false);
  const [importSuivi, setImportSuivi] = useState(false);
  const [tri, setTri] = useState({ champ: 'nom', sens: 1 });


  function trierPar(champ) {
    setTri(t => t.champ === champ ? { champ, sens: -t.sens } : { champ, sens: 1 });
  }

  async function ouvrirRapport() {
    if (!section) { informer('Choisissez d\'abord une section dans le filtre.'); return; }
    const [a1, a2] = (annee || '').split('-').map(Number);
    const anneeRapport = await saisir({ message: 'Année académique du rapport ?', valeur: (a1-1) + '-' + (a2-1) });
    if (!anneeRapport || !/^20\d{2}-20\d{2}$/.test(anneeRapport.trim())) {
      if (anneeRapport !== null) informer('Format attendu : 2025-2026');
      return;
    }
    const rep = await fetch(`/api/etudiants/rapport?section=${encodeURIComponent(section)}&annee=${anneeRapport.trim()}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setRapport(j);
    else informer(j.error || 'Erreur');
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
    else informer(j.error || 'Erreur');
  }

  async function importerResultats(fichier) {
    if (!fichier || !annee) return;
    const [a1, a2] = annee.split('-').map(Number);
    const anneeImport = await saisir({ message:
      'Année scolaire des résultats de ce classeur ?', valeur: (a1-1) + '-' + (a2-1) });
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) informer('Format attendu : 2025-2026');
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
    const anneeImport = await saisir({ message:
      'Année scolaire des inscriptions de ce fichier ?', valeur: anneeDetectee });
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) informer('Format attendu : 2025-2026');
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
      /* LA RECHERCHE NE PART PLUS AU SERVEUR (7 octobre 2026 : « si je vide la
         cellule, il ne remet pas le filtre à zéro ») : un rechargement l'y
         envoyait, la liste revenait réduite, et vider le champ ne la
         rechargeait pas. Elle filtre à l'écran, sur la cohorte entière. */
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

  // Combien de dossiers manquent de chaque champ, dans la section choisie : le
  // menu dit d'avance où est le travail.
  const comptesManques = useMemo(() => {
    const c = { tout: 0 };
    for (const e of etudiants) {
      if (section && (section === '__aucune__' ? e.section_rattachement : e.section_rattachement !== section)) continue;
      const m = e.manques || [];
      if (m.length) c.tout++;
      for (const k of m) c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [etudiants, section]);

  const filtres = useMemo(() => {
    // Sans accents ni casse, chaque mot tapé doit se retrouver (« cha » trouve
    // CHARLIER comme Charlotte ; « dup mar » trouve DUPONT Marie).
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const mots = norm(recherche).split(/\s+/).filter(Boolean);
    let base = (mots.length
      ? etudiants.filter(e => { const foin = norm(`${e.nom} ${e.prenom} ${e.id_ecampus || ''}`); return mots.every(m => foin.includes(m)); })
      : [...etudiants])
      .filter(e => !section || (section === '__aucune__'
        ? !e.section_rattachement : e.section_rattachement === section))
      .filter(e => !fNiveau || (fNiveau === 'aucun' ? !e.niveau : e.niveau === fNiveau))
      .filter(e => !fUE || (fUE === 'sans' ? !Number(e.nb_ue) : Number(e.nb_ue) > 0))
      .filter(e => !fRatt || (fRatt === 'aucune' ? !e.section_rattachement
        : fRatt === 'deduite' ? (e.section_rattachement && e.section_deduite)
          : (e.section_rattachement && !e.section_deduite)))
      .filter(e => !fPrimo || (fPrimo === 'primo' ? e.primo : !e.primo))
      .filter(e => !fPlus60 || Number(frises?.etats?.[e.id]?.ects) > 60)
      .filter(e => !fManque || (fManque === 'tout' ? (e.manques || []).length > 0 : (e.manques || []).includes(fManque)));
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
  }, [etudiants, recherche, tri, section, fNiveau, fUE, fRatt, fPrimo, fDoublons, fPlus60, fManque, frises]);

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
  /* ET PENDANT N'IMPORTE QUEL FILTRE (Charles, 30 septembre 2026 : « quand je
     fais un filtre, il mélange les volets par section et le filtre »). Seule
     la recherche par nom ouvrait les volets : filtrer « BA1 » laissait trois
     volets fermés dont les comptes ne disaient pas qu'ils étaient filtrés —
     on ne savait plus si « 61 étudiants » était la section ou le filtre. Tout
     filtre ouvre désormais les volets, et chaque volet dit « 61 sur 120 ». */
  const filtreActif = !!(recherche.trim() || fNiveau || fUE || fRatt || fPrimo || fDoublons || fManque);
  const [repliesRecherche, setRepliesRecherche] = useState({});
  useEffect(() => { setRepliesRecherche({}); }, [recherche, fNiveau, fUE, fRatt, fPrimo, fDoublons, fManque]);
  const totalParSection = useMemo(() => {
    const m = {};
    for (const e of etudiants || []) { const s = e.section_rattachement || '(sans section)'; m[s] = (m[s] || 0) + 1; }
    return m;
  }, [etudiants]);
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
  // La sélection, connue des Éditions (lib/selectionEtudiants.js) — effacée en quittant la liste.
  useEffect(() => {
    poserSelectionEtudiants([...selEtudiants], annee,
      etudiants.filter(e => selEtudiants.has(e.id)).map(e => e.section_rattachement));
  }, [selEtudiants, annee, etudiants]);
  useEffect(() => () => poserSelectionEtudiants([], null), []);

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
    if (ids.length !== 2) { informer('Cochez exactement deux fiches à fusionner.'); return; }
    const fiches = ids.map(id => filtres.find(e => e.id === id)
      || etudiants.find(e => e.id === id)).filter(Boolean);
    if (fiches.length !== 2) return;
    const lib = e => `${(e.nom || '').toUpperCase()} ${e.prenom || ''} (${e.id_ecampus || 'sans matricule'})`;
    // Le plus récent d'abord : matricule décroissant, à défaut l'id le plus haut.
    fiches.sort((a, b) => String(b.id_ecampus || '').localeCompare(String(a.id_ecampus || ''))
      || b.id - a.id);
    let [garder, absorber] = fiches;
    if (!(await demander(`Fusionner ces deux fiches ?\n\n→ CONSERVER : ${lib(garder)}\n→ Y VERSER puis supprimer : ${lib(absorber)}\n\nTout est déplacé : inscriptions, notes, décisions, valorisations, suivi. Les anciens matricules restent cherchables.\n\nAnnuler = inverser le sens.`))) {
      [garder, absorber] = [absorber, garder];
      if (!(await demander(`Sens inversé.\n\n→ CONSERVER : ${lib(garder)}\n→ Y VERSER puis supprimer : ${lib(absorber)}\n\nConfirmer la fusion ?`))) return;
    }
    const rep = await fetch('/api/doublons-etudiants/fusionner', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ garder: garder.id, absorber: absorber.id }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(j.error || `Fusion refusée (${rep.status})`); return; }
    informer(`Fusion faite : ${lib(garder)} porte désormais tout le parcours.`);
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
      motif = await saisir(`Sortir ${ids.length} étudiant(s) du cursus.\n\nMotif (facultatif) : abandon, réorientation…`);
      if (motif === null) return;
    } else if (!(await demander(`${ids.length} étudiant(s) : ${LIB[statutCible]} ?\n\nRien n'est effacé — le geste est réversible.`))) return;
    const rep = await fetch('/api/etudiants/statut', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ids, statut: statutCible, motif }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(j.error || `Refusé (${rep.status})`); return; }
    if (j.refuses?.length) informer(`${j.faits} traité(s). ${j.refuses.length} hors de votre périmètre, laissé(s) tels quels.`);
    setSelEtudiants(new Set());
    await charger();
  }

  async function supprimerSelection() {
    const ids = [...selEtudiants];
    if (!ids.length) return;
    if (!(await demander(`Supprimer ${ids.length} étudiant(s) ?\n\nLes fiches vides seront supprimées directement ; pour celles qui portent des données, un récapitulatif sera demandé une par une.`))) return;
    let faits = 0, refus = [];
    for (const id of ids) {
      let rep = await fetch(`/api/etudiants/${id}`, { method: 'DELETE', headers: authHeaders() });
      let j = await rep.json().catch(() => ({}));
      if (rep.status === 409 && j.confirmation_requise) {
        const inv = j.inventaire || {};
        const detail = Object.entries(inv).filter(([, n]) => n > 0)
          .map(([k, n]) => `  · ${n} ${k}`).join('\n');
        if (!j.force_permis) { refus.push(`${j.etudiant} — dossier non vide (direction requise)`); continue; }
        if (!(await demander(`${j.etudiant} porte des données qui seraient DÉFINITIVEMENT supprimées :\n${detail}\n\nSupprimer quand même ?`))) continue;
        rep = await fetch(`/api/etudiants/${id}?force=1`, { method: 'DELETE', headers: authHeaders() });
        j = await rep.json().catch(() => ({}));
      }
      if (rep.ok) faits++;
      else refus.push(j.error || `étudiant ${id} : erreur ${rep.status}`);
    }
    if (refus.length) informer(`${faits} supprimé(s).\nNon supprimé(s) :\n- ` + refus.join('\n- '));
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

  // Depuis 3.1.20, le verdict du serveur lui-même (Configuration → Accès compris).
  const droitsRail = useDroits();
  const peutImporter = droitsRail.peut('etudiants.import');
  const peutReprendre = droitsRail.passe('admin', 'directeur', 'directeur_adjoint');
  const peutLieux = droitsRail.passe('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination');
  // Rien à importer pour ce rôle : pas d'entrée « Importer » dans le rail.
  const ouvrirEchanges = useCallback(() => setEchanges(true), []);
  useEchangesDuRail(peutImporter || peutReprendre || peutLieux ? ouvrirEchanges : null);

  // QUI PEUT SUPPRIMER. La route exige déjà « admin » ou « editeur » côté
  // serveur — un bouton caché n'est pas une protection —, mais proposer à
  // l'écran ce qui sera refusé par le serveur n'aide personne.
  const peutSupprimer = droitsRail.peut('etudiants.purge');

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
        icon: IconTrash, couleur: 'var(--c-refuse)', destructif: true,
        onClick: () => setPurge(true) },
    ] }] : []),
    // INSCRIRE QUELQU'UN. La route serveur existait depuis l'origine, sans
    // aucun écran pour l'appeler : tout entrait par l'import eCampus, et
    // l'inscription tardive n'avait nulle part où aller. C'est la première
    // entrée du rail parce que c'est le premier geste de l'année.
    { label: 'Inscrire', items: [
      ...(droitsRail.peut('etudiants.creer') ? [{ key: 'nouvel-etudiant', label: 'Créer un étudiant',
        icon: IconUserPlus, onClick: () => setNouvel(true) }] : []),
      /* CE QUI RÉPARE LES DOSSIERS, À CÔTÉ DE CE QUI LES CRÉE (lot 4, 2 octobre
         2026). Quatre outils, une seule entrée : une icône se mérite. */
      { key: 'controles-dossiers', label: 'Contrôler les dossiers', icon: IconListSearch,
        onClick: () => {
          let f = 'doublons';
          try { f = sessionStorage.getItem('lucie.outil.face') || f; sessionStorage.removeItem('lucie.outil.face'); } catch { /* */ }
          setControles(f);
        } },
    ] },
    // LE REGISTRE DES VALORISATIONS A QUITTÉ CE RAIL. Il y figurait en même
    // temps que l'onglet « Valorisation des acquis » de l'axe : deux portes
    // pour la même matière, à trois centimètres l'une de l'autre, et « VA »
    // écrit deux fois dans le même menu. L'onglet fait tout ce que faisait le
    // registre, et il encode en plus.
    { label: 'Fin de cycle', items: [
      ...(droitsRail.peut('etudiants.pae_composer') ? [{ key: 'passage', label: 'Composer les PAE',
        /* PAS DEUX FOIS LE MÊME DESSIN DANS UN RAIL. « Passage de classe »
           portait l'icône de l'axe Étudiants : replié, on visait l'un pour
           l'autre. Un escalier dit ce que fait l'action — on monte d'un an. */
        /* LE MÊME ESCALIER, UN OUTIL PLUS LARGE (21 septembre 2026) : la
           grille de composition, dont le passage d'année n'est plus qu'un
           des gestes. On garde l'icône — c'est celle que Charles cherche. */
        icon: IconTablePlus, onClick: () => setComposer('composer') }] : []),
      // LES REPORTS D'OFFICE (27 septembre 2026) : se posent seuls à chaque PAE
      // enregistré ; cette entrée rattrape les PAE composés avant.
      ...(droitsRail.passe('admin', 'directeur', 'directeur_adjoint', 'editeur') ? [{ key: 'reports', label: 'Reports de notes', icon: IconArrowForwardUp,
        onClick: () => setReportsOffice(true) }] : []),
      /* LA REVUE DES PAE (1er octobre 2026) : les étudiants cochés s'il y en a,
         sinon la liste telle qu'elle est filtrée, dans son ordre. */
      { key: 'revue-pae', label: 'Revue des PAE', icon: IconEyeCheck,
        onClick: () => {
          const coches = filtres.filter(e => selEtudiants.has(e.id));
          const l = (coches.length ? coches : filtres).map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom,
            section: e.section_rattachement || null, niveau: e.niveau || null }));
          if (l.length) setRevuePAE(l);
        } },
      // « Valider les PAE » n'a plus d'entrée à lui (Charles, 26 septembre
      // 2026 : « il est dans la fenêtre PAE ») : Valider est un des modes de
      // la fenêtre Composer les PAE.
      // « Diplômes et titres » a quitté le rail (Charles, 4 octobre 2026 :
      // « c'est dans Éditions ») : il s'ouvre par l'avion, face Diplômes et titres.
    ] },
    // TOUT CE QUI ENTRE ET TOUT CE QUI SORT, DERRIÈRE UNE PORTE.
    // Le rail alignait huit imports dont quatre parlaient de « classeur » sans
    // dire lequel : on ouvrait au jugé. Le centre les nomme et annonce le
    // fichier attendu — la seule chose qui permette de choisir sans essayer.
    // « Importer / exporter » ne se déclare plus ici : l'axe le pose sous le
    // filet, à la même place que sur Personnel et Organisation. L'écran dit
    // seulement COMMENT l'ouvrir.
  ];

  /* UN OUTIL DEMANDÉ DEPUIS LE SOUS-MENU « PARCOURS » D'UN AUTRE ÉCRAN : l'axe
     ouvre celui-ci et laisse la clé ; on lance l'outil une fois la liste là. */
  useEffect(() => {
    let cle = null;
    try { cle = sessionStorage.getItem('lucie.outil'); } catch { /* */ }
    if (!cle || !etudiants) return;
    try { sessionStorage.removeItem('lucie.outil'); } catch { /* */ }
    // Les diplômes sortent par Éditions : la recherche « Diplômes et titres » ouvre le centre sur leur famille.
    if (cle === 'diplomation') { setDiplomation(true); return; }
    for (const sec of RAIL) for (const it of sec.items || []) if (it.key === cle) { it.onClick?.(); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etudiants]);

  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={ICONE_AXE.etudiants} titre="Étudiants"
        sousTitre={`${filtres.length} étudiant(s)`} sections={RAIL}
        impression="etudiants" pieces={EDITIONS} />
    <div className="gouttiere-rail p-5 space-y-4 max-w-none">
      {/* Le titre et le compte vivaient ICI, alors que le rail les porte déjà
          et que l'onglet le dit une troisième fois. Trois fois « Étudiants »
          sur un même écran, et autant de hauteur perdue avant la première
          ligne du tableau. */}

      {msgImport && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${msgImport.type==='ok'
          ? 'bg-emerald-500 text-white border border-emerald-500'
          : 'bg-red-500 text-white border border-red-500'}`}>
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
            placeholder="Nom, prénom ou identifiant…" data-reponses="non"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm" />
          {recherche && <button type="button" onClick={() => setRecherche('')} title="Effacer la recherche"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><IconX size={14} /></button>}
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
        {/* PRIMO OU LES AUTRES : un primo-arrivé n'a aucune inscription ni
            valorisation avant l'année de travail ; « déjà inscrits » est
            l'inverse exact. */}
        <select value={fPrimo} onChange={e => setFPrimo(e.target.value)}
          title="Primo-arrivé : aucune inscription ni valorisation avant l'année de travail"
          className="controle text-sm">
          <option value="">Primo et déjà inscrits</option>
          <option value="primo">Primo-arrivés</option>
          <option value="anciens">Déjà inscrits avant (non primo)</option>
        </select>
        {/* LES DOSSIERS À COMPLÉTER (Charles, 9 octobre 2026) : un champ à la
            fois, pour que le secrétariat passe en revue « tous ceux sans
            nationalité », puis « tous ceux sans titre d'accès ». */}
        <select value={fManque} onChange={e => setFManque(e.target.value)}
          title="Ne montrer que les dossiers auxquels manque ce renseignement"
          className="controle text-sm">
          <option value="">Dossier complet ou non</option>
          <option value="tout">Incomplet — au moins un champ ({comptesManques.tout || 0})</option>
          {MANQUES.map(([k, l]) => <option key={k} value={k}>Sans {l} ({comptesManques[k] || 0})</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 self-center"
          title="Ne montrer que les étudiants dont le nom et le prénom existent sur plusieurs fiches">
          <input type="checkbox" checked={fDoublons} onChange={e => setFDoublons(e.target.checked)} />
          Doublons
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 self-center"
          title="Ne montrer que les étudiants dont le programme de l'année dépasse 60 ECTS">
          <input type="checkbox" checked={fPlus60} onChange={e => setFPlus60(e.target.checked)} />
          Plus de 60 ECTS
        </label>
        {(section || fNiveau || fUE || fRatt || fPrimo || fDoublons || fPlus60 || fManque) && (
          <button className="text-second text-iip-blue underline self-center"
            onClick={() => { setSection(''); setFNiveau(''); setFUE(''); setFRatt(''); setFPrimo(''); setFDoublons(false); setFPlus60(false); setFManque(''); }}>
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
              className={`px-3 py-2 text-sm ${statut === x.k
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
              {x.l}
            </button>
          ))}
        </div>
      </div>

      {erreurListe && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm
                        text-red-800 mb-3">
          <b>La liste n'a pas pu être chargée.</b> {erreurListe}
        </div>
      )}

      {/* La sélection doit se voir : sinon on l'oublie, et on s'étonne
          d'imprimer douze pièces au lieu de toute la liste. */}
      {selEtudiants.size > 0 && (
        /* UN FOND PLEIN (Charles, 28 septembre 2026 : « souci de transparence »).
           La barre reste collée en haut quand la liste défile ; translucide, elle
           laissait passer les lignes et son texte devenait illisible. Marine
           pâle et opaque, comme les bandeaux depuis 2.12.274. */
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 flex-wrap
                        px-4 py-2 rounded-xl shadow-pose"
          style={{ background: '#fff', border: '1px solid #fff' }}>
          {/* LE COMPTEUR DIT CE QU'ON VOIT, ET CE QU'ON NE VOIT PAS. La sélection
              survit aux filtres — c'est voulu —, mais « 204 sélectionnés » au
              milieu d'une liste filtrée à trente a été lu, à juste titre, comme
              un nombre faux (Charles, 21 septembre). On dit combien sont
              affichés parmi eux, et l'on permet de vider ou de ramener la
              sélection à ce qui est à l'écran : c'est sur la sélection entière
              qu'agissent Imprimer et Composer. */}
          <span className="text-sm font-semibold text-iip-blue flex flex-wrap items-center gap-x-2">
            {selEtudiants.size} étudiant(s) sélectionné(s)
            {(() => {
              const visibles = filtres.filter(e => selEtudiants.has(e.id)).length;
              if (visibles === selEtudiants.size) return null;
              return (
                <span className="font-normal text-second text-iip-texte">
                  dont {visibles} affiché(s) — {selEtudiants.size - visibles} caché(s) par les filtres
                  <button className="underline ml-2 text-iip-blue"
                    onClick={() => setSelEtudiants(new Set(filtres.filter(e => selEtudiants.has(e.id)).map(e => e.id)))}>
                    Ne garder que les affichés
                  </button>
                </span>
              );
            })()}
            <button className="underline font-normal text-second text-slate-500"
              onClick={() => setSelEtudiants(new Set())}>Tout désélectionner</button>
          </span>
          <div className="flex gap-2">
            {/* LE BOUTON « IMPRIMER » NE FAISAIT RIEN : il posait un état que
                personne ne lisait. Il ouvre le PAE des étudiants cochés —
                tableau croisé étudiants × UE, à l'écran ou en Excel. */}
            <OuvrirEditions ongletInitial="etudiants"
              titre="Imprimer ou envoyer le PAE des étudiants cochés — centre d'édition"
              perimetre={{ annee, pieces: ['pae'], coches: [...selEtudiants],
                sections: [...new Set(etudiants.filter(e => selEtudiants.has(e.id)).map(e => e.section_rattachement).filter(Boolean))] }} />
            {ecritModule('etudiants') && <button onClick={imprimerCoordonnees}
              title="La liste imprimable des emails, GSM et adresses des étudiants cochés"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                         text-iip-blue font-semibold rounded-lg">
              <IconAddressBook size={14} /> Coordonnées
            </button>}
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
                <th className="px-2 py-2.5 text-left w-12 text-xs font-semibold" title="Programme validé">PAE</th>
                <ThTri champ="niveau"  tri={tri} onTri={trierPar} className="text-left w-28">Niveau</ThTri>
                <th className="px-3 py-2.5 text-left text-xs font-semibold">Parcours <span className="font-normal text-slate-400">— dans l'ordre du cursus</span></th>
                <th className="px-2 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {parSection.map(([sec, liste]) => {
                // FERMÉS PAR DÉFAUT. Toutes les sections dépliées, c'était
                // huit cents lignes avant d'atteindre celle qu'on cherchait.
                // Replié, l'écran tient sur une vue : on ouvre la section
                // voulue, et on y est.
                const enRecherche = filtreActif;
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
                        <td colSpan={6} className="px-4 py-2">
                          <button onClick={basculer}
                            className="flex items-center gap-1.5 text-sm font-semibold">
                            <span className="w-3 inline-block opacity-50">{ouverte ? '−' : '+'}</span>
                            {sec}
                            <span className="font-normal text-xs text-slate-500">
                              {filtreActif && totalParSection[sec] && totalParSection[sec] !== liste.length
                                ? `${liste.length} sur ${totalParSection[sec]} étudiant(s) — filtrés`
                                : `${liste.length} étudiant(s)`}
                            </span>
                          </button>
                        </td>
                      </tr>
                    )}
                    {ouverte && liste.map(e => (
                <tr key={e.id} onClick={() => setSelId(e.id)}
                  className={`border-b border-slate-100 last:border-0 cursor-pointer
                    ${selEtudiants.has(e.id) ? 'bg-[color:var(--c-principal)]/[0.04]' : 'hover:bg-slate-50/60'}`}>
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
                    <span className="text-xs text-slate-400 ml-1.5 tabular-nums">{e.id_ecampus}</span>
                    {e.primo && <span className="ml-1.5 text-mention font-semibold px-1.5 rounded bg-slate-100 text-slate-600"
                      title="Primo-arrivé : aucune trace avant l'année de travail">primo</span>}
                    {fManque && (e.manques || []).length > 0 && (
                      <span className="ml-2 text-xs text-slate-500"
                        title="Ce qui manque à ce dossier — à compléter dans la fiche">
                        manque : {(e.manques || []).map(k => LIBELLE_MANQUE[k] || k).join(', ')}
                      </span>)}
                  </td>
                  {/* LE CRAYON DIT LE PAE, ET IL L'OUVRE (Charles, 2 octobre 2026) :
                      vert quand le PAE est validé dans la revue, gris sinon ; un
                      clic ouvre la revue — la fenêtre « œil » — sur cet étudiant.
                      La fiche, elle, reste la vue du parcours et des notes. */}
                  <td className="px-2 py-1" onClick={ev => ev.stopPropagation()}>
                    <button type="button" className="p-0.5 rounded hover:bg-slate-100"
                      onClick={() => setRevuePAE([{ id: e.id, nom: e.nom, prenom: e.prenom,
                        section: e.section_rattachement || null, niveau: e.niveau || null }])}
                      title={e.pae_valide ? `PAE validé le ${quandLocal(e.pae_valide.le)} par ${e.pae_valide.par || '—'} — ouvrir la revue`
                        : e.pae_confirme ? 'Programme confirmé, PAE pas encore validé — ouvrir la revue' : 'PAE pas encore validé — ouvrir la revue'}>
                      <IconWritingSign size={15} style={{ color: e.pae_valide ? 'var(--c-reussi, #3E7D5E)' : 'rgb(var(--gris-300))' }} />
                    </button>
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    <BadgeNiveau niveau={e.niveau} libelle={e.niveau_libelle} />
                    {/* Le diplôme se dit là où on lit le niveau : c'est la même
                        question — où en est cette personne. */}
                    {e.sortie_statut === 'archive' && (
                      <span title={`Archivé le ${e.sortie_le || '?'} — hors des listes de travail`}
                        className="intertitre ml-1.5 bg-slate-100 border border-slate-300 rounded px-1.5 py-px">archivé</span>
                    )}
                    {e.sortie_statut === 'sorti' && (
                      <span title={`Sorti le ${e.sortie_le || '?'}${e.sortie_motif ? ` — ${e.sortie_motif}` : ''}`}
                        className="ml-1.5 text-mention font-semibold uppercase tracking-wide
                                   text-amber-800 bg-amber-50 border border-amber-200
                                   rounded px-1.5 py-px">sorti</span>
                    )}
                    {e.diplome && (
                      <span title={e.diplome_declare
                        ? `Diplôme déclaré le ${e.sortie_le || '?'} (épreuve intégrée non encodée)`
                        : `Épreuve intégrée réussie${
                        e.diplome_annee ? ` en ${e.diplome_annee}` : ''}${
                        e.diplome_ue ? ` (UE ${e.diplome_ue})` : ''} — diplôme acquis`}
                        className="ml-1.5 text-mention font-semibold uppercase tracking-wide
                                   text-emerald-800 bg-emerald-50 border border-emerald-200
                                   rounded px-1.5 py-px">
                        diplômé{e.diplome_annee ? ` ${e.diplome_annee.slice(-4)}` : ''}
                      </span>
                    )}
                  </td>
                  {/* LA COLONNE SECTION EST PARTIE (Charles, 27 septembre 2026 : « on
                      est dans le filtre, perte de place ») : les lignes sont déjà
                      rangées par section, sous son volet. */}
                  <td className="px-3 py-1">
                    <FriseParcours ues={frises?.sections?.[frises?.etats?.[e.id]?.s]} codes={frises?.etats?.[e.id]?.c} ects={frises?.etats?.[e.id]?.ects ?? null} />
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

      {controles && (
        <OutilsAFaces icone={IconListSearch} titre="Contrôler les dossiers"
          sous="Doublons, programmes sur deux sections, au-delà du bloc, prérequis du PAE, décisions sans inscription, nationalités"
          faceInitiale={controles} onFermer={() => { setControles(null); charger(); }}
          faces={[
            { cle: 'doublons', label: 'Dossiers dédoublés', rendu: <DoublonsEtudiants /> },
            { cle: 'doubles-programmes', label: 'Programmes sur deux sections', rendu: <DoublesProgrammes /> },
            { cle: 'hors-bloc', label: 'Au-delà du bloc atteint', rendu: <HorsBloc /> },
            { cle: 'pae-hors-regle', label: 'PAE hors règle de prérequis', rendu: <PaeHorsRegle /> },
            { cle: 'decisions-sans-inscription', label: 'Décisions sans inscription', rendu: <DecisionsSansInscription /> },
            { cle: 'nationalites', label: 'Nationalités', rendu: <NationalitesNormaliser /> },
          ]} />
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
      {importHELB && <ImportHELB onClose={() => setImportHELB(false)} onTermine={charger} />}
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
                  informer("Choisissez d'abord une section : l'export porte sur elle.");
                  return;
                }
                exporterSection();
              } },
          ]}
          entrees={[
            /* EN TÊTE : c'est l'import d'une rentrée, et il n'avait pas de
               porte — la création était une case cachée de l'importateur sur
               mesure, qui annonce COMPLÉTER. Le nom est celui de Charles. */
            { cle: 'creer-externe', ok: peutImporter, titre: 'Créer des étudiants sur base d’une base de données externe',
              quoi: 'Ouvrir les dossiers d’une nouvelle promotion ; ceux qui existent déjà sont complétés, jamais dédoublés.',
              attend: 'l’export eCampus des étudiants (R_Etudiants_Excel, .xls)',
              onClick: () => setImportSignaletique(true) },
            /* LES ORTHOPTISTES DE LA HELB (30 septembre 2026) : ils suivent le
               tronc commun organisé par l'IIP, sans passer par eCampus. */
            { cle: 'creer-helb', ok: peutImporter, titre: 'Créer les étudiants d’orthoptie (HELB)',
              quoi: 'Ouvrir les dossiers de la section Orthoptie et y rattacher les unités du tronc commun ; ceux qui existent déjà sont complétés.',
              attend: 'la liste des inscrits transmise par la HELB (.xls)',
              onClick: () => setImportHELB(true) },
            /* L'ÉTAPE SUIVANTE : une promotion importée sans section se range
               d'après le rapport eCampus « Pack UF ». */
            { cle: 'rattacher-pack', ok: peutImporter, titre: 'Placer les étudiants dans leur section',
              quoi: 'D’après le rapport eCampus « Pack UF » : chaque pack reçoit sa section, seuls les étudiants sans section sont placés.',
              attend: 'le rapport Pack UF (Word, .docx)',
              onClick: () => setRattacherPack(true) },
            { cle: 'liste', ok: peutImporter, titre: 'Liste eCampus',
              quoi: 'Créer ou compléter les dossiers depuis la liste officielle.',
              attend: "l'export eCampus (.xlsx)",
              onClick: () => setImportListe(true) },
            { cle: 'pae', ok: peutImporter, titre: 'Classeur PAE',
              quoi: 'Reprendre les programmes annuels déjà composés ailleurs.',
              attend: 'un classeur PAE (.xlsx)',
              onClick: () => setImportPAE(true) },
            { cle: 'suivi', ok: peutReprendre, titre: 'Classeur de suivi',
              quoi: 'Pondérations, notes et décisions des deux sessions d’une année.',
              attend: 'Suivi_etudiants_XXX.xlsm',
              onClick: () => setImportSuivi(true) },
            { cle: 'histo', ok: peutImporter, titre: "Reconstruire l'historique",
              quoi: 'Plusieurs années et sections d’un coup, depuis leurs classeurs de suivi ; les étudiants se rapprochent par numéro national.',
              attend: 'plusieurs Suivi_etudiants_XXX.xlsm',
              onClick: () => setImportHisto(true) },
            /* LA REPRISE PAR TABLEAU PLAT vivait dans une barre de boutons de
               la délibération (Charles, 3 octobre 2026 : « ce menu n'était que
               pour moi, il peut partir si on a les liens dans Importer »). */
            { cle: 'tableau-plat', ok: peutReprendre, titre: 'Reprendre une année depuis un tableau plat',
              quoi: 'Une année déjà délibérée : une ligne par étudiant, unité et session, dates du jury comprises.',
              attend: 'un tableau plat, une ligne par décision',
              onClick: () => setTableauPlat(true) },
            { cle: 'lieux-stage', ok: peutLieux, titre: 'Répertoire de lieux de stage',
              quoi: 'Les lieux d’une section (type, responsable, adresse, demande) : on les choisit ensuite dans la fiche de stage.',
              attend: 'un classeur avec la colonne « Nom de l’organisme »',
              onClick: () => setLieuxStage(true) },
            { cle: 'releve-stages', ok: peutLieux, titre: 'Relevé des stages effectués',
              quoi: 'Les stages déjà faits — intitulé, domaine, lieu, période, heures, maître de stage — pour les dossiers et le supplément au diplôme.',
              attend: 'un classeur avec « Établissement », « Nom », « Prénom », « Période du stage »',
              onClick: () => setReleveStages(true) },
            { cle: 'complement', ok: peutImporter, titre: 'Compléter les dossiers',
              quoi: 'Ajouter adresses, dates de naissance et pièces aux dossiers existants.',
              attend: 'un classeur portant les matricules',
              onClick: () => setComplement(true) },
            { cle: 'comparer', ok: peutImporter, titre: 'Comparer un classeur',
              quoi: 'Voir ce qui diffère entre un fichier et la base, sans rien écrire.',
              attend: "n'importe quel classeur d'étudiants",
              onClick: () => setComparaison(true) },
            { cle: 'sur-mesure', ok: peutImporter, titre: 'Importateur sur mesure',
              quoi: 'Un fichier dont la forme n’entre dans aucune des cases ci-dessus.',
              attend: 'un classeur dont vous désignez les colonnes',
              onClick: () => setImportSurMesure(true) },
          ].filter(e => e.ok)}
          risques={peutSupprimer ? [
            { cle: 'purge', titre: 'Vider des résultats',
              quoi: 'Effacer les notes et décisions d’une année ou d’une unité.',
              attend: null, onClick: () => setPurge(true) },
          ] : []} />
      )}

      {diplomation && (
        /* LES DIPLÔMES SORTENT PAR ÉDITIONS (Charles, 2 octobre 2026 : « c'est
           dans Éditions ») : l'entrée du rail garde sa rosette, et ouvre le
           centre sur sa famille — la même fenêtre que partout. */
        <CentreImpressionCentral ongletInitial="etudiants" familleInitiale="diplomes"
          onClose={() => setDiplomation(false)} />
      )}

      {composer && (
        <ComposerPAE modeInitial={composer === 'valider' ? 'valider' : 'composer'}
          preselection={composer === 'selection' ? [...selEtudiants] : null}
          onClose={() => setComposer(false)} onTermine={charger}
          onPassage={() => { setComposer(false); setPassage(true); }} />
      )}
      {reportsOffice && <ReportsOffice annee={annee} onClose={() => { setReportsOffice(false); charger(); }} />}
      {passage && (
        <PassageAnnee annee={annee}
          onClose={() => setPassage(false)} onTermine={charger} />
      )}


      {complement && (
        <Fenetre titre="Compléter les dossiers" large="moyenne"
          onFermer={() => setComplement(false)}>
          <ComplementDossiers onTermine={charger} />
        </Fenetre>
      )}

      {lieuxStage && <ImportLieuxStage onClose={() => setLieuxStage(false)} />}
      {releveStages && <ImportReleveStages onClose={() => setReleveStages(false)} />}
      {tableauPlat && (
        <ImportTableauPlat annee={annee} onClose={() => setTableauPlat(false)} onFini={charger} />
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
      {revuePAE && <RevuePAE liste={revuePAE} annee={annee} onClose={() => { setRevuePAE(null); charger(); }} />}
      {rapportPAESel && (
        <RapportPAE anneeCourante={annee} onClose={() => setRapportPAESel(false)}
          selection={(etudiants || []).filter(e => selEtudiants.has(e.id))
            .map(e => ({ id: e.id, section: e.section_rattachement || null }))} />
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
