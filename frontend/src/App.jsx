import { useState, useEffect, useRef, Component } from 'react';
import { estDirection, droitEffectif, usePlafonds, oublierPlafonds } from './lib/modules.js';

// Error boundary : affiche l'erreur au lieu d'une page blanche
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '40px', fontFamily: 'monospace', background: '#fff0f0', minHeight: '100vh' }}>
        <h2 style={{ color: '#c00' }}>❌ Erreur JavaScript — merci de copier ce message</h2>
        <pre style={{ background: '#fff', border: '1px solid #f00', padding: '16px', borderRadius: '4px', overflow: 'auto' }}>
          {this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}
        </pre>
      </div>
    );
    return this.props.children;
  }
}
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, api, getAnnee, setAnnee } from './lib/api.js';
import { useMode, basculerMode } from './lib/theme.js';
import {
  IconClipboardList, IconBooks, IconUsers, IconFileExport, IconChecklist,
  IconChartBar, IconCalendarStats, IconEdit, IconSettings, IconLogout, IconMenu2, IconX,
  IconHome, IconBell, IconHelpCircle, IconGavel, IconSun, IconMoon,
  IconShieldLock, IconShieldCheck,
} from '@tabler/icons-react';

import Login from './pages/Login.jsx';
import MonCompte from './components/MonCompte.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attributions from './pages/Attributions.jsx';
import Professeurs from './pages/Professeurs.jsx';
import DCPP from './pages/DCPP.jsx';
import Recrutement from './pages/Recrutement.jsx';
import Accueil from './pages/Accueil.jsx';
import { lazy, Suspense } from 'react';
const Procedures = lazy(() => import('./pages/Procedures.jsx'));
import Configuration from './pages/Configuration.jsx';
import EA12List from './pages/EA12List.jsx';
import EA12Editor from './pages/EA12Editor.jsx';
import Pilotage from './pages/Pilotage.jsx';
import Planification from './pages/Planification.jsx';
const Documentation = lazy(() => import('./pages/Documentation.jsx'));
import Attestation from './pages/Attestation.jsx';
import Disciplinaire from './pages/Disciplinaire.jsx';
import Echeancier from './pages/Echeancier.jsx';
import Organisation from './pages/Organisation.jsx';
import { AxeAccueil, AxeEtudiants } from './pages/Axes.jsx';
import { BoutonAide } from './pages/Aide.jsx';

/* eslint-disable no-undef */
const BUILD_DATE_STR = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : new Date().toISOString();
const BUILD_VER = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';
/* eslint-enable no-undef */

const buildDate = new Date(BUILD_DATE_STR);
const buildLabel = buildDate.toLocaleString('fr-BE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});
// Version : BUILD_VER peut être "1.2.8+sha" (Vite local), un SHA brut (CI sans fix), ou "dev"
/* LE NUMÉRO DE VERSION SE RÉDUIT D'UNE SEULE FAÇON — ET CE POINT A ÉTÉ LIVRÉ
 * FAUX, SUR LE SIGNAL MÊME QUI DEVAIT DIRE LA VÉRITÉ.
 *
 * L'écran gardait « 2.12.62-dev » (coupé au seul « + ») pendant que le serveur
 * était réduit à « 2.12.62 » (coupé au « + » ET au « - »). Deux traitements
 * pour une même grandeur : le badge annonçait « 2.12.62-dev ≠ 2.12.62 » sur
 * deux moitiés parfaitement à jour.
 *
 * UNE FAUSSE ALERTE SUR UN SIGNAL D'ALERTE EST PIRE QUE PAS DE SIGNAL : on
 * apprend en trois jours à ne plus le lire, et il se tait le jour où il
 * compte. Une seule fonction, employée des deux côtés. */
const numeroSeul = v => String(v || '').split('+')[0].split('-')[0];

const _isVersion = BUILD_VER.includes('.');
const versionNum = _isVersion ? numeroSeul(BUILD_VER) : '3.0.0'; // fallback hardcodé
const shaOnly = BUILD_VER.includes('+')
  ? BUILD_VER.split('+')[1]?.slice(0,7)
  : BUILD_VER === 'dev' ? '' : BUILD_VER.slice(0,7);

function BuildBadge() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div className="fixed bottom-2 right-2 z-50 text-right pointer-events-none select-none">
      <div className="bg-white/90 border border-gray-200 rounded px-2 py-1 shadow-sm text-xs text-gray-400 leading-tight">
        <div className="tabular-nums">{dateStr} {timeStr}</div>
        <div className="font-mono text-[10px] text-gray-300">{shaOnly}</div>
      </div>
    </div>
  );
}

function AdminOrRH({ children }) {
  const u = getUser();
  if (!estDirection(u) && !u?.acces_recrutement) return <Navigate to="/" replace />;
  return children;
}

function PreviewBanner() {
  const u = getUser();
  if (!u?.preview) return null;
  return (
    <div className="bg-amber-500 text-white text-sm px-4 py-1.5 flex items-center justify-center gap-3 sticky top-0 z-[60]">
      <span>Aperçu — vous voyez Lucie comme <strong>{u.nom || u.email}</strong> ({u.role}), en lecture seule.</span>
      <button onClick={() => { api.stopPreview(); window.location.href = '/'; }}
        className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 font-medium">Revenir à mon compte</button>
    </div>
  );
}

/** « Charles Sohet » → « CS ». Un seul mot, ses deux premières lettres. */
/** Le rôle, en abrégé : la barre n'a pas la place d'un mot de dix-huit lettres. */
const ROLE_COURT = {
  admin: 'Adm.', directeur: 'Dir.', directeur_adjoint: 'Dir. adj.',
  coordination: 'Coord.', secretariat: 'Secr.', professeur: 'Prof.',
  consultation: 'Lect.', editeur: 'Édit.',
};

function initialesDe(u) {
  const source = String(u?.nom || u?.email || '').trim();
  const mots = source.split(/[\s@._-]+/).filter(Boolean);
  if (!mots.length) return '?';
  const lettres = mots.length > 1 ? mots[0][0] + mots[1][0] : mots[0].slice(0, 2);
  return lettres.toLocaleUpperCase('fr');
}

function VoirCommePicker() {
  const [open, setOpen] = useState(false);
  const [profils, setProfils] = useState([]);
  const [err, setErr] = useState('');
  const u = getUser();
  /* LE NOM TIENT EN DEUX LETTRES.
     Écrit en entier, il occupait à lui seul un quart de la barre et forçait le
     rôle et la déconnexion à s'empiler dessous, sur trois lignes. Les initiales
     suffisent à dire qui est connecté — le nom complet reste dans l'info-bulle
     et dans la liste « voir comme ». */
  if (!estDirection(u) || u?.preview) {
    return <span className="pastille-compte" title={u?.nom || u?.email}>{initialesDe(u)}</span>;
  }
  const ouvrir = () => {
    setOpen(o => !o);
    if (!profils.length) api.profilsAcces().then(d => setProfils(Array.isArray(d) ? d : [])).catch(e => setErr(e.message));
  };
  const voir = (id) => { api.impersonate(id).then(() => { window.location.href = '/'; }).catch(e => alert(e.message)); };
  return (
    <div className="relative">
      <button onClick={ouvrir} title="Voir Lucie comme un autre profil"
        className="pastille-compte hover:text-iip-blue flex items-center gap-1">
        {initialesDe(u)} <span className="text-[10px] text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-80 overflow-auto">
          <div className="px-3 py-2 text-xs text-gray-500 border-b flex items-center justify-between">
            <span>Voir comme…</span>
            <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-500">×</button>
          </div>
          {err && <div className="px-3 py-2 text-xs text-red-600">{err}</div>}
          {profils.filter(p => p.id !== u?.id).map(p => (
            <button key={p.id} onClick={() => voir(p.id)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-iip-turquoise/10 flex items-center justify-between">
              <span className="truncate">{p.nom_complet || p.email}</span>
              <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{p.role}</span>
            </button>
          ))}
          {!profils.length && !err && <div className="px-3 py-2 text-xs text-gray-400">Chargement…</div>}
        </div>
      )}
    </div>
  );
}

function ProtectedLayout({ children }) {
  const navigate = useNavigate();
  // Les plafonds viennent du serveur : le rail se redessine quand ils arrivent,
  // sans quoi il resterait celui de l'amorce jusqu'au prochain clic.
  usePlafonds();
  const [compteOuvert, setCompteOuvert] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /*
   * LA BARRE MESURE SA PROPRE HAUTEUR, ET LE RAIL LA LIT.
   *
   * Elle valait « 64 px » dans une demi-douzaine d'endroits, écrits à la main.
   * Or elle ne les fait pas toujours : une ligne de plus, un écran étroit, et
   * le rail passait DESSOUS — son premier libellé se retrouvait coupé par une
   * barre de la même couleur que lui, donc invisible à l'oeil et introuvable au
   * raisonnement. Trois fois que nous recomptons des pixels : on arrête de
   * compter, on mesure.
   */
  const refBarre = useRef(null);
  useEffect(() => {
    const el = refBarre.current;
    if (!el) return undefined;
    /*
     * CE QUI COMPTE, C'EST LE BAS DE LA BARRE — pas sa hauteur.
     *
     * En développement, un bandeau rayé la précède ; demain ce sera autre
     * chose. Mesurer la HAUTEUR donnait donc un chiffre juste et une position
     * fausse : le rail commençait plus haut que le bas de la barre et passait
     * dessous, ou s'en détachait de quelques dizaines de pixels. C'est le
     * même défaut que les « 64 px » écrits à la main, en plus subtil.
     *
     * On prend le BORD BAS dans la fenêtre. La barre étant collée en haut, il
     * décroît au défilement jusqu'à valoir sa hauteur — le rail suit, et il
     * n'y a jamais d'espace entre eux.
     */
    const poser = () => document.documentElement.style.setProperty(
      '--barre-h', Math.round(el.getBoundingClientRect().bottom) + 'px');
    poser();
    const obs = new ResizeObserver(poser);
    obs.observe(el);
    window.addEventListener('scroll', poser, { passive: true });
    window.addEventListener('resize', poser);
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', poser);
      window.removeEventListener('resize', poser);
    };
  }, []);
  const [annees, setAnnees] = useState([]);
  const [anneeActive, setAnneeActive] = useState(getAnnee());
  const [env, setEnv] = useState(null);
  const [versionIsNew, setVersionIsNew] = useState(false);
  const [nbNotifs, setNbNotifs] = useState(0);
  /* LA VERSION DU SERVEUR, DEMANDÉE UNE FOIS AU CHARGEMENT.
     Ce badge est compilé dans l'image du frontend : il n'a jamais parlé que de
     nginx. Les deux moitiés se déploient séparément et se sont déjà retrouvées
     sur deux versions différentes dans la même journée — on cherchait alors un
     bug dans du code qui ne tournait pas. `/api/version` est publique, comme
     `/api/health` : la version du frontend est déjà dans le bundle. */
  const [verServeur, setVerServeur] = useState(null);
  useEffect(() => {
    fetch('/api/version')
      .then(r => (r.ok ? r.json() : null))
      .then(j => setVerServeur(j?.version || null))
      .catch(() => setVerServeur(null));
  }, []);
  /* ON NE COMPARE QUE DES NUMÉROS DE VERSION, ET SEULEMENT QUAND ON EN A DEUX.
     Le serveur répond « dev » en local et l'écran « 2.12.61 » : ce n'est pas
     un écart de déploiement, c'est un poste de travail. Un signal qui crie
     tous les jours en développement est un signal qu'on apprend à ignorer —
     et il se tairait le jour où il compte. */
  const verServeurNum = verServeur ? numeroSeul(verServeur) : null;
  const versionDecalee = !!verServeurNum && verServeurNum.includes('.')
    && verServeurNum !== versionNum;

  // Polling notifications non lues (toutes les 60s)
  useEffect(() => {
    const chargerNotifs = () => {
      const tok = localStorage.getItem('token');
      if (!tok) return;
      fetch(`/api/historique/feed?jours=30`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : { nbNonLus: 0 })
        .then(d => setNbNotifs(d.nbNonLus || 0))
        .catch(() => {});
    };
    chargerNotifs();
    const timer = setInterval(chargerNotifs, 60000);
    return () => clearInterval(timer);
  }, []);

  // Détection d'une nouvelle version : compare la version courante à la dernière
  // version vue (stockée localement). Si différente → animation pendant 6s.
  useEffect(() => {
    try {
      const vue = localStorage.getItem('derniere_version_vue');
      if (vue !== versionNum) {
        // Nouvelle version (ou première visite avec une version connue)
        if (vue !== null) setVersionIsNew(true);
        localStorage.setItem('derniere_version_vue', versionNum);
        if (vue !== null) {
          const t = setTimeout(() => setVersionIsNew(false), 6000);
          return () => clearTimeout(t);
        }
      }
    } catch { /* localStorage indisponible — pas d'animation */ }
  }, []);

  useEffect(() => {
    api.annees().then(liste => {
      setAnnees(liste);
      // Auto-correction : si l'année mémorisée n'existe plus (ex. après un
      // renommage/suppression), basculer sur l'année active réelle (ou la
      // plus récente). Évite l'état "année fantôme" où plus aucun bouton
      // de création n'apparaît.
      if (liste && liste.length > 0) {
        const courante = getAnnee();
        const existe = liste.some(a => a.code === courante);
        const active = (liste.find(a => a.active) || liste[0]).code;

        // L'année mémorisée n'existe plus : on bascule sans discuter.
        if (!existe) {
          setAnnee(active); setAnneeActive(active);
          return;
        }

        // L'année mémorisée existe mais n'est plus l'année active, et
        // l'utilisateur ne l'a pas choisie lui-même : on s'aligne sur le
        // serveur. Sans cela, un navigateur restait indéfiniment sur l'année
        // précédente après la bascule de rentrée, tous les écrans avec lui.
        const choixExplicite = localStorage.getItem('annee_choisie');
        if (courante !== active && choixExplicite !== courante) {
          setAnnee(active); setAnneeActive(active);
          window.location.reload();
        }
      }
    }).catch(() => {});
    fetch('/api/info').then(r => r.json()).then(d => setEnv(d.environnement)).catch(() => {});
  }, []);

  // LE MODE D'AFFICHAGE EST UN RÉGLAGE DE L'APPLICATION : il vit dans la barre
  // du haut, seul point fixe de l'écran. Déclaré ici, AVANT tout retour
  // conditionnel — un crochet placé après « if (!isAuthenticated()) return »
  // change l'ordre des crochets d'un rendu à l'autre, ce que React refuse.
  const mode = useMode();

  function changeAnnee(code) {
    setAnnee(code);
    setAnneeActive(code);
    // Un choix délibéré : il tient jusqu'à ce que l'utilisateur en fasse un
    // autre, même si l'année active du serveur change entre-temps.
    localStorage.setItem('annee_choisie', code);
    window.location.reload(); // recharge toutes les données
  }

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const u = getUser();

  // Le menu suit les PERMISSIONS, non le rôle. Il testait auparavant
  // « role === coordination » pour ne montrer que deux entrées, alors que le
  // système de permissions accorde à la coordination un droit de validation sur
  // les étudiants : l'onglet était masqué à des gens qui y avaient droit.
  /*
   * CINQ AXES, ET CHACUN RÉPOND À UNE QUESTION.
   *
   * · COMMUNICATION DISPARAÎT. L'axe ne portait qu'un constructeur de listes
   *   et deux raccourcis de documents — c'est exactement ce que fait le centre
   *   d'impression. Une porte de moins pour le même geste.
   *
   * · ACCUEIL ET PILOTAGE FUSIONNENT en « Tableau de bord ». « Ce qui
   *   m'attend » et « où en sommes-nous » sont la même question posée à deux
   *   échelles ; ce qui les séparait n'était pas leur nature mais leur
   *   confidentialité — et la confidentialité se règle par le rôle, pas par un
   *   onglet. La direction y voit tout, une coordination sa section.
   *
   * · GESTION NAÎT, et c'est le vrai gain : ce qu'on ENGAGE — dotation,
   *   budget, répartition — quitte ce qu'on CONSULTE. Un écran qu'on lit et un
   *   écran où l'on décide ne peuvent pas porter le même cadenas.
   */
  const AXES = [
    ['/accueil',       'Tableau de bord', IconHome,           null],
    ['/etudiants',     'Étudiants',       IconChecklist,      'etudiants'],
    ['/professeurs',   'Personnel',       IconUsers,          'personnel'],
    /* L'ICÔNE D'UN AXE EST LA MÊME DANS LA BARRE ET DANS SON RAIL, et elle
       n'appartient qu'à lui. Organisation portait IconClipboardList ici et
       IconBooks dans son rail : deux dessins pour un même territoire, et le
       presse-papiers désignait DÉJÀ l'onglet « Inscriptions & PAE » de l'axe
       Étudiants. Organisation est l'axe des unités, des cours et des
       référentiels — des livres —, ce qui rend le presse-papiers au PAE, qui
       est littéralement une liste à cocher. */
    ['/organisation',  'Organisation',    IconBooks,          'attributions'],
    ['/gestion',       'Gestion',         IconChartBar,       'dotation'],
  ];

  const nav = AXES
    .filter(([, , , module]) => !module || droitEffectif(u, module) !== 'rien')
    .map(([to, lbl, Icon]) => [to, lbl, Icon]);

  /* L'AIDE DEVIENT LA DOCUMENTATION, ET C'EST UNE ABSORPTION, PAS UN AJOUT.
   *
   * Deux portes pour « savoir » en auraient fait une de trop : un enseignant
   * aurait cherché la circulaire examens dans l'une et le mode d'emploi du PAE
   * dans l'autre, sans pouvoir deviner laquelle. L'écran porte donc deux
   * faces — les TEXTES qui s'imposent, et le MODE D'EMPLOI de l'outil — et il
   * garde la place et l'icône que l'aide occupait déjà dans la barre. */
  nav.push(['/documentation', '', IconHelpCircle]);
  if (estDirection(u)) nav.push(['/configuration', 'Config.', IconSettings]);

  return (
    <div className="min-h-screen flex flex-col">
      <PreviewBanner />
      {env === 'dev' && (
        <div style={{
          background: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 12px, #d97706 12px, #d97706 24px)',
          color: 'white', textAlign: 'center', padding: '4px 12px',
          fontSize: '12px', fontWeight: 700, letterSpacing: '2px',
          textShadow: '0 1px 2px rgba(0,0,0,.3)',
        }}>
          ⚠ ENVIRONNEMENT DE DÉVELOPPEMENT — DONNÉES FICTIVES ⚠
        </div>
      )}
      {/* LA BARRE DU HAUT RESTE ENTIÈRE, d'un bord à l'autre : deux panneaux
          détachés sur le même écran, c'est un panneau de trop — il faut un
          point fixe, et c'est elle. Elle suit en revanche le mode des menus,
          sans quoi l'on retomberait sur deux espaces qui ne se parlent pas. */}
      <header ref={refBarre} className="barre-haut px-3 md:px-6 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3">
          {/* Burger mobile */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden text-gray-700 hover:text-iip-turquoise p-1"
            aria-label="Menu">
            {menuOpen ? <IconX size={24} /> : <IconMenu2 size={24} />}
          </button>

          <div className="flex-none">
            <svg className="logo-lucie" width="90" height="28" viewBox="0 0 140 44"
              xmlns="http://www.w3.org/2000/svg">
              {/* Symbole L compact */}
              <g stroke="#1B2B4B" strokeOpacity=".06" fill="none" strokeWidth="1.2" strokeLinecap="round">
                <line x1="5" y1="14" x2="12" y2="6"/><line x1="5" y1="14" x2="16" y2="23"/>
                <line x1="12" y1="6" x2="23" y2="8"/><line x1="16" y1="23" x2="23" y2="8"/>
                <line x1="16" y1="23" x2="23" y2="32"/><line x1="23" y1="8" x2="36" y2="14"/>
                <line x1="36" y1="14" x2="42" y2="32"/>
              </g>
              <g stroke="#00AACC" strokeOpacity=".35" fill="none" strokeWidth="1.2" strokeLinecap="round">
                <line x1="5" y1="14" x2="16" y2="23"/><line x1="12" y1="6" x2="23" y2="8"/>
                <line x1="16" y1="23" x2="23" y2="32"/><line x1="23" y1="8" x2="36" y2="14"/>
                <line x1="23" y1="32" x2="42" y2="32"/>
              </g>
              <g stroke="#00AACC" strokeOpacity=".85" fill="none" strokeWidth="2.2" strokeLinecap="round">
                <line x1="12" y1="6" x2="12" y2="32"/>
                <line x1="12" y1="32" x2="42" y2="32"/>
              </g>
              <circle cx="5"  cy="14" r="1.8" fill="#1B2B4B" fillOpacity=".1"/>
              <circle cx="23" cy="8"  r="1.8" fill="#1B2B4B" fillOpacity=".12"/>
              <circle cx="36" cy="14" r="1.6" fill="#1B2B4B" fillOpacity=".08"/>
              <circle cx="16" cy="23" r="1.8" fill="#00AACC" fillOpacity=".5"/>
              <circle cx="12" cy="6"  r="3.2" fill="#00AACC"/>
              <circle cx="12" cy="32" r="3.6" fill="#00AACC"/>
              <circle cx="42" cy="32" r="3.2" fill="#00AACC"/>
              <circle cx="12" cy="6"  r="1.4" fill="white" fillOpacity=".7"/>
              <circle cx="12" cy="32" r="1.6" fill="white" fillOpacity=".65"/>
              <circle cx="42" cy="32" r="1.4" fill="white" fillOpacity=".7"/>
              {/* Texte "Lucie" */}
              <text x="52" y="30"
                fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif"
                fontSize="22" fontWeight="700" letterSpacing="-0.5"
                fill="#1B2B4B">Lucie</text>
            </svg>
          </div>

          {/* Sélecteur d'année */}
          <select value={anneeActive} onChange={e => changeAnnee(e.target.value)}
            className="champ-barre rounded-champ px-2.5 py-1.5 h-9 text-sm font-semibold
              focus:outline-none focus:ring-2 focus:ring-iip-turquoise/40 cursor-pointer">
            {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
            {annees.length === 0 && <option value={anneeActive}>{anneeActive}</option>}
          </select>
          {/* Nav desktop */}
          <nav className="hidden md:flex gap-0.5 flex-1 ml-3">
            {nav.map(([to, lbl, Icon]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-champ text-sm
                 transition-colors duration-150 ease-ios ${
                  isActive ? 'onglet-actif font-semibold' : 'onglet-dormant'
                }`
              }>
                <span className="relative flex-shrink-0">
                  {Icon && <Icon size={17} stroke={1.8} />}
                  {to === '/accueil' && nbNotifs > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-iip-turquoise rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                      {nbNotifs > 9 ? '9+' : nbNotifs}
                    </span>
                  )}
                </span>
                <span>{lbl}</span>
              </NavLink>
            ))}
          </nav>

          {/* User info + version */}
          <div className="flex items-center gap-3 text-sm flex-shrink-0">
            {/* LE MODE EST UN RÉGLAGE DE L'APPLICATION, PAS DE L'ÉCRAN.
                Il vivait en pied de rail : un réglage qui vaut pour toute
                Lucie, rangé dans un objet qui change à chaque écran, et
                d'autant plus bas que l'écran avait de rubriques. Il rejoint la
                barre du haut, qui est le seul point fixe — à côté de la
                version et du compte, avec les autres choses qui ne dépendent
                pas de là où l'on se trouve. */}
            <button onClick={basculerMode} aria-label="Changer le mode d'affichage"
              title={mode === 'sombre' ? 'Menus en gris pâle' : 'Menus en marine'}
              className="w-8 h-8 grid place-items-center rounded-champ text-slate-400
                         hover:text-iip-blue hover:bg-slate-100 transition-colors duration-150">
              {mode === 'sombre' ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
            {import.meta.env.VITE_DEMO_MODE === 'true' && (
              <span className="bg-orange-500 text-white font-bold px-2.5 py-0.5 rounded-md text-[11px] tracking-widest uppercase animate-pulse">
                DÉMO
              </span>
            )}
            <span
              /* SUR UNE BARRE MARINE, UNE PASTILLE MARINE DISPARAÎT : le badge
                 prend la surface des menus, comme l'onglet actif.
                 ET IL DIT MAINTENANT LES DEUX MOITIÉS. Ce badge est compilé
                 dans l'image du frontend : il n'a jamais parlé que de nginx.
                 Le backend se déploie séparément, et les deux se sont déjà
                 retrouvés sur deux versions différentes dans la même journée —
                 `docker compose up -d` répond « Running » sans avoir remplacé
                 le conteneur. On cherchait alors un bug dans du code qui ne
                 tournait pas, et RIEN à l'écran ne le disait. */
              className={`relative pastille-version font-semibold
                text-[11px] hidden md:inline-flex ${versionIsNew ? 'version-badge-new' : ''}
                ${versionDecalee ? 'ring-1 ring-[#B45309]' : ''}`}
              title={versionDecalee
                ? `ÉCART DE DÉPLOIEMENT — écran ${versionNum}, serveur `
                  + `${verServeurNum}. Une moitié n'a pas été remplacée : `
                  + 'docker compose up -d --force-recreate.'
                : versionIsNew ? 'Nouvelle version déployée\u00a0!'
                  : `Version ${versionNum}`}>
              v{versionNum}
              {versionDecalee && (
                <span className="ml-1 text-[#B45309]">≠ {verServeurNum}</span>
              )}
              {versionIsNew && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iip-turquoise opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-iip-turquoise"></span>
                </span>
              )}
            </span>
            {/* LE COMPTE TIENT SUR UNE LIGNE.
                Nom complet, rôle et « Déconnexion » s'empilaient sur trois
                lignes et imposaient leur hauteur à toute la barre — donc au
                rail, qui s'y raccroche, et à la zone de travail tout entière.
                Les initiales, le rôle abrégé et la porte : trois objets de la
                même hauteur, sur le même axe que le mode et la version. */}
            <span className="flex items-center gap-2">
              <VoirCommePicker />
              <span className="text-[11px] text-iip-turquoise font-semibold uppercase tracking-wide
                               hidden sm:inline" title={u?.role}>
                {ROLE_COURT[u?.role] || u?.role}
              </span>
              {/* MON COMPTE — une icône, à côté de la porte de sortie.
                  C'est le seul endroit fixe de l'application : un réglage qui
                  vaut pour la personne et non pour l'écran n'a rien à faire
                  dans un rail qui change à chaque clic. */}
              <button onClick={() => setCompteOuvert(true)}
                title="Mon compte — vérification en deux temps" aria-label="Mon compte"
                className="w-8 h-8 grid place-items-center rounded-champ text-slate-400
                           hover:text-iip-blue hover:bg-slate-100 transition-colors duration-150">
                <IconShieldLock size={16} />
              </button>
              <button onClick={() => { oublierPlafonds(); api.logout(); navigate('/login'); }}
                title="Se déconnecter" aria-label="Se déconnecter"
                className="w-8 h-8 grid place-items-center rounded-champ text-slate-400
                           hover:text-iip-blue hover:bg-slate-100 transition-colors duration-150">
                <IconLogout size={16} />
              </button>
            </span>
          </div>
        </div>

        {/* Menu mobile déroulant */}
        {menuOpen && (
          <nav className="md:hidden mt-3 pb-2 border-t border-gray-100 pt-2 flex flex-col gap-1">
            <div className="text-xs text-gray-500 px-3 py-1">{u?.nom || u?.email} · <span className="text-iip-turquoise">{u?.role}</span></div>
            {nav.map(([to, lbl, Icon]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'onglet-actif' : 'onglet-dormant'
                }`
              }>
                {Icon && <Icon size={18} stroke={1.8} />}
                <span>{lbl}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      {compteOuvert && <MonCompte onFermer={() => setCompteOuvert(false)} />}
      <BuildBadge />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"             element={<Navigate to="/accueil" replace />} />
      <Route path="/attributions" element={<Navigate to="/organisation" replace />} />
      <Route path="/professeurs"  element={<ProtectedLayout><Professeurs /></ProtectedLayout>} />
      <Route path="/accueil"      element={<ProtectedLayout><AxeAccueil /></ProtectedLayout>} />
      <Route path="/organisation" element={<ProtectedLayout><Organisation /></ProtectedLayout>} />
      <Route path="/etudiants"    element={<ProtectedLayout><AxeEtudiants /></ProtectedLayout>} />
      {/* COMMUNICATION A DISPARU : ses listes sont dans le centre d'impression. */}
      <Route path="/communication" element={<Navigate to="/accueil" replace />} />
      <Route path="/recrutement"   element={<ProtectedLayout><AdminOrRH><Recrutement /></AdminOrRH></ProtectedLayout>} />
      <Route path="/dcpp/:profId" element={<ProtectedLayout><DCPP /></ProtectedLayout>} />
      {/* LA PAGE N'A PLUS DE PORTE, ET N'EN AVAIT PLUS DEPUIS L'AXE COMMUNICATION.
          Le constructeur de listes vit dans le centre d'impression, sous la
          bascule « Listes » : il s'ouvre depuis n'importe quel axe. La route
          ne servait plus qu'aux signets — d'où une redirection, et non une
          suppression : un signet qui tombe sur du vide fait croire à une
          panne, et l'on cherche ce qu'on a cassé. Le COMPOSANT reste, il est
          rendu par le centre d'impression. */}
      <Route path="/listes" element={<Navigate to="/accueil" replace />} />
      {/* CES ROUTES N'ONT PLUS DE PORTE, ET CE N'EST PAS UN OUBLI.
          /procedures, /besoins, /classement, /disciplinaire, /planification :
          aucun rail n'y mène, parce que leurs écrans sont devenus des ONGLETS.
          Elles rendent pourtant le bon écran, avec le bon onglet déjà ouvert —
          ce sont des raccourcis, pas des restes.

          /procedures en particulier NE DOIT PAS DISPARAÎTRE : deux échéances
          de l'échéancier y pointent par `lien_interne`, et elles portent une
          base légale (D. 16/04/1991 art. 123ter §4). La supprimer casserait
          des rappels d'obligations, silencieusement.

          Écrit ici parce que « aucun lien n'y mène » se lit « code mort », et
          qu'on l'a cru une fois. */}
      <Route path="/procedures" element={
        <ProtectedLayout>
          <Suspense fallback={<div className="p-8 text-gray-400">Chargement…</div>}>
            <Procedures />
          </Suspense>
        </ProtectedLayout>
      } />
      <Route path="/ea12"          element={<ProtectedLayout><EA12List /></ProtectedLayout>} />
      <Route path="/ea12/:id"      element={<ProtectedLayout><EA12Editor /></ProtectedLayout>} />
      <Route path="/echeancier"     element={<ProtectedLayout><Echeancier /></ProtectedLayout>} /> {/* conservé : liens des rappels */}
      {/* BESOINS ET CLASSEMENT SONT DES RUBRIQUES DE PERSONNEL, et ils s'y
          montent désormais. Ces deux routes restent servies pour les liens
          notés, et mènent à l'axe — qui les ouvre avec son rail, au lieu de
          les ouvrir sans. */}
      <Route path="/besoins"        element={<ProtectedLayout><Professeurs vue="besoins" /></ProtectedLayout>} />
      <Route path="/classement"     element={<ProtectedLayout><Professeurs vue="classement" /></ProtectedLayout>} />
      {/* GESTION — ce qu'on engage. « /pilotage » reste servi pour les liens
          déjà notés ou mis en favori, et mène au tableau de bord. */}
      <Route path="/gestion"        element={<ProtectedLayout><Pilotage vue="gestion" /></ProtectedLayout>} />
      <Route path="/pilotage"       element={<Navigate to="/accueil" replace />} />
      <Route path="/planification"  element={<ProtectedLayout><Organisation ongletInitial="planification" /></ProtectedLayout>} />
      <Route path="/documentation"  element={<ProtectedLayout><Suspense fallback={<div className="p-6 text-sm text-slate-400">Chargement…</div>}><Documentation /></Suspense></ProtectedLayout>} />
      {/* L'ancienne adresse continue de mener quelque part : un lien noté dans
          un courriel ou un signet ne doit pas tomber dans le vide. */}
      <Route path="/aide"           element={<Navigate to="/documentation" replace />} />
      <Route path="/attestation"   element={<ProtectedLayout><Attestation /></ProtectedLayout>} />
      <Route path="/disciplinaire" element={<ProtectedLayout><Disciplinaire /></ProtectedLayout>} />
      {/* CES ÉCRANS ONT DÉJÀ LEUR PLACE — ON N'EN OUVRE PAS UNE SECONDE.
          `Users`, `Annees`, `Referentiels` et `Editeur` sont DÉJÀ rendus comme
          onglets de Configuration, et `DUE` comme onglet d'Organisation. Ces
          routes-ci montaient les MÊMES composants tout seuls, hors de leur axe
          — donc sans rail : on cliquait, la navigation disparaissait, et il ne
          restait que la touche Précédent. Ce n'était pas un rail manquant,
          c'était une seconde porte vers une pièce qui en avait déjà une.
          Elles restent servies, pour les liens notés et les favoris, mais
          elles mènent désormais à la place qui existe. */}
      <Route path="/utilisateurs"   element={<Navigate to="/configuration?onglet=users" replace />} />
      <Route path="/annees"         element={<Navigate to="/configuration?onglet=annees" replace />} />
      <Route path="/referentiels"   element={<Navigate to="/configuration?onglet=referentiel-annee" replace />} />
      <Route path="/editeur"        element={<Navigate to="/configuration?onglet=editeur" replace />} />
      <Route path="/configuration"  element={<ProtectedLayout><Configuration /></ProtectedLayout>} />
      <Route path="/due"            element={<ProtectedLayout><Organisation ongletInitial="due" /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
