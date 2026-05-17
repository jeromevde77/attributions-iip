import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, api } from './lib/api.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attributions from './pages/Attributions.jsx';
import Professeurs from './pages/Professeurs.jsx';
import Pilotage from './pages/Pilotage.jsx';
import Planning from './pages/Planning.jsx';
import Users from './pages/Users.jsx';

function ProtectedLayout({ children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const u = getUser();

  const nav = [
    ['/',             'Tableau de bord'],
    ['/attributions', 'Attributions'],
    ['/planning',     'Planning'],
    ['/professeurs',  'Professeurs'],
    ['/pilotage',     'Pilotage']
  ];
  if (u?.role === 'admin') nav.push(['/utilisateurs', 'Utilisateurs']);

  return (
    <div className="min-h-screen flex flex-col">
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

          <div className="font-title text-base md:text-2xl text-iip-gold font-bold flex-1 md:flex-none truncate">
            <span className="md:hidden">Attributions IIP</span>
            <span className="hidden md:inline">Attributions IIP — 2025-2026</span>
          </div>

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
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"             element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/attributions" element={<ProtectedLayout><Attributions /></ProtectedLayout>} />
      <Route path="/planning"     element={<ProtectedLayout><Planning /></ProtectedLayout>} />
      <Route path="/professeurs"  element={<ProtectedLayout><Professeurs /></ProtectedLayout>} />
      <Route path="/pilotage"     element={<ProtectedLayout><Pilotage /></ProtectedLayout>} />
      <Route path="/utilisateurs" element={<ProtectedLayout><Users /></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
