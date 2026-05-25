import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, api, getAnnee, setAnnee } from './lib/api.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attributions from './pages/Attributions.jsx';
import Professeurs from './pages/Professeurs.jsx';
import Users from './pages/Users.jsx';
import Annees from './pages/Annees.jsx';
import Configuration from './pages/Configuration.jsx';
import EA12List from './pages/EA12List.jsx';
import EA12Editor from './pages/EA12Editor.jsx';
import Referentiels from './pages/Referentiels.jsx';

/* eslint-disable no-undef */
const BUILD_DATE_STR = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : new Date().toISOString();
const BUILD_VER = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';
/* eslint-enable no-undef */

const buildDate = new Date(BUILD_DATE_STR);
const buildLabel = buildDate.toLocaleString('fr-BE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});
const shortSha = BUILD_VER === 'dev' ? 'dev' : BUILD_VER.slice(0, 7);

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
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded px-2 py-1 shadow-sm text-xs text-gray-400 leading-tight">
        <div className="font-semibold text-gray-600 tabular-nums">{dateStr} {timeStr}</div>
        <div className="tabular-nums">build {buildLabel} · <span className="font-mono">{shortSha}</span></div>
      </div>
    </div>
  );
}

function ProtectedLayout({ children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [annees, setAnnees] = useState([]);
  const [anneeActive, setAnneeActive] = useState(getAnnee());
  const [env, setEnv] = useState(null);

  useEffect(() => {
    api.annees().then(setAnnees).catch(() => {});
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
        ['/',             'Tableau de bord'],
        ['/attributions', 'Attributions']
      ]
    : [
        ['/',             'Tableau de bord'],
        ['/attributions', 'Attributions'],
        ['/professeurs',  'Professeurs'],
        ...(u?.role === 'admin' ? [['/ea12', 'EA12']] : []),
      ];
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

          <div className="font-title text-base md:text-xl text-iip-gold font-bold flex-none truncate">
            <span className="md:hidden">IIP</span>
            <span className="hidden md:inline">Attributions IIP</span>
          </div>

          {/* Sélecteur d'année */}
          <select value={anneeActive} onChange={e => changeAnnee(e.target.value)}
            className="border border-iip-gold/40 rounded px-2 py-1 text-sm font-semibold text-iip-gold bg-white focus:outline-none focus:ring-1 focus:ring-iip-gold cursor-pointer">
            {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
            {annees.length === 0 && <option value={anneeActive}>{anneeActive}</option>}
          </select>

          {/* Nav desktop */}
          <nav className="hidden md:flex gap-1 flex-1 ml-4">
            {nav.map(([to, lbl]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  isActive ? 'bg-iip-gold text-white' : 'text-gray-700 hover:bg-iip-gold/10'
                }`
              }>{lbl}</NavLink>
            ))}
          </nav>

          {/* User info */}
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden md:flex items-center gap-2">
              <span className="text-gray-600">{u?.nom || u?.email}</span>
              <span className="text-xs bg-iip-mauve/15 text-iip-mauve px-2 py-0.5 rounded">{u?.role}</span>
            </div>
            <button onClick={() => { api.logout(); navigate('/login'); }}
                    className="text-gray-500 hover:text-iip-orange text-sm md:hidden p-1"
                    title="Déconnexion">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
            <button onClick={() => { api.logout(); navigate('/login'); }}
                    className="hidden md:inline text-gray-500 hover:text-iip-orange text-sm">Déconnexion</button>
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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"             element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/attributions" element={<ProtectedLayout><Attributions /></ProtectedLayout>} />
      <Route path="/professeurs"  element={<ProtectedLayout><Professeurs /></ProtectedLayout>} />
      <Route path="/ea12"          element={<ProtectedLayout><EA12List /></ProtectedLayout>} />
      <Route path="/ea12/:id"      element={<ProtectedLayout><EA12Editor /></ProtectedLayout>} />
      <Route path="/pilotage"     element={<Navigate to="/" replace />} />
      <Route path="/utilisateurs" element={<ProtectedLayout><Users /></ProtectedLayout>} />
      <Route path="/annees"         element={<ProtectedLayout><Annees /></ProtectedLayout>} />
      <Route path="/configuration"  element={<ProtectedLayout><Configuration /></ProtectedLayout>} />
      <Route path="/referentiels"   element={<ProtectedLayout><Referentiels /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
