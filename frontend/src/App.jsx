import { useState, useEffect, Component } from 'react';

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
import { isAuthenticated, getUser, api, getAnnee, setAnnee, getUnite, setUnite } from './lib/api.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attributions from './pages/Attributions.jsx';
import Professeurs from './pages/Professeurs.jsx';
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
const versionNum = _isVersion ? BUILD_VER.split('+')[0] : '2.10.0'; // fallback hardcodé
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

function ProtectedLayout({ children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unite, setUniteState] = useState(getUnite());
  const [annees, setAnnees] = useState([]);
  const [anneeActive, setAnneeActive] = useState(getAnnee());
  const [env, setEnv] = useState(null);
  const [versionIsNew, setVersionIsNew] = useState(false);

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
        if (!existe) {
          const cible = (liste.find(a => a.active) || liste[0]).code;
          setAnnee(cible);
          setAnneeActive(cible);
        }
      }
    }).catch(() => {});
    fetch('/api/info').then(r => r.json()).then(d => setEnv(d.environnement)).catch(() => {});
  }, []);

  function changeAnnee(code) {
    setAnnee(code);
    setAnneeActive(code);
    window.location.reload(); // recharge toutes les données
  }

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const u = getUser();

  const isCoordination = u?.role === 'coordination';

  const nav = isCoordination
    ? [
        ['/attributions', 'Attributions']
      ]
    : [
        ['/attributions', 'Attributions'],
        ['/professeurs',  'Personnel'],
        ['/listes',       'Listes'],
        ['/procedures',   '⚖ Procédures'],
        ['/pilotage',       '📊 Pilotage'],
        ['/planification',  '📐 Planification'],
        // EA12 masqué en prod (LibreOffice absent du Dockerfile prod)
        // ...(u?.role === 'admin' ? [['/ea12', 'EA12']] : []),
      ];
  if (u?.role === 'admin') nav.push(['/editeur', '📝 Éditeur']);
  if (u?.role === 'admin') nav.push(['/configuration', '⚙ Configuration']);

  return (
    <div className="min-h-screen flex flex-col">
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
      <header className="bg-white border-b border-iip-gold/30 px-3 md:px-6 py-3 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          {/* Burger mobile */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden text-gray-700 hover:text-iip-gold p-1"
            aria-label="Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/>
                : <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18"/>}
            </svg>
          </button>

          <div className="flex-none">
            <svg width="90" height="28" viewBox="0 0 140 44" xmlns="http://www.w3.org/2000/svg">
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
            className="border border-iip-gold/40 rounded px-2 py-1 text-sm font-semibold text-iip-gold bg-white focus:outline-none focus:ring-1 focus:ring-iip-gold cursor-pointer">
            {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
            {annees.length === 0 && <option value={anneeActive}>{anneeActive}</option>}
          </select>

          {/* Toggle unité de saisie Périodes / Heures */}
          <button onClick={() => {
              const next = unite === 'heures' ? 'periodes' : 'heures';
              setUniteState(next); setUnite(next);
              window.dispatchEvent(new Event('unite-change'));
            }}
            title="Basculer l'affichage des attributions entre périodes et heures (le stockage reste en périodes)"
            className="border border-iip-mauve/40 rounded px-2 py-1 text-sm font-semibold text-iip-mauve bg-white hover:bg-iip-mauve/5 cursor-pointer flex items-center gap-1">
            {unite === 'heures' ? '⏱ Heures' : '⏳ Périodes'}
          </button>

          {/* Nav desktop */}
          <nav className="hidden md:flex gap-1 flex-1 ml-4">
            {nav.map(([to, lbl]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `nav-underline px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                  isActive ? 'bg-iip-gold text-white nav-active' : 'text-gray-700 hover:bg-iip-gold/10'
                }`
              }>{lbl}</NavLink>
            ))}
          </nav>

          {/* User info + version */}
          <div className="flex items-center gap-3 text-sm flex-shrink-0">
            <span
              className={`relative bg-iip-gold text-white font-bold px-2 py-0.5 rounded text-[11px] tracking-wide hidden md:inline ${versionIsNew ? 'version-badge-new' : ''}`}
              title={versionIsNew ? 'Nouvelle version déployée\u00a0!' : `Version ${versionNum}`}>
              v{versionNum}
              {versionIsNew && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iip-orange opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-iip-orange"></span>
                </span>
              )}
            </span>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-gray-700 font-medium text-sm">{u?.nom || u?.email}</span>
              <span className="text-xs text-iip-mauve font-semibold">{u?.role}</span>
              <button onClick={() => { api.logout(); navigate('/login'); }}
                className="text-xs text-gray-400 hover:text-iip-orange transition mt-0.5">
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Menu mobile déroulant */}
        {menuOpen && (
          <nav className="md:hidden mt-3 pb-2 border-t border-gray-100 pt-2 flex flex-col gap-1">
            <div className="text-xs text-gray-500 px-3 py-1">{u?.nom || u?.email} · <span className="text-iip-mauve">{u?.role}</span></div>
            {nav.map(([to, lbl]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? 'bg-iip-gold text-white' : 'text-gray-700 hover:bg-iip-gold/10'
                }`
              }>{lbl}</NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <BuildBadge />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"             element={<Navigate to="/attributions" replace />} />
      <Route path="/attributions" element={<ProtectedLayout><Attributions /></ProtectedLayout>} />
      <Route path="/professeurs"  element={<ProtectedLayout><Professeurs /></ProtectedLayout>} />
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
      <Route path="/pilotage"       element={<ProtectedLayout><Pilotage /></ProtectedLayout>} />
      <Route path="/planification"  element={<ProtectedLayout><Planification /></ProtectedLayout>} />
      <Route path="/utilisateurs" element={<ProtectedLayout><Users /></ProtectedLayout>} />
      <Route path="/annees"         element={<ProtectedLayout><Annees /></ProtectedLayout>} />
      <Route path="/configuration"  element={<ProtectedLayout><Configuration /></ProtectedLayout>} />
      <Route path="/referentiels"   element={<ProtectedLayout><Referentiels /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
