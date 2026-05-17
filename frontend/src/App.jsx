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
      <header className="bg-white border-b border-iip-gold/30 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="font-title text-2xl text-iip-gold font-bold">Attributions IIP</div>
          <nav className="flex gap-1">
            {nav.map(([to, lbl]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  isActive ? 'bg-iip-gold text-white' : 'text-gray-700 hover:bg-iip-gold/10'
                }`
              }>{lbl}</NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{u?.nom || u?.email}</span>
          <span className="text-xs bg-iip-mauve/15 text-iip-mauve px-2 py-0.5 rounded">{u?.role}</span>
          <button onClick={() => { api.logout(); navigate('/login'); }}
                  className="text-gray-500 hover:text-iip-orange text-sm">Déconnexion</button>
        </div>
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
