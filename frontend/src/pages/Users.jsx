import { useEffect, useState } from 'react';
import { getUser } from '../lib/api.js';
import { IconPlus, IconKey, IconTrash, IconAlertTriangle } from '@tabler/icons-react';

const ROLE_LABEL = {
  admin: 'Administrateur',
  editeur: 'Éditeur',
  coordination: 'Coordination',
  consultation: 'Consultation'
};

function authFetch(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...opts.headers
    }
  }).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  });
}

export default function Users({ embedded = false }) {
  const me = getUser();
  const [users, setUsers] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', nom_complet: '', role: 'editeur', password: '', sections: [] });
  const [editingSections, setEditingSections] = useState(null); // {userId, sections} quand on édite le périmètre
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([
        authFetch('/api/users'),
        authFetch('/api/ref/sections')
      ]);
      setUsers(u); setAllSections(s);
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createUser() {
    setError('');
    if (!form.email || !form.password) { setError('Email et mot de passe requis'); return; }
    if (form.role === 'coordination' && form.sections.length === 0) {
      setError('Une coordination doit avoir au moins une section assignée.'); return;
    }
    try {
      await authFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm({ email: '', nom_complet: '', role: 'editeur', password: '', sections: [] });
      load();
    } catch (e) { setError(e.message); }
  }

  async function toggleActif(u) {
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ actif: !u.actif }) });
    load();
  }

  async function resetPassword(u) {
    const pwd = prompt(`Nouveau mot de passe pour ${u.email} :`);
    if (!pwd) return;
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: pwd }) });
    alert('Mot de passe mis à jour.');
  }

  async function changeRole(u, role) {
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    load();
  }

  async function saveSections() {
    if (!editingSections) return;
    try {
      await authFetch(`/api/users/${editingSections.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sections: editingSections.sections })
      });
      setEditingSections(null);
      load();
    } catch (e) { alert(e.message); }
  }

  function toggleSectionInForm(code) {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(code)
        ? f.sections.filter(s => s !== code)
        : [...f.sections, code]
    }));
  }

  function toggleSectionInEdit(code) {
    setEditingSections(es => ({
      ...es,
      sections: es.sections.includes(code)
        ? es.sections.filter(s => s !== code)
        : [...es.sections, code]
    }));
  }

  async function deleteUser(u) {
    if (!confirm(`Supprimer ${u.email} ?`)) return;
    try {
      await authFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (e) { alert(e.message); }
  }

  if (me?.role !== 'admin') {
    return <div className="p-6 max-w-3xl mx-auto text-center text-gray-500">Accès réservé aux administrateurs.</div>;
  }

  return (
    <div className={embedded ? '' : 'p-6 max-w-5xl mx-auto'}>
      <div className="flex items-center justify-between mb-4">
        {!embedded && <h1 className="text-2xl font-title text-iip-gold">Utilisateurs</h1>}
        <button onClick={() => setShowForm(true)} className={`bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded font-medium inline-flex items-center gap-1.5 ${embedded ? 'ml-auto' : ''}`}>
          <IconPlus size={16} /> Nouvel utilisateur
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-3">{error}</div>}

      {loading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="grid-excel-soft">
            <thead>
              <tr>
                <th>Nom</th><th>Email</th><th>Rôle</th><th>Périmètre</th><th>Actif</th><th>Créé le</th><th>Dernière connexion</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="font-medium">{u.nom_complet}</td>
                  <td className="text-xs">{u.email}</td>
                  <td>
                    <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                            disabled={u.id === me.id}
                            className="border border-gray-200 rounded px-2 py-1 text-xs">
                      {Object.entries(ROLE_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="text-xs">
                    {u.role === 'coordination' ? (
                      <button onClick={() => setEditingSections({ userId: u.id, nom: u.nom_complet, sections: [...(u.sections || [])] })}
                              className="text-iip-gold hover:underline">
                        {u.sections?.length ? u.sections.join(', ') : <span className="text-orange-500 inline-flex items-center gap-1"><IconAlertTriangle size={13} /> aucune</span>}
                      </button>
                    ) : <span className="text-gray-300">— toutes —</span>}
                  </td>
                  <td>
                    <button onClick={() => toggleActif(u)} disabled={u.id === me.id}
                            className={u.actif ? 'badge badge-pp' : 'badge badge-incomplete'}>
                      {u.actif ? 'Actif' : 'Désactivé'}
                    </button>
                  </td>
                  <td className="text-xs text-gray-500">{u.created_at?.slice(0,10)}</td>
                  <td className="text-xs text-gray-500">{u.last_login_at ? u.last_login_at.slice(0,16).replace('T', ' ') : '—'}</td>
                  <td className="text-xs">
                    <button onClick={() => resetPassword(u)} className="text-iip-orange hover:underline inline-flex items-center gap-1"><IconKey size={14} /> MDP</button>
                    {u.id !== me.id && <>
                      {' · '}<button onClick={() => deleteUser(u)} className="text-red-500 hover:underline"><IconTrash size={15} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-title text-iip-gold mb-4">Nouvel utilisateur</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Nom complet</label>
                <input value={form.nom_complet} onChange={e => setForm({...form, nom_complet: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Mot de passe initial *</label>
                <input type="text" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Rôle</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                  {Object.entries(ROLE_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              {form.role === 'coordination' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Sections autorisées *</label>
                  <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto border border-gray-200 rounded p-2">
                    {allSections.map(s => (
                      <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                        <input type="checkbox" checked={form.sections.includes(s.code)}
                               onChange={() => toggleSectionInForm(s.code)} />
                        {s.code}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">La coordination ne verra et ne gérera que ces sections.</p>
                </div>
              )}
            </div>
            {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={createUser} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded">Créer</button>
            </div>
          </div>
        </div>
      )}
      {editingSections && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={() => setEditingSections(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-title text-iip-gold mb-1">Périmètre — {editingSections.nom}</h2>
            <p className="text-xs text-gray-500 mb-4">Sections que cette coordination peut voir et gérer.</p>
            <div className="grid grid-cols-2 gap-1 max-h-64 overflow-auto border border-gray-200 rounded p-2">
              {allSections.map(s => (
                <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                  <input type="checkbox" checked={editingSections.sections.includes(s.code)}
                         onChange={() => toggleSectionInEdit(s.code)} />
                  {s.code}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingSections(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={saveSections} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
