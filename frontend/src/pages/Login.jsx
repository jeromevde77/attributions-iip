import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api, isAuthenticated } from '../lib/api.js';

export default function Login() {
  if (isAuthenticated()) return <Navigate to="/" replace />;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await api.login(email, password); nav('/'); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-iip-gold/10 to-iip-mauve/10 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm border-t-4 border-iip-gold">
        <h1 className="font-title text-3xl text-iip-gold font-bold text-center mb-1">Attributions IIP</h1>
        <p className="text-center text-sm text-gray-500 mb-6">Institut Prigogine — connexion</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-iip-gold focus:border-iip-gold outline-none mb-4" />

        <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-iip-gold focus:border-iip-gold outline-none mb-4" />

        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2 mb-4">{error}</div>}

        <button type="submit" disabled={loading}
                className="w-full bg-iip-gold hover:bg-iip-amber text-white font-medium py-2 rounded-md transition disabled:opacity-50">
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
