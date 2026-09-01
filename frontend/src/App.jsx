import { useState, useEffect, Component } from 'react';
import { estDirection } from './lib/modules.js';

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
import VoletLateral from './components/VoletLateral.jsx';
import { isAuthenticated, getUser, api, getAnnee, setAnnee } from './lib/api.js';
import {
  IconClipboardList, IconUsers, IconFileExport, IconChecklist,
  IconChartBar, IconCalendarStats, IconEdit, IconSettings, IconLogout, IconMenu2, IconX,
  IconHome, IconBell, IconHelpCircle, IconGavel,
} from '@tabler/icons-react';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attributions from './pages/Attributions.jsx';
import Professeurs from './pages/Professeurs.jsx';
import DCPP from './pages/DCPP.jsx';
import Recrutement from './pages/Recrutement.jsx';
import Accueil from './pages/Accueil.jsx';
import { lazy, Suspense } from 'react';
const Listes     = lazy(() => import('./pages/Listes.jsx'));
const Editeur    = lazy(() => import('./pages/Editeur.jsx'));
const Procedures = lazy(() => import('./pages/Procedures.jsx'));
import Users from './pages/Users.jsx';
import Annees from './pages/Annees.jsx';
import Configuration from './pages/Configuration.jsx';
import EA12List from './pages/EA12List.jsx';
import EA12Editor from './pages/EA12Editor.jsx';
import Referentiels from './pages/Referentiels.jsx';
import Pilotage from './pages/Pilotage.jsx';
import Planification from './pages/Planification.jsx';
import Aide from './pages/Aide.jsx';
import Attestation from './pages/Attestation.jsx';
import Disciplinaire from './pages/Disciplinaire.jsx';
import Echeancier from './pages/Echeancier.jsx';
import Besoins from './pages/Besoins.jsx';
import Organisation from './pages/Organisation.jsx';
import Classement from './pages/Classement.jsx';
import { AxeAccueil, AxeEtudiants, AxeCommunication } from './pages/Axes.jsx';
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
const _isVersion = BUILD_VER.includes('.');
const versionNum = _isVersion ? BUILD_VER.split('+')[0] : '3.0.0'; // fallback hardcodé
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

function VoirCommePicker() {
  const [open, setOpen] = useState(false);
  const [profils, setProfils] = useState([]);
  const [err, setErr] = useState('');
  const u = getUser();
  if (!estDirection(u) || u?.preview) {
    return <span className="text-gray-700 font-medium text-sm">{u?.nom || u?.email}</span>;
  }
  const ouvrir = () => {
    setOpen(o => !o);
    if (!profils.length) api.profilsAcces().then(d => setProfils(Array.isArray(d) ? d : [])).catch(e => setErr(e.message));
  };
  const voir = (id) => { api.impersonate(id).then(() => { window.location.href = '/'; }).catch(e => alert(e.message)); };
  return (
    <div className="relative">
      <button onClick={ouvrir} title="Voir Lucie comme un autre profil"
        className="text-gray-700 font-medium text-sm hover:text-iip-blue flex items-center gap-1">
        {u?.nom || u?.email} <span className="text-[10px] text-gray-400">▾</span>
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
  const [menuOpen, setMenuOpen] = useState(false);
  // Le volet replié est une préférence durable : sur un portable, 210 px pris
  // à la largeur se paient sur les tableaux.
  const [voletReplie, setVoletReplie] = useState(() => {
    try { return localStorage.getItem('volet_replie') === '1'; } catch { return false; }
  });
  const [annees, setAnnees] = useState([]);
  const [anneeActive, setAnneeActive] = useState(getAnnee());
  const [env, setEnv] = useState(null);
  const [versionIsNew, setVersionIsNew] = useState(false);
  const [nbNotifs, setNbNotifs] = useState(0);

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

  const isCoordination = u?.role === 'coordination';

  // Structure en 7 axes (maquette validée) : chaque entrée répond à une
  // question de l'utilisateur ; les rôles taillent le bandeau.
  // Sept axes en ligne se lisaient mal : ils se rangent en trois familles.
  // Les rôles taillent le volet, comme ils taillaient le bandeau.
  const familles = isCoordination
    ? [
        { titre: '', entrees: [
          ['/accueil',      'Accueil',      IconHome],
          ['/organisation', 'Organisation', IconClipboardList],
        ] },
      ]
    : [
        { titre: 'Suivi', entrees: [
          ['/accueil',     'Accueil',   IconHome],
          ['/etudiants',   'Étudiants', IconChecklist],
          ['/professeurs', 'Personnel', IconUsers],
        ] },
        { titre: 'Gestion', entrees: [
          ['/organisation',  'Organisation',  IconClipboardList],
          ['/communication', 'Communication', IconFileExport],
          ['/pilotage',      'Pilotage',      IconChartBar],
        ] },
      ];

  const bas = { titre: '', entrees: [] };
  if (estDirection(u)) bas.entrees.push(['/configuration', 'Configuration', IconSettings]);
  bas.entrees.push(['/aide', 'Aide', IconHelpCircle]);
  familles.push(bas);

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
      {/* Deux colonnes : la NAVIGATION à gauche, le CONTEXTE de travail en haut.
          L'année active et la recherche restent accessibles en permanence. */}
      <div className="flex-1 flex min-h-0">
        <VoletLateral
          familles={familles} replie={voletReplie}
          onReplier={() => {
            const v = !voletReplie;
            setVoletReplie(v);
            try { localStorage.setItem('volet_replie', v ? '1' : '0'); } catch {}
          }}
          u={u} nbNotifs={nbNotifs} versionNum={versionNum} versionIsNew={versionIsNew}
          onDeconnexion={() => { api.logout(); navigate('/login'); }}
          ouvertMobile={menuOpen} onFermerMobile={() => setMenuOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-iip-gold/30 px-3 md:px-5 py-2.5
                             sticky top-0 z-20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setMenuOpen(o => !o)}
                  className="md:hidden text-gray-700 hover:text-iip-turquoise p-1"
                  aria-label="Menu">
                  {menuOpen ? <IconX size={22} /> : <IconMenu2 size={22} />}
                </button>

                <select value={anneeActive} onChange={e => changeAnnee(e.target.value)}
                  className="border border-iip-blue/30 rounded-lg px-2.5 py-1.5 h-9 text-sm
                             font-semibold text-iip-blue bg-white focus:outline-none
                             focus:ring-2 focus:ring-iip-turquoise/40 cursor-pointer">
                  {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
                  {annees.length === 0 && <option value={anneeActive}>{anneeActive}</option>}
                </select>
              </div>

              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                {import.meta.env.VITE_DEMO_MODE === 'true' && (
                  <span className="bg-orange-500 text-white font-bold px-2.5 py-0.5 rounded-md
                                   text-[11px] tracking-widest uppercase animate-pulse">
                    DÉMO
                  </span>
                )}
                <VoirCommePicker />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
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
      <Route path="/communication" element={<ProtectedLayout><AxeCommunication /></ProtectedLayout>} />
      <Route path="/recrutement"   element={<ProtectedLayout><AdminOrRH><Recrutement /></AdminOrRH></ProtectedLayout>} />
      <Route path="/dcpp/:profId" element={<ProtectedLayout><DCPP /></ProtectedLayout>} />
      <Route path="/listes" element={
        <ProtectedLayout>
          <Suspense fallback={<div className="p-8 text-gray-400">Chargement…</div>}>
            <Listes />
          </Suspense>
        </ProtectedLayout>
      } />
      <Route path="/procedures" element={
        <ProtectedLayout>
          <Suspense fallback={<div className="p-8 text-gray-400">Chargement…</div>}>
            <Procedures />
          </Suspense>
        </ProtectedLayout>
      } />
      <Route path="/editeur" element={
        <ProtectedLayout>
          <Suspense fallback={<div className="p-8 text-gray-400">Chargement de l'éditeur…</div>}>
            <Editeur />
          </Suspense>
        </ProtectedLayout>
      } />
      <Route path="/ea12"          element={<ProtectedLayout><EA12List /></ProtectedLayout>} />
      <Route path="/ea12/:id"      element={<ProtectedLayout><EA12Editor /></ProtectedLayout>} />
      <Route path="/echeancier"     element={<ProtectedLayout><Echeancier /></ProtectedLayout>} /> {/* conservé : liens des rappels */}
      <Route path="/besoins"        element={<ProtectedLayout><Besoins /></ProtectedLayout>} />
      <Route path="/classement"     element={<ProtectedLayout><Classement /></ProtectedLayout>} />
      <Route path="/pilotage"       element={<ProtectedLayout><Pilotage /></ProtectedLayout>} />
      <Route path="/planification"  element={<ProtectedLayout><Organisation ongletInitial="planification" /></ProtectedLayout>} />
      <Route path="/aide"           element={<ProtectedLayout><Aide /></ProtectedLayout>} />
      <Route path="/attestation"   element={<ProtectedLayout><Attestation /></ProtectedLayout>} />
      <Route path="/disciplinaire" element={<ProtectedLayout><Disciplinaire /></ProtectedLayout>} />
      <Route path="/utilisateurs" element={<ProtectedLayout><Users /></ProtectedLayout>} />
      <Route path="/annees"         element={<ProtectedLayout><Annees /></ProtectedLayout>} />
      <Route path="/configuration"  element={<ProtectedLayout><Configuration /></ProtectedLayout>} />
      <Route path="/referentiels"   element={<ProtectedLayout><Referentiels /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
